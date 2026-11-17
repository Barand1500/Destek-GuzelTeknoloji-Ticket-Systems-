import { z } from 'zod';
import { AppError } from '../utils/errors.js';
import type { Actor } from '../types/express.js';
import { can } from './permissions.js';
import { TURKEY_BIN_RECORDS } from './turkey-bin-data.js';
import { BIN_ISSUER_OVERRIDES } from './bin-overrides.js';
import { bankBrand, type BankBrand } from './bank-brands.js';

export const binSearchInput = z.object({
  search: z.string().trim().min(2).max(80),
}).strict();

const brands = new Map<string, BankBrand>();
const brandFor = (issuer: string) => {
  const cached = brands.get(issuer);
  if (cached) return cached;
  const brand = bankBrand(issuer);
  brands.set(issuer, brand);
  return brand;
};

export async function searchBinRecords(actor: Actor, raw: unknown) {
  if (actor.role === 'CUSTOMER' || !can(actor, 'integrations.view'))
    throw new AppError(403, 'FORBIDDEN', 'BIN kayıtları için yetkiniz yok.');
  const { search } = binSearchInput.parse(raw);
  const digits = /^\d{2,8}$/.test(search);
  const needle = search.normalize('NFKC').toLocaleLowerCase('tr-TR');
  const matches = [];
  const records = new Map(Object.entries(TURKEY_BIN_RECORDS));
  for (const [bin, record] of Object.entries(BIN_ISSUER_OVERRIDES)) records.set(bin, record);
  for (const [bin, record] of records) {
    const brand = brandFor(record.issuer);
    const matchesSearch = digits
      ? bin.startsWith(search)
      : `${brand.name} ${record.issuer}`.normalize('NFKC').toLocaleLowerCase('tr-TR').includes(needle);
    if (!matchesSearch) continue;
    matches.push({
      bin,
      bankName: brand.name,
      bankKey: brand.key,
      bankColor: brand.color,
      bankMark: brand.mark,
      cardAssociation: record.network,
      cardType: record.type,
      cardFamily: record.category,
      issuer: record.issuer,
    });
  }
  matches.sort((left, right) => left.bin.localeCompare(right.bin));
  return { data: matches.slice(0, 50), total: matches.length };
}
