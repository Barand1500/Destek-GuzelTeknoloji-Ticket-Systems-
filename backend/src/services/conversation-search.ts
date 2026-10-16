import type { Prisma } from '../generated/prisma/client.js';
import { conversationChannelFilter } from './reply-channels.js';

export function ticketNumberSearch(search: string): Prisma.ConversationWhereInput[] {
  const value = search.normalize('NFKC').trim();
  const match = /^(?:#\s*)?(?:TK\s*-?\s*)?(\d*)$/i.exec(value);
  if (!match || (!match[1] && !/TK/i.test(value))) return [];
  const digits = match[1];
  if (!digits) return [{ number: { gt: 0 } }];
  const number = Number(digits);
  const result: Prisma.ConversationWhereInput[] = Number.isSafeInteger(number) && number > 0 && number <= 2147483647 ? [{ number }] : [];
  // The UI pads ticket numbers to five digits. Match unfinished padded prefixes too.
  if (digits.length < 5 && digits.startsWith('0')) result.push({ number: { gte: Math.max(1, Number(digits.padEnd(5, '0'))), lte: Number(digits.padEnd(5, '9')) } });
  return result;
}

export function phoneSearchValues(search: string): string[] {
  if (!/^[+\d\s().-]+$/.test(search)) return [];
  const digits = search.replace(/\D/g, '');
  if (!digits) return [];
  const local = digits.replace(/^(?:0090|90|0)/, '');
  const national = `0${local}`;
  const formatted = [national.slice(0, 4), national.slice(4, 7), national.slice(7, 9), national.slice(9)].filter(Boolean).join(' ');
  return [...new Set([digits, local, national, `90${local}`, formatted])].filter(Boolean);
}

export function conversationSearch(search: string, customerView: boolean, options: { statuses: string[]; priorities: string[] }): Prisma.ConversationWhereInput {
  const text = search.normalize('NFKC').trim();
  const key = text.toLocaleLowerCase('tr-TR');
  const channelNames = { TICKET: ['telefon', 'ticket'], EMAIL: ['e-posta', 'eposta', 'mail', 'email'], SMS: ['sms'], WHATSAPP: ['whatsapp'], LIVE_CHAT: ['canlı sohbet'] } as const;
  const channelMatches = Object.entries(channelNames).filter(([, names]) => names.some(name => name.includes(key))).map(([channel]) => channel as keyof typeof channelNames);
  const phones = phoneSearchValues(text);
  const contact: Prisma.UserWhereInput[] = [
    ...['name', 'email', 'phone', 'company', 'extraEmails', 'extraPhones'].map(field => ({ [field]: { contains: text } })),
    ...phones.flatMap(value => [{ phone: { contains: value } }, { extraPhones: { contains: value } }]),
  ];
  return { OR: [
    { subject: { contains: text } }, { searchSubject: { contains: key } },
    ...ticketNumberSearch(text),
    { customer: { OR: contact } },
    { assignedAgent: { is: { OR: customerView ? [{ name: { contains: text } }, { email: { contains: text } }] : contact } } },
    { department: { name: { contains: text } } },
    { website: { is: { OR: [{ name: { contains: text } }, { url: { contains: text } }] } } },
    { websiteUrl: { contains: text } },
    { tags: { some: { tag: { OR: [{ name: { contains: text } }, { code: { contains: text } }] } } } },
    { messages: { some: { body: { contains: text }, ...(customerView ? { type: { in: ['CUSTOMER_MESSAGE', 'AGENT_REPLY'] } } : {}) } } },
    ...(options.statuses.length ? [{ status: { in: options.statuses } }] : []),
    ...(options.priorities.length ? [{ priority: { in: options.priorities } }] : []),
    ...channelMatches.map(conversationChannelFilter),
    ...(['atanmamış', 'atanmamis'].some(value => value.includes(key)) ? [{ assignedAgentId: null }] : []),
  ] };
}
