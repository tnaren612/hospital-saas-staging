/**
 * Razorpay webhook processing with idempotency.
 * Events: payment.captured | payment.failed | refund.processed
 */

import { createClient as createSupabaseJs } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  getSupabaseUrl,
} from "@/lib/supabase/env";
import { writePaymentAudit } from "@/lib/payments/audit";
import {
  completePaymentSuccess,
  markPaymentFailed,
} from "@/lib/payments/completion";
import { paymentLog } from "@/lib/payments/logger";
import { verifyRazorpayWebhookSignature } from "@/lib/payments/razorpay";

function serviceClient() {
  const url = getSupabaseUrl();
  const key = getServiceRoleKey();
  if (!url || !key) return null;
  return createSupabaseJs(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

type RazorpayWebhookPayload = {
  event?: string;
  /** Razorpay event id when present */
  id?: string;
  contains?: string[];
  payload?: {
    payment?: {
      entity?: {
        id?: string;
        order_id?: string;
        amount?: number;
        status?: string;
        error_description?: string;
        notes?: Record<string, string>;
      };
    };
    refund?: {
      entity?: {
        id?: string;
        payment_id?: string;
        amount?: number;
        status?: string;
        notes?: Record<string, string>;
      };
    };
  };
};

function eventKey(payload: RazorpayWebhookPayload, rawBody: string): string {
  if (payload.id) return String(payload.id);
  const paymentId = payload.payload?.payment?.entity?.id;
  const refundId = payload.payload?.refund?.entity?.id;
  const event = payload.event || "unknown";
  if (paymentId) return `${event}:${paymentId}`;
  if (refundId) return `${event}:${refundId}`;
  // Fallback stable hash of body length + event
  return `${event}:${rawBody.length}:${rawBody.slice(0, 64)}`;
  
}



async function findPaymentByOrderOrTxn(input: {
  orderId?: string;
  paymentId?: string;
  notesPaymentId?: string;
}): Promise<{ id: string; invoice_id: string | null; appointment_id: string | null } | null> {
  const sb = serviceClient();
  if (!sb) return null;

  if (input.notesPaymentId) {
    const { data } = await sb
      .from("payments")
      .select("id, invoice_id, appointment_id")
      .eq("id", input.notesPaymentId)
      .maybeSingle();
    if (data) {
      return {
        id: String(data.id),
        invoice_id: data.invoice_id ? String(data.invoice_id) : null,
        appointment_id: data.appointment_id
          ? String(data.appointment_id)
          : null,
      };
    }
  }

  if (input.paymentId) {
    const { data } = await sb
      .from("payments")
      .select("id, invoice_id, appointment_id")
      .eq("transaction_id", input.paymentId)
      .maybeSingle();
    if (data) {
      return {
        id: String(data.id),
        invoice_id: data.invoice_id ? String(data.invoice_id) : null,
        appointment_id: data.appointment_id
          ? String(data.appointment_id)
          : null,
      };
    }
  }

  if (input.orderId) {
    const { data: byTxn } = await sb
      .from("payments")
      .select("id, invoice_id, appointment_id")
      .eq("transaction_id", input.orderId)
      .maybeSingle();
    if (byTxn) {
      return {
        id: String(byTxn.id),
        invoice_id: byTxn.invoice_id ? String(byTxn.invoice_id) : null,
        appointment_id: byTxn.appointment_id
          ? String(byTxn.appointment_id)
          : null,
      };
    }

    // meta.razorpay_order_id match (best-effort)
    const { data: rows } = await sb
      .from("payments")
      .select("id, invoice_id, appointment_id, meta")
      .order("created_at", { ascending: false })
      .limit(50);

    const match = (rows || []).find((r) => {
      const meta = (r.meta || {}) as Record<string, unknown>;
      return String(meta.razorpay_order_id || "") === input.orderId;
    });
    if (match) {
      return {
        id: String(match.id),
        invoice_id: match.invoice_id ? String(match.invoice_id) : null,
        appointment_id: match.appointment_id
          ? String(match.appointment_id)
          : null,
      };
    }
  }

  return null;
}

export async function processRazorpayWebhook(input: {
  rawBody: string;
  signature: string;
}): Promise<{
  ok: boolean;
  duplicate?: boolean;
  ignored?: boolean;
  error?: string;
  event?: string;
}> {
  const valid = await verifyRazorpayWebhookSignature({
    rawBody: input.rawBody,
    signature: input.signature,
  });

  if (!valid) {
    paymentLog.warn("webhook.signature_invalid", {});
    return { ok: false, error: "Invalid webhook signature" };
  }

  let payload: RazorpayWebhookPayload;
  try {
    payload = JSON.parse(input.rawBody) as RazorpayWebhookPayload;
  } catch {
    return { ok: false, error: "Invalid JSON body" };
  }

  paymentLog.info("webhook.received", {
    event: payload.event || "unknown",
    hasPayment: Boolean(payload.payload?.payment?.entity?.id),
    hasRefund: Boolean(payload.payload?.refund?.entity?.id),
  });

  const eventType = payload.event || "unknown";
  const eventId = eventKey(payload, input.rawBody);
  const sb = serviceClient();
  if (!sb) return { ok: false, error: "Service role required" };

  // Idempotency insert
  const { data: inserted, error: insertErr } = await sb
    .from("payment_webhook_events")
    .insert({
      provider: "razorpay",
      event_id: eventId,
      event_type: eventType,
      payload: payload as unknown as Record<string, unknown>,
      processed: false,
    })
    .select("id")
    .maybeSingle();

  if (insertErr) {
    // Unique violation → duplicate
    if (
      /duplicate|unique/i.test(insertErr.message) ||
      insertErr.code === "23505"
    ) {
      await writePaymentAudit({
        event_type: "payment.webhook.duplicate",
        details: { event_id: eventId, event_type: eventType },
      });
      paymentLog.info("webhook.duplicate", { eventId, eventType });
      return { ok: true, duplicate: true, event: eventType };
    }
    // Table missing — continue without ledger
    paymentLog.warn("webhook.ledger_unavailable", {
      error: insertErr.message,
    });
  }

  await writePaymentAudit({
    event_type: "payment.webhook.received",
    details: { event_id: eventId, event_type: eventType },
  });

  try {
    if (eventType === "payment.captured" || eventType === "payment.authorized") {
      const entity = payload.payload?.payment?.entity;
      const orderId = entity?.order_id;
      const gatewayPaymentId = entity?.id;
      const notesPaymentId = entity?.notes?.payment_id;

      const found = await findPaymentByOrderOrTxn({
        orderId,
        paymentId: gatewayPaymentId,
        notesPaymentId,
      });

      if (!found) {
        paymentLog.warn("webhook.payment_not_found", {
          orderId,
          gatewayPaymentId,
          eventType,
        });
        if (inserted?.id) {
          await sb
            .from("payment_webhook_events")
            .update({
              processed: true,
              process_result: "payment_not_found",
              processed_at: new Date().toISOString(),
            })
            .eq("id", inserted.id);
        }
        return { ok: true, ignored: true, event: eventType };
      }

      await completePaymentSuccess({
        paymentId: found.id,
        transactionId: gatewayPaymentId || found.id,
        source: "webhook",
        actor: "razorpay_webhook",
        metaPatch: {
          razorpay_order_id: orderId,
          razorpay_payment_id: gatewayPaymentId,
          webhook_event: eventType,
        },
      });
    } else if (eventType === "payment.failed") {
      const entity = payload.payload?.payment?.entity;

      paymentLog.info("webhook.payment_failed_received", {
        orderId: entity?.order_id,
        paymentId: entity?.id,
        status: entity?.status,
        error: entity?.error_description,
      });

      const found = await findPaymentByOrderOrTxn({
        orderId: entity?.order_id,
        paymentId: entity?.id,
        notesPaymentId: entity?.notes?.payment_id,
      });

      if (found) {
        await markPaymentFailed({
          paymentId: found.id,
          reason: entity?.error_description || "payment.failed",
          source: "webhook",
          actor: "razorpay_webhook",
          metaPatch: {
            razorpay_payment_id: entity?.id,
            razorpay_order_id: entity?.order_id,
          },
        });
      } else {
        paymentLog.warn("webhook.failed_payment_not_found", {
          orderId: entity?.order_id,
        });
      }
    } else if (eventType === "refund.processed") {
      const entity = payload.payload?.refund?.entity;
      const gatewayPaymentId = entity?.payment_id;
      const refundAmount = entity?.amount != null ? entity.amount / 100 : null;
      const found = await findPaymentByOrderOrTxn({
        paymentId: gatewayPaymentId,
        notesPaymentId: entity?.notes?.payment_id,
      });

      if (found) {
        const { data: payRow } = await sb
          .from("payments")
          .select("meta")
          .eq("id", found.id)
          .maybeSingle();
        const prevMeta = ((payRow?.meta || {}) as Record<string, unknown>) || {};
        await sb
          .from("payments")
          .update({
            payment_status: "refunded",
            refund_amount: refundAmount,
            meta: {
              ...prevMeta,
              razorpay_refund_id: entity?.id,
              refund_webhook_at: new Date().toISOString(),
            },
          })
          .eq("id", found.id);

        if (found.invoice_id) {
          await sb
            .from("invoices")
            .update({ status: "refunded" })
            .eq("id", found.invoice_id);
        }
        if (found.appointment_id) {
          await sb
            .from("appointments")
            .update({ payment_status: "refunded" })
            .eq("id", found.appointment_id);
        }

        await writePaymentAudit({
          event_type: "payment.refund.completed",
          payment_id: found.id,
          invoice_id: found.invoice_id,
          appointment_id: found.appointment_id,
          actor: "razorpay_webhook",
          details: {
            refund_id: entity?.id,
            amount: refundAmount,
            source: "webhook",
          },
        });
      }

    } else {
      paymentLog.info("webhook.ignored_event", { eventType });
      if (inserted?.id) {
        await sb
          .from("payment_webhook_events")
          .update({
            processed: true,
            process_result: "ignored_event",
            processed_at: new Date().toISOString(),
          })
          .eq("id", inserted.id);
      }
      return { ok: true, ignored: true, event: eventType };
    }

    if (inserted?.id) {
      await sb
        .from("payment_webhook_events")
        .update({
          processed: true,
          process_result: "ok",
          processed_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);
    }

    await writePaymentAudit({
      event_type: "payment.webhook.processed",
      details: { event_id: eventId, event_type: eventType },
    });

    return { ok: true, event: eventType };
  } catch (e) {
    const message = e instanceof Error ? e.message : "Webhook processing failed";
    paymentLog.error("webhook.process_error", { error: message, eventType });
    if (inserted?.id) {
      await sb
        .from("payment_webhook_events")
        .update({
          processed: false,
          process_result: message,
          processed_at: new Date().toISOString(),
        })
        .eq("id", inserted.id);
    }
    await writePaymentAudit({
      event_type: "payment.webhook.failed",
      details: { event_id: eventId, event_type: eventType, error: message },
    });
    return { ok: false, error: message, event: eventType };
  }
}
