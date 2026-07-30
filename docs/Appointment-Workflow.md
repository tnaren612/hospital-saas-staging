# Appointment Workflow

## Actors

Patient/public user, receptionist, doctor, admin, notification provider.

```mermaid
flowchart TD
  Catalog["Load department, doctor, and slots"] --> Validate["Validate patient and slot"]
  Validate --> Create["Create tenant-scoped appointment"]
  Create --> Confirm["Issue reference/token and notification"]
  Confirm --> Approve["Staff approval/queue"]
  Approve --> CheckIn["Reception check-in"]
  CheckIn --> Consult["Doctor consultation"]
  Consult --> Complete["Complete, cancel, or no-show"]
```

Active slot uniqueness is enforced by migration 029. Cancellation/no-show frees the slot. PHI lookup requires authentication while public schedule lookup returns minimal fields.

Open gates: live database race test, reschedule workflow verification, provider notification, every negative boundary, and full patient/reception/doctor E2E.
