# Billing Workflow

```mermaid
sequenceDiagram
  participant Staff as Billing staff
  participant API as Billing API
  participant Pay as Payment provider
  participant DB as Database
  participant Patient as Patient
  Staff->>API: Create bill from server-priced services
  API->>DB: Persist bill/invoice
  Patient->>API: Select payment method
  API->>Pay: Create provider order/session
  Pay-->>API: Signed callback/webhook
  API->>API: Verify raw signature and idempotency
  API->>DB: Reconcile payment and invoice
  API-->>Patient: Receipt/notification
```

Cash payment requires authorized staff. Online amounts must be derived server-side. Refunds require authorization, ownership/tenant checks, provider verification, and audit events. Mock completion must remain impossible in production.

Open gates: live Razorpay/Stripe sandbox flows, webhook replay, reconciliation, refund, invoice download, and role/RLS verification.
