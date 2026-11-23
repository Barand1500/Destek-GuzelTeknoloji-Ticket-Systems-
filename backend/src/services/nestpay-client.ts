import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';
import { akbankCardInput, akbankCurrency } from './akbank-client.js';
import { getNestpayBank } from './payment-gateways.catalog.js';
import type { VerifiedPayment } from './credit-subscriptions.service.js';
import type { z } from 'zod';

export type NestpayConfig = {
  bankId: string;
  clientId: string;
  storeKey: string;
  apiUser: string;
  apiPassword: string;
  mode: 'sandbox' | 'production';
};

type Card = z.infer<typeof akbankCardInput>;

export const nestpayCurrency: Record<string, string> = akbankCurrency;

/** Escapes `\` and `|` as required by NestPay Hash Ver3 specification. */
function escapeVer3(value: string) {
  return value.replace(/\\/g, '\\\\').replace(/\|/g, '\\|');
}

export function nestpayHashVer3(params: Record<string, string>, storeKey: string) {
  const keys = Object.keys(params)
    .filter(k => !['hash', 'encoding', 'countdown'].includes(k.toLowerCase()))
    .sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase(), 'en-US'));
  const plain = keys.map(k => escapeVer3(params[k] ?? '')).join('|') + '|' + escapeVer3(storeKey);
  return createHash('sha512').update(plain, 'utf8').digest('base64');
}

export function escapeXml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function xmlTag(xml: string, tag: string): string | undefined {
  const match = new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i').exec(xml);
  return match?.[1]?.trim();
}

export function nestpayForm(
  config: NestpayConfig,
  input: { orderId: string; amount: string; currency: string; callbackUrl: string; email: string; card: Card },
) {
  const bank = getNestpayBank(config.bankId);
  if (!bank) throw new AppError(400, 'PAYMENT_PROVIDER_INVALID', 'Desteklenmeyen banka sağlayıcısı.');
  const currencyCode = nestpayCurrency[input.currency];
  if (!currencyCode) throw new AppError(400, 'PAYMENT_CURRENCY_UNSUPPORTED', `${bank.shortName} için bu para birimi desteklenmiyor.`);
  const fields: Record<string, string> = {
    clientid: config.clientId,
    storetype: '3d_pay',
    trantype: 'Auth',
    amount: input.amount,
    currency: currencyCode,
    oid: input.orderId,
    okUrl: input.callbackUrl,
    failUrl: input.callbackUrl,
    lang: 'tr',
    rnd: randomBytes(16).toString('hex'),
    hashAlgorithm: 'ver3',
    encoding: 'UTF-8',
    pan: input.card.number,
    Ecom_Payment_Card_ExpDate_Month: input.card.expiry.slice(0, 2),
    Ecom_Payment_Card_ExpDate_Year: input.card.expiry.slice(2, 4),
    cv2: input.card.cvc,
    ...(input.email ? { email: input.email } : {}),
  };
  fields.hash = nestpayHashVer3(fields, config.storeKey);
  return {
    action: config.mode === 'production' ? bank.production3dUrl : bank.sandbox3dUrl,
    fields,
  };
}

/** Verifies NestPay Hash Ver3 callback signature and binds clientid, oid and amount. */
export function verifyNestpayCallback(config: NestpayConfig, raw: unknown, attemptId: string, amount: string): boolean {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false;
  const entries = Object.entries(raw as Record<string, unknown>);
  if (entries.length > 120 || entries.some(([, v]) => typeof v !== 'string' || v.length > 4000)) return false;
  const params = Object.fromEntries(entries) as Record<string, string>;
  const actual = params.HASH ?? params.hash ?? '';
  if (!actual || !/^[A-Za-z0-9+/]{86}==$/.test(actual)) return false;
  const expected = nestpayHashVer3(params, config.storeKey);
  if (actual.length !== expected.length || !timingSafeEqual(Buffer.from(actual), Buffer.from(expected))) return false;
  try {
    const client = params.clientid ?? params.clientId;
    const oid = params.oid ?? params.ReturnOid;
    return client === config.clientId && oid === attemptId && (!params.amount || new Prisma.Decimal(params.amount).eq(amount));
  } catch {
    return false;
  }
}

export type NestpayXmlResponse = {
  response: string;
  procReturnCode: string;
  errMsg: string;
  transId: string;
  orderStatus: string;
  chargeType: string;
  origAmount: string;
  authCode: string;
};

