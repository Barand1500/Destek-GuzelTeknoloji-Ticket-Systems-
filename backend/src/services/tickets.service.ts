import { db } from "../config/db.js";
import { Prisma } from "../generated/prisma/client.js";
import type { Actor } from "../types/express.js";
import { AppError } from "../utils/errors.js";
import type { z } from "zod";
import type {
  createTicketSchema,
  listSchema,
  messageSchema,
  updateTicketSchema,
} from "../validators/index.js";
const person = { id: true, name: true, email: true, role: true } as const;
const ticketInclude = {
  customer: { select: person },
  assignedAgent: { select: person },
  department: true,
} as const;
const normalizeSearch = (value: string) =>
  value.normalize("NFKC").toLocaleLowerCase("tr-TR");
export function visibility(actor: Actor): Prisma.TicketWhereInput {
  switch (actor.role) {
    case "ADMIN":
      return { deletedAt: null };
    case "CUSTOMER":
      return { deletedAt: null, customerId: actor.id };
    case "AGENT":
      return { deletedAt: null, assignedAgentId: actor.id };
    case "SUPERVISOR":
      return { deletedAt: null, departmentId: { in: actor.departmentIds } };
  }
}
export async function getTicket(actor: Actor, id: string) {
  const ticket = await db.ticket.findFirst({
    where: { AND: [visibility(actor), { id }] },
    include: ticketInclude,
  });
  if (!ticket)
    throw new AppError(
      404,
      "TICKET_NOT_FOUND",
      "Talep bulunamadı veya erişim yetkiniz yok.",
    );
  return ticket;
}
export async function listTickets(actor: Actor, q: z.infer<typeof listSchema>) {
  const filters: Prisma.TicketWhereInput = {
    status: q.status,
    priority: q.priority,
    departmentId: q.departmentId,
    assignedAgentId: q.assignedAgentId,
  };
  const where: Prisma.TicketWhereInput = {
    AND: [
      visibility(actor),
      filters,
      ...(q.view === "mine"
        ? [{ assignedAgentId: actor.id }]
        : q.view === "unassigned"
          ? [{ assignedAgentId: null }]
          : []),
      ...(q.search
        ? [{ searchSubject: { contains: normalizeSearch(q.search) } }]
        : []),
    ],
  };
  const [data, total] = await db.$transaction(
    async (tx) => {
      const data = await tx.ticket.findMany({
        where,
        include: ticketInclude,
        orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
        skip: (q.page - 1) * q.limit,
        take: q.limit,
      });
      const total = await tx.ticket.count({ where });
      return [data, total] as const;
    },
    { isolationLevel: "RepeatableRead" },
  );
  return {
    data,
    pagination: {
      page: q.page,
      limit: q.limit,
      total,
      totalPages: Math.ceil(total / q.limit),
    },
  };
}
export async function createTicket(
  actor: Actor,
  input: z.infer<typeof createTicketSchema>,
) {
  if (actor.role !== "CUSTOMER")
    throw new AppError(
      403,
      "FORBIDDEN",
      "Talep oluşturmak için müşteri hesabı kullanın.",
    );
  if (!(await db.department.findUnique({ where: { id: input.departmentId } })))
    throw new AppError(400, "INVALID_DEPARTMENT", "Departman bulunamadı.");
  return db.$transaction(async (tx) => {
    const ticket = await tx.ticket.create({
      data: {
        subject: input.subject,
        searchSubject: normalizeSearch(input.subject),
        departmentId: input.departmentId,
        priority: input.priority,
        customerId: actor.id,
        messages: { create: { authorId: actor.id, body: input.message } },
      },
      include: ticketInclude,
    });
    await tx.activityLog.create({
      data: { userId: actor.id, action: "ticket.created", entityId: ticket.id },
    });
    return ticket;
  });
}
export async function messages(
  actor: Actor,
  id: string,
  page: number,
  limit: number,
) {
  await getTicket(actor, id);
  const where = {
    ticketId: id,
    ticket: { is: visibility(actor) },
    ...(actor.role === "CUSTOMER" ? { isInternalNote: false } : {}),
  };
  const [data, total] = await db.$transaction(
    async (tx) => {
      const data = await tx.ticketMessage.findMany({
        where,
        include: { author: { select: person } },
        orderBy: [{ createdAt: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      });
      const total = await tx.ticketMessage.count({ where });
      return [data, total] as const;
    },
    { isolationLevel: "RepeatableRead" },
  );
  return {
    data,
    pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
  };
}
export async function addMessage(
  actor: Actor,
  id: string,
  input: z.infer<typeof messageSchema>,
) {
  if (actor.role === "CUSTOMER" && input.isInternalNote)
    throw new AppError(403, "FORBIDDEN", "Dahili not ekleme yetkiniz yok.");
  return db.$transaction(async (tx) => {
    // Authorized update obtains a row lock before writing a message, serializing assignment/status changes.
    const lock = await tx.ticket.updateMany({
      where: { AND: [visibility(actor), { id, status: { not: "CLOSED" } }] },
      data: { updatedAt: new Date() },
    });
    if (lock.count !== 1)
      throw new AppError(
        409,
        "TICKET_UNAVAILABLE",
        "Talep kapalı veya erişilemiyor.",
      );
    const message = await tx.ticketMessage.create({
      data: { ticketId: id, authorId: actor.id, ...input },
      include: { author: { select: person } },
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: input.isInternalNote ? "ticket.note_added" : "ticket.replied",
        entityId: id,
      },
    });
    return message;
  });
}
export async function updateTicket(
  actor: Actor,
  id: string,
  input: z.infer<typeof updateTicketSchema>,
) {
  if (actor.role === "CUSTOMER")
    throw new AppError(403, "FORBIDDEN", "Bu işlem için yetkiniz yok.");
  if (
    input.assignedAgentId !== undefined &&
    !["ADMIN", "SUPERVISOR"].includes(actor.role)
  )
    throw new AppError(
      403,
      "FORBIDDEN",
      "Atama işlemini yönetici veya departman sorumlusu yapabilir.",
    );
  return db.$transaction(async (tx) => {
    const lock = await tx.ticket.updateMany({
      where: { AND: [visibility(actor), { id }] },
      data: { updatedAt: new Date() },
    });
    if (lock.count !== 1)
      throw new AppError(404, "TICKET_NOT_FOUND", "Talep bulunamadı.");
    const ticket = await tx.ticket.findUniqueOrThrow({ where: { id } });
    if (input.assignedAgentId) {
      const agent = await tx.user.findFirst({
        where: {
          id: input.assignedAgentId,
          role: "AGENT",
          departments: { some: { departmentId: ticket.departmentId } },
        },
      });
      if (!agent)
        throw new AppError(
          400,
          "INVALID_AGENT",
          "Personel bu departmanda görevli olmalıdır.",
        );
    }
    const updated = await tx.ticket.update({
      where: { id },
      data: {
        ...input,
        ...(input.status
          ? { closedAt: input.status === "CLOSED" ? new Date() : null }
          : {}),
      },
      include: ticketInclude,
    });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: "ticket.updated",
        entityId: id,
        metadata: input,
      },
    });
    return updated;
  });
}
export async function summary(actor: Actor) {
  const grouped = await db.ticket.groupBy({
    by: ["status"],
    where: visibility(actor),
    _count: true,
  });
  const unassigned = await db.ticket.count({
    where: {
      AND: [
        visibility(actor),
        { assignedAgentId: null, status: { notIn: ["RESOLVED", "CLOSED"] } },
      ],
    },
  });
  return {
    total: grouped.reduce((a, g) => a + g._count, 0),
    unassigned,
    statuses: Object.fromEntries(grouped.map((g) => [g.status, g._count])),
  };
}
