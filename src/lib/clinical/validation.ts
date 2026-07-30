import { z } from "zod";

export const observationSchema = z.object({
  temperature_c: z.number().min(25).max(45).optional(),
  pulse_bpm: z.number().int().min(20).max(250).optional(),
  respiratory_rate: z.number().int().min(5).max(80).optional(),
  systolic_bp: z.number().int().min(40).max(300).optional(),
  diastolic_bp: z.number().int().min(20).max(200).optional(),
  spo2_percent: z.number().min(40).max(100).optional(),
  weight_kg: z.number().min(0.2).max(500).optional(),
});

export const encounterCreateSchema = z.object({
  patient_id: z.string().uuid(),
  appointment_id: z.string().uuid().nullable().optional(),
  encounter_type: z.enum(["outpatient", "emergency", "telemedicine", "follow_up"]),
  chief_complaint: z.string().trim().min(2).max(2000),
  history: z.string().max(10000).default(""),
  examination: z.string().max(10000).default(""),
  assessment: z.string().max(10000).default(""),
  plan: z.string().max(10000).default(""),
  diagnoses: z.array(z.object({
    code: z.string().max(40).optional(),
    system: z.enum(["ICD-10", "SNOMED-CT", "local"]).default("local"),
    description: z.string().trim().min(2).max(500),
    primary: z.boolean().default(false),
  })).max(50).default([]),
  orders: z.array(z.object({
    type: z.enum(["laboratory", "radiology", "procedure", "medication", "other"]),
    code: z.string().max(80).optional(),
    name: z.string().trim().min(2).max(300),
    instructions: z.string().max(1000).optional(),
    priority: z.enum(["routine", "urgent", "stat"]).default("routine"),
  })).max(100).default([]),
  prescription_id: z.string().uuid().nullable().optional(),
  observations: observationSchema.default({}),
});

export const encounterPatchSchema = encounterCreateSchema.partial().extend({
  status: z.enum(["draft", "in_progress", "completed", "amended", "cancelled"]).optional(),
}).refine((value) => Object.keys(value).length > 0, "At least one field is required");
