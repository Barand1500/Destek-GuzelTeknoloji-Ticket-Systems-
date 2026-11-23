import { createHash } from 'node:crypto';
import { z } from 'zod';
import { db } from '../config/db.js';
import { env } from '../config/env.js';
import type { Actor } from '../types/express.js';
import { AppError } from '../utils/errors.js';
import { paymentStaff } from './payment-settings.service.js';
import { sealPayment, openPayment } from './payment-secrets.js';
import { getNestpayBank, nestpayBanks, paymentProviderLabel } from './payment-gateways.catalog.js';
import { nestpayInquireOrder, type NestpayConfig } from './nestpay-client.js';

export const nestpaySettingsInput = z.object({
  mode: z.enum(['sandbox', 'production']),
  clientId: z.string().trim().max(128).optional(),
  storeKey: z.string().max(512).optional(),
  apiUser: z.string().trim().max(128).optional(),
  apiPassword: z.string().max(512).optional(),
  enabled: z.boolean().default(false),
  publicUrl: z.url().max(500).optional(),
}).strict();

type Credentials = { clientId: string; storeKey: string; apiUser: string; apiPassword: string };

function requireBank(bankId: string) {
  const bank = getNestpayBank(bankId);
  if (!bank) throw new AppError(404, 'PAYMENT_PROVIDER_INVALID', 'Geçersiz banka sağlayıcısı.');
  return bank;
}

export async function listNestpayGateways(actor: Actor) {
  paymentStaff(actor);
  const rows = await db.paymentGatewaySettings.findMany({
    where: { id: { in: nestpayBanks.map(b => b.id) } },
  });
  const byId = new Map(rows.map(row => [row.id, row]));
  const configured = nestpayBanks
    .filter(bank => byId.has(bank.id))
    .map(bank => {
      const row = byId.get(bank.id)!;
      return {
        provider: bank.id,
        name: bank.name,
        shortName: bank.shortName,
        mode: row.mode as 'sandbox' | 'production',
        credentialsConfigured: Boolean(row.credentialsCiphertext),
        enabled: row.enabled,
        publicUrl: row.publicUrl || env.FRONTEND_URL,
        testedAt: row.testedAt,
        lastError: row.lastError,
        paymentAvailable: Boolean(row.enabled && row.testedAt),
      };
    });
  const catalog = nestpayBanks.map(bank => ({
    id: bank.id,
    name: bank.name,
    shortName: bank.shortName,
    configured: byId.has(bank.id),
  }));
  return { catalog, configured };
}

