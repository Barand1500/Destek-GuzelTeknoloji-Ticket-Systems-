import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';

export const supportedCurrencies = [
  'TRY', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'SAR', 'AED',
  'JPY', 'SEK', 'NOK', 'DKK', 'KWD', 'QAR', 'AZN', 'CNY', 'RUB',
] as const;
export type SupportedCurrency = (typeof supportedCurrencies)[number];

type RateSnapshot = {
  fetchedAt: number;
  rateDate: string;
  rates: Record<string, string>;
};

const TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const CACHE_TTL_MS = 30 * 60_000;
const STALE_MAX_MS = 7 * 24 * 60 * 60_000;
let cache: RateSnapshot | null = null;
let inflight: Promise<RateSnapshot> | null = null;

/** Parses TCMB today.xml into per-unit TRY selling rates (ForexSelling / Unit). */
export function parseTcmbXml(xml: string): { rateDate: string; rates: Record<string, string> } {
  const dateMatch = /<Tarih_Date\b[^>]*\bTarih="([^"]+)"/i.exec(xml) ?? /<Tarih_Date\b[^>]*\bDate="([^"]+)"/i.exec(xml);
  const rateDate = dateMatch?.[1]?.trim() || new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const rates: Record<string, string> = {};
  const blockRe = /<Currency\b[^>]*\bCurrencyCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(xml)) !== null) {
    const code = match[1].toUpperCase();
    const body = match[2];
    const unitRaw = /<Unit>\s*([0-9]+)\s*<\/Unit>/i.exec(body)?.[1];
    const sellingRaw = /<ForexSelling>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/ForexSelling>/i.exec(body)?.[1]
      ?? /<BanknoteSelling>\s*([0-9]+(?:\.[0-9]+)?)\s*<\/BanknoteSelling>/i.exec(body)?.[1];
    if (!unitRaw || !sellingRaw) continue;
    const unit = Number(unitRaw);
    if (!Number.isInteger(unit) || unit <= 0) continue;
    const selling = new Prisma.Decimal(sellingRaw);
    if (!selling.gt(0)) continue;
    rates[code] = selling.div(unit).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP).toString();
  }
  if (!Object.keys(rates).length) throw new Error('TCMB_EMPTY');
  return { rateDate, rates };
}

async function fetchTcmbSnapshot(fetcher: typeof fetch = fetch): Promise<RateSnapshot> {
  const response = await fetcher(TCMB_URL, {
    method: 'GET',
    redirect: 'error',
    signal: AbortSignal.timeout(10_000),
    headers: { Accept: 'application/xml, text/xml;q=0.9' },
  });
  if (!response.ok) throw new Error('TCMB_HTTP_' + response.status);
  const xml = await response.text();
  if (xml.length > 512_000) throw new Error('TCMB_SIZE');
  const parsed = parseTcmbXml(xml);
  return { fetchedAt: Date.now(), ...parsed };
}

export async function getTcmbRates(fetcher: typeof fetch = fetch, now = Date.now()): Promise<RateSnapshot> {
  if (cache && now - cache.fetchedAt < CACHE_TTL_MS) return cache;
  if (!inflight) {
    inflight = fetchTcmbSnapshot(fetcher)
      .then(snapshot => { cache = snapshot; return snapshot; })
      .finally(() => { inflight = null; });
  }
  try {
    return await inflight;
  } catch {
    if (cache && now - cache.fetchedAt < STALE_MAX_MS) return cache;
    throw new AppError(503, 'EXCHANGE_RATE_UNAVAILABLE', 'Güncel TCMB döviz kuru alınamadı. Lütfen birkaç dakika sonra tekrar deneyin.');
  }
}

/** Pre-warms the rate cache outside DB transactions so row locks are never held during network I/O. */
export async function warmTcmbRates() {
  try { await getTcmbRates(); } catch { /* Handled when a foreign-currency quote actually needs it. */ }
}

/** Test helper to reset or seed the in-memory rate cache. */
export function setTcmbRateCacheForTests(snapshot: RateSnapshot | null) {
  cache = snapshot;
  inflight = null;
}

export type ConvertedTryAmount = {
  total: string;
  currency: 'TRY';
  originalTotal?: string;
  originalCurrency?: string;
  exchangeRate?: string;
  rateDate?: string;
};

export async function convertForeignToTry(amount: string, currency: string, fetcher: typeof fetch = fetch): Promise<ConvertedTryAmount> {
  if (currency === 'TRY') return { total: amount, currency: 'TRY' };
  const snapshot = await getTcmbRates(fetcher);
  const rate = snapshot.rates[currency];
  if (!rate) {
    throw new AppError(400, 'EXCHANGE_RATE_UNSUPPORTED', `${currency} için güncel TCMB kuru bulunamadı.`);
  }
  const converted = new Prisma.Decimal(amount).mul(rate).toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);
  if (!converted.gt(0) || converted.gt('99999999.99')) {
    throw new AppError(400, 'AMOUNT_TOO_LARGE', 'Çevrilen TL tutarı geçerli sınırların dışında.');
  }
  return {
    total: converted.toFixed(2),
    currency: 'TRY',
    originalTotal: amount,
    originalCurrency: currency,
    exchangeRate: new Prisma.Decimal(rate).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4),
    rateDate: snapshot.rateDate,
  };
}
