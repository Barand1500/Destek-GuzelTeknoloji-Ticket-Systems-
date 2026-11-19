import { createHash, randomUUID } from 'node:crypto';
import { z } from 'zod';
import { db } from '../config/db.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { openPayment, sealPayment } from './payment-secrets.js';
import { creditStoreOwner } from './credit-store.service.js';
import { akbankCardInput, akbankCurrency, type AkbankConfig } from './akbank-client.js';
import { akbankRecurringTerms, registerAkbankInstruction, queryAkbankInstruction, cancelAkbankInstruction } from './akbank-recurring-client.js';
import { billingBoundary, billingToday } from './credit-billing.js';
import { settleVerifiedCreditPayment } from './credit-subscriptions.service.js';
import { publishChange } from './events.service.js';

const terminal = ['STOPPED', 'FAILED', 'COMPLETED'];
type Context = { config: AkbankConfig; firstOn: string; firstPeriod: number; months: number | null; days: number | null; amount: string; currency: string; credits: number; terms: ReturnType<typeof akbankRecurringTerms> };
const day = (value: Date) => value.toISOString().slice(0, 10);
const invalid = () => new AppError(409, 'AKBANK_RECURRING_REVIEW', 'Akbank yenileme talimatı kontrol edilmeli. Yeni talimat gönderilmedi.');

