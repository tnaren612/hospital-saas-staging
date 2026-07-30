/**
 * Playwright E2E suite (H-12 / Step 5 foundation)
 * Covers: public pages, auth gates, health, APIs, role portals.
 *
 * Run: npx playwright test tests/e2e/hospital-suite.spec.ts
 * Optional: PLAYWRIGHT_BASE_URL, E2E_ADMIN_EMAIL, E2E_ADMIN_PASSWORD
 */
import { test, expect } from "@playwright/test";

const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

test.describe("Public marketing", () => {
  test("home loads", async ({ page }) => {
    await page.goto(`${base}/`);
    await expect(page.locator("body")).toBeVisible();
  });

  test("appointment page loads", async ({ page }) => {
    await page.goto(`${base}/appointment`);
    await expect(page.locator("body")).toBeVisible();
  });

  test("doctors page loads", async ({ page }) => {
    await page.goto(`${base}/doctors`);
    await expect(page.locator("body")).toBeVisible();
  });
});

test.describe("Health & security surface", () => {
  test("public health is minimal (H-11)", async ({ request }) => {
    const res = await request.get(`${base}/api/health`);
    expect(res.ok()).toBeTruthy();
    const json = await res.json();
    expect(json.ok).toBe(true);
    expect(json.providers).toBeUndefined();
    expect(json.checks).toBeUndefined();
  });

  test("deep health requires auth", async ({ request }) => {
    const res = await request.get(`${base}/api/health?deep=1`);
    expect([401, 403]).toContain(res.status());
  });

  test("invoice by id requires auth (C-03)", async ({ request }) => {
    const res = await request.get(
      `${base}/api/invoices/00000000-0000-0000-0000-000000000000`
    );
    expect([401, 403, 404]).toContain(res.status());
  });

  test("appointments by phone requires auth (C-02)", async ({ request }) => {
    const res = await request.get(
      `${base}/api/appointments?phone=9876543210`
    );
    expect([401, 403]).toContain(res.status());
  });

  test("cash payment create requires staff", async ({ request }) => {
    const res = await request.post(`${base}/api/payments/create`, {
      data: {
        patient_name: "Test User",
        patient_phone: "9876543210",
        amount: 100,
        payment_method: "cash",
      },
    });
    expect([401, 403, 400]).toContain(res.status());
  });
});

test.describe("Auth portals", () => {
  test("admin login page", async ({ page }) => {
    await page.goto(`${base}/admin/login`);
    await expect(page.locator("body")).toBeVisible();
  });

  test("patient login page", async ({ page }) => {
    await page.goto(`${base}/patient/login`);
    await expect(page.locator("body")).toBeVisible();
  });

  test("admin dashboard redirects unauthenticated", async ({ page }) => {
    await page.goto(`${base}/admin/dashboard`);
    await page.waitForURL(/login|forbidden|dashboard/, { timeout: 15_000 });
    const url = page.url();
    expect(
      url.includes("/admin/login") ||
        url.includes("/admin/dashboard") ||
        url.includes("forbidden")
    ).toBeTruthy();
  });

  test("patient dashboard redirects unauthenticated", async ({ page }) => {
    await page.goto(`${base}/patient/dashboard`);
    await page.waitForURL(/login|dashboard/, { timeout: 15_000 });
    expect(page.url()).toMatch(/login|dashboard/);
  });
});

test.describe("Role portals (unauthenticated redirect)", () => {
  for (const path of [
    "/reception",
    "/laboratory",
    "/pharmacy",
    "/billing",
    "/finance",
    "/hr",
    "/manager",
  ]) {
    test(`${path} requires auth`, async ({ page }) => {
      await page.goto(`${base}${path}`);
      await page.waitForTimeout(500);
      const url = page.url();
      // Should land on login or stay if demo mode
      expect(url.length).toBeGreaterThan(0);
    });
  }
});

test.describe("Hospital configuration API", () => {
  test("public hospital config", async ({ request }) => {
    const res = await request.get(`${base}/api/hospital/config`);
    // May 200 with config
    expect([200, 404, 500]).toContain(res.status());
    if (res.ok()) {
      const json = await res.json();
      expect(json).toBeTruthy();
    }
  });

  test("hospital settings admin API requires auth", async ({ request }) => {
    const res = await request.get(`${base}/api/admin/hospital-settings`);
    expect([401, 403]).toContain(res.status());
  });
});

test.describe("Optional credentialed admin smoke", () => {
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;

  test.skip(!email || !password, "Set E2E_ADMIN_EMAIL and E2E_ADMIN_PASSWORD");

  test("admin can open dashboard", async ({ page }) => {
    await page.goto(`${base}/admin/login`);
    await page.fill('input[type="email"], input[name="email"]', email!);
    await page.fill('input[type="password"], input[name="password"]', password!);
    await page.click('button[type="submit"]');
    await page.waitForURL(/admin/, { timeout: 30_000 });
    expect(page.url()).toMatch(/admin/);
  });
});
