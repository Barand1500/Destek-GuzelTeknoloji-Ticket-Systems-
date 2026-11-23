import { db } from '../config/db.js';
import type { PaymentReversal } from '../generated/prisma/client.js';
import { nestpayCancelOrder, nestpayInquireOrder, nestpayRefundOrder, type NestpayConfig } from './nestpay-client.js';
import { logReversalBankResponse } from './payment-reversal-log.js';

type Finish = (id: string, success: boolean, reference: string) => Promise<unknown>;

export async function dispatchNestpayReversal(row: PaymentReversal, config: NestpayConfig, finish: Finish) {
  const reply = row.kind === 'CANCEL'
    ? await nestpayCancelOrder(config, row.paymentId)
    : await nestpayRefundOrder(config, row.paymentId, row.amount.toFixed(2), row.currency);
  if (reply.response === 'Approved' && reply.procReturnCode === '00') {
    await finish(row.id, true, reply.transId || row.paymentId);
    return;
  }
  if (reply.response === 'Declined' || reply.response === 'Error') {
    await logReversalBankResponse(row, { provider: config.bankId, outcome: 'REJECTED', code: reply.procReturnCode || reply.response, message: reply.errMsg });
    await finish(row.id, false, reply.procReturnCode || 'BANK_DECLINED');
    return;
  }
  await logReversalBankResponse(row, { provider: config.bankId, outcome: 'PENDING', code: reply.procReturnCode || reply.response, message: reply.errMsg });
  await db.paymentReversal.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'REVIEW', failureCode: 'BANK_RESULT_PENDING' } });
}

export async function reconcileNestpayReversal(row: PaymentReversal, config: NestpayConfig, finish: Finish) {
  const reply = await nestpayInquireOrder(config, row.paymentId);
  const status = reply.orderStatus.toUpperCase();
  if (row.kind === 'CANCEL' && reply.response === 'Approved' && (status.includes('VOID') || status.includes('CANCEL'))) {
    await finish(row.id, true, reply.transId || row.paymentId);
  }
}
