import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  validatePassword,
  passwordsMatch,
  passwordSchema,
  PASSWORD_MIN_LENGTH,
} from "../../src/lib/auth/password-policy";

describe("password policy", () => {
  it("rejects short passwords", () => {
    assert.ok(validatePassword("Ab1"));
    assert.match(validatePassword("Ab1") || "", /at least/i);
  });

  it("rejects password without letter", () => {
    assert.match(validatePassword("12345678") || "", /letter/i);
  });

  it("rejects password without number", () => {
    assert.match(validatePassword("abcdefgh") || "", /number/i);
  });

  it("accepts strong enough password", () => {
    assert.equal(validatePassword("Hospital9"), null);
    assert.equal(validatePassword("SecurePass1"), null);
  });

  it("rejects common weak passwords", () => {
    assert.ok(validatePassword("password"));
    assert.ok(validatePassword("admin123"));
  });

  it("passwordsMatch", () => {
    assert.equal(passwordsMatch("SecurePass1", "SecurePass1"), null);
    assert.match(passwordsMatch("SecurePass1", "other") || "", /match/i);
  });

  it("passwordSchema parses valid", () => {
    const r = passwordSchema.safeParse("ValidPass1");
    assert.equal(r.success, true);
  });

  it("passwordSchema rejects weak", () => {
    const r = passwordSchema.safeParse("short");
    assert.equal(r.success, false);
  });

  it("min length constant", () => {
    assert.equal(PASSWORD_MIN_LENGTH, 8);
  });
});
