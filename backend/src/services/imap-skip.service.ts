import { db } from '../config/db.js';
import type { InboundEmailSkip } from './inbound-email-source.js';

/** ImapSyncRetry.attempts=0 is reserved for terminal skips, never retry jobs. */
export async function recordPermanentImapSkip(storageMailbox: string, uid: number, diagnostic: InboundEmailSkip) {
  const syncId = storageMailbox.slice('imap:'.length);
  const marker = { attempts: 0, nextAttemptAt: new Date('9999-12-31T00:00:00Z'), lastError: JSON.stringify({ status: 'permanently_skipped', ...diagnostic }) };
  await db.imapSyncRetry.upsert({ where: { syncId_uid: { syncId, uid } }, create: { syncId, uid, ...marker }, update: marker });
  console.warn('[IMAP] Message permanently skipped.', { uid, ...diagnostic });
}

export async function isPermanentlySkippedImapUid(storageMailbox: string, uid: number) {
  const marker = await db.imapSyncRetry.findUnique({ where: { syncId_uid: { syncId: storageMailbox.slice('imap:'.length), uid } } });
  return marker?.attempts === 0;
}
