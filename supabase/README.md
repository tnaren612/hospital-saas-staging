# Supabase setup (Steps 1–2)

## 1. Create project

1. Go to [https://supabase.com](https://supabase.com) → New project  
2. Region: choose closest (e.g. Mumbai / Singapore)  
3. Save the database password  

## 2. Copy API keys

**Project Settings → API**

| Env var | Where |
|---------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | `service_role` (server only) |

## 3. Local env

```bash
cp .env.example .env.local
# fill keys, then:
# NEXT_PUBLIC_USE_SUPABASE=true
```

## 4. Run SQL schema

1. Supabase Dashboard → **SQL Editor**  
2. Open `migrations/001_initial_schema.sql`  
3. Paste → **Run**  

This creates:

- `profiles`, `appointments`, `articles` (legacy), `gallery_images`, `contact_messages`
- RLS policies
- Storage buckets: `gallery`, `doctor`, `blog-covers`

Also run **`006_blog_articles.sql`** for the production Blog CMS (`blog_articles` table + seed).  
Public `/blog` and Admin → Health Tips both use Supabase only (no `blog.json` / localStorage).  
Cover images upload through Gallery CMS (`section=blog`, `key=image`).

### Phase 1 — Appointments

Run **`007_appointment_phase1.sql`** to:

- Add `department_id`, `department_name`, `booking_ref` on `appointments`
- Replace full unique slot constraint with **partial unique index** (cancelled slots can be rebooked)
- Seed core departments + primary pulmonologist if missing

Optional email confirmations: set `RESEND_API_KEY` and `EMAIL_FROM` in Vercel / `.env.local`.

### Phase 2 — Doctors

Run **`008_doctors_phase2.sql`** to extend `hospital_doctors` with slug, awards, languages, treatments, FAQs, SEO, featured flag, etc.

Public routes:

- `/doctors` — listing (search / filters)
- `/doctors/[slug]` — profile + Physician JSON-LD
- `/doctor` — legacy featured doctor profile (kept for SEO links)

Photos: Gallery CMS `section=doctor`, `key=profile|gallery`.

### Phase 4 — Health Packages

Run **`010_health_packages_phase4.sql`** for `health_packages` table + seed.

- Admin: `/admin/packages`
- Public: `/health-packages`, `/health-packages/[slug]`
- Images: Gallery CMS `section=package` keys `hero|banner|gallery|icon`
- PDF brochure: Storage path `package/brochure/*` (same `gallery` bucket)
- Book package → `/appointment?package=&packageName=&department=`
- Payment columns reserved (`payment_enabled`, `payment_amount`) — not wired yet

### Phase 5 — Enterprise Admin Dashboard

No new migration required. Dashboard aggregates existing tables:

- `GET /api/admin/dashboard/stats` — full metrics
- `GET /api/admin/dashboard/search?q=` — global admin search
- UI: `/admin/dashboard` (login home)

Visitors remain a GA4 placeholder until Phase 9.

### Phase 6 — Patient Portal

Run **`011_patient_portal_phase6.sql`**:

- `patients`, `patient_documents`, `patient_reports`, `patient_notifications`
- RLS (own data only)
- Storage bucket `patient-files`
- Optional `appointments.package_slug` / `package_name`

Routes:

- `/patient` → dashboard  
- `/patient/login` (OTP demo + email register/login + forgot password)  
- `/patient/dashboard|appointments|reports|documents|notifications|profile`  
- `/patient/reset-password`

### Phase 7 — Billing & Payments

Run **`012_billing_payments_phase7.sql`**:

- `payment_settings`, `invoices`, `payments`
- Admin: `/admin/billing`
- Patient: `/patient/payments`
- APIs: `/api/payments/*`, `/api/invoices/*`
- Env (optional): `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `STRIPE_SECRET_KEY`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`

Online payment is **off by default**. Appointments work without payment.

#### Razorpay Standard Checkout

1. Set env (server only for secret):
   - `RAZORPAY_KEY_ID` — public key used by Checkout.js
   - `RAZORPAY_KEY_SECRET` — **never** exposed to the browser
2. Admin → Billing → enable **Online payment** (+ Razorpay toggle)
3. Flow: `POST /api/payments/create` → order → Checkout modal → `POST /api/payments/verify` (HMAC)
4. Without keys, **mock** provider remains available for local demos

## 5. Auth providers (Step 4 — Admin)

**Authentication → Providers**

- Enable **Email** (required for admin login)  
- Optionally **Phone** (patient OTP later)

### Primary admin

Email already in use for this project:

`srisrinivasahospitals01@gmail.com`

Promote to admin (SQL Editor → run `migrations/003_promote_primary_admin.sql`):

```sql
insert into public.profiles (id, email, full_name, role)
select u.id, lower(u.email),
  coalesce(u.raw_user_meta_data->>'full_name', 'Hospital Admin'), 'admin'
from auth.users u
where lower(u.email) = 'srisrinivasahospitals01@gmail.com'
on conflict (id) do update
set role = 'admin', email = excluded.email;
```

Then open `/admin/login` and sign in with that email + password.

## 6. Vercel env

Add the same variables from `.env.example` in:

**Vercel → Project → Settings → Environment Variables**

Then redeploy.

## Privacy note on appointments

The initial RLS allows **public SELECT** on `appointments` so the calendar can mark booked slots.  
Patient name/phone/problem are visible to anyone with the anon key.

**Before production**, tighten this:

- Create a view `public.booked_slots (doctor_id, date, time_slot)`  
- Grant select only on that view  
- Restrict full `appointments` select to admin / own phone  

See comments in `001_initial_schema.sql`.
