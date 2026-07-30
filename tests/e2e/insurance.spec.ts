/**
 * Playwright E2E suite for Insurance module.
 * Covers: page loads, auth gates, API security.
 */
import { test, expect } from "@playwright/test";

const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

test.describe("Insurance module - public/unauthenticated", () => {
  test("insurance admin page requires auth", async ({ page }) => {
    const res = await page.goto(`${base}/admin/insurance`);
    // Should redirect to login or return 401/403
    const url = page.url();
    expect(
      url.includes("/admin/login") || res?.status() === 401 || res?.status() === 403
    ).toBeTruthy();
  });

  test("insurance API requires auth", async ({ request }) => {
    const res = await request.get(`${base}/api/admin/insurance/dashboard`);
    expect([401, 403]).toContain(res.status());
  });

  test("providers API requires auth", async ({ request }) => {
    const res = await request.get(`${base}/api/admin/insurance/providers`);
    expect([401, 403]).toContain(res.status());
  });

  test("claims API requires auth", async ({ request }) => {
    const res = await request.get(`${base}/api/admin/insurance/claims`);
    expect([401, 403]).toContain(res.status());
  });

  test("pre-auth API requires auth", async ({ request }) => {
    const res = await request.get(`${base}/api/admin/insurance/pre-authorizations`);
    expect([401, 403]).toContain(res.status());
  });

  test("reports API requires auth", async ({ request }) => {
    const res = await request.get(`${base}/api/admin/insurance/reports`);
    expect([401, 403]).toContain(res.status());
  });
});
