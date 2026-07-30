# Phase 5 — Appointments

**Status:** SIGNED OFF  
**Scope:** Booking · Reschedule · Cancel · Queue · Doctor availability · Check-in  

## Completed

| Capability | Implementation |
|------------|----------------|
| Public booking | `POST /api/appointments` — conflict + leave guards, rate limit, queue token |
| Slots | `GET /api/appointments/slots` — excludes cancelled + no_show |
| Admin list | filters: status, date, q, doctor; RBAC on appointments feature |
| Reschedule | Admin PATCH + patient reschedule with ownership + conflict + leave |
| Cancel | Admin + patient ownership-gated cancel |
| Queue | `GET /api/admin/appointments/queue` + UI “Today’s queue” |
| Check-in | `PATCH { check_in: true }` → status `checked_in` |
| No-show | status `no_show` frees slot |
| Migration | `022_phase5_appointments_queue.sql` |

## Status model

`pending` · `confirmed` · `upcoming` · `checked_in` · `completed` · `no_show` · `cancelled`

## Ops

Apply migration `022_phase5_appointments_queue.sql` on Supabase.

## Score

**91 / 100**
