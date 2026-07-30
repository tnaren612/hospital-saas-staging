/**
 * Billing orchestration — settings, invoices, payments.
 * Uses service-role on server routes for reliability; never stores card data.
 */

import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import {
  calcTax,
  DEFAULT_SETTINGS,
  isPaymentSuccessful,
  type CreatePaymentInput,
  type GatewayOrderResult,
  type InvoiceRecord,
  type PaymentAnalytics,
  type PaymentRecord,
  type PaymentSettings,
  type PaymentStatus,
  type VerifyPaymentInput,
} from "@/lib/payments/types";
import { buildInvoiceHtml, buildInvoiceNumber, defaultLineItems } from "@/lib/payments/invoice";
import {
  createRazorpayOrder,
  createRazorpayRefund,
  getRazorpayKeyId,
  isRazorpayConfigured,
  verifyRazorpaySignature,
} from "@/lib/payments/razorpay";
import {
  createStripeCheckoutSession,
  isStripeConfigured,
  verifyStripeSession,
} from "@/lib/payments/stripe";
import { completePaymentSuccess, markPaymentFailed } from "@/lib/payments/completion";
import { writePaymentAudit } from "@/lib/payments/audit";
import { paymentLog } from "@/lib/payments/logger";
import { allowMockPayments } from "@/lib/payments/production-guard";

function serviceClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createSupabaseJs(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type ServiceClient = NonNullable<ReturnType<typeof serviceClient>>;

/** C-05: prefer doctor consultation_fee over client-supplied amount */
async function resolveAmountFromAppointment(
  sb: ServiceClient,
  appointmentId: string
): Promise<number | null> {
  try {
    const { data: appt } = await sb
      .from("appointments")
      .select("doctor_id, consultation_fee, type")
      .eq("id", appointmentId)
      .maybeSingle();
    if (!appt) return null;
    const direct = Number(
      (appt as { consultation_fee?: number }).consultation_fee
    );
    if (Number.isFinite(direct) && direct > 0) return direct;

    const doctorId = String(
      (appt as { doctor_id?: string }).doctor_id || ""
    );
    if (!doctorId) return null;

    const { data: doc } = await sb
      .from("hospital_doctors")
      .select("consultation_fee, video_consultation_fee")
      .or(`id.eq.${doctorId},slug.eq.${doctorId}`)
      .maybeSingle();
    if (!doc) return null;
    const type = String((appt as { type?: string }).type || "");
    if (type === "video" || type === "teleconsult") {
      const v = Number(
        (doc as { video_consultation_fee?: number }).video_consultation_fee
      );
      if (Number.isFinite(v) && v > 0) return v;
    }
    const fee = Number(
      (doc as { consultation_fee?: number }).consultation_fee
    );
    return Number.isFinite(fee) && fee > 0 ? fee : null;
  } catch {
    return null;
  }
}

async function resolveAmountFromPackage(
  sb: ServiceClient,
  packageId: string
): Promise<number | null> {
  try {
    const { data } = await sb
      .from("health_packages")
      .select("price, amount, sale_price")
      .or(`id.eq.${packageId},slug.eq.${packageId}`)
      .maybeSingle();
    if (!data) return null;
    const row = data as {
      sale_price?: number;
      price?: number;
      amount?: number;
    };
    for (const key of [row.sale_price, row.price, row.amount]) {
      const n = Number(key);
      if (Number.isFinite(n) && n > 0) return n;
    }
    return null;
  } catch {
    return null;
  }
}

function publicClient() {
  if (!hasSupabaseConfig()) return null;
  return createSupabaseJs(getSupabaseUrl()!, getSupabaseAnonKey()!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function mapSettings(row: Record<string, unknown>): PaymentSettings {
  return {
    id: String(row.id),
    online_payment_enabled: Boolean(row.online_payment_enabled),
    cash_enabled: row.cash_enabled !== false,
    razorpay_enabled: Boolean(row.razorpay_enabled),
    stripe_enabled: Boolean(row.stripe_enabled),
    currency: String(row.currency || "INR"),
    tax_percentage: Number(row.tax_percentage) || 0,
    hospital_name: String(row.hospital_name || DEFAULT_SETTINGS.hospital_name),
    hospital_address: String(
      row.hospital_address || DEFAULT_SETTINGS.hospital_address
    ),
    invoice_prefix: String(row.invoice_prefix || "SSH-INV"),
    gstin: String(row.gstin || ""),
    terms: String(row.terms || DEFAULT_SETTINGS.terms),
    razorpay_key_id: String(row.razorpay_key_id || ""),
    stripe_publishable_key: String(row.stripe_publishable_key || ""),
  };
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
    payment_method: (row.payment_method as PaymentRecord["payment_method"]) || "cash",
    payment_provider:
      (row.payment_provider as PaymentRecord["payment_provider"]) || "none",
    transaction_id: String(row.transaction_id || ""),
    payment_status:
      (row.payment_status as PaymentStatus) || "pending",
    paid_at: row.paid_at ? String(row.paid_at) : null,
    refund_amount:
      row.refund_amount != null ? Number(row.refund_amount) : null,
    refund_reason: String(row.refund_reason || ""),
    meta: (row.meta || {}) as Record<string, unknown>,
    created_at: String(row.created_at || new Date().toISOString()),
  };
}

function ref(prefix: string) {
  return `${prefix}-${Date.now().toString(36).toUpperCase()}-${Math.floor(
    1000 + Math.random() * 9000
  )}`;
}

// export async function getPaymentSettings(): Promise<PaymentSettings> {
//   if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
//     return DEFAULT_SETTINGS;
//   }
//   const sb = publicClient() || serviceClient();
//   if (!sb) return DEFAULT_SETTINGS;

//   const { data, error } = await sb
//     .from("payment_settings")
//     .select("*")
//     .order("created_at", { ascending: true })
//     .limit(1)
//     .maybeSingle();

//   if (error || !data) {
//     if (error && /schema cache|does not exist/i.test(error.message)) {
//       return DEFAULT_SETTINGS;
//     }
//     return DEFAULT_SETTINGS;
//   }
//   return mapSettings(data as Record<string, unknown>);
// }

export async function getPaymentSettings(): Promise<PaymentSettings> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return DEFAULT_SETTINGS;
  }

  // Prefer service role to avoid RLS issues
  const sb = serviceClient() || publicClient();
  if (!sb) return DEFAULT_SETTINGS;

  const { data, error } = await sb
    .from("payment_settings")
    .select("*")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (error || !data) {
    if (error) {
      paymentLog.warn("payment_settings.query_failed", {
        error: error.message,
      });
    }
    return DEFAULT_SETTINGS;
  }

  return mapSettings(data as Record<string, unknown>);
}

