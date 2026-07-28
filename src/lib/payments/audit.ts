/**
 * Payment audit log writer (service role).
 */

import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/env";
import { paymentLog } from "@/lib/payments/logger";

function serviceClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createSupabaseJs(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type AuditEventType =
  | "payment.created"
  | "payment.verify.success"
  | "payment.verify.failed"
  | "payment.webhook.received"
  | "payment.webhook.duplicate"
  | "payment.webhook.processed"
  | "payment.webhook.failed"
  | "payment.completed"
  | "payment.failed"
  | "payment.refund.requested"
  | "payment.refund.approved"
  | "payment.refund.rejected"
  | "payment.refund.completed"
  | "payment.refund.failed"
  | "invoice.pdf.generated"
  | "invoice.email.sent"
  | "invoice.email.skipped";

export async function writePaymentAudit(input: {
  event_type: AuditEventType | string;
  payment_id?: string | null;
  invoice_id?: string | null;
  appointment_id?: string | null;
  actor?: string;
  ip_address?: string;
  details?: Record<string, unknown>;
}): Promise<void> {
  const sb = serviceClient();
  if (!sb) {
    paymentLog.warn("audit.skip_no_client", { event: input.event_type });
    return;
  }

  const { error } = await sb.from("payment_audit_logs").insert({
    payment_id: input.payment_id || null,
    invoice_id: input.invoice_id || null,
    appointment_id: input.appointment_id || null,
    event_type: input.event_type,
    actor: input.actor || "system",
    ip_address: input.ip_address || "",
    details: input.details || {},
  });

  if (error) {
    // Table may not exist until migration 014 — log and continue
    paymentLog.warn("audit.write_failed", {
      event: input.event_type,
      error: error.message,
    });
  }
}
