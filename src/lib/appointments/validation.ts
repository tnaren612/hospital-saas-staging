/**
 * Shared appointment domain validation (admin + public).
 */

import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";

export const APPOINTMENT_STATUSES = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "upcoming",
  "no_show",
  "checked_in",
] as const;

export type AppointmentStatusValue = (typeof APPOINTMENT_STATUSES)[number];

export const adminAppointmentPatchSchema = z
  .object({
    status: z.enum(APPOINTMENT_STATUSES).optional(),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/)
      .optional(),
    timeSlot: z.string().min(1).max(40).optional(),
    notes: z.string().max(1000).optional(),
    cancel_reason: z.string().max(500).optional(),
    /** Reception check-in */
    check_in: z.boolean().optional(),
  })
  .refine(
    (v) =>
      v.status ||
      v.date ||
      v.timeSlot ||
      v.notes !== undefined ||
      v.check_in !== undefined,
    { message: "No changes provided" }
  );

export function resolvePeriod(
  timeSlot: string
): "morning" | "afternoon" | "evening" {
  const hour = parseInt(timeSlot, 10);
  const isPm = /PM/i.test(timeSlot);
  const hour24 =
    isPm && hour !== 12 ? hour + 12 : !isPm && hour === 12 ? 0 : hour;
  if (hour24 < 12) return "morning";
  if (hour24 < 17) return "afternoon";
  return "evening";
}

/**
 * Next queue token for a calendar day (hospital-wide).
 * Falls back to 1 if query fails or column missing.
 */
export async function nextQueueToken(
  supabase: Pick<SupabaseClient, "from">,
  date: string
): Promise<number> {
  try {
    const { data, error } = await supabase
      .from("appointments")
      .select("queue_token")
      .eq("date", date)
      .not("queue_token", "is", null)
      .order("queue_token", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error || !data?.queue_token) return 1;
    return Number(data.queue_token) + 1;
  } catch {
    return 1;
  }
}

/** Terminal statuses that free the slot */
export function isSlotFreeingStatus(status: string): boolean {
  return status === "cancelled" || status === "no_show";
}
