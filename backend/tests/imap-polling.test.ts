import 'dotenv/config';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ImapFlow } from 'imapflow';
import { db } from '../src/config/db.js';
import { syncInboundEmail } from '../src/services/inbound-email.service.js';
import { imapSyncKey } from '../src/services/imap-sync.service.js';

test('IMAP polling imports old unread and read messages, isolates individual failures and skips saved messages on restart', async t => {
  const suffix = randomUUID();
  const email = `imap-customer-${suffix}@example.test`, user = `imap-${suffix}@example.test`, ownAlias = `support-${suffix}@example.test`;
  const mailbox = `Test-${suffix}`, host = 'imap.example.test';
  const key = imapSyncKey(host, 993, user, mailbox, '123');
  let customerId = '', departmentId = '', upperUid = 4, failTwo = true;
  let incomingMessagesSince: Date | null = null;
  const fetched: number[] = [], sourceFetched: number[] = [], searches: string[] = [];
  const originalSettings = db.integrationSettings.findUnique;
  t.mock.method(console, 'error', () => {});
  t.mock.method(console, 'warn', () => {});
  t.mock.method(ImapFlow.prototype, 'connect', async () => true);
  t.mock.method(ImapFlow.prototype, 'logout', async () => true);
  t.mock.method(ImapFlow.prototype, 'getMailboxLock', async function(this: any) {
    this.mailbox = { path: mailbox, uidValidity: 123n, uidNext: upperUid + 1 };
    return { release() {} };
  });
  t.mock.method(ImapFlow.prototype, 'search', async (query: any) => {
    assert.equal(query.since, undefined);
    searches.push(query.uid);
    const [from, through] = query.uid.split(':').map(Number);
    return Array.from({ length: through - from + 1 }, (_, index) => from + index);
  });
  t.mock.method(ImapFlow.prototype, 'fetchOne', async (uid: any, query: any, options: any) => {
    assert.deepEqual(options, { uid: true });
    assert.equal(query.uid, true);
    if (query.source) {
      sourceFetched.push(Number(uid));
      assert.equal(query.size, undefined);
      if (Number(uid) === 2 && failTwo) throw new Error('Temporary message download failure');
    } else {
      fetched.push(Number(uid));
      assert.equal(query.size, true);
      assert.equal(query.internalDate, true);
    }
    const number = Number(uid) === 5 ? 1 : Number(uid);
    const source = Buffer.from(`From: Customer <${number === 4 ? ownAlias : email}>\r\nTo: support@example.test\r\nMessage-ID: <imap-${suffix}-${number}@example.test>\r\nDate: Sat, 1 Jan 2000 00:00:00 +0000\r\nSubject: IMAP test ${number}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\nReply ${number}`);
    if (query.source) return { uid: Number(uid), source };
    // Metadata response intentionally has no source: download requires a separate request.
    return { uid: Number(uid), size: source.length, internalDate: new Date(Number(uid) === 7 ? '2026-10-16T09:00:00Z' : '2000-01-01T00:00:00Z') };
  });
  t.mock.method(ImapFlow.prototype, 'messageFlagsAdd', async (uid: any) => { if (Number(uid) === 3) throw new Error('Flag update failed'); return true; });
  try {
    const customer = await db.user.create({ data: { name: `IMAP test ${suffix}`, email, role: 'CUSTOMER', passwordHash: 'test-only' } }); customerId = customer.id;
    const department = await db.department.create({ data: { name: `IMAP test ${suffix}` } }); departmentId = department.id;
    db.integrationSettings.findUnique = (async () => ({ incomingMessagesSince, imapEnabled: true, imapHost: host, imapPort: 993, imapSecure: true, imapUser: user, imapPassword: 'test-password', imapMailbox: mailbox, imapPollIntervalSeconds: 0, imapDepartmentId: departmentId, imapCreateTickets: true, imapCreateReplies: true, smtpFromAddress: ownAlias })) as typeof originalSettings;
    assert.equal((await syncInboundEmail()).processed, 2);
    assert.equal(await db.conversation.count({ where: { customerId } }), 2);
    assert.equal(await db.imapSyncRetry.count({ where: { syncId: key } }), 1);
    assert.equal((await db.imapSyncState.findUniqueOrThrow({ where: { id: key } })).lastUid, 4);
    assert.equal((await syncInboundEmail()).processed, 0);
    assert.deepEqual(fetched, [1, 2, 3, 4]);
    assert.deepEqual(sourceFetched, [1, 2, 3, 4]);
    failTwo = false;
    await db.imapSyncRetry.updateMany({ where: { syncId: key }, data: { nextAttemptAt: new Date(0) } });
    assert.equal((await syncInboundEmail()).processed, 1);
    assert.equal(await db.conversation.count({ where: { customerId } }), 3);
    assert.equal(await db.imapSyncRetry.count({ where: { syncId: key } }), 0);
    upperUid = 5;
    await syncInboundEmail();
    assert.equal(await db.conversation.count({ where: { customerId } }), 3, 'the same Message-ID in another UID must not create a duplicate');
    assert.deepEqual(searches, ['1:4', '5:5']);
    // Even a complete loss of scan progress must respect the configured boundary.
    incomingMessagesSince = new Date('2026-10-16T09:00:00Z');
    await db.imapSyncState.delete({ where: { id: key } });
    upperUid = 7;
    assert.equal((await syncInboundEmail()).processed, 1);
    assert.equal(await db.conversation.count({ where: { customerId } }), 4);
    assert.equal(await db.incomingEmail.count({ where: { messageId: `<imap-${suffix}-6@example.test>` } }), 0);
    assert.equal((await syncInboundEmail()).processed, 0);
    assert.equal(sourceFetched.includes(6), false, 'old mail must be filtered using metadata before downloading source');
    assert.equal(sourceFetched.filter(uid => uid === 7).length, 1);
  } finally {
    db.integrationSettings.findUnique = originalSettings;
    const ids = customerId ? (await db.conversation.findMany({ where: { customerId }, select: { id: true } })).map(row => row.id) : [];
    await db.notification.deleteMany({ where: { conversationId: { in: ids } } });
    await db.activityLog.deleteMany({ where: { entityId: { in: ids } } });
    await db.incomingEmail.deleteMany({ where: { conversationId: { in: ids } } });
    await db.conversationMessage.deleteMany({ where: { conversationId: { in: ids } } });
    await db.conversation.deleteMany({ where: { id: { in: ids } } });
    if (customerId) await db.user.delete({ where: { id: customerId } });
    if (departmentId) await db.department.delete({ where: { id: departmentId } });
    await db.imapSyncState.deleteMany({ where: { id: key } });
    await db.$disconnect();
  }
});
