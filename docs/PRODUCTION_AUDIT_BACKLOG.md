# Production Audit — Prioritized Backlog

**Date:** 2026-07-29  
**Scope:** Sri Srinivasa Hospital HMS (Next.js 14 + Supabase + Vercel)  
**Mode:** Audit complete · Critical + **High fixes applied 2026-07-29**  
**Sequence position:** Step 4 done → Step 5 Playwright / Step 6 docs

**Quality gates at audit time**

| Check | Result |
|-------|--------|
| TypeScript `tsc --noEmit` | Pass |
| ESLint `next lint` | Pass (0 warnings/errors) |
| Unit tests (last known) | 155/155 pass |
| Playwright E2E | Partial (`tests/e2e/payment-flow.spec.ts` only) |
| Migrations 026/027 on production | **Operator-applied only** — treat as incomplete until tenant-audit green |

---

## Executive summary

The multi-hospital config foundation is production-GO. Full `hospital_id` isolation is **in repository** (migrations 026/027 + app filters + unit proof), but **defense-in-depth is incomplete** until:

1. Migrations 026 + 027 are applied on Supabase and `GET /api/admin/tenant-audit` is green.
2. Service-role paths (payments, phase2, public appointments GET) filter by hospital and never dump PHI without auth.
3. Payment mock / unauthenticated cash-as-paid / unauthenticated invoice fetch are closed in production.

This backlog is ordered so **Critical** items prevent data leakage or payment fraud first.

---

## 1. Critical issues

| ID | Area | Finding | Evidence | Impact | Recommended fix (later) |
|----|------|---------|----------|--------|-------------------------|
| **C-01** | Tenant / RLS | Migrations 026/027/028 ready; **operator must apply** | ✅ Code ready · apply SQL manually | See CRITICAL_FIXES.md |
| **C-02** | Privacy / API | GET appointments phone PHI unauthenticated | ✅ **Fixed** — auth required; schedule-only public | `api/appointments/route.ts` |
| **C-03** | Payment / IDOR | Public invoice by id | ✅ **Fixed** — staff or owning patient | `api/invoices/[id]/route.ts` |
| **C-04** | Payment integrity | Mock verify in production | ✅ **Fixed** — `allowMockPayments()` fail-closed | production-guard, razorpay, stripe |
| **C-05** | Payment integrity | Public cash → paid + client amount | ✅ **Fixed** — staff cash; server fee resolve | payments/create + payment-service |
| **C-06** | Tenant RLS design | Admin global `same_hospital` | ✅ **Fixed** — no is_admin bypass (027/028) | migration 028 |
| **C-07** | Service role blast radius | Phase2 no hospital filter | ✅ **Fixed** — tenant opts on all phase2 paths | phase2/service + routes |

---

## 2. High issues

| ID | Area | Finding | Evidence | Impact | Recommended fix (later) |
|----|------|---------|----------|--------|-------------------------|
| **H-01** | Payments multi-tenant | listPayments/invoices/revenue no hospital filter | ✅ **Fixed** — hospitalId on list + revenue | HIGH_FIXES.md |
| **H-02** | Payments patient path | list-all then filter | ✅ **Fixed** — patient_id / meta phone query | history route |
| **H-03** | Tenant resolution trust | Client slug override | ✅ **Fixed** — host-first | resolve-tenant.ts |
| **H-04** | Authorization | /admin all staff | ✅ **Fixed** — settings/CMS admin + feature path gates | roles.ts |
| **H-05** | Authorization | payments/invoices unguarded | ✅ **Fixed** — ROUTE_GUARDS + public suffixes | roles.ts |
| **H-06** | Rate limiting | memory-only | ✅ **Fixed** — rateLimitAsync + optional Upstash | rate-limit.ts |
| **H-07** | Legacy tenant nulls | null hospital visible | ✅ **Fixed** — migration 029 + default deny | 029 sql |
| **H-08** | Refund ownership | no ownership check | ✅ **Fixed** | refund route |
| **H-09** | Duplicate booking race | no unique index | ✅ **Fixed** — migration 029 unique slot | 029 sql |
| **H-10** | CSRF | no origin check | ✅ **Fixed** — assertSameOrigin | csrf.ts |
| **H-11** | Health surface | provider recon public | ✅ **Fixed** — minimal public / deep auth | health route |
| **H-12** | Playwright | sparse E2E | ✅ **Fixed** — hospital-suite.spec.ts | tests/e2e |

