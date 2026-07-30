/**
 * Insurance module domain types.
 */

export type ProviderType = "government" | "private" | "corporate" | "tpa";

export type InsuredRelationship = "self" | "spouse" | "child" | "parent" | "other";

export type CoverageType =
  | "individual"
  | "family"
  | "group"
  | "senior_citizen"
  | "maternity"
  | "critical_illness";

export type VerificationStatus = "pending" | "verified" | "expired" | "cancelled";

export type PreAuthStatus =
  | "draft"
  | "submitted"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "cancelled";

export type ClaimStatus =
  | "draft"
  | "submitted"
  | "in_process"
  | "approved"
  | "partially_approved"
  | "rejected"
  | "settled"
  | "cancelled";

export type DocumentType =
  | "prescription"
  | "discharge_summary"
  | "investigation_report"
  | "invoice"
  | "id_proof"
  | "policy_copy"
  | "other";

// ---------------------------------------------------------------------------
// Insurance Provider
// ---------------------------------------------------------------------------
export type InsuranceProvider = {
  id: string;
  hospital_id: string;
  provider_name: string;
  provider_code: string;
  provider_type: ProviderType;
  contact_person: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  address: string | null;
  registration_number: string | null;
  is_active: boolean;
  coverage_notes: string | null;
  created_at: string;
  updated_at: string;
};

// ---------------------------------------------------------------------------
// Patient Insurance (Policy)
// ---------------------------------------------------------------------------
export type PatientInsurance = {
  id: string;
  hospital_id: string;
  patient_id: string;
  provider_id: string;
  policy_number: string;
  group_number: string | null;
  insured_name: string;
  insured_relationship: InsuredRelationship;
  coverage_from: string;
  coverage_to: string;
  coverage_type: CoverageType;
  sum_insured: number | null;
  copay_percent: number;
  deductible_amount: number;
  is_active: boolean;
  verification_status: VerificationStatus;
  verified_at: string | null;
  verified_by: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  provider_name?: string;
  patient_name?: string;
};

// ---------------------------------------------------------------------------
// Pre-Authorization
// ---------------------------------------------------------------------------
export type PreAuthorization = {
  id: string;
  hospital_id: string;
  patient_id: string;
  patient_insurance_id: string;
  encounter_id: string | null;
  authorization_number: string | null;
  treatment_type: string;
  diagnosis_code: string | null;
  procedure_code: string | null;
  estimated_amount: number;
  approved_amount: number | null;
  status: PreAuthStatus;
  requested_by: string | null;
  approved_by: string | null;
  approved_at: string | null;
  rejection_reason: string | null;
  clinical_notes: string | null;
  valid_from: string | null;
  valid_to: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  patient_name?: string;
  policy_number?: string;
  provider_name?: string;
  encounter_type?: string;
};

// ---------------------------------------------------------------------------
// Insurance Claim
// ---------------------------------------------------------------------------
export type InsuranceClaim = {
  id: string;
  hospital_id: string;
  claim_number: string;
  patient_id: string;
  patient_insurance_id: string;
  pre_authorization_id: string | null;
  encounter_id: string | null;
  total_bill_amount: number;
  claim_amount: number;
  approved_amount: number | null;
  deductible_amount: number;
  copay_amount: number;
  settlement_amount: number | null;
  status: ClaimStatus;
  submitted_date: string | null;
  submitted_by: string | null;
  processed_date: string | null;
  settlement_date: string | null;
  settlement_ref: string | null;
  rejection_reason: string | null;
  notes: string | null;
  diagnosis_codes: string | null;
  procedure_codes: string | null;
  created_at: string;
  updated_at: string;
  // Joined fields
  patient_name?: string;
  patient_phone?: string;
  policy_number?: string;
  provider_name?: string;
  provider_id?: string;
  authorization_number?: string;
  encounter_type?: string;
  documents?: ClaimDocument[];
  status_history?: ClaimStatusHistory[];
};

// ---------------------------------------------------------------------------
// Claim Document
// ---------------------------------------------------------------------------
export type ClaimDocument = {
  id: string;
  hospital_id: string;
  claim_id: string;
  document_type: DocumentType;
  file_name: string;
  file_url: string;
  file_size: number | null;
  uploaded_by: string | null;
  notes: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Claim Status History
// ---------------------------------------------------------------------------
export type ClaimStatusHistory = {
  id: string;
  hospital_id: string;
  claim_id: string;
  from_status: string | null;
  to_status: string;
  changed_by: string | null;
  change_reason: string | null;
  notes: string | null;
  created_at: string;
};

// ---------------------------------------------------------------------------
// Dashboard / aggregate types
// ---------------------------------------------------------------------------
export type InsuranceDashboardStats = {
  total_providers: number;
  active_policies: number;
  pending_preauths: number;
  submitted_claims: number;
  approved_claims: number;
  settled_claims: number;
  rejected_claims: number;
  total_claim_amount: number;
  total_settled_amount: number;
  pending_approval_amount: number;
};

export type ClaimsReportRow = {
  id: string;
  claim_number: string;
  patient_name: string;
  provider_name: string;
  policy_number: string;
  claim_amount: number;
  approved_amount: number | null;
  settlement_amount: number | null;
  status: ClaimStatus;
  submitted_date: string | null;
  settlement_date: string | null;
  created_at: string;
};

export type ProviderSummary = {
  provider_id: string;
  provider_name: string;
  total_claims: number;
  total_claim_amount: number;
  total_approved_amount: number;
  total_settled_amount: number;
  pending_claims: number;
  approved_claims: number;
  rejected_claims: number;
};