export async function updatePaymentSettings(
  patch: Partial<PaymentSettings>
): Promise<{ ok: boolean; data?: PaymentSettings; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Supabase service role required" };

  const current = await getPaymentSettings();
  if (current.id === "default") {
    const { data, error } = await sb
      .from("payment_settings")
      .insert({
        online_payment_enabled: patch.online_payment_enabled ?? false,
        cash_enabled: patch.cash_enabled ?? true,
        razorpay_enabled: patch.razorpay_enabled ?? false,
        stripe_enabled: patch.stripe_enabled ?? false,
        currency: patch.currency || "INR",
        tax_percentage: patch.tax_percentage ?? 0,
        hospital_name: patch.hospital_name || DEFAULT_SETTINGS.hospital_name,
        hospital_address:
          patch.hospital_address || DEFAULT_SETTINGS.hospital_address,
        invoice_prefix: patch.invoice_prefix || "SSH-INV",
        gstin: patch.gstin || "",
        terms: patch.terms || DEFAULT_SETTINGS.terms,
        razorpay_key_id: patch.razorpay_key_id || "",
        stripe_publishable_key: patch.stripe_publishable_key || "",
      })
      .select("*")
      .single();
    if (error) return { ok: false, error: error.message };
    return { ok: true, data: mapSettings(data as Record<string, unknown>) };
  }

  const { data, error } = await sb
    .from("payment_settings")
    .update(patch)
    .eq("id", current.id)
    .select("*")
    .single();
  if (error) return { ok: false, error: error.message };
  return { ok: true, data: mapSettings(data as Record<string, unknown>) };
}

