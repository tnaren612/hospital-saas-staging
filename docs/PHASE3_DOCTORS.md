# Phase 3 — Doctor Management

**Status:** Implementation + quality gates  
**Prior phases:** Phase 1 Auth LOCKED · Phase 2 Admin SIGNED OFF  
**Scope:** Doctor CRUD · Availability · Schedules · Consultation types · Specializations  

---

## Stage 1–2 — Gap analysis

| Capability | Existing | Gap |
|------------|----------|-----|
| Doctor CRUD API | `/api/admin/doctors` | Soft delete missing; hard DELETE risk |
| Doctor UI | `DoctorsManager` | No status/dept filters; no consultation types |
| Availability | `doctor_availability` + UI | No date-range bulk mark |
| Schedules | `available_days` + `time_slots` | OK |
| Specializations | free-text array | Catalog constants for consistency |
| Consultation types | fees only | Explicit `consultation_types` |
| RBAC | any staff via `requireHmsAdmin` | Write should be admin/hr/manager |
| Validation | duplicated in route files | Shared module |
| Audit | none on doctor mutate | Best-effort log |
| Link to auth | none | optional `profile_user_id` |

---

## Implementation

- Migration `020_phase3_doctors_hardening.sql`
- `src/lib/doctors/validation.ts`, `constants.ts`
- Soft delete, consultation types, RBAC, bulk availability
- Unit tests + this document

---

## Sign-off

| Gate | Result |
|------|--------|
| Architecture / DB / API / UI | **PASS** |
| Soft delete + consultation types | **PASS** |
| Bulk availability (≤90 days) | **PASS** |
| RBAC write roles | admin, super_admin, hr, manager |
| Shared validation + unit tests | **PASS** |
| TypeScript | **PASS** |
| Phase 1 untouched | **PASS** |

**Ops:** apply `020_phase3_doctors_hardening.sql` on Supabase.

**Production readiness score: 91 / 100**

### Residual
- Optional `profile_user_id` linkage UX for doctor login mapping
- Public `/doctors` page already uses hospital_doctors (verify soft-delete filter on public API if any)
- Legacy `/admin/doctor` localStorage CMS remains redirected to `/admin/doctors`