---

## 3. Medium issues

| ID | Area | Finding | Evidence | Impact | Recommended fix (later) |
|----|------|---------|----------|--------|-------------------------|
| **M-01** | CSP | CSP allows `'unsafe-inline'` and `'unsafe-eval'` on scripts. | `next.config.mjs` | Weakens XSS defense | Nonces/hashes; remove unsafe-eval if possible |
| **M-02** | XSS | Multiple `dangerouslySetInnerHTML` (JSON-LD, carousel, FAQ). JSON.stringify for schema is lower risk; user-influenced HTML must stay sanitized. | layout, FAQ, testimonial-carousel, hero | Stored XSS if CMS HTML not escaped | Audit CMS fields; sanitize or avoid HTML |
| **M-03** | Prescription print | `document.write` with prescription fields in admin UI. | `prescription-manager.tsx` | XSS if medicine names not escaped | Escape all interpolated HTML |
| **M-04** | SQL injection | Supabase query builder is parameterized; low risk. Dynamic `.or()` with raw user strings should be avoided. | payments verify order id `.or(...)` | Edge injection if unsanitized | Validate UUIDs / order id format before `.or` |
| **M-05** | Indexes | `hospital_id` indexes in 027; composite indexes for common filters (date+doctor+hospital) may be missing on appointments queue. | migrations | Slow queue/list under load | Add composites after EXPLAIN on production |
| **M-06** | Service role in client-adjacent paths | Several libs create service clients; ensure tree-shaking never bundles key (server-only). | payments, phase2, hospital service | Accidental client import would leak key | `server-only` package import; lint rule |
| **M-07** | Auth rate limit | 10 attempts / 15 min per key is soft; no account lockout audit surface for operators. | `auth/rate-limit.ts` | Credential stuffing residual | Distributed limiter + auth_events dashboard |
| **M-08** | Email security | Contact email HTML escapes user input (good). Ensure SPF/DKIM/DMARC on production sending domain; avoid `onboarding@resend.dev` in prod. | `contact/route.ts` | Spoofing / deliverability | Verify domain; set EMAIL_FROM |
| **M-09** | Webhook secret fallback | Webhook HMAC may fall back to `RAZORPAY_KEY_SECRET` if webhook secret unset. | `razorpay.ts` | Weaker operational hygiene | Require dedicated `RAZORPAY_WEBHOOK_SECRET` in production |
| **M-10** | Accessibility | `lang="en"` set; emergency banner/header present. No formal a11y audit (WCAG). | layout | Screen reader / keyboard gaps | axe/Lighthouse a11y pass on key pages |
| **M-11** | SEO | robots.txt blocks admin/patient/api; sitemap exists; metadata solid for marketing. Multi-hospital SEO not dynamic per tenant brand. | `robots.ts`, `seo.ts` | Correct for single hospital; SaaS needs per-tenant metadata | Tenant-aware title/description/OG |
| **M-12** | Lighthouse | Not re-run in this audit. Prior hardening added compression, image formats, HSTS. | next.config | Unknown current scores | CI Lighthouse on production URL |
| **M-13** | Next.js | Next 14.2.35; `poweredByHeader: false`; good headers. Middleware matcher excludes static assets. | package.json, next.config | Stay patched | Track CVE advisories for next@14 |
| **M-14** | Supabase | Service role overused for convenience; RLS must be real second line. Profiles.hospital_id not enforced on all staff writes. | architecture | RLS bypass via app bugs | Prefer session client; service role only webhooks/cron |
| **M-15** | Env vars | Service role and secrets correctly non-`NEXT_PUBLIC_*`. No secrets in client code observed. Health reveals config booleans. | env.ts | Good baseline | Document required prod env matrix; fail deploy if mock payments possible |
| **M-16** | Demo cookie | Demo admin cookie path when Supabase not configured. Production has Supabase → lower risk. | middleware | Misconfig could open demo | Ensure production always has Supabase config |

