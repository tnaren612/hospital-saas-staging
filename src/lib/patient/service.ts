/**
 * Patient portal service — dual mode:
 * - Supabase Auth + patients tables (production)
 * - localStorage phone demo (backward compatible)
 */

import { createClientOrNull } from "@/lib/supabase/client";
import type { User } from "@supabase/supabase-js";
import {
  hasSupabaseConfig,
  isSupabaseBackendEnabled,
} from "@/lib/supabase/env";
import { allowDemoFallback, ensureDemoAllowed } from "@/lib/supabase/demo-gate";
import {
  getAppointments as getLocalAppointments,
  getPatient as getLocalPatient,
  updateAppointment as updateLocalAppointment,
} from "@/lib/storage";
import type { Appointment } from "@/types";
import type {
  PatientDashboardData,
  PatientDocument,
  PatientNotification,
  PatientReport,
  PortalPatient,
} from "@/lib/patient/types";
import { isActiveStatus } from "@/lib/patient/types";

function mapPatient(row: Record<string, unknown>): PortalPatient {
  const storedFullName = String(row.full_name || "").trim();
  const nameParts = storedFullName.split(/\s+/).filter(Boolean);
  const first = String(row.first_name || nameParts[0] || "");
  const last = String(
    row.last_name || (storedFullName ? nameParts.slice(1).join(" ") : "")
  );
  return {
    id: String(row.id),
    user_id: String(row.user_id || row.portal_user_id || row.id),
    mrn: row.mrn ? String(row.mrn) : null,
    first_name: first,
    last_name: last,
    full_name:
      storedFullName || [first, last].filter(Boolean).join(" ") || "Patient",
    gender: (row.gender as PortalPatient["gender"]) || null,
    date_of_birth: row.date_of_birth ? String(row.date_of_birth) : null,
    phone: row.phone ? String(row.phone) : null,
    email: row.email ? String(row.email) : null,
    blood_group: row.blood_group ? String(row.blood_group) : null,
    address: String(row.address || ""),
    emergency_contact: row.emergency_contact
      ? String(row.emergency_contact)
      : null,
    insurance_provider: row.insurance_provider
      ? String(row.insurance_provider)
      : null,
    insurance_number: row.insurance_number
      ? String(row.insurance_number)
      : null,
    profile_photo: String(row.profile_photo || ""),
  };
}

function mapAppointment(row: Record<string, unknown>): Appointment {
  return {
    id: String(row.id),
    patientName: String(row.patient_name || ""),
    phone: String(row.phone || ""),
    email: String(row.email || ""),
    age: Number(row.age) || 0,
    gender: (row.gender as Appointment["gender"]) || "other",
    problem: String(row.problem || ""),
    doctorId: String(row.doctor_id || ""),
    doctorName: String(row.doctor_name || ""),
    departmentId: row.department_id ? String(row.department_id) : undefined,
    departmentName: row.department_name
      ? String(row.department_name)
      : undefined,
    date: String(row.date || ""),
    timeSlot: String(row.time_slot || ""),
    period: (row.period as Appointment["period"]) || "morning",
    type: (row.type as Appointment["type"]) || "in-person",
    status: (row.status as Appointment["status"]) || "confirmed",
    createdAt: String(row.created_at || ""),
    notes: row.notes ? String(row.notes) : undefined,
    bookingRef: row.booking_ref ? String(row.booking_ref) : undefined,
    paymentStatus: row.payment_status
      ? String(row.payment_status)
      : undefined,
    invoiceId: row.invoice_id ? String(row.invoice_id) : undefined,
  };
}

