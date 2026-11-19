import { db } from '../config/db.js';
import { Prisma, type PaymentReversal } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';
import { sealPayment, openPayment } from './payment-secrets.js';
import { akbankCurrency, akbankInquiry, akbankRequest, type AkbankConfig } from './akbank-client.js';
import { queryAkbankInstruction } from './akbank-recurring-client.js';
import { akbankOccurrence } from './akbank-recurring-state.js';

type Finish = (id: string, success: boolean, reference: string) => Promise<unknown>;
type Baseline = { ids: string[]; total: string };
const mismatch = () => new AppError(409, 'PAYMENT_MISMATCH', 'Akbank iade raporu doğrulanamadı. İşlemi bankadan kontrol edin.');
const refundKey = (v: Record<string, any>) => String(v.orderId) + ':' + String(v.rrn) + ':' + String(v.stan);
export function akbankRefundRows(rows: Record<string, any>[], paymentId: string, currency: string) {
  return rows.filter(v => String(v.txnCode) === '1002' && v.orgOrderId === paymentId && v.responseCode === 'VPS-0000' && v.hostResponseCode === '00' && v.txnStatus === 'N').map(v => {
    if (typeof v.orderId !== 'string' || !v.rrn || v.stan === undefined || String(v.currencyCode) !== akbankCurrency[currency] || !new Prisma.Decimal(v.amount ?? -1).gt(0)) throw mismatch();
    return { id: refundKey(v), amount: new Prisma.Decimal(v.amount) };
  });
}
export async function dispatchAkbankReversal(row: PaymentReversal, config: AkbankConfig, originalAmount: string, previousRefundAmount: string, finish: Finish, ip?: string) {
  if (akbankOccurrence(row.paymentId)) return dispatchRecurringReversal(row, config, originalAmount, previousRefundAmount, finish);
  // Akbank assigns refund order IDs. Persist the pre-request ledger so uncertain results can be matched without resending.
  const rows = await akbankInquiry(config, row.paymentId);
  const sale = rows.find(v => v.orderId === row.paymentId && String(v.txnCode) === '1000');
  if (!sale || sale.responseCode !== 'VPS-0000' || sale.txnStatus !== 'N' || String(sale.currencyCode) !== akbankCurrency[row.currency] || !new Prisma.Decimal(sale.amount ?? -1).eq(originalAmount)) throw mismatch();
  const refunds = akbankRefundRows(rows, row.paymentId, row.currency);
  const total = refunds.reduce((sum, v) => sum.add(v.amount), new Prisma.Decimal(0));
  if (!total.eq(previousRefundAmount)) throw mismatch();
  const baseline: Baseline = { ids: refunds.map(v => v.id), total: total.toFixed(2) };
  await db.paymentReversal.update({ where: { id: row.id }, data: { contextCiphertext: sealPayment(baseline) } });
  const result = await akbankRequest(config, row.kind === 'CANCEL' ? '1003' : '1002', {
    order: { orderId: row.paymentId },
    ...(row.kind === 'REFUND' ? { transaction: { amount: row.amount.toFixed(2), currencyCode: Number(akbankCurrency[row.currency]) } } : {}),
    ...(ip ? { customer: { ipAddress: ip } } : {}),
  });
  // Signed pre-dispatch validation failures are definitive: restore the reserved credit once.
  if (['VPS-1001', 'VPS-1003', 'VPS-1007', 'VPS-1015', 'VPS-1019', 'VPS-1020', 'VPS-1021', 'VPS-1035', 'VPS-1042', 'VPS-2151'].includes(result.responseCode)) {
    await finish(row.id, false, result.responseCode);
    return;
  }
  if (result.responseCode !== 'VPS-0000' || result.order?.orderId !== row.paymentId) {
    await db.paymentReversal.updateMany({ where: { id: row.id, status: 'PENDING' }, data: { status: 'REVIEW', failureCode: 'BANK_RESULT_PENDING' } });
    return;
  }
  // Even a successful acknowledgment must match a completed bank ledger operation.
  await reconcileAkbankReversal({ ...row, contextCiphertext: sealPayment(baseline) }, config, finish);
}
export async function reconcileAkbankReversal(row: PaymentReversal, config: AkbankConfig, finish: Finish) {
  if (akbankOccurrence(row.paymentId)) return reconcileRecurringReversal(row, config, finish);
  if (!row.contextCiphertext) return;
  const baseline = openPayment<Baseline>(row.contextCiphertext);
  const rows = await akbankInquiry(config, row.paymentId);
  if (row.kind === 'CANCEL') {
    const sale = rows.find(v => v.orderId === row.paymentId && String(v.txnCode) === '1000');
    if (sale?.txnStatus === 'V' && sale.responseCode === 'VPS-0000') {
      if (String(sale.currencyCode) !== akbankCurrency[row.currency] || !new Prisma.Decimal(sale.amount ?? -1).eq(row.amount)) throw mismatch();
      await finish(row.id, true, String(sale.rrn || row.paymentId));
    }
    return;
  }
  const refunds = akbankRefundRows(rows, row.paymentId, row.currency);
  const newRefunds = refunds.filter(v => !baseline.ids.includes(v.id));
  if (!newRefunds.length) return;
  const total = refunds.reduce((sum, v) => sum.add(v.amount), new Prisma.Decimal(0));
  if (newRefunds.length !== 1 || !newRefunds[0].amount.eq(row.amount) || !total.sub(baseline.total).eq(row.amount)) throw mismatch();
  await finish(row.id, true, newRefunds[0].id);
}

