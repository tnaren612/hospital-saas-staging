/**
 * Browser localStorage helpers.
 * Designed so a future backend API can replace these methods without UI changes.
 */

import type {
  Appointment,
  DoctorProfile,
  Patient,
} from "@/types";

const KEYS = {
  appointments: "ssh_appointments",
  patient: "ssh_patient",
  doctor: "ssh_doctor",
  theme: "ssh_theme",
  locale: "ssh_locale",
  bookedSlots: "ssh_booked_slots",
  adminAuth: "ssh_admin_auth",
} as const;

function isBrowser(): boolean {
  return typeof window !== "undefined";
}

function read<T>(key: string, fallback: T): T {
  if (!isBrowser()) return fallback;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function write<T>(key: string, value: T): void {
  if (!isBrowser()) return;
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // quota or private mode
  }
}

// Appointments
export function getAppointments(): Appointment[] {
  return read<Appointment[]>(KEYS.appointments, []);
}

export function saveAppointments(items: Appointment[]): void {
  write(KEYS.appointments, items);
}

export function addAppointment(item: Appointment): Appointment {
  const all = getAppointments();
  all.unshift(item);
  saveAppointments(all);
  // Mark slot booked
  const booked = getBookedSlots();
  const key = `${item.date}|${item.timeSlot}`;
  if (!booked.includes(key)) {
    booked.push(key);
    write(KEYS.bookedSlots, booked);
  }
  return item;
}

export function updateAppointment(
  id: string,
  patch: Partial<Appointment>
): Appointment | null {
  const all = getAppointments();
  const idx = all.findIndex((a) => a.id === id);
  if (idx < 0) return null;
  all[idx] = { ...all[idx], ...patch };
  saveAppointments(all);
  return all[idx];
}

export function getBookedSlots(): string[] {
  return read<string[]>(KEYS.bookedSlots, []);
}

export function isSlotBooked(date: string, time: string): boolean {
  return getBookedSlots().includes(`${date}|${time}`);
}

// Patient session
export function getPatient(): Patient | null {
  return read<Patient | null>(KEYS.patient, null);
}

export function setPatient(patient: Patient | null): void {
  if (patient) write(KEYS.patient, patient);
  else if (isBrowser()) localStorage.removeItem(KEYS.patient);
}

// CMS: Doctor
export function getStoredDoctor(): DoctorProfile | null {
  return read<DoctorProfile | null>(KEYS.doctor, null);
}

export function saveDoctor(doctor: DoctorProfile): void {
  write(KEYS.doctor, doctor);
}

// Locale & theme
export function getStoredLocale(): "en" | "te" {
  return read<"en" | "te">(KEYS.locale, "en");
}

export function setStoredLocale(locale: "en" | "te"): void {
  write(KEYS.locale, locale);
}

// Admin demo auth
export function isAdminAuthenticated(): boolean {
  return read(KEYS.adminAuth, false);
}

export function setAdminAuthenticated(value: boolean): void {
  write(KEYS.adminAuth, value);
}

export { KEYS };
