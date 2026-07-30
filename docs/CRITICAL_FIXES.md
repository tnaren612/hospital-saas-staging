# Critical Fixes (C-01 … C-07)

**Date:** 2026-07-29  
**Status:** Implemented in repository  
**Source audit:** [PRODUCTION_AUDIT_BACKLOG.md](./PRODUCTION_AUDIT_BACKLOG.md)

---

## C-01 — Tenant isolation migrations (operator)

**Code:** Migrations ready: `026`, `027` (tightened), **`028_critical_tenant_admin_scope.sql`**

**Operator apply (manual — no auto prod mutation):**

```text
1. Supabase Dashboard → SQL Editor
2. Run 026 (if not already)
3. Run 027
4. Run 028 (admin no longer global)
5. GET /api/admin/tenant-audit → nullHospitalRows ≈ 0
6. Deploy this app version
```

---

## C-02 — Appointments GET PHI lock-down

| Path | Behavior |
|------|----------|
| `GET ?date=` (no phone) | Public: `time_slot, doctor_id, status` only + `hospital_id` filter |
| `GET ?phone=` | **401** unless staff session or patient phone matches |

File: `src/app/api/appointments/route.ts`

---

## C-03 — Invoice IDOR closed

`GET /api/invoices/[id]` requires:

- HMS staff session, **or**
- Logged-in patient whose phone/email/`patient_id` matches the invoice

File: `src/app/api/invoices/[id]/route.ts`

---

## C-04 — Mock payments fail-closed in production

| Helper | Rule |
|--------|------|
| `isProductionRuntime()` | `VERCEL_ENV=production` or `NODE_ENV=production` (not test) |
| `allowMockPayments()` | **false** in production |

Blocks:

- Mock order create (Razorpay missing keys)
- Mock signature / `pay_mock` verify
- Mock webhook signature without secret
- `createPayment` mock provider path

Files: `production-guard.ts`, `razorpay.ts`, `payment-service.ts`

---

## C-05 — Cash staff-only + server amounts

| Rule | Implementation |
|------|----------------|
| Cash → paid | Requires `requireHmsAdmin` + `staffAuthorized: true` |
| Amount | Prefer doctor fee / package price when `appointment_id` / `package_id` present |
| Stamp | `hospital_id` on payment when tenant known |

Files: `api/payments/create/route.ts`, `payment-service.ts`

---

## C-06 — Admin not global tenant

`same_hospital(uuid)` **no longer** ORs `is_admin()`.

Hospital admins see only `profiles.hospital_id` (via `current_hospital_id()`).  
Platform ops: **service_role** (bypasses RLS).

Migrations: `027` (source of truth for fresh apply), `028` (re-apply on already-deployed 027).

Pure helpers: `canAccessTenantRow` — hospital `isAdmin` does **not** bypass; use `isPlatformAdmin`.

---

## C-07 — Phase2 hospital_id

All lab / pharmacy / RX / bills / dashboard service-role queries:

- `.eq('hospital_id', hospitalId)` when tenant known  
- Inserts stamp `hospital_id`

Routes pass `getTenantContext().hospitalId`.

File: `src/lib/phase2/service.ts` + phase2 API routes

---

## Tests

- `tests/unit/hospital-isolation.test.ts` — C-06 behavior  
- `tests/unit/payment-production-guard.test.ts` — C-04  

---

## Residual (not Critical)

High backlog items (H-01…) remain for Step 4.
