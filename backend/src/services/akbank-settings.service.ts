import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../config/db.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { paymentStaff } from './payment-settings.service.js';
import { sealPayment, openPayment } from './payment-secrets.js';
import { env } from '../config/env.js';
import { akbankRequest, akbankNoTransaction, type AkbankConfig } from './akbank-client.js';
import { paymentProviderLabel } from './payment-gateways.catalog.js';

// Separate credential snapshot; enabling requires the other gateway to be disabled first.
const settingsId = 'akbank';
export const akbankSettingsInput = z.object({
  mode: z.enum(['sandbox', 'production']),
  merchantSafeId: z.string().trim().max(128).optional(),
  terminalSafeId: z.string().trim().max(128).optional(),
  secretKey: z.string().max(512).optional(),
  enabled: z.boolean().default(false),
  recurringEnabled: z.literal(false).default(false),
  publicUrl: z.url().max(500).optional(),
}).strict();
type Credentials = { merchantSafeId: string; terminalSafeId: string; secretKey: string };

export async function getAkbankSettings(actor: Actor) {
  paymentStaff(actor);
  const row = await db.paymentGatewaySettings.findUnique({ where: { id: settingsId } });
  return { provider: 'akbank', mode: row?.mode ?? 'production', credentialsConfigured: Boolean(row?.credentialsCiphertext), enabled: row?.enabled ?? false, recurringEnabled: false,
    publicUrl: row?.publicUrl || env.FRONTEND_URL, testedAt: row?.testedAt ?? null, lastError: row?.lastError ?? null, paymentAvailable: Boolean(row?.enabled && row.testedAt) };
}

