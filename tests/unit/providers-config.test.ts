import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  getRazorpayStatus,
  getEmailStatus,
  getSmsStatus,
  getWhatsAppStatus,
  getAnalyticsStatus,
} from "../../src/lib/providers/config";

describe("provider status helpers", () => {
  it("returns structured statuses without throwing", () => {
    for (const fn of [
      getRazorpayStatus,
      getEmailStatus,
      getSmsStatus,
      getWhatsAppStatus,
      getAnalyticsStatus,
    ]) {
      const s = fn();
      assert.equal(typeof s.configured, "boolean");
      assert.ok(["live", "test", "mock", "disabled"].includes(s.mode));
      assert.ok(s.hint.length > 5);
    }
  });
});
