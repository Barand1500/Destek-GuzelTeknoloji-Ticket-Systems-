import { createHash } from "node:crypto";
import { selectedCreditChannels, creditChannelAvailability } from './credit-channel-readiness.js';
import type { Prisma } from "../generated/prisma/client.js";
import { db } from "../config/db.js";
import type { Actor } from "../types/express.js";
import { can } from "./permissions.js";
import { AppError } from "../utils/errors.js";
import {
  creditQuote,
  moneyMinor,
  moneyText,
  type salesSettingsInput,
  type salesPlanInput,
  type quoteInput,
} from "./credit-store-pricing.js";
import type { z } from "zod";
type StoreClient = Pick<
  Prisma.TransactionClient,
  "user" | "creditSalesSettings" | "creditSalesPlan"
>;
const defaults = {
  enabled: false,
  currency: "TRY",
  alertsEnabled: true,
  alertChannels: ['IN_APP'] as import('./credit-channel-readiness.js').CreditAlertChannel[],
  whatsappCreditTemplateName: '',
  whatsappCreditTemplateLanguage: 'tr',
  lowCreditPercent: 20,
  expiryNoticeDays: 7,
  unitPrice: "1.00",
  minCredits: 1,
  maxCredits: 10000,
  validityDays: 365,
};
function staff(actor: Actor, edit = false) {
  if (
    actor.role === "CUSTOMER" ||
    !can(actor, edit ? "integrations.update" : "integrations.view")
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Kredi satış ayarları için yetkiniz yok.",
    );
}
async function settings(client: StoreClient = db) {
  const row = await client.creditSalesSettings.findUnique({
    where: { id: "default" },
  });
  return row
    ? {
        enabled: row.enabled,
        currency: row.currency,
        alertsEnabled: row.alertsEnabled,
        alertChannels: selectedCreditChannels(row.alertChannels),
        whatsappCreditTemplateName: row.whatsappCreditTemplateName,
        whatsappCreditTemplateLanguage: row.whatsappCreditTemplateLanguage,
        lowCreditPercent: row.lowCreditPercent,
        expiryNoticeDays: row.expiryNoticeDays,
        unitPrice: row.unitPrice.toString(),
        minCredits: row.minCredits,
        maxCredits: row.maxCredits,
        validityDays: row.validityDays,
      }
    : defaults;
}
export async function creditStoreOwner(actor: Actor, client: StoreClient = db) {
  if (actor.role !== "CUSTOMER")
    throw new AppError(403, "FORBIDDEN", "Bu ekran müşteriler içindir.");
  const person = await client.user.findFirst({
    where: { id: actor.id, role: "CUSTOMER", isActive: true, deletedAt: null },
    select: { id: true, name: true, company: true, parentCustomerId: true },
  });
  if (!person)
    throw new AppError(
      403,
      "INACTIVE_CUSTOMER",
      "Müşteri hesabınız aktif değil.",
    );
  if (person.parentCustomerId)
    throw new AppError(
      403,
      "PURCHASE_OWNER_ONLY",
      "Kredi ve abonelik alımlarını yalnızca ana müşteri veya şirket sahibi yapabilir.",
    );
  return {
    id: person.id,
    name: person.company?.trim() || person.name,
    isCompany: Boolean(person.company?.trim()),
  };
}

