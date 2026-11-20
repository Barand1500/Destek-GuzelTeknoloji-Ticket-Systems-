import { requestAkbankInstructionStop } from './akbank-recurring-state.js';
import type { Agreement, Prisma } from '../generated/prisma/client.js';

/** Retire historical renewal state; agreements can no longer offer new renewals. */
export async function syncAgreementRenewal(tx: Prisma.TransactionClient, agreement: Agreement) {
  const grantedOrder = await tx.creditOrder.findUnique({ where: { grantedAgreementId: agreement.id }, select: { subscriptionId: true } });
  const existing = await tx.creditSubscription.findUnique({ where: { sourceAgreementId: agreement.id } }) ?? (grantedOrder?.subscriptionId ? await tx.creditSubscription.findUnique({ where: { id: grantedOrder.subscriptionId } }) : null);
  if (!existing) return;
  await tx.creditSubscription.update({ where: { id: existing.id }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: new Date(), nextPaymentOn: null } });
  await requestAkbankInstructionStop(tx, existing.id);
  await tx.creditOrder.updateMany({ where: { subscriptionId: existing.id, status: { in: ['PENDING', 'FAILED'] }, paymentAttempts: { none: { status: 'PENDING' } } }, data: { status: 'CANCELLED', cancelledAt: new Date() } });
}
