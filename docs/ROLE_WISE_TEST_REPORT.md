# Role-Wise Test Report

**Date:** 2026-07-29  
**Environment:** Local Next.js application with live Supabase authentication  
**Credential handling:** Passwords were read from the user-supplied attachment or generated into ignored `.tmp` storage; none were committed or printed.

| Role | Login | Home redirect | Allowed route | Restricted route | Logout | Result |
|---|---|---|---|---|---|---|
| Admin | Pass | Pass | Pass | N/A | Pass | Pass, tenant audit fails |
| Doctor | Pass | Pass | Pass | Pass | Pass | Pass |
| Patient | Pass | Pass | Pass | Pass | Pass | Pass |
| Lab technician | Pass | Pass | Pass | Pass | Pass | Pass |
| Pharmacist | Pass | Pass | Pass | Pass | Pass | Pass |
| Receptionist | Pass | Pass | Pass | Pass | Pass | Pass |
| Billing | Pass | Pass | Pass | Pass | Pass | Pass |
| Finance | Pass | Pass | Pass | Pass | Pass | Pass |
| HR | Pass | Pass | Pass | Pass | Pass | Pass |
| Manager | Pass | Pass | Pass | Pass | Pass | Pass |
| Super admin | Not run | Not run | Not run | Not run | Not run | No test account |
| Production admin | Not run | Not run | Not run | Not run | Not run | Password unavailable |
| Radiologist | Not run | N/A | N/A | N/A | N/A | Role/module not implemented |

Five missing operational test accounts were provisioned idempotently and assigned
to the configured active hospital. The seed also repaired the null `hospital_id`
on `admin2@test.com`.

These are RBAC smoke tests, not complete CRUD workflow sign-off. Full
role-by-role functional workflows remain required after database tenant repair.
