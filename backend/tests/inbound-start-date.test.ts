import { test } from 'node:test';
import assert from 'node:assert/strict';
import { acceptsIncomingDate } from '../src/services/inbound-start-date.js';

test('incoming cutoff uses provider time, includes boundary, rejects older or undated replays', () => {
  const since = new Date('2026-10-16T09:00:00Z');
  assert.equal(acceptsIncomingDate(null, undefined), true);
  assert.equal(acceptsIncomingDate(since, new Date('2026-10-16T08:59:59Z')), false);
  assert.equal(acceptsIncomingDate(since, new Date('2026-10-16T09:00:00Z')), true);
  assert.equal(acceptsIncomingDate(since, '2026-10-16T12:00:00+03:00'), true);
  assert.equal(acceptsIncomingDate(since, String(since.getTime() / 1000)), true);
  assert.equal(acceptsIncomingDate(since, since.getTime()), true);
  for (const missing of [undefined, null, '', 'invalid', '2026-10-16 12:00:00', new Date('invalid')]) {
    assert.equal(acceptsIncomingDate(since, missing), false);
  }
});
