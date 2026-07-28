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

export const dynamic = "force-dynamic";

/**
 * Admin: full history + revenue
 * Patient: own payments when authenticated (via meta phone fallback limited)
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
      const [payments, revenue, settings] = await Promise.all([
        listPayments({ q, status, limit: 200 }),
        getRevenue(),
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
    const supabase = createServerSupabaseClient();
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

    // Use service list filtered — service role lists all; filter by patient_id
    const all = await listPayments({ limit: 300 });
    const data = all.filter(
      (p) =>
        (patient?.id && p.patient_id === patient.id) ||
        (patient?.phone &&
          String((p.meta as { patient_phone?: string })?.patient_phone || "") ===
            patient.phone)
    );

    return NextResponse.json({ data, mode: "patient" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
