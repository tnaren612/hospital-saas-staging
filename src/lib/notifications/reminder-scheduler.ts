/**
 * Appointment reminder scheduler support.
 * Designed for cron / Vercel cron hitting /api/notifications/reminders.
 *
 * Windows: 24h, 2h, 30m before appointment start.
 */

import type { ReminderWindow } from "@/lib/notifications/core/types";
import { getNotificationService } from "@/lib/notifications/notification-service";

export type ReminderCandidate = {
  appointmentId: string;
  patientId?: string;
  patientName: string;
  patientEmail?: string;
  patientPhone?: string;
  doctorName: string;
  /** ISO date YYYY-MM-DD */
  date: string;
  /** e.g. 10:00 AM or 10:00 */
  timeSlot: string;
  type?: string;
  hospitalName?: string;
};

/** Parse loose time like "10:00 AM" into hours/minutes. */
export function parseTimeSlot(timeSlot: string): { h: number; m: number } | null {
  const t = timeSlot.trim();
  const m12 = t.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (m12) {
    let h = Number(m12[1]);
    const m = Number(m12[2]);
    const ap = m12[3].toUpperCase();
    if (ap === "PM" && h < 12) h += 12;
    if (ap === "AM" && h === 12) h = 0;
    return { h, m };
  }
  const m24 = t.match(/^(\d{1,2}):(\d{2})$/);
  if (m24) return { h: Number(m24[1]), m: Number(m24[2]) };
  return null;
}

export function appointmentStartMs(date: string, timeSlot: string): number | null {
  const tm = parseTimeSlot(timeSlot);
  if (!tm) return null;
  const d = new Date(`${date}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  d.setHours(tm.h, tm.m, 0, 0);
  return d.getTime();
}

/**
 * Which reminder windows apply for an appointment at `now`.
 * Fires when within ±15 minutes of the target offset.
 */
export function matchingReminderWindows(
  date: string,
  timeSlot: string,
  now = Date.now()
): ReminderWindow[] {
  const start = appointmentStartMs(date, timeSlot);
  if (start == null) return [];
  const deltas: { w: ReminderWindow; ms: number }[] = [
    { w: "24h", ms: 24 * 60 * 60 * 1000 },
    { w: "2h", ms: 2 * 60 * 60 * 1000 },
    { w: "30m", ms: 30 * 60 * 1000 },
  ];
  const tolerance = 15 * 60 * 1000;
  const out: ReminderWindow[] = [];
  for (const { w, ms } of deltas) {
    const target = start - ms;
    if (Math.abs(now - target) <= tolerance) out.push(w);
  }
  return out;
}

export async function dispatchReminders(
  candidates: ReminderCandidate[],
  now = Date.now()
): Promise<{
  evaluated: number;
  sent: number;
  results: { appointmentId: string; window: ReminderWindow; ok: boolean }[];
}> {
  const svc = getNotificationService();
  let sent = 0;
  const results: {
    appointmentId: string;
    window: ReminderWindow;
    ok: boolean;
  }[] = [];

  for (const c of candidates) {
    const windows = matchingReminderWindows(c.date, c.timeSlot, now);
    for (const w of windows) {
      const r = await svc.sendAppointmentReminder({
        window: w,
        patientName: c.patientName,
        doctorName: c.doctorName,
        date: c.date,
        timeSlot: c.timeSlot,
        type: c.type,
        email: c.patientEmail,
        phone: c.patientPhone,
        patientId: c.patientId,
        appointmentId: c.appointmentId,
        hospitalName: c.hospitalName,
      });
      const ok = r.some((x) => x.ok && x.status !== "skipped");
      if (ok) sent++;
      results.push({ appointmentId: c.appointmentId, window: w, ok });
    }
  }

  return { evaluated: candidates.length, sent, results };
}
