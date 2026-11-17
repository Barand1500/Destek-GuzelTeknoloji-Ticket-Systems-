export type BankBrand = {
  name: string;
  color: string;
  mark: string;
  /** Slug for the bundled logo in frontend/public/images/banks. */
  key?: string;
};

type BrandRule = {
  test: RegExp;
  brand: BankBrand;
};

// Order matters: more specific names must be checked before their parent brands.
const rules: BrandRule[] = [
  { test: /GARANTI/, brand: { key: 'garanti', name: 'Garanti BBVA', color: '#00915a', mark: 'G' } },
  { test: /ENPARA/, brand: { key: 'enpara', name: 'Enpara', color: '#b44ea7', mark: 'E' } },
  { test: /YAPI\s+(VE\s+)?KREDI/, brand: { key: 'yapikredi', name: 'Yapı Kredi', color: '#004b93', mark: 'YK' } },
  { test: /DENIZ\s*BANK/, brand: { key: 'denizbank', name: 'DenizBank', color: '#00539b', mark: 'DB' } },
  { test: /\bIS\s+BANKASI\b/, brand: { key: 'isbank', name: 'İş Bankası', color: '#0033a0', mark: 'İB' } },
  { test: /TURK\s+EKONOMI/, brand: { key: 'teb', name: 'TEB', color: '#00a94f', mark: 'TEB' } },
  { test: /ZIRAAT\s+KATILIM/, brand: { key: 'ziraatkatilim', name: 'Ziraat Katılım', color: '#e30613', mark: 'ZK' } },
  { test: /ZIRAAT/, brand: { key: 'ziraat', name: 'Ziraat Bankası', color: '#e30613', mark: 'ZR' } },
  { test: /VAKIF\s+KATILIM/, brand: { key: 'vakifkatilim', name: 'Vakıf Katılım', color: '#00843d', mark: 'VK' } },
  { test: /VAKIFLAR|VAKIF\s*BANK/, brand: { key: 'vakifbank', name: 'VakıfBank', color: '#b8860b', mark: 'VB' } },
  { test: /HALK\s*BANK/, brand: { key: 'halkbank', name: 'Halkbank', color: '#00539b', mark: 'HK' } },
  { test: /\bAKBANK\b/, brand: { key: 'akbank', name: 'Akbank', color: '#e4002b', mark: 'AK' } },
  { test: /QNB|FINANSBANK/, brand: { key: 'qnb', name: 'QNB Finansbank', color: '#6a1b9a', mark: 'QNB' } },
  { test: /\bING\b/, brand: { key: 'ing', name: 'ING', color: '#ff6200', mark: 'ING' } },
  { test: /HSBC/, brand: { key: 'hsbc', name: 'HSBC', color: '#db0011', mark: 'HS' } },
  { test: /ODEA?\s*BANK/, brand: { key: 'odeabank', name: 'Odeabank', color: '#e4002b', mark: 'OD' } },
  { test: /FIBABAN/, brand: { key: 'fibabanka', name: 'Fibabanka', color: '#f58220', mark: 'FB' } },
  { test: /KUVEYT/, brand: { key: 'kuveytturk', name: 'Kuveyt Türk', color: '#006b3f', mark: 'KT' } },
  { test: /ALBARAKA/, brand: { key: 'albaraka', name: 'Albaraka Türk', color: '#00843d', mark: 'AB' } },
  { test: /TURKIYE\s+FINANS/, brand: { key: 'turkiyefinans', name: 'Türkiye Finans', color: '#00843d', mark: 'TF' } },
  { test: /SEKERBANK/, brand: { key: 'sekerbank', name: 'Şekerbank', color: '#0067a0', mark: 'ŞK' } },
  { test: /ANADOLU\s*BANK/, brand: { key: 'anadolubank', name: 'Anadolubank', color: '#0b4f9c', mark: 'AN' } },
  { test: /ALTERNATIF/, brand: { key: 'alternatif', name: 'Alternatif Bank', color: '#00a0a0', mark: 'ALT' } },
  { test: /BURGAN/, brand: { key: 'burgan', name: 'Burgan Bank', color: '#00a3ad', mark: 'BR' } },
  { test: /ICBC/, brand: { key: 'icbc', name: 'ICBC Turkey', color: '#c8102e', mark: 'ICBC' } },
  { test: /AKTIF/, brand: { key: 'aktif', name: 'Aktif Bank', color: '#f5a623', mark: 'AKT' } },
  { test: /OYAK/, brand: { key: 'oyak', name: 'Oyak Bank', color: '#00539b', mark: 'OY' } },
  { test: /CITI/, brand: { key: 'citi', name: 'Citi', color: '#003b70', mark: 'C' } },
  { test: /AMERICAN\s+EXPRESS/, brand: { key: 'amex', name: 'American Express', color: '#016fd0', mark: 'AX' } },
  { test: /TURKISH\s+AIRLINES/, brand: { key: 'turkishairlines', name: 'Turkish Airlines', color: '#c8102e', mark: 'TK' } },
  { test: /PAPARA/, brand: { key: 'papara', name: 'Papara', color: '#6c2bd9', mark: 'P' } },
  { test: /ININAL/, brand: { key: 'ininal', name: 'ininal', color: '#ff6b00', mark: 'in' } },
  { test: /FUPS/, brand: { key: 'fups', name: 'FUPS', color: '#00a3ad', mark: 'F' } },
  { test: /SIPAY/, brand: { key: 'sipay', name: 'Sipay', color: '#6c2bd9', mark: 'S' } },
  { test: /MOKA/, brand: { key: 'moka', name: 'Moka', color: '#00a3ad', mark: 'M' } },
  { test: /TURKCELL/, brand: { key: 'paycell', name: 'Paycell', color: '#b8860b', mark: 'PC' } },
  { test: /POSTA\s+VE\s+TELGRAF|\bPTT\b/, brand: { key: 'ptt', name: 'PTT', color: '#b8860b', mark: 'PTT' } },
  { test: /TURKISH\s+BANK/, brand: { key: 'turkishbank', name: 'Turkish Bank', color: '#00539b', mark: 'TB' } },
  { test: /EMLAK\s+KATILIM/, brand: { key: 'emlakkatilim', name: 'Emlak Katılım', color: '#00843d', mark: 'EK' } },
  { test: /EMLAK\s+BANK/, brand: { key: 'emlakbank', name: 'Emlak Bankası', color: '#00539b', mark: 'EB' } },
  { test: /TARISBANK/, brand: { key: 'tarisbank', name: 'Tarişbank', color: '#00843d', mark: 'TR' } },
  { test: /ARAP\s+TURK/, brand: { key: 'arapturk', name: 'Arap Türk Bankası', color: '#00539b', mark: 'AT' } },
];

const legalSuffix = /,?\s*(A\.?\s*S\.?|A\.?\s*O\.?|T\.?\s*A\.?\s*O\.?|T\.?\s*A\.?\s*S\.?|ANONIM\s+SIRKETI|ANONIM\s+SIRKET|SIRKETI)\.?\s*$/i;

function fallback(issuer: string): BankBrand {
  const cleaned = issuer
    .replace(legalSuffix, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLocaleLowerCase('en-US')
    .replace(/(^|\s)\S/g, letter => letter.toLocaleUpperCase('en-US'));
  const name = cleaned.length > 48 ? `${cleaned.slice(0, 47)}…` : cleaned;
  const mark = name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(word => word[0])
    .join('')
    .toLocaleUpperCase('tr-TR')
    .slice(0, 3);
  return { name: name || 'Bilinmeyen banka', color: '#64748b', mark: mark || '?' };
}

export function bankBrand(issuer: string): BankBrand {
  const normalized = issuer.toLocaleUpperCase('tr-TR');
  return rules.find(rule => rule.test.test(normalized))?.brand ?? fallback(issuer);
}
