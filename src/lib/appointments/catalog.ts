/**
 * Public appointment catalog — departments & doctors for booking UI.
 * Reads HMS tables when Supabase is configured; falls back to doctor.json + slots.json.
 */

import { createClientOrNull } from "@/lib/supabase/client";
import { isSupabaseBackendEnabled } from "@/lib/supabase/env";
import { getDoctor, getSlots } from "@/lib/data";
import type { TimePeriod } from "@/types";

export type BookingDepartment = {
  id: string;
  name: string;
  slug: string;
  description: string;
};

export type BookingDoctor = {
  id: string;
  name: string;
  title: string;
  department_id: string | null;
  department_name?: string | null;
  photo_url: string | null;
  specializations: string[];
  available_days: string[];
  time_slots: string[];
  consultation_fee: number;
  status: string;
};

export type DayAvailability = {
  available: boolean;
  status: "available" | "on_leave" | "holiday" | "emergency" | "unknown";
  note: string;
};

const FALLBACK_DAYS = ["mon", "tue", "wed", "thu", "fri", "sat"];

/** Short in-memory catalog cache (60s) to cut repeat public form loads. */
const CACHE_TTL_MS = 60_000;
let deptCache: { at: number; data: BookingDepartment[] } | null = null;
const doctorCache = new Map<
  string,
  { at: number; data: BookingDoctor[] }
>();

function periodOf(time: string): TimePeriod {
  const hour = parseInt(time, 10);
  const isPm = /PM/i.test(time);
  const hour24 =
    isPm && hour !== 12 ? hour + 12 : !isPm && hour === 12 ? 0 : hour;
  if (hour24 < 12) return "morning";
  if (hour24 < 17) return "afternoon";
  return "evening";
}

export function groupSlotsByPeriod(
  times: string[]
): Record<TimePeriod, string[]> {
  const out: Record<TimePeriod, string[]> = {
    morning: [],
    afternoon: [],
    evening: [],
  };
  for (const t of times) {
    out[periodOf(t)].push(t);
  }
  return out;
}

function weekdayKey(dateStr: string): string {
  const d = new Date(`${dateStr}T12:00:00`);
  const map = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  return map[d.getDay()] || "mon";
}

function fallbackDepartments(): BookingDepartment[] {
  return [
    {
      id: "dept-pulmonology",
      name: "Pulmonology",
      slug: "pulmonology",
      description: "Lung and respiratory care",
    },
    {
      id: "dept-critical-care",
      name: "Critical Care",
      slug: "critical-care",
      description: "ICU and critical care",
    },
    {
      id: "dept-general",
      name: "General Medicine",
      slug: "general-medicine",
      description: "General medical consultation",
    },
    {
      id: "dept-emergency",
      name: "Emergency",
      slug: "emergency",
      description: "24×7 emergency care",
    },
  ];
}

function fallbackDoctors(): BookingDoctor[] {
  const d = getDoctor();
  const slots = getSlots();
  const time_slots = [
    ...slots.morning,
    ...slots.afternoon,
    ...slots.evening,
  ];
  return [
    {
      id: d.id,
      name: d.name,
      title: d.title,
      department_id: "dept-pulmonology",
      department_name: "Pulmonology",
      photo_url: d.image || null,
      specializations: d.specializations || [],
      available_days: FALLBACK_DAYS,
      time_slots,
      consultation_fee: d.consultationFee || 500,
      status: "active",
    },
  ];
}

/**
 * Fast path: one cached API call returns departments + doctors (server parallel).
 * Falls back to direct Supabase / JSON if API fails.
 */
export async function getBookingCatalog(departmentId?: string | null): Promise<{
  departments: BookingDepartment[];
  doctors: BookingDoctor[];
}> {
  const depKey = departmentId || "";
  if (deptCache && Date.now() - deptCache.at < CACHE_TTL_MS && !depKey) {
    const hit = doctorCache.get("__all__");
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) {
      return { departments: deptCache.data, doctors: hit.data };
    }
  }

  try {
    const qs = depKey ? `?departmentId=${encodeURIComponent(depKey)}` : "";
    const res = await fetch(`/api/appointments/catalog${qs}`, {
      // Allow browser HTTP cache (API sets Cache-Control)
      next: { revalidate: 60 },
    } as RequestInit);
    if (res.ok) {
      const json = (await res.json()) as {
        departments?: BookingDepartment[];
        doctors?: BookingDoctor[];
      };
      const departments = json.departments?.length
        ? json.departments
        : fallbackDepartments();
      const doctors = json.doctors?.length ? json.doctors : fallbackDoctors();
      deptCache = { at: Date.now(), data: departments };
      doctorCache.set(depKey || "__all__", { at: Date.now(), data: doctors });
      return { departments, doctors };
    }
  } catch {
    /* fall through */
  }

  // Fallback: parallel direct client reads
  const [departments, doctors] = await Promise.all([
    getBookingDepartmentsDirect(),
    getBookingDoctorsDirect(departmentId),
  ]);
  return { departments, doctors };
}

export async function getBookingDepartments(): Promise<BookingDepartment[]> {
  const { departments } = await getBookingCatalog();
  return departments;
}

