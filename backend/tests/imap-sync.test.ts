import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { db } from '../src/config/db.js';
import { drainImapMailbox, imapSyncKey } from '../src/services/imap-sync.service.js';

test('10,000-message backlog drains in order and resumes from persisted progress without a date or count cap', async () => {
  const id = imapSyncKey('imap.example.test', 993, randomUUID(), 'INBOX', '1');
  const visits = new Set<number>();
  const ranges: number[] = [];
  let stopped = false;
  const options = {
    id, mailbox: 'INBOX', uidValidity: '1', upperUid: 10000,
    listUids: async (after: number) => { ranges.push(after); return Array.from({ length: 10000 }, (_, i) => 10000 - i); },
    process: async (uid: number, mailbox: string) => {
      assert.equal(mailbox, `imap:${id}`);
      assert.ok(!visits.has(uid), `unexpected replay: ${uid}`);
      visits.add(uid);
      if (uid === 37) stopped = true;
      return true;
    },
    shouldContinue: () => !stopped,
  };
  try {
    assert.equal((await drainImapMailbox(options)).processed, 37);
    assert.equal((await db.imapSyncState.findUniqueOrThrow({ where: { id } })).lastUid, 37);
    stopped = false;
    assert.equal((await drainImapMailbox(options)).processed, 9963);
    assert.equal(visits.size, 10000);
    assert.deepEqual(ranges, [0, 37]);
    assert.equal((await db.imapSyncState.findUniqueOrThrow({ where: { id } })).lastUid, 10000);
    assert.equal((await drainImapMailbox(options)).processed, 0);
    assert.deepEqual(ranges, [0, 37]);
    const next = await drainImapMailbox({ ...options, upperUid: 10005, listUids: async after => {
      assert.equal(after, 10000);
      return [10005, 10001, 10002, 10004, 10003, 10005];
    } });
    assert.equal(next.processed, 5);
    assert.equal(visits.size, 10005);
  } finally { await db.imapSyncState.deleteMany({ where: { id } }); await db.$disconnect(); }
});

test('one failing email does not starve later mail and durable retries survive new runs', async t => {
  const id = imapSyncKey('imap.example.test', 993, randomUUID(), 'INBOX', '2');
  const saved = new Set<number>();
  let allowTwo = false;
  t.mock.method(console, 'error', () => {});
  const options = {
    id, mailbox: 'INBOX', uidValidity: '2', upperUid: 5,
    listUids: async () => [1, 2, 3, 4, 5],
    process: async (uid: number) => { if (uid === 5 || (uid === 2 && !allowTwo)) throw new Error('Invalid email'); saved.add(uid); return true; },
  };
  try {
    assert.equal((await drainImapMailbox(options)).processed, 3);
    assert.deepEqual([...saved], [1, 3, 4]);
    assert.equal(await db.imapSyncRetry.count({ where: { syncId: id } }), 2);
    assert.equal((await db.imapSyncState.findUniqueOrThrow({ where: { id } })).lastUid, 5);
    assert.equal((await drainImapMailbox(options)).failed, 0, 'do not retry before the scheduled time');
    allowTwo = true;
    await db.imapSyncRetry.updateMany({ where: { syncId: id }, data: { nextAttemptAt: new Date(0) } });
    const retried = await drainImapMailbox(options);
    assert.equal(retried.processed, 1);
    assert.equal(retried.failed, 1);
    const pending = await db.imapSyncRetry.findMany({ where: { syncId: id } });
    assert.equal(pending.length, 1);
    assert.equal(pending[0].uid, 5);
    assert.equal(pending[0].attempts, 2);
  } finally { await db.imapSyncState.deleteMany({ where: { id } }); await db.$disconnect(); }
});

test('parallel workers cannot import the same mailbox concurrently; expired leases can be recovered', async () => {
  const id = imapSyncKey('imap.example.test', 993, randomUUID(), 'INBOX', '3');
  let unlock!: () => void, entered!: () => void;
  const gate = new Promise<void>(resolve => { unlock = resolve; });
  const started = new Promise<void>(resolve => { entered = resolve; });
  const options = { id, mailbox: 'INBOX', uidValidity: '3', upperUid: 1, listUids: async () => [1], process: async () => { entered(); await gate; return true; } };
  const first = drainImapMailbox(options);
  try {
    await started;
    assert.equal((await drainImapMailbox(options)).busy, true);
    unlock(); await first;
    await db.imapSyncState.update({ where: { id }, data: { leaseToken: 'old-process', leaseUntil: new Date(0) } });
    assert.equal((await drainImapMailbox(options)).busy, false);
  } finally { unlock(); await first; await db.imapSyncState.deleteMany({ where: { id } }); await db.$disconnect(); }
});

test('account, mailbox and UIDVALIDITY isolate UID reuse', () => {
  const key = imapSyncKey('mail.example.test', 993, 'a@example.test', 'INBOX', '10');
  assert.notEqual(key, imapSyncKey('mail.example.test', 993, 'b@example.test', 'INBOX', '10'));
  assert.notEqual(key, imapSyncKey('mail.example.test', 993, 'a@example.test', 'Archive', '10'));
  assert.notEqual(key, imapSyncKey('mail.example.test', 993, 'a@example.test', 'INBOX', '11'));
});

test('a failed UID listing never advances progress and deleted UID gaps do not stall later mail', async () => {
  const id = imapSyncKey('imap.example.test', 993, randomUUID(), 'INBOX', '4');
  const options = { id, mailbox: 'INBOX', uidValidity: '4', upperUid: 9, process: async () => true };
  try {
    await assert.rejects(drainImapMailbox({ ...options, listUids: async () => { throw new Error('Connection lost'); } }), /Connection lost/);
    const state = await db.imapSyncState.findUniqueOrThrow({ where: { id } });
    assert.equal(state.lastUid, 0);
    assert.equal(state.leaseToken, null);
    assert.equal((await drainImapMailbox({ ...options, listUids: async () => [2, 7] })).processed, 2);
    assert.equal((await db.imapSyncState.findUniqueOrThrow({ where: { id } })).lastUid, 9);
  } finally { await db.imapSyncState.deleteMany({ where: { id } }); await db.$disconnect(); }
});
