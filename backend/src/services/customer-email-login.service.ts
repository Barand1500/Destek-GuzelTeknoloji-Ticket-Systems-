import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import type { Prisma } from '../generated/prisma/client.js';
import { AppError } from '../utils/errors.js';
import { canonicalEmail } from '../utils/email.js';
import { issue } from './auth.service.js';
import { queueSupportEmail } from './mailer.service.js';

const digest = (id: string, code: string) => createHmac('sha256', env.JWT_ACCESS_SECRET).update(`customer-login:${id}:${code}`).digest('hex');
const invalid = () => new AppError(400, 'INVALID_CUSTOMER_CODE', 'Kod geçersiz veya süresi dolmuş. Yeni kod isteyip tekrar deneyin.');
const response = (challengeId: string) => ({ challengeId, message: 'E-posta adresi aktif ve tek bir müşteri hesabıyla eşleşiyorsa giriş kodu gönderildi. Kod 10 dakika geçerlidir.' });
async function findCustomer(tx: Prisma.TransactionClient, email: string) {
  const scope = { role: 'CUSTOMER' as const, accessRoleId: null, isActive: true, deletedAt: null };
  const explicit = await tx.user.findFirst({ where: { ...scope, loginEmail: email } });
  if (explicit) return explicit;
  const contacts = await tx.user.findMany({ where: { ...scope, loginEmail: null, email }, take: 2 });
  return contacts.length === 1 ? contacts[0] : null;
}
export async function requestCustomerEmailLogin(rawEmail: string) {
  const email = canonicalEmail(rawEmail);
  const challengeId = randomUUID();
  const candidate = await findCustomer(db, email);
  if (!candidate) return response(challengeId);
  const code = String(randomInt(100000, 1000000));
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${candidate.id} FOR UPDATE`;
    const current = await findCustomer(tx, email);
    if (current?.id !== candidate.id) return;
    const now = new Date();
    const previous = await tx.customerLoginChallenge.findUnique({ where: { userId: current.id } });
    const sameWindow = previous && now.getTime() - previous.requestWindowAt.getTime() < 3600_000;
    if (sameWindow && previous.requests >= 5) return;
    const data = { id: challengeId, email, codeHash: digest(challengeId, code), attempts: 0, requests: sameWindow ? previous.requests + 1 : 1, requestWindowAt: sameWindow ? previous.requestWindowAt : now, expiresAt: new Date(now.getTime() + 600_000), consumedAt: null };
    await tx.customerLoginChallenge.upsert({ where: { userId: current.id }, create: { userId: current.id, ...data }, update: data });
    await queueSupportEmail(email, 'Müşteri hesabınıza giriş kodunuz', `Merhaba ${current.name},\n\nMüşteri hesabınıza giriş kodunuz: ${code}\n\nKod 10 dakika geçerlidir ve bir kez kullanılabilir. Bu işlemi siz başlatmadıysanız kodu kimseyle paylaşmayın.`, 'Müşteri e-posta girişi', { userId: current.id }, [], tx, `${challengeId}:CUSTOMER_LOGIN`);
  });
  return response(challengeId);
}
export async function verifyCustomerEmailLogin(challengeId: string, code: string) {
  const hint = await db.customerLoginChallenge.findUnique({ where: { id: challengeId } });
  if (!hint) throw invalid();
  const session = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM User WHERE id = ${hint.userId} FOR UPDATE`;
    const attempt = await tx.customerLoginChallenge.updateMany({ where: { id: challengeId, consumedAt: null, attempts: { lt: 5 }, expiresAt: { gt: new Date() } }, data: { attempts: { increment: 1 } } });
    if (!attempt.count) return null;
    const challenge = await tx.customerLoginChallenge.findUniqueOrThrow({ where: { id: challengeId } });
    const current = await findCustomer(tx, challenge.email);
    if (current?.id !== challenge.userId || !timingSafeEqual(Buffer.from(challenge.codeHash, 'hex'), Buffer.from(digest(challengeId, code), 'hex'))) return null;
    const now = new Date();
    await tx.customerLoginChallenge.update({ where: { id: challengeId }, data: { consumedAt: now } });
    return issue(current.id, tx, now);
  });
  if (!session) throw invalid();
  return session;
}