export async function createInvoice(
  input: CreatePaymentInput & { hospitalId?: string | null },
  settings?: PaymentSettings
): Promise<{ ok: boolean; invoice?: InvoiceRecord; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Billing tables require Supabase + service role" };

  const cfg = settings || (await getPaymentSettings());
  const discount = Number(input.discount || 0);
  const { subtotal, tax, total } = calcTax(
    input.amount,
    discount,
    cfg.tax_percentage
  );

  const { count } = await sb
    .from("invoices")
    .select("id", { count: "exact", head: true });
  const invoice_number = buildInvoiceNumber(
    cfg.invoice_prefix,
    (count || 0) + 1
  );

  const line_items =
    input.line_items ||
    defaultLineItems({
      description:
        input.package_name ||
        `Consultation${input.doctor_name ? ` — ${input.doctor_name}` : ""}`,
      amount: input.amount,
    });

  const invoiceInsert: Record<string, unknown> = {
    invoice_number,
    patient_id: input.patient_id || null,
    patient_name: input.patient_name,
    patient_phone: input.patient_phone,
    patient_email: input.patient_email || "",
    appointment_id: input.appointment_id || null,
    package_id: input.package_id || null,
    package_name: input.package_name || "",
    doctor_name: input.doctor_name || "",
    department_name: input.department_name || "",
    subtotal,
    discount,
    tax,
    grand_total: total,
    currency: cfg.currency,
    status: "issued",
    line_items,
    notes: input.notes || "",
  };
  if (input.hospitalId) invoiceInsert.hospital_id = input.hospitalId;

  const { data, error } = await sb
    .from("invoices")
    .insert(invoiceInsert)
    .select("*")
    .single();

  if (error) {
    paymentLog.error("invoice.insert_failed", { error: error.message });
    return { ok: false, error: error.message };
  }
  return { ok: true, invoice: mapInvoice(data as Record<string, unknown>) };
}