/** Demo dashboard from localStorage (existing behaviour). Never runs in production. */
export function getDemoDashboard(): PatientDashboardData {
  ensureDemoAllowed("patient demo dashboard");
  const p = getLocalPatient();
  if (!p) {
    return {
      mode: "unauthenticated",
      patient: null,
      counts: {
        upcoming: 0,
        completed: 0,
        cancelled: 0,
        reports: 0,
        packages: 0,
        unreadNotifications: 0,
      },
      upcoming: [],
      recentAppointments: [],
      reports: [],
      notifications: [],
      assignedDoctor: null,
      packages: [],
    };
  }

  const all = getLocalAppointments().filter((a) => a.phone === p.phone);
  const today = new Date().toISOString().slice(0, 10);
  const upcoming = all.filter(
    (a) => isActiveStatus(a.status) && a.date >= today
  );
  const completed = all.filter((a) => a.status === "completed");
  const cancelled = all.filter((a) => a.status === "cancelled");

  return {
    mode: "demo",
    patient: {
      id: p.id,
      user_id: p.id,
      mrn: null,
      first_name: p.name.split(" ")[0] || p.name,
      last_name: p.name.split(" ").slice(1).join(" "),
      full_name: p.name,
      gender: p.gender || null,
      date_of_birth: null,
      phone: p.phone,
      email: p.email || null,
      blood_group: null,
      address: "",
      emergency_contact: null,
      insurance_provider: null,
      insurance_number: null,
      profile_photo: "",
    },
    counts: {
      upcoming: upcoming.length,
      completed: completed.length,
      cancelled: cancelled.length,
      reports: 0,
      packages: 0,
      unreadNotifications: 0,
    },
    upcoming: upcoming.slice(0, 5),
    recentAppointments: all.slice(0, 10),
    reports: [],
    notifications: [],
    assignedDoctor: all[0]
      ? {
          id: all[0].doctorId,
          name: all[0].doctorName,
        }
      : null,
    packages: [],
  };
}

/** Demo-mode greeting name (null outside development — no demo data in prod). */
export function getDemoPatientName(): string | null {
  if (!allowDemoFallback()) return null;
  return getDemoDashboard().patient?.full_name ?? null;
}

/** Empty, legitimate "not signed in" state for production portal visitors. */
function unauthenticatedDashboard(): PatientDashboardData {
  return {
    mode: "unauthenticated",
    patient: null,
    counts: {
      upcoming: 0,
      completed: 0,
      cancelled: 0,
      reports: 0,
      packages: 0,
      unreadNotifications: 0,
    },
    upcoming: [],
    recentAppointments: [],
    reports: [],
    notifications: [],
    assignedDoctor: null,
    packages: [],
  };
}

