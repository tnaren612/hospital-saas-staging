/**
 * POST /api/admin/reception/walk-in
 * Same-day walk-in: upsert patient registry + create appointment with queue token.
 */

import { NextResponse } from "next/server";
import { requireHmsAdmin, createNotification } from "@/lib/hms/server";
import { walkInSchema } from "@/lib/reception/validation";
import { nextQueueToken, resolvePeriod } from "@/lib/appointments/validation";
import { mapDbAppointment } from "@/lib/admin/appointments";
import { sanitizeText, stripHtml } from "@/lib/utils";
import { writeAuthEvent } from "@/lib/auth/audit";
import { checkAuthRateLimit } from "@/lib/auth/rate-limit";
import { isAdmin, canAccessReception } from "@/lib/auth/roles";
import { getTenantContext, withHospitalId } from "@/lib/hospital/tenant";

export const dynamic = "force-dynamic";

function makeBookingRef(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `SSH-WI-${Date.now().toString().slice(-6)}-${n}`;
}

export async function POST(request: Request) {
  const gate = await requireHmsAdmin([
    "receptionist",
    "manager",
    "admin",
    "super_admin",
  ]);
  if (gate.error || !gate.supabase) return gate.error!;

  const role = gate.session?.profile.role;
  if (gate.session && !canAccessReception(role) && !isAdmin(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const limit = checkAuthRateLimit(
    `walk-in:${gate.session?.user.id || "demo"}`
  );
  if (!limit.allowed) {
    return NextResponse.json(
      { error: `Too many requests. Retry in ${limit.retryAfterSeconds}s` },
      { status: 429 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = walkInSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const d = parsed.data;
  const date = d.date || new Date().toISOString().slice(0, 10);
  const timeSlot =
    d.time_slot ||
    new Date().toLocaleTimeString("en-IN", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: true,
    });
  const period = resolvePeriod(timeSlot);
  const doctorName = d.doctor_name || "Consultant";
  const booking_ref = makeBookingRef();
  const email =
    d.email && d.email.length > 3
      ? d.email.toLowerCase()
      : `${d.phone}@walkin.local`;

  const sb = gate.supabase;

  // 1) Upsert patient registry by phone
  let patientId: string | null = null;
  try {
    const { data: existing } = await sb
      .from("hospital_patients")
      .select("id")
      .eq("phone", d.phone)
      .is("deleted_at", null)
      .maybeSingle();

    if (existing?.id) {
      patientId = existing.id;
      await sb
        .from("hospital_patients")
        .update({
          full_name: d.full_name.trim(),
          age: d.age ?? null,
          gender: d.gender ?? null,
          status: "active",
        })
        .eq("id", existing.id);
    } else {
      const { data: created } = await sb
        .from("hospital_patients")
        .insert({
          full_name: d.full_name.trim(),
          phone: d.phone,
          email: d.email || null,
          age: d.age ?? null,
          gender: d.gender ?? null,
          medical_history: "",
          notes: "Walk-in registration",
          status: "active",
        })
        .select("id")
        .single();
      patientId = created?.id || null;
    }
  } catch {
    /* registry optional if table missing */
  }

  // 2) Doctor availability guard
  if (d.doctor_id.length === 36) {
    const { data: leave } = await sb
      .from("doctor_availability")
      .select("status")
      .eq("doctor_id", d.doctor_id)
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
          error: `Doctor unavailable (${leave.status}) today`,
          code: "DOCTOR_UNAVAILABLE",
        },
        { status: 409 }
      );
    }
  }

  const queue_token = await nextQueueToken(sb, date);
  const tenant = await getTenantContext();

  const insertPayload: Record<string, unknown> = withHospitalId(
    {
      patient_name: sanitizeText(stripHtml(d.full_name)),
      phone: d.phone.trim(),
      email,
      age: d.age != null && d.age >= 1 ? d.age : 30,
      gender: d.gender || "other",
      problem: sanitizeText(stripHtml(d.problem || "Walk-in consultation")),
      doctor_id: d.doctor_id,
      doctor_name: doctorName,
      date,
      time_slot: timeSlot,
      period,
      type: d.type || "in-person",
      status: "confirmed",
      booking_ref,
      queue_token,
      is_walk_in: true,
      notes: "Walk-in at reception",
    },
    tenant.hospitalId
  );

  if (d.department_id) insertPayload.department_id = d.department_id;
  if (d.department_name) insertPayload.department_name = d.department_name;

  let { data: row, error } = await sb
    .from("appointments")
    .insert(insertPayload)
    .select()
    .single();

  if (
    error &&
    /is_walk_in|queue_token|booking_ref|department|column|schema cache/i.test(
      error.message
    )
  ) {
    const legacy = { ...insertPayload };
    delete legacy.is_walk_in;
    delete legacy.queue_token;
    delete legacy.booking_ref;
    delete legacy.department_id;
    delete legacy.department_name;
    const retry = await sb.from("appointments").insert(legacy).select().single();
    row = retry.data;
    error = retry.error;
  }

  if (error) {
    if (error.code === "23505") {
      // Slot collision — retry with unique walk-in slot suffix
      insertPayload.time_slot = `${timeSlot} · WI-${queue_token}`;
      const retry = await sb
        .from("appointments")
        .insert(insertPayload)
        .select()
        .single();
      if (retry.error) {
        return NextResponse.json({ error: retry.error.message }, { status: 400 });
      }
      row = retry.data;
    } else {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
  }

  try {
    await createNotification(sb, {
      type: "appointment_created",
      title: "Walk-in registered",
      message: `${d.full_name} · Token #${row.queue_token || queue_token} · ${doctorName}`,
      meta: {
        appointment_id: row.id,
        walk_in: true,
        queue_token: row.queue_token || queue_token,
        patient_id: patientId,
      },
    });
  } catch {
    /* ignore */
  }

  await writeAuthEvent({
    event_type: "admin_action",
    user_id: gate.session?.user.id,
    role: role || undefined,
    success: true,
    metadata: {
      action: "walk_in_create",
      appointment_id: row.id,
      queue_token: row.queue_token || queue_token,
    },
  });

  return NextResponse.json(
    {
      data: mapDbAppointment(row as Record<string, unknown>),
      queue_token: row.queue_token || queue_token,
      patient_id: patientId,
      booking_ref: row.booking_ref || booking_ref,
    },
    { status: 201 }
  );
}
