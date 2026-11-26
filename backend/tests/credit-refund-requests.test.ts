import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { requestCreditRefund, rejectCreditRefundRequest } from '../src/services/credit-refund-requests.service.js';
import { reversalSummary } from '../src/services/payment-reversals.service.js';
import { listCreditOrders, creditOrderListInput } from '../src/services/credit-orders.service.js';
test('new customer refund requests are blocked while managers can review historical requests', async () => {
 const owner = await db.user.create({ data: { name: 'Refund request fixture', role: 'CUSTOMER', passwordHash: 'fixture' } });
 const actor = { id: owner.id, role: 'CUSTOMER' as const, name: owner.name, email: '', departmentIds: [], sessionId: '' };
 const admin = { ...actor, role: 'ADMIN' as const };
 const grant = await db.agreement.create({ data: { customerId: owner.id, name: 'Refund request fixture', type: 'ONE_OFF', credits: 100, usedCredits: 10, fee: '1.00', startsOn: new Date('2026-01-01'), endsOn: new Date('2028-01-01') } });
 const order = await db.creditOrder.create({ data: { customerId: owner.id, requestedById: owner.id, requestKey: randomUUID(), inputHash: 'a'.repeat(64), kind: 'TOP_UP', name: 'Refund request fixture', credits: 100, total: '1.00', currency: 'TRY', status: 'PAID', paidAt: new Date(), grantedAgreementId: grant.id } });
 try {
  await assert.rejects(requestCreditRefund({ ...actor, id: randomUUID() }, order.id, { reason: 'Unused credits refund' }));
  await assert.rejects(rejectCreditRefundRequest(actor, order.id, { reason: 'Customer cannot review' }), { code: 'FORBIDDEN' });
  await assert.rejects(requestCreditRefund(actor, order.id, { reason: 'Refund unused credits' }), { code: 'CUSTOMER_REFUND_REQUEST_DISABLED' });
  assert.equal(await db.creditRefundRequest.count({ where: { orderId: order.id } }), 0);
  await db.creditRefundRequest.create({ data: { orderId: order.id, reason: 'Historical request' } });
  const summary = await reversalSummary(actor, order.id, false);
  assert.equal(summary.refundRequest?.status, 'OPEN'); assert.equal(summary.refundableCredits, 90); assert.equal(summary.refundableAmount, '0.90');
  const list = await listCreditOrders(admin, creditOrderListInput.parse({ search: 'Refund request fixture', refundRequested: 'true' }), true);
  assert.equal(list.data.find(row => row.id === order.id)?.refundRequest?.status, 'OPEN');
  assert.equal(list.data.find(row => row.id === order.id)?.canBankCancel, false);
  assert.equal((await db.agreement.findUniqueOrThrow({ where: { id: grant.id } })).credits, 100);
  assert.equal(await db.paymentReversal.count({ where: { orderId: order.id } }), 0);
  const pending = await db.paymentReversal.create({ data: { orderId: order.id, requestKey: randomUUID(), kind: 'REFUND', credits: 10, amount: '0.10', currency: 'TRY', paymentId: 'fixture', actorId: owner.id, reason: 'Pending refund fixture' } });
  await assert.rejects(rejectCreditRefundRequest(admin, order.id, { reason: 'Cannot reject active bank refund' }), { code: 'REFUND_REQUEST_NOT_ALLOWED' });
  assert.equal((await db.creditRefundRequest.findUniqueOrThrow({ where: { orderId: order.id } })).status, 'OPEN');
  await db.paymentReversal.delete({ where: { id: pending.id } });
  await rejectCreditRefundRequest(admin, order.id, { reason: 'Request reviewed and declined' });
  assert.equal((await reversalSummary(actor, order.id, false)).refundRequest?.reviewNote, 'Request reviewed and declined');
  await db.agreement.update({ where: { id: grant.id }, data: { usedCredits: 100 } });
  await assert.rejects(requestCreditRefund(actor, order.id, { reason: 'No refundable credit' }), { code: 'CUSTOMER_REFUND_REQUEST_DISABLED' });
 } finally {
  await db.paymentReversal.deleteMany({ where: { orderId: order.id } });
  await db.creditRefundRequest.deleteMany({ where: { orderId: order.id } });
  await db.creditOrder.delete({ where: { id: order.id } }); await db.agreement.delete({ where: { id: grant.id } });
  await db.activityLog.deleteMany({ where: { userId: owner.id } }); await db.notification.deleteMany({ where: { userId: owner.id } });
  await db.user.delete({ where: { id: owner.id } }); await db.$disconnect();
 }
});
