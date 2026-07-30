# Hospital ERP RC-1 Enterprise Audit

**Assessment date:** 2026-07-29  
**Assessment type:** repository and documentation audit; no deployment performed  
**Decision:** **Not ready for paid hospital production. Conditionally ready for a controlled demonstration.**

## 1. Executive summary

The product has progressed beyond a website prototype. It contains a credible
Next.js/Supabase foundation, public website, patient portal, administrative
workspaces, appointments, reception, prescriptions, laboratory, pharmacy,
billing, payments, finance, HR, notifications, CMS elements, tenant resolution,
RBAC, RLS migrations, audit helpers, and 173 passing unit/integration tests.

It is nevertheless not yet an enterprise Hospital Information System. The
largest gaps are clinical depth (encounters, observations, diagnoses, orders,
medication administration and longitudinal charting), inpatient/ADT and nursing,
radiology/PACS, insurance claims, procurement and stock traceability,
interoperability, regulatory controls, disaster recovery, and configuration-only
tenant onboarding. Several existing modules are functional slices rather than
closed-loop, exception-safe hospital workflows.

No repository-confirmed Critical security vulnerability remains. Production is
blocked by High risks: known vulnerable runtime dependencies, unverified live
RLS/migration state, an exposed service credential that must be rotated,
incomplete tenant/CMS conversion, absent restore evidence, and insufficient
end-to-end role and clinical workflow evidence.

### Readiness verdicts

| Milestone | Verdict | Conditions |
|---|---|---|
| Sales demonstration with synthetic data | **Conditional Go** | Stable demo tenant, scripted flows, no real PHI, provider mocks clearly labelled |
| Single-hospital supervised pilot | **No-Go today** | Requires all RC-1 blockers closed and a limited pilot scope |
| Multi-hospital paid production | **No-Go** | Requires tenant isolation certification, operations, compliance, onboarding, and workload proof |
| General Availability | **No-Go** | Requires GA checklist and at least one successful controlled pilot |

## 2. Scores

Scores measure demonstrated evidence, not code quantity.

| Area | Score | Rationale |
|---|---:|---|
| Production readiness | **58/100** | Builds/tests pass, but recovery, live migration verification, SLOs and production acceptance are missing |
| Enterprise readiness | **48/100** | Broad module surface; material clinical, inpatient, interoperability and governance gaps |
| Commercial SaaS readiness | **43/100** | Tenant foundation exists; self-service onboarding, plans, support tooling and safe upgrades are incomplete |
| White-label readiness | **57/100** | Typed configuration and runtime branding exist; 64 current source files still match tenant identity literals |
| Security | **64/100** | Strong baseline controls; dependency, secrets, CSP, fail-open demo auth and live RLS evidence remain |
| Performance | **66/100** | Modern stack and Web Vitals hook; no representative load, database plan or capacity evidence |
| Accessibility | **59/100** | Some semantic/focus controls; no complete WCAG 2.1 AA/browser/assistive-technology evidence |
| Testing coverage | **62/100** | 173 unit/integration tests and 3 E2E specs; no measured line/branch coverage or complete workflow matrix |
| Documentation | **77/100** | Extensive architecture, workflow and operations documents; some claims exceed verified runtime evidence |

## 3. Benchmark and feature-gap basis

The comparison is directional, not a claim of feature parity. Epic describes an
integrated continuum spanning acute/inpatient, specialties, revenue cycle,
population health, patient experience and capacity. Oracle Health documents an
enterprise-wide EHR plus registration, scheduling, automation and standards-based
exchange. OpenMRS emphasizes configurable clinical forms, diagnoses, orders,
FHIR/REST, granular privileges and clinical reporting. Bahmni includes registration,
clinical care, laboratory, radiology, inpatient/ADT, stock, billing/accounting and
configurable reports. Odoo supplies the ERP benchmark for accounting, HR,
procurement, barcode inventory and traceability.

Sources:

