import type {
  Agreement,
  PrismaClient,
  User,
} from "../generated/prisma/client.js";

import { createHash } from "node:crypto";
import { eligibleAlertChannels } from "./credit-alert-delivery.js";
import { enqueueOutbound } from "./outbound-queue.store.js";

/** Durable per-lifecycle, per-channel reminders. */
export async function processCreditAlerts(
  client: PrismaClient,
  now = new Date(),
  shouldStop = () => false,
): Promise<void> {
  const settings = await client.creditSalesSettings.findUnique({
    where: { id: "default" },
  });
  if (settings?.alertsEnabled === false || shouldStop()) return;
  const integrations = settings?.alertChannels && Array.isArray(settings.alertChannels) && settings.alertChannels.some(c => c !== "IN_APP")
    ? await client.integrationSettings.findUnique({ where: { id: "default" } }) : null;
  const lowPercent = settings?.lowCreditPercent ?? 20;
  const expiryDays = settings?.expiryNoticeDays ?? 7;
  const today = new Date(
    new Intl.DateTimeFormat("sv-SE", {
      timeZone: "Europe/Istanbul",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(now),
  );
  const expiryLimit = new Date(today.getTime() + expiryDays * 86_400_000);
  let after: string | undefined;
  while (!shouldStop()) {
    const rows = await client.agreement.findMany({
      where: {
        ...(after ? { id: { gt: after } } : {}),
        deletedAt: null,
        cancelledAt: null,
        startsOn: { lte: today },
        endsOn: { gte: today },
        customer: {
          role: "CUSTOMER",
          isActive: true,
          deletedAt: null,
          parentCustomerId: null,
        },
      },
      select: {
        id: true,
        customerId: true,
        name: true,
        credits: true,
        usedCredits: true,
        startsOn: true,
        endsOn: true,
      },
      orderBy: { id: "asc" },
      take: 100,
    });
    for (const candidate of rows) {
      if (shouldStop()) return;
      await client.$transaction(async (tx) => {
        // Match debit/customer mutation lock order. Locking reads see committed changes
        // even when an agreement changed after this page was selected.
        const owners = await tx.$queryRaw<
          Array<
            Pick<
              User,
              "id" | "role" | "isActive" | "deletedAt" | "parentCustomerId" | "email" | "phone"
            >
          >
        >`
          SELECT id, role, isActive, deletedAt, parentCustomerId, email, phone FROM User WHERE id = ${candidate.customerId} FOR UPDATE`;
        const owner = owners[0];
        if (
          !owner ||
          !owner.isActive ||
          owner.role !== "CUSTOMER" ||
          owner.deletedAt ||
          owner.parentCustomerId
        )
          return;
        const agreements = await tx.$queryRaw<
          Array<
            Pick<
              Agreement,
              | "id"
              | "customerId"
              | "name"
              | "credits"
              | "usedCredits"
              | "startsOn"
              | "endsOn"
              | "deletedAt"
              | "cancelledAt"
            >
          >
        >`
          SELECT id, customerId, name, credits, usedCredits, startsOn, endsOn, deletedAt, cancelledAt
          FROM Agreement WHERE id = ${candidate.id} FOR UPDATE`;
        const agreement = agreements[0];
        if (
          !agreement ||
          agreement.customerId !== owner.id ||
          agreement.deletedAt ||
          agreement.cancelledAt ||
          agreement.startsOn > today ||
          agreement.endsOn < today ||
          shouldStop()
        )
          return;
        const remaining = Math.max(
          0,
          agreement.credits - agreement.usedCredits,
        );
        const kinds: Array<"LOW_CREDIT" | "EXPIRING"> = [];
        if (
          agreement.credits > 0 &&
          remaining * 100 <= agreement.credits * lowPercent
        )
          kinds.push("LOW_CREDIT");
        if (agreement.endsOn <= expiryLimit) kinds.push("EXPIRING");
        for (const kind of kinds) {
          // Spending credits does not re-arm alerts. Changing entitlement/dates starts a new lifecycle.
          const baseId = createHash("sha256")
            .update(
              JSON.stringify([
                agreement.id,
                agreement.customerId,
                kind,
                agreement.credits,
                agreement.startsOn.toISOString(),
                agreement.endsOn.toISOString(),
              ]),
            )
            .digest("hex");
          for (const channel of eligibleAlertChannels(settings, integrations, owner)) {
            const id = channel === "IN_APP" ? baseId : createHash("sha256").update(`${baseId}:${channel}`).digest("hex");
            const inserted = await tx.creditAlertReceipt.createMany({
              data: {
                id,
                agreementId: agreement.id,
                customerId: agreement.customerId,
                kind,
                channel,
              },
              skipDuplicates: true,
            });
            if (!inserted.count) continue;
            const data = {
                userId: agreement.customerId,
                type: kind === "LOW_CREDIT" ? "CREDIT_LOW" : "CREDIT_EXPIRING",
                title:
                  kind === "LOW_CREDIT"
                    ? "Anlaşma krediniz azalıyor"
                    : "Anlaşmanızın süresi doluyor",
                message:
                  kind === "LOW_CREDIT"
                    ? `“${agreement.name}” anlaşmanızda ${agreement.credits} krediden ${remaining} kredi kaldı.`
                    : `“${agreement.name}” anlaşmanızın bitiş tarihi ${agreement.endsOn.toISOString().slice(0, 10)}.`,
            };
            if (channel === "IN_APP") await tx.notification.create({ data });
            else await enqueueOutbound(channel, { recipient: { email: owner.email, phone: owner.phone }, text: data.message, subject: data.title, context: { userId: owner.id },
              ...(channel === "WHATSAPP" ? { whatsappTemplate: { name: settings!.whatsappCreditTemplateName, language: settings!.whatsappCreditTemplateLanguage, parameters: [data.message] } } : {}),
            }, tx, `credit-alert:${id}`);
          }
        }
      });
    }
    if (rows.length < 100) return;
    after = rows[rows.length - 1].id;
  }
}

export function startCreditAlerts(client: PrismaClient) {
  if (process.env.NODE_ENV === "test") return async () => {};
  let stopping = false;
  let active: Promise<void> | undefined;
  const tick = () => {
    if (stopping || active) return;
    active = processCreditAlerts(client, new Date(), () => stopping)
      .catch((error) =>
        console.error(
          "[Kredi bildirimleri]",
          error instanceof Error ? error.message : String(error),
        ),
      )
      .finally(() => {
        active = undefined;
      });
  };
  tick();
  const timer = setInterval(tick, 15 * 60 * 1000);
  timer.unref();
  return async () => {
    stopping = true;
    clearInterval(timer);
    await active;
  };
}
