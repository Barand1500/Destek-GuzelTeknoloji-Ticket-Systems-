import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';

export const assignedTo = (userId: string): Prisma.ConversationWhereInput => ({ OR: [{ assignedAgentId: userId }, { assignees: { some: { userId } } }] });
export const unassigned = (): Prisma.ConversationWhereInput => ({ assignedAgentId: null, assignees: { none: {} } });
export async function assignmentIds(tx: Prisma.TransactionClient, conversationId: string, primary?: string | null) {
  const rows = await tx.conversationAssignee.findMany({ where: { conversationId }, select: { userId: true }, orderBy: [{ createdAt: 'asc' }, { userId: 'asc' }] });
  return [...new Set([...(primary ? [primary] : []), ...rows.map(row => row.userId)])];
}
/** Caller must hold the conversation row lock. Keep the legacy primary in sync. */
export async function setAssignees(tx: Prisma.TransactionClient, conversationId: string, ids: string[]) {
  const unique = [...new Set(ids)];
  await tx.conversationAssignee.deleteMany({ where: { conversationId, userId: { notIn: unique } } });
  if (unique.length) await tx.conversationAssignee.createMany({ data: unique.map(userId => ({ conversationId, userId })), skipDuplicates: true });
  await tx.conversation.update({ where: { id: conversationId }, data: { assignedAgentId: unique[0] ?? null } });
}
export async function validateAssignees(tx: Prisma.TransactionClient, ids: string[], departmentId: string, existingIds: string[] = []) {
  if (!ids.length) return;
  if (new Set(ids).size !== ids.length || await tx.user.count({ where: {
    id: { in: ids }, isActive: true, deletedAt: null,
    OR: [{ role: { in: ['ADMIN', 'SUPERVISOR', 'AGENT'] } }, { accessRoleId: { not: null } }],
    AND: [{ OR: [{ departments: { some: { departmentId } } }, { id: { in: existingIds } }] }],
  } }) !== ids.length) throw new AppError(400, 'INVALID_AGENT', 'Seçilen personeller bu departmanda aktif olmalıdır.');
}
export async function transferAssignee(tx: Prisma.TransactionClient, conversationId: string, removedId: string, nextId: string | null, departmentId: string) {
  const conversation = await tx.conversation.update({ where: { id: conversationId }, data: { updatedAt: new Date() } });
  const current = await assignmentIds(tx, conversationId, conversation.assignedAgentId);
  const remaining = conversation.departmentId === departmentId ? current.filter(id => id !== removedId) : [];
  await setAssignees(tx, conversationId, [...new Set([...remaining, ...(nextId ? [nextId] : [])])]);
  await tx.conversation.update({ where: { id: conversationId }, data: { departmentId } });
}

export async function assignmentCounts(tx: Prisma.TransactionClient, where: Prisma.ConversationWhereInput) {
  const groups = new Map<string, { departmentId: string; assignedAgentId: string | null; status: string; _count: number }>();
  const departments = new Map<string, { departmentId: string; status: string; count: number }>();
  let cursor: string | undefined;
  for (;;) {
    const rows = await tx.conversation.findMany({ where, select: { id: true, departmentId: true, assignedAgentId: true, status: true, assignees: { select: { userId: true } } },
      orderBy: { id: 'asc' }, take: 500, ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}) });
    for (const row of rows) {
      const key = `${row.departmentId}:${row.status}`;
      const department = departments.get(key) ?? { departmentId: row.departmentId, status: row.status, count: 0 };
      department.count++; departments.set(key, department);
      const ids = [...new Set([...(row.assignedAgentId ? [row.assignedAgentId] : []), ...row.assignees.map(item => item.userId)])];
      for (const id of ids.length ? ids : [null]) {
        const groupKey = `${key}:${id}`;
        const group = groups.get(groupKey) ?? { departmentId: row.departmentId, status: row.status, assignedAgentId: id, _count: 0 };
        group._count++; groups.set(groupKey, group);
      }
    }
    if (rows.length < 500) break;
    cursor = rows.at(-1)!.id;
  }
  return { counts: [...groups.values()], departmentStatuses: [...departments.values()] };
}
