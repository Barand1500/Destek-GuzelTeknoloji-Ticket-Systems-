import { refreshPackageStart } from './credit-package-schedule.js';
import { requestAkbankInstructionStop } from './akbank-recurring-state.js';
import { randomUUID, createHash } from 'node:crypto';
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
  akbankInstructions: { select: { state: true, failureCode: true }, orderBy: { createdAt: 'desc' as const }, take: 1 },
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
    const total = await tx.creditSubscription.count({ where });
    const rows = await tx.creditSubscription.findMany({ where, select: safeFields, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: input.limit, skip: (input.page - 1) * input.limit });
    return { data: rows.map(({ akbankInstructions, ...row }) => ({ ...row, amount: row.amount.toFixed(2), recurringState: akbankInstructions[0]?.state ?? null, recurringFailureCode: akbankInstructions[0]?.failureCode ?? null })),
      pagination: { total, page: input.page, limit: input.limit, totalPages: Math.max(1, Math.ceil(total / input.limit)) } };
  }, { isolationLevel: 'RepeatableRead' });
}
export async function changeSubscription(actor: Actor, id: string, action: 'accept' | 'stop', admin = false) {
  if (admin) { staff(actor, true); if (action === 'accept') throw new AppError(403, 'OWNER_CONSENT_REQUIRED', 'Yenilemeyi müşteri onaylamalıdır.'); }
  const owner = admin ? undefined : await creditStoreOwner(actor);
  await db.$transaction(async tx => {
    const current = await tx.creditSubscription.findUnique({ where: { id } });
    if (!current || (owner && current.customerId !== owner.id)) throw new AppError(404, 'SUBSCRIPTION_NOT_FOUND', 'Abonelik bulunamadı.');
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${current.customerId} FOR UPDATE`;
    if (!admin) await creditStoreOwner(actor, tx);
    await tx.$queryRaw`SELECT id FROM CreditSubscription WHERE id = ${id} FOR UPDATE`;
    const row = await tx.creditSubscription.findUniqueOrThrow({ where: { id } });
    if (action === 'accept') {
      if (row.status !== 'AWAITING_CONSENT') throw new AppError(409, 'SUBSCRIPTION_CHANGED', 'Bu abonelik onay beklemiyor.');
      // Late acceptance starts a new period today; never back-charge missed periods.
      const start = row.nextPaymentOn && row.nextPaymentOn > billingToday() ? row.nextPaymentOn : billingToday();
      await tx.creditSubscription.update({ where: { id }, data: { autoRenew: true, consentedAt: new Date(), status: 'AWAITING_PAYMENT', nextPaymentOn: start, anchorOn: start, anchorPeriod: row.paidPeriods } });
    } else {
      await requestAkbankInstructionStop(tx, id);
      if (!row.autoRenew && row.status === 'STOPPED') return;
      await tx.creditSubscription.update({ where: { id }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: new Date(), nextPaymentOn: null } });
      // A dispatched payment may still settle. Unsent renewal orders are cancelled.
      await tx.creditOrder.updateMany({ where: { subscriptionId: id, status: { in: ['PENDING', 'FAILED'] }, paymentAttempts: { none: { status: 'PENDING' } } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    }
    await tx.activityLog.create({ data: { userId: actor.id, action: 'subscription.' + (action === 'accept' ? 'accepted' : 'stopped'), entityType: 'CreditSubscription', entityId: id, metadata: { consentVersion: 'renewal-v1' }, ipAddress: actor.ipAddress } });
  }, { isolationLevel: 'ReadCommitted' });
  publishChange(); return { success: true };
}

/** Create a checkout order for a manually offered agreement after customer consent. */
export async function subscriptionCheckoutOrder(actor: Actor, id: string) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`;
    const owner = await creditStoreOwner(actor, tx);
    const sub = await tx.creditSubscription.findFirst({ where: { id, customerId: owner.id } });
    if (!sub || !sub.consentedAt || sub.status === 'AWAITING_CONSENT' || sub.status === 'STOPPED') throw new AppError(409, 'SUBSCRIPTION_CHANGED', 'Önce yenileme koşullarını onaylayın.');
    const existing = await tx.creditOrder.findFirst({ where: { subscriptionId: sub.id, status: { in: ['PENDING', 'FAILED'] } }, orderBy: { periodNumber: 'desc' } });
    if (existing) return { id: existing.id };
    const start = sub.nextPaymentOn && sub.nextPaymentOn > billingToday() ? sub.nextPaymentOn : billingToday();
    const end = new Date(billingBoundary(start, sub.periodMonths, sub.periodDays, 1).getTime() - dayMs);
    const latest = await tx.creditOrder.findFirst({ where: { subscriptionId: sub.id }, orderBy: { periodNumber: 'desc' } });
    const number = (latest?.periodNumber ?? sub.paidPeriods) + 1;
    const row = await tx.creditOrder.create({ data: { customerId: owner.id, requestedById: owner.id, subscriptionId: sub.id,
      periodNumber: number, requestKey: randomUUID(), inputHash: createHash('sha256').update(sub.id + ':' + number).digest('hex'),
      name: sub.name.slice(0, 100), kind: 'SUBSCRIPTION', credits: sub.credits, total: sub.amount, currency: sub.currency,
      validityDays: sub.periodDays, periodMonths: sub.periodMonths, renewalRequested: sub.autoRenew, periodStartsOn: start, periodEndsOn: end } });
    return { id: row.id };
  }, { isolationLevel: 'ReadCommitted' });
}

