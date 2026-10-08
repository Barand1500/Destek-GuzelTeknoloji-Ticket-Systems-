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
import { activityActionLabel, richDescriptionFor, type ActivityLog } from "./activity-log-format";
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
                    <td>{activityActionLabel(log.action, log.metadata)}</td>
                    <td>
                      <span>{richDescriptionFor(log)}</span>
                      {log.conversationId && (
                        <Link
                          className="button secondary"
                          to={conversationPath(user!.role, log.conversationId)}
                        >
                          Görüşmeyi aç
                        </Link>
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