export async function createPayment(
  input: CreatePaymentInput & {
    /** C-05: cash → paid only when staff authorized */
    staffAuthorized?: boolean;
    /** Optional tenant stamp */
    hospitalId?: string | null;
  }
): Promise<{
  ok: boolean;
  payment?: PaymentRecord;
  invoice?: InvoiceRecord;
  gateway?: GatewayOrderResult;
  error?: string;
}> {
  const sb = serviceClient();
  if (!sb) {
    return {
      ok: false,
      error: "Payments require Supabase. Run migration 012 and set service role.",
    };
  }

  const settings = await getPaymentSettings();

  if (input.payment_method === "cash" && !settings.cash_enabled) {
    return { ok: false, error: "Cash payments are disabled" };
  }
  if (input.payment_method === "online" && !settings.online_payment_enabled) {
    return { ok: false, error: "Online payments are disabled" };
  }

  // C-05: unauthenticated cash must never mark paid
  if (input.payment_method === "cash" && !input.staffAuthorized) {
    return {
      ok: false,
      error: "Cash payments require staff authentication",
      code: "CASH_STAFF_REQUIRED",
    } as { ok: false; error: string };
  }

  // C-05: resolve amount from server sources when possible
  let resolvedAmount = Number(input.amount);
  if (input.appointment_id) {
    const serverAmount = await resolveAmountFromAppointment(
      sb,
      input.appointment_id
    );
    if (serverAmount != null && serverAmount > 0) {
      resolvedAmount = serverAmount;
    }
  } else if (input.package_id) {
    const serverAmount = await resolveAmountFromPackage(sb, input.package_id);
    if (serverAmount != null && serverAmount > 0) {
      resolvedAmount = serverAmount;
    }
  }

  if (!Number.isFinite(resolvedAmount) || resolvedAmount < 0) {
    return { ok: false, error: "Invalid payment amount" };
  }

  const paymentInput: CreatePaymentInput = {
    ...input,
    amount: resolvedAmount,
  };

  const inv = await createInvoice(
    { ...paymentInput, hospitalId: input.hospitalId },
    settings
  );
  if (!inv.ok || !inv.invoice) {
    return { ok: false, error: inv.error || "Invoice failed" };
  }

  const payment_reference = ref("PAY");
  const discount = Number(input.discount || 0);
  const { subtotal, tax, total } = calcTax(
    resolvedAmount,
    discount,
    settings.tax_percentage
  );

  let provider = input.payment_provider || "cash";
  if (input.payment_method === "cash") provider = "cash";
  if (input.payment_method === "online") {
    // Prefer Razorpay Standard Checkout when enabled (or only online path)
    if (settings.razorpay_enabled || isRazorpayConfigured()) {
      provider = "razorpay";
    } else if (settings.stripe_enabled) {
      provider = "stripe";
    } else if (allowMockPayments()) {
      provider = "mock";
    } else {
      return {
        ok: false,
        error:
          "Online payments require Razorpay or Stripe configuration in production",
      };
    }
  }

  const isCash = input.payment_method === "cash";
  // Online stays pending until HMAC / gateway verify succeeds
  // Cash is marked paid immediately only for authorized staff
  const payment_status: PaymentStatus = isCash ? "paid" : "pending";

  let gateway: GatewayOrderResult | undefined;
  if (!isCash) {
    try {
      if (provider === "razorpay") {
        gateway = await createRazorpayOrder({
          amountInr: total,
          currency: settings.currency,
          receipt: payment_reference,
          description:
            input.package_name ||
            `Consultation${input.doctor_name ? ` — ${input.doctor_name}` : ""}`,
          customerName: input.patient_name,
          customerEmail: input.patient_email,
          customerPhone: input.patient_phone,
          notes: {
            patient: input.patient_name,
            appointment: input.appointment_id || "",
            invoice: inv.invoice.invoice_number,
            reference: payment_reference,
          },
        });
        // createRazorpayOrder returns "mock" when keys missing (dev only)
        provider = gateway.provider;
        if (gateway.provider === "mock" && !allowMockPayments()) {
          return {
            ok: false,
            error: "Mock payments are disabled in production",
          };
        }
        if (gateway.name !== settings.hospital_name) {
          gateway = {
            ...gateway,
            name: settings.hospital_name,
          };
        }
      } else if (provider === "stripe") {
        const site = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
        gateway = await createStripeCheckoutSession({
          amountInr: total,
          currency: settings.currency,
          reference: payment_reference,
          customerEmail: input.patient_email,
          successUrl: `${site}/patient/payments?status=success&ref=${payment_reference}`,
          cancelUrl: `${site}/patient/payments?status=cancelled&ref=${payment_reference}`,
          description: input.package_name || "Hospital payment",
        });
        provider = gateway.provider;
      } else if (allowMockPayments()) {
        gateway = {
          provider: "mock",
          orderId: `order_mock_${Date.now()}`,
          amount: total,
          amountPaise: Math.round(total * 100),
          currency: settings.currency,
          publicKey: "rzp_test_mock",
          name: settings.hospital_name,
          description: input.package_name || "Hospital payment",
          prefill: {
            name: input.patient_name,
            email: input.patient_email,
            contact: input.patient_phone,
          },
          checkoutHint: "Mock online payment — complete via verify endpoint",
        };
        provider = "mock";
      } else {
        return {
          ok: false,
          error: "No payment gateway configured for production",
        };
      }
    } catch (e) {
      return {
        ok: false,
        error: e instanceof Error ? e.message : "Gateway order failed",
      };
    }
  }

  const paymentInsert: Record<string, unknown> = {
    payment_reference,
    appointment_id: input.appointment_id || null,
    package_id: input.package_id || null,
    patient_id: input.patient_id || null,
    invoice_id: inv.invoice.id,
    amount: subtotal,
    discount,
    tax,
    total_amount: total,
    currency: settings.currency,
    payment_method: input.payment_method,
    payment_provider: provider,
    // Store Razorpay order_id here until payment_id replaces it after verify
    transaction_id: gateway?.orderId || "",
    payment_status,
    paid_at: isCash ? new Date().toISOString() : null,
    meta: {
      razorpay_order_id: gateway?.orderId || null,
      amount_paise: gateway?.amountPaise ?? Math.round(total * 100),
      patient_name: input.patient_name,
      patient_phone: input.patient_phone,
      patient_email: input.patient_email || "",
      doctor_name: input.doctor_name || "",
      department_name: input.department_name || "",
      amount_source:
        input.appointment_id || input.package_id
          ? "server_resolved"
          : "client",
      staff_cash: isCash && Boolean(input.staffAuthorized),
      // Never store KEY_SECRET or card data
    },
  };
  if (input.hospitalId) {
    paymentInsert.hospital_id = input.hospitalId;
  }

  const { data, error } = await sb
    .from("payments")
    .insert(paymentInsert)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };

  const payment = mapPayment(data as Record<string, unknown>);

  await writePaymentAudit({
    event_type: "payment.created",
    payment_id: payment.id,
    invoice_id: inv.invoice.id,
    appointment_id: input.appointment_id || null,
    details: {
      method: input.payment_method,
      provider,
      total: total,
    },
  });

  // Cash: full completion (invoice PDF + email + appointment confirmed)
  if (isCash) {
    await completePaymentSuccess({
      paymentId: payment.id,
      transactionId: payment.payment_reference,
      source: "cash",
      actor: "create_payment",
      metaPatch: { cash_at_hospital: true },
    });
    const refreshed = await sb
      .from("payments")
      .select("*")
      .eq("id", payment.id)
      .maybeSingle();
    const paidPayment = refreshed.data
      ? mapPayment(refreshed.data as Record<string, unknown>)
      : payment;
    return {
      ok: true,
      payment: paidPayment,
      invoice: inv.invoice,
      gateway,
    };
  }

  if (input.appointment_id) {
    await sb
      .from("appointments")
      .update({
        payment_status: "pending_online",
        invoice_id: inv.invoice.id,
      })
      .eq("id", input.appointment_id);
  }

  return {
    ok: true,
    payment,
    invoice: inv.invoice,
    gateway,
  };
}