export function parseNestpayXml(xml: string): NestpayXmlResponse {
  return {
    response: xmlTag(xml, 'Response') ?? '',
    procReturnCode: xmlTag(xml, 'ProcReturnCode') ?? '',
    errMsg: xmlTag(xml, 'ErrMsg') ?? '',
    transId: xmlTag(xml, 'TransId') ?? '',
    orderStatus: xmlTag(xml, 'ORDERSTATUS') ?? '',
    chargeType: xmlTag(xml, 'CHARGE_TYPE_CD') ?? '',
    origAmount: xmlTag(xml, 'ORIG_TRANS_AMT') ?? xmlTag(xml, 'CAPTURE_AMT') ?? '',
    authCode: xmlTag(xml, 'AUTH_CODE') ?? xmlTag(xml, 'AuthCode') ?? '',
  };
}

export async function nestpayXmlRequest(
  config: NestpayConfig,
  innerXml: string,
  fetcher: typeof fetch = fetch,
): Promise<NestpayXmlResponse> {
  const bank = getNestpayBank(config.bankId);
  if (!bank) throw new AppError(400, 'PAYMENT_PROVIDER_INVALID', 'Desteklenmeyen banka sağlayıcısı.');
  const payload =
    `<?xml version="1.0" encoding="UTF-8"?>` +
    `<CC5Request>` +
    `<Name>${escapeXml(config.apiUser)}</Name>` +
    `<Password>${escapeXml(config.apiPassword)}</Password>` +
    `<ClientId>${escapeXml(config.clientId)}</ClientId>` +
    innerXml +
    `</CC5Request>`;
  const url = config.mode === 'production' ? bank.productionApiUrl : bank.sandboxApiUrl;
  try {
    const response = await fetcher(url, {
      method: 'POST',
      redirect: 'error',
      signal: AbortSignal.timeout(15_000),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8' },
      body: 'DATA=' + encodeURIComponent(payload),
    });
    if (!response.ok) throw new Error('HTTP');
    const text = await response.text();
    if (text.length > 512_000) throw new Error('SIZE');
    const parsed = parseNestpayXml(text);
    if (!parsed.response && !parsed.procReturnCode) throw new Error('FORMAT');
    return parsed;
  } catch {
    throw new AppError(503, 'PAYMENT_UNCERTAIN', `${bank.shortName} sonucu alınamadı. İşlem tekrar gönderilmeden sorgulanacak.`);
  }
}

export async function nestpayInquireOrder(config: NestpayConfig, orderId: string, fetcher: typeof fetch = fetch) {
  return nestpayXmlRequest(config, `<OrderId>${escapeXml(orderId)}</OrderId><Extra><ORDERSTATUS>QUERY</ORDERSTATUS></Extra>`, fetcher);
}

export async function nestpayCancelOrder(config: NestpayConfig, orderId: string, fetcher: typeof fetch = fetch) {
  return nestpayXmlRequest(config, `<Type>Void</Type><OrderId>${escapeXml(orderId)}</OrderId>`, fetcher);
}

export async function nestpayRefundOrder(config: NestpayConfig, orderId: string, amount: string, currency: string, fetcher: typeof fetch = fetch) {
  const currencyCode = nestpayCurrency[currency];
  if (!currencyCode) throw new AppError(400, 'PAYMENT_CURRENCY_UNSUPPORTED', 'Bu para birimi desteklenmiyor.');
  return nestpayXmlRequest(
    config,
    `<Type>Credit</Type><OrderId>${escapeXml(orderId)}</OrderId><Total>${escapeXml(amount)}</Total><Currency>${escapeXml(currencyCode)}</Currency>`,
    fetcher,
  );
}

export function nestpaySaleResult(
  reply: NestpayXmlResponse,
  expected: { attemptId: string; provider: string; amount: string; currency: string },
): VerifiedPayment | null {
  if (reply.response !== 'Approved' || reply.procReturnCode !== '00') return null;
  if (!['S', 'A'].includes(reply.chargeType.toUpperCase()) && !reply.authCode) return null;
  if (reply.origAmount && !new Prisma.Decimal(reply.origAmount).eq(expected.amount)) {
    throw new AppError(409, 'PAYMENT_MISMATCH', 'Banka ödeme tutarı eşleşmiyor.');
  }
  return {
    attemptId: expected.attemptId,
    provider: expected.provider,
    paymentId: expected.attemptId,
    amount: expected.amount,
    currency: expected.currency,
    outcome: 'PAID',
  };
}
