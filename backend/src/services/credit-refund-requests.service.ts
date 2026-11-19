import { z } from 'zod';
import { db } from '../config/db.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { creditStoreOwner } from './credit-store.service.js';
import { paymentStaff } from './payment-settings.service.js';
import { publishChange } from './events.service.js';

const reasonInput = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
const denied = () => new AppError(409, 'REFUND_REQUEST_NOT_ALLOWED', 'İade edilebilir kredi bulunmuyor veya banka sonucu bekleniyor.');
/** An advisory request: no credit reservation, bank call or renewal change. */
export async function requestCreditRefund(actor: Actor, orderId: string, raw: unknown) {
 const input = reasonInput.parse(raw);
 const result = await db.$transaction(async tx => {
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`;
  const owner = await creditStoreOwner(actor, tx);
  const order = await tx.creditOrder.findUnique({ where: { id: orderId }, include: { grantedAgreement: true, refundRequest: true } });
  if (!order || order.customerId !== owner.id) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
  if (order.refundRequest?.status === 'OPEN') return order.refundRequest;
  const agreement = order.grantedAgreement;
  if (!['PAID', 'PARTIAL_REFUND'].includes(order.status) || !agreement || agreement.deletedAt || agreement.cancelledAt || agreement.customerId !== owner.id || agreement.credits <= agreement.usedCredits || await tx.paymentReversal.count({ where: { orderId, status: { in: ['PENDING', 'REVIEW'] } } })) throw denied();
  const row = await tx.creditRefundRequest.upsert({ where: { orderId }, create: { orderId, reason: input.reason }, update: { reason: input.reason, status: 'OPEN', reviewNote: null, reviewedById: null } });
  await tx.activityLog.create({ data: { userId: actor.id, action: 'credit_payment.refund_requested', entityType: 'CreditOrder', entityId: orderId, metadata: { reason: input.reason } } });
  return row;
 }, { isolationLevel: 'ReadCommitted' });
 publishChange(); return result;
}
export async function rejectCreditRefundRequest(actor: Actor, orderId: string, raw: unknown) {
 paymentStaff(actor, true);
 const input = reasonInput.parse(raw);
 await db.$transaction(async tx => {
  const order = await tx.creditOrder.findUnique({ where: { id: orderId } });
  if (!order) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${order.customerId} FOR UPDATE`;
  if (await tx.paymentReversal.count({ where: { orderId, status: { in: ['PENDING', 'REVIEW'] } } })) throw denied();
  const changed = await tx.creditRefundRequest.updateMany({ where: { orderId, status: 'OPEN' }, data: { status: 'REJECTED', reviewNote: input.reason, reviewedById: actor.id } });
  if (!changed.count) throw denied();
  await tx.notification.create({ data: { userId: order.customerId, type: 'CREDIT_REFUND_REQUEST_REJECTED', title: 'İade talebiniz yanıtlandı', message: '#' + order.number + ': ' + input.reason } });
  await tx.activityLog.create({ data: { userId: actor.id, action: 'credit_payment.refund_request_rejected', entityType: 'CreditOrder', entityId: orderId, metadata: { reason: input.reason } } });
 }, { isolationLevel: 'ReadCommitted' });
 publishChange(); return { success: true };
}
