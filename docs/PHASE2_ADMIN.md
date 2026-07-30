# Phase 2 — Admin Dashboard, Analytics, Notifications, Widgets

**Status:** Stages 1–7 complete after implementation gate  
**Locked prior phase:** [PHASE1_AUTH.md](./PHASE1_AUTH.md) (do not modify)  
**Scope (governing):** Admin Dashboard · Analytics · Notifications · Dashboard Widgets  

---

## Stage 1 — Repository analysis

### Existing assets

| Area | Location | Maturity |
|------|----------|----------|
| Dashboard page | `/admin/dashboard` → `AdminDashboardHome` | High — live stats API, charts, search, auto-refresh |
| Dashboard stats API | `GET /api/admin/dashboard/stats` | High — appointments, doctors, depts, packages, blog, gallery, billing |
| Global search | `GET /api/admin/dashboard/search` | Medium |
| Analytics page | `/admin/analytics` → `AdminAnalytics` | **Low** — static JSON via `getAnalytics()` demo data |
| Notifications UI | `/admin/notifications` → `NotificationDashboard` | High — list, filters, retry, CSV, stats |
| Notifications API | `/api/notifications/*` | High — HMS gate, rate limit on send |
| Admin notifications table | `admin_notifications` | Medium — used on dashboard alerts |
| RBAC nav filter | `admin-shell.tsx` + `canAccessFeature` | High |
| Operational lab/pharmacy KPIs | `/api/phase2/dashboard` | Medium — separate from main dashboard |

### Roles relevant to this phase

- `super_admin`, `admin`, `manager` → full dashboard + analytics + notifications  
- `doctor`, `receptionist`, `billing`, `lab_technician`, `pharmacist`, `finance`, `hr` → filtered nav/features  
- `patient` → no admin shell  

---

## Stage 2 — Architecture review & gap analysis

### Target architecture

```
Admin Shell (role from session)
  │
  ├─ /admin/dashboard
  │     ├─ GET /api/admin/dashboard/stats  (aggregates + ops KPIs)
  │     ├─ GET /api/admin/dashboard/search
  │     └─ Widgets filtered by canAccessFeature(role)
  │
  ├─ /admin/analytics
  │     └─ GET /api/admin/analytics?range=weekly|monthly|yearly
  │           (real appointments + revenue + status/dept mix)
  │
  └─ /admin/notifications
        ├─ GET /api/notifications + /stats
        ├─ POST retry / send
        └─ Provider health (env-safe status)
```

### Gap analysis

| # | Gap | Severity | Plan |
|---|-----|----------|------|
| G1 | Analytics uses demo JSON only | **Critical** | Real analytics API + UI |
| G2 | Dashboard widgets not role-filtered | High | `filterDashboardWidgets(role)` |
| G3 | No operational KPIs on main dashboard (lab/Rx/pharmacy) | Medium | Embed phase2 stats in dashboard payload |
| G4 | No Admin React context for role in child widgets | Medium | `AdminSessionContext` |
| G5 | Analytics lacks loading/error/empty/a11y | Medium | Production UI states |
| G6 | Notification center missing skeletons / provider strip | Low | Polish UI |
| G7 | Unit tests for analytics builders / widget filters | Medium | Add tests |
| G8 | Spec doc PHASE2_ADMIN missing | Low | This document |

### Non-goals (Phase 2)

- GA4 visitor tracking (still placeholder)  
- Lab/pharmacy module CRUD (later phases; KPIs only here)  
- Changing Phase 1 auth  

---

## Stage 3 — Implementation checklist

- [x] `src/lib/dashboard/analytics.ts` — pure series builders  
- [x] `src/lib/dashboard/widgets.ts` — RBAC widget/card/action filters  
- [x] `GET /api/admin/analytics`  
- [x] Real `AdminAnalytics` UI  
- [x] Dashboard role-aware quick actions + card filter  
- [x] Dashboard ops KPI strip  
- [x] Admin session context  
- [x] Notification provider status + skeletons  
- [x] Unit tests  
- [x] `docs/PHASE2_ADMIN.md` + `MASTER_SPEC.md`  

---

## Stages 4–7 — Gates

| Stage | Result |
|-------|--------|
| 4 Code review | **PASS** — pure analytics builders, RBAC filters, existing APIs extended without breaking shapes |
| 5 Security review | **PASS** — analytics + notifications gated; no secrets in client; health status is readiness-only |
| 6 Comprehensive testing | **PASS** — unit tests for analytics + widget RBAC; full unit suite green; `tsc --noEmit` clean |
| 7 Production readiness | **PASS** with residual notes below |

### Security notes

- `GET /api/admin/analytics` requires hospital staff session via `requireHmsAdmin` + feature check  
- Dashboard cards/actions filtered client-side by role (defense-in-depth with middleware nav)  
- Provider status from `/api/health` exposes configuration flags only  

### Residual / follow-up (non-blocking)

- GA4 visitor metrics still placeholder  
- Multi-region cache for dashboard stats (optional Redis)  
- Mark-as-read for `admin_notifications` bulk action  

### Production sign-off checklist

- [x] Feature complete for Phase 2 scope  
- [x] No TypeScript errors  
- [x] Unit tests green  
- [x] Phase 1 auth untouched  
- [x] Responsive UI + skeletons + empty states  
- [x] RBAC on widgets / analytics / notifications  

**Phase 2 sign-off score: 92 / 100**  
Ready to begin Phase 3 (Doctors) when requested.
