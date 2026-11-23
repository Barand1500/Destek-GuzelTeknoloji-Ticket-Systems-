import { requestCreditRefund, rejectCreditRefundRequest } from '../services/credit-refund-requests.service.js';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { idSchema } from '../validators/index.js';
import * as settings from '../services/payment-settings.service.js';
import { getAkbankSettings, saveAkbankSettings, testAkbankConnection } from '../services/akbank-settings.service.js';
import { akbankCallback, beginAkbankCheckout } from '../services/akbank-payments.service.js';
import { listNestpayGateways, removeNestpayGateway, saveNestpaySettings, testNestpayConnection } from '../services/nestpay-settings.service.js';
import { beginNestpayCheckout, nestpayCallback } from '../services/nestpay-payments.service.js';
import { isNestpayProvider } from '../services/payment-gateways.catalog.js';
import { beginAkbankRecurring, akbankEnrollmentStatus } from '../services/akbank-recurring.service.js';
import { beginIyzicoCheckout, iyzicoCallback } from '../services/iyzico-payments.service.js';
import { subscriptionCheckoutOrder } from '../services/credit-subscriptions.service.js';
import { pendingPaymentReviews, checkPaymentReview, closeUnchargedPayment } from '../services/payment-operations.service.js';
import { startPaymentReversal, reversalSummary, reconcilePaymentReversal, closeUnrefundedReversal } from '../services/payment-reversals.service.js';

export const paymentPublicRouter = Router();
const callbacks = rateLimit({ windowMs: 60_000, limit: 120, standardHeaders: 'draft-8', legacyHeaders: false });
paymentPublicRouter.post('/payments/akbank/callback/:id', callbacks, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const location = await akbankCallback(idSchema.parse(req.params.id), req.body);
  res.redirect(303, location);
});
paymentPublicRouter.post('/payments/nestpay/callback/:id', callbacks, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const location = await nestpayCallback(idSchema.parse(req.params.id), req.body);
  res.redirect(303, location);
});
paymentPublicRouter.post('/payments/iyzico/callback/:id', callbacks, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  const location = await iyzicoCallback(idSchema.parse(req.params.id), z.string().max(255).parse(req.body?.token));
  res.redirect(303, location);
});
// Webhook payloads only trigger an authenticated provider query. No status in the payload is trusted.
paymentPublicRouter.post('/payments/iyzico/webhook', callbacks, async (req, res) => {
  const { handleIyzicoWebhook } = await import('../services/iyzico-webhook.js');
  await handleIyzicoWebhook(req.body, req.get('X-IYZ-SIGNATURE-V3'));
  res.set('Cache-Control', 'no-store').json({ success: true });
});

