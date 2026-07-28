# Production providers checklist

## Razorpay (payments)

1. Create live keys in Razorpay Dashboard (`rzp_live_*`).
2. Set on Vercel:
   - `RAZORPAY_KEY_ID`
   - `RAZORPAY_KEY_SECRET`
   - `RAZORPAY_WEBHOOK_SECRET`
3. Webhook URL: `https://<your-domain>/api/payments/webhook`
4. Events: `payment.captured`, `payment.failed`, `refund.processed`
5. Verify flow: create order → checkout → `/api/payments/verify` + webhook idempotency
6. Health: `GET /api/health` → `checks.payments.razorpay` / `providers.razorpay.mode`

## Email (Resend)

1. `RESEND_API_KEY`
2. `EMAIL_FROM` or `RESEND_FROM` (verified domain)
3. Optional: `HOSPITAL_INBOX` / `CONTACT_INBOX` / `CAREERS_INBOX`
4. Used by: appointment confirmations, payment receipts, contact form, careers

## WhatsApp

1. `NEXT_PUBLIC_WHATSAPP_NUMBER` or `NEXT_PUBLIC_HOSPITAL_WHATSAPP` (digits, e.g. `918121864863`)
2. Deep links via `wa.me` (no Meta Business API required)
3. Optional: `NEXT_PUBLIC_WHATSAPP_NOTIFY=true`

## SMS (MSG91)

1. `MSG91_AUTH_KEY`
2. `MSG91_SENDER_ID` (DLT approved)
3. `MSG91_TEMPLATE_ID` for template sends
4. Unified path: `src/lib/notifications/service.ts`

## Analytics

1. `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-XXXXXXXX`
2. Web Vitals always post to `/api/monitoring/vitals`
3. Client errors post to `/api/monitoring/error`

## Supabase CMS

Apply migrations through `015_testimonials_and_careers.sql` for:

- `testimonials`
- `career_applications`
- `faq_items` (optional override)
- existing `gallery_images`, `contact_messages`

## Monitoring

- Uptime: poll `GET /api/health` every 1–5 minutes
- Logs: Vercel log drain for `web_vital` / `client_error` JSON lines
