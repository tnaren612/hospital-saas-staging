# Backend roadmap — GitHub → Vercel → Supabase

## Architecture

```text
GitHub
  ↓
Vercel (Next.js host)
  ↓
Supabase
  ├── PostgreSQL
  ├── Authentication
  ├── Storage
  └── RLS
  ↓
Next.js + Tailwind + Framer Motion (this repo)
```

---

## Progress

| Step | Status | Location |
|------|--------|----------|
| **1** Supabase client + env | ✅ Done | `src/lib/supabase/*`, `.env.example` |
| **2** SQL schema, Auth, Storage, RLS | ✅ Done | `supabase/migrations/001_initial_schema.sql` |
| **3** Appointment booking | ✅ Done | `src/lib/appointments/service.ts`, form + API |
| **4** Admin login | ✅ Done | `/admin/login`, middleware, dashboard, admin APIs |
| **5** Patient login | ⏳ Pending | Phone/email OTP via Supabase Auth |
| **6** Hospital Management System | ✅ Done | Doctors, depts, patients, calendar, reports, notifications |
| **7** Blog management (Supabase) | ⏳ Partial | Local CMS exists; DB table ready |
| **8** Contact form API | ⏳ Pending | Table `contact_messages` ready |
| **9** Email notifications | ⏳ Pending | Resend/SendGrid + admin_notifications |
| **10** Deploy GitHub + Vercel | ⏳ Pending | Push repo, import Vercel, set env |

---

## Step 1 — Enable Supabase locally

```bash
cd C:\Users\windows\sri-srinivasa-hospital
copy .env.example .env.local
```

Edit `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...
NEXT_PUBLIC_USE_SUPABASE=true
```

Without keys (or with `NEXT_PUBLIC_USE_SUPABASE=false`), the site keeps **localStorage demo mode**.

---

## Step 2 — Run SQL

1. Supabase Dashboard → **SQL Editor**
2. Paste `supabase/migrations/001_initial_schema.sql`
3. Run

See `supabase/README.md` for admin user setup.

---

## Step 3 — Test appointments

1. `npm run dev`
2. Open `/appointment`
3. Badge should say **Backend: Supabase** when configured
4. Book a slot → row appears in Supabase **Table Editor → appointments**
5. Same slot becomes **Booked** on calendar

API endpoints:

- `POST /api/appointments`
- `GET /api/appointments`
- `GET /api/appointments/slots?date=YYYY-MM-DD`

---

## Step 4 — Admin login (done)

1. Enable Email provider in Supabase Auth  
2. Create user + set `profiles.role = 'admin'` (see README)  
3. Login at `/admin/login` via server action + session cookies  
4. Middleware enforces admin role on `/admin/*` and `/api/admin/*`  
5. Dashboard + appointment management use `/api/admin/appointments`  
6. Public booking flow untouched  

Key files:

- `src/lib/auth/admin.ts`, `src/lib/auth/actions.ts`
- `src/lib/supabase/middleware.ts`
- `src/app/admin/login`, `(protected)/*`
- `src/app/api/admin/appointments`

## Step 5 — Patient login (plan)

1. Phone or email OTP via Supabase Auth  
2. On verify, session cookie  
3. Dashboard loads appointments by `auth.uid()` / phone  

## Step 6–8 — CMS + contact (plan)

Use tables already in migration + Storage policies.  
Replace localStorage CMS modules with Supabase queries.

## Step 9 — Email (plan)

In `src/app/api/appointments/route.ts` after successful insert, call Resend/SendGrid.

## Step 10 — Deploy

1. Push to GitHub  
2. Vercel → Import repo  
3. Add same env vars as `.env.local`  
4. Deploy  

---

## Privacy warning

Current RLS allows public `SELECT` on `appointments` so the calendar can mark slots.  
Tighten before real PHI (see SQL file comments + `supabase/README.md`).