export async function saveAkbankSettings(actor: Actor, raw: unknown) {
  paymentStaff(actor, true);
  const input = akbankSettingsInput.parse(raw);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'default' FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'akbank' FOR UPDATE`;
    const row = await tx.paymentGatewaySettings.findUnique({ where: { id: settingsId } });
    const publicUrl = new URL(input.publicUrl || row?.publicUrl || env.FRONTEND_URL);
    if (publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/' || (publicUrl.protocol !== 'https:' && !(input.mode === 'sandbox' && publicUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(publicUrl.hostname))))
      throw new AppError(400, 'PAYMENT_URL_INVALID', 'Dış erişim adresini alan adı olarak girin; canlı ortamda HTTPS gerekir.');
    const old = row ? openPayment<Credentials>(row.credentialsCiphertext) : undefined;
    const credentials: Credentials = {
      merchantSafeId: input.merchantSafeId || old?.merchantSafeId || '',
      terminalSafeId: input.terminalSafeId || old?.terminalSafeId || '',
      secretKey: input.secretKey || old?.secretKey || '',
    };
    if (!credentials.merchantSafeId || !credentials.terminalSafeId || !credentials.secretKey.trim())
      throw new AppError(400, 'AKBANK_KEYS_REQUIRED', 'İşyeri kimliği, Terminal Safe ID ve güvenlik anahtarını girin.');
    // Test credentials must never silently become production credentials (or vice versa).
    if (row && row.mode !== input.mode && (!input.merchantSafeId || !input.terminalSafeId || !input.secretKey?.trim()))
      throw new AppError(400, 'AKBANK_KEYS_REQUIRED', 'Ortam değiştirirken o ortama ait üç bilgiyi yeniden girin.');
    const fingerprint = createHash('sha256').update(JSON.stringify({ ...credentials, mode: input.mode })).digest('hex');
    const changed = fingerprint !== row?.fingerprint;
    if (changed && row && await tx.akbankRecurringInstruction.count({ where: { state: { notIn: ['STOPPED', 'FAILED', 'COMPLETED'] } } }))
      throw new AppError(409, 'PAYMENT_ACCOUNT_IN_USE', 'Bankadaki yenileme talimatları kapatılıp doğrulanmadan Akbank hesabı değiştirilemez.');
    if (changed && row && (await tx.creditPaymentAttempt.count({ where: { provider: 'akbank', status: 'PENDING' } }) || await tx.paymentReversal.count({ where: { status: { in: ['PENDING', 'REVIEW'] }, order: { paymentAttempts: { some: { provider: 'akbank', status: 'PAID' } } } } })))
      throw new AppError(409, 'PAYMENT_ACCOUNT_IN_USE', 'Bekleyen Akbank ödemeleri ve iadeleri sonuçlanmadan hesap değiştirilemez.');
    const testedAt = changed ? null : row?.testedAt;
    if (input.enabled && !testedAt) throw new AppError(400, 'PAYMENT_TEST_REQUIRED', 'Önce kaydedin ve Akbank bağlantısını test edin.');
    const other = input.enabled ? await tx.paymentGatewaySettings.findFirst({ where: { id: { not: settingsId }, enabled: true }, select: { id: true } }) : null;
    if (other) throw new AppError(409, 'PAYMENT_GATEWAY_ACTIVE', `Önce ${paymentProviderLabel(other.id === 'default' ? 'iyzico' : other.id)} online ödemesini kapatın. Aynı anda tek sağlayıcı kullanılabilir.`);
    if (row?.recurringEnabled && (!input.enabled || !input.recurringEnabled)) {
      const instructions = await tx.akbankRecurringInstruction.findMany({ where: { state: { notIn: ['STOPPED', 'FAILED', 'COMPLETED'] } }, select: { subscriptionId: true } });
      await tx.akbankRecurringInstruction.updateMany({ where: { state: { notIn: ['STOPPED', 'FAILED', 'COMPLETED'] } }, data: { state: 'STOP_REQUESTED' } });
      await tx.creditSubscription.updateMany({ where: { id: { in: instructions.map(row => row.subscriptionId) } }, data: { autoRenew: false, status: 'STOPPED', stoppedAt: new Date(), nextPaymentOn: null } });
    }
    const data = { mode: input.mode, enabled: input.enabled, recurringEnabled: false, testedAt, lastError: changed ? null : row?.lastError,
      publicUrl: publicUrl.origin, credentialsCiphertext: sealPayment(credentials), fingerprint };
    await tx.paymentGatewaySettings.upsert({ where: { id: settingsId }, create: { id: settingsId, ...data }, update: data });
    await tx.activityLog.create({ data: { userId: actor.id, action: 'payments.akbank_settings_updated', entityType: 'PaymentGatewaySettings', entityId: settingsId,
      ipAddress: actor.ipAddress, metadata: { provider: 'akbank', mode: input.mode, enabled: input.enabled } } });
  });
  return getAkbankSettings(actor);
}

export async function testAkbankConnection(actor: Actor) {
  paymentStaff(actor, true);
  const row = await db.paymentGatewaySettings.findUnique({ where: { id: settingsId } });
  if (!row) throw new AppError(400, 'AKBANK_KEYS_REQUIRED', 'Önce Akbank bilgilerini kaydedin.');
  let valid = false;
  try {
    const config = { ...openPayment<Credentials>(row.credentialsCiphertext), mode: row.mode as AkbankConfig['mode'] };
    const result = await akbankRequest(config, '1010', { order: { orderId: 'connection-check' } });
    valid = String(result.txnCode) === '1010' && (result.responseCode === 'VPS-0000' || akbankNoTransaction.has(result.responseCode));
  } catch { /* Return only a safe connection result; never bank payloads or credentials. */ }
  await db.paymentGatewaySettings.updateMany({ where: { id: settingsId, fingerprint: row.fingerprint }, data: { testedAt: valid ? new Date() : null,
    lastError: valid ? null : 'Bağlantı doğrulanamadı. POS bilgilerini, ortamı ve bankadaki IP yetkisini kontrol edin.', ...(!valid ? { enabled: false } : {}) } });
  if (!valid) throw new AppError(400, 'PAYMENT_CONNECTION_FAILED', 'Akbank bağlantısı doğrulanamadı. POS bilgilerini ve banka IP yetkisini kontrol edin.');
  return getAkbankSettings(actor);
}
