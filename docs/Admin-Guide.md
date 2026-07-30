# Admin Guide

Administrators can use the protected console to review operational metrics and manage hospital configuration, departments, doctors, availability, patients, appointments/queue, packages, billing, lab/pharmacy operations, finance, HR, reports, CMS, notifications, and settings according to role permissions.

## Safe operating rules

- Never share credentials or service-role keys.
- Do not manually change another hospital's data.
- Use least-privilege accounts for daily work.
- Validate destructive or financial actions and retain audit evidence.
- Apply migrations in order and take a verified backup first.
- Use provider sandbox environments before live payment or messaging changes.
- Review tenant audit, health, error, and notification failure surfaces.

Credentialed admin workflow testing is pending because the production admin password was not supplied and Supabase was unreachable during the prior audit.
