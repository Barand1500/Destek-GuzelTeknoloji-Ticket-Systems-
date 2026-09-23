type EmailContact = { name: string; email: string | null; extraEmails: string | null };
const normalize = (value: string) => value.trim().toLowerCase();

export function matchesSender(contact: EmailContact, address: string) {
  const email = normalize(address);
  return [contact.email ?? '', ...(contact.extraEmails ?? '').split(/[,;\s]+/)].some(value => normalize(value) === email);
}

export function selectEmailCustomer<T extends EmailContact>(contacts: T[], address: string, displayName?: string): T | undefined {
  const matching = contacts.filter(contact => matchesSender(contact, address));
  const primary = matching.filter(contact => normalize(contact.email ?? '') === normalize(address));
  const candidates = primary.length ? primary : matching;
  if (candidates.length === 1) return candidates[0];
  if (!candidates.length) return undefined;
  // A display name may disambiguate a shared address, never override the address.
  const named = displayName ? candidates.filter(contact => contact.name.trim().toLocaleLowerCase('tr-TR') === displayName.trim().toLocaleLowerCase('tr-TR')) : [];
  if (named.length === 1) return named[0];
  throw new Error('Gönderen e-posta adresi birden fazla müşteriye ait; müşteri eşleşmesi belirsiz.');
}
