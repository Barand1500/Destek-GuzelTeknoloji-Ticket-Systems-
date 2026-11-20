import { AppError } from '../utils/errors.js';
import { akbankRequest, type AkbankConfig } from './akbank-client.js';

/** Shape retained only to read and cancel historical bank instructions. */
export type LegacyAkbankTerms = { frequencyCycle: 'M' | 'D' | 'W'; frequencyInterval: number; numberOfPayments: number };
export async function registerAkbankInstruction(config: AkbankConfig, input: { trackId: string; startsOn: string; amount: string; currency: string; terms: LegacyAkbankTerms; card: unknown }) {
  void config; void input;
  throw new AppError(410, 'RENEWAL_DISABLED', 'Otomatik yenileme kaldırıldı. Bu işlem kullanılamıyor.');
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
