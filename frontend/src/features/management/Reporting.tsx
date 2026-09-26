import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import {
  statuses,
  priorities,
  type Status,
  type Priority,
  type Page,
} from "../../types";
import {
  Heading,
  ListState,
  Pagination,
  Search,
  formatDate,
  useList,
} from "./shared";

import { conversationPath } from "../../router/paths";
import { useAuth } from "../auth/Auth";
type ActivityLog = {
  id: string;
  action: string;
  entity?: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
  actor?: { name: string; email: string } | null;
  conversationId?: string | null;
  metadata?: { name?: string; customerName?: string | null; title?: string; subject?: string; number?: number; code?: string; phone?: string | null; email?: string | null; company?: string | null; fields?: string[]; changes?: Record<string, { from?: unknown; to?: unknown }>; originalName?: string; recipient?: string; reason?: string; attachmentCount?: number } | null;
};
const actionLabels: Record<string, string> = {
  "tag.created": "Etiket oluşturuldu",
  "tag.updated": "Etiket güncellendi",
  "tag.deleted": "Etiket silindi",
  "status.created": "Durum oluşturuldu",
  "status.updated": "Durum güncellendi",
  "status.deleted": "Durum silindi",
  "priority.created": "Öncelik oluşturuldu",
  "priority.updated": "Öncelik güncellendi",
  "priority.deleted": "Öncelik silindi",
  "user.created": "Kullanıcı oluşturuldu",
  "user.updated": "Kullanıcı bilgileri güncellendi",
  "customer.created": "Müşteri oluşturuldu",
  "customer.updated": "Müşteri bilgileri güncellendi",
  "customer.deleted": "Müşteri silindi",
  "department.updated": "Departman güncellendi",
  "department.archived": "Departman silindi",
  "website.created": "Web sitesi oluşturuldu",
  "website.updated": "Web sitesi güncellendi",
  "website.deleted": "Web sitesi silindi",
  "conversation.created": "Talep oluşturuldu",
  "conversation.claimed": "Talep üstlenildi",
  "conversation.deleted": "Talep silindi",
  "conversation.email_received": "E-posta alındı",
  "conversation.replied": "Talebe yanıt verildi",
  "conversation.note_added": "Dahili not eklendi",
  "conversation.email_sent": "E-posta gönderildi",
  "conversation.email_failed": "E-posta gönderilemedi",
  "conversation.updated": "Talep bilgileri güncellendi",
  "customer.file_deleted": "Müşteri dosyası silindi",
  "integrations.updated": "Entegrasyon ayarları güncellendi",
  TICKET_CREATED: "Görüşme oluşturuldu",
  TICKET_UPDATED: "Görüşme güncellendi",
  CONVERSATION_CREATED: "Görüşme oluşturuldu",
  CONVERSATION_UPDATED: "Görüşme güncellendi",
  MESSAGE_CREATED: "Mesaj eklendi",
  USER_CREATED: "Kullanıcı oluşturuldu",
  USER_UPDATED: "Kullanıcı güncellendi",
  DEPARTMENT_CREATED: "Departman oluşturuldu",
  DEPARTMENT_UPDATED: "Departman güncellendi",
  DEPARTMENT_ARCHIVED: "Departman silindi",
  TAG_CREATED: "Etiket oluşturuldu",
  TAG_UPDATED: "Etiket güncellendi",
  TAG_DELETED: "Etiket silindi",
  SETTINGS_UPDATED: "Ayarlar güncellendi",
  PROFILE_UPDATED: "Profil güncellendi",
  LOGIN: "Oturum açıldı",
  LOGOUT: "Oturum kapatıldı",
};
const entityLabels: Record<string, string> = { Tag: "Etiket", StatusOption: "Durum", PriorityOption: "Öncelik", User: "Kullanıcı", Department: "Departman", Website: "Web sitesi", SavedReply: "Hazır yanıt", SystemSettings: "Sistem ayarları" };
function richDescriptionFor(log: ActivityLog) {
  const metadata = log.metadata;
  const details = [
    metadata?.name && `Ad: ${metadata.name}`,
    metadata?.title && `Baslik: ${metadata.title}`,
    metadata?.subject && `Konu: ${metadata.subject}`,
    metadata?.number && `Talep no: #TK-${String(metadata.number).padStart(5, "0")}`,
    metadata?.phone && `Telefon: ${metadata.phone}`,
    metadata?.email && `E-posta: ${metadata.email}`,
    metadata?.company && `Sirket: ${metadata.company}`,
    metadata?.changes && Object.entries(metadata.changes).map(([field, change]) => `${field}: ${change.from ?? "boş"} → ${change.to ?? "boş"}`).join(" · "),
  ].filter(Boolean).join(" · ");
  if (details) return details;
  if (log.action === "customer.file_deleted") return [metadata?.customerName && `Musteri: ${metadata.customerName}`, metadata?.originalName && `Silinen dosya: ${metadata.originalName}`].filter(Boolean).join(" · ") || "Musteri dosyasi silindi.";
  if (log.action === "conversation.replied") return metadata?.attachmentCount ? `Yanıt ve ${metadata.attachmentCount} ek dosya gönderildi.` : "Talebe yanıt gönderildi.";
  if (log.action === "conversation.email_sent") return metadata?.recipient ? `Alıcı: ${metadata.recipient}` : "E-posta gönderildi.";
  if (log.action === "conversation.email_received") return "Müşteriden e-posta alındı.";
  if (log.action === "conversation.email_failed") return metadata?.reason ? `Gönderilemedi: ${metadata.reason}` : "E-posta gönderilemedi.";
  return actionLabels[log.action] ? "Ayrıntı kaydı bulunmuyor." : "Sistem işlemi kaydedildi.";
}

