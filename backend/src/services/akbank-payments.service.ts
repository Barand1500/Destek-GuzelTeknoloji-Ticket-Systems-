import { z } from 'zod';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { creditStoreOwner } from './credit-store.service.js';
import { billingToday } from './credit-billing.js';
import { refreshPackageStart } from './credit-package-schedule.js';
import { openPayment, sealPayment } from './payment-secrets.js';
import { akbankCardInput, akbankCurrency, akbankForm, akbankInquiry, akbankSaleResult, verifyAkbankCallback, type AkbankConfig } from './akbank-client.js';
import { settleVerifiedCreditPayment } from './credit-subscriptions.service.js';
import { akbankRecurringTerms, queryAkbankInstruction } from './akbank-recurring-client.js';
import { akbankOccurrence, akbankInstructionTerminal } from './akbank-recurring-state.js';

const inputSchema = z.object({ card: akbankCardInput, manualRenewalConsent: z.boolean().default(false), renewalConsent: z.boolean().default(false) }).strict();
const declineCodes = new Set(['05', '14', '33', '41', '43', '51', '54', '57', '58', '62', '65']);
export async function beginAkbankCheckout(actor: Actor, orderId: string, raw: unknown) {
  const input = inputSchema.parse(raw);
  const prepared = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'default' FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'akbank' FOR UPDATE`;
    const settings = await tx.paymentGatewaySettings.findUnique({ where: { id: 'akbank' } });
    if (!settings?.enabled || !settings.testedAt) throw new AppError(409, 'PAYMENT_DISABLED', 'Akbank online ödeme kapalı.');
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`;
    const owner = await creditStoreOwner(actor, tx);
    const order = await tx.creditOrder.findUnique({ where: { id: orderId }, include: { subscription: true, customer: true } });
    if (!order || order.customerId !== owner.id) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
    if (!['PENDING', 'FAILED'].includes(order.status)) throw new AppError(409, 'ORDER_NOT_PENDING', 'Sipariş ödeme beklemiyor.');
    if (!akbankCurrency[order.currency]) throw new AppError(400, 'PAYMENT_CURRENCY_UNSUPPORTED', 'Bu para birimi Akbank için desteklenmiyor.');
    await refreshPackageStart(tx, order);
    if (order.periodStartsOn && order.periodStartsOn > billingToday()) throw new AppError(409, 'PAYMENT_NOT_DUE', 'Ödeme paket başlangıcında yapılabilir.');
    if (order.subscription?.status === 'STOPPED') throw new AppError(409, 'SUBSCRIPTION_STOPPED', 'Abonelik yenilemesi kapalı.');
    const recurringRequested = Boolean(order.subscription && (order.subscription.autoRenew || order.renewalRequested) && !input.manualRenewalConsent);
    if (recurringRequested && (!input.renewalConsent || !settings.recurringEnabled))
      throw new AppError(409, 'RENEWAL_CONSENT_REQUIRED', 'Otomatik yenileme bağlantısı açık olmalı ve dönemsel tahsilat onaylanmalı.');
    if (recurringRequested) akbankRecurringTerms(order.periodMonths, order.validityDays);
    if (order.kind === 'SUBSCRIPTION' && await tx.akbankRecurringInstruction.count({ where: { subscription: { customerId: owner.id }, subscriptionId: { not: order.subscriptionId ?? '' }, state: { notIn: akbankInstructionTerminal } } }))
      throw new AppError(409, 'BANK_CANCELLATION_PENDING', 'Önceki paketin bankadaki yenileme iptali bekleniyor. İptal doğrulanınca ödeme yapabilirsiniz.');
    const last = await tx.creditPaymentAttempt.findFirst({ where: { orderId }, orderBy: { attemptNumber: 'desc' } });
    if (last?.status === 'PENDING') throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Önceki ödeme sonucu bekleniyor. Yeni çekim başlatılmadı.');
    if (order.subscriptionId) await tx.creditSubscription.update({ where: { id: order.subscriptionId }, data: { autoRenew: false, nextPaymentOn: null, provider: 'akbank', paymentMethodRef: null } });
    const attempt = await tx.creditPaymentAttempt.create({ data: { orderId, provider: 'akbank', attemptNumber: (last?.attemptNumber ?? 0) + 1 } });
    await tx.creditOrder.update({ where: { id: orderId }, data: { status: 'PENDING', ...(input.manualRenewalConsent ? { renewalRequested: false } : {}) } });
    const config: AkbankConfig = { ...openPayment<Omit<AkbankConfig, 'mode'>>(settings.credentialsCiphertext), mode: settings.mode as AkbankConfig['mode'] };
    // Card data never enters the persisted context. Each new attempt is a unique bank order ID.
    const session = await tx.paymentCheckoutSession.create({ data: { attemptId: attempt.id, orderId, customerId: owner.id, state: 'DISPATCHED', claimedAt: new Date(), expiresAt: new Date(Date.now() + 30 * 60000), contextCiphertext: sealPayment({ config, ...(recurringRequested ? { recurringRequested: true } : {}) }) } });
    await tx.activityLog.create({ data: { userId: owner.id, action: 'payments.akbank_started', entityType: 'CreditPaymentAttempt', entityId: attempt.id, ipAddress: actor.ipAddress,
      metadata: { orderId, amount: order.total.toFixed(2), currency: order.currency, manualRenewal: input.manualRenewalConsent } } });
    return { config, attemptId: attempt.id, sessionId: session.id, recurringRequested, publicUrl: settings.publicUrl, order };
  }, { isolationLevel: 'ReadCommitted' });
  return { ...akbankForm(prepared.config, { orderId: prepared.attemptId, amount: prepared.order.total.toFixed(2), currency: prepared.order.currency,
    callbackUrl: prepared.publicUrl + '/api/v1/payments/akbank/callback/' + prepared.sessionId, email: prepared.order.customer.email || '', phone: prepared.order.customer.phone || '', card: input.card }), sessionId: prepared.sessionId, recurringRequested: prepared.recurringRequested };
}

