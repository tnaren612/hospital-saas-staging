import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  patientLoginRateLimitKey,
  resolveOwnPatientId,
  verifyCronSecret,
} from "../../src/lib/auth/security";
import { checkAuthRateLimit, clearRateLimitBuckets } from "../../src/lib/auth/rate-limit";

const OWN = "11111111-1111-1111-1111-111111111111";
const OTHER = "22222222-2222-2222-2222-222222222222";

describe("security guards", () => {
  describe("verifyCronSecret (fail-closed)", () => {
    it("allows exact match", () => {
      assert.equal(verifyCronSecret("s3cret", "s3cret"), true);
    });

    it("denies mismatch", () => {
      assert.equal(verifyCronSecret("s3cret", "wrong"), false);
    });

    it("denies when secret is unset (fail-closed, no open access)", () => {
      assert.equal(verifyCronSecret("", "anything"), false);
    });

    it("denies when secret provided but caller sends nothing", () => {
      assert.equal(verifyCronSecret("s3cret", ""), false);
    });

    it("denies empty-vs-empty", () => {
      assert.equal(verifyCronSecret("", ""), false);
    });
  });

  describe("patientLoginRateLimitKey", () => {
    it("normalizes email case and whitespace", () => {
      assert.equal(
        patientLoginRateLimitKey("  Patient@Hospital.COM ", "1.2.3.4"),
        "patient-login:patient@hospital.com:1.2.3.4"
      );
    });

    it("scopes by IP", () => {
      assert.notEqual(
        patientLoginRateLimitKey("a@b.com", "1.2.3.4"),
        patientLoginRateLimitKey("a@b.com", "5.6.7.8")
      );
    });
  });

  describe("patient login rate limit integration", () => {
    beforeEach(() => {
      clearRateLimitBuckets();
    });

    it("blocks after 10 attempts on the same login key", () => {
      const key = patientLoginRateLimitKey("victim@hospital.com", "9.9.9.9");
      for (let i = 0; i < 10; i++) {
        assert.equal(checkAuthRateLimit(key).allowed, true, `attempt ${i + 1}`);
      }
      const blocked = checkAuthRateLimit(key);
      assert.equal(blocked.allowed, false);
      assert.ok(blocked.retryAfterSeconds >= 1);
    });

    it("does not block other accounts", () => {
      const attacker = patientLoginRateLimitKey("a@b.com", "9.9.9.9");
      for (let i = 0; i < 10; i++) checkAuthRateLimit(attacker);
      const innocent = patientLoginRateLimitKey("other@b.com", "9.9.9.9");
      assert.equal(checkAuthRateLimit(innocent).allowed, true);
    });
  });

  describe("resolveOwnPatientId (ownership)", () => {
    it("allows own patientId", () => {
      const r = resolveOwnPatientId(OWN, OWN);
      assert.deepEqual(r, { ok: true, patientId: OWN });
    });

    it("allows when no patientId requested (defaults to own)", () => {
      const r = resolveOwnPatientId(null, OWN);
      assert.deepEqual(r, { ok: true, patientId: OWN });
    });

    it("denies another patient's id (IDOR)", () => {
      const r = resolveOwnPatientId(OTHER, OWN);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.status, 403);
    });

    it("denies when account has no linked patient profile", () => {
      const r = resolveOwnPatientId(OWN, null);
      assert.equal(r.ok, false);
      if (!r.ok) assert.equal(r.status, 403);
    });
  });
});
