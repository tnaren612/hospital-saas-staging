/**
 * Stripe adapter — Checkout Session style.
 * Secrets: STRIPE_SECRET_KEY. Publishable: STRIPE_PUBLISHABLE_KEY or payment_settings.
 */

import type { GatewayOrderResult } from "@/lib/payments/types";
import { allowMockPayments } from "@/lib/payments/production-guard";

export function isStripeConfigured(): boolean {
  return Boolean(
    process.env.STRIPE_SECRET_KEY &&
      process.env.STRIPE_SECRET_KEY !== "your_stripe_secret"
  );
}

export async function createStripeCheckoutSession(input: {
  amountInr: number;
  currency: string;
  reference: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  description?: string;
}): Promise<GatewayOrderResult> {
  const secret = process.env.STRIPE_SECRET_KEY || "";
  const publishable =
    process.env.STRIPE_PUBLISHABLE_KEY ||
    process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
    "";

  if (!isStripeConfigured()) {
    if (!allowMockPayments()) {
      throw new Error(
        "Stripe is not configured. Set STRIPE_SECRET_KEY for production."
      );
    }
    const orderId = `cs_mock_${Date.now()}`;
    return {
      provider: "mock",
      orderId,
      amount: input.amountInr,
      currency: input.currency,
      publicKey: publishable || "pk_test_mock",
      checkoutHint:
        "Stripe secret not configured — mock session created. Set STRIPE_SECRET_KEY.",
      raw: {
        mock: true,
        url: input.successUrl + `&mock_session=${orderId}`,
      },
    };
  }

  // Stripe amounts in smallest currency unit (paise for INR)
  const unitAmount = Math.round(input.amountInr * 100);
  const params = new URLSearchParams();
  params.append("mode", "payment");
  params.append("success_url", input.successUrl);
  params.append("cancel_url", input.cancelUrl);
  params.append("client_reference_id", input.reference);
  if (input.customerEmail) params.append("customer_email", input.customerEmail);
  params.append("line_items[0][price_data][currency]", (input.currency || "inr").toLowerCase());
  params.append(
    "line_items[0][price_data][product_data][name]",
    input.description || "Hospital payment"
  );
  params.append("line_items[0][price_data][unit_amount]", String(unitAmount));
  params.append("line_items[0][quantity]", "1");

  const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: params.toString(),
  });

  const json = (await res.json().catch(() => ({}))) as {
    id?: string;
    url?: string;
    error?: { message?: string };
  };

  if (!res.ok || !json.id) {
    throw new Error(json.error?.message || "Stripe session failed");
  }

  return {
    provider: "stripe",
    orderId: json.id,
    amount: input.amountInr,
    currency: input.currency,
    publicKey: publishable,
    checkoutHint: json.url,
    raw: json as Record<string, unknown>,
  };
}

export async function verifyStripeSession(
  sessionId: string
): Promise<{ paid: boolean; paymentIntent?: string }> {
  const secret = process.env.STRIPE_SECRET_KEY || "";
  if (!secret) {
    // C-04: mock Stripe verify only outside production
    if (!allowMockPayments()) {
      return { paid: false };
    }
    return {
      paid: sessionId.startsWith("cs_mock"),
      paymentIntent: sessionId,
    };
  }

  const res = await fetch(
    `https://api.stripe.com/v1/checkout/sessions/${sessionId}`,
    {
      headers: { Authorization: `Bearer ${secret}` },
    }
  );
  const json = (await res.json().catch(() => ({}))) as {
    payment_status?: string;
    payment_intent?: string;
  };
  return {
    paid: json.payment_status === "paid",
    paymentIntent:
      typeof json.payment_intent === "string"
        ? json.payment_intent
        : undefined,
  };
}
