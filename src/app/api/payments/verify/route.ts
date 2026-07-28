import { NextResponse } from "next/server";
import { z } from "zod";
import { verifyPayment } from "@/lib/payments/payment-service";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

const schema = z
  .object({
    payment_id: z.string().min(1).optional(),
    appointment_id: z.string().min(1).optional(),
    provider: z
      .enum(["none", "cash", "razorpay", "stripe", "mock"])
      .default("razorpay"),
    transaction_id: z.string().optional(),
    razorpay_order_id: z.string().optional(),
    razorpay_payment_id: z.string().optional(),
    razorpay_signature: z.string().optional(),
    /** Alias used by some clients */
    signature: z.string().optional(),
    stripe_session_id: z.string().optional(),
    stripe_payment_intent: z.string().optional(),
  })
  .refine(
    (v) =>
      Boolean(v.payment_id) ||
      Boolean(v.appointment_id) ||
      Boolean(v.razorpay_order_id),
    {
      message:
        "payment_id, appointment_id, or razorpay_order_id is required",
    }
  );

/**
 * POST /api/payments/verify
 * Verifies Razorpay HMAC (order_id|payment_id) and completes payment.
 * Idempotent for already-paid records.
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`pay-verify:${ip}`, 30, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many verification attempts" },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "Validation failed",
        details: parsed.error.flatten(),
      },
      { status: 400 }
    );
  }

  const payload = {
    ...parsed.data,
    razorpay_signature:
      parsed.data.razorpay_signature || parsed.data.signature,
    actor: "api.payments.verify",
    ip_address: ip,
  };

  const result = await verifyPayment(payload);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Verification failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({
    data: result.payment,
    ok: true,
  });
}
