# Production Readiness Report — Sri Srinivasa Hospital

Generated as part of the full-system quality pass.

## Stack

- Next.js 14 App Router · TypeScript · Tailwind · Supabase · Razorpay · Vercel

## Verified

| Area | Status |
|------|--------|
| TypeScript (`tsc --noEmit`) | Pass |
| ESLint | Pass |
| Unit / integration tests | Pass |
| Production build | See CI / local `npm run build` |
| Razorpay signature + webhook | Verified (HMAC + idempotency) |
| Rate limiting on payment APIs | In place |
| Security headers | HSTS, CSP, XFO, nosniff, COOP |
| SEO | Metadata, OG, Twitter, robots.ts, sitemap.ts, JSON-LD |
| Accessibility | Skip link, focus rings, ARIA on carousels/nav |
| CI | GitHub Actions workflow |

## Major modules

- Public site: home, about, doctors, services, facilities, gallery, blog, FAQ, contact, insurance, packages, video consult
- Patient portal: login, dashboard, appointments, payments, documents, reports, profile, notifications
- Admin ERP: appointments, calendar, billing, doctors, departments, patients, availability, reports, analytics, blog, gallery, **testimonials**, packages, settings
- Payments: create, verify, webhook, refund, analytics, invoice PDF, audit log
- Notifications: email (Resend), WhatsApp deep links, SMS (MSG91 optional), unified service with retry + logs

## Environment

Copy `.env.example` → `.env.local` and configure:

- `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY`
- `RAZORPAY_KEY_ID` / `RAZORPAY_KEY_SECRET` / `RAZORPAY_WEBHOOK_SECRET`
- Optional: `RESEND_API_KEY`, `MSG91_*`, WhatsApp numbers

## Health check

`GET /api/health` — readiness probe (no secrets).

## Remaining recommendations

1. Upload real photography (hero, facilities, doctor) via Admin Gallery CMS (WebP preferred).
2. Enable Resend + MSG91 for live transactional notifications.
3. Point Razorpay webhook to `/api/payments/webhook` in production dashboard.
4. Run Lighthouse on production URL after deploy; target 90+ Performance/SEO/A11y.
5. Consider edge rate limiting (Upstash) for multi-instance serverless.
6. Add Playwright suite to CI when browser cache budget allows.
7. Apply outstanding Supabase migrations in order (`supabase/migrations`).
