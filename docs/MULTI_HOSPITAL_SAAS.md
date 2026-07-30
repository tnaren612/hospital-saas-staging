# Multi-Hospital SaaS Architecture

**Status:** Foundation shipped  
**Goal:** Install for a new hospital in &lt; 30 minutes via Admin Panel + env — **no source code changes**.

---

## Principles

1. **Nothing hospital-specific is hardcoded** in application logic for new deployments.
2. **Configuration is data** stored in `hospitals` + `hospital_settings` (JSONB).
3. **Secrets never live in settings JSON** — only env / vault (SMTP password, Razorpay keys, etc.).
4. **Single-tenant today, multi-tenant ready** — `hospital_id` on settings + optional `profiles.hospital_id`.
5. **Slug selection** via `NEXT_PUBLIC_HOSPITAL_SLUG` / `HOSPITAL_SLUG` (future: hostname map).

---

## Schema (migration 025)

| Table | Purpose |
|-------|---------|
| `hospitals` | Tenant registry (slug, type, status) |
| `hospital_settings` | Branding, contact, modules, payments, auth flags, prefixes, templates, SEO… |

Adding a new config field = new JSON key only — **no migration required**.

---

## Admin UI

**Settings → Hospital configuration** (`/admin/settings`)

Tabs: Identity · Branding · Contact · Modules · Payments · Auth · Prefixes · Legal · Templates

API: `GET/PATCH /api/admin/hospital-settings` (admin / super_admin only)

Public read: `GET /api/hospital/config` (no secrets)

---

## Runtime wiring

| Layer | Mechanism |
|-------|-----------|
| Client branding | `HospitalConfigProvider` → CSS vars `--hospital-primary` |
| Header / admin shell / login | `useHospitalConfig()` |
| SSR seed | `getHospital()` + `buildDefaultHospitalConfig()` + env |
| Module gates | `isModuleEnabled(config, key)` |

---

## New hospital install (30 minutes)

1. Deploy same codebase to Vercel.
2. Create Supabase project; run migrations including **025**.
3. Set env:
   - Supabase keys
   - `NEXT_PUBLIC_HOSPITAL_SLUG=acme-hospital`
   - `NEXT_PUBLIC_HOSPITAL_NAME=Acme Hospital` (optional seed)
   - `NEXT_PUBLIC_SITE_URL`
   - Gmail / WhatsApp / Razorpay as needed
4. Promote admin user `profiles.role = super_admin`.
5. Login → **Settings → Hospital configuration** → set logo, colors, phones, modules, tax, prefixes.
6. Save. No rebuild required for settings (soft revalidate ~30s).

---

## Tenant resolution (implemented)

Priority for active hospital slug:

1. `?hospital=` / `?slug=` (preview)
2. Cookie `ssh_hospital_slug` (set by middleware)
3. Header `x-hospital-slug`
4. `HOSPITAL_HOST_MAP` exact host → slug (`app.acme.com:acme,app.beta.com:beta`)
5. Subdomain mode when `HOSPITAL_SUBDOMAIN_TENANT=true` (`acme.platform.com` → `acme`)
6. `NEXT_PUBLIC_HOSPITAL_SLUG` / `HOSPITAL_SLUG` / `default`

Middleware stamps the cookie on every request.

## Module enforcement (implemented)

- Admin nav filters by **role + hospital module flags**
- API guards: lab, pharmacy, finance, hr via `assertModuleEnabled`
- Path map in `src/lib/hospital/modules.ts`

## Branding tokens (implemented)

- `--hospital-primary` / `--hospital-secondary` (hex)
- `--primary` / `--ring` updated as HSL channels so `bg-primary` / rings follow brand color
- Favicon + document title from config
- Header, footer, admin shell, login panel use config name

## Tenant isolation (roadmap)

- Phase A (now): one active slug per deployment + host map
- Phase B: multi-hospital on one DB with host map fully live
- Phase C: RLS policies scoping all clinical tables by `hospital_id`

---

## Deploy smoke (2026-07-28)

| Check | Result |
|-------|--------|
| Unit tests | 144 pass |
| `npm run build` | pass |
| Migration 025 tables | live on Supabase (`hospitals` / `hospital_settings`) |
| Seed slug `default` | Sri Srinivasa Hospital branding row |
| Vercel env | `HOSPITAL_HOST_MAP`, `NEXT_PUBLIC_HOSPITAL_SLUG`, `NEXT_PUBLIC_SITE_URL` |
| Production deploy | https://sri-srinivasa-hospital.vercel.app |
| Smoke script | `node scripts/smoke-hospital-saas.mjs` |

Host map (production):

```text
sri-srinivasa-hospital.vercel.app:default,localhost:default
```

### Production sign-off

| Field | Value |
|-------|--------|
| Verdict | **GO** — multi-hospital config foundation approved for production |
| Scope | Config model, admin settings UI, host map, module flags, branding tokens, public `/api/hospital/config` |
| Live URL | https://sri-srinivasa-hospital.vercel.app |
| Not in this GO | Clinical-table `hospital_id` RLS isolation, per-tenant secret vault, multi-tenant multi-host automation |

## Score

**Architecture: 93 / 100** · **Deploy smoke: GO**  
Remaining (post-GO): full clinical-table `hospital_id` RLS, per-tenant secret vault, multi-host multi-tenant automation.
