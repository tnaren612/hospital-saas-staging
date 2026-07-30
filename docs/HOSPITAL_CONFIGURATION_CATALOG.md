# Hospital Configuration Catalog

Configuration is edited at **Admin → Settings → Hospital Configuration** and is
stored per tenant in `hospital_settings`. Database values override seed defaults.
Secrets must never be stored in these JSON settings.

| Group | Purpose | Default source | Scope | Main impact / dependencies |
|---|---|---|---|---|
| Identity | Tenant name, slug, and hospital type | Environment and seed data | Public | Tenant lookup, labels, onboarding |
| Branding | Name, tagline, logos, favicon, banners, colors, theme, watermark, signatures | Environment and seed data | Public, except signatures | Header, footer, browser metadata, CSS theme, printable documents |
| Contact | Public and departmental email, phones, WhatsApp, website, address, map, coordinates | Environment and seed data | Public | Contact page, emergency actions, notifications, maps, structured data |
| Localization | Time zone, language, currency, date/time formats, week and financial-year start | Application defaults | Public | Scheduling, money display, reports, calendars |
| Legal | Tax, GST/PAN, licenses, accreditations, policy URLs, footer | Application defaults | Public or protected by field | Billing, receipts, legal pages, footer |
| Modules | Feature availability by tenant | Core modules enabled | Public feature flags | Navigation, route gates, onboarding |
| Prefixes | Identifiers for appointments, patients, invoices, receipts, prescriptions, labs, staff, doctors, barcodes | Application defaults | Protected | Number generation and printed records |
| Payments | Enabled methods and non-secret display details | Cash/UPI/Razorpay defaults | Protected | Checkout and billing; gateway secrets belong in a vault |
| Email | Provider and sender identity | Environment/default | Protected | Transactional email; credentials belong in a vault |
| Storage | Storage provider and public asset base URL | Supabase | Protected | Uploads and media; credentials belong in a vault |
| Authentication | Login methods and MFA flags | Email/phone/OTP defaults | Protected | Login UI and identity-provider setup |
| Templates | Email, SMS, WhatsApp, PDF, invoice, prescription, and report text | Tenant name/default phrases | Protected | Notifications and generated documents |
| SEO | Title, description, keywords, Open Graph image | Tenant identity | Public | Search and social previews |
| Social | Facebook, Instagram, YouTube, X/Twitter, LinkedIn | Seed data | Public | Header/footer/contact links |
| Working hours | OPD and emergency availability | Seed data | Public | Website, booking, notifications |

## Resolution and fallback

1. Resolve the tenant from the mapped hostname.
2. In explicitly enabled development environments only, allow query/header or
   cookie overrides.
3. Load the active tenant and its `hospital_settings`.
4. Deep-merge database values over safe defaults.
5. Return only the public projection to anonymous clients.
6. Use the complete configuration only in authenticated admin or trusted server
   contexts.

## Secret settings

The following must use a managed secret store and a tenant-scoped secret
reference: payment gateway credentials, SMTP/API credentials, SMS credentials,
WhatsApp tokens, OAuth secrets, storage credentials, signing keys, and webhook
secrets. Admin pages may show configuration status and masked identifiers but
must never return stored secret values.

## Change controls

Every protected update requires an administrator role, tenant match, schema
validation, an audit event, and cache invalidation. Branding/CMS publication
should support preview and rollback before production rollout.

