import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  ROLES,
  canonicalizeRole,
  isAdmin,
  isHospitalStaff,
  isStaffRole,
  canAccessFeature,
  canAccessBilling,
  canAccessLaboratory,
  canAccessPharmacy,
  homePathForRole,
  roleAllowedOnPath,
  roleLabel,
} from "../../src/lib/auth/roles";

describe("RBAC roles", () => {
  it("canonicalizes legacy staff to receptionist", () => {
    assert.equal(canonicalizeRole("staff"), ROLES.RECEPTIONIST);
    assert.equal(canonicalizeRole("Staff"), ROLES.RECEPTIONIST);
  });

  it("does not treat staff as a stored role", () => {
    assert.notEqual(canonicalizeRole("staff"), "staff");
  });

  it("isAdmin includes super_admin", () => {
    assert.equal(isAdmin("admin"), true);
    assert.equal(isAdmin("super_admin"), true);
    assert.equal(isAdmin("doctor"), false);
  });

  it("isHospitalStaff excludes patient", () => {
    assert.equal(isHospitalStaff("doctor"), true);
    assert.equal(isHospitalStaff("billing"), true);
    assert.equal(isHospitalStaff("patient"), false);
    // legacy alias
    assert.equal(isStaffRole("manager"), true);
  });

  it("permission helpers", () => {
    assert.equal(canAccessLaboratory("lab_technician"), true);
    assert.equal(canAccessLaboratory("pharmacist"), false);
    assert.equal(canAccessPharmacy("pharmacist"), true);
    assert.equal(canAccessBilling("finance"), true);
    assert.equal(canAccessBilling("doctor"), false);
  });

  it("homePathForRole", () => {
    assert.equal(homePathForRole("super_admin"), "/admin/dashboard");
    assert.equal(homePathForRole("admin"), "/admin/dashboard");
    assert.equal(homePathForRole("patient"), "/patient/dashboard");
    assert.equal(homePathForRole("lab_technician"), "/laboratory");
    assert.equal(homePathForRole("pharmacist"), "/pharmacy");
    assert.equal(homePathForRole("billing"), "/billing");
    assert.equal(homePathForRole("receptionist"), "/reception");
    assert.equal(homePathForRole("finance"), "/finance");
    assert.equal(homePathForRole("hr"), "/hr");
    assert.equal(homePathForRole("manager"), "/manager");
  });

  it("roleAllowedOnPath", () => {
    assert.equal(roleAllowedOnPath("admin", "/admin/dashboard"), true);
    assert.equal(roleAllowedOnPath("patient", "/admin/dashboard"), false);
    assert.equal(roleAllowedOnPath("lab_technician", "/laboratory"), true);
    assert.equal(roleAllowedOnPath("pharmacist", "/laboratory"), false);
    assert.equal(roleAllowedOnPath("patient", "/patient/dashboard"), true);
    assert.equal(roleAllowedOnPath(null, "/about"), true);
  });

  it("H-04 settings is admin-only; doctor blocked", () => {
    assert.equal(roleAllowedOnPath("admin", "/admin/settings"), true);
    assert.equal(roleAllowedOnPath("doctor", "/admin/settings"), false);
    assert.equal(roleAllowedOnPath("receptionist", "/admin/settings"), false);
  });

  it("H-04 doctor may access appointments not CMS", () => {
    assert.equal(roleAllowedOnPath("doctor", "/admin/appointments"), true);
    assert.equal(roleAllowedOnPath("doctor", "/admin/blog"), false);
  });

  it("H-05 payments public suffixes", () => {
    assert.equal(roleAllowedOnPath(null, "/api/payments/create"), true);
    assert.equal(roleAllowedOnPath(null, "/api/payments/verify"), true);
    assert.equal(roleAllowedOnPath(null, "/api/payments/webhook"), true);
    assert.equal(roleAllowedOnPath(null, "/api/payments/history"), false);
    assert.equal(roleAllowedOnPath("admin", "/api/payments/history"), true);
    assert.equal(roleAllowedOnPath("patient", "/api/payments/history"), true);
  });

  it("feature access for new roles", () => {
    assert.equal(canAccessFeature("billing", "billing"), true);
    assert.equal(canAccessFeature("billing", "lab"), false);
    assert.equal(canAccessFeature("super_admin", "settings"), true);
    assert.equal(canAccessFeature("hr", "hr"), true);
  });

  it("roleLabel", () => {
    assert.equal(roleLabel("super_admin"), "Super Admin");
    assert.notEqual(roleLabel("staff"), "Staff"); // legacy maps away
  });
});
