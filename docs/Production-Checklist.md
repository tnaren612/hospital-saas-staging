# Production Checklist

## Code quality

- [x] Production build passes
- [x] TypeScript passes
- [x] ESLint passes
- [x] 176 executable unit/integration tests pass
- [ ] All integration tests execute without skips
- [x] All configured non-credentialed Playwright tests pass (29)
- [ ] All credentialed Playwright tests execute and pass (11 currently skipped)

## Database and tenancy

- [ ] Production migrations verified through 029
- [ ] Tenant audit green — currently fails on legacy null `hospital_id` rows
- [ ] Cross-tenant negative tests pass
- [ ] Query plans/indexes reviewed
- [ ] Backup completed and restore drill passed

## Roles and workflows

- [ ] Every required account exists
- [x] Ten primary role login/allowed/denied/logout smoke tests pass
- [ ] Production admin and super-admin accounts verified
- [ ] Reset and token-refresh flows verified for every applicable role
- [ ] Positive and negative RBAC verified for every role
- [ ] Every implemented business workflow passes end to end

## Security and privacy

- [ ] High findings fixed and retested
- [ ] OWASP dynamic audit passed
- [ ] File upload/download controls passed
- [ ] Secrets and PHI logging review passed
- [ ] Dependency scan passed

## Operations

- [ ] Payment sandboxes and webhooks passed
- [ ] Email domain and delivery passed
- [ ] WhatsApp templates and delivery passed
- [ ] Monitoring, alerts, SLOs, and log retention configured
- [ ] Accessibility and cross-browser gates passed
- [ ] Lighthouse/Core Web Vitals targets passed
- [ ] Rollback owner and procedure verified

## Release decision

**NO-GO** until every unchecked mandatory item is supported by current evidence.