/** Only used after the matching first 3D payment settled. Card data is never stored. */
export async function beginAkbankRecurring(actor: Actor, sessionId: string, raw: unknown) {
  const input = z.object({ card: akbankCardInput, consent: z.literal(true) }).strict().parse(raw);
  const prepared = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'default' FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'akbank' FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`;
    const owner = await creditStoreOwner(actor, tx);
    const session = await tx.paymentCheckoutSession.findUnique({ where: { id: sessionId } });
    if (!session || session.customerId !== owner.id) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Ödeme kaydı bulunamadı.');
    const saved = openPayment<{ config: AkbankConfig; recurringRequested?: boolean }>(session.contextCiphertext);
    const order = await tx.creditOrder.findUniqueOrThrow({ where: { id: session.orderId }, include: { subscription: true } });
    const sub = order.subscription;
    const attempt = await tx.creditPaymentAttempt.findUniqueOrThrow({ where: { id: session.attemptId } });
    if (!saved.recurringRequested || session.expiresAt < new Date() || attempt.provider !== 'akbank' || attempt.status !== 'PAID' || order.status !== 'PAID' || !sub || sub.stoppedAt || !sub.currentEndsOn || sub.currentEndsOn < billingToday()) throw invalid();
    const existing = await tx.akbankRecurringInstruction.findUnique({ where: { checkoutSessionId: sessionId } });
    if (existing) return { instruction: existing, dispatch: false as const };
    const settings = await tx.paymentGatewaySettings.findUnique({ where: { id: 'akbank' } });
    if (!settings?.enabled || !settings.recurringEnabled || !settings.testedAt) throw new AppError(409, 'AKBANK_RECURRING_DISABLED', 'Akbank otomatik yenilemesi yönetimden açılmalı.');
    if (await tx.akbankRecurringInstruction.count({ where: { subscription: { customerId: owner.id }, state: { notIn: terminal } } })) throw invalid();
    if (await tx.paymentReversal.count({ where: { order: { customerId: owner.id }, status: { in: ['PENDING', 'REVIEW'] } } })) throw invalid();
    const terms = akbankRecurringTerms(sub.periodMonths, sub.periodDays);
    const firstOn = day(new Date(sub.currentEndsOn.getTime() + 86400000));
    const context: Context = { config: saved.config, firstOn, firstPeriod: sub.paidPeriods + 1, months: sub.periodMonths, days: sub.periodDays, amount: sub.amount.toFixed(2), currency: sub.currency, credits: sub.credits, terms };
    const instruction = await tx.akbankRecurringInstruction.create({ data: { subscriptionId: sub.id, checkoutSessionId: sessionId, contextCiphertext: sealPayment(context), nextCheckAt: new Date(Date.now() + 120000) } });
    await tx.activityLog.create({ data: { userId: owner.id, action: 'payments.akbank_renewal_requested', entityType: 'AkbankRecurringInstruction', entityId: instruction.id, metadata: { subscriptionId: sub.id, amount: context.amount, currency: context.currency, firstOn, periods: terms.numberOfPayments }, ipAddress: actor.ipAddress } });
    return { instruction, dispatch: true as const, context };
  });
  if (!prepared.dispatch) return { state: prepared.instruction.state };
  let failureCode: string | null = null;
  try {
    const result = await registerAkbankInstruction(prepared.context.config, { trackId: prepared.instruction.id, startsOn: prepared.context.firstOn, amount: prepared.context.amount, currency: prepared.context.currency, terms: prepared.context.terms, card: input.card });
    failureCode = result.accepted ? null : result.code;
    if (failureCode && ['VPS-1001', 'VPS-1003', 'VPS-1019', 'VPS-1042', 'VPS-2151'].includes(failureCode)) {
      await db.akbankRecurringInstruction.updateMany({ where: { id: prepared.instruction.id, state: 'REGISTERING' }, data: { state: 'FAILED', failureCode, nextCheckAt: null } });
    }
  } catch { failureCode = 'REGISTRATION_UNCERTAIN'; }
  // Never resend registration, even after a lost response. A concurrent stop intent wins.
  await db.akbankRecurringInstruction.updateMany({ where: { id: prepared.instruction.id, state: 'REGISTERING' }, data: { state: 'REVIEW', failureCode, nextCheckAt: new Date() } });
  await db.akbankRecurringInstruction.updateMany({ where: { id: prepared.instruction.id, state: 'STOP_REQUESTED' }, data: { nextCheckAt: new Date() } });
  try { await reconcileAkbankRecurring(prepared.instruction.id); } catch { /* The inquiry worker owns uncertain outcomes. */ }
  publishChange();
  return { state: (await db.akbankRecurringInstruction.findUniqueOrThrow({ where: { id: prepared.instruction.id } })).state };
}

function checkedRows(rows: Record<string, any>[], context: Context) {
  if (rows.length !== context.terms.numberOfPayments) throw invalid();
  const seen = new Set<number>();
  for (const row of rows) {
    const sequence = Number(row.recurringOrder);
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > rows.length) throw invalid();
    const expected = day(billingBoundary(new Date(context.firstOn), context.months, context.days, sequence - 1));
    if (!Number.isInteger(sequence) || sequence < 1 || sequence > rows.length || seen.has(sequence) || String(row.txnCode) !== '1000' || row.requestType !== 'R' || !['W', 'P', 'C', 'V', 'F', 'S'].includes(row.requestStatus) || String(row.plannedDateTime ?? '').slice(0, 10) !== expected || String(row.currencyCode) !== akbankCurrency[context.currency] || Number(row.installCount) !== 1 || !new Prisma.Decimal(row.amount ?? -1).eq(context.amount)) throw invalid();
    seen.add(sequence);
  }
  return rows;
}

async function importOccurrence(instructionId: string, context: Context, row: Record<string, any>, now: Date) {
  if (row.requestStatus !== 'S') return;
  const sequence = Number(row.recurringOrder), number = context.firstPeriod + sequence - 1;
  const start = billingBoundary(new Date(context.firstOn), context.months, context.days, sequence - 1);
  const end = new Date(billingBoundary(new Date(context.firstOn), context.months, context.days, sequence).getTime() - 86400000);
  if (start > billingToday(now)) throw invalid();
  const paymentId = `akbrec:${instructionId}:${sequence}`;
  const prepared = await db.$transaction(async tx => {
    const initial = await tx.akbankRecurringInstruction.findUniqueOrThrow({ where: { id: instructionId }, include: { subscription: true } });
    const sub = initial.subscription;
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${sub.customerId} FOR UPDATE`;
    const existing = await tx.creditOrder.findUnique({ where: { subscriptionId_periodNumber: { subscriptionId: sub.id, periodNumber: number } } });
    let order = existing;
    if (existing && (existing.credits !== context.credits || !existing.total.eq(context.amount) || existing.currency !== context.currency || existing.periodStartsOn?.getTime() !== start.getTime() || existing.periodEndsOn?.getTime() !== end.getTime())) throw invalid();
    if (existing?.paidAt) return null;
    if (!order) order = await tx.creditOrder.create({ data: { customerId: sub.customerId, requestedById: sub.customerId, subscriptionId: sub.id, periodNumber: number, requestKey: randomUUID(), inputHash: createHash('sha256').update(paymentId).digest('hex'), name: sub.name.slice(0, 100), kind: 'SUBSCRIPTION', credits: context.credits, total: context.amount, currency: context.currency, periodMonths: context.months, validityDays: context.days, renewalRequested: sub.autoRenew, periodStartsOn: start, periodEndsOn: end } });
    let attempt = await tx.creditPaymentAttempt.findFirst({ where: { orderId: order.id }, orderBy: { attemptNumber: 'desc' } });
    if (attempt && (attempt.provider !== 'akbank' || attempt.providerPaymentId !== paymentId)) throw invalid();
    if (!attempt) attempt = await tx.creditPaymentAttempt.create({ data: { orderId: order.id, attemptNumber: 1, provider: 'akbank', providerPaymentId: paymentId } });
    await tx.paymentCheckoutSession.createMany({ skipDuplicates: true, data: [{ attemptId: attempt.id, orderId: order.id, customerId: sub.customerId, state: 'PAID', expiresAt: now, contextCiphertext: sealPayment({ config: context.config }) }] });
    return { attemptId: attempt.id, orderId: order.id };
  });
  if (prepared) await settleVerifiedCreditPayment({ attemptId: prepared.attemptId, provider: 'akbank', paymentId, outcome: 'PAID', amount: context.amount, currency: context.currency }, now);
}

