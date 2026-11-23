import { z } from 'zod';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { creditStoreOwner } from './credit-store.service.js';
import { billingToday } from './credit-billing.js';
import { refreshPackageStart } from './credit-package-schedule.js';
import { renewalPreference } from './credit-store-pricing.js';
import { openPayment, sealPayment } from './payment-secrets.js';
import { akbankCardInput } from './akbank-client.js';
import { akbankInstructionTerminal } from './akbank-recurring-state.js';
import { nextPaymentInquiryAt, settleVerifiedCreditPayment } from './credit-subscriptions.service.js';
import { getNestpayBank, nestpayProviderIds } from './payment-gateways.catalog.js';
import { nestpayCurrency, nestpayForm, nestpayInquireOrder, nestpaySaleResult, verifyNestpayCallback, type NestpayConfig } from './nestpay-client.js';

const inputSchema = z.object({ card: akbankCardInput, manualRenewalConsent: z.boolean().default(false), renewalConsent: renewalPreference.default(false) }).strict();
const failed3dStatuses = new Set(['0', '5', '6', '7', '8']);
const declineCodes = new Set(['05', '14', '33', '41', '43', '51', '54', '57', '58', '62', '65', '99']);

export async function beginNestpayCheckout(actor: Actor, bankId: string, orderId: string, raw: unknown) {
  const bank = getNestpayBank(bankId);
  if (!bank) throw new AppError(400, 'PAYMENT_PROVIDER_INVALID', 'Desteklenmeyen banka sağlayıcısı.');
  const input = inputSchema.parse(raw);
  const prepared = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'default' FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = ${bank.id} FOR UPDATE`;
    const settings = await tx.paymentGatewaySettings.findUnique({ where: { id: bank.id } });
    if (!settings?.enabled || !settings.testedAt) throw new AppError(409, 'PAYMENT_DISABLED', `${bank.shortName} online ödeme kapalı.`);
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`;
    const owner = await creditStoreOwner(actor, tx);
    const order = await tx.creditOrder.findUnique({ where: { id: orderId }, include: { subscription: true, customer: true } });
    if (!order || order.customerId !== owner.id) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
    if (!['PENDING', 'FAILED'].includes(order.status)) throw new AppError(409, 'ORDER_NOT_PENDING', 'Sipariş ödeme beklemiyor.');
    if (!nestpayCurrency[order.currency]) throw new AppError(400, 'PAYMENT_CURRENCY_UNSUPPORTED', `Bu para birimi ${bank.shortName} için desteklenmiyor.`);
    await refreshPackageStart(tx, order);
    if (order.periodStartsOn && order.periodStartsOn > billingToday()) throw new AppError(409, 'PAYMENT_NOT_DUE', 'Ödeme paket başlangıcında yapılabilir.');
    if (order.kind === 'SUBSCRIPTION' && await tx.akbankRecurringInstruction.count({ where: { subscription: { customerId: owner.id }, state: { notIn: akbankInstructionTerminal } } })) {
      throw new AppError(409, 'BANK_CANCELLATION_PENDING', 'Önceki paketin bankadaki yenileme iptali bekleniyor. İptal doğrulanınca ödeme yapabilirsiniz.');
    }
    const last = await tx.creditPaymentAttempt.findFirst({ where: { orderId }, orderBy: { attemptNumber: 'desc' } });
    if (last?.status === 'PENDING') throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Önceki ödeme sonucu bekleniyor. Yeni çekim başlatılmadı.');
    if (order.subscriptionId) await tx.creditSubscription.update({ where: { id: order.subscriptionId }, data: { autoRenew: false, nextPaymentOn: null } });
    const attempt = await tx.creditPaymentAttempt.create({ data: { orderId, provider: bank.id, attemptNumber: (last?.attemptNumber ?? 0) + 1 } });
    await tx.creditOrder.update({ where: { id: orderId }, data: { status: 'PENDING', renewalRequested: false } });
    const config: NestpayConfig = { ...openPayment<Omit<NestpayConfig, 'bankId' | 'mode'>>(settings.credentialsCiphertext), bankId: bank.id, mode: settings.mode as NestpayConfig['mode'] };
    const session = await tx.paymentCheckoutSession.create({
      data: { attemptId: attempt.id, orderId, customerId: owner.id, state: 'DISPATCHED', claimedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60_000), contextCiphertext: sealPayment({ config }) },
    });
    await tx.activityLog.create({
      data: {
        userId: owner.id,
        action: 'payments.nestpay_started',
        entityType: 'CreditPaymentAttempt',
        entityId: attempt.id,
        ipAddress: actor.ipAddress,
        metadata: { orderId, orderNumber: order.number, provider: bank.id, amount: order.total.toFixed(2), currency: order.currency },
      },
    });
    return { config, attemptId: attempt.id, sessionId: session.id, publicUrl: settings.publicUrl, order };
  }, { isolationLevel: 'ReadCommitted' });
  return {
    ...nestpayForm(prepared.config, {
      orderId: prepared.attemptId,
      amount: prepared.order.total.toFixed(2),
      currency: prepared.order.currency,
      callbackUrl: prepared.publicUrl + '/api/v1/payments/nestpay/callback/' + prepared.sessionId,
      email: prepared.order.customer.email || '',
      card: input.card,
    }),
    sessionId: prepared.sessionId,
    recurringRequested: false,
  };
}

