# Akbank Sanal POS deployment and acceptance

## Deploy

1. Deploy frontend and backend together. In `backend`, run `npm run db:migrate` and `npm run build`; in `frontend`, run `npm run build`. Restart the backend using the existing process manager. The additive `20261118200000_akbank_reversal_context` migration adds a nullable encrypted refund baseline; no existing payment data is removed. Rollback code may leave this unused nullable column in place.
2. Serve the customer portal and `/api/v1` on public HTTPS. The bank must reach `/api/v1/payments/akbank/callback/:sessionId`. Preserve the POST body through the reverse proxy. Set the application's existing `FRONTEND_URL` to the customer portal's real origin so return navigation reaches the correct site. Localhost cannot receive bank redirects on a remote server.
3. Retain the stable `PAYMENT_ENCRYPTION_KEY` used for saved credentials. If unset, encryption derives from the existing JWT access secret. Do not rotate the encryption source while encrypted payment history remains.

## Configure

Open **Ayarlar → Ödeme Ayarları → Akbank Sanal POS**. Select the environment, enter the Merchant Safe ID (not a customer account number or IBAN), Terminal Safe ID and security/secret key supplied for that environment, and enter the public HTTPS application origin. Save with online payment disabled. Run **Akbank Bağlantısını Test Et**, then enable **Akbank online ödeme** and save. Disable iyzico first if it is active; only one gateway accepts new purchases at a time.

The test performs signed transaction inquiry (`1010`) for a nonexistent reference, not a sale. It accepts a correctly signed successful response or the documented transaction-not-found responses. An invalid/missing response signature never enables payment. The test does not prove the bank has enabled every currency or 3D/refund permission. Confirm terminal 3D Pay authorization and any required server outbound-IP allowlist with Akbank.

All three credentials are encrypted, omitted from read responses and audit metadata, and cleared from the form after saving. Blank fields preserve saved values. Changing environment requires all three values again. Credential/environment changes are blocked while Akbank payments or reversals remain unresolved. Disabling new payments does not prevent reconciliation or refunds using original encrypted credential snapshots.

## Customer flow

Only active root customer/company accounts can purchase. The portal collects cardholder name, card number, expiry (MM/YY) and CVC. It sends them transiently over HTTPS to sign Akbank's 3D Pay request, then POSTs the signed form to the fixed bank `securepay` endpoint. No PAN, expiry or CVC is stored in the application database, payment session, logs, URL, localStorage or query cache. Card inputs are cleared after submission/failure. Do not configure proxy/APM request or response body capture on the `/my/credit-store/orders/:id/pay` endpoint. Review the merchant's PCI DSS requirements for this direct card-input model before public sales.

The bank performs 3D authentication and authorization. The callback validates the bank's dynamic response signature and exact order/merchant/terminal/amount binding, then performs an authenticated, response-signature-verified server inquiry. Only the completed sale (`1000`, `VPS-0000`, bank host `00`, status `N`, exact currency/amount and single installment) grants credits, atomically once. A 3D-only `3000` record grants nothing. Duplicate callbacks cannot duplicate credit. Unknown results remain pending and are queried by the background worker, never resubmitted automatically.

**Akbank automatic renewal is supported through a bank-side fixed instruction.** When a plan is selected with period renewal and Akbank recurring is enabled in payment settings, the first 3D sale is completed first. After the sale is verified as `PAID`, the same card entry is used once for Akbank transaction `1011`; card fields are sent only in that transient request and are never stored in the application database, payment session, logs, URL, localStorage or query cache. The bank instruction is finite (2–120 occurrences); checkout discloses its exact future payment count before consent, and its first planned date is the next period. A browser popup handles 3D; the parent window polls the authenticated attempt, registers the instruction only after `PAID`, and shows renewal as active only after `1010` inquiry confirms it. If the first payment fails, no instruction is registered. Stopping renewal from **Aboneliklerim** sends `1013` for all future occurrences and waits for bank confirmation; a refund also stops the schedule. Customers may stop an instruction while its registration is still being verified. Bank cancellation runs independently of local credit-import success. If credit import requires review, future charges stop first and `PAID_PERIOD_REVIEW` retains the accounting follow-up. The admin `Akbank otomatik yenileme` switch is required; when it is off, the customer is offered a one-time payment only. Do not store raw cards to implement renewal.