async function recurringSale(row: PaymentReversal, config: AkbankConfig) {
  const identity = akbankOccurrence(row.paymentId)!;
  const rows = await queryAkbankInstruction(config, identity.trackId);
  const matches = rows.filter(sale => Number(sale.recurringOrder) === identity.sequence);
  const sale = matches.length === 1 ? matches[0] : null;
  if (!sale || sale.requestType !== 'R' || String(sale.txnCode) !== '1000' || Number(sale.installCount) !== 1 || String(sale.currencyCode) !== akbankCurrency[row.currency]) throw mismatch();
  const total = new Prisma.Decimal(sale.totalRefundAmount ?? 0);
  const amount = new Prisma.Decimal(sale.amount ?? -1);
  if (total.lt(0) || total.gt(amount) || !amount.gt(0)) throw mismatch();
  return { identity, sale, total, amount };
}
async function dispatchRecurringReversal(row: PaymentReversal, config: AkbankConfig, originalAmount: string, previousRefundAmount: string, finish: Finish) {
  const { identity, sale, total, amount } = await recurringSale(row, config);
  if (sale.requestStatus !== 'S' || !amount.eq(originalAmount) || !total.eq(previousRefundAmount)) throw mismatch();
  const baseline = { total: total.toFixed(2), originalAmount };
  await db.paymentReversal.update({ where: { id: row.id }, data: { contextCiphertext: sealPayment(baseline) } });
  const result = await akbankRequest(config, row.kind === 'CANCEL' ? '1003' : '1002', {
    order: { orderTrackId: identity.trackId }, recurring: { recurringOrder: identity.sequence },
    ...(row.kind === 'REFUND' ? { transaction: { amount: row.amount.toFixed(2), currencyCode: Number(akbankCurrency[row.currency]) } } : {}),
  });
  if (['VPS-1001', 'VPS-1003', 'VPS-1007', 'VPS-1015', 'VPS-1019', 'VPS-1020', 'VPS-1021', 'VPS-1035', 'VPS-1042', 'VPS-2151'].includes(result.responseCode)) {
    await finish(row.id, false, result.responseCode); return;
  }
  // An acknowledgment is not settlement. Recover by the original recurring occurrence only.
  await reconcileRecurringReversal({ ...row, contextCiphertext: sealPayment(baseline) }, config, finish);
}
async function reconcileRecurringReversal(row: PaymentReversal, config: AkbankConfig, finish: Finish) {
  if (!row.contextCiphertext) return;
  const baseline = openPayment<{ total: string; originalAmount: string }>(row.contextCiphertext);
  const { sale, total, amount } = await recurringSale(row, config);
  if (!amount.eq(baseline.originalAmount)) throw mismatch();
  if (row.kind === 'CANCEL') {
    if (sale.requestStatus === 'V' && amount.eq(row.amount)) await finish(row.id, true, row.paymentId);
  } else if (sale.requestStatus === 'S') {
    const difference = total.sub(baseline.total);
    if (difference.eq(row.amount)) await finish(row.id, true, row.paymentId + ':refund:' + total.toFixed(2));
    else if (!difference.eq(0)) throw mismatch();
  }
}
