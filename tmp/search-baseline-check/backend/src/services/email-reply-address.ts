import { createHmac, timingSafeEqual } from 'node:crypto';

const BASE32_ALPHABET = 'abcdefghijklmnopqrstuvwxyz234567';

function digest(number: number, secret: string) {
  return createHmac('sha256', secret).update(`ticket-email-reply:${number}`).digest();
}

function hexSignature(number: number, secret: string, length: 12 | 20) {
  return digest(number, secret).toString('hex').slice(0, length);
}

function base32Signature(number: number, secret: string) {
  const input = digest(number, secret).subarray(0, 10); // 80 bits
  let output = '';
  let value = 0;
  let bits = 0;
  for (const byte of input) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
      value &= bits ? (1 << bits) - 1 : 0;
    }
  }
  return output;
}

function validSignature(actual: string, expected: string) {
  const actualBuffer = Buffer.from(actual.toLowerCase());
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export function ticketReplyAddress(from: string, number: number, secret: string): string | undefined {
  const address = /<([^<>]+)>/.exec(from)?.[1] ?? from.trim();
  const match = /^([^@+]+)(?:\+[^@]*)?@(gmail\.com|googlemail\.com)$/i.exec(address);
  if (!match || !Number.isSafeInteger(number) || number < 1) return undefined;
  const shortNumber = number.toString(36);
  return `${match[1]}+t-${shortNumber}-${base32Signature(number, secret)}@${match[2]}`;
}

export function replyAddressTicket(addresses: string[], secret: string): number | undefined {
  const numbers = new Set<number>();
  for (const address of addresses) {
    const value = address.trim();
    const compact = /\+t-([a-z0-9]+)-([a-z2-7]{16})@(?:gmail\.com|googlemail\.com)$/i.exec(value);
    if (compact) {
      const number = Number.parseInt(compact[1], 36);
      if (Number.isSafeInteger(number) && number > 0 && validSignature(compact[2], base32Signature(number, secret))) numbers.add(number);
      continue;
    }
    // Keep the temporary 48-bit compact format valid for messages that may
    // already have been sent during the transition to the 80-bit format.
    const transitional = /\+t-([a-z0-9]+)-([a-f0-9]{12})@(?:gmail\.com|googlemail\.com)$/i.exec(value);
    if (transitional) {
      const number = Number.parseInt(transitional[1], 36);
      if (Number.isSafeInteger(number) && number > 0 && validSignature(transitional[2], hexSignature(number, secret, 12))) numbers.add(number);
      continue;
    }
    // Keep the original long format valid, so replies to older e-mails are
    // not disconnected.
    const legacy = /\+ticket-(\d+)-([a-f0-9]{20})@(?:gmail\.com|googlemail\.com)$/i.exec(value);
    if (!legacy) continue;
    const number = Number(legacy[1]);
    if (Number.isSafeInteger(number) && number > 0 && validSignature(legacy[2], hexSignature(number, secret, 20))) numbers.add(number);
  }
  return numbers.size === 1 ? [...numbers][0] : undefined;
}

export function hasTicketReplyTag(addresses: string[]) {
  return addresses.some(address => /\+(?:t-|ticket-)/i.test(address));
}
