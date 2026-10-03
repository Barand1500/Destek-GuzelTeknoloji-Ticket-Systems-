import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Bell,
  Building2,
  CalendarDays,
  Check,
  ChevronLeft,
  ChevronRight,
  FileText,
  History,
  Mail,
  Megaphone,
  MessageSquare,
  Paperclip,
  Pin,
  Search,
  Send,
  Upload,
  Users,
  X,
} from "lucide-react";
import { api, errorText } from "../../services/api";
import { priorities, type Page, type User } from "../../types";
import { DropdownSelect } from "../../components/DropdownSelect";
import "./announcements.css";
import type { AnnouncementTemplate } from "./templates";

type Channel = "NOTIFICATION" | "SMS" | "EMAIL";
type Person = {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  departmentIds: string[];
};
type Directory = {
  people: Person[];
  departments: { id: string; name: string }[];
  smsEnabled: boolean;
  emailEnabled: boolean;
  maxFileSize: number;
};
type Announcement = {
  id: string;
  title: string;
  body: string;
  authorName: string;
  priority: string;
  departmentName: string | null;
  createdAt: string;
  eventAt: string | null;
  pinned: boolean;
  recipientCount?: number;
  files: { index: number; originalName: string; size: number }[];
  deliveries: {
    userId: string;
    recipientName: string;
    channel: Channel;
    status: string;
    error: string | null;
  }[];
};
const channelOptions = [
  {
    id: "NOTIFICATION" as const,
    label: "Bildirim",
    description: "Uygulama içi bildirim",
    icon: Bell,
  },
  {
    id: "SMS" as const,
    label: "SMS",
    description: "Telefon numarasına gönder",
    icon: MessageSquare,
  },
  {
    id: "EMAIL" as const,
    label: "E-posta",
    description: "E-posta adresine gönder",
    icon: Mail,
  },
];

