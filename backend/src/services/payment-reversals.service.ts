import { z } from 'zod';
import { db } from '../config/db.js';
import { requestAkbankInstructionStop } from './akbank-recurring-state.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { paymentStaff } from './payment-settings.service.js';
import { openPayment } from './payment-secrets.js';
import type { AkbankConfig } from './akbank-client.js';
import { dispatchAkbankReversal, reconcileAkbankReversal } from './akbank-reversals.js';
import { iyzicoRequest, type IyzicoConfig } from './iyzico-client.js';
import { publishChange } from './events.service.js';
import { creditStoreOwner } from './credit-store.service.js';

const inputSchema = z.object({ requestKey: z.uuid(), kind: z.enum(['REFUND', 'CANCEL']), credits: z.number().int().positive().max(1_000_000), reason: z.string().trim().min(3).max(500) }).strict();
const customerInputSchema = inputSchema.pick({ requestKey: true, reason: true }).strict();
const conflict = (message: string) => new AppError(409, 'REFUND_NOT_ALLOWED', message);
const safeSelect = { id: true, kind: true, status: true, credits: true, amount: true, currency: true, reason: true, failureCode: true, createdAt: true, completedAt: true } as const;
const serialize = <T extends { amount: Prisma.Decimal }>(row: T) => ({ ...row, amount: row.amount.toFixed(2) });
const localDay = (date: Date) => new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(date);

/** Cumulative cent rounding avoids losing money across repeated partial refunds. */
export function refundValue(total: string, originalCredits: number, previousCredits: number, previousAmount: string, credits: number) {
  const minor = BigInt(new Prisma.Decimal(total).mul(100).toFixed(0));
  const already = BigInt(new Prisma.Decimal(previousAmount).mul(100).toFixed(0));
  const amount = minor * BigInt(previousCredits + credits) / BigInt(originalCredits) - already;
  if (amount <= 0n) throw conflict('Seçilen kredi için iade tutarı bir kuruştan az. Daha fazla kredi seçin.');
  return new Prisma.Decimal(amount.toString()).div(100);
}

export async function reversalSummary(actor: Actor, orderId: string, admin = true) {
  if (admin) paymentStaff(actor);
  const order = await db.creditOrder.findUnique({ where: { id: orderId }, include: { grantedAgreement: true, refundRequest: true } });
  if (!order || (!admin && (actor.role !== 'CUSTOMER' || actor.id !== order.customerId))) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
  const data = await db.paymentReversal.findMany({ where: { orderId }, select: safeSelect, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], take: 100 });
  const totals = await db.paymentReversal.aggregate({ where: { orderId, status: { not: 'FAILED' } }, _sum: { amount: true, credits: true } });
  const agreement = order.grantedAgreement;
  const available = agreement && !agreement.deletedAt ? Math.max(0, Math.min(agreement.credits - agreement.usedCredits, order.credits - (totals._sum.credits ?? 0))) : 0;
  let amount = '0.00';
  if (available) try { amount = refundValue(order.total.toFixed(2), order.credits, totals._sum.credits ?? 0, totals._sum.amount?.toFixed(2) ?? '0', available).toFixed(2); } catch (error) { if (!(error instanceof AppError)) throw error; }
  return { refundRequest: order.refundRequest, data: data.map(serialize), orderId, orderNumber: order.number, orderName: order.name, currency: order.currency, refundableCredits: available, refundableAmount: amount, originalCredits: order.credits, total: order.total.toFixed(2),
    refundedCredits: totals._sum.credits ?? 0, refundedAmount: totals._sum.amount?.toFixed(2) ?? '0.00', hasPending: data.some(v => ['PENDING', 'REVIEW'].includes(v.status)), usedCredits: agreement?.usedCredits ?? 0,
    canSelfRefund: order.status === 'PAID' && !agreement?.usedCredits && !totals._sum.credits && available === order.credits,
    canCancel: Boolean(order.paidAt && localDay(order.paidAt) === localDay(new Date()) && !agreement?.usedCredits && !totals._sum.credits && available === order.credits) };
}

