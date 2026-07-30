# Performance Audit

## Existing controls

- Next.js production optimization and compression.
- AVIF/WebP image formats and responsive sizes.
- Package import optimization.
- Public middleware fast path without Supabase auth round trip.
- Catalog caching and static generation where appropriate.
- Web-vitals reporting endpoint.

## Unverified gates

- Production Lighthouse and Core Web Vitals.
- API latency percentiles and database query plans.
- Hydration/console errors across routes.
- Bundle budgets and route-specific JavaScript.
- Load/concurrency behavior for slots, queue, reports, notifications, and webhooks.

Targets should include LCP ≤2.5s, INP ≤200ms, CLS ≤0.1 at the 75th percentile, Lighthouse ≥90 on key public pages, explicit API SLOs, and database `EXPLAIN ANALYZE` for common tenant-scoped queries.