export async function reconcileAkbankSession(id: string, onInquiry?: (recordCount: number) => void) {
  const session = await db.paymentCheckoutSession.findUnique({ where: { id } });
  if (!session) return null;
  const attempt = await db.creditPaymentAttempt.findUnique({ where: { id: session.attemptId }, include: { order: true } });
  if (!attempt || attempt.provider !== 'akbank' || attempt.status !== 'PENDING') return null;
  const { config } = openPayment<{ config: AkbankConfig }>(session.contextCiphertext);
  const occurrence = akbankOccurrence(attempt.providerPaymentId ?? '');
  const rows = occurrence ? await queryAkbankInstruction(config, occurrence.trackId) : await akbankInquiry(config, attempt.id);
  onInquiry?.(rows.length);
  let result = occurrence ? null : akbankSaleResult(rows, { attemptId: attempt.id, amount: attempt.order.total.toFixed(2), currency: attempt.order.currency });
  if (occurrence) {
    const matches = rows.filter(row => Number(row.recurringOrder) === occurrence.sequence);
    const sale = matches.length === 1 ? matches[0] : null;
    if (sale?.requestStatus === 'S' && sale.requestType === 'R' && String(sale.txnCode) === '1000' && String(sale.currencyCode) === akbankCurrency[attempt.order.currency] && Number(sale.amount) === Number(attempt.order.total) && String(sale.plannedDateTime).slice(0, 10) === attempt.order.periodStartsOn?.toISOString().slice(0, 10))
      result = { attemptId: attempt.id, provider: 'akbank', paymentId: attempt.providerPaymentId!, outcome: 'PAID', amount: attempt.order.total.toFixed(2), currency: attempt.order.currency };
  }
  if (result) {
    await settleVerifiedCreditPayment(result);
    await db.paymentCheckoutSession.update({ where: { id }, data: { state: result.outcome } });
  }
  return result;
}