export async function verifyPayment(
  input: VerifyPaymentInput & { actor?: string; ip_address?: string }
): Promise<{ ok: boolean; payment?: PaymentRecord; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Service role required" };

  // Resolve payment by id or appointment_id (latest pending preferred)
  let row: Record<string, unknown> | null = null;

  if (input.payment_id) {
    const { data, error } = await sb
      .from("payments")
      .select("*")
      .eq("id", input.payment_id)
      .maybeSingle();
    if (error || !data) return { ok: false, error: "Payment not found" };
    row = data as Record<string, unknown>;
  } else if (input.appointment_id) {
    const { data, error } = await sb
      .from("payments")
      .select("*")
      .eq("appointment_id", input.appointment_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) {
      return { ok: false, error: "Payment not found for appointment" };
    }
    row = data as Record<string, unknown>;
  } else if (input.razorpay_order_id) {
    const { data, error } = await sb
      .from("payments")
      .select("*")
      .or(
        `transaction_id.eq.${input.razorpay_order_id},meta->>razorpay_order_id.eq.${input.razorpay_order_id}`
      )
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error || !data) return { ok: false, error: "Payment not found for order" };
    row = data as Record<string, unknown>;
  } else {
    return {
      ok: false,
      error: "payment_id, appointment_id, or razorpay_order_id required",
    };
  }

  const paymentId = String(row.id);
  const mapped = mapPayment(row);

  // Idempotent: already paid
  if (isPaymentSuccessful(mapped.payment_status)) {
    return { ok: true, payment: mapped };
  }

  // Cash is completed at create time
  if (mapped.payment_provider === "cash" || mapped.payment_method === "cash") {
    return { ok: true, payment: mapped };
  }

  const meta = (row.meta || {}) as Record<string, unknown>;
  const storedOrderId = String(
    meta.razorpay_order_id || row.transaction_id || ""
  );

  let verified = false;
  let transaction_id =
    input.transaction_id || String(row.transaction_id || "");
  const provider = input.provider || mapped.payment_provider;

  if (provider === "razorpay" || mapped.payment_provider === "razorpay") {
    const orderId = input.razorpay_order_id || storedOrderId;
    const gatewayPaymentId = input.razorpay_payment_id || "";
    const signature = input.razorpay_signature || "";

    if (!orderId || !gatewayPaymentId || !signature) {
      return {
        ok: false,
        error:
          "Missing razorpay_order_id, razorpay_payment_id, or razorpay_signature",
      };
    }

    if (storedOrderId && orderId !== storedOrderId) {
      await writePaymentAudit({
        event_type: "payment.verify.failed",
        payment_id: paymentId,
        details: { reason: "order_id_mismatch", orderId, storedOrderId },
        actor: input.actor || "verify",
        ip_address: input.ip_address,
      });
      return { ok: false, error: "Order ID mismatch" };
    }

    verified = await verifyRazorpaySignature({
      orderId,
      paymentId: gatewayPaymentId,
      signature,
    });
    transaction_id = gatewayPaymentId;
  } else if (provider === "stripe" || mapped.payment_provider === "stripe") {
    const sessionId =
      input.stripe_session_id ||
      input.transaction_id ||
      String(row.transaction_id);
    const v = await verifyStripeSession(sessionId);
    verified = v.paid;
    if (v.paymentIntent) transaction_id = v.paymentIntent;
  } else if (provider === "mock" || mapped.payment_provider === "mock") {
    // C-04: mock verification disabled in production
    if (!allowMockPayments()) {
      return {
        ok: false,
        error: "Mock payment verification is disabled in production",
      };
    }
    verified =
      input.transaction_id?.startsWith("pay_mock") ||
      input.razorpay_payment_id?.startsWith("pay_mock") ||
      input.razorpay_signature === "mock_signature" ||
      String(row.transaction_id || "").startsWith("order_mock");
    if (input.razorpay_payment_id) transaction_id = input.razorpay_payment_id;
    else if (input.transaction_id) transaction_id = input.transaction_id;
  } else {
    return { ok: false, error: "Unknown payment provider" };
  }

  if (!verified) {
    await markPaymentFailed({
      paymentId,
      reason: "signature_invalid",
      source: "verify",
      actor: input.actor || "verify",
      ip_address: input.ip_address,
      metaPatch: {
        verify_failed_at: new Date().toISOString(),
        razorpay_order_id: input.razorpay_order_id || storedOrderId,
      },
    });
    await writePaymentAudit({
      event_type: "payment.verify.failed",
      payment_id: paymentId,
      invoice_id: mapped.invoice_id,
      appointment_id: mapped.appointment_id,
      actor: input.actor || "verify",
      ip_address: input.ip_address,
      details: { reason: "signature_invalid" },
    });
    return { ok: false, error: "Payment verification failed" };
  }

  const result = await completePaymentSuccess({
    paymentId,
    transactionId: transaction_id,
    source: "verify",
    actor: input.actor || "verify",
    ip_address: input.ip_address,
    metaPatch: {
      razorpay_order_id: input.razorpay_order_id || storedOrderId,
      razorpay_payment_id: input.razorpay_payment_id || null,
      verified_at: new Date().toISOString(),
    },
  });

  if (result.ok) {
    await writePaymentAudit({
      event_type: "payment.verify.success",
      payment_id: paymentId,
      invoice_id: mapped.invoice_id,
      appointment_id: mapped.appointment_id,
      actor: input.actor || "verify",
      ip_address: input.ip_address,
      details: { transaction_id },
    });
  }

  return result;
}

