import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { z } from 'zod';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import { AppError } from '../utils/errors.js';
import { can } from './permissions.js';
import type { Actor } from '../types/express.js';

export const turnstileSettingsSchema = z.object({
  enabled: z.boolean(), siteKey: z.string().trim().max(256),
  secretKey: z.string().trim().max(2048).optional(),
}).strict();
const key = () => createHash('sha256').update(`turnstile-settings:${env.JWT_ACCESS_SECRET}`).digest();
function encrypt(secret: string) {
  if (!secret) return '';
  const iv = randomBytes(12), cipher = createCipheriv('aes-256-gcm', key(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), encrypted].map(value => value.toString('base64')).join('.');
}
function decrypt(value: string) {
  if (!value) return '';
  try {
    const [iv, tag, encrypted] = value.split('.').map(part => Buffer.from(part, 'base64'));
    const cipher = createDecipheriv('aes-256-gcm', key(), iv); cipher.setAuthTag(tag);
    return Buffer.concat([cipher.update(encrypted), cipher.final()]).toString('utf8');
  } catch { throw new AppError(503, 'CAPTCHA_UNAVAILABLE', 'Cloudflare gizli anahtarı okunamadı. Entegrasyonlardan yeniden kaydedin.'); }
}
export async function effectiveTurnstileSettings() {
  const stored = await db.turnstileSettings.findUnique({ where: { id: 'default' } });
  return stored ? { enabled: stored.enabled, siteKey: stored.siteKey, secretKey: stored.enabled ? decrypt(stored.secretCiphertext) : '' }
    : { enabled: env.TURNSTILE_ENABLED, siteKey: env.TURNSTILE_SITE_KEY, secretKey: env.TURNSTILE_SECRET_KEY };
}
export async function getTurnstileSettings(actor: Actor) {
  if (!can(actor, 'integrations.view')) throw new AppError(403, 'FORBIDDEN', 'Entegrasyonları görüntüleme yetkiniz yok.');
  const stored = await db.turnstileSettings.findUnique({ where: { id: 'default' } });
  return stored ? { enabled: stored.enabled, siteKey: stored.siteKey, secretConfigured: Boolean(stored.secretCiphertext), secretLength: decrypt(stored.secretCiphertext).length }
    : { enabled: env.TURNSTILE_ENABLED, siteKey: env.TURNSTILE_SITE_KEY, secretConfigured: Boolean(env.TURNSTILE_SECRET_KEY), secretLength: env.TURNSTILE_SECRET_KEY.length };
}
export async function revealTurnstileSecret(actor: Actor) {
  if (!can(actor, 'integrations.update')) throw new AppError(403, 'FORBIDDEN', 'Entegrasyon ayarlarını değiştirme yetkiniz yok.');
  const stored = await db.turnstileSettings.findUnique({ where: { id: 'default' } });
  return { secretKey: stored ? decrypt(stored.secretCiphertext) : env.TURNSTILE_SECRET_KEY };
}
export async function saveTurnstileSettings(actor: Actor, input: z.infer<typeof turnstileSettingsSchema>) {
  if (!can(actor, 'integrations.update')) throw new AppError(403, 'FORBIDDEN', 'Entegrasyon ayarlarını değiştirme yetkiniz yok.');
  return db.$transaction(async tx => {
    const current = await tx.turnstileSettings.findUnique({ where: { id: 'default' } });
    // Empty secret preserves the current key; disclosure uses the separate authorized endpoint.
    const ciphertext = input.secretKey ? encrypt(input.secretKey) : current?.secretCiphertext ?? encrypt(env.TURNSTILE_SECRET_KEY);
    if (input.enabled && (!input.siteKey || !ciphertext)) throw new AppError(400, 'CAPTCHA_KEYS_REQUIRED', 'Cloudflare için Site Key ve Secret Key girin.');
    if (input.enabled && env.NODE_ENV === 'production' && [input.siteKey, input.secretKey || decrypt(ciphertext)].some(value => /^[123]x0{10}/.test(value))) throw new AppError(400, 'CAPTCHA_TEST_KEY', 'Canlı ortamda Cloudflare test anahtarı kullanılamaz.');
    const saved = await tx.turnstileSettings.upsert({ where: { id: 'default' }, create: { enabled: input.enabled, siteKey: input.siteKey, secretCiphertext: ciphertext }, update: { enabled: input.enabled, siteKey: input.siteKey, secretCiphertext: ciphertext } });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'integrations.updated', entityType: 'TurnstileSettings', entityId: 'default', metadata: { channel: 'CLOUDFLARE', enabled: saved.enabled, secretChanged: Boolean(input.secretKey) }, ipAddress: actor.ipAddress } });
    return { enabled: saved.enabled, siteKey: saved.siteKey, secretConfigured: Boolean(saved.secretCiphertext), secretLength: decrypt(saved.secretCiphertext).length };
  });
}
