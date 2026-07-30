import { expect, test } from "@playwright/test";

test("complete inventory purchasing and stock journey", async ({ page }) => {
  const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";
  const email = process.env.E2E_ADMIN_EMAIL, password = process.env.E2E_ADMIN_PASSWORD;
  test.skip(!email || !password, "Staging administrator credentials required");
  await page.goto(`${base}/admin/login`);
  await page.locator('input[type="email"]').fill(email!);
  await page.locator('input[type="password"]').fill(password!);
  await Promise.all([page.waitForURL(/admin\/dashboard/), page.locator('button[type="submit"]').click()]);

  const suffix = Date.now().toString().slice(-7);
  await page.goto(`${base}/admin/inventory/categories`);
  await page.getByLabel("Category name").fill(`E2E Supplies ${suffix}`);
  await page.getByRole("button",{name:"Create category"}).click();
  await expect(page.getByText("Category created")).toBeVisible();

  await page.goto(`${base}/admin/inventory/suppliers`);
  await page.getByLabel("Supplier code").fill(`SUP-${suffix}`);
  await page.getByLabel("Supplier name").fill(`E2E Supplier ${suffix}`);
  await page.getByLabel("Supplier contact name").fill("Quality Manager");
  await page.getByLabel("Supplier contact email").fill(`supplier${suffix}@test.com`);
  await page.getByLabel("Supplier contact phone").fill("9876543210");
  await page.getByRole("button",{name:"Create supplier"}).click();
  await expect(page.getByText("Supplier created")).toBeVisible();

  await page.goto(`${base}/admin/inventory/items`);
  await page.getByLabel("Item code").fill(`ITM-${suffix}`);
  await page.getByLabel("Barcode").fill(`8901${suffix}`);
  await page.getByLabel("Item name").fill(`E2E Dressing ${suffix}`);
  await page.getByLabel("Unit").fill("piece");
  await page.getByLabel("Purchase price").fill("20");
  await page.getByLabel("Selling price").fill("30");
  await page.getByLabel("Reorder level").fill("8");
  await page.getByText("expiry tracking").click();
  await page.getByText("batch tracking").click();
  await page.getByRole("button",{name:"Create item"}).click();
  await expect(page.getByText("Item created")).toBeVisible();

  await page.goto(`${base}/admin/inventory/purchase-orders`);
  await page.getByLabel("PO supplier").selectOption({label:`E2E Supplier ${suffix}`});
  const locations = page.getByLabel("PO location");
  await expect.poll(()=>locations.locator("option").count()).toBeGreaterThanOrEqual(3);
  await locations.selectOption({index:1});
  await page.getByLabel("PO item").selectOption({label:`E2E Dressing ${suffix}`});
  await page.getByLabel("Order quantity").fill("20");
  await page.getByLabel("PO unit price").fill("20");
  await page.getByRole("button",{name:"Create purchase order"}).click();
  await expect(page.getByText("Purchase order created")).toBeVisible();
  await page.getByRole("button",{name:"Approve"}).first().click();
  await expect(page.getByText("Purchase order approved")).toBeVisible();

  await page.goto(`${base}/admin/inventory/goods-receipts`);
  await page.getByLabel("Purchase order").selectOption({index:1});
  await page.getByLabel("Receipt item").selectOption({label:`E2E Dressing ${suffix}`});
  await page.getByLabel("Receipt location").selectOption({index:1});
  await page.getByLabel("Received quantity").fill("10");
  await page.getByLabel("Receipt unit cost").fill("20");
  await page.getByLabel("Batch number").fill(`B-${suffix}`);
  await page.getByLabel("Expiry date").fill(new Date(Date.now()+30*86_400_000).toISOString().slice(0,10));
  await page.getByRole("button",{name:"Receive goods"}).click();
  await expect(page.getByText("Goods received")).toBeVisible();

  await page.goto(`${base}/admin/inventory/transfers`);
  await page.getByLabel("Movement item").selectOption({label:`E2E Dressing ${suffix}`});
  await page.getByLabel("From location").selectOption({index:1});
  await page.getByLabel("To location").selectOption({index:2});
  await page.getByLabel("Movement quantity").fill("2");
  await page.getByLabel("Transfer batch").fill(`B-${suffix}`);
  await page.getByRole("button",{name:"Complete transfer"}).click();
  await expect(page.getByText("Stock transferred")).toBeVisible();

  await page.goto(`${base}/admin/inventory/adjustments`);
  await page.getByLabel("Movement item").selectOption({label:`E2E Dressing ${suffix}`});
  await page.getByLabel("Adjustment location").selectOption({index:2});
  await page.getByLabel("Adjustment type").selectOption("damage");
  await page.getByLabel("Movement quantity").fill("1");
  await page.getByLabel("Adjustment reason").fill("Damaged during handling");
  await page.getByRole("button",{name:"Post adjustment"}).click();
  await expect(page.getByText("Stock adjusted")).toBeVisible();

  const stockReport = await page.request.get(`${base}/api/inventory/report?type=stock`);
  expect(stockReport.status()).toBe(200);
  expect(await stockReport.text()).toContain(`E2E Dressing ${suffix}`);
  const expiryReport = await page.request.get(`${base}/api/inventory/report?type=expiry`);
  expect(expiryReport.status()).toBe(200);
  expect(await expiryReport.text()).toContain(`B-${suffix}`);
});
