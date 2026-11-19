# Customer unused-order refunds and checkout copy

User-approved scope: company owners may directly reverse the entire payment only when none of that order's credits have been used. Partially used orders remain staff-only. Checkout copy should retain necessary errors and consent, removing repetitive explanations.

1. Add failing backend coverage for ownership, full-only refunds, used-credit rejection, replay safety, and existing staff partial refunds.
2. Reuse the locked reversal ledger and original gateway snapshot. Derive amount, credits and same-day cancellation/refund choice on the server. Add a customer POST route; never expose staff recovery actions.
3. Add a customer refund panel from paid orders, with authoritative eligibility, amount, confirmation and pending/success/failure history. Reuse application card styles; no schema changes.
4. Remove repetitive checkout explanations while preserving payment status, expiry/date restrictions, actual provider errors and renewal consent.
5. Run focused ledger/browser checks and both builds; obtain one read-only review of the complete change. Do not dispatch real payments or refunds in tests.

Completed: customer POST accepts only requestKey and reason. The existing locked ledger derives full credit amount and bank operation, enforces ownership/root account and zero usage, reserves credits, and handles replay and uncertain results. Customer UI shows eligibility, confirmation and history without staff recovery controls. Same-day bank cancellation and later refund both pass simulated-provider coverage. Staff partial refunds remain available.

Validation: 5 backend tests across Akbank, iyzico and reversal suites passed; 3 customer browser scenarios passed, including used-credit rejection and terminal-failure retry. Existing checkout and order browser cases passed. Backend and frontend production builds passed. One independent review found a failed-request-key retry issue; fixed and reviewed again with no new confirmed findings. No schema migration or real bank refund was performed.
