import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  getLicenseStatus,
  normalizeDomain,
  resetLicenseCache,
  verifyRemoteLicense,
  type LicenseConfig,
} from '../src/services/license.service.js';

const baseConfig: LicenseConfig = {
  enabled: true,
  apiUrl: 'https://lic.guzelteknoloji.com/api/erisim/paket-kontrol',
  apiKey: 'secret-erisim-key-123',
  domain: 'https://www.destek.guzelteknoloji.com/',
  email: '',
  productId: 1,
  packageId: undefined,
  productName: '',
  packageName: '',
  expectedKey: 'GT-ABCD-1234-EFGH-5678',
  cacheTtlMinutes: 15,
  graceHours: 24,
};

function mockFetch(body: unknown, status = 200): typeof fetch {
  return (async () =>
    new Response(JSON.stringify(body), {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

test('normalizeDomain strips protocol, www, port and path', () => {
  assert.equal(normalizeDomain('https://www.Destek.GuzelTeknoloji.com:443/panel'), 'destek.guzelteknoloji.com');
  assert.equal(normalizeDomain('http://destek.guzelteknoloji.com/'), 'destek.guzelteknoloji.com');
  assert.equal(normalizeDomain(''), '');
});

test('returns DISABLED when LICENSE_ENABLED is false', async () => {
  const result = await verifyRemoteLicense({ ...baseConfig, enabled: false });
  assert.equal(result.enabled, false);
  assert.equal(result.valid, true);
  assert.equal(result.reason, 'DISABLED');
});

test('returns NOT_CONFIGURED when apiKey or domain/email is missing', async () => {
  const missingKey = await verifyRemoteLicense({ ...baseConfig, apiKey: '' });
  assert.equal(missingKey.valid, false);
  assert.equal(missingKey.reason, 'NOT_CONFIGURED');

  const missingFilter = await verifyRemoteLicense({ ...baseConfig, domain: '', email: '' });
  assert.equal(missingFilter.valid, false);
  assert.equal(missingFilter.reason, 'NOT_CONFIGURED');
});

test('sends x-api-key and normalized domain to lic.guzelteknoloji.com and accepts valid license', async () => {
  let receivedHeaders: Record<string, string> = {};
  let receivedBody: Record<string, unknown> | null = null;
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    receivedHeaders = (init?.headers ?? {}) as Record<string, string>;
    receivedBody = JSON.parse(String(init?.body ?? '{}'));
    return new Response(
      JSON.stringify({
        basarili: true,
        erisim_var: true,
        mesaj: 'Paket erisimi bulundu.',
        veri: {
          musteri: { id: 3, ad: 'GÜZEL İÇ VE DIŞ TİCARET LİMİTED ŞİRKETİ', eposta: 'bilgi@guzelteknoloji.com' },
          lisans: {
            id: 42,
            lisans_anahtari: 'GT-ABCD-1234-EFGH-5678',
            baslangic_tarihi: '2026-01-01T00:00:00.000Z',
            bitis_tarihi: null,
            suresiz: 1,
            durum: 'aktif',
            domain: 'destek.guzelteknoloji.com',
            urun_adi: 'Güzelteknoloji Destek',
            paket_adi: 'Destek Pro',
          },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const result = await verifyRemoteLicense(baseConfig, fakeFetch, 1_700_000_000_000);
  assert.equal(receivedHeaders['x-api-key'], 'secret-erisim-key-123');
  assert.deepEqual(receivedBody, { domain: 'destek.guzelteknoloji.com', urun_id: 1 });
  assert.equal(result.valid, true);
  assert.equal(result.reason, 'OK');
  assert.equal(result.unlimited, true);
  assert.equal(result.companyName, 'GÜZEL İÇ VE DIŞ TİCARET LİMİTED ŞİRKETİ');
  assert.equal(result.productName, 'Güzelteknoloji Destek');
  assert.equal(result.packageName, 'Destek Pro');
});

test('handles 401 invalid key, 503 disabled service, erisim_var=false, and key mismatch', async () => {
  const invalidApiKey = await verifyRemoteLicense(baseConfig, mockFetch({ basarili: false }, 401));
  assert.equal(invalidApiKey.valid, false);
  assert.equal(invalidApiKey.reason, 'API_KEY_INVALID');

  const disabledService = await verifyRemoteLicense(baseConfig, mockFetch({ basarili: false }, 503));
  assert.equal(disabledService.valid, false);
  assert.equal(disabledService.reason, 'SERVICE_DISABLED');

  const noLicense = await verifyRemoteLicense(
    baseConfig,
    mockFetch({ basarili: true, erisim_var: false, mesaj: 'Aktif paket erisimi bulunamadi.', veri: null }),
  );
  assert.equal(noLicense.valid, false);
  assert.equal(noLicense.reason, 'NO_ACTIVE_LICENSE');

  const wrongKey = await verifyRemoteLicense(
    baseConfig,
    mockFetch({
      basarili: true,
      erisim_var: true,
      veri: {
        musteri: { ad: 'Test' },
        lisans: { lisans_anahtari: 'GT-XXXX-XXXX-XXXX-XXXX', domain: 'destek.guzelteknoloji.com' },
      },
    }),
  );
  assert.equal(wrongKey.valid, false);
  assert.equal(wrongKey.reason, 'KEY_MISMATCH');
});

test('uses cache and preserves validity during grace period on transient outage', async () => {
  resetLicenseCache();
  let callCount = 0;
  const okFetch = (async () => {
    callCount += 1;
    return new Response(
      JSON.stringify({
        basarili: true,
        erisim_var: true,
        veri: {
          musteri: { ad: 'Güzel Teknoloji' },
          lisans: { lisans_anahtari: 'GT-ABCD-1234-EFGH-5678', domain: 'destek.guzelteknoloji.com', suresiz: 1 },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const t0 = 1_700_000_000_000;
  const first = await getLicenseStatus({ config: baseConfig, fetchImpl: okFetch, nowMs: t0 });
  const second = await getLicenseStatus({ config: baseConfig, fetchImpl: okFetch, nowMs: t0 + 60_000 });
  assert.equal(first.valid, true);
  assert.equal(second.valid, true);
  assert.equal(callCount, 1);

  const failingFetch = (async () => {
    throw new Error('network down');
  }) as unknown as typeof fetch;

  const duringGrace = await getLicenseStatus({
    config: baseConfig,
    fetchImpl: failingFetch,
    nowMs: t0 + 20 * 60_000,
  });
  assert.equal(duringGrace.valid, true);
  assert.equal(duringGrace.graceMode, true);

  const pastGrace = await getLicenseStatus({
    config: baseConfig,
    fetchImpl: failingFetch,
    nowMs: t0 + 25 * 3600_000,
  });
  assert.equal(pastGrace.valid, false);
  assert.equal(pastGrace.reason, 'SERVER_UNREACHABLE');
  resetLicenseCache();
});
