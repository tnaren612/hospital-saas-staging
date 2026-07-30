/**
 * Razorpay adapter — order create + HMAC verify.
 * Credentials ONLY from environment variables:
 *   RAZORPAY_KEY_ID (public, safe for checkout)
 *   RAZORPAY_KEY_SECRET (server only — never sent to client)
 */

import type { GatewayOrderResult } from "@/lib/payments/types";
import { allowMockPayments } from "@/lib/payments/production-guard";

export function getRazorpayKeyId(): string {
  const id = process.env.RAZORPAY_KEY_ID || "";
  if (!id || id === "your_razorpay_key") return "";
  return id;
}

export function getRazorpayKeySecret(): string {
  const secret = process.env.RAZORPAY_KEY_SECRET || "";
  if (!secret || secret === "your_razorpay_secret") return "";
  return secret;
}

export function isRazorpayConfigured(): boolean {
  return Boolean(getRazorpayKeyId() && getRazorpayKeySecret());
}

export async function createRazorpayOrder(input: {
  amountInr: number;
  currency: string;
  receipt: string;
  notes?: Record<string, string>;
  description?: string;
  customerName?: string;
  customerEmail?: string;
  customerPhone?: string;
}): Promise<GatewayOrderResult> {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();
  const amountPaise = Math.round(Number(input.amountInr) * 100);
  const currency = (input.currency || "INR").toUpperCase();

  if (!isRazorpayConfigured()) {
    // C-04: never create mock orders in production
    if (!allowMockPayments()) {
      throw new Error(
        "Razorpay is not configured. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET."
      );
    }
    const orderId = `order_mock_${Date.now()}`;
    return {
      provider: "mock",
      orderId,
      amount: input.amountInr,
      amountPaise,
      currency,
      publicKey: keyId || "rzp_test_mock",
      name: "Hospital",
      description: input.description || "Hospital payment",
      prefill: {
        name: input.customerName,
        email: input.customerEmail,
        contact: input.customerPhone,
      },
      checkoutHint:
        "Razorpay not configured — mock order. Set RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET.",
      raw: { mock: true, receipt: input.receipt, amount: amountPaise },
    };
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");

  const res = await fetch("https://api.razorpay.com/v1/orders", {
    method: "POST",
    headers: {
      Authorization: `Basic ${auth}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      amount: amountPaise,
      currency,
      receipt: String(input.receipt).slice(0, 40),
      notes: input.notes || {},
    }),
  });

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    amount?: number;
    currency?: string;
    status?: string;
    error?: { description?: string; code?: string };
  };

  if (!res.ok || !json.id) {
    throw new Error(
      json.error?.description || `Razorpay order failed (${res.status})`
    );
  }

  return {
    provider: "razorpay",
    orderId: json.id,
    amount: input.amountInr,
    amountPaise: json.amount || amountPaise,
    currency: (json.currency || currency).toUpperCase(),
    publicKey: keyId,
    name: "Hospital",
    description: input.description || "Hospital payment",
    prefill: {
      name: input.customerName,
      email: input.customerEmail,
      contact: input.customerPhone,
    },
    raw: {
      id: json.id,
      amount: json.amount,
      currency: json.currency,
      status: json.status,
    },
  };
}

/**
 * Verify Razorpay Standard Checkout response signature.
 * payload = order_id + "|" + razorpay_payment_id
 * signature = HMAC_SHA256(payload, KEY_SECRET)
 */
export async function verifyRazorpaySignature(input: {
  orderId: string;
  paymentId: string;
  signature: string;
}): Promise<boolean> {
  const secret = getRazorpayKeySecret();
  if (!secret) {
    // C-04: mock verify only in non-production
    if (!allowMockPayments()) return false;
    return (
      input.signature === "mock_signature" ||
      input.paymentId.startsWith("pay_mock") ||
      input.orderId.startsWith("order_mock")
    );
  }

  if (!input.orderId || !input.paymentId || !input.signature) {
    return false;
  }

  const crypto = await import("crypto");
  const body = `${input.orderId}|${input.paymentId}`;
  const expected = crypto
    .createHmac("sha256", secret)
    .update(body)
    .digest("hex");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(input.signature), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return expected === input.signature;
  }
}

/**
 * Razorpay webhook signature:
 * HMAC_SHA256(raw_body, RAZORPAY_WEBHOOK_SECRET || RAZORPAY_KEY_SECRET)
 * header: x-razorpay-signature
 */
export function getRazorpayWebhookSecret(): string {
  const wh =
    process.env.RAZORPAY_WEBHOOK_SECRET ||
    process.env.RAZORPAY_KEY_SECRET ||
    "";
  if (!wh || wh === "your_razorpay_secret" || wh === "your_webhook_secret") {
    return "";
  }
  return wh;
}

export async function verifyRazorpayWebhookSignature(input: {
  rawBody: string;
  signature: string;
}): Promise<boolean> {
  const secret = getRazorpayWebhookSecret();
  if (!secret) {
    // C-04: mock webhook only in non-production
    if (!allowMockPayments()) return false;
    return input.signature === "mock_webhook_signature";
  }
  if (!input.rawBody || !input.signature) return false;

  const crypto = await import("crypto");
  const expected = crypto
    .createHmac("sha256", secret)
    .update(input.rawBody)
    .digest("hex");

  try {
    const a = Buffer.from(expected, "utf8");
    const b = Buffer.from(String(input.signature), "utf8");
    if (a.length !== b.length) return false;
    return crypto.timingSafeEqual(a, b);
  } catch {
    return expected === input.signature;
  }
}

/**
 * Create Razorpay refund for a captured payment.
 */
export async function createRazorpayRefund(input: {
  paymentId: string;
  amountPaise?: number;
  notes?: Record<string, string>;
}): Promise<{
  ok: boolean;
  refundId?: string;
  amountPaise?: number;
  status?: string;
  error?: string;
  raw?: Record<string, unknown>;
}> {
  const keyId = getRazorpayKeyId();
  const keySecret = getRazorpayKeySecret();

  if (!keyId || !keySecret) {
    // Mock refund when gateway not configured
    return {
      ok: true,
      refundId: `rfnd_mock_${Date.now()}`,
      amountPaise: input.amountPaise,
      status: "processed",
      raw: { mock: true },
    };
  }

  if (!input.paymentId || input.paymentId.startsWith("pay_mock")) {
    return {
      ok: true,
      refundId: `rfnd_mock_${Date.now()}`,
      amountPaise: input.amountPaise,
      status: "processed",
      raw: { mock: true },
    };
  }

  const auth = Buffer.from(`${keyId}:${keySecret}`).toString("base64");
  const body: Record<string, unknown> = {
    notes: input.notes || {},
  };
  if (input.amountPaise != null && input.amountPaise > 0) {
    body.amount = input.amountPaise;
  }

  const res = await fetch(
    `https://api.razorpay.com/v1/payments/${encodeURIComponent(input.paymentId)}/refund`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    }
  );

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    amount?: number;
    status?: string;
    error?: { description?: string };
  };

  if (!res.ok || !json.id) {
    return {
      ok: false,
      error: json.error?.description || `Razorpay refund failed (${res.status})`,
      raw: json as Record<string, unknown>,
    };
  }

  return {
    ok: true,
    refundId: json.id,
    amountPaise: json.amount,
    status: json.status,
    raw: json as Record<string, unknown>,
  };
}
