import type { ImapFlow } from 'imapflow';
import { acceptsIncomingDate } from './inbound-start-date.js';

// Includes MIME/base64 overhead, headers and body; attachment limits still apply.
export const MAX_INBOUND_EMAIL_BYTES = 50 * 1024 * 1024;
export type InboundEmailSkip = {
  reason: 'message_too_large' | 'invalid_message_size' | 'source_too_large';
  sizeBytes: number | null;
  limitBytes: number;
};

export async function fetchBoundedInboundEmail(
  client: Pick<ImapFlow, 'fetchOne'>,
  uid: number,
  since: Date | null | undefined,
  recordSkip: (diagnostic: InboundEmailSkip) => Promise<void>,
) {
  const metadata = await client.fetchOne(uid, { uid: true, size: true, internalDate: true }, { uid: true });
  if (!metadata) return null; // Expunged since SEARCH.
  if (metadata.uid !== uid) throw new Error('IMAP metadata UID mismatch.');
  if (!acceptsIncomingDate(since, metadata.internalDate)) return null;
  const skip = async (reason: InboundEmailSkip['reason'], size: unknown) => {
    await recordSkip({ reason, sizeBytes: typeof size === 'number' && Number.isSafeInteger(size) && size >= 0 ? size : null, limitBytes: MAX_INBOUND_EMAIL_BYTES });
    return null;
  };
  if (!Number.isSafeInteger(metadata.size) || metadata.size! <= 0) return skip('invalid_message_size', metadata.size);
  if (metadata.size! > MAX_INBOUND_EMAIL_BYTES) return skip('message_too_large', metadata.size);
  const message = await client.fetchOne(uid, { uid: true, source: true }, { uid: true });
  if (!message) return null;
  if (message.uid !== uid || !Buffer.isBuffer(message.source)) throw new Error('IMAP source UID/content incomplete.');
  if (message.source.length > MAX_INBOUND_EMAIL_BYTES) return skip('source_too_large', message.source.length);
  return { ...message, source: message.source };
}
