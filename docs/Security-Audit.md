# Security Audit

The detailed evidence-based report is [security_best_practices_report.md](../security_best_practices_report.md).

Current priorities:

1. Remove unsafe `document.write` interpolation from prescription and report printing.
2. Prove migrations 026–029 and cross-tenant RLS in production.
3. Fail closed if production Supabase configuration is absent.
4. Tighten CSP by removing unsafe script directives where compatible.
5. Validate Stripe redirect origins.
6. Add `server-only` boundaries around secret-bearing modules.
7. Centralize PHI/secret-redacted logging.
8. Run connected dependency and dynamic OWASP testing.

No confirmed critical vulnerability was found in the repository-only review; production state remains unverified.
