import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import type { AddressInfo } from 'node:net';

test('webhook logs receipt, completion and authentication failures without secrets', async () => {
  const { app } = await import('../src/app.js');
  const { db } = await import('../src/config/db.js');
  const originalFind = db.integrationSettings.findUnique;
  const originalLog = console.log, originalError = console.error;
  const lines: string[] = [];
  const secret = 'webhook-test-secret';
  db.integrationSettings.findUnique = (async () => ({ whatsappEnabled: true, whatsappAppSecret: secret })) as typeof originalFind;
  console.log = (...args) => { lines.push(JSON.stringify(args)); };
  console.error = (...args) => { lines.push(JSON.stringify(args)); };
  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise<void>(resolve => server.once('listening', resolve));
    const url = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/v1/webhooks/whatsapp`;
    const body = JSON.stringify({ entry: [{ changes: [{ value: { statuses: [{ id: 'status-only-event' }] } }] }] });
    const signature = `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`;
    const send = (sig: string) => fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-hub-signature-256': sig }, body });
    const success = await send(signature);
    assert.equal(success.status, 200);
    assert.deepEqual(await success.json(), { success: true });
    assert.match(lines.join('\n'), /processedMessages.*0/);
    const failure = await send('invalid-signature');
    assert.equal(failure.status, 401);
    assert.equal((await failure.json()).error.code, 'INVALID_WEBHOOK');
    assert.match(lines.join('\n'), /INVALID_WEBHOOK/);
    assert.match(lines.join('\n'), /İstek alındı/);
    assert.doesNotMatch(lines.join('\n'), /webhook-test-secret|invalid-signature|status-only-event/);
    assert.ok(!lines.join('\n').includes(signature));
  } finally {
    console.log = originalLog;
    console.error = originalError;
    db.integrationSettings.findUnique = originalFind;
    await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    await db.$disconnect();
  }
});
