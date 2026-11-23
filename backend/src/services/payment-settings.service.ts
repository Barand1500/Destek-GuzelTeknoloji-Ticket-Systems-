import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import type { Actor } from '../types/express.js';
import { can } from './permissions.js';
import { AppError } from '../utils/errors.js';
import { sealPayment, openPayment } from './payment-secrets.js';
import { iyzicoRequest, type IyzicoConfig } from './iyzico-client.js';
import { paymentProviderLabel } from './payment-gateways.catalog.js';

export const paymentSettingsInput = z.object({
  provider: z.literal('iyzico'), enabled: z.boolean(), recurringEnabled: z.literal(false).default(false),
  mode: z.enum(['sandbox', 'production']), publicUrl: z.url().max(500),
  apiKey: z.string().trim().max(512).optional(), secretKey: z.string().trim().max(512).optional(),
}).strict();
export function paymentStaff(actor: Actor, edit = false) {
  if (actor.role === 'CUSTOMER' || !can(actor, edit ? 'integrations.update' : 'integrations.view'))
    throw new AppError(403, 'FORBIDDEN', 'Ödeme ayarları için yetkiniz yok.');
}
export async function paymentAvailability() {
  const active = await db.paymentGatewaySettings.findFirst({ where: { enabled: true, testedAt: { not: null } }, select: { id: true } });
  if (active) {
    const provider = active.id === 'default' ? 'iyzico' : active.id;
    return { provider, paymentAvailable: true, recurringAvailable: false };
  }
  return { provider: 'iyzico', paymentAvailable: false, recurringAvailable: false };
}
export async function getPaymentSettings(actor: Actor) {
  paymentStaff(actor);
  const row = await db.paymentGatewaySettings.findUnique({ where: { id: 'default' } });
  return { provider: 'iyzico', enabled: row?.enabled ?? false, recurringEnabled: false,
    mode: row?.mode ?? 'production', publicUrl: row?.publicUrl ?? env.FRONTEND_URL,
    credentialsConfigured: Boolean(row?.credentialsCiphertext), testedAt: row?.testedAt ?? null, lastError: row?.lastError ?? null };
}
export async function savePaymentSettings(actor: Actor, raw: unknown) {
  paymentStaff(actor, true);
  const input = paymentSettingsInput.parse(raw);
  const url = new URL(input.publicUrl);
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/' || (url.protocol !== 'https:' && !(input.mode === 'sandbox' && ['localhost', '127.0.0.1'].includes(url.hostname))))
    throw new AppError(400, 'PAYMENT_URL_INVALID', 'Dış erişim adresini alan adı olarak girin; canlı ortamda HTTPS gerekir.');
  await db.$transaction(async tx => {
    // Serialize configuration changes with checkout creation and dispatch claims.
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'default' FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'akbank' FOR UPDATE`;
    if (input.enabled) {
      const other = await tx.paymentGatewaySettings.findFirst({ where: { id: { not: 'default' }, enabled: true }, select: { id: true } });
      if (other) throw new AppError(409, 'PAYMENT_GATEWAY_ACTIVE', `Önce ${paymentProviderLabel(other.id)} online ödemesini kapatın. Aynı anda tek sağlayıcı kullanılabilir.`);
    }
    const current = await tx.paymentGatewaySettings.findUnique({ where: { id: 'default' } });
    const old = current ? openPayment<IyzicoConfig>(current.credentialsCiphertext) : undefined;
    const config: IyzicoConfig = { apiKey: input.apiKey || old?.apiKey || '', secretKey: input.secretKey || old?.secretKey || '', mode: input.mode };
    if (!config.apiKey || !config.secretKey) throw new AppError(400, 'PAYMENT_KEYS_REQUIRED', 'API anahtarı ve gizli anahtar girin.');
    const fingerprint = createHash('sha256').update(JSON.stringify(config)).digest('hex');
    const changed = current?.fingerprint !== fingerprint;
    if (changed && current && (await tx.creditPaymentAttempt.count({ where: { provider: 'iyzico', status: 'PENDING' } }) || await tx.paymentReversal.count({ where: { status: { in: ['PENDING', 'REVIEW'] }, order: { paymentAttempts: { some: { provider: 'iyzico', status: 'PAID' } } } } }) || await tx.creditSubscription.count({ where: { provider: 'iyzico', paymentMethodRef: { not: null }, autoRenew: true, status: { not: 'STOPPED' } } })))
      throw new AppError(409, 'PAYMENT_ACCOUNT_IN_USE', 'Bekleyen ödemeler ve iadeler sonuçlanmadan ödeme hesabı değiştirilemez.');
    const testedAt = changed ? null : current?.testedAt;
    if (input.enabled && !testedAt) throw new AppError(400, 'PAYMENT_TEST_REQUIRED', 'Önce kapalı olarak kaydedin ve bağlantıyı test edin.');
    const data = { enabled: input.enabled, recurringEnabled: false, mode: input.mode, publicUrl: url.origin,
      credentialsCiphertext: sealPayment(config), fingerprint, testedAt, lastError: changed ? null : current?.lastError };
    await tx.paymentGatewaySettings.upsert({ where: { id: 'default' }, create: { id: 'default', ...data }, update: data });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'payments.settings_updated', entityType: 'PaymentGatewaySettings', entityId: 'default', ipAddress: actor.ipAddress,
      metadata: { provider: 'iyzico', enabled: input.enabled, recurringEnabled: false, mode: input.mode, credentialsChanged: changed } } });
  });
  return getPaymentSettings(actor);
}
export async function testPaymentConnection(actor: Actor) {
  paymentStaff(actor, true);
  const row = await db.paymentGatewaySettings.findUnique({ where: { id: 'default' } });
  if (!row) throw new AppError(400, 'PAYMENT_KEYS_REQUIRED', 'Önce ödeme ayarlarını kaydedin.');
  let valid = false;
  try { valid = (await iyzicoRequest(openPayment<IyzicoConfig>(row.credentialsCiphertext), '/payment/bin/check', { locale: 'tr', binNumber: '554960' })).status === 'success'; } catch { /* Report a safe connection result, never provider response bodies or secrets. */ }
  await db.paymentGatewaySettings.updateMany({ where: { id: row.id, fingerprint: row.fingerprint }, data: { testedAt: valid ? new Date() : null, lastError: valid ? null : 'Bağlantı doğrulanamadı. Anahtarları ve ortam seçimini kontrol edin.', ...(!valid ? { enabled: false } : {}) } });
  if (!valid) throw new AppError(400, 'PAYMENT_CONNECTION_FAILED', 'Bağlantı doğrulanamadı. Anahtarları ve ortam seçimini kontrol edin.');
  return getPaymentSettings(actor);
}
