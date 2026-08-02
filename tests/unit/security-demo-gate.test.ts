import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  allowDemoFallback,
  demoFallbackError,
  ensureDemoAllowed,
  gatedDemoStore,
} from "../../src/lib/supabase/demo-gate";
import { demoPhase2 } from "../../src/lib/phase2/demo-store";
import { demoFinance } from "../../src/lib/finance/demo-store";
import { demoHr } from "../../src/lib/hr/demo-store";
import { demoPharmacy } from "../../src/lib/pharmacy/demo-store";

const savedEnv = process.env.NODE_ENV;

function setNodeEnv(value: "production" | "development" | "test"): void {
  (process.env as Record<string, string | undefined>).NODE_ENV = value;
}

describe("demo fallback gate (production must never run demo stores)", () => {
  it("throws a descriptive error when demo is disabled", () => {
    const err = demoFallbackError("x");
    assert.match(err.message, /demo-fallback-disabled/);
    assert.match(err.message, /x/);
  });

  it("gated demo store throws when demo is disabled", () => {
    setNodeEnv("production");
    try {
      assert.equal(allowDemoFallback(), false);
      assert.throws(
        () => demoPhase2.listTests(),
        /demo-fallback-disabled/
      );
      assert.throws(() => ensureDemoAllowed("anything"), /demo-fallback-disabled/);
    } finally {
      setNodeEnv(savedEnv || "test");
    }
  });

  it("all demo stores are gated", () => {
    setNodeEnv("production");
    try {
      assert.throws(() => demoFinance.list(), /demo-fallback-disabled/);
      assert.throws(() => demoHr.listEmployees(), /demo-fallback-disabled/);
      assert.throws(() => demoPharmacy.branches(), /demo-fallback-disabled/);
    } finally {
      setNodeEnv(savedEnv || "test");
    }
  });

  it("gatedDemoStore preserves values and types outside production", () => {
    const store = { hello: () => "world", count: 42 };
    const gated = gatedDemoStore("test", store);
    assert.equal(gated.hello(), "world");
    assert.equal(gated.count, 42);
  });

  it("gated store throws only on function access", () => {
    setNodeEnv("production");
    try {
      const gated = gatedDemoStore("test", { count: 42 });
      assert.equal(gated.count, 42);
      assert.throws(() => ensureDemoAllowed("x"), /demo-fallback-disabled/);
    } finally {
      setNodeEnv(savedEnv || "test");
    }
  });
});
