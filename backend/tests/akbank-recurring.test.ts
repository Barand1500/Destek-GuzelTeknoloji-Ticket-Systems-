import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { sealPayment, openPayment } from '../src/services/payment-secrets.js';
import { akbankHash } from '../src/services/akbank-client.js';
import { beginAkbankCheckout, reconcileAkbankSession } from '../src/services/akbank-payments.service.js';
import { beginAkbankRecurring, reconcileAkbankRecurring } from '../src/services/akbank-recurring.service.js';
import { changeSubscription } from '../src/services/credit-subscriptions.service.js';
import { startPaymentReversal } from '../src/services/payment-reversals.service.js';
import { billingBoundary, billingToday } from '../src/services/credit-billing.js';

test('Akbank single-entry checkout establishes one bank mandate, imports payments once and cancels future charges', async () => {
  const owner = await db.user.create({ data: { name: 'Recurring fixture ' + randomUUID(), role: 'CUSTOMER', passwordHash: 'fixture' } });
  const actor = { id: owner.id, name: owner.name, role: 'CUSTOMER' as const, email: '', departmentIds: [], sessionId: '', ipAddress: '127.0.0.1' };
  const config = { merchantSafeId: 'recurring-merchant', terminalSafeId: 'recurring-terminal', secretKey: 'recurring-secret', mode: 'sandbox' as const };
  const card = { holder: 'TEST USER', number: '4111111111111111', expiry: '1230', cvc: '123' };
  const settings = { id: 'akbank', enabled: true, recurringEnabled: true, testedAt: new Date(), mode: 'sandbox', credentialsCiphertext: sealPayment(config), publicUrl: 'https://portal.test' };
  const originalFetch = globalThis.fetch, originalTx = db.$transaction, originalGateway = db.paymentGatewaySettings.findUnique;
  const gateway = async ({ where }: any) => where.id === 'akbank' ? settings : null;
  db.paymentGatewaySettings.findUnique = gateway as any;
  db.$transaction = ((callback: any, options: any) => originalTx.call(db, (tx: any) => { tx.paymentGatewaySettings.findUnique = gateway; return callback(tx); }, options)) as typeof originalTx;
  const sales = new Map<string, any[]>(), plans = new Map<string, any[]>(), calls: any[] = [];
  let loseRegistration = false;
  globalThis.fetch = (async (_url: any, init: any) => {
    const body = JSON.parse(init.body); calls.push(body);
    assert.equal(init.headers['auth-hash'], akbankHash(init.body, config.secretKey));
    if (body.txnCode === '1011') {
      assert.equal(body.card.cardNumber, card.number);
      assert.equal(body.plannedDate.firstPlannedDate.length, 10);
      const first = new Date(body.plannedDate.firstPlannedDate);
      plans.set(body.order.orderTrackId, Array.from({ length: body.recurring.numberOfPayments }, (_, i) => ({ txnCode: '1000', orderTrackId: body.order.orderTrackId, recurringOrder: i + 1, plannedDateTime: billingBoundary(first, 1, null, i).toISOString(), amount: body.transaction.amount, currencyCode: 949, installCount: 1, requestStatus: 'W', requestType: 'R', totalRefundAmount: 0 })));
      if (loseRegistration) throw Error('Registration response lost');
    } else assert.equal(body.card, undefined);
    const rows = body.order.orderTrackId ? plans.get(body.order.orderTrackId) ?? [] : sales.get(body.order.orderId) ?? [];
    if (body.txnCode === '1013') {
      assert.equal(body.recurring, undefined, 'Stop all future payments, not only one occurrence');
      for (const row of rows) if (['W', 'P'].includes(row.requestStatus)) row.requestStatus = 'C';
    }
    if (body.txnCode === '1002') rows.find(row => row.recurringOrder === body.recurring.recurringOrder).totalRefundAmount = body.transaction.amount;
    if (body.txnCode === '1003') rows.find(row => row.recurringOrder === body.recurring.recurringOrder).requestStatus = 'V';
    const value = { responseCode: 'VPS-0000', txnCode: body.txnCode, terminal: body.terminal, ...(body.txnCode === '1010' ? { txnDetailList: rows } : { order: body.order }) };
    const text = JSON.stringify(value);
    return new Response(text, { headers: { 'auth-hash': akbankHash(text, config.secretKey) } });
  }) as typeof fetch;
  async function paidCheckout() {
    const today = billingToday();
    const sub = await db.creditSubscription.create({ data: { customerId: owner.id, name: 'Monthly recurring fixture', amount: '10.00', currency: 'TRY', credits: 100, periodMonths: 1, autoRenew: true, consentedAt: new Date(), status: 'AWAITING_PAYMENT', anchorOn: today, anchorPeriod: 0 } });
    const order = await db.creditOrder.create({ data: { customerId: owner.id, requestedById: owner.id, subscriptionId: sub.id, periodNumber: 1, requestKey: randomUUID(), inputHash: 'a'.repeat(64), kind: 'SUBSCRIPTION', name: sub.name, credits: 100, total: '10.00', currency: 'TRY', periodMonths: 1, periodStartsOn: today, periodEndsOn: new Date(billingBoundary(today, 1, null, 1).getTime() - 86400000), renewalRequested: true } });
    const form = await beginAkbankCheckout(actor, order.id, { card, renewalConsent: true });
    const sessionId = (form as any).sessionId;
    assert.ok(sessionId, 'The original checkout must bind recurring enrollment to its payment attempt');
    sales.set(form.fields.orderId, [{ orderId: form.fields.orderId, txnCode: '1000', responseCode: 'VPS-0000', hostResponseCode: '00', txnStatus: 'N', amount: '10.00', currencyCode: 949, installCount: 1 }]);
    await reconcileAkbankSession(sessionId);
    return { sub, order, sessionId };
  }
  try {
    const first = await paidCheckout();
    await assert.rejects(beginAkbankRecurring({ ...actor, id: randomUUID() }, first.sessionId, { card, consent: true }));
    const result = await beginAkbankRecurring(actor, first.sessionId, { card, consent: true });
    assert.equal(result.state, 'ACTIVE');
    await beginAkbankRecurring(actor, first.sessionId, { card, consent: true });
    assert.equal(calls.filter(row => row.txnCode === '1011').length, 1);
    const instruction = await db.akbankRecurringInstruction.findUniqueOrThrow({ where: { checkoutSessionId: first.sessionId } });
    const context = openPayment<any>(instruction.contextCiphertext);
    assert.ok(!JSON.stringify(context).includes(card.number));
    assert.ok(!JSON.stringify(context).includes('cvv2'));
    const rows = plans.get(instruction.id)!;
    rows[0].requestStatus = 'S';
    const paidOn = new Date(rows[0].plannedDateTime);
    await reconcileAkbankRecurring(instruction.id, paidOn);
    await reconcileAkbankRecurring(instruction.id, paidOn);
    assert.equal(await db.creditOrder.count({ where: { subscriptionId: first.sub.id, periodNumber: 2 } }), 1);
    const renewed = await db.creditOrder.findUniqueOrThrow({ where: { subscriptionId_periodNumber: { subscriptionId: first.sub.id, periodNumber: 2 } } });
    assert.equal(renewed.status, 'PAID');
    assert.equal((await db.agreement.findUniqueOrThrow({ where: { id: renewed.grantedAgreementId! } })).credits, 100);
    assert.equal((await db.creditSubscription.findUniqueOrThrow({ where: { id: first.sub.id } })).paidPeriods, 2);
    // Refund of a bank-managed occurrence uses orderTrackId + recurringOrder, never a fake orderId.
    const refund = await startPaymentReversal({ ...actor, role: 'ADMIN' }, renewed.id, { requestKey: randomUUID(), kind: 'REFUND', credits: 100, reason: 'Recurring refund fixture' });
    assert.equal(refund.status, 'SUCCEEDED');
    assert.equal((await db.akbankRecurringInstruction.findUniqueOrThrow({ where: { id: instruction.id } })).state, 'STOP_REQUESTED');
    await reconcileAkbankRecurring(instruction.id, paidOn);
    assert.equal((await db.akbankRecurringInstruction.findUniqueOrThrow({ where: { id: instruction.id } })).state, 'STOPPED');
    assert.ok(rows.slice(1).every(row => row.requestStatus === 'C'));
    await db.agreement.updateMany({ where: { customerId: owner.id }, data: { cancelledAt: new Date() } });
    loseRegistration = true;
    const second = await paidCheckout();
    assert.equal((await beginAkbankRecurring(actor, second.sessionId, { card, consent: true })).state, 'ACTIVE', 'A lost registration response is recovered by inquiry, never registration replay');
    await changeSubscription(actor, second.sub.id, 'stop');
    const secondInstruction = await db.akbankRecurringInstruction.findUniqueOrThrow({ where: { checkoutSessionId: second.sessionId } });
    assert.equal(secondInstruction.state, 'STOP_REQUESTED');
    await reconcileAkbankRecurring(secondInstruction.id);
    assert.equal((await db.akbankRecurringInstruction.findUniqueOrThrow({ where: { id: secondInstruction.id } })).state, 'STOPPED');
    assert.equal(calls.filter(row => row.txnCode === '1011').length, 2);
  } finally {
    globalThis.fetch = originalFetch; db.$transaction = originalTx; db.paymentGatewaySettings.findUnique = originalGateway;
    await db.paymentReversal.deleteMany({ where: { order: { customerId: owner.id } } });
    await db.paymentCheckoutSession.deleteMany({ where: { customerId: owner.id } });
    await db.creditPaymentAttempt.deleteMany({ where: { order: { customerId: owner.id } } });
    await db.akbankRecurringInstruction.deleteMany({ where: { subscription: { customerId: owner.id } } });
    await db.creditOrder.deleteMany({ where: { customerId: owner.id } });
    await db.creditSubscription.deleteMany({ where: { customerId: owner.id } });
    await db.agreement.deleteMany({ where: { customerId: owner.id } });
    await db.notification.deleteMany({ where: { userId: owner.id } });
    await db.activityLog.deleteMany({ where: { userId: owner.id } });
    await db.user.delete({ where: { id: owner.id } });
    await db.$disconnect();
  }
});
