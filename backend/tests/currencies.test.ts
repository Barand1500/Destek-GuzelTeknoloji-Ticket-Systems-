import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { getCurrencyOverride, listCurrencies, saveCurrency, refreshCurrencyRate } from '../src/services/currencies.service.js';
import { setTcmbRateCacheForTests } from '../src/services/tcmb-rates.service.js';

test('saved and refreshed currency records remain visible with their update timestamps', async t => {
  const originals = { find: db.systemSettings.findUnique, upsert: db.systemSettings.upsert, log: db.activityLog.create, fetch: globalThis.fetch };
  t.after(() => {
    db.systemSettings.findUnique = originals.find;
    db.systemSettings.upsert = originals.upsert;
    db.activityLog.create = originals.log;
    globalThis.fetch = originals.fetch;
    setTcmbRateCacheForTests(null);
  });
  let stored: any[] = [
    { code: 'TRY', name: 'Türk Lirası', rateType: 'ForexSelling', autoUpdate: false, rate: '1.0000', apiUrl: '', isActive: true },
    ...['USD', 'EUR', 'GBP'].map(code => ({ code, name: code, rateType: 'ForexSelling', autoUpdate: false, rate: '40.0000', apiUrl: 'https://www.tcmb.gov.tr/kurlar/today.xml', isActive: true, updatedAt: '2026-11-27T10:00:00.000Z' })),
  ];
  db.systemSettings.findUnique = (async () => ({ roleTemplates: structuredClone(stored) })) as any;
  db.systemSettings.upsert = (async ({ update }: any) => { stored = JSON.parse(JSON.stringify(update.roleTemplates)); return {}; }) as any;
  db.activityLog.create = (async () => ({})) as any;
  const actor = { id: 'admin', role: 'ADMIN' as const, name: 'Admin', email: '', sessionId: '', departmentIds: [] };
  assert.deepEqual((await listCurrencies(actor)).map(row => row.code), ['TRY', 'USD', 'EUR', 'GBP']);
  assert.equal((await getCurrencyOverride('EUR'))?.updatedAt, '2026-11-27T10:00:00.000Z');
  const { updatedAt, ...input } = stored[1];
  await saveCurrency(actor, { ...input, rate: '42.5000' });
  assert.equal((await listCurrencies(actor)).find(row => row.code === 'USD')?.rate, '42.5000');
  assert.equal((await getCurrencyOverride('USD'))?.rate, '42.5000');
  await assert.rejects(saveCurrency(actor, { ...input, updatedAt }));
  globalThis.fetch = (async () => new Response('<Tarih_Date Tarih="27.11.2026">' + ['USD', 'EUR', 'GBP'].map(code => `<Currency CurrencyCode="${code}"><Unit>1</Unit><ForexSelling>43.25</ForexSelling></Currency>`).join('') + '</Tarih_Date>')) as typeof fetch;
  setTcmbRateCacheForTests(null);
  await refreshCurrencyRate(actor, 'ALL');
  const reloaded = await listCurrencies(actor);
  assert.deepEqual(reloaded.map(row => row.code), ['TRY', 'USD', 'EUR', 'GBP']);
  for (const row of reloaded.filter(row => row.code !== 'TRY')) {
    assert.equal(row.rate, '43.2500');
    assert.ok(row.updatedAt);
  }
});
