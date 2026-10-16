import { z } from "zod";
import { db } from "../config/db.js";
import { AppError } from "../utils/errors.js";
import { can, permissionScope } from "./permissions.js";
import { canonicalPhone } from "./inbound-phone-matching.js";
import { publishChange } from "./events.service.js";
import type { Actor } from "../types/express.js";

export const mergeCustomersInput = z
  .object({ sourceIds: z.array(z.uuid()).min(1).max(50) })
  .strict()
  .refine(
    (input) => new Set(input.sourceIds).size === input.sourceIds.length,
    "Aynı müşteri tekrar seçilemez.",
  );
const split = (value: string | null) =>
  (value ?? "")
    .split(/[,;\n]+/)
    .map((item) => item.trim())
    .filter(Boolean);
export const duplicateCustomersQuery = z.object({
  field: z.enum(['name', 'email', 'company', 'phone']),
  search: z.string().trim().max(100).default(''),
}).strict();
type DuplicateCustomer = { id: string; name: string; email: string | null; phone: string | null; company: string | null; extraEmails: string | null; extraPhones: string | null };
const identityKey = (value: string) => value.trim().replace(/\s+/g, ' ').toLocaleLowerCase('tr-TR');
export function groupDuplicateCustomers(customers: DuplicateCustomer[], field: 'name' | 'email' | 'company' | 'phone', search = '') {
  const groups = new Map<string, { key: string; value: string; customers: DuplicateCustomer[] }>();
  for (const customer of customers) {
    const values = field === 'email' ? [customer.email, ...split(customer.extraEmails)] : field === 'phone' ? [customer.phone, ...split(customer.extraPhones)] : [customer[field]];
    for (const value of values) {
      if (!value) continue;
      const key = field === 'phone' ? canonicalPhone(value) : field === 'email' ? value.trim().toLowerCase() : identityKey(value);
      if (!key) continue;
      const group = groups.get(key) ?? { key, value: value.trim(), customers: [] };
      if (!group.customers.some(item => item.id === customer.id)) group.customers.push(customer);
      groups.set(key, group);
    }
  }
  const needle = field === 'phone' ? search.replace(/\D/g, '') : field === 'email' ? search.toLowerCase() : identityKey(search);
  return [...groups.values()].filter(group => group.customers.length > 1 && (!needle || group.key.includes(needle))).sort((a, b) => a.value.localeCompare(b.value, 'tr'));
}
export async function duplicateCustomers(actor: Actor, input: z.infer<typeof duplicateCustomersQuery>) {
  if (actor.role === 'CUSTOMER' || !can(actor, 'customers.update') || !can(actor, 'customers.delete'))
    throw new AppError(403, 'FORBIDDEN', 'Müşteri birleştirme için düzenleme ve silme yetkisi gerekir.');
  const scope = permissionScope(actor);
  const customers = await db.user.findMany({
    where: { role: 'CUSTOMER', deletedAt: null, ...(scope === 'ALL' ? {} : { customerConversations: { none: scope === 'OWN' ? { OR: [{ assignedAgentId: null }, { assignedAgentId: { not: actor.id } }] } : { departmentId: { notIn: actor.departmentIds } } } }) },
    select: { id: true, name: true, email: true, phone: true, company: true, extraEmails: true, extraPhones: true },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return groupDuplicateCustomers(customers, input.field, input.search);
}
function unique(values: string[], key: (value: string) => string) {
  const seen = new Set<string>();
  return values.filter((value) => {
    const normalized = key(value);
    if (!normalized || seen.has(normalized)) return false;
    seen.add(normalized);
    return true;
  });
}
export async function mergeCustomers(
  actor: Actor,
  targetId: string,
  input: z.infer<typeof mergeCustomersInput>,
) {
  if (
    actor.role === "CUSTOMER" ||
    !can(actor, "customers.update") ||
    !can(actor, "customers.delete")
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Müşteri birleştirme için düzenleme ve silme yetkisi gerekir.",
    );
  if (input.sourceIds.includes(targetId))
    throw new AppError(
      400,
      "INVALID_MERGE",
      "Ana müşteri kendisiyle birleştirilemez.",
    );
  const ids = [targetId, ...input.sourceIds];
  for (let attempt = 0; ; attempt++) {
    try {
      const result = await db.$transaction(
        async (tx) => {
          const customers = await tx.user.findMany({
            where: { id: { in: ids }, role: "CUSTOMER", deletedAt: null },
          });
          if (customers.length !== ids.length)
            throw new AppError(
              409,
              "CUSTOMER_UNAVAILABLE",
              "Seçilen müşterilerden biri silinmiş veya artık kullanılamıyor.",
            );
          const target = customers.find((item) => item.id === targetId)!;
          const sources = input.sourceIds.map((id) =>
            customers.find((item) => item.id === id)!,
          );
          const conversations = await tx.conversation.findMany({
            where: { customerId: { in: ids } },
            select: {
              id: true,
              customerId: true,
              departmentId: true,
              assignedAgentId: true,
            },
          });
          const scope = permissionScope(actor);
          if (
            scope !== "ALL" &&
            conversations.some((item) =>
              scope === "OWN"
                ? item.assignedAgentId !== actor.id
                : !actor.departmentIds.includes(item.departmentId),
            )
          )
            throw new AppError(
              403,
              "FORBIDDEN",
              "Seçilen müşterilerin kapsamınız dışında talepleri var. Birleştirme için sistem yöneticisi gerekir.",
            );
          const ordered = [target, ...sources];
          const emails = unique(
            ordered.flatMap((item) => [
              ...(item.email ? [item.email] : []),
              ...split(item.extraEmails),
            ]),
            (value) => value.toLowerCase(),
          );
          const phones = unique(
            ordered.flatMap((item) => [
              ...(item.phone ? [item.phone] : []),
              ...split(item.extraPhones),
            ]),
            canonicalPhone,
          );
          const email = target.email || emails[0] || null,
            phone = target.phone || phones[0] || null;
          const extraEmails = emails
            .filter((value) => value.toLowerCase() !== email?.toLowerCase())
            .join(", ");
          const extraPhones = phones
            .filter((value) => canonicalPhone(value) !== canonicalPhone(phone))
            .join(", ");
          const company =
            target.company ||
            sources.find((item) => item.company)?.company ||
            null;
          const notes = [
            target.staffNote,
            ...sources.flatMap((item) => {
              const details = [
                item.name !== target.name ? `Ad: ${item.name}` : "",
                item.company && item.company !== company
                  ? `Şirket: ${item.company}`
                  : "",
                item.staffNote ?? "",
              ].filter(Boolean);
              return [
                `Birleştirilen müşteri (${item.name})${details.length ? `: ${details.join(" · ")}` : ""} · İşlemi yapan: ${actor.name}`,
              ];
            }),
          ]
            .filter(Boolean)
            .join("\n");
          if (
            extraEmails.length > 500 ||
            extraPhones.length > 500 ||
            notes.length > 2000
          )
            throw new AppError(
              409,
              "MERGE_LIMIT",
              "Birleştirilen iletişim bilgileri veya notlar alan sınırını aşıyor. Daha az müşteri seçin ya da önce bilgileri düzenleyin.",
            );
          const moved = await tx.conversation.updateMany({
            where: { customerId: { in: input.sourceIds } },
            data: { customerId: targetId },
          });
          await tx.conversationMessage.updateMany({
            where: { authorId: { in: input.sourceIds } },
            data: { authorId: targetId },
          });
          await tx.customerAttachment.updateMany({
            where: { customerId: { in: input.sourceIds } },
            data: { customerId: targetId },
          });
          await tx.conversationAttachment.updateMany({
            where: { uploaderId: { in: input.sourceIds } },
            data: { uploaderId: targetId },
          });
          const participants = await tx.conversationParticipant.findMany({
            where: { userId: { in: input.sourceIds } },
          });
          if (participants.length)
            await tx.conversationParticipant.createMany({
              data: participants.map((item) => ({
                conversationId: item.conversationId,
                userId: targetId,
                createdAt: item.createdAt,
              })),
              skipDuplicates: true,
            });
          await tx.conversationParticipant.deleteMany({
            where: { userId: { in: input.sourceIds } },
          });
          const mentions = await tx.conversationMessageMention.findMany({
            where: { userId: { in: input.sourceIds } },
          });
          if (mentions.length)
            await tx.conversationMessageMention.createMany({
              data: mentions.map((item) => ({
                messageId: item.messageId,
                userId: targetId,
              })),
              skipDuplicates: true,
            });
          await tx.conversationMessageMention.deleteMany({
            where: { userId: { in: input.sourceIds } },
          });
          await tx.notification.updateMany({
            where: { userId: { in: input.sourceIds } },
            data: { userId: targetId },
          });
          await tx.session.updateMany({
            where: { userId: { in: input.sourceIds }, revokedAt: null },
            data: { revokedAt: new Date() },
          });
          await tx.user.updateMany({
            where: { id: { in: input.sourceIds } },
            data: { isActive: false, deletedAt: new Date(), loginEmail: null },
          });
          const customer = await tx.user.update({
            where: { id: targetId },
            data: {
              email,
              phone,
              extraEmails: extraEmails || null,
              extraPhones: extraPhones || null,
              company,
              staffNote: notes || null,
            },
            select: {
              id: true,
              name: true,
              email: true,
              phone: true,
              extraEmails: true,
              extraPhones: true,
              company: true,
              staffNote: true,
            },
          });
          await tx.activityLog.create({
            data: {
              userId: actor.id,
              action: "customer.merged",
              entityId: targetId,
              metadata: {
                name: target.name,
                details: [
                  `Birleştirilen müşteriler: ${sources.map((item) => item.name).join(", ")}`,
                  `Taşınan talep sayısı: ${moved.count}`,
                ],
                targetName: target.name,
                sourceIds: input.sourceIds,
                sourceNames: sources.map((item) => item.name),
                movedConversationCount: moved.count,
              },
              ipAddress: actor.ipAddress,
            },
          });
          return {
            customer,
            mergedCount: sources.length,
            movedConversationCount: moved.count,
          };
        },
        { isolationLevel: "Serializable", timeout: 15000 },
      );
      publishChange();
      return result;
    } catch (error) {
      if ((error as { code?: string }).code !== "P2034" || attempt >= 3)
        throw error;
    }
  }
}
