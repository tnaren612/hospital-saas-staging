/**
 * Appointment service (Step 3).
 * Uses Supabase when configured; falls back to localStorage demo mode.
 */

import type { Appointment, TimePeriod } from "@/types";
import type { AppointmentFormValues } from "@/lib/validation";
import { createClientOrNull } from "@/lib/supabase/client";
import { isSupabaseBackendEnabled } from "@/lib/supabase/env";
import type { DbAppointment } from "@/lib/supabase/types";
import {
  addAppointment as addLocalAppointment,
  getAppointments as getLocalAppointments,
  isSlotBooked as isLocalSlotBooked,
  updateAppointment as updateLocalAppointment,
} from "@/lib/storage";
import { generateId, sanitizeText, stripHtml } from "@/lib/utils";

export type CreateAppointmentInput = AppointmentFormValues & {
  doctorName: string;
  period: TimePeriod;
  status?: Appointment["status"];
  departmentName?: string;
};

function makeBookingRef(): string {
  const n = Math.floor(1000 + Math.random() * 9000);
  return `SSH-${Date.now().toString().slice(-6)}-${n}`;
}

function mapDbToAppointment(row: DbAppointment): Appointment {
  return {
    id: row.id,
    patientName: row.patient_name,
    phone: row.phone,
    email: row.email,
    age: row.age,
    gender: row.gender,
    problem: row.problem,
    doctorId: row.doctor_id,
    doctorName: row.doctor_name,
    departmentId: row.department_id ?? undefined,
    departmentName: row.department_name ?? undefined,
    date: row.date,
    timeSlot: row.time_slot,
    period: row.period,
    type: row.type,
    status: row.status,
    createdAt: row.created_at,
    notes: row.notes ?? undefined,
    bookingRef: row.booking_ref ?? undefined,
  };
}

function buildLocalAppointment(input: CreateAppointmentInput): Appointment {
  return {
    id: generateId("apt"),
    patientName: sanitizeText(stripHtml(input.patientName)),
    phone: input.phone,
    email: input.email.toLowerCase(),
    age: input.age,
    gender: input.gender,
    problem: sanitizeText(stripHtml(input.problem)),
    doctorId: input.doctorId,
    doctorName: input.doctorName,
    departmentId: input.departmentId || undefined,
    departmentName: input.departmentName,
    date: input.date,
    timeSlot: input.timeSlot,
    period: input.period,
    type: input.type,
    status: input.status ?? "confirmed",
    createdAt: new Date().toISOString(),
    bookingRef: makeBookingRef(),
  };
}

export function isUsingSupabase(): boolean {
  return isSupabaseBackendEnabled();
}

/** Check if a slot is already booked. */
export async function checkSlotBooked(
  date: string,
  timeSlot: string,
  doctorId = "dr-varaprasad"
): Promise<boolean> {
  if (!isSupabaseBackendEnabled()) {
    return isLocalSlotBooked(date, timeSlot);
  }

  const supabase = createClientOrNull();
  if (!supabase) return isLocalSlotBooked(date, timeSlot);

  const { data, error } = await supabase
    .from("appointments")
    .select("id")
    .eq("doctor_id", doctorId)
    .eq("date", date)
    .eq("time_slot", timeSlot)
    .neq("status", "cancelled")
    .maybeSingle();

  if (error) {
    // Fallback if table missing / network error
    console.warn("[appointments] slot check failed, using local:", error.message);
    return isLocalSlotBooked(date, timeSlot);
  }

  return Boolean(data);
}

/** Load booked slot keys for a date: "YYYY-MM-DD|10:00 AM" — via cached slots API */
export async function getBookedSlotKeysForDate(
  date: string,
  doctorId = "dr-varaprasad"
): Promise<string[]> {
  if (!isSupabaseBackendEnabled()) {
    const { getBookedSlots } = await import("@/lib/storage");
    return getBookedSlots().filter((k) => k.startsWith(`${date}|`));
  }

  try {
    const qs = new URLSearchParams({ date, doctorId });
    const res = await fetch(`/api/appointments/slots?${qs}`, {
      // short CDN/browser cache
    });
    if (res.ok) {
      const json = (await res.json()) as { booked?: string[] };
      return (json.booked || []).map((t) => `${date}|${t}`);
    }
  } catch {
    /* fall through */
  }

  const supabase = createClientOrNull();
  if (!supabase) {
    const { getBookedSlots } = await import("@/lib/storage");
    return getBookedSlots().filter((k) => k.startsWith(`${date}|`));
  }

  const { data, error } = await supabase
    .from("appointments")
    .select("date, time_slot")
    .eq("doctor_id", doctorId)
    .eq("date", date)
    .neq("status", "cancelled");

  if (error || !data) {
    console.warn("[appointments] fetch slots failed:", error?.message);
    return [];
  }

  return (data as { date: string; time_slot: string }[]).map(
    (r) => `${r.date}|${r.time_slot}`
  );
}

