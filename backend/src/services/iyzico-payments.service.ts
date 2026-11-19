import { randomUUID } from 'node:crypto';
import { runAkbankRecurringChecks } from './akbank-recurring.service.js';
import { z } from 'zod';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { creditStoreOwner } from './credit-store.service.js';
import { billingToday } from './credit-billing.js';
import { refreshPackageStart } from './credit-package-schedule.js';
import { sealPayment, openPayment } from './payment-secrets.js';
import { iyzicoRequest, hostedPaymentUrl, type IyzicoConfig } from './iyzico-client.js';
import { runCreditRenewals, settleVerifiedCreditPayment, type RecurringPaymentProvider, type VerifiedPayment } from './credit-subscriptions.service.js';
import { runPaymentReversalChecks } from './payment-reversals.service.js';
import { runAkbankPaymentChecks } from './akbank-payments.service.js';

export const paymentBillingInput = z.object({
  name: z.string().trim().min(2).max(80), surname: z.string().trim().min(2).max(80),
  identityNumber: z.string().regex(/^\d{11}$/, '11 haneli kimlik numarası girin.'),
  email: z.email().max(191), phone: z.string().regex(/^\+?[0-9 ]{10,18}$/, 'Geçerli telefon girin.'),
  address: z.string().trim().min(10).max(500), city: z.string().trim().min(2).max(80),
  country: z.string().trim().min(2).max(80).default('Turkey'),
  renewalConsent: z.boolean().default(false),
}).strict();
type Billing = z.infer<typeof paymentBillingInput>;
type Context = { config: IyzicoConfig; billing: Billing; ip: string; cardUserKey?: string; cardToken?: string };
const fail = (code: string, message: string) => new AppError(409, code, message);
const definitiveDeclines = new Set(['10005', '10012', '10034', '10051', '10054', '10057', '10058', '10084', '10093', '10201', '10215', '10217', '10220', '10229', '10230', '10239']);

function paymentBody(order: { id: string; customerId: string; name: string; total: { toFixed(n: number): string }; currency: string }, context: Context, attemptId: string) {
  const b = context.billing;
  return { locale: 'tr', conversationId: attemptId, basketId: order.id, price: order.total.toFixed(2), paidPrice: order.total.toFixed(2), currency: order.currency,
    paymentGroup: 'PRODUCT', paymentChannel: 'WEB',
    buyer: { id: order.customerId, name: b.name, surname: b.surname, identityNumber: b.identityNumber, email: b.email,
      gsmNumber: b.phone.replace(/ /g, ''), registrationAddress: b.address, city: b.city, country: b.country, ip: context.ip },
    billingAddress: { contactName: b.name + ' ' + b.surname, address: b.address, city: b.city, country: b.country },
    basketItems: [{ id: order.id, name: order.name, category1: 'Destek Hizmeti', itemType: 'VIRTUAL', price: order.total.toFixed(2) }],
  };
}

/** A result fetched from the fixed provider endpoint, not from the customer's browser. */
export function verifiedIyzicoResult(value: Record<string, any>, expected: { attemptId: string; orderId: string; amount: string; currency: string }): VerifiedPayment | null {
  if (value.status !== 'success' || !value.paymentId) return null;
  if (value.basketId !== expected.orderId || value.currency !== expected.currency || Number(value.installment) !== 1
    || !new Prisma.Decimal(value.price ?? -1).eq(expected.amount) || !new Prisma.Decimal(value.paidPrice ?? -1).eq(expected.amount))
    throw fail('PAYMENT_MISMATCH', 'Ödeme tutarı, sipariş veya para birimi doğrulanamadı.');
  if (value.fraudStatus === 0 || !['SUCCESS', 'FAILURE'].includes(value.paymentStatus)) return null;
  if (value.paymentStatus === 'SUCCESS' && value.fraudStatus !== 1 && value.fraudStatus !== -1) return null;
  return { attemptId: expected.attemptId, provider: 'iyzico', paymentId: String(value.paymentId), amount: expected.amount, currency: expected.currency,
    outcome: value.paymentStatus === 'SUCCESS' && value.fraudStatus === 1 ? 'PAID' : 'FAILED', failureCode: 'PAYMENT_DECLINED' };
}

