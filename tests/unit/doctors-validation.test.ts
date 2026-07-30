import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  doctorCreateSchema,
  doctorUpdateSchema,
  availabilitySchema,
  availabilityBulkSchema,
  buildDoctorInsertPayload,
} from "../../src/lib/doctors/validation";
import {
  CONSULTATION_TYPES,
  DOCTOR_WRITE_ROLES,
  SPECIALIZATION_CATALOG,
} from "../../src/lib/doctors/constants";

describe("doctor validation", () => {
  it("accepts valid create payload", () => {
    const r = doctorCreateSchema.safeParse({
      name: "Dr Test",
      specializations: ["Pulmonology"],
      consultation_types: ["in_person", "video"],
      consultation_fee: 500,
    });
    assert.equal(r.success, true);
  });

  it("rejects short name", () => {
    const r = doctorCreateSchema.safeParse({ name: "A" });
    assert.equal(r.success, false);
  });

  it("rejects invalid consultation type", () => {
    const r = doctorCreateSchema.safeParse({
      name: "Dr Test",
      consultation_types: ["telepathy"],
    });
    assert.equal(r.success, false);
  });

  it("update schema allows partial", () => {
    const r = doctorUpdateSchema.safeParse({ consultation_fee: 700 });
    assert.equal(r.success, true);
  });

  it("buildDoctorInsertPayload defaults", () => {
    const p = buildDoctorInsertPayload(
      { name: "Dr Demo" },
      (s) => s.toLowerCase().replace(/\s+/g, "-")
    );
    assert.equal(p.name, "Dr Demo");
    assert.equal(p.slug, "dr-demo");
    assert.ok(p.consultation_types.includes("in_person"));
    assert.equal(p.deleted_at, null);
  });
});

describe("availability validation", () => {
  it("accepts single day", () => {
    const r = availabilitySchema.safeParse({
      doctor_id: "11111111-1111-1111-1111-111111111111",
      date: "2026-08-01",
      status: "on_leave",
    });
    assert.equal(r.success, true);
  });

  it("rejects bad date format", () => {
    const r = availabilitySchema.safeParse({
      doctor_id: "11111111-1111-1111-1111-111111111111",
      date: "01-08-2026",
      status: "on_leave",
    });
    assert.equal(r.success, false);
  });

  it("bulk requires from <= to", () => {
    const bad = availabilityBulkSchema.safeParse({
      doctor_id: "11111111-1111-1111-1111-111111111111",
      from: "2026-08-10",
      to: "2026-08-01",
      status: "holiday",
    });
    assert.equal(bad.success, false);

    const ok = availabilityBulkSchema.safeParse({
      doctor_id: "11111111-1111-1111-1111-111111111111",
      from: "2026-08-01",
      to: "2026-08-10",
      status: "holiday",
    });
    assert.equal(ok.success, true);
  });
});

describe("doctor constants", () => {
  it("has consultation types and catalog", () => {
    assert.ok(CONSULTATION_TYPES.length >= 2);
    assert.ok(SPECIALIZATION_CATALOG.includes("Pulmonology"));
    assert.ok(DOCTOR_WRITE_ROLES.includes("admin"));
  });
});
