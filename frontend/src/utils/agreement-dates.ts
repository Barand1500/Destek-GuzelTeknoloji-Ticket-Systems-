/** Inclusive calendar period. Missing anniversary days use the target month's last day. */
export function agreementEndDate(start: string, type: string): string {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !['MONTHLY', 'YEARLY'].includes(type)) return '';
  const parsed = new Date(`${start}T00:00:00Z`);
  if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== start) return '';
  const year = parsed.getUTCFullYear(), month = parsed.getUTCMonth(), day = parsed.getUTCDate();
  const targetMonth = month + (type === 'MONTHLY' ? 1 : 12);
  const lastDay = new Date(Date.UTC(year, targetMonth + 1, 0)).getUTCDate();
  const end = new Date(Date.UTC(year, targetMonth, day > lastDay ? lastDay : day - 1));
  return end.getUTCFullYear() > 9999 ? '' : end.toISOString().slice(0, 10);
}
