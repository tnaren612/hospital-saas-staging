/**
 * Zod validation schemas for the Insurance module.
 */

import { z } from "zod";

// ---------------------------------------------------------------------------
// Insurance Provider
// ---------------------------------------------------------------------------
export const insuranceProviderCreateSchema = z.object({
  provider_name: z.string().min(2, "Provider name is required").max(200),
  provider_code: z
    .string()
    .min(1, "Provider code is required")
    .max(20)
    .transform((v) => v.toUpperCase().replace(/\s+/g, "_")),
  provider_type: z.enum(
    ["government", "private", "corporate", "tpa"],
    { errorMap: () => ({ message: "Invalid provider type" }) }
  ),
  contact_person: z.string().max(120).optional().nullable().or(z.literal("")),
  contact_email: z.string().email().optional().nullable().or(z.literal("")),
  contact_phone: z
    .string()
    .regex(/^[6-9]\d{9}$/, "Valid 10-digit Indian mobile required")
    .optional()
    .nullable()
    .or(z.literal("")),
  address: z.string().max(500).optional().nullable().or(z.literal("")),
  registration_number: z.string().max(100).optional().nullable().or(z.literal("")),
  is_active: z.boolean().optional(),
  coverage_notes: z.string().max(2000).optional().nullable().or(z.literal("")),
});

export const insuranceProviderUpdateSchema = insuranceProviderCreateSchema.partial();

// ---------------------------------------------------------------------------
// Patient Insurance (Policy Assignment)
// ---------------------------------------------------------------------------
export const patientInsuranceBaseSchema = z.object({
    patient_id: z.string().uuid("Valid patient required"),
    provider_id: z.string().uuid("Valid provider required"),
    policy_number: z.string().min(1, "Policy number is required").max(60),
    group_number: z.string().max(60).optional().nullable().or(z.literal("")),
    insured_name: z.string().min(1, "Insured name is required").max(200),
    insured_relationship: z.enum(
      ["self", "spouse", "child", "parent", "other"],
      { errorMap: () => ({ message: "Invalid relationship" }) }
    ),
    coverage_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Valid date required (YYYY-MM-DD)"),
    coverage_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Valid date required (YYYY-MM-DD)"),
    coverage_type: z.enum(
      ["individual", "family", "group", "senior_citizen", "maternity", "critical_illness"],
      { errorMap: () => ({ message: "Invalid coverage type" }) }
    ),
    sum_insured: z.coerce.number().min(0).optional().nullable(),
    copay_percent: z.coerce.number().min(0).max(100).optional().default(0),
    deductible_amount: z.coerce.number().min(0).optional().default(0),
    notes: z.string().max(2000).optional().nullable().or(z.literal("")),
  });

export const patientInsuranceCreateSchema = patientInsuranceBaseSchema.refine(
    (data) => {
      const from = new Date(data.coverage_from);
      const to = new Date(data.coverage_to);
      return to >= from;
    },
    { message: "Coverage end date must be on or after start date", path: ["coverage_to"] }
  );

export const patientInsuranceUpdateSchema = patientInsuranceBaseSchema.partial();

export const patientInsuranceVerifySchema = z.object({
  verification_status: z.enum(["verified", "cancelled", "expired"]),
  notes: z.string().max(2000).optional().nullable().or(z.literal("")),
});

// ---------------------------------------------------------------------------
// Pre-Authorization
// ---------------------------------------------------------------------------
export const preAuthorizationCreateSchema = z.object({
  patient_id: z.string().uuid("Valid patient required"),
  patient_insurance_id: z.string().uuid("Valid insurance policy required"),
  encounter_id: z.string().uuid().optional().nullable(),
  treatment_type: z.string().min(1, "Treatment type is required").max(500),
  diagnosis_code: z.string().max(50).optional().nullable().or(z.literal("")),
  procedure_code: z.string().max(50).optional().nullable().or(z.literal("")),
  estimated_amount: z.coerce.number().positive("Estimated amount must be greater than zero"),
  clinical_notes: z.string().max(5000).optional().nullable().or(z.literal("")),
  valid_from: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
  valid_to: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional().nullable().or(z.literal("")),
});

