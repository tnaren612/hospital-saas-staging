import { expect, test } from "@playwright/test";

const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
const adminEmail = process.env.E2E_ADMIN_EMAIL;
const adminPassword = process.env.E2E_ADMIN_PASSWORD;
const doctorEmail = process.env.E2E_DOCTOR_EMAIL;
const doctorPassword = process.env.E2E_DOCTOR_PASSWORD;

test("doctor creates and completes a tenant encounter", async ({ page }) => {
  test.skip(!adminEmail || !adminPassword || !doctorEmail || !doctorPassword, "Credentialed staging users required");
  await page.goto(`${base}/admin/login`);
  await page.locator('input[type="email"]').fill(adminEmail!);
  await page.locator('input[type="password"]').fill(adminPassword!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/dashboard/);

  const phone = `900${Date.now().toString().slice(-7)}`;
  const patientResponse = await page.request.post(`${base}/api/admin/patients`, {
    headers: { origin: base },
    data: { full_name: "Encounter E2E Patient", phone, age: 40, gender: "other", address: "Staging" },
  });
  expect(patientResponse.status()).toBe(201);

  await Promise.all([
    page.waitForURL(/\/admin\/login|\/$/),
    page.getByRole("button", { name: /log ?out/i }).click(),
  ]);
  await page.goto(`${base}/admin/login`);
  await page.locator('input[type="email"]').fill(doctorEmail!);
  await page.locator('input[type="password"]').fill(doctorPassword!);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(/\/admin\/dashboard/);
  await page.goto(`${base}/admin/encounters`);

  await page.getByLabel("Patient").selectOption({ label: `Encounter E2E Patient · ${phone}` });
  await page.getByText("Chief complaint").locator("..").getByRole("textbox").fill("Persistent cough");
  await page.getByText("Primary diagnosis").locator("..").getByRole("textbox").fill("Upper respiratory infection");
  await page.getByLabel("SpO2").fill("97");
  await page.getByRole("button", { name: "Start encounter" }).click();
  await expect(page.getByText("Encounter started")).toBeVisible();
  await expect(page.getByText("Persistent cough")).toBeVisible();
  await page.getByRole("button", { name: "Complete" }).first().click();
  await expect(page.getByText("Encounter completed")).toBeVisible();
});
