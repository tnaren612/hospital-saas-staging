import { NextResponse } from "next/server";
import { requireHmsAdmin, createNotification } from "@/lib/hms/server";
import { mapDbAppointment } from "@/lib/admin/appointments";
import { z } from "zod";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const { searchParams } = new URL(request.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");
  const doctorId = searchParams.get("doctor_id");

  if (!from || !to) {
    return NextResponse.json(
      { error: "from and to dates required" },
      { status: 400 }
    );
  }

  let query = gate.supabase
    .from("appointments")
    .select("*")
    .gte("date", from)
    .lte("date", to)
    .neq("status", "cancelled")
    .order("date")
    .order("time_slot");

  if (doctorId) query = query.eq("doctor_id", doctorId);

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const items = (data || []).map((r) =>
    mapDbAppointment(r as Record<string, unknown>)
  );

  // availability for range
  let availQuery = gate.supabase
    .from("doctor_availability")
    .select("*")
    .gte("date", from)
    .lte("date", to);

  if (doctorId && doctorId.length === 36) {
    availQuery = availQuery.eq("doctor_id", doctorId);
  }

  const { data: availability } = await availQuery;

  return NextResponse.json({ data: items, availability: availability || [] });
}

const rescheduleSchema = z.object({
  id: z.string().uuid(),
  date: z.string().min(8),
  time_slot: z.string().min(1),
  doctor_id: z.string().optional(),
});

/** POST reschedule with conflict detection */
export async function POST(request: Request) {
  const gate = await requireHmsAdmin();
  if (gate.error || !gate.supabase) return gate.error!;

  const body = await request.json().catch(() => null);
  const parsed = rescheduleSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Validation failed" }, { status: 400 });
  }

  const { id, date, time_slot, doctor_id } = parsed.data;

  const { data: current, error: curErr } = await gate.supabase
    .from("appointments")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (curErr || !current) {
    return NextResponse.json({ error: "Appointment not found" }, { status: 404 });
  }

  const doctorKey = doctor_id || current.doctor_id;

  // Conflict: another non-cancelled appointment on same slot
  const { data: conflict } = await gate.supabase
    .from("appointments")
    .select("id, patient_name")
    .eq("doctor_id", doctorKey)
    .eq("date", date)
    .eq("time_slot", time_slot)
    .neq("status", "cancelled")
    .neq("id", id)
    .maybeSingle();

  if (conflict) {
    return NextResponse.json(
      {
        error: "SLOT_CONFLICT",
        message: `Slot already booked by ${conflict.patient_name}`,
      },
      { status: 409 }
    );
  }

  // Check doctor leave/holiday if doctor_id is uuid
  if (doctorKey && doctorKey.length === 36) {
    const { data: leave } = await gate.supabase
      .from("doctor_availability")
      .select("status")
      .eq("doctor_id", doctorKey)
      .eq("date", date)
      .maybeSingle();

    if (
      leave &&
      (leave.status === "on_leave" ||
        leave.status === "holiday" ||
        leave.status === "emergency")
    ) {
      return NextResponse.json(
        {
          error: "DOCTOR_UNAVAILABLE",
          message: `Doctor marked as ${leave.status} on this date`,
        },
        { status: 409 }
      );
    }
  }

  const hour = parseInt(time_slot, 10);
  const isPm = /PM/i.test(time_slot);
  const hour24 =
    isPm && hour !== 12 ? hour + 12 : !isPm && hour === 12 ? 0 : hour;
  const period =
    hour24 < 12 ? "morning" : hour24 < 17 ? "afternoon" : "evening";

  const { data, error } = await gate.supabase
    .from("appointments")
    .update({
      date,
      time_slot,
      doctor_id: doctorKey,
      period,
    })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      return NextResponse.json(
        { error: "SLOT_CONFLICT", message: "Slot already booked" },
        { status: 409 }
      );
    }
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  await createNotification(gate.supabase, {
    type: "appointment_confirmed",
    title: "Appointment rescheduled",
    message: `${current.patient_name} moved to ${date} ${time_slot}`,
    meta: { appointment_id: id, date, time_slot },
  });

  return NextResponse.json({
    data: mapDbAppointment(data as Record<string, unknown>),
  });
}
