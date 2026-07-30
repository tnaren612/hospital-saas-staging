# Phase 2 — Lab, Pharmacy, Prescriptions, Billing & Roles

## Database

Run in Supabase SQL editor (or CLI):

```text
supabase/migrations/017_phase2_lab_pharmacy_rx_billing_roles.sql
```

### Tables

- `lab_categories`, `lab_tests`, `lab_technicians`, `lab_orders`, `lab_order_items`, `lab_samples`, `lab_reports`
- `pharmacy_categories`, `pharmacy_suppliers`, `medicines`, `pharmacy_stock_movements`, `pharmacy_purchase_orders`, `pharmacy_sales`
- `prescriptions`
- `hospital_bills`
- Roles on `profiles`: admin, doctor, receptionist, lab_technician, pharmacist, patient

### Diagram (logical)

```text
hospital_patients ─┬─ lab_orders ── lab_order_items ── lab_tests
                   │            └── lab_reports
                   ├─ prescriptions
                   ├─ hospital_bills
                   └─ pharmacy_sales ── medicines
```

## API routes

| Method | Path | Roles |
|--------|------|--------|
| GET/POST | `/api/phase2/lab` | admin, doctor, lab_technician, receptionist |
| GET/POST | `/api/phase2/pharmacy` | admin, pharmacist, receptionist |
| GET/POST | `/api/phase2/prescriptions` | GET: staff; POST: admin/doctor |
| GET/POST | `/api/phase2/bills` | admin, receptionist |
| GET | `/api/phase2/dashboard?q=` | staff (stats + global search) |

Demo fallback: in-memory store when tables are missing (local/dev).

## Admin UI

| Route | Module |
|-------|--------|
| `/admin/lab` | Laboratory |
| `/admin/pharmacy` | Pharmacy inventory + sales |
| `/admin/prescriptions` | Digital Rx + print |
| `/admin/hospital-billing` | Hospital bills (GST, methods) |

Nav is **role-filtered** via `src/lib/auth/roles.ts`.

## Patient UI

- `/patient/prescriptions` — prescription history
- `/patient/reports` — lab reports (existing route; lab data via staff)

## Notifications

Templates extended:

- `prescription_ready`
- `lab_report_ready`
- `bill_generated` / payment WhatsApp on paid bill

## Folder structure (new)

```text
src/lib/phase2/
  types.ts
  validation.ts
  demo-store.ts
  service.ts
src/lib/auth/roles.ts
src/app/api/phase2/{lab,pharmacy,prescriptions,bills,dashboard}/route.ts
src/app/admin/(protected)/{lab,pharmacy,prescriptions,hospital-billing}/page.tsx
src/components/admin/hms/{lab,pharmacy,prescription,hospital-billing}-manager.tsx
src/app/patient/prescriptions/page.tsx
supabase/migrations/017_phase2_*.sql
tests/unit/phase2-validation.test.ts
docs/PHASE2.md
```

## Build checklist

- [ ] Apply migration 017
- [ ] Assign staff roles: `update profiles set role='doctor' where email='...'`
- [ ] `npm run typecheck`
- [ ] `npm run lint`
- [ ] `npm test`
- [ ] `npm run build`
- [ ] Smoke: create lab order → advance status → create Rx → print → create bill → pharmacy sale

## Security notes

- Zod on all Phase 2 POST bodies
- HMS gate via `requireHmsAdmin(roles?)`
- RLS: staff policies using `is_staff()` / `is_admin()`
- Secrets remain in env only
