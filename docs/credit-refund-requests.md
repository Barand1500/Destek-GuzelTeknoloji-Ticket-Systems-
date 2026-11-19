# Order refund requests

Deploy the additive migration `20261119170000_credit_refund_requests` with `npm run db:migrate --workspace backend` before deploying the backend and frontend together. Existing orders, bank records and support tickets are preserved. Rollback application code without dropping the new table; retained request history is harmless to older code.

Customers submit a reason on the order refund panel. An OPEN request does not reserve credits, call a bank, stop renewal or guarantee an amount. Repeated submission returns the existing OPEN request. Staff see a badge and an optional open-request filter in Orders; they inspect current refundable credits before using the existing bank refund operation. A successful reversal resolves the OPEN request in the same transaction. A failed reversal leaves it open. Staff can reject with a note, visible to the customer with an in-app notification.

The order list offers one bank action: full cancellation for same-day unused payments, otherwise refund. Bank acceptance remains authoritative. Cancellation amount is fixed; refund credits remain editable within the unused balance. The summary rechecks eligibility when opened and falls back to refund if cancellation eligibility changed.
