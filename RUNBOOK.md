# Incident Runbook

Check `/api/health` first, then inspect hosting logs and Supabase status. Preserve correlation IDs and redact tokens, passwords, keys, and PHI. For suspected cross-tenant access, disable the affected route, preserve audit events, and escalate to the security owner immediately.
