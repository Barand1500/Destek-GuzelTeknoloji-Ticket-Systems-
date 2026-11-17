# Flexible Periods Implementation Plan
> Use superpowers:executing-plans for implementation.
**Goal:** Reusable periods, recorded renewal preferences, readable current package tracking.
**Architecture:** Additive Prisma migration; shared validated duration math; snapshots preserve conditions; UI picker reuses project date controls.
**Tech Stack:** TypeScript, React Query, Prisma/MySQL, Playwright.
**Spec:** docs/superpowers/specs/2026-11-17-flexible-periods-design.md
## Global constraints
No payment/grant/renewal job. Existing periods migrated compatibly. No unrelated user changes reverted.
## Review focus
Invalid dates/ranges, inclusive days, month clamp, stale quote renewal changes, legacy snapshots, root-only purchases and role permissions.
## Tasks
- [x] Duration validation + persisted templates/routes/schema migration; failing tests then implement and verify.
- [x] Admin period + calendar editor and toggles; customer duration text/renewal selection and order details; test browser flows.
- [x] Agreement renewal preference create/edit and customer dates/credit/state overview; validate tests.
- [x] Generate/migrate, focused backend tests/builds, browser checks, fresh review.

Ruling: user corrected period UI to a single compact footer row and one range calendar; frontend replacing the oversized editor. Backend duration math and reusable template API unchanged. Latest focused backend26tests pass, builds pass; original14 UIflows pass; three newUItests are being revised for corrected selector/toggle interactions.

Final: user corrected UI restored half-width period beside plan name, dropdown240px and separate anchored range popover. Remount regression reproduced then fixed by stable popup mount callback. 26 backend checks passed; existing14 browserflows passed and final5 flexibleperiod flows passed; backend/frontendbuild passed, finalfrontend tsc passed. Additive migration deployed locally. Renewal persists preference only, no payment/entitlement renewal worker. No external deployment or commit.
