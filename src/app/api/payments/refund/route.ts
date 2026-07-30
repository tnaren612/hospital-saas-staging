import { NextResponse } from "next/server";
import { z } from "zod";
import { requireHmsAdmin, requireSameOriginForMutation } from "@/lib/hms/server";
import { refundPayment } from "@/lib/payments/payment-service";
import { clientIp, rateLimitAsync } from "@/lib/rate-limit";
import {
  createServerSupabaseClient,
  createServiceRoleClient,
} from "@/lib/supabase/server";
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
 * - request: authenticated patient (must own payment) or staff
 * - approve / reject / complete: staff only
 * H-08: ownership check on patient request
 */
export async function POST(request: Request) {
  const csrf = requireSameOriginForMutation(request);
  if (csrf) return csrf;

  const ip = clientIp(request);
  const rl = await rateLimitAsync(`pay-refund:${ip}`, 20, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      { error: "Too many refund attempts" },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  let actorLabel = `api.payments.refund:${parsed.data.action}`;

  if (parsed.data.action !== "request") {
    const gate = await requireHmsAdmin();
    if (gate.error) return gate.error;
    actorLabel = `staff:${gate.session?.user.id || "admin"}:${parsed.data.action}`;
  } else {
    const gate = await requireHmsAdmin();
    if (!gate.error && gate.session) {
      actorLabel = `staff:${gate.session.user.id}:request`;
    } else {
      if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
      try {
        const supabase = await createServerSupabaseClient();
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (!user) {
          return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
        }

        const { data: patient } = await supabase
          .from("patients")
          .select("id, phone, email")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!patient) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }

        const owns = await patientOwnsPayment(parsed.data.payment_id, {
          id: String(patient.id),
          phone: patient.phone ? String(patient.phone) : null,
          email: patient.email ? String(patient.email) : null,
        });
        if (!owns) {
          return NextResponse.json(
            {
              error: "You can only request refunds on your own payments",
              code: "REFUND_NOT_OWNER",
            },
            { status: 403 }
          );
        }
        actorLabel = `patient:${user.id}:request`;
      } catch {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
      }
    }
  }

  const result = await refundPayment({
    ...parsed.data,
    actor: actorLabel,
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

async function patientOwnsPayment(
  paymentId: string,
  patient: { id: string; phone: string | null; email: string | null }
): Promise<boolean> {
  try {
    const sb = createServiceRoleClient();
    const { data } = await sb
      .from("payments")
      .select("id, patient_id, meta, invoice_id")
      .eq("id", paymentId)
      .maybeSingle();
    if (!data) return false;

    if (data.patient_id && String(data.patient_id) === patient.id) return true;

    const meta = (data.meta || {}) as {
      patient_phone?: string;
      patient_email?: string;
    };
    const pPhone = (patient.phone || "").replace(/\D/g, "").slice(-10);
    const mPhone = String(meta.patient_phone || "")
      .replace(/\D/g, "")
      .slice(-10);
    if (pPhone && mPhone && pPhone === mPhone) return true;

    if (
      patient.email &&
      meta.patient_email &&
      patient.email.toLowerCase() === String(meta.patient_email).toLowerCase()
    ) {
      return true;
    }

    if (data.invoice_id) {
      const { data: inv } = await sb
        .from("invoices")
        .select("patient_id, patient_phone, patient_email")
        .eq("id", data.invoice_id)
        .maybeSingle();
      if (inv) {
        if (inv.patient_id && String(inv.patient_id) === patient.id) return true;
        const iPhone = String(inv.patient_phone || "")
          .replace(/\D/g, "")
          .slice(-10);
        if (pPhone && iPhone && pPhone === iPhone) return true;
      }
    }
    return false;
  } catch {
    return false;
  }
}