export const paymentRouter = Router();
paymentRouter.use(['/credit-sales/payment-settings', '/my/credit-store/orders'], (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
paymentRouter.get('/credit-sales/payment-settings', async (req, res) => res.json({ success: true, data: await settings.getPaymentSettings(req.actor) }));
paymentRouter.put('/credit-sales/payment-settings', async (req, res) => res.json({ success: true, data: await settings.savePaymentSettings(req.actor, req.body) }));
paymentRouter.get('/credit-sales/payment-settings/akbank', async (req, res) => res.json({ success: true, data: await getAkbankSettings(req.actor) }));
paymentRouter.put('/credit-sales/payment-settings/akbank', async (req, res) => res.json({ success: true, data: await saveAkbankSettings(req.actor, req.body) }));
paymentRouter.post('/credit-sales/payment-settings/akbank/test', async (req, res) => res.json({ success: true, data: await testAkbankConnection(req.actor) }));
const bankIdSchema = z.string().regex(/^[a-z0-9_-]{2,32}$/);
paymentRouter.get('/credit-sales/payment-settings/gateways', async (req, res) => res.json({ success: true, data: await listNestpayGateways(req.actor) }));
paymentRouter.put('/credit-sales/payment-settings/gateways/:bankId', async (req, res) => res.json({ success: true, data: await saveNestpaySettings(req.actor, bankIdSchema.parse(req.params.bankId), req.body) }));
paymentRouter.post('/credit-sales/payment-settings/gateways/:bankId/test', async (req, res) => res.json({ success: true, data: await testNestpayConnection(req.actor, bankIdSchema.parse(req.params.bankId)) }));
paymentRouter.delete('/credit-sales/payment-settings/gateways/:bankId', async (req, res) => res.json({ success: true, data: await removeNestpayGateway(req.actor, bankIdSchema.parse(req.params.bankId)) }));
paymentRouter.post('/credit-sales/payment-settings/test', async (req, res) => res.json({ success: true, data: await settings.testPaymentConnection(req.actor) }));
paymentRouter.get('/credit-sales/payment-settings/pending', async (req, res) => res.json({ success: true, data: await pendingPaymentReviews(req.actor, req.query.orderId ? idSchema.parse(req.query.orderId) : undefined) }));
paymentRouter.post('/credit-sales/payment-settings/pending/:id/check', async (req, res) => res.json({ success: true, data: await checkPaymentReview(req.actor, idSchema.parse(req.params.id)) }));
paymentRouter.post('/credit-sales/payment-settings/pending/:id/no-charge', async (req, res) => res.json({ success: true, data: await closeUnchargedPayment(req.actor, idSchema.parse(req.params.id), req.body) }));
const checkoutLimit = rateLimit({ windowMs: 60_000, limit: 10, standardHeaders: 'draft-8', legacyHeaders: false, keyGenerator: req => req.actor.id });
paymentRouter.get('/my/credit-store/orders/akbank-enrollment/:id', async (req, res) => res.json({ success: true, data: await akbankEnrollmentStatus(req.actor, idSchema.parse(req.params.id)) }));
paymentRouter.post('/my/credit-store/orders/akbank-enrollment/:id', checkoutLimit, async (req, res) => {
  try { res.json({ success: true, data: await beginAkbankRecurring(req.actor, idSchema.parse(req.params.id), req.body) }); }
  finally { if (Buffer.isBuffer((req as any).rawBody)) (req as any).rawBody.fill(0); delete (req as any).rawBody; req.body = undefined; }
});
paymentRouter.post('/my/credit-store/orders/:id/pay', checkoutLimit, async (req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const available = await settings.paymentAvailability();
    const orderId = idSchema.parse(req.params.id);
    const result = available.provider === 'akbank'
      ? await beginAkbankCheckout(req.actor, orderId, req.body)
      : isNestpayProvider(available.provider)
        ? await beginNestpayCheckout(req.actor, available.provider, orderId, req.body)
        : await beginIyzicoCheckout(req.actor, orderId, req.body);
    res.json({ success: true, data: result });
  } finally {
    if (Buffer.isBuffer((req as any).rawBody)) (req as any).rawBody.fill(0);
    delete (req as any).rawBody;
    req.body = undefined;
  }
});
paymentRouter.post('/my/credit-store/subscriptions/:id/checkout', checkoutLimit, async (req, res) => res.json({ success: true, data: await subscriptionCheckoutOrder(req.actor, idSchema.parse(req.params.id)) }));
paymentRouter.get('/credit-sales/orders/:id/reversals', async (req, res) => res.json({ success: true, data: await reversalSummary(req.actor, idSchema.parse(req.params.id)) }));
paymentRouter.get('/my/credit-store/orders/:id/reversals', async (req, res) => res.json({ success: true, data: await reversalSummary(req.actor, idSchema.parse(req.params.id), false) }));
paymentRouter.post('/credit-sales/orders/:id/reversals', checkoutLimit, async (req, res) => res.json({ success: true, data: await startPaymentReversal(req.actor, idSchema.parse(req.params.id), req.body) }));
paymentRouter.post('/credit-sales/reversals/:id/check', checkoutLimit, async (req, res) => { settings.paymentStaff(req.actor, true); res.json({ success: true, data: await reconcilePaymentReversal(idSchema.parse(req.params.id)) }); });
paymentRouter.post('/credit-sales/reversals/:id/no-refund', checkoutLimit, async (req, res) => res.json({ success: true, data: await closeUnrefundedReversal(req.actor, idSchema.parse(req.params.id), req.body) }));

paymentRouter.post('/credit-sales/orders/:id/refund-request/reject', checkoutLimit, async (req, res) => res.json({ success: true, data: await rejectCreditRefundRequest(req.actor, idSchema.parse(req.params.id), req.body) }));

paymentRouter.post('/my/credit-store/orders/:id/reversals', checkoutLimit, async (req, res) => res.json({ success: true, data: await startPaymentReversal(req.actor, idSchema.parse(req.params.id), req.body, false) }));
paymentRouter.post('/my/credit-store/orders/:id/refund-request', checkoutLimit, async (req, res) => res.json({ success: true, data: await requestCreditRefund(req.actor, idSchema.parse(req.params.id), req.body) }));
