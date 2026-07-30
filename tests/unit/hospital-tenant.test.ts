import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { withHospitalId, applyHospitalFilter } from "../../src/lib/hospital/tenant";
import { resolveHospitalSlug } from "../../src/lib/hospital/resolve-tenant";

describe("tenant helpers", () => {
  it("withHospitalId attaches when present", () => {
    const p = withHospitalId({ name: "x" }, "11111111-1111-1111-1111-111111111111");
    assert.equal(p.hospital_id, "11111111-1111-1111-1111-111111111111");
    assert.equal(p.name, "x");
  });

  it("withHospitalId skips when null", () => {
    const p = withHospitalId({ name: "x" }, null);
    assert.equal("hospital_id" in p, false);
  });

  it("applyHospitalFilter chains eq", () => {
    const calls: [string, string][] = [];
    const q = {
      eq(col: string, val: string) {
        calls.push([col, val]);
        return this;
      },
    };
    applyHospitalFilter(q, "hid-1");
    assert.deepEqual(calls, [["hospital_id", "hid-1"]]);
    applyHospitalFilter(q, null);
    assert.equal(calls.length, 1);
  });

  it("resolveHospitalSlug still works for default", () => {
    assert.ok(resolveHospitalSlug({}).length > 0);
  });
});
