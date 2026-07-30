# Testing Guide

## Local gates

```text
npm ci
npm run lint
npm run typecheck
npm test
npm run build
npm run test:e2e
```

Current evidence: lint, typecheck, build, and 176 tests pass. Browser E2E runs
through installed Chrome with 29 passing tests. Eleven credentialed tests and
one live integration test remain skipped until their environment is configured.

## Required suites

- Unit: schemas, state machines, permissions, calculations, sanitizers.
- Integration: route + database + RLS + storage + provider sandbox.
- E2E: every role's positive and negative workflows.
- Security: OWASP, tenant breakout, IDOR, CSRF, XSS, upload, webhook replay.
- Accessibility: axe, keyboard, focus, screen reader, zoom/reflow.
- Performance: Lighthouse, Web Vitals, API load, query plans.
- Compatibility: Chromium, Firefox, WebKit; mobile/tablet/desktop.

Never point destructive tests at production data.
