# Deployment

## Target

Vercel for Next.js; Supabase for Auth, PostgreSQL, and Storage.

## Safe sequence

```mermaid
flowchart LR
  CI["Lint, typecheck, tests, build"] --> DB["Backup and apply migrations"]
  DB --> Preview["Deploy preview"]
  Preview --> E2E["Role, API, security, a11y, performance tests"]
  E2E --> Approve{"All gates green?"}
  Approve -- No --> Fix["Fix or rollback"]
  Approve -- Yes --> Prod["Deploy production"]
  Prod --> Smoke["Production smoke and provider checks"]
  Smoke --> Monitor["Monitor and retain rollback"]
```

Deployment is prohibited until migrations/RLS, all roles, Playwright, integrations, accessibility, performance, security, monitoring, backup, and rollback gates pass. No commit, push, or deployment was performed by this audit.
