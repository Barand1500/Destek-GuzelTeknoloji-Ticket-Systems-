import { createHash, randomBytes } from 'node:crypto';
import { env } from '../config/env.js';
import { db } from '../config/db.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';

export const formTokenHash = (token: string) => createHash('sha256').update(token).digest('hex');
export async function issueFormLink(tx: Prisma.TransactionClient, conversationId: string, email: string) {
  const conversation = await tx.conversation.findUniqueOrThrow({ where: { id: conversationId }, select: { customer: { select: { name: true, phone: true, company: true } } } });
  await tx.formRequest.upsert({ where: { conversationId }, create: { conversationId, email, name: conversation.customer.name.slice(0, 100), phone: conversation.customer.phone?.slice(0, 30), company: conversation.customer.company?.slice(0, 150) }, update: {} });
  const token = randomBytes(32).toString('hex');
  await tx.formAccess.deleteMany({ where: { conversationId, expiresAt: { lte: new Date() } } });
  await tx.formAccess.create({ data: { tokenHash: formTokenHash(token), conversationId, email, expiresAt: new Date(Date.now() + 7 * 86400_000) } });
  // The fragment is never sent to HTTP access logs or third-party referrers.
  return new URL(`/form/talep#${token}`, env.FRONTEND_URL).href;
}
export async function authorizeForm(token: string | undefined) {
  if (!token || !/^[a-f0-9]{64}$/.test(token)) throw new AppError(401, 'FORM_ACCESS_EXPIRED', 'Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin.');
  const access = await db.formAccess.findFirst({ where: { tokenHash: formTokenHash(token), expiresAt: { gt: new Date() }, conversation: { deletedAt: null, customer: { deletedAt: null, isActive: true } } }, include: { conversation: { include: { formRequest: true, customer: { select: { id: true, name: true, email: true } } } } } });
  if (!access || access.email !== (access.conversation.formRequest?.email ?? access.conversation.customer.email)) throw new AppError(401, 'FORM_ACCESS_EXPIRED', 'Bağlantı geçersiz veya süresi dolmuş. Yeni bağlantı isteyin.');
  return access.conversation;
}