/** Internal seam. Provider adapter must verify authenticity BEFORE returning a result. No public settlement route. */
export type VerifiedPayment = { attemptId: string; provider: string; paymentId: string; outcome: 'PAID' | 'FAILED'; amount: string; currency: string; failureCode?: string };
export interface RecurringPaymentProvider {
  name: string;
  canDispatch?(): Promise<boolean>;
  charge(input: { attemptId: string; orderId: string; amount: string; currency: string; paymentMethodRef: string }): Promise<VerifiedPayment | null>;
  reconcile(input: { attemptId: string; orderId: string }): Promise<VerifiedPayment | null>;
}
/** Called by the future checkout adapter with a provider-issued token, never card data. */
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
    if (order.subscription && order.subscription.status === 'STOPPED') throw new AppError(409, 'SUBSCRIPTION_STOPPED', 'Abonelik yenilemesi kapatılmış.');
    if (order.subscription) {
      if (!order.subscription.consentedAt) throw new AppError(403, 'OWNER_CONSENT_REQUIRED', 'Dönemsel ödeme onayı gerekiyor.');
      await tx.creditSubscription.update({ where: { id: order.subscription.id }, data: { provider: checked.provider, paymentMethodRef: checked.paymentMethodRef } });
    }
    await refreshPackageStart(tx, order);
    if (order.periodStartsOn && order.periodStartsOn > billingToday()) return { scheduled: true as const, attemptId: null, orderId, amount: order.total.toFixed(2), currency: order.currency, paymentMethodRef: checked.paymentMethodRef, startsOn: order.periodStartsOn };
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
      if (sub?.autoRenew) await tx.creditSubscription.update({ where: { id: sub.id }, data: { status: 'PAST_DUE' } });
      await tx.notification.create({ data: { userId: order.customerId, type: 'SUBSCRIPTION_PAYMENT_FAILED', title: 'Ödeme alınamadı', message: order.name + ': yeni dönem kredisi yüklenmedi.' } });
    } else {
      if (order.periodStartsOn && order.periodStartsOn > billingToday(now)) throw new AppError(409, 'PAYMENT_NOT_DUE', 'Yeni paketin başlangıç tarihi henüz gelmedi.');
      const start = order.periodStartsOn ?? billingToday(now);
      const end = order.periodEndsOn ?? new Date(billingBoundary(start, order.periodMonths, order.validityDays, 1).getTime() - dayMs);
      if (!order.customer.isActive || order.customer.deletedAt || order.customer.parentCustomerId)
        throw new AppError(409, 'PAYMENT_REVIEW_REQUIRED', 'Ödeme alındı ancak hesap değişmiş. Kredi yüklemeden önce işlem incelenmeli.');
      const grant = await tx.agreement.create({ data: { customerId: order.customerId, name: order.name, type: order.kind === 'SUBSCRIPTION' ? 'MAINTENANCE' : 'ONE_OFF', startsOn: start, endsOn: end, fee: order.total, currency: order.currency, credits: order.credits, renewalRequested: Boolean(sub?.autoRenew) } });
      await tx.creditPaymentAttempt.update({ where: { id: latest.id }, data: { status: 'PAID', providerPaymentId: result.paymentId, completedAt: now, nextRetryAt: null } });
      await tx.creditOrder.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: now, periodStartsOn: start, periodEndsOn: end, grantedAgreementId: grant.id } });
      if (sub) {
        const anchor = sub.anchorOn ?? start;
        const paidPeriods = order.periodNumber ?? 1;
        const next = billingBoundary(anchor, sub.periodMonths, sub.periodDays, paidPeriods - sub.anchorPeriod);
        if (paidPeriods >= sub.paidPeriods) await tx.creditSubscription.update({ where: { id: sub.id }, data: { anchorOn: anchor, paidPeriods, currentStartsOn: start, currentEndsOn: end, nextPaymentOn: sub.autoRenew ? next : null, status: sub.autoRenew ? 'ACTIVE' : 'STOPPED' } });
      }
      await tx.notification.create({ data: { userId: order.customerId, type: 'SUBSCRIPTION_PAYMENT_PAID', title: 'Ödeme başarılı', message: order.name + ': ' + order.credits.toLocaleString('tr-TR') + ' kredi tanımlandı.' } });
    }
    await tx.activityLog.create({ data: { userId: order.customerId, action: 'credit_payment.' + result.outcome.toLowerCase(), entityType: 'CreditOrder', entityId: order.id, metadata: { attemptId: latest.id, provider: result.provider, paymentId: result.paymentId, amount: order.total.toFixed(2), currency: order.currency } } });
  });
  publishChange();
}

