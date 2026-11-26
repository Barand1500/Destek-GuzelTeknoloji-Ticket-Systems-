import { renewalPreference } from './credit-store-pricing.js';
import { syncAgreementRenewal } from './agreement-renewal.js';
import { publishChange } from './events.service.js';
import { z } from 'zod';
import { db } from '../config/db.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../types/express.js';
import { can } from './permissions.js';
import { AppError } from '../utils/errors.js';
import { createCustomerSchema } from '../validators/management.js';
import { createCustomer } from './management.service.js';
import { creditHistoryReport } from './credit-history-report.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Geçerli bir tarih girin.');
export const agreementInput = z.object({
  name: z.string().trim().min(1).max(150), type: z.union([z.enum(['MONTHLY', 'YEARLY', 'ONE_OFF', 'MAINTENANCE']), z.uuid()]),
  startsOn: day, endsOn: day,
  fee: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Ücret en fazla iki ondalık basamak içermelidir.')).default('0'),
  credits: z.number().int().min(0).max(1_000_000),
  renewalRequested: renewalPreference.optional(),
  currency: z.enum(["TRY", "USD", "EUR", "GBP"]).optional(),
}).strict().refine(v => v.endsOn >= v.startsOn, { path: ['endsOn'], message: 'Bitiş tarihi başlangıçtan önce olamaz.' });
export const creditResolutionInput = z.object({ agreementId: z.uuid().nullable().optional(), credits: z.number().int().min(0).max(1_000_000) }).strict();
export const relatedCustomerInput = z.object({ direction: z.enum(['CHILD', 'PARENT']), customer: createCustomerSchema }).strict();
const invalid = (message: string) => new AppError(400, 'INVALID_AGREEMENT', message);
const today = () => new Date(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date()));
function staff(actor: Actor, edit = false) {
  if (actor.role === 'CUSTOMER' || !can(actor, edit ? 'customers.update' : 'customers.view')) throw new AppError(403, 'FORBIDDEN', 'Müşteri anlaşmaları için yetkiniz yok.');
}
async function customer(tx: Prisma.TransactionClient, id: string) {
  const result = await tx.user.findFirst({ where: { id, role: 'CUSTOMER', deletedAt: null }, select: { id: true, name: true, company: true, parentCustomerId: true, shareCreditsWithChildren: true, isActive: true } });
  if (!result) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  return result;
}
export const builtInAgreementTypes: Record<string, string> = { MONTHLY: 'Aylık', YEARLY: 'Yıllık', ONE_OFF: 'Ek Destek Kredisi', MAINTENANCE: 'Bakım Anlaşması' };
export async function listAgreementTypes(actor: Actor) {
  staff(actor);
  return [...Object.entries(builtInAgreementTypes).map(([id, name]) => ({ id, name, builtIn: true })), ...(await db.agreementType.findMany({ where: { archivedAt: null }, orderBy: { name: 'asc' } })).map(t => ({ id: t.id, name: t.name, builtIn: false }))];
}
export async function createAgreementType(actor: Actor, rawName: string) {
  staff(actor, true);
  const name = z.string().trim().min(1).max(80).parse(rawName).replace(/\s+/g, ' ');
  if (Object.values(builtInAgreementTypes).some(label => label.localeCompare(name, 'tr-TR', { sensitivity: 'base' }) === 0)) throw invalid('Bu hazır anlaşma türü zaten var.');
  const result = await db.$transaction(async tx => {
    const existing = await tx.agreementType.findUnique({ where: { name } });
    if (existing && !existing.archivedAt) throw new AppError(409, 'TYPE_EXISTS', 'Bu anlaşma türü zaten var.');
    const type = existing ? await tx.agreementType.update({ where: { id: existing.id }, data: { archivedAt: null } }) : await tx.agreementType.create({ data: { name } });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'agreement_type.created', entityType: 'AgreementType', entityId: type.id, metadata: { name }, ipAddress: actor.ipAddress } });
    return { id: type.id, name: type.name, builtIn: false };
  });
  publishChange(); return result;
}
export async function archiveAgreementType(actor: Actor, id: string) {
  staff(actor, true);
  if (builtInAgreementTypes[id]) throw invalid('Hazır anlaşma türleri silinemez.');
  await db.$transaction(async tx => {
    const changed = await tx.agreementType.updateMany({ where: { id, archivedAt: null }, data: { archivedAt: new Date() } });
    if (!changed.count) throw invalid('Anlaşma türü bulunamadı.');
    await tx.activityLog.create({ data: { userId: actor.id, action: 'agreement_type.archived', entityType: 'AgreementType', entityId: id, ipAddress: actor.ipAddress } });
  }); publishChange();
}
export const relationCandidateInput = z.object({ direction: z.enum(['CHILD', 'PARENT']), search: z.string().trim().max(150).default(''), page: z.coerce.number().int().min(1).max(100000).default(1), limit: z.coerce.number().int().min(1).max(25).default(10) });
export async function listRelationCandidates(actor: Actor, customerId: string, raw: z.input<typeof relationCandidateInput>) {
  staff(actor);
  const input = relationCandidateInput.parse(raw), current = await customer(db, customerId);
  const blocked = input.direction === 'CHILD' ? Boolean(current.parentCustomerId) : Boolean(await db.user.count({ where: { parentCustomerId: current.id, deletedAt: null } }));
  if (blocked) return { data: [], pagination: { page: input.page, limit: input.limit, total: 0, totalPages: 1 } };
  const where: Prisma.UserWhereInput = { id: { not: current.id }, role: 'CUSTOMER', isActive: true, deletedAt: null, parentCustomerId: null,
    ...(input.direction === 'CHILD' ? { subCustomers: { none: { deletedAt: null } } } : {}),
    ...(input.search ? { OR: ['name', 'company', 'email', 'phone'].map(field => ({ [field]: { contains: input.search } })) } : {}) };
  const [total, data] = await db.$transaction([db.user.count({ where }), db.user.findMany({ where, select: { id: true, name: true, company: true, email: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }], skip: (input.page - 1) * input.limit, take: input.limit })]);
  return { data, pagination: { page: input.page, limit: input.limit, total, totalPages: Math.max(1, Math.ceil(total / input.limit)) } };
}
export async function listCustomerRelations(actor: Actor, customerId: string) {
  const person = await customer(db, customerId);
  if (actor.role === 'CUSTOMER') {
    if (actor.id !== person.id && person.parentCustomerId !== actor.id) throw new AppError(403, 'FORBIDDEN', 'Bu müşteriye erişim izniniz yok.');
  } else staff(actor);
  const parent = person.parentCustomerId ? await db.user.findFirst({ where: { id: person.parentCustomerId, isActive: true, deletedAt: null }, select: { id: true, name: true, company: true, shareCreditsWithChildren: true } }) : null;
  const children = await db.user.findMany({ where: { parentCustomerId: person.id, deletedAt: null, role: 'CUSTOMER' }, select: { id: true, name: true, company: true, email: true, phone: true, isActive: true }, orderBy: [{ name: 'asc' }, { id: 'asc' }] });
  return { customer: person, parent, children };
}
export const creditHistoryInput = z.object({
  view: z.enum(['movements', 'people']).optional(),
  personId: z.uuid().optional(),
  agreementId: z.uuid().optional(),
  startsOn: day.optional(),
  endsOn: day.optional(),
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
});
export async function listCreditHistory(actor: Actor, customerId: string, raw: z.input<typeof creditHistoryInput>, allRecords = false) {
  const input = creditHistoryInput.parse(raw);
  const person = await customer(db, customerId);
  if (actor.role === 'CUSTOMER') {
    if (actor.id !== person.id && person.parentCustomerId !== actor.id) throw new AppError(403, 'FORBIDDEN', 'Bu müşteriye erişim izniniz yok.');
  } else staff(actor);
  const where: Prisma.CreditChargeWhereInput = person.parentCustomerId
    ? { conversation: { customerId: person.id } }
    : { OR: [
      { conversation: { customer: { OR: [{ id: person.id }, { parentCustomerId: person.id, deletedAt: null, role: 'CUSTOMER' }] } } },
      { agreement: { customerId: person.id } },
    ] };
  return db.$transaction(async tx => {
    if (input.view && actor.role !== 'CUSTOMER') return creditHistoryReport(tx, where, { ...input, allRecords });
    const total = await tx.creditCharge.count({ where });
    const totalPages = Math.max(1, Math.ceil(total / input.limit));
    const page = Math.min(input.page, totalPages);
    const data = await tx.creditCharge.findMany({
      where, select: { id: true, credits: true, createdAt: true, agreement: { select: { id: true, name: true } }, conversation: { select: { id: true, number: true, subject: true, customer: { select: { name: true } } } } },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (page - 1) * input.limit, take: input.limit,
    });
    return { data, pagination: { page, limit: input.limit, total, totalPages } };
  }, { isolationLevel: 'RepeatableRead' });
}
export async function listAgreements(actor: Actor, customerId: string) {
  const { customer: person, parent, children } = await listCustomerRelations(actor, customerId);
  // Linked people use only their active company's agreements. Legacy personal agreements stay intact.
  const ownerId = person.parentCustomerId ? parent?.id : person.id;
  const agreements = await db.agreement.findMany({ where: { customerId: { in: (ownerId ? [ownerId] : []) }, deletedAt: null }, include: { customer: { select: { id: true, name: true } } }, orderBy: [{ endsOn: 'asc' }, { createdAt: 'desc' }, { id: 'asc' }] });
  const customTypes = await db.agreementType.findMany({ where: { id: { in: agreements.map(a => a.type).filter(t => !builtInAgreementTypes[t]) } } });
  const typeNames = new Map(customTypes.map(t => [t.id, t.name]));
  const now = today();
  const active = (a: typeof agreements[number]) => !a.cancelledAt && a.startsOn <= now && a.endsOn >= now;
  const rows = agreements.map(a => ({ ...a, typeLabel: builtInAgreementTypes[a.type] ?? typeNames.get(a.type) ?? 'Özel Anlaşma', fee: a.fee.toString(), remainingCredits: Math.max(0, a.credits - a.usedCredits),
    usable: Boolean(person.isActive && a.customerId === ownerId && active(a) && a.usedCredits < a.credits),
    creditSource: person.parentCustomerId ? 'COMPANY' : 'PERSONAL',
    state: a.cancelledAt ? 'CANCELLED' : a.startsOn > now ? 'UPCOMING' : a.endsOn < now ? 'EXPIRED' : a.usedCredits >= a.credits ? 'DEPLETED' : 'ACTIVE' }));
  const currentRows = rows.filter(a => a.customerId === ownerId);
  const availableCredits = currentRows.filter(a => a.usable).reduce((sum,a) => sum + a.remainingCredits, 0);
  const charges = await db.creditCharge.findMany({ where: person.parentCustomerId ? { conversation: { customerId: person.id } } : { OR: [{ conversation: { customerId: { in: [person.id, ...children.map(c => c.id)] } } }, { agreement: { customerId: person.id } }] }, select: { id: true, credits: true, createdAt: true, agreement: { select: { id: true, name: true } }, conversation: { select: { id: true, number: true, subject: true, customer: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  return { customer: person, companyName: (person.parentCustomerId ? parent?.company : person.company)?.trim() || null, parent: parent ? { ...parent, shareCreditsWithChildren: true } : null, children, agreements: currentRows, charges,
    personalCredits: person.parentCustomerId ? 0 : availableCredits, parentCredits: person.parentCustomerId ? availableCredits : 0, sharedCredits: person.parentCustomerId ? availableCredits : 0, availableCredits };
}
export async function setCompanyCreditSharing(actor: Actor, customerId: string, _enabled: boolean) {
  staff(actor, true);
  await customer(db, customerId);
  throw new AppError(410, 'COMPANY_CREDIT_POLICY', 'Şirkete bağlı kişiler şirket kredisini kullanır. Ortak kredi açma/kapatma ayarı kaldırıldı.');
}
async function agreementOwner(tx: Prisma.TransactionClient, customerId: string) {
  await tx.$queryRaw`SELECT id FROM User WHERE id = ${customerId} FOR UPDATE`;
  const person = await customer(tx, customerId);
  if (person.parentCustomerId) throw invalid('Şirkete bağlı kişiler için kişisel anlaşma oluşturulamaz veya değiştirilemez. Şirketin anlaşmalarını yönetin.');
  return person;
}
export async function createAgreement(actor: Actor, customerId: string, input: z.infer<typeof agreementInput>) {
  staff(actor, true);
  const checked = agreementInput.parse(input);
  return db.$transaction(async tx => {
    await agreementOwner(tx, customerId);
    if (!builtInAgreementTypes[checked.type]) {
      const active = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM AgreementType WHERE id = ${checked.type} AND archivedAt IS NULL FOR UPDATE`;
      if (!active.length) throw invalid('Bu anlaşma türü artık kullanılamıyor.');
    }
    const result = await tx.agreement.create({ data: { ...checked, renewalRequested: checked.renewalRequested ?? false, customerId, startsOn: new Date(checked.startsOn), endsOn: new Date(checked.endsOn) } });
    await syncAgreementRenewal(tx, result);
    await tx.activityLog.create({ data: { userId: actor.id, action: 'agreement.created', entityType: 'Agreement', entityId: result.id, metadata: { customerId, ...checked }, ipAddress: actor.ipAddress } });
    return { ...result, fee: result.fee.toString() };
  });
}
export async function updateAgreement(actor: Actor, customerId: string, id: string, raw: unknown) {
  staff(actor, true);
  const input = agreementInput.parse(raw);
  return db.$transaction(async tx => {
    await agreementOwner(tx, customerId);
    const locked = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM Agreement WHERE id = ${id} AND customerId = ${customerId} AND deletedAt IS NULL FOR UPDATE`;
    if (!locked.length) throw invalid('Anlaşma bulunamadı veya silinmiş.');
    const before = await tx.agreement.findUniqueOrThrow({ where: { id } });
    if (await tx.paymentReversal.count({ where: { order: { grantedAgreementId: id }, status: { in: ['PENDING', 'REVIEW'] } } })) throw new AppError(409, 'REFUND_IN_PROGRESS', 'İade sonucu beklenirken anlaşma düzenlenemez.');
    const purchase = await tx.creditOrder.findUnique({ where: { grantedAgreementId: id }, select: { id: true, credits: true } });
    if (purchase) {
      const refunded = await tx.paymentReversal.aggregate({ where: { orderId: purchase.id, status: 'SUCCEEDED' }, _sum: { credits: true } });
      if ((refunded._sum.credits ?? 0) > 0 && input.credits > purchase.credits - (refunded._sum.credits ?? 0)) throw new AppError(409, 'REFUNDED_CREDITS', 'İade edilmiş krediler anlaşmaya yeniden eklenemez.');
    }
    if (input.credits < before.usedCredits) throw invalid('Kredi miktarı kullanılan krediden az olamaz.');
    if (input.type !== before.type && !builtInAgreementTypes[input.type]) {
      const types = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM AgreementType WHERE id = ${input.type} AND archivedAt IS NULL FOR UPDATE`;
      if (!types.length) throw invalid('Bu anlaşma türü artık kullanılamıyor.');
    }
    if ((input.startsOn !== before.startsOn.toISOString().slice(0,10) || input.endsOn !== before.endsOn.toISOString().slice(0,10)) && await tx.creditPaymentAttempt.count({ where: { order: { customerId }, status: 'PENDING' } })) throw new AppError(409, 'PAYMENT_IN_PROGRESS', 'Ödeme sonucu beklenirken dönem tarihleri değiştirilemez.');
    const renewalRequested = false;
    const result = await tx.agreement.update({ where: { id }, data: { renewalRequested, fee: typeof raw === "object" && raw !== null && "fee" in raw ? input.fee : before.fee, currency: input.currency ?? before.currency, name: input.name, type: input.type, startsOn: new Date(input.startsOn), endsOn: new Date(input.endsOn), credits: input.credits } });
    await syncAgreementRenewal(tx, result);
    await tx.activityLog.create({ data: { userId: actor.id, action: 'agreement.updated', entityType: 'Agreement', entityId: id, metadata: { customerId, before: { fee: before.fee.toString(), currency: before.currency, name: before.name, type: before.type, startsOn: before.startsOn.toISOString(), endsOn: before.endsOn.toISOString(), credits: before.credits, renewalRequested: before.renewalRequested }, after: { fee: result.fee.toString(), currency: result.currency, name: input.name, type: input.type, startsOn: input.startsOn, endsOn: input.endsOn, credits: input.credits, renewalRequested } }, ipAddress: actor.ipAddress } });
    return { ...result, fee: result.fee.toString() };
  });
}
export async function cancelAgreement(actor: Actor, customerId: string, id: string) {
  staff(actor, true);
  return db.$transaction(async tx => {
    await agreementOwner(tx, customerId);
    const changed = await tx.agreement.updateMany({ where: { id, customerId, cancelledAt: null, deletedAt: null }, data: { cancelledAt: new Date() } });
    if (!changed.count) throw invalid('Anlaşma bulunamadı veya zaten iptal edilmiş.');
    await syncAgreementRenewal(tx, await tx.agreement.findUniqueOrThrow({ where: { id } }));
    await tx.activityLog.create({ data: { userId: actor.id, action: 'agreement.cancelled', entityType: 'Agreement', entityId: id, metadata: { customerId }, ipAddress: actor.ipAddress } });
  });
}
export async function reactivateAgreement(actor: Actor, customerId: string, id: string) {
  staff(actor, true);
  return db.$transaction(async tx => {
    await agreementOwner(tx, customerId);
    const changed = await tx.agreement.updateMany({ where: { id, customerId, deletedAt: null, cancelledAt: { not: null } }, data: { cancelledAt: null } });
    if (!changed.count) throw invalid('İptal edilmiş anlaşma bulunamadı.');
    await tx.activityLog.create({ data: { userId: actor.id, action: 'agreement.reactivated', entityType: 'Agreement', entityId: id, metadata: { customerId }, ipAddress: actor.ipAddress } });
  });
}
export async function deleteAgreement(actor: Actor, customerId: string, id: string) {
  if (actor.role === 'CUSTOMER' || !can(actor, 'customers.delete')) throw new AppError(403, 'FORBIDDEN', 'Anlaşma silmek için müşteri silme yetkisi gerekir.');
  return db.$transaction(async tx => {
    await agreementOwner(tx, customerId);
    const changed = await tx.agreement.updateMany({ where: { id, customerId, deletedAt: null }, data: { deletedAt: new Date() } });
    if (!changed.count) throw invalid('Anlaşma bulunamadı veya zaten silinmiş.');
    await syncAgreementRenewal(tx, await tx.agreement.findUniqueOrThrow({ where: { id } }));
    await tx.activityLog.create({ data: { userId: actor.id, action: 'agreement.deleted', entityType: 'Agreement', entityId: id, metadata: { customerId }, ipAddress: actor.ipAddress } });
  });
}
export async function setCustomerParent(actor: Actor, customerId: string, parentId: string | null) {
  staff(actor, true);
  if (customerId === parentId) throw invalid('Müşteri kendisine bağlanamaz.');
  return db.$transaction(async tx => {
    // Lock both records in a fixed order to prevent competing links creating a cycle.
    for (const id of [customerId, ...(parentId ? [parentId] : [])].sort()) await tx.user.updateMany({ where: { id }, data: { updatedAt: new Date() } });
    await customer(tx, customerId);
    if (parentId) {
      const parent = await customer(tx, parentId);
      if (!parent.isActive || parent.parentCustomerId || await tx.user.count({ where: { parentCustomerId: customerId, deletedAt: null } })) throw invalid('İlişki tek seviyeli olmalı. Alt müşterisi olan kayıt başka bir müşteriye bağlanamaz.');
    }
    await tx.user.update({ where: { id: customerId }, data: { parentCustomerId: parentId } });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'customer.parent_updated', entityType: 'User', entityId: customerId, metadata: { parentCustomerId: parentId }, ipAddress: actor.ipAddress } });
  });
}
export async function createRelatedCustomer(actor: Actor, customerId: string, raw: z.infer<typeof relatedCustomerInput>) {
  staff(actor, true);
  if (!can(actor, 'customers.create')) throw new AppError(403, 'FORBIDDEN', 'Yeni müşteri oluşturma yetkiniz yok.');
  const input = relatedCustomerInput.parse(raw);
  const result = await db.$transaction(async tx => {
    await tx.user.updateMany({ where: { id: customerId }, data: { updatedAt: new Date() } });
    const current = await customer(tx, customerId);
    if (!current.isActive) throw invalid('Pasif müşteri için yeni bağlantı oluşturulamaz.');
    if (input.direction === 'CHILD' && current.parentCustomerId) throw invalid('Bu kayıt bir ana müşteriye bağlı. Önce mevcut bağını kaldırın.');
    if (input.direction === 'PARENT' && await tx.user.count({ where: { parentCustomerId: customerId, deletedAt: null } })) throw invalid('Alt müşterisi olan bir kayıt başka bir müşteriye bağlanamaz.');
    const created = await createCustomer(actor, input.customer, [], tx);
    const childId = input.direction === 'CHILD' ? created.id : current.id;
    const parentId = input.direction === 'CHILD' ? current.id : created.id;
    await tx.user.update({ where: { id: childId }, data: { parentCustomerId: parentId } });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'customer.parent_updated', entityType: 'User', entityId: childId, metadata: { parentCustomerId: parentId, createdCustomerId: created.id }, ipAddress: actor.ipAddress } });
    return created;
  }, { isolationLevel: 'Serializable', timeout: 15000 });
  publishChange();
  return result;
}
export async function debitResolution(tx: Prisma.TransactionClient, actor: Actor, conversation: { id: string; customerId: string }, input?: z.infer<typeof creditResolutionInput>) {
  // Claim the conversation before looking for an existing debit (also called from updateConversation's lock).
  await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  const existing = await tx.creditCharge.findUnique({ where: { conversationId: conversation.id } });
  if (existing) {
    if (input && (existing.credits !== input.credits || (existing.agreementId ?? null) !== (input.agreementId ?? null))) throw invalid('Bu talebin kredi işlemi daha önce kaydedildi. Tekrar kredi düşülemez.');
    return existing;
  }
  const people = await tx.$queryRaw<{ id: string; parentCustomerId: string | null; isActive: boolean }[]>`SELECT id, parentCustomerId, isActive FROM User WHERE id = ${conversation.customerId} AND role = 'CUSTOMER' AND deletedAt IS NULL FOR UPDATE`;
  const person = people[0];
  if (!person) throw new AppError(404, 'CUSTOMER_NOT_FOUND', 'Müşteri bulunamadı.');
  const ownerIds: string[] = [];
  if (person.isActive && person.parentCustomerId) {
    const companies = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM User WHERE id = ${person.parentCustomerId} AND role = 'CUSTOMER' AND isActive = true AND deletedAt IS NULL FOR UPDATE`;
    if (companies.length) ownerIds.push(companies[0].id);
  } else if (person.isActive) ownerIds.push(person.id);
  if (!input) {
    if (await tx.agreement.count({ where: { customerId: { in: ownerIds }, deletedAt: null } })) throw new AppError(400, 'CREDIT_REQUIRED', 'Talebi çözerken kullanılacak kredi miktarını belirtin. Ücretsiz destek için 0 girin.');
    return null; // Preserve resolution behavior for existing customers without agreements.
  }
  if (input.credits > 0) {
    if (!input.agreementId) throw invalid('Kredi kullanılacak anlaşmayı seçin.');
    const now = today();
    const result = await tx.agreement.updateMany({ where: { id: input.agreementId, customerId: { in: ownerIds }, deletedAt: null, cancelledAt: null, startsOn: { lte: now }, endsOn: { gte: now }, credits: { gte: input.credits }, usedCredits: { lte: 1_000_000 } }, data: { usedCredits: { increment: input.credits } } });
    if (!result.count) throw invalid('Anlaşma geçersiz, süresi dolmuş veya bu müşteriye ait değil.');
    const agreement = await tx.agreement.findUniqueOrThrow({ where: { id: input.agreementId } });
    if (agreement.usedCredits > agreement.credits) throw invalid('Yeterli kredi bulunmuyor.'); // Entire transaction rolls back, including the increment.
  }
  const charge = await tx.creditCharge.create({ data: { conversationId: conversation.id, agreementId: input.credits > 0 ? input.agreementId : null, credits: input.credits, actorId: actor.id } });
  await tx.activityLog.create({ data: { userId: actor.id, action: 'conversation.credit_used', entityType: 'Conversation', entityId: conversation.id, metadata: { credits: input.credits, agreementId: charge.agreementId }, ipAddress: actor.ipAddress } });
  return charge;
}

/** CreditCharge holds the current resolution debit; completed cycles remain in the activity ledger. */
export async function returnResolutionCredit(tx: Prisma.TransactionClient, actor: Actor, conversation: { id: string; customerId: string }) {
  await tx.conversation.update({ where: { id: conversation.id }, data: { updatedAt: new Date() } });
  const charge = await tx.creditCharge.findUnique({ where: { conversationId: conversation.id }, include: { agreement: true } });
  if (!charge) return;
  if (charge.credits > 0) {
    if (!charge.agreement) throw invalid('Kredi kesintisinin anlaşması bulunamadı.');
    // Return to the original grant even if the customer was reparented or the grant expired.
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${charge.agreement.customerId} FOR UPDATE`;
    const restored = await tx.agreement.updateMany({ where: { id: charge.agreement.id, usedCredits: { gte: charge.credits } }, data: { usedCredits: { decrement: charge.credits } } });
    if (restored.count !== 1) throw invalid('Kredi kesintisi doğrulanamadı; talep yeniden açılmadı.');
  }
  await tx.activityLog.create({ data: { userId: actor.id, action: 'conversation.credit_returned', entityType: 'Conversation', entityId: conversation.id, metadata: { credits: charge.credits, agreementId: charge.agreementId, chargeId: charge.id, chargedAt: charge.createdAt.toISOString(), chargedById: charge.actorId }, ipAddress: actor.ipAddress } });
  await tx.creditCharge.delete({ where: { id: charge.id } });
}
