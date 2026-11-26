import { refreshPackageStart } from './credit-package-schedule.js';
import { requestAkbankInstructionStop } from './akbank-recurring-state.js';
import { z } from 'zod';
import { db } from '../config/db.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { can } from './permissions.js';
import { creditStoreOwner } from './credit-store.service.js';
import { paginationSchema } from '../validators/index.js';
import { publishChange } from './events.service.js';

import { billingBoundary, billingToday } from './credit-billing.js';
export { billingBoundary, billingToday } from './credit-billing.js';
const dayMs = 86_400_000;
export const subscriptionListInput = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).default(''),
  displayStatus: z.enum(['active', 'stopped', 'pending', 'awaiting_payment', 'failed', 'refunded', 'partial_refund', 'cancelled']).optional(),
  status: z.enum(['AWAITING_CONSENT', 'AWAITING_PAYMENT', 'ACTIVE', 'PAST_DUE', 'STOPPED']).optional(),
});
function staff(actor: Actor, edit = false) {
  if (actor.role === 'CUSTOMER' || !can(actor, edit ? 'integrations.update' : 'integrations.view'))
    throw new AppError(403, 'FORBIDDEN', 'Abonelikleri yönetme yetkiniz yok.');
}
const safeFields = {
  id: true, customerId: true, sourceAgreementId: true, name: true, amount: true, currency: true,
  credits: true, periodMonths: true, periodDays: true, status: true, autoRenew: true,
  consentedAt: true, currentStartsOn: true, currentEndsOn: true, nextPaymentOn: true, stoppedAt: true,
  customer: { select: { name: true, company: true } }, createdAt: true,
  orders: { where: { paidAt: { not: null } }, select: { status: true }, orderBy: { paidAt: 'desc' as const }, take: 1 },
} as const;
export async function listSubscriptions(actor: Actor, input: z.infer<typeof subscriptionListInput>, admin = false) {
  const owner = admin ? (staff(actor), undefined) : await creditStoreOwner(actor);
  const where: Prisma.CreditSubscriptionWhereInput = {
    ...(owner ? { customerId: owner.id } : {}), ...(input.status ? { status: input.status } : {}),
    ...(input.search ? { OR: [{ name: { contains: input.search } }, ...(admin ? [
      { customer: { name: { contains: input.search } } }, { customer: { company: { contains: input.search } } },
    ] : [])] } : {}),
  };
  return db.$transaction(async tx => {
    if (input.displayStatus) {
      // Package state differs from the retired renewal state stored on subscriptions.
      const today = billingToday();
      const candidates = await tx.creditSubscription.findMany({ where, select: safeFields });
      where.id = { in: candidates.filter(row => {
        const orderStatus = row.orders[0]?.status;
        const state = orderStatus === 'REFUNDED' ? 'refunded' : orderStatus === 'PARTIAL_REFUND' ? 'partial_refund'
          : !row.currentEndsOn && orderStatus === 'CANCELLED' ? 'cancelled'
          : !row.currentEndsOn && orderStatus === 'FAILED' ? 'failed'
          : row.currentStartsOn && row.currentStartsOn > today ? 'pending'
          : row.currentEndsOn ? (row.currentEndsOn < today ? 'stopped' : 'active')
          : ({ ACTIVE: 'active', STOPPED: 'stopped', PAST_DUE: 'failed', AWAITING_CONSENT: 'awaiting_payment', AWAITING_PAYMENT: 'awaiting_payment' } as const)[row.status];
        return state === input.displayStatus;
      }).map(row => row.id) };
    }
    const total = await tx.creditSubscription.count({ where });
    const rows = await tx.creditSubscription.findMany({ where, select: safeFields, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit, skip: (input.page - 1) * input.limit });
    return { data: rows.map(({ orders, ...row }) => ({ ...row, lastOrderStatus: orders[0]?.status ?? null, autoRenew: false, nextPaymentOn: null, amount: row.amount.toFixed(2), recurringState: null, recurringFailureCode: null })),
      pagination: { total, page: input.page, limit: input.limit, totalPages: Math.max(1, Math.ceil(total / input.limit)) } };
  }, { isolationLevel: 'RepeatableRead' });
}
export async function changeSubscription(actor: Actor, id: string, action: 'accept' | 'stop', admin = false) {
  if (!admin) throw new AppError(403, 'CUSTOMER_CANCELLATION_DISABLED', 'Abonelik işlemlerini yalnızca yönetici yapabilir.');
  if (action === 'accept') throw new AppError(410, 'RENEWAL_DISABLED', 'Otomatik yenileme kaldırıldı. Bu işlem kullanılamıyor.');
  if (admin) staff(actor, true);
  const owner = admin ? undefined : await creditStoreOwner(actor);
  await db.$transaction(async tx => {
    const current = await tx.creditSubscription.findUnique({ where: { id } });
    if (!current || (owner && current.customerId !== owner.id)) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Abonelik bulunamadı.');
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${current.customerId} FOR UPDATE`;
    if (!admin) await creditStoreOwner(actor, tx);
    await tx.$queryRaw`SELECT id FROM CreditSubscription WHERE id = ${id} FOR UPDATE`;
    const row = await tx.creditSubscription.findUniqueOrThrow({ where: { id } });
    {
      await requestAkbankInstructionStop(tx, id);
      if (!row.autoRenew && row.status === 'STOPPED') return;
      await tx.creditSubscription.update({ where: { id }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: new Date(), nextPaymentOn: null } });
      // A dispatched payment may still settle. Unsent renewal orders are cancelled.
      await tx.creditOrder.updateMany({ where: { subscriptionId: id, status: { in: ['PENDING', 'FAILED'] }, paymentAttempts: { none: { status: 'PENDING' } } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    }
    await tx.activityLog.create({ data: { userId: actor.id, action: 'subscription.stopped', entityType: 'CreditSubscription', entityId: id, metadata: { consentVersion: 'renewal-v1' }, ipAddress: actor.ipAddress } });
  }, { isolationLevel: 'ReadCommitted' });
  publishChange(); return { success: true };
}

/** Create a checkout order for a manually offered agreement after customer consent. */
export async function subscriptionCheckoutOrder(actor: Actor, id: string) {
  void actor; void id;
  throw new AppError(410, 'RENEWAL_DISABLED', 'Otomatik yenileme kaldırıldı. Bu işlem kullanılamıyor.');
}

/** Internal seam. Provider adapter must verify authenticity BEFORE returning a result. No public settlement route. */
export type VerifiedPayment = { attemptId: string; provider: string; paymentId: string; outcome: 'PAID' | 'FAILED'; amount: string; currency: string; failureCode?: string };
export interface RecurringPaymentProvider {
  name: string;
  canDispatch?(): Promise<boolean>;
  charge(input: { attemptId: string; orderId: string; amount: string; currency: string; paymentMethodRef: string }): Promise<VerifiedPayment | null>;
  reconcile(input: { attemptId: string; orderId: string }): Promise<VerifiedPayment | null>;
}
/** Internal one-time checkout seam. The reference is not stored for future charges. */
export async function prepareCreditCheckoutPayment(actor: Actor, orderId: string, method: { provider: string; paymentMethodRef: string }) {
  const checked = z.object({ provider: z.string().regex(/^[a-zA-Z0-9_-]{1,32}$/), paymentMethodRef: z.string().min(1).max(255) }).strict().parse(method);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`;
    const owner = await creditStoreOwner(actor, tx);
    const order = await tx.creditOrder.findUnique({ where: { id: orderId }, include: { subscription: true } });
    if (!order || order.customerId !== owner.id) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
    if (order.status !== 'PENDING') throw new AppError(409, 'ORDER_NOT_PENDING', 'Bu sipariş ödeme beklemiyor.');
    await refreshPackageStart(tx, order);
    const last = await tx.creditPaymentAttempt.findFirst({ where: { orderId }, orderBy: { attemptNumber: 'desc' } });
    if (last && last.provider !== checked.provider) throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Ödeme sağlayıcısı işlem sırasında değiştirilemez.');
    if (last && last.status !== 'PENDING') throw new AppError(409, 'PAYMENT_CHANGED', 'Ödeme sonucu değişti. Siparişi yenileyin.');
    await refreshPackageStart(tx, order);
    if (order.periodStartsOn && order.periodStartsOn > billingToday()) throw new AppError(409, 'PAYMENT_NOT_DUE', 'Ödeme paketin başlangıç tarihinde yapılabilir.');
    const attempt = last ?? await tx.creditPaymentAttempt.create({ data: { orderId, attemptNumber: 1, provider: checked.provider } });
    return { attemptId: attempt.id, orderId, amount: order.total.toFixed(2), currency: order.currency, paymentMethodRef: checked.paymentMethodRef };
  });
}
export async function settleVerifiedCreditPayment(result: VerifiedPayment, now = new Date()) {
  const attempt = await db.creditPaymentAttempt.findUnique({ where: { id: result.attemptId }, include: { order: true } });
  if (!attempt) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Ödeme denemesi bulunamadı.');
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${attempt.order.customerId} FOR UPDATE`;
    const order = await tx.creditOrder.findUniqueOrThrow({ where: { id: attempt.orderId }, include: { subscription: true, customer: true } });
    const latest = await tx.creditPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    if (latest.provider !== result.provider || !result.paymentId || !order.total.eq(result.amount) || order.currency !== result.currency)
      throw new AppError(409, 'PAYMENT_MISMATCH', 'Ödeme kimliği, tutarı veya para birimi eşleşmiyor.');
    if (latest.providerPaymentId && latest.providerPaymentId !== result.paymentId) throw new AppError(409, 'PAYMENT_MISMATCH', 'Ödeme kimliği değişti.');
    if (order.paidAt || order.grantedAgreementId || ['PAID', 'PARTIAL_REFUND', 'REFUNDED'].includes(order.status)) return;
    if (latest.status === 'FAILED' && result.outcome === 'FAILED') return;
    const sub = order.subscription;
    if (result.outcome === 'FAILED') {
      // Ignore late failure from an older attempt after a newer attempt was dispatched.
      if (await tx.creditPaymentAttempt.count({ where: { orderId: order.id, attemptNumber: { gt: latest.attemptNumber } } })) return;
      await tx.creditPaymentAttempt.update({ where: { id: latest.id }, data: { status: 'FAILED', providerPaymentId: result.paymentId, failureCode: result.failureCode?.slice(0, 80) ?? 'PAYMENT_FAILED', completedAt: now, nextRetryAt: latest.attemptNumber < 3 ? new Date(now.getTime() + (latest.attemptNumber === 1 ? 1 : 3) * dayMs) : null } });
      await tx.creditOrder.update({ where: { id: order.id }, data: { status: 'FAILED' } });
      if (sub) await tx.creditSubscription.update({ where: { id: sub.id }, data: { autoRenew: false, status: 'STOPPED', nextPaymentOn: null } });
      await tx.notification.create({ data: { userId: order.customerId, type: 'SUBSCRIPTION_PAYMENT_FAILED', title: 'Ödeme alınamadı', message: order.name + ': yeni dönem kredisi yüklenmedi.' } });
    } else {
      if (order.periodStartsOn && order.periodStartsOn > billingToday(now)) throw new AppError(409, 'PAYMENT_NOT_DUE', 'Yeni paketin başlangıç tarihi henüz gelmedi.');
      const start = order.periodStartsOn ?? billingToday(now);
      const end = order.periodEndsOn ?? new Date(billingBoundary(start, order.periodMonths, order.validityDays, 1).getTime() - dayMs);
      if (!order.customer.isActive || order.customer.deletedAt || order.customer.parentCustomerId)
        throw new AppError(409, 'PAYMENT_REVIEW_REQUIRED', 'Ödeme alındı ancak hesap değişmiş. Kredi yüklemeden önce işlem incelenmeli.');
      const grant = await tx.agreement.create({ data: { customerId: order.customerId, name: order.name, type: order.kind === 'SUBSCRIPTION' ? 'MAINTENANCE' : 'ONE_OFF', startsOn: start, endsOn: end, fee: order.total, currency: order.currency, credits: order.credits, renewalRequested: false } });
      await tx.creditPaymentAttempt.update({ where: { id: latest.id }, data: { status: 'PAID', providerPaymentId: result.paymentId, completedAt: now, nextRetryAt: null } });
      await tx.creditOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: now, periodStartsOn: start, periodEndsOn: end, grantedAgreementId: grant.id } });
      if (sub) {
        const anchor = sub.anchorOn ?? start;
        const paidPeriods = order.periodNumber ?? 1;

        if (paidPeriods >= sub.paidPeriods) await tx.creditSubscription.update({ where: { id: sub.id }, data: { anchorOn: anchor, paidPeriods, currentStartsOn: start, currentEndsOn: end, autoRenew: false, nextPaymentOn: null, status: 'STOPPED' } });
      }
      await tx.notification.create({ data: { userId: order.customerId, type: 'SUBSCRIPTION_PAYMENT_PAID', title: 'Ödeme başarılı', message: order.name + ': ' + order.credits.toLocaleString('tr-TR') + ' kredi tanımlandı.' } });
    }
    await tx.activityLog.create({ data: { userId: order.customerId, action: 'credit_payment.' + result.outcome.toLowerCase(), entityType: 'CreditOrder', entityId: order.id, metadata: { attemptId: latest.id, orderNumber: order.number, provider: result.provider, paymentId: result.paymentId, amount: order.total.toFixed(2), currency: order.currency } } });
  });
  publishChange();
}

export function nextPaymentInquiryAt(createdAt: Date, previousNextRetryAt: Date | null, now: Date) {
  const ageMs = now.getTime() - createdAt.getTime();
  // Bounded automatic inquiries at ~5m, ~15m, and ~30m; stop permanently after that.
  if (previousNextRetryAt === null && ageMs < 25 * 60_000) return new Date(now.getTime() + 10 * 60_000);
  if (ageMs < 25 * 60_000) return new Date(now.getTime() + 15 * 60_000);
  return new Date(createdAt.getTime() + 2 * 60 * 60_000);
}

/** Reconcile existing attempts only. Never create an order or dispatch a charge. */
export async function runCreditRenewals(provider?: RecurringPaymentProvider, now = new Date()) {
  if (!provider) return { dispatched: 0 };
  let dispatched = 0;

  const pending = await db.creditPaymentAttempt.findMany({
    where: {
      provider: provider.name,
      status: 'PENDING',
      OR: [
        { nextRetryAt: null, createdAt: { lte: new Date(now.getTime() - 5 * 60_000) } },
        { nextRetryAt: { lte: now }, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } },
      ],
    },
    orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }],
    take: 50,
    select: { id: true, orderId: true, createdAt: true, nextRetryAt: true },
  });
  for (const attempt of pending) {
    const claimed = await db.creditPaymentAttempt.updateMany({
      where: { id: attempt.id, status: 'PENDING', nextRetryAt: attempt.nextRetryAt },
      data: { nextRetryAt: nextPaymentInquiryAt(attempt.createdAt, attempt.nextRetryAt, now) },
    });
    if (!claimed.count) continue;
    try {
      const result = await provider.reconcile({ attemptId: attempt.id, orderId: attempt.orderId });
      if (result) {
        if (result.attemptId !== attempt.id || result.provider !== provider.name) throw new Error('Payment adapter identity mismatch');
        await settleVerifiedCreditPayment(result, now);
      }
      dispatched++;
    } catch { console.error('[CreditRenewal] Bekleyen ödeme doğrulanamadı; yeniden sorgulanacak.', { attemptId: attempt.id }); }
  }
  return { dispatched };
}
