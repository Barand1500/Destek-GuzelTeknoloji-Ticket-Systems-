import { randomUUID } from 'node:crypto';
import { db } from '../config/db.js';
import { Prisma } from '../generated/prisma/client.js';
import type { OutboundMessage } from '../generated/prisma/client.js';
import type { OutboundPayload } from './outbound-queue.store.js';
import { sendSupportEmail, smtpFailureReason } from './mailer.service.js';
import { sendChannelReply, sendWhatsappTemplate } from './integrations.service.js';
import { whatsappOutboundProvider } from './whatsapp-routing.service.js';
import { publishChange } from './events.service.js';

const leaseMs = 5 * 60_000;
let running = false, stopping = false;
let timer: NodeJS.Timeout | undefined, active: Promise<unknown> | undefined;
export function retryableDeliveryError(error: { code?: string; responseCode?: number; statusCode?: number; providerCode?: number }) {
  if (['EAUTH', 'SMTP_NOT_CONFIGURED', 'RECIPIENT_REJECTED', 'EENVELOPE', 'ENOENT', 'INVALID_FILE', 'INVALID_WHATSAPP_FILE', 'INVALID_WHATSAPP_TEMPLATE'].includes(error.code ?? '')) return false;
  if (error.responseCode && error.responseCode >= 500) return false;
  if ([1, 2, 4, 17, 341, 80007, 130429, 131000, 131056].includes(error.providerCode ?? -1)) return true;
  if (error.providerCode) return false;
  if (error.statusCode && error.statusCode >= 400) return [408, 429].includes(error.statusCode) || error.statusCode >= 500;
  return true;
}

async function deliver(job: OutboundMessage, token: string) {
  const payload = job.payload as unknown as OutboundPayload;
  const audit = job.conversationId && job.userId ? { conversationId: job.conversationId, userId: job.userId } : undefined;
  const channel = job.channel as 'EMAIL' | 'SMS' | 'WHATSAPP';
  const metadata = { channel, outboundJobId: job.id, recipient: channel === 'EMAIL' ? payload.recipient.email ?? '' : payload.recipient.phone ?? '', attempt: job.attempts,
    ...(payload.context?.messageId ? { messageId: payload.context.messageId } : {}),
    ...(payload.file ? { originalName: payload.file.originalName, attachmentCount: 1 } : { attachmentCount: payload.attachments?.length ?? 0 }) };
  try {
    if (audit && channel !== 'EMAIL') await db.activityLog.upsert({ where: { id: job.id }, create: { id: job.id, userId: audit.userId, entityId: audit.conversationId, action: 'conversation.channel_reply_requested', metadata }, update: { action: 'conversation.channel_reply_requested', metadata } });
    let providerMessageId: string | undefined;
    let smtpReceipt: Awaited<ReturnType<typeof sendSupportEmail>> | undefined;
    if (channel === 'EMAIL') {
      smtpReceipt = await sendSupportEmail(payload.recipient.email!, payload.subject ?? '', payload.text, audit, payload.attachments, `<outbox-${job.id}@helpdesk.invalid>`);
      providerMessageId = smtpReceipt.messageId;
    } else if (channel === 'WHATSAPP' && payload.whatsappTemplate) providerMessageId = await sendWhatsappTemplate(payload.recipient.phone!, payload.whatsappTemplate, job.id);
    else providerMessageId = await sendChannelReply(channel, payload.recipient, payload.text, job.id, payload.file);
    await db.$transaction(async tx => {
      const saved = await tx.outboundMessage.updateMany({ where: { id: job.id, status: 'PROCESSING', leaseToken: token }, data: { status: 'SENT', providerMessageId, lastError: null, leaseToken: null, leaseUntil: null } });
      if (!saved.count) return; // A signed early WhatsApp receipt may have completed it.
      if (audit) {
        const data = { userId: audit.userId, entityId: audit.conversationId, action: channel === 'EMAIL' ? 'conversation.email_sent' : 'conversation.channel_reply_sent', metadata: { ...metadata,
          ...(channel === 'EMAIL' ? { reason: payload.reason ?? 'Yanıt', messageId: providerMessageId ?? '', smtpResponse: smtpReceipt?.response ?? '', accepted: smtpReceipt?.accepted ?? 0 } : { providerMessageId: providerMessageId ?? '' }) } };
        await tx.activityLog.upsert({ where: { id: job.id }, create: { id: job.id, ...data }, update: data });
        if (channel === 'WHATSAPP' && providerMessageId && payload.recipient.phone) {
          const provider = whatsappOutboundProvider(payload.recipient.phone);
          await tx.externalMessage.upsert({ where: { provider_externalId: { provider, externalId: providerMessageId } }, create: { provider, externalId: providerMessageId, channel: 'WHATSAPP', conversationId: audit.conversationId }, update: {} });
        }
      }
    });
  } catch (caught) {
    const error = caught as Error & { code?: string; responseCode?: number; statusCode?: number; providerCode?: number };
    const retry = job.attempts < 8 && retryableDeliveryError(error);
    const reason = (channel === 'EMAIL' ? smtpFailureReason(error) : error.message || String(caught)).slice(0, 4000);
    const changed = await db.$transaction(async tx => {
      const saved = await tx.outboundMessage.updateMany({ where: { id: job.id, status: 'PROCESSING', leaseToken: token }, data: {
        status: retry ? 'PENDING' : 'FAILED', availableAt: new Date(Date.now() + Math.min(30 * 60_000, 30_000 * 2 ** Math.min(job.attempts - 1, 6))), lastError: reason, leaseToken: null, leaseUntil: null,
      } });
      if (saved.count && audit) {
        const data = { userId: audit.userId, entityId: audit.conversationId, action: channel === 'EMAIL' ? 'conversation.email_failed' : 'conversation.channel_reply_failed', metadata: { ...metadata, reason: `${reason}${retry ? ' · Yeniden denenecek.' : ''}`, retryScheduled: retry } };
        await tx.activityLog.upsert({ where: { id: job.id }, create: { id: job.id, ...data }, update: data });
      }
      return saved.count > 0;
    });
    if (changed) console.error('[Gönderim kuyruğu]', { jobId: job.id, channel, retryScheduled: retry, reason });
  }
  if (job.conversationId) publishChange(job.conversationId, channel === 'EMAIL');
}

