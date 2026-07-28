/**
 * PATCH /api/admin/appointments/[id]
 * Body:
 *  - { status }                    → update status (cancel / confirm / complete)
 *  - { date, timeSlot }            → reschedule (conflict-checked)
 *  - combination allowed
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";
import { mapDbAppointment } from "@/lib/admin/appointments";
import { updateAppointment } from "@/lib/storage";
import { createNotification } from "@/lib/hms/server";
import type { TimePeriod } from "@/types";

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  status: z
    .enum(["pending", "confirmed", "completed", "cancelled", "upcoming"])
    .optional(),
  date: z.string().min(8).optional(),
  timeSlot: z.string().min(1).optional(),
  notes: z.string().max(1000).optional(),
});

function resolvePeriod(timeSlot: string): TimePeriod {
  const hour = parseInt(timeSlot, 10);
  const isPm = /PM/i.test(timeSlot);
  const hour24 =
    isPm && hour !== 12 ? hour + 12 : !isPm && hour === 12 ? 0 : hour;
  if (hour24 < 12) return "morning";
  if (hour24 < 17) return "afternoon";
  return "evening";
}

export async function PATCH(
  request: Request,
  { params }: { params: { id: string } }
) {
  const id = params.id;

  let payload: z.infer<typeof bodySchema>;
  try {
    payload = bodySchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid body" }, { status: 400 });
  }

  if (!payload.status && !payload.date && !payload.timeSlot && !payload.notes) {
    return NextResponse.json(
      { error: "No changes provided" },
      { status: 400 }
    );
  }

  if (!(isAdminAuthEnabled() && hasSupabaseConfig())) {
    const demo = cookies().get("ssh_admin_demo")?.value === "1";
    if (!demo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const patch: Record<string, unknown> = {};
    if (payload.status) patch.status = payload.status;
    if (payload.date) patch.date = payload.date;
    if (payload.timeSlot) {
      patch.timeSlot = payload.timeSlot;
      patch.period = resolvePeriod(payload.timeSlot);
    }
    if (payload.notes !== undefined) patch.notes = payload.notes;
    const updated = updateAppointment(id, patch);
    if (!updated) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }
    return NextResponse.json({ data: updated, mode: "local" });
  }

  const session = await getAdminSession();
  if (!session) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerSupabaseClient();

    const { data: current, error: curErr } = await supabase
      .from("appointments")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (curErr || !current) {
      return NextResponse.json({ error: "Not found" }, { status: 404 });
    }

    const nextDate = payload.date || current.date;
    const nextSlot = payload.timeSlot || current.time_slot;

    // Conflict check when rescheduling
    if (payload.date || payload.timeSlot) {
      const { data: conflict } = await supabase
        .from("appointments")
        .select("id, patient_name")
        .eq("doctor_id", current.doctor_id)
        .eq("date", nextDate)
        .eq("time_slot", nextSlot)
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

      if (String(current.doctor_id).length === 36) {
        const { data: leave } = await supabase
          .from("doctor_availability")
          .select("status")
          .eq("doctor_id", current.doctor_id)
          .eq("date", nextDate)
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
              message: `Doctor marked as ${leave.status}`,
            },
            { status: 409 }
          );
        }
      }
    }

    const updateBody: Record<string, unknown> = {};
    if (payload.status) updateBody.status = payload.status;
    if (payload.date) updateBody.date = payload.date;
    if (payload.timeSlot) {
      updateBody.time_slot = payload.timeSlot;
      updateBody.period = resolvePeriod(payload.timeSlot);
    }
    if (payload.notes !== undefined) updateBody.notes = payload.notes;

    const { data, error } = await supabase
      .from("appointments")
      .update(updateBody)
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

    const type =
      payload.status === "cancelled"
        ? "appointment_cancelled"
        : payload.status === "confirmed"
          ? "appointment_confirmed"
          : payload.date || payload.timeSlot
            ? "appointment_reminder"
            : "admin";

    await createNotification(supabase, {
      type,
      title:
        payload.date || payload.timeSlot
          ? "Appointment rescheduled"
          : `Appointment ${payload.status || "updated"}`,
      message: `${data.patient_name} · ${data.date} ${data.time_slot}`,
      meta: {
        appointment_id: id,
        status: data.status,
        date: data.date,
        time_slot: data.time_slot,
      },
    });

    return NextResponse.json({
      data: mapDbAppointment(data as Record<string, unknown>),
      mode: "supabase",
    });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
