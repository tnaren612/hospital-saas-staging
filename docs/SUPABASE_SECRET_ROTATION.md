# Supabase production key rotation

This runbook rotates Supabase credentials without placing secret values in source control, tickets, chat, screenshots, or build logs.

## Scope

- Perform this only in the production Supabase project after staging regression is green.
- Rotate both the browser-safe publishable key and the server-only secret/service-role key.
- Treat the secret/service-role key as privileged production access. It must never use a `NEXT_PUBLIC_` variable.
- Keep the old keys active only for the short overlap needed to validate the replacement keys.

## Before rotation

1. Confirm an authorized project owner and a second reviewer are present.
2. Record the rotation time, operator, reviewer, affected environments, and rollback owner. Do not record key values.
3. Inventory every credential consumer:
   - Production hosting environment variables
   - GitHub Actions environment secrets
   - Approved self-hosted runners
   - Scheduled jobs, integrations, and operational scripts
4. Confirm current database backups are healthy and the application health check is green.
5. Pause unrelated production configuration changes until validation is complete.

## Rotate the publishable key

1. In Supabase Dashboard, open **Project Settings → API Keys** for the production project.
2. Create a replacement publishable key.
3. Store it directly in the approved secret stores as `NEXT_PUBLIC_SUPABASE_ANON_KEY`; do not copy it into a repository file.
4. Update each production consumer and restart/rebuild only through the normal release process.
5. Validate:
   - Public pages load.
   - Admin and patient sign-in work.
   - Session refresh and logout work.
   - An unauthorized browser request cannot bypass RLS.
6. After every consumer uses the replacement, revoke the old publishable key.

## Rotate the server-only key

1. Create a replacement secret key in **Project Settings → API Keys**.
2. Store it directly as `SUPABASE_SERVICE_ROLE_KEY` in server-only secret stores.
3. Confirm the variable is unavailable to browser bundles and client-side logs.
4. Update server workers and CI environments one at a time.
5. Validate only the required privileged operations, including test-user provisioning and approved administrative jobs.
6. Review Supabase and application audit logs for unexpected privileged activity.
7. Revoke the old secret/service-role key immediately after all consumers pass validation.

## Regression gate

Run the credentialed external Playwright workflow against the protected staging environment first, then run the approved production smoke checks. Required roles are admin, doctor, patient, receptionist, lab, radiology, pharmacy, billing, finance, HR, and manager. Confirm cross-role denial and cross-tenant isolation.

Do not print environment variables. Store workflow credentials in GitHub Environment secrets with required reviewer protection.

## Rollback

If replacement-key validation fails while the old key remains active, restore the previous secret-store reference and restart the affected consumer. Investigate before retrying. If the old key has already been revoked, create a new replacement key; never recover a revoked key from logs or local files.

## Completion evidence

- Rotation timestamps and reviewers recorded
- All consumers updated
- Old keys revoked
- Health, authentication, RBAC, and tenant-isolation checks passed
- Credentialed regression run linked
- Audit logs reviewed
- No credential values present in commits, artifacts, or logs
