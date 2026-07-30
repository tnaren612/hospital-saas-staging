# Sri Srinivasa Hospital — Official Website (Frontend Demo)

World-class, production-ready **frontend** website for **Sri Srinivasa Hospital**, Badvel, Andhra Pradesh.

Built with **Next.js 14**, **React**, **TypeScript**, **Tailwind CSS**, **Framer Motion**, and a backend-ready data layer using **JSON + localStorage**.

> **No backend required.**  
> **No automatic deployment.**  
> Push to GitHub and deploy yourself when ready.

---

## Hospital

**Sri Srinivasa Hospital**  
Nellore Road, Badvel, Andhra Pradesh 516227, India

**Phones:** 8121864863 · 9944867733 · 8249432026  

**Doctor:** Dr. Varaprasad Venkata Sumanth (MBBS, DNB, FSM, CCEBDM)  
**Specialty:** Pulmonology · Asthma · COPD · Respiratory Medicine · Critical Care

---

## Features

### Public website
- Home, About, Doctor, Services, Appointment, Gallery, Facilities
- Testimonials, Insurance, Health Packages, Blog, FAQ, Contact
- Privacy, Terms, custom 404
- Emergency banner (24×7 / Call / Ambulance)
- Floating WhatsApp, Call, sticky Appointment
- AI chatbot (demo answers + typing animation)
- English / తెలుగు language switcher
- Dark / light mode (persisted)
- Accessibility: keyboard focus, skip link, large text, high contrast
- SEO: meta, Open Graph, Twitter cards, Hospital/Doctor/FAQ schema, sitemap, robots.txt
- PWA: manifest + offline service worker
- Security headers, form validation (Zod), XSS sanitization helpers

### Patient
- Demo phone + OTP login (`123456`)
- Dashboard: upcoming appointments, history, reports, invoices

### Video consultation
- Book video appointment
- Demo meeting room: camera preview, mute, video, chat, screen share, leave

### Admin portal (Step 4 — Supabase Auth)
- Login: **`/admin/login`** (email + password, remember me)
- Protected routes via middleware (session + `profiles.role = admin`)
- Dashboard stats, appointment management (confirm / complete / cancel)
- Analytics, Health Tips CMS, Gallery CMS, Doctors CMS, Settings
- Non-admin users → **403 Access Denied** (`/admin/forbidden`)
- Logout clears Supabase session (or demo cookie)

**Demo mode** (Supabase off): any email + password **`admin123`**  
**Production mode** (Supabase on): real Auth user with `role = admin`

Public appointment booking is unchanged (localStorage and/or Supabase public insert).

---

## Tech stack

| Layer | Choice |
|--------|--------|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| UI | Tailwind CSS + custom shadcn-style components |
| Animation | Framer Motion |
| Forms | React Hook Form + Zod |
| Charts | Recharts |
| State/data | React Query + localStorage helpers |
| Backend | Supabase (Postgres, Auth, Storage, RLS) |
| Hosting target | GitHub → Vercel |
| Icons | Lucide |
| Toasts | React Hot Toast |
| Theme | next-themes |

---

## Getting started

```bash
# install
npm install

# development
npm run dev

# production build
npm run build
npm start

# lint / types
npm run lint
npm run typecheck
```

