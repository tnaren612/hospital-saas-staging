# Next.js Modernization Compatibility Assessment

**Assessment date:** 2026-07-29  
**Stable baseline:** Next.js 14.2.35, React 18.3.1, TypeScript 5.9.3  
**Target:** Next.js 15.5.21 Maintenance LTS first; Next.js 16 only after a
separate second assessment.

## Decision

Do not upgrade the stable working tree yet. A controlled test installation of
Next.js 15.5.21 produced 26 TypeScript failures caused by asynchronous request
APIs. It was reverted and the Next.js 14 build was revalidated.

## Compatibility matrix

| Area | Current | Next.js 15 target | Status | Required work |
|---|---|---|---|---|
| React | 18.3.1 | React 19 | Blocked | Run React 19 and types codemods; validate forms, refs, error reporting, Strict Mode |
| `cookies()` | Synchronous in 7 modules | Async | Blocked | Await cookie store and make callers async |
| `headers()` | Synchronous in 4 modules | Async | Blocked | Await headers and propagate async signatures |
| Dynamic route `params` | Synchronous object in pages/routes | Promise-based migration path | Blocked | Convert page, metadata, and route contexts |
| `searchParams` | Synchronous page props where used | Promise-based migration path | Review | Convert affected page props |
| Fetch caching | Next 14 defaults | Uncached by default | Review | Explicitly classify public cacheable and private no-store fetches |
| Route GET caching | Existing behavior | Uncached by default | Review | Preserve intentional public caching only |
| Lint | `next lint` | Deprecated in 15.5 | Blocked | Add standalone ESLint configuration and script |
| Middleware | Edge-compatible middleware | Supported | Conditional | Re-test Supabase cookies, tenant headers, redirects, cache behavior |
| Server Components | Next 14 App Router | React 19/Next 15 | Conditional | Validate async data, errors, streaming, hydration |
| Supabase SSR | 0.12.3 | 0.12.4 available | Low risk | Upgrade separately and rerun auth/session suites |
| CSP/third parties | Next/Razorpay/analytics allowances | Same integrations | Review | Remove `unsafe-eval`; move inline data scripts toward nonce/hash policy |
| Images | Next Image with remote patterns | Changed patched runtime | Review | Verify remote tenant images, SVG handling, cache limits |

## Confirmed async request-API impact

The trial upgrade found failures in:

- `src/lib/auth/actions.ts`
- `src/lib/hms/server.ts`
- `src/lib/hospital/tenant.ts`
- `src/lib/hospital/require-module.ts`
- `src/lib/supabase/server.ts`
- `src/app/admin/page.tsx`
- `src/app/admin/(protected)/layout.tsx`
- `src/app/api/hospital/config/route.ts`
- `src/app/api/admin/appointments/route.ts`
- `src/app/api/admin/appointments/[id]/route.ts`

Dynamic `params` also require review in doctor, blog, package, invoice,
department, availability, patient, and appointment routes.

## Migration plan

1. Create an isolated migration branch/worktree from the validated stable state.
2. Upgrade React 18.3 and resolve every deprecation warning before React 19.
3. Convert `cookies()`, `headers()`, `params`, and `searchParams` to async forms
   while still on Next.js 14 where source-compatible.
4. Replace `next lint` with standalone ESLint.
5. Add cache-intent tests for public configuration, tenant CMS, authentication,
   patient data, and admin APIs.
6. Upgrade React, React DOM, and type packages to React 19.
7. Upgrade Next.js and `eslint-config-next` to 15.5.21.
8. Run typecheck, unit, integration, API, Playwright role suites, accessibility,
   production build, and dependency audit.
9. Compare response headers, cookies, redirects, middleware routing, RSC cache
   behavior, bundle sizes, and Web Vitals with baseline.
10. Merge only when no Critical/High findings or workflow regressions remain.

## Estimated effort

- Async request API and route-prop migration: 2–4 engineering days.
- React 19 compatibility and third-party UI validation: 2–3 days.
- Cache/middleware/auth regression testing: 2–4 days.
- Accessibility, browser, performance, and production-build verification:
  2–3 days.
- Total: approximately 8–14 focused engineering days, excluding discovered
  workflow defects.

## Risks

- Authentication cookies or tenant routing can fail silently.
- Changed caching defaults can cause latency regressions or stale/public data
  behavior changes.
- React 19 can expose lifecycle, ref, hydration, and form-action assumptions.
- Image optimization and third-party checkout scripts can regress under updated
  runtime/CSP behavior.
- A package-only upgrade can compile while breaking role workflows.

## Rollback strategy

- Preserve Next.js 14.2.35 and React 18.3.1 in the stable branch.
- Keep all request-API conversions in small reviewable commits.
- Tag the last validated baseline and retain its lockfile.
- Do not run destructive database migrations as part of the framework upgrade.
- Roll back application code and lockfile together if any acceptance gate fails.

## Approval gate

Upgrade execution requires approval of this plan and an isolated migration
branch/worktree. The current branch must remain on Next.js 14 until then.

