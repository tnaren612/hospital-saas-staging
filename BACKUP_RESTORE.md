# Backup and Restore Drill

Supabase backups and storage backups must be enabled and encrypted by the platform owner. Before release, restore the latest backup into an isolated project, apply the migration ledger, and verify tenant counts, RLS, documents, and authentication mappings.

Record the measured **RPO** (maximum data age lost) and **RTO** (time from restore start to validated service) in the release ticket. Never test restore over production data.
