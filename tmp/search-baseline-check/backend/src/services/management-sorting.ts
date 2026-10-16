export type SortQuery = { sortBy?: string; sortDirection?: 'asc' | 'desc' };
export function managementOrder<T>(query: SortQuery, fields: Record<string, (direction: 'asc' | 'desc') => T>, fallback: T[]): T[] {
  const field = query.sortBy && fields[query.sortBy];
  return field && query.sortDirection ? [field(query.sortDirection), ...fallback] : fallback;
}
const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
export function sortManagementRows<T extends { id: string }>(rows: T[], query: SortQuery, fields: Record<string, (row: T) => string | number>): T[] {
  const value = query.sortBy && fields[query.sortBy];
  if (!value || !query.sortDirection) return rows;
  const direction = query.sortDirection === 'asc' ? 1 : -1;
  return [...rows].sort((a, b) => {
    const left = value(a), right = value(b);
    const result = typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right));
    return direction * result || collator.compare(a.id, b.id);
  });
}
