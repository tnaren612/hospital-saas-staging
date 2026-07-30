# Rollback

1. Freeze writes and record the incident time.
2. Repoint the hosting deployment to the last approved application commit.
3. Do not reverse database migrations automatically; use a reviewed forward migration or restore a verified staging copy.
4. Confirm `/api/health`, authentication, tenant routing, and a read-only clinical smoke test.
5. Re-enable writes only after the incident owner approves.
