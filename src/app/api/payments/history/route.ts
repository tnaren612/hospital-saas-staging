import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  getPaymentSettings,
  getRevenue,
  listPayments,
} from "@/lib/payments/payment-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

/**
 * Admin: tenant-scoped history + revenue (H-01)
 * Patient: own payments only via patient_id / phone server filter (H-02)
 */
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") || undefined;
  const status = searchParams.get("status") || undefined;
  const scope = searchParams.get("scope") || "auto";

  // Admin path
  if (scope === "admin" || scope === "auto") {
    const gate = await requireHmsAdmin();
    if (!gate.error && gate.supabase) {
      const tenant = await getTenantContext();
      const [payments, revenue, settings] = await Promise.all([
        listPayments({
          q,
          status,
          limit: 200,
          hospitalId: tenant.hospitalId,
        }),
        getRevenue({ hospitalId: tenant.hospitalId }),
        getPaymentSettings(),
      ]);
      return NextResponse.json({
        data: payments,
        revenue,
        settings,
        mode: "admin",
      });
    }
    if (scope === "admin") return gate.error!;
  }

  // Patient path
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return NextResponse.json({ data: [], mode: "demo" });
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
      .select("id, phone")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!patient?.id && !patient?.phone) {
      return NextResponse.json({ data: [], mode: "patient" });
    }

    // H-02: query scoped server-side — never list-all then filter
    const data = await listPayments({
      limit: 100,
      patientId: patient.id ? String(patient.id) : undefined,
      patientPhone: patient.phone ? String(patient.phone) : undefined,
    });

    // If patient_id empty on older payments, fall back to phone-only query
    let rows = data;
    if (rows.length === 0 && patient.phone) {
      rows = await listPayments({
        limit: 100,
        patientPhone: String(patient.phone),
      });
    }

    return NextResponse.json({ data: rows, mode: "patient" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
