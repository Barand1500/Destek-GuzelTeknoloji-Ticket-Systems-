import { useState, type ReactNode } from 'react';

export type TableSort = { sortBy: string; sortDirection: 'asc' | 'desc' } | null;
export function nextTableSort(current: TableSort, field: string): TableSort {
  return current?.sortBy !== field ? { sortBy: field, sortDirection: 'asc' }
    : current.sortDirection === 'asc' ? { sortBy: field, sortDirection: 'desc' } : null;
}
export function useTableSort(onChange?: () => void) {
  const [sort, setSort] = useState<TableSort>(null);
  return {
    sort,
    toggleSort: (field: string) => { setSort(current => nextTableSort(current, field)); onChange?.(); },
    resetSort: () => { setSort(null); onChange?.(); },
  };
}
type SortControl = ReturnType<typeof useTableSort>;
export function SortableTableHead({ sorting, columns }: { sorting: SortControl; columns: { label: ReactNode; field?: string; date?: boolean }[] }) {
  return <thead><tr>{columns.map((column, index) => {
    const labelTitle = typeof column.label === 'string' ? column.label : undefined;
    const active = column.field && sorting.sort?.sortBy === column.field ? sorting.sort.sortDirection : undefined;
    const title = active === 'desc' ? 'Varsayılan sıralamaya dön' : column.date ? active === 'asc' ? 'En yeniden en eskiye sırala' : 'En eskiden en yeniye sırala' : active === 'asc' ? 'Z → A sırala' : 'A → Z sırala';
    const actions = !column.field && typeof column.label === 'string' && /^İşlem(?:ler)?$/.test(column.label);
    return <th key={column.field ?? index} className={actions ? 'management-actions-heading' : undefined} aria-sort={column.field ? active === 'asc' ? 'ascending' : active === 'desc' ? 'descending' : 'none' : undefined}>
      <div className="management-sort-heading">{column.field ? <button className="management-sort-button" type="button" title={title} onClick={() => sorting.toggleSort(column.field!)}><span className="management-sort-label" title={labelTitle}>{column.label}</span><span aria-hidden="true">{active === 'asc' ? '↑' : active === 'desc' ? '↓' : '↕'}</span></button> : <span title={labelTitle}>{column.label}</span>}
      </div>
    </th>;
  })}</tr></thead>;
}
const collator = new Intl.Collator('tr', { sensitivity: 'base', numeric: true });
export function sortTableRows<T>(items: T[], sort: TableSort, value: (item: T, field: string) => string | number): T[] {
  if (!sort) return items;
  return [...items].sort((a, b) => {
    const left = value(a, sort.sortBy), right = value(b, sort.sortBy);
    return (sort.sortDirection === 'asc' ? 1 : -1) * (typeof left === 'number' && typeof right === 'number' ? left - right : collator.compare(String(left), String(right)));
  });
}
