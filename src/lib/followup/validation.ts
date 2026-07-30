import {z} from "zod";
export const followupCreateSchema=z.object({
 patient_id:z.string().uuid(),discharge_id:z.string().uuid().nullable().optional(),
 follow_up_at:z.string().datetime(),department:z.string().trim().max(200).default(""),
 clinician_id:z.string().uuid().nullable().optional(),purpose:z.string().trim().min(3).max(2000),
 instructions:z.string().trim().max(5000).default(""),
 recurrence:z.enum(["none","weekly","fortnightly","monthly","quarterly"]).default("none"),
 recurrence_end:z.string().date().nullable().optional(),
 reminder_at:z.string().datetime().nullable().optional()
});
export const followupActionSchema=z.discriminatedUnion("action",[
 z.object({action:z.literal("status"),status:z.enum(["confirmed","missed","cancelled"]),notes:z.string().max(2000).default("")}),
 z.object({action:z.literal("complete"),visit_notes:z.string().trim().min(3).max(10000),clinical_review:z.string().trim().min(3).max(10000),outcome:z.string().trim().min(2).max(5000)}),
 z.object({action:z.literal("remind")}),
]);

