import { db } from '../config/db.js';
import type { Prisma } from '../generated/prisma/client.js';
import type { StoredUpload } from './uploads.service.js';
import type { EmailAttachment } from './mailer.service.js';

export type DeliveryContext = { conversationId?: string; userId?: string; messageId?: string };
export type OutboundPayload = {
  recipient: { email?: string | null; phone?: string | null };
  text: string; subject?: string; reason?: string; context?: DeliveryContext;
  attachments?: EmailAttachment[]; file?: StoredUpload;
  whatsappTemplate?: { name: string; language: string; parameters: string[] };
};
export async function enqueueOutbound(channel: 'EMAIL' | 'SMS' | 'WHATSAPP', payload: OutboundPayload, client: Prisma.TransactionClient = db, dedupeKey?: string, sequence = 0) {
  const data = { channel, payload: payload as unknown as Prisma.InputJsonValue, conversationId: payload.context?.conversationId, userId: payload.context?.userId, dedupeKey, sequence, availableAt: new Date() };
  const job = await (dedupeKey
    ? client.outboundMessage.upsert({ where: { dedupeKey }, create: data, update: {} })
    : client.outboundMessage.create({ data }));
  if (payload.context?.conversationId && payload.context.userId) await client.activityLog.upsert({ where: { id: job.id }, create: {
    id: job.id, userId: payload.context.userId, entityId: payload.context.conversationId,
    action: channel === 'EMAIL' ? 'conversation.email_queued' : 'conversation.channel_reply_queued',
    metadata: { channel, recipient: channel === 'EMAIL' ? payload.recipient.email ?? '' : payload.recipient.phone ?? '',
      attachmentCount: payload.file ? 1 : payload.attachments?.length ?? 0, ...(payload.file ? { originalName: payload.file.originalName } : {}) },
  }, update: {} });
  return job;
}

export async function enqueueChannelReply(channel: 'SMS' | 'WHATSAPP', recipient: { phone?: string | null }, text: string, context: DeliveryContext, files: StoredUpload[] = [], client: Prisma.TransactionClient = db) {
  const parts: Array<{ text: string; file?: StoredUpload }> = [];
  if (channel !== 'WHATSAPP' || !files.length) parts.push({ text });
  else {
    if (text.length > 1024) {
      const characters = Array.from(text);
      for (let i = 0; i < characters.length; i += 4096) parts.push({ text: characters.slice(i, i + 4096).join('') });
    }
    files.forEach((file, index) => parts.push({ file, text: index === 0 && text.length <= 1024 ? text : '' }));
  }
  for (const [index, part] of parts.entries()) await enqueueOutbound(channel, { recipient, ...part, context }, client, context.messageId ? `${context.messageId}:${channel}:${index}` : undefined, index);
}