export async function getPatientDashboard(
  client?: ReturnType<typeof createClientOrNull>,
  accessToken?: string,
  authenticatedUser?: User
): Promise<PatientDashboardData> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    if (!allowDemoFallback()) return unauthenticatedDashboard();
    return getDemoDashboard();
  }

  const supabase = client ?? createClientOrNull();
  if (!supabase) {
    if (!allowDemoFallback()) return unauthenticatedDashboard();
    return getDemoDashboard();
  }

  const user =
    authenticatedUser ??
    (await supabase.auth.getUser(accessToken)).data.user;

  if (!user) {
    // Logged-out visitors get the unauthenticated state; demo data is dev-only.
    if (allowDemoFallback()) {
      const demo = getDemoDashboard();
      if (demo.patient) return demo;
    }
    return unauthenticatedDashboard();
  }

  // Ensure portal patient row
  let patientRow: Record<string, unknown> | null = null;
  let legacyPatientTable = false;
  {
    const { data, error } = await supabase
      .from("patients")
      .select("*")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) {
      if (/schema cache|does not exist|could not find/i.test(error.message)) {
        legacyPatientTable = true;
      } else {
        console.warn("[patient] load:", error.message);
      }
    } else {
      patientRow = data as Record<string, unknown> | null;
    }
  }

  if (legacyPatientTable) {
    const { data: linked } = await supabase
      .from("hospital_patients")
      .select("*")
      .eq("portal_user_id", user.id)
      .maybeSingle();
    patientRow = linked as Record<string, unknown> | null;

    if (!patientRow && user.email) {
      const { data: byEmail } = await supabase
        .from("hospital_patients")
        .select("*")
        .eq("email", user.email)
        .maybeSingle();
      patientRow = byEmail as Record<string, unknown> | null;
    }
  }

  if (!patientRow) {
    const meta = user.user_metadata || {};
    const full =
      (meta.full_name as string) ||
      (meta.name as string) ||
      user.email?.split("@")[0] ||
      "Patient";
    const parts = String(full).split(" ");
    if (legacyPatientTable) {
      patientRow = {
        id: user.id,
        portal_user_id: user.id,
        full_name: full,
        email: user.email || null,
        phone: (meta.phone as string) || user.phone || null,
        address: "",
      };
    } else {
      const insert = {
        user_id: user.id,
        first_name: parts[0] || "Patient",
        last_name: parts.slice(1).join(" "),
        email: user.email || null,
        phone: (meta.phone as string) || user.phone || null,
      };
      const { data: created, error: cErr } = await supabase
        .from("patients")
        .insert(insert)
        .select("*")
        .single();
      if (cErr || !created) {
        console.warn("[patient] create profile:", cErr?.message);
        return getDemoDashboard();
      }
      patientRow = created as Record<string, unknown>;
    }
  }

  const patient = mapPatient(patientRow);
  const phone = patient.phone;

  // Appointments by patient_id or phone
  let aptQuery = supabase
    .from("appointments")
    .select("*")
    .order("date", { ascending: false })
    .limit(100);

  if (phone) {
    aptQuery = aptQuery.or(
      `patient_id.eq.${user.id},phone.eq.${phone}`
    );
  } else {
    aptQuery = aptQuery.eq("patient_id", user.id);
  }

  const { data: aptRows } = await aptQuery;
  const appointments: Appointment[] = (aptRows || []).map(
    (r: Record<string, unknown>) =>
      mapAppointment(r)
  );

  const today = new Date().toISOString().slice(0, 10);
  const upcoming = appointments.filter(
    (a) => isActiveStatus(a.status) && a.date >= today
  );
  const completed = appointments.filter((a) => a.status === "completed");
  const cancelled = appointments.filter((a) => a.status === "cancelled");

  const { data: reportRows } = await supabase
    .from("patient_reports")
    .select("*")
    .eq("patient_id", patient.id)
    .order("uploaded_at", { ascending: false })
    .limit(20);

  const reports: PatientReport[] = (reportRows || []).map((r: Record<string, unknown>) => ({
    id: String(r.id),
    patient_id: String(r.patient_id),
    appointment_id: r.appointment_id ? String(r.appointment_id) : null,
    doctor_id: r.doctor_id ? String(r.doctor_id) : null,
    title: String(r.title),
    report_url: String(r.report_url),
    report_type: String(r.report_type || "general"),
    uploaded_at: String(r.uploaded_at),
  }));

  const { data: notifRows } = await supabase
    .from("patient_notifications")
    .select("*")
    .eq("patient_id", patient.id)
    .order("created_at", { ascending: false })
    .limit(20);

  const notifications: PatientNotification[] = (notifRows || []).map((n: Record<string, unknown>) => ({
    id: String(n.id),
    patient_id: String(n.patient_id),
    title: String(n.title),
    message: String(n.message || ""),
    type: String(n.type || "info"),
    is_read: Boolean(n.is_read),
    created_at: String(n.created_at),
    meta: (n.meta || {}) as Record<string, unknown>,
  }));

  const packages = appointments
    .filter((a) => /health package|package:/i.test(a.problem))
    .map((a) => ({
      slug: a.bookingRef || a.id,
      name: a.problem.replace(/^Booking health package:\s*/i, ""),
      date: a.date,
    }))
    .slice(0, 5);

  let assignedDoctor: PatientDashboardData["assignedDoctor"] = null;
  const lastDoc = upcoming[0] || appointments[0];
  if (lastDoc) {
    assignedDoctor = {
      id: lastDoc.doctorId,
      name: lastDoc.doctorName,
    };
    if (lastDoc.doctorId.length === 36) {
      const { data: doc } = await supabase
        .from("hospital_doctors")
        .select("id, name, title, photo_url, slug")
        .eq("id", lastDoc.doctorId)
        .maybeSingle();
      if (doc) {
        assignedDoctor = {
          id: String(doc.id),
          name: String(doc.name),
          title: doc.title ? String(doc.title) : undefined,
          photo_url: doc.photo_url ? String(doc.photo_url) : null,
          slug: doc.slug ? String(doc.slug) : null,
        };
      }
    }
  }

  return {
    mode: "supabase",
    patient,
    counts: {
      upcoming: upcoming.length,
      completed: completed.length,
      cancelled: cancelled.length,
      reports: reports.length,
      packages: packages.length,
      unreadNotifications: notifications.filter((n) => !n.is_read).length,
    },
    upcoming: upcoming.slice(0, 5),
    recentAppointments: appointments.slice(0, 10),
    reports,
    notifications,
    assignedDoctor,
    packages,
  };
}

