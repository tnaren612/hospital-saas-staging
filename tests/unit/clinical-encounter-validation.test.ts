import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { encounterCreateSchema, encounterPatchSchema } from "../../src/lib/clinical/validation";

describe("clinical encounter validation", () => {
  it("accepts a valid encounter", () => {
    assert.equal(encounterCreateSchema.safeParse({
      patient_id: "11111111-1111-4111-8111-111111111111",
      encounter_type: "outpatient",
      chief_complaint: "Persistent cough",
      observations: { spo2_percent: 97, pulse_bpm: 82 },
    }).success, true);
  });
  it("rejects unsafe observation values", () => {
    assert.equal(encounterCreateSchema.safeParse({
      patient_id: "11111111-1111-4111-8111-111111111111",
      encounter_type: "outpatient",
      chief_complaint: "Fever",
      observations: { spo2_percent: 150 },
    }).success, false);
  });
  it("rejects an empty patch", () => {
    assert.equal(encounterPatchSchema.safeParse({}).success, false);
  });
});
