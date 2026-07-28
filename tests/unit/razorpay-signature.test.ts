import assert from "node:assert/strict";
import { createHmac } from "node:crypto";
import { describe, it, before, after } from "node:test";

/**
 * Unit tests for Razorpay HMAC verification.
 * Uses dynamic import after env is set so module reads secrets correctly.
 */

describe("verifyRazorpaySignature", () => {
  const secret = "test_razorpay_secret_key_123";
  const orderId = "order_ABC123";
  const paymentId = "pay_XYZ789";

  let prevId: string | undefined;
  let prevSecret: string | undefined;

  before(() => {
    prevId = process.env.RAZORPAY_KEY_ID;
    prevSecret = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_KEY_ID = "rzp_test_unit";
    process.env.RAZORPAY_KEY_SECRET = secret;
  });

  after(() => {
    if (prevId === undefined) delete process.env.RAZORPAY_KEY_ID;
    else process.env.RAZORPAY_KEY_ID = prevId;
    if (prevSecret === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = prevSecret;
  });

  it("accepts valid checkout signature", async () => {
    // Clear module cache so env is re-read... razorpay reads env at call time so OK
    const { verifyRazorpaySignature } = await import(
      "../../src/lib/payments/razorpay"
    );
    const signature = createHmac("sha256", secret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    const ok = await verifyRazorpaySignature({
      orderId,
      paymentId,
      signature,
    });
    assert.equal(ok, true);
  });

  it("rejects invalid signature", async () => {
    const { verifyRazorpaySignature } = await import(
      "../../src/lib/payments/razorpay"
    );
    const ok = await verifyRazorpaySignature({
      orderId,
      paymentId,
      signature: "deadbeef",
    });
    assert.equal(ok, false);
  });

  it("rejects missing fields", async () => {
    const { verifyRazorpaySignature } = await import(
      "../../src/lib/payments/razorpay"
    );
    const ok = await verifyRazorpaySignature({
      orderId: "",
      paymentId: "",
      signature: "",
    });
    assert.equal(ok, false);
  });
});

describe("verifyRazorpayWebhookSignature", () => {
  const secret = "whsec_test_123";
  let prevWh: string | undefined;
  let prevKey: string | undefined;

  before(() => {
    prevWh = process.env.RAZORPAY_WEBHOOK_SECRET;
    prevKey = process.env.RAZORPAY_KEY_SECRET;
    process.env.RAZORPAY_WEBHOOK_SECRET = secret;
    process.env.RAZORPAY_KEY_SECRET = "other";
  });

  after(() => {
    if (prevWh === undefined) delete process.env.RAZORPAY_WEBHOOK_SECRET;
    else process.env.RAZORPAY_WEBHOOK_SECRET = prevWh;
    if (prevKey === undefined) delete process.env.RAZORPAY_KEY_SECRET;
    else process.env.RAZORPAY_KEY_SECRET = prevKey;
  });

  it("accepts valid webhook HMAC of raw body", async () => {
    const { verifyRazorpayWebhookSignature } = await import(
      "../../src/lib/payments/razorpay"
    );
    const rawBody = JSON.stringify({
      event: "payment.captured",
      payload: { payment: { entity: { id: "pay_1" } } },
    });
    const signature = createHmac("sha256", secret)
      .update(rawBody)
      .digest("hex");
    const ok = await verifyRazorpayWebhookSignature({ rawBody, signature });
    assert.equal(ok, true);
  });

  it("rejects bad webhook signature", async () => {
    const { verifyRazorpayWebhookSignature } = await import(
      "../../src/lib/payments/razorpay"
    );
    const ok = await verifyRazorpayWebhookSignature({
      rawBody: "{}",
      signature: "nope",
    });
    assert.equal(ok, false);
  });
});
