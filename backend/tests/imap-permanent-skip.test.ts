import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { drainImapMailbox, imapSyncKey } from '../src/services/imap-sync.service.js';
import { fetchBoundedInboundEmail } from '../src/services/inbound-email-source.js';
import { isPermanentlySkippedImapUid, recordPermanentImapSkip } from '../src/services/imap-skip.service.js';
test('terminal skip survives checkpoints and restart while later mail continues', async t => {
  t.mock.method(console, 'warn', () => {});
  const id = imapSyncKey('fixture.invalid', 993, randomUUID(), 'INBOX', '1');
  const fetches: number[] = [];
  const client = { fetchOne: async (uid: any, query: any) => {
    fetches.push(uid);
    if (uid === 1) { assert.equal(query.source, undefined); return { uid, size: 52428801 }; }
    return query.source ? { uid, source: Buffer.from('hello') } : { uid, size: 5 };
  } };
  const process = async (uid: number, mailbox: string) => {
    if (await isPermanentlySkippedImapUid(mailbox, uid)) return false;
    return Boolean(await fetchBoundedInboundEmail(client as any, uid, null, value => recordPermanentImapSkip(mailbox, uid, value)));
  };
  const options = { id, mailbox: 'INBOX', uidValidity: '1', upperUid: 2, listUids: async () => [1, 2], process };
  try {
    assert.deepEqual(await drainImapMailbox(options), { processed: 1, failed: 0, busy: false });
    assert.equal((await db.imapSyncState.findUniqueOrThrow({ where: { id } })).lastUid, 2);
    const marker = await db.imapSyncRetry.findUniqueOrThrow({ where: { syncId_uid: { syncId: id, uid: 1 } } });
    assert.equal(marker.attempts, 0);
    assert.deepEqual(JSON.parse(marker.lastError), { status: 'permanently_skipped', reason: 'message_too_large', sizeBytes: 52428801, limitBytes: 52428800 });
    await db.imapSyncRetry.update({ where: { syncId_uid: { syncId: id, uid: 1 } }, data: { nextAttemptAt: new Date(0) } });
    assert.deepEqual(await drainImapMailbox(options), { processed: 0, failed: 0, busy: false });
    assert.equal(await process(1, `imap:${id}`), false);
    assert.deepEqual(fetches, [1, 2, 2]);
    assert.equal(await db.imapSyncRetry.count({ where: { syncId: id, attempts: { gt: 0 } } }), 0);
  } finally { await db.imapSyncState.deleteMany({ where: { id } }); await db.$disconnect(); }
});