export async function beginIyzicoCheckout(actor: Actor, orderId: string, raw: unknown) {
  const billing = paymentBillingInput.parse(raw);
  const session = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'default' FOR UPDATE`;
    if ((await tx.paymentGatewaySettings.findUnique({ where: { id: 'akbank' } }))?.enabled) throw fail('PAYMENT_GATEWAY_CHANGED', 'Ödeme sağlayıcısı değişti. Sayfayı yenileyin.');
    const settings = await tx.paymentGatewaySettings.findUnique({ where: { id: 'default' } });
    if (!settings?.enabled || !settings.testedAt) throw fail('PAYMENT_DISABLED', 'Online ödeme şu anda kapalı.');
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`;
    const owner = await creditStoreOwner(actor, tx);
    const order = await tx.creditOrder.findUnique({ where: { id: orderId }, include: { subscription: true } });
    if (!order || order.customerId !== owner.id) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
    if (!['PENDING', 'FAILED'].includes(order.status)) throw fail('ORDER_NOT_PENDING', 'Bu sipariş ödeme beklemiyor.');
    await refreshPackageStart(tx, order);
    if (order.periodStartsOn && order.periodStartsOn > billingToday()) throw fail('PAYMENT_NOT_DUE', 'Ödeme yeni paketin başlangıç tarihinde yapılabilir. Mevcut döneminiz korunuyor.');
    if (order.subscription?.status === 'STOPPED') throw fail('SUBSCRIPTION_STOPPED', 'Bu aboneliğin yenilemesi kapatılmış.');
    if (order.subscription?.autoRenew && (!settings.recurringEnabled || !billing.renewalConsent)) throw fail('RENEWAL_CONSENT_REQUIRED', 'Otomatik yenileme için saklı karttan tahsilatı onaylayın veya yenilemesiz paket seçin.');
    const last = await tx.creditPaymentAttempt.findFirst({ where: { orderId }, orderBy: { attemptNumber: 'desc' } });
    if (last?.status === 'PENDING') {
      const existing = await tx.paymentCheckoutSession.findUnique({ where: { attemptId: last.id } });
      if (existing?.state === 'READY' && existing.expiresAt > new Date()) return { ...existing, reused: true as const };
      throw fail('PAYMENT_IN_PROGRESS', 'Ödeme sonucu kontrol ediliyor. Yeni çekim başlatılmadı; siparişlerinizi kontrol edin.');
    }
    const attempt = await tx.creditPaymentAttempt.create({ data: { orderId, attemptNumber: (last?.attemptNumber ?? 0) + 1, provider: 'iyzico' } });
    await tx.creditOrder.update({ where: { id: orderId }, data: { status: 'PENDING' } });
    const context: Context = { config: openPayment<IyzicoConfig>(settings.credentialsCiphertext), billing, ip: actor.ipAddress || '127.0.0.1' };
    const created = await tx.paymentCheckoutSession.create({ data: { attemptId: attempt.id, orderId, customerId: owner.id, contextCiphertext: sealPayment(context), expiresAt: new Date(Date.now() + 35 * 60_000) } });
    return { ...created, reused: false as const, context, order, publicUrl: settings.publicUrl };
  }, { isolationLevel: 'ReadCommitted' });
  if (session.reused) return { paymentUrl: session.paymentUrl };
  // The unique persisted attempt is the only initialization claim across processes.
  const context = session.context!, order = session.order!;
  try {
    const result = await iyzicoRequest(context.config, '/payment/iyzipos/checkoutform/initialize/auth/ecom', {
      ...paymentBody(order, context, session.attemptId), enabledInstallments: [1], forceThreeDS: true,
      callbackUrl: session.publicUrl + '/api/v1/payments/iyzico/callback/' + session.id,
    });
    if (result.status !== 'success' || typeof result.token !== 'string') {
      await db.paymentCheckoutSession.update({ where: { id: session.id }, data: { state: 'FAILED' } });
      await settleVerifiedCreditPayment({ attemptId: session.attemptId, provider: 'iyzico', paymentId: 'init_' + session.id, amount: order.total.toFixed(2), currency: order.currency, outcome: 'FAILED', failureCode: 'CHECKOUT_INIT_FAILED' });
      throw new AppError(400, 'CHECKOUT_INIT_FAILED', 'Ödeme sayfası oluşturulamadı. Hesap, para birimi ve alıcı bilgilerini kontrol edin.');
    }
    const paymentUrl = hostedPaymentUrl(result.paymentPageUrl, context.config.mode);
    await db.paymentCheckoutSession.update({ where: { id: session.id }, data: { token: result.token, paymentUrl, state: 'READY' } });
    return { paymentUrl };
  } catch (error) {
    // No URL was delivered after an ambiguous initialization. Recovery never repeats a charge.
    await db.paymentCheckoutSession.updateMany({ where: { id: session.id, state: 'INITIALIZING' }, data: { state: 'INIT_UNKNOWN' } });
    throw error;
  }
}

