# High Issues Fixed (H-01 … H-12)

**Date:** 2026-07-29  
**Source:** [PRODUCTION_AUDIT_BACKLOG.md](./PRODUCTION_AUDIT_BACKLOG.md)

---

| ID | Fix summary | Key files |
|----|-------------|-----------|
| **H-01** | `listPayments` / `listInvoices` / `getRevenue` / analytics accept `hospitalId`; admin history + invoice list stamp tenant | `payment-service.ts`, `payments/history`, `invoices/route` |
| **H-02** | Patient history queries by `patient_id` or `meta->>patient_phone` — no list-300-then-filter | `payments/history/route.ts` |
| **H-03** | Host map first; query/header override only when `allowClientOverride` / `TENANT_ALLOW_QUERY_OVERRIDE` / non-prod; httpOnly cookie | `resolve-tenant.ts`, middleware |
| **H-04** | Settings/CMS/tenant-audit = admin only; `featureForAdminPath` + `canAccessFeature` on `/admin` paths | `roles.ts` |
| **H-05** | `/api/payments` + `/api/invoices` in `ROUTE_GUARDS`; public: create/verify/webhook | `roles.ts`, middleware `isApi` |
| **H-06** | `rateLimitAsync` + optional Upstash Redis (`UPSTASH_REDIS_REST_URL` / `TOKEN`); auth reuses shared limiter | `rate-limit.ts`, `auth/rate-limit.ts` |
| **H-07** | Migration **029**: `same_hospital` requires non-null match; isolation helper default `allowLegacyNull=false` | `029_…sql`, `isolation.ts` |
| **H-08** | Refund request verifies patient owns payment (patient_id / phone / invoice) | `payments/refund/route.ts` |
| **H-09** | Migration **029**: unique partial index active appointment slots | `029_…sql` |
| **H-10** | `assertSameOrigin` + `requireSameOriginForMutation` on staff refunds / cash create | `csrf.ts`, `hms/server.ts` |
| **H-11** | Public `/api/health` minimal; `?deep=1` requires staff | `health/route.ts` |
| **H-12** | Playwright suite `tests/e2e/hospital-suite.spec.ts` | e2e |

---

## Operator apply

```text
Supabase SQL Editor → run migration 029 after 027/028
Optional: set UPSTASH_REDIS_REST_URL + UPSTASH_REDIS_REST_TOKEN for multi-instance rate limits
Production: do NOT set TENANT_ALLOW_QUERY_OVERRIDE=true unless admin preview needed
```

---

## Tests

- Unit: isolation, CSRF, RBAC path features, tenant resolve
- E2E: `npx playwright test tests/e2e`
