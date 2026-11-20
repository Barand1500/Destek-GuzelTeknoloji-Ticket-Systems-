import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';
import type { VerifiedPayment } from './credit-subscriptions.service.js';

export type AkbankConfig = { merchantSafeId: string; terminalSafeId: string; secretKey: string; mode: 'sandbox' | 'production' };
export const akbankCurrency: Record<string, string> = { TRY: '949', USD: '840', EUR: '978', GBP: '826' };
export const akbankNoTransaction = new Set(['VPS-1007', 'VPS-1123', 'VPS-2160']);
export const akbankHash = (body: string, secret: string) => createHmac('sha512', secret).update(body, 'utf8').digest('base64');
export const akbankDate = () => new Date().toISOString().slice(0, -1);
function luhn(value: string) { let sum = 0; for (let i = value.length - 1, doubled = false; i >= 0; i--, doubled = !doubled) { let n = Number(value[i]); if (doubled) { n *= 2; if (n > 9) n -= 9; } sum += n; } return sum % 10 === 0; }
export const akbankCardInput = z.object({
  holder: z.string().trim().min(2).max(100),
  number: z.string().regex(/^\d{13,19}$/).refine(luhn, 'Kart numarasını kontrol edin.'),
  expiry: z.string().regex(/^(0[1-9]|1[0-2])\d{2}$/).refine(value => {
    const end = new Date(Date.UTC(2000 + Number(value.slice(2)), Number(value.slice(0, 2)), 1));
    return end > new Date();
  }, 'Kartın son kullanım tarihi geçmiş.'),
  cvc: z.string().regex(/^\d{3}$/),
}).strict();
type Card = z.infer<typeof akbankCardInput>;
/** Akbank's optional telephone field uses country-prefix and national number, e.g. 090-5321234567. */
function bankPhone(value: string) {
  const digits = value.replace(/\D/g, '');
  const national = digits.replace(/^(?:0090|090|90|0)(?=\d{10}$)/, '');
  return /^\d{10}$/.test(national) ? '090-' + national : '';
}
const requestFields = ['paymentModel', 'txnCode', 'merchantSafeId', 'terminalSafeId', 'orderId', 'lang', 'amount', 'ccbRewardAmount', 'pcbRewardAmount', 'xcbRewardAmount', 'currencyCode', 'installCount', 'okUrl', 'failUrl', 'emailAddress', 'mobilePhone', 'homePhone', 'workPhone', 'subMerchantId', 'creditCard', 'expiredDate', 'cvv', 'cardHolderName', 'randomNumber', 'requestDateTime', 'b2bIdentityNumber', 'merchantData', 'merchantBranchNo', 'mobileEci', 'walletProgramData', 'mobileAssignedId', 'mobileDeviceType'];
export function akbankForm(config: AkbankConfig, input: { orderId: string; amount: string; currency: string; callbackUrl: string; email: string; phone: string; card: Card }) {
  const currencyCode = akbankCurrency[input.currency];
  if (!currencyCode) throw new AppError(400, 'PAYMENT_CURRENCY_UNSUPPORTED', 'Akbank için bu para birimi desteklenmiyor.');
  const fields: Record<string, string> = { paymentModel: '3D_PAY', txnCode: '3000', merchantSafeId: config.merchantSafeId, terminalSafeId: config.terminalSafeId,
    orderId: input.orderId, lang: 'TR', amount: input.amount, ccbRewardAmount: '0.00', pcbRewardAmount: '0.00', xcbRewardAmount: '0.00', currencyCode, installCount: '1',
    okUrl: input.callbackUrl, failUrl: input.callbackUrl, emailAddress: input.email, mobilePhone: bankPhone(input.phone),
    creditCard: input.card.number, expiredDate: input.card.expiry, cvv: input.card.cvc, cardHolderName: input.card.holder,
    randomNumber: randomBytes(64).toString('hex'), requestDateTime: akbankDate() };
  fields.hash = akbankHash(requestFields.map(key => fields[key] ?? '').join(''), config.secretKey);
  return { action: config.mode === 'production' ? 'https://virtualpospaymentgateway.akbank.com/securepay' : 'https://virtualpospaymentgatewaypre.akbank.com/securepay', fields };
}

