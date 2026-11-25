import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export type LicenseReason =
  | 'DISABLED'
  | 'OK'
  | 'NOT_CONFIGURED'
  | 'API_KEY_INVALID'
  | 'SERVICE_DISABLED'
  | 'NO_ACTIVE_LICENSE'
  | 'KEY_MISMATCH'
  | 'INVALID'
  | 'SERVER_UNREACHABLE';

export type LicenseStatus = {
  enabled: boolean;
  valid: boolean;
  reason: LicenseReason;
  message: string;
  companyName: string | null;
  packageName: string | null;
  productName: string | null;
  domain: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  unlimited: boolean;
  checkedAt: string;
  graceMode: boolean;
};

export type LicenseConfig = {
  enabled: boolean;
  apiUrl: string;
  apiKey: string;
  domain: string;
  email: string;
  productId?: number;
  packageId?: number;
  productName: string;
  packageName: string;
  expectedKey: string;
  cacheTtlMinutes: number;
  graceHours: number;
};

type RemotePaketKontrolPayload = {
  basarili?: boolean;
  erisim_var?: boolean;
  mesaj?: string;
  veri?: {
    musteri?: {
      id?: number;
      ad?: string | null;
      eposta?: string | null;
    } | null;
    lisans?: {
      id?: number;
      lisans_anahtari?: string | null;
      baslangic_tarihi?: string | null;
      bitis_tarihi?: string | null;
      suresiz?: number | boolean | null;
      durum?: string | null;
      domain?: string | null;
      urun_adi?: string | null;
      paket_adi?: string | null;
      lisans_tipi_adi?: string | null;
    } | null;
  } | null;
};

type CacheState = {
  status: LicenseStatus;
  expiresAtMs: number;
  lastValidStatus: LicenseStatus | null;
  lastValidAtMs: number | null;
};

const REQUEST_TIMEOUT_MS = 8000;
const INVALID_CACHE_TTL_MS = 60_000;
const UNREACHABLE_CACHE_TTL_MS = 30_000;
const GRACE_RETRY_TTL_MS = 2 * 60_000;

let cache: CacheState | null = null;
let inFlight: Promise<LicenseStatus> | null = null;

export function normalizeDomain(value: string | null | undefined): string {
  const raw = String(value ?? '').trim().toLowerCase();
  if (!raw) return '';
  const withoutProtocol = raw.replace(/^https?:\/\//, '');
  const hostOnly = withoutProtocol.split('/')[0]?.split(':')[0] ?? '';
  return hostOnly.replace(/^www\./, '').trim();
}

export function getEnvLicenseConfig(): LicenseConfig {
  return {
    enabled: env.LICENSE_ENABLED,
    apiUrl: env.LICENSE_API_URL,
    apiKey: env.LICENSE_API_KEY,
    domain: env.LICENSE_DOMAIN,
    email: env.LICENSE_EMAIL,
    productId: env.LICENSE_PRODUCT_ID,
    packageId: env.LICENSE_PACKAGE_ID,
    productName: env.LICENSE_PRODUCT_NAME,
    packageName: env.LICENSE_PACKAGE_NAME,
    expectedKey: env.LICENSE_EXPECTED_KEY,
    cacheTtlMinutes: env.LICENSE_CACHE_TTL_MINUTES,
    graceHours: env.LICENSE_GRACE_HOURS,
  };
}

function makeStatus(
  partial: Partial<LicenseStatus> & Pick<LicenseStatus, 'enabled' | 'valid' | 'reason' | 'message'>,
  nowMs: number,
): LicenseStatus {
  return {
    companyName: null,
    packageName: null,
    productName: null,
    domain: null,
    startsAt: null,
    expiresAt: null,
    unlimited: false,
    graceMode: false,
    checkedAt: new Date(nowMs).toISOString(),
    ...partial,
  };
}

export async function verifyRemoteLicense(
  config: LicenseConfig,
  fetchImpl: typeof fetch = fetch,
  nowMs = Date.now(),
): Promise<LicenseStatus> {
  if (!config.enabled) {
    return makeStatus(
      {
        enabled: false,
        valid: true,
        reason: 'DISABLED',
        message: 'Lisans kontrolü devre dışı.',
      },
      nowMs,
    );
  }

  const normalizedDomain = normalizeDomain(config.domain);
  const cleanEmail = config.email.trim();
  const cleanApiKey = config.apiKey.trim();

  if (!cleanApiKey) {
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'NOT_CONFIGURED',
        message: 'Lisans servis anahtarı (LICENSE_API_KEY) tanımlı değil.',
      },
      nowMs,
    );
  }

  if (!normalizedDomain && !cleanEmail) {
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'NOT_CONFIGURED',
        message: 'Lisans doğrulaması için LICENSE_DOMAIN veya LICENSE_EMAIL tanımlanmalıdır.',
      },
      nowMs,
    );
  }

  const body: Record<string, string | number> = {};
  if (normalizedDomain) body.domain = normalizedDomain;
  if (cleanEmail) body.eposta = cleanEmail;
  if (config.productId) body.urun_id = config.productId;
  if (config.packageId) body.paket_id = config.packageId;
  if (config.productName.trim()) body.urun_adi = config.productName.trim();
  if (config.packageName.trim()) body.paket_adi = config.packageName.trim();

  const response = await fetchImpl(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
      'x-api-key': cleanApiKey,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (response.status === 401) {
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'API_KEY_INVALID',
        message: 'Lisans servis anahtarı (LICENSE_API_KEY) geçersiz.',
      },
      nowMs,
    );
  }

  if (response.status === 503) {
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'SERVICE_DISABLED',
        message: 'Lisans sunucusunda paket erişim servisi kapalı (PAKET_ERISIM_AKTIF=false).',
      },
      nowMs,
    );
  }

  if (!response.ok) {
    throw new Error(`Lisans sunucusu HTTP ${response.status} döndürdü.`);
  }

  const payload = (await response.json()) as RemotePaketKontrolPayload;
  if (!payload || payload.basarili !== true) {
    throw new Error(payload?.mesaj || 'Lisans sunucusundan geçersiz yanıt alındı.');
  }

  if (!payload.erisim_var || !payload.veri?.lisans) {
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'NO_ACTIVE_LICENSE',
        message: payload.mesaj || 'Aktif ve geçerli bir lisans bulunamadı.',
        domain: normalizedDomain || null,
      },
      nowMs,
    );
  }

  const lisans = payload.veri.lisans;
  const musteri = payload.veri.musteri;
  const baseDetails = {
    companyName: musteri?.ad ? String(musteri.ad).trim() : null,
    packageName: lisans.paket_adi ? String(lisans.paket_adi).trim() : null,
    productName: lisans.urun_adi ? String(lisans.urun_adi).trim() : null,
    domain: lisans.domain ? String(lisans.domain).trim() : (normalizedDomain || null),
    startsAt: lisans.baslangic_tarihi ? String(lisans.baslangic_tarihi) : null,
    expiresAt: lisans.bitis_tarihi ? String(lisans.bitis_tarihi) : null,
    unlimited: Boolean(Number(lisans.suresiz)),
  };

  const expectedKey = config.expectedKey.trim();
  const licensedKey = String(lisans.lisans_anahtari ?? '').trim();
  if (expectedKey && expectedKey !== licensedKey) {
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'KEY_MISMATCH',
        message: 'Lisans anahtarı doğrulanamadı.',
        ...baseDetails,
      },
      nowMs,
    );
  }

  return makeStatus(
    {
      enabled: true,
      valid: true,
      reason: 'OK',
      message: 'Lisans geçerli.',
      ...baseDetails,
    },
    nowMs,
  );
}

