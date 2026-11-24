import { test } from 'node:test';
import assert from 'node:assert/strict';
import { convertForeignToTry, parseTcmbXml, setTcmbRateCacheForTests } from '../src/services/tcmb-rates.service.js';

const sampleXml = `<?xml version="1.0" encoding="UTF-8"?>
<Tarih_Date Tarih="23.11.2026" Date="11/23/2026">
  <Currency CurrencyCode="USD">
    <Unit>1</Unit>
    <ForexBuying>36.1000</ForexBuying>
    <ForexSelling>36.4250</ForexSelling>
  </Currency>
  <Currency CurrencyCode="EUR">
    <Unit>1</Unit>
    <ForexSelling>38.9000</ForexSelling>
  </Currency>
  <Currency CurrencyCode="JPY">
    <Unit>100</Unit>
    <ForexSelling>24.5000</ForexSelling>
  </Currency>
</Tarih_Date>`;

test('parseTcmbXml reads selling rates and normalizes multi-unit currencies', () => {
  const parsed = parseTcmbXml(sampleXml);
  assert.equal(parsed.rateDate, '23.11.2026');
  assert.equal(parsed.rates.USD, '36.425');
  assert.equal(parsed.rates.EUR, '38.9');
  assert.equal(parsed.rates.JPY, '0.245');
});

test('convertForeignToTry converts foreign currencies to TRY using TCMB rate and leaves TRY unchanged', async () => {
  setTcmbRateCacheForTests(null);
  const fetcher = (async () => new Response(sampleXml, { status: 200 })) as unknown as typeof fetch;

  const tryResult = await convertForeignToTry('100.00', 'TRY', fetcher);
  assert.deepEqual(tryResult, { total: '100.00', currency: 'TRY' });

  const usdResult = await convertForeignToTry('1.00', 'USD', fetcher);
  assert.equal(usdResult.currency, 'TRY');
  assert.equal(usdResult.total, '36.43');
  assert.equal(usdResult.originalTotal, '1.00');
  assert.equal(usdResult.originalCurrency, 'USD');
  assert.equal(usdResult.exchangeRate, '36.4250');
  assert.equal(usdResult.rateDate, '23.11.2026');

  const jpyResult = await convertForeignToTry('1000.00', 'JPY', fetcher);
  assert.equal(jpyResult.total, '245.00');

  setTcmbRateCacheForTests(null);
});

test('manual currency override uses admin rate and rejects unsafe private API URLs', async () => {
  const { assertSafeRateUrl } = await import('../src/services/tcmb-rates.service.js');
  const manual = await convertForeignToTry('10.00', 'USD', fetch, {
    autoUpdate: false,
    rate: '51.0000',
    rateType: 'ForexSelling',
    apiUrl: 'https://www.tcmb.gov.tr/kurlar/today.xml',
  });
  assert.equal(manual.total, '510.00');
  assert.equal(manual.exchangeRate, '51.0000');
  assert.throws(() => assertSafeRateUrl('http://127.0.0.1/rates.xml'), { code: 'INVALID_API_URL' });
  assert.throws(() => assertSafeRateUrl('https://localhost/rates.xml'), { code: 'INVALID_API_URL' });
  assert.equal(assertSafeRateUrl('https://www.tcmb.gov.tr/kurlar/today.xml'), 'https://www.tcmb.gov.tr/kurlar/today.xml');
});