- [Epic Health Systems & Clinics](https://www.epic.com/software/health-systems-and-clinics/)
- [Oracle Health EHR intended use](https://docs.oracle.com/en/industries/health/oracle-health-ehr/about_oracle_health_ehr/)
- [Oracle Health interoperability](https://www.oracle.com/health/interoperability/)
- [Oracle Health Patient Administration](https://www.oracle.com/health/revenue-cycle/patient-administration/)
- [OpenMRS product and features](https://openmrs.org/product/)
- [Bahmni feature list](https://www.bahmni.org/feature-list)
- [Bahmni reporting](https://www.bahmni.org/reporting/)
- [Odoo Inventory](https://www.odoo.com/app/inventory)
- [Odoo Employees](https://www.odoo.com/app/employees)

## 4. Module classification

“Production Ready” means repository-ready for its stated bounded purpose, not
that the whole system may handle live PHI.

| Module | Classification | Justification |
|---|---|---|
| Public website shell | Needs minor improvements | Broad routes, SEO and responsive components exist; remaining identity literals and CMS gaps prevent white-label completion |
| Authentication/session | Needs major improvements | Supabase validation and guards exist; production must fail closed and recovery/MFA/session administration require proof |
| RBAC | Needs major improvements | Role/path helpers and tests exist; field/action/location-level privileges and live role acceptance are incomplete |
| Tenant resolution/config | Needs major improvements | Host/header/cookie resolution and typed config exist; protected settings migration and cross-tenant runtime proof remain |
| Patient registration/profile | Needs minor improvements | CRUD and validation exist; duplicate/MPI, merge, consent and identity-document workflows are incomplete |
| Appointments/calendar | Needs minor improvements | Booking, slots, queue and availability exist; recurrence, waitlist, overbooking, resource scheduling and exception handling need depth |
| Reception/walk-in | Needs major improvements | Walk-in slice exists; check-in, token lifecycle, triage, deposits and encounter handoff need full acceptance |
| Doctor/consultation | Needs major improvements | Doctor and prescription surfaces exist; no complete encounter, observations, coded diagnosis, CPOE or longitudinal clinical chart |
| Prescription | Needs major improvements | Creation/printing exists; allergy/interaction checks, formulary, electronic signing, dispense loop and controlled-drug governance absent |
| Laboratory | Needs major improvements | Orders/results workspace exists; accessioning, specimen chain, QC, analyzer interface, reference ranges and result authorization incomplete |
| Radiology | Not ready | No substantive RIS/PACS/DICOM/order-to-report workflow evidenced |
| Pharmacy | Needs major improvements | Dispensing/billing slice exists; batch/lot/expiry, substitutions, returns, controlled stock and purchase/reorder controls incomplete |
| Billing/payments/invoices | Needs minor improvements | Gateway verification, refund, webhook, audit and PDF controls exist; cashier shifts, credit notes, deposits, reconciliation and payer workflows need depth |
| Insurance/claims | Not ready | Public insurance content exists; eligibility, preauthorization, claim, denial and settlement workflows do not |
| Admission/ADT/wards/beds | Not ready | No complete admission, transfer, discharge, bed and ward lifecycle |
| Nursing/MAR | Not ready | No nursing task, vitals chart, medication administration or care-plan workflow |
| Inventory/procurement | Not ready | Pharmacy data is not a complete purchase, GRN, vendor, store, batch, transfer and stock-ledger system |
| Finance | Needs major improvements | Workspace/service exist; no demonstrated double-entry ledger, close, reconciliation, budgets or statutory reporting |
| HR | Needs major improvements | Workspace/service exist; recruitment, credentialing, roster, attendance, leave and payroll closure require validation |
| Payroll | Not ready | No complete jurisdiction-aware payroll lifecycle evidenced |
| Notifications | Needs minor improvements | Email/SMS/WhatsApp abstraction, templates, retry and logs exist; durable jobs, consent, DLQ, delivery reconciliation and tenant secrets missing |
| Reports/analytics | Needs major improvements | Dashboards/export exist; clinical/regulatory/financial report catalog, semantic definitions and scheduled distribution incomplete |
| CMS | Needs major improvements | Blog/gallery/testimonials and schema foundation exist; full page/block version/publish/rollback UI is incomplete |
| Settings/onboarding | Needs major improvements | Hospital settings and onboarding schema exist; administrator cannot complete all setup without developer/database assistance |
| Audit logs | Needs major improvements | Audit helpers and tables exist; immutable, comprehensive actor/action/before-after/query/export review is unproven |
| File storage | Needs major improvements | Storage abstraction exists; tenant paths, malware scanning, retention, legal hold, quotas and restore need implementation/evidence |
| Monitoring/health | Needs major improvements | Health and Web Vitals endpoints exist; centralized logs, traces, alerts, SLOs and runbooks are not operationally proven |

## 5. Enterprise workflow review

| Workflow | Completeness | Principal failure/edge cases | Security/audit/performance/UX verdict |
|---|---|---|---|
| Patient registration | Partial | duplicate patient, merge/unmerge, guardian, emergency identity | Tenant filters exist; MPI and consent audit are High gaps |
| Appointment | Substantial | concurrent slot claim, cancellation policy, waitlist, resource conflicts | Unique-slot migration exists; live concurrency proof required |
| Walk-in/reception | Partial | unknown patient, queue reprioritization, no-show, deposit | Needs closed-loop token-to-encounter audit |
| Consultation | Partial | allergies, problem list, vitals, coded diagnosis, addendum | Major clinical-safety and audit gap |
| Prescription | Partial | interaction, allergy, substitution, renewal, e-signature | Printing is hardened; medication safety absent |
| Laboratory | Partial | mislabeled/rejected sample, recollection, critical result, corrected report | Requires chain-of-custody and authorized validation |
| Radiology | Missing | modality worklist, DICOM, preliminary/final report | Not Ready |
| Pharmacy | Partial | lot/expiry, partial fill, return, recall, controlled drug | Requires full stock ledger and separation of duties |
| Billing/payments | Substantial | split tender, advance, reversal, charge correction, reconciliation | Payment security is credible; finance closure incomplete |
| Insurance | Missing | eligibility, preauth, coding, claim, denial, remittance | Not Ready |
| Admission/discharge | Missing | transfer, bed hold, leave, death, discharge summary | Not Ready |
| Inventory | Minimal | purchase approval, GRN, quarantine, transfer, stock count | Not Ready |
| HR/payroll | Partial/minimal | roster conflicts, credential expiry, payroll reversal | Major Improvements |
| Notifications | Substantial | consent, preference conflicts, duplicate delivery, provider outage | Move to idempotent durable queue and DLQ |
| CMS/website | Partial | draft collision, preview, schedule, rollback, redirect | Schema exists; administrator workflow incomplete |
| Reports/analytics | Partial | definition drift, late data, PHI export, large datasets | Require catalog, export authorization and bounded queries |
| Settings | Partial | incomplete config, invalid provider, secret rotation | Needs launch-readiness validation and vault references |
| Audit review | Partial | privileged tampering, bulk export, retention, investigation | Immutable centralized evidence required |

## 6. Prioritized feature gaps

### Critical

No repository-confirmed Critical defect was found. A cross-tenant read/write in
live testing, invalid payment signature acceptance, or loss of recoverability
would immediately become Critical and stop the pilot.

### High

1. Apply and independently verify migrations 026–031, including denied
   cross-tenant read/write/export/storage tests.
2. Rotate the Supabase service-role credential disclosed during development;
   review access logs and ensure it is absent from source, logs and client bundles.
3. Resolve High runtime dependency advisories through the controlled Next.js
   modernization backlog.
4. Complete configuration/CMS removal of 64 currently matched identity files.
5. Make production authentication fail closed; add MFA, session revocation and
   privileged access acceptance.
6. Prove backup restoration, RPO/RTO and database/storage consistency.
7. Complete clinical encounter, allergy, diagnosis, order and result-signoff
   controls for any claimed clinical pilot scope.
8. Complete durable, idempotent background processing for notifications,
   reminders, documents and webhooks.
9. Add comprehensive E2E matrices for every enabled role and tenant boundary.
10. Establish privacy/compliance controls: consent, purpose/access policy,
    retention, breach response, data export/deletion and PHI log redaction.

### Medium

- Tighten CSP; add explicit server-only boundaries and import enforcement.
- Add pagination, indexes/query-plan review and tenant-aware cache invalidation.
- Complete WCAG 2.1 AA testing across keyboard, screen readers and mobile.
- Add report definitions, scheduling, row-level export authorization and
  regulatory/statutory packs.
- Add provider secret references backed by a managed vault.
- Add support console with tenant health, correlation IDs and impersonation
  requiring approval, expiry and audit.
- Add subscription entitlement, metering, plan lifecycle and dunning before SaaS sale.
- Add data import validation, dry-run, reconciliation and rollback.

### Low

- Standardize microcopy, empty states, skeletons, iconography and print layouts.
- Add configurable dashboard widgets and saved views.
- Expand translation and RTL coverage.
- Improve administrator help, guided tours and contextual documentation.

## 7. White-label hardcoded inventory

The original baseline recorded 61 files. A current case-insensitive scan for
hospital name, project slug, location, test identities and Indian phone literals
matches **64 source files**. This is a broader current measure, not a regression
claim; seed/demo fixtures should ultimately be isolated and exempted by policy.

Legend: **P1** runtime identity/transactional output; **P2** content/CMS; **P3**
demo fixture. Effort is engineering time including tests.

| File(s) | Hardcoded category | Severity | Configuration source | Effort | Dependencies | Priority |
|---|---|---:|---|---:|---|---|
| `src/app/api/contact/route.ts`, `src/app/api/careers/apply/route.ts` | recipient/location identity | High | protected communications + CMS | 0.5d | tenant mail settings | P1 |
| `src/app/api/phase2/bills/route.ts`, `src/app/api/phase2/prescriptions/route.ts` | document issuer/footer | High | invoice/prescription templates | 1d | tenant template service | P1 |
| `src/lib/payments/pdf.ts`, `completion.ts`, `razorpay.ts`, `razorpay-checkout.ts`, `types.ts` | merchant/receipt/payment labels | High | protected payments + document templates | 1.5d | vault references | P1 |
| `src/lib/notifications/booking-confirm.ts`, `email.ts`, `service.ts`, `sms.ts`, `whatsapp.ts` | sender/signature/contact | High | public contact + protected provider settings | 1.5d | tenant-aware jobs | P1 |
| `src/lib/notifications/templates/email-templates.ts`, `message-templates.ts` | subject/body/signature | High | tenant notification templates | 1d | template versioning | P1 |
| `src/lib/notifications/providers/email/gmail-provider.ts`, `resend-provider.ts` | sender identity | High | protected sender + secret reference | 0.5d | vault | P1 |
| `src/components/admin/hms/prescription-manager.tsx`, `src/lib/hms/export.ts` | print heading/footer | High | document templates | 1d | server-side rendering preferred | P1 |
| `src/app/api/health/route.ts` | product/hospital identifier | Medium | non-sensitive tenant/product config | 0.25d | health contract | P1 |
| `src/components/payments/payment-options.tsx`, `src/components/patient/patient-payments.tsx` | merchant labels | Medium | public billing display config | 0.5d | payment settings | P1 |
| `src/components/chatbot/ai-chatbot.tsx` | hospital/location/contact answers | High | public config + approved knowledge base | 1d | CMS/search safety | P1 |
| `src/lib/patient/service.ts`, `src/lib/doctors/service.ts`, `src/lib/health-packages/service.ts` | demo tenant data/fallbacks | Medium | tenant catalogs/CMS | 1d | data migration | P2 |
| `src/lib/data.ts`, `src/lib/gallery/site-images.ts`, `src/lib/utils.ts` | global fallbacks/asset identity | Medium | tenant CMS/media + neutral utilities | 1d | asset migration | P2 |
| `src/app/admin/login/page.tsx` | admin metadata/identity | Medium | tenant public config | 0.25d | tenant resolution | P1 |
| `src/app/about/page.tsx`, `appointment/page.tsx`, `careers/page.tsx`, `contact/page.tsx`, `doctor/page.tsx`, `doctors/page.tsx`, `doctors/[slug]/page.tsx` | titles/descriptions/location | Medium | page SEO + CMS | 1.5d | CMS publishing | P2 |
| `src/app/facilities/page.tsx`, `faq/page.tsx`, `gallery/page.tsx`, `insurance/page.tsx`, `services/page.tsx`, `testimonials/page.tsx` | page copy/SEO/identity | Medium | page SEO + CMS | 1.5d | CMS publishing | P2 |
| `src/app/health-packages/page.tsx`, `health-packages/[slug]/page.tsx`, `privacy/page.tsx`, `terms/page.tsx` | offer/legal/issuer identity | High | packages + versioned legal CMS | 1d | legal approval/versioning | P1/P2 |
| `src/components/layout/header.tsx` | brand/phone/navigation | High | branding/contact/navigation CMS | 0.5d | public projection | P1 |
| `src/components/home/about-preview.tsx`, `testimonials-preview.tsx` | home marketing copy | Medium | home page blocks | 0.5d | CMS blocks | P2 |
| `src/components/pages/about-content.tsx`, `careers-content.tsx`, `contact-content.tsx`, `doctor-profile-content.tsx`, `gallery-content.tsx` | marketing/location/contact content | Medium | page CMS/media | 1.5d | CMS blocks/assets | P2 |
| `src/components/admin/hms/test-notifications-panel.tsx` | test recipient/examples | Low | tenant-scoped admin test input | 0.25d | validation/redaction | P3 |
| `src/data/blog.json`, `careers.json`, `doctor.json`, `faq.json`, `hospital.json`, `testimonials.json` | global seed content and identity | Medium | tenant-owned CMS/import seed | 2d | import and ownership migration | P2 |
| `src/i18n/translations.ts` | translated hospital identity/location | Medium | translation keys + tenant interpolation | 0.5d | localization config | P2 |

### White-label migration schedule

| Week | Scope | Exit evidence |
|---|---|---|
| 1 | Transactional documents, notifications, payments, health/admin metadata | No tenant literal in patient/staff output; template tests |
| 2 | Public metadata, navigation, pages and legal content | Config-only tenant changes all public surfaces |
| 3 | Convert JSON/global services to tenant CMS/catalogs and media | Publish/rollback and tenant ownership tests |
| 4 | Chatbot knowledge, translations, demo fixture isolation, CI literal guard | New “Demo Hospital” works without source changes; scan ≤2% approved fixtures |

Estimated total: **15–22 engineering days**, plus content migration and hospital
acceptance. Configuration coverage must be measured by runtime consumer mapping,
not only literal count; current defensible estimate is **57%**.

## 8. Next.js modernization backlog

| Phase | Objective / affected areas | Breaking changes | Test and rollback | Effort / risk / dependency |
|---|---|---|---|---|
| N0 | Tag stable Next 14 baseline; inventory routes, bundle, headers, Web Vitals | None | Re-run build/type/lint/tests; preserve lockfile/tag | 0.5d, Low |
| N1 | Convert request APIs in auth, HMS, hospital, Supabase, admin layouts/APIs | async `cookies()`/`headers()` propagation | Auth, tenant, redirect, middleware and API contract tests; commit-by-commit revert | 2–4d, High; stable baseline |
| N2 | Convert dynamic `params`/`searchParams` across doctor/blog/package/invoice/admin routes | Promise route props | Route matrix, metadata and 404 tests; revert route groups independently | 1–2d, Medium; N1 |
| N3 | Make cache intent explicit for public config/CMS vs PHI/admin | Next 15 GET/fetch defaults | Cross-tenant cache-poisoning and stale publish tests; feature flags | 1–2d, High; CMS contracts |
| N4 | Replace `next lint` with standalone ESLint; upgrade Supabase SSR separately | tooling/config changes | Clean lint/typecheck/auth suite; lockfile rollback | 0.5–1d, Low; N1 |
| N5 | React 19 compatibility and types; validate forms, refs, hydration and Strict Mode | React lifecycle/form semantics | Component/E2E/a11y/browser suite; revert React packages together | 2–3d, High; N1–N4 |
| N6 | Upgrade Next and eslint-config-next to patched supported release | runtime/build/image/CSP behavior | Full CI, role E2E, payment sandbox, middleware, image, bundle and audit gates | 1–2d, High; N1–N5 |
| N7 | Canary acceptance and observability comparison | operational rollout | 5% synthetic/canary, error/latency comparison; instant app rollback, no DB migration | 2–3d, Medium; monitoring |

Total expected effort remains **8–14 focused engineering days**, excluding
discovered workflow defects. Do not combine framework and destructive database
migrations.

## 9. Commercial product review

| Question | Answer |
|---|---|
| Can hospitals onboard themselves? | **No.** Schema/foundation exists, but setup is not end-to-end or launch-validated. |
| Can branding be changed? | **Partly.** Primary branding is configurable; 64 matched files prevent a complete guarantee. |
| Can CMS be managed without developers? | **Partly.** Several collections have admin CMS; full page/block/navigation/legal publish lifecycle is incomplete. |
| Can all configuration avoid source changes? | **No.** Identity, templates, static JSON and provider concerns remain. |
| Can multiple hospitals operate independently? | **Architecturally plausible, not certified.** Live RLS, storage, caching, jobs and exports need adversarial proof. |
| Can subscription plans be added? | **Not as a commercial lifecycle today.** Entitlements exist conceptually; plan checkout, metering, invoices, dunning and suspension are incomplete. |
| Can support troubleshoot tenants? | **Not safely enough.** Needs tenant health, correlation IDs, redacted diagnostics and audited time-bound support access. |
| Can upgrades occur safely? | **Partly.** Migrations and CI exist; canary, compatibility contracts and exercised rollback are missing. |

## 10. Quality and operations

### Architecture

Strengths: typed services, App Router separation, provider abstractions,
validation, tenant domain, migration history. Risks: demo stores and production
paths coexist; business modules are uneven; background work and reporting lack a
durable platform; no formal clinical data model/interoperability boundary.

### Security and privacy

Positive controls include authenticated Supabase sessions, RBAC helpers, CSRF
origin checks, rate limiting, HMAC payment verification, tenant migrations and
security headers. Before PHI, close dependency advisories, rotate the exposed
credential, apply migration 031, fail closed, harden CSP, mark secret modules
server-only, redact logs, and conduct live OWASP/API/tenant tests.

### Performance and scale

No evidence establishes safe operation at 10, 100 or 1,000 tenants. Establish
bounded pagination, index/query-plan budgets, cache ownership, queue throughput,
connection limits and load tests using realistic skew and document sizes.

### Accessibility and UX

The component set includes useful foundations, but enterprise quality requires
task-based keyboard and screen-reader testing, error association, contrast,
reduced motion, touch targets, responsive tables, print workflows and
role-specific usability studies.

### Operational readiness matrix

| Control | Status | Required evidence |
|---|---|---|
| Backups | Not verified | automated DB + object backups, encryption, retention and ownership |
| Restore | Not ready | quarterly restore exercise with measured RPO/RTO and reconciliation |
| Monitoring/alerting | Partial | centralized metrics/logs/traces, on-call routing, alert tests |
| Health checks | Partial | dependency-aware readiness without leaking details |
| Logging | Partial | correlation IDs, PHI redaction, immutable security/audit stream |
| Disaster recovery | Not ready | regional/provider failure runbook and exercise |
| Database migrations | Partial | ledger, preflight, backward compatibility, production verification |
| Secrets | Not ready | rotate disclosed key; vault, per-tenant references, rotation runbook |
| Environments | Partial | isolated dev/test/stage/prod data and credentials |
| Deployment | Partial | immutable artifacts, approvals, canary and smoke suite |
| Rollback | Not verified | app rollback plus forward-compatible DB recovery exercise |

## 11. Release blockers

RC-1 may be called a **demonstration release candidate** only after:

1. All High dependency/security findings are closed or formally risk-accepted
   with compensating controls and expiry.
2. The exposed credential is rotated.
3. Migrations 026–031 are applied in a non-production acceptance environment and
   tenant isolation tests pass.
4. Backup restore is executed successfully.
5. Every enabled demo role completes its scripted happy path and authorization
   negative path.
6. Demo tenant contains only synthetic data and external providers cannot create
   unintended real transactions.
7. Known limitations are contractually and visibly separated from completed
   capabilities.

Paid pilot additionally requires the pilot scope to exclude Not Ready modules or
complete them, plus privacy/compliance approval, incident response, support/SLOs,
data migration reconciliation and hospital user acceptance.

## 12. Recommended RC-1 checklist

- [ ] Freeze enabled scope and publish a module/limitation matrix.
- [ ] Rotate exposed credentials and scan repository, build artifacts and logs.
- [ ] Apply/verify migrations 026–031; archive tenant-audit evidence.
- [ ] Run unit, integration, production build and complete role E2E suites.
- [ ] Execute cross-tenant read/write/export/cache/storage negative tests.
- [ ] Exercise payment sandbox create/verify/refund/webhook/idempotency.
- [ ] Exercise notification outage/retry/duplicate/consent cases.
- [ ] Restore database and storage to an isolated environment.
- [ ] Run WCAG 2.1 AA automated and manual priority-flow checks.
- [ ] Run realistic concurrency/load tests and inspect database plans.
- [ ] Complete white-label P1 transactional output conversion.
- [ ] Prepare synthetic Demo Hospital, demo script and limitations sheet.
- [ ] Obtain security, clinical safety, product and operations sign-off.

## 13. Recommended GA checklist

- [ ] Configuration coverage ≥98% with CI literal guard.
- [ ] Full CMS/onboarding usable without developer or database access.
- [ ] Certified tenant isolation for DB, storage, jobs, cache, exports and support.
- [ ] All marketed workflows rated Production Ready.
- [ ] Clinical safety hazard log and change-control process approved.
- [ ] Applicable privacy, security, financial and healthcare regulatory assessment completed for target jurisdictions.
- [ ] Patched supported runtime with clean production dependency gate.
- [ ] MFA, privileged access management and immutable audit review operational.
- [ ] SLOs, on-call, incident response, breach response and status communications exercised.
- [ ] RPO/RTO restore and disaster-recovery exercises pass.
- [ ] Capacity tests meet forecast plus agreed safety margin.
- [ ] Data migration dry-run/reconciliation/rollback tooling proven.
- [ ] Accessibility conformance evidence completed.
- [ ] At least one supervised pilot exits with signed acceptance and no open Critical/High defects.

## 14. Version 2.0 roadmap

1. **Clinical platform:** encounter model, observations, coded terminology,
   allergies, problems, diagnoses, CPOE, e-signatures and clinical decision
   support.
2. **Inpatient and nursing:** ADT, bed/ward management, nursing plans, vitals,
   MAR, discharge and transfer-of-care.
3. **Diagnostics:** complete LIS plus RIS/PACS/DICOM and critical-result workflow.
4. **Revenue cycle:** contracts, estimates, deposits, insurance eligibility,
   preauthorization, claims, denials and remittance.
5. **ERP depth:** procurement, vendors, GRN, lot/expiry inventory, fixed assets,
   accounting close, payroll and workforce scheduling.
6. **Interoperability:** FHIR/REST, terminology service, external labs,
   e-prescribing, payer and national exchange adapters.
7. **SaaS control plane:** automated provisioning, domains, plans, metering,
   quotas, tenant health, support and lifecycle.
8. **Data/quality:** governed warehouse, regulatory reports, population health,
   quality measures and de-identified analytics.

## 15. Final recommendation

Proceed with an internal **RC-1 demonstration hardening sprint**, not a production
release. Do not market the product as an enterprise EHR/HIS or accept live PHI
until the blockers above are evidenced. A tightly scoped, supervised pilot can
be reconsidered after the High items and pilot controls are closed. General
Availability should remain blocked until configuration reaches at least 98%,
the supported runtime is patched, operations are exercised, and a pilot exits
successfully.
