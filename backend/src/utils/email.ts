import { domainToASCII } from 'node:url';
import { z } from 'zod';

export function canonicalEmail(value: string): string {
  const trimmed = value.trim().toLowerCase();
  const at = trimmed.lastIndexOf('@');
  if (at < 0) return trimmed;
  const domain = domainToASCII(trimmed.slice(at + 1));
  return domain ? `${trimmed.slice(0, at)}@${domain}` : trimmed;
}

// Keep IDN domains canonical for matching; Unicode mailbox names require SMTPUTF8.
export const emailSchema = z.string().trim().transform(canonicalEmail)
  .pipe(z.email({ pattern: z.regexes.unicodeEmail }).max(254));

export const extraEmailsSchema = z.string().trim().max(500)
  .transform(value => value.split(/[,;\s]+/).filter(Boolean).map(canonicalEmail).join(', '))
  .refine(value => !value || value.split(', ').every(email => emailSchema.safeParse(email).success), 'Geçerli e-posta adresleri girin.');
