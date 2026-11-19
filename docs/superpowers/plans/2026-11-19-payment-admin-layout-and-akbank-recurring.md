# Payment administration layout and Akbank recurring integration

Authorized UI changes: use existing integration-style tabs for staff orders/subscriptions; distinguish unstarted payment from uncertain bank outcome; remove environment inputs without silently switching saved sandbox credentials to production; make callback URL compact; put online-payment toggles in provider card headings; keep payment recovery operations available.

1. Add focused UI regression coverage, then implement layout and wording using existing classes.
2. Keep saved connection environment internally; production is the default for a new connection. Do not convert saved test credentials merely because the control is removed.
3. Inspect official Akbank POSNET/recurring docs. Registration is transaction 1011 with card fields, recurring schedule and future first date; cancellation of all future instructions is 1013 without recurringOrder; inquiry is 1010 with orderTrackId. Validate exact signatures, account binding and outcomes.
4. Before exposing automatic charging, settle the registration UX with the user. A bank instruction is finite (2–120 payments), requires transient card data, and must be cancellable at the bank, not only locally. Existing post-3D checkout intentionally does not retain cards. Never claim existing single-charge checkout establishes a recurring mandate.
5. Recurring acceptance must cover durable unknown registration, bank cancellation/recovery, idempotent per-period settlement, refunds, and package switching. Do not enable a partial implementation that could charge after local cancellation.
6. Run focused UI/backend checks and builds; review completed changes once.

## Completed recurring flow (19 Nov 2026)

Akbank recurring enrollment is now exposed in the customer checkout: first 3D sale, same card entry in a popup, 1011 instruction registration, 1010 inquiry, ACTIVE only after bank verification, and 1013 cancellation from subscription stop/refund. Admin enables it with the `Akbank otomatik yenileme` switch. Backend integration tests cover registration, duplicate settlement, refunds and stop; browser coverage covers the customer enrollment step.
