import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  insuranceProviderCreateSchema,
  insuranceProviderUpdateSchema,
  patientInsuranceCreateSchema,
  patientInsuranceVerifySchema,
  preAuthorizationCreateSchema,
  preAuthorizationApproveSchema,
  insuranceClaimCreateSchema,
  insuranceClaimStatusSchema,
  claimDocumentCreateSchema,
  isValidClaimTransition,
} from "../../src/lib/insurance/validation";

describe("insurance provider validation", () => {
  it("accepts valid provider", () => {
    const r = insuranceProviderCreateSchema.safeParse({
      provider_name: "Star Health Insurance",
      provider_code: "STAR",
      provider_type: "private",
    });
    assert.equal(r.success, true);
    if (r.success) {
      assert.equal(r.data.provider_code, "STAR");
    }
  });

  it("rejects missing provider name", () => {
    const r = insuranceProviderCreateSchema.safeParse({
      provider_code: "XYZ",
      provider_type: "private",
    });
    assert.equal(r.success, false);
  });

  it("rejects invalid provider type", () => {
    const r = insuranceProviderCreateSchema.safeParse({
      provider_name: "Test",
      provider_code: "TST",
      provider_type: "invalid",
    });
    assert.equal(r.success, false);
  });

  it("accepts partial update", () => {
    assert.equal(
      insuranceProviderUpdateSchema.safeParse({ contact_person: "John" }).success,
      true
    );
  });
});

describe("patient insurance validation", () => {
  const validPolicy = {
    patient_id: "00000000-0000-0000-0000-000000000001",
    provider_id: "00000000-0000-0000-0000-000000000002",
    policy_number: "POL-12345",
    insured_name: "Ravi Kumar",
    insured_relationship: "self",
    coverage_from: "2026-01-01",
    coverage_to: "2027-01-01",
    coverage_type: "individual",
  };

  it("accepts valid policy", () => {
    const r = patientInsuranceCreateSchema.safeParse(validPolicy);
    assert.equal(r.success, true);
  });

  it("rejects coverage_to before coverage_from", () => {
    const r = patientInsuranceCreateSchema.safeParse({
      ...validPolicy,
      coverage_from: "2027-01-01",
      coverage_to: "2026-01-01",
    });
    assert.equal(r.success, false);
  });

  it("rejects invalid relationship", () => {
    const r = patientInsuranceCreateSchema.safeParse({
      ...validPolicy,
      insured_relationship: "unknown",
    });
    assert.equal(r.success, false);
  });

  it("accepts valid verification", () => {
    const r = patientInsuranceVerifySchema.safeParse({
      verification_status: "verified",
    });
    assert.equal(r.success, true);
  });

  it("rejects invalid verification status", () => {
    const r = patientInsuranceVerifySchema.safeParse({
      verification_status: "unknown",
    });
    assert.equal(r.success, false);
  });
});

describe("pre-authorization validation", () => {
  it("accepts valid pre-auth", () => {
    const r = preAuthorizationCreateSchema.safeParse({
      patient_id: "00000000-0000-0000-0000-000000000001",
      patient_insurance_id: "00000000-0000-0000-0000-000000000002",
      treatment_type: "Knee Replacement Surgery",
      estimated_amount: 250000,
    });
    assert.equal(r.success, true);
  });

  it("rejects zero estimated amount", () => {
    const r = preAuthorizationCreateSchema.safeParse({
      patient_id: "00000000-0000-0000-0000-000000000001",
      patient_insurance_id: "00000000-0000-0000-0000-000000000002",
      treatment_type: "Surgery",
      estimated_amount: 0,
    });
    assert.equal(r.success, false);
  });

  it("accepts approval with amount", () => {
    const r = preAuthorizationApproveSchema.safeParse({
      status: "approved",
      approved_amount: 200000,
    });
    assert.equal(r.success, true);
  });

  it("accepts rejection with reason", () => {
    const r = preAuthorizationApproveSchema.safeParse({
      status: "rejected",
      rejection_reason: "Not covered under policy",
    });
    assert.equal(r.success, true);
  });
});

