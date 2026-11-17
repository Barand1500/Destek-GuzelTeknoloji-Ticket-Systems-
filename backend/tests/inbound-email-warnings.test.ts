import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { db } from '../src/config/db.js';
import { inboundEmailWarnings } from '../src/services/management.service.js';
import { imapSyncKey } from '../src/services/imap-sync.service.js';

test('warnings are permission protected, account scoped, bounded and redact raw diagnostics', async t => {
  const actor = { id: 'test', name: 'Test', email: '', role: 'ADMIN' as const, departmentIds: [], sessionId: '' };
  const settings = { imapHost: 'mail.invalid', imapPort: 993, imapUser: 'test@example.invalid', imapPassword: 'secret', imapMailbox: 'INBOX' };
  const id = imapSyncKey(settings.imapHost, 993, settings.imapUser, 'INBOX', '1');
  const originals = { settings: db.integrationSettings.findUnique, states: db.imapSyncState.findMany, count: db.imapSyncRetry.count, rows: db.imapSyncRetry.findMany };
  t.after(() => { db.integrationSettings.findUnique = originals.settings; db.imapSyncState.findMany = originals.states; db.imapSyncRetry.count = originals.count; db.imapSyncRetry.findMany = originals.rows; });
  db.integrationSettings.findUnique = (async () => settings) as any;
  db.imapSyncState.findMany = (async () => [{ id, uidValidity: '1' }, { id: 'other-account', uidValidity: '2' }]) as any;
  db.imapSyncRetry.count = (async (args: any) => { assert.deepEqual(args.where, { syncId: { in: [id] }, attempts: 0 }); return 21; }) as any;
  db.imapSyncRetry.findMany = (async (args: any) => {
    assert.equal(args.take, 20);
    assert.deepEqual(args.where, { syncId: { in: [id] }, attempts: 0 });
    return [{ syncId: id, uid: 5, lastError: JSON.stringify({ reason: 'message_too_large', sizeBytes: 60000000, secret: 'private body' }) }, { syncId: id, uid: 4, lastError: 'null' }];
  }) as any;
  await assert.rejects(inboundEmailWarnings({ ...actor, role: 'CUSTOMER' }), { code: 'FORBIDDEN' });
  const result = await inboundEmailWarnings(actor);
  assert.equal(result.total, 21);
  assert.equal(result.items[0]?.account, settings.imapUser);
  assert.equal(result.items[0]?.sizeBytes, 60000000);
  assert.equal(result.items[1]?.sizeBytes, null);
  assert.equal(JSON.stringify(result).includes('private body'), false);
  assert.equal(JSON.stringify(result).includes('secret'), false);
});
