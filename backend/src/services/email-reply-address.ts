import { createHmac, timingSafeEqual } from 'node:crypto';

function signature(number: number, secret: string) {
  return createHmac('sha256', secret).update(`ticket-email-reply:${number}`).digest('hex').slice(0, 20);
}

export function ticketReplyAddress(from: string, number: number, secret: string): string | undefined {
  const address = /<([^<>]+)>/.exec(from)?.[1] ?? from.trim();
  const match = /^([^@+]+)(?:\+[^@]*)?@(gmail\.com|googlemail\.com)$/i.exec(address);
  if (!match || !Number.isSafeInteger(number) || number < 1) return undefined;
  return `${match[1]}+ticket-${number}-${signature(number, secret)}@${match[2]}`;
}

export function replyAddressTicket(addresses: string[], secret: string): number | undefined {
  const numbers = new Set<number>();
  for (const address of addresses) {
    const match = /\+ticket-(\d+)-([a-f0-9]{20})@(?:gmail\.com|googlemail\.com)$/i.exec(address.trim());
    if (!match) continue;
    const number = Number(match[1]);
    if (Number.isSafeInteger(number) && number > 0 && timingSafeEqual(Buffer.from(match[2].toLowerCase()), Buffer.from(signature(number, secret)))) numbers.add(number);
  }
  return numbers.size === 1 ? [...numbers][0] : undefined;
}
