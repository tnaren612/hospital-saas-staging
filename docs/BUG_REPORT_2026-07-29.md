# Verified Bug Report

## Fixed

### BUG-001 — Prescription print stored-XSS risk

- Severity: High
- Root cause: Unescaped prescription fields interpolated into `document.write`.
- Fix: HTML-escape every dynamic field.
- Test: `hms-export-security.test.ts`.
- Performance impact: Negligible.

### BUG-002 — Report print HTML and spreadsheet formula injection

- Severity: High
- Root cause: Raw report headers/values and formula prefixes entered export sinks.
- Fix: HTML escaping and spreadsheet formula neutralization.
- Test: `hms-export-security.test.ts`.
- Performance impact: Negligible.

### BUG-003 — Local Playwright could not use installed Chrome

- Severity: Medium (test infrastructure)
- Root cause: Configuration required a downloaded Playwright Chromium binary.
- Fix: Optional `PLAYWRIGHT_CHANNEL=chrome`.
- Result: Browser baseline changed from infrastructure failure to 29 passes.

### BUG-004 — Missing operational role test users

- Severity: Medium (test data)
- Root cause: Reception, billing, finance, HR, and manager users did not exist.
- Fix: Idempotent service-role seed with random ignored credentials and tenant assignment.
- Result: All five credentialed RBAC smoke tests pass.

## Open

### BUG-005 — Live tenant audit fails

- Severity: Critical
- Root cause: Legacy clinical and identity rows were not backfilled with `hospital_id`; migration state is incomplete or drifted.
- Evidence:
  - appointments: 39/39 null
  - hospital_doctors: 3/3 null
  - hospital_patients: 2/2 null
  - profiles: 5/11 null
  - departments: audit query error
- Impact: Tenant isolation cannot receive production sign-off.
- Safe fix: Take and verify a database backup, verify migration ledger, apply
  migrations 026–029 in order, backfill only after mapping legacy rows to the
  correct hospital, run tenant audit and cross-tenant negative tests.
- Risk: Blind backfill could assign PHI to the wrong hospital.

### BUG-006 — Production admin and super-admin validation unavailable

- Severity: Medium
- Root cause: Production admin password and super-admin test account were not supplied.
- Impact: Privileged-role workflows and escalation boundaries are not proven.
