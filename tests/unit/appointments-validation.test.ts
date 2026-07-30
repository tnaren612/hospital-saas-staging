import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  adminAppointmentPatchSchema,
  resolvePeriod,
  isSlotFreeingStatus,
  APPOINTMENT_STATUSES,
} from "../../src/lib/appointments/validation";
import { computeStats } from "../../src/lib/admin/appointments";
import type { Appointment } from "../../src/types";

describe("appointment validation", () => {
  it("accepts status patch", () => {
    const r = adminAppointmentPatchSchema.safeParse({ status: "checked_in" });
    assert.equal(r.success, true);
  });

  it("accepts check_in", () => {
    const r = adminAppointmentPatchSchema.safeParse({ check_in: true });
    assert.equal(r.success, true);
  });

  it("rejects empty patch", () => {
    const r = adminAppointmentPatchSchema.safeParse({});
    assert.equal(r.success, false);
  });

  it("rejects invalid status", () => {
    const r = adminAppointmentPatchSchema.safeParse({ status: "flying" });
    assert.equal(r.success, false);
  });

  it("resolvePeriod", () => {
    assert.equal(resolvePeriod("09:00 AM"), "morning");
    assert.equal(resolvePeriod("02:00 PM"), "afternoon");
    assert.equal(resolvePeriod("06:00 PM"), "evening");
  });

  it("isSlotFreeingStatus", () => {
    assert.equal(isSlotFreeingStatus("cancelled"), true);
    assert.equal(isSlotFreeingStatus("no_show"), true);
    assert.equal(isSlotFreeingStatus("confirmed"), false);
  });

  it("includes no_show and checked_in", () => {
    assert.ok(APPOINTMENT_STATUSES.includes("no_show"));
    assert.ok(APPOINTMENT_STATUSES.includes("checked_in"));
  });
});

describe("appointment stats", () => {
  const today = new Date().toISOString().slice(0, 10);
  const base: Appointment = {
    id: "1",
    patientName: "A",
    phone: "9876543210",
    email: "a@b.com",
    age: 30,
    gender: "male",
    problem: "cough",
    doctorId: "d1",
    doctorName: "Dr",
    date: today,
    timeSlot: "10:00 AM",
    period: "morning",
    type: "in-person",
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };

  it("computeStats counts today", () => {
    const s = computeStats([
      base,
      { ...base, id: "2", status: "cancelled" },
      { ...base, id: "3", status: "completed", phone: "9123456780" },
    ]);
    assert.equal(s.total, 3);
    assert.equal(s.today, 2); // excludes cancelled
    assert.equal(s.completed, 1);
    assert.equal(s.cancelled, 1);
    assert.equal(s.totalPatients, 2);
  });
});
