# White-Label Phase 1 Progress Report

**Date:** 2026-07-29  
**Deployment:** Not performed

## Outcome

The hospital-identity scan decreased from 64 to 16 source files. Customer-facing
transactional surfaces now receive branding from tenant configuration for
prescriptions, invoices, payment checkout, payment notifications, contact and
career delivery, admin test notifications, and printable reports.

The numerical file target (20 or fewer) is met. Phase 1 is not declared complete
because remaining static seed content and runtime fallback services have not all
been migrated to tenant-owned CMS records.

## Validation

| Gate | Result |
|---|---|
| ESLint | Pass |
| TypeScript | Pass |
| Unit/integration tests | 177 passed, 0 failed, 1 integration test intentionally skipped |
| Production build | Pass, 73 static pages generated |
| Deployment | Not performed |

## Completed in this milestone

- Tenant-neutral default configuration; no runtime dependency on
  `src/data/hospital.json`.
- Tenant-configured invoice and prescription branding.
- Tenant-configured Razorpay checkout labels and payment notification branding.
- Tenant-configured email sender/inbox selection for contact and career forms.
- Tenant-configured report issuer and prescription template note.
- Tenant-configured public content snippets for testimonials, careers, contact,
  doctor profiles, gallery and about sections.
- Neutralized tenant-specific static descriptions on core public routes.
- Neutral health-check service identifier.
- Neutral chatbot location intent; contact values already come from tenant config.

## Remaining 16 matched files

| Area | Files | Severity | Required source | Estimate |
|---|---|---:|---|---:|
| Dynamic metadata/schema | `src/app/doctors/[slug]/page.tsx`, `src/app/health-packages/[slug]/page.tsx` | Medium | tenant SEO + CMS | 0.5–1 day |
| Phone localization | `src/components/layout/header.tsx`, `src/lib/utils.ts` | Medium | localization/dialing config | 0.5 day |
| Legacy seed content | `src/data/blog.json`, `careers.json`, `doctor.json`, `faq.json`, `hospital.json`, `testimonials.json` | High | tenant CMS/import fixtures | 2–3 days |
| Translations | `src/i18n/translations.ts` | Medium | tenant interpolation + localized CMS | 1 day |
| Legacy data facade | `src/lib/data.ts` | High | tenant services/CMS | 1–2 days |
| Doctor/package/gallery services | `src/lib/doctors/service.ts`, `health-packages/service.ts`, `gallery/site-images.ts` | High | tenant-owned database/CMS only | 2–3 days |
| Patient demo fallbacks | `src/lib/patient/service.ts` | High | tenant-aware test fixtures | 1 day |

## Coverage assessment

| Metric | Current | Basis |
|---|---:|---|
| Literal-file remediation | **75%** | 48 of the original 64 matched files removed from the scan |
| Configuration-domain coverage | **91%** | Branding, contact, localization, legal, modules, prefixes, payments, providers, templates, SEO, social and hours have typed configuration and primary consumers |
| CMS administrative coverage | **72%** | Blog, gallery, testimonials, doctors and packages have management surfaces; complete page/block/navigation/legal workflow remains incomplete |
| White-label readiness | **84%** | Transactional identity substantially configured; legacy seeds and complete tenant validation remain |
| Enterprise readiness | **52%** | White-label work improved; clinical and operational blockers remain |
| Commercial readiness | **49%** | Better tenant customization; self-service onboarding, support and billing lifecycle remain incomplete |

Configuration-domain coverage is not the same as configuration-only onboarding.
The 91% score means suitable configuration domains and primary consumers exist;
the three-tenant acceptance test is still required before claiming ≥90%
end-to-end configuration completeness.

## Branding references remaining

- Legacy hospital name, location, doctor biography and testimonials in JSON seeds.
- Tenant-specific SEO fallbacks in doctor and health-package services.
- Location/name fallbacks in patient demo records.
- Indian `+91` formatting assumptions.
- Legacy localized marketing copy.

## Next milestone

Complete **CMS Seed Retirement and Three-Tenant Acceptance**:

1. Import legacy JSON into tenant-owned CMS/catalog records.
2. Remove runtime JSON fallbacks outside explicitly named test fixtures.
3. Make dynamic doctor/package metadata tenant-aware.
4. Make phone formatting country-aware.
5. Provision Hospital Alpha, Beta and Gamma through configuration only.
6. Verify distinct branding, doctors, departments, CMS, SEO, invoices,
   prescriptions and chatbot responses with automated cross-tenant tests.

Exit gates: zero runtime tenant-identity literals, CMS coverage at least 95%,
three-tenant acceptance passing, and all existing quality gates green.
