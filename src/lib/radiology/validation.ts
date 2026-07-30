import { z } from "zod";

export const modalitySchema = z.enum([
  "xray", "ct", "mri", "ultrasound", "mammography", "fluoroscopy", "other",
]);

export const radiologyOrderSchema = z.object({
  patient_id: z.string().uuid(),
  encounter_id: z.string().uuid().nullable().optional(),
  modality: modalitySchema,
  body_part: z.string().trim().min(2).max(120),
  clinical_indication: z.string().trim().min(3).max(2000),
  priority: z.enum(["routine", "urgent", "stat"]).default("routine"),
});

export const radiologyActionSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("schedule"),
    scheduled_at: z.string().datetime(),
  }),
  z.object({
    action: z.literal("set_status"),
    status: z.enum(["checked_in", "in_progress", "completed"]),
  }),
  z.object({
    action: z.literal("report"),
    findings: z.string().trim().min(3).max(20000),
    impression: z.string().trim().min(3).max(10000),
    recommendations: z.string().trim().max(10000).default(""),
    report_url: z.string().url().nullable().optional(),
  }),
  z.object({
    action: z.literal("cancel"),
    cancellation_reason: z.string().trim().min(3).max(1000),
  }),
  z.object({action:z.literal("attachment"),attachment_type:z.enum(["image","dicom","report","consent","other"]),file_name:z.string().trim().min(1).max(255),file_url:z.string().url().max(2000),mime_type:z.string().trim().max(100).default("application/octet-stream")}),
  z.object({action:z.literal("remove_attachment"),attachment_id:z.string().uuid()}),
]);
