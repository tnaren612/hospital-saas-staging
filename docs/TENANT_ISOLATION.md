# Full hospital_id multi-tenant isolation

**Status:** Implemented in repository  
**Migrations (apply manually — do not auto-run on production from CI without review):**

1. `025_multi_hospital_saas_settings.sql` — hospitals + settings  
2. `026_hospital_id_rls_foundation.sql` — foundation helpers + columns  
3. **`027_full_hospital_id_tenant_isolation.sql`** — complete columns, indexes, RLS for required tables  

---

## Requirements coverage

| Requirement | Implementation |
|-------------|----------------|
| `hospital_id` on tenant tables | Migration 027 (idempotent `ADD COLUMN IF NOT EXISTS`) |
| FK → `hospitals(id)` | Yes |
| Indexes on `hospital_id` | Yes (`*_hospital_id_idx`) |
| RLS enabled | Yes on required tables |
| RLS policies (patients, doctors, appointments, HR, finance, invoices, payments) | Yes (`*_tenant_*_v2`) |
| App queries filter by hospital | Appointments, doctors, patients, departments, reports, availability, queue, finance, HR |
| Server writes set `hospital_id` | Booking, walk-in, doctors, patients, finance, departments, availability |
| Automated isolation tests | `tests/unit/hospital-isolation.test.ts` |
| Migration only / no prod auto-mutate | Scripts generate SQL only; operators run in SQL Editor |

---

## Tables covered (027)

**Required by spec:**  
`hospital_patients`, `hospital_doctors`, `appointments`, `hr_employees`, `hr_attendance`, `hr_leave_requests`, `finance_expenses`, `invoices`, `payments`

**Also included:** departments, doctor_availability, lab_*, medicines, prescriptions, hospital_bills, payment_settings, CMS tables, profiles

---

## App helpers

| Helper | Path |
|--------|------|
| `getTenantContext()` | `src/lib/hospital/tenant.ts` |
| `withHospitalId()` | same |
| `applyHospitalFilter()` | same |
| `canAccessTenantRow()` / `filterByHospital()` / `proveIsolation()` | `src/lib/hospital/isolation.ts` |
| Audit API | `GET /api/admin/tenant-audit` |

---

## Apply on production (operator)

```text
1. Supabase Dashboard → SQL Editor
2. Run 026 (if not already)
3. Run 027
4. Verify: GET /api/admin/tenant-audit → nullHospitalRows ≈ 0
5. Deploy latest app (tenant-filtered APIs)
```

**Does not** auto-modify production from the agent. Backfill only runs when you execute the migration SQL.

---

## Test proof

```bash
npx tsx --test tests/unit/hospital-isolation.test.ts
```

Asserts: cross-tenant read denied, same-tenant allowed, filter strips foreign rows, cross-tenant write throws.

---

## Residual

- Make `hospital_id NOT NULL` after audit clean  
- Scope payment-service list queries by hospital when multi-tenant payments go live  
- Patient portal tables (`patients`) already included in 027 column list  