export async function refundPayment(input: {
  payment_id: string;
  action: "request" | "approve" | "reject" | "complete";
  reason?: string;
  amount?: number;
  actor?: string;
  ip_address?: string;
}): Promise<{ ok: boolean; payment?: PaymentRecord; error?: string }> {
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Service role required" };

  const { data: existing, error: loadErr } = await sb
    .from("payments")
    .select("*")
    .eq("id", input.payment_id)
    .maybeSingle();

  if (loadErr || !existing) return { ok: false, error: "Payment not found" };
  const current = mapPayment(existing as Record<string, unknown>);

  if (input.action === "request") {
    if (!isPaymentSuccessful(current.payment_status)) {
      return { ok: false, error: "Only paid payments can request refund" };
    }
  }

  if (input.action === "complete") {
    if (
      current.payment_status !== "refund_approved" &&
      current.payment_status !== "refund_requested" &&
      !isPaymentSuccessful(current.payment_status)
    ) {
      return {
        ok: false,
        error: "Payment must be paid or refund-approved to complete refund",
      };
    }

    const refundAmount =
      input.amount != null ? input.amount : current.total_amount;
    const amountPaise = Math.round(refundAmount * 100);

    // Gateway refund for Razorpay (and mock when keys absent)
    if (
      current.payment_provider === "razorpay" ||
      current.payment_provider === "mock"
    ) {
      const gatewayPayId =
        current.transaction_id ||
        String(current.meta?.razorpay_payment_id || "");
      const rzp = await createRazorpayRefund({
        paymentId: gatewayPayId,
        amountPaise,
        notes: {
          payment_id: current.id,
          reason: input.reason || "",
          reference: current.payment_reference,
        },
      });

      if (!rzp.ok) {
        await writePaymentAudit({
          event_type: "payment.refund.failed",
          payment_id: current.id,
          invoice_id: current.invoice_id,
          actor: input.actor || "refund",
          ip_address: input.ip_address,
          details: { error: rzp.error },
        });
        return { ok: false, error: rzp.error || "Gateway refund failed" };
      }

      const meta = {
        ...(current.meta || {}),
        razorpay_refund_id: rzp.refundId,
        refund_status: rzp.status,
        refunded_at: new Date().toISOString(),
      };

      const { data, error } = await sb
        .from("payments")
        .update({
          payment_status: "refunded",
          refund_amount: refundAmount,
          refund_reason: input.reason || current.refund_reason || "",
          meta,
        })
        .eq("id", input.payment_id)
        .select("*")
        .single();

      if (error) return { ok: false, error: error.message };

      if (data.invoice_id) {
        await sb
          .from("invoices")
          .update({ status: "refunded" })
          .eq("id", data.invoice_id);
      }
      if (data.appointment_id) {
        await sb
          .from("appointments")
          .update({ payment_status: "refunded" })
          .eq("id", data.appointment_id);
      }

      await writePaymentAudit({
        event_type: "payment.refund.completed",
        payment_id: current.id,
        invoice_id: current.invoice_id,
        appointment_id: current.appointment_id,
        actor: input.actor || "refund",
        ip_address: input.ip_address,
        details: {
          refund_id: rzp.refundId,
          amount: refundAmount,
        },
      });

      return { ok: true, payment: mapPayment(data as Record<string, unknown>) };
    }
  }

  const statusMap = {
    request: "refund_requested",
    approve: "refund_approved",
    reject: "refund_rejected",
    complete: "refunded",
  } as const;

  const auditMap = {
    request: "payment.refund.requested",
    approve: "payment.refund.approved",
    reject: "payment.refund.rejected",
    complete: "payment.refund.completed",
  } as const;

  const patch: Record<string, unknown> = {
    payment_status: statusMap[input.action],
    refund_reason: input.reason || current.refund_reason || "",
  };
  if (input.amount != null) patch.refund_amount = input.amount;
  if (input.action === "complete" && input.amount == null) {
    patch.refund_amount = current.total_amount;
  }

  const { data, error } = await sb
    .from("payments")
    .update(patch)
    .eq("id", input.payment_id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };

  if (input.action === "complete" && data.invoice_id) {
    await sb
      .from("invoices")
      .update({ status: "refunded" })
      .eq("id", data.invoice_id);
  }
  if (input.action === "complete" && data.appointment_id) {
    await sb
      .from("appointments")
      .update({ payment_status: "refunded" })
      .eq("id", data.appointment_id);
  }

  await writePaymentAudit({
    event_type: auditMap[input.action],
    payment_id: current.id,
    invoice_id: current.invoice_id,
    appointment_id: current.appointment_id,
    actor: input.actor || "refund",
    ip_address: input.ip_address,
    details: { action: input.action, amount: input.amount },
  });

  return { ok: true, payment: mapPayment(data as Record<string, unknown>) };
}

