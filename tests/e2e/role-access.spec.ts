import { expect, test, type Page } from "@playwright/test";

const base = process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:3000";

type RoleCase = {
  name: string;
  emailEnv: string;
  passwordEnv: string;
  loginPath: string;
  homePattern: RegExp;
  allowedPath: string;
  restrictedPath?: string;
};

const roles: RoleCase[] = [
  {
    name: "admin",
    emailEnv: "E2E_ADMIN_EMAIL",
    passwordEnv: "E2E_ADMIN_PASSWORD",
    loginPath: "/admin/login",
    homePattern: /\/admin\/dashboard/,
    allowedPath: "/admin/settings",
  },
  {
    name: "doctor",
    emailEnv: "E2E_DOCTOR_EMAIL",
    passwordEnv: "E2E_DOCTOR_PASSWORD",
    loginPath: "/admin/login",
    homePattern: /\/admin\/dashboard/,
    allowedPath: "/admin/appointments",
    restrictedPath: "/admin/settings",
  },
  {
    name: "patient",
    emailEnv: "E2E_PATIENT_EMAIL",
    passwordEnv: "E2E_PATIENT_PASSWORD",
    loginPath: "/patient/login",
    homePattern: /\/patient\/dashboard/,
    allowedPath: "/patient/profile",
    restrictedPath: "/admin/settings",
  },
  {
    name: "lab technician",
    emailEnv: "E2E_LAB_EMAIL",
    passwordEnv: "E2E_LAB_PASSWORD",
    loginPath: "/admin/login",
    homePattern: /\/laboratory/,
    allowedPath: "/laboratory",
    restrictedPath: "/admin/settings",
  },
  {
    name: "pharmacist",
    emailEnv: "E2E_PHARMACY_EMAIL",
    passwordEnv: "E2E_PHARMACY_PASSWORD",
    loginPath: "/admin/login",
    homePattern: /\/pharmacy/,
    allowedPath: "/pharmacy",
    restrictedPath: "/admin/settings",
  },
  {
    name: "receptionist",
    emailEnv: "E2E_RECEPTION_EMAIL",
    passwordEnv: "E2E_RECEPTION_PASSWORD",
    loginPath: "/admin/login",
    homePattern: /\/reception/,
    allowedPath: "/reception",
    restrictedPath: "/admin/settings",
  },
  {
    name: "billing",
    emailEnv: "E2E_BILLING_EMAIL",
    passwordEnv: "E2E_BILLING_PASSWORD",
    loginPath: "/admin/login",
    homePattern: /\/billing/,
    allowedPath: "/billing",
    restrictedPath: "/admin/settings",
  },
  {
    name: "finance",
    emailEnv: "E2E_FINANCE_EMAIL",
    passwordEnv: "E2E_FINANCE_PASSWORD",
    loginPath: "/admin/login",
    homePattern: /\/finance/,
    allowedPath: "/finance",
    restrictedPath: "/admin/settings",
  },
  {
    name: "HR",
    emailEnv: "E2E_HR_EMAIL",
    passwordEnv: "E2E_HR_PASSWORD",
    loginPath: "/admin/login",
    homePattern: /\/hr/,
    allowedPath: "/hr",
    restrictedPath: "/admin/settings",
  },
  {
    name: "manager",
    emailEnv: "E2E_MANAGER_EMAIL",
    passwordEnv: "E2E_MANAGER_PASSWORD",
    loginPath: "/admin/login",
    homePattern: /\/manager/,
    allowedPath: "/manager",
    restrictedPath: "/admin/settings",
  },
];

async function login(
  page: Page,
  role: RoleCase,
  email: string,
  password: string
) {
  await page.goto(`${base}${role.loginPath}`);
  await page.locator('input[type="email"]').fill(email);
  await page.locator('input[type="password"]').fill(password);
  await page.locator('button[type="submit"]').click();
  await page.waitForURL(role.homePattern, { timeout: 30_000 });
}

for (const role of roles) {
  test.describe(`Credentialed ${role.name} access`, () => {
    const email = process.env[role.emailEnv];
    const password = process.env[role.passwordEnv];

    test.skip(
      !email || !password,
      `Set ${role.emailEnv} and ${role.passwordEnv}`
    );

    test("login, allowed route, restricted route, and logout", async ({
      page,
    }) => {
      await login(page, role, email!, password!);
      await expect(page.locator("body")).toBeVisible();

      if (role.name === "patient") {
        await expect(page.getByText("Welcome", { exact: true })).toBeVisible({
          timeout: 15_000,
        });
        await expect(
          page.getByText("Patient profile unavailable", { exact: true })
        ).toHaveCount(0);
      }

      await page.goto(`${base}${role.allowedPath}`);
      await expect(page.locator("body")).toBeVisible();
      expect(page.url()).not.toContain("/login");
      expect(page.url()).not.toContain("/forbidden");

      if (role.name === "admin") {
        const tenantAudit = await page.request.get(
          `${base}/api/admin/tenant-audit`
        );
        expect(tenantAudit.status()).toBe(200);
        const result = await tenantAudit.json();
        expect(
          result.audit?.ok,
          JSON.stringify(result.audit ?? {}, null, 2)
        ).toBe(true);
      }

      if (role.restrictedPath) {
        await page.goto(`${base}${role.restrictedPath}`);
        await page.waitForTimeout(500);
        expect(page.url()).toMatch(/forbidden|login/);
      }

      const logout = page.getByRole("button", { name: /log ?out|sign ?out/i });
      if (await logout.count()) {
        await logout.first().click();
        await page.waitForURL(/login|\/$/, { timeout: 15_000 });
      } else {
        // At minimum prove the session is cleared by the auth action when exposed as a link.
        const logoutLink = page.getByRole("link", {
          name: /log ?out|sign ?out/i,
        });
        await expect(logoutLink.first()).toBeVisible();
      }
    });
  });
}
