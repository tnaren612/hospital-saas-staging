import { z } from "zod";
export const admissionSchema = z.object({
  patient_id:z.string().uuid(), bed_id:z.string().uuid(),
  encounter_id:z.string().uuid().nullable().optional(),
  admission_type:z.enum(["planned","emergency","transfer"]).default("planned"),
  reason:z.string().trim().min(2).max(2000),
  provisional_diagnosis:z.string().max(2000).default(""),
  care_notes:z.string().max(10000).default(""),
  expected_discharge_date:z.string().date().nullable().optional(),
});
export const ipdActionSchema = z.discriminatedUnion("action",[
  z.object({action:z.literal("transfer"),bed_id:z.string().uuid()}),
  z.object({action:z.literal("plan_discharge"),expected_discharge_date:z.string().date()}),
  z.object({action:z.literal("discharge"),discharge_summary:z.string().min(5).max(10000),discharge_instructions:z.string().min(2).max(10000),follow_up_date:z.string().date().nullable().optional()}),
  z.object({action:z.literal("update_notes"),care_notes:z.string().max(10000)}),
]);
export const wardSchema=z.object({name:z.string().trim().min(2).max(120),code:z.string().trim().min(1).max(30),ward_type:z.enum(["general","private","semi_private","icu","nicu","emergency","other"]).default("general"),floor:z.string().trim().max(50).default("")});
export const bedSchema=z.object({ward_id:z.string().uuid(),bed_number:z.string().trim().min(1).max(40),bed_type:z.string().trim().max(80).default("standard"),daily_rate:z.number().nonnegative().default(0)});
