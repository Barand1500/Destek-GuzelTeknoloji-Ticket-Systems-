import { Prisma } from '../generated/prisma/client.js';
import { canonicalPhone } from './inbound-phone-matching.js';
import { conversationChannelFilter } from './reply-channels.js';

export const whatsappOutboundProvider = (phone: string) => `meta-whatsapp-outbound:${canonicalPhone(phone)}`;

export async function whatsappReplyTarget(tx: Prisma.TransactionClient, customerIds: string[], senderPhone: string, replyToExternalId?: string) {
  const candidates = await tx.conversation.findMany({
    where: { customerId: { in: customerIds }, deletedAt: null, OR: [
      conversationChannelFilter('WHATSAPP'),
      // Preserve old manually-created phone requests that have no explicit channel choice.
      { channel: 'TICKET', replyChannels: { equals: Prisma.DbNull } },
    ] },
    orderBy: [{ createdAt: 'desc' }, { number: 'desc' }],
  });
  if (!candidates.length) return null;
  const ids = candidates.map(item => item.id);
  const phone = canonicalPhone(senderPhone);
  const recipientMatches = (metadata: Prisma.JsonValue | null) => {
    const recipient = metadata && typeof metadata === 'object' && !Array.isArray(metadata) ? metadata.recipient : undefined;
    return typeof recipient !== 'string' || !recipient ? true : canonicalPhone(recipient) === phone;
  };
  if (replyToExternalId) {
    const outbound = await tx.externalMessage.findFirst({ where: { provider: whatsappOutboundProvider(phone), externalId: replyToExternalId, conversationId: { in: ids } } });
    if (outbound) return candidates.find(item => item.id === outbound.conversationId)!;
    const quoted = await tx.activityLog.findMany({ where: {
      entityId: { in: ids }, action: 'conversation.channel_reply_sent',
      AND: [{ metadata: { path: '$.channel', equals: 'WHATSAPP' } }, { metadata: { path: '$.providerMessageId', equals: replyToExternalId } }],
    }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
    const known = quoted.find(item => recipientMatches(item.metadata));
    if (known) return candidates.find(item => item.id === known.entityId)!;
    const inbound = await tx.externalMessage.findFirst({ where: { provider: 'meta-whatsapp', externalId: replyToExternalId, conversationId: { in: ids } } });
    if (inbound) return candidates.find(item => item.id === inbound.conversationId)!;
  }
  const sent = await tx.activityLog.findMany({ where: {
    entityId: { in: ids }, action: 'conversation.channel_reply_sent', metadata: { path: '$.channel', equals: 'WHATSAPP' },
  }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const latest = sent.find(item => recipientMatches(item.metadata));
  const tracked = await tx.externalMessage.findFirst({ where: { provider: whatsappOutboundProvider(phone), conversationId: { in: ids } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] });
  const last = tracked && (!latest || tracked.createdAt >= latest.createdAt) ? { id: tracked.conversationId, createdAt: tracked.createdAt } : latest ? { id: latest.entityId, createdAt: latest.createdAt } : null;
  if (last && candidates[0].createdAt <= last.createdAt) return candidates.find(item => item.id === last.id)!;
  return candidates[0];
}
