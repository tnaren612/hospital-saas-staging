import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { assertSameOrigin } from "../../src/lib/auth/csrf";

describe("assertSameOrigin (H-10)", () => {
  it("allows GET without origin", () => {
    const req = new Request("https://example.com/api", { method: "GET" });
    assert.equal(assertSameOrigin(req).ok, true);
  });

  it("allows matching origin", () => {
    const req = new Request("https://example.com/api", {
      method: "POST",
      headers: {
        origin: "https://example.com",
        host: "example.com",
      },
    });
    assert.equal(assertSameOrigin(req).ok, true);
  });

  it("rejects cross-site origin", () => {
    const req = new Request("https://example.com/api", {
      method: "POST",
      headers: {
        origin: "https://evil.com",
        host: "example.com",
      },
    });
    const r = assertSameOrigin(req);
    assert.equal(r.ok, false);
  });

  it("rejects missing origin on POST when not allowed", () => {
    const req = new Request("https://example.com/api", {
      method: "POST",
      headers: { host: "example.com" },
    });
    const r = assertSameOrigin(req, { allowMissing: false });
    assert.equal(r.ok, false);
  });
});
