/**
 * Reception walk-in + queue validation.
 */

import { z } from "zod";

export const walkInSchema = z.object({
  full_name: z.string().min(2).max(120),
  phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Valid 10-digit Indian mobile required"),
  age: z.coerce.number().min(0).max(120).optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  doctor_id: z.string().min(1),
  doctor_name: z.string().min(1).max(160).optional(),
  department_id: z.string().uuid().optional().nullable(),
  department_name: z.string().max(160).optional().nullable(),
  problem: z.string().min(2).max(500).default("Walk-in consultation"),
  email: z.string().email().optional().nullable().or(z.literal("")),
  type: z.enum(["in-person", "video"]).optional().default("in-person"),
  /** Optional preferred slot; default Walk-in / now window */
  time_slot: z.string().max(40).optional(),
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional(),
});

export type WalkInInput = z.infer<typeof walkInSchema>;
