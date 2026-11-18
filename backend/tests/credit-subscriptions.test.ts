import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import type { Actor } from '../src/types/express.js';
import { billingBoundary, runCreditRenewals, settleVerifiedCreditPayment, changeSubscription, listSubscriptions, subscriptionListInput, type RecurringPaymentProvider } from '../src/services/credit-subscriptions.service.js';

test('billing dates preserve the original month-end anchor, leap years and custom days', () => {
  const anchor = new Date('2028-01-31');
  assert.equal(billingBoundary(anchor, 1, null, 1).toISOString().slice(0, 10), '2028-02-29');
  assert.equal(billingBoundary(anchor, 1, null, 2).toISOString().slice(0, 10), '2028-03-31');
  assert.equal(billingBoundary(new Date('2028-02-29'), 12, null, 1).toISOString().slice(0, 10), '2029-02-28');
  assert.equal(billingBoundary(anchor, null, 90, 1).toISOString().slice(0, 10), '2028-04-30');
  assert.throws(() => billingBoundary(anchor, 1, 30, 1));
});

test('subscription lifecycle: verified grants, retries, consent, stopping, scope and no-provider behavior', async () => {
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
    const sub = await db.creditSubscription.create({ data: { customerId: owner.id, name: 'Monthly', amount: '100.00', currency: 'TRY', credits: 50, periodMonths: 1, autoRenew: true, consentedAt: now, provider: providerName, paymentMethodRef: 'provider-token-only', nextPaymentOn: new Date('2028-01-31') } });
    assert.deepEqual(await runCreditRenewals(undefined, now), { dispatched: 0 });
    assert.equal(await db.creditOrder.count({ where: { customerId: owner.id } }), 0);
    assert.deepEqual(await runCreditRenewals(provider, now), { dispatched: 1 });
    let order = await db.creditOrder.findFirstOrThrow({ where: { subscriptionId: sub.id } });
    assert.equal(order.status, 'PAID');
    assert.equal(order.periodEndsOn?.toISOString().slice(0, 10), '2028-02-28');
    assert.equal((await db.creditSubscription.findUniqueOrThrow({ where: { id: sub.id } })).nextPaymentOn?.toISOString().slice(0, 10), '2028-02-29');
    const attempt = await db.creditPaymentAttempt.findFirstOrThrow({ where: { orderId: order.id } });
    const event = { attemptId: attempt.id, provider: providerName, paymentId: attempt.id, outcome: 'PAID' as const, amount: '100', currency: 'TRY' };
    await Promise.all([settleVerifiedCreditPayment(event, now), settleVerifiedCreditPayment(event, now)]);
    assert.equal(await db.agreement.count({ where: { customerId: owner.id } }), 1);
    await assert.rejects(settleVerifiedCreditPayment({ ...event, amount: '1' }, now), { code: 'PAYMENT_MISMATCH' });
    await runCreditRenewals(provider, new Date('2028-02-29T09:00:00Z'));
    order = await db.creditOrder.findFirstOrThrow({ where: { subscriptionId: sub.id, periodNumber: 2 } });
    assert.equal(order.periodEndsOn?.toISOString().slice(0, 10), '2028-03-30');
    assert.equal(await db.agreement.count({ where: { customerId: owner.id } }), 2);
    assert.equal(calls, 2);
    await assert.rejects(changeSubscription({ ...actor, id: other.id }, sub.id, 'stop'), { code: 'SUBSCRIPTION_NOT_FOUND' });
    await changeSubscription(actor, sub.id, 'stop');
    await runCreditRenewals(provider, new Date('2028-03-31T09:00:00Z'));
    assert.equal(calls, 2);
    assert.equal(await db.agreement.count({ where: { customerId: owner.id } }), 2);

    await db.agreement.updateMany({ where: { customerId: owner.id }, data: { cancelledAt: now } });
    const failing = await db.creditSubscription.create({ data: { customerId: owner.id, name: 'Failure', amount: '25', currency: 'USD', credits: 10, periodDays: 30, autoRenew: true, consentedAt: now, provider: providerName, paymentMethodRef: 'token', nextPaymentOn: new Date('2028-01-31') } });
    const attempts: string[] = [];
    const failureProvider: RecurringPaymentProvider = { name: providerName, reconcile: async () => null, charge: async input => { attempts.push(input.attemptId); return { attemptId: input.attemptId, provider: providerName, paymentId: input.attemptId, outcome: 'FAILED', amount: input.amount, currency: input.currency }; } };
    await runCreditRenewals(failureProvider, now);
    await runCreditRenewals(failureProvider, now);
    assert.equal(attempts.length, 1);
    await runCreditRenewals(failureProvider, new Date('2028-02-01T10:00:00Z'));
    await runCreditRenewals(failureProvider, new Date('2028-02-04T11:00:00Z'));
    await runCreditRenewals(failureProvider, new Date('2028-02-10T11:00:00Z'));
    assert.equal(attempts.length, 3);
    assert.equal(await db.agreement.count({ where: { customerId: owner.id } }), 2);
    await changeSubscription(actor, failing.id, 'stop');

    const pending = await db.creditSubscription.create({ data: { customerId: owner.id, name: 'Unknown result', amount: '25', currency: 'TRY', credits: 10, periodDays: 30, autoRenew: true, consentedAt: now, provider: providerName, paymentMethodRef: 'token', nextPaymentOn: new Date('2028-01-31') } });
    const pendingIds: string[] = [];
    const unknownProvider: RecurringPaymentProvider = { name: providerName, reconcile: async input => { pendingIds.push(input.attemptId); return null; }, charge: async input => { pendingIds.push(input.attemptId); return null; } };
    await runCreditRenewals(unknownProvider, now); await runCreditRenewals(unknownProvider, now);
    assert.equal(pendingIds.length, 2); assert.equal(pendingIds[0], pendingIds[1]);
    await changeSubscription(actor, pending.id, 'stop');
    const pendingOrder = await db.creditOrder.findFirstOrThrow({ where: { subscriptionId: pending.id } });
    assert.equal(pendingOrder.status, 'PENDING', 'In-flight payments are not silently cancelled');
    const recovered: RecurringPaymentProvider = { name: providerName, charge: async () => { throw new Error('Stopped subscription must not charge'); }, reconcile: async input => ({ attemptId: input.attemptId, provider: providerName, paymentId: input.attemptId, outcome: 'PAID', amount: '25', currency: 'TRY' }) };
    await runCreditRenewals(recovered, new Date(now.getTime() + 61_000));
    assert.equal((await db.creditOrder.findUniqueOrThrow({ where: { id: pendingOrder.id } })).status, 'PAID');
    const stopped = await db.creditSubscription.findUniqueOrThrow({ where: { id: pending.id } });
    assert.equal(stopped.status, 'STOPPED'); assert.equal(stopped.autoRenew, false); assert.equal(stopped.nextPaymentOn, null);

    const original = await db.agreement.create({ data: { customerId: owner.id, name: 'Existing contract', type: 'MONTHLY', startsOn: new Date('2026-01-01'), endsOn: new Date('2026-01-31'), credits: 100, fee: '150' } });
    const { updateAgreement } = await import('../src/services/agreements.service.js');
    await updateAgreement(staff, owner.id, original.id, { name: original.name, type: 'MONTHLY', startsOn: '2026-01-01', endsOn: '2026-01-31', fee: '150', currency: 'EUR', credits: 100, renewalRequested: true });
    const offer = await db.creditSubscription.findUniqueOrThrow({ where: { sourceAgreementId: original.id } });
    assert.equal(offer.amount.toFixed(2), '150.00'); assert.equal(offer.currency, 'EUR'); assert.equal(offer.periodMonths, 1);
    await assert.rejects(changeSubscription(staff, offer.id, 'accept', true), { code: 'OWNER_CONSENT_REQUIRED' });
    const before = await db.creditSubscription.findUniqueOrThrow({ where: { id: offer.id } });
    assert.equal(before.consentedAt, null); assert.equal(before.autoRenew, false);
    await changeSubscription(actor, offer.id, 'accept');
    assert.equal((await db.creditSubscription.findUniqueOrThrow({ where: { id: offer.id } })).autoRenew, true);
    const list = await listSubscriptions(actor, subscriptionListInput.parse({ page: 1, limit: 2 }));
    assert.equal(list.data.length, 2); assert.equal(list.pagination.total, 4);
    assert.ok(!('paymentMethodRef' in list.data[0]));
    await db.user.update({ where: { id: other.id }, data: { parentCustomerId: owner.id } });
    await assert.rejects(listSubscriptions({ ...actor, id: other.id }, subscriptionListInput.parse({})), { code: 'PURCHASE_OWNER_ONLY' });
    // Revised agreement terms retire failed old orders and restart exactly one billing period.
    await db.creditSubscription.update({ where: { id: offer.id }, data: { paidPeriods: 2, currentEndsOn: new Date('2028-04-30') } });
    const oldRenewal = await db.creditOrder.create({ data: { customerId: owner.id, requestedById: owner.id, subscriptionId: offer.id, periodNumber: 3, requestKey: randomUUID(), inputHash: 'old-terms', name: original.name, kind: 'SUBSCRIPTION', credits: 100, total: '150', currency: 'EUR', periodMonths: 1, status: 'FAILED' } });
    await updateAgreement(staff, owner.id, original.id, { name: original.name, type: 'MONTHLY', startsOn: '2026-01-01', endsOn: '2026-01-31', fee: '200', currency: 'USD', credits: 50, renewalRequested: true });
    assert.equal((await db.creditOrder.findUniqueOrThrow({ where: { id: oldRenewal.id } })).status, 'CANCELLED');
    await changeSubscription(actor, offer.id, 'accept');
    await db.creditSubscription.update({ where: { id: offer.id }, data: { provider: providerName, paymentMethodRef: 'token' } });
    await runCreditRenewals(provider, new Date('2028-05-01T09:00:00Z'));
    const revised = await db.creditOrder.findFirstOrThrow({ where: { subscriptionId: offer.id, status: 'PAID' } });
    assert.equal(revised.total.toFixed(2), '200.00'); assert.equal(revised.currency, 'USD'); assert.equal(revised.credits, 50);
    assert.equal(revised.periodEndsOn?.toISOString().slice(0,10), '2028-05-31');
    const { deleteAgreement } = await import('../src/services/agreements.service.js');
    await deleteAgreement(staff, owner.id, original.id);
    assert.equal((await db.creditSubscription.findUniqueOrThrow({ where: { id: offer.id } })).autoRenew, false);

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
