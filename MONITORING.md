# Monitoring

Use `GET /api/health` for dependency-aware readiness. Client errors are accepted by `/api/monitoring/error`; Web Vitals are accepted by `/api/monitoring/vitals`. Route handlers emit structured JSON logs without secrets or PHI. Configure external uptime checks and alerts for health failures, elevated 5xx responses, latency, authentication failures, and backup failures. Retain logs according to the organization retention policy and test alert delivery before release.
