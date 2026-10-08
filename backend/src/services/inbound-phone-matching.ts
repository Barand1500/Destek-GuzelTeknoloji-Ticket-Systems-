// Store/display formatting is preserved; compare complete international numbers.
export function canonicalPhone(value?: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("0") && digits.length === 11) return `90${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("5")) return `90${digits}`;
  return digits;
}

export function matchesPhone(customer: { phone?: string | null; extraPhones?: string | null }, sender: string) {
  const phone = canonicalPhone(sender);
  return Boolean(phone) && [customer.phone, ...(customer.extraPhones ?? "").split(/[,;\n]+/)]
    .some(value => canonicalPhone(value) === phone);
}
