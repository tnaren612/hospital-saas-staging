# Release Checklist

- [ ] Approved commit and change review recorded
- [ ] Supabase migrations validated and applied in order
- [ ] Production backup completed
- [ ] Isolated restore drill completed; RPO/RTO recorded
- [ ] Monitoring, alert routes, and log retention verified
- [ ] GitHub Actions quality workflow passed
- [ ] Credentialed Playwright regression passed for all configured roles
- [ ] Public and authenticated smoke tests passed
- [ ] Production secrets rotated through the secret manager
- [ ] Rollback owner and deployment rollback point confirmed
- [ ] Release approval recorded