/** Verify the bank's dynamic callback signature and bind it to this merchant and attempt. */
export function verifyAkbankCallback(config: AkbankConfig, raw: unknown, attemptId: string, amount: string): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const value = raw as Record<string, unknown>;
  if (Object.values(value).some(v => typeof v !== 'string' || v.length > 4000)) return false;
  const v = value as Record<string, string>;
  const keys = v.hashParams?.split('+');
  if (!keys || keys.length > 100 || new Set(keys).size !== keys.length || keys.some(k => !/^[a-zA-Z][a-zA-Z0-9]{0,79}$/.test(k) || !Object.hasOwn(v, k) || ['hash', 'hashParams'].includes(k))) return false;
  if (['responseCode', 'merchantSafeId', 'terminalSafeId', 'orderId'].some(k => !keys.includes(k))) return false;
  const expected = akbankHash(keys.map(key => v[key]).join(''), config.secretKey);
  const actual = v.hash ?? '';
  if (!/^[A-Za-z0-9+/]{86}==$/.test(actual) || actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return false;
  try {
    return v.merchantSafeId === config.merchantSafeId &&
      v.terminalSafeId === config.terminalSafeId &&
      v.orderId === attemptId &&
      (!v.txnCode || v.txnCode === '1000' || v.txnCode === '3000') &&
      (!v.installCount || Number(v.installCount) === 1) &&
      (!v.amount || new Prisma.Decimal(v.amount).eq(amount));
  } catch { return false; }
}

/** Fixed bank endpoint; never log raw bank payloads. Recurring registration may contain transient card fields. */
export async function akbankRequest(config: AkbankConfig, txnCode: '1010' | '1002' | '1003' | '1013', input: Record<string, unknown>, fetcher: typeof fetch = fetch): Promise<Record<string, any>> {
  const body = JSON.stringify({ version: '1.00', txnCode, requestDateTime: akbankDate(), randomNumber: randomBytes(64).toString('hex'), terminal: { merchantSafeId: config.merchantSafeId, terminalSafeId: config.terminalSafeId }, ...input });
  try {
    const response = await fetcher((config.mode === 'production' ? 'https://api.akbank.com' : 'https://apipre.akbank.com') + '/api/v1/payment/virtualpos/transaction/process', {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000), headers: { 'Content-Type': 'application/json', Accept: 'application/json', 'auth-hash': akbankHash(body, config.secretKey) }, body,
    });
    if (!response.ok) throw Error('HTTP');
    const reader = response.body?.getReader();
    if (!reader) throw Error('BODY');
    const chunks: Uint8Array[] = []; let size = 0;
    try { while (true) { const next = await reader.read(); if (next.done) break; size += next.value.byteLength; if (size > 512000) throw Error('SIZE'); chunks.push(next.value); } } finally { await reader.cancel().catch(() => {}); }
    const text = Buffer.concat(chunks).toString('utf8');
    const expectedHash = akbankHash(text, config.secretKey), responseHash = response.headers.get('auth-hash') ?? '';
    if (!/^[A-Za-z0-9+/]{86}==$/.test(responseHash) || responseHash.length !== expectedHash.length || !timingSafeEqual(Buffer.from(responseHash), Buffer.from(expectedHash))) throw Error('SIGNATURE');
    const result = JSON.parse(text);
    if (!result || typeof result.responseCode !== 'string') throw Error('FORMAT');
    if (result.responseCode === 'VPS-0000' && (String(result.txnCode) !== txnCode || result.terminal?.merchantSafeId !== config.merchantSafeId || result.terminal?.terminalSafeId !== config.terminalSafeId)) throw Error('BINDING');
    return result;
  } catch { throw new AppError(503, 'PAYMENT_UNCERTAIN', 'Akbank sonucu alınamadı. İşlem tekrar gönderilmeden sorgulanacak.'); }
}
export async function akbankInquiry(config: AkbankConfig, paymentId: string) {
  const result = await akbankRequest(config, '1010', { order: { orderId: paymentId } });
  if (String(result.txnCode) === '1010' && akbankNoTransaction.has(result.responseCode)) return [];
  if (result.responseCode !== 'VPS-0000' || !Array.isArray(result.txnDetailList)) throw new AppError(503, 'PAYMENT_UNCERTAIN', 'Akbank işlemi henüz doğrulanamadı.');
  return result.txnDetailList as Record<string, any>[];
}
export function akbankSaleResult(rows: Record<string, any>[], expected: { attemptId: string; amount: string; currency: string }): VerifiedPayment | null {
  const matches = rows.filter(v => v.orderId === expected.attemptId && String(v.txnCode) === '1000');
  if (matches.length !== 1) return null;
  const sale = matches[0];
  if (sale.responseCode !== 'VPS-0000' || sale.hostResponseCode !== '00' || sale.txnStatus !== 'N') return null;
  if (String(sale.currencyCode) !== akbankCurrency[expected.currency] || Number(sale.installCount) !== 1 || !new Prisma.Decimal(sale.amount ?? -1).eq(expected.amount)) throw new AppError(409, 'PAYMENT_MISMATCH', 'Akbank ödeme tutarı veya para birimi eşleşmiyor.');
  return { attemptId: expected.attemptId, provider: 'akbank', paymentId: expected.attemptId, amount: expected.amount, currency: expected.currency, outcome: 'PAID' };
}
