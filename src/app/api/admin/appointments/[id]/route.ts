/**
 * PATCH /api/admin/appointments/[id]
 * Body: status | date+timeSlot (reschedule) | check_in | cancel_reason | notes
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { getAdminSession, isAdminAuthEnabled } from "@/lib/auth/admin";
import { mapDbAppointment } from "@/lib/admin/appointments";
import { updateAppointment } from "@/lib/storage";
import { createNotification } from "@/lib/hms/server";
import {
  adminAppointmentPatchSchema,
  resolvePeriod,
  isSlotFreeingStatus,
} from "@/lib/appointments/validation";
import { writeAuthEvent } from "@/lib/auth/audit";
import { canAccessFeature, isAdmin } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

export async function PATCH(request: Request, props: { params: Promise<{ id: string }> }) {
  const params = await props.params;
  const id = params.id;

  const parsed = adminAppointmentPatchSchema.safeParse(
    await request.json().catch(() => ({}))
  );
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: parsed.error.flatten().formErrors[0] || "Invalid body",
      },
      { status: 400 }
    );
  }
  const payload = parsed.data;

  if (!(isAdminAuthEnabled() && hasSupabaseConfig())) {
    const demo = (await cookies()).get("ssh_admin_demo")?.value === "1";
    if (!demo) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const patch: Record<string, unknown> = {};
    if (payload.status) patch.status = payload.status;
    if (payload.check_in) {
      patch.status = "checked_in";
      patch.checkedInAt = new Date().toISOString();
    }
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
  const role = session.profile.role;
  if (!canAccessFeature(role, "appointments") && !isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const supabase = await createServerSupabaseClient();

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
        .neq("id", id)
        .not("status", "in", '("cancelled","no_show")')
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
    if (payload.check_in) {
      updateBody.status = "checked_in";
      updateBody.checked_in_at = new Date().toISOString();
    }
    if (payload.date) updateBody.date = payload.date;
    if (payload.timeSlot) {
      updateBody.time_slot = payload.timeSlot;
      updateBody.period = resolvePeriod(payload.timeSlot);
    }
    if (payload.notes !== undefined) updateBody.notes = payload.notes;
    if (payload.cancel_reason !== undefined) {
      updateBody.cancel_reason = payload.cancel_reason;
    }
    if (payload.status === "cancelled" || payload.status === "no_show") {
      updateBody.cancelled_at = new Date().toISOString();
      if (payload.status === "cancelled" && payload.cancel_reason) {
        updateBody.cancel_reason = payload.cancel_reason;
      }
    }

    let { data, error } = await supabase
      .from("appointments")
      .update(updateBody)
      .eq("id", id)
      .select()
      .single();

    // Graceful if new columns missing
    if (error && /column|schema cache|checked_in|cancel_reason|no_show/i.test(error.message)) {
      const legacy: Record<string, unknown> = {};
      if (payload.status && !["no_show", "checked_in"].includes(payload.status)) {
        legacy.status = payload.status;
      } else if (payload.check_in) {
        legacy.status = "confirmed";
      } else if (payload.status === "checked_in") {
        legacy.status = "confirmed";
      } else if (payload.status === "no_show") {
        legacy.status = "cancelled";
      }
      if (payload.date) legacy.date = payload.date;
      if (payload.timeSlot) {
        legacy.time_slot = payload.timeSlot;
        legacy.period = resolvePeriod(payload.timeSlot);
      }
      if (payload.notes !== undefined) legacy.notes = payload.notes;
      const retry = await supabase
        .from("appointments")
        .update(legacy)
        .eq("id", id)
        .select()
        .single();
      data = retry.data;
      error = retry.error;
    }

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
      data.status === "cancelled"
        ? "appointment_cancelled"
        : data.status === "confirmed"
          ? "appointment_confirmed"
          : payload.date || payload.timeSlot
            ? "appointment_reminder"
            : "admin";

    await createNotification(supabase, {
      type,
      title:
        payload.check_in
          ? "Patient checked in"
          : payload.date || payload.timeSlot
            ? "Appointment rescheduled"
            : `Appointment ${data.status || "updated"}`,
      message: `${data.patient_name} · ${data.date} ${data.time_slot}${
        data.queue_token ? ` · Token #${data.queue_token}` : ""
      }`,
      meta: {
        appointment_id: id,
        status: data.status,
        date: data.date,
        time_slot: data.time_slot,
        queue_token: data.queue_token,
      },
    });

    await writeAuthEvent({
      event_type: "admin_action",
      user_id: session.user.id,
      role,
      success: true,
      metadata: {
        action: payload.check_in
          ? "appointment_check_in"
          : payload.date || payload.timeSlot
            ? "appointment_reschedule"
            : "appointment_status",
        appointment_id: id,
        status: data.status,
        slot_freed: isSlotFreeingStatus(String(data.status)),
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
