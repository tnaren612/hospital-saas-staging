# Semantic White-Label Audit

**Date:** 2026-07-29  
**Deployment:** Not performed  
**Phase 1 decision:** **NO-GO / incomplete**

## Executive finding

The literal scan improvement from 64 to 16 files is valid but is not a reliable
white-label completion measure. A route-by-route semantic trace found that
customer-facing content still comes from:

- the legacy synchronous `getHospital()`, `getDoctor()` and `getFaqs()` facade;
- static arrays embedded in public components;
- imported JSON fixtures;
- fallback doctor, department, service, image and marketing content;
- static route metadata created from build-time defaults;
- fixed header/navigation structures;
- static legal policies and chatbot knowledge.

Migration 030 creates tenant-owned CMS tables, versions, navigation and
announcements, but no application service currently reads or writes
`cms_pages`, `cms_page_versions`, `cms_navigation` or `cms_announcements`.
Therefore the previous 72% CMS score overstated administrator-editable coverage.

## Corrected scores

| Metric | Previous estimate | Evidence-based score | Explanation |
|---|---:|---:|---|
| Literal-file remediation | 75% | **75%** | 48 of the original 64 known-pattern files no longer match |
| Configuration coverage | 91% | **68%** | Strong typed identity/settings domain, but many consumers still use the legacy facade or static fallbacks |
| Customer-facing CMS coverage | 72% | **46%** | Collection CMS exists for several domains; complete page/navigation/legal/announcement CMS has schema only |
| White-label readiness | 84% | **66%** | Transactional branding improved significantly; website content is not configuration-only |
| Pilot white-label readiness | — | **No-Go** | Three independently configured tenants have not passed runtime acceptance |

## Route-level semantic trace

| Surface | Current content source | Classification | Required action |
|---|---|---|---|
| Home | static component arrays, legacy hospital/doctor data, gallery hooks | Must move to CMS | Home page blocks, statistics, service preview, about preview and CTA |
| About | static mission, vision, values, story and specialty copy | Must move to CMS | Versioned About page blocks |
| Doctors | database service with hardcoded doctor fallback and SEO fallback | CMS/catalog + config | Remove production fallback; tenant-aware metadata |
| Departments | database with demo fallback | Tenant catalog | Remove global fallback outside explicit demo mode |
| Services | global service catalog/static marketing copy | CMS/catalog | Tenant ownership and page blocks |
| Facilities | static headings/copy plus gallery media | CMS | Facilities collection/page |
| Packages | database service with static package fallback/SEO organization | CMS/catalog + config | Tenant-only fallback policy and tenant SEO |
| Insurance | static insurers and public copy | CMS/catalog | Tenant insurance partner records and page |
| Testimonials | DB/API with JSON fallback | CMS | Remove runtime JSON fallback in production |
| Gallery | admin DB collection plus local fallback assets | CMS + demo fixture | Explicit non-production fallback boundary |
| Blog | database service plus static sitemap/seed behavior | CMS | Tenant sitemap and no global production fallback |
| Careers | static JSON positions | CMS/catalog | Tenant careers API/admin publishing |
| FAQ | JSON import in page JSON-LD and legacy facade in UI | CMS | Tenant FAQ read/admin service |
| Contact | tenant identity partly configured; headings/copy/map behavior static | CMS + config | Page blocks from CMS; contact/map from config |
| Privacy/Terms | static source arrays | Versioned legal CMS | Publish/effective-date/rollback/acceptance history |
| Header/Footer | fixed navigation arrays and legacy hospital facade | Navigation CMS + config | Consume `cms_navigation`; configurable CTA/footer blocks |
| Announcement | schema present, no runtime consumer | CMS | Read/publish/schedule UI and public banner |
| SEO/Open Graph | many routes use build-time `createMetadata` defaults | CMS + config | Tenant-aware `generateMetadata` for every public route |
| Structured data | dynamic routes use legacy site URL/organization fallbacks | Config | Tenant config in every schema builder |
| Chatbot | tenant emergency contact but legacy doctor/hospital and static knowledge | CMS/catalog + config | Tenant knowledge projection; no static insurer/service claims |
| Notifications | substantially tenant-branded after remediation | Config/templates | Complete tenant template version/admin workflow |
| Documents | invoice/prescription/report issuer substantially configured | Config/templates | Audit remaining fallback paths and add document snapshot tests |

## Remaining 16 literal-match files — individual classification

| File | Semantic finding | Classification | Priority |
|---|---|---|---:|
| `src/app/doctors/[slug]/page.tsx` | fixed affiliation/location metadata and legacy site URL | Tenant configuration | P1 |
| `src/app/health-packages/[slug]/page.tsx` | fixed organization schema and legacy site URL | Tenant configuration | P1 |
| `src/components/layout/header.tsx` | India-specific phone construction and fixed navigation | Configuration + navigation CMS | P1 |
| `src/data/blog.json` | hospital/location content fixture | Demo/sample only after production boundary | P2 |
| `src/data/careers.json` | tenant jobs and locations | Move to CMS | P1 |
| `src/data/doctor.json` | named doctor, specialty and biography | Move to tenant doctor catalog/CMS | P1 |
| `src/data/faq.json` | tenant services, address and claims | Move to CMS | P1 |
| `src/data/hospital.json` | full hospital identity | Remove from runtime; demo fixture only | P1 |
| `src/data/testimonials.json` | tenant-specific patient marketing content | Move to CMS | P1 |
| `src/i18n/translations.ts` | translated tenant marketing identity | Localized CMS + interpolation | P1 |
| `src/lib/data.ts` | exposes all global JSON fixtures to runtime consumers | Remove/replace with tenant services | P0 |
| `src/lib/doctors/service.ts` | global doctor and SEO fallbacks | Tenant catalog/config | P0 |
| `src/lib/gallery/site-images.ts` | named-hospital image matching/fallback behavior | CMS media + neutral demo fixtures | P1 |
| `src/lib/health-packages/service.ts` | organization/SEO/package fallbacks | Tenant catalog/config | P0 |
| `src/lib/patient/service.ts` | named facility/location demo appointment data | Explicit test/demo fixture | P1 |
| `src/lib/utils.ts` | hardcoded Indian dialing/format assumptions | Localization configuration | P1 |

