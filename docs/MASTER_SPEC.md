# Sri Srinivasa Hospital HMS — Master Specification Index

**Governing prompt:** `ULTIMATE_HMS_PROMPT_v2.md` (enterprise autonomous engineering)  
**Stack:** Next.js App Router · TypeScript · Tailwind · Supabase/PostgreSQL · Razorpay · Gmail · WhatsApp Cloud · Vercel

## Phase status

| Phase | Document | Status |
|-------|----------|--------|
| 1 Authentication & RBAC | [PHASE1_AUTH.md](./PHASE1_AUTH.md) | **LOCKED — complete** |
| 2 Admin Dashboard, Analytics, Notifications, Widgets | [PHASE2_ADMIN.md](./PHASE2_ADMIN.md) | In progress / gate per stages |
| 3 Doctors | PHASE3_DOCTORS.md | Planned |
| 4 Patients | PHASE4_PATIENTS.md | Planned |
| 5 Appointments | PHASE5_APPOINTMENTS.md | Planned |
| 6 Laboratory | PHASE6_LAB.md | Planned (partial code exists as product “phase2 lab”) |
| 7 Pharmacy | PHASE7_PHARMACY.md | Planned (partial code exists) |
| 8 Billing | PHASE8_BILLING.md | Planned (partial code exists) |
| 9–15 | Finance, HR, Reports, CMS, Settings, Hardening | Planned |

> **Note:** An earlier product doc `PHASE2.md` describes lab/pharmacy/Rx modules. That is **not** the governing Phase 2 of this program. Spec Phase 2 = **Admin console intelligence** (dashboard, analytics, notifications, widgets).

## Cross-cutting docs (maintain as phases complete)

- Architecture · Database · API · Security · Test strategy · Deployment · Production checklist

## Quality gates (every phase)

1. Repository analysis  
2. Architecture review  
3. Implementation  
4. Code review  
5. Security review  
6. Comprehensive testing  
7. Production readiness validation  

Do not start the next phase until the current phase is signed off.

## Locked rules

- Do **not** modify Phase 1 auth unless a critical production defect is found.
- Preserve existing functionality; no breaking public/marketing routes.
- RBAC via `src/lib/auth/roles.ts` for all staff roles.

## Autonomous execution

See **[AUTONOMOUS_EXECUTION.md](./AUTONOMOUS_EXECUTION.md)** — mandatory full-autonomous engineering mode.

## Roadmap progress

| Phase | Status | Score |
|-------|--------|-------|
| 1 Auth | LOCKED | 95 |
| 2 Admin Dashboard / Analytics / Notifications | SIGNED OFF | 92 |
| 3 Doctors | SIGNED OFF | 91 |
| 4 Patients | SIGNED OFF | 90 |
| 5 Appointments | SIGNED OFF | 91 |
| 6 Reception | SIGNED OFF | 90 |
| 7 Laboratory | SIGNED OFF | 88 |
| 8 Pharmacy | SIGNED OFF | 87 |
| 9 Billing | SIGNED OFF | 88 |
| 10 Finance | SIGNED OFF | 88 |
| 11 HR | SIGNED OFF | 87 |
| 12–14 Reports / CMS / Settings / Manager | SIGNED OFF | 90 |
| 15 Production hardening | CHECKLIST (see PHASE15) | 85 |
| Multi-hospital SaaS config | **PRODUCTION GO** (see PRODUCTION_GO_MULTI_HOSPITAL.md) | 93 |
| Tenant RLS (hospital_id) | IN PROGRESS — apply migration 026 | 88 |
