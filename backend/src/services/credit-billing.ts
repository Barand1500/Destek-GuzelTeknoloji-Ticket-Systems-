import { durationInput } from './credit-periods.js';
const dayMs = 86_400_000;
export const billingToday = (now = new Date()) => new Date(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(now) + 'T00:00:00Z');
/** Calculate every boundary from the original anchor, preserving month-end dates. */
export function billingBoundary(anchor: Date, months: number | null, days: number | null, index: number) {
  durationInput.parse({ periodMonths: months, periodDays: days });
  if (!Number.isInteger(index) || index < 0) throw new Error('Invalid billing index');
  if (days) return new Date(anchor.getTime() + days * index * dayMs);
  const month = anchor.getUTCMonth() + months! * index;
  const lastDay = new Date(Date.UTC(anchor.getUTCFullYear(), month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(anchor.getUTCFullYear(), month, Math.min(anchor.getUTCDate(), lastDay)));
}
