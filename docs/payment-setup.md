# iyzico payment setup

## Deployment

1. Deploy the additive Prisma migrations, generate the Prisma client, build frontend/backend and restart the backend.
2. Set a stable, random `PAYMENT_ENCRYPTION_KEY` of at least 32 characters before saving production credentials. If omitted, encryption derives from `JWT_ACCESS_SECRET`; rotating that secret then requires retaining the original key to read payment records. Back up the encryption key separately from the database. Never change it while encrypted records remain.
3. Set `FRONTEND_URL` to the real customer portal origin. Serve the application and `/api/v1` behind public HTTPS. Hosted provider callbacks cannot reach a developer's localhost.

## Administrator

Open **Kredi ve Paket Ayarları → Ödeme Ayarları**. Choose test/live, enter the public application origin and the matching iyzico API/secret keys. Save with online payment off, run **Bağlantıyı Test Et**, then enable online payment and save. Blank key fields preserve existing credentials. The browser never receives stored keys.

The connection test is a signed, noncharging BIN query; it verifies credentials, not every merchant capability. Automatic renewal and merchant-initiated stored-card payments have been removed. New card tokens are not saved for future charges.

Register the displayed `/api/v1/payments/iyzico/webhook` URL in the merchant notification settings and enable `X-IYZ-SIGNATURE-V3`. The initialize request supplies its per-session callback automatically. Callbacks and webhooks query iyzico over authenticated server-to-server requests; they never grant credit based only on posted browser fields.

Only customer-initiated one-time payments are supported. Existing pending payments continue to reconcile, but no scheduled renewal order or stored-card charge is dispatched. See [automatic-renewal-removal.md](automatic-renewal-removal.md) for deployment and historical bank-instruction cancellation.

Changing merchant credentials or test/live mode is blocked while iyzico payments are unresolved or active subscriptions still use a stored card. Close existing renewals and reconcile pending payments first. Stored cards do not transfer between merchant accounts. Disabling online payment pauses new dispatches; existing payment results continue to reconcile using their encrypted credential snapshot.

## Customer

The checkout displays the immutable order total and collects required buyer/billing data. Card number, expiry and CVC are entered only on the iyzico hosted page. Future package switches can be paid on their planned start date; no early charge is taken.

After approval, credit is granted atomically once. Amount, currency, basket, installment, fraud approval and payment identity must match. Fraud review remains pending. A rejected payment grants no credit; the customer can reopen the failed order to pay again. Recurring definitive declines follow the existing bounded retry schedule. Timeout/uncertain outcomes are queried, never blindly recharged.

## Recovery

The settings screen shows payments pending longer than 15 minutes (up to 50 oldest records plus total). **Sonucu Sorgula** performs no charge. For a transport/crash result that cannot be resolved automatically, obtain explicit confirmation from the merchant portal/provider that no charge occurred and no later capture can complete. Only then, after one hour, use **Tahsilat Yok Doğrulaması** and record the provider reference. This audited operator action does not start a retry. It refuses paid/granted/cancelled orders and old attempts. A mistaken external confirmation can lead to a duplicate charge; never use it as a shortcut for an unknown result.

## Refunds and bank cancellation

In the administrator's **Siparişler** tab, open **İade / Banka İptali** on a paid order. Select unused credit quantity and record a reason. The amount uses the immutable purchase price and cumulative cent rounding, so repeated partial refunds cannot exceed the original payment. Used credit cannot be refunded through this workflow. Successful refunds remove the corresponding unused credits; payment and package history remain available. The customer sees the refund status and amount in their orders.

The application reserves the selected credit before contacting the bank. Concurrent support usage cannot spend reserved credit. A definitive failure restores it exactly once. An ambiguous result keeps the reservation and is queried through iyzico reporting using the unique refund conversation ID. Neither a timeout nor an absent report triggers another refund request. Agreement editing is blocked during pending refunds; already-refunded credit cannot be manually restored through agreement editing.

Bank cancellation is offered for the complete, wholly unused payment on the payment's Istanbul calendar day. The bank's settlement cutoff can still reject it; use a refund when cancellation is unavailable. `/v2/payment/refund` supports complete or partial refunds without requiring manually entered payment transaction identifiers. Cancel and refund requests use the original payment's encrypted account snapshot, even if new sales have been disabled.

For an unresolved reversal, **İade Sonucunu Sorgula** sends no money. After one hour, **İade Yapılmadığını Doğrula** accepts an explicit provider confirmation reference that no refund/cancel happened and no later refund can complete; it restores the reserved credit and records an audit event. Do not use it merely because the provider is slow. Paid order history, used-credit charges, conversations and original price snapshots remain intact. A delayed original-payment callback cannot grant credit again after a refund.

Database migrations do not enable payments. No real provider credentials or money are used by automated tests. Complete a merchant sandbox payment, bank rejection, callback retry, partial/full refund, cancellation and live low-value verification with the actual account before opening public sales. Cancelling an unpaid application order is not a bank refund. Merchant permissions and refund limits must be enabled on the actual iyzico account.

## Provider references

- [Hosted checkout request](https://docs.iyzico.com/on-hazirliklar/api-reference-beta/odeme-metotlari/iyzico-odeme-formu-cf)
- [Stored-card payment](https://docs.iyzico.com/ek-servisler/kart-saklama)
- [Payment inquiry](https://docs.iyzico.com/ek-servisler/odeme-sorgulama)
- [Webhook signature](https://docs.iyzico.com/ek-servisler/webhook)
- [Official request field names](https://github.com/iyzico/iyzipay-node/blob/master/lib/requests/CreateCheckoutFormInitializeRequest.js)
