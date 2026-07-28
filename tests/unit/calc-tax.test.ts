import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  calcTax,
  isPaymentSuccessful,
  isRefundStatus,
} from "../../src/lib/payments/types";

describe("calcTax", () => {
  it("computes subtotal tax and total", () => {
    const r = calcTax(1000, 100, 18);
    assert.equal(r.subtotal, 900);
    assert.equal(r.tax, 162);
    assert.equal(r.total, 1062);
  });

  it("never returns negative subtotal", () => {
    const r = calcTax(50, 100, 0);
    assert.equal(r.subtotal, 0);
    assert.equal(r.tax, 0);
    assert.equal(r.total, 0);
  });
});

describe("payment status helpers", () => {
  it("treats paid and completed as successful", () => {
    assert.equal(isPaymentSuccessful("paid"), true);
    assert.equal(isPaymentSuccessful("completed"), true);
    assert.equal(isPaymentSuccessful("pending"), false);
    assert.equal(isPaymentSuccessful("failed"), false);
  });

  it("detects refund statuses", () => {
    assert.equal(isRefundStatus("refunded"), true);
    assert.equal(isRefundStatus("refund_requested"), true);
    assert.equal(isRefundStatus("paid"), false);
  });
});
