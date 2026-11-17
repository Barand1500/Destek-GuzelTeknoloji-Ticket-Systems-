import { Prisma } from '../generated/prisma/client.js';

const person = { id: true, name: true, email: true, phone: true, company: true, staffNote: true, extraPhones: true, extraEmails: true, role: true } as const;
const hiddenActions = ['conversation.email_received', 'conversation.email_sent', 'conversation.replied', 'conversation.note_added'];

/** Select lightweight keys in SQL, then hydrate at most one page of bodies and audit metadata. */
export async function conversationHistoryPage(tx: Prisma.TransactionClient, id: string, page: number, limit: number) {
  const logWhere = { entityId: id, entityType: 'Conversation', action: { notIn: hiddenActions } };
  const total = await tx.conversationMessage.count({ where: { conversationId: id } }) + await tx.activityLog.count({ where: logWhere });
  // IDs are UUIDs. Binary ordering gives their canonical lexical order independently of DB collation.
  // kind resolves the otherwise ambiguous case of the same ID in both tables (messages first).
  const keys = await tx.$queryRaw<{ id: string; kind: number }[]>(Prisma.sql`
    SELECT id, kind FROM (
      SELECT id, createdAt, 0 AS kind FROM ConversationMessage WHERE conversationId = ${id}
      UNION ALL
      SELECT id, createdAt, 1 AS kind FROM ActivityLog
      WHERE entityId = ${id} AND entityType = 'Conversation' AND action NOT IN (${Prisma.join(hiddenActions)})
    ) timeline ORDER BY createdAt DESC, BINARY id DESC, kind ASC
    LIMIT ${limit} OFFSET ${(page - 1) * limit}
  `);
  const messageIds = keys.filter(key => Number(key.kind) === 0).map(key => key.id);
  const logIds = keys.filter(key => Number(key.kind) === 1).map(key => key.id);
  const messages = messageIds.length ? await tx.conversationMessage.findMany({ where: { conversationId: id, id: { in: messageIds } }, include: { author: { select: person }, attachments: { select: { id: true, originalName: true, mimeType: true, size: true } } } }) : [];
  const logs = logIds.length ? await tx.activityLog.findMany({ where: { ...logWhere, id: { in: logIds } }, include: { user: { select: person } } }) : [];
  const first = messageIds.length ? await tx.conversationMessage.findFirst({ where: { conversationId: id }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { id: true } }) : null;
  const creation = first && messageIds.includes(first.id) ? await tx.activityLog.findFirst({ where: { entityId: id, entityType: 'Conversation', action: 'conversation.created' }, orderBy: [{ createdAt: 'asc' }, { id: 'asc' }], select: { user: { select: person } } }) : null;
  // Correlated LIMIT avoids loading every reply audit record, even with legacy duplicate metadata.
  const metadataRows = messageIds.length ? await tx.$queryRaw<{ messageId: string; metadata: unknown }[]>(Prisma.sql`
    SELECT m.id AS messageId, (
      SELECT a.metadata FROM ActivityLog a
      WHERE a.entityId = ${id} AND a.entityType = 'Conversation'
        AND a.action IN ('conversation.replied', 'conversation.note_added')
        AND JSON_UNQUOTE(JSON_EXTRACT(a.metadata, '$.messageId')) = m.id
      ORDER BY a.createdAt DESC, BINARY a.id DESC LIMIT 1
    ) AS metadata FROM ConversationMessage m WHERE m.conversationId = ${id} AND m.id IN (${Prisma.join(messageIds)})
  `) : [];
  const metadata = new Map(metadataRows.map(row => [row.messageId, (typeof row.metadata === 'string' ? JSON.parse(row.metadata) : row.metadata) as Record<string, unknown> | null]));
  const labels: Record<string, string> = { 'conversation.created': 'Talep oluşturuldu', 'conversation.updated': 'Talep bilgileri güncellendi', 'conversation.claimed': 'Temsilci talebi üzerine aldı', 'conversation.email_failed': 'E-posta bildirimi gönderilemedi' };
  const messageRows = new Map(messages.map(message => {
    const meta = metadata.get(message.id);
    return [message.id, { ...message, author: message.id === first?.id && creation ? creation.user : message.author, action: message.id === first?.id && creation ? 'INITIAL_MESSAGE' : message.type, metadata: meta ? { channel: meta.channel, replyChannels: meta.replyChannels } : null }];
  }));
  const logRows = new Map(logs.map(log => [log.id, { id: log.id, conversationId: id, type: 'SYSTEM' as const, action: log.action, body: labels[log.action] ?? log.action, createdAt: log.createdAt, author: log.user, attachments: [], metadata: log.metadata }]));
  const data = keys.map(key => Number(key.kind) === 0 ? messageRows.get(key.id)! : logRows.get(key.id)!);
  return { data, pagination: { page, limit, total, totalPages: Math.ceil(total / limit) } };
}
