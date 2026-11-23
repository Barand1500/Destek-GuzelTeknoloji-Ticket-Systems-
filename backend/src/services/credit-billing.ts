import { durationInput } from './credit-periods.js';
const dayMs = 86_400_000;
export const billingToday = (now = new Date()) => new Date(new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(now) + 'T00:00:00Z');
/** Subscription periods use fixed lengths: 1 month = 30 days, 3 = 90, 6 = 180, 1 year = 365. */
export const periodLengthDays = (months: number | null, days: number | null) => days ?? (months === 12 ? 365 : months! * 30);
/** Calculate every boundary from the original anchor using fixed-length periods. */
export function billingBoundary(anchor: Date, months: number | null, days: number | null, index: number) {
  durationInput.parse({ periodMonths: months, periodDays: days });
  if (!Number.isInteger(index) || index < 0) throw new Error('Invalid billing index');
  return new Date(anchor.getTime() + periodLengthDays(months, days) * index * dayMs);
}