async function getBookingDepartmentsDirect(): Promise<BookingDepartment[]> {
  if (deptCache && Date.now() - deptCache.at < CACHE_TTL_MS) {
    return deptCache.data;
  }

  if (!isSupabaseBackendEnabled()) {
    const fb = fallbackDepartments();
    deptCache = { at: Date.now(), data: fb };
    return fb;
  }
  const supabase = createClientOrNull();
  if (!supabase) {
    const fb = fallbackDepartments();
    deptCache = { at: Date.now(), data: fb };
    return fb;
  }

  const { data, error } = await supabase
    .from("departments")
    .select("id, name, slug, description")
    .eq("status", "active")
    .order("name");

  if (error || !data?.length) {
    console.warn("[catalog] departments:", error?.message);
    return fallbackDepartments();
  }

  const rows = data.map((r: Record<string, unknown>) => ({
    id: String(r.id),
    name: String(r.name),
    slug: String(r.slug),
    description: String(r.description || ""),
  }));
  deptCache = { at: Date.now(), data: rows };
  return rows;
}

export async function getBookingDoctors(
  departmentId?: string | null
): Promise<BookingDoctor[]> {
  const { doctors } = await getBookingCatalog(departmentId);
  return doctors;
}

async function getBookingDoctorsDirect(
  departmentId?: string | null
): Promise<BookingDoctor[]> {
  const cacheKey = departmentId || "__all__";
  const hit = doctorCache.get(cacheKey);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.data;

  if (!isSupabaseBackendEnabled()) {
    const all = fallbackDoctors();
    const rows = !departmentId
      ? all
      : all.filter((d) => d.department_id === departmentId);
    doctorCache.set(cacheKey, { at: Date.now(), data: rows });
    return rows;
  }

  const supabase = createClientOrNull();
  if (!supabase) {
    const all = fallbackDoctors();
    const rows = !departmentId
      ? all
      : all.filter((d) => d.department_id === departmentId);
    doctorCache.set(cacheKey, { at: Date.now(), data: rows });
    return rows;
  }

  let query = supabase
    .from("hospital_doctors")
    .select(
      "id, name, title, department_id, photo_url, specializations, available_days, time_slots, consultation_fee, status, departments(name)"
    )
    .eq("status", "active")
    .order("sort_order")
    .order("name");

  if (departmentId && departmentId.length > 10) {
    query = query.eq("department_id", departmentId);
  }

  const { data, error } = await query;

  if (error || !data?.length) {
    console.warn("[catalog] doctors:", error?.message);
    const all = fallbackDoctors();
    return !departmentId
      ? all
      : all.filter((d) => d.department_id === departmentId);
  }

  const rows = data.map((r: Record<string, unknown>) => {
    const dept = r.departments as { name?: string } | null;
    return {
      id: String(r.id),
      name: String(r.name),
      title: String(r.title || "Consultant"),
      department_id: r.department_id ? String(r.department_id) : null,
      department_name: dept?.name || null,
      photo_url: r.photo_url ? String(r.photo_url) : null,
      specializations: Array.isArray(r.specializations)
        ? (r.specializations as string[])
        : [],
      available_days: Array.isArray(r.available_days)
        ? (r.available_days as string[])
        : FALLBACK_DAYS,
      time_slots: Array.isArray(r.time_slots)
        ? (r.time_slots as string[])
        : fallbackDoctors()[0].time_slots,
      consultation_fee: Number(r.consultation_fee) || 0,
      status: String(r.status || "active"),
    };
  });
  doctorCache.set(cacheKey, { at: Date.now(), data: rows });
  return rows;
}

/** Check leave / holiday — prefer slots API (bundled with booked times). */
export async function getDayAvailability(
  doctorId: string,
  date: string
): Promise<DayAvailability> {
  if (!isSupabaseBackendEnabled() || doctorId.length !== 36) {
    return { available: true, status: "available", note: "" };
  }

  try {
    const qs = new URLSearchParams({ date, doctorId });
    const res = await fetch(`/api/appointments/slots?${qs}`);
    if (res.ok) {
      const json = (await res.json()) as {
        dayAvailable?: boolean;
        dayStatus?: string;
        dayNote?: string;
      };
      return {
        available: json.dayAvailable !== false,
        status: (json.dayStatus as DayAvailability["status"]) || "available",
        note: json.dayNote || "",
      };
    }
  } catch {
    /* fall through */
  }

  const supabase = createClientOrNull();
  if (!supabase) return { available: true, status: "available", note: "" };

  const { data, error } = await supabase
    .from("doctor_availability")
    .select("status, note")
    .eq("doctor_id", doctorId)
    .eq("date", date)
    .maybeSingle();

  if (error) {
    console.warn("[catalog] availability:", error.message);
    return { available: true, status: "unknown", note: "" };
  }

  if (!data) return { available: true, status: "available", note: "" };

  const status = String(data.status) as DayAvailability["status"];
  const blocked =
    status === "on_leave" || status === "holiday" || status === "emergency";

  return {
    available: !blocked,
    status,
    note: String(data.note || ""),
  };
}

export function doctorWorksOnDate(
  doctor: BookingDoctor,
  date: string
): boolean {
  const day = weekdayKey(date);
  const days = doctor.available_days?.length
    ? doctor.available_days.map((d) => d.toLowerCase())
    : FALLBACK_DAYS;
  return days.includes(day);
}
