/**
 * Shared payment success / failure completion workflow.
 * Used by verify API and Razorpay webhooks (idempotent).
 */

import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/env";
import { writePaymentAudit } from "@/lib/payments/audit";
import { buildInvoiceHtml } from "@/lib/payments/invoice";
import { paymentLog } from "@/lib/payments/logger";
import { buildInvoicePdf } from "@/lib/payments/pdf";
import { uploadInvoicePdf } from "@/lib/payments/storage";
import {
  isPaymentSuccessful,
  type InvoiceRecord,
  type PaymentRecord,
  type PaymentSettings,
} from "@/lib/payments/types";
import { sendPaymentConfirmationEmail } from "@/lib/notifications/email";
import { notifyPaymentSuccess } from "@/lib/notifications/service";
import { buildPaymentSms } from "@/lib/notifications/sms";

function serviceClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createSupabaseJs(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapInvoice(row: Record<string, unknown>): InvoiceRecord {
  return {
    id: String(row.id),
    invoice_number: String(row.invoice_number),
    patient_id: row.patient_id ? String(row.patient_id) : null,
    patient_name: String(row.patient_name || ""),
    patient_phone: String(row.patient_phone || ""),
    patient_email: String(row.patient_email || ""),
    appointment_id: row.appointment_id ? String(row.appointment_id) : null,
    package_id: row.package_id ? String(row.package_id) : null,
    package_name: String(row.package_name || ""),
    doctor_name: String(row.doctor_name || ""),
    department_name: String(row.department_name || ""),
    subtotal: Number(row.subtotal) || 0,
    discount: Number(row.discount) || 0,
    tax: Number(row.tax) || 0,
    grand_total: Number(row.grand_total) || 0,
    currency: String(row.currency || "INR"),
    status: (row.status as InvoiceRecord["status"]) || "draft",
    pdf_url: String(row.pdf_url || ""),
    line_items: Array.isArray(row.line_items)
      ? (row.line_items as InvoiceRecord["line_items"])
      : [],
    notes: String(row.notes || ""),
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

function mapPayment(row: Record<string, unknown>): PaymentRecord {
  return {
    id: String(row.id),
    payment_reference: String(row.payment_reference),
    appointment_id: row.appointment_id ? String(row.appointment_id) : null,
    package_id: row.package_id ? String(row.package_id) : null,
    patient_id: row.patient_id ? String(row.patient_id) : null,
    invoice_id: row.invoice_id ? String(row.invoice_id) : null,
    amount: Number(row.amount) || 0,
    discount: Number(row.discount) || 0,
    tax: Number(row.tax) || 0,
    total_amount: Number(row.total_amount) || 0,
    currency: String(row.currency || "INR"),
    payment_method:
      (row.payment_method as PaymentRecord["payment_method"]) || "cash",
    payment_provider:
      (row.payment_provider as PaymentRecord["payment_provider"]) || "none",
    transaction_id: String(row.transaction_id || ""),
    payment_status:
      (row.payment_status as PaymentRecord["payment_status"]) || "pending",
    paid_at: row.paid_at ? String(row.paid_at) : null,
    refund_amount:
      row.refund_amount != null ? Number(row.refund_amount) : null,
    refund_reason: String(row.refund_reason || ""),
    meta: (row.meta || {}) as Record<string, unknown>,
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

async function loadSettings(
  sb: NonNullable<ReturnType<typeof serviceClient>>
): Promise<PaymentSettings> {
  const { data } = await sb
    .from("payment_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (!data) {
    return {
      id: "default",
      online_payment_enabled: false,
      cash_enabled: true,
      razorpay_enabled: false,
      stripe_enabled: false,
      currency: "INR",
      tax_percentage: 0,
      hospital_name: "Sri Srinivasa Hospital",
      hospital_address: "Nellore Road, Badvel, Andhra Pradesh",
      invoice_prefix: "SSH-INV",
      gstin: "",
      terms:
        "Payment once made is subject to hospital refund policy. For queries contact reception.",
      razorpay_key_id: "",
      stripe_publishable_key: "",
    };
  }

  const row = data as Record<string, unknown>;
  return {
    id: String(row.id),
    online_payment_enabled: Boolean(row.online_payment_enabled),
    cash_enabled: row.cash_enabled !== false,
    razorpay_enabled: Boolean(row.razorpay_enabled),
    stripe_enabled: Boolean(row.stripe_enabled),
    currency: String(row.currency || "INR"),
    tax_percentage: Number(row.tax_percentage) || 0,
    hospital_name: String(row.hospital_name || "Sri Srinivasa Hospital"),
    hospital_address: String(
      row.hospital_address || "Nellore Road, Badvel, Andhra Pradesh"
    ),
    invoice_prefix: String(row.invoice_prefix || "SSH-INV"),
    gstin: String(row.gstin || ""),
    terms: String(row.terms || ""),
    razorpay_key_id: String(row.razorpay_key_id || ""),
    stripe_publishable_key: String(row.stripe_publishable_key || ""),
  };
}

async function generateAndStoreInvoicePdf(input: {
  sb: NonNullable<ReturnType<typeof serviceClient>>;
  invoice: InvoiceRecord;
  payment: PaymentRecord;
  settings: PaymentSettings;
  appointmentDate?: string;
  appointmentTime?: string;
}): Promise<string> {
  if (input.invoice.pdf_url) return input.invoice.pdf_url;

  const pdf = buildInvoicePdf({
    invoice: input.invoice,
    settings: input.settings,
    payment: input.payment,
    appointmentDate: input.appointmentDate,
    appointmentTime: input.appointmentTime,
  });

  const uploaded = await uploadInvoicePdf({
    invoiceId: input.invoice.id,
    invoiceNumber: input.invoice.invoice_number,
    pdf,
  });

  if (!uploaded.ok || !uploaded.url) {
    paymentLog.warn("invoice.pdf_upload_skipped", {
      invoiceId: input.invoice.id,
      error: uploaded.error,
    });
    return "";
  }

  await input.sb
    .from("invoices")
    .update({ pdf_url: uploaded.url })
    .eq("id", input.invoice.id);

  await writePaymentAudit({
    event_type: "invoice.pdf.generated",
    payment_id: input.payment.id,
    invoice_id: input.invoice.id,
    appointment_id: input.payment.appointment_id,
    details: { pdf_url: uploaded.url, path: uploaded.path },
  });

  return uploaded.url;
}

async function emailInvoice(input: {
  invoice: InvoiceRecord;
  payment: PaymentRecord;
  settings: PaymentSettings;
  pdfUrl: string;
  appointmentDate?: string;
  appointmentTime?: string;
}): Promise<void> {
  const to = input.invoice.patient_email || String(input.payment.meta?.patient_email || "");
  if (!to || !to.includes("@")) {
    await writePaymentAudit({
      event_type: "invoice.email.skipped",
      payment_id: input.payment.id,
      invoice_id: input.invoice.id,
      details: { reason: "no_patient_email" },
    });
    return;
  }

  const html = buildInvoiceHtml(input.invoice, input.settings, {
    paymentMethod: input.payment.payment_method,
    transactionId: input.payment.transaction_id,
    appointmentDate: input.appointmentDate,
    appointmentTime: input.appointmentTime,
  });

  const emailPayload = {
    to,
    patientName: input.invoice.patient_name,
    hospitalName: input.settings.hospital_name,
    hospitalAddress: input.settings.hospital_address,
    doctorName: input.invoice.doctor_name,
    departmentName: input.invoice.department_name,
    appointmentDate: input.appointmentDate || "",
    appointmentTime: input.appointmentTime || "",
    invoiceNumber: input.invoice.invoice_number,
    transactionId: input.payment.transaction_id,
    paymentMethod: input.payment.payment_method,
    paymentReference: input.payment.payment_reference,
    amount: input.invoice.grand_total,
    currency: input.invoice.currency,
    pdfUrl: input.pdfUrl,
    invoiceHtml: html,
  };

  // Email via direct helper (preserves existing audit shape)
  const result = await sendPaymentConfirmationEmail(emailPayload);

  // Optional SMS receipt via unified notification service
  const phone =
    input.invoice.patient_phone ||
    String(input.payment.meta?.patient_phone || "");
  if (phone) {
    await notifyPaymentSuccess({
      sms: {
        to: phone,
        message: buildPaymentSms({
          patientName: input.invoice.patient_name,
          amount: input.invoice.grand_total,
          invoiceNumber: input.invoice.invoice_number,
          hospitalName: input.settings.hospital_name,
        }),
      },
    });
  }

  await writePaymentAudit({
    event_type: result.sent ? "invoice.email.sent" : "invoice.email.skipped",
    payment_id: input.payment.id,
    invoice_id: input.invoice.id,
    details: { sent: result.sent, error: result.error, emailId: result.id },
  });
}

/**
 * Mark payment paid and cascade invoice + appointment updates.
 * Idempotent when payment is already successful.
 */
export async function completePaymentSuccess(input: {
  paymentId: string;
  transactionId: string;
  metaPatch?: Record<string, unknown>;
  source: "verify" | "webhook" | "cash" | "admin";
  actor?: string;
  ip_address?: string;
  skipEmail?: boolean;
}): Promise<{ ok: boolean; payment?: PaymentRecord; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Service role required" };

  const { data: row, error } = await sb
    .from("payments")
    .select("*")
    .eq("id", input.paymentId)
    .maybeSingle();

  if (error || !row) return { ok: false, error: "Payment not found" };

  const existing = mapPayment(row as Record<string, unknown>);
  const meta = {
    ...(existing.meta || {}),
    ...(input.metaPatch || {}),
  };

  let payment = existing;
  const alreadyPaid = isPaymentSuccessful(existing.payment_status);

  if (!alreadyPaid) {
    const paidAt = new Date().toISOString();
    const { data: updated, error: uErr } = await sb
      .from("payments")
      .update({
        payment_status: "paid",
        transaction_id: input.transactionId || existing.transaction_id,
        paid_at: paidAt,
        meta: {
          ...meta,
          completed_source: input.source,
          completed_at: paidAt,
        },
      })
      .eq("id", input.paymentId)
      .select("*")
      .single();

    if (uErr) {
      paymentLog.error("payment.complete_update_failed", {
        paymentId: input.paymentId,
        error: uErr.message,
      });
      return { ok: false, error: uErr.message };
    }
    payment = mapPayment(updated as Record<string, unknown>);
  } else {
    // Refresh meta if provided
    if (input.metaPatch && Object.keys(input.metaPatch).length) {
      await sb
        .from("payments")
        .update({
          meta: { ...meta, idempotent_hit: true },
          transaction_id: input.transactionId || existing.transaction_id,
        })
        .eq("id", input.paymentId);
    }
    paymentLog.info("payment.complete_idempotent", {
      paymentId: input.paymentId,
      source: input.source,
    });
  }

  // Invoice → paid
  let invoice: InvoiceRecord | null = null;
  if (payment.invoice_id) {
    await sb
      .from("invoices")
      .update({ status: "paid" })
      .eq("id", payment.invoice_id);

    const { data: invRow } = await sb
      .from("invoices")
      .select("*")
      .eq("id", payment.invoice_id)
      .maybeSingle();
    if (invRow) invoice = mapInvoice(invRow as Record<string, unknown>);
  }

  // Appointment → payment paid + confirmed
  let appointmentDate = "";
  let appointmentTime = "";
  const appointmentId = payment.appointment_id;
  if (appointmentId) {
    await sb
      .from("appointments")
      .update({
        payment_status: "paid",
        status: "confirmed",
        invoice_id: payment.invoice_id || undefined,
      })
      .eq("id", appointmentId);

    const { data: appt } = await sb
      .from("appointments")
      .select("date, time_slot")
      .eq("id", appointmentId)
      .maybeSingle();
    if (appt) {
      appointmentDate = String((appt as { date?: string }).date || "");
      appointmentTime = String((appt as { time_slot?: string }).time_slot || "");
    }
  }

  const settings = await loadSettings(sb);
  let pdfUrl = invoice?.pdf_url || "";

  if (invoice) {
    pdfUrl = await generateAndStoreInvoicePdf({
      sb,
      invoice: { ...invoice, status: "paid", pdf_url: pdfUrl },
      payment,
      settings,
      appointmentDate,
      appointmentTime,
    });
    invoice = { ...invoice, status: "paid", pdf_url: pdfUrl };
  }

  if (!input.skipEmail && invoice && !alreadyPaid) {
    await emailInvoice({
      invoice,
      payment,
      settings,
      pdfUrl,
      appointmentDate,
      appointmentTime,
    });
  }

  await writePaymentAudit({
    event_type: "payment.completed",
    payment_id: payment.id,
    invoice_id: payment.invoice_id,
    appointment_id: payment.appointment_id,
    actor: input.actor || input.source,
    ip_address: input.ip_address,
    details: {
      source: input.source,
      transaction_id: payment.transaction_id,
      already_paid: alreadyPaid,
      pdf_url: pdfUrl || null,
    },
  });

  paymentLog.info("payment.completed", {
    paymentId: payment.id,
    source: input.source,
    alreadyPaid,
  });

  return { ok: true, payment: { ...payment, payment_status: "paid" } };
}

export async function markPaymentFailed(input: {
  paymentId: string;
  reason?: string;
  metaPatch?: Record<string, unknown>;
  source: "verify" | "webhook";
  actor?: string;
  ip_address?: string;
}): Promise<{ ok: boolean; payment?: PaymentRecord; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Service role required" };

  const { data: row, error } = await sb
    .from("payments")
    .select("*")
    .eq("id", input.paymentId)
    .maybeSingle();

  if (error || !row) return { ok: false, error: "Payment not found" };
  const existing = mapPayment(row as Record<string, unknown>);

  if (isPaymentSuccessful(existing.payment_status)) {
    // Never downgrade a successful payment
    return { ok: true, payment: existing };
  }

  if (existing.payment_status === "failed") {
    return { ok: true, payment: existing };
  }

  const meta = {
    ...(existing.meta || {}),
    ...(input.metaPatch || {}),
    fail_reason: input.reason || "payment_failed",
    failed_at: new Date().toISOString(),
    failed_source: input.source,
  };

  const { data: updated, error: uErr } = await sb
    .from("payments")
    .update({ payment_status: "failed", meta })
    .eq("id", input.paymentId)
    .select("*")
    .single();

  if (uErr) return { ok: false, error: uErr.message };

  if (existing.appointment_id) {
    await sb
      .from("appointments")
      .update({ payment_status: "failed" })
      .eq("id", existing.appointment_id);
  }

  await writePaymentAudit({
    event_type: "payment.failed",
    payment_id: input.paymentId,
    invoice_id: existing.invoice_id,
    appointment_id: existing.appointment_id,
    actor: input.actor || input.source,
    ip_address: input.ip_address,
    details: { reason: input.reason, source: input.source },
  });

  return { ok: true, payment: mapPayment(updated as Record<string, unknown>) };
}
