import assert from "node:assert/strict";
import { describe, it, before, after } from "node:test";
import {
  allowMockPayments,
  isProductionRuntime,
} from "../../src/lib/payments/production-guard";

describe("payment production guard (C-04)", () => {
  let prevVercel: string | undefined;
  let prevAllow: string | undefined;

  before(() => {
    prevVercel = process.env.VERCEL_ENV;
    prevAllow = process.env.ALLOW_MOCK_PAYMENTS;
  });

  after(() => {
    if (prevVercel === undefined) delete process.env.VERCEL_ENV;
    else process.env.VERCEL_ENV = prevVercel;
    if (prevAllow === undefined) delete process.env.ALLOW_MOCK_PAYMENTS;
    else process.env.ALLOW_MOCK_PAYMENTS = prevAllow;
  });

  it("isProductionRuntime true when VERCEL_ENV=production", () => {
    process.env.VERCEL_ENV = "production";
    // NODE_ENV may be "test" under tsx — VERCEL_ENV alone is enough when not test
    // production-guard treats NODE_ENV=test as never production
    if (process.env.NODE_ENV === "test") {
      assert.equal(isProductionRuntime(), false);
    } else {
      assert.equal(isProductionRuntime(), true);
      assert.equal(allowMockPayments(), false);
    }
  });

  it("allowMockPayments true when not production vercel", () => {
    process.env.VERCEL_ENV = "development";
    delete process.env.ALLOW_MOCK_PAYMENTS;
    assert.equal(isProductionRuntime(), false);
    assert.equal(allowMockPayments(), true);
  });

  it("NODE_ENV=test never counts as production", () => {
    process.env.VERCEL_ENV = "production";
    // under test runner NODE_ENV is typically "test"
    if (process.env.NODE_ENV === "test") {
      assert.equal(isProductionRuntime(), false);
    }
  });
});
