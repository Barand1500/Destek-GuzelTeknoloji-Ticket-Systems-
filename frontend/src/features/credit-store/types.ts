export type CreditAlertChannel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP";
export type Currency =
  | "TRY" | "USD" | "EUR" | "GBP" | "CHF" | "CAD" | "AUD" | "SAR" | "AED"
  | "JPY" | "SEK" | "NOK" | "DKK" | "KWD" | "QAR" | "AZN" | "CNY" | "RUB";
export const currencyOptions = [
  { value: "TRY", label: "TL (₺)" },
  { value: "USD", label: "ABD Doları ($)" },
  { value: "EUR", label: "Euro (€)" },
  { value: "GBP", label: "İngiliz Sterlini (£)" },
  { value: "CHF", label: "İsviçre Frangı (CHF)" },
  { value: "CAD", label: "Kanada Doları (CAD)" },
  { value: "AUD", label: "Avustralya Doları (AUD)" },
  { value: "SAR", label: "Suudi Arabistan Riyali (SAR)" },
  { value: "AED", label: "BAE Dirhemi (AED)" },
  { value: "JPY", label: "Japon Yeni (¥)" },
  { value: "SEK", label: "İsveç Kronu (SEK)" },
  { value: "NOK", label: "Norveç Kronu (NOK)" },
  { value: "DKK", label: "Danimarka Kronu (DKK)" },
  { value: "KWD", label: "Kuveyt Dinarı (KWD)" },
  { value: "QAR", label: "Katar Riyali (QAR)" },
  { value: "AZN", label: "Azerbaycan Manatı (AZN)" },
  { value: "CNY", label: "Çin Yuanı (CNY)" },
  { value: "RUB", label: "Rus Rublesi (RUB)" },
];
export const currencyLabel = (value: string) =>
  value === "TRY" ? "TL" : value;
export type SalesSettings = {
 alertChannels?: CreditAlertChannel[];
 whatsappCreditTemplateName?: string;
 whatsappCreditTemplateLanguage?: string;
  alertsEnabled: boolean;
  lowCreditPercent: number;
  expiryNoticeDays: number;
  currency: Currency;
  enabled: boolean;
  unitPrice: string;
  minCredits: number;
  maxCredits: number;
  validityDays: number;
};
export type SalesPlan = {
  currency: Currency;
  id: string;
  name: string;
  description: string;
  periodMonths: number | null;
  periodDays?: number | null;
  periodName?: string | null;
  price: string;
  credits: number;
  active: boolean;
};
export type Owner = {
  id: string;
  name: string;
  company?: string | null;
  isCompany: boolean;
};
export type SalesCatalog = {
 channelAvailability?: Array<{channel:CreditAlertChannel; available:boolean;reason?:string}>;
  settings: SalesSettings;
  plans: SalesPlan[];
  owner?: Owner;
  paymentAvailable?: boolean;
  provider?: string;
};
export type Quote = {
  quoteKey: string;
  startsOn?: string; endsOn?: string;
  currentPackage?: { id: string; name: string; endsOn: string; remainingDays: number } | null;
  name: string;
  credits: number;
  total: string;
  currency: string;
  originalTotal?: string;
  originalCurrency?: string;
  exchangeRate?: string;
  rateDate?: string;
  unitPrice?: string;
  validityDays?: number;
  periodMonths?: number | null;
  periodDays?: number | null;
  periodName?: string | null;
  expiresAt?: string;
  owner: Owner;
  paymentAvailable?: boolean;
};
export const money = (value: string | number, currency: string = "TRY") =>
  new Intl.NumberFormat("tr-TR", { style: "currency", currency }).format(
    Number(value),
  );
export const count = (value: number) => value.toLocaleString("tr-TR");
export function periodLabel(period: {
  periodMonths?: number | null;
  periodDays?: number | null;
  periodName?: string | null;
}) {
  const duration = period.periodDays
    ? `${count(period.periodDays)} gün`
    : period.periodMonths
      ? period.periodMonths % 12 === 0
        ? `${count(period.periodMonths / 12)} yıl`
        : `${count(period.periodMonths)} ay`
      : "Dönem belirtilmedi";
  return period.periodName ? `${period.periodName} (${duration})` : duration;
}
