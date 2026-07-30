/**
 * Live admin analytics — appointments + revenue aggregates.
 * Range: weekly | monthly | yearly
 */

import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import {
  buildAnalyticsPayload,
  type AnalyticsRange,
} from "@/lib/dashboard/analytics";
import { canAccessAnalytics } from "@/lib/dashboard/widgets";
import { canAccessFeature, isAdmin } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

function parseRange(raw: string | null): AnalyticsRange {
  if (raw === "monthly" || raw === "yearly" || raw === "weekly") return raw;
  return "weekly";
}

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role || "admin";
  const mode = gate.mode === "local" ? "demo" : "supabase";

  if (!canAccessAnalytics(role, mode as "supabase" | "demo")) {
    // finance can view analytics feature too — double-check feature key
    if (!canAccessFeature(role, "analytics") && !isAdmin(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  }

  const { searchParams } = new URL(request.url);
  const range = parseRange(searchParams.get("range"));

  const { data, error } = await gate.supabase
    .from("appointments")
    .select(
      "date, status, consultation_fee, department_name, doctor_name, type, phone"
    )
    .order("date", { ascending: false })
    .limit(8000);

  if (error) {
    // Graceful empty when table missing
    if (
      /schema cache|does not exist|could not find the table/i.test(error.message)
    ) {
      const empty = buildAnalyticsPayload([], range);
      return NextResponse.json({
        ...empty,
        source: "empty",
        note: "Appointments table unavailable",
      });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const rows = (data || []) as {
    date: string;
    status?: string | null;
    consultation_fee?: number | null;
    department_name?: string | null;
    doctor_name?: string | null;
    type?: string | null;
    phone?: string | null;
  }[];

  const payload = buildAnalyticsPayload(rows, range);

  // Better patient approximation when phone present
  const phones = new Set(
    rows
      .filter((r) => r.phone)
      .map((r) => String(r.phone))
  );
  if (phones.size > 0) {
    payload.totals.patientsApprox = phones.size;
  }

  // Optional billing revenue overlay for totals.revenue if payment service available
  try {
    const { getRevenue } = await import("@/lib/payments/payment-service");
    const rev = await getRevenue();
    if (rev.month > 0 && payload.totals.revenue === 0) {
      // keep appointment-derived revenue; annotate billing month separately
      (payload as typeof payload & { billingMonth?: number }).billingMonth =
        rev.month;
    }
  } catch {
    /* ignore */
  }

  return NextResponse.json(payload);
}
