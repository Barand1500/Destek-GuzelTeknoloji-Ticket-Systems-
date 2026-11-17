import { z } from "zod";
import { AppError } from "../utils/errors.js";
import { durationFields, hasOneDuration } from "./credit-periods.js";
const money = z
  .string()
  .trim()
  .regex(
    /^\d{1,8}(\.\d{1,2})?$/,
    "Tutarı en fazla iki ondalık basamakla girin.",
  );
const currency = z.enum(["TRY", "USD", "EUR", "GBP"]).default("TRY");
const positiveMoney = money.refine(
  (value) => moneyMinor(value) > 0,
  "Fiyat sıfırdan büyük olmalıdır.",
);
export function moneyMinor(value: string) {
  if (!/^\d{1,8}(\.\d{1,2})?$/.test(value))
    throw new AppError(400, "INVALID_AMOUNT", "Geçerli bir tutar girin.");
  const [whole, fraction = ""] = value.split(".");
  return Number(whole) * 100 + Number(fraction.padEnd(2, "0"));
}
export const moneyText = (minor: number) => (minor / 100).toFixed(2);
export const salesSettingsInput = z
  .object({
    enabled: z.boolean(),
    alertsEnabled: z.boolean().default(true),
    alertChannels: z.array(z.enum(['IN_APP','EMAIL','SMS','WHATSAPP'])).max(4).refine(value=>new Set(value).size===value.length, 'Aynı kanal birden fazla seçilemez.').optional(),
    whatsappCreditTemplateName: z.string().trim().max(120).regex(/^[a-z0-9_]*$/, 'WhatsApp şablon adı küçük harf, sayı ve alt çizgi içermelidir.').optional(),
    whatsappCreditTemplateLanguage: z.string().trim().regex(/^[a-z]{2,3}(_[A-Z]{2})?$/, 'Geçerli bir şablon dili girin.').optional(),
    lowCreditPercent: z.number().int().min(1).max(100).default(20),
    expiryNoticeDays: z.number().int().min(1).max(365).default(7),
    currency,
    unitPrice: positiveMoney,
    minCredits: z.number().int().min(1).max(1000000),
    maxCredits: z.number().int().min(1).max(1000000),
    validityDays: z.number().int().min(1).max(3650),
  })
  .strict()
  .refine(v=>!v.alertsEnabled || v.alertChannels === undefined || v.alertChannels.length>0,{path:['alertChannels'],message:'En az bir bildirim kanalı seçin.'})
  .refine((v) => v.maxCredits >= v.minCredits, {
    path: ["maxCredits"],
    message: "Üst sınır alt sınırdan küçük olamaz.",
  });
export const salesPlanInput = z
  .object({
    name: z.string().trim().min(1).max(100),
    currency,
    description: z.string().trim().max(1000).default(""),
    ...durationFields,
    periodName: z.string().trim().min(1).max(80).nullable().optional(),
    renewalRequested: z.boolean().default(false),
    price: positiveMoney,
    credits: z.number().int().min(1).max(1000000),
    active: z.boolean(),
  })
  .strict()
  .refine(hasOneDuration, {
    path: ["periodMonths"],
    message: "Gün veya ay cinsinden tek bir dönem seçin.",
  });
export const quoteInput = z.union([
  z.object({ credits: z.number().int().min(1).max(1000000) }).strict(),
  z.object({ amount: positiveMoney }).strict(),
  z
    .object({ planId: z.uuid(), renewalRequested: z.boolean().optional() })
    .strict(),
]);
export function creditQuote(
  settings: {
    unitPrice: string;
    minCredits: number;
    maxCredits: number;
    currency?: string;
  },
  input: { credits: number } | { amount: string },
) {
  const price = moneyMinor(settings.unitPrice);
  if (price <= 0)
    throw new AppError(400, "INVALID_PRICE", "Kredi fiyatı tanımlanmadı.");
  const credits =
    "credits" in input ? input.credits : moneyMinor(input.amount) / price;
  if ("amount" in input && !Number.isSafeInteger(credits)) {
    const nearest = [
      ...new Set(
        [Math.floor(credits), Math.ceil(credits)].map((value) =>
          Math.min(settings.maxCredits, Math.max(settings.minCredits, value)),
        ),
      ),
    ];
    const suggestions = nearest
      .map(
        (value) =>
          moneyText(value * price).replace(".", ",") +
          " " +
          (settings.currency ?? "TRY") +
          " (" +
          value +
          " kredi)",
      )
      .join(" veya ");
    throw new AppError(
      400,
      "FRACTIONAL_CREDITS",
      "Tam kredi alınabilir. Geçerli tutar: " + suggestions + ".",
    );
  }

  if (
    !Number.isSafeInteger(credits) ||
    credits < settings.minCredits ||
    credits > settings.maxCredits
  )
    throw new AppError(
      400,
      "INVALID_CREDITS",
      "Tam sayı kredi alınabilir. " +
        settings.minCredits +
        "–" +
        settings.maxCredits +
        " kredi arasında, birim fiyatın katı bir tutar girin.",
    );
  const total = credits * price;
  if (!Number.isSafeInteger(total) || total > 9999999999)
    throw new AppError(400, "AMOUNT_TOO_LARGE", "Tutar sınırı aşıldı.");
  return {
    credits,
    total: moneyText(total),
    unitPrice: moneyText(price),
    currency: settings.currency ?? "TRY",
  };
}
