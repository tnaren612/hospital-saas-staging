import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { walkInSchema } from "../../src/lib/reception/validation";

describe("reception walk-in validation", () => {
  it("accepts valid walk-in", () => {
    const r = walkInSchema.safeParse({
      full_name: "Ravi Kumar",
      phone: "9876543210",
      doctor_id: "11111111-1111-1111-1111-111111111111",
      problem: "Fever",
    });
    assert.equal(r.success, true);
  });

  it("rejects bad phone", () => {
    const r = walkInSchema.safeParse({
      full_name: "Ravi",
      phone: "123",
      doctor_id: "d1",
    });
    assert.equal(r.success, false);
  });

  it("requires doctor", () => {
    const r = walkInSchema.safeParse({
      full_name: "Ravi Kumar",
      phone: "9876543210",
    });
    assert.equal(r.success, false);
  });
});
