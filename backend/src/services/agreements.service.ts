import { publishChange } from './events.service.js';
import { z } from 'zod';
import { db } from '../config/db.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { Actor } from '../types/express.js';
import { can } from './permissions.js';
import { AppError } from '../utils/errors.js';
import { createCustomerSchema } from '../validators/management.js';
import { createCustomer } from './management.service.js';

const day = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).refine(v => Number.isFinite(Date.parse(v)) && new Date(v).toISOString().slice(0, 10) === v, 'Geçerli bir tarih girin.');
export const agreementInput = z.object({
  name: z.string().trim().min(1).max(150), type: z.enum(['MONTHLY', 'YEARLY', 'ONE_OFF', 'MAINTENANCE']),
  startsOn: day, endsOn: day,
  fee: z.union([z.string(), z.number()]).transform(String).pipe(z.string().regex(/^\d{1,10}(\.\d{1,2})?$/, 'Ücret en fazla iki ondalık basamak içermelidir.')).default('0'),
  credits: z.number().int().min(0).max(1_000_000),
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
export async function listCustomerRelations(actor: Actor, customerId: string) {
  const person = await customer(db, customerId);
  if (actor.role === 'CUSTOMER') {
    if (actor.id !== person.id && person.parentCustomerId !== actor.id) throw new AppError(403, 'FORBIDDEN', 'Bu müşteriye erişim izniniz yok.');
  } else staff(actor);
  const parent = person.parentCustomerId ? await db.user.findFirst({ where: { id: person.parentCustomerId, isActive: true, deletedAt: null }, select: { id: true, name: true, shareCreditsWithChildren: true } }) : null;
  const children = await db.user.findMany({ where: { parentCustomerId: person.id, deletedAt: null, role: 'CUSTOMER' }, select: { id: true, name: true, isActive: true }, orderBy: { name: 'asc' } });
  return { customer: person, parent, children };
}
export async function listAgreements(actor: Actor, customerId: string) {
  const { customer: person, parent, children } = await listCustomerRelations(actor, customerId);
  const ownerIds = [person.id, ...(parent ? [parent.id] : []), ...children.filter(c => c.isActive).map(c => c.id)];
  const agreements = await db.agreement.findMany({ where: { customerId: { in: ownerIds } }, include: { customer: { select: { id: true, name: true } } }, orderBy: [{ endsOn: 'asc' }, { createdAt: 'desc' }] });
  const now = today();
  const active = (a: typeof agreements[number]) => !a.cancelledAt && a.startsOn <= now && a.endsOn >= now;
  const rows = agreements.map(a => ({ ...a, fee: a.fee.toString(), remainingCredits: a.credits - a.usedCredits,
    usable: Boolean(person.isActive && active(a) && (a.customerId === person.id || (a.customerId === parent?.id && parent.shareCreditsWithChildren))),
    creditSource: a.customerId === person.id ? 'PERSONAL' : a.customerId === parent?.id ? 'COMPANY' : 'CHILD',
    state: a.cancelledAt ? 'CANCELLED' : a.startsOn > now ? 'UPCOMING' : a.endsOn < now ? 'EXPIRED' : 'ACTIVE' }));
  const rank = (id: string) => id === person.id ? 0 : id === parent?.id ? 1 : 2;
  rows.sort((a, b) => rank(a.customerId) - rank(b.customerId) || a.endsOn.getTime() - b.endsOn.getTime() || a.id.localeCompare(b.id));
  const balanceFor = (id: string) => agreements.filter(a => a.customerId === id && active(a)).reduce((sum, a) => sum + a.credits - a.usedCredits, 0);
  const personalCredits = person.isActive ? balanceFor(person.id) : 0;
  const parentCredits = parent ? balanceFor(parent.id) : 0;
  const sharedCredits = person.isActive && parent?.shareCreditsWithChildren ? parentCredits : 0;
  const childSummaries = children.map(c => ({ ...c, personalCredits: c.isActive ? balanceFor(c.id) : 0 }));
  const charges = await db.creditCharge.findMany({ where: { conversation: { customerId: { in: [person.id, ...children.map(c => c.id)] } } }, select: { id: true, credits: true, createdAt: true, agreement: { select: { id: true, name: true } }, conversation: { select: { id: true, number: true, subject: true, customer: { select: { name: true } } } } }, orderBy: { createdAt: 'desc' }, take: 100 });
  return { customer: person, parent, children: childSummaries, agreements: rows, charges, personalCredits, parentCredits, sharedCredits, availableCredits: personalCredits + sharedCredits };
}
export async function setCompanyCreditSharing(actor: Actor, customerId: string, enabled: boolean) {
  if (actor.role === 'CUSTOMER') {
    if (actor.id !== customerId) throw new AppError(403, 'FORBIDDEN', 'Yalnızca kendi şirketinizin ortak kredi ayarını değiştirebilirsiniz.');
  } else staff(actor, true);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${customerId} FOR UPDATE`;
    const company = await customer(tx, customerId);
    if (company.parentCustomerId || !company.isActive) throw invalid('Ortak kredi ayarı yalnızca aktif ana müşteride değiştirilebilir.');
    await tx.user.update({ where: { id: customerId }, data: { shareCreditsWithChildren: enabled } });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'customer.credit_sharing_updated', entityType: 'User', entityId: customerId, metadata: { enabled }, ipAddress: actor.ipAddress } });
  });
  publishChange();
}
export async function createAgreement(actor: Actor, customerId: string, input: z.infer<typeof agreementInput>) {
  staff(actor, true);
  await customer(db, customerId);
  const checked = agreementInput.parse(input);
  return db.$transaction(async tx => {
    const result = await tx.agreement.create({ data: { ...checked, customerId, startsOn: new Date(checked.startsOn), endsOn: new Date(checked.endsOn) } });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'agreement.created', entityType: 'Agreement', entityId: result.id, metadata: { customerId, ...checked }, ipAddress: actor.ipAddress } });
    return { ...result, fee: result.fee.toString() };
  });
}
export async function cancelAgreement(actor: Actor, customerId: string, id: string) {
  staff(actor, true);
  return db.$transaction(async tx => {
    const changed = await tx.agreement.updateMany({ where: { id, customerId, cancelledAt: null }, data: { cancelledAt: new Date() } });
    if (!changed.count) throw invalid('Anlaşma bulunamadı veya zaten iptal edilmiş.');
    await tx.activityLog.create({ data: { userId: actor.id, action: 'agreement.cancelled', entityType: 'Agreement', entityId: id, metadata: { customerId }, ipAddress: actor.ipAddress } });
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
  const person = await customer(tx, conversation.customerId);
  const ownerIds = [person.id];
  if (person.parentCustomerId) {
    // Serialize company policy changes with shared-credit consumption.
    const companies = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM User WHERE id = ${person.parentCustomerId} AND role = 'CUSTOMER' AND isActive = true AND deletedAt IS NULL AND shareCreditsWithChildren = true FOR UPDATE`;
    if (companies.length) ownerIds.push(companies[0].id);
  }
  if (!input) {
    if (await tx.agreement.count({ where: { customerId: { in: ownerIds } } })) throw new AppError(400, 'CREDIT_REQUIRED', 'Talebi çözerken kullanılacak kredi miktarını belirtin. Ücretsiz destek için 0 girin.');
    return null; // Preserve resolution behavior for existing customers without agreements.
  }
  if (input.credits > 0) {
    if (!input.agreementId) throw invalid('Kredi kullanılacak anlaşmayı seçin.');
    const now = today();
    const result = await tx.agreement.updateMany({ where: { id: input.agreementId, customerId: { in: ownerIds }, cancelledAt: null, startsOn: { lte: now }, endsOn: { gte: now }, credits: { gte: input.credits }, usedCredits: { lte: 1_000_000 } }, data: { usedCredits: { increment: input.credits } } });
    if (!result.count) throw invalid('Anlaşma geçersiz, süresi dolmuş veya bu müşteriye ait değil.');
    const agreement = await tx.agreement.findUniqueOrThrow({ where: { id: input.agreementId } });
    if (agreement.usedCredits > agreement.credits) throw invalid('Yeterli kredi bulunmuyor.'); // Entire transaction rolls back, including the increment.
  }
  const charge = await tx.creditCharge.create({ data: { conversationId: conversation.id, agreementId: input.credits > 0 ? input.agreementId : null, credits: input.credits, actorId: actor.id } });
  await tx.activityLog.create({ data: { userId: actor.id, action: 'conversation.credit_used', entityType: 'Conversation', entityId: conversation.id, metadata: { credits: input.credits, agreementId: charge.agreementId }, ipAddress: actor.ipAddress } });
  return charge;
}
