import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import type { z } from "zod";
import { db } from "../config/db.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Actor } from "../types/express.js";
import { AppError } from "../utils/errors.js";
import { visibility } from "./conversations.service.js";
import { publishChange } from "./events.service.js";
import { uploadRoot, type StoredUpload } from './uploads.service.js';
import { queueSupportEmail } from "./mailer.service.js";
import type * as schema from "../validators/management.js";

type Page = { page: number; limit: number };
const pagination = (q: Page, total: number) => ({ ...q, total, totalPages: Math.ceil(total / q.limit) });
const paging = (q: Page) => ({ skip: (q.page - 1) * q.limit, take: q.limit });
const person = { id: true, name: true, email: true, phone: true, company: true, staffNote: true, extraPhones: true, extraEmails: true, role: true, isActive: true, createdAt: true, updatedAt: true, departments: { where: { department: { deletedAt: null } }, select: { departmentId: true, department: { select: { id: true, name: true, isActive: true } } } } } as const;
const requireStaff = (actor: Actor) => { if (actor.role === "CUSTOMER") throw new AppError(403, "FORBIDDEN", "Bu işlem için personel yetkisi gerekiyor."); };
const requireAdmin = (actor: Actor) => { if (actor.role !== "ADMIN") throw new AppError(403, "FORBIDDEN", "Bu işlem için yönetici yetkisi gerekiyor."); };
const notFound = () => new AppError(404, "NOT_FOUND", "Kayıt bulunamadı.");
async function audit(tx: Prisma.TransactionClient, actor: Actor, action: string, entityType: string, entityId: string, metadata?: Prisma.InputJsonValue) {
  await tx.activityLog.create({ data: { userId: actor.id, action, entityType, entityId, metadata, ipAddress: actor.ipAddress ?? null } });
}
// Serializable retry protects administrator and assignment invariants during concurrent changes.
async function serial<T>(fn: (tx: Prisma.TransactionClient) => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await db.$transaction(fn, { isolationLevel: "Serializable" }); }
    catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2034" || attempt >= 3) throw error;
    }
  }
}
export async function users(actor: Actor, q: z.infer<typeof schema.directoryQuery>, customersOnly = false) {
  if (customersOnly) requireStaff(actor); else requireAdmin(actor);
  let phoneDigits = q.search?.replace(/\D/g, "") ?? "";
  if (phoneDigits && phoneDigits[0] !== "0" && !phoneDigits.startsWith("90")) phoneDigits = `0${phoneDigits}`;
  const phoneWithoutZero = phoneDigits.startsWith("0") ? phoneDigits.slice(1) : phoneDigits;
  const formatPhone = (digits: string) => digits.length > 4 ? [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 9), digits.slice(9, 11)].filter(Boolean).join(" ") : digits;
  const formattedPhone = formatPhone(phoneDigits);
  const formattedPhoneWithoutZero = formatPhone(phoneWithoutZero);
  const roleSearch = q.search?.trim().toLocaleLowerCase("tr-TR");
  const roleMatches = roleSearch ? [
    ...(roleSearch.includes("yönetici") || roleSearch.includes("yonetici") || roleSearch === "admin" ? ["ADMIN" as const] : []),
    ...(roleSearch.includes("departman") || roleSearch.includes("sorumlu") || roleSearch === "supervisor" ? ["SUPERVISOR" as const] : []),
    ...(roleSearch.includes("destek") || roleSearch.includes("uzman") || roleSearch === "agent" ? ["AGENT" as const] : []),
  ] : [];
  const where: Prisma.UserWhereInput = {
    id: q.id, role: customersOnly ? "CUSTOMER" : (q.role ?? { in: ["ADMIN", "SUPERVISOR", "AGENT"] }), isActive: customersOnly ? undefined : q.isActive, deletedAt: null,
    ...(q.search ? { OR: [{ name: { contains: q.search } }, { email: { contains: q.search } }, { phone: { contains: q.search } }, { company: { contains: q.search } }, ...(roleMatches.length ? [{ role: { in: roleMatches } }] : []), ...(phoneDigits ? [{ phone: { contains: phoneDigits } }, { phone: { contains: formattedPhone } }, { phone: { contains: phoneWithoutZero } }, { phone: { contains: formattedPhoneWithoutZero } }] : [])] } : {}),
    ...(customersOnly && actor.role !== "ADMIN" ? { customerConversations: { some: visibility(actor) } } : {}),
  };
  const result = customersOnly
    ? (await db.user.findMany({ where, select: { ...person, customerFiles: { select: { id: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...paging(q) })).map(({ customerFiles, ...customer }) => ({ ...customer, customerFileCount: customerFiles.length }))
    : await db.user.findMany({ where, select: person, orderBy: [{ name: "asc" }, { id: "asc" }], ...paging(q) });
  const total = await db.user.count({ where });
  return { data: result, pagination: pagination({ page: q.page, limit: q.limit }, total) };
}
async function validateDepartments(tx: Prisma.TransactionClient, ids: string[], role: string) {
  if (role === "CUSTOMER" && ids.length) throw new AppError(400, "INVALID_MEMBERSHIP", "Müşteriler personel departmanlarına atanamaz.");
  if ((role === "AGENT" || role === "SUPERVISOR") && !ids.length) throw new AppError(400, "DEPARTMENT_REQUIRED", "Personel için en az bir departman seçin.");
  if (await tx.department.count({ where: { id: { in: ids }, isActive: true } }) !== ids.length) throw new AppError(400, "INVALID_DEPARTMENT", "Aktif departmanlar seçin.");
}
export async function createUser(actor: Actor, input: z.infer<typeof schema.createUserSchema>) {
  requireAdmin(actor);
  const { password, departmentIds, ...rest } = input;
  const passwordHash = await bcrypt.hash(password, 12);
  return serial(async tx => {
    await validateDepartments(tx, departmentIds, rest.role);
    const data = await tx.user.create({ data: { ...rest, loginEmail: rest.email, passwordHash, departments: { create: departmentIds.map(departmentId => ({ departmentId })) } }, select: person });
    await audit(tx, actor, "user.created", "User", data.id, { role: data.role });
    return data;
  });
}
export async function createCustomer(actor: Actor, input: z.infer<typeof schema.createCustomerSchema>, files: StoredUpload[] = []) {
  requireStaff(actor);
  const data = await serial(async tx => {
    const data = await tx.user.create({
      data: { ...input, role: "CUSTOMER", loginEmail: null, passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12) },
      select: person,
    });
    if (files.length) await tx.customerAttachment.createMany({ data: files.map(file => ({ ...file, customerId: data.id })) });
    await audit(tx, actor, "customer.created", "User", data.id, { name: data.name, phone: data.phone, email: data.email, company: data.company });
    const recipients = await tx.user.findMany({ where: { isActive: true, role: { in: ["ADMIN", "SUPERVISOR"] } }, select: { id: true } });
    if (recipients.length) {
      const contact = data.email ?? data.phone ?? "iletişim bilgisi yok";
      await tx.notification.createMany({ data: recipients.map(recipient => ({ userId: recipient.id, type: "CUSTOMER_CREATED", title: "Yeni kişi eklendi", message: `${data.name} eklendi · ${contact}` })) });
    }
    return data;
  });
  publishChange();
  if (data.email) queueSupportEmail(data.email, "Destek merkezine hoş geldiniz", `Merhaba ${data.name},\n\nDestek merkezi kaydınız oluşturuldu. İhtiyacınız olduğunda bu e-posta adresi üzerinden bizimle iletişime geçebilirsiniz.`, "Müşteri karşılama");
  return data;
}
export async function customer(actor: Actor, id: string) {
  requireStaff(actor);
  const data = await db.user.findFirst({
    where: {
      id,
      role: "CUSTOMER",
      deletedAt: null,
      ...(actor.role === "ADMIN" ? {} : { customerConversations: { some: visibility(actor) } }),
    },
    select: person,
  });
  if (!data) throw notFound();
  return data;
}
export async function updateCustomer(actor: Actor, id: string, input: z.infer<typeof schema.updateCustomerSchema>, files: StoredUpload[] = []) {
  requireStaff(actor);
  return serial(async tx => {
    const current = await tx.user.findFirst({ where: { id, role: "CUSTOMER", deletedAt: null }, select: { id: true, name: true, phone: true, email: true, company: true, staffNote: true, extraPhones: true, extraEmails: true } });
    if (!current) throw notFound();
    const data = await tx.user.update({ where: { id }, data: input, select: person });
    if (files.length) await tx.customerAttachment.createMany({ data: files.map(file => ({ ...file, customerId: id })) });
    const changes = Object.fromEntries(Object.keys(input).filter(field => current[field as keyof typeof current] !== input[field as keyof typeof input]).map(field => [field, { from: current[field as keyof typeof current] ?? null, to: input[field as keyof typeof input] ?? null }]));
    if (Object.keys(changes).length) await audit(tx, actor, "customer.updated", "User", id, { name: data.name, phone: data.phone, email: data.email, company: data.company, changes });
    return data;
  });
}
export async function customerFiles(actor: Actor, customerId: string) {
  await customer(actor, customerId);
  return db.customerAttachment.findMany({ where: { customerId }, select: { id: true, originalName: true, mimeType: true, size: true, createdAt: true }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
}
export async function customerFile(actor: Actor, customerId: string, fileId: string) {
  await customer(actor, customerId);
  const file = await db.customerAttachment.findFirst({ where: { id: fileId, customerId } });
  if (!file) throw notFound();
  return file;
}
export async function deleteCustomerFile(actor: Actor, customerId: string, fileId: string) {
  await customer(actor, customerId);
  const customerRecord = await db.user.findUnique({ where: { id: customerId }, select: { name: true } });
  const file = await db.customerAttachment.findFirst({ where: { id: fileId, customerId } });
  if (!file) throw notFound();
  await db.customerAttachment.delete({ where: { id: file.id } });
  await unlink(path.join(uploadRoot, file.storageKey)).catch(() => undefined);
  await db.activityLog.create({ data: { userId: actor.id, action: 'customer.file_deleted', entityType: 'User', entityId: customerId, metadata: { fileId: file.id, originalName: file.originalName, customerName: customerRecord?.name ?? null }, ipAddress: actor.ipAddress ?? null } });
  return { id: file.id };
}
export async function deleteCustomer(actor: Actor, id: string) {
  requireStaff(actor);
  return serial(async tx => {
    const current = await tx.user.findFirst({ where: { id, role: "CUSTOMER" }, select: { id: true } });
    if (!current) throw notFound();
    const deletedAt = new Date();
    // Customer deletion follows the application's soft-delete model. Hide every
    // associated conversation at the same time so its messages cannot remain in
    // the inbox, search, notification list, or the conversation detail screen.
    const conversations = await tx.conversation.updateMany({
      where: { customerId: id, deletedAt: null },
      data: { deletedAt },
    });
    const data = await tx.user.update({ where: { id }, data: { isActive: false, deletedAt }, select: person });
    await audit(tx, actor, "customer.deleted", "User", id, { deletedConversationCount: conversations.count });
    return data;
  });
}
export async function updateUser(actor: Actor, id: string, input: z.infer<typeof schema.updateUserSchema>) {
  requireAdmin(actor);
  if (id === actor.id && (input.isActive === false || (input.role && input.role !== "ADMIN"))) throw new AppError(409, "SELF_PROTECTION", "Kendi yönetici yetkinizi kaldıramaz veya hesabınızı kapatamazsınız.");
  const { password, departmentIds, ...rest } = input;
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  return serial(async tx => {
    const current = await tx.user.findFirst({ where: { id, deletedAt: null }, include: { departments: true } });
    if (!current) throw notFound();
    const role = input.role ?? current.role;
    const active = input.isActive ?? current.isActive;
    const ids = departmentIds ?? current.departments.map(d => d.departmentId);
    if (departmentIds !== undefined || input.role !== undefined || input.isActive === true) await validateDepartments(tx, ids, role);
    if (current.role === "ADMIN" && current.isActive && (role !== "ADMIN" || !active) && await tx.user.count({ where: { role: "ADMIN", isActive: true } }) <= 1) throw new AppError(409, "LAST_ADMIN", "Son aktif yönetici kaldırılamaz.");
    if (await tx.conversation.count({ where: { assignedAgentId: id, deletedAt: null, ...(!active || !['AGENT', 'SUPERVISOR'].includes(role) ? {} : { departmentId: { notIn: ids } }) } })) throw new AppError(409, "ASSIGNMENTS_EXIST", "Önce mevcut talep atamalarını uygun bir personele aktarın.");
    // A customer with conversation history must retain their customer role.
    if (current.role === "CUSTOMER" && role !== "CUSTOMER" && await tx.conversation.count({ where: { customerId: id } })) throw new AppError(409, "CUSTOMER_HISTORY", "Talep geçmişi olan müşteri hesabının rolü değiştirilemez.");
    const data = await tx.user.update({ where: { id }, data: { ...rest, ...(input.email !== undefined ? { loginEmail: input.email } : {}), passwordHash, ...(departmentIds ? { departments: { deleteMany: {}, create: ids.map(departmentId => ({ departmentId })) } } : {}) }, select: person });
    if (password || input.email !== undefined || input.role !== undefined || input.isActive === false || departmentIds !== undefined) await tx.session.updateMany({ where: { userId: id, revokedAt: null, ...(id === actor.id && active ? { id: { not: actor.sessionId } } : {}) }, data: { revokedAt: new Date() } });
    await audit(tx, actor, "user.updated", "User", id, { fields: Object.keys(input).filter(k => k !== "password") });
    return data;
  });
}
export async function updateDepartment(actor: Actor, id: string, input: z.infer<typeof schema.departmentSchema>) {
  requireAdmin(actor);
  return serial(async tx => {
    if (!(await tx.department.findFirst({ where: { id, deletedAt: null } }))) throw notFound();
    // Archiving hides the department from new requests; existing tickets and memberships remain usable.
    const data = await tx.department.update({ where: { id }, data: input });
    await audit(tx, actor, input.isActive === false ? "department.archived" : "department.updated", "Department", id, input);
    return data;
  });
}
export async function deleteDepartment(actor: Actor, id: string) {
  requireAdmin(actor);
  return serial(async tx => {
    const current = await tx.department.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound();
    const data = await tx.department.update({ where: { id }, data: { isActive: false, deletedAt: new Date() } });
    await audit(tx, actor, 'department.deleted', 'Department', id, { name: current.name });
    return data;
  });
}
export async function deleteUser(actor: Actor, id: string) {
  requireAdmin(actor);
  if (id === actor.id) throw new AppError(409, 'SELF_PROTECTION', 'Kendi hesabınızı silemezsiniz.');
  return serial(async tx => {
    const current = await tx.user.findFirst({ where: { id, deletedAt: null } });
    if (!current) throw notFound();
    if (current.role === 'ADMIN' && current.isActive && await tx.user.count({ where: { role: 'ADMIN', isActive: true, deletedAt: null } }) <= 1) throw new AppError(409, 'LAST_ADMIN', 'Son aktif yönetici silinemez.');
    const assigned = await tx.conversation.findMany({ where: { assignedAgentId: id, deletedAt: null, status: { notIn: ['RESOLVED', 'CLOSED'] } }, select: { id: true } });
    for (const conversation of assigned) {
      await tx.conversation.update({ where: { id: conversation.id }, data: { assignedAgentId: null } });
      await tx.conversationMessage.create({ data: { conversationId: conversation.id, authorId: actor.id, type: 'SYSTEM', body: `${current.name} silindi; talep departman kuyruğuna alındı.` } });
      await audit(tx, actor, 'conversation.updated', 'Conversation', conversation.id, { assignedAgentId: null });
    }
    await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, loginEmail: null } });
    await audit(tx, actor, 'user.deleted', 'User', id, { name: current.name });
    return { id };
  });
}
export async function tags(q: z.infer<typeof schema.searchQuery>) {
  const where: Prisma.TagWhereInput = q.search ? { name: { contains: q.search } } : {};
  const [data, total] = await db.$transaction([db.tag.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], ...paging(q) }), db.tag.count({ where })]);
  return { data, pagination: pagination({ page: q.page, limit: q.limit }, total) };
}
export async function departmentAgents(actor: Actor, departmentId: string, q: z.infer<typeof schema.searchQuery>) {
  requireStaff(actor);
  if (actor.role !== "ADMIN" && !actor.departmentIds.includes(departmentId)) throw new AppError(403, "FORBIDDEN", "Bu departmanın personelini görüntüleme yetkiniz yok.");
  const where: Prisma.UserWhereInput = { role: { in: ["AGENT", "SUPERVISOR"] }, isActive: true, deletedAt: null, departments: { some: { departmentId } }, ...(q.search ? { name: { contains: q.search } } : {}) };
  const [data, total] = await db.$transaction([db.user.findMany({ where, select: { id: true, name: true }, orderBy: [{ name: "asc" }, { id: "asc" }], ...paging(q) }), db.user.count({ where })]);
  return { data, pagination: pagination({ page: q.page, limit: q.limit }, total) };
}
export async function writeTag(actor: Actor, input: z.infer<typeof schema.updateTagSchema>, id?: string) {
  requireAdmin(actor);
  return db.$transaction(async tx => {
    if (id && !(await tx.tag.findUnique({ where: { id } }))) throw notFound();
    const data = id ? await tx.tag.update({ where: { id }, data: input }) : await tx.tag.create({ data: { name: input.name!, code: input.code!, color: input.color } });
    await audit(tx, actor, id ? "tag.updated" : "tag.created", "Tag", data.id, { name: data.name, code: data.code });
    return data;
  });
}
export async function deleteTag(actor: Actor, id: string) {
  requireAdmin(actor);
  return db.$transaction(async tx => {
    const tag = await tx.tag.findUnique({ where: { id } });
    if (!tag) throw notFound();
    await tx.tag.delete({ where: { id } });
    await audit(tx, actor, "tag.deleted", "Tag", id, { name: tag.name, code: tag.code });
  });
}
export async function statusOptions(q: z.infer<typeof schema.searchQuery>) {
  const where = q.search ? { OR: [{ name: { contains: q.search } }, { code: { contains: q.search } }] } : {};
  const [data, total] = await db.$transaction([db.statusOption.findMany({ where, orderBy: { name: "asc" }, ...paging(q) }), db.statusOption.count({ where })]);
  return { data, pagination: pagination({ page: q.page, limit: q.limit }, total) };
}
export async function priorityOptions(q: z.infer<typeof schema.searchQuery>) {
  const where = q.search ? { OR: [{ name: { contains: q.search } }, { code: { contains: q.search } }] } : {};
  const [data, total] = await db.$transaction([db.priorityOption.findMany({ where, orderBy: { name: "asc" }, ...paging(q) }), db.priorityOption.count({ where })]);
  return { data, pagination: pagination({ page: q.page, limit: q.limit }, total) };
}
export async function writeStatusOption(actor: Actor, input: z.infer<typeof schema.updateStatusOptionSchema>, id?: string) {
  requireAdmin(actor);
  return db.$transaction(async (tx) => {
    if (id && !(await tx.statusOption.findUnique({ where: { id } }))) throw notFound();
    const data = id ? await tx.statusOption.update({ where: { id }, data: input }) : await tx.statusOption.create({ data: { code: input.code!, name: input.name!, color: input.color, isActive: input.isActive ?? true } });
    await audit(tx, actor, id ? "status.updated" : "status.created", "StatusOption", data.id, { name: data.name, code: data.code });
    return data;
  });
}
export async function writePriorityOption(actor: Actor, input: z.infer<typeof schema.updatePriorityOptionSchema>, id?: string) {
  requireAdmin(actor);
  return db.$transaction(async (tx) => {
    if (id && !(await tx.priorityOption.findUnique({ where: { id } }))) throw notFound();
    const data = id ? await tx.priorityOption.update({ where: { id }, data: input }) : await tx.priorityOption.create({ data: { code: input.code!, name: input.name!, color: input.color, isActive: input.isActive ?? true } });
    await audit(tx, actor, id ? "priority.updated" : "priority.created", "PriorityOption", data.id, { name: data.name, code: data.code });
    return data;
  });
}
export async function deleteStatusOption(actor: Actor, id: string) {
  requireAdmin(actor);
  return db.$transaction(async (tx) => {
    const option = await tx.statusOption.findUnique({ where: { id } });
    if (!option) throw notFound();
    if (await tx.conversation.count({ where: { status: option.code } })) throw new AppError(409, "OPTION_IN_USE", "Bu durum görüşmelerde kullanılıyor; önce görüşmeleri başka bir duruma taşıyın.");
    await tx.statusOption.delete({ where: { id } });
    await audit(tx, actor, "status.deleted", "StatusOption", id, { name: option.name, code: option.code });
  });
}
export async function deletePriorityOption(actor: Actor, id: string) {
  requireAdmin(actor);
  return db.$transaction(async (tx) => {
    const option = await tx.priorityOption.findUnique({ where: { id } });
    if (!option) throw notFound();
    if (await tx.conversation.count({ where: { priority: option.code } })) throw new AppError(409, "OPTION_IN_USE", "Bu öncelik görüşmelerde kullanılıyor; önce görüşmeleri başka bir önceliğe taşıyın.");
    await tx.priorityOption.delete({ where: { id } });
    await audit(tx, actor, "priority.deleted", "PriorityOption", id, { name: option.name, code: option.code });
  });
}
export async function websites(q: z.infer<typeof schema.searchQuery>) {
  const where: Prisma.WebsiteWhereInput = q.search ? { OR: [{ name: { contains: q.search } }, { url: { contains: q.search } }] } : {};
  const [data, total] = await db.$transaction([db.website.findMany({ where, orderBy: [{ name: "asc" }, { id: "asc" }], ...paging(q) }), db.website.count({ where })]);
  return { data, pagination: pagination({ page: q.page, limit: q.limit }, total) };
}
export async function writeWebsite(actor: Actor, input: z.infer<typeof schema.updateWebsiteSchema>, id?: string) {
  requireAdmin(actor);
  return db.$transaction(async tx => {
    if (id && !(await tx.website.findUnique({ where: { id } }))) throw notFound();
    const data = id ? await tx.website.update({ where: { id }, data: input }) : await tx.website.create({ data: { name: input.name!, url: input.url!, isActive: input.isActive ?? true } });
    await audit(tx, actor, id ? "website.updated" : "website.created", "Website", data.id, { name: data.name });
    return data;
  });
}
export async function deleteWebsite(actor: Actor, id: string) {
  requireAdmin(actor);
  return db.$transaction(async tx => { if (!(await tx.website.findUnique({ where: { id } }))) throw notFound(); await tx.website.delete({ where: { id } }); await audit(tx, actor, "website.deleted", "Website", id); });
}
export async function savedReplies(actor: Actor, q: z.infer<typeof schema.searchQuery>) {
  requireStaff(actor);
  const where: Prisma.SavedReplyWhereInput = q.search ? { OR: [{ title: { contains: q.search } }, { body: { contains: q.search } }] } : {};
  const [data, total] = await db.$transaction([db.savedReply.findMany({ where, include: { author: { select: { id: true, name: true } } }, orderBy: [{ title: "asc" }, { id: "asc" }], ...paging(q) }), db.savedReply.count({ where })]);
  return { data, pagination: pagination({ page: q.page, limit: q.limit }, total) };
}
export async function writeSavedReply(actor: Actor, input: z.infer<typeof schema.updateSavedReplySchema>, id?: string) {
  requireStaff(actor);
  return db.$transaction(async tx => {
    if (id && !(await tx.savedReply.findFirst({ where: { id, ...(actor.role !== "ADMIN" ? { authorId: actor.id } : {}) } }))) throw notFound();
    const data = id ? await tx.savedReply.update({ where: { id }, data: input }) : await tx.savedReply.create({ data: { title: input.title!, body: input.body!, authorId: actor.id } });
    await audit(tx, actor, id ? "saved_reply.updated" : "saved_reply.created", "SavedReply", data.id);
    return data;
  });
}
export async function deleteSavedReply(actor: Actor, id: string) {
  requireStaff(actor);
  return db.$transaction(async tx => {
    const result = await tx.savedReply.deleteMany({ where: { id, ...(actor.role !== "ADMIN" ? { authorId: actor.id } : {}) } });
    if (!result.count) throw notFound();
    await audit(tx, actor, "saved_reply.deleted", "SavedReply", id);
  });
}
export async function notifications(actor: Actor, q: z.infer<typeof schema.notificationQuery>) {
  const visible: Prisma.NotificationWhereInput = { userId: actor.id, OR: [{ conversationId: null }, { conversation: { is: visibility(actor) } }] };
  const where: Prisma.NotificationWhereInput = { AND: [visible, ...(q.search ? [{ OR: [{ title: { contains: q.search } }, { message: { contains: q.search } }] }] : [])], isRead: q.isRead };
  const [data, total, unreadCount] = await db.$transaction([db.notification.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...paging(q) }), db.notification.count({ where }), db.notification.count({ where: { ...visible, isRead: false } })]);
  return { data, unreadCount, pagination: pagination({ page: q.page, limit: q.limit }, total) };
}
export async function readNotifications(actor: Actor, id?: string) {
  const result = await db.notification.updateMany({ where: { userId: actor.id, ...(id ? { id } : { isRead: false }) }, data: { isRead: true } });
  if (id && !result.count) throw notFound();
  return { updated: result.count };
}
export async function deleteNotifications(actor: Actor, period: "day" | "week" | "month" | "all") {
  const since = period === "day" ? new Date(Date.now() - 86_400_000) : period === "week" ? new Date(Date.now() - 7 * 86_400_000) : period === "month" ? new Date(Date.now() - 30 * 86_400_000) : undefined;
  const result = await db.notification.deleteMany({ where: { userId: actor.id, ...(since ? { createdAt: { gte: since } } : {}) } });
  return { deleted: result.count };
}
export async function deleteVisibleNotifications(actor: Actor, ids: string[]) {
  const result = await db.notification.deleteMany({ where: { userId: actor.id, id: { in: ids } } });
  return { deleted: result.count };
}
export async function activityLogs(actor: Actor, q: z.infer<typeof schema.activityQuery>) {
  requireAdmin(actor);
  const where: Prisma.ActivityLogWhereInput = { userId: q.userId, ...(q.action ? { action: { contains: q.action } } : {}), ...(q.search ? { OR: [{ action: { contains: q.search } }, { user: { name: { contains: q.search } } }, { user: { email: { contains: q.search } } }] } : {}) };
  const [rawData, total] = await db.$transaction([db.activityLog.findMany({ where, include: { user: { select: { id: true, name: true, email: true } } }, orderBy: [{ createdAt: "desc" }, { id: "desc" }], ...paging(q) }), db.activityLog.count({ where })]);
  const customerIds = [...new Set(rawData.filter(log => log.entityType === "User" && log.entityId).map(log => log.entityId!))];
  const conversationIds = [...new Set(rawData.filter(log => log.entityType === "Conversation" && log.entityId).map(log => log.entityId!))];
  const [customers, conversations] = await Promise.all([
    customerIds.length ? db.user.findMany({ where: { id: { in: customerIds } }, select: { id: true, name: true, phone: true, email: true, company: true } }) : [],
    conversationIds.length ? db.conversation.findMany({ where: { id: { in: conversationIds } }, select: { id: true, subject: true, number: true } }) : [],
  ]);
  const customerNames = new Map(customers.map(item => [item.id, item]));
  const conversationInfo = new Map(conversations.map(item => [item.id, item]));
  const data = rawData.map(log => {
    const oldMetadata = log.metadata && typeof log.metadata === "object" && !Array.isArray(log.metadata) ? log.metadata as Record<string, unknown> : {};
    const customer = log.entityId ? customerNames.get(log.entityId) : undefined;
    const conversation = log.entityId ? conversationInfo.get(log.entityId) : undefined;
    return { ...log, metadata: { ...oldMetadata, ...(customer ? { customerName: customer.name, ...(log.action === "customer.updated" || log.action === "customer.created" ? { name: customer.name, phone: customer.phone, email: customer.email, company: customer.company } : {}) } : {}), ...(conversation ? { subject: conversation.subject, number: conversation.number } : {}) } };
  });
  return { data, pagination: pagination({ page: q.page, limit: q.limit }, total) };
}
export async function deleteActivityLogs(actor: Actor, period: "day" | "week" | "month" | "all") {
  requireAdmin(actor);
  const days = period === "day" ? 1 : period === "week" ? 7 : period === "month" ? 30 : null;
  const result = await db.activityLog.deleteMany({ where: days ? { createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) } } : {} });
  return { deleted: result.count };
}
export async function integrationSettings(actor: Actor) {
  requireAdmin(actor);
  return db.integrationSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}
