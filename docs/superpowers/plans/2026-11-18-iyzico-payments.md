# iyzico payments implementation plan

**Goal:** Enable hosted single-installment checkout and consented token-based renewals after an administrator configures iyzico credentials.

**Architecture:** Keep the existing order ledger, grant transaction and renewal scheduler. Use iyzico Checkout Form for first payment and provider-issued card tokens for subsequent merchant-scheduled charges. Never use iyzico native subscriptions concurrently. Encrypt credentials, billing details and token references. Persist checkout sessions and dispatch claims before network calls; uncertain outcomes are reconciled, never blindly retried.

**Scope:** Payment settings in credit settings; test/live, connection verification, immutable in-flight credentials, callback/webhook and recovery; remove customer card inputs and admin BIN UI. No refunds, extra providers or live transactions without supplied credentials.

## Tasks
- [x] Add additive settings/session/payment-method persistence and encryption. Block account changes with pending payments or active stored-card subscriptions.
- [x] Add signed fixed-host iyzico HTTP client, hosted checkout initialization/retrieval, token-based charge and reconciliation. Check basket, amount, currency, installment, fraud status and unique payment identity.
- [x] Add authenticated settings/checkout endpoints and unauthenticated bounded provider callbacks. Reuse existing atomic settlement. Handle missing callbacks and network ambiguity.
- [x] Replace card form with billing details and secure redirect; add settings UI using existing fields/toggles. Remove BIN administration and stale payment-disabled text.
- [x] Test success, failure, mismatch, duplicate/concurrent callbacks, timeout recovery, secrets masking, permissions, account switching and renewal. Run backend/frontend TypeScript and focused browser checks.

## Migration and rollback
Only new tables; existing orders/agreements unchanged. Roll back application with payment settings disabled; retain tables for payment reconciliation and audit. Never delete unsettled payment records. Production needs public HTTPS callback URL, provider account capabilities (card storage and merchant-initiated NON3D for renewals), valid encryption secret and successful sandbox checks.

## Verification
Backend/frontend production builds passed. Focused backend suite: 17 tests passed; gateway integration rechecked after final hardening. Hosted checkout browser suite: 4 passed. Credit store/settings suite: 11 passed across focused runs. Provider HTTP is simulated; actual merchant sandbox/live acceptance requires supplied credentials.
