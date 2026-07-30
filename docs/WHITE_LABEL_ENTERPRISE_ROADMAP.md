# White-Label Multi-Tenant Hospital ERP Roadmap

## Objective

Turn the current application into a configuration-driven hospital SaaS product
where onboarding a hospital requires tenant data and secrets, not source-code
changes.

## Baseline audit (2026-07-29)

### Existing foundations to preserve

- Tenant records and JSON configuration already exist through `hospitals` and
  `hospital_settings`.
- Host, header, cookie, and development-query tenant resolution already exists.
- The application already exposes typed branding, contact, localization, legal,
  module, prefix, payment, authentication, template, SEO, social, and working
  hours configuration.
- Admin hospital settings, module gates, `hospital_id` columns, RLS migrations,
  tenant tests, RBAC, patient portal, and role-specific workspaces already exist.
- Runtime branding CSS variables and configurable favicon/title support already
  exist.

### Critical gaps

- Hospital-specific content remains in at least 61 source files; location text
  remains in 31 files. This includes metadata, notifications, PDFs, calendars,
  payments, public pages, chatbot responses, prescriptions, and error states.
- Static JSON content is global rather than tenant-owned for several website
  sections.
- Public `hospital_settings` currently exposes operational configuration that
  should be split into an explicit public projection and protected settings.
- Provider secrets are environment-wide. Enterprise multi-tenancy requires
  tenant-scoped secret references backed by a vault, never JSON or client APIs.
- Tenant isolation is present but must become deny-by-default for every
  tenant-owned table, storage path, API, export, cache key, and background job.
- CMS coverage is incomplete for navigation, header/footer, announcements,
  policies, SEO, page sections, specialties, insurance partners, and reusable
  content blocks.

## Prioritized implementation

### P0 — Isolation and configuration safety

1. Create a strict public configuration projection that never returns provider,
   payment, storage, or authentication internals.
2. Enforce tenant context in every protected API and data service.
3. Add automated cross-tenant tests for reads, writes, exports, storage, cached
   configuration, and role escalation.
4. Add tenant-aware audit events with actor, tenant, action, target, outcome,
   request correlation ID, and timestamp.
5. Introduce tenant secret references for payment, email, SMS, WhatsApp, and
   storage providers. Store secrets only in a managed secret vault.

**Exit criteria:** no cross-tenant access in automated tests; no secret or
protected operational setting in public responses.

### P1 — Remove hardcoded identity from runtime

1. Replace hardcoded names, contacts, addresses, locations, domains, social
   links, invoice headings, payment labels, calendar locations, email senders,
   SMS signatures, and PDF/prescription footers with `HospitalConfig`.
2. Make server metadata tenant-aware and generate favicon, Open Graph, canonical,
   structured-data, and robots/sitemap values from configuration.
3. Replace global static hospital JSON usage with tenant configuration or
   tenant-owned CMS content.
4. Add a CI guard that reports new hospital-specific literals outside seed/demo
   fixtures.

**Exit criteria:** changing tenant configuration updates all public, portal,
notification, document, and payment surfaces without a code change.

### P2 — Tenant CMS

1. Add tenant-owned pages, page versions, content blocks, navigation menus,
   announcements, media assets, redirects, and SEO records.
2. Add draft, preview, publish, schedule, rollback, and audit history.
3. Migrate About, Home, Contact, Services, Specialties, Insurance, FAQ, Legal,
   Footer, Header, Blog, Careers, Gallery, Testimonials, and Health Packages.
4. Provide accessible block editors with validation, autosave, unsaved-change
   warnings, and mobile previews.

**Exit criteria:** a hospital administrator can publish the complete website
without developer assistance.

### P3 — Hospital setup and operational catalogs

1. Create guided onboarding for identity, domain, locale, departments, services,
   doctors, pricing, schedules, taxes, payments, and communications.
2. Add tenant-owned reference catalogs for designations, blood groups, gender
   options, patient categories, specializations, insurers, currencies,
   languages, holidays, working hours, and appointment duration.
3. Add configuration completeness checks and a launch-readiness dashboard.
4. Add import/export templates for initial data onboarding.

**Exit criteria:** a new tenant can reach a production-ready configuration
without source changes or database assistance.

### P4 — Staff experience and accessibility

1. Standardize role-specific navigation, global search, saved filters, command
   palette, keyboard shortcuts, touch targets, validation, empty states, and
   responsive tables.
2. Add autosave and drafts where data loss is possible.
3. Complete WCAG 2.1 AA testing for keyboard order, names/roles/values, contrast,
   focus visibility, error association, reduced motion, and screen readers.
4. Test desktop, tablet, Android, iPhone, Chromium, Firefox, and WebKit layouts.

**Exit criteria:** automated accessibility checks pass and priority workflows
are usable at 320 px width and with keyboard-only navigation.

### P5 — Scale, resilience, and operations

1. Add pagination and indexed tenant filters to every unbounded collection.
2. Make cache keys tenant-aware and define invalidation after configuration or
   CMS publishing.
3. Move notifications, document generation, imports, reminders, and webhooks to
   idempotent background jobs with retry and dead-letter handling.
4. Add tenant-aware metrics, structured logs, traces, backups, restore tests,
   rate limits, quotas, and operational runbooks.
5. Load-test representative tenants at 1, 10, 100, and 1,000-hospital data
   distributions.

**Exit criteria:** documented SLOs, tested restore procedures, bounded queries,
and no architecture change required for 1,000 tenants.

## Configuration documentation contract

Every setting must document:

- key and display name;
- purpose and safe default;
- scope (`public`, `protected`, or `secret`);
- admin location and required role;
- validation rules;
- runtime consumers;
- dependencies and fallback behavior;
- cache and publication behavior;
- audit event emitted when changed.

## Delivery strategy

- Ship P0 before expanding CMS functionality.
- Deliver vertical slices: schema/RLS, server service, admin UI, public consumer,
  audit event, tests, and documentation together.
- Preserve current routes and data contracts during migration by retaining
  compatibility defaults until tenant data is populated.
- Use feature flags and reversible migrations; never require a simultaneous
  all-tenant cutover.

