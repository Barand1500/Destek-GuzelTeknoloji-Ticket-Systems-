import type { Prisma } from '../generated/prisma/client.js';

export const akbankInstructionTerminal = ['STOPPED', 'FAILED', 'COMPLETED'];
/** Preserve the registration grace period: stop must not overtake an in-flight bank registration. */
export async function requestAkbankInstructionStop(tx: Prisma.TransactionClient, subscriptionId: string) {
  return tx.akbankRecurringInstruction.updateMany({ where: { subscriptionId, state: { notIn: akbankInstructionTerminal } }, data: { state: 'STOP_REQUESTED' } });
}
export function akbankOccurrence(paymentId: string) {
  const match = /^akbrec:([0-9a-f-]{36}):([1-9][0-9]{0,2})$/.exec(paymentId);
  return match && Number(match[2]) <= 120 ? { trackId: match[1], sequence: Number(match[2]) } : null;
}
