import bcrypt from "bcrypt";
import { randomBytes } from "node:crypto";
import { unlink } from "node:fs/promises";
import path from "node:path";
import nodemailer from "nodemailer";
import { ImapFlow } from "imapflow";
import {
  testNetgsmConnection,
  testWhatsappConnection,
} from "./integrations.service.js";
import type { z } from "zod";
import { db } from "../config/db.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Actor } from "../types/express.js";
import { AppError } from "../utils/errors.js";
import { visibility } from "./conversations.service.js";
import { publishChange } from "./events.service.js";
import { uploadRoot, type StoredUpload } from "./uploads.service.js";
import { queueSupportEmail } from "./mailer.service.js";
import type * as schema from "../validators/management.js";
import { rankStaff } from './skill-matching.js';
import { can, permissionScope } from './permissions.js';

type Page = { page: number; limit: number };
const pagination = (q: Page, total: number) => ({
  ...q,
  total,
  totalPages: Math.ceil(total / q.limit),
});
const paging = (q: Page) => ({ skip: (q.page - 1) * q.limit, take: q.limit });
const person = {
  id: true,
  name: true,
  email: true,
  phone: true,
  company: true,
  staffNote: true,
  extraPhones: true,
  extraEmails: true,
  role: true,
  accessRoleId: true,
  accessRole: { select: { id: true, name: true, permissions: true, scope: true } },
  skills: { select: { name: true, category: true, level: true }, orderBy: { name: 'asc' } },
  isActive: true,
  createdAt: true,
  updatedAt: true,
  departments: {
    where: { department: { deletedAt: null } },
    select: {
      departmentId: true,
      department: { select: { id: true, name: true, isActive: true } },
    },
  },
} as const;
const requireStaff = (actor: Actor) => {
  if (actor.role === "CUSTOMER")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Bu işlem için personel yetkisi gerekiyor.",
    );
};
const requireAdmin = (actor: Actor) => {
  if (actor.role !== "ADMIN")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Bu işlem için yönetici yetkisi gerekiyor.",
    );
};
const requirePermission = (actor: Actor, permission: string) => {
  if (!can(actor, permission))
    throw new AppError(403, "FORBIDDEN", "Rolünüz bu işlem için yetkili değil.");
};
const requireUserPermission = (actor: Actor, action: 'view' | 'create' | 'update' | 'delete') => {
  if (!can(actor, `users.${action}`)) throw new AppError(403, 'FORBIDDEN', 'Personel ekranı için gerekli rol izniniz yok.');
};
function staffDirectoryScope(actor: Actor): Prisma.UserWhereInput {
  const scope = permissionScope(actor);
  if (scope === 'ALL') return {};
  // OWN is the conversation visibility scope; personnel access follows department membership.
  return { departments: { some: { departmentId: { in: actor.departmentIds } } } };
}
function assertStaffInScope(actor: Actor, target: { id: string; departments?: Array<{ departmentId: string }> }) {
  const scope = permissionScope(actor);
  if (scope === 'ALL') return;
  if (target.id === actor.id || target.departments?.some((department) => actor.departmentIds.includes(department.departmentId))) return;
  throw new AppError(403, 'FORBIDDEN', 'Bu personel departman kapsamınızda değil.');
}
function assertDepartmentsInScope(actor: Actor, departmentIds: string[]) {
  const scope = permissionScope(actor);
  if (scope === 'ALL') return;
  // OWN limits conversation visibility; it must not prevent user creation
  // inside departments the actor belongs to when users.create is granted.
  if (departmentIds.every((id) => actor.departmentIds.includes(id))) return;
  throw new AppError(403, 'FORBIDDEN', 'Kapsamınız dışındaki departmanlara personel bağlayamazsınız.');
}
const notFound = () => new AppError(404, "NOT_FOUND", "Kayıt bulunamadı.");
const normalizeCustomerName = (value: string) =>
  value.trim().toLocaleLowerCase("tr-TR").replace(/\s+/g, " ");
