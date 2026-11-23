import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { api } from "../../services/api";
import { DropdownSelect } from "../../components/DropdownSelect";
import { ErrorMessage, Pagination } from "../management/shared";
import { money, count, periodLabel } from "./types";
import "./credit-orders.css";
import "./credit-subscriptions.css";

type Subscription = {
  id: string;
  name: string;
  amount: string;
  currency: string;
  credits: number;
  periodMonths: number | null;
  periodDays: number | null;
  status: string;
  lastOrderStatus?: string | null;
  currentStartsOn?: string | null;
  currentEndsOn: string | null;
  customer: { name: string; company: string | null };
};
const statuses = {
  AWAITING_CONSENT: "Ödeme bekliyor",
  AWAITING_PAYMENT: "Ödeme bekliyor",
  ACTIVE: "Aktif",
  PAST_DUE: "Ödeme alınamadı",
  STOPPED: "Tamamlandı",
};
const date = (value: string | null) =>
  value ? value.slice(0, 10).split("-").reverse().join(".") : "—";
function packageStatus(row: Subscription) {
  if (row.lastOrderStatus === "REFUNDED") return "İade edildi";
  if (row.lastOrderStatus === "PARTIAL_REFUND") return "Kısmi iade";
  if (!row.currentEndsOn && row.lastOrderStatus === "CANCELLED") return "İptal edildi";
  if (!row.currentEndsOn && row.lastOrderStatus === "FAILED") return "Ödeme alınamadı";
  const today = new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Europe/Istanbul",
  }).format(new Date());
  if (row.currentStartsOn && row.currentStartsOn.slice(0, 10) > today)
    return "Başlangıç bekliyor";
  if (row.currentEndsOn)
    return row.currentEndsOn.slice(0, 10) < today ? "Tamamlandı" : "Aktif";
  return statuses[row.status as keyof typeof statuses] ?? row.status;
}
const statusClasses: Record<string, string> = {
  "Aktif": "active", "Tamamlandı": "stopped", "Başlangıç bekliyor": "pending",
  "Ödeme bekliyor": "awaiting_payment", "Ödeme alınamadı": "failed",
  "İade edildi": "refunded", "Kısmi iade": "partial_refund", "İptal edildi": "cancelled",
};
export function CreditSubscriptions({ admin = false }: { admin?: boolean }) {
  const base = admin
    ? "/credit-sales/subscriptions"
    : "/my/credit-store/subscriptions";
  const [page, setPage] = useState(1),
    [limit, setLimit] = useState(20),
    [status, setStatus] = useState(""),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const query = useQuery({
    refetchInterval: 15000,
    queryKey: [base, page, term, limit, status],
    queryFn: async () =>
      (
        await api.get(base, {
          params: {
            page,
            limit,
            ...(status ? { displayStatus: status } : {}),
            search: term,
          },
        })
      ).data as {
        data: Subscription[];
        pagination: {
          total: number;
          page: number;
          limit: number;
          totalPages: number;
        };
      },
  });
  useEffect(() => {
    if (query.data && page > Math.max(1, query.data.pagination.totalPages))
      setPage(Math.max(1, query.data.pagination.totalPages));
  }, [query.data, page]);
  return (
    <section
      className="credit-orders credit-subscriptions"
      aria-label={admin ? "Abonelikler" : "Aboneliklerim"}
    >
      <div className="credit-orders-filters">
        <label className="credit-orders-search">
          <span className="field-label">Abonelik Ara</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={
              admin ? "Paket veya müşteri ara" : "Paket veya anlaşma ara"
            }
          />
        </label>
        <DropdownSelect label="Durum" ariaLabel="Abonelik durum filtresi" value={status} onChange={value => { setStatus(value); setPage(1); }} options={[{ value: "", label: "Tüm durumlar" }, ...Object.keys(statusClasses).map(label => ({ value: statusClasses[label], label }))]} />
        <DropdownSelect label="Sayfa başına" ariaLabel="Abonelik sayfa başına kayıt sayısı" value={String(limit)} onChange={value => { setLimit(Number(value)); setPage(1); }} options={[10, 20, 50, 100].map(value => ({ value: String(value), label: String(value) }))} />
      </div>
      <ErrorMessage error={query.error} />
      {query.isPending && <p role="status">Abonelikler yükleniyor…</p>}
      <div className="credit-log-table-wrap">
        <table className="credit-log-table" aria-label="Abonelik Listesi">
          <thead>
            <tr>
              {admin && <th>Müşteri</th>}
              <th>Paket / Anlaşma</th>
              <th>Dönem tutarı</th>
              <th>Kredi</th>
              <th>Durum</th>
              <th>Mevcut dönem bitişi</th>
              <th>İşlemler</th>
            </tr>
          </thead>
          <tbody>
            {query.data?.data.map((row) => (
              <tr key={row.id}>
                {admin && <td>{row.customer.company || row.customer.name}</td>}
                <td>
                  {row.name}
                  <small>{periodLabel(row)}</small>
                </td>
                <td>{money(row.amount, row.currency)}</td>
                <td>{count(row.credits)}</td>
                <td>
                  <span
                    className={`credit-order-status credit-order-status-${statusClasses[packageStatus(row)] ?? "pending"}`}
                  >
                    {packageStatus(row)}
                  </span>
                </td>
                <td>{date(row.currentEndsOn)}</td>
                <td>
                  <div className="subscription-actions">
                    <Link
                      className="button secondary"
                      to={`?view=orders&subscriptionId=${row.id}`}
                    >
                      Siparişler
                    </Link>
                  </div>
                </td>
              </tr>
            ))}
            {!query.isPending && !query.isError && !query.data?.data.length && (
              <tr>
                <td colSpan={admin ? 7 : 6}>Henüz abonelik bulunmuyor.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      {query.data && (
        <Pagination pagination={query.data.pagination} onChange={setPage} />
      )}
    </section>
  );
}