describe("insurance claim validation", () => {
  const validClaim = {
    patient_id: "00000000-0000-0000-0000-000000000001",
    patient_insurance_id: "00000000-0000-0000-0000-000000000002",
    total_bill_amount: 300000,
    claim_amount: 250000,
  };

  it("accepts valid claim", () => {
    const r = insuranceClaimCreateSchema.safeParse(validClaim);
    assert.equal(r.success, true);
  });

  it("rejects zero claim amount", () => {
    const r = insuranceClaimCreateSchema.safeParse({
      ...validClaim,
      claim_amount: 0,
    });
    assert.equal(r.success, false);
  });

  it("accepts status transition to submitted", () => {
    const r = insuranceClaimStatusSchema.safeParse({
      status: "submitted",
    });
    assert.equal(r.success, true);
  });

  it("requires settlement amount for settled status", () => {
    const r = insuranceClaimStatusSchema.safeParse({
      status: "settled",
    });
    assert.equal(r.success, false);
  });

  it("accepts settlement with amount", () => {
    const r = insuranceClaimStatusSchema.safeParse({
      status: "settled",
      settlement_amount: 200000,
      settlement_ref: "CHQ-001",
    });
    assert.equal(r.success, true);
  });

  it("accepts claim rejection", () => {
    const r = insuranceClaimStatusSchema.safeParse({
      status: "rejected",
      rejection_reason: "Policy lapsed",
    });
    assert.equal(r.success, true);
  });
});

describe("claim document validation", () => {
  it("accepts valid document", () => {
    const r = claimDocumentCreateSchema.safeParse({
      claim_id: "00000000-0000-0000-0000-000000000001",
      document_type: "invoice",
      file_name: "invoice.pdf",
      file_url: "https://storage.example.com/invoice.pdf",
    });
    assert.equal(r.success, true);
  });

  it("rejects invalid document type", () => {
    const r = claimDocumentCreateSchema.safeParse({
      claim_id: "00000000-0000-0000-0000-000000000001",
      document_type: "exe",
      file_name: "malware.exe",
      file_url: "https://example.com/malware.exe",
    });
    assert.equal(r.success, false);
  });

  it("rejects invalid file URL", () => {
    const r = claimDocumentCreateSchema.safeParse({
      claim_id: "00000000-0000-0000-0000-000000000001",
      document_type: "prescription",
      file_name: "rx.pdf",
      file_url: "not-a-url",
    });
    assert.equal(r.success, false);
  });
});

describe("claim status transitions", () => {
  it("allows draft → submitted", () => {
    assert.equal(isValidClaimTransition("draft", "submitted"), true);
  });

  it("allows draft → cancelled", () => {
    assert.equal(isValidClaimTransition("draft", "cancelled"), true);
  });

  it("allows submitted → in_process", () => {
    assert.equal(isValidClaimTransition("submitted", "in_process"), true);
  });

  it("allows in_process → approved", () => {
    assert.equal(isValidClaimTransition("in_process", "approved"), true);
  });

  it("allows in_process → rejected", () => {
    assert.equal(isValidClaimTransition("in_process", "rejected"), true);
  });

  it("allows approved → settled", () => {
    assert.equal(isValidClaimTransition("approved", "settled"), true);
  });

  it("blocks draft → settled (skip approval)", () => {
    assert.equal(isValidClaimTransition("draft", "settled"), false);
  });

  it("blocks settled → anything", () => {
    assert.equal(isValidClaimTransition("settled", "approved"), false);
    assert.equal(isValidClaimTransition("settled", "submitted"), false);
  });

  it("blocks invalid status", () => {
    assert.equal(isValidClaimTransition("draft", "invalid_status"), false);
  });

  it("blocks unknown from status", () => {
    assert.equal(isValidClaimTransition("unknown", "draft"), false);
  });
});
