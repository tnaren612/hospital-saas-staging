# Security Best-Practices Report

**Date:** 2026-07-29  
**Stack:** Next.js 14, React 18, TypeScript, Supabase/PostgreSQL, Razorpay/Stripe  
**Mode:** Active review and targeted hardening

## 2026-07-29 hardening update

- **SEC-007 fixed:** Stripe redirects now require HTTPS and an allowlisted
  `stripe.com` checkout host before browser navigation.
- **SEC-010 fixed in migration:** anonymous callers could query
  `hospital_settings` directly and bypass the redacted public API. Migration
  `031_protect_hospital_settings.sql` removes anonymous table access and scopes
  authenticated access to the current tenant administrator.
- **SEC-011 open — High:** `npm audit --omit=dev` confirms High-severity
  advisories in the current Next.js/PostCSS dependency tree. A test upgrade to
  Next.js 15.5.21 caused 26 request-API type incompatibilities and still retained
  newer PostCSS/Sharp findings, so it was reverted. This requires a dedicated
  framework migration with async `cookies()`/`headers()` conversion and complete
  regression testing. Production deployment remains blocked.

## Executive summary

The repository has a good baseline: Supabase session validation, RBAC route guards, CSRF origin checks, rate limiting, Zod validation, payment signature verification, production mock-payment guards, tenant-aware migrations, and security headers. No committed `.env.local` file or obvious browser-exposed service-role key was found.

No confirmed critical vulnerability was found during this repository-only review. Two high-impact HTML injection paths should be fixed before production, and several medium hardening and operational issues remain.

## High severity

### SEC-001 — Stored HTML/script injection in prescription printing — Fixed

- **Rule ID:** JS-XSS-002
- **Severity:** High
- **Location:** `src/components/admin/hms/prescription-manager.tsx`, `printRx`, lines 87–125
- **Evidence:** Prescription, patient, doctor, diagnosis, medicine, notes, and follow-up fields are interpolated directly into a string passed to `win.document.write`.
- **Impact:** A malicious or compromised stored field could execute script in a staff user's browser when a prescription is printed.
- **Resolution:** Every interpolated prescription field is HTML-escaped through
  `escapeHtml`. A server-generated PDF remains the preferred long-term design.
- **Mitigation:** Restrict who can write prescription fields and deploy a strict CSP, but do not treat CSP as the primary fix.
- **False-positive notes:** Exploitability depends on whether every stored field is guaranteed to be sanitized before persistence. No such end-to-end guarantee was established.

### SEC-002 — Generic report export writes caller-provided HTML — Fixed

- **Rule ID:** JS-XSS-001 / JS-XSS-002
- **Severity:** High
- **Location:** `src/lib/hms/export.ts`, `printHtmlReport`, lines 59–76
- **Evidence:** Both `title` and `tableHtml` are inserted into a document string passed to `document.write`.
- **Impact:** Any report field reaching `tableHtml` without complete escaping can execute script in a privileged staff browser.
- **Resolution:** Report headers, values, and titles are HTML-escaped.
  CSV/Excel cells with formula prefixes are neutralized. Regression tests are in
  `tests/unit/hms-export-security.test.ts`.
- **Mitigation:** Limit report data sources to trusted database fields and open the print view under a constrained origin.
- **False-positive notes:** Call-site construction must be traced to determine which report fields are attacker-controlled; the sink itself remains unsafe.

## Medium severity

### SEC-003 — CSP permits unsafe script execution

- **Rule ID:** JS-CSP-001
- **Severity:** Medium
- **Location:** `next.config.mjs`, lines 68–82
- **Evidence:** `script-src` contains both `'unsafe-inline'` and `'unsafe-eval'`.
- **Impact:** These directives materially weaken CSP protection against XSS.
- **Fix:** Remove `'unsafe-eval'`, then migrate inline scripts to nonces or hashes. Test Razorpay, analytics, and Next.js runtime behavior under the tightened policy.
- **Mitigation:** Keep `object-src 'none'`, `base-uri 'self'`, `frame-ancestors 'none'`, and `form-action 'self'`, which are already present.
- **False-positive notes:** Third-party integrations may require carefully scoped allowances, but that does not justify a global unsafe-eval policy without verification.

### SEC-004 — Demo authentication fails open when Supabase configuration is absent

- **Rule ID:** NEXT-AUTHZ-001
- **Severity:** Medium
- **Location:** `src/lib/supabase/middleware.ts`, lines 116–154
- **Evidence:** A client-supplied cookie value `ssh_admin_demo=1` grants access to protected demo routes when Supabase is not configured.
- **Impact:** A production environment deployed without Supabase variables could expose administrative demo paths.
- **Fix:** Disable demo authentication whenever `NODE_ENV=production` or `VERCEL_ENV=production`; fail startup/deployment if required auth configuration is absent.
- **Mitigation:** Add a CI/deployment environment assertion and an automated negative test.
- **False-positive notes:** Correctly configured production currently takes the Supabase branch, reducing likelihood but not misconfiguration impact.

