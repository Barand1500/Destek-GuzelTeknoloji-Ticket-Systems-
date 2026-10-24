import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { db } from '../config/db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';
import { canonicalPhone } from './inbound-phone-matching.js';
import { canonicalEmail } from '../utils/email.js';
import { conversationChannelFilter } from './reply-channels.js';

export const formTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function issueFormEmailSession(tx: Prisma.TransactionClient, email: string | null, phone: string | null = null, deliveryChannel = 'EMAIL') {
  const token = randomBytes(32).toString('hex');
  await tx.formEmailSession.create({ data: { tokenHash: formTokenHash(token), email, phone, deliveryChannel, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
  return token;
}
export async function authorizeFormEmailSession(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'FORM_ACCESS_EXPIRED', 'Oturumunuz geçersiz veya süresi dolmuş. E-postanızla yeniden giriş yapın.');
  const session = await db.formEmailSession.findFirst({ where: { tokenHash: formTokenHash(token), expiresAt: { gt: new Date() } } });
  if (!session) throw new AppError(401, 'FORM_ACCESS_EXPIRED', 'Oturumunuz geçersiz veya süresi dolmuş. E-postanızla yeniden giriş yapın.');
  return session;
}
const ticketsForEmail = (email: string) => ({
  deletedAt: null,
  customer: { deletedAt: null, isActive: true },
  OR: [{ formRequest: { is: { email } } }, { customer: { email } }],
});
const samePhone = (left?: string | null, right?: string | null) => Boolean(left && right && canonicalPhone(left) === canonicalPhone(right));
export async function listFormTickets(session: { email: string | null; phone: string | null; deliveryChannel: string }) {
  const tickets = session.deliveryChannel === 'EMAIL' && session.email
    ? await db.conversation.findMany({ where: ticketsForEmail(session.email), select: { id: true, number: true, subject: true, status: true, channel: true, createdAt: true, updatedAt: true }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] })
    : session.phone ? (await db.conversation.findMany({ where: { deletedAt: null, customer: { deletedAt: null, isActive: true } }, include: { formRequest: { select: { phone: true } }, customer: { select: { phone: true } } }, orderBy: [{ updatedAt: 'desc' }, { id: 'desc' }] }))
      .filter(ticket => samePhone(ticket.formRequest?.phone, session.phone) || samePhone(ticket.customer.phone, session.phone))
      .map(({ formRequest: _formRequest, customer: _customer, ...ticket }) => ticket)
    : [];
  const statuses = await db.statusOption.findMany({ where: { code: { in: [...new Set(tickets.map(ticket => ticket.status))] } }, select: { code: true, name: true } });
  const names = new Map(statuses.map(status => [status.code, status.name]));
  return tickets.map(ticket => ({ ...ticket, status: names.get(ticket.status) ?? ticket.status }));
}
export async function issueFormLink(tx: Prisma.TransactionClient, conversationId: string, email: string) {
  const conversation = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { customer: { select: { name: true, phone: true, company: true } } } });
  await tx.formRequest.upsert({ where: { conversationId }, create: { conversationId, email, name: conversation.customer.name.slice(0, 100), phone: conversation.customer.phone?.slice(0, 30), company: conversation.customer.company?.slice(0, 150) }, update: {} });
  const token = randomBytes(32).toString('hex');
  await tx.formAccess.deleteMany({ where: { conversationId, expiresAt: { lte: new Date() } } });
  await tx.formAccess.create({ data: { tokenHash: formTokenHash(token), conversationId, email, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
  // The fragment is never sent to HTTP access logs or third-party referrers.
  return new URL(`/form/talep#${token}`, env.FRONTEND_URL).href;
}
export async function authorizeForm(token: string | undefined, conversationId?: string) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'FORM_ACCESS_EXPIRED', 'Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin.');
  const access = await db.formAccess.findFirst({ where: { tokenHash: formTokenHash(token), expiresAt: { gt: new Date() }, conversation: { channel: 'FORM', AND: [conversationChannelFilter('FORM')], deletedAt: null, customer: { deletedAt: null, isActive: true } } }, include: { conversation: { include: { formRequest: true, customer: { select: { id: true, name: true, email: true } } } } } });
  if (access && access.email === (access.conversation.formRequest?.email ?? access.conversation.customer.email)) {
    if (conversationId && access.conversationId !== conversationId) throw new AppError(403, 'FORM_CONVERSATION_FORBIDDEN', 'Bu talebe erişim izniniz yok.');
    return access.conversation;
  }
  const session = await authorizeFormEmailSession(token);
  if (!conversationId) throw new AppError(400, 'FORM_CONVERSATION_REQUIRED', 'Yanıtlamak istediğiniz talebi seçin.');
  const channelScope = {};
  const conversation = await db.conversation.findFirst({ where: { id: conversationId, deletedAt: null, customer: { deletedAt: null, isActive: true }, ...channelScope, ...(session.deliveryChannel === 'EMAIL' && session.email ? { OR: [{ formRequest: { is: { email: session.email } } }, { customer: { email: session.email } }] } : {}) }, include: { formRequest: true, customer: { select: { id: true, name: true, email: true, phone: true } } } });
  const conversationEmail = conversation?.formRequest?.email ?? conversation?.customer.email;
  const identityMatches = conversation && (session.deliveryChannel === 'EMAIL' ? Boolean(session.email && [conversationEmail, conversation.customer.email].some(email => email && canonicalEmail(email) === canonicalEmail(session.email!))) : samePhone(conversation.formRequest?.phone, session.phone) || samePhone(conversation.customer.phone, session.phone));
  if (!conversation || !identityMatches) throw new AppError(404, 'FORM_TICKET_NOT_FOUND', 'Talep doğrulanan iletişim bilginizle eşleşmiyor.');
  return { ...conversation, accountPortal: true };
}
