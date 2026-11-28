import { z } from 'zod';
import { db } from '../config/db.js';
import { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { paymentStaff } from './payment-settings.service.js';
import {
  assertSafeRateUrl,
  DEFAULT_TCMB_URL,
  getTcmbRates,
  pickRateFromSnapshot,
  rateTypes,
  supportedCurrencies,
  type RateOverride,
  type RateType,
  type SupportedCurrency,
} from './tcmb-rates.service.js';

export type CurrencyRecord = {
  code: SupportedCurrency;
  name: string;
  rateType: RateType;
  autoUpdate: boolean;
  rate: string;
  apiUrl: string;
  isActive: boolean;
  updatedAt?: string;
};

const RECORD_ID = 'currencies';

const defaultCurrencies: CurrencyRecord[] = [
  { code: 'TRY', name: 'Türk Lirası', rateType: 'ForexSelling', autoUpdate: false, rate: '1.0000', apiUrl: '', isActive: true },
  { code: 'USD', name: 'ABD Doları', rateType: 'ForexSelling', autoUpdate: true, rate: '0.0000', apiUrl: DEFAULT_TCMB_URL, isActive: true },
  { code: 'EUR', name: 'Euro', rateType: 'ForexSelling', autoUpdate: true, rate: '0.0000', apiUrl: DEFAULT_TCMB_URL, isActive: true },
  { code: 'GBP', name: 'İngiliz Sterlini', rateType: 'ForexSelling', autoUpdate: true, rate: '0.0000', apiUrl: DEFAULT_TCMB_URL, isActive: true },
];

const currencySchema = z.object({
  code: z.enum(supportedCurrencies),
  name: z.string().trim().min(2).max(80),
  rateType: z.enum(rateTypes).default('ForexSelling'),
  autoUpdate: z.boolean().default(false),
  rate: z.string().trim().regex(/^\d{1,8}([.,]\d{1,6})?$/, 'Geçerli bir kur değeri girin.'),
  apiUrl: z.string().trim().max(500).default(''),
  isActive: z.boolean().default(true),
}).strict();

const storedCurrencySchema = currencySchema.extend({ updatedAt: z.string().optional() });

async function loadStored(): Promise<CurrencyRecord[]> {
  const row = await db.systemSettings.findUnique({ where: { id: RECORD_ID }, select: { roleTemplates: true } });
  const raw = row?.roleTemplates;
  if (!Array.isArray(raw) || !raw.length) return defaultCurrencies.map(item => ({ ...item }));
  const valid: CurrencyRecord[] = [];
  for (const entry of raw) {
    const parsed = storedCurrencySchema.safeParse(entry);
    if (parsed.success) {
      valid.push({
        ...parsed.data,
        rate: new Prisma.Decimal(parsed.data.rate.replace(',', '.')).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4),
        updatedAt: typeof (entry as Record<string, unknown>)?.updatedAt === 'string' ? String((entry as Record<string, unknown>).updatedAt) : undefined,
      });
    }
  }
  if (!valid.some(v => v.code === 'TRY')) valid.unshift({ ...defaultCurrencies[0] });
  return valid;
}

async function persist(rows: CurrencyRecord[]) {
  await db.systemSettings.upsert({
    where: { id: RECORD_ID },
    create: { id: RECORD_ID, companyName: 'CurrencySettings', roleTemplates: rows as unknown as Prisma.InputJsonValue },
    update: { roleTemplates: rows as unknown as Prisma.InputJsonValue },
  });
}

export async function getCurrencyOverride(code: string): Promise<RateOverride | null> {
  if (code === 'TRY') return null;
  const rows = await loadStored();
  const found = rows.find(item => item.code === code);
  if (!found) return null;
  return {
    autoUpdate: found.autoUpdate,
    rate: found.rate,
    rateType: found.rateType,
    apiUrl: found.apiUrl || DEFAULT_TCMB_URL,
    updatedAt: found.updatedAt,
  };
}