export async function saveNestpaySettings(actor: Actor, bankId: string, raw: unknown) {
  paymentStaff(actor, true);
  const bank = requireBank(bankId);
  const input = nestpaySettingsInput.parse(raw);
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = 'default' FOR UPDATE`;
    await tx.$queryRaw`SELECT id FROM PaymentGatewaySettings WHERE id = ${bank.id} FOR UPDATE`;
    const row = await tx.paymentGatewaySettings.findUnique({ where: { id: bank.id } });
    const publicUrl = new URL(input.publicUrl || row?.publicUrl || env.FRONTEND_URL);
    if (
      publicUrl.username || publicUrl.password || publicUrl.search || publicUrl.hash || publicUrl.pathname !== '/'
      || (publicUrl.protocol !== 'https:' && !(input.mode === 'sandbox' && publicUrl.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(publicUrl.hostname)))
    ) {
      throw new AppError(400, 'PAYMENT_URL_INVALID', 'Dış erişim adresini alan adı olarak girin; canlı ortamda HTTPS gerekir.');
    }
    const old = row ? openPayment<Credentials>(row.credentialsCiphertext) : undefined;
    const credentials: Credentials = {
      clientId: input.clientId || old?.clientId || '',
      storeKey: input.storeKey || old?.storeKey || '',
      apiUser: input.apiUser || old?.apiUser || '',
      apiPassword: input.apiPassword || old?.apiPassword || '',
    };
    if (!credentials.clientId || !credentials.storeKey.trim() || !credentials.apiUser || !credentials.apiPassword) {
      throw new AppError(400, 'NESTPAY_KEYS_REQUIRED', 'Mağaza No (Client ID), 3D Anahtarı (Store Key), API kullanıcı adı ve şifresini girin.');
    }
    if (row && row.mode !== input.mode && (!input.clientId || !input.storeKey?.trim() || !input.apiUser || !input.apiPassword)) {
      throw new AppError(400, 'NESTPAY_KEYS_REQUIRED', 'Ortam değiştirirken o ortama ait tüm POS bilgilerini yeniden girin.');
    }
    const fingerprint = createHash('sha256').update(JSON.stringify({ ...credentials, mode: input.mode })).digest('hex');
    const changed = fingerprint !== row?.fingerprint;
    if (
      changed && row && (
        await tx.creditPaymentAttempt.count({ where: { provider: bank.id, status: 'PENDING' } })
        || await tx.paymentReversal.count({ where: { status: { in: ['PENDING', 'REVIEW'] }, order: { paymentAttempts: { some: { provider: bank.id, status: 'PAID' } } } } })
      )
    ) {
      throw new AppError(409, 'PAYMENT_ACCOUNT_IN_USE', `Bekleyen ${bank.shortName} ödemeleri ve iadeleri sonuçlanmadan hesap değiştirilemez.`);
    }
    const testedAt = changed ? null : row?.testedAt;
    if (input.enabled && !testedAt) throw new AppError(400, 'PAYMENT_TEST_REQUIRED', `Önce kaydedin ve ${bank.shortName} bağlantısını test edin.`);
    if (input.enabled) {
      const other = await tx.paymentGatewaySettings.findFirst({ where: { id: { not: bank.id }, enabled: true }, select: { id: true } });
      if (other) {
        throw new AppError(409, 'PAYMENT_GATEWAY_ACTIVE', `Önce ${paymentProviderLabel(other.id === 'default' ? 'iyzico' : other.id)} online ödemesini kapatın. Aynı anda tek sağlayıcı kullanılabilir.`);
      }
    }
    const data = {
      mode: input.mode,
      enabled: input.enabled,
      recurringEnabled: false,
      testedAt,
      lastError: changed ? null : row?.lastError,
      publicUrl: publicUrl.origin,
      credentialsCiphertext: sealPayment(credentials),
      fingerprint,
    };
    await tx.paymentGatewaySettings.upsert({ where: { id: bank.id }, create: { id: bank.id, ...data }, update: data });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: 'payments.settings_updated',
        entityType: 'PaymentGatewaySettings',
        entityId: bank.id,
        ipAddress: actor.ipAddress,
        metadata: { provider: bank.id, mode: input.mode, enabled: input.enabled, credentialsChanged: changed },
      },
    });
  });
  return listNestpayGateways(actor);
}

export async function testNestpayConnection(actor: Actor, bankId: string) {
  paymentStaff(actor, true);
  const bank = requireBank(bankId);
  const row = await db.paymentGatewaySettings.findUnique({ where: { id: bank.id } });
  if (!row) throw new AppError(400, 'NESTPAY_KEYS_REQUIRED', `Önce ${bank.shortName} bilgilerini kaydedin.`);
  let valid = false;
  try {
    const config: NestpayConfig = { ...openPayment<Credentials>(row.credentialsCiphertext), bankId: bank.id, mode: row.mode as NestpayConfig['mode'] };
    const result = await nestpayInquireOrder(config, 'connection-check');
    // Valid merchant credentials either return Approved or a "record not found" style error, never auth failure (CORE-2010 / authentication failed).
    const authFailed = /auth|user|password|client|yetki|CORE-2010/i.test(result.errMsg);
    valid = !authFailed && Boolean(result.response || result.procReturnCode);
  } catch { /* Never leak raw bank payload or credentials. */ }
  await db.paymentGatewaySettings.updateMany({
    where: { id: bank.id, fingerprint: row.fingerprint },
    data: {
      testedAt: valid ? new Date() : null,
      lastError: valid ? null : 'Bağlantı doğrulanamadı. POS bilgilerini, ortamı ve bankadaki IP yetkisini kontrol edin.',
      ...(!valid ? { enabled: false } : {}),
    },
  });
  if (!valid) throw new AppError(400, 'PAYMENT_CONNECTION_FAILED', `${bank.shortName} bağlantısı doğrulanamadı. POS bilgilerini ve banka IP yetkisini kontrol edin.`);
  return listNestpayGateways(actor);
}

export async function removeNestpayGateway(actor: Actor, bankId: string) {
  paymentStaff(actor, true);
  const bank = requireBank(bankId);
  await db.$transaction(async tx => {
    const row = await tx.paymentGatewaySettings.findUnique({ where: { id: bank.id } });
    if (!row) return;
    if (row.enabled) throw new AppError(409, 'PAYMENT_ACCOUNT_IN_USE', 'Aktif ödeme sağlayıcısı kaldırılamaz. Önce devre dışı bırakın.');
    if (await tx.creditPaymentAttempt.count({ where: { provider: bank.id } })) {
      throw new AppError(409, 'PAYMENT_ACCOUNT_IN_USE', 'Bu banka ile yapılmış işlem kayıtları bulunduğu için kaldırılamaz; kapalı durumda tutabilirsiniz.');
    }
    await tx.paymentGatewaySettings.delete({ where: { id: bank.id } });
    await tx.activityLog.create({
      data: {
        userId: actor.id,
        action: 'payments.settings_updated',
        entityType: 'PaymentGatewaySettings',
        entityId: bank.id,
        ipAddress: actor.ipAddress,
        metadata: { provider: bank.id, enabled: false },
      },
    });
  });
  return listNestpayGateways(actor);
}
