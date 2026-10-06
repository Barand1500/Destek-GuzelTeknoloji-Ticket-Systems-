import { useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
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
  metadata?: { name?: string; customerName?: string | null; title?: string; subject?: string; number?: number; code?: string; phone?: string | null; email?: string | null; company?: string | null; fields?: string[]; changes?: Record<string, { from?: unknown; to?: unknown }>; originalName?: string; recipient?: string; reason?: string; attachmentCount?: number; deletedConversationCount?: number } | null;
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
  "website.created": "Proje oluşturuldu",
  "website.updated": "Proje güncellendi",
  "website.deleted": "Proje silindi",
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
const entityLabels: Record<string, string> = { Tag: "Etiket", StatusOption: "Durum", PriorityOption: "Öncelik", User: "Kullanıcı", Department: "Departman", Website: "Proje", SavedReply: "Hazır yanıt", SystemSettings: "Sistem ayarları" };
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

export { ReportsPage } from "./Reports";