async function resultForSession(id: string): Promise<VerifiedPayment | null> {
  const session = await db.paymentCheckoutSession.findUnique({ where: { id } });
  if (!session) return null;
  const attempt = await db.creditPaymentAttempt.findUnique({ where: { id: session.attemptId }, include: { order: { include: { subscription: true } } } });
  if (!attempt || attempt.status !== 'PENDING') return null;
  const context = openPayment<Context>(session.contextCiphertext);
  const order = attempt.order;
  // A checkout token is bound to one locally persisted session; callbacks cannot choose amount or order.
  const result = session.token
    ? await iyzicoRequest(context.config, '/payment/iyzipos/checkoutform/auth/ecom/detail', { locale: 'tr', token: session.token })
    : await iyzicoRequest(context.config, '/payment/detail', { locale: 'tr', paymentConversationId: attempt.id });
  const expected = { attemptId: attempt.id, orderId: order.id, amount: order.total.toFixed(2), currency: order.currency };
  let verified = verifiedIyzicoResult(result, expected);
  if (!verified && result.status === 'failure' && definitiveDeclines.has(String(result.errorCode))) {
    verified = { ...expected, provider: 'iyzico', paymentId: 'declined_' + session.id, outcome: 'FAILED', failureCode: String(result.errorCode) };
  }
  if (!verified && !session.token && result.status === 'failure' && session.expiresAt < new Date() && ['INITIALIZING', 'INIT_UNKNOWN'].includes(session.state)) {
    verified = { ...expected, provider: 'iyzico', paymentId: 'expired_' + session.id, outcome: 'FAILED', failureCode: 'CHECKOUT_EXPIRED' };
  }
  if (verified?.outcome === 'PAID' && order.subscription?.autoRenew && context.billing.renewalConsent) {
    if (typeof result.cardUserKey === 'string' && typeof result.cardToken === 'string') {
      // Deterministic reference makes duplicate callbacks idempotent; only encrypted provider tokens are persisted.
      const methodId = session.id;
      await db.paymentStoredMethod.upsert({ where: { id: methodId }, create: { id: methodId, customerId: order.customerId, contextCiphertext: sealPayment({ ...context, cardUserKey: result.cardUserKey, cardToken: result.cardToken }) }, update: {} });
      await db.creditSubscription.updateMany({ where: { id: order.subscription.id, autoRenew: true, status: { not: 'STOPPED' } }, data: { provider: 'iyzico', paymentMethodRef: methodId } });
    } else if (!context.cardToken) {
      // A successful first purchase stays paid even if the account did not provide merchant card-storage tokens.
      const changed = await db.creditSubscription.updateMany({ where: { id: order.subscription.id, autoRenew: true }, data: { autoRenew: false, nextPaymentOn: null } });
      if (changed.count) await db.notification.create({ data: { userId: order.customerId, type: 'CREDIT_RENEWAL_UNAVAILABLE', title: 'Otomatik yenileme kurulamadı', message: 'Ödemeniz alındı. Kart saklama referansı gelmediği için sonraki dönem otomatik çekilmeyecek.' } });
    }
  }
  return verified;
}
export async function reconcileIyzicoSession(id: string) {
  const result = await resultForSession(id);
  if (result) {
    await settleVerifiedCreditPayment(result);
    await db.paymentCheckoutSession.update({ where: { id }, data: { state: result.outcome === 'PAID' ? 'PAID' : 'FAILED' } });
  }
  return result;
}
export async function iyzicoCallback(sessionId: string, token: unknown) {
  const session = await db.paymentCheckoutSession.findUnique({ where: { id: z.uuid().parse(sessionId) } });
  if (!session || typeof token !== 'string' || session.token !== token) throw new AppError(400, 'PAYMENT_CALLBACK_INVALID', 'Ödeme bildirimi doğrulanamadı.');
  await reconcileIyzicoSession(session.id);
  return new URL('/customer/agreements?view=orders', env.FRONTEND_URL).toString();
}