export async function processOutboundQueue(userId?: string) {
  if (running) return;
  running = true;
  try {
    let skip = 0;
    for (;;) {
      if (stopping) return;
      const now = new Date();
      const jobs = await db.outboundMessage.findMany({ where: { ...(userId ? { userId } : {}), OR: [{ status: 'PENDING', availableAt: { lte: now } }, { status: 'PROCESSING', leaseUntil: { lt: now } }] }, orderBy: [{ createdAt: 'asc' }, { sequence: 'asc' }, { id: 'asc' }], take: 50, skip });
      if (!jobs.length) return;
      let progress = false;
      for (let offset = 0; offset < jobs.length; offset += 4) {
        const results = await Promise.allSettled(jobs.slice(offset, offset + 4).map(async job => {
          if (stopping) return;
          const token = randomUUID();
          // Guard the claim in a transaction. A conversation lock preserves send
          // order for that conversation/channel even with several backend workers.
          const claimed = await db.$transaction(async tx => {
            if (job.conversationId) {
              const rows = await tx.$queryRaw<Array<{ deletedAt: Date | null }>>(Prisma.sql`SELECT deletedAt FROM Conversation WHERE id = ${job.conversationId} FOR UPDATE`);
              if (!rows.length || rows[0].deletedAt) {
                await tx.outboundMessage.updateMany({ where: { id: job.id, status: { in: ['PENDING', 'PROCESSING'] } }, data: { status: 'CANCELLED', leaseToken: null, leaseUntil: null } });
                await tx.activityLog.updateMany({ where: { id: job.id }, data: { action: 'conversation.delivery_cancelled', metadata: { channel: job.channel, details: ['Talep silindiği için gönderim iptal edildi.'] } } });
                progress = true;
                return null;
              }
              const preceding = await tx.outboundMessage.findFirst({ where: { conversationId: job.conversationId, channel: job.channel, status: { in: ['PENDING', 'PROCESSING'] }, OR: [{ createdAt: { lt: job.createdAt } }, { createdAt: job.createdAt, sequence: { lt: job.sequence } }, { createdAt: job.createdAt, sequence: job.sequence, id: { lt: job.id } }] } });
              if (preceding) return null;
            }
            const result = await tx.outboundMessage.updateMany({ where: { id: job.id, OR: [{ status: 'PENDING', availableAt: { lte: new Date() } }, { status: 'PROCESSING', leaseUntil: { lt: new Date() } }] }, data: { status: 'PROCESSING', attempts: { increment: 1 }, leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs) } });
            return result.count ? tx.outboundMessage.findUniqueOrThrow({ where: { id: job.id } }) : null;
          });
          if (!claimed) return;
          progress = true;
          await deliver(claimed, token);
        }));
        const failure = results.find((result): result is PromiseRejectedResult => result.status === 'rejected');
        if (failure) throw failure.reason;
      }

      if (!progress && jobs.length < 50) return;
      skip = progress ? 0 : skip + jobs.length;
    }
  } finally { running = false; }
}

export function startOutboundQueue() {
  if (timer) return;
  stopping = false;
  const tick = () => { if (!active) active = processOutboundQueue().catch(error => console.error('[Gönderim kuyruğu] İşleme durdu:', error instanceof Error ? error.message : String(error))).finally(() => { active = undefined; }); };
  tick(); timer = setInterval(tick, 2000); timer.unref();
}
export async function stopOutboundQueue() {
  stopping = true; if (timer) clearInterval(timer); timer = undefined; await active;
}
