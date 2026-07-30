# Role-Wise Flows

## Typical daily journeys

- **Super admin:** authenticate, select/resolve hospital, inspect settings and tenant audit, manage administrators, review system reports.
- **Admin:** review dashboard, manage departments/doctors/patients, oversee queue, billing, staff, CMS, notifications, reports, and settings.
- **Doctor:** authenticate, review assigned appointments, open permitted patient history, record consultation, prescribe, order labs, manage availability.
- **Patient:** authenticate, view dashboard, book/cancel/reschedule where supported, view own reports/prescriptions/invoices, pay, update profile.
- **Receptionist:** register walk-in, find/create patient, select doctor/slot, issue token, check in, manage queue.
- **Lab technician:** review authorized orders, update collection/processing state, upload result, mark complete, notify patient.
- **Pharmacist:** review prescriptions, validate medicine/stock, dispense, decrement inventory, initiate billing/notification.
- **Billing:** create/review bills and invoices, reconcile payment, process authorized refund.
- **Finance:** review revenue and expenses, add authorized expenses, export reports.
- **HR:** manage employee, attendance, and leave records.
- **Manager:** review approved operational summaries without administrative mutation rights.
- **Radiologist:** no canonical role/module is implemented.

Each journey must be validated with a real account for login, logout, session refresh, navigation, allowed CRUD, denied UI/API/database actions, notifications, and tenant isolation.
