# Playwright Test Plan

## Current state

Three suites define 40 tests. The non-credentialed run produced 29 passes and
11 credentialed skips. Separate credentialed runs passed for ten roles; the
admin tenant-audit assertion correctly fails because live tenant data is not green.

## Matrix

For each role:

1. Login, refresh, logout, reset path.
2. Correct home redirect, sidebar, widgets, profile, notifications.
3. Allowed page/API operations.
4. Denied page/API operations for every other role.
5. Tenant A cannot read/write Tenant B.
6. Mobile and desktop visual/interaction smoke.
7. No console, hydration, failed request, or accessibility violations.

`tests/e2e/role-access.spec.ts` supplies the credentialed login, allowed-route,
restricted-route, and logout foundation. Credentials are read only from
`E2E_<ROLE>_EMAIL` and `E2E_<ROLE>_PASSWORD` environment variables.

## Workflow scenarios

Appointment, walk-in, consultation, prescription, lab upload/download, pharmacy dispense/stock, bill/invoice, payment/refund, notifications, CMS, finance, HR, reports/export, and settings.

## Prerequisites

- Install pinned Chromium, Firefox, and WebKit.
- For a local machine with system Chrome, set `PLAYWRIGHT_CHANNEL=chrome`;
  CI should continue installing the pinned Playwright browsers.
- Use a dedicated non-production Supabase project.
- Seed all roles including reception, billing, finance, HR, and manager.
- Provide sandbox provider credentials.
- Reset test data idempotently between runs.
- Enable the currently commented E2E CI job.
