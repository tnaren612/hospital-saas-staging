import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { radiologyActionSchema, radiologyOrderSchema } from "../../src/lib/radiology/validation";

describe("radiology validation", () => {
  it("accepts a complete imaging order", () => {
    assert.equal(radiologyOrderSchema.safeParse({
      patient_id: "11111111-1111-4111-8111-111111111111",
      modality: "mri",
      body_part: "Brain",
      clinical_indication: "Persistent headache",
      priority: "urgent",
    }).success, true);
  });

  it("rejects unsupported modalities", () => {
    assert.equal(radiologyOrderSchema.safeParse({
      patient_id: "11111111-1111-4111-8111-111111111111",
      modality: "camera",
      body_part: "Brain",
      clinical_indication: "Persistent headache",
    }).success, false);
  });

  it("requires findings and impression to finalize a report", () => {
    assert.equal(radiologyActionSchema.safeParse({
      action: "report", findings: "", impression: "", recommendations: "",
    }).success, false);
  });

  it("accepts an ISO scheduled time", () => {
    assert.equal(radiologyActionSchema.safeParse({
      action: "schedule", scheduled_at: "2026-08-01T09:30:00.000Z",
    }).success, true);
  });
  it("accepts secure attachment metadata",()=>assert.equal(radiologyActionSchema.safeParse({action:"attachment",attachment_type:"dicom",file_name:"scan.dcm",file_url:"https://files.example/scan.dcm",mime_type:"application/dicom"}).success,true));
});