## Additional semantic findings missed by the 16-file scan

### Must move to CMS

- `src/components/home/about-preview.tsx`: pillars and marketing narrative.
- `src/components/home/services-preview.tsx`: specialty title and description.
- `src/components/home/home-extras.tsx`: marketing feature collection.
- `src/components/home/hero.tsx`: displayed statistics.
- `src/components/pages/about-content.tsx`: mission, vision, values and story,
  including a named clinical leader not covered by the current scan pattern.
- `src/components/pages/facilities-content.tsx`: facility marketing copy.
- `src/components/pages/insurance-content.tsx`: insurance claims and partner data.
- `src/components/pages/faq-content.tsx`: legacy FAQ facade and page copy.
- `src/components/pages/testimonials-content.tsx`: specialty-specific headings.
- `src/components/pages/services-content.tsx`: service marketing narrative.
- `src/components/pages/contact-content.tsx`: page narrative.
- `src/app/privacy/page.tsx` and `src/app/terms/page.tsx`: source-owned legal text.

### Must move to tenant configuration/catalogs

- `src/components/home/doctor-preview.tsx`: fixed doctor image fallback chain.
- `src/components/video/meeting-room.tsx`: legacy doctor facade.
- `src/components/pages/video-consult-content.tsx`: legacy doctor facade.
- `src/components/floating/floating-actions.tsx`: legacy hospital facade.
- `src/components/layout/emergency-banner.tsx`: legacy hospital facade.
- `src/lib/appointments/catalog.ts`: legacy doctor fallback.
- `src/app/api/appointments/catalog/route.ts`: legacy doctor fallback.
- Static route metadata across About, Appointment, Careers, Contact, Facilities,
  FAQ, Gallery, Insurance, Services, Testimonials, Terms, Privacy, Blog, Health
  Packages and Video Consultation.

### Acceptable only as explicit demo/sample content

- Local placeholder photography and neutral fixture records may remain if:
  they are outside production bundles or behind a fail-closed non-production
  flag; they are clearly labelled; they never override missing tenant content;
  and CI proves production mode cannot consume them.

### Acceptable framework boilerplate

- Generic validation messages, loading states, empty states, accessibility
  labels, HTTP errors and neutral healthcare UI terminology.
- Generic route names such as “Doctors”, “Services”, “Contact” and “FAQ”.
- Payment-provider protocol names and standards-required labels.

## CMS capability gap

Administrator editability currently has evidence for doctors, gallery, blog,
testimonials and packages. The following cannot be considered complete merely
because migration 030 defines tables:

- generic page/block editor;
- header/footer/navigation editor;
- announcement editor and scheduled public rendering;
- legal document versioning and effective-date workflow;
- tenant SEO/OG editor per page;
- draft/preview/publish/schedule/rollback UI;
- CMS audit history and conflict handling;
- localized content variants;
- tenant import/export.

## Three-tenant validation status

| Tenant | Configuration record | CMS dataset | Runtime acceptance | Status |
|---|---|---|---|---|
| Hospital Alpha | Not provisioned | Not provisioned | Not run | Blocked |
| Hospital Beta | Not provisioned | Not provisioned | Not run | Blocked |
| Hospital Gamma | Not provisioned | Not provisioned | Not run | Blocked |

Provisioning these tenants before a CMS service and production-safe seed
retirement would produce misleading results. The correct sequence is:

1. implement tenant CMS read/write/publish services;
2. migrate legacy content into tenant-owned records;
3. remove production runtime fixture fallbacks;
4. provision the three tenants through the same administrator/import workflow;
5. run cross-tenant browser, API, document, notification and SEO assertions.

## Phase 1 exit decision

**NO-GO.** Lint, type-check, tests and build are green, and transactional
branding is materially improved. Phase 1 cannot be declared complete because:

- configuration coverage is below 95%;
- CMS coverage is below 95%;
- meaningful source-owned customer content remains;
- the CMS schema is not connected to a complete application service/editor;
- Hospital Alpha, Beta and Gamma have not passed configuration-only acceptance.

## Required implementation backlog

1. **P0 — CMS application layer:** tenant-scoped page, version, navigation and
   announcement services/APIs with authorization, validation and audit.
2. **P0 — legacy facade retirement:** replace `src/lib/data.ts` consumers with
   tenant server services or the client configuration provider.
3. **P1 — CMS editors/consumers:** Home, About, Services, Facilities, FAQ,
   Insurance, Careers, Contact, Legal, Header, Footer and Navigation.
4. **P1 — production fixture boundary:** fail closed on missing tenant content;
   allow neutral samples only under an explicit non-production demo flag.
5. **P1 — tenant SEO:** convert every public route to tenant-aware metadata and
   structured data.
6. **P1 — three-tenant acceptance:** provision and test Alpha/Beta/Gamma using
   configuration/CMS only.
7. Run lint, type-check, all tests and production build after each vertical slice.
