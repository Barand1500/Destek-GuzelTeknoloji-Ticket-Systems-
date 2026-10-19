import { randomBytes } from 'node:crypto';
import bcrypt from 'bcrypt';
import { z } from 'zod';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { emailSchema } from '../utils/email.js';
import { AppError } from '../utils/errors.js';
import { queueSupportEmail } from './mailer.service.js';
import { issueFormLink } from './form-access.service.js';
import { notifyConversation, publishChange } from './events.service.js';
import { selectEmailCustomer } from './inbound-email-matching.js';
import { can } from './permissions.js';
import type { Actor } from '../types/express.js';
import type { StoredUpload } from './uploads.service.js';

export const formSettingsSchema = z.object({ enabled: z.boolean(), title: z.string().trim().min(1).max(100) }).strict();
export const formSubmissionSchema = z.object({
  name: z.string().trim().min(1).max(100), email: emailSchema,
  phone: z.string().trim().max(30).default(''), company: z.string().trim().max(150).default(''),
  subject: z.string().trim().min(1, 'Konu boş bırakılamaz.').max(200), message: z.string().trim().min(1).max(10000),
  departmentId: z.uuid('Lütfen departman seçin.'),
  turnstileToken: z.string().max(2048).optional(),
}).strict();
export async function smtpReady() {
  const settings = await db.integrationSettings.findUnique({ where: { id: 'default' } });
  const stored = Boolean(settings && (settings.smtpHost || settings.smtpFromAddress || settings.smtpUser || settings.smtpPassword));
  return Boolean((!stored || settings?.smtpEnabled) && (settings?.smtpHost || env.SMTP_HOST) && (settings?.smtpFromAddress || env.SMTP_FROM));
}
export async function getFormSettings() {
  return await db.formSettings.findUnique({ where: { id: 'default' }, select: { enabled: true, title: true } }) ?? { enabled: false, title: 'Destek Talebi' };
}
export async function saveFormSettings(actor: Actor, input: z.infer<typeof formSettingsSchema>) {
  if (!can(actor, 'integrations.update')) throw new AppError(403, 'FORBIDDEN', 'Form ayarlarını değiştirme yetkiniz yok.');
  if (input.enabled && !await db.department.findFirst({ where: { isActive: true, deletedAt: null }, select: { id: true } })) throw new AppError(400, 'INVALID_DEPARTMENT', 'Formu açmak için önce aktif bir departman oluşturun.');
  if (input.enabled && !await smtpReady()) throw new AppError(400, 'SMTP_REQUIRED', 'Müşteriye takip bağlantısı göndermek için önce E-Posta gönderimini ayarlayın.');
  return db.$transaction(async tx => {
    const result = await tx.formSettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...input }, update: { ...input, departmentId: null }, select: { enabled: true, title: true } });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'integrations.updated', entityType: 'IntegrationSettings', entityId: 'default', metadata: { channel: 'FORM', ...input }, ipAddress: actor.ipAddress } });
    return result;
  });
}
export async function requireOpenForm() {
  const settings = await getFormSettings();
  if (!settings.enabled) throw new AppError(404, 'FORM_CLOSED', 'Form şu anda talep kabul etmiyor.');
  if (!await smtpReady()) throw new AppError(503, 'FORM_UNAVAILABLE', 'Form şu anda kullanılamıyor. Lütfen daha sonra deneyin.');
  return settings;
}
export async function submitForm(input: z.infer<typeof formSubmissionSchema>, files: StoredUpload[] = [], ipAddress?: string) {
  await requireOpenForm();
  if (await db.formRequest.count({ where: { email: input.email, createdAt: { gt: new Date(Date.now() - 3600_000) } } }) >= 5) throw new AppError(429, 'RATE_LIMITED', 'Çok fazla talep gönderdiniz. Lütfen daha sonra deneyin.');
  const contacts = await db.user.findMany({ where: { role: 'CUSTOMER', deletedAt: null, isActive: true, OR: [{ email: input.email }, { extraEmails: { contains: input.email } }] }, orderBy: { createdAt: 'asc' } });
  let customer: typeof contacts[number] | undefined;
  try { customer = selectEmailCustomer(contacts, input.email, input.name); } catch { /* Ambiguous shared addresses get a separate contact, never arbitrary history access. */ }
  const passwordHash = customer ? '' : await bcrypt.hash(randomBytes(32).toString('hex'), 12);
  const result = await db.$transaction(async tx => {
    if (!await tx.department.findFirst({ where: { id: input.departmentId, isActive: true, deletedAt: null }, select: { id: true } })) throw new AppError(400, 'INVALID_DEPARTMENT', 'Lütfen aktif bir departman seçin.');
    const person = customer ?? await tx.user.create({ data: { name: input.name, email: input.email, phone: input.phone || null, company: input.company || null, passwordHash, role: 'CUSTOMER' } });
    const conversation = await tx.conversation.create({ data: {
      subject: input.subject, searchSubject: input.subject.normalize('NFKC').toLocaleLowerCase('tr-TR'), customerId: person.id,
      channel: 'FORM', replyChannels: ['FORM'], source: 'FORM', departmentId: input.departmentId,
      formRequest: { create: { name: input.name, email: input.email, phone: input.phone || null, company: input.company || null } },
      messages: { create: { authorId: person.id, body: input.message, type: 'CUSTOMER_MESSAGE', attachments: { create: files.map(file => ({ ...file, uploaderId: person.id })) } } },
    } });
    const actor: Actor = { id: person.id, name: person.name, email: input.email, role: 'CUSTOMER', departmentIds: [], sessionId: '', ipAddress };
    await tx.activityLog.create({ data: { userId: person.id, action: 'conversation.created', entityId: conversation.id, metadata: { number: conversation.number, subject: conversation.subject, channel: 'FORM' }, ipAddress } });
    await notifyConversation(tx, actor, conversation, 'CREATED', 'Form üzerinden yeni talep');
    const link = await issueFormLink(tx, conversation.id, input.email);
    await queueSupportEmail(input.email, `Talebiniz alındı (#TK-${String(conversation.number).padStart(5, '0')})`, `Merhaba ${input.name},\n\nTalebiniz alındı. Yanıtları görmek ve mesaj yazmak için:\n${link}\n\nBu bağlantı 7 gün geçerlidir. Bağlantıyı başkalarıyla paylaşmayın.`, 'Form talebi', { conversationId: conversation.id, userId: person.id }, [], tx, `${conversation.id}:FORM_CREATED`);
    return { number: conversation.number };
  });
  publishChange();
  return result;
}
export async function requestFormLink(email: string, number: number) {
  // The response is identical whether the ticket/address exists or not.
  const conversation = await db.conversation.findFirst({ where: { number, deletedAt: null, customer: { deletedAt: null, isActive: true }, OR: [{ formRequest: { is: { email } } }, { formRequest: { is: null }, channel: 'FORM', customer: { email } }] }, include: { formRequest: true } });
  if (!conversation) return;
  const recent = await db.formAccess.count({ where: { conversationId: conversation.id, createdAt: { gt: new Date(Date.now() - 3600_000) } } });
  if (recent >= 10) return;
  await db.$transaction(async tx => {
    const link = await issueFormLink(tx, conversation.id, email);
    await queueSupportEmail(email, `Talep takip bağlantınız (#TK-${String(number).padStart(5, '0')})`, `Talebinizi görüntülemek ve yanıtlamak için:\n${link}\n\nBağlantı 7 gün geçerlidir. Başkalarıyla paylaşmayın.`, 'Form takip bağlantısı', { conversationId: conversation.id, userId: conversation.customerId }, [], tx);
  });
}
