# Pharmacy Workflow

```mermaid
flowchart TD
  Rx["Authorized prescription"] --> Review["Pharmacist validates prescription"]
  Review --> Stock{"Sufficient valid stock?"}
  Stock -- No --> Reject["Block dispense and record reason"]
  Stock -- Yes --> Dispense["Dispense medicines"]
  Dispense --> Update["Atomically decrement inventory"]
  Update --> Bill["Create/update bill"]
  Bill --> Notify["Notify patient and audit"]
```

Required controls include tenant scope, prescription authenticity, expiry/batch checks, non-negative stock constraints, atomic inventory mutation, dispense idempotency, billing linkage, and audit logging.

Current code provides pharmacy UI/API and validation/demo services. Live concurrency, inventory reconciliation, role testing, and database transaction behavior are not verified.
