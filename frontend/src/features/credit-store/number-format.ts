export function normalizeMoneyEntry(text: string): string | null {
  if (text.includes("-")) return null;
  let value = text.replace(/[^0-9.,]/g, "");
  if (!value) return "";
  if (value.includes(",")) {
    if ((value.match(/,/g) || []).length > 1) return null;
    const whole = value.split(",")[0];
    if (whole.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(whole)) return null;
    value = value.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(value))
    value = value.replace(/\./g, "");
  if (!/^\d{1,8}(\.\d{0,2})?$/.test(value)) return null;
  return value.replace(/^0+(?=\d)/, "");
}
export function formatMoneyEntry(value: string) {
  return value && Number.isFinite(Number(value))
    ? new Intl.NumberFormat("tr-TR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      }).format(Number(value))
    : "";
}

export function normalizeCreditEntry(text: string): string | null {
  if (/[-,]/.test(text)) return null;
  const value = text.replace(/[^0-9.]/g, "");
  if (value.includes(".") && !/^\d{1,3}(\.\d{3})+$/.test(value)) return null;
  const digits = value.replace(/\./g, "").replace(/^0+(?=\d)/, "");
  return digits.length <= 9 ? digits : null;
}
export function formatCreditEntry(value: string): string {
  return value ? new Intl.NumberFormat("tr-TR").format(Number(value)) : "";
}
