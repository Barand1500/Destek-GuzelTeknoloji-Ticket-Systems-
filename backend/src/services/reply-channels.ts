import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { Prisma } from '../generated/prisma/client.js';
import type { ConversationChannel } from '../generated/prisma/enums.js';
export type ReplyChannel = 'TICKET' | 'EMAIL' | 'SMS' | 'WHATSAPP';
export function selectedReplyChannels(value: unknown, original: string): ReplyChannel[] {
  if (Array.isArray(value) && value.length && value.every(item => ['TICKET','EMAIL','SMS','WHATSAPP'].includes(item))) return [...new Set(value)] as ReplyChannel[];
  return [['TICKET','EMAIL','SMS','WHATSAPP'].includes(original) ? original : 'TICKET'] as ReplyChannel[];
}
export function conversationChannelFilter(channel: ConversationChannel): Prisma.ConversationWhereInput {
  return { OR: [
    { replyChannels: { array_contains: channel } },
    { AND: [
      { OR: [{ replyChannels: { equals: Prisma.DbNull } }, { replyChannels: { equals: Prisma.JsonNull } }, { replyChannels: { equals: [] } }] },
      { channel },
    ] },
  ] };
}
export function validateReplyChannels(channels: ReplyChannel[], customer: { email?: string | null; phone?: string | null }, settings: { smtpEnabled?: boolean; smtpHost?: string; smtpFromAddress?: string; smtpUser?: string; smtpPassword?: string; smsEnabled?: boolean; whatsappEnabled?: boolean } | null) {
  const stored = Boolean(settings && (settings.smtpHost || settings.smtpFromAddress || settings.smtpUser || settings.smtpPassword));
  for (const channel of channels) {
    if (channel === 'TICKET') continue;
    const enabled = channel === 'EMAIL' ? (stored ? settings?.smtpEnabled : true) && Boolean(settings?.smtpHost || env.SMTP_HOST) && Boolean(settings?.smtpFromAddress || env.SMTP_FROM) : channel === 'SMS' ? settings?.smsEnabled : settings?.whatsappEnabled;
    if (!enabled) throw new AppError(400, 'CHANNEL_DISABLED', `${channel === 'EMAIL' ? 'E-Posta' : channel === 'SMS' ? 'SMS' : 'WhatsApp'} kanalı etkin değil.`);
    if (channel === 'EMAIL' ? !customer.email : !customer.phone) throw new AppError(400, 'RECIPIENT_REQUIRED', channel === 'EMAIL' ? 'Müşterinin E-Posta adresi eksik.' : 'Müşterinin telefon numarası eksik.');
  }
}