export async function reconcileAkbankRecurring(id: string, now = new Date()) {
  const instruction = await db.akbankRecurringInstruction.findUniqueOrThrow({ where: { id }, include: { subscription: true } });
  if (terminal.includes(instruction.state)) return;
  const context = openPayment<Context>(instruction.contextCiphertext);
  let rows = checkedRows(await queryAkbankInstruction(context.config, id), context);
  // Success racing a cancellation is still a real paid period; never discard it.
  for (const row of rows.sort((a, b) => Number(a.recurringOrder) - Number(b.recurringOrder))) await importOccurrence(id, context, row, now);
  let current = await db.akbankRecurringInstruction.findUniqueOrThrow({ where: { id }, include: { subscription: { include: { customer: true } } } });
  const inactive = !current.subscription.customer.isActive || !!current.subscription.customer.deletedAt || !!current.subscription.customer.parentCustomerId;
  if (current.state === 'STOP_REQUESTED' || current.subscription.stoppedAt || inactive || (current.state === 'ACTIVE' && !current.subscription.autoRenew)) {
    await db.akbankRecurringInstruction.update({ where: { id }, data: { state: 'STOP_REQUESTED' } });
    await cancelAkbankInstruction(context.config, id);
    rows = checkedRows(await queryAkbankInstruction(context.config, id), context);
    for (const row of rows) await importOccurrence(id, context, row, now);
    if (rows.some(row => ['W', 'P'].includes(row.requestStatus))) throw invalid();
    await db.akbankRecurringInstruction.update({ where: { id }, data: { state: 'STOPPED', nextCheckAt: null, failureCode: null } });
    publishChange(); return;
  }
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${current.subscription.customerId} FOR UPDATE`;
    const fresh = await tx.akbankRecurringInstruction.findUniqueOrThrow({ where: { id }, include: { subscription: true } });
    if (fresh.state === 'STOP_REQUESTED' || fresh.subscription.stoppedAt) return;
    const remaining = rows.filter(row => ['W', 'P'].includes(row.requestStatus)).sort((a, b) => Number(a.recurringOrder) - Number(b.recurringOrder));
    await tx.akbankRecurringInstruction.update({ where: { id }, data: { state: remaining.length ? 'ACTIVE' : 'COMPLETED', failureCode: null, nextCheckAt: remaining.length ? new Date(now.getTime() + 60000) : null } });
    await tx.creditSubscription.update({ where: { id: fresh.subscriptionId }, data: { autoRenew: remaining.length > 0, status: remaining.length ? 'ACTIVE' : 'STOPPED', provider: 'akbank', nextPaymentOn: remaining.length ? new Date(String(remaining[0].plannedDateTime).slice(0, 10)) : null } });
  });
  publishChange();
}

/** Inquiry/cancellation only: the bank, not this worker, executes recurring charges. */
export async function runAkbankRecurringChecks() {
  const rows = await db.akbankRecurringInstruction.findMany({ where: { state: { notIn: terminal }, OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }] }, take: 25, orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }], select: { id: true } });
  for (const row of rows) {
    try { await reconcileAkbankRecurring(row.id); }
    catch { await db.akbankRecurringInstruction.updateMany({ where: { id: row.id, state: { notIn: terminal } }, data: { nextCheckAt: new Date(Date.now() + 60000), failureCode: 'BANK_RESULT_UNCERTAIN' } }); }
  }
}

/** Browser polling reads only the caller's attempt. A browser signal never proves a payment. */
export async function akbankEnrollmentStatus(actor: Actor, sessionId: string) {
  const owner = await creditStoreOwner(actor);
  const session = await db.paymentCheckoutSession.findFirst({ where: { id: sessionId, customerId: owner.id }, select: { attemptId: true } });
  if (!session) throw new AppError(404, 'PAYMENT_NOT_FOUND', 'Ödeme bulunamadı.');
  const attempt = await db.creditPaymentAttempt.findUniqueOrThrow({ where: { id: session.attemptId }, select: { status: true, provider: true } });
  if (attempt.provider !== 'akbank') throw invalid();
  const instruction = await db.akbankRecurringInstruction.findUnique({ where: { checkoutSessionId: sessionId }, select: { state: true } });
  return { status: attempt.status, recurringState: instruction?.state ?? null };
}
