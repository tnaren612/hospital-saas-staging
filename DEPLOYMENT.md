# Deployment Runbook

Deploy only from a reviewed commit after the release checklist is approved. Configure production secrets in the hosting provider, apply Supabase migrations in order, and run the public health check plus authenticated smoke tests. Never place secret values in source, logs, or tickets.

Required checks: `npm ci`, `npm run lint`, `npm run type-check`, `npm test`, `npm run build`, and the credentialed Playwright workflow.
