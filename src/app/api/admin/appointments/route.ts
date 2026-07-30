/**
 * GET /api/admin/appointments — list appointments (staff)
 * Query: status, q, date, doctor_id, from, to
 * Always scoped to current hospital_id when available.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";
import { mapDbAppointment, computeStats } from "@/lib/admin/appointments";
import { getAppointments } from "@/lib/storage";
import { canAccessFeature, isAdmin } from "@/lib/auth/roles";
import { getTenantContext } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  if (isAdminAuthEnabled() && hasSupabaseConfig()) {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const role = session.profile.role;
    if (!canAccessFeature(role, "appointments") && !isAdmin(role)) {
      return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    }
  } else {
    const demo = (await cookies()).get("ssh_admin_demo")?.value === "1";
    if (!demo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const items = getAppointments();
    return NextResponse.json({
      data: items,
      stats: computeStats(items),
      mode: "local",
    });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim().toLowerCase();
    const date = searchParams.get("date");
    const doctorId = searchParams.get("doctor_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");

    const supabase = await createServerSupabaseClient();
    const tenant = await getTenantContext();
    let query = supabase
      .from("appointments")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(2000);

    // Tenant isolation (defense in depth alongside RLS)
    if (tenant.hospitalId) {
      query = query.eq("hospital_id", tenant.hospitalId);
    }

    if (status && status !== "all") {
      query = query.eq("status", status);
    }
    if (date) query = query.eq("date", date);
    if (doctorId) query = query.eq("doctor_id", doctorId);
    if (from) query = query.gte("date", from);
    if (to) query = query.lte("date", to);

    let { data, error } = await query;

    // Graceful if hospital_id column not migrated yet
    if (error && /hospital_id|column|schema cache/i.test(error.message)) {
      let fallback = supabase
        .from("appointments")
        .select("*")
        .order("date", { ascending: false })
        .order("created_at", { ascending: false })
        .limit(2000);
      if (status && status !== "all") fallback = fallback.eq("status", status);
      if (date) fallback = fallback.eq("date", date);
      if (doctorId) fallback = fallback.eq("doctor_id", doctorId);
      if (from) fallback = fallback.gte("date", from);
      if (to) fallback = fallback.lte("date", to);
      const retry = await fallback;
      data = retry.data;
      error = retry.error;
    }

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    let items = (data || []).map((row) =>
      mapDbAppointment(row as Record<string, unknown>)
    );

    if (q) {
      items = items.filter(
        (a) =>
          a.patientName.toLowerCase().includes(q) ||
          a.phone.includes(q) ||
          a.email.toLowerCase().includes(q) ||
          a.doctorName.toLowerCase().includes(q) ||
          a.problem.toLowerCase().includes(q) ||
          String(a.bookingRef || "")
            .toLowerCase()
            .includes(q) ||
          String(a.queueToken || "").includes(q)
      );
    }

    return NextResponse.json({
      data: items,
      stats: computeStats(items),
      mode: "supabase",
      hospital_id: tenant.hospitalId,
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
