import { z } from 'zod';
import { db } from '../config/db.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { paymentStaff } from './payment-settings.service.js';
import { publishChange } from './events.service.js';

const reasonInput = z.object({ reason: z.string().trim().min(3).max(500) }).strict();
const denied = () => new AppError(409, 'REFUND_REQUEST_NOT_ALLOWED', 'İade edilebilir kredi bulunmuyor veya banka sonucu bekleniyor.');
/** Retired customer endpoint: older clients cannot create new requests. */
export async function requestCreditRefund(_actor: Actor, _orderId: string, _raw: unknown): Promise<never> {
 throw new AppError(403, 'CUSTOMER_REFUND_REQUEST_DISABLED', 'Müşteri panelinden iade talebi oluşturulamaz.');
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
