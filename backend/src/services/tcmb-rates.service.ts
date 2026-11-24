import { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';

export const supportedCurrencies = [
  'TRY', 'USD', 'EUR', 'GBP', 'CHF', 'CAD', 'AUD', 'SAR', 'AED',
  'JPY', 'SEK', 'NOK', 'DKK', 'KWD', 'QAR', 'AZN', 'CNY', 'RUB',
] as const;
export type SupportedCurrency = (typeof supportedCurrencies)[number];
export const rateTypes = ['ForexBuying', 'ForexSelling', 'BanknoteBuying', 'BanknoteSelling'] as const;
export type RateType = (typeof rateTypes)[number];

export type CurrencyRateSet = Partial<Record<RateType, string>>;
type RateSnapshot = {
  fetchedAt: number;
  rateDate: string;
  rates: Record<string, string>;
  detailed: Record<string, CurrencyRateSet>;
};

export const DEFAULT_TCMB_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';
const CACHE_TTL_MS = 30 * 60_000;
const STALE_MAX_MS = 7 * 24 * 60 * 60_000;
const caches = new Map<string, RateSnapshot>();
const inflights = new Map<string, Promise<RateSnapshot>>();

/** Validates an external exchange-rate URL against SSRF (HTTPS only, public hostnames). */
export function assertSafeRateUrl(raw: string): string {
  let url: URL;
  try {
    url = new URL(raw.trim());
  } catch {
    throw new AppError(400, 'INVALID_API_URL', 'Geçerli bir HTTPS API adresi girin.');
  }
  const host = url.hostname.toLowerCase();
  const isPrivateHost =
    host === 'localhost'
    || host.endsWith('.local')
    || host.endsWith('.internal')
    || /^127\./.test(host)
    || /^10\./.test(host)
    || /^192\.168\./.test(host)
    || /^169\.254\./.test(host)
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(host)
    || /^0\./.test(host)
    || host.includes(':');
  if (url.protocol !== 'https:' || url.username || url.password || isPrivateHost) {
    throw new AppError(400, 'INVALID_API_URL', 'API adresi geçerli bir herkese açık HTTPS adresi olmalıdır.');
  }
  return url.toString();
}

/** Parses TCMB-compatible XML into per-unit TRY rates for all four rate types. */
export function parseTcmbXml(xml: string): { rateDate: string; rates: Record<string, string>; detailed: Record<string, CurrencyRateSet> } {
  const dateMatch = /<Tarih_Date\b[^>]*\bTarih="([^"]+)"/i.exec(xml) ?? /<Tarih_Date\b[^>]*\bDate="([^"]+)"/i.exec(xml);
  const rateDate = dateMatch?.[1]?.trim() || new Date().toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' });
  const rates: Record<string, string> = {};
  const detailed: Record<string, CurrencyRateSet> = {};
  const blockRe = /<Currency\b[^>]*\bCurrencyCode="([A-Z]{3})"[^>]*>([\s\S]*?)<\/Currency>/gi;
  let match: RegExpExecArray | null;
  while ((match = blockRe.exec(xml)) !== null) {
    const code = match[1].toUpperCase();
    const body = match[2];
    const unitRaw = /<Unit>\s*([0-9]+)\s*<\/Unit>/i.exec(body)?.[1];
    if (!unitRaw) continue;
    const unit = Number(unitRaw);
    if (!Number.isInteger(unit) || unit <= 0) continue;
    const set: CurrencyRateSet = {};
    for (const field of rateTypes) {
      const raw = new RegExp(`<${field}>\\s*([0-9]+(?:\\.[0-9]+)?)\\s*<\\/${field}>`, 'i').exec(body)?.[1];
      if (!raw) continue;
      const val = new Prisma.Decimal(raw);
      if (val.gt(0)) set[field] = val.div(unit).toDecimalPlaces(6, Prisma.Decimal.ROUND_HALF_UP).toString();
    }
    const primary = set.ForexSelling ?? set.BanknoteSelling ?? set.ForexBuying ?? set.BanknoteBuying;
    if (!primary) continue;
    rates[code] = primary;
    detailed[code] = set;
  }
  if (!Object.keys(rates).length) throw new Error('TCMB_EMPTY');
  return { rateDate, rates, detailed };
}

async function fetchTcmbSnapshot(apiUrl: string, fetcher: typeof fetch = fetch): Promise<RateSnapshot> {
  const safeUrl = assertSafeRateUrl(apiUrl);
  const response = await fetcher(safeUrl, {
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

export async function getTcmbRates(fetcher: typeof fetch = fetch, now = Date.now(), apiUrl = DEFAULT_TCMB_URL, force = false): Promise<RateSnapshot> {
  const key = apiUrl || DEFAULT_TCMB_URL;
  const cached = caches.get(key);
  if (!force && cached && now - cached.fetchedAt < CACHE_TTL_MS) return cached;
  let pending = inflights.get(key);
  if (!pending) {
    pending = fetchTcmbSnapshot(key, fetcher)
      .then(snapshot => { caches.set(key, snapshot); return snapshot; })
      .finally(() => { inflights.delete(key); });
    inflights.set(key, pending);
  }
  try {
    return await pending;
  } catch {
    if (cached && now - cached.fetchedAt < STALE_MAX_MS) return cached;
    throw new AppError(503, 'EXCHANGE_RATE_UNAVAILABLE', 'Güncel TCMB döviz kuru alınamadı. Lütfen birkaç dakika sonra tekrar deneyin.');
  }
}

export function pickRateFromSnapshot(snapshot: RateSnapshot, currency: string, rateType: RateType = 'ForexSelling'): string | undefined {
  const set = snapshot.detailed[currency];
  return set?.[rateType] ?? snapshot.rates[currency];
}

/** Pre-warms the rate cache outside DB transactions so row locks are never held during network I/O. */
export async function warmTcmbRates(apiUrl = DEFAULT_TCMB_URL) {
  try { await getTcmbRates(fetch, Date.now(), apiUrl); } catch { /* Handled when a foreign-currency quote actually needs it. */ }
}

/** Test helper to reset or seed the in-memory rate cache. */
export function setTcmbRateCacheForTests(snapshot: (Omit<RateSnapshot, 'detailed'> & { detailed?: Record<string, CurrencyRateSet> }) | null) {
  caches.clear();
  inflights.clear();
  if (snapshot) caches.set(DEFAULT_TCMB_URL, { detailed: {}, ...snapshot });
}

export type ConvertedTryAmount = {
  total: string;
  currency: 'TRY';
  originalTotal?: string;
  originalCurrency?: string;
  exchangeRate?: string;
  rateDate?: string;
};

export type RateOverride = {
  autoUpdate: boolean;
  rate: string;
  rateType: RateType;
  apiUrl: string;
  updatedAt?: string;
};

export async function convertForeignToTry(
  amount: string,
  currency: string,
  fetcher: typeof fetch = fetch,
  override?: RateOverride | null,
): Promise<ConvertedTryAmount> {
  if (currency === 'TRY') return { total: amount, currency: 'TRY' };
  let rate: string | undefined;
  let rateDate: string | undefined;
  if (override && !override.autoUpdate && new Prisma.Decimal(override.rate || 0).gt(0)) {
    rate = override.rate;
    rateDate = override.updatedAt ? new Date(override.updatedAt).toLocaleDateString('tr-TR', { timeZone: 'Europe/Istanbul' }) : undefined;
  } else {
    const url = override?.apiUrl || DEFAULT_TCMB_URL;
    const type = override?.rateType || 'ForexSelling';
    const snapshot = await getTcmbRates(fetcher, Date.now(), url);
    rate = pickRateFromSnapshot(snapshot, currency, type);
    rateDate = snapshot.rateDate;
  }
  if (!rate) {
    throw new AppError(400, 'EXCHANGE_RATE_UNSUPPORTED', `${currency} için güncel kur bulunamadı.`);
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
    rateDate,
  };
}
