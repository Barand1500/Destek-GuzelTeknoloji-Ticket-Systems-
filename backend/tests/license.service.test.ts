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
  apiUrl: 'https://lic.guzelteknoloji.com/api/public/license/check',
  companyCode: 'FIRMA-001',
  packageCode: 'DESTEK-PRO',
  expectedDomain: 'destek.guzelteknoloji.com',
  expectedKey: 'LIC-KEY-123',
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

test('returns NOT_CONFIGURED when companyCode or packageCode is empty', async () => {
  const result = await verifyRemoteLicense({ ...baseConfig, companyCode: '' });
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'NOT_CONFIGURED');
});

test('accepts valid license matching domain and key', async () => {
  let receivedBody: Record<string, unknown> | null = null;
  const fakeFetch = (async (_url: string | URL | Request, init?: RequestInit) => {
    receivedBody = JSON.parse(String(init?.body ?? '{}'));
    return new Response(
      JSON.stringify({
        success: true,
        found: true,
        gecerli: true,
        durum: { musteriAktif: true, paketAktif: true, suresiGecmis: false },
        data: {
          id: 10,
          domain: 'https://destek.guzelteknoloji.com/',
          baslangicTarihi: '2026-01-01T00:00:00.000Z',
          bitisTarihi: '2027-01-01T00:00:00.000Z',
          lisansAnahtari: 'LIC-KEY-123',
          musteri: { unvan: 'Güzel Teknoloji A.Ş.', firmaKodu: 'FIRMA-001' },
          paket: { adi: 'Destek Pro', paketKodu: 'DESTEK-PRO' },
          urun: { adi: 'Destek Paneli' },
        },
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } },
    );
  }) as unknown as typeof fetch;

  const result = await verifyRemoteLicense(baseConfig, fakeFetch, 1_700_000_000_000);
  assert.deepEqual(receivedBody, { firmaKodu: 'FIRMA-001', paketKodu: 'DESTEK-PRO' });
  assert.equal(result.valid, true);
  assert.equal(result.reason, 'OK');
  assert.equal(result.companyName, 'Güzel Teknoloji A.Ş.');
  assert.equal(result.packageName, 'Destek Pro');
  assert.equal(result.productName, 'Destek Paneli');
});

test('rejects expired, inactive, domain mismatch, and key mismatch licenses', async () => {
  const expired = await verifyRemoteLicense(
    baseConfig,
    mockFetch({
      success: true,
      found: true,
      gecerli: false,
      durum: { musteriAktif: true, paketAktif: true, suresiGecmis: true },
      data: null,
    }),
  );
  assert.equal(expired.valid, false);
  assert.equal(expired.reason, 'EXPIRED');

  const wrongDomain = await verifyRemoteLicense(
    baseConfig,
    mockFetch({
      success: true,
      found: true,
      gecerli: true,
      durum: { musteriAktif: true, paketAktif: true, suresiGecmis: false },
      data: { domain: 'baska.domain.com', lisansAnahtari: 'LIC-KEY-123' },
    }),
  );
  assert.equal(wrongDomain.valid, false);
  assert.equal(wrongDomain.reason, 'DOMAIN_MISMATCH');

  const wrongKey = await verifyRemoteLicense(
    baseConfig,
    mockFetch({
      success: true,
      found: true,
      gecerli: true,
      durum: { musteriAktif: true, paketAktif: true, suresiGecmis: false },
      data: { domain: 'destek.guzelteknoloji.com', lisansAnahtari: 'DIFFERENT-KEY' },
    }),
  );
  assert.equal(wrongKey.valid, false);
  assert.equal(wrongKey.reason, 'KEY_MISMATCH');
});

test('uses cache and preserves validity during grace period on transient server outage', async () => {
  resetLicenseCache();
  let callCount = 0;
  const okFetch = (async () => {
    callCount += 1;
    return new Response(
      JSON.stringify({
        success: true,
        found: true,
        gecerli: true,
        durum: { musteriAktif: true, paketAktif: true, suresiGecmis: false },
        data: { domain: 'destek.guzelteknoloji.com', lisansAnahtari: 'LIC-KEY-123' },
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

  // After 15m TTL expires, outage occurs within 24h grace window -> graceMode true, still valid
  const duringGrace = await getLicenseStatus({
    config: baseConfig,
    fetchImpl: failingFetch,
    nowMs: t0 + 20 * 60_000,
  });
  assert.equal(duringGrace.valid, true);
  assert.equal(duringGrace.graceMode, true);

  // After 25h (past 24h grace window) -> SERVER_UNREACHABLE
  const pastGrace = await getLicenseStatus({
    config: baseConfig,
    fetchImpl: failingFetch,
    nowMs: t0 + 25 * 3600_000,
  });
  assert.equal(pastGrace.valid, false);
  assert.equal(pastGrace.reason, 'SERVER_UNREACHABLE');
  resetLicenseCache();
});
