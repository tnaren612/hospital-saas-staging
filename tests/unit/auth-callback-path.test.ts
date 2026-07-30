import { describe, it } from "node:test";
import assert from "node:assert/strict";

/**
 * Mirrors safeNextPath logic from auth/callback route
 * (kept pure for unit testing without Next runtime).
 */
function safeNextPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//")) {
    return "/patient/login";
  }
  if (raw.includes("://") || raw.includes("\\")) {
    return "/patient/login";
  }
  return raw;
}

describe("auth callback next path", () => {
  it("allows safe relative paths", () => {
    assert.equal(safeNextPath("/patient/reset-password"), "/patient/reset-password");
    assert.equal(safeNextPath("/patient/login"), "/patient/login");
  });

  it("blocks open redirects", () => {
    assert.equal(safeNextPath("https://evil.com"), "/patient/login");
    assert.equal(safeNextPath("//evil.com"), "/patient/login");
    assert.equal(safeNextPath("/\\evil"), "/patient/login");
    assert.equal(safeNextPath(null), "/patient/login");
    assert.equal(safeNextPath(""), "/patient/login");
  });
});