export function resetLicenseCache() {
  cache = null;
  inFlight = null;
}

export async function getLicenseStatus(options?: {
  forceRefresh?: boolean;
  config?: LicenseConfig;
  fetchImpl?: typeof fetch;
  nowMs?: number;
}): Promise<LicenseStatus> {
  const nowMs = options?.nowMs ?? Date.now();
  const config = options?.config ?? getEnvLicenseConfig();
  const fetchImpl = options?.fetchImpl ?? fetch;
  const forceRefresh = Boolean(options?.forceRefresh);

  if (!config.enabled) {
    return makeStatus(
      {
        enabled: false,
        valid: true,
        reason: 'DISABLED',
        message: 'Lisans kontrolü devre dışı.',
      },
      nowMs,
    );
  }

  if (!forceRefresh && cache && nowMs < cache.expiresAtMs) {
    return cache.status;
  }

  if (!forceRefresh && inFlight) {
    return inFlight;
  }

  const run = (async () => {
    try {
      const status = await verifyRemoteLicense(config, fetchImpl, nowMs);
      const ttlMs = status.valid ? config.cacheTtlMinutes * 60_000 : INVALID_CACHE_TTL_MS;
      cache = {
        status,
        expiresAtMs: nowMs + ttlMs,
        lastValidStatus: status.valid ? status : (cache?.lastValidStatus ?? null),
        lastValidAtMs: status.valid ? nowMs : (cache?.lastValidAtMs ?? null),
      };
      return status;
    } catch (error) {
      const graceMs = config.graceHours * 3600_000;
      if (
        cache?.lastValidStatus &&
        cache.lastValidAtMs !== null &&
        graceMs > 0 &&
        nowMs - cache.lastValidAtMs <= graceMs
      ) {
        const graceStatus: LicenseStatus = {
          ...cache.lastValidStatus,
          checkedAt: new Date(nowMs).toISOString(),
          graceMode: true,
        };
        cache = {
          ...cache,
          status: graceStatus,
          expiresAtMs: nowMs + GRACE_RETRY_TTL_MS,
        };
        return graceStatus;
      }

      const unreachableStatus = makeStatus(
        {
          enabled: true,
          valid: false,
          reason: 'SERVER_UNREACHABLE',
          message:
            error instanceof Error && error.message
              ? `Lisans sunucusuna ulaşılamadı (${error.message})`
              : 'Lisans sunucusuna ulaşılamadı. Lütfen bağlantıyı kontrol edip tekrar deneyin.',
        },
        nowMs,
      );
      cache = {
        status: unreachableStatus,
        expiresAtMs: nowMs + UNREACHABLE_CACHE_TTL_MS,
        lastValidStatus: cache?.lastValidStatus ?? null,
        lastValidAtMs: cache?.lastValidAtMs ?? null,
      };
      return unreachableStatus;
    } finally {
      inFlight = null;
    }
  })();

  if (!forceRefresh) {
    inFlight = run;
  }
  return run;
}

const LICENSE_EXEMPT_PREFIXES = ['/public/license'];

export async function requireValidLicense(req: Request, res: Response, next: NextFunction) {
  if (!env.LICENSE_ENABLED) {
    return next();
  }
  if (LICENSE_EXEMPT_PREFIXES.some(prefix => req.path === prefix || req.path.startsWith(`${prefix}/`))) {
    return next();
  }
  try {
    const status = await getLicenseStatus();
    if (status.valid) {
      return next();
    }
    return res.status(403).json({
      success: false,
      error: {
        code: 'LICENSE_INVALID',
        message: status.message,
        details: status,
      },
    });
  } catch (error) {
    return next(error);
  }
}
