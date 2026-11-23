import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import type { Actor } from '../src/types/express.js';
import { activityLogs } from '../src/services/management.service.js';
import { activityQuery } from '../src/validators/management.js';
import { listSubscriptions, subscriptionListInput } from '../src/services/credit-subscriptions.service.js';

test('activity log date range and subscription package-status filters', async () => {
  const suffix = randomUUID().slice(0, 8);
  const admin = await db.user.create({ data: { name: 'Filter admin ' + suffix, role: 'ADMIN', passwordHash: 'fixture' } });
  const customer = await db.user.create({ data: { name: 'Filter customer ' + suffix, role: 'CUSTOMER', passwordHash: 'fixture' } });
  const actor: Actor = { id: admin.id, name: admin.name, email: '', role: 'ADMIN', sessionId: '', departmentIds: [] };
  try {
    await db.activityLog.createMany({
      data: [
        { userId: admin.id, action: 'filter.inside', entityId: 'fixture', createdAt: new Date('2026-05-10T12:00:00+03:00') },
        { userId: admin.id, action: 'filter.late', entityId: 'fixture', createdAt: new Date('2026-05-10T23:30:00+03:00') },
        { userId: admin.id, action: 'filter.nextDay', entityId: 'fixture', createdAt: new Date('2026-05-11T00:30:00+03:00') },
      ],
    });
    const ranged = await activityLogs(actor, activityQuery.parse({ from: '2026-05-10', to: '2026-05-10', search: 'filter.' }));
    assert.deepEqual(ranged.data.map(row => row.action).sort(), ['filter.inside', 'filter.late']);
    const singleDay = await activityLogs(actor, activityQuery.parse({ from: '2026-05-11', search: 'filter.' }));
    assert.deepEqual(singleDay.data.map(row => row.action), ['filter.nextDay']);
    const untouched = await activityLogs(actor, activityQuery.parse({ search: 'filter.' }));
    assert.equal(untouched.data.length, 3);

    await db.creditSubscription.create({ data: { customerId: customer.id, name: 'Active ' + suffix, amount: '10', currency: 'TRY', credits: 10, periodMonths: 1, status: 'ACTIVE', currentStartsOn: new Date('2026-01-01'), currentEndsOn: new Date('2099-01-01') } });
    await db.creditSubscription.create({ data: { customerId: customer.id, name: 'Stopped ' + suffix, amount: '10', currency: 'TRY', credits: 10, periodMonths: 1, status: 'STOPPED', currentStartsOn: new Date('2020-01-01'), currentEndsOn: new Date('2020-02-01') } });
    const refunded = await db.creditSubscription.create({ data: { customerId: customer.id, name: 'Refunded ' + suffix, amount: '10', currency: 'TRY', credits: 10, periodMonths: 1, status: 'ACTIVE', currentStartsOn: new Date('2026-01-01'), currentEndsOn: new Date('2099-01-01') } });
    await db.creditOrder.create({ data: { customerId: customer.id, requestedById: customer.id, subscriptionId: refunded.id, periodNumber: 1, requestKey: randomUUID(), inputHash: 'fixture', kind: 'SUBSCRIPTION', name: 'Refunded order ' + suffix, credits: 10, total: '10', currency: 'TRY', status: 'REFUNDED', paidAt: new Date('2026-02-01T09:00:00Z') } });

    const active = await listSubscriptions(actor, subscriptionListInput.parse({ displayStatus: 'active', search: suffix }), true);
    assert.deepEqual(active.data.map(row => row.name), ['Active ' + suffix]);
    const stopped = await listSubscriptions(actor, subscriptionListInput.parse({ displayStatus: 'stopped', search: suffix }), true);
    assert.deepEqual(stopped.data.map(row => row.name), ['Stopped ' + suffix]);
    const refunds = await listSubscriptions(actor, subscriptionListInput.parse({ displayStatus: 'refunded', search: suffix }), true);
    assert.deepEqual(refunds.data.map(row => row.name), ['Refunded ' + suffix]);

    const paged = await listSubscriptions(actor, subscriptionListInput.parse({ search: suffix, limit: '2' }), true);
    assert.equal(paged.pagination.total, 3);
    assert.equal(paged.pagination.totalPages, 2);
    assert.equal(paged.data.length, 2);
  } finally {
    const orders = await db.creditOrder.findMany({ where: { customerId: customer.id }, select: { id: true } });
    await db.creditPaymentAttempt.deleteMany({ where: { orderId: { in: orders.map(order => order.id) } } });
    await db.creditOrder.deleteMany({ where: { customerId: customer.id } });
    await db.creditSubscription.deleteMany({ where: { customerId: customer.id } });
    await db.activityLog.deleteMany({ where: { userId: admin.id } });
    await db.user.deleteMany({ where: { id: { in: [admin.id, customer.id] } } });
    await db.$disconnect();
  }
});