---

## 4. Low issues

| ID | Area | Finding | Recommended fix (later) |
|----|------|---------|-------------------------|
| **L-01** | Docs | Phase docs lag behind isolation (PHASE15 still lists migrations only to 024). | Refresh PHASE15 + master checklist |
| **L-02** | Types | Some `any` / eslint-disable in admin filters. | Tighten types |
| **L-03** | Logging | Payment logs may include PII (phone). | Redact in production logs |
| **L-04** | Monitoring | Vitals + error routes exist; no uptime SLO documented. | Wire external uptime to `/api/health` (minimal body) |
| **L-05** | PWA | Service worker offline shell; ensure SW does not cache authenticated API responses. | Cache policy review |
| **L-06** | i18n | Translations exist; not full localization QA. | Optional |
| **L-07** | E2E secrets | Payment e2e needs test keys; document sandbox only. | CI secrets guide |
| **L-08** | Version | package `1.0.0` pre formal v1.0 release gate. | Bump after Steps 3–6 |

---

## Category coverage checklist

| Area | Status | Notes |
|------|--------|-------|
| Security | Audited | Critical PHI + payment issues |
| Authentication | Audited | Supabase session + password policy + rate limit (soft) |
| Authorization | Audited | RBAC matrix good; /admin too broad; payments unguarded |
| SQL injection | Audited | Low risk via Supabase client |
| XSS | Audited | CSP weak; some HTML sinks |
| CSRF | Audited | SameSite=Lax; no tokens on APIs |
| RLS coverage | Audited | Strong in migration SQL; production apply pending; admin bypass; service role bypass |
| Missing indexes | Audited | hospital_id indexes in 027; composites recommended |
| Slow queries | Partial | No live EXPLAIN; list-all payments pattern is anti-pattern |
| Accessibility | Partial | Baseline only |
| SEO | Audited | Marketing good; tenant SEO later |
| Lighthouse | Not re-run | Prior hardening present |
| TypeScript | Pass | |
| ESLint | Pass | |
| Next.js best practices | Mostly good | Headers, images, middleware |
| Supabase best practices | Gaps | Service role overuse |
| Payment security | Critical gaps | Mock, cash, IDOR invoice, amount trust |
| Email security | Mostly good | Escape HTML; domain config ops |
| Environment variables | Mostly good | Document fail-closed for payments |

---

## Suggested fix order (Step 3 → 4)

Do **not** fix until operator confirms. Recommended order:

### Critical first (Step 3)

1. **C-01** Apply 026 + 027; tenant-audit green  
2. **C-02** Lock down appointments GET (auth + minimal fields + hospital filter)  
3. **C-03** Authenticate invoice fetch / signed URLs  
4. **C-04** Disable mock payment verify in production  
5. **C-05** Cash payments staff-only; server-side amounts  
6. **C-06** Scope admin RLS to own hospital  
7. **C-07** Phase2 hospital_id on all service-role queries  

### High next (Step 4)

H-01 → H-12 in table order (payments tenant scope, patient history query, tenant slug trust, admin RBAC, rate limit, null hospital_id, refund ownership, unique slot, CSRF, health split, E2E).

### Then (roadmap)

- Step 5: Full Playwright suite  
- Step 6: Production documentation pack  
- Version 1.0 release  

---

## Explicit non-actions this audit

- No production data modified  
- No migration applied by agent  
- No code fixes shipped  
- No dependency upgrades  

---

## Sign-off

| Item | Value |
|------|-------|
| Audit type | Full production (code + architecture + security surface) |
| Fixes | **Deferred** (await “Fix every Critical issue”) |
| Next prompt | `Fix every Critical issue.` (C-01–C-07) |

**Overall security risk before Critical fixes:** **High** (PHI APIs + payment mock/cash + isolation not confirmed live).  
**After Critical fixes + 026/027 live:** Expected to move to **Medium**, then High backlog to **Low–Medium**.
