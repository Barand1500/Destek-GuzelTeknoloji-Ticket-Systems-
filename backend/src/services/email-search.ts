import { domainToUnicode } from 'node:url';
import { db } from '../config/db.js';

const normalize = (value: string) => value.normalize('NFKC').toLowerCase();
export function readableEmail(value: string): string {
  return value.replace(/@([^\s,;<>]+)/g, (original, domain: string) => {
    const unicode = domainToUnicode(domain);
    return unicode ? `@${unicode}` : original;
  });
}

/** Partial IDN labels cannot be converted to punycode independently. Decode
 * candidate addresses, then feed matching IDs into the normal scoped SQL query
 * before counting/pagination. Ordinary searches keep their existing fast path. */
export async function internationalEmailSearchIds(search?: string): Promise<string[]> {
  if (!search || !/[^\x00-\x7f]|@/.test(search)) return [];
  const needle = normalize(search.trim());
  if (!needle) return [];
  const candidates = await db.user.findMany({
    where: { deletedAt: null, OR: [{ email: { contains: 'xn--' } }, { extraEmails: { contains: 'xn--' } }] },
    select: { id: true, email: true, extraEmails: true },
  });
  return candidates.filter(person => [person.email, person.extraEmails].some(value => value && normalize(readableEmail(value)).includes(needle))).map(person => person.id);
}
