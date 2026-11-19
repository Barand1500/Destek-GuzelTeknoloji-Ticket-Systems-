import type { Prisma } from '../generated/prisma/client.js';
import { billingBoundary, billingToday } from './credit-billing.js';
import { AppError } from '../utils/errors.js';

type ScheduleClient = Pick<Prisma.TransactionClient, 'agreement' | 'creditOrder'>;
export async function packageSchedule(client: ScheduleClient, customerId: string, months: number | null, days: number | null) {
  const today = billingToday();
  const current = await client.agreement.findFirst({
    where: { customerId, deletedAt: null, cancelledAt: null, endsOn: { gte: today }, type: { not: 'ONE_OFF' } },
    orderBy: [{ endsOn: 'desc' }, { id: 'asc' }], select: { id: true, name: true, endsOn: true,
      sourceSubscription: { select: { autoRenew: true, status: true } },
      grantedOrder: { select: { subscription: { select: { autoRenew: true, status: true } } } },
    },
  });
  const queued = await client.creditOrder.findFirst({
    where: { customerId, kind: 'SUBSCRIPTION', status: { in: ['PENDING', 'FAILED'] } }, select: { id: true, number: true },
  });
  if (queued) throw new AppError(409, 'PACKAGE_ORDER_EXISTS', `#${queued.number} numaralı paket siparişiniz zaten bekliyor. Önce bu siparişi tamamlayın veya iptal edin.`);
  const start = current ? new Date(current.endsOn.getTime() + 86_400_000) : today;
  const end = new Date(billingBoundary(start, months, days, 1).getTime() - 86_400_000);
  return {
    startsOn: start.toISOString().slice(0, 10), endsOn: end.toISOString().slice(0, 10),
    currentPackage: current ? { id: current.id, name: current.name, endsOn: current.endsOn.toISOString().slice(0, 10), remainingDays: Math.ceil((start.getTime() - today.getTime()) / 86_400_000), autoRenew: [current.sourceSubscription, current.grantedOrder?.subscription].some(row => row?.autoRenew && row.status !== 'STOPPED') } : null,
  };
}

/** Recheck under the account lock immediately before dispatch: staff may have extended a period. */
export async function refreshPackageStart(tx: Prisma.TransactionClient, order: {
  id: string; customerId: string; kind: string; subscriptionId: string | null; periodNumber: number | null;
  periodStartsOn: Date | null; periodEndsOn: Date | null; periodMonths: number | null; validityDays: number | null;
}) {
  if (order.kind !== 'SUBSCRIPTION' || !order.periodStartsOn) return;
  const conflict = await tx.agreement.findFirst({ where: { customerId: order.customerId, deletedAt: null, cancelledAt: null, type: { not: 'ONE_OFF' }, endsOn: { gte: order.periodStartsOn } }, orderBy: { endsOn: 'desc' }, select: { endsOn: true } });
  if (!conflict) return;
  const start = new Date(conflict.endsOn.getTime() + 86_400_000);
  const end = new Date(billingBoundary(start, order.periodMonths, order.validityDays, 1).getTime() - 86_400_000);
  await tx.creditOrder.update({ where: { id: order.id }, data: { periodStartsOn: start, periodEndsOn: end } });
  order.periodStartsOn = start;
  order.periodEndsOn = end;
  if (order.subscriptionId) await tx.creditSubscription.update({ where: { id: order.subscriptionId }, data: { anchorOn: start, anchorPeriod: (order.periodNumber ?? 1) - 1, nextPaymentOn: start } });
}