export async function reconcileNestpaySession(id: string) {
  const session = await db.paymentCheckoutSession.findUnique({ where: { id } });
  if (!session) return null;
  const attempt = await db.creditPaymentAttempt.findUnique({ where: { id: session.attemptId }, include: { order: true } });
  if (!attempt || !nestpayProviderIds.includes(attempt.provider) || attempt.status !== 'PENDING') return null;
  const { config } = openPayment<{ config: NestpayConfig }>(session.contextCiphertext);
  const reply = await nestpayInquireOrder(config, attempt.id);
  const result = nestpaySaleResult(reply, {
    attemptId: attempt.id,
    provider: attempt.provider,
    amount: attempt.order.total.toFixed(2),
    currency: attempt.order.currency,
  });
  if (result) {
    await settleVerifiedCreditPayment(result);
    await db.paymentCheckoutSession.update({ where: { id }, data: { state: result.outcome } });
  }
  return result;
}

export async function nestpayCallback(id: string, raw: unknown) {
  const session = await db.paymentCheckoutSession.findUnique({ where: { id } });
  if (!session) throw new AppError(400, 'PAYMENT_CALLBACK_INVALID', 'Banka bildirimi doğrulanamadı.');
  const attempt = await db.creditPaymentAttempt.findUniqueOrThrow({ where: { id: session.attemptId }, include: { order: true } });
  if (!nestpayProviderIds.includes(attempt.provider)) throw new AppError(400, 'PAYMENT_CALLBACK_INVALID', 'Banka bildirimi doğrulanamadı.');
  const { config } = openPayment<{ config: NestpayConfig }>(session.contextCiphertext);
  const verified = verifyNestpayCallback(config, raw, attempt.id, attempt.order.total.toFixed(2));
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const procCode = typeof value.ProcReturnCode === 'string' && /^[A-Z0-9-]{1,20}$/i.test(value.ProcReturnCode) ? value.ProcReturnCode : null;
  const mdStatus = typeof value.mdStatus === 'string' ? value.mdStatus : null;
  let result;
  try {
    result = await reconcileNestpaySession(id);
  } catch (error) {
    if (!(error instanceof AppError) || error.code !== 'PAYMENT_UNCERTAIN') throw error;
    return new URL('/customer/agreements?view=orders', env.FRONTEND_URL).toString();
  }
  if (!result && verified && attempt.status === 'PENDING' && ((procCode && declineCodes.has(procCode)) || (mdStatus && failed3dStatuses.has(mdStatus)))) {
    await settleVerifiedCreditPayment({
      attemptId: attempt.id,
      provider: attempt.provider,
      paymentId: attempt.id,
      amount: attempt.order.total.toFixed(2),
      currency: attempt.order.currency,
      outcome: 'FAILED',
      failureCode: mdStatus && failed3dStatuses.has(mdStatus) ? '3D_AUTH_FAILED' : 'BANK_DECLINED',
    });
    const settled = await db.creditPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    await db.paymentCheckoutSession.update({ where: { id }, data: { state: settled.status } });
  }
  return new URL('/customer/agreements?view=orders', env.FRONTEND_URL).toString();
}

export async function runNestpayPaymentChecks(now = new Date()) {
  const pending = await db.creditPaymentAttempt.findMany({
    where: {
      provider: { in: nestpayProviderIds },
      status: 'PENDING',
      OR: [
        { nextRetryAt: null, createdAt: { lte: new Date(now.getTime() - 5 * 60_000) } },
        { nextRetryAt: { lte: now }, createdAt: { gte: new Date(now.getTime() - 60 * 60_000) } },
      ],
    },
    take: 25,
    orderBy: [{ createdAt: 'asc' }],
    select: { id: true, createdAt: true, nextRetryAt: true },
  });
  for (const row of pending) {
    const claimed = await db.creditPaymentAttempt.updateMany({
      where: { id: row.id, status: 'PENDING', nextRetryAt: row.nextRetryAt },
      data: { nextRetryAt: nextPaymentInquiryAt(row.createdAt, row.nextRetryAt, now) },
    });
    if (!claimed.count) continue;
    try {
      const session = await db.paymentCheckoutSession.findUnique({ where: { attemptId: row.id } });
      if (session) await reconcileNestpaySession(session.id);
    } catch { /* Bounded schedule handles transient errors; never re-charge. */ }
  }
}
