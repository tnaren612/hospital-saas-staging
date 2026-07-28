/**
 * Admin appointment data access (server + client-safe mappers).
 * Updates go through authenticated Supabase session (RLS admin policies).
 */

import type { Appointment, AppointmentStatus } from "@/types";
import type { DbAppointment } from "@/lib/supabase/types";

export function mapDbAppointment(row: Record<string, unknown>): Appointment {
  const r = row as unknown as DbAppointment;
  return {
    id: String(r.id),
    patientName: r.patient_name,
    phone: r.phone,
    email: r.email,
    age: r.age,
    gender: r.gender,
    problem: r.problem,
    doctorId: r.doctor_id,
    doctorName: r.doctor_name,
    departmentId: r.department_id ?? undefined,
    departmentName: r.department_name ?? undefined,
    date: r.date,
    timeSlot: r.time_slot,
    period: r.period,
    type: r.type,
    status: r.status,
    createdAt: r.created_at,
    notes: r.notes ?? undefined,
    bookingRef: r.booking_ref ?? undefined,
  };
}

export type AdminAppointmentStats = {
  today: number;
  upcoming: number;
  completed: number;
  cancelled: number;
  totalPatients: number;
  total: number;
};

export function computeStats(items: Appointment[]): AdminAppointmentStats {
  const today = new Date().toISOString().slice(0, 10);
  const phones = new Set(items.map((a) => a.phone));
  return {
    total: items.length,
    today: items.filter((a) => a.date === today && a.status !== "cancelled")
      .length,
    upcoming: items.filter(
      (a) =>
        (a.status === "confirmed" ||
          a.status === "pending" ||
          a.status === "upcoming") &&
        a.date >= today
    ).length,
    completed: items.filter((a) => a.status === "completed").length,
    cancelled: items.filter((a) => a.status === "cancelled").length,
    totalPatients: phones.size,
  };
}

export const STATUS_OPTIONS: AppointmentStatus[] = [
  "pending",
  "confirmed",
  "upcoming",
  "completed",
  "cancelled",
];