## Refund, cancellation and recovery

Use **Siparişler → İade / Banka İptali**. Only unused credits can be refunded, using the immutable purchase price and cumulative cent rounding. Reserve credits before bank dispatch. Akbank refund `1002` and cancellation `1003` use the original bank sale order ID and original encrypted account snapshot. Cancellation is offered only for the full unused payment on its Istanbul payment day; bank batch restrictions may still reject it. Refund code `VPS-1021` means the batch is not closed: use cancellation if eligible or refund after bank batch closure.

Akbank assigns refund order IDs. Before dispatch, save the encrypted set of prior completed refunds and prior total. To complete an uncertain refund, bank inquiry must show exactly one new refund with the correct original order, amount, currency and cumulative delta. No network timeout resends a refund. Cancellation completion requires a cancelled original bank sale (`V`) with matching amount and currency. Signed definitive validation rejection restores reserved credits once; uncertainty retains the reservation. Audit and paid order/message history stay intact.

The common payment-review panel lists unresolved iyzico and Akbank payments after 15 minutes. Query actions never move money. After at least one hour, externally confirmed no-charge/no-refund recovery requires an explicit operator acknowledgement and bank confirmation reference. Do not use these actions merely because a result is slow; an inaccurate external confirmation can allow duplicate monetary operations.

## Merchant acceptance

### Callback rejection recovery

For a known checkout session, an incomplete or invalid browser callback now triggers an authenticated bank inquiry and returns the customer to orders. An invalid callback cannot grant credits or establish payment failure. Sparse signed 3D responses are accepted for verification without requiring sale-only fields; only the authoritative completed-sale inquiry can grant credits.

The pending-payment review includes a bounded callback diagnostic and a bank response code when safely available. It never stores the raw callback or card fields. If the bank result remains unknown, cancellation stays blocked. After the existing one-hour minimum and external bank confirmation that no charge occurred, use the explicit no-charge recovery action. Failed orders can then be cancelled; orders with pending payment attempts cannot.

This callback patch requires backend and frontend deployment and restart, with no additional database migration. Focused regression checks passed: 13 backend tests, 6 browser tests, and both production builds. Real bank rejection reasons and merchant acceptance still require bank testing.

The follow-up inquiry fix returns an explicit outcome (`PAID`, `FAILED`, `NO_BANK_RECORD`, `NO_CHECKOUT_SESSION` or `UNRESOLVED`) and displays the returned message in the review panel. No bank record does not establish that a charge can never complete, so it does not release the pending-attempt guard. Optional Turkish phone values are normalized before signing to the bank example format `090-5321234567`; unrecognized optional numbers are omitted. This corrects a request-format discrepancy, but does not prove the cause of a particular live 3D rejection. Follow-up validation passed: 10 payment backend tests, 2 browser tests, and backend/frontend builds.

Automated tests simulate bank HTTP responses against the real local ledger; they do not prove merchant permissions or perform a real charge. With actual bank test credentials, verify: successful 3D payment, rejection, abandoned 3D, duplicate callback, callback outage/query recovery, full/partial refund, same-batch cancellation and server restart recovery. Then verify a low-value live transaction and reversal with the actual merchant account before opening public sales. Never use a real card in the sandbox. Use Akbank-issued test cards.

Official integration reference: https://sanalpos.akbank.com/ . Production 3D endpoint: `https://virtualpospaymentgateway.akbank.com/securepay`; transaction API: `https://api.akbank.com/api/v1/payment/virtualpos/transaction/process`. Destinations must remain fixed by provider/environment; do not accept arbitrary administrator-supplied payment URLs.

## Local validation result

Payment-focused checks: 14 backend tests and 13 browser tests passed; backend/frontend builds passed. The full backend suite completed with 195/218 passed and 23 failures (including parent suites). Failing files: `conversations.test.ts`, `credit-alert-channels.test.ts`, `extensions.test.ts`, `forms.test.ts`, `inbound-email-warnings.test.ts`, `inbound-whatsapp.test.ts`, `international-email.test.ts`, `lifecycle.test.ts`, `management.test.ts`, `roles.test.ts`. This work does not claim the whole application suite passes. The exact full-suite run is recorded in `test-results/akbank-full-backend-tests.log` locally. Bank HTTP was simulated; real merchant acceptance remains outstanding.
