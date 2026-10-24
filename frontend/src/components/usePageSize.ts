import { useState } from 'react';
import { useAuth } from '../features/auth/Auth';

const defaultSizes = [10, 15, 20, 50];
export function usePageSize(list: string, defaultSize = 15, allowedSizes: readonly number[] = defaultSizes) {
  const { user } = useAuth();
  const key = `helpdesk-page-size:${user?.id ?? 'guest'}:${list}`;
  const read = () => {
    try {
      const value = Number(window.localStorage.getItem(key));
      return allowedSizes.includes(value) ? value : defaultSize;
    } catch { return defaultSize; }
  };
  const [selection, setSelection] = useState(() => ({ key, value: read() }));
  const value = selection.key === key ? selection.value : read();
  const setValue = (next: number) => {
    if (!allowedSizes.includes(next)) return;
    try { window.localStorage.setItem(key, String(next)); } catch { /* Keep the selection usable if browser storage is unavailable. */ }
    setSelection({ key, value: next });
  };
  return [value, setValue] as const;
}
