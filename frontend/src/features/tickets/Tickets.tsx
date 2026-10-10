import { useEffect, useRef, useState, type FormEvent } from "react";
import { useWorkSession } from "../../components/WorkSession";
import { activityActionLabel, activityValueLabel } from "../management/activity-log-format";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  AtSign,
  CheckCheck,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Inbox,
  Plus,
  Search,
  Send,
  LockKeyhole,
  History,
  MessageSquare,
  Pencil,
  Trash2,
  X,
} from "lucide-react";
import { api, errorText } from "../../services/api";
import { DirectorySelect } from '../../components/DirectorySelect';
import { DeleteModal } from '../../components/DeleteModal';
import { DropdownSelect } from '../../components/DropdownSelect';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { AttachmentLinks,CompactFilePicker,ComposerFiles,FilePicker,SavedReplyPicker,TagEditor,TagPicker,FormDropdown } from './TicketExtras';
import './extras.css';
import { useAuth } from "../auth/Auth";
import { hasPermission } from '../auth/permissions';
import {
  channels,
  statuses,
  priorities,
  type Department,
  type Message,
  type Page,
  type Conversation,
  type User,
  type Tag,
} from "../../types";
import { conversationLogPath, conversationPath, inboxPath, roleHome, workspacePath } from "../../router/paths";
const date = (value: string) =>
  new Date(value).toLocaleString("tr-TR", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
const fullDate = (value: string) => new Date(value).toLocaleString("tr-TR", { timeZone: "Europe/Istanbul", year: "numeric", month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
const durationBetween = (from: string, to: string) => {
  const minutes = Math.max(0, Math.floor((new Date(to).getTime() - new Date(from).getTime()) / 60000));
  if (minutes < 1) return "1 dk'dan kısa";
  if (minutes < 60) return `${minutes} dk`;
  const hours = Math.floor(minutes / 60), remainder = minutes % 60;
  return hours < 24 ? `${hours} sa${remainder ? ` ${remainder} dk` : ""}` : `${Math.floor(hours / 24)} gün`;
};
const responseTime = (startAt: string | null | undefined, responseAt: string | null | undefined, rules?: { responseFastFromMinutes: number; responseFastToMinutes: number; responseNormalFromMinutes: number; responseNormalToMinutes: number; responseLateFromMinutes: number; responseLateToMinutes: number; responseFastColor: string; responseNormalColor: string; responseLateColor: string }) => {
  if (!startAt || !responseAt) return { label: "Yanıt bekliyor", state: "waiting", color: rules?.responseLateColor ?? "#c2413c" };
  const minutes = Math.max(0, Math.floor((new Date(responseAt).getTime() - new Date(startAt).getTime()) / 60000));
  const label = minutes < 1 ? "1 dk'dan kısa" : minutes < 60 ? `${minutes} dk` : (() => { const hours = Math.floor(minutes / 60); return hours < 24 ? `${hours} sa` : `${Math.floor(hours / 24)} gün`; })();
  const fast = !rules || (minutes >= rules.responseFastFromMinutes && minutes <= rules.responseFastToMinutes);
  const normal = rules && minutes >= rules.responseNormalFromMinutes && minutes <= rules.responseNormalToMinutes;
  return fast ? { label, state: "fast", color: rules?.responseFastColor ?? "#16715d" } : normal ? { label, state: "normal", color: rules.responseNormalColor } : { label, state: "late", color: rules?.responseLateColor ?? "#c2413c" };
};
export function Badge({ status }: { status: Conversation["status"] }) {
  return (
    <span className={`badge status-${status}`}>
      <span />
      {statuses[status] ?? status}
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
type MentionCandidate = { id: string; name: string; role: "AGENT" | "SUPERVISOR" };
type SelectedMention = Pick<MentionCandidate, "id" | "name">;
type MentionTrigger = { start: number; end: number; search: string };
const mentionTriggerAt = (value: string, caret: number): MentionTrigger | null => {
  const beforeCaret = value.slice(0, caret);
  const match = beforeCaret.match(/(?:^|[\s(])@([^\s@\n]{0,50})$/);
  if (!match) return null;
  return { start: caret - match[1].length - 1, end: caret, search: match[1] };
};
function MentionTextarea({ conversationId, value, onChange, selected, onSelectedChange, disabled, placeholder, onSubmit }: { conversationId: string; value: string; onChange: (value: string) => void; selected: SelectedMention[]; onSelectedChange: (value: SelectedMention[]) => void; disabled: boolean; placeholder: string; onSubmit: () => void }) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [trigger, setTrigger] = useState<MentionTrigger | null>(null);
  const [search, setSearch] = useState("");
  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    const timer = window.setTimeout(() => setSearch(trigger?.search.trim() ?? ""), 140);
    return () => window.clearTimeout(timer);
  }, [trigger?.search]);
  const candidates = useQuery({
    queryKey: ["mention-candidates", conversationId, search],
    queryFn: async () => (await api.get<{ data: MentionCandidate[] }>(`/conversations/${conversationId}/mention-candidates`, { params: { search, limit: search ? 8 : 6 } })).data.data,
    enabled: Boolean(trigger) && !disabled,
    staleTime: 30_000,
  });
  const options = (candidates.data ?? []).filter((candidate) => !selected.some((item) => item.id === candidate.id));
  useEffect(() => setActiveIndex(0), [search]);
  const updateTrigger = (text: string, caret: number) => {
    const nextTrigger = mentionTriggerAt(text, caret);
    if (!nextTrigger) { setTrigger(null); return; }
    const completedMention = selected.some((mention) => {
      const token = `@${mention.name}`;
      return text.startsWith(token, nextTrigger.start) && caret > nextTrigger.start + token.length;
    });
    setTrigger(completedMention ? null : nextTrigger);
  };
  const choose = (candidate: MentionCandidate) => {
    if (!trigger) return;
    const next = `${value.slice(0, trigger.start)}@${candidate.name} ${value.slice(trigger.end)}`;
    const caret = trigger.start + candidate.name.length + 2;
    onChange(next);
    onSelectedChange([...selected, { id: candidate.id, name: candidate.name }]);
    setTrigger(null);
    requestAnimationFrame(() => { textareaRef.current?.focus(); textareaRef.current?.setSelectionRange(caret, caret); });
  };
  return <div className="mention-composer">
    <textarea
      ref={textareaRef}
      className="internal-note-input"
      aria-label="Dahili not"
      aria-autocomplete="list"
      aria-controls={trigger ? "mention-suggestions" : undefined}
      aria-expanded={Boolean(trigger)}
      value={value}
      onChange={(event) => {
        const next = event.target.value;
        onChange(next);
        onSelectedChange(selected.filter((mention) => next.includes(`@${mention.name}`)));
        updateTrigger(next, event.target.selectionStart);
      }}
      onClick={(event) => updateTrigger(event.currentTarget.value, event.currentTarget.selectionStart)}
      onKeyUp={(event) => { if (!["ArrowDown", "ArrowUp", "Enter", "Tab", "Escape"].includes(event.key)) updateTrigger(event.currentTarget.value, event.currentTarget.selectionStart); }}
      onKeyDown={(event) => {
        if (trigger) {
          if (event.key === "Escape") { event.preventDefault(); setTrigger(null); return; }
          if (event.key === "ArrowDown" || event.key === "ArrowUp") { event.preventDefault(); setActiveIndex((index) => options.length ? (index + (event.key === "ArrowDown" ? 1 : -1) + options.length) % options.length : 0); return; }
          if ((event.key === "Enter" || event.key === "Tab") && options[activeIndex]) { event.preventDefault(); choose(options[activeIndex]); return; }
        }
        if (event.key === "Enter" && !event.shiftKey && !event.ctrlKey && !event.altKey && !event.metaKey && !event.nativeEvent.isComposing && event.keyCode !== 229) { event.preventDefault(); if (!event.repeat) onSubmit(); }
      }}
      title="@ ile personel etiketleyin · Enter ile gönderin · Shift+Enter ile yeni satır"
      placeholder={placeholder}
      disabled={disabled}
      required
      maxLength={10000}
      rows={3}
    />
    {trigger && <div className="mention-suggestions" id="mention-suggestions" role="listbox" aria-label="Etiketlenebilecek personeller">
      <div className="mention-suggestions-heading"><AtSign size={14}/><span>{search ? `“${search}” için sonuçlar` : "Departmandaki kişiler"}</span><small>En fazla {search ? 8 : 6} kişi</small></div>
      {candidates.isPending && <p className="mention-state">Kişiler yükleniyor…</p>}
      {!candidates.isPending && options.map((candidate, index) => <button key={candidate.id} type="button" role="option" aria-selected={index === activeIndex} className={index === activeIndex ? "active" : ""} onMouseDown={(event) => event.preventDefault()} onMouseEnter={() => setActiveIndex(index)} onClick={() => choose(candidate)}>
        <span className="mention-avatar">{candidate.name.slice(0, 1).toLocaleUpperCase("tr-TR")}</span>
        <span><strong>{candidate.name}</strong><small>{candidate.role === "SUPERVISOR" ? "Departman sorumlusu" : "Destek uzmanı"}</small></span>
      </button>)}
      {!candidates.isPending && !options.length && <p className="mention-state">Uygun personel bulunamadı.</p>}
    </div>}
  </div>;
}
export function TicketList() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") ?? "");
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const [deletePeriod, setDeletePeriod] = useState<"day" | "week" | "month" | "all" | null>(null);
  const page = Number(params.get("page") ?? 1);
  const requestedLimit = Number(params.get("limit") ?? 15);
  const limit = [10, 15, 20, 50].includes(requestedLimit) ? requestedLimit : 15;
  const status = params.get("status") ?? "";
  const view = params.get("view") ?? "all";
  const defaultTabLabels: Record<string, string> = { all: "Tümü", ticket: "Telefon talebi", mail: "Mail", sms: "SMS", whatsapp: "WhatsApp", mine: "Bana atanan", unassigned: "Atanmamış" };
  const filterDescriptions: Record<string, string> = { all: "Tüm talepler", ticket: "Telefon desteği ekranından açılan talepler", mail: "E-posta ile gelen talepler", sms: "SMS ile gelen talepler", whatsapp: "WhatsApp üzerinden gelen talepler", mine: "Size atanmış talepler", unassigned: "Atanmamış talepler", today: "Bugün açılan talepler" };
  const [tabLabels, setTabLabels] = useState(defaultTabLabels);
  const [tabOrder, setTabOrder] = useState(Object.keys(defaultTabLabels));
  const [tabEnabled, setTabEnabled] = useState<Record<string, boolean>>(Object.fromEntries(Object.keys(defaultTabLabels).map((key) => [key, true])));
  type CustomTab = { id: string; label: string; tagId: string; enabled?: boolean };
  const [customTabs, setCustomTabs] = useState<CustomTab[]>([]);
  const [tabsModalOpen, setTabsModalOpen] = useState(false);
  const tagsQuery = useQuery({ queryKey: ["tags", "view-picker"], queryFn: async () => (await api.get<Page<Tag>>("/tags", { params: { limit: 100 } })).data });
  useEffect(() => {
    try {
      const saved = JSON.parse(window.localStorage.getItem(`helpdesk-inbox-tabs-${user?.id}`) ?? "null");
      if (saved?.labels) setTabLabels({ ...defaultTabLabels, ...saved.labels });
      if (saved?.enabled) setTabEnabled({ ...Object.fromEntries(Object.keys(defaultTabLabels).map((key) => [key, true])), ...saved.enabled });
      const savedCustom: CustomTab[] = Array.isArray(saved?.custom) ? saved.custom : [];
      if (savedCustom.length) setCustomTabs(savedCustom);
      const savedOrder = Array.isArray(saved?.order)
        ? saved.order.filter((key: unknown): key is string => typeof key === "string" && Boolean(defaultTabLabels[key]) || typeof key === "string" && savedCustom.some((tab) => tab.id === key))
        : Object.keys(defaultTabLabels);
      setTabOrder([...savedOrder, ...Object.keys(defaultTabLabels).filter((key) => !savedOrder.includes(key)), ...savedCustom.map((tab) => tab.id).filter((id) => !savedOrder.includes(id))]);
    } catch { /* defaults */ }
  }, [user?.id]);
  useEffect(() => {
    const tags = tagsQuery.data?.data ?? [];
    if (!tags.length) return;
    const automaticTabs = tags.map((tag) => ({ id: `tag-${tag.id}`, label: tag.name, tagId: tag.id }));
    setCustomTabs(automaticTabs);
    setTabOrder((current) => {
      const valid = new Set([...Object.keys(defaultTabLabels), ...automaticTabs.map((tab) => tab.id)]);
      return [...current.filter((key) => valid.has(key)), ...automaticTabs.map((tab) => tab.id).filter((key) => !current.includes(key))];
    });
  }, [tagsQuery.dataUpdatedAt]);
  function saveTabs(labels: Record<string, string>, custom: CustomTab[], order = tabOrder) {
    setTabLabels(labels); setCustomTabs(custom);
    window.localStorage.setItem(`helpdesk-inbox-tabs-${user?.id}`, JSON.stringify({ labels, custom, order, enabled: tabEnabled }));
  }
  function moveTab(key: string, direction: -1 | 1) {
    setTabOrder((current) => { const index = current.indexOf(key); const target = index + direction; if (index < 0 || target < 0 || target >= current.length) return current; const next = [...current]; [next[index], next[target]] = [next[target], next[index]]; window.localStorage.setItem(`helpdesk-inbox-tabs-${user?.id}`, JSON.stringify({ labels: tabLabels, custom: customTabs, order: next, enabled: tabEnabled })); return next; });
  }
  const query = useQuery({
    queryKey: ["conversations", params.toString()],
    queryFn: async () =>
      (
        await api.get<Page<Conversation>>("/conversations", {
          params: { ...Object.fromEntries(params), limit },
        })
      ).data,
    placeholderData: keepPreviousData,
    staleTime: 15_000,
    refetchInterval: 15_000,
    refetchOnWindowFocus: false,
  });
  const remove = useMutation({
    mutationFn: (period: "day" | "week" | "month" | "all") =>
      api.delete("/conversations", { params: { period } }),
    onSuccess: async () => {
      setParams((current) => {
        current.delete("page");
        return current;
      });
      await queryClient.invalidateQueries({ queryKey: ["conversations"] });
      await queryClient.invalidateQueries({ queryKey: ["dashboard"] });
    },
  });
  const deleteLabels = {
    day: "Son 24 saatteki talepleri sil",
    week: "Son 7 gündeki talepleri sil",
    month: "Son 30 gündeki talepleri sil",
    all: "Tüm talepleri sil",
  } as const;
  function filter(key: string, value: string) {
    setParams((p) => {
      value ? p.set(key, value) : p.delete(key);
      if (key === "view") p.delete("tagId");
      p.delete("page");
      return p;
    });
  }
  function selectView(key: string) {
    const custom = customTabs.find((tab) => tab.id === key);
    if (!custom) {
      const code = key === "mail" ? "EMAIL" : key === "sms" ? "SMS" : key === "whatsapp" ? "WHATSAPP" : key === "ticket" ? "TICKET" : key === "all" ? "ALL" : key === "mine" ? "MINE" : "UNASSIGNED";
      setParams((p) => { p.set("view", ["mail", "sms", "whatsapp", "ticket"].includes(key) ? "all" : key); p.set("category", code); p.delete("channel"); p.delete("tagId"); p.delete("page"); return p; });
      return;
    }
    const tag = tagsQuery.data?.data.find((item) => item.id === custom.tagId);
    setParams((p) => {
      p.set("view", "all");
      tag?.code ? p.set("category", tag.code) : p.delete("category");
      p.delete("channel");
      p.delete("status");
      p.delete("priority");
      p.delete("customerId");
      p.delete("tagId");
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
            {user?.role === "CUSTOMER" ? "Taleplerim" : params.get("customerId") && query.data?.data[0]?.customer?.name ? `${query.data.data[0].customer.name} adlı kişinin Gelen kutusu` : "Gelen kutusu"}
            <span className="count">{query.data?.pagination.total ?? "—"}</span>
          </h1>
          <p>
            {user?.role === "CUSTOMER"
              ? "Taleplerinizin son durumunu takip edin, ekibimizle iletişimde kalın."
              : "Yeni talepleri, bekleyen yanıtları ve çözüm sürecini tek ekranda yönetin."}
          </p>
        </div>
        {user?.role === "CUSTOMER" && (
          <Link className="button primary" to={workspacePath(user!.role, "tickets/new")}>
            <Plus size={17} />
            Yeni talep
          </Link>
        )}
      </div>
      <section className="ticket-panel">
        <div className="tabs">
          {(user?.role === "CUSTOMER"
            ? [["all", "Tüm talepler"]]
            : tabOrder.filter((key) => {
              const custom = customTabs.find((tab) => tab.id === key);
              return Boolean(defaultTabLabels[key]) || (tabEnabled[key] !== false && Boolean(custom));
            }).map((key) => defaultTabLabels[key] ? [key, tabLabels[key]] as [string, string] : [key, customTabs.find((tab) => tab.id === key)?.label ?? key] as [string, string])
          ).map(([value, label]) => (
            <button
              key={value}
              className={(customTabs.some((tab) => tab.id === value) ? params.get("category") === tagsQuery.data?.data.find((tag) => tag.id === customTabs.find((tab) => tab.id === value)?.tagId)?.code : ["mail", "sms", "whatsapp", "ticket"].includes(value) ? params.get("category") === ({ mail: "EMAIL", sms: "SMS", whatsapp: "WHATSAPP", ticket: "TICKET" } as Record<string, string>)[value] : view === value && !params.get("tagId") && (value === "all" ? !params.get("category") || params.get("category") === "ALL" : params.get("category") === value.toUpperCase())) ? "active" : ""}
              onClick={() => selectView(value)}
            >
              {label}
            </button>
          ))}
          {user?.role !== "CUSTOMER" && (
            <button type="button" className="tabs-edit-button" aria-label="Gelen kutusu görünümlerini düzenle" onClick={() => setTabsModalOpen(true)}>
              <Pencil size={15} />
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
              placeholder="Talep no, konu, müşteri veya personel ara…"
              value={search}
              onChange={(e) => { setSearch(e.target.value); filter("search", e.target.value); }}
            />
          </form>
          <div className="notification-limit inbox-limit">
            <span>Kayıt sayısı</span>
            <DropdownSelect
              value={String(limit)}
              ariaLabel="Kayıt sayısı"
              onChange={(value) => {
                setParams((current) => {
                  current.set("limit", value);
                  current.delete("page");
                  return current;
                });
              }}
              options={[10, 15, 20, 50].map((value) => ({ value: String(value), label: String(value) }))}
            />
          </div>
          {hasPermission(user, 'conversations.delete') && (
            <div className={`notification-delete inbox-delete${deleteMenuOpen ? " open" : ""}`}>
              <button type="button" className="notification-delete-trigger" aria-label="Talepleri sil" aria-haspopup="menu" aria-expanded={deleteMenuOpen} onClick={() => setDeleteMenuOpen((open) => !open)}>
                <Trash2 size={16} aria-hidden="true" />
                <ChevronDown size={15} aria-hidden="true" />
              </button>
              {deleteMenuOpen && (
                <div className="notification-delete-menu" role="menu">
                  {Object.entries(deleteLabels).map(([period, label]) => (
                    <button key={period} type="button" role="menuitem" onClick={() => { setDeletePeriod(period as keyof typeof deleteLabels); setDeleteMenuOpen(false); }}>
                      {label}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
          <DropdownSelect ariaLabel="Duruma göre filtrele" value={status} onChange={(value) => filter("status", value)} options={[{ value: "", label: "Tüm durumlar" }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} />
          <DropdownSelect ariaLabel="Önceliğe göre filtrele" value={params.get("priority") ?? ""} onChange={(value) => filter("priority", value)} options={[{ value: "", label: "Tüm öncelikler" }, ...Object.entries(priorities).map(([value, label]) => ({ value, label }))]} />
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
                  <th>KANAL</th>
                  <th>DURUM</th>
                  <th>ÖNCELİK</th>
                  <th>DEPARTMAN</th>
                  <th>ATANAN</th>
                  <th>AÇILIŞ</th>
                  <th>YANIT SÜRESİ</th>
                  <th>SON GÜNCELLEME</th>
                </tr>
              </thead>
              <tbody>
                {query.data.data.map((ticket) => (
                  <tr key={ticket.id} className="inbox-ticket-row">
                    <td className="inbox-clickable-cell" role="link" tabIndex={0} aria-label={`#TK-${String(ticket.number).padStart(5, "0")} ${ticket.subject}`} onClick={() => navigate(conversationPath(user!.role, ticket.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(conversationPath(user!.role, ticket.id)); } }}>
                      <Link
                        className="ticket-title"
                        to={conversationPath(user!.role, ticket.id)}
                      >
                        <small>
                          #TK-{String(ticket.number).padStart(5, "0")}
                        </small>
                        {ticket.subject}
                      </Link>
                      <span className="customer-name">
                        {ticket.customer.name} <small>({ticket.customerMessageCount ?? 0})</small>
                      </span>
                    </td>
                    <td className="inbox-clickable-cell" role="link" tabIndex={0} aria-label={`Kanal: ${channels[ticket.channel]}`} onClick={() => navigate(conversationPath(user!.role, ticket.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(conversationPath(user!.role, ticket.id)); } }}>
                      <span className="management-pill">{channels[ticket.channel]}</span>
                    </td>
                    <td className="inbox-clickable-cell" role="link" tabIndex={0} aria-label={`Durum: ${statuses[ticket.status]}`} onClick={() => navigate(conversationPath(user!.role, ticket.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(conversationPath(user!.role, ticket.id)); } }}><Badge status={ticket.status} />
                    </td>
                    <td className="inbox-clickable-cell" role="link" tabIndex={0} aria-label={`Öncelik: ${priorities[ticket.priority]}`} onClick={() => navigate(conversationPath(user!.role, ticket.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(conversationPath(user!.role, ticket.id)); } }}>
                      <span className={`priority priority-${ticket.priority}`}>
                        ●
                      </span>{" "}
                      {priorities[ticket.priority]}
                    </td>
                    <td className="inbox-clickable-cell" role="link" tabIndex={0} aria-label={`Departman: ${ticket.department.name}`} onClick={() => navigate(conversationPath(user!.role, ticket.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(conversationPath(user!.role, ticket.id)); } }}>{ticket.department.name}</td>
                    <td className="inbox-clickable-cell" role="link" tabIndex={0} aria-label={`Atanan: ${ticket.assignedAgent?.name ?? "Atanmamış"}`} onClick={() => navigate(conversationPath(user!.role, ticket.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(conversationPath(user!.role, ticket.id)); } }}>
                      {ticket.assignedAgent ? <>{ticket.assignedAgent.name} <small>({ticket.assignedAgentMessageCount ?? 0})</small></> : (
                        <span className="muted">Atanmamış</span>
                      )}
                    </td>
                    <td className="muted inbox-clickable-cell" role="link" tabIndex={0} aria-label={`Açılış: ${date(ticket.createdAt)}`} onClick={() => navigate(conversationPath(user!.role, ticket.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(conversationPath(user!.role, ticket.id)); } }}>{date(ticket.createdAt)}</td>
                    <td className={`ticket-response response-${responseTime(ticket.responseTimeStartAt, ticket.responseTimeAt, query.data.responseTimeRules).state} inbox-clickable-cell`} role="link" tabIndex={0} aria-label={`Yanıt süresi: ${responseTime(ticket.responseTimeStartAt, ticket.responseTimeAt, query.data.responseTimeRules).label}`} style={{ color: responseTime(ticket.responseTimeStartAt, ticket.responseTimeAt, query.data.responseTimeRules).color }} onClick={() => navigate(conversationPath(user!.role, ticket.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(conversationPath(user!.role, ticket.id)); } }}>{responseTime(ticket.responseTimeStartAt, ticket.responseTimeAt, query.data.responseTimeRules).label}</td>
                    <td className="muted inbox-clickable-cell" role="link" tabIndex={0} aria-label={`Son güncelleme: ${date(ticket.updatedAt)}`} onClick={() => navigate(conversationPath(user!.role, ticket.id))} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); navigate(conversationPath(user!.role, ticket.id)); } }}>{date(ticket.updatedAt)}</td>
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
      {tabsModalOpen && (
        <div className="confirm-backdrop" role="presentation">
          <section className="confirm-modal tabs-modal" role="dialog" aria-modal="true" aria-labelledby="tabs-modal-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="confirm-close" type="button" aria-label="Kapat" onClick={() => setTabsModalOpen(false)}><X size={18} /></button>
            <h2 id="tabs-modal-title">Görünümleri düzenle</h2>
            <p>Gelen kutusu sekmelerinin sırasını düzenleyin.</p>
            <div className="tabs-modal-list">
              {tabOrder.map((key) => {
                if (defaultTabLabels[key]) {
                  return (
                    <div className="tabs-modal-row" key={key}>
                      <strong>{tabLabels[key]}</strong>
                      <small>{filterDescriptions[key]}</small>
                      <button type="button" disabled={tabOrder.indexOf(key) === 0} onClick={() => moveTab(key, -1)} aria-label="Yukari tasi">&#8593;</button>
                      <button type="button" disabled={tabOrder.indexOf(key) === tabOrder.length - 1} onClick={() => moveTab(key, 1)} aria-label="Asagi tasi">&#8595;</button>
                    </div>
                  );
                }
                const tab = customTabs.find((item) => item.id === key);
                if (!tab) return null;
                return (
                  <div className="tabs-modal-row tabs-modal-custom-row" key={tab.id}>
                    <strong>{tab.label}</strong>
                    <small>{tagsQuery.data?.data.find((tag) => tag.id === tab.tagId)?.name ?? "Etiket"}</small>
                    <button type="button" disabled={tabOrder.indexOf(tab.id) === 0} onClick={() => moveTab(tab.id, -1)} aria-label="Yukari tasi">&#8593;</button>
                    <button type="button" disabled={tabOrder.indexOf(tab.id) === tabOrder.length - 1} onClick={() => moveTab(tab.id, 1)} aria-label="Asagi tasi">&#8595;</button>
                  </div>
                );
              })}
            </div>
          </section>
        </div>
      )}
      {deletePeriod && (
        <div className="confirm-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-label="Talep silme onayı" onMouseDown={(event) => event.stopPropagation()}>
            <button className="confirm-close" type="button" onClick={() => setDeletePeriod(null)} aria-label="Kapat">×</button>
            <h2>{deleteLabels[deletePeriod]}</h2>
            <p>Bu talepleri silmek istediğinize emin misiniz?</p>
            {remove.isError && <QueryError error={remove.error} />}
            <div className="confirm-actions">
              <button className="button secondary" type="button" onClick={() => setDeletePeriod(null)}>Vazgeç</button>
              <button className="button danger" type="button" disabled={remove.isPending} onClick={() => remove.mutate(deletePeriod, { onSuccess: () => setDeletePeriod(null) })}>
                {remove.isPending ? "Siliniyor…" : "Sil"}
              </button>
            </div>
          </section>
        </div>
      )}
    </main>
  );
}
export function NewTicket() {
  const [files,setFiles]=useState<File[]>([]),[departmentId,setDepartmentId]=useState('');
  const [tagIds,setTagIds]=useState<string[]>([]);
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
      (await api.post("/conversations", body)).data.data as Conversation,
    onSuccess: (ticket) => {
      void queryClient.invalidateQueries({ queryKey: ["conversations"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      navigate(conversationPath(user!.role, ticket.id));
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
    form.set('departmentId',departmentId);
    tagIds.forEach((id) => form.append('tagIds', id));
    for(const file of files)form.append('files',file);
    mutation.mutate(form);
  }
  return (
    <main className="page">
      <Link className="back-link" to={inboxPath(user!.role)}>
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
          <span className="field-label">Konu</span>
          <input
            name="subject"
            required
            minLength={5}
            maxLength={200}
            placeholder="Talebinizi kısaca özetleyin"
          />
        </label>
        <TagPicker value={tagIds} onChange={setTagIds} />
        <div className="form-row">
          <DirectorySelect label="Departman" endpoint="/departments" value={departmentId} onChange={setDepartmentId}/>
          <FormDropdown name="priority" label="Öncelik" defaultValue="NORMAL" options={Object.entries(priorities).map(([value, label]) => ({ value, label }))} />
        </div>
        <label>
          <span className="field-label">Açıklama</span>
          <textarea
            name="message"
            required
            maxLength={10000}
            rows={8}
            placeholder="Neler olduğunu ve size nasıl yardımcı olabileceğimizi paylaşın…"
          />
        </label>
        {departments.isError && <QueryError error={departments.error} />}{" "}
        <FilePicker files={files} setFiles={setFiles} disabled={mutation.isPending}/>
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
  const { startNewRequest, forgetConversation } = useWorkSession();
  const navigate=useNavigate();
  const [files,setFiles]=useState<File[]>([]),[fileKey,setFileKey]=useState(0),[deleteConfirm,setDeleteConfirm]=useState(false);
  const { id } = useParams();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);
  const [selectedMentions, setSelectedMentions] = useState<SelectedMention[]>([]);
  const [page, setPage] = useState(1);
  const messageListRef = useRef<HTMLDivElement>(null);
  const sending = useRef(false);
  const stickToBottom = useRef(true);
  const ticket = useQuery({
    queryKey: ["conversation", id],
    queryFn: async () => (await api.get(`/conversations/${id}`)).data.data as Conversation,
    refetchInterval: 15_000,
  });
  const messages = useQuery({
    queryKey: ["messages", id, page],
    queryFn: async () =>
      (
        await api.get<Page<Message>>(`/conversations/${id}/messages`, {
          params: { page, limit: 25 },
        })
      ).data,
    refetchInterval: 15_000,
  });
  const statusOptionsQuery = useQuery({
    queryKey: ["status-options"],
    queryFn: async () => (await api.get<Page<{ id: string; code: string; name: string; color: string }>>("/status-options", { params: { limit: 100 } })).data.data,
    enabled: !!user,
  });
  const priorityOptionsQuery = useQuery({
    queryKey: ["priority-options"],
    queryFn: async () => (await api.get<Page<{ id: string; code: string; name: string; color: string }>>("/priority-options", { params: { limit: 100 } })).data.data,
    enabled: !!user,
  });
  const statusOptions = statusOptionsQuery.data?.map((option) => ({ value: option.code, label: option.name })) ?? Object.entries(statuses).map(([value, label]) => ({ value, label }));
  const priorityOptions = priorityOptionsQuery.data?.map((option) => ({ value: option.code, label: option.name })) ?? Object.entries(priorities).map(([value, label]) => ({ value, label }));
  const manager = ["ADMIN", "SUPERVISOR"].includes(user?.role ?? "");
  const canEditProject = hasPermission(user, 'conversations.update');
  const canAssignStaff = hasPermission(user, 'conversations.assign');
  const canTransferDepartments = hasPermission(user, 'conversations.transfer');
  const agents = useQuery({
    queryKey: ["agents", ticket.data?.department.id],
    queryFn: async () =>
      (
        await api.get(`/departments/${ticket.data?.department.id}/agents`, {
          params: { limit: 100 },
        })
      ).data.data as Array<User & { presence?: "ONLINE" | "IDLE" | "OFFLINE"; openConversationCount: number }>,
    enabled: canAssignStaff && !!ticket.data,
    refetchInterval: 30_000,
  });
  const presence = useQuery({ queryKey: ["/staff-presence"], enabled: canAssignStaff && !!ticket.data, queryFn: async () => (await api.get<{ data: { staff: Array<{ id: string; state: "ONLINE" | "IDLE" | "OFFLINE" }> } }>("/staff-presence")).data.data });
  const presenceById = new Map((presence.data?.staff ?? []).map((person) => [person.id, person.state]));
  const websites = useQuery({
    queryKey: ["websites", "conversation-picker"],
    queryFn: async () => (await api.get<Page<{ id: string; name: string; url: string; isActive: boolean }>>("/websites", { params: { limit: 100 } })).data.data,
    enabled: canEditProject,
  });
  function invalidate() {
    for (const key of ["conversation", "conversations", "messages", "dashboard"])
      void queryClient.invalidateQueries({ queryKey: [key] });
  }
  const reply = useMutation({
    mutationFn: async () => {
      const form=new FormData();form.set('body',body);form.set('type',internal ? 'INTERNAL_NOTE' : user?.role === 'CUSTOMER' ? 'CUSTOMER_MESSAGE' : 'AGENT_REPLY');if(internal&&selectedMentions.length)form.set('mentionUserIds',JSON.stringify(selectedMentions.map(mention=>mention.id)));for(const file of files)form.append('files',file);
      return api.post(`/conversations/${id}/messages`,form);
    },
    onSuccess: () => {
      setBody("");
      setSelectedMentions([]);
      setFiles([]);setFileKey(key=>key+1);
      stickToBottom.current = true;
      const total = messages.data?.pagination.total ?? 0;
      setPage(Math.ceil((total + 1) / 25));
      invalidate();
    },
    onSettled: () => { sending.current = false; },
  });
  const update = useMutation({
    mutationFn: async (input: unknown) => api.patch(`/conversations/${id}`, input),
    onSuccess: invalidate,
  });
  const claim = useMutation({ mutationFn: () => api.post(`/conversations/${id}/assign-to-me`), onSuccess: invalidate });
  const remove=useMutation({mutationFn:()=>api.delete(`/conversations/${id}`),onSuccess:()=>{invalidate();forgetConversation(conversationPath(user!.role, id!));navigate(inboxPath(user!.role));}});
  useEffect(() => {
    const list = messageListRef.current;
    if (!list || !stickToBottom.current) return;
    list.scrollTop = list.scrollHeight;
  }, [messages.data?.data, page]);
  if (ticket.isPending) return <main className="page">Talep yükleniyor…</main>;
  if (ticket.isError)
    return (
      <main className="page">
        <Link to={inboxPath(user!.role)}>Taleplere dön</Link>
        <QueryError error={ticket.error} />
      </main>
    );
  const t = ticket.data;
  const agentById = new Map((agents.data ?? []).map((agent) => [agent.id, agent]));
  const assigneeOptions = [
    { value: '', label: 'Atanmamış' },
    ...(t.assignedAgent ? [{ value: t.assignedAgent.id, label: t.assignedAgent.name, presence: presenceById.get(t.assignedAgent.id), openConversationCount: agentById.get(t.assignedAgent.id)?.openConversationCount }] : []),
    ...(agents.data ?? []).filter(agent => agent.id !== t.assignedAgent?.id).map(agent => ({ value: agent.id, label: agent.name, presence: presenceById.get(agent.id), openConversationCount: agent.openConversationCount })),
  ];
  const websiteOptions = [
    { value: "", label: "Proje seçilmedi" },
    ...(t.website && !websites.data?.some((site) => site.id === t.website?.id) ? [{ value: t.website.id, label: t.website.name }] : []),
    ...(websites.data ?? []).filter((site) => site.isActive).map((site) => ({ value: site.id, label: site.name })),
  ];
  const agentNeedsClaim = user?.role === 'AGENT' && !t.assignedAgentId;
  const canPublicReply = hasPermission(user, 'conversations.reply') && t.status !== 'CLOSED' && (user?.role !== 'AGENT' || t.assignedAgentId === user.id);
  const canInternalNote = hasPermission(user, 'conversations.note') && t.status !== 'CLOSED' && user?.role !== 'CUSTOMER' && (user?.role !== 'AGENT' || Boolean(t.canAddInternalNote));
  const canWrite = internal ? canInternalNote : canPublicReply;
  const canSubmitReply = Boolean(body.trim() || files.length);
  return (
    <main className="page conversation-page">
      <div className="conversation-navigation">
      <Link className="back-link" to={inboxPath(user!.role)}>
        <ArrowLeft size={16} />
        Gelen kutusuna dön
      </Link>
      {user?.role !== "CUSTOMER" && <Link className="back-link" to={workspacePath(user!.role, "phone-support")} onClick={startNewRequest}><Plus size={16} />Yeni talep</Link>}
      </div>
      <div className="page-heading">
        <div>
          <span className="eyebrow">
            #TK-{String(t.number).padStart(5, "0")} · {t.department.name}
          </span>
          <h1>{t.subject}</h1>
        </div>
        <div className="ticket-status-cluster">
          <span className="management-pill created-pill">{(t.createdBy ?? t.customer).name} tarafından {date(t.createdAt)} tarihinde oluşturuldu.</span>
          <Badge status={t.status} />
        </div>
      </div>
      <section className="ticket-customer-summary">
        <span className="ticket-number">#TK-{String(t.number).padStart(5, "0")}</span>
        <strong>{t.customer.name}</strong>
        {t.customer.phone && <span>{t.customer.phone}</span>}
        {t.customer.email && <span>{t.customer.email}</span>}
        {t.customer.company && <span>{t.customer.company}</span>}
        {t.customer.extraPhones && <span>Ek tel: {t.customer.extraPhones}</span>}
        {t.customer.extraEmails && <span>Ek e-posta: {t.customer.extraEmails}</span>}
      </section>
      <div className="detail-grid">
        <section className="conversation">
          <div className="section-heading">
            <MessageSquare size={18} />
            Konuşma
            <Link className="conversation-log-link" to={conversationLogPath(user!.role, t.id)} title="Konuşma logları" aria-label="Konuşma loglarını aç">
              <History size={15} />
              <span className="muted">{messages.data?.pagination.total ?? 0} mesaj</span>
            </Link>
          </div>
          <div
            className="message-list"
            ref={messageListRef}
            onScroll={() => {
              const list = messageListRef.current;
              if (!list) return;
              stickToBottom.current = list.scrollHeight - list.scrollTop - list.clientHeight < 96;
            }}
          >
            {messages.isPending && <p>Mesajlar yükleniyor…</p>}
            {messages.isError && <QueryError error={messages.error} />}{" "}
            {messages.data?.data.filter((message) => message.type !== "SYSTEM").map((message, index, visibleMessages) => {
              const priorCustomerMessage = message.type === "AGENT_REPLY" ? visibleMessages.slice(0, index).reverse().find((item) => item.type === "CUSTOMER_MESSAGE") : undefined;
              return (
              <article
                key={message.id}
                className={`message ${message.type === "INTERNAL_NOTE" ? "internal-note" : ""} ${message.author?.id === user?.id ? "outgoing" : "incoming"}`}
              >
                <span className="avatar">
                  {(message.author?.name ?? "Sistem").slice(0, 1)}
                </span>
                <div className="message-content">
                  <header>
                    <span><strong>{message.author?.name ?? "Sistem"}</strong>{priorCustomerMessage && <small className="message-response-time">(Cevaplanma süresi: {durationBetween(priorCustomerMessage.createdAt, message.createdAt)})</small>}</span>
                    <time title={fullDate(message.createdAt)}>{fullDate(message.createdAt)}</time>
                  </header>
                  {message.type === "INTERNAL_NOTE" && (
                    <span className="note-label">
                      <LockKeyhole size={12} />
                      Dahili not · Müşteriye görünmez
                    </span>
                  )}
                  <p>{message.body}</p>
                  {message.type === "INTERNAL_NOTE" && message.mentions?.length ? <div className="message-mentions" aria-label="Etiketlenen personeller">{message.mentions.map(({user: mention}) => <span key={mention.id}><AtSign size={11}/>{mention.name}</span>)}</div> : null}
                  <AttachmentLinks attachments={message.attachments}/>
                </div>
              </article>
              );
            })}
          </div>
          {(messages.data?.pagination.totalPages ?? 0) > 1 && (
            <div className="pagination">
              <button aria-label="Önceki sayfa" title="Önceki sayfa" disabled={page === 1} onClick={() => setPage(page - 1)}><ChevronLeft size={14} /></button>
              <span>Sayfa {page}</span>
              <button
                aria-label="Sonraki sayfa"
                title="Sonraki sayfa"
                disabled={page >= (messages.data?.pagination.totalPages ?? 1)}
                onClick={() => setPage(page + 1)}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          )}
          <form
            className={`composer ${internal ? "internal-note" : ""}`}
            onSubmit={(e) => {
              e.preventDefault();
              if (sending.current || reply.isPending || !canWrite || !canSubmitReply) return;
              sending.current = true;
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
              <span className="management-pill composer-channel-pill" aria-label={`Bu talep ${channels[t.channel]} kanalı tercih edilerek açıldı.`}>Bu talep {channels[t.channel]} kanalı tercih edilerek açıldı.</span>
            </div>
            {internal ? <MentionTextarea
              conversationId={t.id}
              value={body}
              onChange={setBody}
              selected={selectedMentions}
              onSelectedChange={setSelectedMentions}
              disabled={reply.isPending || !canWrite}
              placeholder={t.status === "CLOSED" ? "Bu talep kapatıldı." : "@ yazarak departmandan bir kişiyi etiketleyin…"}
              onSubmit={() => { if (!sending.current && !reply.isPending && canWrite && canSubmitReply) { sending.current = true; reply.mutate(); } }}
            /> : <textarea
              aria-label={internal ? "Dahili not" : "Yanıtınız"}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              onKeyDown={(e) => {
                if (e.key !== 'Enter' || e.shiftKey || e.ctrlKey || e.altKey || e.metaKey || e.nativeEvent.isComposing || e.keyCode === 229) return;
                e.preventDefault();
                if (!e.repeat) e.currentTarget.form?.requestSubmit();
              }}
              title="Enter ile gönder, Shift+Enter ile yeni satır"
              placeholder={
                t.status === "CLOSED"
                  ? "Bu talep kapatıldı."
                  : "Yanıtınızı yazın…"
              }
              disabled={reply.isPending || !canWrite}
              maxLength={10000}
              rows={3}
            />}
            {reply.isError && <QueryError error={reply.error} />}
            <div className="composer-footer">
              <ComposerFiles files={files} setFiles={setFiles} disabled={reply.isPending || !canWrite}/>
              <div className="composer-tools">
              {user?.role !== "CUSTOMER" && <div className="composer-saved-reply"><SavedReplyPicker onSelect={setBody}/></div>}
              <CompactFilePicker key={fileKey} setFiles={setFiles} disabled={reply.isPending || !canWrite}/>
              <button
                className="button primary composer-send"
                aria-label="Gönder"
                title="Gönder"
                disabled={
                  reply.isPending || !canWrite || !canSubmitReply
                }
              >
                <Send size={17} strokeWidth={2.2} />
                {reply.isPending ? "Gönderiliyor…" : "Gönder"}
              </button>
              </div>
            </div>
          </form>
        </section>
        <aside className="ticket-properties">
          <h2>Talep bilgileri</h2>
          {(canEditProject || t.website) && <div className="property-editor">
            {canEditProject ? <DropdownSelect label="Proje" ariaLabel="Proje" value={t.website?.id ?? ""} onChange={(websiteId) => { if (websiteId !== (t.website?.id ?? "")) update.mutate({ websiteId: websiteId || null }); }} options={websiteOptions} /> : <label>Proje{t.websiteUrl ? <a href={t.websiteUrl} target="_blank" rel="noreferrer">{t.website?.name ?? t.websiteUrl}</a> : <span>{t.website?.name ?? "Proje seçilmedi"}</span>}</label>}
          </div>}
          <div className="property-editor">
            {user?.role === "CUSTOMER" ? (
              <Badge status={t.status} />
            ) : (
              <SearchableDropdown label="Durum" name="status" disabled={!hasPermission(user, 'conversations.update')} value={t.status} onEdit={() => user?.role === "ADMIN" && navigate("/admin/tags?section=statuses")} onChange={(value) => { if (statusOptions.some((option) => option.value === value)) update.mutate({ status: value }); }} options={statusOptions} />
            )}
          </div>
          <div className="property-editor">
            {user?.role === "CUSTOMER" ? (
              <span>{priorityOptions.find((option) => option.value === t.priority)?.label ?? t.priority}</span>
            ) : (
              <SearchableDropdown label="Öncelik" name="priority" disabled={!hasPermission(user, 'conversations.update')} value={t.priority} onEdit={() => user?.role === "ADMIN" && navigate("/admin/tags?section=priorities")} onChange={(value) => { if (priorityOptions.some((option) => option.value === value)) update.mutate({ priority: value }); }} options={priorityOptions} />
            )}
          </div>
          <div className="ticket-assignee-property">
            {canAssignStaff ? (
              <SearchableDropdown label="Atanan personel" name="assignedAgentId" value={t.assignedAgent?.id??''} disabled={update.isPending || !hasPermission(user, 'conversations.assign')} onChange={value=>{if(value !== (t.assignedAgent?.id ?? '') && (value===''||(agents.data??[]).some(agent=>agent.id===value)))update.mutate({assignedAgentId:value||null})}} options={assigneeOptions} />
            ) : (
              <label>Atanan personel<span>{t.assignedAgent?.name ?? "Atanmamış"}</span></label>
            )}
          </div>
          {agents.isError && <QueryError error={agents.error} />}
          {canTransferDepartments&&<DirectorySelect endpoint="/departments" label="Departmana aktar" value={t.department.id} current={t.department} params={{ accessible: "true" }} onChange={departmentId=>update.mutate({departmentId})} disabled={update.isPending}/>}
          {user?.role!=='CUSTOMER'&&<TagEditor ticket={t} onChange={tagIds=>update.mutate({tagIds})} disabled={update.isPending || !hasPermission(user, 'conversations.update')}/>}
          {user?.role==='CUSTOMER'&&t.tags?.length>0&&<div className="ticket-tags">{t.tags.map(({tag})=><span key={tag.id}>{tag.name}</span>)}</div>}
          {update.isError && <QueryError error={update.error} />}{" "}
          {agentNeedsClaim && <div><p className="muted">Bu görüşme departman kuyruğunda. Yanıtlamadan önce üzerinize alın.</p><button className="button primary" disabled={claim.isPending} onClick={() => claim.mutate()}>{claim.isPending ? 'Üzerinize alınıyor…' : 'Üzerime ata'}</button>{claim.isError && <QueryError error={claim.error}/>}</div>}
          <div className="ticket-actions">
          {user?.role !== "CUSTOMER" &&
            t.status !== "RESOLVED" &&
            t.status !== "CLOSED" && (
              <button
                className="button secondary resolved-action"
                aria-label="Çözüldü olarak işaretle"
                title="Çözüldü olarak işaretle"
                disabled={update.isPending || !hasPermission(user, 'conversations.update')}
                onClick={() => update.mutate({ status: "RESOLVED" })}
              >
                <CheckCheck size={16} /> Çözüldü olarak işaretle
              </button>
            )}
          {hasPermission(user, 'conversations.delete')&&<button className="icon-button danger-icon" aria-label="Görüşmeyi sil" title="Görüşmeyi sil" onClick={()=>{remove.reset();setDeleteConfirm(true);}}><Trash2 size={16}/></button>}
          </div>
        </aside>
      </div>
      {hasPermission(user, 'conversations.delete') && deleteConfirm && <DeleteModal title="Görüşmeyi sil" pending={remove.isPending} onClose={() => setDeleteConfirm(false)} onConfirm={() => remove.mutate()} error={remove.isError ? <QueryError error={remove.error} /> : undefined}><p><strong>{t.subject}</strong> görüşmesi gelen kutusundan kaldırılacak. Silmek istediğinize emin misiniz?</p></DeleteModal>}
    </main>
  );
}

export function ConversationLog() {
  const { id } = useParams();
  const { user } = useAuth();
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [id]);
  type HistoryEntry = Message & { action: string; metadata: Record<string, unknown> | null };
  const logs = useQuery({
    queryKey: ["conversation-log", id, page],
    queryFn: async () => (await api.get<Page<HistoryEntry>>(`/conversations/${id}/history`, { params: { page, limit: 50 } })).data,
    enabled: Boolean(id),
  });
  const entries = logs.data?.data ?? [];
  const responseDurations = new Map<string, string>();
  let latestCustomerMessage: HistoryEntry | undefined;
  for (const entry of [...entries].reverse()) {
    if (entry.action === 'CUSTOMER_MESSAGE' || entry.action === 'INITIAL_MESSAGE') latestCustomerMessage = entry;
    if (entry.action === 'AGENT_REPLY' && latestCustomerMessage) responseDurations.set(entry.id, durationBetween(latestCustomerMessage.createdAt, entry.createdAt));
  }
  const labels: Record<string, string> = { INITIAL_MESSAGE: 'Talep açıklaması kaydedildi', CUSTOMER_MESSAGE: 'Müşteri mesajı', AGENT_REPLY: 'Personel yanıtı', INTERNAL_NOTE: 'Dahili not', SYSTEM: 'Sistem değişikliği' };
  const fields: Record<string, string> = { subject: 'Konu', number: 'Talep numarası', status: 'Durum', priority: 'Öncelik', assignedAgentId: 'Personel', departmentId: 'Departman', websiteId: 'Web sitesi', tagIds: 'Etiketler', reason: 'Neden', responseCode: 'Sunucu kodu', recipient: 'E-posta alıcısı', messageId: 'E-posta mesaj kimliği', smtpResponse: 'E-posta sunucusu yanıtı', accepted: 'Kabul edilen alıcı sayısı' };
  return (
    <main className="page conversation-log-page">
      <Link className="back-link" to={user && id ? conversationPath(user.role, id) : roleHome(user?.role ?? "CUSTOMER")}>
        <ArrowLeft size={16} />
        Konuşmaya dön
      </Link>
      <div className="page-heading">
        <div>
          <span className="eyebrow">KONUŞMA LOGU</span>
          <h1><History size={22} /> İşlem geçmişi</h1>
          <p>Mesajlar, dahili notlar ve talep değişiklikleri; işlemi yapan kişi ve tam zamanıyla. En yeni işlem en üsttedir.</p>
        </div>
      </div>
      <section className="conversation-log-panel">
        {logs.isPending && <p className="conversation-log-state">Loglar yükleniyor...</p>}
        {logs.isError && <QueryError error={logs.error} />}
        {!logs.isPending && !logs.isError && entries.length === 0 && <p className="muted conversation-log-state">Bu konuşma için henüz log kaydı yok.</p>}
        {entries.length > 0 && <div className="conversation-log-table-wrap">
          <table className="conversation-log-table" aria-label="Konuşma işlem geçmişi">
            <thead><tr><th scope="col">İşlem</th><th scope="col">İşlemi yapan</th><th scope="col">Tarih / saat <small>Türkiye saati</small></th><th scope="col">Açıklama ve dosyalar</th></tr></thead>
            <tbody>{entries.map((entry) => <tr className={entry.type === 'INTERNAL_NOTE' ? 'conversation-log-note' : ''} key={entry.id}>
              <td><div className="conversation-log-action">{entry.type === 'INTERNAL_NOTE' ? <LockKeyhole size={16} /> : entry.type === 'SYSTEM' ? <History size={16} /> : <MessageSquare size={16} />}<strong>{labels[entry.action] ?? activityActionLabel(entry.action)}</strong></div></td>
              <td><strong>{entry.author?.name ?? 'Sistem'}</strong>{entry.author?.email && <small>{entry.author.email}</small>}</td>
              <td><time dateTime={entry.createdAt}>{new Date(entry.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })}</time></td>
              <td>
                {labels[entry.action] && <p>{entry.body}</p>}
                {entry.action === 'AGENT_REPLY' && <small className="conversation-log-response">Yanıt süresi: {responseDurations.get(entry.id) ?? 'hesaplanamadı'}</small>}
                {entry.metadata && Object.entries(entry.metadata).filter(([key]) => fields[key]).map(([key, value]) => <small key={key}>{fields[key]}: {value === null ? 'Yok' : statuses[String(value)] ?? priorities[String(value)] ?? activityValueLabel(value)}</small>)}
                {entry.attachments.length > 0 && <AttachmentLinks attachments={entry.attachments} />}
              </td>
            </tr>)}</tbody>
          </table>
        </div>}
        {logs.data && logs.data.pagination.totalPages > 1 && <nav className="pagination" aria-label="İşlem geçmişi sayfaları"><button className="button" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Önceki</button><span>{page} / {logs.data.pagination.totalPages} · {logs.data.pagination.total} kayıt</span><button className="button" disabled={page >= logs.data.pagination.totalPages} onClick={() => setPage(value => value + 1)}>Sonraki</button></nav>}
      </section>
    </main>
  );
}