export const preAuthorizationApproveSchema = z.object({
  status: z.enum(["approved", "partially_approved", "rejected"]),
  approved_amount: z.coerce.number().min(0).optional().nullable(),
  rejection_reason: z.string().max(2000).optional().nullable().or(z.literal("")),
  clinical_notes: z.string().max(5000).optional().nullable().or(z.literal("")),
});

export const preAuthorizationUpdateSchema = preAuthorizationCreateSchema.partial();

// ---------------------------------------------------------------------------
// Insurance Claim
// ---------------------------------------------------------------------------
export const insuranceClaimCreateSchema = z.object({
  patient_id: z.string().uuid("Valid patient required"),
  patient_insurance_id: z.string().uuid("Valid insurance policy required"),
  pre_authorization_id: z.string().uuid().optional().nullable(),
  encounter_id: z.string().uuid().optional().nullable(),
  total_bill_amount: z.coerce.number().min(0, "Total bill amount is required"),
  claim_amount: z.coerce.number().positive("Claim amount must be greater than zero"),
  deductible_amount: z.coerce.number().min(0).optional().default(0),
  copay_amount: z.coerce.number().min(0).optional().default(0),
  notes: z.string().max(5000).optional().nullable().or(z.literal("")),
  diagnosis_codes: z.string().max(500).optional().nullable().or(z.literal("")),
  procedure_codes: z.string().max(500).optional().nullable().or(z.literal("")),
});

export const insuranceClaimUpdateSchema = insuranceClaimCreateSchema.partial();

export const insuranceClaimStatusSchema = z
  .object({
    status: z.enum(
      [
        "submitted",
        "in_process",
        "approved",
        "partially_approved",
        "rejected",
        "settled",
        "cancelled",
      ],
      { errorMap: () => ({ message: "Invalid claim status" }) }
    ),
    approved_amount: z.coerce.number().min(0).optional().nullable(),
    rejection_reason: z.string().max(2000).optional().nullable().or(z.literal("")),
    settlement_amount: z.coerce.number().min(0).optional().nullable(),
    settlement_ref: z.string().max(100).optional().nullable().or(z.literal("")),
    notes: z.string().max(5000).optional().nullable().or(z.literal("")),
  })
  .refine(
    (data) => {
      if (data.status === "settled") {
        return data.settlement_amount !== undefined && data.settlement_amount !== null;
      }
      return true;
    },
    { message: "Settlement amount is required for settlement", path: ["settlement_amount"] }
  );

// ---------------------------------------------------------------------------
// Claim Document
// ---------------------------------------------------------------------------
export const claimDocumentCreateSchema = z.object({
  claim_id: z.string().uuid("Valid claim required"),
  document_type: z.enum(
    ["prescription", "discharge_summary", "investigation_report", "invoice", "id_proof", "policy_copy", "other"],
    { errorMap: () => ({ message: "Invalid document type" }) }
  ),
  file_name: z.string().min(1, "File name is required").max(255),
  file_url: z.string().url("Valid file URL required"),
  file_size: z.coerce.number().int().positive().optional().nullable(),
  notes: z.string().max(1000).optional().nullable().or(z.literal("")),
});

// ---------------------------------------------------------------------------
// Validation helpers
// ---------------------------------------------------------------------------
export const VALID_CLAIM_TRANSITIONS: Record<string, string[]> = {
  draft: ["submitted", "cancelled"],
  submitted: ["in_process", "cancelled"],
  in_process: ["approved", "partially_approved", "rejected", "cancelled"],
  approved: ["settled", "cancelled"],
  partially_approved: ["settled", "cancelled"],
  rejected: ["submitted", "cancelled"],
  settled: [],
  cancelled: [],
};

export function isValidClaimTransition(
  from: string,
  to: string
): boolean {
  const allowed = VALID_CLAIM_TRANSITIONS[from];
  if (!allowed) return false;
  return allowed.includes(to);
}

// ---------------------------------------------------------------------------
// Roles allowed for insurance write operations
// ---------------------------------------------------------------------------
export const INSURANCE_WRITE_ROLES = [
  "super_admin",
  "admin",
  "billing",
  "finance",
  "manager",
] as const;
