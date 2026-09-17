import { useState, type FormEvent } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  CheckCheck,
  Inbox,
  Plus,
  Search,
  Send,
  LockKeyhole,
  MessageSquare,
} from "lucide-react";
import { api, errorText } from "../../services/api";
import { useAuth } from "../auth/Auth";
import {
  statuses,
  priorities,
  type Department,
  type Message,
  type Page,
  type Ticket,
  type User,
} from "../../types";
const date = (value: string) =>
  new Date(value).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
export function Badge({ status }: { status: Ticket["status"] }) {
  return (
    <span className={`badge status-${status}`}>
      <span />
      {statuses[status]}
    </span>
  );
}
export function QueryError({ error }: { error: unknown }) {
  return (
    <div className="error" role="alert">
      {errorText(error)}
    </div>
  );
}
export function TicketList() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const page = Number(params.get("page") ?? 1);
  const status = params.get("status") ?? "";
  const view = params.get("view") ?? "all";
  const query = useQuery({
    queryKey: ["tickets", params.toString()],
    queryFn: async () =>
      (
        await api.get<Page<Ticket>>("/tickets", {
          params: { ...Object.fromEntries(params), limit: 15 },
        })
      ).data,
  });
  function filter(key: string, value: string) {
    setParams((p) => {
      value ? p.set(key, value) : p.delete(key);
      p.delete("page");
      return p;
    });
  }
  return (
    <main className="page">
      <div className="page-heading">
        <div>
          <span className="eyebrow">DESTEK TALEPLERİ</span>
          <h1>
            {user?.role === "CUSTOMER" ? "Taleplerim" : "Gelen kutusu"}
            <span className="count">{query.data?.pagination.total ?? "—"}</span>
          </h1>
          <p>
            {user?.role === "CUSTOMER"
              ? "Taleplerinizin son durumunu takip edin, ekibimizle iletişimde kalın."
              : "Konuşmaları takip edin. Ekibinizle birlikte çözüme ulaştırın."}
          </p>
        </div>
        {user?.role === "CUSTOMER" && (
          <Link className="button primary" to="/new">
            <Plus size={17} />
            Yeni talep
          </Link>
        )}
      </div>
      <section className="ticket-panel">
        <div className="tabs">
          <button
            className={view === "all" ? "active" : ""}
            onClick={() => filter("view", "all")}
          >
            Tüm talepler
          </button>
          {user?.role !== "CUSTOMER" && (
            <button
              className={view === "mine" ? "active" : ""}
              onClick={() => filter("view", "mine")}
            >
              Bana atananlar
            </button>
          )}
          {["ADMIN", "SUPERVISOR"].includes(user?.role ?? "") && (
            <button
              className={view === "unassigned" ? "active" : ""}
              onClick={() => filter("view", "unassigned")}
            >
              Atanmamış
            </button>
          )}
        </div>
        <div className="filters">
          <form
            className="search-box"
            onSubmit={(e) => {
              e.preventDefault();
              filter("search", search);
            }}
          >
            <Search size={18} />
            <input
              aria-label="Taleplerde ara"
              placeholder="Konuya göre ara…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
            <button type="submit">Ara</button>
          </form>
          <select
            aria-label="Duruma göre filtrele"
            value={status}
            onChange={(e) => filter("status", e.target.value)}
          >
            <option value="">Tüm durumlar</option>
            {Object.entries(statuses).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <select
            aria-label="Önceliğe göre filtrele"
            value={params.get("priority") ?? ""}
            onChange={(e) => filter("priority", e.target.value)}
          >
            <option value="">Tüm öncelikler</option>
            {Object.entries(priorities).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </div>
        {query.isPending ? (
          <div className="empty">Talepler yükleniyor…</div>
        ) : query.isError ? (
          <QueryError error={query.error} />
        ) : query.data.data.length === 0 ? (
          <div className="empty">
            <Inbox size={36} />
            <h2>Burada henüz talep yok</h2>
            <p>
              {user?.role === "CUSTOMER"
                ? "Yeni bir destek talebi oluşturarak başlayabilirsiniz."
                : "Bu filtrelerle eşleşen erişilebilir bir talep bulunamadı."}
            </p>
          </div>
        ) : (
          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  <th>TALEP</th>
                  <th>DURUM</th>
                  <th>ÖNCELİK</th>
                  <th>DEPARTMAN</th>
                  <th>ATANAN</th>
                  <th>SON GÜNCELLEME</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((ticket) => (
                  <tr key={ticket.id}>
                    <td>
                      <Link
                        className="ticket-title"
                        to={`/tickets/${ticket.id}`}
                      >
                        <small>
                          #TK-{String(ticket.number).padStart(5, "0")}
                        </small>
                        {ticket.subject}
                      </Link>
                      <span className="customer-name">
                        {ticket.customer.name}
                      </span>
                    </td>
                    <td>
                      <Badge status={ticket.status} />
                    </td>
                    <td>
                      <span className={`priority priority-${ticket.priority}`}>
                        ●
                      </span>{" "}
                      {priorities[ticket.priority]}
                    </td>
                    <td>{ticket.department.name}</td>
                    <td>
                      {ticket.assignedAgent?.name ?? (
                        <span className="muted">Atanmamış</span>
                      )}
                    </td>
                    <td className="muted">{date(ticket.updatedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <div className="pagination">
          <span>
            {query.data?.pagination.total ?? 0} talep · Sayfa {page} /{" "}
            {Math.max(1, query.data?.pagination.totalPages ?? 1)}
          </span>
          <div>
            <button
              className="icon-button"
              aria-label="Önceki sayfa"
              disabled={page <= 1}
              onClick={() =>
                setParams((p) => {
                  p.set("page", String(page - 1));
                  return p;
                })
              }
            >
              <ArrowLeft size={17} />
            </button>
            <button
              className="icon-button"
              aria-label="Sonraki sayfa"
              disabled={!query.data || page >= query.data.pagination.totalPages}
              onClick={() =>
                setParams((p) => {
                  p.set("page", String(page + 1));
                  return p;
                })
              }
            >
              <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </section>
      <p className="page-note">
        <LockKeyhole size={13} /> Yalnızca erişim yetkiniz olan talepler
        gösterilir.
      </p>
    </main>
  );
}
export function NewTicket() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const departments = useQuery({
    queryKey: ["departments"],
    queryFn: async () =>
      (await api.get("/departments")).data.data as Department[],
  });
  const mutation = useMutation({
    mutationFn: async (body: unknown) =>
      (await api.post("/tickets", body)).data.data as Ticket,
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: ["tickets"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(`/tickets/${ticket.id}`);
    },
  });
  if (user?.role !== "CUSTOMER")
    return (
      <main className="page">
        <p>Yeni talep oluşturmak için müşteri hesabı kullanın.</p>
      </main>
    );
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    mutation.mutate(Object.fromEntries(form));
  }
  return (
    <main className="page">
      <Link className="back-link" to="/tickets">
        <ArrowLeft size={16} />
        Taleplere dön
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">YANINIZDAYIZ</span>
          <h1>Size nasıl yardımcı olabiliriz?</h1>
          <p>Konuyu bize anlatın, doğru ekibimiz sizinle iletişime geçsin.</p>
        </div>
      </div>
      <form className="form-card" onSubmit={submit}>
        <label>
          Konu
          <input
            name="subject"
            required
            minLength={5}
            maxLength={200}
            placeholder="Talebinizi kısaca özetleyin"
          />
        </label>
        <div className="form-row">
          <label>
            Departman
            <select name="departmentId" required defaultValue="">
              <option value="" disabled>
                Departman seçin
              </option>
              {departments.data?.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Öncelik
            <select name="priority" defaultValue="NORMAL">
              {Object.entries(priorities).map(([k, v]) => (
                <option value={k} key={k}>
                  {v}
                </option>
              ))}
            </select>
          </label>
        </div>
        <label>
          Açıklama
          <textarea
            name="message"
            required
            maxLength={10000}
            rows={8}
            placeholder="Neler olduğunu ve size nasıl yardımcı olabileceğimizi paylaşın…"
          />
        </label>
        {departments.isError && <QueryError error={departments.error} />}{" "}
        {mutation.isError && <QueryError error={mutation.error} />}
        <div className="form-footer">
          <span>Ekibimiz talebinizi inceleyecek.</span>
          <button
            className="button primary"
            disabled={mutation.isPending || !departments.data?.length}
          >
            {mutation.isPending ? "Oluşturuluyor…" : "Talep oluştur"}
            <ArrowRight size={16} />
          </button>
        </div>
      </form>
    </main>
  );
}
export function TicketDetail() {
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [page, setPage] = useState(1);
  const ticket = useQuery({
    queryKey: ["ticket", id],
    queryFn: async () => (await api.get(`/tickets/${id}`)).data.data as Ticket,
  });
  const messages = useQuery({
    queryKey: ["messages", id, page],
    queryFn: async () =>
      (
        await api.get<Page<Message>>(`/tickets/${id}/messages`, {
          params: { page, limit: 25 },
        })
      ).data,
    refetchInterval: 15000,
  });
  const manager = ["ADMIN", "SUPERVISOR"].includes(user?.role ?? "");
  const agents = useQuery({
    queryKey: ["agents", ticket.data?.department.id],
    queryFn: async () =>
      (
        await api.get("/agents", {
          params: { departmentId: ticket.data?.department.id },
        })
      ).data.data as User[],
    enabled: manager && !!ticket.data,
  });
  function invalidate() {
    for (const key of ["ticket", "tickets", "messages", "dashboard"])
      void queryClient.invalidateQueries({ queryKey: [key] });
  }
  const reply = useMutation({
    mutationFn: async () =>
      api.post(`/tickets/${id}/messages`, { body, isInternalNote: internal }),
    onSuccess: () => {
      setBody("");
      const total = messages.data?.pagination.total ?? 0;
      setPage(Math.ceil((total + 1) / 25));
      invalidate();
    },
  });
  const update = useMutation({
    mutationFn: async (input: unknown) => api.patch(`/tickets/${id}`, input),
    onSuccess: invalidate,
  });
  if (ticket.isPending) return <main className="page">Talep yükleniyor…</main>;
  if (ticket.isError)
    return (
      <main className="page">
        <Link to="/tickets">Taleplere dön</Link>
        <QueryError error={ticket.error} />
      </main>
    );
  const t = ticket.data;
  return (
    <main className="page">
      <Link className="back-link" to="/tickets">
        <ArrowLeft size={16} />
        Gelen kutusuna dön
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            #TK-{String(t.number).padStart(5, "0")} · {t.department.name}
          </span>
          <h1>{t.subject}</h1>
          <p>
            {t.customer.name} tarafından {date(t.createdAt)} tarihinde
            oluşturuldu.
          </p>
        </div>
        <Badge status={t.status} />
      </div>
      <div className="detail-grid">
        <section className="conversation">
          <div className="section-heading">
            <MessageSquare size={18} />
            Konuşma
            <span className="muted">
              {messages.data?.pagination.total ?? 0} mesaj
            </span>
          </div>
          <div className="message-list">
            {messages.isPending && <p>Mesajlar yükleniyor…</p>}
            {messages.isError && <QueryError error={messages.error} />}{" "}
            {messages.data?.data.map((message) => (
              <article
                key={message.id}
                className={`message ${message.isInternalNote ? "internal-note" : ""}`}
              >
                <span className="avatar">
                  {message.author.name.slice(0, 1)}
                </span>
                <div className="message-content">
                  <header>
                    <strong>{message.author.name}</strong>
                    <time>{date(message.createdAt)}</time>
                  </header>
                  {message.isInternalNote && (
                    <span className="note-label">
                      <LockKeyhole size={12} />
                      Dahili not · Müşteriye görünmez
                    </span>
                  )}
                  <p>{message.body}</p>
                </div>
              </article>
            ))}
          </div>
          {(messages.data?.pagination.totalPages ?? 0) > 1 && (
            <div className="pagination">
              <button disabled={page === 1} onClick={() => setPage(page - 1)}>
                Önceki
              </button>
              <span>Sayfa {page}</span>
              <button
                disabled={page >= (messages.data?.pagination.totalPages ?? 1)}
                onClick={() => setPage(page + 1)}
              >
                Sonraki
              </button>
            </div>
          )}
          <form
            className={`composer ${internal ? "internal-note" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              reply.mutate();
            }}
          >
            <div className="composer-tabs">
              <button
                type="button"
                className={!internal ? "active" : ""}
                onClick={() => setInternal(false)}
              >
                Yanıt yaz
              </button>
              {user?.role !== "CUSTOMER" && (
                <button
                  type="button"
                  className={internal ? "active" : ""}
                  onClick={() => setInternal(true)}
                >
                  <LockKeyhole size={13} />
                  Dahili not
                </button>
              )}
            </div>
            <textarea
              aria-label={internal ? "Dahili not" : "Yanıtınız"}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              placeholder={
                t.status === "CLOSED"
                  ? "Bu talep kapatıldı."
                  : internal
                    ? "Yalnızca ekibinizin görebileceği bir not…"
                    : "Yanıtınızı yazın…"
              }
              disabled={t.status === "CLOSED"}
              required
              maxLength={10000}
              rows={5}
            />
            {reply.isError && <QueryError error={reply.error} />}
            <div className="composer-footer">
              <span>
                {internal
                  ? "Sadece destek ekibi görür."
                  : "Konuşmadaki herkes görür."}
              </span>
              <button
                className="button primary"
                disabled={
                  reply.isPending || t.status === "CLOSED" || !body.trim()
                }
              >
                <Send size={15} />
                {reply.isPending ? "Gönderiliyor…" : "Gönder"}
              </button>
            </div>
          </form>
        </section>
        <aside className="ticket-properties">
          <h2>Talep bilgileri</h2>
          <label>
            Durum
            {user?.role === "CUSTOMER" ? (
              <Badge status={t.status} />
            ) : (
              <select
                value={t.status}
                disabled={update.isPending}
                onChange={(e) => update.mutate({ status: e.target.value })}
              >
                {Object.entries(statuses).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label>
            Öncelik
            {user?.role === "CUSTOMER" ? (
              <span>{priorities[t.priority]}</span>
            ) : (
              <select
                value={t.priority}
                disabled={update.isPending}
                onChange={(e) => update.mutate({ priority: e.target.value })}
              >
                {Object.entries(priorities).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v}
                  </option>
                ))}
              </select>
            )}
          </label>
          <label>
            Atanan personel
            {manager ? (
              <select
                value={t.assignedAgent?.id ?? ""}
                disabled={
                  update.isPending || agents.isPending || agents.isError
                }
                onChange={(e) =>
                  update.mutate({ assignedAgentId: e.target.value || null })
                }
              >
                <option value="">Atanmamış</option>
                {agents.data?.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            ) : (
              <span>{t.assignedAgent?.name ?? "Atanmamış"}</span>
            )}
          </label>
          {agents.isError && <QueryError error={agents.error} />}
          <label>
            Departman<span>{t.department.name}</span>
          </label>
          <hr />
          <label>
            Müşteri<span>{t.customer.name}</span>
            <small>{t.customer.email}</small>
          </label>
          {update.isError && <QueryError error={update.error} />}{" "}
          {user?.role !== "CUSTOMER" &&
            t.status !== "RESOLVED" &&
            t.status !== "CLOSED" && (
              <button
                className="button secondary"
                disabled={update.isPending}
                onClick={() => update.mutate({ status: "RESOLVED" })}
              >
                <CheckCheck size={17} />
                Çözüldü olarak işaretle
              </button>
            )}
        </aside>
      </div>
    </main>
  );
}
