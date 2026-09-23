import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, errorText } from "../../services/api";
import type { Page } from "../../types";
import "./management.css";

export const formatDate = (value: string) =>
  new Date(value).toLocaleString("tr-TR");
export function Heading({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children?: ReactNode;
}) {
  return (
    <div className="page-heading">
      <div>
        <span className="eyebrow">DESTEK MERKEZİ</span>
        <h1>{title}</h1>
        <p>{description}</p>
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
  extra: Record<string, string | boolean> = {},
) {
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const deferredSearch = useDebouncedValue(search);
  const query = useQuery({
    queryKey: [path, page, deferredSearch, extra],
    queryFn: async () => {
      const result = (
        await api.get<Page<T>>(path, {
          params: { page, limit: 15, search: deferredSearch, ...extra },
        })
      ).data;
      return result;
    },
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  return {
    ...query,
    page,
    setPage,
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
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
  placeholder?: string;
}) {
  return (
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
}
export function Pagination({
  pagination,
  onChange,
}: {
  pagination?: Page<unknown>["pagination"];
  onChange: (page: number) => void;
}) {
  if (!pagination || pagination.total <= pagination.limit) return null;
  return (
    <nav className="management-pagination" aria-label="Sayfalama">
      <span>
        {pagination.total} kayıt · Sayfa {pagination.page} /{" "}
        {Math.max(1, pagination.totalPages)}
      </span>
      <div className="management-actions">
        <button
          className="button secondary"
          disabled={pagination.page <= 1}
          onClick={() => onChange(pagination.page - 1)}
        >
          Önceki
        </button>
        <button
          className="button secondary"
          disabled={pagination.page >= pagination.totalPages}
          onClick={() => onChange(pagination.page + 1)}
        >
          Sonraki
        </button>
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
  return (
    <div className="management-actions">
      <button className="button primary" disabled={pending}>
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
