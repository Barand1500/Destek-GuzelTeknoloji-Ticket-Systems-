import { z } from 'zod';
import { db } from '../config/db.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { paymentStaff } from './payment-settings.service.js';
import { reconcileIyzicoSession } from './iyzico-payments.service.js';
import { reconcileAkbankSession } from './akbank-payments.service.js';

export async function pendingPaymentReviews(actor: Actor) {
  paymentStaff(actor);
  const where = { provider: { in: ['iyzico', 'akbank'] }, status: 'PENDING', createdAt: { lte: new Date(Date.now() - 15 * 60_000) } };
  const [total, data] = await Promise.all([db.creditPaymentAttempt.count({ where }), db.creditPaymentAttempt.findMany({ where, take: 50, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    select: { id: true, createdAt: true, order: { select: { number: true, name: true, total: true, currency: true } } } })]);
  return { total, data: data.map(v => ({ ...v, order: { ...v.order, total: v.order.total.toFixed(2) } })) };
}
export async function checkPaymentReview(actor: Actor, id: string) {
  paymentStaff(actor, true);
  const session = await db.paymentCheckoutSession.findUnique({ where: { attemptId: id } });
  const attempt = await db.creditPaymentAttempt.findUnique({ where: { id } });
  if (session) { if (attempt?.provider === 'akbank') await reconcileAkbankSession(session.id); else await reconcileIyzicoSession(session.id); }
  return { message: 'Sağlayıcı sonucu sorgulandı. Belirsiz işlemler yeniden çekilmez.' };
}

/** Explicit operator recovery for an ambiguous transport/crash, after external merchant confirmation. */
export async function closeUnchargedPayment(actor: Actor, id: string, raw: unknown) {
  paymentStaff(actor, true);
  const input = z.object({ confirmedNoCharge: z.literal(true), providerReference: z.string().trim().min(10).max(500) }).strict().parse(raw);
  try { await checkPaymentReview(actor, id); }
  catch (error) { if (!(error instanceof AppError) || !['PAYMENT_UNCERTAIN', 'PAYMENT_KEY_UNAVAILABLE'].includes(error.code)) throw error; }
  return db.$transaction(async tx => {
    const initial = await tx.creditPaymentAttempt.findUniqueOrThrow({ where: { id }, include: { order: true } });
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${initial.order.customerId} FOR UPDATE`;
    const row = await tx.creditPaymentAttempt.findUniqueOrThrow({ where: { id } });
    const order = await tx.creditOrder.findUniqueOrThrow({ where: { id: initial.orderId } });
    const latest = await tx.creditPaymentAttempt.findFirst({ where: { orderId: order.id }, orderBy: { attemptNumber: 'desc' } });
    if (!['iyzico', 'akbank'].includes(row.provider) || row.status !== 'PENDING' || row.createdAt.getTime() > Date.now() - 60 * 60_000)
      throw new AppError(409, 'PAYMENT_REVIEW_CHANGED', 'Yalnızca en az bir saattir belirsiz kalan ödemeler kapatılabilir.');
    if (latest?.id !== id || !['PENDING', 'FAILED'].includes(order.status) || order.grantedAgreementId)
      throw new AppError(409, 'PAYMENT_REVIEW_CHANGED', 'Siparişin ödeme sonucu değişmiş. Ödenmiş veya iptal edilmiş sipariş yeniden açılamaz.');
    await tx.creditPaymentAttempt.update({ where: { id }, data: { status: 'FAILED', failureCode: 'MANUAL_NO_CHARGE', completedAt: new Date(), nextRetryAt: null } });
    await tx.creditOrder.update({ where: { id: initial.orderId }, data: { status: 'FAILED' } });
    if (initial.order.subscriptionId) await tx.creditSubscription.updateMany({ where: { id: initial.order.subscriptionId, autoRenew: true }, data: { status: 'PAST_DUE' } });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'payments.confirmed_no_charge', entityType: 'CreditPaymentAttempt', entityId: id, ipAddress: actor.ipAddress, metadata: { providerReference: input.providerReference, orderId: initial.orderId } } });
    return { message: 'Tahsilat yapılmadığı yönetici doğrulamasıyla kaydedildi. Otomatik tekrar başlatılmaz; müşteri yeniden ödeme yapabilir.' };
  }, { isolationLevel: 'ReadCommitted' });
}
