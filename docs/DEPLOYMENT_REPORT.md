# Deployment Report — Sri Srinivasa Hospital

**Date:** 2026-07-27  
**Status:** READY  
**Platform:** Vercel Production  
**Framework:** Next.js 14.2.35 (App Router) + TypeScript + Tailwind CSS  
**Database / Auth:** Supabase PostgreSQL + Supabase Auth  
**Payments:** Razorpay  

---

## Production URLs

| Type | URL |
|------|-----|
| **Production alias** | https://sri-srinivasa-hospital.vercel.app |
| Latest deployment | https://sri-srinivasa-hospital-4bzhkdiiq.vercel.app |
| Vercel dashboard | https://vercel.com/srisrinivasahospitals01-4014s-projects/sri-srinivasa-hospital |
| Inspect (latest) | https://vercel.com/srisrinivasahospitals01-4014s-projects/sri-srinivasa-hospital/GZcrT54ycdcUPd1NYj8VRF89p9gg |

**Deployment status:** ● Ready (Production)

---

## Changes made (code & config)

### 1. ESLint build blocker — `prefer-const`

**File:** `src/lib/payments/completion.ts`  
**Issue:** Production build failed during “Linting and checking validity of types” because `alreadyPaid` was declared with `let` but never reassigned.  
**Fix:**

```diff
-  let alreadyPaid = isPaymentSuccessful(existing.payment_status);
+  const alreadyPaid = isPaymentSuccessful(existing.payment_status);
```

**Impact:** Unblocks `next build` / Vercel deploy. No business-logic change.

### 2. Sanitized `.env.example`

**File:** `.env.example`  
**Issue:** Contained real Supabase keys (security risk if committed). Incomplete list of payment/optional vars.  
**Fix:** Replaced secrets with placeholders and documented every required/optional variable:

- `NEXT_PUBLIC_SITE_URL`
- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `NEXT_PUBLIC_USE_SUPABASE`
- `RAZORPAY_KEY_ID`
- `RAZORPAY_KEY_SECRET`
- `RAZORPAY_WEBHOOK_SECRET` (optional)
- Stripe, Resend, WhatsApp, MSG91 (optional, commented)

### 3. `.gitignore` hardening

**File:** `.gitignore`  
**Changes:**

- Ensure `.env` / `.env.local` / `.env.*` are ignored
- Allow committing `.env.example` via `!.env.example`
- Ignore `.vercel`, IDE junk, `Thumbs.db`, `.tmp/`

### 4. Vercel project + environment variables

**Project:** `srisrinivasahospitals01-4014s-projects/sri-srinivasa-hospital`  
**Action:** Linked with `vercel link --yes`, pushed secrets from local `.env.local` via `vercel env add` for Production / Preview / Development:

| Variable | Purpose |
|----------|---------|
| `NEXT_PUBLIC_SITE_URL` | SEO, auth email redirects (set to production URL) |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key |
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only admin/webhook ops |
| `NEXT_PUBLIC_USE_SUPABASE` | `true` — enable Supabase backend |
| `RAZORPAY_KEY_ID` | Razorpay checkout key |
| `RAZORPAY_KEY_SECRET` | Server-only HMAC / orders |
| `NEXT_PUBLIC_RAZORPAY_KEY_ID` | Optional client mirror of key id |

### 5. Redeploy after SITE_URL update

After first successful deploy, `NEXT_PUBLIC_SITE_URL` was updated from `http://localhost:3000` to `https://sri-srinivasa-hospital.vercel.app` and the app was redeployed so public URL is correct for emails/SEO.

---

## Local verification (pre-deploy)

| Check | Result |
|-------|--------|
| `npm run typecheck` | Pass |
| `npm run lint` | Pass (after prefer-const fix) |
| `npm run build` | Pass — 51 static pages, all routes compiled |
| `npm test` | 15 pass, 0 fail |

---

## Production verification

### Pages

