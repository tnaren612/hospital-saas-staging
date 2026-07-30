# API Documentation

The repository contains 61 App Router route handlers. This document groups the public contract; route source and Zod schemas remain authoritative.

| Group | Representative routes | Auth |
|---|---|---|
| Public | `/api/health`, `/api/contact`, `/api/careers/apply`, `/api/testimonials`, appointment catalog/slots | Public with validation/rate controls |
| Authentication | `/auth/callback` | Supabase callback |
| Appointments | `/api/appointments`, catalog, slots, notify | Mixed: public create/schedule; protected PHI |
| Admin | `/api/admin/*` | Staff role plus feature permission |
| Patient | `/api/patient/*` | Owning patient or authorized admin |
| Payments | create, verify, history, refund, webhook, settings, analytics | Operation-specific; webhook HMAC |
| Invoices | list and by ID | Staff or owning patient |
| Notifications | preferences, reminders, retry, stats | Protected except explicitly signed automation |
| Monitoring | health, error, vitals | Minimal public health; deep data protected |
| Phase operations | `/api/phase2/*` | Lab/pharmacy/billing staff permissions |

## Standard processing

1. Parse request and tenant context.
2. Authenticate where required.
3. Authorize role, ownership, hospital, and operation.
4. Validate/coerce payload.
5. Apply rate/CSRF controls on abuse-prone mutations.
6. Execute tenant-scoped query or provider call.
7. Return sanitized JSON and an appropriate status.
8. Record an audit/monitoring event without secrets or PHI.

## Error contract

- `400`: malformed or invalid request
- `401`: no valid identity
- `403`: authenticated but forbidden
- `404`: missing or deliberately hidden resource
- `409`: uniqueness/state conflict
- `429`: throttled
- `500/502/503`: sanitized internal/provider failure

## Open work

Generate an OpenAPI document from route schemas, add contract tests for every route/method/status, and prove tenant/ownership rejection for all PHI-bearing endpoints.
