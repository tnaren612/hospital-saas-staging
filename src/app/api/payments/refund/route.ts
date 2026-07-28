import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin } from "@/lib/hms/server";
import { refundPayment } from "@/lib/payments/payment-service";
import { clientIp, rateLimit } from "@/lib/rate-limit";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const schema = z.object({
  payment_id: z.string().min(1),
  action: z.enum(["request", "approve", "reject", "complete"]),
  reason: z.string().max(500).optional(),
  amount: z.coerce.number().min(0).optional(),
});

/**
 * POST /api/payments/refund
 * - request: authenticated patient or admin
 * - approve / reject / complete: admin only (complete hits Razorpay refund API)
 */
export async function POST(request: Request) {
  const ip = clientIp(request);
  const rl = rateLimit(`pay-refund:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json({ error: "Too many refund attempts" }, { status: 429 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  // Non-request actions require HMS admin
  if (parsed.data.action !== "request") {
    const gate = await requireHmsAdmin();
    if (gate.error) return gate.error;
  } else {
    // request: admin OR logged-in patient
    const gate = await requireHmsAdmin();
    if (gate.error) {
      if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      try {
        const supabase = createServerSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  const result = await refundPayment({
    ...parsed.data,
    actor: `api.payments.refund:${parsed.data.action}`,
    ip_address: ip,
  });

  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || "Refund failed" },
      { status: 400 }
    );
  }

  return NextResponse.json({ data: result.payment, ok: true });
}
