import { z } from "zod";

export const dischargeCreateSchema = z.object({
  admission_id: z.string().uuid(),
  encounter_id: z.string().uuid().nullable().optional(),
  discharge_type: z.enum(["routine","against_medical_advice","transfer","death","absconded"]).default("routine"),
  primary_diagnosis: z.string().trim().min(2).max(2000),
});

export const dischargeSummarySchema = z.object({
  action: z.literal("update_summary"),
  secondary_diagnoses: z.array(z.string().trim().min(1).max(500)).max(50).default([]),
  procedures_performed: z.string().max(10000).default(""),
  hospital_course: z.string().max(20000).default(""),
  condition_at_discharge: z.string().trim().min(3).max(5000),
  discharge_summary: z.string().trim().min(5).max(30000),
  medication_instructions: z.string().max(10000).default(""),
  diet_instructions: z.string().max(5000).default(""),
  activity_instructions: z.string().max(5000).default(""),
  warning_signs: z.string().max(5000).default(""),
  emergency_instructions: z.string().max(5000).default(""),
  transport_required: z.boolean().default(false),
});

export const dischargeActionSchema = z.discriminatedUnion("action", [
  dischargeSummarySchema,
  z.object({ action:z.literal("refresh_clearances") }),
  z.object({ action:z.literal("clearance"), clearance_type:z.enum(["clinical","nursing","radiology","pharmacy","billing","insurance","inventory"]), status:z.enum(["approved","blocked","waived"]), notes:z.string().max(2000).default("") }),
  z.object({ action:z.literal("referral"), referred_to:z.string().min(2).max(200), specialty:z.string().max(200).default(""), facility_name:z.string().max(300).default(""), reason:z.string().min(3).max(3000), urgency:z.enum(["routine","urgent","emergency"]).default("routine"), appointment_date:z.string().datetime().nullable().optional() }),
  z.object({ action:z.literal("follow_up"), follow_up_at:z.string().datetime(), department:z.string().max(200).default(""), clinician_id:z.string().uuid().nullable().optional(), purpose:z.string().min(3).max(2000), instructions:z.string().max(5000).default("") }),
  z.object({ action:z.literal("medication"), prescription_id:z.string().uuid().nullable().optional(), medication_name:z.string().min(2).max(300), dosage:z.string().max(100), frequency:z.string().max(100), duration:z.string().max(100), instructions:z.string().max(1000).default("") }),
  z.object({ action:z.literal("finalize") }),
  z.object({ action:z.literal("cancel"), reason:z.string().min(3).max(1000) }),
]);
