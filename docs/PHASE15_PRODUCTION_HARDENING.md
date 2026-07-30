# Phase 15 — Production Hardening (checklist)

**Status:** ONGOING / operational checklist  
Do not mark the hospital app 100% complete until this list is green in the live environment.

## Apply migrations (order)

```text
017_phase2_lab_pharmacy_rx_billing_roles.sql
018_rbac_roles_expansion.sql
019_phase1_auth_hardening.sql
020_phase3_doctors_hardening.sql
021_phase4_patients_hardening.sql
022_phase5_appointments_queue.sql
023_phase6_reception_walkin.sql
024_phase10_11_finance_hr.sql
```

## Environment

- [ ] `NEXT_PUBLIC_SUPABASE_URL` / `ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `NEXT_PUBLIC_SITE_URL` (canonical HTTPS)
- [ ] Supabase Auth redirect allow-list includes `/auth/callback`
- [ ] Gmail SMTP or Resend for email
- [ ] Meta WhatsApp token + phone number ID
- [ ] Razorpay live keys + webhook secret (if payments live)

## Quality gates (CI / local)

- [x] Unit tests green (130+)
- [x] TypeScript `tsc --noEmit`
- [ ] `npm run build` on clean machine
- [ ] `npm run lint`
- [ ] Smoke: login each role → home path
- [ ] Smoke: book appointment → token → check-in
- [ ] Smoke: walk-in reception
- [ ] Smoke: lab order status → report notify
- [ ] Smoke: finance expense + HR leave

## Security

- [x] Public signup forced patient role (migration 019)
- [x] RBAC middleware route guards
- [x] Rate limits on auth / booking
- [ ] Review Supabase RLS policies in dashboard after migrations
- [ ] Rotate any leaked demo tokens

## Monitoring

- Existing: `/api/health`, monitoring error/vitals routes
- [ ] Wire uptime check to `/api/health`
- [ ] Vercel log drains (optional)

## Rollback

- Prefer soft-delete columns over hard DELETE
- Keep previous Vercel deployment for instant rollback
