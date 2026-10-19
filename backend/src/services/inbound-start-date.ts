/** Reject missing/invalid provider dates when a lower bound is configured. */
export function acceptsIncomingDate(since: Date | null | undefined, receivedAt: unknown) {
  if (!since) return true;
  let date: Date;
  if (receivedAt instanceof Date) date = receivedAt;
  else if (typeof receivedAt === 'number' || (typeof receivedAt === 'string' && /^\d{10,13}$/.test(receivedAt))) {
    const value = Number(receivedAt);
    date = new Date(value < 1e12 ? value * 1000 : value);
  } else if (typeof receivedAt === 'string' && /^\d{4}-\d{2}-\d{2}T.*(?:Z|[+-]\d{2}:?\d{2})$/.test(receivedAt)) date = new Date(receivedAt);
  else return false;
  return Number.isFinite(date.getTime()) && date.getTime() >= since.getTime();
}
