/**
 * Appointments API (Phase 1)
 * POST /api/appointments — create booking + optional email
 * GET  /api/appointments — list (optional ?phone=)
 */

import { NextResponse } from "next/server";
import { appointmentSchema } from "@/lib/validation";
import {
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import { createServiceRoleClient } from "@/lib/supabase/server";
import { sanitizeText, stripHtml } from "@/lib/utils";
import type { TimePeriod } from "@/types";
import slotsJson from "@/data/slots.json";
import doctorJson from "@/data/doctor.json";
import hospitalJson from "@/data/hospital.json";
import { sendBookingConfirmations } from "@/lib/notifications/booking-confirm";
import { clientIp, rateLimit } from "@/lib/rate-limit";

export const dynamic = "force-dynamic";

function resolvePeriod(timeSlot: string): TimePeriod {
  const slots = slotsJson as Record<TimePeriod, string[]>;
  if (slots.morning.includes(timeSlot)) return "morning";
  if (slots.afternoon.includes(timeSlot)) return "afternoon";
  // Infer from clock for HMS doctor custom slots
  const hour = parseInt(timeSlot, 10);
  const isPm = /PM/i.test(timeSlot);
  const hour24 =
    isPm && hour !== 12 ? hour + 12 : !isPm && hour === 12 ? 0 : hour;
  if (hour24 < 12) return "morning";
  if (hour24 < 17) return "afternoon";
  return "evening";
}

function makeBookingRef(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `SSH-${Date.now().toString().slice(-6)}-${n}`;
}

export async function GET(request: Request) {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase not configured", mode: "local" },
      { status: 503 }
    );
  }

  try {
    const { searchParams } = new URL(request.url);
    const phone = searchParams.get("phone");
    const date = searchParams.get("date");
    const doctorId = searchParams.get("doctorId") || "dr-varaprasad";

    // Privacy: never dump full appointment list without a filter
    if (!phone && !date) {
      return NextResponse.json(
        { error: "phone or date query is required" },
        { status: 400 }
      );
    }

    const supabase = createServiceRoleClient();

    // For public date checks, return only schedule fields
    if (date && !phone) {
      const { data, error } = await supabase
        .from("appointments")
        .select("time_slot, doctor_id, status")
        .eq("date", date)
        .eq("doctor_id", doctorId)
        .neq("status", "cancelled");
      if (error) {
        return NextResponse.json({ error: error.message }, { status: 400 });
      }
      return NextResponse.json({ data, mode: "supabase", scope: "schedule" });
    }

    let query = supabase
      .from("appointments")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);

    if (phone) query = query.eq("phone", phone);
    if (date) {
      query = query.eq("date", date).eq("doctor_id", doctorId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ data, mode: "supabase" });
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    return NextResponse.json(
      { error: "Supabase not configured", mode: "local" },
      { status: 503 }
    );
  }

  const rl = rateLimit(`appt:${clientIp(request)}`, 8, 60_000);
  if (!rl.ok) {
    return NextResponse.json(
      {
        error: "Too many booking attempts. Please wait a minute and try again.",
        code: "RATE_LIMIT",
      },
      {
        status: 429,
        headers: { "Retry-After": String(Math.ceil(rl.retryAfterMs / 1000)) },
      }
    );
  }

  try {
    const body = await request.json();
    const parsed = appointmentSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { error: "Validation failed", details: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const data = parsed.data;
    const period = resolvePeriod(data.timeSlot);
    const doctorName =
      (body.doctorName as string) ||
      (doctorJson as { name: string }).name;
    const departmentName = (body.departmentName as string) || undefined;
    const booking_ref = makeBookingRef();

    const supabase = createServiceRoleClient();

    // Duplicate / leave guard (application level)
    const { data: existing } = await supabase
      .from("appointments")
      .select("id")
      .eq("doctor_id", data.doctorId)
      .eq("date", data.date)
      .eq("time_slot", data.timeSlot)
      .neq("status", "cancelled")
      .maybeSingle();

    if (existing) {
      return NextResponse.json(
        { error: "This time slot is already booked", code: "SLOT_TAKEN" },
        { status: 409 }
      );
    }

    if (data.doctorId.length === 36) {
      const { data: leave } = await supabase
        .from("doctor_availability")
        .select("status")
        .eq("doctor_id", data.doctorId)
        .eq("date", data.date)
        .maybeSingle();
      if (
        leave &&
        (leave.status === "on_leave" ||
          leave.status === "holiday" ||
          leave.status === "emergency")
      ) {
        return NextResponse.json(
          {
            error: `Doctor unavailable (${leave.status}) on this date`,
            code: "DOCTOR_UNAVAILABLE",
          },
          { status: 409 }
        );
      }
    }

    const insertPayload: Record<string, unknown> = {
      patient_name: sanitizeText(stripHtml(data.patientName)),
      phone: data.phone.trim(),
      email: data.email.toLowerCase().trim(),
      age: data.age,
      gender: data.gender,
      problem: sanitizeText(stripHtml(data.problem)),
      doctor_id: data.doctorId,
      doctor_name: doctorName,
      date: data.date,
      time_slot: data.timeSlot,
      period,
      type: data.type,
      status: "confirmed",
      booking_ref,
    };

    if (data.departmentId && data.departmentId.length > 10) {
      insertPayload.department_id = data.departmentId;
    }
    if (departmentName) {
      insertPayload.department_name = departmentName;
    }

    let { data: row, error } = await supabase
      .from("appointments")
      .insert(insertPayload)
      .select()
      .single();

    if (
      error &&
      /department_id|department_name|booking_ref|column|schema cache/i.test(
        error.message
      )
    ) {
      const legacy = { ...insertPayload };
      delete legacy.department_id;
      delete legacy.department_name;
      delete legacy.booking_ref;
      const retry = await supabase
        .from("appointments")
        .insert(legacy)
        .select()
        .single();
      row = retry.data;
      error = retry.error;
    }

    if (error) {
      if (error.code === "23505") {
        return NextResponse.json(
          { error: "This time slot is already booked", code: "SLOT_TAKEN" },
          { status: 409 }
        );
      }
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    const hospital = hospitalJson as {
      name: string;
      phones: string[];
      email: string;
    };

    // Best-effort admin notification row
    try {
      await supabase.from("admin_notifications").insert({
        type: "appointment_created",
        title: "New appointment",
        message: `${data.patientName} · ${data.date} ${data.timeSlot} · ${doctorName}`,
        meta: {
          appointment_id: row.id,
          phone: data.phone,
          booking_ref,
        },
      });
    } catch {
      /* optional table */
    }

    // Email + automatic Meta WhatsApp (not wa.me)
    const confirm = await sendBookingConfirmations({
      patientName: data.patientName,
      phone: data.phone,
      email: data.email,
      doctorName,
      departmentName: departmentName || "Pulmonology",
      date: data.date,
      timeSlot: data.timeSlot,
      type: data.type,
      bookingRef: booking_ref,
      appointmentId: row?.id ? String(row.id) : null,
      hospitalName: hospital.name,
      hospitalPhone: hospital.phones?.[0],
    });

    return NextResponse.json(
      {
        data: row,
        mode: "supabase",
        notifications: {
          email: confirm.email.sent,
          emailError: confirm.email.error,
          whatsapp: confirm.whatsapp,
          sms: false,
        },
      },
      { status: 201 }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : "Server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
