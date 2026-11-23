import { db } from '../config/db.js';
import type { PaymentReversal } from '../generated/prisma/client.js';

type ReversalRef = Pick<PaymentReversal, 'id' | 'orderId' | 'kind' | 'amount' | 'currency' | 'actorId'>;
type BankResponse = {
  provider: 'akbank' | 'iyzico';
  /** REJECTED: the bank refused the request. PENDING: answered without a final result. NO_RESPONSE: no usable answer. */
  outcome: 'REJECTED' | 'PENDING' | 'NO_RESPONSE';
  code?: unknown;
  message?: unknown;
};

const text = (value: unknown, max: number) =>
  typeof value === 'string' || typeof value === 'number'
    ? String(value).replace(/[\u0000-\u001f]/g, ' ').trim().slice(0, max) || undefined
    : undefined;

/**
 * Records what the bank answered to a refund/cancel request so support can see why a reversal is waiting.
 * Only the response code and a short message are stored; card data, hashes and raw payloads are never logged.
 * Logging must never change the outcome of the refund itself.
 */
export async function logReversalBankResponse(row: ReversalRef, info: BankResponse) {
  const bankResponseCode = text(info.code, 40);
  const bankMessage = text(info.message, 200);
  console.warn('[Ödeme iadesi] Banka yanıtı', { reversalId: row.id, provider: info.provider, outcome: info.outcome, code: bankResponseCode ?? null });
  try {
    const order = await db.creditOrder.findUnique({ where: { id: row.orderId }, select: { number: true } });
    await db.activityLog.create({
      data: {
        userId: row.actorId,
        action: 'credit_payment.bank_response',
        entityType: 'PaymentReversal',
        entityId: row.id,
        metadata: {
          orderId: row.orderId,
          ...(order ? { orderNumber: order.number } : {}),
          kind: row.kind,
          amount: row.amount.toFixed(2),
          currency: row.currency,
          provider: info.provider,
          outcome: info.outcome,
          ...(bankResponseCode ? { bankResponseCode } : {}),
          ...(bankMessage ? { bankMessage } : {}),
        },
      },
    });
  } catch {
    // Keep the refund flow independent from logging problems.
  }
}
