import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';

export type LicenseReason =
  | 'DISABLED'
  | 'OK'
  | 'NOT_CONFIGURED'
  | 'CUSTOMER_NOT_FOUND'
  | 'CUSTOMER_INACTIVE'
  | 'PACKAGE_INACTIVE'
  | 'EXPIRED'
  | 'DOMAIN_MISMATCH'
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
  checkedAt: string;
  graceMode: boolean;
};

export type LicenseConfig = {
  enabled: boolean;
  apiUrl: string;
  companyCode: string;
  packageCode: string;
  expectedDomain: string;
  expectedKey: string;
  cacheTtlMinutes: number;
  graceHours: number;
};

type RemoteLicensePayload = {
  success?: boolean;
  found?: boolean;
  gecerli?: boolean;
  message?: string;
  durum?: {
    musteriAktif?: boolean;
    paketAktif?: boolean;
    suresiGecmis?: boolean;
  };
  data?: {
    id?: number;
    domain?: string | null;
    baslangicTarihi?: string | null;
    bitisTarihi?: string | null;
    lisansAnahtari?: string | null;
    musteri?: { unvan?: string | null; firmaKodu?: string | null } | null;
    paket?: { adi?: string | null; paketKodu?: string | null } | null;
    urun?: { adi?: string | null } | null;
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
    companyCode: env.LICENSE_COMPANY_CODE,
    packageCode: env.LICENSE_PACKAGE_CODE,
    expectedDomain: env.LICENSE_EXPECTED_DOMAIN,
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

  if (!config.companyCode.trim() || !config.packageCode.trim()) {
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'NOT_CONFIGURED',
        message: 'Lisans bilgileri (firma kodu ve paket kodu) yapılandırılmamış.',
      },
      nowMs,
    );
  }

  const response = await fetchImpl(config.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      firmaKodu: config.companyCode.trim(),
      paketKodu: config.packageCode.trim(),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });

  if (!response.ok) {
    throw new Error(`Lisans sunucusu HTTP ${response.status} döndürdü.`);
  }

  const payload = (await response.json()) as RemoteLicensePayload;
  if (!payload || payload.success !== true) {
    throw new Error(payload?.message || 'Lisans sunucusundan geçersiz yanıt alındı.');
  }

  const data = payload.data ?? null;
  const baseDetails = {
    companyName: data?.musteri?.unvan ? String(data.musteri.unvan).trim() : null,
    packageName: data?.paket?.adi ? String(data.paket.adi).trim() : null,
    productName: data?.urun?.adi ? String(data.urun.adi).trim() : null,
    domain: data?.domain ? String(data.domain).trim() : null,
    startsAt: data?.baslangicTarihi ? String(data.baslangicTarihi) : null,
    expiresAt: data?.bitisTarihi ? String(data.bitisTarihi) : null,
  };

  if (!payload.found) {
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'CUSTOMER_NOT_FOUND',
        message: 'Lisans sunucusunda bu firma koduna ait kayıt bulunamadı.',
        ...baseDetails,
      },
      nowMs,
    );
  }

  if (!payload.gecerli) {
    const durum = payload.durum ?? {};
    if (durum.musteriAktif === false) {
      return makeStatus(
        {
          enabled: true,
          valid: false,
          reason: 'CUSTOMER_INACTIVE',
          message: 'Müşteri lisans hesabı pasif durumda.',
          ...baseDetails,
        },
        nowMs,
      );
    }
    if (durum.suresiGecmis === true) {
      return makeStatus(
        {
          enabled: true,
          valid: false,
          reason: 'EXPIRED',
          message: 'Destek paneli lisans süresi dolmuş.',
          ...baseDetails,
        },
        nowMs,
      );
    }
    if (durum.paketAktif === false) {
      return makeStatus(
        {
          enabled: true,
          valid: false,
          reason: 'PACKAGE_INACTIVE',
          message: 'Bu ürün için aktif bir lisans paketi bulunamadı.',
          ...baseDetails,
        },
        nowMs,
      );
    }
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'INVALID',
        message: 'Lisans doğrulanamadı.',
        ...baseDetails,
      },
      nowMs,
    );
  }

  const expectedDomain = normalizeDomain(config.expectedDomain);
  const licensedDomain = normalizeDomain(data?.domain);
  if (expectedDomain && licensedDomain && expectedDomain !== licensedDomain) {
    return makeStatus(
      {
        enabled: true,
        valid: false,
        reason: 'DOMAIN_MISMATCH',
        message: 'Lisans bu alan adı için tanımlanmamış.',
        ...baseDetails,
      },
      nowMs,
    );
  }

  const expectedKey = config.expectedKey.trim();
  const licensedKey = String(data?.lisansAnahtari ?? '').trim();
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
  const config = options?.config ?? getEnvLicenseConfig();
  const fetchImpl = options?.fetchImpl ?? fetch;
  const nowMs = options?.nowMs ?? Date.now();
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
