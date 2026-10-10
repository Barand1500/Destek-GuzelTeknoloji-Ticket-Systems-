import { useEffect, useState, type FormEvent, type KeyboardEvent, type MouseEvent, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../../services/api";
import type { Page } from "../../types";
import { DropdownSelect } from "../../components/DropdownSelect";
import "./management.css";
import { useAuth } from '../auth/Auth';
import { hasPermission, screenPermission } from '../auth/permissions';
import { useLocation } from 'react-router-dom';

export const formatDate = (value: string) =>
  new Date(value).toLocaleString("tr-TR");
export function editableRowProps(onEdit: () => void) {
  const activate = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key !== "Enter" && event.key !== " ") return;
    event.preventDefault();
    onEdit();
  };
  return {
    tabIndex: 0,
    className: "management-editable-row",
    onClick: (event: MouseEvent<HTMLTableRowElement>) => {
      if ((event.target as HTMLElement).closest("button, a, input, select, textarea, label")) return;
      onEdit();
    },
    onKeyDown: activate,
  };
}
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">DESTEK MERKEZİ</span>
        <h1>{title}</h1>
        {description && <p>{description}</p>}
      </div>
      {children}
    </div>
  );
}
export function ErrorMessage({ error }: { error: unknown }) {
  return error ? (
    <p className="error" role="alert">
      {errorText(error)}
    </p>
  ) : null;
}
export function useList<T>(
  path: string,
  extra: Record<string, string | boolean | number> = {},
  leadingRecords = 0,
) {
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(15);
  const [search, setSearch] = useState("");
  const deferredSearch = useDebouncedValue(search);
  const query = useQuery({
    queryKey: [path, page, limit, deferredSearch, extra, leadingRecords],
    queryFn: async () => {
      const offset = Math.max(0, (page - 1) * limit - leadingRecords);
      const serverPage = leadingRecords ? Math.floor(offset / limit) + 1 : page;
      const result = (
        await api.get<Page<T>>(path, {
          params: { page: serverPage, limit, search: deferredSearch, ...extra },
        })
      ).data;
      if (leadingRecords) {
        const skip = offset % limit;
        const count = page === 1 ? Math.max(0, limit - leadingRecords) : limit;
        let records = result.data;
        if (skip + count > limit && serverPage < result.pagination.totalPages) {
          const next = (await api.get<Page<T>>(path, { params: { page: serverPage + 1, limit, search: deferredSearch, ...extra } })).data;
          records = [...records, ...next.data];
        }
        const total = result.pagination.total + leadingRecords;
        return { ...result, data: records.slice(skip, skip + count), pagination: { ...result.pagination, page, limit, total, totalPages: Math.ceil(total / limit) } };
      }
      return result;
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  useEffect(() => {
    if (!query.data || query.isPlaceholderData || query.isFetching) return;
    const lastPage = Math.max(1, query.data.pagination.totalPages);
    if (page > lastPage) setPage(lastPage);
  }, [query.data, query.isPlaceholderData, query.isFetching, page]);
  return {
    ...query,
    page,
    setPage,
    limit,
    setLimit: (value: number) => {
      if (![10, 15, 20, 50].includes(value)) return;
      setLimit(value);
      setPage(1);
    },
    search,
    setSearch: (value: string) => {
      setSearch(value);
      setPage(1);
    },
  };
}
export function useDebouncedValue<T>(value: T, delay = 300) {
  const [deferredValue, setDeferredValue] = useState(value);
  useEffect(() => {
    const timer = window.setTimeout(() => setDeferredValue(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);
  return deferredValue;
}
export function Search({
  value,
  onChange,
  label = "Kayıtlarda ara",
  placeholder = "Ad veya metin yazın…",
  limit,
  onLimitChange,
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
  limit?: number;
  onLimitChange?: (limit: number) => void;
}) {
  const field = (
    <label className="management-search">
      <span className="field-label">{label}</span>
      <input
        type="search"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </label>
  );
  return onLimitChange ? <div className="management-list-toolbar">
    {field}
    <div className="management-page-size">
      <span>Kayıt sayısı</span>
      <DropdownSelect ariaLabel="Kayıt sayısı" value={String(limit ?? 15)} onChange={value => onLimitChange(Number(value))} options={[10, 15, 20, 50].map(value => ({ value: String(value), label: String(value) }))} />
    </div>
  </div> : field;
}
export function Pagination({
  pagination,
  onChange,
  alwaysVisible = false,
}: {
  pagination?: Page<unknown>["pagination"];
  onChange: (page: number) => void;
  alwaysVisible?: boolean;
}) {
  if (!pagination || (!alwaysVisible && pagination.total <= pagination.limit)) return null;
  return (
    <nav className="management-pagination" aria-label="Sayfalama">
      <span>
        {pagination.total} kayıt · Sayfa {pagination.page} /{" "}
        {Math.max(1, pagination.totalPages)}
      </span>
      <div className="management-pagination-controls">
      <div className="management-actions">
        <button
          type="button"
          className="button secondary"
          disabled={pagination.page <= 1}
          onClick={() => onChange(pagination.page - 1)}
        >
          Önceki
        </button>
        <button
          type="button"
          className="button secondary"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onChange(pagination.page + 1)}
        >
          Sonraki
        </button>
      </div>
      </div>
    </nav>
  );
}
export function ListState({
  loading,
  error,
  empty,
}: {
  loading: boolean;
  error: unknown;
  empty: boolean;
}) {
  if (error) return <ErrorMessage error={error} />;
  if (loading)
    return (
      <p className="management-empty" role="status">
        Kayıtlar yükleniyor…
      </p>
    );
  return empty ? (
    <p className="management-empty">Bu görünümde kayıt bulunamadı.</p>
  ) : null;
}
export function useSave(
  path: string,
  onSuccess?: () => void,
  invalidate: string[] = [],
) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id?: string; data: unknown }) =>
      id ? api.patch(`${path}/${id}`, data) : api.post(path, data),
    onSuccess: async () => {
      await Promise.all(
        [path, ...invalidate].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
      onSuccess?.();
    },
  });
}
export function useDelete(path: string, invalidate: string[] = []) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`${path}/${id}`),
    onSuccess: async () => {
      await Promise.all(
        [path, ...invalidate].map((key) =>
          client.invalidateQueries({ queryKey: [key] }),
        ),
      );
    },
  });
}
export function FormActions({
  pending,
  onCancel,
  submitLabel = "Kaydet",
}: {
  pending: boolean;
  onCancel?: () => void;
  submitLabel?: string;
}) {
  const { user } = useAuth();
  const { pathname } = useLocation();
  const resource = screenPermission(pathname)?.split('.')[0];
  const allowed = !resource || hasPermission(user, `${resource}.${onCancel ? 'update' : 'create'}`);
  return (
    <div className="management-actions">
      <button className="button primary" disabled={pending || !allowed}>
        {pending ? "Kaydediliyor…" : submitLabel}
      </button>
      {onCancel && (
        <button
          className="button secondary"
          type="button"
          disabled={pending}
          onClick={onCancel}
        >
          Vazgeç
        </button>
      )}
    </div>
  );
}
export const formValues = (event: FormEvent<HTMLFormElement>) => {
  event.preventDefault();
  return new FormData(event.currentTarget);
};
