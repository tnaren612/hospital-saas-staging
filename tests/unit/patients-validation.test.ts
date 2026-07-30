import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  patientCreateSchema,
  patientUpdateSchema,
  toPatientRow,
} from "../../src/lib/patients/validation";

describe("patient validation", () => {
  it("accepts valid patient", () => {
    const r = patientCreateSchema.safeParse({
      full_name: "Ravi Kumar",
      phone: "9876543210",
      medical_history: "Asthma",
      allergies: "Penicillin",
      emergency_contact_name: "Sita",
      emergency_contact_phone: "9123456780",
    });
    assert.equal(r.success, true);
  });

  it("rejects invalid phone", () => {
    const r = patientCreateSchema.safeParse({
      full_name: "Ravi",
      phone: "12345",
    });
    assert.equal(r.success, false);
  });

  it("toPatientRow syncs emergency contact string", () => {
    const row = toPatientRow({
      full_name: "Ravi Kumar",
      phone: "9876543210",
      emergency_contact_name: "Sita",
      emergency_contact_phone: "9123456780",
    });
    assert.match(row.emergency_contact || "", /Sita/);
    assert.equal(row.emergency_contact_phone, "9123456780");
  });

  it("update allows partial", () => {
    assert.equal(
      patientUpdateSchema.safeParse({ medical_history: "Updated" }).success,
      true
    );
  });
});
