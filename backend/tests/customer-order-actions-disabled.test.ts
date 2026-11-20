import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { cancelCreditOrder } from '../src/services/credit-orders.service.js';
import { startPaymentReversal } from '../src/services/payment-reversals.service.js';

test('customer top-ups cannot directly cancel or reverse but staff can cancel', async () => {
 const user = await db.user.create({ data: { name: 'Top-up policy fixture', role: 'CUSTOMER', passwordHash: 'fixture' } });
 const actor = { id: user.id, role: 'CUSTOMER' as const, name: user.name, email: '', departmentIds: [], sessionId: '' };
 try {
  const order = await db.creditOrder.create({ data: { customerId: user.id, requestedById: user.id, requestKey: randomUUID(), inputHash: 'a'.repeat(64), kind: 'TOP_UP', name: 'Top-up', credits: 10, total: '10', currency: 'TRY' } });
  await assert.rejects(cancelCreditOrder(actor, order.id), { code: 'ORDER_CANCEL_NOT_ALLOWED' });
  await assert.rejects(startPaymentReversal(actor, order.id, { requestKey: randomUUID(), reason: 'Policy test' }, false), { code: 'REFUND_NOT_ALLOWED' });
  assert.equal((await cancelCreditOrder({ ...actor, role: 'ADMIN' }, order.id, true)).status, 'CANCELLED');
  const subscription = await db.creditOrder.create({ data: { customerId: user.id, requestedById: user.id, requestKey: randomUUID(), inputHash: 'b'.repeat(64), kind: 'SUBSCRIPTION', name: 'Package', credits: 10, total: '10', currency: 'TRY' } });
  assert.equal((await cancelCreditOrder(actor, subscription.id)).status, 'CANCELLED');
 } finally {
  await db.activityLog.deleteMany({ where: { userId: user.id } });
  await db.notification.deleteMany({ where: { userId: user.id } });
  await db.creditOrder.deleteMany({ where: { customerId: user.id } });
  await db.user.delete({ where: { id: user.id } });
 }
});