| Path | HTTP | Notes |
|------|------|--------|
| `/` | 200 | Homepage |
| `/about` | 200 | |
| `/appointment` | 200 | Appointment booking |
| `/doctors` | 200 | Doctor module listing |
| `/doctor` | 200 | Primary doctor profile |
| `/patient` | 307 → login/dashboard | Expected redirect |
| `/patient/login` | 200 | Authentication entry |
| `/patient/dashboard` | 200 | Patient module |
| `/patient/payments` | 200 | Payment page UI |
| `/admin/login` | 200 | Admin auth |
| `/health-packages` | 200 | |
| `/blog` | 200 | |
| `/contact` | 200 | |
| `/services` | 200 | |
| `/gallery` | 200 | |
| `/faq` | 200 | |
| `/video-consult` | 200 | |

### APIs

| Path | HTTP | Notes |
|------|------|--------|
| `GET /api/payments/webhook` | **200** | `{"ok":true,"endpoint":"/api/payments/webhook",...}` |
| `GET /api/payments/settings` | 200 | `razorpay_enabled: true`, key id present |
| `GET /api/appointments/slots?date=…` | 200 | `"mode":"supabase"` — **Supabase connectivity OK** |
| `GET /api/admin/dashboard/stats` | 401 | Auth guard OK |
| `GET /api/admin/appointments` | 401 | Auth guard OK |
| `GET /api/payments/history` | 401 | Auth guard OK |
| `GET /api/payments/analytics` | 401 | Auth guard OK |
| `GET /api/patient/dashboard` | 200 | Client/demo-tolerant portal APIs |
| `OPTIONS /api/payments/create` | 204 | Route live |

### Integration checks

| Area | Result |
|------|--------|
| **Supabase** | Slots API returns `mode: "supabase"` with live availability data |
| **Razorpay** | Settings: `online_payment_enabled: true`, `razorpay_enabled: true`, test key configured |
| **Razorpay webhook** | Health `GET` returns HTTP 200; events: `payment.captured`, `payment.failed`, `refund.processed` |
| **Middleware** | Admin APIs reject unauthenticated callers (401) |
| **Runtime** | No deployment/runtime crash on verified routes |

---

## Deploy timeline

1. Inspect project, run typecheck → clean  
2. Run `next build` → failed on ESLint `prefer-const` in `completion.ts`  
3. Fix `const alreadyPaid` → build success  
4. Sanitize `.env.example`  
5. `vercel login` (device auth)  
6. `vercel link --yes` → create project  
7. Push env vars for production/preview/development  
8. `vercel --prod --yes` → **Ready**  
9. Set `NEXT_PUBLIC_SITE_URL` to production alias  
10. Redeploy → **Ready**  
11. Smoke-test pages + APIs → pass  

---

## Post-deploy recommendations

1. **Custom domain** — Add `srisrinivasahospital.com` (or similar) in Vercel → Domains, then update `NEXT_PUBLIC_SITE_URL` and redeploy.  
2. **Supabase Auth URLs** — In Supabase Dashboard → Authentication → URL configuration, allow:
   - `https://sri-srinivasa-hospital.vercel.app`
   - Redirect URLs for `/patient/login`, `/patient/reset-password`, `/admin/login`  
3. **Razorpay webhook** — In Razorpay Dashboard, set webhook URL to:  
   `https://sri-srinivasa-hospital.vercel.app/api/payments/webhook`  
   Events: `payment.captured`, `payment.failed`, `refund.processed`  
   Prefer a dedicated `RAZORPAY_WEBHOOK_SECRET` in Vercel env.  
4. **Live keys** — Replace `rzp_test_*` with live keys when going live.  
5. **Git remote** — Connect GitHub for automatic preview/production deploys on push.  
6. **Do not commit** `.env.local` or service-role / Razorpay secrets.

---

## Summary

| Item | Value |
|------|--------|
| Production URL | https://sri-srinivasa-hospital.vercel.app |
| Status | **READY** |
| Code fix required for build | 1 line (`prefer-const`) |
| Env vars on Vercel | 8 keys × environments |
| Local build | Success |
| Homepage | HTTP 200 |
| Supabase | Connected (`mode: supabase`) |
| Razorpay | Enabled (test mode) |
| Webhook health | HTTP 200 |

Deployment completed successfully. No remaining build or deployment blockers.