export function AnnouncementsModal({
  user,
  onClose,
  initialTab = "new",
}: {
  user: User;
  onClose: () => void;
  initialTab?: "new" | "history";
}) {
  const canPublish = user.role === "ADMIN" || user.role === "SUPERVISOR";
  const dialog = useRef<HTMLDialogElement>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  const recipientPicker = useRef<HTMLDivElement>(null);
  const client = useQueryClient();
  const [tab, setTab] = useState<"new" | "history">(
    canPublish ? initialTab : "history",
  );
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [priority, setPriority] = useState("NORMAL");
  const [departmentId, setDepartmentId] = useState("");
  const [eventAt, setEventAt] = useState("");
  const [pinned, setPinned] = useState(false);
  const [mode, setMode] = useState<"ALL" | "SELECTED">("ALL");
  const [recipientPickerOpen, setRecipientPickerOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const [channels, setChannels] = useState<Channel[]>(["NOTIFICATION"]);
  const [files, setFiles] = useState<File[]>([]);
  const [search, setSearch] = useState("");
  const [template, setTemplate] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [page, setPage] = useState(1);
  const [expandedId, setExpandedId] = useState("");
  useEffect(() => {
    const closePicker = (event: MouseEvent) => {
      if (
        recipientPicker.current &&
        !recipientPicker.current.contains(event.target as Node)
      ) {
        setRecipientPickerOpen(false);
      }
    };
    document.addEventListener("mousedown", closePicker);
    return () => document.removeEventListener("mousedown", closePicker);
  }, []);
  const templatesQuery = useQuery({
    queryKey: ["/announcement-templates", "all"],
    queryFn: async () => {
      const data: AnnouncementTemplate[] = [];
      let page = 1;
      let totalPages = 1;
      do {
        const result = (
          await api.get<Page<AnnouncementTemplate>>("/announcement-templates", {
            params: { page, limit: 100 },
          })
        ).data;
        data.push(...result.data);
        totalPages = result.pagination.totalPages;
        page++;
      } while (page <= totalPages);
      return data;
    },
    enabled: canPublish,
  });
  const templates = templatesQuery.data ?? [];
  const directory = useQuery({
    queryKey: ["/announcements/directory"],
    queryFn: async () =>
      (await api.get<{ data: Directory }>("/announcements/directory")).data
        .data,
    enabled: canPublish,
  });
  const history = useQuery({
    queryKey: ["/announcements", page],
    queryFn: async () =>
      (
        await api.get<Page<Announcement>>("/announcements", {
          params: { page, limit: 8 },
        })
      ).data,
    enabled: tab === "history",
    refetchInterval: tab === "history" ? 4000 : false,
  });
  const people = (directory.data?.people ?? []).filter(
    (p) => !departmentId || p.departmentIds.includes(departmentId),
  );
  useEffect(() => {
    if (mode === "ALL" && directory.data && selected.length === 0) {
      setSelected(people.map((person) => person.id));
    }
  }, [directory.data, mode, people, selected.length]);
  const recipients =
    mode === "ALL" ? people : people.filter((p) => selected.includes(p.id));
  const matches = people.filter((p) =>
    `${p.name} ${p.email ?? ""} ${p.phone ?? ""}`
      .toLocaleLowerCase("tr-TR")
      .includes(search.toLocaleLowerCase("tr-TR")),
  );
  const missingPhones = recipients.filter((p) => !p.phone).length;
  const missingEmails = recipients.filter((p) => !p.email).length;
  const publish = useMutation({
    mutationFn: async () => {
      const data = new FormData();
      data.set(
        "payload",
        JSON.stringify({
          title,
          body,
          priority,
          departmentId: departmentId || null,
          eventAt: eventAt ? new Date(eventAt).toISOString() : null,
          pinned,
          recipientMode: mode,
          recipientIds: mode === "SELECTED" ? selected : [],
          channels,
        }),
      );
      files.forEach((file) => data.append("files", file));
      return (await api.post<{ data: Announcement }>("/announcements", data))
        .data.data;
    },
    onSuccess: (result) => {
      setNotice(
        "Duyuru kaydedildi. Gönderim sonuçlarını buradan takip edebilirsiniz.",
      );
      setTitle("");
      setBody("");
      setEventAt("");
      setPriority("NORMAL");
      setPinned(false);
      setFiles([]);
      setTemplate("");
      setPage(1);
      setExpandedId(result.id);
      setTab("history");
      void client.invalidateQueries({ queryKey: ["/announcements"] });
      void client.invalidateQueries({ queryKey: ["/notifications"] });
    },
  });
  useEffect(() => {
    const node = dialog.current;
    const previous = document.activeElement as HTMLElement | null;
    node?.showModal();
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      node?.close();
      document.body.style.overflow = overflow;
      previous?.focus();
    };
  }, []);

  function addFiles(incoming: FileList | File[]) {
    const next = [...files, ...Array.from(incoming)];
    const maxSize = directory.data?.maxFileSize ?? 10 * 1024 * 1024;
    if (next.length > 10) {
      setError("En fazla 10 dosya ekleyebilirsiniz.");
      return;
    }
    if (next.some((file) => file.size === 0 || file.size > maxSize)) {
      setError(
        `Her dosya boş olmayan ve en fazla ${Math.floor(maxSize / 1024 / 1024)} MB boyutunda olmalıdır.`,
      );
      return;
    }
    if (
      next.some(
        (file) =>
          !/\.(jpg|jpeg|png|webp|pdf|docx|xlsx|txt|zip)$/i.test(file.name),
      )
    ) {
      setError(
        "Desteklenen dosyalar: JPG, PNG, WebP, PDF, DOCX, XLSX, TXT ve ZIP.",
      );
      return;
    }
    setError("");
    setFiles(next);
  }
  function submit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!title.trim() || !body.trim()) {
      setError("Başlık ve duyuru içeriğini doldurun.");
      return;
    }
    if (!channels.length) {
      setError("En az bir gönderim kanalı seçin.");
      return;
    }
    if (!recipients.length) {
      setError("En az bir alıcı seçin.");
      return;
    }
    publish.mutate();
  }
  async function download(id: string, index: number, name: string) {
    try {
      const response = await api.get(`/announcements/${id}/files/${index}`, {
        responseType: "blob",
      });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement("a");
      link.href = url;
      link.download = name;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (failure) {
      setError(errorText(failure));
    }
  }
  return (
    <dialog
      ref={dialog}
      className="announcements-modal"
      aria-labelledby="announcements-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!publish.isPending) onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget && !publish.isPending) {
          const bounds = event.currentTarget.getBoundingClientRect();
          if (
            event.clientX < bounds.left ||
            event.clientX > bounds.right ||
            event.clientY < bounds.top ||
            event.clientY > bounds.bottom
          )
            onClose();
        }
      }}
    >
      <header className="announcements-header">
        <div>
          <h2 id="announcements-title">Duyurular</h2>
        </div>
        <button
          type="button"
          className="announcements-close"
          onClick={onClose}
          disabled={publish.isPending}
          aria-label="Duyuruları kapat"
        >
          <X size={21} />
        </button>
      </header>
      <nav className="announcements-tabs" aria-label="Duyuru ekranları">
        {canPublish && (
          <button
            type="button"
            aria-current={tab === "new" ? "page" : undefined}
            onClick={() => {
              setTab("new");
              setNotice("");
              setError("");
            }}
          >
            <Send size={16} />
            Yeni duyuru
          </button>
        )}
        <button
          type="button"
          aria-current={tab === "history" ? "page" : undefined}
          onClick={() => {
            setTab("history");
            setError("");
          }}
        >
          <History size={17} />
          {canPublish ? "Duyuru geçmişi" : "Duyurularım"}
        </button>
      </nav>
      {tab === "new" ? (
        <form onSubmit={submit} className="announcement-form">
          <div className="announcements-scroll">
            {(error || publish.error || directory.error) && (
              <p className="announcement-alert" role="alert">
                {error || errorText(publish.error || directory.error)}
              </p>
            )}
            {directory.isPending && (
              <p role="status" className="announcement-muted">
                Departmanlar ve alıcılar yükleniyor…
              </p>
            )}
            <fieldset
              disabled={publish.isPending}
              className="announcement-section"
            >
              <legend>
                <FileText size={17} />
                Duyuru içeriği
              </legend>
              <label className="announcement-field">
                <span className="announcement-field-label">
                  Başlık <span aria-hidden="true">*</span>
                </span>
                <input
                  autoFocus
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  required
                  minLength={2}
                  maxLength={180}
                />
              </label>
              <div className="announcement-template-heading">
                <span>Hazır şablonlar</span>
                <small>Hızlı bir başlangıç yapın</small>
              </div>
              <div className="announcement-templates">
                {templates.map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    aria-pressed={template === item.id}
                    onClick={() => {
                      setTemplate(item.id);
                      setTitle(item.title);
                      setBody(item.body);
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {templatesQuery.error && (
                <p className="announcement-alert" role="alert">
                  Hazır şablonlar yüklenemedi.
                </p>
              )}
              <label
                className="announcement-field"
                onMouseDown={() => setRecipientPickerOpen(false)}
              >
                <span className="announcement-field-label">
                  İçerik <span aria-hidden="true">*</span>
                </span>
                <textarea
                  value={body}
                  onChange={(e) => {
                    setBody(e.target.value);
                    setTemplate("");
                  }}
                  required
                  minLength={2}
                  maxLength={10000}
                  rows={4}
                />
              </label>
              <div className="announcement-content-hint">
                <span>
                  <code>{"{isim}"}</code> her alıcının adıyla değiştirilir.
                </span>
                <span>{body.length.toLocaleString("tr-TR")} karakter</span>
              </div>
              <div className="announcement-two-columns">
                <label className="announcement-field">
                  <span className="announcement-field-label">Öncelik</span>
                  <DropdownSelect
                    ariaLabel="Öncelik"
                    value={priority}
                    onChange={setPriority}
                    options={Object.entries(priorities).map(([value, label]) => ({
                      value,
                      label,
                    }))}
                  />
                </label>
                <label className="announcement-field">
                  <span className="announcement-field-label">
                    <CalendarDays size={15} />
                    Etkinlik / toplantı tarihi <small>İsteğe bağlı</small>
                  </span>
                  <input
                    type="datetime-local"
                    value={eventAt}
                    onChange={(e) => setEventAt(e.target.value)}
                  />
                </label>
              </div>
              <label
                className="announcement-upload"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault();
                  if (!publish.isPending) addFiles(e.dataTransfer.files);
                }}
              >
                <Upload size={22} />
                <span>
                  <strong>Dosya eklemek için tıklayın</strong> veya buraya
                  sürükleyin
                </span>
                <small>
                  En fazla 10 dosya · Dosya başına en fazla{" "}
                  {Math.floor(
                    (directory.data?.maxFileSize ?? 10485760) / 1048576,
                  )}{" "}
                  MB
                </small>
                <input
                  ref={fileInput}
                  type="file"
                  multiple
                  accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.zip"
                  aria-label="Duyuruya dosya ekle"
                  onChange={(e) => {
                    if (e.target.files) addFiles(e.target.files);
                    e.target.value = "";
                  }}
                />
              </label>
              {!!files.length && (
                <ul className="announcement-files">
                  {files.map((file, index) => (
                    <li key={`${file.name}-${index}`}>
                      <Paperclip size={14} />
                      <span>{file.name}</span>
                      <small>{(file.size / 1024).toFixed(0)} KB</small>
                      <button
                        type="button"
                        aria-label={`${file.name} dosyasını kaldır`}
                        onClick={() =>
                          setFiles((current) =>
                            current.filter((_, i) => index !== i),
                          )
                        }
                      >
                        <X size={15} />
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <label className="announcement-pin">
                <input
                  type="checkbox"
                  checked={pinned}
                  onChange={(e) => setPinned(e.target.checked)}
                />
                <Pin size={15} />
                Duyuruyu listenin başına sabitle
              </label>
            </fieldset>
            <fieldset
              disabled={publish.isPending}
              className="announcement-section"
            >
              <legend>
                <Users size={18} />
                Alıcılar
                <span className="announcement-count">
                  {recipients.length} kişi
                </span>
              </legend>
              <div ref={recipientPicker} className="announcement-recipient-area">
                <div className="announcement-recipient-controls">
                <label className="announcement-field">
                  <span className="announcement-field-label">
                    <Building2 size={15} />
                    Hedef departman
                  </span>
                  <DropdownSelect
                    ariaLabel="Hedef departman"
                    value={departmentId}
                    onChange={(value) => {
                      setDepartmentId(value);
                      const departmentPeople = (directory.data?.people ?? []).filter(
                        (person) =>
                          !value || person.departmentIds.includes(value),
                      );
                      setSelected(departmentPeople.map((person) => person.id));
                      setMode("SELECTED");
                      setRecipientPickerOpen(false);
                    }}
                    options={[
                      {
                        value: "",
                        label:
                          user.role === "ADMIN"
                            ? "Tüm departmanlar"
                            : "Yetkili olduğum departmanlar",
                      },
                      ...(directory.data?.departments.map((d) => ({
                        value: d.id,
                        label: d.name,
                      })) ?? []),
                    ]}
                  />
                </label>
                <div className="announcement-recipient-modes">
                <button
                  type="button"
                  aria-pressed={recipientPickerOpen}
                  onClick={() => {
                    setMode("SELECTED");
                    setRecipientPickerOpen((open) => !open);
                  }}
                >
                  <Check size={16} />
                  Seçili kişiler ({selected.length})
                </button>
                </div>
              </div>
              {mode === "SELECTED" && recipientPickerOpen && (
                <div className="announcement-people-picker">
                  <label className="announcement-person-search">
                    <Search size={16} />
                    <input
                      type="search"
                      aria-label="Alıcı ara"
                      placeholder="Ad, e-posta veya telefon ile ara…"
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                    />
                  </label>
                  <div className="announcement-select-all">
                    <span>{matches.length} kişi</span>
                    <button
                      type="button"
                      onClick={() =>
                        setSelected((current) =>
                          matches.every((p) => current.includes(p.id))
                            ? current.filter(
                                (id) => !matches.some((p) => p.id === id),
                              )
                            : [
                                ...new Set([
                                  ...current,
                                  ...matches.map((p) => p.id),
                                ]),
                              ],
                        )
                      }
                    >
                      {matches.length &&
                      matches.every((p) => selected.includes(p.id))
                        ? "Seçimi kaldır"
                        : "Görünenleri seç"}
                    </button>
                  </div>
                  <div className="announcement-people">
                    {matches.map((person) => (
                      <label key={person.id}>
                        <input
                          type="checkbox"
                          checked={selected.includes(person.id)}
                          onChange={(e) =>
                            setSelected((current) =>
                              e.target.checked
                                ? [...current, person.id]
                                : current.filter((id) => id !== person.id),
                            )
                          }
                        />
                        <span className="announcement-avatar">
                          {person.name.slice(0, 1)}
                        </span>
                        <span>
                          <strong>{person.name}</strong>
                          <small>
                            {person.email ||
                              person.phone ||
                              "İletişim bilgisi eklenmemiş"}
                          </small>
                        </span>
                      </label>
                    ))}
                    {!matches.length && (
                      <p className="announcement-muted">
                        Bu seçimde personel bulunamadı.
                      </p>
                    )}
                  </div>
                </div>
              )}
              </div>
              {!people.length && !directory.isPending && !directory.error && (
                <p className="announcement-muted">
                  Bu departmanda aktif personel yok.
                </p>
              )}
            </fieldset>
            <fieldset
              disabled={publish.isPending}
              className="announcement-section announcement-channel-section"
            >
              <legend>
                <Send size={17} />
                Gönderim kanalları
              </legend>
              <p className="announcement-section-help">
                Bir veya birden fazla kanal seçebilirsiniz.
              </p>
              <div className="announcement-channels">
                {channelOptions.map(
                  ({ id, label, description, icon: Icon }) => {
                    const available =
                      id === "NOTIFICATION" ||
                      (id === "SMS"
                        ? directory.data?.smsEnabled
                        : directory.data?.emailEnabled);
                    return (
                      <label
                        key={id}
                        className={`${channels.includes(id) ? "selected" : ""}${!available ? " unavailable" : ""}`}
                      >
                        <input
                          type="checkbox"
                          checked={channels.includes(id)}
                          disabled={!available || publish.isPending}
                          onChange={(e) =>
                            setChannels((current) =>
                              e.target.checked
                                ? [...current, id]
                                : current.filter((channel) => channel !== id),
                            )
                          }
                        />
                        <Icon size={20} />
                        <strong>{label}</strong>
                        <small>
                          {available ? description : "Entegrasyon etkin değil"}
                        </small>
                      </label>
                    );
                  },
                )}
              </div>
              {channels.includes("SMS") && (
                <p className="announcement-channel-note">
                  SMS, başlık ve duyuru metnini içerir. Dosyalar SMS’e eklenmez;
                  uzun mesajlar birden fazla SMS olarak ücretlendirilebilir.
                </p>
              )}
              {!!files.length && (
                <p className="announcement-channel-note">
                  Dosyalar duyuru geçmişinden indirilebilir; e-posta seçilirse
                  mesaja eklenir.
                </p>
              )}
              {((channels.includes("SMS") && missingPhones > 0) ||
                (channels.includes("EMAIL") && missingEmails > 0)) && (
                <p className="announcement-warning" role="status">
                  {channels.includes("SMS") && missingPhones > 0
                    ? `${missingPhones} kişinin telefon bilgisi eksik. `
                    : ""}
                  {channels.includes("EMAIL") && missingEmails > 0
                    ? `${missingEmails} kişinin e-posta bilgisi eksik. `
                    : ""}
                  Bu kişilere ilgili kanaldan gönderim yapılamaz.
                </p>
              )}
            </fieldset>
          </div>
          <footer className="announcements-footer">
            <span>
              <strong>{recipients.length} alıcı</strong> · {channels.length}{" "}
              kanal
            </span>
            <div>
              <button
                type="button"
                className="announcement-cancel"
                onClick={onClose}
                disabled={publish.isPending}
              >
                İptal
              </button>
              <button
                type="submit"
                className="announcement-submit"
                disabled={
                  publish.isPending ||
                  !directory.data ||
                  !recipients.length ||
                  !channels.length
                }
              >
                <Send size={16} />
                {publish.isPending ? "Yayınlanıyor…" : "Duyuruyu yayınla"}
              </button>
            </div>
          </footer>
        </form>
      ) : (
        <div className="announcements-history announcements-scroll">
          {notice && (
            <p className="announcement-success" role="status">
              <Check size={16} />
              {notice}
            </p>
          )}
          {(error || history.error) && (
            <p className="announcement-alert" role="alert">
              {error || errorText(history.error)}
            </p>
          )}
          {history.isPending && (
            <p className="announcement-muted" role="status">
              Duyurular yükleniyor…
            </p>
          )}
          {!history.isPending &&
            !history.error &&
            !history.data?.data.length && (
              <div className="announcements-empty">
                <Megaphone size={34} />
                <h3>Henüz duyuru yok</h3>
                <p>
                  {canPublish
                    ? "İlk duyurunuzu hazırlayın, ekibinize tek yerden ulaşın."
                    : "Size gönderilen duyurular burada görünecek."}
                </p>
                {canPublish && (
                  <button
                    type="button"
                    className="announcement-submit"
                    onClick={() => setTab("new")}
                  >
                    Yeni duyuru oluştur
                  </button>
                )}
              </div>
            )}
          {history.data?.data.map((item) => {
            const expanded = expandedId === item.id;
            const pending = item.deliveries.filter(
              (d) => d.status === "PENDING" || d.status === "PROCESSING",
            ).length;
            const failed = item.deliveries.filter(
              (d) => d.status === "FAILED" || d.status === "UNKNOWN",
            );
            return (
              <article key={item.id} className="announcement-history-item">
                <button
                  type="button"
                  className="announcement-history-toggle"
                  aria-expanded={expanded}
                  onClick={() => setExpandedId(expanded ? "" : item.id)}
                >
                  <div className="announcement-history-meta">
                    {item.pinned && <Pin size={14} />}
                    <span
                      className={`announcement-priority priority-${item.priority}`}
                    >
                      {priorities[item.priority]}
                    </span>
                    <span>
                      {item.departmentName || "Tüm yetkili departmanlar"}
                    </span>
                    <time>
                      {new Date(item.createdAt).toLocaleString("tr-TR", {
                        day: "2-digit",
                        month: "short",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </time>
                  </div>
                  <h3>{item.title}</h3>
                  <p>
                    {item.authorName}
                    {item.recipientCount !== undefined
                      ? ` · ${item.recipientCount} alıcı`
                      : ""}
                    {pending
                      ? ` · ${pending} gönderim bekliyor`
                      : failed.length
                        ? ` · ${failed.length} gönderim kontrol edilmeli`
                        : " · Gönderildi"}
                  </p>
                </button>
                {expanded && (
                  <div className="announcement-history-detail">
                    <p className="announcement-body">{item.body}</p>
                    {item.eventAt && (
                      <p className="announcement-event">
                        <CalendarDays size={16} />
                        {new Date(item.eventAt).toLocaleString("tr-TR")}
                      </p>
                    )}
                    {!!item.files.length && (
                      <div className="announcement-downloads">
                        {item.files.map((file) => (
                          <button
                            key={file.index}
                            type="button"
                            onClick={() =>
                              void download(
                                item.id,
                                file.index,
                                file.originalName,
                              )
                            }
                          >
                            <Paperclip size={14} />
                            {file.originalName}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="announcement-delivery-summary">
                      {channelOptions
                        .filter((option) =>
                          item.deliveries.some((d) => d.channel === option.id),
                        )
                        .map(({ id, label, icon: Icon }) => {
                          const list = item.deliveries.filter(
                            (d) => d.channel === id,
                          );
                          return (
                            <span key={id}>
                              <Icon size={15} />
                              <strong>{label}</strong>
                              {list.filter((d) => d.status === "SENT").length}/
                              {list.length} gönderildi
                            </span>
                          );
                        })}
                    </div>
                    {!!failed.length && (
                      <details className="announcement-failures">
                        <summary>
                          {failed.length} gönderim için detaylar
                        </summary>
                        {failed.map((d) => (
                          <p key={`${d.userId}-${d.channel}`}>
                            <strong>
                              {d.recipientName} ·{" "}
                              {
                                channelOptions.find((c) => c.id === d.channel)
                                  ?.label
                              }
                            </strong>
                            <span>
                              {d.error || "Gönderim sonucu doğrulanamadı."}
                            </span>
                          </p>
                        ))}
                      </details>
                    )}
                  </div>
                )}
              </article>
            );
          })}
          {history.data && history.data.pagination.totalPages > 1 && (
            <div className="announcement-pagination">
              <button
                type="button"
                aria-label="Önceki duyurular"
                disabled={page === 1}
                onClick={() => setPage((p) => p - 1)}
              >
                <ChevronLeft size={18} />
              </button>
              <span>
                {page} / {history.data.pagination.totalPages}
              </span>
              <button
                type="button"
                aria-label="Sonraki duyurular"
                disabled={page >= history.data.pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                <ChevronRight size={18} />
              </button>
            </div>
          )}
        </div>
      )}
    </dialog>
  );
}
