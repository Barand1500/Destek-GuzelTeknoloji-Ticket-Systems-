import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { openPayment } from '../src/services/payment-secrets.js';
import { getAkbankSettings, saveAkbankSettings, testAkbankConnection } from '../src/services/akbank-settings.service.js';
import { akbankHash } from '../src/services/akbank-client.js';

test('Akbank credentials remain encrypted, masked, isolated and disabled', async t => {
  const actor = { id: 'admin', role: 'ADMIN' as const, name: 'Test', email: '', departmentIds: [], sessionId: '' };
  let row: any = null;
  const logs: unknown[] = [];
  const findUnique = async ({ where }: any) => where.id === 'akbank' ? row : null;
  const tx = { $queryRaw: async () => [], creditPaymentAttempt: { count: async () => 0 }, paymentReversal: { count: async () => 0 }, paymentGatewaySettings: { findUnique, upsert: async ({ create, update }: any) => { row = row ? { ...row, ...update } : create; return row; } }, activityLog: { create: async ({ data }: any) => logs.push(data) } };
  const originalTransaction = db.$transaction, originalFind = db.paymentGatewaySettings.findUnique, originalUpdate = db.paymentGatewaySettings.updateMany, originalFetch = globalThis.fetch;
  t.after(() => { db.$transaction = originalTransaction; db.paymentGatewaySettings.findUnique = originalFind; db.paymentGatewaySettings.updateMany = originalUpdate; globalThis.fetch = originalFetch; });
  db.$transaction = (async (callback: any) => callback(tx)) as any;
  db.paymentGatewaySettings.findUnique = findUnique as any;
  db.paymentGatewaySettings.updateMany = (async ({ data }: any) => { Object.assign(row, data); return { count: 1 }; }) as any;
  await assert.rejects(saveAkbankSettings({ ...actor, role: 'CUSTOMER' }, {}), { code: 'FORBIDDEN' });
  await assert.rejects(saveAkbankSettings(actor, { mode: 'sandbox' }), { code: 'AKBANK_KEYS_REQUIRED' });
  const credentials = { merchantSafeId: 'fixture-merchant', terminalSafeId: 'fixture-terminal', secretKey: 'fixture-secret' };
  const result = await saveAkbankSettings(actor, { mode: 'sandbox', ...credentials });
  assert.deepEqual(openPayment(row.credentialsCiphertext), credentials);
  for (const value of Object.values(credentials)) {
    assert.ok(!JSON.stringify(result).includes(value));
    assert.ok(!JSON.stringify(logs).includes(value));
    assert.ok(!row.credentialsCiphertext.includes(value));
  }
  assert.equal(row.enabled, false);
  assert.equal(result.paymentAvailable, false);
  await saveAkbankSettings(actor, { mode: 'sandbox', merchantSafeId: '', terminalSafeId: '', secretKey: '' });
  assert.deepEqual(openPayment(row.credentialsCiphertext), credentials);
  await assert.rejects(saveAkbankSettings(actor, { mode: 'production', publicUrl: 'https://portal.test' }), { code: 'AKBANK_KEYS_REQUIRED' });
  assert.equal((await getAkbankSettings(actor)).mode, 'sandbox');
  await assert.rejects(saveAkbankSettings(actor, { mode: 'sandbox', enabled: true }), { code: 'PAYMENT_TEST_REQUIRED' });
  globalThis.fetch = (async (_url: any, init: any) => {
    assert.equal(JSON.parse(init.body).txnCode, '1010', 'Connection test cannot create a charge');
    const text = JSON.stringify({ txnCode: '1010', responseCode: 'VPS-1123' });
    return new Response(text, { headers: { 'auth-hash': akbankHash(text, credentials.secretKey) } });
  }) as typeof fetch;
  await testAkbankConnection(actor);
  assert.ok(row.testedAt);
  await saveAkbankSettings(actor, { mode: 'sandbox', enabled: true });
  assert.equal(row.enabled, true);
  assert.equal((await getAkbankSettings(actor)).paymentAvailable, true);
  globalThis.fetch = (async () => Response.json({ txnCode: '1010', responseCode: 'VPS-0000' })) as typeof fetch;
  await assert.rejects(testAkbankConnection(actor), { code: 'PAYMENT_CONNECTION_FAILED' });
  assert.equal(row.enabled, false);
  assert.equal(row.testedAt, null);
});