export async function listPayments(options?: {
  q?: string;
  status?: string;
  limit?: number;
  hospitalId?: string | null;
  /** H-02: server-side patient scope — never list-all then filter */
  patientId?: string | null;
  patientPhone?: string | null;
}): Promise<PaymentRecord[]> {
  const sb = serviceClient() || publicClient();
  if (!sb) return [];

  let query = sb
    .from("payments")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options?.limit || 100);

  if (options?.status) query = query.eq("payment_status", options.status);
  if (options?.hospitalId) query = query.eq("hospital_id", options.hospitalId);
  if (options?.patientId) query = query.eq("patient_id", options.patientId);
  // H-02: phone scope via meta JSON — server-side, not list-all
  if (options?.patientPhone && !options?.patientId) {
    const phone = options.patientPhone.replace(/\D/g, "").slice(-10);
    const raw = options.patientPhone;
    query = query.or(
      `meta->>patient_phone.eq.${raw},meta->>patient_phone.eq.${phone}`
    );
  }

  const { data, error } = await query;
  if (error) {
    // Retry without hospital_id if column missing pre-migration
    if (/hospital_id|column/i.test(error.message) && options?.hospitalId) {
      return listPayments({ ...options, hospitalId: undefined });
    }
    return [];
  }

  let rows = (data || []).map((r) => mapPayment(r as Record<string, unknown>));

  if (options?.q) {
    const q = options.q.toLowerCase();
    rows = rows.filter(
      (p) =>
        p.payment_reference.toLowerCase().includes(q) ||
        p.transaction_id.toLowerCase().includes(q) ||
        p.id.includes(q)
    );
  }
  return rows;
}

export async function listInvoices(options?: {
  patient_phone?: string;
  limit?: number;
  hospitalId?: string | null;
}): Promise<InvoiceRecord[]> {
  const sb = serviceClient() || publicClient();
  if (!sb) return [];

  let query = sb
    .from("invoices")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(options?.limit || 100);

  if (options?.patient_phone) {
    query = query.eq("patient_phone", options.patient_phone);
  }
  if (options?.hospitalId) query = query.eq("hospital_id", options.hospitalId);

  const { data, error } = await query;
  if (error) {
    if (/hospital_id|column/i.test(error.message) && options?.hospitalId) {
      return listInvoices({ ...options, hospitalId: undefined });
    }
    return [];
  }
  return (data || []).map((r) => mapInvoice(r as Record<string, unknown>));
}

export async function getInvoiceById(
  id: string
): Promise<InvoiceRecord | null> {
  const sb = serviceClient() || publicClient();
  if (!sb) return null;
  const { data, error } = await sb
    .from("invoices")
    .select("*")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return null;
  return mapInvoice(data as Record<string, unknown>);
}

export async function downloadInvoiceHtml(
  id: string
): Promise<{ ok: boolean; html?: string; invoice?: InvoiceRecord; error?: string }> {
  const invoice = await getInvoiceById(id);
  if (!invoice) return { ok: false, error: "Invoice not found" };
  const settings = await getPaymentSettings();
  const html = buildInvoiceHtml(invoice, settings);
  return { ok: true, html, invoice };
}

export async function getRevenue(options?: {
  hospitalId?: string | null;
}): Promise<{
  today: number;
  month: number;
  pending: number;
  completed: number;
  refunds: number;
  byProvider: { name: string; value: number }[];
}> {
  const analytics = await getPaymentAnalytics(options);
  return {
    today: analytics.today,
    month: analytics.month,
    pending: analytics.pending,
    completed: analytics.completed,
    refunds: analytics.refunds,
    byProvider: analytics.byProvider,
  };
}

