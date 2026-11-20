import { db } from '../config/db.js';

/** Retirement only. Never starts a payment or creates a bank instruction. */
export async function retireAutomaticRenewals() {
  await db.$transaction(async tx => {
    await tx.paymentGatewaySettings.updateMany({ where: { recurringEnabled: true }, data: { recurringEnabled: false } });
    await tx.creditSubscription.updateMany({ where: { OR: [{ autoRenew: true }, { nextPaymentOn: { not: null } }] }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: new Date(), nextPaymentOn: null } });
    await tx.akbankRecurringInstruction.updateMany({ where: { state: { in: ['REGISTERING', 'REVIEW', 'ACTIVE'] } }, data: { state: 'STOP_REQUESTED', nextCheckAt: new Date() } });
  });
}
