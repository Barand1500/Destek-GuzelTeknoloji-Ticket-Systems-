# Credit orders and notifications implementation plan
**Goal:** Customer price snapshots and order history, admin order list, in-app order/credit reminders. No payment confirmation or credit grant.
**Authorization:** user approved steps 1,2,5 and thresholds20%/7days. Step4 (subscription lifecycle) remains unchanged.
**Architecture:** Add immutable CreditOrder snapshots and idempotency keys; server quote fingerprint detects stale previews; independent durable CreditAlertReceipt suppresses repeated reminders even when notifications are deleted. New additive tables/columns only.
**Rules:** root active customer only; staff integrations.view for all-order list; current authenticated root owns customer list/create/cancel; no PAID/FAILED mutation endpoint. Exact currency and decimal snapshot. Pagination/search/status SQL bounded. Requests replay sameorder for samekey, reject differentpayload samekey. Cancellation changes status only, never credit. Reminder eligibility requires active root customer/current nondeleted/noncancelled agreement; configurable default20% remaining/7days expiry, each alert once per agreement period. App notifications only, no external messages.
## Tasks
- [x] Add order/receipt schema and settings migration; pricing fingerprint and idempotent order service with tests.
- [x] Customer order confirmation/history and admin paged/filterable list; notification preference controls.
- [x] Independent reminder worker and deduplication tests; server start/stop integration.
- [x] Focused tests, browser flows, builds and final review.
## Open limitations
Payment integration absent: new orders stay pending until cancelled; cancellation/creation are real app records but no money or credit is moved. Billing subscriptions, refund, provider callbacks and automatic renewals are not implemented.

## Verification
20 focused backend tests passed, including real MySQL concurrent retries; 9 Playwright flows passed. Backend and frontend production builds passed (existing frontend chunk-size warning). Worker locks and revalidates current owner/agreement before durable alert receipt; 3 race regressions added. No provider/payment/grant implementation. Generated Prisma files under tmp/search-baseline-check are a shared filesystem link and are not reverted.
