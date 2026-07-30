/**
 * GET /api/admin/appointments/queue?date=YYYY-MM-DD
 * Today's (or given day) reception queue ordered by token / time.
 */

import { NextResponse } from "next/server";
import { requireHmsAdmin } from "@/lib/hms/server";
import { mapDbAppointment } from "@/lib/admin/appointments";
import { canAccessFeature, isAdmin } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (
    gate.session &&
    !canAccessFeature(role, "appointments") &&
    !isAdmin(role) &&
    !canAccessFeature(role, "dashboard")
  ) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const date =
    searchParams.get("date") || new Date().toISOString().slice(0, 10);
  const doctorId = searchParams.get("doctor_id");
  const tenant = await getTenantContext();

  let query = gate.supabase
    .from("appointments")
    .select("*")
    .eq("date", date)
    .neq("status", "cancelled")
    .order("queue_token", { ascending: true, nullsFirst: false })
    .order("time_slot", { ascending: true });

  if (tenant.hospitalId) {
    query = query.eq("hospital_id", tenant.hospitalId);
  }
  if (doctorId) query = query.eq("doctor_id", doctorId);

  const { data, error } = await query;
  if (error) {
    // Fallback without queue_token order if column missing
    if (/queue_token|column/i.test(error.message)) {
      let fb = gate.supabase
        .from("appointments")
        .select("*")
        .eq("date", date)
        .neq("status", "cancelled")
        .order("time_slot", { ascending: true });
      if (doctorId) fb = fb.eq("doctor_id", doctorId);
      const retry = await fb;
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 400 });
      }
      const items = (retry.data || []).map((r) =>
        mapDbAppointment(r as Record<string, unknown>)
      );
      return NextResponse.json({ data: items, date, mode: "legacy" });
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const items = (data || []).map((r) =>
    mapDbAppointment(r as Record<string, unknown>)
  );

  const summary = {
    total: items.length,
    waiting: items.filter(
      (a) =>
        a.status === "confirmed" ||
        a.status === "pending" ||
        a.status === "upcoming"
    ).length,
    checked_in: items.filter((a) => a.status === "checked_in").length,
    completed: items.filter((a) => a.status === "completed").length,
    no_show: items.filter((a) => a.status === "no_show").length,
  };

  return NextResponse.json({ data: items, date, summary });
}
