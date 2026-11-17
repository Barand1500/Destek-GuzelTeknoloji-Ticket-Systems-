import { db } from "../config/db.js";
import type { Actor } from "../types/express.js";
import { can } from "./permissions.js";
import { AppError } from "../utils/errors.js";
import { periodInput } from "./credit-periods.js";
import { publishChange } from "./events.service.js";
function allowed(actor: Actor, write = false) {
  if (
    actor.role === "CUSTOMER" ||
    !can(actor, write ? "integrations.update" : "integrations.view")
  )
    throw new AppError(403, "FORBIDDEN", "Paket dönemleri için yetkiniz yok.");
}
export async function listCreditPeriods(actor: Actor) {
  allowed(actor);
  return db.creditSalesPeriod.findMany({
    where: { archivedAt: null },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: 100,
    select: { id: true, name: true, unit: true, value: true },
  });
}
export async function createCreditPeriod(actor: Actor, raw: unknown) {
  allowed(actor, true);
  const input = periodInput.parse(raw);
  try {
    const result = await db.$transaction(async (tx) => {
      // Serialize catalog writes on an existing shared settings row; works on a fresh catalog too.
      await tx.creditSalesSettings.upsert({
        where: { id: "default" },
        create: { id: "default" },
        update: { id: "default" },
      });
      await tx.$queryRaw`SELECT id FROM CreditSalesSettings WHERE id = 'default' FOR UPDATE`;
      const existing = await tx.creditSalesPeriod.findUnique({
        where: { name: input.name },
      });
      if (existing && !existing.archivedAt)
        throw new AppError(
          409,
          "PERIOD_EXISTS",
          "Bu isimde bir dönem zaten var.",
        );
      if (
        (await tx.creditSalesPeriod.count({ where: { archivedAt: null } })) >=
        100
      )
        throw new AppError(
          400,
          "PERIOD_LIMIT",
          "En fazla 100 dönem kaydedilebilir. Kullanmadığınız dönemleri kaldırın.",
        );
      const row = existing
        ? await tx.creditSalesPeriod.update({
            where: { id: existing.id },
            data: { ...input, archivedAt: null },
          })
        : await tx.creditSalesPeriod.create({ data: input });
      await tx.activityLog.create({
        data: {
          userId: actor.id,
          action: "credit_period.created",
          entityType: "CreditSalesPeriod",
          entityId: row.id,
          metadata: input,
          ipAddress: actor.ipAddress,
        },
      });
      return { id: row.id, name: row.name, unit: row.unit, value: row.value };
    });
    publishChange();
    return result;
  } catch (error) {
    if (
      error &&
      typeof error === "object" &&
      "code" in error &&
      error.code === "P2002"
    )
      throw new AppError(
        409,
        "PERIOD_EXISTS",
        "Bu isimde bir dönem zaten var.",
      );
    throw error;
  }
}
export async function archiveCreditPeriod(actor: Actor, id: string) {
  allowed(actor, true);
  await db.$transaction(async (tx) => {
    const changed = await tx.creditSalesPeriod.updateMany({
      where: { id, archivedAt: null },
      data: { archivedAt: new Date() },
    });
    if (!changed.count)
      throw new AppError(404, "PERIOD_NOT_FOUND", "Dönem bulunamadı.");
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: "credit_period.archived",
        entityType: "CreditSalesPeriod",
        entityId: id,
        ipAddress: actor.ipAddress,
      },
    });
  });
  publishChange();
}
