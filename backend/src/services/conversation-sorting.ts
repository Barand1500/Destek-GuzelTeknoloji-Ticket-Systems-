import { Prisma } from '../generated/prisma/client.js';
export function conversationListOrder(field?: 'number' | 'subject' | 'department' | 'assignedAgent', direction: 'asc' | 'desc' = 'asc'): Prisma.ConversationOrderByWithRelationInput[] {
  const fallback: Prisma.ConversationOrderByWithRelationInput[] = [{ updatedAt: 'desc' }, { id: 'desc' }];
  if (!field) return fallback;
  const selected: Prisma.ConversationOrderByWithRelationInput = field === 'number' ? { number: direction } : field === 'subject' ? { subject: direction } : field === 'department' ? { department: { name: direction } } : { assignedAgent: { name: direction } };
  return [selected, ...fallback];
}

// Rank the full filtered inbox before pagination; only timing metadata leaves the DB.
export async function responseTimePage(tx: Prisma.TransactionClient, where: Prisma.ConversationWhereInput, direction: 'asc' | 'desc', page: number, limit: number) {
  const candidates = await tx.conversation.findMany({ where, select: { id: true, createdAt: true }, orderBy: conversationListOrder() });
  const timings = new Map<string, { waiting: boolean; duration: number }>();
  const now = Date.now();
  for (let offset = 0; offset < candidates.length; offset += 500) {
    const ids = candidates.slice(offset, offset + 500).map(item => item.id);
    const rows = await tx.$queryRaw<{ conversationId: string; type: string; createdAt: Date; duration: number | bigint | string | null }[]>(Prisma.sql`
      WITH ordered AS (
        SELECT conversationId, id, type, createdAt,
          LAG(type) OVER (PARTITION BY conversationId ORDER BY createdAt, id) AS previousType,
          LAG(createdAt) OVER (PARTITION BY conversationId ORDER BY createdAt, id) AS previousAt
        FROM ConversationMessage
        WHERE conversationId IN (${Prisma.join(ids)}) AND type IN ('CUSTOMER_MESSAGE', 'AGENT_REPLY')
      ), latest AS (
        SELECT *, ROW_NUMBER() OVER (PARTITION BY conversationId ORDER BY createdAt DESC, id DESC) AS position FROM ordered
      ), replies AS (
        SELECT conversationId, TIMESTAMPDIFF(MICROSECOND, previousAt, createdAt) / 1000 AS duration,
          ROW_NUMBER() OVER (PARTITION BY conversationId ORDER BY createdAt DESC, id DESC) AS position
        FROM ordered WHERE type = 'AGENT_REPLY' AND previousType = 'CUSTOMER_MESSAGE'
      )
      SELECT l.conversationId, l.type, l.createdAt, r.duration FROM latest l
      LEFT JOIN replies r ON r.conversationId = l.conversationId AND r.position = 1
      WHERE l.position = 1
    `);
    for (const row of rows) {
      const waiting = row.type === 'CUSTOMER_MESSAGE' || row.duration == null;
      timings.set(row.conversationId, { waiting, duration: Math.max(0, waiting ? now - row.createdAt.getTime() : Number(row.duration)) });
    }
  }
  const timing = (item: typeof candidates[number]) => timings.get(item.id) ?? { waiting: true, duration: Math.max(0, now - item.createdAt.getTime()) };
  candidates.sort((a, b) => {
    const left = timing(a), right = timing(b);
    const ascending = Number(left.waiting) - Number(right.waiting) || left.duration - right.duration;
    return direction === 'desc' ? -ascending : ascending;
  });
  return candidates.slice((page - 1) * limit, page * limit).map(item => item.id);
}