const normalizeCustomerPhone = (value: string) => value.replace(/\D/g, "");
async function audit(
  tx: Prisma.TransactionClient,
  actor: Actor,
  action: string,
  entityType: string,
  entityId: string,
  metadata?: Prisma.InputJsonValue,
) {
  await tx.activityLog.create({
    data: {
      userId: actor.id,
      action,
      entityType,
      entityId,
      metadata,
      ipAddress: actor.ipAddress ?? null,
    },
  });
}
// Serializable retry protects administrator and assignment invariants during concurrent changes.
async function serial<T>(
  fn: (tx: Prisma.TransactionClient) => Promise<T>,
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await db.$transaction(fn, { isolationLevel: "Serializable" });
    } catch (error) {
      if (
        !(error instanceof Prisma.PrismaClientKnownRequestError) ||
        error.code !== "P2034" ||
        attempt >= 3
      )
        throw error;
    }
  }
}
export async function users(
  actor: Actor,
  q: z.infer<typeof schema.directoryQuery>,
  customersOnly = false,
) {
  if (customersOnly) requireStaff(actor);
  else requireUserPermission(actor, 'view');
  let phoneDigits = q.search?.replace(/\D/g, "") ?? "";
  if (phoneDigits && phoneDigits[0] !== "0" && !phoneDigits.startsWith("90"))
    phoneDigits = `0${phoneDigits}`;
  const phoneWithoutZero = phoneDigits.startsWith("0")
    ? phoneDigits.slice(1)
    : phoneDigits;
  const formatPhone = (digits: string) =>
    digits.length > 4
      ? [
          digits.slice(0, 4),
          digits.slice(4, 7),
          digits.slice(7, 9),
          digits.slice(9, 11),
        ]
          .filter(Boolean)
          .join(" ")
      : digits;
  const formattedPhone = formatPhone(phoneDigits);
  const formattedPhoneWithoutZero = formatPhone(phoneWithoutZero);
  const roleSearch = q.search?.trim().toLocaleLowerCase("tr-TR");
  const roleMatches = roleSearch
    ? [
        ...(roleSearch.includes("yönetici") ||
        roleSearch.includes("yonetici") ||
        roleSearch === "admin"
          ? ["ADMIN" as const]
          : []),
        ...(roleSearch.includes("departman") ||
        roleSearch.includes("sorumlu") ||
        roleSearch === "supervisor"
          ? ["SUPERVISOR" as const]
          : []),
        ...(roleSearch.includes("destek") ||
        roleSearch.includes("uzman") ||
        roleSearch === "agent"
          ? ["AGENT" as const]
          : []),
      ]
    : [];
  const where: Prisma.UserWhereInput = {
    id: q.id,
    role: customersOnly
      ? "CUSTOMER"
      : (q.role ?? { in: ["ADMIN", "SUPERVISOR", "AGENT"] }),
    isActive: customersOnly ? undefined : q.isActive,
    deletedAt: null,
    ...(!customersOnly ? staffDirectoryScope(actor) : {}),
    ...(q.search
      ? {
          OR: [
            { name: { contains: q.search } },
            { email: { contains: q.search } },
            { phone: { contains: q.search } },
            { company: { contains: q.search } },
            ...(roleMatches.length ? [{ role: { in: roleMatches } }] : []),
            ...(phoneDigits
              ? [
                  { phone: { contains: phoneDigits } },
                  { phone: { contains: formattedPhone } },
                  { phone: { contains: phoneWithoutZero } },
                  { phone: { contains: formattedPhoneWithoutZero } },
                ]
              : []),
          ],
        }
      : {}),
  };
  const result = customersOnly
    ? (
        await db.user.findMany({
          where,
          select: { ...person, customerFiles: { select: { id: true } } },
          orderBy: [{ createdAt: "desc" }, { id: "desc" }],
          ...paging(q),
        })
      ).map(({ customerFiles, ...customer }) => ({
        ...customer,
        customerFileCount: customerFiles.length,
      }))
    : await db.user.findMany({
        where,
        select: person,
        orderBy: [{ name: "asc" }, { id: "asc" }],
        ...paging(q),
      });
  const data = !customersOnly && permissionScope(actor) !== 'ALL'
    ? result.map((member) => ({ ...member, departments: member.departments.filter((department) => actor.departmentIds.includes(department.departmentId)) }))
    : result;
  const total = await db.user.count({ where });
  return {
    data,
    pagination: pagination({ page: q.page, limit: q.limit }, total),
  };
}
async function validateDepartments(
  tx: Prisma.TransactionClient,
  ids: string[],
  role: string,
) {
  if (role === "CUSTOMER" && ids.length)
    throw new AppError(
      400,
      "INVALID_MEMBERSHIP",
      "Müşteriler personel departmanlarına atanamaz.",
    );
  if ((role === "AGENT" || role === "SUPERVISOR") && !ids.length)
    throw new AppError(
      400,
      "DEPARTMENT_REQUIRED",
      "Personel için en az bir departman seçin.",
    );
  if (
    (await tx.department.count({
      where: { id: { in: ids }, isActive: true },
    })) !== ids.length
  )
    throw new AppError(400, "INVALID_DEPARTMENT", "Aktif departmanlar seçin.");
}
export async function createUser(
  actor: Actor,
  input: z.infer<typeof schema.createUserSchema>,
) {
  requireUserPermission(actor, 'create');
  const { password, departmentIds, skills, ...rest } = input;
  const isSystemAdmin = actor.role === 'ADMIN' && !actor.accessRole;
  const passwordHash = await bcrypt.hash(password, 12);
  return serial(async (tx) => {
    await validateDepartments(tx, departmentIds, rest.role);
    assertDepartmentsInScope(actor, departmentIds);
    if (!isSystemAdmin && rest.role === 'ADMIN' && !rest.accessRoleId) throw new AppError(403, 'FORBIDDEN', 'Sistem yoneticisi hesabi olusturamazsiniz.');
    if (!isSystemAdmin && rest.role === 'SUPERVISOR') throw new AppError(403, 'FORBIDDEN', 'Departman sorumlusu rolünü yalnızca sistem yöneticisi atayabilir.');
    if (rest.accessRoleId && !await tx.accessRole.findUnique({ where: { id: rest.accessRoleId } })) throw notFound();
    if (rest.accessRoleId && rest.role !== 'ADMIN') throw new AppError(400, 'INVALID_ROLE', 'Özel personel rolü geçerli değil.');
    if (actor.accessRole && (!rest.accessRoleId || rest.accessRoleId !== actor.accessRole.id)) throw new AppError(403, 'FORBIDDEN', 'Yalnızca kendi rolünüzde personel oluşturabilirsiniz.');
    const data = await tx.user.create({
      data: {
        ...rest,
        loginEmail: rest.email,
        passwordHash,
        skills: { create: rest.role === 'CUSTOMER' ? [] : skills },
        departments: {
          create: departmentIds.map((departmentId) => ({ departmentId })),
        },
      },
      select: person,
    });
    await audit(tx, actor, "user.created", "User", data.id, {
      details: [
        `Ad soyad: ${data.name}`,
        data.email && `E-posta: ${data.email}`,
        data.phone && `Telefon: ${data.phone}`,
        `Rol: ${data.accessRole?.name ?? ({ ADMIN: "Yönetici", SUPERVISOR: "Departman sorumlusu", AGENT: "Destek uzmanı", CUSTOMER: "Müşteri" }[data.role] ?? data.role)}`,
        data.departments.length > 0 && `Departman: ${data.departments.map(({ department }) => department.name).join(", ")}`,
      ].filter((detail): detail is string => Boolean(detail)),
    });
    return data;
  });
}
export async function createCustomer(
  actor: Actor,
  input: z.infer<typeof schema.createCustomerSchema>,
  files: StoredUpload[] = [],
) {
  requireStaff(actor);
  const data = await serial(async (tx) => {
    if (input.email) {
      const sameEmail = await tx.user.findMany({
        where: { role: "CUSTOMER", deletedAt: null, email: input.email },
        select: { name: true, email: true, phone: true },
      });
      const duplicate = sameEmail.some(
        (customer) =>
          normalizeCustomerName(customer.name) ===
            normalizeCustomerName(input.name) &&
          normalizeCustomerPhone(customer.phone ?? "") ===
            normalizeCustomerPhone(input.phone) &&
          customer.email?.trim().toLocaleLowerCase("tr-TR") ===
            input.email?.trim().toLocaleLowerCase("tr-TR"),
      );
      if (duplicate)
        throw new AppError(
          409,
          "DUPLICATE_CUSTOMER",
          "Ad soyad, telefon ve e-posta bilgileriyle kayıtlı bir müşteri zaten var.",
        );
    }
    const data = await tx.user.create({
      data: {
        ...input,
        role: "CUSTOMER",
        loginEmail: null,
        passwordHash: await bcrypt.hash(randomBytes(32).toString("hex"), 12),
      },
      select: person,
    });
    if (files.length)
      await tx.customerAttachment.createMany({
        data: files.map((file) => ({ ...file, customerId: data.id })),
      });
    await audit(tx, actor, "customer.created", "User", data.id, {
      name: data.name,
      phone: data.phone,
      email: data.email,
      company: data.company,
    });
    const recipients = await tx.user.findMany({
      where: { isActive: true, accessRoleId: null, role: { in: ["ADMIN", "SUPERVISOR"] } },
      select: { id: true },
    });
    if (recipients.length) {
      const contact = data.email ?? data.phone ?? "iletişim bilgisi yok";
      await tx.notification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.id,
          type: "CUSTOMER_CREATED",
          title: "Yeni kişi eklendi",
          message: `${data.name} eklendi · ${contact}`,
        })),
      });
    }
    return data;
  });
  publishChange();
  if (data.email)
    queueSupportEmail(
      data.email,
      "Destek merkezine hoş geldiniz",
      `Merhaba ${data.name},\n\nDestek merkezi kaydınız oluşturuldu. İhtiyacınız olduğunda bu e-posta adresi üzerinden bizimle iletişime geçebilirsiniz.`,
      "Müşteri karşılama",
    );
  return data;
}
export async function customer(actor: Actor, id: string) {
  requireStaff(actor);
  const data = await db.user.findFirst({
    where: {
      id,
      role: "CUSTOMER",
      deletedAt: null,
    },
    select: person,
  });
  if (!data) throw notFound();
  return data;
}
export async function updateCustomer(
  actor: Actor,
  id: string,
  input: z.infer<typeof schema.updateCustomerSchema>,
  files: StoredUpload[] = [],
) {
  requireStaff(actor);
  return serial(async (tx) => {
    const current = await tx.user.findFirst({
      where: { id, role: "CUSTOMER", deletedAt: null },
      select: {
        id: true,
        name: true,
        phone: true,
        email: true,
        company: true,
        staffNote: true,
        extraPhones: true,
        extraEmails: true,
      },
    });
    if (!current) throw notFound();
    const data = await tx.user.update({
      where: { id },
      // Customer email is contact data only. It must never occupy the
      // unique login identity column used by staff accounts.
      data: { ...input, loginEmail: null },
      select: person,
    });
    if (files.length)
      await tx.customerAttachment.createMany({
        data: files.map((file) => ({ ...file, customerId: id })),
      });
    const changes = Object.fromEntries(
      Object.keys(input)
        .filter(
          (field) =>
            current[field as keyof typeof current] !==
            input[field as keyof typeof input],
        )
        .map((field) => [
          field,
          {
            from: current[field as keyof typeof current] ?? null,
            to: input[field as keyof typeof input] ?? null,
          },
        ]),
    );
    if (Object.keys(changes).length)
      await audit(tx, actor, "customer.updated", "User", id, {
        name: data.name,
        phone: data.phone,
        email: data.email,
        company: data.company,
        changes,
      });
    return data;
  });
}
export async function customerFiles(actor: Actor, customerId: string) {
  await customer(actor, customerId);
  return db.customerAttachment.findMany({
    where: { customerId },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
  });
}
export async function customerFile(
  actor: Actor,
  customerId: string,
  fileId: string,
) {
  await customer(actor, customerId);
  const file = await db.customerAttachment.findFirst({
    where: { id: fileId, customerId },
  });
  if (!file) throw notFound();
  return file;
}
export async function deleteCustomerFile(
  actor: Actor,
  customerId: string,
  fileId: string,
) {
  await customer(actor, customerId);
  const customerRecord = await db.user.findUnique({
    where: { id: customerId },
    select: { name: true },
  });
  const file = await db.customerAttachment.findFirst({
    where: { id: fileId, customerId },
  });
  if (!file) throw notFound();
  await db.customerAttachment.delete({ where: { id: file.id } });
  await unlink(path.join(uploadRoot, file.storageKey)).catch(() => undefined);
  await db.activityLog.create({
    data: {
      userId: actor.id,
      action: "customer.file_deleted",
      entityType: "User",
      entityId: customerId,
      metadata: {
        fileId: file.id,
        originalName: file.originalName,
        customerName: customerRecord?.name ?? null,
      },
      ipAddress: actor.ipAddress ?? null,
    },
  });
  return { id: file.id };
}
export async function deleteCustomer(actor: Actor, id: string) {
  requireStaff(actor);
  return serial(async (tx) => {
    const current = await tx.user.findFirst({
      where: { id, role: "CUSTOMER" },
      select: { id: true, name: true, phone: true, email: true },
    });
    if (!current) throw notFound();
    const deletedAt = new Date();
    // Customer deletion follows the application's soft-delete model. Hide every
    // associated conversation at the same time so its messages cannot remain in
    // the inbox, search, notification list, or the conversation detail screen.
    const conversations = await tx.conversation.updateMany({
      where: { customerId: id, deletedAt: null },
      data: { deletedAt },
    });
    const data = await tx.user.update({
      where: { id },
      data: { isActive: false, deletedAt },
      select: person,
    });
    await audit(tx, actor, "customer.deleted", "User", id, {
      name: current.name,
      phone: current.phone,
      email: current.email,
      deletedConversationCount: conversations.count,
    });
    const recipients = await tx.user.findMany({
      where: {
        isActive: true,
        id: { not: actor.id },
        accessRoleId: null,
        role: { in: ["ADMIN", "SUPERVISOR"] },
      },
      select: { id: true },
    });
    if (recipients.length) {
      await tx.notification.createMany({
        data: recipients.map((recipient) => ({
          userId: recipient.id,
          type: "CUSTOMER_DELETED",
          title: "Müşteri silindi",
          message: `${current.name} silindi`,
        })),
      });
    }
    return data;
  });
}
export async function userAssignmentImpact(
  actor: Actor,
  id: string,
  target: z.infer<typeof schema.userAssignmentImpactQuery>,
) {
  if (!can(actor, 'users.update') && !can(actor, 'users.delete')) throw new AppError(403, 'FORBIDDEN', 'Personel atama bilgilerini görme yetkiniz yok.');
  const current = await db.user.findFirst({ where: { id, deletedAt: null }, select: { id: true, departments: { select: { departmentId: true } } } });
  if (!current) throw notFound();
  assertStaffInScope(actor, current);
  const effectiveDepartmentIds = permissionScope(actor) === 'DEPARTMENT'
    ? [...new Set([...target.departmentIds, ...current.departments.map((department) => department.departmentId).filter((departmentId) => !actor.departmentIds.includes(departmentId))])]
    : target.departmentIds;
  const isEligibleStaff = !target.forDeletion && target.isActive && (Boolean(target.accessRoleId) || ["AGENT", "SUPERVISOR"].includes(target.role));
  const assigned = await db.conversation.findMany({
    where: { assignedAgentId: id, deletedAt: null, status: { notIn: ["RESOLVED", "CLOSED"] } },
    select: {
      id: true, number: true, subject: true, status: true, priority: true, createdAt: true,
      departmentId: true,
      department: { select: { name: true } },
      customer: { select: { name: true } },
    },
    orderBy: [{ createdAt: "asc" }, { number: "asc" }],
  });
  if (permissionScope(actor) !== 'ALL' && assigned.some((conversation) => !actor.departmentIds.includes(conversation.departmentId)))
    throw new AppError(403, 'FORBIDDEN', 'Bu personelin kapsamınız dışındaki departmanlarda da açık atamaları var. Sistem yöneticisinden destek alın.');
  return assigned.filter((conversation) => !isEligibleStaff || !effectiveDepartmentIds.includes(conversation.departmentId));
}