function descriptionFor(log: ActivityLog) {
  const record = log.metadata?.name ?? log.metadata?.title ?? log.metadata?.subject ?? log.metadata?.code;
  if (record) return [
    `Ad: ${record}`,
    log.metadata?.subject && log.metadata?.number && `Talep no: #TK-${String(log.metadata.number).padStart(5, "0")}`,
    log.metadata?.code && `Sistem kodu: ${log.metadata.code}`,
    log.metadata?.phone && `Telefon: ${log.metadata.phone}`,
    log.metadata?.email && `E-posta: ${log.metadata.email}`,
    log.metadata?.company && `Şirket: ${log.metadata.company}`,
  ].filter(Boolean).join(" · ");
  if (log.metadata?.fields?.length) return `Değişen alanlar: ${log.metadata.fields.join(", ")}`;
  if (log.action === "customer.file_deleted") return [log.metadata?.customerName && `Müşteri: ${log.metadata.customerName}`, log.metadata?.originalName && `Silinen dosya: ${log.metadata.originalName}`].filter(Boolean).join(" · ") || "Müşteri dosyası silindi.";
  if (log.action === "conversation.replied") return log.metadata?.attachmentCount ? `Yanıt ve ${log.metadata.attachmentCount} ek dosya gönderildi.` : "Talebe yanıt gönderildi.";
  if (log.action === "conversation.email_sent") return log.metadata?.recipient ? `Alıcı: ${log.metadata.recipient}` : "E-posta gönderildi.";
  if (log.action === "conversation.email_received") return "Müşteriden e-posta alındı.";
  if (log.action === "conversation.email_failed") return log.metadata?.reason ? `Gönderilemedi: ${log.metadata.reason}` : "E-posta gönderilemedi.";
  return actionLabels[log.action] ? "Ayrıntı kaydı bulunmuyor." : "Sistem işlemi kaydedildi.";
}
export function ActivityLogsPage() {
  const {user} = useAuth();
  const client = useQueryClient();
  const list = useList<ActivityLog>("/activity-logs");
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const [deletePeriod, setDeletePeriod] = useState<"day" | "week" | "month" | "all" | null>(null);
  const remove = useMutation({ mutationFn: (period: string) => api.delete("/activity-logs", { params: { period } }), onSuccess: () => void client.invalidateQueries({ queryKey: ["/activity-logs"] }) });
  const deleteLabels = { day: "Son 24 saatteki kayıtları sil", week: "Son 7 gündeki kayıtları sil", month: "Son 30 gündeki kayıtları sil", all: "Tüm işlem geçmişini sil" };
  return (
    <main className="page">
      <Heading
        title="İşlem geçmişi"
        description="Sistemdeki değişiklikleri ve işlemi yapan kullanıcıları inceleyin."
      />
      <section className="management-panel">
        <div className="activity-log-toolbar"><Search value={list.search} onChange={list.setSearch} label="İşlem geçmişinde ara" />
        <div className={`notification-delete${deleteMenuOpen ? " open" : ""}`}>
          <button type="button" className="notification-delete-trigger" aria-haspopup="menu" aria-expanded={deleteMenuOpen} onClick={() => setDeleteMenuOpen((open) => !open)}><Trash2 size={16} /><span>İşlem geçmişini sil</span><ChevronDown size={15} /></button>
          {deleteMenuOpen && <div className="notification-delete-menu" role="menu">{Object.entries(deleteLabels).map(([period, label]) => <button key={period} type="button" role="menuitem" onClick={() => { setDeletePeriod(period as "day" | "week" | "month" | "all"); setDeleteMenuOpen(false); }}>{label}</button>)}</div>}
        </div>
        </div>
        <ListState
          loading={list.isPending}
          error={list.error}
          empty={!list.data?.data.length}
        />
        {!!list.data?.data.length && (
          <div className="management-table-wrap">
            <table className="management-table">
              <thead>
                <tr>
                  <th>Tarih</th>
                  <th>Kullanıcı</th>
                  <th>İşlem</th>
                  <th>Açıklama</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((log) => (
                  <tr key={log.id}>
                    <td>{formatDate(log.createdAt)}</td>
                    <td>
                      {log.user?.name ?? log.actor?.name ?? "Sistem"}
                      <small>{log.user?.email ?? log.actor?.email}</small>
                    </td>
                    <td>{actionLabels[log.action] ?? log.action}</td>
                    <td>
                      {log.conversationId ? (
                        <Link
                          className="button secondary"
                          to={conversationPath(user!.role, log.conversationId)}
                        >
                          Görüşmeyi aç
                        </Link>
                      ) : (
                        <>
                          <span>{richDescriptionFor(log)}</span>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <Pagination
          pagination={list.data?.pagination}
          onChange={list.setPage}
        />
      </section>
      {deletePeriod && <div className="confirm-backdrop" role="presentation"><section className="confirm-modal" role="dialog" aria-modal="true" aria-label="İşlem geçmişi silme onayı" onMouseDown={(event) => event.stopPropagation()}><button className="confirm-close" type="button" onClick={() => setDeletePeriod(null)} aria-label="Kapat">×</button><h2>{deleteLabels[deletePeriod]}</h2><p>Seçilen işlem geçmişi kayıtları kalıcı olarak silinecek.</p><div className="confirm-actions"><button className="button secondary" type="button" onClick={() => setDeletePeriod(null)}>Vazgeç</button><button className="button danger" type="button" disabled={remove.isPending} onClick={() => remove.mutate(deletePeriod, { onSuccess: () => setDeletePeriod(null) })}>{remove.isPending ? "Siliniyor…" : "Sil"}</button></div></section></div>}
    </main>
  );
}

type Report = {
  period: { from: string; to: string };
  total: number;
  statuses: Partial<Record<Status, number>>;
  priorities: Partial<Record<Priority, number>>;
  departments: { id: string; name: string; count: number }[];
  daily: { date: string; created: number; resolved: number }[];
  firstResponseMinutes: number | null;
  resolutionMinutes: number | null;
  agents: {
    id: string;
    name: string;
    email: string;
    assigned: number;
    resolved: number;
    firstResponseMinutes: number | null;
  }[];
  agentsPagination: Page<unknown>["pagination"];
};
const duration = (minutes: number | null) =>
  minutes === null
    ? "Henüz veri yok"
    : minutes < 60
      ? `${Math.round(minutes)} dk`
      : minutes < 1440
        ? `${(minutes / 60).toFixed(1)} saat`
        : `${(minutes / 1440).toFixed(1)} gün`;
function Bars({ rows }: { rows: { label: string; value: number }[] }) {
  const maximum = Math.max(1, ...rows.map((row) => row.value));
  return (
    <div className="management-bars">
      {rows.map((row) => (
        <div key={row.label}>
          <div className="management-bar-label">
            <span>{row.label}</span>
            <strong>{row.value}</strong>
          </div>
          <div className="management-bar-track" aria-hidden="true">
            <div
              className="management-bar-fill"
              style={{ width: `${(100 * row.value) / maximum}%` }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
export function ReportsPage() {
  const [page, setPage] = useState(1);
  const report = useQuery({
    queryKey: ["/reports", page],
    queryFn: async () =>
      (await api.get("/reports", { params: { page, limit: 15 } })).data
        .data as Report,
  });
  const data = report.data;
  return (
    <main className="page">
      <Heading
        title="Raporlar"
        description="Görüşme yoğunluğunu, yanıt sürelerini ve ekip dağılımını değerlendirin."
      />
      <ListState
        loading={report.isPending}
        error={report.error}
        empty={false}
      />
      {data && (
        <>
          <div className="management-stats">
            <div className="management-stat">
              <span>Toplam görüşme</span>
              <strong>{data.total}</strong>
            </div>
            <div className="management-stat">
              <span>Çözülen ve kapanan</span>
              <strong>
                {(data.statuses.RESOLVED ?? 0) + (data.statuses.CLOSED ?? 0)}
              </strong>
            </div>
            <div className="management-stat">
              <span>Ortalama ilk yanıt</span>
              <strong>{duration(data.firstResponseMinutes)}</strong>
            </div>
            <div className="management-stat">
              <span>Ortalama çözüm süresi</span>
              <strong>{duration(data.resolutionMinutes)}</strong>
            </div>
          </div>
          <p className="management-read-note">
            Adetler erişebildiğiniz tüm görüşmeleri kapsar. Süre ortalamaları, {new Date(data.period.from).toLocaleDateString("tr-TR")} –{" "}
            {new Date(data.period.to).toLocaleDateString("tr-TR")} döneminde
            açılan görüşmelerden hesaplanır. Günlük çözülen sayıları, daha önce açılmış olsa da ilgili gün çözülen görüşmeleri kapsar.
          </p>
          <div className="management-reports-grid">
            <section className="management-panel">
              <h2>Durum dağılımı</h2>
              <Bars
                rows={Object.entries(statuses).map(([key, label]) => ({
                  label,
                  value: data.statuses[key as Status] ?? 0,
                }))}
              />
            </section>
            <section className="management-panel">
              <h2>Öncelik dağılımı</h2>
              <Bars
                rows={Object.entries(priorities).map(([key, label]) => ({
                  label,
                  value: data.priorities[key as Priority] ?? 0,
                }))}
              />
            </section>
            <section className="management-panel">
              <h2>Departman yoğunluğu</h2>
              {data.departments.length ? (
                <Bars
                  rows={data.departments.map((department) => ({
                    label: department.name,
                    value: department.count,
                  }))}
                />
              ) : (
                <p className="muted">Henüz departman verisi yok.</p>
              )}
            </section>
            <section className="management-panel">
              <h2>Günlük hareket</h2>
              <div className="management-table-wrap" style={{ maxHeight: 360 }}>
                <table className="management-table">
                  <thead>
                    <tr>
                      <th>Tarih</th>
                      <th>Açılan</th>
                      <th>Çözülen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.daily.map((day) => (
                      <tr key={day.date}>
                        <td>
                          {new Date(`${day.date}T12:00:00`).toLocaleDateString(
                            "tr-TR",
                          )}
                        </td>
                        <td>{day.created}</td>
                        <td>{day.resolved}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {!data.daily.length && (
                <p className="muted">Bu dönemde hareket yok.</p>
              )}
            </section>
          </div>
          <section className="management-panel" style={{ marginTop: 24 }}>
            <h2>Ekip performansı</h2>
            <p className="management-read-note">
              Adetler şu anda uzmana atanmış görüşmelere, ilk yanıt ortalaması
              dönem içinde açılmış görüşmelere aittir.
            </p>
            <div className="management-table-wrap">
              <table className="management-table">
                <thead>
                  <tr>
                    <th>Destek uzmanı</th>
                    <th>Atanmış görüşme</th>
                    <th>Çözülen</th>
                    <th>Ortalama ilk yanıt</th>
                  </tr>
                </thead>
                <tbody>
                  {data.agents.map((agent) => (
                    <tr key={agent.id}>
                      <td>
                        <strong>{agent.name}</strong>
                        <small>{agent.email}</small>
                      </td>
                      <td>{agent.assigned}</td>
                      <td>{agent.resolved}</td>
                      <td>{duration(agent.firstResponseMinutes)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {!data.agents.length && (
              <p className="management-empty">
                Bu görünümde destek uzmanı bulunamadı.
              </p>
            )}
            <Pagination pagination={data.agentsPagination} onChange={setPage} />
          </section>
        </>
      )}
    </main>
  );
}
