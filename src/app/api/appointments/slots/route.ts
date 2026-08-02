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
import { allowDemoFallback } from "@/lib/supabase/demo-gate";
import { createClient } from "@supabase/supabase-js";

export const revalidate = 15;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const date = searchParams.get("date");
  const doctorId = searchParams.get("doctorId") || "dr-varaprasad";

  if (!date) {
    return NextResponse.json({ error: "date is required" }, { status: 400 });
  }

  const cacheHeaders = {
    "Cache-Control":
      "public, s-maxage=15, stale-while-revalidate=60, max-age=10",
  };

  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    if (!allowDemoFallback()) {
      return NextResponse.json(
        {
          error:
            "Supabase backend required in production (NEXT_PUBLIC_USE_SUPABASE=true + keys)",
        },
        { status: 503, headers: cacheHeaders }
      );
    }
    return NextResponse.json(
      {
        booked: [],
        dayAvailable: true,
        dayStatus: "available",
        mode: "local",
      },
      { headers: cacheHeaders }
    );
  }

  try {
    const supabase = createClient(getSupabaseUrl()!, getSupabaseAnonKey()!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    // Parallel: booked slots + leave in one wait
    const leavePromise =
      doctorId.length === 36
        ? supabase
            .from("doctor_availability")
            .select("status, note")
            .eq("doctor_id", doctorId)
            .eq("date", date)
            .maybeSingle()
        : Promise.resolve({ data: null as { status?: string; note?: string } | null });

    const [slotsRes, leaveRes] = await Promise.all([
      supabase.rpc("booked_slots", {
        p_doctor_id: doctorId,
        p_date: date,
      }),
      leavePromise,
    ]);

    if (slotsRes.error) {
      // Fallback to direct read only when the RPC is missing (pre-046 schema)
      if (/function|does not exist|rpc/i.test(slotsRes.error.message)) {
        const direct = await supabase
          .from("appointments")
          .select("time_slot")
          .eq("date", date)
          .eq("doctor_id", doctorId)
          .not("status", "in", '("cancelled","no_show")');
        if (!direct.error) {
          return NextResponse.json(
            {
              booked: (direct.data || []).map(
                (r: { time_slot: string }) => String(r.time_slot)
              ),
              dayAvailable: true,
              dayStatus: "available",
              mode: "supabase",
            },
            { headers: cacheHeaders }
          );
        }
      }
      return NextResponse.json(
        { error: slotsRes.error.message },
        { status: 400 }
      );
    }

    const booked = (slotsRes.data || []).map(String);

    let dayAvailable = true;
    let dayStatus: string = "available";
    let dayNote = "";

    const leave = leaveRes.data;
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

    return NextResponse.json(
      {
        booked,
        dayAvailable,
        dayStatus,
        dayNote,
        mode: "supabase",
      },
      { headers: cacheHeaders }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