/** No configured adapter means no order dispatch, charges or credit grants. */
export async function runCreditRenewals(provider?: RecurringPaymentProvider, now = new Date()) {
  if (!provider) return { dispatched: 0 };
  let dispatched = 0;
  const reconciled = new Set<string>();
  const pending = await db.creditPaymentAttempt.findMany({ where: { provider: provider.name, status: 'PENDING', OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: now } }] }, orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }, { id: 'asc' }], take: 50, select: { id: true, orderId: true } });
  for (const attempt of pending) {
    reconciled.add(attempt.orderId);
    try {
      const result = await provider.reconcile({ attemptId: attempt.id, orderId: attempt.orderId });
      if (result) {
        if (result.attemptId !== attempt.id || result.provider !== provider.name) throw new Error('Payment adapter identity mismatch');
        await settleVerifiedCreditPayment(result, now);
      }
      dispatched++;
    } catch { console.error('[CreditRenewal] Bekleyen ödeme doğrulanamadı; yeniden sorgulanacak.', { attemptId: attempt.id }); }
    await db.creditPaymentAttempt.updateMany({ where: { id: attempt.id, status: 'PENDING' }, data: { nextRetryAt: new Date(now.getTime() + 60_000) } });
  }
  if (provider.canDispatch && !(await provider.canDispatch())) return { dispatched };
  const today = new Date(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(now) + 'T00:00:00Z');
  const due = await db.creditSubscription.findMany({ where: { OR: [{ autoRenew: true }, { status: 'AWAITING_PAYMENT', stoppedAt: null }], consentedAt: { not: null }, status: { in: ['ACTIVE', 'PAST_DUE', 'AWAITING_PAYMENT'] }, nextPaymentOn: { lte: today }, provider: provider.name, paymentMethodRef: { not: null }, customer: { isActive: true, deletedAt: null, parentCustomerId: null }, orders: { none: { OR: [{ reversals: { some: { status: { in: ['PENDING', 'REVIEW'] } } } }, { status: 'PENDING', paymentAttempts: { some: { status: 'PENDING' } } }, { status: 'FAILED', paymentAttempts: { some: { status: 'FAILED', OR: [{ attemptNumber: { gte: 3 } }, { nextRetryAt: { gt: now } }] } } }] } } }, orderBy: [{ nextPaymentOn: 'asc' }, { id: 'asc' }], take: 50, select: { id: true, customerId: true } });
  for (const candidate of due) {
    const dispatch = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${candidate.customerId} FOR UPDATE`;
      const sub = await tx.creditSubscription.findUniqueOrThrow({ where: { id: candidate.id }, include: { customer: true } });
      if ((!sub.autoRenew && sub.status !== 'AWAITING_PAYMENT') || !sub.consentedAt || !sub.nextPaymentOn || sub.nextPaymentOn > today || !sub.paymentMethodRef || sub.provider !== provider.name || sub.customer.deletedAt || !sub.customer.isActive || sub.customer.parentCustomerId) return null;
      const latestOrder = await tx.creditOrder.findFirst({ where: { subscriptionId: sub.id }, orderBy: { periodNumber: 'desc' } });
      let order = latestOrder && ['PENDING', 'FAILED'].includes(latestOrder.status) ? latestOrder : null;
      const number = order?.periodNumber ?? (latestOrder?.periodNumber ?? sub.paidPeriods) + 1;
      if (!order) {
        // After a long interruption resume today, rather than charging multiple missed periods.
        const start = sub.nextPaymentOn < today ? today : sub.nextPaymentOn;
        const resumed = sub.nextPaymentOn < today || number !== sub.paidPeriods + 1;
        const anchor = resumed ? start : sub.anchorOn ?? start;
        const anchorPeriod = resumed ? number - 1 : sub.anchorPeriod;
        const end = new Date(billingBoundary(anchor, sub.periodMonths, sub.periodDays, number - anchorPeriod).getTime() - dayMs);
        // A resumed subscription begins a fresh schedule, with its original history retained in orders.
        if (resumed) await tx.creditSubscription.update({ where: { id: sub.id }, data: { anchorOn: start, anchorPeriod: number - 1 } });
        order = await tx.creditOrder.create({ data: { customerId: sub.customerId, requestedById: sub.customerId, subscriptionId: sub.id, periodNumber: number, requestKey: randomUUID(), inputHash: createHash('sha256').update(sub.id + ':' + number).digest('hex'), name: sub.name.slice(0, 100), kind: 'SUBSCRIPTION', credits: sub.credits, total: sub.amount, currency: sub.currency, validityDays: sub.periodDays, periodMonths: sub.periodMonths, renewalRequested: true, periodStartsOn: start, periodEndsOn: end } });
        if (!sub.anchorOn) await tx.creditSubscription.update({ where: { id: sub.id }, data: { anchorOn: anchor } });
      }
      await refreshPackageStart(tx, order);
      if (order.periodStartsOn && order.periodStartsOn > today) return null;
      if (order.status === 'PAID' || order.status === 'CANCELLED' || reconciled.has(order.id)) return null;
      const last = await tx.creditPaymentAttempt.findFirst({ where: { orderId: order.id }, orderBy: { attemptNumber: 'desc' } });
      if (last?.status === 'FAILED' && (!last.nextRetryAt || last.nextRetryAt > now)) return null;
      // PENDING is reconciled with the same idempotency key, never a fresh payment.
      const attempt = last?.status === 'PENDING' ? last : await tx.creditPaymentAttempt.create({ data: { orderId: order.id, attemptNumber: (last?.attemptNumber ?? 0) + 1, provider: provider.name } });
      return { attemptId: attempt.id, orderId: order.id, amount: order.total.toFixed(2), currency: order.currency, paymentMethodRef: sub.paymentMethodRef };
    });
    if (!dispatch) continue;
    try { const result = await provider.charge(dispatch); if (result) { if (result.attemptId !== dispatch.attemptId || result.provider !== provider.name) throw new Error('Payment adapter identity mismatch'); await settleVerifiedCreditPayment(result, now); } dispatched++; }
    catch { console.error('[CreditRenewal] Ödeme sonucu doğrulanamadı; aynı işlem anahtarıyla tekrar sorgulanacak.', { attemptId: dispatch.attemptId }); }
  }
  return { dispatched };
}

export function startCreditRenewals() {
  let active: Promise<unknown> | undefined;
  const tick = () => { if (!active) active = runCreditRenewals().catch(() => console.error('[CreditRenewal] Yenileme kontrolü başarısız.')).finally(() => { active = undefined; }); };
  const timer = setInterval(tick, 60_000); timer.unref(); tick();
  return async () => { clearInterval(timer); await active; };
}
