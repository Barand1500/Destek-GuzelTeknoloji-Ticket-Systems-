import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { registerAkbankInstruction } from '../src/services/akbank-recurring-client.js';

test('retired registration sends no card data', async () => {
  const originalFetch = globalThis.fetch; let calls = 0;
  globalThis.fetch = (async () => { calls++; throw Error('Must not dispatch'); }) as typeof fetch;
  try {
    await assert.rejects(registerAkbankInstruction({ merchantSafeId: 'merchant', terminalSafeId: 'terminal', secretKey: 'secret', mode: 'sandbox' }, { trackId: 'legacy', startsOn: '2026-01-01', amount: '10', currency: 'TRY', terms: { frequencyCycle: 'M', frequencyInterval: 1, numberOfPayments: 120 }, card: {} }), { code: 'RENEWAL_DISABLED' });
    assert.equal(calls, 0);
  } finally { globalThis.fetch = originalFetch; }
});
