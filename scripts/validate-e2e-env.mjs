const required = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "E2E_ADMIN_EMAIL",
  "E2E_ADMIN_PASSWORD",
  "E2E_DOCTOR_EMAIL",
  "E2E_DOCTOR_PASSWORD",
  "E2E_PATIENT_EMAIL",
  "E2E_PATIENT_PASSWORD",
  "E2E_LAB_EMAIL",
  "E2E_LAB_PASSWORD",
  "E2E_RADIOLOGY_EMAIL",
  "E2E_RADIOLOGY_PASSWORD",
  "E2E_PHARMACY_EMAIL",
  "E2E_PHARMACY_PASSWORD",
  "E2E_RECEPTION_EMAIL",
  "E2E_RECEPTION_PASSWORD",
  "E2E_BILLING_EMAIL",
  "E2E_BILLING_PASSWORD",
  "E2E_FINANCE_EMAIL",
  "E2E_FINANCE_PASSWORD",
  "E2E_HR_EMAIL",
  "E2E_HR_PASSWORD",
  "E2E_MANAGER_EMAIL",
  "E2E_MANAGER_PASSWORD",
];

const missing = required.filter((name) => !process.env[name]?.trim());
if (missing.length) {
  console.error(
    `Credentialed regression is not configured. Missing ${missing.join(", ")}.`
  );
  process.exit(1);
}

console.log("Credentialed regression environment is complete.");