export const iyzicoRecurringProvider: RecurringPaymentProvider = {
  name: 'iyzico',
  async canDispatch() {
    const settings = await db.paymentGatewaySettings.findUnique({ where: { id: 'default' } });
    return Boolean(settings?.enabled && settings.recurringEnabled && settings.testedAt);
  },
  async reconcile({ attemptId }) {
    const session = await db.paymentCheckoutSession.findUnique({ where: { attemptId } });
    if (session) return resultForSession(session.id);
    // The process may stop after the ledger attempt is committed but before dispatch claims a session.
    const attempt = await db.creditPaymentAttempt.findUnique({ where: { id: attemptId }, include: { order: { include: { subscription: true } } } });
    if (!attempt?.order.subscription?.paymentMethodRef) return null;
    return this.charge({ attemptId, orderId: attempt.orderId, amount: attempt.order.total.toFixed(2), currency: attempt.order.currency, paymentMethodRef: attempt.order.subscription.paymentMethodRef });
  },
  async charge(input) {
    const existing = await db.paymentCheckoutSession.findUnique({ where: { attemptId: input.attemptId } });
    if (existing) return resultForSession(existing.id);
    const dispatch = await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'default' FOR UPDATE`;
      const settings = await tx.paymentGatewaySettings.findUnique({ where: { id: 'default' } });
      if (!settings?.enabled || !settings.recurringEnabled || !settings.testedAt) return null;
      const candidate = await tx.creditOrder.findUniqueOrThrow({ where: { id: input.orderId } });
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${candidate.customerId} FOR UPDATE`;
      const order = await tx.creditOrder.findUniqueOrThrow({ where: { id: input.orderId }, include: { subscription: true, customer: true } });
      const method = await tx.paymentStoredMethod.findUnique({ where: { id: input.paymentMethodRef } });
      const attempt = await tx.creditPaymentAttempt.findUniqueOrThrow({ where: { id: input.attemptId } });
      if (attempt.status !== 'PENDING' || attempt.orderId !== order.id) return null;
      if (order.subscriptionId && await tx.paymentReversal.count({ where: { order: { subscriptionId: order.subscriptionId }, status: { in: ['PENDING', 'REVIEW'] } } })) return null;
      if (!method || method.customerId !== order.customerId || !order.subscription?.autoRenew || order.subscription.status === 'STOPPED' || !order.customer.isActive || order.customer.deletedAt || order.customer.parentCustomerId) return { cancelled: true as const };
      const context = openPayment<Context>(method.contextCiphertext);
      if (!context.cardToken || !context.cardUserKey || !context.billing.renewalConsent) return { cancelled: true as const };
      const claim = await tx.paymentCheckoutSession.createMany({ skipDuplicates: true, data: [{ id: randomUUID(), attemptId: input.attemptId, orderId: order.id, customerId: order.customerId, contextCiphertext: method.contextCiphertext, state: 'DISPATCHED', claimedAt: new Date(), expiresAt: new Date(Date.now() + 35 * 60_000) }] });
      if (!claim.count) return null;
      return { cancelled: false as const, context, order };
    }, { isolationLevel: 'ReadCommitted' });
    if (!dispatch) return null;
    if (dispatch.cancelled) return { attemptId: input.attemptId, provider: 'iyzico', paymentId: 'unsent_' + input.attemptId, amount: input.amount, currency: input.currency, outcome: 'FAILED', failureCode: 'RENEWAL_NOT_AUTHORIZED' };
    const { context, order } = dispatch;
    const result = await iyzicoRequest(context.config, '/payment/auth', { ...paymentBody(order, context, input.attemptId), installment: 1, paymentCard: { cardUserKey: context.cardUserKey, cardToken: context.cardToken } });
    if (result.status === 'failure') {
      // A provider/bank timeout is not proof that the card was not charged.
      if (!definitiveDeclines.has(String(result.errorCode))) return null;
      return { attemptId: input.attemptId, provider: 'iyzico', paymentId: 'declined_' + input.attemptId, amount: input.amount, currency: input.currency, outcome: 'FAILED', failureCode: String(result.errorCode).slice(0, 80) };
    }
    return verifiedIyzicoResult(result, { ...input, amount: order.total.toFixed(2) });
  },
};
export function startIyzicoPayments() {
  let active: Promise<unknown> | undefined;
  const tick = () => { if (!active) active = (async () => { await runCreditRenewals(iyzicoRecurringProvider); await runAkbankPaymentChecks(); await runPaymentReversalChecks(); await runAkbankRecurringChecks(); })().catch(() => console.error('[Payments] Ödeme kontrolü tamamlanamadı.')).finally(() => { active = undefined; }); };
  const timer = setInterval(tick, 60_000); timer.unref(); tick();
  return async () => { clearInterval(timer); await active; };
}
