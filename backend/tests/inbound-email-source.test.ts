import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fetchBoundedInboundEmail } from '../src/services/inbound-email-source.js';

test('oversized or invalid metadata never downloads source, diagnostics contain no content', async () => {
  for (const size of [50 * 1024 * 1024 + 1, undefined, null, 0, -1, NaN, Infinity, 1.5]) {
    const diagnostics: any[] = [];
    let calls = 0;
    const client = { fetchOne: async (_uid: any, query: any) => { calls++; assert.equal(query.source, undefined); return { uid: 8, size, internalDate: new Date() }; } };
    assert.equal(await fetchBoundedInboundEmail(client as any, 8, null, async value => { diagnostics.push(value); }), null);
    assert.equal(calls, 1);
    assert.equal(diagnostics.length, 1);
    assert.deepEqual(Object.keys(diagnostics[0]).sort(), ['limitBytes', 'reason', 'sizeBytes']);
  }
});

test('accepted source downloads once, preserves UID/date checks and guards actual bytes', async () => {
  let calls = 0;
  const source = Buffer.from('From: a@example.test\r\n\r\nhello');
  const client = { fetchOne: async (_uid: any, query: any) => { calls++; return query.source ? { uid: 8, source } : { uid: 8, size: source.length, internalDate: new Date('2026-11-01') }; } };
  assert.equal((await fetchBoundedInboundEmail(client as any, 8, null, async () => assert.fail()))?.source, source);
  assert.equal(calls, 2);
  calls = 0;
  assert.equal(await fetchBoundedInboundEmail(client as any, 8, new Date('2026-11-02'), async () => assert.fail()), null);
  assert.equal(calls, 1);
  const diagnostics: any[] = [];
  const lyingClient = { fetchOne: async (_uid: any, query: any) => query.source ? { uid: 8, source: Buffer.alloc(50 * 1024 * 1024 + 1) } : { uid: 8, size: 10 } };
  assert.equal(await fetchBoundedInboundEmail(lyingClient as any, 8, null, async value => { diagnostics.push(value); }), null);
  assert.equal(diagnostics[0].reason, 'source_too_large');
  await assert.rejects(fetchBoundedInboundEmail({ fetchOne: async () => ({ uid: 9, size: 10 }) } as any, 8, null, async () => {}), /UID/);
});
