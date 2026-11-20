import { createHash, randomUUID } from 'node:crypto';
import { db } from '../config/db.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { openPayment, sealPayment } from './payment-secrets.js';
import { creditStoreOwner } from './credit-store.service.js';
import { akbankCurrency, type AkbankConfig } from './akbank-client.js';
import { type LegacyAkbankTerms, queryAkbankInstruction, cancelAkbankInstruction } from './akbank-recurring-client.js';
import { billingBoundary, billingToday } from './credit-billing.js';
import { settleVerifiedCreditPayment } from './credit-subscriptions.service.js';
import { publishChange } from './events.service.js';

const terminal = ['STOPPED', 'FAILED', 'COMPLETED'];
type Context = { config: AkbankConfig; firstOn: string; firstPeriod: number; months: number | null; days: number | null; amount: string; currency: string; credits: number; terms: LegacyAkbankTerms };
const day = (value: Date) => value.toISOString().slice(0, 10);
const invalid = () => new AppError(409, 'AKBANK_RECURRING_REVIEW', 'Akbank yenileme talimatı kontrol edilmeli. Yeni talimat gönderilmedi.');

/** Reject callers from retired checkout clients; no card data is processed. */
export async function beginAkbankRecurring(actor: Actor, sessionId: string, raw: unknown) {
  void actor; void sessionId; void raw;
  throw new AppError(410, 'RENEWAL_DISABLED', 'Otomatik yenileme kaldırıldı. Bu işlem kullanılamıyor.');
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
    if (!order) order = await tx.creditOrder.create({ data: { customerId: sub.customerId, requestedById: sub.customerId, subscriptionId: sub.id, periodNumber: number, requestKey: randomUUID(), inputHash: createHash('sha256').update(paymentId).digest('hex'), name: sub.name.slice(0, 100), kind: 'SUBSCRIPTION', credits: context.credits, total: context.amount, currency: context.currency, periodMonths: context.months, validityDays: context.days, renewalRequested: false, periodStartsOn: start, periodEndsOn: end } });
    let attempt = await tx.creditPaymentAttempt.findFirst({ where: { orderId: order.id }, orderBy: { attemptNumber: 'desc' } });
    if (attempt && (attempt.provider !== 'akbank' || attempt.providerPaymentId !== paymentId)) throw invalid();
    if (!attempt) attempt = await tx.creditPaymentAttempt.create({ data: { orderId: order.id, attemptNumber: 1, provider: 'akbank', providerPaymentId: paymentId } });
    await tx.paymentCheckoutSession.createMany({ skipDuplicates: true, data: [{ attemptId: attempt.id, orderId: order.id, customerId: sub.customerId, state: 'PAID', expiresAt: now, contextCiphertext: sealPayment({ config: context.config }) }] });
    return { attemptId: attempt.id, orderId: order.id };
  });
  if (prepared) await settleVerifiedCreditPayment({ attemptId: prepared.attemptId, provider: 'akbank', paymentId, outcome: 'PAID', amount: context.amount, currency: context.currency }, now);
}

export async function reconcileAkbankRecurring(id: string, now = new Date()) {
  const current = await db.akbankRecurringInstruction.findUniqueOrThrow({ where: { id }, include: { subscription: { include: { customer: true } } } });
  const paidReview = current.state === 'STOPPED' && current.failureCode === 'PAID_PERIOD_REVIEW';
  if (terminal.includes(current.state) && !paidReview) return;
  const context = openPayment<Context>(current.contextCiphertext);
  { // Only cancellation and already-paid accounting remain after retirement.
    // A mandate cancelled in the bank panel may reject another cancellation request.
    // Read its signed status first so that an already-closed mandate can still be confirmed.
    let stopped: Record<string, any>[] | null = null;
    try { stopped = await queryAkbankInstruction(context.config, id); } catch { /* Still attempt cancellation when inquiry is unavailable. */ }
    const alreadyStopped = stopped?.length === context.terms.numberOfPayments && stopped.every(row => ['S', 'C', 'V', 'F'].includes(row.requestStatus));
    // Stop future money movement first. Local credit/data errors must never block cancellation.
    if (!paidReview && !alreadyStopped) {
      await db.akbankRecurringInstruction.update({ where: { id }, data: { state: 'STOP_REQUESTED' } });
      await cancelAkbankInstruction(context.config, id);
      stopped = null;
    }
    stopped ??= await queryAkbankInstruction(context.config, id);
    const sequences = stopped.map(row => Number(row.recurringOrder));
    if (stopped.length !== context.terms.numberOfPayments || new Set(sequences).size !== stopped.length || sequences.some(number => !Number.isInteger(number) || number < 1 || number > context.terms.numberOfPayments) || stopped.some(row => !['S', 'C', 'V', 'F'].includes(row.requestStatus))) throw invalid();
    let review = false;
    try {
      const checked = checkedRows(stopped, context);
      for (const row of checked.sort((a, b) => Number(a.recurringOrder) - Number(b.recurringOrder))) {
        try { await importOccurrence(id, context, row, now); } catch { review = true; }
      }
    } catch { review = true; }
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM User WHERE id = ${current.subscription.customerId} FOR UPDATE`;
      await tx.akbankRecurringInstruction.update({ where: { id }, data: { state: 'STOPPED', nextCheckAt: review ? new Date(now.getTime() + 60000) : null, failureCode: review ? 'PAID_PERIOD_REVIEW' : null } });
      await tx.creditSubscription.update({ where: { id: current.subscriptionId }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: current.subscription.stoppedAt ?? now, nextPaymentOn: null } });
      if (review && current.failureCode !== 'PAID_PERIOD_REVIEW') await tx.activityLog.create({ data: { userId: current.subscription.customerId, action: 'payments.akbank_paid_period_review', entityType: 'AkbankRecurringInstruction', entityId: id, metadata: { bankCancellationConfirmed: true, subscriptionId: current.subscriptionId } } });
    });
    publishChange(); return;
  }
}

/** Inquiry/cancellation only: the bank, not this worker, executes recurring charges. */
export async function runAkbankRecurringChecks() {
  const rows = await db.akbankRecurringInstruction.findMany({ where: { AND: [{ OR: [{ state: { notIn: terminal } }, { state: 'STOPPED', failureCode: 'PAID_PERIOD_REVIEW' }] }, { OR: [{ nextCheckAt: null }, { nextCheckAt: { lte: new Date() } }] }] }, take: 25, orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }], select: { id: true } });
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