export async function responseTimeSettings(actor: Actor) {
  requireAdmin(actor);
  return db.responseTimeSettings.upsert({ where: { id: "default" }, create: { id: "default" }, update: {} });
}
export async function updateResponseTimeSettings(actor: Actor, input: z.infer<typeof schema.responseTimeSettingsSchema>) {
  requireAdmin(actor);
  return db.responseTimeSettings.upsert({ where: { id: "default" }, create: { id: "default", ...input }, update: input });
}
export async function notificationSettings(actor: Actor) {
  requireAdmin(actor);
  return db.notificationSettings.upsert({ where: { id: "default" }, create: { id: "default", ticketCreatedSubject: "Talebiniz oluşturuldu (#{number})", ticketCreatedBody: "Merhaba {name},\n\n\"{subject}\" başlıklı talebiniz oluşturuldu. Destek ekibimiz en kısa sürede dönüş yapacaktır.", ticketReplySubject: "Talebinize yeni yanıt geldi (#{number})", ticketReplyBody: "Merhaba {name},\n\n{subject} başlıklı talebinize destek ekibimizin yanıtı:\n\n{reply}" }, update: {} });
}
export async function updateNotificationSettings(actor: Actor, input: z.infer<typeof schema.notificationSettingsSchema>) {
  requireAdmin(actor);
  return db.notificationSettings.upsert({ where: { id: "default" }, create: { id: "default", ...input }, update: input });
}
export async function updateIntegrationSettings(actor: Actor, input: z.infer<typeof schema.integrationSettingsSchema>) {
  requireAdmin(actor);
  return db.$transaction(async tx => {
    for (const departmentId of [input.imapDepartmentId, input.smsDepartmentId, input.whatsappDepartmentId]) {
      if (departmentId && !await tx.department.findFirst({ where: { id: departmentId, isActive: true, deletedAt: null } })) throw new AppError(400, "INVALID_DEPARTMENT", "Varsayılan departman aktif olmalıdır.");
    }
    const data = await tx.integrationSettings.upsert({ where: { id: "default" }, create: { id: "default", ...input }, update: input });
    await audit(tx, actor, "integrations.updated", "IntegrationSettings", "default", { smtpEnabled: input.smtpEnabled, imapEnabled: input.imapEnabled, smsEnabled: input.smsEnabled, whatsappEnabled: input.whatsappEnabled });
    return data;
  });
}
export async function testIntegration(actor: Actor, channel: "SMTP" | "IMAP" | "SMS" | "WHATSAPP") {
  requireAdmin(actor);
  const settings = await integrationSettings(actor);
  let success = false; let message = "";
  try {
    if (channel === "SMTP") {
      if (!settings.smtpHost || !settings.smtpFromAddress) throw new Error("SMTP sunucusu ve gönderen adresi zorunludur.");
      if (settings.smtpPort === 993) throw new Error("993 IMAP portudur. SMTP için TLS ile 587 veya SSL ile 465 kullanın.");
      const useTls = settings.smtpSecure;
      await nodemailer.createTransport({ host: settings.smtpHost, port: settings.smtpPort, secure: useTls && settings.smtpPort === 465, requireTLS: useTls && settings.smtpPort !== 465, ...(settings.smtpUser ? { auth: { user: settings.smtpUser, pass: settings.smtpPassword } } : {}) }).verify();
    } else if (channel === "IMAP") {
      if (!settings.imapHost || !settings.imapUser || !settings.imapPassword) throw new Error("IMAP bağlantı bilgileri zorunludur.");
      if (settings.imapSecure && settings.imapPort !== 993) throw new Error("IMAP SSL/TLS için 993 portunu kullanın; 587 SMTP portudur.");
      const client = new ImapFlow({ host: settings.imapHost, port: settings.imapPort, secure: settings.imapSecure, auth: settings.imapAuthType === "OAUTH2" ? { user: settings.imapUser, accessToken: settings.imapPassword } : { user: settings.imapUser, pass: settings.imapPassword }, logger: false });
      await client.connect(); await client.logout();
    } else if (channel === "SMS") {
      if (!settings.smsApiUser || !settings.smsApiPassword || !settings.smsSender) throw new Error("Netgsm API bilgileri ve gönderici başlığı zorunludur.");
      message = "Netgsm bilgileri kaydedildi. Test mesajı göndermek için bir alıcı numarası gerekir.";
    } else {
      if (!settings.whatsappPhoneNumberId || !settings.whatsappAccessToken || !settings.whatsappVerifyToken) throw new Error("Meta WhatsApp bağlantı bilgileri eksik.");
      const response = await fetch(`https://graph.facebook.com/v20.0/${settings.whatsappPhoneNumberId}?fields=id`, { headers: { Authorization: `Bearer ${settings.whatsappAccessToken}` } });
      if (!response.ok) throw new Error("Meta WhatsApp erişim belirteci doğrulanamadı.");
    }
    success = true; message ||= "Bağlantı başarıyla doğrulandı.";
  } catch (error) { const detail = error instanceof Error ? error.message : "Bağlantı testi başarısız oldu."; message = /EACCES/.test(detail) ? "SMTP ağı bu sunucuda engelli. Güvenlik duvarında smtp.gmail.com için TCP 587 veya 465 çıkışına izin verin; uygulama parolası bu hatayı çözmez." : detail; }
  const result = { channel, success, message, testedAt: new Date() };
    await db.integrationSettings.update({ where: { id: "default" }, data: { lastTestChannel: channel, lastTestSuccess: success, lastTestMessage: message.slice(0, 5000), lastTestedAt: result.testedAt } });
  return result;
}
export async function profile(actor: Actor) { return db.user.findUniqueOrThrow({ where: { id: actor.id }, select: person }); }
export async function user(actor: Actor, id: string) { requireAdmin(actor); const data = await db.user.findFirst({ where: { id, deletedAt: null }, select: person }); if (!data) throw notFound(); return data; }
export async function updateProfile(actor: Actor, input: z.infer<typeof schema.profileSchema>) {
  const current = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  const credentialChange = Boolean(input.password || (input.email && input.email !== current.email));
  if (credentialChange && (!input.currentPassword || !(await bcrypt.compare(input.currentPassword, current.passwordHash)))) throw new AppError(400, "CURRENT_PASSWORD_REQUIRED", "E-posta veya şifre değişikliği için mevcut şifrenizi doğru girin.");
  const passwordHash = input.password ? await bcrypt.hash(input.password, 12) : undefined;
  return serial(async tx => {
    const latest = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (latest.passwordHash !== current.passwordHash || latest.email !== current.email) throw new AppError(409, "PROFILE_CHANGED", "Profiliniz değişti. Yenileyip tekrar deneyin.");
    const data = await tx.user.update({ where: { id: actor.id }, data: { name: input.name, email: input.email, ...(input.email !== undefined ? { loginEmail: input.email } : {}), passwordHash }, select: person });
    if (credentialChange) await tx.session.updateMany({ where: { userId: actor.id, id: { not: actor.sessionId }, revokedAt: null }, data: { revokedAt: new Date() } });
    await audit(tx, actor, "profile.updated", "User", actor.id, { fields: Object.keys(input).filter(k => !k.toLowerCase().includes("password")) });
    return data;
  });
}
export async function reports(actor: Actor, q: Page) {
  if (!["ADMIN", "SUPERVISOR"].includes(actor.role)) throw new AppError(403, "FORBIDDEN", "Raporlara erişim yetkiniz yok.");
  const scope = visibility(actor);
  const to = new Date();
  const from = new Date(Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - 29));
  const agentWhere: Prisma.UserWhereInput = { role: "AGENT", ...(actor.role === "SUPERVISOR" ? { departments: { some: { departmentId: { in: actor.departmentIds } } } } : {}) };
  const { statuses, priorities, departmentCounts, agents, agentTotal } = await db.$transaction(async tx => {
    const statuses = await tx.conversation.groupBy({ by: ["status"], where: scope, _count: { _all: true } });
    const priorities = await tx.conversation.groupBy({ by: ["priority"], where: scope, _count: { _all: true } });
    const departmentCounts = await tx.conversation.groupBy({ by: ["departmentId"], where: scope, _count: { _all: true } });
    const agents = await tx.user.findMany({ where: agentWhere, select: { id: true, name: true, email: true }, orderBy: [{ name: "asc" }, { id: "asc" }], ...paging(q) });
    const agentTotal = await tx.user.count({ where: agentWhere });
    return { statuses, priorities, departmentCounts, agents, agentTotal };
  });
  const departments = await db.department.findMany({ where: { id: { in: departmentCounts.map(d => d.departmentId) } }, select: { id: true, name: true } });
  const agentIds = agents.map(a => a.id);
  const counts = await db.conversation.groupBy({ by: ["assignedAgentId", "status"], where: { AND: [scope, { assignedAgentId: { in: agentIds } }] }, _count: true });
  const daily = Array.from({ length: 30 }, (_, i) => ({ date: new Date(from.getTime() + i * 86400000).toISOString().slice(0, 10), created: 0, resolved: 0 }));
  let responseSum = 0, responseCount = 0, resolutionSum = 0, resolutionCount = 0;
  const agentResponses = new Map<string, { sum: number; count: number }>();
  // Cursor batches bound memory for large installations; no raw SQL or message-body scans.
  let cursor: string | undefined;
  while (true) {
    const batch = await db.conversation.findMany({ where: { AND: [scope, { OR: [{ createdAt: { gte: from, lte: to } }, { resolvedAt: { gte: from, lte: to } }] }] }, select: { id: true, createdAt: true, resolvedAt: true, firstResponseAt: true, assignedAgentId: true }, orderBy: { id: "asc" }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    for (const conversation of batch) {
      const createdDay = daily.find(d => d.date === conversation.createdAt.toISOString().slice(0, 10));
      if (createdDay) createdDay.created++;
      const resolvedDay = conversation.resolvedAt ? daily.find(d => d.date === conversation.resolvedAt!.toISOString().slice(0, 10)) : undefined;
      if (resolvedDay) resolvedDay.resolved++;
      if (conversation.createdAt < from || conversation.createdAt > to) continue;
      if (conversation.firstResponseAt) {
        const minutes = Math.max(0, (conversation.firstResponseAt.getTime() - conversation.createdAt.getTime()) / 60000);
        responseSum += minutes; responseCount++;
        if (conversation.assignedAgentId && agentIds.includes(conversation.assignedAgentId)) { const prev = agentResponses.get(conversation.assignedAgentId) ?? { sum: 0, count: 0 }; prev.sum += minutes; prev.count++; agentResponses.set(conversation.assignedAgentId, prev); }
      }
      if (conversation.resolvedAt) { resolutionSum += Math.max(0, (conversation.resolvedAt.getTime() - conversation.createdAt.getTime()) / 60000); resolutionCount++; }
    }
    if (batch.length < 500) break;
    cursor = batch[batch.length - 1]!.id;
  }
  return {
    period: { from, to }, total: statuses.reduce((sum, item) => sum + item._count._all, 0),
    statuses: Object.fromEntries(statuses.map(item => [item.status, item._count._all])), priorities: Object.fromEntries(priorities.map(item => [item.priority, item._count._all])),
    departments: departments.map(d => ({ ...d, count: departmentCounts.find(c => c.departmentId === d.id)?._count._all ?? 0 })), daily,
    firstResponseMinutes: responseCount ? responseSum / responseCount : null, resolutionMinutes: resolutionCount ? resolutionSum / resolutionCount : null,
    agents: agents.map(agent => { const rows = counts.filter(c => c.assignedAgentId === agent.id); const response = agentResponses.get(agent.id); return { ...agent, assigned: rows.reduce((sum, r) => sum + r._count, 0), resolved: rows.filter(r => r.status === "RESOLVED" || r.status === "CLOSED").reduce((sum, r) => sum + r._count, 0), firstResponseMinutes: response ? response.sum / response.count : null }; }), agentsPagination: pagination(q, agentTotal),
  };
}
