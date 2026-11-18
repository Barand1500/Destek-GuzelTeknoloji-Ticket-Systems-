import type { Agreement, Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';

/** Renewal terms come only from the agreement; changing terms requires fresh owner consent. */
export async function syncAgreementRenewal(tx: Prisma.TransactionClient, agreement: Agreement) {
  const grantedOrder = await tx.creditOrder.findUnique({ where: { grantedAgreementId: agreement.id }, select: { subscriptionId: true, periodMonths: true, validityDays: true } });
  const existing = await tx.creditSubscription.findUnique({ where: { sourceAgreementId: agreement.id } }) ?? (grantedOrder?.subscriptionId ? await tx.creditSubscription.findUnique({ where: { id: grantedOrder.subscriptionId } }) : null);
  if (!agreement.renewalRequested || agreement.cancelledAt || agreement.deletedAt) {
    if (existing) {
      await tx.creditSubscription.update({ where: { id: existing.id }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: new Date(), nextPaymentOn: null } });
      await tx.creditOrder.updateMany({ where: { subscriptionId: existing.id, status: { in: ['PENDING', 'FAILED'] }, paymentAttempts: { none: { status: 'PENDING' } } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
    }
    return;
  }
  if (agreement.fee.lte(0)) throw new AppError(400, 'RENEWAL_PRICE_REQUIRED', 'Otomatik yenileme için anlaşmanın dönem tutarını girin.');
  const periodMonths = grantedOrder?.periodMonths ?? (agreement.type === 'MONTHLY' ? 1 : agreement.type === 'YEARLY' ? 12 : null);
  const periodDays = periodMonths ? null : grantedOrder?.validityDays ?? Math.round((agreement.endsOn.getTime() - agreement.startsOn.getTime()) / 86_400_000) + 1;
  if (periodDays && periodDays > 3650) throw new AppError(400, 'INVALID_RENEWAL_PERIOD', 'Otomatik yenileme dönemi en fazla 3.650 gün olabilir.');
  if (existing && existing.amount.eq(agreement.fee) && existing.currency === agreement.currency && existing.credits === agreement.credits && existing.periodMonths === periodMonths && existing.periodDays === periodDays) return;
  if (existing && await tx.creditPaymentAttempt.count({ where: { order: { subscriptionId: existing.id }, status: 'PENDING' } })) throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Ödeme sonucu beklenirken yenileme koşulları değiştirilemez.');
  if (existing) await tx.creditOrder.updateMany({ where: { subscriptionId: existing.id, status: { in: ['PENDING', 'FAILED'] }, paymentAttempts: { none: { status: 'PENDING' } } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
  const terms = { name: agreement.name, amount: agreement.fee, currency: agreement.currency, credits: agreement.credits, periodMonths, periodDays,
    status: 'AWAITING_CONSENT', autoRenew: false, consentedAt: null, stoppedAt: null,
    nextPaymentOn: new Date(Math.max(agreement.endsOn.getTime(), existing?.currentEndsOn?.getTime() ?? 0) + 86_400_000),
    provider: null, paymentMethodRef: null };
  if (existing) await tx.creditSubscription.update({ where: { id: existing.id }, data: terms });
  else await tx.creditSubscription.create({ data: { ...terms, customerId: agreement.customerId, sourceAgreementId: agreement.id } });
}
