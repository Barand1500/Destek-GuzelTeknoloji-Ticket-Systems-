import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../../services/api";
import { DropdownSelect } from "../../components/DropdownSelect";
import { ErrorMessage, Pagination } from "../management/shared";
import { useAuth } from "../auth/Auth";
import { hasPermission } from "../auth/permissions";
import { count, money, periodLabel } from "./types";
import "./credit-orders.css";

type Order = {
  id: string;
  number: number | string;
  kind: "TOP_UP" | "SUBSCRIPTION";
  name: string;
  credits: number;
  total: string;
  currency: string;
  unitPrice: string | null;
  validityDays: number | null;
  periodMonths: number | null;
  periodName?: string | null;
  renewalRequested?: boolean;
  status: "PENDING" | "CANCELLED" | "PAID" | "FAILED";
  createdAt: string;
  cancelledAt: string | null;
  customer?: { id: string; name: string; company?: string | null };
};
type OrdersPage = {
  data: Order[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};
const statuses = {
  PENDING: "Ödeme bekliyor",
  CANCELLED: "İptal edildi",
  PAID: "Ödendi",
  FAILED: "Başarısız",
};
export function CreditOrders({ admin = false }: { admin?: boolean }) {
  const { user } = useAuth(),
    client = useQueryClient();
  const base = admin ? "/credit-sales/orders" : "/my/credit-store/orders";
  const canCancel = !admin || hasPermission(user, "integrations.update");
  const [page, setPage] = useState(1),
    [limit, setLimit] = useState(20),
    [search, setSearch] = useState(""),
    [term, setTerm] = useState(""),
    [status, setStatus] = useState("");
  const [target, setTarget] = useState<Order | null>(null),
    [message, setMessage] = useState("");
  const dialog = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const timer = setTimeout(() => {
      setTerm(search.trim());
      setPage(1);
    }, 300);
    return () => clearTimeout(timer);
  }, [search]);
  const orders = useQuery({
    queryKey: [base, { page, limit, search: term, status }],
    queryFn: async () =>
      (
        await api.get(base, {
          params: {
            page,
            limit,
            ...(term ? { search: term } : {}),
            ...(status ? { status } : {}),
          },
        })
      ).data as OrdersPage,
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.post(`${base}/${id}/cancel`),
    onSuccess: async () => {
      setTarget(null);
      setMessage("Sipariş iptal edildi. Kredi bakiyeniz değişmedi.");
      await Promise.all([
        client.invalidateQueries({ queryKey: [base] }),
        client.invalidateQueries({ queryKey: ["agreements"] }),
        client.invalidateQueries({ queryKey: ["notifications"] }),
      ]);
    },
  });
  useEffect(() => {
    if (target && !dialog.current?.open) dialog.current?.showModal();
  }, [target]);
  const rows = orders.data?.data ?? [];
  useEffect(() => {
    const pagination = orders.data?.pagination;
    if (pagination && page > Math.max(1, pagination.totalPages))
      setPage(Math.max(1, pagination.totalPages));
  }, [orders.data, page]);
  return (
    <section className="credit-orders" aria-label="Siparişler">
      <h2>{admin ? "Kredi ve Paket Siparişleri" : "Siparişlerim"}</h2>
      <p className="credit-orders-note">
        Online ödeme henüz kullanılamıyor. Ödeme bekleyen siparişler kredi
        bakiyesini değiştirmez. Tutarlar sipariş anındaki fiyatları gösterir.
      </p>
      <div className="credit-orders-filters">
        <label className="credit-orders-search">
          Sipariş Ara
          <input
            aria-label="Sipariş Ara"
            maxLength={100}
            value={search}
            placeholder={
              admin
                ? "Sipariş, paket veya müşteri ara"
                : "Sipariş veya paket ara"
            }
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <DropdownSelect
          label="Durum"
          ariaLabel="Sipariş Durumu"
          value={status}
          options={[
            { value: "", label: "Tüm durumlar" },
            ...Object.entries(statuses).map(([value, label]) => ({
              value,
              label,
            })),
          ]}
          onChange={(value) => {
            setStatus(value);
            setPage(1);
          }}
        />
        <DropdownSelect
          label="Sayfa başına"
          ariaLabel="Sipariş Sayısı"
          value={String(limit)}
          options={[20, 50, 100].map((value) => ({
            value: String(value),
            label: String(value),
          }))}
          onChange={(value) => {
            setLimit(Number(value));
            setPage(1);
          }}
        />
      </div>
      {message && <p role="status">{message}</p>}
      {orders.isPending && <p role="status">Siparişler yükleniyor…</p>}
      {orders.isError && (
        <div>
          <ErrorMessage error={orders.error} />
          <button
            type="button"
            className="button secondary"
            onClick={() => void orders.refetch()}
          >
            Tekrar Dene
          </button>
        </div>
      )}
      {!orders.isPending && !orders.isError && (
        <>
          {rows.length === 0 ? (
            <p className="management-empty">Bu görünümde sipariş bulunamadı.</p>
          ) : (
            <div className="credit-orders-table-wrap">
              <table className="credit-orders-table">
                <thead>
                  <tr>
                    <th>Tarih</th>
                    <th>Sipariş No</th>
                    {admin && <th>Müşteri</th>}
                    <th>Paket</th>
                    <th>Kredi</th>
                    <th>Tutar</th>
                    <th>Durum</th>
                    {canCancel && (
                      <th>
                        <span className="credit-orders-action-label">
                          İşlem
                        </span>
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => (
                    <tr key={order.id}>
                      <td>
                        <time dateTime={order.createdAt}>
                          {new Date(order.createdAt).toLocaleString("tr-TR", {
                            dateStyle: "short",
                            timeStyle: "short",
                          })}
                        </time>
                      </td>
                      <td>{order.number}</td>
                      {admin && (
                        <td>
                          {order.customer?.name ?? "—"}
                          {order.customer?.company && (
                            <small>{order.customer.company}</small>
                          )}
                        </td>
                      )}
                      <td>
                        {order.name}
                        <small>
                          {order.kind === "SUBSCRIPTION"
                            ? periodLabel({
                                ...order,
                                periodDays: order.validityDays,
                              })
                            : order.validityDays
                              ? `${count(order.validityDays)} gün geçerli`
                              : "Ek kredi"}
                        </small>
                        {order.kind === "SUBSCRIPTION" && (
                          <small>
                            Tekrarlama tercihi:{" "}
                            {order.renewalRequested ? "Evet" : "Hayır"}
                          </small>
                        )}
                      </td>
                      <td>{count(order.credits)}</td>
                      <td>
                        {money(order.total, order.currency)}
                        <small>{order.currency}</small>
                      </td>
                      <td>
                        <span
                          className={`credit-order-status credit-order-status-${order.status.toLowerCase()}`}
                        >
                          {statuses[order.status]}
                        </span>
                      </td>
                      {canCancel && (
                        <td>
                          <div className="credit-order-actions">
                            {!admin && order.status === "PENDING" && <Link className="button primary" to={`/customer/agreements?view=checkout&orderId=${encodeURIComponent(order.id)}`}>Ödemeye Geç</Link>}
                            {order.status === "PENDING" && (
                              <button
                                type="button"
                                className="button secondary"
                                disabled={cancel.isPending}
                                aria-label="Siparişi İptal Et"
                                onClick={() => {
                                  cancel.reset();
                                  setMessage("");
                                  setTarget(order);
                                }}
                              >
                                İptal Et
                              </button>
                            )}
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            pagination={orders.data?.pagination}
            onChange={setPage}
            alwaysVisible
          />
        </>
      )}
      {target && (
        <dialog
          ref={dialog}
          className="credit-order-dialog"
          aria-label="Siparişi İptal Et"
          onCancel={(event) => {
            if (cancel.isPending) event.preventDefault();
            else setTarget(null);
          }}
        >
          <h2>Siparişi İptal Et</h2>
          <p>
            <strong>{target.number}</strong> numaralı siparişi iptal etmek
            istiyor musunuz?
          </p>
          <p>
            Kredi bakiyeniz değişmez. Herhangi bir ödeme veya iade yapılmaz.
          </p>
          <ErrorMessage error={cancel.error} />
          <div className="credit-order-dialog-actions">
            <button
              autoFocus
              type="button"
              className="button secondary"
              disabled={cancel.isPending}
              onClick={() => setTarget(null)}
            >
              Vazgeç
            </button>
            <button
              type="button"
              className="button danger"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate(target.id)}
            >
              {cancel.isPending ? "İptal ediliyor…" : "İptali Onayla"}
            </button>
          </div>
        </dialog>
      )}
    </section>
  );
}