### SEC-005 — Service-role modules lack explicit server-only boundaries

- **Rule ID:** NEXT-SECRETS-001
- **Severity:** Medium
- **Location:** Multiple modules under `src/lib/payments`, `src/lib/hospital`, `src/lib/auth`, and notification storage; no `server-only` import was found
- **Evidence:** These modules read `SUPABASE_SERVICE_ROLE_KEY`, but the repository has no explicit `import "server-only"` marker.
- **Impact:** A future client-component import could cause a build-time leak or unsafe architectural coupling.
- **Fix:** Add `server-only` boundaries to every module that accesses the service role or provider secrets and enforce this through lint/import rules.
- **Mitigation:** Keep secret variables free of the `NEXT_PUBLIC_` prefix, as the project already does.
- **False-positive notes:** Next.js normally prevents direct server environment values from being embedded, but explicit boundaries provide a safer and more maintainable guarantee.

### SEC-006 — Production tenant isolation is not verified live

- **Rule ID:** NEXT-AUTHZ-001 / NEXT-CACHE-001
- **Severity:** Medium
- **Location:** `supabase/migrations/026_*` through `029_*`; `docs/SECURITY_TENANT_RLS.md`
- **Evidence:** Documentation still instructs an operator to apply migration 026 and run `/api/admin/tenant-audit`; repository presence does not prove production application.
- **Impact:** If production migrations lag, cross-hospital data isolation or appointment uniqueness controls may be absent.
- **Fix:** Apply migrations in order, record migration state, run tenant-audit, and execute real cross-tenant negative tests.
- **Mitigation:** Continue applying hospital filters in application queries even after RLS is verified.
- **False-positive notes:** The migrations may already be live, but this could not be verified from the repository.

### SEC-007 — Browser redirect accepts any string beginning with `http`

- **Rule ID:** JS-URL-001
- **Severity:** Medium
- **Location:** `src/components/payments/payment-options.tsx`, lines 183–189
- **Evidence:** `gateway.checkoutHint?.startsWith("http")` is the only validation before assigning `window.location.href`.
- **Impact:** If the API response or upstream payment data is compromised, users could be redirected to an attacker-controlled HTTP(S) origin.
- **Fix:** Parse with `new URL`, require `https:`, and allowlist Stripe's checkout origins or a same-origin callback.
- **Mitigation:** Validate the redirect URL on the server before returning it.
- **False-positive notes:** The current server adapter may always generate a trusted Stripe URL; defense-in-depth should still be explicit at both boundaries.

## Low severity / operational hardening

### SEC-008 — Sensitive data may appear in logs

- **Rule ID:** NEXT-LOG-001
- **Severity:** Low
- **Location:** Notification mock providers and several server error paths
- **Evidence:** Mock email/SMS providers log recipient identifiers and message content; payment and notification loggers emit structured event details.
- **Impact:** Development or aggregated logs may retain patient identifiers or message content longer than intended.
- **Fix:** Centralize structured logging with PHI/secret redaction, environment-aware verbosity, retention limits, and access controls.

### SEC-009 — Dependency vulnerability state was not verified

- **Rule ID:** Dependency hygiene
- **Severity:** Low / Unknown
- **Location:** `package.json`, `package-lock.json`
- **Evidence:** Outbound HTTPS is unavailable on this machine, so the current advisory database could not be queried.
- **Impact:** Known vulnerable packages may remain undetected.
- **Fix:** Run `npm audit --omit=dev` and a maintained software-composition scan in connected CI, then review rather than blindly applying breaking upgrades.

## Positive controls confirmed

- `.env.local` is not tracked.
- Service-role and provider secrets are not named with `NEXT_PUBLIC_`.
- Middleware calls Supabase `auth.getUser()` for protected production paths.
- Role/path authorization helpers and negative unit tests exist.
- CSRF same-origin checks and auth rate-limit tests exist.
- Razorpay checkout and webhook HMAC tests exist.
- Production runtime rejects mock payment completion.
- Security headers include frame denial, content-type sniffing prevention, referrer policy, permissions policy, HSTS, COOP, CSP, and frame ancestors.
- Public health output is minimal and deep health requires authentication.
- Invoice and appointment PHI access have explicit authorization tests.

## Recommended remediation order

1. Fix SEC-001 and SEC-002.
2. Verify SEC-006 in the production database.
3. Fail closed on missing production auth configuration (SEC-004).
4. Tighten CSP and redirect validation (SEC-003 and SEC-007).
5. Add server-only boundaries and centralized redacted logging.
6. Run connected dependency, dynamic, and live OWASP testing.
