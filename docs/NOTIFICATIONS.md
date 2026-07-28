# Notification System — Architecture & Guides

## Architecture diagram

```
┌─────────────────────────────────────────────────────────────┐
│  Business layer (Appointments, Billing, Admin, Cron)        │
│                         │                                   │
│                         ▼                                   │
│              NotificationService                            │
│         (preferences · retry · logging · history)           │
│           ┌─────────────┼─────────────┐                     │
│           ▼             ▼             ▼                     │
│     EmailService   WhatsAppService  SMSService              │
│           │             │             │                     │
│           ▼             ▼             ▼                     │
│    NotificationFactory  (provider selection)                │
│           │             │             │                     │
│     Gmail / Resend   wa.me (free)   Mock / MSG91            │
│     / MockEmail                     / Twilio*               │
│           │             │             │                     │
│           └─────────────┴─────────────┘                     │
│                         │                                   │
│                         ▼                                   │
│              NotificationRepository                         │
│           (Supabase · in-memory fallback)                   │
└─────────────────────────────────────────────────────────────┘
* future plug-ins — same interface
```

## Notification flow

```
1. Caller → NotificationService.send({ channel, templateId, recipient, vars })
2. Load patient preferences → skip if channel disabled (unless force)
3. Insert notifications row status=pending
4. Factory picks provider (configured free/paid, else mock)
5. Template service renders subject/text/html or WA/SMS text
6. Provider.send → success/fail
7. Retry up to 3 times with backoff
8. Update row status=sent|failed + log structured JSON
```

## Database

Tables (migration `016_notifications_system.sql`):

- `notifications` — full history + retry_count
- `notification_preferences` — per patient email/whatsapp/sms/all

## Gmail setup (free)

1. Use a Google account for the hospital.
2. Enable **2-Step Verification**.
3. Google Account → Security → **App passwords** → Mail → generate 16-char password.
4. Set env:

```
GMAIL_USER=yourhospital@gmail.com
GMAIL_APP_PASSWORD=abcd efgh ijkl mnop
EMAIL_FROM=Sri Srinivasa Hospital <yourhospital@gmail.com>
```

5. Restart server / redeploy Vercel.
6. Admin → **Test Notify** → Send test email.

### Gmail App Password notes

- Spaces in the app password are optional when pasting.
- If “Less secure apps” is mentioned in old docs, ignore it — use App Passwords only.
- Daily Gmail send limits apply (~500/day typical for consumer).

## WhatsApp usage (free)

- No Meta Business API required.
- System builds `https://wa.me/<digits>?text=<encoded>`.
- Staff/user taps **Send via WhatsApp** → opens WhatsApp with prefilled text.
- Set:

```
NEXT_PUBLIC_HOSPITAL_WHATSAPP=918121864863
NEXT_PUBLIC_HOSPITAL_PHONE=8121864863
```

Component: `WhatsAppSendButton` for Appointment / Billing / Patient / Admin UIs.

## SMS mock guide

- Default provider: `mock_sms` — no cost, stores history, returns preview.
- Live: set `MSG91_AUTH_KEY` (+ DLT template) — factory auto-switches.
- Future: implement `SmsProvider` for Twilio / TextLocal / SNS and register in `NotificationFactory`.

## Future provider migration

1. Implement `EmailProvider` | `SmsProvider` | `WhatsAppProvider` in `providers/`.
2. Register in `NotificationFactory` **before** mock providers.
3. Do **not** change `NotificationService` business methods.
4. Env vars already reserved: `SENDGRID_API_KEY`, `AWS_SES_KEY`, `TWILIO_*`, `WHATSAPP_ACCESS_TOKEN`.

## Admin

| Route | Purpose |
|-------|---------|
| `/admin/notifications` | Center: stats, search, filter, CSV, retry |
| `/admin/test-notifications` | Manual test email / WA link / SMS preview |

## Cron reminders

`POST /api/notifications/reminders` with header `Authorization: Bearer $CRON_SECRET`

Windows: **24h**, **2h**, **30m** before appointment (±15 min).

## Environment variables

See `.env.example` — Gmail, WhatsApp, MSG91, Resend, Cron.

## SOLID

- **S**: each provider does one channel implementation  
- **O**: new providers via factory registration  
- **L**: all providers implement `NotificationProvider`  
- **I**: Email/WhatsApp/SMS interfaces  
- **D**: service depends on repository + factory abstractions  
