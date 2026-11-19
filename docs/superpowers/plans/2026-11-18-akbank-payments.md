# Akbank Payments Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement these tasks inline. Review the completed payment boundary independently.

**Goal:** Let an administrator configure Akbank, then accept card entry in the customer portal, bank 3D Pay authorization, verified credit settlement, full/partial refunds and cancellation.

**Architecture:** Keep the existing encrypted `akbank` settings row and existing attempt/session/reversal ledger. Add a fixed-endpoint Akbank adapter using official 3D Pay form signing and JSON Payment API HMAC. Only authoritative bank results may grant credit. Uncertain submissions are queried, never blindly resent.

**Tech Stack:** TypeScript, Express, Prisma/MySQL, React, existing node:test and Playwright.

**Spec:** User-approved panel card entry → bank 3D → verified credit grant, plus query/cancel/refund. Official source: https://sanalpos.akbank.com/ integration documentation (3D Pay model, transaction inquiry, JSON API signing).

## Constraints
- Preserve working iyzico and existing user changes. No real charges without operator-entered credentials.
- No PAN, CVC, expiry or whole bank callback in database, logs, URLs or persistent browser storage.
- Fixed sandbox/production endpoints. Public HTTPS callback origin in production.
- Akbank automatic card renewal is unavailable until a separate approved tokenization/recurring contract exists; require explicit one-time-payment acknowledgement for plans that requested renewal.
- Bank absence/timeouts cannot authorize a new attempt or restore reserved credit automatically.
- Existing owner locks, atomic settlement and unused-credit refund reservation remain authoritative.

## Tasks
- [x] Adapter: exact form/JSON signatures, response signature verification, card validation, bounded fixed-host API, inquiry interpretation. Tests: tampering, wrong order/amount/currency, network uncertainty.
- [x] Settings: encrypted masked credentials, public origin, harmless signed query connection test, explicit enable/disable, account-change guards, provider availability. No second active gateway.
- [x] Checkout: durable unique attempt before signing, local card form, browser bank POST, signed callback plus server inquiry, query-only worker and admin recovery. Duplicate/cross-owner/late callbacks never double grant.
- [x] Reversal: extend shared reservation/finalization to Akbank. Persist before HTTP; record provider-assigned refund IDs using a pre-request baseline and original order ID. Bank cancellation by original order status. No automatic resend.
- [x] UI and deployment: provider-specific card fields, formats and validation, no temporary preview; configuration guidance, sensitive-input clearing. Test screen and backend, build both projects, independent review.

## Review focus
- Replayed callback and bank order ID uniqueness.
- Configuration changes while attempts or reversals are unresolved.
- Query return contains original and refund records; match exact transaction and amount.
- Crash between ledger reservation and bank response; preserve uncertainty.
- Card data must never enter persisted session or error metadata.

## Progress
Official request/reply examples and HMAC-SHA512 signing inspected. Existing schema needs no destructive change. Execution stays in the user's current workspace to preserve its uncommitted setup work.

Ruling: Akbank assigns the refund order ID; the request documentation accepts the original order ID, not an application-defined refund ID. Persist the pre-request refund ID set and cumulative amount, require exactly one matching new refund and exact delta, and never resend uncertain requests. A nullable encrypted reversal-context column records this baseline.

Validation: 14 focused payment backend tests passed; 13 payment UI tests passed, including hosted iyzico regression coverage. The card form's light/dark screenshots were inspected and mobile width verified. Backend/frontend production builds passed. Independent read-only review found one missing bank JSON response-signature check, fixed with a failing-then-passing regression; final review found no remaining P1/P2 findings. No actual merchant charge was attempted.

The complete backend suite was also attempted. Its default invocation stalled after unrelated failures with live handles; the bounded force-exit run completed with 218 tests, 195 passed and 23 failed (including parent suite failures). Failures occur in conversations, credit-alert-channels, extensions, forms, inbound-email-warnings, inbound-whatsapp, international-email, lifecycle, management and roles. These were not changed to mask failures. Full-suite output is in ignored `test-results/akbank-full-backend-tests.log`. Full application validation is not green; Akbank merchant acceptance still requires operator-entered credentials and bank testing.

## Follow-up: recurring instruction (19 Nov 2026)

Akbank recurring is now implemented as a bank-side fixed instruction rather than stored-card renewal: `1011` registration after the first paid 3D sale, `1010` inquiry, and `1013` cancellation of all future occurrences. The admin switch, customer popup enrollment, stop-renewal and refund cancellation paths are wired. The earlier one-time-only scope is superseded for this adapter.
