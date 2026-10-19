import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { db } from '../src/config/db.js';
import { receiveMetaWebhook, receiveNetgsmMessage } from '../src/services/integrations.service.js';

test('signed webhook replays older than the start date are ignored before persistence or media downloads', async t => {
  const since = new Date('2026-10-16T09:00:00Z');
  const secret = 'test-cutoff-secret';
  const originalSettings = db.integrationSettings.findUnique;
  const originalExternal = db.externalMessage.findUnique;
  t.after(async () => {
    db.integrationSettings.findUnique = originalSettings;
    db.externalMessage.findUnique = originalExternal;
    await db.$disconnect();
  });
  db.integrationSettings.findUnique = (async () => ({
    incomingMessagesSince: since, smsEnabled: true, smsWebhookSecret: secret,
    whatsappEnabled: true, whatsappAppSecret: secret,
  })) as typeof originalSettings;
  db.externalMessage.findUnique = (async () => { throw new Error('Old message must not be persisted'); }) as typeof originalExternal;
  t.mock.method(globalThis, 'fetch', () => { throw new Error('Old media must not be downloaded'); });
  const payload = { entry: [{ changes: [{ value: { messages: [
    { id: 'old', from: '905551234567', timestamp: String(since.getTime() / 1000 - 1), type: 'document', document: { id: 'old-file' } },
    { id: 'undated', from: '905551234567', text: { body: 'missing timestamp' } },
  ] } }] }] };
  const raw = Buffer.from(JSON.stringify(payload));
  assert.deepEqual(await receiveMetaWebhook(payload, `sha256=${createHmac('sha256', secret).update(raw).digest('hex')}`, raw), []);
  assert.equal(await receiveNetgsmMessage({ from: '05551234567', text: 'Old', timestamp: since.getTime() / 1000 - 1 }, secret), null);
  assert.equal(await receiveNetgsmMessage({ from: '05551234567', text: 'Undated' }, secret), null);
});