/** Create appointment in Supabase or localStorage. */
export async function createAppointment(
  input: CreateAppointmentInput
): Promise<{ appointment: Appointment; source: "supabase" | "local" }> {
  const cleaned: CreateAppointmentInput = {
    ...input,
    patientName: sanitizeText(stripHtml(input.patientName)),
    problem: sanitizeText(stripHtml(input.problem)),
    email: input.email.toLowerCase().trim(),
    phone: input.phone.trim(),
  };

  if (!isSupabaseBackendEnabled()) {
    const appointment = addLocalAppointment(buildLocalAppointment(cleaned));
    return { appointment, source: "local" };
  }

  const supabase = createClientOrNull();
  if (!supabase) {
    const appointment = addLocalAppointment(buildLocalAppointment(cleaned));
    return { appointment, source: "local" };
  }

  // Pre-check (unique constraint is the real guard)
  const taken = await checkSlotBooked(
    cleaned.date,
    cleaned.timeSlot,
    cleaned.doctorId
  );
  if (taken) {
    throw new Error("SLOT_TAKEN");
  }

  const booking_ref = makeBookingRef();
  const payload: Record<string, unknown> = {
    patient_name: cleaned.patientName,
    phone: cleaned.phone,
    email: cleaned.email,
    age: cleaned.age,
    gender: cleaned.gender,
    problem: cleaned.problem,
    doctor_id: cleaned.doctorId,
    doctor_name: cleaned.doctorName,
    date: cleaned.date,
    time_slot: cleaned.timeSlot,
    period: cleaned.period,
    type: cleaned.type,
    status: cleaned.status ?? "confirmed",
    booking_ref,
  };

  // Optional department columns (migration 007) — omit if empty
  if (cleaned.departmentId && cleaned.departmentId.length > 10) {
    payload.department_id = cleaned.departmentId;
  }
  if (cleaned.departmentName) {
    payload.department_name = cleaned.departmentName;
  }

  let { data, error } = await supabase
    .from("appointments")
    .insert(payload)
    .select()
    .single();

  // Retry without optional columns if schema not migrated yet
  if (
    error &&
    /department_id|department_name|booking_ref|schema cache|column/i.test(
      error.message
    )
  ) {
    const legacy = {
      patient_name: cleaned.patientName,
      phone: cleaned.phone,
      email: cleaned.email,
      age: cleaned.age,
      gender: cleaned.gender,
      problem: cleaned.problem,
      doctor_id: cleaned.doctorId,
      doctor_name: cleaned.doctorName,
      date: cleaned.date,
      time_slot: cleaned.timeSlot,
      period: cleaned.period,
      type: cleaned.type,
      status: cleaned.status ?? "confirmed",
    };
    const retry = await supabase.from("appointments").insert(legacy).select().single();
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    if (
      error.code === "23505" ||
      error.message?.toLowerCase().includes("unique")
    ) {
      throw new Error("SLOT_TAKEN");
    }
    console.error("[appointments] insert failed:", error);
    throw new Error(error.message || "Failed to create appointment");
  }

  return {
    appointment: mapDbToAppointment(data as unknown as DbAppointment),
    source: "supabase",
  };
}

/** List appointments (admin / patient dashboard). */
export async function listAppointments(options?: {
  phone?: string;
}): Promise<Appointment[]> {
  if (!isSupabaseBackendEnabled()) {
    const all = getLocalAppointments();
    if (options?.phone) {
      return all.filter((a) => a.phone === options.phone);
    }
    return all;
  }

  const supabase = createClientOrNull();
  if (!supabase) return getLocalAppointments();

  let query = supabase
    .from("appointments")
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.phone) {
    query = query.eq("phone", options.phone);
  }

  const { data, error } = await query;
  if (error) {
    console.warn("[appointments] list failed:", error.message);
    return getLocalAppointments();
  }

  return (data as unknown as DbAppointment[]).map(mapDbToAppointment);
}

/** Update status (admin). Falls back to localStorage. */
export async function setAppointmentStatus(
  id: string,
  status: Appointment["status"]
): Promise<Appointment | null> {
  if (!isSupabaseBackendEnabled()) {
    return updateLocalAppointment(id, { status });
  }

  const supabase = createClientOrNull();
  if (!supabase) return updateLocalAppointment(id, { status });

  const { data, error } = await supabase
    .from("appointments")
    .update({ status })
    .eq("id", id)
    .select()
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return mapDbToAppointment(data as unknown as DbAppointment);
}
