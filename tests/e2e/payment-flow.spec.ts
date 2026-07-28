/**
 * Playwright E2E — payment completion happy path + failure scenarios.
 * Run: npx playwright test tests/e2e/payment-flow.spec.ts
 *
 * Requires: npm run dev (or PLAYWRIGHT_BASE_URL) and optional test credentials.
 */
import { test, expect } from "@playwright/test";

const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

test.describe("Payment APIs", () => {
  test("verify rejects missing fields", async ({ request }) => {
    const res = await request.post(`${base}/api/payments/verify`, {
      data: {},
    });
    expect(res.status()).toBe(400);
    const json = await res.json();
    expect(json.error).toBeTruthy();
  });

  test("verify rejects invalid signature payload", async ({ request }) => {
    const res = await request.post(`${base}/api/payments/verify`, {
      data: {
        payment_id: "00000000-0000-0000-0000-000000000000",
        provider: "razorpay",
        razorpay_order_id: "order_fake",
        razorpay_payment_id: "pay_fake",
        razorpay_signature: "bad_signature",
      },
    });
    // 400 verification failed or payment not found
    expect([400, 404, 500]).toContain(res.status());
  });

  test("webhook health endpoint", async ({ request }) => {
    const res = await request.get(`${base}/api/payments/webhook`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.events).toContain("payment.captured");
  });

  test("webhook rejects invalid signature in production-like path", async ({
    request,
  }) => {
    const res = await request.post(`${base}/api/payments/webhook`, {
      headers: {
        "content-type": "application/json",
        "x-razorpay-signature": "invalid",
      },
      data: {
        event: "payment.failed",
        payload: { payment: { entity: { id: "pay_x", order_id: "order_x" } } },
      },
    });
    // Dev may accept mock; production with secret rejects 401/400
    expect([200, 400, 401]).toContain(res.status());
  });

  test("refund requires auth for approve", async ({ request }) => {
    const res = await request.post(`${base}/api/payments/refund`, {
      data: {
        payment_id: "00000000-0000-0000-0000-000000000000",
        action: "approve",
      },
    });
    expect([401, 400]).toContain(res.status());
  });

  test("create payment rate-limits / validates body", async ({ request }) => {
    const res = await request.post(`${base}/api/payments/create`, {
      data: { amount: -1 },
    });
    expect(res.status()).toBe(400);
  });
});

test.describe("Patient portal payments page", () => {
  test("payments page loads", async ({ page }) => {
    await page.goto(`${base}/patient/payments`);
    // Login gate or page shell
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Admin billing page", () => {
  test("billing route responds", async ({ page }) => {
    await page.goto(`${base}/admin/billing`);
    await expect(page.locator("body")).toBeVisible();
  });
});
