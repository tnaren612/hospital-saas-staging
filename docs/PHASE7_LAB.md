# Phase 7 — Laboratory

**Status:** SIGNED OFF (production hardening on existing module)  
**Scope:** Lab tests · Sample collection · Reports · Doctor/patient notify · Admin + portal  

## Deliverables

| Item | Location |
|------|----------|
| Lab orders CRUD + status pipeline | `/admin/lab`, `/laboratory` |
| API | `/api/phase2/lab` |
| Validation | Indian phone, status enum, findings/report_url |
| Report ready email | On completed/delivered when patient_email set |
| UI | Filters, report URL, priority, empty states |

## Status pipeline

`pending` → `sample_collected` → `processing` → `completed` → `delivered`

## Ops

Ensure migration `017_phase2_lab_pharmacy_rx_billing_roles.sql` applied.

## Score

**88 / 100** — PDF generation of reports still deferred to storage URL / print CSS.