export async function updateUser(
  actor: Actor,
  id: string,
  input: z.infer<typeof schema.updateUserSchema>,
) {
  requireUserPermission(actor, 'update');
  if (
    id === actor.id &&
    (input.isActive === false || (input.role && input.role !== "ADMIN"))
  )
    throw new AppError(
      409,
      "SELF_PROTECTION",
      "Kendi yönetici yetkinizi kaldıramaz veya hesabınızı kapatamazsınız.",
    );
  const { password, departmentIds, skills, assignmentTransfers, ...rest } = input;
  const passwordHash = password ? await bcrypt.hash(password, 12) : undefined;
  const result = await serial(async (tx) => {
    const current = await tx.user.findFirst({
      where: { id, deletedAt: null },
      include: { departments: true },
    });
    if (!current) throw notFound();
    assertStaffInScope(actor, current);
    const role = input.role ?? current.role;
    const accessRoleId = input.accessRoleId !== undefined ? input.accessRoleId : current.accessRoleId;
    const isSystemAdmin = actor.role === 'ADMIN' && !actor.accessRole;
    if (!isSystemAdmin && input.role === 'SUPERVISOR' && current.role !== 'SUPERVISOR') throw new AppError(403, 'FORBIDDEN', 'Departman sorumlusu rolünü yalnızca sistem yöneticisi atayabilir.');
    if (accessRoleId && !await tx.accessRole.findUnique({ where: { id: accessRoleId } })) throw notFound();
    if (!isSystemAdmin && role === 'ADMIN' && !accessRoleId) throw new AppError(403, 'FORBIDDEN', 'Sistem yoneticisi rolu atayamazsiniz.');
    if (accessRoleId && role !== 'ADMIN') throw new AppError(400, 'INVALID_ROLE', 'Özel personel rolü geçerli değil.');
    if (actor.accessRole && (current.accessRoleId !== actor.accessRole.id || (input.role !== undefined && input.role !== current.role) || (input.accessRoleId !== undefined && input.accessRoleId !== current.accessRoleId))) throw new AppError(403, 'FORBIDDEN', 'Yalnızca kendi rolünüzdeki personelleri yönetebilirsiniz; rol değiştiremezsiniz.');
    if (actor.id === id && current.role === 'ADMIN' && !current.accessRoleId && accessRoleId) throw new AppError(409, 'SELF_PROTECTION', 'Kendi sistem yöneticisi yetkinizi kaldıramazsınız.');
    const active = input.isActive ?? current.isActive;
    const currentDepartmentIds = current.departments.map((d) => d.departmentId);
    const preservedOutOfScopeDepartmentIds = permissionScope(actor) === 'DEPARTMENT' ? currentDepartmentIds.filter((departmentId) => !actor.departmentIds.includes(departmentId)) : [];
    if (departmentIds !== undefined && role === 'CUSTOMER' && preservedOutOfScopeDepartmentIds.length) throw new AppError(403, 'FORBIDDEN', 'Başka departmanlarda üyeliği olan personelin rolünü müşteri yapamazsınız.');
    if (departmentIds !== undefined && permissionScope(actor) !== 'OWN') assertDepartmentsInScope(actor, departmentIds);
    if (permissionScope(actor) === 'OWN' && departmentIds !== undefined && (departmentIds.some((departmentId) => !currentDepartmentIds.includes(departmentId)) || currentDepartmentIds.some((departmentId) => !departmentIds.includes(departmentId)))) throw new AppError(403, 'FORBIDDEN', 'Kendi departman üyeliklerinizi değiştiremezsiniz.');
    const ids = departmentIds === undefined ? currentDepartmentIds : [...new Set([...departmentIds, ...preservedOutOfScopeDepartmentIds])];
    if (
      departmentIds !== undefined ||
      input.role !== undefined ||
      input.isActive === true
    )
      await validateDepartments(tx, ids, role);
    if (
      current.role === "ADMIN" && !current.accessRoleId &&
      current.isActive &&
      (role !== "ADMIN" || accessRoleId || !active) &&
      (await tx.user.count({ where: { role: "ADMIN", accessRoleId: null, isActive: true, deletedAt: null } })) <= 1
    )
      throw new AppError(409, "LAST_ADMIN", "Son aktif yönetici kaldırılamaz.");
    const canRemainAssigned = active && (Boolean(accessRoleId) || ["AGENT", "SUPERVISOR"].includes(role));
    const assignedConversations = await tx.conversation.findMany({
      where: { assignedAgentId: id, deletedAt: null, status: { notIn: ["RESOLVED", "CLOSED"] } },
      select: { id: true, number: true, departmentId: true, assignedAgentId: true },
    });
    const affectedConversations = assignedConversations.filter((conversation) =>
      !canRemainAssigned || !ids.includes(conversation.departmentId),
    );
    const transfers = assignmentTransfers ?? [];
    const transferredIds = transfers.flatMap((transfer) => transfer.conversationIds);
    const affectedIds = new Set(affectedConversations.map((conversation) => conversation.id));
    if (
      transferredIds.length !== new Set(transferredIds).size ||
      transferredIds.length !== affectedIds.size ||
      transferredIds.some((conversationId) => !affectedIds.has(conversationId))
    )
      throw new AppError(409, "ASSIGNMENTS_EXIST", "Kullanıcı değişikliğinden önce etkilenen tüm açık talepleri aktarım gruplarına ekleyin.");
    const movedConversationIds: string[] = [];
    for (const transfer of transfers) {
      if (permissionScope(actor) !== "ALL" && !actor.departmentIds.includes(transfer.departmentId))
        throw new AppError(403, "FORBIDDEN", "Kapsamınız dışındaki departmanlara talep aktaramazsınız.");
      const destination = await tx.department.findFirst({ where: { id: transfer.departmentId, isActive: true, deletedAt: null }, select: { id: true } });
      if (!destination) throw new AppError(400, "INVALID_DEPARTMENT", "Aktarım için aktif bir departman seçin.");
      const conversations = transfer.conversationIds.map((conversationId) => affectedConversations.find((conversation) => conversation.id === conversationId)!);
      if (permissionScope(actor) !== "ALL" && conversations.some((conversation) => !actor.departmentIds.includes(conversation.departmentId)))
        throw new AppError(403, "FORBIDDEN", "Kapsamınız dışındaki departmanlardaki talepleri aktaramazsınız.");
      const changesDepartment = conversations.some((conversation) => conversation.departmentId !== transfer.departmentId);
      const changesAssignee = conversations.some((conversation) => conversation.assignedAgentId !== transfer.assignedAgentId);
      if (changesDepartment && !can(actor, "conversations.transfer"))
        throw new AppError(403, "FORBIDDEN", "Departmanlar arası aktarım için talep aktarma izni gerekir.");
      if (changesAssignee && !can(actor, "conversations.assign"))
        throw new AppError(403, "FORBIDDEN", "Talep atamasını değiştirmek için personel atama izni gerekir.");
      if (transfer.assignedAgentId === id) {
        if (!canRemainAssigned || !ids.includes(transfer.departmentId))
          throw new AppError(400, "INVALID_ASSIGNEE", "Düzenlenen kullanıcı hedef departmanda görev alamaz.");
      } else if (transfer.assignedAgentId) {
        const recipient = await tx.user.findFirst({
          where: {
            id: transfer.assignedAgentId,
            isActive: true,
            deletedAt: null,
            OR: [{ role: { in: ["AGENT", "SUPERVISOR"] } }, { accessRoleId: { not: null } }],
            departments: { some: { departmentId: transfer.departmentId } },
          },
          select: { id: true },
        });
        if (!recipient) throw new AppError(400, "INVALID_ASSIGNEE", "Seçilen personel hedef departmanda aktif değil.");
      }
      for (const conversation of conversations) {
        await tx.conversation.update({
          where: { id: conversation.id },
          data: { departmentId: transfer.departmentId, assignedAgentId: transfer.assignedAgentId },
        });
        await audit(tx, actor, "conversation.updated", "Conversation", conversation.id, {
          fields: ["departmentId", "assignedAgentId"],
          previousDepartmentId: conversation.departmentId,
          departmentId: transfer.departmentId,
          previousAssigneeId: conversation.assignedAgentId,
          assignedAgentId: transfer.assignedAgentId,
          transferredDuringUserUpdate: id,
        });
        movedConversationIds.push(conversation.id);
      }
    }
    // A customer with conversation history must retain their customer role.
    if (
      current.role === "CUSTOMER" &&
      role !== "CUSTOMER" &&
      (await tx.conversation.count({ where: { customerId: id } }))
    )
      throw new AppError(
        409,
        "CUSTOMER_HISTORY",
        "Talep geçmişi olan müşteri hesabının rolü değiştirilemez.",
      );
    const data = await tx.user.update({
      where: { id },
      data: {
        ...rest,
        ...(input.email !== undefined ? { loginEmail: input.email } : {}),
        ...(role === 'CUSTOMER' || skills !== undefined ? { skills: { deleteMany: {}, create: role === 'CUSTOMER' ? [] : skills } } : {}),
        passwordHash,
        ...(departmentIds
          ? {
              departments: {
                deleteMany: {},
                create: ids.map((departmentId) => ({ departmentId })),
              },
            }
          : {}),
      },
      select: person,
    });
    if (
      password ||
      input.email !== undefined ||
      input.role !== undefined ||
      input.accessRoleId !== undefined ||
      input.isActive === false ||
      departmentIds !== undefined
    )
      await tx.session.updateMany({
        where: {
          userId: id,
          revokedAt: null,
          ...(id === actor.id && active
            ? { id: { not: actor.sessionId } }
            : {}),
        },
        data: { revokedAt: new Date() },
      });
    await audit(tx, actor, "user.updated", "User", id, {
      fields: Object.keys(input).filter((k) => k !== "password"),
    });
    return { data, movedConversationIds };
  });
  for (const conversationId of result.movedConversationIds) publishChange(conversationId);
  return result.data;
}
export async function updateDepartment(
  actor: Actor,
  id: string,
  input: z.infer<typeof schema.departmentSchema>,
) {
  requirePermission(actor, "departments.update");
  return serial(async (tx) => {
    if (!(await tx.department.findFirst({ where: { id, deletedAt: null } })))
      throw notFound();
    // Archiving hides the department from new requests; existing tickets and memberships remain usable.
    const data = await tx.department.update({ where: { id }, data: input });
    await audit(
      tx,
      actor,
      input.isActive === false ? "department.archived" : "department.updated",
      "Department",
      id,
      input,
    );
    return data;
  });
}
export async function deleteDepartment(actor: Actor, id: string) {
  requirePermission(actor, "departments.delete");
  return serial(async (tx) => {
    const current = await tx.department.findFirst({
      where: { id, deletedAt: null },
    });
    if (!current) throw notFound();
    const data = await tx.department.update({
      where: { id },
      data: { isActive: false, deletedAt: new Date() },
    });
    await audit(tx, actor, "department.deleted", "Department", id, {
      name: current.name,
    });
    return data;
  });
}
export async function deleteUser(actor: Actor, id: string, input: z.infer<typeof schema.deleteUserSchema> = {}) {
  requireUserPermission(actor, 'delete');
  if (id === actor.id) throw new AppError(409, "SELF_PROTECTION", "Kendi hesab\u0131n\u0131z\u0131 silemezsiniz.");
  const result = await serial(async (tx) => {
    const current = await tx.user.findFirst({ where: { id, deletedAt: null }, include: { departments: true } });
    if (!current) throw notFound();
    assertStaffInScope(actor, current);
    if (actor.accessRole && current.accessRoleId !== actor.accessRole.id) throw new AppError(403, 'FORBIDDEN', 'Yaln\u0131zca kendi rol\u00fcn\u00fczdeki personelleri silebilirsiniz.');
    if (current.role === "ADMIN" && !current.accessRoleId && current.isActive && (await tx.user.count({ where: { role: "ADMIN", accessRoleId: null, isActive: true, deletedAt: null } })) <= 1)
      throw new AppError(409, "LAST_ADMIN", "Son aktif y\u00f6netici silinemez.");
    const assigned = await tx.conversation.findMany({
      where: { assignedAgentId: id, deletedAt: null, status: { notIn: ["RESOLVED", "CLOSED"] } },
      select: { id: true, number: true, departmentId: true },
    });
    if (permissionScope(actor) !== 'ALL' && assigned.some((conversation) => !actor.departmentIds.includes(conversation.departmentId)))
      throw new AppError(403, 'FORBIDDEN', 'Bu personelin kapsamınız dışındaki departmanlarda da açık atamaları var. Sistem yöneticisinden destek alın.');
    const transfers = input.assignmentTransfers ?? [];
    const transferredIds = transfers.flatMap((group) => group.conversationIds);
    const assignedIds = new Set(assigned.map((conversation) => conversation.id));
    if (transferredIds.length !== new Set(transferredIds).size || transferredIds.length !== assignedIds.size || transferredIds.some((conversationId) => !assignedIds.has(conversationId)))
      throw new AppError(409, "ASSIGNMENTS_EXIST", "Personel silinmeden \u00f6nce t\u00fcm a\u00e7\u0131k talepler aktar\u0131m gruplar\u0131na eklenmelidir.");
    const movedConversationIds: string[] = [];
    for (const group of transfers) {
      if (permissionScope(actor) !== "ALL" && !actor.departmentIds.includes(group.departmentId))
        throw new AppError(403, "FORBIDDEN", "Kapsam\u0131n\u0131z d\u0131\u015f\u0131ndaki departmanlara talep aktaramazs\u0131n\u0131z.");
      const destination = await tx.department.findFirst({ where: { id: group.departmentId, isActive: true, deletedAt: null }, select: { id: true } });
      if (!destination) throw new AppError(400, "INVALID_DEPARTMENT", "Aktar\u0131m i\u00e7in aktif bir departman se\u00e7in.");
      const conversations = group.conversationIds.map((conversationId) => assigned.find((conversation) => conversation.id === conversationId)!);
      if (permissionScope(actor) !== "ALL" && conversations.some((conversation) => !actor.departmentIds.includes(conversation.departmentId)))
        throw new AppError(403, "FORBIDDEN", "Kapsam\u0131n\u0131z d\u0131\u015f\u0131ndaki departmanlardaki talepleri aktaramazs\u0131n\u0131z.");
      const changesDepartment = conversations.some((conversation) => conversation.departmentId !== group.departmentId);
      if (changesDepartment && !can(actor, "conversations.transfer")) throw new AppError(403, "FORBIDDEN", "Departmanlar aras\u0131 aktar\u0131m i\u00e7in talep aktarma izni gerekir.");
      if (!can(actor, "conversations.assign")) throw new AppError(403, "FORBIDDEN", "Personel silmeden \u00f6nce talepleri yeniden atamak i\u00e7in personel atama izni gerekir.");
      if (group.assignedAgentId) {
        const recipient = await tx.user.findFirst({
          where: { id: group.assignedAgentId, isActive: true, deletedAt: null, OR: [{ role: { in: ["AGENT", "SUPERVISOR"] } }, { accessRoleId: { not: null } }], departments: { some: { departmentId: group.departmentId } } },
          select: { id: true },
        });
        if (!recipient) throw new AppError(400, "INVALID_ASSIGNEE", "Se\u00e7ilen personel hedef departmanda aktif de\u011fil.");
      }
      for (const conversation of conversations) {
        await tx.conversation.update({ where: { id: conversation.id }, data: { departmentId: group.departmentId, assignedAgentId: group.assignedAgentId } });
        await tx.conversationMessage.create({ data: { conversationId: conversation.id, authorId: actor.id, type: "SYSTEM", body: current.name + " personeli silindi; talep " + (group.assignedAgentId ? "se\u00e7ilen personele aktar\u0131ld\u0131" : "departman kuyru\u011funa al\u0131nd\u0131") + "." } });
        await audit(tx, actor, "conversation.updated", "Conversation", conversation.id, { fields: ["departmentId", "assignedAgentId"], previousDepartmentId: conversation.departmentId, departmentId: group.departmentId, previousAssigneeId: id, assignedAgentId: group.assignedAgentId, transferredDuringUserDeletion: id });
        movedConversationIds.push(conversation.id);
      }
    }
    await tx.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } });
    await tx.user.update({ where: { id }, data: { deletedAt: new Date(), isActive: false, loginEmail: null } });
    await audit(tx, actor, "user.deleted", "User", id, { name: current.name });
    return { data: { id }, movedConversationIds };
  });
  for (const conversationId of result.movedConversationIds) publishChange(conversationId);
  return result.data;
}
export async function tags(q: z.infer<typeof schema.searchQuery>) {
  const where: Prisma.TagWhereInput = q.search
    ? { name: { contains: q.search } }
    : {};
  const [data, total] = await db.$transaction([
    db.tag.findMany({
      where,
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...paging(q),
    }),
    db.tag.count({ where }),
  ]);
  return {
    data,
    pagination: pagination({ page: q.page, limit: q.limit }, total),
  };
}
export async function staffSuggestions(actor: Actor, text: string) {
  requireStaff(actor);
  requirePermission(actor, 'conversations.assign');
  if (!text.trim()) return [];
  const accessible = { isActive: true, deletedAt: null, ...(permissionScope(actor) === 'ALL' ? {} : { id: { in: actor.departmentIds } }) };
  const staff = await db.user.findMany({
    where: {
      OR: [{ role: { in: ['AGENT', 'SUPERVISOR'] } }, { accessRoleId: { not: null } }], isActive: true, deletedAt: null,
      skills: { some: {} }, departments: { some: { department: accessible } },
    },
    select: {
      id: true, name: true, skills: { select: { name: true, category: true, level: true } },
      departments: { where: { department: accessible }, select: { department: { select: { id: true, name: true } } }, orderBy: { department: { name: 'asc' } } },
    },
  });
  return rankStaff(text, staff).slice(0, 6).map(({ id, name, matches, departments }) => ({ id, name, matches, departments: departments.map(item => item.department) }));
}
export async function departmentAgents(
  actor: Actor,
  departmentId: string,
  q: z.infer<typeof schema.searchQuery>,
) {
  requireStaff(actor);
  requirePermission(actor, 'conversations.assign');
  if (permissionScope(actor) !== "ALL" && !actor.departmentIds.includes(departmentId))
    throw new AppError(
      403,
      "FORBIDDEN",
      "Bu departmanın personelini görüntüleme yetkiniz yok.",
    );
  const where: Prisma.UserWhereInput = {
    OR: [{ role: { in: ["AGENT", "SUPERVISOR"] } }, { accessRoleId: { not: null } }],
    isActive: true,
    deletedAt: null,
    departments: { some: { departmentId } },
    ...(q.search ? { name: { contains: q.search } } : {}),
  };
  const [data, total] = await db.$transaction([
    db.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        _count: {
          select: {
            assignedConversations: {
              where: { deletedAt: null, status: { notIn: ["RESOLVED", "CLOSED"] } },
            },
          },
        },
      },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...paging(q),
    }),
    db.user.count({ where }),
  ]);
  return {
    data: data.map(({ _count, ...agent }) => ({ ...agent, openConversationCount: _count.assignedConversations })),
    pagination: pagination({ page: q.page, limit: q.limit }, total),
  };
}
export async function writeTag(
  actor: Actor,
  input: z.infer<typeof schema.updateTagSchema>,
  id?: string,
) {
  requirePermission(actor, id ? "tags.update" : "tags.create");
  return db.$transaction(async (tx) => {
    if (id && !(await tx.tag.findUnique({ where: { id } }))) throw notFound();
    const data = id
      ? await tx.tag.update({ where: { id }, data: input })
      : await tx.tag.create({
          data: { name: input.name!, code: input.code!, color: input.color },
        });
    await audit(tx, actor, id ? "tag.updated" : "tag.created", "Tag", data.id, {
      name: data.name,
      code: data.code,
    });
    return data;
  });
}
export async function deleteTag(actor: Actor, id: string) {
  requirePermission(actor, "tags.delete");
  return db.$transaction(async (tx) => {
    const tag = await tx.tag.findUnique({ where: { id } });
    if (!tag) throw notFound();
    await tx.tag.delete({ where: { id } });
    await audit(tx, actor, "tag.deleted", "Tag", id, {
      name: tag.name,
      code: tag.code,
    });
  });
}
export async function statusOptions(q: z.infer<typeof schema.searchQuery>) {
  const where = q.search
    ? {
        OR: [
          { name: { contains: q.search } },
          { code: { contains: q.search } },
        ],
      }
    : {};
  const [data, total] = await db.$transaction([
    db.statusOption.findMany({ where, orderBy: { name: "asc" }, ...paging(q) }),
    db.statusOption.count({ where }),
  ]);
  return {
    data,
    pagination: pagination({ page: q.page, limit: q.limit }, total),
  };
}
export async function priorityOptions(q: z.infer<typeof schema.searchQuery>) {
  const where = q.search
    ? {
        OR: [
          { name: { contains: q.search } },
          { code: { contains: q.search } },
        ],
      }
    : {};
  const [data, total] = await db.$transaction([
    db.priorityOption.findMany({
      where,
      orderBy: { name: "asc" },
      ...paging(q),
    }),
    db.priorityOption.count({ where }),
  ]);
  return {
    data,
    pagination: pagination({ page: q.page, limit: q.limit }, total),
  };
}
export async function writeStatusOption(
  actor: Actor,
  input: z.infer<typeof schema.updateStatusOptionSchema>,
  id?: string,
) {
  requirePermission(actor, id ? "tags.update" : "tags.create");
  return db.$transaction(async (tx) => {
    if (id && !(await tx.statusOption.findUnique({ where: { id } })))
      throw notFound();
    const data = id
      ? await tx.statusOption.update({ where: { id }, data: input })
      : await tx.statusOption.create({
          data: {
            code: input.code!,
            name: input.name!,
            color: input.color,
            isActive: input.isActive ?? true,
          },
        });
    await audit(
      tx,
      actor,
      id ? "status.updated" : "status.created",
      "StatusOption",
      data.id,
      { name: data.name, code: data.code },
    );
    return data;
  });
}
export async function writePriorityOption(
  actor: Actor,
  input: z.infer<typeof schema.updatePriorityOptionSchema>,
  id?: string,
) {
  requirePermission(actor, id ? "tags.update" : "tags.create");
  return db.$transaction(async (tx) => {
    if (id && !(await tx.priorityOption.findUnique({ where: { id } })))
      throw notFound();
    const data = id
      ? await tx.priorityOption.update({ where: { id }, data: input })
      : await tx.priorityOption.create({
          data: {
            code: input.code!,
            name: input.name!,
            color: input.color,
            isActive: input.isActive ?? true,
          },
        });
    await audit(
      tx,
      actor,
      id ? "priority.updated" : "priority.created",
      "PriorityOption",
      data.id,
      { name: data.name, code: data.code },
    );
    return data;
  });
}
export async function deleteStatusOption(actor: Actor, id: string) {
  requirePermission(actor, "tags.delete");
  return db.$transaction(async (tx) => {
    const option = await tx.statusOption.findUnique({ where: { id } });
    if (!option) throw notFound();
    if (await tx.conversation.count({ where: { status: option.code } }))
      throw new AppError(
        409,
        "OPTION_IN_USE",
        "Bu durum görüşmelerde kullanılıyor; önce görüşmeleri başka bir duruma taşıyın.",
      );
    await tx.statusOption.delete({ where: { id } });
    await audit(tx, actor, "status.deleted", "StatusOption", id, {
      name: option.name,
      code: option.code,
    });
  });
}
export async function deletePriorityOption(actor: Actor, id: string) {
  requirePermission(actor, "tags.delete");
  return db.$transaction(async (tx) => {
    const option = await tx.priorityOption.findUnique({ where: { id } });
    if (!option) throw notFound();
    if (await tx.conversation.count({ where: { priority: option.code } }))
      throw new AppError(
        409,
        "OPTION_IN_USE",
        "Bu öncelik görüşmelerde kullanılıyor; önce görüşmeleri başka bir önceliğe taşıyın.",
      );
    await tx.priorityOption.delete({ where: { id } });
    await audit(tx, actor, "priority.deleted", "PriorityOption", id, {
      name: option.name,
      code: option.code,
    });
  });
}
export async function websites(q: z.infer<typeof schema.searchQuery>) {
  const where: Prisma.WebsiteWhereInput = q.search
    ? {
        OR: [{ name: { contains: q.search } }, { url: { contains: q.search } }],
      }
    : {};
  const [rows, total] = await db.$transaction([
    db.website.findMany({
      where,
      include: { _count: { select: { guideFiles: true } } },
      orderBy: [{ name: "asc" }, { id: "asc" }],
      ...paging(q),
    }),
    db.website.count({ where }),
  ]);
  const data = rows.map(({ _count, ...website }) => ({
    ...website,
    guideFileCount: _count.guideFiles,
  }));
  return {
    data,
    pagination: pagination({ page: q.page, limit: q.limit }, total),
  };
}
export async function writeWebsite(
  actor: Actor,
  input: z.infer<typeof schema.updateWebsiteSchema>,
  id?: string,
) {
  requirePermission(actor, id ? "websites.update" : "websites.create");
  return db.$transaction(async (tx) => {
    if (id && !(await tx.website.findUnique({ where: { id } })))
      throw notFound();
    const data = id
      ? await tx.website.update({ where: { id }, data: input })
      : await tx.website.create({
          data: {
            name: input.name!,
            url: input.url!,
            isActive: input.isActive ?? true,
          },
        });
    await audit(
      tx,
      actor,
      id ? "website.updated" : "website.created",
      "Website",
      data.id,
      { name: data.name },
    );
    return data;
  });
}
export async function deleteWebsite(actor: Actor, id: string) {
  requirePermission(actor, "websites.delete");
  const storageKeys = await db.$transaction(async (tx) => {
    const website = await tx.website.findUnique({
      where: { id },
      include: { guideFiles: { select: { storageKey: true } } },
    });
    if (!website) throw notFound();
    await tx.website.delete({ where: { id } });
    await audit(tx, actor, "website.deleted", "Website", id, {
      name: website.name,
      guideFileCount: website.guideFiles.length,
      guideStorageKeys: website.guideFiles.map((file) => file.storageKey),
    });
    return website.guideFiles.map((file) => file.storageKey);
  });
  const cleanup = await Promise.allSettled(
    storageKeys.map((storageKey) => unlink(path.join(uploadRoot, storageKey))),
  );
  cleanup.forEach((result, index) => {
    if (result.status === "rejected")
      console.error("Project guide file cleanup failed", {
        websiteId: id,
        storageKey: storageKeys[index],
        error:
          result.reason instanceof Error
            ? result.reason.message
            : String(result.reason),
      });
  });
}
export async function projectGuideFiles(actor: Actor, websiteId: string) {
  requireStaff(actor);
  if (
    !(await db.website.findUnique({
      where: { id: websiteId },
      select: { id: true },
    }))
  )
    throw notFound();
  return db.projectGuideFile.findMany({
    where: { websiteId },
    select: {
      id: true,
      originalName: true,
      mimeType: true,
      size: true,
      createdAt: true,
    },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
}
export async function addProjectGuideFiles(
  actor: Actor,
  websiteId: string,
  files: StoredUpload[],
) {
  requirePermission(actor, "guide.create");
  if (!files.length)
    throw new AppError(
      400,
      "FILE_REQUIRED",
      "En az bir PDF veya görsel seçin.",
    );
  if (
    files.some(
      (file) =>
        file.mimeType !== "application/pdf" &&
        !file.mimeType.startsWith("image/"),
    )
  ) {
    throw new AppError(
      400,
      "INVALID_GUIDE_FILE",
      "Proje rehberine yalnızca PDF veya görsel yüklenebilir.",
    );
  }
  return db.$transaction(async (tx) => {
    const website = await tx.website.findUnique({
      where: { id: websiteId },
      select: { id: true, name: true },
    });
    if (!website) throw notFound();
    await tx.projectGuideFile.createMany({
      data: files.map((file) => ({ ...file, websiteId, uploaderId: actor.id })),
    });
    await audit(
      tx,
      actor,
      "project_guide.files_uploaded",
      "Website",
      websiteId,
      {
        websiteName: website.name,
        files: files.map((file) => file.originalName),
      },
    );
    return tx.projectGuideFile.findMany({
      where: { websiteId },
      select: {
        id: true,
        originalName: true,
        mimeType: true,
        size: true,
        createdAt: true,
      },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
  });
}
export async function projectGuideFile(
  actor: Actor,
  websiteId: string,
  fileId: string,
) {
  requireStaff(actor);
  const file = await db.projectGuideFile.findFirst({
    where: { id: fileId, websiteId },
  });
  if (!file) throw notFound();
  return file;
}
export async function deleteProjectGuideFile(
  actor: Actor,
  websiteId: string,
  fileId: string,
) {
  requirePermission(actor, "guide.delete");
  const file = await db.$transaction(async (tx) => {
    const current = await tx.projectGuideFile.findFirst({
      where: { id: fileId, websiteId },
      include: { website: { select: { name: true } } },
    });
    if (!current) throw notFound();
    await tx.projectGuideFile.delete({ where: { id: current.id } });
    await audit(tx, actor, "project_guide.file_deleted", "Website", websiteId, {
      fileId: current.id,
      originalName: current.originalName,
      storageKey: current.storageKey,
      websiteName: current.website.name,
    });
    return current;
  });
  await unlink(path.join(uploadRoot, file.storageKey)).catch((error) =>
    console.error("Project guide file cleanup failed", {
      websiteId,
      fileId,
      storageKey: file.storageKey,
      error: error instanceof Error ? error.message : String(error),
    }),
  );
}
export async function savedReplies(
  actor: Actor,
  q: z.infer<typeof schema.searchQuery>,
) {
  requireStaff(actor);
  const where: Prisma.SavedReplyWhereInput = q.search
    ? {
        OR: [
          { title: { contains: q.search } },
          { body: { contains: q.search } },
        ],
      }
    : {};
  const [data, total] = await db.$transaction([
    db.savedReply.findMany({
      where,
      include: { author: { select: { id: true, name: true } } },
      orderBy: [{ title: "asc" }, { id: "asc" }],
      ...paging(q),
    }),
    db.savedReply.count({ where }),
  ]);
  return {
    data,
    pagination: pagination({ page: q.page, limit: q.limit }, total),
  };
}
export async function announcementTemplates(
  actor: Actor,
  q: z.infer<typeof schema.searchQuery>,
) {
  requireStaff(actor);
  const where: Prisma.AnnouncementTemplateWhereInput = q.search
    ? {
        OR: [
          { label: { contains: q.search } },
          { title: { contains: q.search } },
          { body: { contains: q.search } },
        ],
      }
    : {};
  const [data, total] = await db.$transaction([
    db.announcementTemplate.findMany({
      where,
      orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }, { id: "asc" }],
      ...paging(q),
    }),
    db.announcementTemplate.count({ where }),
  ]);
  return { data, pagination: pagination(q, total) };
}
export async function writeAnnouncementTemplate(
  actor: Actor,
  input: z.infer<typeof schema.announcementTemplateSchema>,
  id?: string,
) {
  requireAdmin(actor);
  return db.$transaction(async (tx) => {
    if (id && !(await tx.announcementTemplate.findUnique({ where: { id } })))
      throw notFound();
    const data = id
      ? await tx.announcementTemplate.update({ where: { id }, data: input })
      : await tx.announcementTemplate.create({
          data: {
            ...input,
            sortOrder:
              ((
                await tx.announcementTemplate.aggregate({
                  _max: { sortOrder: true },
                })
              )._max.sortOrder ?? -1) + 1,
          },
        });
    await audit(
      tx,
      actor,
      id ? "announcement_template.updated" : "announcement_template.created",
      "AnnouncementTemplate",
      data.id,
    );
    return data;
  });
}
export async function deleteAnnouncementTemplate(actor: Actor, id: string) {
  requireAdmin(actor);
  return db.$transaction(async (tx) => {
    const result = await tx.announcementTemplate.deleteMany({ where: { id } });
    if (!result.count) throw notFound();
    await audit(
      tx,
      actor,
      "announcement_template.deleted",
      "AnnouncementTemplate",
      id,
    );
  });
}
export async function writeSavedReply(
  actor: Actor,
  input: z.infer<typeof schema.updateSavedReplySchema>,
  id?: string,
) {
  requireStaff(actor);
  return db.$transaction(async (tx) => {
    if (
      id &&
      !(await tx.savedReply.findFirst({
        where: {
          id,
          ...(actor.role !== "ADMIN" ? { authorId: actor.id } : {}),
        },
      }))
    )
      throw notFound();
    const data = id
      ? await tx.savedReply.update({ where: { id }, data: input })
      : await tx.savedReply.create({
          data: { title: input.title!, body: input.body!, authorId: actor.id },
        });
    await audit(
      tx,
      actor,
      id ? "saved_reply.updated" : "saved_reply.created",
      "SavedReply",
      data.id,
    );
    return data;
  });
}
export async function deleteSavedReply(actor: Actor, id: string) {
  requireStaff(actor);
  return db.$transaction(async (tx) => {
    const result = await tx.savedReply.deleteMany({
      where: { id, ...(actor.role !== "ADMIN" ? { authorId: actor.id } : {}) },
    });
    if (!result.count) throw notFound();
    await audit(tx, actor, "saved_reply.deleted", "SavedReply", id);
  });
}
export async function notifications(
  actor: Actor,
  q: z.infer<typeof schema.notificationQuery>,
) {
  const visible: Prisma.NotificationWhereInput = {
    userId: actor.id,
    OR: [{ conversationId: null }, { conversation: { is: visibility(actor) } }],
  };
  const where: Prisma.NotificationWhereInput = {
    AND: [
      visible,
      ...(q.search
        ? [
            {
              OR: [
                { title: { contains: q.search } },
                { message: { contains: q.search } },
              ],
            },
          ]
        : []),
    ],
    isRead: q.isRead,
  };
  const [data, total, unreadCount] = await db.$transaction([
    db.notification.findMany({
      where,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...paging(q),
    }),
    db.notification.count({ where }),
    db.notification.count({ where: { ...visible, isRead: false } }),
  ]);
  return {
    data,
    unreadCount,
    pagination: pagination({ page: q.page, limit: q.limit }, total),
  };
}
export async function readNotifications(actor: Actor, id?: string) {
  const result = await db.notification.updateMany({
    where: { userId: actor.id, ...(id ? { id } : { isRead: false }) },
    data: { isRead: true },
  });
  if (id && !result.count) throw notFound();
  return { updated: result.count };
}
export async function deleteNotifications(
  actor: Actor,
  period: "day" | "week" | "month" | "all",
) {
  const since =
    period === "day"
      ? new Date(Date.now() - 86_400_000)
      : period === "week"
        ? new Date(Date.now() - 7 * 86_400_000)
        : period === "month"
          ? new Date(Date.now() - 30 * 86_400_000)
          : undefined;
  const result = await db.notification.deleteMany({
    where: {
      userId: actor.id,
      ...(since ? { createdAt: { gte: since } } : {}),
    },
  });
  return { deleted: result.count };
}
export async function deleteVisibleNotifications(actor: Actor, ids: string[]) {
  const result = await db.notification.deleteMany({
    where: { userId: actor.id, id: { in: ids } },
  });
  return { deleted: result.count };
}
export async function activityLogs(
  actor: Actor,
  q: z.infer<typeof schema.activityQuery>,
) {
  requirePermission(actor, "logs.view");
  const ticketPrefix = q.search?.match(/^(?:#\s*)?TK-?(\d{0,10})$/i);
  const ticketNumberPrefix = ticketPrefix?.[1] ?? "";
  const searchNumber = ticketPrefix
    ? ticketNumberPrefix.length === 0
      ? { gte: 1 }
      : ticketNumberPrefix.length < 5 && ticketNumberPrefix.startsWith("0")
        ? {
            gte: Number(ticketNumberPrefix.padEnd(5, "0")),
            lte: Number(ticketNumberPrefix.padEnd(5, "9")),
          }
        : Number(ticketNumberPrefix)
    : undefined;
  const resolvedSearchNumber = searchNumber ?? (q.search && /^\d{1,10}$/.test(q.search)
      ? Number(q.search)
      : undefined);
  const matchingConversationIds = q.search
    ? (await db.conversation.findMany({
        where: {
          OR: [
            { subject: { contains: q.search } },
            ...(resolvedSearchNumber !== undefined ? [{ number: resolvedSearchNumber }] : []),
          ],
        },
        select: { id: true },
      })).map((conversation) => conversation.id)
    : [];
  const searchableActionLabels: Record<string, string> = {
    "website.created": "Proje oluşturuldu",
    "website.updated": "Proje güncellendi",
    "website.deleted": "Proje silindi",
    "project_guide.files_uploaded": "Proje rehberine dosya eklendi",
    "project_guide.file_deleted": "Proje rehberi dosyası silindi",
    "integrations.updated": "Entegrasyon ayarları güncellendi",
    "conversation.created": "Talep oluşturuldu",
    "conversation.updated": "Talep bilgileri güncellendi",
    "conversation.email_received": "E-posta alındı",
    "conversation.email_sent": "E-posta gönderildi",
    "conversation.email_failed": "E-posta gönderilemedi",
    "conversation.replied": "Talebe yanıt verildi",
    "conversation.deleted": "Talep silindi",
    "customer.created": "Müşteri oluşturuldu",
    "customer.updated": "Müşteri güncellendi",
    "customer.deleted": "Müşteri silindi",
    "user.created": "Kullanıcı oluşturuldu",
    "user.updated": "Kullanıcı güncellendi",
    "user.deleted": "Kullanıcı silindi",
    "department.created": "Departman oluşturuldu",
    "department.updated": "Departman güncellendi",
    "department.deleted": "Departman silindi",
    "tag.created": "Etiket oluşturuldu",
    "tag.updated": "Etiket güncellendi",
    "tag.deleted": "Etiket silindi",
  };
  const normalizedSearch = q.search?.toLocaleLowerCase("tr-TR");
  const matchingActions = normalizedSearch
    ? Object.entries(searchableActionLabels)
        .filter(([, label]) => label.toLocaleLowerCase("tr-TR").includes(normalizedSearch))
        .map(([action]) => action)
    : [];
  const searchableMetadataFields = [
    "name", "title", "subject", "code", "phone", "email", "company",
    "originalName", "recipient", "reason", "senderEmail", "channel",
  ];
  const where: Prisma.ActivityLogWhereInput = {
    userId: q.userId,
    ...(q.action ? { action: { contains: q.action } } : {}),
    ...(q.search
      ? {
          OR: [
            { action: { contains: q.search } },
            ...(matchingActions.length ? [{ action: { in: matchingActions } }] : []),
            { user: { name: { contains: q.search } } },
            { user: { email: { contains: q.search } } },
            ...searchableMetadataFields.map((field) => ({ metadata: { path: `$.${field}`, string_contains: q.search! } })),
            ...(matchingConversationIds.length ? [{ entityId: { in: matchingConversationIds } }] : []),
          ],
        }
      : {}),
  };
  const [rawData, total] = await db.$transaction([
    db.activityLog.findMany({
      where,
      include: { user: { select: { id: true, name: true, email: true } } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      ...paging(q),
    }),
    db.activityLog.count({ where }),
  ]);
  const customerIds = [
    ...new Set(
      rawData
        .filter((log) => log.entityType === "User" && log.entityId)
        .map((log) => log.entityId!),
    ),
  ];
  const conversationIds = [
    ...new Set(
      rawData
        .filter((log) => (log.entityType === "Conversation" || log.action.startsWith("conversation.")) && log.entityId)
        .map((log) => log.entityId!),
    ),
  ];
  const [customers, conversations] = await Promise.all([
    customerIds.length
      ? db.user.findMany({
          where: { id: { in: customerIds } },
          select: {
            id: true,
            name: true,
            phone: true,
            email: true,
            company: true,
          },
        })
      : [],
    conversationIds.length
      ? db.conversation.findMany({
          where: { id: { in: conversationIds } },
          select: { id: true, subject: true, number: true },
        })
      : [],
  ]);
  const customerNames = new Map(customers.map((item) => [item.id, item]));
  const conversationInfo = new Map(
    conversations.map((item) => [item.id, item]),
  );
  const data = rawData.map((log) => {
    const oldMetadata =
      log.metadata &&
      typeof log.metadata === "object" &&
      !Array.isArray(log.metadata)
        ? (log.metadata as Record<string, unknown>)
        : {};
    const customer = log.entityId ? customerNames.get(log.entityId) : undefined;
    const conversation = log.entityId
      ? conversationInfo.get(log.entityId)
      : undefined;
    return {
      ...log,
      metadata: {
        ...oldMetadata,
        ...(customer
          ? {
              customerName: customer.name,
              ...(log.action === "customer.updated" ||
              log.action === "customer.created"
                ? {
                    name: customer.name,
                    phone: customer.phone,
                    email: customer.email,
                    company: customer.company,
                  }
                : {}),
            }
          : {}),
        ...(conversation
          ? { subject: conversation.subject, number: conversation.number }
          : {}),
      },
    };
  });
  return {
    data,
    pagination: pagination({ page: q.page, limit: q.limit }, total),
  };
}
export async function deleteActivityLogs(
  actor: Actor,
  period: "day" | "week" | "month" | "all",
) {
  requirePermission(actor, "logs.delete");
  const days =
    period === "day"
      ? 1
      : period === "week"
        ? 7
        : period === "month"
          ? 30
          : null;
  const result = await db.activityLog.deleteMany({
    where: days
      ? {
          createdAt: { gte: new Date(Date.now() - days * 24 * 60 * 60 * 1000) },
        }
      : {},
  });
  return { deleted: result.count };
}
export async function integrationSettings(actor: Actor) {
  requirePermission(actor, "integrations.view");
  return db.integrationSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}
export async function responseTimeSettings(actor: Actor) {
  requirePermission(actor, "response.view");
  return db.responseTimeSettings.upsert({
    where: { id: "default" },
    create: { id: "default" },
    update: {},
  });
}
export async function updateResponseTimeSettings(
  actor: Actor,
  input: z.infer<typeof schema.responseTimeSettingsSchema>,
) {
  requirePermission(actor, "response.update");
  return db.responseTimeSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...input },
    update: input,
  });
}
export async function notificationSettings(actor: Actor) {
  requirePermission(actor, "integrations.view");
  return db.notificationSettings.upsert({
    where: { id: "default" },
    create: {
      id: "default",
      ticketCreatedSubject: "Talebiniz oluşturuldu (#{number})",
      ticketCreatedBody:
        'Merhaba {name},\n\n"{subject}" başlıklı talebiniz oluşturuldu. Destek ekibimiz en kısa sürede dönüş yapacaktır.',
      ticketReplySubject: "Talebinize yeni yanıt geldi (#{number})",
      ticketReplyBody:
        "Merhaba {name},\n\n{subject} başlıklı talebinize destek ekibimizin yanıtı:\n\n{reply}",
    },
    update: {},
  });
}
export async function updateNotificationSettings(
  actor: Actor,
  input: z.infer<typeof schema.notificationSettingsSchema>,
) {
  requirePermission(actor, "integrations.update");
  return db.notificationSettings.upsert({
    where: { id: "default" },
    create: { id: "default", ...input },
    update: input,
  });
}
export async function updateIntegrationSettings(
  actor: Actor,
  input: z.infer<typeof schema.integrationSettingsSchema>,
) {
  requirePermission(actor, "integrations.update");
  const { emailNotifications, ...integrationInput } = input;
  return db.$transaction(async (tx) => {
    const previousSettings = await tx.integrationSettings.findUnique({ where: { id: "default" } });
    const previousNotifications = emailNotifications
      ? await tx.notificationSettings.findUnique({ where: { id: "default" } })
      : null;
    for (const departmentId of [
      input.imapDepartmentId,
      input.smsDepartmentId,
      input.whatsappDepartmentId,
    ]) {
      if (
        departmentId &&
        !(await tx.department.findFirst({
          where: { id: departmentId, isActive: true, deletedAt: null },
        }))
      )
        throw new AppError(
          400,
          "INVALID_DEPARTMENT",
          "Varsayılan departman aktif olmalıdır.",
        );
    }
    const data = await tx.integrationSettings.upsert({
      where: { id: "default" },
      create: { id: "default", ...integrationInput },
      update: integrationInput,
    });
    if (emailNotifications) {
      await tx.notificationSettings.upsert({
        where: { id: "default" },
        create: { id: "default", ...emailNotifications },
        update: emailNotifications,
      });
    }
    const settingLabels: Record<string, string> = {
      responseFastMinutes: "Hızlı yanıt süresi", responseNormalMinutes: "Normal yanıt süresi",
      responseFastColor: "Hızlı yanıt rengi", responseNormalColor: "Normal yanıt rengi", responseLateColor: "Gecikmiş yanıt rengi",
      responseFastFromMinutes: "Hızlı yanıt aralığı başlangıcı", responseFastToMinutes: "Hızlı yanıt aralığı bitişi",
      responseNormalFromMinutes: "Normal yanıt aralığı başlangıcı", responseNormalToMinutes: "Normal yanıt aralığı bitişi",
      responseLateFromMinutes: "Gecikmiş yanıt aralığı başlangıcı", responseLateToMinutes: "Gecikmiş yanıt aralığı bitişi",
      smtpEnabled: "SMTP etkinliği", smtpHost: "SMTP sunucusu", smtpPort: "SMTP portu", smtpSecure: "SMTP güvenli bağlantısı",
      smtpUser: "SMTP kullanıcı adı", smtpPassword: "SMTP parolası", smtpFromAddress: "Gönderen e-posta adresi", smtpFromName: "Gönderen adı",
      imapEnabled: "IMAP etkinliği", imapConnectionName: "IMAP bağlantı adı", imapHost: "IMAP sunucusu", imapPort: "IMAP portu",
      imapSecure: "IMAP güvenli bağlantısı", imapAuthType: "IMAP kimlik doğrulama türü", imapUser: "IMAP kullanıcı adı",
      imapPassword: "IMAP parolası", imapMailbox: "IMAP posta kutusu", imapPollIntervalSeconds: "E-posta kontrol aralığı",
      imapCreateTickets: "E-postadan talep oluşturma", imapCreateReplies: "E-postayı yanıta ekleme", imapDepartmentId: "E-posta departmanı",
      smsEnabled: "SMS etkinliği", smsApiUser: "SMS API kullanıcı adı", smsApiPassword: "SMS API parolası", smsSender: "SMS gönderici başlığı",
      smsVirtualNumber: "SMS sanal numarası", smsWebhookSecret: "SMS webhook anahtarı", smsDepartmentId: "SMS departmanı",
      whatsappEnabled: "WhatsApp etkinliği", whatsappAppId: "WhatsApp uygulama kimliği", whatsappAppSecret: "WhatsApp uygulama anahtarı",
      whatsappPhoneNumberId: "WhatsApp telefon numarası kimliği", whatsappAccessToken: "WhatsApp erişim anahtarı",
      whatsappVerifyToken: "WhatsApp doğrulama anahtarı", whatsappDepartmentId: "WhatsApp departmanı",
    };
    const changedDetails: string[] = [];
    for (const [key, value] of Object.entries(integrationInput)) {
      const oldValue = previousSettings?.[key as keyof typeof previousSettings];
      if (oldValue === value) continue;
      const label = settingLabels[key] ?? key;
      if (/password|secret|token/i.test(key)) changedDetails.push(`${label} güncellendi`);
      else if (key.endsWith("DepartmentId")) changedDetails.push(`${label} değiştirildi`);
      else if (typeof value === "boolean") changedDetails.push(`${label}: ${value ? "Etkin" : "Devre dışı"}`);
      else changedDetails.push(`${label}: ${value === "" || value === null ? "Boş" : String(value)}`);
    }
    if (emailNotifications) {
      const notificationLabels: Record<string, string> = {
        ticketCreatedSubject: "Yeni talep e-posta konusu", ticketCreatedBody: "Yeni talep e-posta içeriği",
        ticketReplySubject: "Yanıt e-posta konusu", ticketReplyBody: "Yanıt e-posta içeriği",
      };
      for (const [key, value] of Object.entries(emailNotifications)) {
        if (previousNotifications?.[key as keyof typeof previousNotifications] !== value)
          changedDetails.push(`${notificationLabels[key]} güncellendi`);
      }
    }
    await audit(
      tx,
      actor,
      "integrations.updated",
      "IntegrationSettings",
      "default",
      {
        details: changedDetails.length ? changedDetails : ["Ayarlar kaydedildi; değerlerde değişiklik yok."],
      },
    );
    return data;
  });
}
export async function testIntegration(
  actor: Actor,
  channel: "SMTP" | "IMAP" | "SMS" | "WHATSAPP",
) {
  requirePermission(actor, "integrations.test");
  const settings = await integrationSettings(actor);
  let success = false;
  let message = "";
  try {
    if (channel === "SMTP") {
      if (!settings.smtpHost || !settings.smtpFromAddress)
        throw new Error("SMTP sunucusu ve gönderen adresi zorunludur.");
      if (settings.smtpPort === 993)
        throw new Error(
          "993 IMAP portudur. SMTP için TLS ile 587 veya SSL ile 465 kullanın.",
        );
      const useTls = settings.smtpSecure;
      await nodemailer
        .createTransport({
          host: settings.smtpHost,
          port: settings.smtpPort,
          secure: useTls && settings.smtpPort === 465,
          requireTLS: useTls && settings.smtpPort !== 465,
          ...(settings.smtpUser
            ? { auth: { user: settings.smtpUser, pass: settings.smtpPassword } }
            : {}),
        })
        .verify();
    } else if (channel === "IMAP") {
      if (!settings.imapHost || !settings.imapUser || !settings.imapPassword)
        throw new Error("IMAP bağlantı bilgileri zorunludur.");
      if (settings.imapSecure && settings.imapPort !== 993)
        throw new Error(
          "IMAP SSL/TLS için 993 portunu kullanın; 587 SMTP portudur.",
        );
      const client = new ImapFlow({
        host: settings.imapHost,
        port: settings.imapPort,
        secure: settings.imapSecure,
        auth:
          settings.imapAuthType === "OAUTH2"
            ? { user: settings.imapUser, accessToken: settings.imapPassword }
            : { user: settings.imapUser, pass: settings.imapPassword },
        logger: false,
      });
      await client.connect();
      await client.logout();
    } else if (channel === "SMS") {
      if (
        !settings.smsApiUser ||
        !settings.smsApiPassword ||
        !settings.smsSender
      )
        throw new Error(
          "Netgsm API bilgileri ve gönderici başlığı zorunludur.",
        );
      const headers = await testNetgsmConnection(settings);
      message = `Netgsm hesabı doğrulandı. Kullanılabilir gönderici başlığı: ${headers.join(", ")}`;
    } else {
      if (
        !settings.whatsappAppId ||
        !settings.whatsappAppSecret ||
        !settings.whatsappPhoneNumberId ||
        !settings.whatsappAccessToken ||
        !settings.whatsappVerifyToken
      )
        throw new Error("Meta WhatsApp bağlantı bilgileri eksik.");
      const phone = await testWhatsappConnection(settings);
      message = `Meta WhatsApp hesabı doğrulandı${phone.display_phone_number ? `: ${phone.display_phone_number}` : ""}${phone.verified_name ? ` · ${phone.verified_name}` : ""}`;
    }
    success = true;
    message ||= "Bağlantı başarıyla doğrulandı.";
  } catch (error) {
    const detail =
      error instanceof Error ? error.message : "Bağlantı testi başarısız oldu.";
    message = /EACCES/.test(detail)
      ? "SMTP ağı bu sunucuda engelli. Güvenlik duvarında smtp.gmail.com için TCP 587 veya 465 çıkışına izin verin; uygulama parolası bu hatayı çözmez."
      : detail;
  }
  const result = { channel, success, message, testedAt: new Date() };
  await db.integrationSettings.update({
    where: { id: "default" },
    data: {
      lastTestChannel: channel,
      lastTestSuccess: success,
      lastTestMessage: message.slice(0, 5000),
      lastTestedAt: result.testedAt,
    },
  });
  return result;
}
export async function profile(actor: Actor) {
  return db.user.findUniqueOrThrow({ where: { id: actor.id }, select: person });
}
export async function user(actor: Actor, id: string) {
  requireUserPermission(actor, 'view');
  const data = await db.user.findFirst({
    where: { AND: [{ id, deletedAt: null }, staffDirectoryScope(actor)] },
    select: person,
  });
  if (!data) throw notFound();
  if (permissionScope(actor) === 'ALL') return data;
  return { ...data, departments: data.departments.filter((department) => actor.departmentIds.includes(department.departmentId)) };
}
export async function updateProfile(
  actor: Actor,
  input: z.infer<typeof schema.profileSchema>,
) {
  const current = await db.user.findUniqueOrThrow({ where: { id: actor.id } });
  const credentialChange = Boolean(
    input.password || (input.email && input.email !== current.email),
  );
  if (
    credentialChange &&
    (!input.currentPassword ||
      !(await bcrypt.compare(input.currentPassword, current.passwordHash)))
  )
    throw new AppError(
      400,
      "CURRENT_PASSWORD_REQUIRED",
      "E-posta veya şifre değişikliği için mevcut şifrenizi doğru girin.",
    );
  const passwordHash = input.password
    ? await bcrypt.hash(input.password, 12)
    : undefined;
  return serial(async (tx) => {
    const latest = await tx.user.findUniqueOrThrow({ where: { id: actor.id } });
    if (
      latest.passwordHash !== current.passwordHash ||
      latest.email !== current.email
    )
      throw new AppError(
        409,
        "PROFILE_CHANGED",
        "Profiliniz değişti. Yenileyip tekrar deneyin.",
      );
    const data = await tx.user.update({
      where: { id: actor.id },
      data: {
        name: input.name,
        email: input.email,
        phone: input.phone,
        ...(input.email !== undefined ? { loginEmail: input.email } : {}),
        passwordHash,
      },
      select: person,
    });
    if (credentialChange)
      await tx.session.updateMany({
        where: {
          userId: actor.id,
          id: { not: actor.sessionId },
          revokedAt: null,
        },
        data: { revokedAt: new Date() },
      });
    await audit(tx, actor, "profile.updated", "User", actor.id, {
      fields: Object.keys(input).filter(
        (k) => !k.toLowerCase().includes("password"),
      ),
    });
    return data;
  });
}
export async function reports(actor: Actor, q: Page & { agentId?: string; departmentId?: string; days?: number }) {
  if (!can(actor, "reports.view"))
    throw new AppError(403, "FORBIDDEN", "Raporlara erişim yetkiniz yok.");
  const scope: Prisma.ConversationWhereInput = { AND: [visibility(actor),
    ...(q.agentId ? [{ assignedAgentId: q.agentId }] : []),
    ...(q.departmentId ? [{ departmentId: q.departmentId }] : []),
  ] };
  const to = new Date();
  const from = new Date(
    Date.UTC(to.getUTCFullYear(), to.getUTCMonth(), to.getUTCDate() - ((q.days ?? 30) - 1)),
  );
  const agentWhere: Prisma.UserWhereInput = {
    OR: [{ role: { in: ["AGENT", "SUPERVISOR"] } }, { accessRoleId: { not: null } }],
    deletedAt: null,
    ...(permissionScope(actor) === "DEPARTMENT"
      ? { departments: { some: { departmentId: { in: actor.departmentIds } } } }
      : permissionScope(actor) === "OWN" ? { id: actor.id } : {}),
  };
  const { statuses, priorities, departmentCounts, agents, agentTotal } =
    await db.$transaction(async (tx) => {
      const statuses = await tx.conversation.groupBy({
        by: ["status"],
        where: scope,
        _count: { _all: true },
      });
      const priorities = await tx.conversation.groupBy({
        by: ["priority"],
        where: scope,
        _count: { _all: true },
      });
      const departmentCounts = await tx.conversation.groupBy({
        by: ["departmentId"],
        where: scope,
        _count: { _all: true },
      });
      const agents = await tx.user.findMany({
        where: agentWhere,
        select: { id: true, name: true, email: true, departments: { where: actor.role === "SUPERVISOR" ? { departmentId: { in: actor.departmentIds } } : {}, select: { departmentId: true } } },
        orderBy: [{ name: "asc" }, { id: "asc" }],
      });
      const agentTotal = await tx.user.count({ where: agentWhere });
      return { statuses, priorities, departmentCounts, agents, agentTotal };
    });
  const departments = await db.department.findMany({
    where: { OR: [{ deletedAt: null }, { id: { in: departmentCounts.map((d) => d.departmentId) } }], ...(actor.role === "SUPERVISOR" ? { id: { in: actor.departmentIds } } : {}) },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const agentIds = agents.map((a) => a.id);
  const counts = await db.conversation.groupBy({
    by: ["departmentId", "assignedAgentId", "status"],
    where: scope,
    _count: true,
  });
  const daily = Array.from({ length: q.days ?? 30 }, (_, i) => ({
    date: new Date(from.getTime() + i * 86400000).toISOString().slice(0, 10),
    created: 0,
    resolved: 0,
  }));
  let responseSum = 0,
    responseCount = 0,
    resolutionSum = 0,
    resolutionCount = 0;
  const agentResponses = new Map<string, { sum: number; count: number }>();
  // Cursor batches bound memory for large installations; no raw SQL or message-body scans.
  let cursor: string | undefined;
  while (true) {
    const batch = await db.conversation.findMany({
      where: {
        AND: [
          scope,
          {
            OR: [
              { createdAt: { gte: from, lte: to } },
              { resolvedAt: { gte: from, lte: to } },
            ],
          },
        ],
      },
      select: {
        id: true,
        createdAt: true,
        resolvedAt: true,
        firstResponseAt: true,
        assignedAgentId: true,
      },
      orderBy: { id: "asc" },
      take: 500,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    for (const conversation of batch) {
      const createdDay = daily.find(
        (d) => d.date === conversation.createdAt.toISOString().slice(0, 10),
      );
      if (createdDay) createdDay.created++;
      const resolvedDay = conversation.resolvedAt
        ? daily.find(
            (d) =>
              d.date === conversation.resolvedAt!.toISOString().slice(0, 10),
          )
        : undefined;
      if (resolvedDay) resolvedDay.resolved++;
      if (conversation.createdAt < from || conversation.createdAt > to)
        continue;
      if (conversation.firstResponseAt) {
        const minutes = Math.max(
          0,
          (conversation.firstResponseAt.getTime() -
            conversation.createdAt.getTime()) /
            60000,
        );
        responseSum += minutes;
        responseCount++;
        if (
          conversation.assignedAgentId &&
          agentIds.includes(conversation.assignedAgentId)
        ) {
          const prev = agentResponses.get(conversation.assignedAgentId) ?? {
            sum: 0,
            count: 0,
          };
          prev.sum += minutes;
          prev.count++;
          agentResponses.set(conversation.assignedAgentId, prev);
        }
      }
      if (conversation.resolvedAt) {
        resolutionSum += Math.max(
          0,
          (conversation.resolvedAt.getTime() -
            conversation.createdAt.getTime()) /
            60000,
        );
        resolutionCount++;
      }
    }
    if (batch.length < 500) break;
    cursor = batch[batch.length - 1]!.id;
  }
  const staff = agents.map((agent) => {
    const rows = counts.filter((c) => c.assignedAgentId === agent.id);
    const response = agentResponses.get(agent.id);
    return { ...agent, departmentIds: agent.departments.map((d) => d.departmentId),
      assigned: rows.reduce((sum, r) => sum + r._count, 0),
      resolved: rows.filter((r) => r.status === "RESOLVED" || r.status === "CLOSED").reduce((sum, r) => sum + r._count, 0),
      statuses: Object.fromEntries([...new Set(rows.map((r) => r.status))].map((status) => [status, rows.filter((r) => r.status === status).reduce((sum, r) => sum + r._count, 0)])),
      firstResponseMinutes: response ? response.sum / response.count : null,
    };
  });
  return {
    period: { from, to },
    total: statuses.reduce((sum, item) => sum + item._count._all, 0),
    statuses: Object.fromEntries(
      statuses.map((item) => [item.status, item._count._all]),
    ),
    priorities: Object.fromEntries(
      priorities.map((item) => [item.priority, item._count._all]),
    ),
    departments: departments.map((d) => ({
      ...d,
      count:
        departmentCounts.find((c) => c.departmentId === d.id)?._count._all ?? 0,
      statuses: Object.fromEntries([...new Set(counts.filter((r) => r.departmentId === d.id).map((r) => r.status))].map((status) => [status, counts.filter((r) => r.departmentId === d.id && r.status === status).reduce((sum, r) => sum + r._count, 0)])),
      employees: staff.filter((a) => a.departmentIds.includes(d.id) || counts.some((r) => r.departmentId === d.id && r.assignedAgentId === a.id)).map((a) => {
        const rows = counts.filter((r) => r.departmentId === d.id && r.assignedAgentId === a.id);
        return { id: a.id, name: a.name, assigned: rows.reduce((sum, r) => sum + r._count, 0), resolved: rows.filter((r) => r.status === "RESOLVED" || r.status === "CLOSED").reduce((sum, r) => sum + r._count, 0) };
      }),
    })),
    daily,
    firstResponseMinutes: responseCount ? responseSum / responseCount : null,
    resolutionMinutes: resolutionCount ? resolutionSum / resolutionCount : null,
    staff,
    agents: staff.slice((q.page - 1) * q.limit, q.page * q.limit),
    agentsPagination: pagination(q, agentTotal),
  };
}
