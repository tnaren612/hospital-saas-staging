/**
 * GET /api/appointments/slots?date=YYYY-MM-DD&doctorId=...
 * Returns booked times + day availability for the public booking form.
 */

import { NextResponse } from "next/server";
import {
  getSupabaseAnonKey,
  getSupabaseUrl,
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import { createClient } from "@supabase/supabase-js";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const doctorId = searchParams.get("doctorId") || "dr-varaprasad";

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return NextResponse.json({
      booked: [],
      dayAvailable: true,
      dayStatus: "available",
      mode: "local",
    });
  }

  try {
    const supabase = createClient(getSupabaseUrl()!, getSupabaseAnonKey()!);

    const { data, error } = await supabase
      .from("appointments")
      .select("time_slot")
      .eq("date", date)
      .eq("doctor_id", doctorId)
      .neq("status", "cancelled");

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const booked = (data || []).map((r: { time_slot: string }) =>
      String(r.time_slot)
    );

    let dayAvailable = true;
    let dayStatus: string = "available";
    let dayNote = "";

    if (doctorId.length === 36) {
      const { data: leave } = await supabase
        .from("doctor_availability")
        .select("status, note")
        .eq("doctor_id", doctorId)
        .eq("date", date)
        .maybeSingle();

      if (leave) {
        dayStatus = String(leave.status);
        dayNote = String(leave.note || "");
        if (
          leave.status === "on_leave" ||
          leave.status === "holiday" ||
          leave.status === "emergency"
        ) {
          dayAvailable = false;
        }
      }
    }

    return NextResponse.json({
      booked,
      dayAvailable,
      dayStatus,
      dayNote,
      mode: "supabase",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
