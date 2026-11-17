export const cardDigits = (value: string) => value.replace(/\D/g, "");
export function cardScheme(value: string): string | null {
  const n = cardDigits(value);
  if (/^4/.test(n)) return "Visa";
  const firstFour = Number(n.slice(0, 4));
  if (/^5[1-5]/.test(n) || (n.length >= 4 && firstFour >= 2221 && firstFour <= 2720)) return "Mastercard";
  if (/^3[47]/.test(n)) return "Amex";
  if (/^9792/.test(n)) return "Troy";
  return null;
}
export function formatCardNumber(value: string) {
  const n = cardDigits(value).slice(0, cardScheme(value) === "Amex" ? 15 : 19);
  return cardScheme(n) === "Amex"
    ? [n.slice(0, 4), n.slice(4, 10), n.slice(10)].filter(Boolean).join(" ")
    : n.match(/.{1,4}/g)?.join(" ") ?? "";
}
export function formatExpiry(value: string) {
  const n = cardDigits(value).slice(0, 4);
  return n.length > 2 ? `${n.slice(0, 2)}/${n.slice(2)}` : n;
}
export function validCardNumber(value: string) {
  const n = cardDigits(value);
  if (!/^\d{13,19}$/.test(n) || /^0+$/.test(n)) return false;
  let sum = 0;
  for (let i = n.length - 1, alternate = false; i >= 0; i--, alternate = !alternate) {
    let digit = Number(n[i]);
    if (alternate) { digit *= 2; if (digit > 9) digit -= 9; }
    sum += digit;
  }
  return sum % 10 === 0;
}
export function validExpiry(value: string, now = new Date()) {
  if (!/^\d{2}\/\d{2}$/.test(value)) return false;
  const [month, year] = value.split("/").map(Number);
  return month >= 1 && month <= 12 &&
    (2000 + year > now.getFullYear() || (2000 + year === now.getFullYear() && month >= now.getMonth() + 1));
}
export const validCvc = (value: string, scheme: string | null) =>
  (scheme === "Amex" ? /^\d{4}$/ : /^\d{3}$/).test(value);
