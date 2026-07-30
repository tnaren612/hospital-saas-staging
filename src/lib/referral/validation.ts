import { z } from "zod";

export const referralCreateSchema = z.object({
  patient_id: z.string().uuid(),
  discharge_id: z.string().uuid().nullable().optional(),
  referral_type: z.enum(["internal", "external"]),
  referred_to: z.string().trim().min(2).max(200),
  referred_department_id: z.string().uuid().nullable().optional(),
  referred_clinician_id: z.string().uuid().nullable().optional(),
  specialty: z.string().trim().max(200).default(""),
  facility_name: z.string().trim().max(300).default(""),
  reason: z.string().trim().min(3).max(3000),
  clinical_notes: z.string().trim().max(5000).default(""),
  urgency: z.enum(["routine", "urgent", "emergency"]).default("routine"),
  appointment_date: z.string().datetime().nullable().optional(),
});

export const referralActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("status"),
    status: z.enum(["sent", "accepted", "scheduled", "completed", "declined", "cancelled"]),
    notes: z.string().trim().max(5000).default(""),
    appointment_date: z.string().datetime().nullable().optional(),
  }),
  z.object({
    action: z.literal("attachment"),
    file_name: z.string().trim().min(1).max(255),
    file_url: z.string().url().max(2000),
    mime_type: z.string().trim().max(100).default("application/octet-stream"),
  }),
]);