export async function getPaymentAnalytics(options?: {
  hospitalId?: string | null;
}): Promise<PaymentAnalytics> {
  const payments = await listPayments({
    limit: 2000,
    hospitalId: options?.hospitalId,
  });
  const today = new Date().toISOString().slice(0, 10);
  const month = today.slice(0, 7);

  const completed = payments.filter((p) =>
    isPaymentSuccessful(p.payment_status)
  );
  const failedList = payments.filter((p) => p.payment_status === "failed");
  const refundList = payments.filter(
    (p) =>
      p.payment_status === "refunded" ||
      p.payment_status === "refund_requested" ||
      p.payment_status === "refund_approved"
  );

  const todayRev = completed
    .filter((p) => (p.paid_at || p.created_at).startsWith(today))
    .reduce((s, p) => s + p.total_amount, 0);
  const monthRev = completed
    .filter((p) => (p.paid_at || p.created_at).startsWith(month))
    .reduce((s, p) => s + p.total_amount, 0);
  const pending = payments
    .filter(
      (p) =>
        p.payment_status === "pending" || p.payment_status === "processing"
    )
    .reduce((s, p) => s + p.total_amount, 0);
  const refunds = payments
    .filter((p) => p.payment_status === "refunded")
    .reduce((s, p) => s + (p.refund_amount || p.total_amount), 0);

  const cash = completed
    .filter((p) => p.payment_method === "cash" || p.payment_provider === "cash")
    .reduce((s, p) => s + p.total_amount, 0);
  const online = completed
    .filter(
      (p) =>
        p.payment_method === "online" ||
        p.payment_provider === "razorpay" ||
        p.payment_provider === "stripe" ||
        p.payment_provider === "mock"
    )
    .reduce((s, p) => s + p.total_amount, 0);

  const byProviderMap = new Map<string, number>();
  const byDoctorMap = new Map<string, number>();
  const byDepartmentMap = new Map<string, number>();

  for (const p of completed) {
    const k = p.payment_provider || "other";
    byProviderMap.set(k, (byProviderMap.get(k) || 0) + p.total_amount);

    const doctor = String(p.meta?.doctor_name || "Unassigned");
    byDoctorMap.set(doctor, (byDoctorMap.get(doctor) || 0) + p.total_amount);

    const dept = String(p.meta?.department_name || "General");
    byDepartmentMap.set(dept, (byDepartmentMap.get(dept) || 0) + p.total_amount);
  }

  // Enrich doctor/department from invoices when meta missing
  const sb = serviceClient() || publicClient();
  if (sb) {
    const invIds = completed
      .map((p) => p.invoice_id)
      .filter((id): id is string => Boolean(id));
    if (invIds.length) {
      const { data: invoices } = await sb
        .from("invoices")
        .select("id, doctor_name, department_name, grand_total")
        .in("id", invIds.slice(0, 500));
      if (invoices?.length) {
        byDoctorMap.clear();
        byDepartmentMap.clear();
        for (const inv of invoices as Array<{
          doctor_name?: string;
          department_name?: string;
          grand_total?: number;
        }>) {
          const doctor = inv.doctor_name || "Unassigned";
          const dept = inv.department_name || "General";
          const amt = Number(inv.grand_total) || 0;
          byDoctorMap.set(doctor, (byDoctorMap.get(doctor) || 0) + amt);
          byDepartmentMap.set(dept, (byDepartmentMap.get(dept) || 0) + amt);
        }
      }
    }
  }

  const sortDesc = (m: Map<string, number>) =>
    Array.from(m.entries())
      .map(([name, value]) => ({ name, value }))
      .sort((a, b) => b.value - a.value)
      .slice(0, 12);

  return {
    today: todayRev,
    month: monthRev,
    pending,
    completed: completed.reduce((s, p) => s + p.total_amount, 0),
    refunds,
    failed: failedList.reduce((s, p) => s + p.total_amount, 0),
    failedCount: failedList.length,
    cash,
    online,
    byProvider: sortDesc(byProviderMap),
    byDoctor: sortDesc(byDoctorMap),
    byDepartment: sortDesc(byDepartmentMap),
    recent: payments.slice(0, 20),
    refundList: refundList.slice(0, 20),
    failedList: failedList.slice(0, 20),
  };
}

export function gatewayCapabilities() {
  return {
    razorpay: isRazorpayConfigured(),
    stripe: isStripeConfigured(),
    /** Public key id only — never secret */
    razorpay_key_id: getRazorpayKeyId(),
  };
}
