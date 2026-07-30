# Phase 1 — Authentication Architecture Review

**Status:** Stage 1 complete · Stage 2 implementation applied  
**Date:** 2026-07-29  
**Scope:** Login, registration, forgot/reset password, email verification, RBAC, protected routes, session management

---

## 1. Current architecture (as reviewed)

| Capability | Location | Status before hardening |
|---|---|---|
| Staff login | `src/lib/auth/actions.ts`, `/admin/login` | Production-ready (Supabase password) + demo cookie fallback |
| Patient login | `src/lib/patient/actions.ts`, `/patient/login` | Email + demo OTP |
| Patient register | `patientRegisterAction` | Works; weak password; metadata role risk |
| Forgot password | `patientForgotPasswordAction` | Works; needs auth callback |
| Reset password | `/patient/reset-password` | UI only; recovery session incomplete |
| Email verification | Supabase signUp + redirect | Partial (no callback route / resend) |
| RBAC roles | `src/lib/auth/roles.ts`, migration 018 | 11 roles, no legacy `staff` |
| Route guards | `src/lib/supabase/middleware.ts` | Prefix matrix + public suffixes |
| Session | Supabase SSR cookies + `getUser()` | Solid for middleware |

**Identity store:** Supabase Auth (`auth.users`) + `public.profiles` (role, name, phone).  
**Staff bootstrap:** Manual role assignment on `profiles.role` (never self-serve).  
**Patient portal:** Self-register always `patient`.

---

## 2. Security findings (Stage 1)

| Severity | Finding | Remediation |
|---|---|---|
| **Critical** | `handle_new_user()` trusted `raw_user_meta_data.role` → privilege escalation on signup | Migration 019: force `role = 'patient'` |
| **High** | No `/auth/callback` for PKCE code exchange (reset + verify broken in production) | Add `src/app/auth/callback/route.ts` |
| **High** | Password min length 6 (weak) | Shared policy: 8+ with letter + digit |
| **Medium** | Patient login did not reject non-patient roles | Role gate + sign-out |
| **Medium** | Demo OTP `123456` available in production builds | Hide OTP when Supabase backend enabled |
| **Medium** | No auth audit trail | `auth_events` table + best-effort logger |
| **Low** | No confirm-password fields | Register + reset UX |
| **Low** | No rate limiting on auth actions | In-memory sliding window (edge-safe best effort) |
| **Low** | Admin forgot-password missing | Staff reset via same Supabase flow |

---

## 3. Target design (Phase 1 complete)

```
Browser
  │
  ├─ /admin/login ──► adminLoginAction ──► signInWithPassword
  │                        │                    │
  │                        │              profiles.role ∈ HOSPITAL_STAFF
  │                        └─ homePathForRole(role)
  │
  ├─ /patient/login ─► register / login / forgot
  │                        │
  │                   always role=patient (DB trigger + app)
  │
  ├─ /auth/callback ──► exchangeCodeForSession ──► next=/patient/...
  │
  └─ middleware updateSession ──► ROUTE_GUARDS + roleAllowedOnPath
```

### Password policy (enterprise baseline)

- Minimum 8 characters  
- At least one letter and one digit  
- Max 72 (bcrypt-safe)  
- Confirm match on register / reset  

### Session

- Supabase cookie session (httpOnly via SSR helpers)  
- Middleware refreshes session on every matched request  
- Logout clears demo cookies + `auth.signOut()`  

### RBAC

- Single source: `roles.ts`  
- Middleware + server `getAdminSession` / portal checks  
- Staff roles never granted via public registration  

---

## 4. Database (Phase 1)

- `profiles.role` check constraint (migration 017/018)  
- `handle_new_user` hardened (019)  
- `auth_events` audit table (019)  
- Indexes: `profiles_role_idx`, `profiles_phone_idx`, `auth_events_*`  

---

## 5. Stage gates

| Stage | Result |
|---|---|
| 1 Architecture Review | **PASS** |
| 2 Implementation | **PASS** — migration 019, callback, password policy, rate limit, audit, UI |
| 3 Code Review | **PASS** — single RBAC source, server actions only, no client secrets |
| 4 Security Review | **PASS** — privilege escalation fixed; open-redirect blocked; enumeration mitigated |
| 5 Performance Review | **PASS** — rate limiter O(1); middleware profile select already minimal |
| 6 Testing | **PASS** — unit: password, rate-limit, callback path, RBAC (24+ tests) |
| 7 Production Readiness | **PASS** with ops note: apply migration 019 on Supabase before relying on audit table |

### Stage 3 — Code review notes

- Auth logic centralized under `src/lib/auth/*` and `src/lib/patient/actions.ts`
- No `service_role` on the client
- Demo OTP hidden when Supabase backend is enabled
- Confirm password + shared password policy

### Stage 4 — Security review notes

- **Fixed:** `handle_new_user` no longer reads `role` from metadata
- **Fixed:** PKCE callback with safe `next` path
- **Fixed:** patient portal rejects non-patient roles
- **Mitigated:** email enumeration on forgot/resend (generic messages)
- **Mitigated:** auth rate limits (10 / 15 min per key)
- **Remaining residual:** in-memory rate limit is not multi-region (acceptable Phase 1; Redis later)

### Stage 5 — Performance

- No extra DB round-trips on public pages
- Audit writes are best-effort async and never block failure paths beyond await (non-fatal)

### Stage 6 — Test matrix (Phase 1)

| Area | Coverage |
|---|---|
| Password policy | Positive / negative / common passwords |
| Rate limit | Boundary + key isolation |
| Callback path | Open redirect blocked |
| RBAC | All 11 roles, path guards, features |
| Typecheck | `tsc --noEmit` clean |

### Stage 7 — Production checklist

- [x] Feature complete for Phase 1 scope
- [x] No TypeScript errors
- [x] Unit tests green
- [ ] **Ops:** Run `019_phase1_auth_hardening.sql` on production Supabase
- [ ] **Ops:** Set `NEXT_PUBLIC_SITE_URL` to canonical production URL (auth redirects)
- [ ] **Ops:** Supabase Auth → Site URL + redirect allow list includes `/auth/callback`
- [x] Staff never self-register with elevated roles

---

## 6. Out of scope for Phase 1 (later phases)

- SMS OTP via WhatsApp/Twilio production provider  
- Magic links / Google OAuth  
- Staff self-registration invite flow  
- Session idle timeout UI  
- MFA / TOTP  
