import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "../config/db.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Actor } from "../types/express.js";
import { AppError } from "../utils/errors.js";
import { can } from "./permissions.js";
import { publishChange } from "./events.service.js";
import { creditStoreOwner, storeQuote } from "./credit-store.service.js";
import { quoteInput } from "./credit-store-pricing.js";
import { paginationSchema } from "../validators/index.js";
export const createCreditOrderInput = z
  .object({
    requestKey: z.uuid(),
    selection: quoteInput,
    quoteKey: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const creditOrderListInput = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  status: z.enum(["PENDING", "CANCELLED", "PAID", "FAILED"]).optional(),
  currency: z.enum(["TRY", "USD", "EUR", "GBP"]).optional(),
});
const fields = {
  id: true,
  number: true,
  customerId: true,
  name: true,
  kind: true,
  credits: true,
  total: true,
  currency: true,
  unitPrice: true,
  validityDays: true,
  periodMonths: true,
  periodName: true,
  renewalRequested: true,
  status: true,
  cancelledAt: true,
  createdAt: true,
  updatedAt: true,
  customer: { select: { id: true, name: true, company: true } },
} as const;
const json = <
  T extends {
    total: { toString(): string };
    unitPrice: { toString(): string } | null;
  },
>(
  row: T,
) => ({
  ...row,
  total: row.total.toString(),
  unitPrice: row.unitPrice?.toString() ?? null,
});
function staff(actor: Actor, edit = false) {
  if (
    actor.role === "CUSTOMER" ||
    !can(actor, edit ? "integrations.update" : "integrations.view")
  )
    throw new AppError(403, "FORBIDDEN", "Siparişler için yetkiniz yok.");
}
export async function createCreditOrder(
  actor: Actor,
  input: z.infer<typeof createCreditOrderInput>,
) {
  const result = await db.$transaction(async (tx) => {
    // Serializes idempotent retries and ownership changes for this account.
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`,
    );
    const account = await creditStoreOwner(actor, tx);
    const inputHash = createHash("sha256")
      .update(JSON.stringify([input.selection, input.quoteKey]))
      .digest("hex");
    const existing = await tx.creditOrder.findUnique({
      where: {
        customerId_requestKey: {
          customerId: account.id,
          requestKey: input.requestKey,
        },
      },
      include: {
        customer: { select: { id: true, name: true, company: true } },
      },
    });
    if (existing) {
      if (existing.inputHash !== inputHash)
        throw new AppError(
          409,
          "IDEMPOTENCY_CONFLICT",
          "Bu işlem anahtarı farklı bir sipariş için kullanılmış. Özeti yeniden açın.",
        );
      const { inputHash: _hash, requestKey: _key, ...safe } = existing;
      return json(safe);
    }
    const quote = await storeQuote(actor, input.selection, tx);
    if (quote.quoteKey !== input.quoteKey)
      throw new AppError(
        409,
        "QUOTE_CHANGED",
        "Fiyat veya paket koşulları değişti. Güncel özeti yeniden inceleyin.",
      );
    const row = await tx.creditOrder.create({
      data: {
        customerId: account.id,
        requestedById: actor.id,
        requestKey: input.requestKey,
        inputHash,
        name: quote.name,
        kind: quote.kind,
        credits: quote.credits,
        total: quote.total,
        currency: quote.currency,
        unitPrice:
          "unitPrice" in quote && typeof quote.unitPrice === "string"
            ? quote.unitPrice
            : null,
        validityDays: quote.validityDays,
        periodMonths: quote.periodMonths,
        periodName: quote.periodName,
        renewalRequested: quote.renewalRequested,
      },
      select: fields,
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: "credit_order.created",
        entityType: "CreditOrder",
        entityId: row.id,
        metadata: {
          number: row.number,
          total: quote.total,
          currency: quote.currency,
          credits: quote.credits,
        },
        ipAddress: actor.ipAddress,
      },
    });
    await tx.notification.create({
      data: {
        userId: account.id,
        type: "CREDIT_ORDER_CREATED",
        title: "Kredi siparişiniz kaydedildi",
        message:
          "#" +
          row.number +
          " numaralı siparişiniz kaydedildi. Ödeme henüz alınmadı; hesabınıza kredi yüklenmedi.",
      },
    });
    return json(row);
  });
  publishChange();
  return result;
}
export async function listCreditOrders(
  actor: Actor,
  input: z.infer<typeof creditOrderListInput>,
  admin = false,
) {
  let customerId: string | undefined;
  if (admin) staff(actor);
  else customerId = (await creditStoreOwner(actor)).id;
  const search = input.search?.trim();
  const where: Prisma.CreditOrderWhereInput = {
    ...(customerId ? { customerId } : {}),
    ...(input.status ? { status: input.status } : {}),
    ...(input.currency ? { currency: input.currency } : {}),
    ...(search
      ? {
          OR: [
            { name: { contains: search } },
            ...(/^\d{1,9}$/.test(search) ? [{ number: Number(search) }] : []),
            ...(admin
              ? [
                  { customer: { name: { contains: search } } },
                  { customer: { company: { contains: search } } },
                ]
              : []),
          ],
        }
      : {}),
  };
  return db.$transaction(
    async (tx) => {
      const total = await tx.creditOrder.count({ where });
      const rows = await tx.creditOrder.findMany({
        where,
        select: fields,
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit,
        skip: (input.page - 1) * input.limit,
      });
      return {
        data: rows.map(json),
        pagination: {
          page: input.page,
          limit: input.limit,
          total,
          totalPages: Math.max(1, Math.ceil(total / input.limit)),
        },
      };
    },
    { isolationLevel: "RepeatableRead" },
  );
}
export async function cancelCreditOrder(
  actor: Actor,
  id: string,
  admin = false,
) {
  if (admin) staff(actor, true);
  const result = await db.$transaction(async (tx) => {
    const customerId = admin
      ? undefined
      : (await creditStoreOwner(actor, tx)).id;
    const row = await tx.creditOrder.findUnique({
      where: { id },
      select: fields,
    });
    if (!row || (customerId && row.customerId !== customerId))
      throw new AppError(404, "ORDER_NOT_FOUND", "Sipariş bulunamadı.");
    if (row.status === "CANCELLED") return json(row);
    if (row.status !== "PENDING")
      throw new AppError(
        409,
        "ORDER_NOT_PENDING",
        "Yalnızca ödeme bekleyen sipariş iptal edilebilir.",
      );
    const claimed = await tx.creditOrder.updateMany({
      where: { id, status: "PENDING" },
      data: { status: "CANCELLED", cancelledAt: new Date() },
    });
    if (!claimed.count)
      throw new AppError(
        409,
        "ORDER_CHANGED",
        "Sipariş durumu değişti; listeyi yenileyin.",
      );
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: "credit_order.cancelled",
        entityType: "CreditOrder",
        entityId: id,
        metadata: { customerId: row.customerId },
        ipAddress: actor.ipAddress,
      },
    });
    await tx.notification.create({
      data: {
        userId: row.customerId,
        type: "CREDIT_ORDER_CANCELLED",
        title: "Kredi siparişiniz iptal edildi",
        message:
          "#" +
          row.number +
          " numaralı siparişiniz iptal edildi. Bu işlem ödeme veya kredi hareketi oluşturmadı.",
      },
    });
    return json({ ...row, status: "CANCELLED", cancelledAt: new Date() });
  });
  publishChange();
  return result;
}
