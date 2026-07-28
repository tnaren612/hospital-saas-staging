/**
 * GET /api/admin/appointments — list all appointments (admin only)
 * Middleware enforces admin session when Supabase is enabled.
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";
import { mapDbAppointment } from "@/lib/admin/appointments";
import { getAppointments } from "@/lib/storage";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Production: Supabase keys present → require admin session
  if (isAdminAuthEnabled() && hasSupabaseConfig()) {
    const session = await getAdminSession();
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
  } else {
    const demo = cookies().get("ssh_admin_demo")?.value === "1";
    if (!demo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const items = getAppointments();
    return NextResponse.json({ data: items, mode: "local" });
  }

  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get("status");
    const q = searchParams.get("q")?.trim().toLowerCase();

    const supabase = createServerSupabaseClient();
    let query = supabase
      .from("appointments")
      .select("*")
      .order("date", { ascending: false })
      .order("created_at", { ascending: false });

    if (status && status !== "all") {
      query = query.eq("status", status);
    }

    const { data, error } = await query;
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
          a.problem.toLowerCase().includes(q)
      );
    }

    return NextResponse.json({ data: items, mode: "supabase" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
