import { NextResponse } from "next/server";
import { processRazorpayWebhook } from "@/lib/payments/webhook";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { paymentLog } from "@/lib/payments/logger";

export const dynamic = "force-dynamic";

/**
 * POST /api/payments/webhook
 * Razorpay server-to-server webhook.
 * Verify x-razorpay-signature with RAZORPAY_WEBHOOK_SECRET.
 * Idempotent via payment_webhook_events.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`pay-webhook:${ip}`, 120, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many requests" }, { status: 429 });
  }

  const rawBody = await request.text();
  const signature =
    request.headers.get("x-razorpay-signature") ||
    request.headers.get("X-Razorpay-Signature") ||
    "";

  if (!rawBody) {
    return NextResponse.json({ error: "Empty body" }, { status: 400 });
  }

  const result = await processRazorpayWebhook({
    rawBody,
    signature,
  });

  if (!result.ok) {
    paymentLog.warn("webhook.route_rejected", {
      error: result.error,
      event: result.event,
    });
    return NextResponse.json(
      { error: result.error || "Webhook rejected" },
      { status: result.error?.includes("signature") ? 401 : 400 }
    );
  }

  // Always 200 for duplicates / ignored so Razorpay stops retrying
  return NextResponse.json({
    ok: true,
    duplicate: Boolean(result.duplicate),
    ignored: Boolean(result.ignored),
    event: result.event,
  });
}

/** Health check for webhook URL configuration */
export async function GET() {
  return NextResponse.json({
    ok: true,
    endpoint: "/api/payments/webhook",
    events: ["payment.captured", "payment.failed", "refund.processed"],
  });
}
