import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { getPaymentAnalytics } from "@/lib/payments/payment-service";

export const dynamic = "force-dynamic";

/**
 * GET /api/payments/analytics
 * Admin payment analytics: revenue, cash vs online, failures, refunds, doctor/dept.
 */
export async function GET() {
  const gate = await requireHmsAdmin();
  if (gate.error) return gate.error;

  try {
    const data = await getPaymentAnalytics();
    return NextResponse.json({ data, ok: true });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Analytics failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
