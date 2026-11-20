import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import type { Actor } from '../src/types/express.js';
import { billingBoundary, runCreditRenewals, settleVerifiedCreditPayment, changeSubscription, listSubscriptions, subscriptionListInput, subscriptionCheckoutOrder, type RecurringPaymentProvider } from '../src/services/credit-subscriptions.service.js';

test('billing dates preserve the original month-end anchor, leap years and custom days', () => {
  const anchor = new Date('2028-01-31');
  assert.equal(billingBoundary(anchor, 1, null, 1).toISOString().slice(0, 10), '2028-02-29');
  assert.equal(billingBoundary(anchor, 1, null, 2).toISOString().slice(0, 10), '2028-03-31');
  assert.equal(billingBoundary(new Date('2028-02-29'), 12, null, 1).toISOString().slice(0, 10), '2029-02-28');
  assert.equal(billingBoundary(anchor, null, 90, 1).toISOString().slice(0, 10), '2028-04-30');
  assert.throws(() => billingBoundary(anchor, 1, 30, 1));
});

test('retired renewals never dispatch and historical pending payments settle once', async () => {
  const suffix = randomUUID();
  const owner = await db.user.create({ data: { name: 'Subscription ' + suffix, role: 'CUSTOMER', passwordHash: 'fixture' } });
  const other = await db.user.create({ data: { name: 'Other subscription ' + suffix, role: 'CUSTOMER', passwordHash: 'fixture' } });
  const admin = await db.user.create({ data: { name: 'Subscription admin ' + suffix, role: 'ADMIN', passwordHash: 'fixture' } });
  const actor: Actor = { id: owner.id, name: owner.name, email: '', role: 'CUSTOMER', sessionId: '', departmentIds: [] };
  const staff: Actor = { ...actor, id: admin.id, role: 'ADMIN' };
  const now = new Date('2028-01-31T09:00:00Z');
  const providerName = 'fixture-' + suffix.slice(0, 20);
  let calls = 0;
  const provider: RecurringPaymentProvider = { name: providerName, reconcile: async () => null, charge: async input => {
    calls++;
    return { attemptId: input.attemptId, provider: providerName, paymentId: input.attemptId, outcome: 'PAID', amount: input.amount, currency: input.currency };
  } };
  try {
    const sub = await db.creditSubscription.create({ data: { customerId: owner.id, name: 'Legacy', amount: '100', currency: 'TRY', credits: 50, periodMonths: 1, autoRenew: true, consentedAt: now, provider: providerName, paymentMethodRef: 'token', nextPaymentOn: now } });
    assert.deepEqual(await runCreditRenewals(provider, now), { dispatched: 0 });
    assert.equal(calls, 0);
    assert.equal(await db.creditOrder.count({ where: { customerId: owner.id } }), 0);
    await assert.rejects(changeSubscription(actor, sub.id, 'accept'), { code: 'RENEWAL_DISABLED' });
    await assert.rejects(subscriptionCheckoutOrder(actor, sub.id), { code: 'RENEWAL_DISABLED' });
    const order = await db.creditOrder.create({ data: { customerId: owner.id, requestedById: owner.id, subscriptionId: sub.id, periodNumber: 1, requestKey: randomUUID(), inputHash: 'legacy', name: sub.name, kind: 'SUBSCRIPTION', credits: 50, total: '100', currency: 'TRY', periodMonths: 1 } });
    const attempt = await db.creditPaymentAttempt.create({ data: { orderId: order.id, attemptNumber: 1, provider: providerName } });
    await assert.rejects(changeSubscription({ ...actor, id: other.id }, sub.id, 'stop'), { code: 'SUBSCRIPTION_NOT_FOUND' });
    await changeSubscription(actor, sub.id, 'stop');
    assert.equal((await db.creditOrder.findUniqueOrThrow({ where: { id: order.id } })).status, 'PENDING');
    const event = { attemptId: attempt.id, provider: providerName, paymentId: attempt.id, outcome: 'PAID' as const, amount: '100', currency: 'TRY' };
    const recovered: RecurringPaymentProvider = { name: providerName, charge: async () => { throw Error('Must never charge'); }, reconcile: async () => event };
    assert.deepEqual(await runCreditRenewals(recovered, now), { dispatched: 1 });
    await Promise.all([settleVerifiedCreditPayment(event, now), settleVerifiedCreditPayment(event, now)]);
    assert.equal(await db.agreement.count({ where: { customerId: owner.id } }), 1);
    await assert.rejects(settleVerifiedCreditPayment({ ...event, amount: '1' }, now), { code: 'PAYMENT_MISMATCH' });
    const stopped = await db.creditSubscription.findUniqueOrThrow({ where: { id: sub.id } });
    assert.equal(stopped.status, 'STOPPED'); assert.equal(stopped.autoRenew, false); assert.equal(stopped.nextPaymentOn, null);
    await runCreditRenewals(provider, new Date('2028-03-31'));
    assert.equal(calls, 0);
    assert.equal(await db.creditOrder.count({ where: { subscriptionId: sub.id } }), 1);
    const list = await listSubscriptions(actor, subscriptionListInput.parse({}));
    assert.equal(list.data.length, 1); assert.ok(!('paymentMethodRef' in list.data[0]));
    assert.equal(list.data[0].lastOrderStatus, 'PAID');
    await db.creditOrder.update({ where: { id: attempt.orderId }, data: { status: 'REFUNDED' } });
    assert.equal((await listSubscriptions(actor, subscriptionListInput.parse({}))).data[0].lastOrderStatus, 'REFUNDED');
    await db.user.update({ where: { id: other.id }, data: { parentCustomerId: owner.id } });
    await assert.rejects(listSubscriptions({ ...actor, id: other.id }, subscriptionListInput.parse({})), { code: 'PURCHASE_OWNER_ONLY' });
    const queuedIds = Array.from({ length: 51 }, () => randomUUID());
    await db.creditOrder.createMany({ data: queuedIds.map(id => ({ id, customerId: owner.id, requestedById: owner.id, requestKey: randomUUID(), inputHash: 'fixture', kind: 'TOP_UP', name: 'Fair reconciliation', credits: 1, total: '1', currency: 'TRY', validityDays: 30 })) });
    await db.creditPaymentAttempt.createMany({ data: queuedIds.map(orderId => ({ orderId, attemptNumber: 1, provider: providerName })) });
    const checked = new Set<string>();
    const waiting: RecurringPaymentProvider = { name: providerName, charge: async () => { throw new Error('No fresh charge expected'); }, reconcile: async input => { checked.add(input.orderId); return null; } };
    await runCreditRenewals(waiting, now);
    assert.equal(checked.size, 50);
    await runCreditRenewals(waiting, now);
    assert.equal(checked.size, 51, 'Older unknown payments must not starve later payments');
  } finally {
    const orders = await db.creditOrder.findMany({ where: { customerId: owner.id }, select: { id: true } });
    await db.creditPaymentAttempt.deleteMany({ where: { orderId: { in: orders.map(v => v.id) } } });
    await db.creditOrder.deleteMany({ where: { customerId: owner.id } });
    await db.creditSubscription.deleteMany({ where: { customerId: owner.id } });
    await db.agreement.deleteMany({ where: { customerId: owner.id } });
    await db.notification.deleteMany({ where: { userId: { in: [owner.id, other.id, admin.id] } } });
    await db.activityLog.deleteMany({ where: { userId: { in: [owner.id, other.id, admin.id] } } });
    await db.user.update({ where: { id: other.id }, data: { parentCustomerId: null } });
    await db.user.deleteMany({ where: { id: { in: [owner.id, other.id, admin.id] } } });
    await db.$disconnect();
  }
});
