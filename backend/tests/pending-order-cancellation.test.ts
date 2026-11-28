import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { cancelCreditOrder } from '../src/services/credit-orders.service.js';
import { packageSchedule } from '../src/services/credit-package-schedule.js';

test('customers cancel unpaid orders, but cannot cancel paid, foreign or in-flight orders', async t => {
  const original = db.$transaction;
  t.after(() => { db.$transaction = original; });
  const actor = { id: 'owner', role: 'CUSTOMER' as const, name: 'Owner', email: '', departmentIds: [], sessionId: '' };
  let row: any, attempts = 0, notifications = 0, updates = 0, stopped = 0;
  const tx: any = {
    $queryRaw: async () => [],
    user: { findFirst: async () => ({ id: actor.id, name: 'Owner', parentCustomerId: null }) },
    creditOrder: {
      findUnique: async () => row,
      findFirst: async () => row.kind === 'SUBSCRIPTION' && ['PENDING', 'FAILED'].includes(row.status) ? row : null,
      updateMany: async ({ where, data }: any) => {
        assert.deepEqual(where.status.in, ['PENDING', 'FAILED']);
        updates++; Object.assign(row, data); return { count: 1 };
      },
    },
    agreement: { findFirst: async () => null },
    creditPaymentAttempt: { count: async () => attempts },
    creditSubscription: { update: async ({ data }: any) => { assert.equal(data.status, 'STOPPED'); stopped++; } },
    activityLog: { create: async () => ({}) },
    notification: { create: async () => { notifications++; } },
  };
  db.$transaction = (async (work: any) => work(tx)) as any;
  for (const kind of ['TOP_UP', 'SUBSCRIPTION']) {
    row = { id: 'order', number: 34, customerId: actor.id, kind, status: 'PENDING', total: '10', unitPrice: null, subscriptionId: kind === 'SUBSCRIPTION' ? 'subscription' : null };
    if (kind === 'SUBSCRIPTION') await assert.rejects(packageSchedule(tx, actor.id, 1, null), { code: 'PACKAGE_ORDER_EXISTS' });
    assert.equal((await cancelCreditOrder(actor, row.id)).status, 'CANCELLED');
    if (kind === 'SUBSCRIPTION') assert.ok((await packageSchedule(tx, actor.id, 1, null)).startsOn);
    assert.equal((await cancelCreditOrder(actor, row.id)).status, 'CANCELLED');
  }
  assert.equal(updates, 2); assert.equal(notifications, 2); assert.equal(stopped, 1);
  row = { ...row, status: 'FAILED' };
  assert.equal((await cancelCreditOrder(actor, row.id)).status, 'CANCELLED');
  row = { ...row, customerId: 'other', status: 'PENDING' };
  await assert.rejects(cancelCreditOrder(actor, row.id), { code: 'ORDER_NOT_FOUND' });
  row = { ...row, customerId: actor.id, status: 'PAID' };
  await assert.rejects(cancelCreditOrder(actor, row.id), { code: 'ORDER_NOT_PENDING' });
  row.status = 'PENDING'; attempts = 1;
  await assert.rejects(cancelCreditOrder(actor, row.id), { code: 'PAYMENT_IN_PROGRESS' });
  assert.equal(updates, 3);
});
