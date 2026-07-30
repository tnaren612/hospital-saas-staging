/**
 * Shared validation for hospital patient registry (admin CRM).
 */

import { z } from "zod";

const indianPhone = z
  .string()
  .regex(/^[6-9]\d{9}$/, "Valid 10-digit Indian mobile required");

export const patientCreateSchema = z.object({
  full_name: z.string().min(2).max(120),
  phone: indianPhone,
  email: z.string().email().optional().nullable().or(z.literal("")),
  age: z.coerce.number().min(0).max(120).optional().nullable(),
  gender: z.enum(["male", "female", "other"]).optional().nullable(),
  address: z.string().max(500).optional(),
  medical_history: z.string().max(5000).optional(),
  allergies: z.string().max(2000).optional(),
  blood_group: z
    .string()
    .max(10)
    .optional()
    .nullable()
    .or(z.literal("")),
  emergency_contact: z.string().max(120).optional().nullable(),
  emergency_contact_name: z.string().max(120).optional().nullable(),
  emergency_contact_phone: z
    .string()
    .regex(/^[6-9]\d{9}$/)
    .optional()
    .nullable()
    .or(z.literal("")),
  notes: z.string().max(2000).optional(),
  status: z.enum(["active", "inactive"]).optional(),
});

export const patientUpdateSchema = patientCreateSchema.partial();

export type PatientCreateInput = z.infer<typeof patientCreateSchema>;

/** Roles that may create/update/delete patient registry records */
export const PATIENT_WRITE_ROLES = [
  "super_admin",
  "admin",
  "receptionist",
  "manager",
  "doctor",
  "hr",
] as const;

export function toPatientRow(d: PatientCreateInput) {
  const email =
    d.email === "" || d.email === undefined ? null : d.email || null;
  const emergencyPhone =
    d.emergency_contact_phone === "" || d.emergency_contact_phone === undefined
      ? null
      : d.emergency_contact_phone || null;

  // Keep legacy emergency_contact string in sync when structured fields set
  let emergency_contact = d.emergency_contact || null;
  if (d.emergency_contact_name || emergencyPhone) {
    emergency_contact = [d.emergency_contact_name, emergencyPhone]
      .filter(Boolean)
      .join(" · ");
  }

  return {
    full_name: d.full_name.trim(),
    phone: d.phone.trim(),
    email,
    age: d.age ?? null,
    gender: d.gender ?? null,
    address: d.address || "",
    medical_history: d.medical_history || "",
    allergies: d.allergies || "",
    blood_group: d.blood_group || null,
    emergency_contact,
    emergency_contact_name: d.emergency_contact_name || null,
    emergency_contact_phone: emergencyPhone,
    notes: d.notes || "",
    status: d.status || "active",
  };
}