export async function getPatientAppointments(): Promise<Appointment[]> {
  const dash = await getPatientDashboard();
  if (dash.mode === "demo" && dash.patient?.phone) {
    ensureDemoAllowed("patient appointment listing (local)");
    return getLocalAppointments().filter((a) => a.phone === dash.patient!.phone);
  }
  if (!isSupabaseBackendEnabled()) {
    ensureDemoAllowed("patient appointment listing");
    return [];
  }

  const supabase = createClientOrNull();
  if (!supabase) {
    ensureDemoAllowed("patient appointment listing");
    return [];
  }
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const phone = dash.patient?.phone;
  let q = supabase.from("appointments").select("*").order("date", {
    ascending: false,
  });
  if (phone) q = q.or(`patient_id.eq.${user.id},phone.eq.${phone}`);
  else q = q.eq("patient_id", user.id);

  const { data, error } = await q;
  if (error) {
    console.warn("[patient] appointments:", error.message);
    return dash.recentAppointments;
  }
  return (data || []).map((r: Record<string, unknown>) => mapAppointment(r));
}

export async function cancelPatientAppointment(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    ensureDemoAllowed("patient appointment cancel (local)");
    const updated = updateLocalAppointment(id, { status: "cancelled" });
    return updated
      ? { ok: true }
      : { ok: false, error: "Appointment not found" };
  }

  const supabase = createClientOrNull();
  if (!supabase) {
    ensureDemoAllowed("patient appointment cancel (local)");
    const updated = updateLocalAppointment(id, { status: "cancelled" });
    return updated
      ? { ok: true }
      : { ok: false, error: "Appointment not found" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required to cancel" };
  }

  // Ownership: patient_id or phone match on profile
  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("appointments")
    .select("id, phone, patient_id, status, date")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Appointment not found" };
  if (existing.status === "cancelled") {
    return { ok: false, error: "Already cancelled" };
  }
  if (existing.status === "completed") {
    return { ok: false, error: "Completed appointments cannot be cancelled" };
  }

  const owns =
    existing.patient_id === user.id ||
    (profile?.phone && String(existing.phone) === String(profile.phone));
  if (!owns) {
    return { ok: false, error: "Not authorized to cancel this appointment" };
  }

  const { error } = await supabase
    .from("appointments")
    .update({
      status: "cancelled",
      cancelled_at: new Date().toISOString(),
      cancel_reason: "Cancelled by patient",
    })
    .eq("id", id);

  if (error) {
    // Legacy without new columns
    if (/column|schema cache/i.test(error.message)) {
      const retry = await supabase
        .from("appointments")
        .update({ status: "cancelled" })
        .eq("id", id);
      if (retry.error) return { ok: false, error: retry.error.message };
      return { ok: true };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function reschedulePatientAppointment(
  id: string,
  date: string,
  timeSlot: string
): Promise<{ ok: boolean; error?: string }> {
  if (!isSupabaseBackendEnabled() || !hasSupabaseConfig()) {
    ensureDemoAllowed("patient appointment reschedule (local)");
    const updated = updateLocalAppointment(id, { date, timeSlot });
    return updated
      ? { ok: true }
      : { ok: false, error: "Appointment not found" };
  }

  const supabase = createClientOrNull();
  if (!supabase) {
    ensureDemoAllowed("patient appointment reschedule (local)");
    const updated = updateLocalAppointment(id, { date, timeSlot });
    return updated
      ? { ok: true }
      : { ok: false, error: "Appointment not found" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return { ok: false, error: "Sign in required to reschedule" };
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("phone")
    .eq("id", user.id)
    .maybeSingle();

  const { data: existing } = await supabase
    .from("appointments")
    .select("id, phone, patient_id, status, doctor_id")
    .eq("id", id)
    .maybeSingle();

  if (!existing) return { ok: false, error: "Appointment not found" };
  if (existing.status === "cancelled" || existing.status === "completed") {
    return { ok: false, error: "This appointment cannot be rescheduled" };
  }

  const owns =
    existing.patient_id === user.id ||
    (profile?.phone && String(existing.phone) === String(profile.phone));
  if (!owns) {
    return { ok: false, error: "Not authorized to reschedule this appointment" };
  }

  // Conflict + leave checks
  const { data: conflict } = await supabase
    .from("appointments")
    .select("id")
    .eq("doctor_id", existing.doctor_id)
    .eq("date", date)
    .eq("time_slot", timeSlot)
    .neq("id", id)
    .not("status", "in", '("cancelled","no_show")')
    .maybeSingle();
  if (conflict) {
    return { ok: false, error: "That slot is already booked" };
  }

  if (String(existing.doctor_id).length === 36) {
    const { data: leave } = await supabase
      .from("doctor_availability")
      .select("status")
      .eq("doctor_id", existing.doctor_id)
      .eq("date", date)
      .maybeSingle();
    if (
      leave &&
      (leave.status === "on_leave" ||
        leave.status === "holiday" ||
        leave.status === "emergency")
    ) {
      return {
        ok: false,
        error: `Doctor unavailable (${leave.status}) on this date`,
      };
    }
  }

  const hour = parseInt(timeSlot, 10);
  const isPm = /PM/i.test(timeSlot);
  const hour24 =
    isPm && hour !== 12 ? hour + 12 : !isPm && hour === 12 ? 0 : hour;
  const period =
    hour24 < 12 ? "morning" : hour24 < 17 ? "afternoon" : "evening";

  const { error } = await supabase
    .from("appointments")
    .update({
      date,
      time_slot: timeSlot,
      period,
      status: "confirmed",
    })
    .eq("id", id);

  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "That slot is already booked" };
    }
    return { ok: false, error: error.message };
  }
  return { ok: true };
}

export async function getPatientReports(): Promise<PatientReport[]> {
  const dash = await getPatientDashboard();
  return dash.reports;
}

export async function getPatientDocuments(): Promise<PatientDocument[]> {
  if (!isSupabaseBackendEnabled()) {
    ensureDemoAllowed("patient documents listing");
    return [];
  }
  const supabase = createClientOrNull();
  if (!supabase) {
    ensureDemoAllowed("patient documents listing");
    return [];
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: patient } = await supabase
    .from("patients")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();
  if (!patient) return [];

  const { data, error } = await supabase
    .from("patient_documents")
    .select("*")
    .eq("patient_id", patient.id)
    .order("uploaded_at", { ascending: false });

  if (error) {
    if (/schema cache|does not exist/i.test(error.message)) return [];
    return [];
  }

  return (data || []).map((d: Record<string, unknown>) => ({
    id: String(d.id),
    patient_id: String(d.patient_id),
    type: String(d.type),
    title: String(d.title),
    file_url: String(d.file_url),
    file_name: String(d.file_name || ""),
    mime_type: String(d.mime_type || ""),
    uploaded_at: String(d.uploaded_at),
  }));
}

export async function getPatientNotifications(): Promise<
  PatientNotification[]
> {
  const dash = await getPatientDashboard();
  return dash.notifications;
}

export async function updatePatientProfile(
  patch: Partial<{
    first_name: string;
    last_name: string;
    phone: string;
    email: string;
    gender: string | null;
    date_of_birth: string | null;
    blood_group: string | null;
    address: string;
    emergency_contact: string | null;
    insurance_provider: string | null;
    insurance_number: string | null;
    profile_photo: string;
  }>
): Promise<{ ok: boolean; error?: string; patient?: PortalPatient }> {
  if (!isSupabaseBackendEnabled()) {
    return {
      ok: false,
      error: "Profile editing requires Supabase patient login",
    };
  }
  const supabase = createClientOrNull();
  if (!supabase) {
    return { ok: false, error: "Supabase not configured" };
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { ok: false, error: "Not signed in" };

  const { data, error } = await supabase
    .from("patients")
    .update(patch)
    .eq("user_id", user.id)
    .select("*")
    .single();

  if (error) return { ok: false, error: error.message };
  return { ok: true, patient: mapPatient(data as Record<string, unknown>) };
}

export async function markNotificationRead(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClientOrNull();
  if (!supabase) return { ok: false, error: "Not available in demo mode" };
  const { error } = await supabase
    .from("patient_notifications")
    .update({ is_read: true })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

export async function deleteNotification(
  id: string
): Promise<{ ok: boolean; error?: string }> {
  const supabase = createClientOrNull();
  if (!supabase) return { ok: false, error: "Not available in demo mode" };
  const { error } = await supabase
    .from("patient_notifications")
    .delete()
    .eq("id", id);
  if (error) return { ok: false, error: error.message };
  return { ok: true };
}

/** Google Calendar URL for an appointment */
export function googleCalendarUrl(a: Appointment): string {
  const start = parseLocalDateTime(a.date, a.timeSlot);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
  const params = new URLSearchParams({
    action: "TEMPLATE",
    text: `Appointment with ${a.doctorName}`,
    dates: `${fmt(start)}/${fmt(end)}`,
    details: `${a.problem}\nRef: ${a.bookingRef || a.id}`,
    location:
      process.env.NEXT_PUBLIC_HOSPITAL_ADDRESS ||
      process.env.NEXT_PUBLIC_HOSPITAL_NAME ||
      "Hospital",
  });
  return `https://calendar.google.com/calendar/render?${params.toString()}`;
}

/** Outlook web calendar deep link */
export function outlookCalendarUrl(a: Appointment): string {
  const start = parseLocalDateTime(a.date, a.timeSlot);
  const end = new Date(start.getTime() + 30 * 60 * 1000);
  const params = new URLSearchParams({
    path: "/calendar/action/compose",
    rru: "addevent",
    subject: `Appointment with ${a.doctorName}`,
    body: `${a.problem}\nRef: ${a.bookingRef || a.id}`,
    startdt: start.toISOString(),
    enddt: end.toISOString(),
    location:
      process.env.NEXT_PUBLIC_HOSPITAL_ADDRESS ||
      process.env.NEXT_PUBLIC_HOSPITAL_NAME ||
      "Hospital",
  });
  return `https://outlook.live.com/calendar/0/deeplink/compose?${params.toString()}`;
}

function parseLocalDateTime(date: string, timeSlot: string): Date {
  const m = timeSlot.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  let h = 9;
  let min = 0;
  if (m) {
    h = parseInt(m[1], 10);
    min = parseInt(m[2], 10);
    const ap = (m[3] || "").toUpperCase();
    if (ap === "PM" && h !== 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
  }
  const d = new Date(`${date}T00:00:00`);
  d.setHours(h, min, 0, 0);
  return d;
}

export function confirmationText(a: Appointment): string {
  return [
    `${process.env.NEXT_PUBLIC_HOSPITAL_NAME || "Hospital"} — Appointment Confirmation`,
    "",
    `Patient: ${a.patientName}`,
    `Phone: ${a.phone}`,
    `Doctor: ${a.doctorName}`,
    a.departmentName ? `Department: ${a.departmentName}` : "",
    `Date: ${a.date}`,
    `Time: ${a.timeSlot}`,
    `Type: ${a.type}`,
    `Status: ${a.status}`,
    a.bookingRef ? `Reference: ${a.bookingRef}` : `ID: ${a.id}`,
    "",
    `Reason: ${a.problem}`,
    "",
    "Please arrive 10–15 minutes early.",
  ]
    .filter(Boolean)
    .join("\n");
}
