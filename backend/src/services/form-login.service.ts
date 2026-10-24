import { createHmac, randomInt, randomUUID, timingSafeEqual } from 'node:crypto';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { canonicalEmail } from '../utils/email.js';
import { canonicalPhone } from './inbound-phone-matching.js';
import { issueFormEmailSession } from './form-access.service.js';
import { queueSupportEmail } from './mailer.service.js';
import { sendFormLoginSmsCode, sendWhatsappAuthenticationCode } from './integrations.service.js';

type DeliveryChannel = 'EMAIL' | 'SMS' | 'WHATSAPP';
const hash = (id: string, code: string) => createHmac('sha256', env.JWT_ACCESS_SECRET).update(`form-login:${id}:${code}`).digest('hex');
const invalid = () => new AppError(400, 'INVALID_FORM_CODE', 'Kod geçersiz veya süresi dolmuş. Bilgilerinizi kontrol edip yeni kod isteyin.');
const samePhone = (left?: string | null, right?: string | null) => Boolean(left && right && canonicalPhone(left) === canonicalPhone(right));

export async function requestFormLogin(rawEmail: string | undefined, rawPhone: string | undefined, deliveryChannel: DeliveryChannel) {
  const email = rawEmail ? canonicalEmail(rawEmail) : null;
  if (deliveryChannel === 'SMS' && !/^5\d{9}$/.test((rawPhone ?? '').replace(/ /g, ''))) throw new AppError(400, 'INVALID_PHONE', '5 ile başlayan 10 haneli GSM numarası girin.');
  const phone = rawPhone ? canonicalPhone(rawPhone) : null;
  if (deliveryChannel === 'EMAIL' && !email) throw new AppError(400, 'EMAIL_REQUIRED', 'Geçerli bir e-posta adresi girin.');
  if (deliveryChannel !== 'EMAIL' && (!phone || !/^\d{10,15}$/.test(phone))) throw new AppError(400, 'INVALID_PHONE', 'Seçtiğiniz doğrulama yöntemi için geçerli bir telefon numarası girin.');
  const candidates = await db.conversation.findMany({
    where: { deletedAt: null, customer: { deletedAt: null, isActive: true }, ...(email ? { OR: [{ formRequest: { is: { email } } }, { customer: { email } }] } : {}) },
    include: { formRequest: true, customer: { select: { id: true, email: true, phone: true } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  const conversation = candidates.find(item => deliveryChannel === 'EMAIL'
    ? [item.formRequest?.email, item.customer.email].some(value => value && canonicalEmail(value) === email)
    : samePhone(item.formRequest?.phone, phone) || samePhone(item.customer.phone, phone));
  if (!conversation) return { found: false as const };
  const challengeId = randomUUID(), code = String(randomInt(100000, 1000000));
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM Conversation WHERE id = ${conversation.id} FOR UPDATE`;
    const now = new Date();
    const previous = await tx.formLoginChallenge.findUnique({ where: { conversationId: conversation.id } });
    const sameWindow = previous && now.getTime() - previous.requestWindowAt.getTime() < 120_000;
    if (sameWindow && previous.requests >= 5) throw new AppError(429, 'FORM_LOGIN_RATE_LIMITED', 'Çok fazla kod istendi. İlk kod isteğinizden 2 dakika sonra yeniden deneyin.');
    const data = { id: challengeId, email, deliveryChannel, phone: deliveryChannel !== 'EMAIL' ? phone : null, codeHash: hash(challengeId, code), attempts: 0, consumedAt: null, requests: sameWindow ? previous.requests + 1 : 1, requestWindowAt: sameWindow ? previous.requestWindowAt : now, expiresAt: new Date(now.getTime() + 600_000), createdAt: now };
    await tx.formLoginChallenge.upsert({ where: { conversationId: conversation.id }, create: { conversationId: conversation.id, ...data }, update: data });
    if (deliveryChannel === 'EMAIL') await queueSupportEmail(email!, 'Destek taleplerinize giriş kodunuz', `Destek taleplerinizi görüntülemek için e-posta doğrulama kodunuz: ${code}\n\nKod 10 dakika geçerlidir ve yalnızca bir kez kullanılabilir. Bu işlemi siz başlatmadıysanız e-postayı dikkate almayın.`, 'Form e-posta doğrulama kodu', { conversationId: conversation.id, userId: conversation.customerId }, [], tx, `${challengeId}:FORM_LOGIN`);
  });
  if (deliveryChannel !== 'EMAIL') {
    try { if (deliveryChannel === 'SMS') await sendFormLoginSmsCode(phone!, code); else await sendWhatsappAuthenticationCode(phone!, code); }
    catch (error) { await db.formLoginChallenge.updateMany({ where: { id: challengeId }, data: { consumedAt: new Date() } }); throw error; }
  }
  return { found: true as const, challengeId };
}

export async function verifyFormLogin(challengeId: string, code: string) {
  const challenge = await db.formLoginChallenge.findUnique({ where: { id: challengeId } });
  if (!challenge) throw invalid();
  const token = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM Conversation WHERE id = ${challenge.conversationId} FOR UPDATE`;
    const attempt = await tx.formLoginChallenge.updateMany({ where: { id: challengeId, attempts: { lt: 5 }, consumedAt: null, expiresAt: { gt: new Date() }, conversation: { deletedAt: null, customer: { deletedAt: null, isActive: true } } }, data: { attempts: { increment: 1 } } });
    if (!attempt.count) return null;
    const current = await tx.formLoginChallenge.findUniqueOrThrow({ where: { id: challengeId }, include: { conversation: { include: { formRequest: true, customer: { select: { email: true, phone: true } } } } } });
    const rawEmail = [current.conversation.formRequest?.email, current.conversation.customer.email].find(value => value && current.email && canonicalEmail(value) === canonicalEmail(current.email));
    const currentEmail = rawEmail ? canonicalEmail(rawEmail) : null;
    const emailMatches = current.deliveryChannel !== 'EMAIL' || Boolean(current.email && currentEmail && canonicalEmail(current.email) === currentEmail);
    const phoneMatches = current.deliveryChannel === 'EMAIL' || samePhone(current.phone, current.conversation.formRequest?.phone) || samePhone(current.phone, current.conversation.customer.phone);
    if (!emailMatches || !phoneMatches || !timingSafeEqual(Buffer.from(current.codeHash), Buffer.from(hash(challengeId, code)))) return null;
    await tx.formLoginChallenge.update({ where: { id: challengeId }, data: { consumedAt: new Date() } });
    return issueFormEmailSession(tx, current.deliveryChannel === 'EMAIL' ? currentEmail : null, current.deliveryChannel === 'EMAIL' ? null : current.phone, current.deliveryChannel as DeliveryChannel);
  });
  if (!token) throw invalid();
  return { token };
}
