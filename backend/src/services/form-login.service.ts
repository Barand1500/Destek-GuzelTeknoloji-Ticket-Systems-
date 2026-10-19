import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { canonicalEmail } from '../utils/email.js';
import { issueFormLink } from './form-access.service.js';
import { queueSupportEmail } from './mailer.service.js';

const hash = (id: string, code: string) => createHmac('sha256', env.JWT_ACCESS_SECRET).update(`form-login:${id}:${code}`).digest('hex');
const invalid = () => new AppError(400, 'INVALID_FORM_CODE', 'Kod geçersiz veya süresi dolmuş. Bilgilerinizi kontrol edip yeni kod isteyin.');
export async function requestFormLogin(email: string, number: number) {
  email = canonicalEmail(email);
  // Never reveal whether an address/ticket exists, and never return an access token before verification.
  const challengeId = randomUUID();
  const conversation = await db.conversation.findFirst({ where: { number, deletedAt: null, customer: { deletedAt: null, isActive: true }, OR: [{ formRequest: { is: { email } } }, { formRequest: { is: null }, channel: 'FORM', customer: { email } }] } });
  if (!conversation) return { challengeId };
  const code = String(randomInt(100000, 1000000));
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM Conversation WHERE id = ${conversation.id} FOR UPDATE`;
    const now = new Date();
    const previous = await tx.formLoginChallenge.findUnique({ where: { conversationId: conversation.id } });
    const sameWindow = previous && now.getTime() - previous.requestWindowAt.getTime() < 3600_000;
    if (sameWindow && previous.requests >= 5) return;
    const data = { id: challengeId, email, codeHash: hash(challengeId, code), attempts: 0, consumedAt: null, requests: sameWindow ? previous.requests + 1 : 1, requestWindowAt: sameWindow ? previous.requestWindowAt : now, expiresAt: new Date(now.getTime() + 600_000), createdAt: now };
    await tx.formLoginChallenge.upsert({ where: { conversationId: conversation.id }, create: { conversationId: conversation.id, ...data }, update: data });
    await queueSupportEmail(email, `Talep giriş kodunuz (#TK-${String(number).padStart(5, '0')})`, `Talebinizi görüntülemek için giriş kodunuz: ${code}\n\nKod 10 dakika geçerlidir ve yalnızca bir kez kullanılabilir. Bu işlemi siz başlatmadıysanız e-postayı dikkate almayın.`, 'Form giriş kodu', { conversationId: conversation.id, userId: conversation.customerId }, [], tx, `${challengeId}:FORM_LOGIN`);
  });
  return { challengeId };
}
export async function verifyFormLogin(challengeId: string, code: string) {
  const challenge = await db.formLoginChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) throw invalid();
  const link = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM Conversation WHERE id = ${challenge.conversationId} FOR UPDATE`;
    const attempt = await tx.formLoginChallenge.updateMany({ where: { id: challengeId, attempts: { lt: 5 }, consumedAt: null, expiresAt: { gt: new Date() }, conversation: { deletedAt: null, customer: { deletedAt: null, isActive: true } } }, data: { attempts: { increment: 1 } } });
    if (!attempt.count) return null;
    const current = await tx.formLoginChallenge.findUniqueOrThrow({ where: { id: challengeId }, include: { conversation: { include: { formRequest: true, customer: { select: { email: true } } } } } });
    if (current.email !== (current.conversation.formRequest?.email ?? current.conversation.customer.email) || !timingSafeEqual(Buffer.from(current.codeHash), Buffer.from(hash(challengeId, code)))) return null;
    await tx.formLoginChallenge.update({ where: { id: challengeId }, data: { consumedAt: new Date() } });
    return issueFormLink(tx, current.conversationId, current.email);
  });
  if (!link) throw invalid();
  return { token: new URL(link).hash.slice(1) };
}