export async function startPaymentReversal(actor: Actor, orderId: string, raw: unknown, admin = true) {
  if (admin) paymentStaff(actor, true);
  const input = admin ? inputSchema.parse(raw) : { ...customerInputSchema.parse(raw), kind: 'REFUND' as 'REFUND' | 'CANCEL', credits: 0 };
  const prepared = await db.$transaction(async tx => {
    const initial = await tx.creditOrder.findUnique({ where: { id: orderId } });
    if (!initial) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
    if (!admin && (actor.role !== 'CUSTOMER' || actor.id !== initial.customerId)) throw new AppError(404, 'ORDER_NOT_FOUND', 'Sipariş bulunamadı.');
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${initial.customerId} FOR UPDATE`;
    if (!admin) await creditStoreOwner(actor, tx);
    const order = await tx.creditOrder.findUniqueOrThrow({ where: { id: orderId }, include: { grantedAgreement: true } });
    const previous = await tx.paymentReversal.findUnique({ where: { orderId_requestKey: { orderId, requestKey: input.requestKey } } });
    if (!admin) {
      input.credits = order.credits;
      input.kind = previous?.kind === 'CANCEL' || previous?.kind === 'REFUND' ? previous.kind : order.paidAt && localDay(order.paidAt) === localDay(new Date()) ? 'CANCEL' : 'REFUND';
    }
    if (previous) {
      if (previous.kind !== input.kind || previous.credits !== input.credits || previous.reason !== input.reason) throw conflict('Bu işlem anahtarı başka iade için kullanılmış.');
      return { row: previous, dispatch: false as const };
    }
    if (!['PAID', 'PARTIAL_REFUND'].includes(order.status) || !order.grantedAgreementId || !order.grantedAgreement || order.grantedAgreement.deletedAt) throw conflict('Yalnızca ödenmiş ve kredi kaydı bulunan siparişler iade edilebilir.');
    if (await tx.paymentReversal.count({ where: { orderId, status: { in: ['PENDING', 'REVIEW'] } } })) throw conflict('Bu siparişin önceki iade sonucu bekleniyor.');
    const attempts = await tx.creditPaymentAttempt.findMany({ where: { orderId, status: 'PAID', provider: { in: ['iyzico', 'akbank'] } }, orderBy: { attemptNumber: 'asc' } });
    if (attempts.length !== 1 || !attempts[0].providerPaymentId) throw conflict('Ödeme kimliği tekil olarak doğrulanamadı. Önce ödeme kaydını inceleyin.');
    const session = await tx.paymentCheckoutSession.findUnique({ where: { attemptId: attempts[0].id } });
    if (!session) throw conflict('Sağlayıcı bağlantı kaydı bulunamadı.');
    const sums = await tx.paymentReversal.aggregate({ where: { orderId, status: 'SUCCEEDED' }, _sum: { credits: true, amount: true } });
    const oldCredits = sums._sum.credits ?? 0, oldAmount = sums._sum.amount?.toFixed(2) ?? '0';
    await tx.$queryRaw`SELECT id FROM Agreement WHERE id = ${order.grantedAgreementId} FOR UPDATE`;
    const agreement = await tx.agreement.findUniqueOrThrow({ where: { id: order.grantedAgreementId } });
    if (!admin && (order.status !== 'PAID' || agreement.usedCredits !== 0 || oldCredits !== 0)) throw conflict('Yalnızca hiç kullanılmamış siparişin tamamını iade edebilirsiniz.');
    if (agreement.customerId !== order.customerId) throw conflict('Anlaşmanın sahibi değişmiş. İade öncesi müşteri eşleşmesini kontrol edin.');
    if (input.credits > order.credits - oldCredits || input.credits > agreement.credits - agreement.usedCredits) throw conflict('İade miktarı kullanılmamış krediyi aşamaz.');
    if (input.kind === 'CANCEL' && (agreement.usedCredits > 0 || oldCredits > 0 || input.credits !== order.credits)) throw conflict('Banka iptali yalnızca hiç kullanılmamış ödemenin tamamı için yapılabilir. Diğer işlemler için iade seçin.');
    if (input.kind === 'CANCEL' && (!order.paidAt || localDay(order.paidAt) !== localDay(new Date()))) throw conflict('Banka iptali ödeme gününde yapılabilir. Bu sipariş için iade seçin.');
    const amount = refundValue(order.total.toFixed(2), order.credits, oldCredits, oldAmount, input.credits);
    // Reserve before the network request. Support resolution uses the same owner lock.
    await tx.agreement.update({ where: { id: agreement.id }, data: { credits: { decrement: input.credits } } });
    if (order.subscriptionId && (await requestAkbankInstructionStop(tx, order.subscriptionId)).count)
      await tx.creditSubscription.update({ where: { id: order.subscriptionId }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: new Date(), nextPaymentOn: null } });
    const row = await tx.paymentReversal.create({ data: { orderId, requestKey: input.requestKey, kind: input.kind, credits: input.credits, amount, currency: order.currency, paymentId: attempts[0].providerPaymentId, actorId: actor.id, reason: input.reason, nextCheckAt: new Date(Date.now() + 60_000) } });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'credit_payment.reversal_requested', entityType: 'PaymentReversal', entityId: row.id, metadata: { orderId, kind: input.kind, credits: input.credits, amount: amount.toFixed(2), reason: input.reason }, ipAddress: actor.ipAddress } });
    return { row, dispatch: true as const, provider: attempts[0].provider, originalAmount: order.total.toFixed(2), previousRefundAmount: oldAmount,
      config: openPayment<{ config: IyzicoConfig | AkbankConfig }>(session.contextCiphertext).config };
  }, { isolationLevel: 'ReadCommitted' });
  if (!prepared.dispatch) return serialize(prepared.row);
  try {
    if (prepared.provider === 'akbank') {
      await dispatchAkbankReversal(prepared.row, prepared.config as AkbankConfig, prepared.originalAmount, prepared.previousRefundAmount, finishPaymentReversal, actor.ipAddress ?? undefined);
    } else {
    const result = await iyzicoRequest(prepared.config as IyzicoConfig, input.kind === 'CANCEL' ? '/payment/cancel' : '/v2/payment/refund', {
      locale: 'tr', conversationId: prepared.row.id, paymentId: prepared.row.paymentId, ip: actor.ipAddress || '127.0.0.1',
      ...(input.kind === 'REFUND' ? { price: prepared.row.amount.toFixed(2), currency: prepared.row.currency } : {}),
    });
    if (result.status === 'success') {
      if (String(result.paymentId) !== prepared.row.paymentId || result.currency !== prepared.row.currency || !prepared.row.amount.eq(result.price ?? -1)) throw conflict('İade yanıtındaki ödeme veya tutar eşleşmiyor; sonuç sorgulanacak.');
      await finishPaymentReversal(prepared.row.id, true, String(result.refundHostReference ?? result.cancelHostReference ?? result.hostReference ?? prepared.row.id));
    } else {
      // HTTP/API errors and bank timeouts are ambiguous. Only explicit permanent validation/decline is terminal.
      if (['10005', '10012', '10051', '10223', '10237', '10245', '10246', '5086', '5087'].includes(String(result.errorCode)))
        await finishPaymentReversal(prepared.row.id, false, String(result.errorCode));
      else await db.paymentReversal.update({ where: { id: prepared.row.id }, data: { status: 'REVIEW', failureCode: 'PROVIDER_RESULT_PENDING' } });
    }
    }
  } catch {
    await db.paymentReversal.updateMany({ where: { id: prepared.row.id, status: 'PENDING' }, data: { status: 'REVIEW', failureCode: 'RESULT_UNCERTAIN' } });
  }
  publishChange();
  return serialize(await db.paymentReversal.findUniqueOrThrow({ where: { id: prepared.row.id } }));
}

async function finishPaymentReversal(id: string, success: boolean, reference: string, manual?: { actorId: string; reference: string }) {
  const changed = await db.$transaction(async tx => {
    const initial = await tx.paymentReversal.findUniqueOrThrow({ where: { id }, include: { order: true } });
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${initial.order.customerId} FOR UPDATE`;
    const row = await tx.paymentReversal.findUniqueOrThrow({ where: { id }, include: { order: true } });
    if (['SUCCEEDED', 'FAILED'].includes(row.status)) return false;
    if (manual && row.createdAt.getTime() > Date.now() - 3600000) throw conflict('Dış doğrulama yalnızca bir saattir sonuçlanmamış iadeler için yapılabilir.');
    if (!row.order.grantedAgreementId) throw conflict('İade kredi kaydı bulunamadı.');
    if (success) {
      await tx.creditRefundRequest.updateMany({ where: { orderId: row.orderId, status: 'OPEN' }, data: { status: 'RESOLVED', reviewedById: row.actorId } });
      const previous = await tx.paymentReversal.aggregate({ where: { orderId: row.orderId, status: 'SUCCEEDED' }, _sum: { credits: true } });
      const full = (previous._sum.credits ?? 0) + row.credits >= row.order.credits;
      await tx.creditOrder.update({ where: { id: row.orderId }, data: { status: full ? 'REFUNDED' : 'PARTIAL_REFUND' } });
      if (row.order.subscriptionId) {
        await tx.creditSubscription.update({ where: { id: row.order.subscriptionId }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: new Date(), nextPaymentOn: null } });
        await tx.creditOrder.updateMany({ where: { subscriptionId: row.order.subscriptionId, status: { in: ['PENDING', 'FAILED'] }, paymentAttempts: { none: { status: 'PENDING' } } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
      }
      await tx.agreement.update({ where: { id: row.order.grantedAgreementId }, data: { renewalRequested: false, ...(full ? { cancelledAt: new Date() } : {}) } });
      await tx.notification.create({ data: { userId: row.order.customerId, type: 'CREDIT_REFUND_COMPLETED', title: row.kind === 'CANCEL' ? 'Ödeme iptal edildi' : 'İade tamamlandı', message: '#' + row.order.number + ' · ' + row.amount.toFixed(2) + ' ' + row.currency + (row.kind === 'CANCEL' ? ' tutarındaki ödeme iptal edildi. Hesabınıza yansıma süresi kartınızın bankasına bağlıdır.' : ' iade edildi. Kartınıza yansıma süresi bankanıza bağlıdır.') } });
    } else {
      await tx.agreement.update({ where: { id: row.order.grantedAgreementId }, data: { credits: { increment: row.credits } } });
    }
    await tx.paymentReversal.update({ where: { id }, data: { status: success ? 'SUCCEEDED' : 'FAILED', completedAt: new Date(), nextCheckAt: null, providerReference: success ? reference.slice(0, 255) : null, failureCode: success ? null : reference.slice(0, 80) } });
    await tx.activityLog.create({ data: { userId: manual?.actorId ?? row.actorId, action: success ? 'credit_payment.reversed' : 'credit_payment.reversal_failed', entityType: 'PaymentReversal', entityId: row.id, metadata: { orderId: row.orderId, amount: row.amount.toFixed(2), credits: row.credits, reference, ...(manual ? { providerConfirmation: manual.reference } : {}) } } });
    return true;
  }, { isolationLevel: 'ReadCommitted' });
  publishChange();
  return changed;
}

export async function closeUnrefundedReversal(actor: Actor, id: string, raw: unknown) {
  paymentStaff(actor, true);
  const input = z.object({ confirmedNoRefund: z.literal(true), providerReference: z.string().trim().min(10).max(500) }).strict().parse(raw);
  try { await reconcilePaymentReversal(id); }
  catch (error) { if (!(error instanceof AppError) || !['PAYMENT_UNCERTAIN', 'PAYMENT_KEY_UNAVAILABLE'].includes(error.code)) throw error; }
  await finishPaymentReversal(id, false, 'MANUAL_NO_REFUND', { actorId: actor.id, reference: input.providerReference });
  return serialize(await db.paymentReversal.findUniqueOrThrow({ where: { id } }));
}

/** Query by the unique reversal conversation ID. Never resend a refund after a timeout. */
export async function reconcilePaymentReversal(id: string) {
  const row = await db.paymentReversal.findUniqueOrThrow({ where: { id } });
  if (!['PENDING', 'REVIEW'].includes(row.status)) return serialize(row);
  const attempt = await db.creditPaymentAttempt.findFirstOrThrow({ where: { orderId: row.orderId, providerPaymentId: row.paymentId, provider: { in: ['iyzico', 'akbank'] } } });
  const session = await db.paymentCheckoutSession.findUniqueOrThrow({ where: { attemptId: attempt.id } });
  const { config } = openPayment<{ config: IyzicoConfig | AkbankConfig }>(session.contextCiphertext);
  if (attempt.provider === 'akbank') {
    await reconcileAkbankReversal(row, config as AkbankConfig, finishPaymentReversal);
    await db.paymentReversal.updateMany({ where: { id, status: { in: ['PENDING', 'REVIEW'] } }, data: { nextCheckAt: new Date(Date.now() + 5 * 60_000) } });
    return serialize(await db.paymentReversal.findUniqueOrThrow({ where: { id } }));
  }
  const path = '/v2/reporting/payment/details?locale=tr&paymentId=' + encodeURIComponent(row.paymentId);
  const result = await iyzicoRequest(config as IyzicoConfig, path, {}, fetch, 'GET');
  if (result.status === 'success' && Array.isArray(result.payments)) {
    const payment = result.payments.find((v: any) => String(v.paymentId) === row.paymentId);
    const list = row.kind === 'CANCEL' ? payment?.cancels : payment?.itemTransactions?.flatMap((v: any) => v.refunds ?? []);
    const found = list?.find((v: any) => (row.kind === 'CANCEL' ? v.cancelConversationId : v.refundConversationId) === row.id);
    if (found && Number(found.refundStatus) === 1) {
      if (!row.amount.eq(found.refundPrice ?? -1) || found.currencyCode !== row.currency) throw new AppError(409, 'PAYMENT_MISMATCH', 'İade raporunun tutarı veya para birimi eşleşmiyor.');
      await finishPaymentReversal(id, true, String(found.refundTxId ?? found.refundId ?? row.id));
    }
  }
  await db.paymentReversal.updateMany({ where: { id, status: { in: ['PENDING', 'REVIEW'] } }, data: { nextCheckAt: new Date(Date.now() + 5 * 60_000) } });
  return serialize(await db.paymentReversal.findUniqueOrThrow({ where: { id } }));
}
export async function runPaymentReversalChecks() {
  const rows = await db.paymentReversal.findMany({ where: { status: { in: ['PENDING', 'REVIEW'] }, nextCheckAt: { lte: new Date() } }, orderBy: [{ nextCheckAt: 'asc' }, { id: 'asc' }], take: 25, select: { id: true } });
  for (const row of rows) try { await reconcilePaymentReversal(row.id); } catch { await db.paymentReversal.updateMany({ where: { id: row.id, status: { in: ['PENDING', 'REVIEW'] } }, data: { nextCheckAt: new Date(Date.now() + 5 * 60_000), status: 'REVIEW' } }); }
}
