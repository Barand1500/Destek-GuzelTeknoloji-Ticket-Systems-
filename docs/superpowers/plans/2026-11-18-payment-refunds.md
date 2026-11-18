# Payment refunds and cancellation

**Goal:** Administrator can refund unused paid credits completely or partially, cancel eligible same-day payments and reconcile uncertain results after entering iyzico account credentials.

**Architecture:** Extend the existing immutable order ledger with a durable reversal record. Reserve credit under owner/agreement locks before the provider call. Use iyzico paymentId refund V2 and payment cancellation. Unique request keys and one pending reversal prevent duplicate requests. Query reporting by reversal conversation ID after uncertainty; never blindly resend. Existing payment/renewal/checkout behavior remains intact.

- [x] Add additive PaymentReversal schema/migration; retain all history.
- [x] Implement unused-credit policy, exact cent rounding, reservation, verified result and reporting reconciliation.
- [x] Block concurrent editing/spending of reserved credit and renewal dispatch while refund is pending.
- [x] Preserve renewal on failure; stop on success. Add audited operator recovery for confirmed no-refund outcomes.
- [x] Add administrator refund/cancel screen and customer-visible status/amount on orders.
- [x] Test permission/scope, over-refund, replay/concurrency, partial/full/cancel, timeout recovery, stale editing and late original-payment callback.

**Rollback:** Disable new reversal initiation in UI/API; keep the additive table and reconciliation until all pending results are resolved. Do not drop or clear financial records.

**External acceptance:** Automated HTTP uses simulated provider responses. Real merchant sandbox/live tests require customer-supplied keys and merchant capabilities; no actual monetary operation was performed.