export async function akbankCallback(id: string, raw: unknown) {
  const session = await db.paymentCheckoutSession.findUnique({ where: { id } });
  if (!session) throw new AppError(400, 'PAYMENT_CALLBACK_INVALID', 'Akbank bildirimi doğrulanamadı.');
  const attempt = await db.creditPaymentAttempt.findUniqueOrThrow({ where: { id: session.attemptId }, include: { order: true } });
  const { config } = openPayment<{ config: AkbankConfig }>(session.contextCiphertext);
  if (attempt.provider !== 'akbank') throw new AppError(400, 'PAYMENT_CALLBACK_INVALID', 'Akbank bildirimi doğrulanamadı.');
  const verified = verifyAkbankCallback(config, raw, attempt.id, attempt.order.total.toFixed(2));
  const value = raw && typeof raw === 'object' && !Array.isArray(raw) ? raw as Record<string, unknown> : {};
  const code = typeof value.responseCode === 'string' && /^VPS-\d{4}$/.test(value.responseCode) ? value.responseCode : null;
  if (!verified || (code && code !== 'VPS-0000')) {
    // One bounded diagnostic per attempt; never retain the bank's raw form, signature or card data.
    await db.$transaction(async tx => {
      const recorded = await tx.paymentCheckoutSession.updateMany({ where: { id, state: 'DISPATCHED' }, data: { state: 'CALLBACK_REVIEW' } });
      if (!recorded.count) return;
      await tx.creditPaymentAttempt.updateMany({ where: { id: attempt.id, status: 'PENDING', failureCode: null }, data: { failureCode: 'AKBANK_CALLBACK_' + (verified ? 'REVIEW' : 'INVALID') + (code ? '_' + code : '') } });
      await tx.activityLog.create({ data: { userId: attempt.order.customerId, action: 'payments.akbank_callback_review', entityType: 'CreditPaymentAttempt', entityId: attempt.id,
        metadata: { orderId: attempt.orderId, callbackVerified: verified, bankResponseCode: code } } });
    });
  }
  // Query even if the browser form is incomplete or unverifiable. Only the authenticated bank result can grant credit.
  let result;
  try { result = await reconcileAkbankSession(id); }
  catch (error) {
    if (!(error instanceof AppError) || error.code !== 'PAYMENT_UNCERTAIN') throw error;
    // Keep the customer in the portal while the query worker resolves a bank outage.
    return new URL('/customer/agreements?view=orders', env.FRONTEND_URL).toString();
  }
  const signedFields = verified && typeof value.hashParams === 'string' ? new Set(value.hashParams.split('+')) : new Set<string>();
  if (!result && verified && attempt.status === 'PENDING' && value.txnCode === '1000' && signedFields.has('txnCode') && signedFields.has('hostResponseCode') && value.responseCode !== 'VPS-0000' && typeof value.hostResponseCode === 'string' && declineCodes.has(value.hostResponseCode)) {
    await settleVerifiedCreditPayment({ attemptId: attempt.id, provider: 'akbank', paymentId: attempt.id, amount: attempt.order.total.toFixed(2), currency: attempt.order.currency, outcome: 'FAILED', failureCode: 'BANK_DECLINED' });
    const settled = await db.creditPaymentAttempt.findUniqueOrThrow({ where: { id: attempt.id } });
    await db.paymentCheckoutSession.update({ where: { id }, data: { state: settled.status } });
  }
  return new URL('/customer/agreements?view=orders', env.FRONTEND_URL).toString();
}

export async function runAkbankPaymentChecks() {
  const pending = await db.creditPaymentAttempt.findMany({ where: { provider: 'akbank', status: 'PENDING', OR: [{ nextRetryAt: null }, { nextRetryAt: { lte: new Date() } }] }, take: 25, orderBy: [{ nextRetryAt: 'asc' }, { createdAt: 'asc' }], select: { id: true } });
  for (const row of pending) {
    try { const session = await db.paymentCheckoutSession.findUnique({ where: { attemptId: row.id } }); if (session) await reconcileAkbankSession(session.id); } catch { /* Uncertain results are retried by inquiry only. */ }
    await db.creditPaymentAttempt.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { nextRetryAt: new Date(Date.now() + 5 * 60000) } });
  }
}
