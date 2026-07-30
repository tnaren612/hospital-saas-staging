# Security Phase — hospital_id RLS Foundation

**Status:** Implementation in repo · apply migration **026** on Supabase  
**Priority:** Highest (post multi-hospital GO)  
**Related:** [PRODUCTION_GO_MULTI_HOSPITAL.md](./PRODUCTION_GO_MULTI_HOSPITAL.md)

---

## Goals

1. Every clinical / operational row carries `hospital_id`
2. Existing data backfilled to `default` hospital
3. RLS helper functions: `current_hospital_id()`, `same_hospital(uuid)`
4. New writes from app attach tenant via `getTenantContext()` / `withHospitalId()`
5. Admin diagnostics: `GET /api/admin/tenant-audit`

---

## Migration 026

File: `supabase/migrations/026_hospital_id_rls_foundation.sql`

| Action | Detail |
|--------|--------|
| Columns | `hospital_id` on appointments, doctors, patients, lab, pharmacy, bills, finance, HR, CMS… |
| Backfill | All nulls → `default` hospital |
| Functions | `default_hospital_id`, `current_hospital_id`, `same_hospital` |
| RLS | Additive tenant policies for authenticated staff |

**Apply:** Supabase SQL Editor → paste 026 → Run  
Then open (as admin): `/api/admin/tenant-audit`

Target: `nullHospitalRows = 0` on all listed tables.

---

## App wiring (done)

| Path | Behavior |
|------|----------|
| `POST /api/appointments` | Sets `hospital_id` |
| Walk-in reception | Sets `hospital_id` |
| Doctors / patients create | Sets `hospital_id` |
| Finance expenses | Sets `hospital_id` |
| `src/lib/hospital/tenant.ts` | `getTenantContext`, `withHospitalId`, `applyHospitalFilter` |

---

## Transition model

- `hospital_id IS NULL` still readable during migration (legacy)
- `is_admin()` can access all tenants
- Staff scoped to `profiles.hospital_id` or default hospital

**Next hardening:** make `hospital_id NOT NULL` after nulls = 0; tighten `same_hospital` to reject nulls.

---

## Score (this phase)

**In-repo foundation: 88/100** — complete after 026 applied + audit green on production.
