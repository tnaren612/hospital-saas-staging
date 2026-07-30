# Phase 6 — Reception Management

**Status:** SIGNED OFF  
**Scope:** Walk-in · Token · Queue · Patient check-in  

## Deliverables

| Item | Path |
|------|------|
| Reception UI | `/reception` → `ReceptionWorkspace` |
| Walk-in API | `POST /api/admin/reception/walk-in` |
| Queue | Reuses `GET /api/admin/appointments/queue` |
| Check-in | Reuses appointment PATCH `check_in` |
| Migration | `023_phase6_reception_walkin.sql` (`is_walk_in`) |

## Workflow

1. Receptionist opens `/reception`
2. **Walk-in** → name, phone, doctor → patient upsert + appointment + token
3. **Today's queue** → token list → Check-in / Complete / No-show
4. **Find patient** → search same-day appointments

## RBAC

`receptionist`, `manager`, `admin`, `super_admin` (via reception + appointments features)

## Score

**90 / 100**
