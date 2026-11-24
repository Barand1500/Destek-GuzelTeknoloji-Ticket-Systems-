import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../config/db.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { creditStoreOwner } from './credit-store.service.js';
import { billingToday } from './credit-billing.js';
import { refreshPackageStart } from './credit-package-schedule.js';
import { paymentStaff } from './payment-settings.service.js';
import { settleVerifiedCreditPayment } from './credit-subscriptions.service.js';
import { publishChange } from './events.service.js';

const requestSchema = z.object({ note: z.string().trim().max(300).optional() }).strict();
const rejectSchema = z.object({ reason: z.string().trim().max(300).optional() }).strict();

export async function requestBankTransfer(actor: Actor, orderId: string, raw: unknown) {
  const input = requestSchema.parse(raw ?? {});
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`;
    const owner = await creditStoreOwner(actor, tx);
    const order = await tx.creditOrder.findUnique({ where: { id: orderId } });
    if (!order || order.customerId !== owner.id) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
    if (!['PENDING', 'FAILED'].includes(order.status)) throw new AppError(409, 'ORDER_NOT_PENDING', 'Bu sipariş ödeme beklemiyor.');
    await refreshPackageStart(tx, order);
    if (order.periodStartsOn && order.periodStartsOn > billingToday()) throw new AppError(409, 'PAYMENT_NOT_DUE', 'Ödeme paket başlangıcında yapılabilir.');
    const last = await tx.creditPaymentAttempt.findFirst({ where: { orderId }, orderBy: { attemptNumber: 'desc' } });
    if (last?.status === 'PENDING') {
      if (last.provider === 'bank_transfer') return { attemptId: last.id, orderNumber: order.number, status: 'PENDING' as const };
      throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Önceki online ödeme sonucu bekleniyor.');
    }
    const paymentId = 'havale_' + randomUUID();
    const attempt = await tx.creditPaymentAttempt.create({
      data: {
        orderId,
        provider: 'bank_transfer',
        attemptNumber: (last?.attemptNumber ?? 0) + 1,
        providerPaymentId: paymentId,
        failureCode: input.note ? input.note.slice(0, 80) : null,
      },
    });
    await tx.creditOrder.update({ where: { id: orderId }, data: { status: 'PENDING' } });
    await tx.activityLog.create({
      data: {
        userId: owner.id,
        action: 'credit_payment.bank_transfer_requested',
        entityType: 'CreditOrder',
        entityId: orderId,
        ipAddress: actor.ipAddress,
        metadata: { orderNumber: order.number, amount: order.total.toFixed(2), currency: order.currency, ...(input.note ? { reason: input.note } : {}) },
      },
    });
    return { attemptId: attempt.id, orderNumber: order.number, status: 'PENDING' as const };
  }, { isolationLevel: 'ReadCommitted' });
  publishChange();
  return result;
}

export async function approveBankTransfer(actor: Actor, orderId: string) {
  paymentStaff(actor, true);
  const attempt = await db.creditPaymentAttempt.findFirst({
    where: { orderId, provider: 'bank_transfer', status: 'PENDING' },
    include: { order: true },
    orderBy: { attemptNumber: 'desc' },
  });
  if (!attempt) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Onay bekleyen havale talebi bulunamadı.');
  const paymentId = attempt.providerPaymentId || 'havale_' + attempt.id;
  await settleVerifiedCreditPayment({
    attemptId: attempt.id,
    provider: 'bank_transfer',
    paymentId,
    amount: attempt.order.total.toFixed(2),
    currency: attempt.order.currency,
    outcome: 'PAID',
  });
  await db.activityLog.create({
    data: {
      userId: actor.id,
      action: 'credit_payment.bank_transfer_approved',
      entityType: 'CreditOrder',
      entityId: orderId,
      ipAddress: actor.ipAddress,
      metadata: { orderNumber: attempt.order.number, amount: attempt.order.total.toFixed(2), currency: attempt.order.currency },
    },
  });
  return { success: true };
}

export async function rejectBankTransfer(actor: Actor, orderId: string, raw: unknown) {
  paymentStaff(actor, true);
  const input = rejectSchema.parse(raw ?? {});
  const attempt = await db.creditPaymentAttempt.findFirst({
    where: { orderId, provider: 'bank_transfer', status: 'PENDING' },
    include: { order: true },
    orderBy: { attemptNumber: 'desc' },
  });
  if (!attempt) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Onay bekleyen havale talebi bulunamadı.');
  const paymentId = attempt.providerPaymentId || 'havale_' + attempt.id;
  await settleVerifiedCreditPayment({
    attemptId: attempt.id,
    provider: 'bank_transfer',
    paymentId,
    amount: attempt.order.total.toFixed(2),
    currency: attempt.order.currency,
    outcome: 'FAILED',
    failureCode: 'BANK_TRANSFER_REJECTED',
  });
  await db.activityLog.create({
    data: {
      userId: actor.id,
      action: 'credit_payment.bank_transfer_rejected',
      entityType: 'CreditOrder',
      entityId: orderId,
      ipAddress: actor.ipAddress,
      metadata: { orderNumber: attempt.order.number, amount: attempt.order.total.toFixed(2), currency: attempt.order.currency, ...(input.reason ? { reason: input.reason } : {}) },
    },
  });
  return { success: true };
}
