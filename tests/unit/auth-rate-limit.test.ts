import { describe, it, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  checkRateLimit,
  checkAuthRateLimit,
  clearRateLimitBuckets,
} from "../../src/lib/auth/rate-limit";

describe("auth rate limit", () => {
  beforeEach(() => {
    clearRateLimitBuckets();
  });

  it("allows under limit", () => {
    const a = checkRateLimit("k1", 3, 60_000);
    assert.equal(a.allowed, true);
    const b = checkRateLimit("k1", 3, 60_000);
    assert.equal(b.allowed, true);
  });

  it("blocks at limit", () => {
    checkRateLimit("k2", 2, 60_000);
    checkRateLimit("k2", 2, 60_000);
    const blocked = checkRateLimit("k2", 2, 60_000);
    assert.equal(blocked.allowed, false);
    assert.ok(blocked.retryAfterSeconds >= 1);
  });

  it("isolates keys", () => {
    checkRateLimit("a", 1, 60_000);
    const blocked = checkRateLimit("a", 1, 60_000);
    const other = checkRateLimit("b", 1, 60_000);
    assert.equal(blocked.allowed, false);
    assert.equal(other.allowed, true);
  });

  it("auth default allows first attempt", () => {
    const r = checkAuthRateLimit("login:test@example.com");
    assert.equal(r.allowed, true);
  });
});
