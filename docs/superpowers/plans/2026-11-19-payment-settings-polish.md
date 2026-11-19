# Payment settings and billing clarity

Authorized scope: simplify payment-settings explanatory text without removing fields; diagnose blocked order cancellation; make renewal capabilities and package-change confirmation truthful. Research immediate versus period-end switching, but do not change billing/proration policy without agreement.

1. Keep provider credentials, environment, public URL, toggles and recovery controls. Shorten repeated text; preserve operational errors and essential recovery confirmation.
2. Expose pending-attempt state on orders and disable misleading cancel/pay actions. Do not erase unresolved monetary attempts or equate no bank record with no charge.
3. Report actual current-package renewal state in quotes and bind it to quote confirmation. Use neutral period-end-switch consent when renewal is already off.
4. Do not offer Akbank automatic renewal, which this adapter does not support. Keep customer stop-renewal controls for genuine renewable subscriptions.
5. Run focused backend/browser checks, builds and a fresh read-only review. Report proposed field/layout changes separately for user approval.

## Findings and choices

- Pending-attempt cancellation is an intentional monetary guard, including old trials. Show the guard before the customer opens a cancellation dialog. Existing administrator inquiry and externally confirmed no-charge recovery remain the resolution path; do not silently cancel ambiguous payments.
- Akbank supports one-time payment in this adapter, not stored-card renewal. Disable the catalog renewal switch for that provider and explain this once. Existing iyzico stored-card renewals and customer stop-renewal endpoints remain intact.
- A package can have an active paid period with renewal disabled. Quote its effective subscription state; bind that state into the quote key so a changed renewal preference requires fresh confirmation. Confirm period-end scheduling without claiming a disabled renewal will be turned off.
- Stripe and Paddle support immediate and next-period changes with explicit billing/proration rules. Existing application scheduling remains period-end only. A future immediate-upgrade implementation needs an agreed treatment of purchased credits, used credits and price differences; this patch does not decide those policies.

References: https://docs.stripe.com/api/subscriptions/update and https://developer.paddle.com/build/subscriptions/replace-products-prices-upgrade-downgrade/ .

## Proposed settings layout follow-up — not implemented

- Replace the single-option iyzico provider dropdown with its card heading.
- Consolidate the repeated public application URL into one shared setting, preserving existing checkout snapshots.
- Put the webhook address and last-test timestamp in connection details.
- Keep test/live environment selection, credentials, online-payment switches and safe recovery controls; these are functional, not temporary placeholder fields.

Validation completed: 8 focused backend tests and 19 browser tests passed; both production builds passed. Independent read-only review reported no confirmed regressions or financial/security issues. No settings fields were removed, no billing policy was changed, and no live payment recovery or refund was performed.