const planJson = <T extends { price: { toString(): string } }>(row: T) => ({
  ...row,
  price: row.price.toString(),
});
export async function salesAdminCatalog(actor: Actor) {
  staff(actor);
  const config = await settings();
  return {
    settings: config,
    channelAvailability: await creditChannelAvailability(db, config),
    plans: (
      await db.creditSalesPlan.findMany({
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        take: 100,
      })
    ).map(planJson),
  };
}
export async function saveSalesSettings(
  actor: Actor,
  input: z.infer<typeof salesSettingsInput>,
) {
  staff(actor, true);
  creditQuote(input, { credits: input.maxCredits }); // Ensure maximum order stays within the monetary range.
  return db.$transaction(async (tx) => {
    const row = await tx.creditSalesSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...input },
      update: input,
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: "credit_sales.settings_updated",
        entityType: "CreditSalesSettings",
        entityId: "default",
        metadata: input,
        ipAddress: actor.ipAddress,
      },
    });
    return { ...row, unitPrice: row.unitPrice.toString() };
  });
}
export async function saveSalesPlan(
  actor: Actor,
  id: string | null,
  input: z.infer<typeof salesPlanInput>,
) {
  staff(actor, true);
  const planData = {
    ...input,
    periodMonths: input.periodMonths ?? null,
    periodDays: input.periodDays ?? null,
    periodName: input.periodName ?? null,
    renewalRequested: input.renewalRequested ?? false,
  };
  return db.$transaction(async (tx) => {
    if (
      id &&
      !(await tx.creditSalesPlan.findUnique({
        where: { id },
        select: { id: true },
      }))
    )
      throw new AppError(404, "PLAN_NOT_FOUND", "Abonelik planı bulunamadı.");
    if (!id && (await tx.creditSalesPlan.count()) >= 100)
      throw new AppError(
        400,
        "PLAN_LIMIT",
        "En fazla 100 plan tanımlanabilir. Mevcut planları düzenleyebilirsiniz.",
      );
    const row = id
      ? await tx.creditSalesPlan.update({ where: { id }, data: planData })
      : await tx.creditSalesPlan.create({ data: planData });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: id ? "credit_sales.plan_updated" : "credit_sales.plan_created",
        entityType: "CreditSalesPlan",
        entityId: row.id,
        metadata: input,
        ipAddress: actor.ipAddress,
      },
    });
    return planJson(row);
  });
}
export async function storeCatalog(actor: Actor) {
  const account = await creditStoreOwner(actor),
    config = await settings();
  return {
    owner: account,
    settings: config,
    paymentAvailable: false,
    plans: config.enabled
      ? (
          await db.creditSalesPlan.findMany({
            where: { active: true },
            orderBy: [
              { periodMonths: "asc" },
              { createdAt: "asc" },
              { id: "asc" },
            ],
            take: 100,
          })
        ).map(planJson)
      : [],
  };
}
export async function storeQuote(
  actor: Actor,
  input: z.infer<typeof quoteInput>,
  client: StoreClient = db,
) {
  const account = await creditStoreOwner(actor, client),
    config = await settings(client);
  if (!config.enabled)
    throw new AppError(400, "SALES_DISABLED", "Kredi satışı henüz açılmadı.");
  if ("planId" in input) {
    const plan = await client.creditSalesPlan.findUnique({
      where: { id: input.planId },
    });
    if (!plan?.active)
      throw new AppError(
        404,
        "PLAN_NOT_FOUND",
        "Bu abonelik planı satışa açık değil.",
      );
    return quoteSnapshot({
      owner: account,
      kind: "SUBSCRIPTION",
      name: plan.name,
      credits: plan.credits,
      total: moneyText(moneyMinor(plan.price.toString())),
      currency: plan.currency,
      periodMonths: plan.periodMonths,
      validityDays: plan.periodDays ?? null,
      periodName: plan.periodName ?? null,
      renewalRequested:
        input.renewalRequested ?? plan.renewalRequested ?? false,
      paymentAvailable: false,
    });
  }
  return quoteSnapshot({
    owner: account,
    kind: "TOP_UP",
    name: "Ek kredi",
    ...creditQuote(config, input),
    periodMonths: null,
    validityDays: config.validityDays,
    periodName: null,
    renewalRequested: false,
    paymentAvailable: false,
  });
}

function quoteSnapshot<
  T extends {
    owner: { id: string };
    name: string;
    kind: string;
    credits: number;
    total: string;
    currency: string;
    periodMonths: number | null;
    validityDays: number | null;
    periodName?: string | null;
    renewalRequested?: boolean;
  },
>(quote: T) {
  const quoteKey = createHash("sha256")
    .update(
      JSON.stringify([
        quote.owner.id,
        quote.name,
        quote.kind,
        quote.credits,
        quote.total,
        quote.currency,
        quote.periodMonths,
        quote.validityDays,
        ...(quote.periodName || quote.renewalRequested
          ? [quote.periodName ?? null, quote.renewalRequested ?? false]
          : []),
      ]),
    )
    .digest("hex");
  return { ...quote, quoteKey };
}
