import punycode from 'punycode.js';

/** Display IDN domains without changing the mailbox name or stored address. */
export function displayEmail(value: string | null | undefined): string {
  return (value ?? '').replace(/@([^\s,;<>]+)/g, (match, domain: string) => {
    try { return `@${punycode.toUnicode(domain)}`; } catch { return match; }
  });
}
