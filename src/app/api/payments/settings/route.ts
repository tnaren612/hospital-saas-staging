import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  gatewayCapabilities,
  getPaymentSettings,
  updatePaymentSettings,
} from "@/lib/payments/payment-service";

export const dynamic = "force-dynamic";

/** Public flags for booking UI (no secrets). */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const admin = searchParams.get("admin") === "1";

  const settings = await getPaymentSettings();
  const caps = gatewayCapabilities();

  if (!admin) {
    // Public checkout flags + KEY_ID only (from env). Never KEY_SECRET.
    return NextResponse.json({
      data: {
        online_payment_enabled: settings.online_payment_enabled,
        cash_enabled: settings.cash_enabled,
        razorpay_enabled: settings.razorpay_enabled || caps.razorpay,
        stripe_enabled: settings.stripe_enabled && caps.stripe,
        currency: settings.currency,
        tax_percentage: settings.tax_percentage,
        razorpay_key_id: caps.razorpay_key_id || "",
        stripe_publishable_key:
          process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY ||
          process.env.STRIPE_PUBLISHABLE_KEY ||
          "",
      },
    });
  }

  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  return NextResponse.json({
    data: settings,
    capabilities: caps,
    envHints: {
      RAZORPAY_KEY_SECRET: Boolean(process.env.RAZORPAY_KEY_SECRET),
      STRIPE_SECRET_KEY: Boolean(process.env.STRIPE_SECRET_KEY),
    },
  });
}

const patchSchema = z.object({
  online_payment_enabled: z.boolean().optional(),
  cash_enabled: z.boolean().optional(),
  razorpay_enabled: z.boolean().optional(),
  stripe_enabled: z.boolean().optional(),
  currency: z.string().max(8).optional(),
  tax_percentage: z.coerce.number().min(0).max(100).optional(),
  hospital_name: z.string().max(160).optional(),
  hospital_address: z.string().max(400).optional(),
  invoice_prefix: z.string().max(40).optional(),
  gstin: z.string().max(40).optional(),
  terms: z.string().max(2000).optional(),
  razorpay_key_id: z.string().max(120).optional(),
  stripe_publishable_key: z.string().max(200).optional(),
});

export async function PATCH(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const result = await updatePaymentSettings(parsed.data);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Update failed" },
      { status: 400 }
    );
  }
  return NextResponse.json({ data: result.data });
}
