import { createHash, randomUUID } from 'node:crypto';
import { db } from '../config/db.js';

export function imapSyncKey(host: string, port: number, user: string, mailbox: string, uidValidity: string) {
  return createHash('sha256').update(JSON.stringify([host.trim().toLowerCase(), port, user.trim().toLowerCase(), mailbox, uidValidity])).digest('hex');
}

type SyncOptions = {
  id: string; mailbox: string; uidValidity: string; upperUid: number;
  listUids: (after: number, through: number) => Promise<number[]>;
  process: (uid: number, storageMailbox: string) => Promise<boolean>;
  shouldContinue?: () => boolean;
};

/** Only UID numbers are listed in bulk. Message bodies/attachments are processed
 * one at a time, with bounded checkpoints and durable per-message retries. */
export async function drainImapMailbox(options: SyncOptions) {
  await db.imapSyncState.upsert({ where: { id: options.id }, create: { id: options.id, mailbox: options.mailbox, uidValidity: options.uidValidity }, update: {} });
  const token = randomUUID();
  const leaseMs = 5 * 60_000;
  const claim = await db.imapSyncState.updateMany({ where: { id: options.id, OR: [{ leaseUntil: null }, { leaseUntil: { lt: new Date() } }] }, data: { leaseToken: token, leaseUntil: new Date(Date.now() + leaseMs) } });
  if (!claim.count) return { processed: 0, failed: 0, busy: true };
  let lastRenewal = Date.now(), processed = 0, failed = 0;
  const storageMailbox = `imap:${options.id}`;
  const continuing = () => options.shouldContinue?.() !== false;
  const checkpoint = async (lastUid?: number) => {
    const result = await db.imapSyncState.updateMany({ where: { id: options.id, leaseToken: token }, data: { leaseUntil: new Date(Date.now() + leaseMs), ...(lastUid === undefined ? {} : { lastUid }) } });
    if (!result.count) throw new Error('IMAP tarama kilidi başka bir sürece geçti.');
    lastRenewal = Date.now();
  };
  const processOne = async (uid: number, attempts = 0) => {
    if (Date.now() - lastRenewal >= 60_000) await checkpoint();
    try {
      if (await options.process(uid, storageMailbox)) processed++;
      if (attempts) await db.imapSyncRetry.deleteMany({ where: { syncId: options.id, uid, attempts: { gt: 0 } } });
      return true;
    } catch (error) {
      const lastError = (error instanceof Error ? error.message : String(error)).slice(0, 2000);
      const nextAttemptAt = new Date(Date.now() + Math.min(60 * 60_000, 60_000 * 2 ** Math.min(attempts, 6)));
      await db.imapSyncRetry.upsert({ where: { syncId_uid: { syncId: options.id, uid } }, create: { syncId: options.id, uid, lastError, nextAttemptAt }, update: { attempts: { increment: 1 }, lastError, nextAttemptAt } });
      console.error('[IMAP] E-posta alınamadı; yeniden denenecek.', { mailbox: options.mailbox, uid, reason: lastError });
      failed++;
      return false;
    }
  };
  try {
    // Another worker may have finished between upsert and acquiring the lease.
    const state = await db.imapSyncState.findUniqueOrThrow({ where: { id: options.id } });
    const retries = await db.imapSyncRetry.findMany({ where: { syncId: options.id, attempts: { gt: 0 }, nextAttemptAt: { lte: new Date() } }, orderBy: [{ nextAttemptAt: 'asc' }, { uid: 'asc' }], take: 50 });
    const retried = new Set<number>();
    for (const retry of retries) {
      if (!continuing()) return { processed, failed, busy: false };
      await processOne(retry.uid, retry.attempts); retried.add(retry.uid);
    }
    if (state.lastUid >= options.upperUid || !continuing()) return { processed, failed, busy: false };
    const uids = [...new Set(await options.listUids(state.lastUid, options.upperUid))].filter(uid => uid > state.lastUid && uid <= options.upperUid).sort((a, b) => a - b);
    let lastUid = state.lastUid;
    for (let offset = 0; offset < uids.length; offset += 100) {
      const completed: number[] = [];
      for (const uid of uids.slice(offset, offset + 100)) {
        if (!continuing()) { await checkpoint(lastUid); return { processed, failed, busy: false }; }
        if (!retried.has(uid) && await processOne(uid)) completed.push(uid);
        lastUid = uid;
      }
      if (completed.length) await db.imapSyncRetry.deleteMany({ where: { syncId: options.id, attempts: { gt: 0 }, uid: { in: completed } } });
      await checkpoint(lastUid);
    }
    // UID gaps are normal (deleted/expunged messages). Do not rescan them forever.
    await checkpoint(options.upperUid);
    return { processed, failed, busy: false };
  } finally {
    await db.imapSyncState.updateMany({ where: { id: options.id, leaseToken: token }, data: { leaseToken: null, leaseUntil: null } });
  }
}
