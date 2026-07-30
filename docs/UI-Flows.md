# UI Flows

## Surfaces

- Public: home, services, doctors, packages, appointment, content, contact, careers.
- Authentication: admin login, patient login, reset password, callback.
- Admin: dashboard, analytics, departments, doctors, patients, appointments, availability, billing, CMS, notifications, reports, settings.
- Role workspaces: reception, laboratory, pharmacy, finance, HR, manager.
- Patient: dashboard, appointments, documents, reports, prescriptions, payments, notifications, profile.

## UI quality contract

Every screen must provide a visible heading, predictable navigation, keyboard focus, labels, validation feedback, loading/empty/error/success states, responsive layout, reduced-motion behavior, and light/dark contrast.

## Validation status

Static code inspection confirms shared components and responsive Tailwind usage. A formal visual, keyboard, axe, screen-reader, zoom/reflow, mobile, tablet, desktop, dark-mode, and cross-browser audit has not passed. Browser execution is blocked until an available browser runtime is connected or Playwright Chromium is installed.