export async function listCurrencies(actor: Actor) {
  paymentStaff(actor);
  const rows = await loadStored();
  // Populate live display rate for auto-updating rows that have not been refreshed yet.
  const needsLive = rows.some(r => r.code !== 'TRY' && r.autoUpdate);
  if (needsLive) {
    for (const row of rows) {
      if (row.code === 'TRY' || !row.autoUpdate) continue;
      try {
        const snapshot = await getTcmbRates(fetch, Date.now(), row.apiUrl || DEFAULT_TCMB_URL);
        const live = pickRateFromSnapshot(snapshot, row.code, row.rateType);
        if (live) row.rate = new Prisma.Decimal(live).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);
      } catch { /* Keep stored rate if TCMB is temporarily unreachable. */ }
    }
  }
  return rows;
}

export async function saveCurrency(actor: Actor, raw: unknown) {
  paymentStaff(actor, true);
  const input = currencySchema.parse(raw);
  const isTry = input.code === 'TRY';
  const normalizedRate = isTry
    ? '1.0000'
    : new Prisma.Decimal(input.rate.replace(',', '.')).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);
  if (!isTry && !input.autoUpdate && !new Prisma.Decimal(normalizedRate).gt(0)) {
    throw new AppError(400, 'INVALID_RATE', 'Oto güncelleme kapalıyken kur sıfırdan büyük olmalıdır.');
  }
  const apiUrl = isTry ? '' : input.apiUrl ? assertSafeRateUrl(input.apiUrl) : DEFAULT_TCMB_URL;
  const rows = await loadStored();
  const next: CurrencyRecord = {
    code: input.code,
    name: input.name,
    rateType: input.rateType,
    autoUpdate: isTry ? false : input.autoUpdate,
    rate: normalizedRate,
    apiUrl,
    isActive: isTry ? true : input.isActive,
    updatedAt: new Date().toISOString(),
  };
  const index = rows.findIndex(item => item.code === input.code);
  if (index >= 0) rows[index] = next;
  else rows.push(next);
  await persist(rows);
  await db.activityLog.create({
    data: {
      userId: actor.id,
      action: 'credit_sales.settings_updated',
      entityType: 'SystemSettings',
      entityId: RECORD_ID,
      ipAddress: actor.ipAddress,
      metadata: { name: `${next.name} (${next.code})`, details: [`Kur: ${next.rate}`, next.autoUpdate ? 'Oto güncelleme: Açık' : 'Oto güncelleme: Kapalı'] },
    },
  });
  return listCurrencies(actor);
}

export async function refreshCurrencyRate(actor: Actor, code: string) {
  paymentStaff(actor, true);
  const rows = await loadStored();
  const targets = code === 'ALL' ? rows.filter(r => r.code !== 'TRY') : rows.filter(r => r.code === code && r.code !== 'TRY');
  if (!targets.length) throw new AppError(404, 'CURRENCY_NOT_FOUND', 'Güncellenecek para birimi bulunamadı.');
  for (const row of targets) {
    const url = row.apiUrl || DEFAULT_TCMB_URL;
    const snapshot = await getTcmbRates(fetch, Date.now(), url, true);
    const live = pickRateFromSnapshot(snapshot, row.code, row.rateType);
    if (!live) throw new AppError(400, 'EXCHANGE_RATE_UNSUPPORTED', `${row.code} için API yanıtında kur bulunamadı.`);
    row.rate = new Prisma.Decimal(live).toDecimalPlaces(4, Prisma.Decimal.ROUND_HALF_UP).toFixed(4);
    row.updatedAt = new Date().toISOString();
  }
  await persist(rows);
  return listCurrencies(actor);
}

export async function deleteCurrency(actor: Actor, code: string) {
  paymentStaff(actor, true);
  if (code === 'TRY') throw new AppError(400, 'CANNOT_DELETE_TRY', 'Türk Lirası (TRY) silinemez.');
  const rows = await loadStored();
  const next = rows.filter(item => item.code !== code);
  if (next.length === rows.length) throw new AppError(404, 'CURRENCY_NOT_FOUND', 'Para birimi bulunamadı.');
  await persist(next);
  return listCurrencies(actor);
}
