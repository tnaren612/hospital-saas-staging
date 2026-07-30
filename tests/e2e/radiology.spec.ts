import { expect, test } from "@playwright/test";

test("full radiology journey", async ({ page }) => {
  const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
  const email = process.env.E2E_ADMIN_EMAIL;
  const password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, "Staging administrator credentials required");

  await page.goto(`${base}/admin/login`);
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await Promise.all([
    page.waitForURL(/admin\/dashboard/),
    page.locator('button[type="submit"]').click(),
  ]);

  const phone = `902${Date.now().toString().slice(-7)}`;
  const patientResponse = await page.request.post(`${base}/api/admin/patients`, {
    headers: { origin: base },
    data: { full_name: "Radiology E2E Patient", phone, age: 43, gender: "other", address: "Staging" },
  });
  expect(patientResponse.status()).toBe(201);
  const patient = (await patientResponse.json()).data;

  await page.goto(`${base}/admin/radiology`);
  await page.getByLabel("Radiology patient").selectOption(patient.id);
  await page.getByLabel("Radiology modality").selectOption("ct");
  await page.getByLabel("Body part").fill("Chest");
  await page.getByLabel("Radiology priority").selectOption("urgent");
  await page.getByLabel("Clinical indication").fill("Persistent chest symptoms");
  await page.getByRole("button", { name: "Create radiology order" }).click();
  await expect(page.getByText("Radiology study ordered")).toBeVisible();

  const studyCard = page.locator('[class*="rounded-2xl"]').filter({ hasText: "Radiology E2E Patient" }).last();
  await expect(studyCard).toContainText("ordered");
  const scheduled = new Date(Date.now() + 86_400_000).toISOString().slice(0, 16);
  await studyCard.getByLabel(/^Schedule RAD-/).fill(scheduled);
  await studyCard.getByRole("button", { name: "Schedule", exact: true }).click();
  await expect(studyCard).toContainText("scheduled");
  await studyCard.getByRole("button", { name: "Check in" }).click();
  await expect(studyCard).toContainText("checked_in");
  await studyCard.getByRole("button", { name: "Start imaging" }).click();
  await expect(studyCard).toContainText("in_progress");
  await studyCard.getByRole("button", { name: "Complete imaging" }).click();
  await expect(studyCard).toContainText("completed");
  await studyCard.getByLabel(/^Findings RAD-/).fill("No acute cardiopulmonary abnormality.");
  await studyCard.getByLabel(/^Impression RAD-/).fill("No acute disease.");
  await studyCard.getByLabel(/^Recommendations RAD-/).fill("Clinical follow-up if symptoms persist.");
  await studyCard.getByRole("button", { name: "Finalize report" }).click();
  await expect(studyCard).toContainText("reported");
  await expect(studyCard).toContainText("No acute disease.");

  const report = await page.request.get(`${base}/api/radiology/report`);
  expect(report.status()).toBe(200);
  expect(report.headers()["content-type"]).toContain("text/csv");
  expect(await report.text()).toContain("Radiology E2E Patient");
});
