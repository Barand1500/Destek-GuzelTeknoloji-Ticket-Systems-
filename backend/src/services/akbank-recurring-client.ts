import { AppError } from '../utils/errors.js';
import { akbankCardInput, akbankCurrency, akbankRequest, type AkbankConfig } from './akbank-client.js';

/** Bank-managed schedules are finite, with 2..120 occurrences inside ten years. */
export function akbankRecurringTerms(months: number | null, days: number | null) {
  let frequencyCycle: 'M' | 'D' | 'W' = 'M', frequencyInterval = months ?? 0;
  if (days) { frequencyCycle = days <= 99 ? 'D' : 'W'; frequencyInterval = days <= 99 ? days : days / 7; }
  const numberOfPayments = Math.min(120, Math.floor(days ? 3650 / days : 120 / (months || 121)));
  if (!Number.isInteger(frequencyInterval) || frequencyInterval < 1 || frequencyInterval > 99 || numberOfPayments < 2)
    throw new AppError(400, 'AKBANK_RECURRING_PERIOD_UNSUPPORTED', 'Bu dönem Akbank otomatik tahsilat aralığına uygun değil.');
  return { frequencyCycle, frequencyInterval, numberOfPayments };
}

type Terms = ReturnType<typeof akbankRecurringTerms>;
export async function registerAkbankInstruction(config: AkbankConfig, input: { trackId: string; startsOn: string; amount: string; currency: string; terms: Terms; card: unknown }) {
  const card = akbankCardInput.parse(input.card);
  if (!akbankCurrency[input.currency]) throw new AppError(400, 'PAYMENT_CURRENCY_UNSUPPORTED', 'Bu para birimi Akbank için desteklenmiyor.');
  // Card fields are transient request data. Never persist this body or retry an ambiguous registration.
  const result = await akbankRequest(config, '1011', {
    order: { orderTrackId: input.trackId },
    card: { cardNumber: card.number, expireDate: card.expiry, cvv2: card.cvc, cardHolderName: card.holder },
    recurring: input.terms, plannedDate: { firstPlannedDate: input.startsOn },
    transaction: { amount: input.amount, currencyCode: Number(akbankCurrency[input.currency]), motoInd: 1, installCount: 1 },
  });
  if (result.responseCode === 'VPS-0000' && result.order?.orderTrackId !== input.trackId) throw new AppError(503, 'PAYMENT_UNCERTAIN', 'Akbank yenileme talimatının sonucu doğrulanamadı.');
  return { accepted: result.responseCode === 'VPS-0000', code: /^VPS-\d{4}$/.test(result.responseCode) ? result.responseCode as string : null };
}

export async function queryAkbankInstruction(config: AkbankConfig, trackId: string) {
  const result = await akbankRequest(config, '1010', { order: { orderTrackId: trackId } });
  if (result.responseCode !== 'VPS-0000' || !Array.isArray(result.txnDetailList) || result.txnDetailList.length > 120 || result.txnDetailList.some((row: any) => row.orderTrackId !== trackId))
    throw new AppError(503, 'PAYMENT_UNCERTAIN', 'Akbank yenileme talimatı henüz doğrulanamadı.');
  return result.txnDetailList as Record<string, any>[];
}

/** Omit recurringOrder: Akbank cancels all future occurrences, rather than only one. */
export async function cancelAkbankInstruction(config: AkbankConfig, trackId: string) {
  const result = await akbankRequest(config, '1013', { order: { orderTrackId: trackId } });
  if (result.responseCode !== 'VPS-0000' || result.order?.orderTrackId !== trackId)
    throw new AppError(503, 'PAYMENT_UNCERTAIN', 'Bankadaki gelecek tahsilatların iptali henüz doğrulanamadı.');
}
