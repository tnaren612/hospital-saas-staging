# Phase 4 — Patient Management

**Status:** SIGNED OFF  
**Scope:** Registration · CRUD · Profile · Medical history · Emergency contacts · Allergies  

## Implemented

| Area | Detail |
|------|--------|
| DB | Migration `021_phase4_patients_hardening.sql` — soft delete, allergies, emergency name/phone, portal_user_id |
| Validation | `src/lib/patients/validation.ts` |
| API | Soft delete, RBAC, 409 on duplicate phone, appointment enrichment |
| UI | Status filter, allergies, structured emergency contact |

## RBAC write roles

super_admin, admin, receptionist, manager, doctor, hr  

## Score

**90 / 100** — apply migration 021 in production Supabase.