Open [http://localhost:3000](http://localhost:3000).

---

## Backend: GitHub → Vercel → Supabase

Roadmap and setup: **[docs/BACKEND_ROADMAP.md](./docs/BACKEND_ROADMAP.md)** · **[supabase/README.md](./supabase/README.md)**

| Step | Status |
|------|--------|
| 1 Supabase client + env | ✅ |
| 2 SQL schema / RLS / storage | ✅ |
| 3 Appointment booking | ✅ |
| 4 Admin authentication | ✅ |
| 6 Hospital Management System | ✅ |
| 5, 7–10 Patient auth, email deploy extras | Planned |

### Quick enable Supabase

```bash
copy .env.example .env.local
# add keys from Supabase → Project Settings → API
# set NEXT_PUBLIC_USE_SUPABASE=true
```

Run SQL: `supabase/migrations/001_initial_schema.sql` in the Supabase SQL Editor.

Without Supabase keys, the app still works in **localStorage demo mode**.

---

## Admin authentication (Step 4)

### Environment variables

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
SUPABASE_SERVICE_ROLE_KEY=eyJ...   # server only — never expose to browser
NEXT_PUBLIC_USE_SUPABASE=true
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

### Create / promote admin user

Primary admin for this project:

**`srisrinivasahospitals01@gmail.com`**

1. Ensure the user exists in Supabase → **Authentication → Users**  
2. SQL Editor → run `supabase/migrations/003_promote_primary_admin.sql`  
   (or paste):

```sql
insert into public.profiles (id, email, full_name, role)
select u.id, lower(u.email),
  coalesce(u.raw_user_meta_data->>'full_name', 'Hospital Admin'), 'admin'
from auth.users u
where lower(u.email) = 'srisrinivasahospitals01@gmail.com'
on conflict (id) do update
set role = 'admin', email = excluded.email;
```

### Login flow (production)

1. Open `/admin/login`  
2. Email: `srisrinivasahospitals01@gmail.com` + your Supabase password  
3. Server action → `supabase.auth.signInWithPassword`  
4. Ensures `profiles` row exists; requires `role = admin`  
5. Secure session cookies via `@supabase/ssr`  
6. Middleware protects all `/admin/*` (except login + forbidden)  
7. Non-admin users → **403 Access Denied**  
8. Logout clears session and returns to login  

**Note:** Admin auth activates whenever Supabase URL + anon key are set in env (even if appointment demo mode uses localStorage).

### Demo mode (no Supabase)

- Password: **`admin123`** (any email)  
- Sets httpOnly cookie `ssh_admin_demo`  
- Middleware accepts that cookie for admin routes  

### Protected admin routes

`/admin/dashboard` · `/admin/appointments` · `/admin/calendar` · `/admin/doctors` · `/admin/departments` · `/admin/patients` · `/admin/availability` · `/admin/reports` · `/admin/notifications` · `/admin/analytics` · `/admin/gallery` · `/admin/blog` · `/admin/settings` · `/admin` (redirect hub)

### Centralized Image CMS (gallery_images)

**One table** drives every site image: `public.gallery_images`.

Run: `supabase/migrations/005_centralized_gallery_cms.sql`

| Placement | Section | Key |
|-----------|---------|-----|
| Home slider (multi) | `home` | `hero` |
| Home doctor card | `home` | `doctor` |
| About banner | `about` | `banner` |
| About hospital photo | `about` | `hospital` |
| Services banner | `services` | `banner` |
| Gallery page + banner | `gallery` | any / `banner` |
| Doctors banner | `doctors` | `banner` |
| Doctor profile | `doctor` | `profile` |
| Contact / Facilities / etc. | `contact`… | `banner` |

Code API (`src/lib/image-service.ts`):

- `getImage(section, key)`
- `getImages(section)`
- `getImagesByKey(section, key)` — hero carousel
- `getBanner(section)`

Admin → **Gallery**: upload file, set **Section** + **Key**, save. No code edits needed.

Home hero: multiple rows with `home` + `hero` → Swiper autoplay carousel.

### Hospital Management System (Step 6)

Run migration:

`supabase/migrations/004_hospital_management.sql`

| Module | Path |
|--------|------|
| Doctors CRUD + photo/fee/slots | `/admin/doctors` |
| Departments CRUD | `/admin/departments` |
| Patients + history | `/admin/patients` |
| Calendar (month/week, drag reschedule) | `/admin/calendar` |
| Doctor availability | `/admin/availability` |
| Reports CSV/Excel/Print | `/admin/reports` |
| Notifications | `/admin/notifications` |

APIs under `/api/admin/*` (departments, doctors, patients, calendar, availability, reports, notifications, dashboard/stats).

### Admin APIs (session required)

- `GET /api/admin/appointments`  
- `PATCH /api/admin/appointments/[id]` `{ "status": "confirmed" | "completed" | "cancelled" | ... }`  

Uses the **user session** + RLS (not the service role key in the browser).

---

## Demo credentials

| Area | Credential |
|------|------------|
| Admin | Password: `admin123` |
| Patient OTP | `123456` (any valid 10-digit Indian mobile) |

---

## Project structure

```
sri-srinivasa-hospital/
├── public/
│   ├── assets/images/          # Replaceable images (paths from JSON)
│   ├── icons/                  # PWA icons
│   ├── manifest.json
│   ├── robots.txt
│   ├── sitemap.xml
│   ├── sw.js
│   └── offline.html
├── src/
│   ├── app/                    # Routes (pages)
│   ├── components/             # UI, layout, features, admin
│   ├── data/                   # Seed JSON (backend-ready)
│   ├── hooks/                  # Locale, accessibility
│   ├── i18n/                   # English + Telugu
│   ├── lib/                    # utils, storage, validation, seo, data API
│   └── types/                  # Shared TypeScript types
├── next.config.mjs             # Security headers, image config
└── README.md
```

### Backend-ready design

1. **`src/lib/data.ts`** — single data access layer (JSON today, API tomorrow).
2. **`src/lib/storage.ts`** — localStorage repository for appointments/CMS.
3. **`src/types`** — stable domain models for hospital, doctor, appointments, articles.
4. Forms already validated with Zod; swap `addAppointment` etc. to `fetch('/api/...')`.

---

## Replacing images

1. Drop files into `public/assets/images/...`
2. Update paths in:
   - `src/data/images.json`
   - `src/data/doctor.json`
   - `src/data/gallery.json`
   - other JSON files as needed  
**Do not hardcode image URLs in components** — use the data layer / JSON paths.

Suggested hospital building path for hero:

```
public/assets/images/hospital/building.svg  → replace with building.jpg/webp
```

Then set in `src/data/images.json`:

```json
"building": "/assets/images/hospital/building.jpg"
```

---

## WhatsApp

Floating WhatsApp opens:

```
Hello Doctor,

I would like to book an appointment.
```

Number from `src/data/hospital.json` → `whatsapp`.

---

## Environment (optional)

```env
NEXT_PUBLIC_SITE_URL=https://your-domain.com
```

Used for canonical URLs and Open Graph metadata.

---

## Deploy to GitHub (manual)

```bash
git init
git add .
git commit -m "Initial commit: Sri Srinivasa Hospital website"
git branch -M main
git remote add origin https://github.com/<you>/sri-srinivasa-hospital.git
git push -u origin main
```

Then connect GitHub Pages, Cloudflare Pages, Netlify, or any host of your choice.  
**This project is not pre-configured for automatic Vercel deploy.**

For static export (if needed later):

```js
// next.config.mjs
output: 'export'
```

(Note: some dynamic features may need adaptation for pure static hosting.)

---

## Security notes (demo → production)

Already included:
- Security response headers (`X-Frame-Options`, `nosniff`, etc.)
- Client validation + sanitization helpers
- No secrets in repo

Before real patient data:
- Add real auth, HTTPS, server validation, encryption at rest
- CSP policy tuned for your domains
- HIPAA/clinical compliance review as applicable

---

## License

Private project for Sri Srinivasa Hospital. All rights reserved by the hospital / project owner unless otherwise stated.

---

Built with care for patients in Badvel and beyond.
#   h o s p i t a l - s a a s - s t a g i n g  
 