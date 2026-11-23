import { createHash } from "node:crypto";
import { requestAkbankInstructionStop } from './akbank-recurring-state.js';
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
    confirmPackageChange: z.boolean().default(false),
    quoteKey: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict();
export const creditOrderListInput = paginationSchema.extend({
  limit: z.coerce.number().int().min(1).max(100).default(20),
  search: z.string().trim().max(100).optional(),
  subscriptionId: z.uuid().optional(),
  refundRequested: z.enum(['true']).optional(),
  status: z.enum(["PENDING", "CANCELLED", "PAID", "FAILED", "PARTIAL_REFUND", "REFUNDED"]).optional(),
  currency: z.enum(["TRY", "USD", "EUR", "GBP"]).optional(),
});
const fields = {
  id: true,
  number: true,
  paidAt: true,
  subscriptionId: true,
  periodStartsOn: true,
  periodEndsOn: true,
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
  reversals: { select: { id: true, status: true, kind: true, amount: true, credits: true }, orderBy: { createdAt: 'desc' }, take: 100 },
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
  input = createCreditOrderInput.parse(input);
  const result = await db.$transaction(async (tx) => {
    // Serializes idempotent retries and ownership changes for this account.
    await tx.$queryRaw(
      Prisma.sql`SELECT id FROM User WHERE id = ${actor.id} FOR UPDATE`,
    );
    const account = await creditStoreOwner(actor, tx);
    const inputHash = createHash("sha256")
      .update(JSON.stringify([input.selection, input.quoteKey, input.confirmPackageChange ?? false]))
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
    const schedule = 'startsOn' in quote ? quote : null;
    if (schedule?.currentPackage && !input.confirmPackageChange) throw new AppError(400, 'PACKAGE_CHANGE_CONFIRMATION_REQUIRED', 'Mevcut dönem sonundaki paket değişimini onaylayın.');
    let row = await tx.creditOrder.create({
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
        ...(schedule ? { periodStartsOn: new Date(schedule.startsOn), periodEndsOn: new Date(schedule.endsOn) } : {}),
      },
      select: fields,
    });
    if (row.kind === 'SUBSCRIPTION') {
      // A single-period history record, with no recurring consent or payment setup.
      const subscription = await tx.creditSubscription.create({ data: {
        customerId: account.id, name: row.name, amount: row.total, currency: row.currency,
        credits: row.credits, periodMonths: row.periodMonths, periodDays: row.validityDays,
        autoRenew: false, consentedAt: null, nextPaymentOn: null,
        status: 'AWAITING_PAYMENT', anchorOn: schedule ? new Date(schedule.startsOn) : null,
      } });
      row = await tx.creditOrder.update({ where: { id: row.id }, data: { subscriptionId: subscription.id, periodNumber: 1 }, select: fields });
    }
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
    ...(input.subscriptionId ? { subscriptionId: input.subscriptionId } : {}),
    ...(input.refundRequested ? { refundRequest: { is: { status: 'OPEN' } } } : {}),
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
        select: { ...fields, refundRequest: { select: { status: true } }, grantedAgreement: { select: { usedCredits: true } }, paymentAttempts: { where: { status: 'PENDING' }, select: { id: true }, take: 1 } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: input.limit,
        skip: (input.page - 1) * input.limit,
      });
      return {
        data: rows.map(({ paymentAttempts, grantedAgreement, ...row }) => ({ ...json(row), usedCredits: grantedAgreement?.usedCredits ?? 0, canBankCancel: !!grantedAgreement && row.status === 'PAID' && !grantedAgreement?.usedCredits && !!row.paidAt && row.paidAt.toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }) === new Date().toLocaleDateString('sv-SE', { timeZone: 'Europe/Istanbul' }) && !row.reversals.some(v => ['PENDING', 'REVIEW', 'SUCCEEDED'].includes(v.status)), paymentInProgress: paymentAttempts.length > 0 })),
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
    if (!admin && row.kind === 'TOP_UP') throw new AppError(409, 'ORDER_CANCEL_NOT_ALLOWED', 'Tekli kredi siparişini yalnızca yönetici iptal edebilir.');
    if (row.status === "CANCELLED") return json(row);
    if (!["PENDING", "FAILED"].includes(row.status))
      throw new AppError(
        409,
        "ORDER_NOT_PENDING",
        "Yalnızca ödeme bekleyen veya başarısız sipariş iptal edilebilir.",
      );
    await tx.$queryRaw(Prisma.sql`SELECT id FROM User WHERE id = ${row.customerId} FOR UPDATE`);
    if (!admin) await creditStoreOwner(actor, tx);
    if (await tx.creditPaymentAttempt.count({ where: { orderId: id, status: 'PENDING' } }))
      throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Ödeme sonucu bekleniyor. Sonuç netleşmeden sipariş iptal edilemez.');
    const claimed = await tx.creditOrder.updateMany({
      where: { id, status: { in: ["PENDING", "FAILED"] } },
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
        metadata: { customerId: row.customerId, orderNumber: row.number },
        ipAddress: actor.ipAddress,
      },
    });
    if (row.subscriptionId) await tx.creditSubscription.update({ where: { id: row.subscriptionId }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: new Date(), nextPaymentOn: null } });
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
  }, { isolationLevel: 'ReadCommitted' });
  publishChange();
  return result;
}
