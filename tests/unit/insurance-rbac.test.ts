import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  canAccessFeature,
  canAccessInsurance,
} from "../../src/lib/auth/roles";

describe("insurance RBAC", () => {
  it("super_admin can access insurance", () => {
    assert.equal(canAccessFeature("super_admin", "insurance"), true);
    assert.equal(canAccessInsurance("super_admin"), true);
  });

  it("admin can access insurance", () => {
    assert.equal(canAccessFeature("admin", "insurance"), true);
    assert.equal(canAccessInsurance("admin"), true);
  });

  it("billing can access insurance", () => {
    assert.equal(canAccessFeature("billing", "insurance"), true);
    assert.equal(canAccessInsurance("billing"), true);
  });

  it("finance can access insurance", () => {
    assert.equal(canAccessFeature("finance", "insurance"), true);
    assert.equal(canAccessInsurance("finance"), true);
  });

  it("manager can access insurance", () => {
    assert.equal(canAccessFeature("manager", "insurance"), true);
    assert.equal(canAccessInsurance("manager"), true);
  });

  it("doctor cannot access insurance", () => {
    assert.equal(canAccessFeature("doctor", "insurance"), false);
    assert.equal(canAccessInsurance("doctor"), false);
  });

  it("receptionist cannot access insurance", () => {
    assert.equal(canAccessFeature("receptionist", "insurance"), false);
    assert.equal(canAccessInsurance("receptionist"), false);
  });

  it("patient cannot access insurance", () => {
    assert.equal(canAccessFeature("patient", "insurance"), false);
    assert.equal(canAccessInsurance("patient"), false);
  });

  it("lab technician cannot access insurance", () => {
    assert.equal(canAccessFeature("lab_technician", "insurance"), false);
  });

  it("pharmacist cannot access insurance", () => {
    assert.equal(canAccessFeature("pharmacist", "insurance"), false);
  });

  it("hr cannot access insurance", () => {
    assert.equal(canAccessFeature("hr", "insurance"), false);
  });
});
