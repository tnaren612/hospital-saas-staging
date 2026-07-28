/**
 * Patient notification preferences — never send disabled channels.
 */

import type { NotificationChannel, NotificationPreferences } from "@/lib/notifications/core/types";

export const DEFAULT_PREFERENCES: NotificationPreferences = {
  email: true,
  whatsapp: true,
  sms: false, // SMS often paid — off by default
  all: false,
};

export function isChannelAllowed(
  prefs: NotificationPreferences | null | undefined,
  channel: NotificationChannel
): boolean {
  if (channel === "in_app") return true;
  const p = prefs || DEFAULT_PREFERENCES;
  if (p.all) return true;
  if (channel === "email") return p.email !== false;
  if (channel === "whatsapp") return p.whatsapp !== false;
  if (channel === "sms") return Boolean(p.sms);
  return false;
}

export function normalizePreferences(
  input: Partial<NotificationPreferences> | null | undefined
): NotificationPreferences {
  if (!input) return { ...DEFAULT_PREFERENCES };
  if (input.all) {
    return {
      patient_id: input.patient_id,
      all: true,
      email: true,
      whatsapp: true,
      sms: true,
    };
  }
  return {
    patient_id: input.patient_id,
    all: false,
    email: input.email !== false,
    whatsapp: input.whatsapp !== false,
    sms: Boolean(input.sms),
  };
}
