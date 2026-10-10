import { useState, type FormEvent } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Eye, Pencil, Trash2 } from "lucide-react";
import { useAuth } from "../auth/Auth";
import { hasPermission } from "../auth/permissions";
import { DeleteModal } from '../../components/DeleteModal';
import { api } from "../../services/api";
import { workspacePath } from "../../router/paths";
import { ProjectGuideFileModal } from "./ProjectGuideFileModal";
import { AnnouncementTemplates } from "./AnnouncementTemplates";
import { ComposerFiles } from "../tickets/TicketExtras";
import type { Department, Website } from "../../types";
import {
  ErrorMessage,
  FormActions,
  Heading,
  ListState,
  Pagination,
  Search,
  editableRowProps,
  formValues,
  useDelete,
  useList,
  useSave,
} from "./shared";

type ManagedDepartment = Department & { isActive: boolean };
type Tag = { id: string; name: string; code: string; color: string };
type SavedReply = {
  id: string;
  title: string;
  body: string;
  authorId: string;
  author?: { id: string; name: string };
};

export function DepartmentsPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = hasPermission(user, "departments.create");
  const canUpdate = hasPermission(user, "departments.update");
  const canDelete = hasPermission(user, "departments.delete");
  const list = useList<ManagedDepartment>("/departments", user?.role === "ADMIN" ? { includeInactive: true } : {});
  const changeStatus = useSave('/departments', undefined, ['departments']);
  const [editing, setEditing] = useState<ManagedDepartment | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedDepartment | null>(null);
  const [version, setVersion] = useState(0);
  function reset() {
    setEditing(null);
    setVersion((v) => v + 1);
  }
  const save = useSave("/departments", reset, ["departments"]);
  const remove = useDelete("/departments", ["departments"]);
  function submit(event: FormEvent<HTMLFormElement>) {
    const form = formValues(event);
    save.mutate({ id: editing?.id, data: { name: form.get("name") } });
  }
  return (
    <main className="page">
      <Heading
        title="Departmanlar"
        description="Erişiminiz olan departmanları görüntüleyin ve yetkiniz varsa yönetin."
      />
      {hasPermission(user, "users.view") && <nav className="catalog-tabs" aria-label="Personel alanları"><button type="button" onClick={() => user && navigate(workspacePath(user.role, "users"))}>Kullanıcılar</button><button type="button" className="active">Departmanlar</button></nav>}
      <div className="management-grid">
        <section className="management-panel">
          <Search value={list.search} onChange={list.setSearch} limit={list.limit} onLimitChange={list.setLimit} />
          <ErrorMessage error={remove.error} />
          <ErrorMessage error={changeStatus.error} />
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
                    <th>Departman</th>
                    {canUpdate && <th>Durum</th>}
                    {(canUpdate || canDelete) && <th>İşlemler</th>}
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((item) => (
                    <tr key={item.id} {...editableRowProps(() => { setEditing(item); setVersion((v) => v + 1); save.reset(); })} className={!item.isActive ? "inactive-record management-editable-row" : "management-editable-row"}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      {canUpdate && <td>
                        <div className="status-toggle"><label className="switch"><input type="checkbox" role="switch" aria-label={`${item.name} aktif`} checked={item.isActive} disabled={changeStatus.isPending} onChange={() => changeStatus.mutate({ id: item.id, data: { isActive: !item.isActive } })} /><span /></label><span>{item.isActive ? 'Aktif' : 'Pasif'}</span></div>
                      </td>}
                      {(canUpdate || canDelete) && <td>
                        <div className="management-actions">
                          {canUpdate && <button
                            type="button"
                            className="icon-button"
                            aria-label={`${item.name} düzenle`}
                            title="Düzenle"
                            onClick={() => {
                              setEditing(item);
                              setVersion((v) => v + 1);
                              save.reset();
                            }}
                          >
                            <Pencil size={15} aria-hidden="true" />
                          </button>}
                          {canDelete && <button
                            type="button"
                            className="icon-button danger-icon"
                            aria-label={`${item.name} sil`}
                            title="Sil"
                            disabled={remove.isPending}
                            onClick={() => { remove.reset(); setDeleteTarget(item); }}
                          >
                            <Trash2 size={15} aria-hidden="true" />
                          </button>}
                        </div>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            pagination={list.data?.pagination}
            onChange={list.setPage}
            alwaysVisible
          />
        </section>
      {(editing ? canUpdate : canCreate) && <section className="management-panel">
          <h2>{editing ? "Departmanı düzenle" : "Departman oluştur"}</h2>
          <form key={version} className="management-form" onSubmit={submit}>
            <label>
              <span className="field-label">Departman adı</span>
              <input
                required
                minLength={2}
                maxLength={100}
                name="name"
                defaultValue={editing?.name}
              />
            </label>
            <p className="muted">
              Silinen departman yeni görüşmelerde seçilemez; geçmiş
              görüşmeler korunur. Ekip üyeliklerini Kullanıcılar sayfasından
              düzenleyebilirsiniz.
            </p>
            <ErrorMessage error={save.error} />
            <FormActions
              pending={save.isPending}
              onCancel={editing ? reset : undefined}
            />
          </form>
        </section>}
      </div>
      {deleteTarget && <DeleteModal title="Departmanı sil" pending={remove.isPending} onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate(deleteTarget.id, { onSuccess: () => { if (editing?.id === deleteTarget.id) reset(); setDeleteTarget(null); } })} error={<ErrorMessage error={remove.error} />}><p><strong>{deleteTarget.name}</strong> listeden silinecek. Mevcut görüşmeler ve ekip erişimi korunur.</p></DeleteModal>}
    </main>
  );
}

export function TagsPage() {
  const { user } = useAuth();
  const canCreate = hasPermission(user, "tags.create");
  const canUpdate = hasPermission(user, "tags.update");
  const canDelete = hasPermission(user, "tags.delete");
  const [params, setParams] = useSearchParams();
  const section = params.get("section") === "statuses" || params.get("section") === "priorities" ? params.get("section") : "tags";
  const [editing, setEditing] = useState<Tag | null>(null);
  const [editingView, setEditingView] = useState<{ id: string; name: string; code: string } | null>(null);
  const [viewLabels, setViewLabels] = useState<Record<string, string>>({});
  const [deleteTarget, setDeleteTarget] = useState<Tag | null>(null);
  const [version, setVersion] = useState(0);
  function reset() {
    setEditing(null);
    setEditingView(null);
    setVersion((v) => v + 1);
  }
  const save = useSave("/tags", reset, ["tags"]);
  const remove = useDelete("/tags", ["tags", "tickets", "conversations"]);
  const inboxViews = [
    { id: "view-all", name: "Tümü", code: "ALL", color: "#7c9b91", href: "/admin/conversations?view=all&category=ALL" },
    { id: "view-ticket", name: "Telefon talebi", code: "TICKET", color: "#7c9b91", href: "/admin/conversations?view=all&category=TICKET" },
    { id: "view-mail", name: "Mail", code: "EMAIL", color: "#7c9b91", href: "/admin/conversations?view=all&category=EMAIL" },
    { id: "view-sms", name: "SMS", code: "SMS", color: "#7c9b91", href: "/admin/conversations?view=all&category=SMS" },
    { id: "view-whatsapp", name: "WhatsApp", code: "WHATSAPP", color: "#7c9b91", href: "/admin/conversations?view=all&category=WHATSAPP" },
    { id: "view-mine", name: "Bana atanan", code: "MINE", color: "#7c9b91", href: "/admin/conversations?view=mine&category=MINE" },
    { id: "view-unassigned", name: "Atanmamış", code: "UNASSIGNED", color: "#7c9b91", href: "/admin/conversations?view=unassigned&category=UNASSIGNED" },
  ].map((view) => ({ ...view, name: viewLabels[view.code] ?? view.name }));
  const list = useList<Tag>("/tags", {}, inboxViews.length);
  function selectSection(value: "tags" | "statuses" | "priorities") {
    if (value === "tags") setParams({});
    else setParams({ section: value });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    const form = formValues(event);
    if (editingView) {
      const key = ({ ALL: "all", TICKET: "ticket", EMAIL: "mail", SMS: "sms", WHATSAPP: "whatsapp", MINE: "mine", UNASSIGNED: "unassigned" } as Record<string, string>)[editingView.code] ?? "all";
      const storageKey = `helpdesk-inbox-tabs-${user?.id}`;
      try {
        const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}");
        window.localStorage.setItem(storageKey, JSON.stringify({ ...saved, labels: { ...saved.labels, [key]: form.get("name") } }));
      } catch { /* local storage unavailable */ }
      setViewLabels((current) => ({ ...current, [editingView.code]: String(form.get("name") ?? "") }));
      reset();
      return;
    }
    save.mutate({
      id: editing?.id,
      data: { name: form.get("name"), code: form.get("code") },
    });
  }
  return (
    <main className="page">
      <Heading
        title="Kategoriler"
        description="Görüşmeleri konularına göre düzenleyin ve kolayca bulun."
      />
      <nav className="catalog-tabs" aria-label="Görüşme alanları">
        <button type="button" className={section === "tags" ? "active" : ""} onClick={() => selectSection("tags")}>Etiketler</button>
        <button type="button" className={section === "statuses" ? "active" : ""} onClick={() => selectSection("statuses")}>Durumlar</button>
        <button type="button" className={section === "priorities" ? "active" : ""} onClick={() => selectSection("priorities")}>Öncelikler</button>
      </nav>
      {section === "tags" ? <div className="management-grid">
        <section className="management-panel">
          <Search value={list.search} onChange={list.setSearch} limit={list.limit} onLimitChange={list.setLimit} />
          <ErrorMessage error={remove.error} />
          <ListState
            loading={list.isPending}
            error={list.error}
            empty={!list.data?.data.length && !inboxViews.length}
          />
          {!!(list.data?.data.length || inboxViews.length) && (
            <div className="management-table-wrap">
              <table className="management-table">
                <thead>
                  <tr>
                    <th>Görünen ad</th>
                    <th>Sistem kodu</th>
                    {(canUpdate || canDelete) && <th>İşlemler</th>}
                  </tr>
                </thead>
                <tbody>
                  {(list.page === 1 ? inboxViews : []).map((view) => (
                    <tr key={view.id} {...editableRowProps(() => { setEditing(null); setEditingView({ id: view.id, name: view.name, code: view.code }); setVersion((v) => v + 1); })}>
                      <td>{view.name}</td>
                      <td><code>{view.code}</code></td>
                      {(canUpdate || canDelete) && <td><div className="management-actions">{canUpdate && <button className="button secondary" type="button" onClick={() => { setEditing(null); setEditingView({ id: view.id, name: view.name, code: view.code }); setVersion((v) => v + 1); }}>Düzenle</button>}</div></td>}
                    </tr>
                  ))}
                  {list.data?.data.map((tag) => (
                    <tr key={tag.id} {...editableRowProps(() => { setEditing({ ...tag }); setEditingView(null); setVersion((v) => v + 1); save.reset(); })}>
                      <td>{tag.name}</td>
                      <td><code>{tag.code}</code></td>
                      {(canUpdate || canDelete) && <td>
                        <div className="management-actions">
                          {canUpdate && <button
                            className="button secondary"
                            type="button"
                            onClick={() => {
                              setEditing({ ...tag });
                              setEditingView(null);
                              setVersion((v) => v + 1);
                              save.reset();
                            }}
                          >
                            Düzenle
                          </button>}
                          {canDelete && <button
                            className="button management-danger"
                            disabled={remove.isPending}
                            onClick={() => setDeleteTarget(tag)}
                          >
                            Sil
                          </button>}
                        </div>
                      </td>}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <Pagination
            pagination={list.data?.pagination}
            onChange={list.setPage}
            alwaysVisible
          />
        </section>
        {(editing || editingView ? canUpdate : canCreate) && <section className="management-panel">
          <h2>{editing || editingView ? "Etiketi düzenle" : "Etiket oluştur"}</h2>
          <form key={version} className="management-form" onSubmit={submit}>
            <label>
              <span className="field-label">Etiket adı</span>
              <input
                required
                minLength={2}
                maxLength={50}
                name="name"
                defaultValue={editingView?.name ?? editing?.name}
              />
            </label>
            <label>
              <span className="field-label">Sistem kodu</span>
              <input required readOnly={Boolean(editingView)} pattern="[A-Z0-9_]+" maxLength={40} name="code" defaultValue={editingView?.code ?? editing?.code} placeholder="EMAIL" />
            </label>
            <ErrorMessage error={save.error} />
            <FormActions
              pending={save.isPending}
              onCancel={editing || editingView ? reset : undefined}
              submitLabel={editing || editingView ? "Güncelle" : "Kaydet"}
            />
          </form>
        </section>}
        {deleteTarget && <div className="confirm-backdrop" role="presentation"><form className="confirm-modal" role="dialog" aria-modal="true" aria-label="Etiket silme onayı" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}><button className="confirm-close" type="button" onClick={() => setDeleteTarget(null)} aria-label="Kapat">×</button><h2>Etiketi sil</h2><p><strong>{deleteTarget.name}</strong> etiketini silmek istediğinize emin misiniz? Görüşmelerdeki etiket bağlantıları da kaldırılır.</p><div className="confirm-actions"><button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>Vazgeç</button><button className="button danger" type="submit" autoFocus disabled={remove.isPending}>{remove.isPending ? "Siliniyor…" : "Etiketi sil"}</button></div></form></div>}
      </div> : <OptionSection kind={section === "statuses" ? "status" : "priority"} />}
    </main>
  );
}

type ManagedOption = { id: string; code: string; name: string; color: string; isActive: boolean };
function OptionSection({ kind }: { kind: "status" | "priority" }) {
  const { user } = useAuth();
  const canCreate = hasPermission(user, "tags.create");
  const canUpdate = hasPermission(user, "tags.update");
  const canDelete = hasPermission(user, "tags.delete");
  const isStatus = kind === "status";
  const basePath = isStatus ? "/status-options" : "/priority-options";
  const title = isStatus ? "Durumlar" : "Öncelikler";
  const defaultColors: Record<string, string> = isStatus
    ? { OPEN: "#2f8f73", PENDING: "#d49a2a", IN_PROGRESS: "#3b82c4", RESOLVED: "#398571", CLOSED: "#78848a" }
    : { LOW: "#3b82c4", NORMAL: "#78848a", HIGH: "#dd7a2d", URGENT: "#c94b4b" };
  const displayColor = (item: ManagedOption) => item.color === (isStatus ? "#398571" : "#64748b") ? (defaultColors[item.code] ?? item.color) : item.color;
  const list = useList<ManagedOption>(basePath);
  const [editing, setEditing] = useState<ManagedOption | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedOption | null>(null);
  const [version, setVersion] = useState(0);
  function reset() { setEditing(null); setVersion((value) => value + 1); }
  const save = useSave(basePath, reset, [basePath]);
  const remove = useDelete(basePath, [basePath, "conversations"]);
  function submit(event: FormEvent<HTMLFormElement>) {
    const form = formValues(event);
    save.mutate({ id: editing?.id, data: { code: form.get("code"), name: form.get("name"), color: form.get("color"), isActive: true } });
  }
  return <div className="management-grid">
    <section className="management-panel">
      <Search value={list.search} onChange={list.setSearch} label={`${title} içinde ara`} limit={list.limit} onLimitChange={list.setLimit} />
      <ErrorMessage error={remove.error} />
      <ListState loading={list.isPending} error={list.error} empty={!list.data?.data.length} />
    {!!list.data?.data.length && <div className="management-table-wrap"><table className="management-table"><thead><tr><th>{title.slice(0, -1)}</th><th>Kod</th>{(canUpdate || canDelete) && <th>İşlemler</th>}</tr></thead><tbody>{list.data.data.map((item) => <tr key={item.id} {...editableRowProps(() => { setEditing(item); setVersion((value) => value + 1); save.reset(); })}><td><span className="management-swatch" style={{ backgroundColor: displayColor(item) }} />{item.name}</td><td><code>{item.code}</code></td>{(canUpdate || canDelete) && <td><div className="management-actions">{canUpdate && <button className="button secondary" onClick={() => { setEditing(item); setVersion((value) => value + 1); save.reset(); }}>Düzenle</button>}{canDelete && <button className="button management-danger" disabled={remove.isPending} onClick={() => setDeleteTarget(item)}>Sil</button>}</div></td>}</tr>)}</tbody></table></div>}
      <Pagination pagination={list.data?.pagination} onChange={list.setPage} alwaysVisible />
    </section>
    {(editing ? canUpdate : canCreate) && <section className="management-panel"><h2>{editing ? `${title.slice(0, -1)} düzenle` : `${title.slice(0, -1)} ekle`}</h2><form key={version} className="management-form" onSubmit={submit}><label><span className="field-label">Görünen ad</span><input required minLength={1} maxLength={60} name="name" defaultValue={editing?.name} placeholder={isStatus ? "Beklemede" : "Yüksek"} /></label><label><span className="field-label">Sistem kodu</span><input required pattern="[A-Z0-9_]+" maxLength={40} name="code" defaultValue={editing?.code} placeholder={isStatus ? "WAITING" : "IMPORTANT"} /></label><label><span className="field-label">Renk</span><input name="color" type="color" defaultValue={editing?.color ?? (isStatus ? "#398571" : "#64748b")} /></label><ErrorMessage error={save.error} /><FormActions pending={save.isPending} onCancel={editing ? reset : undefined} /></form></section>}
    {deleteTarget && <div className="confirm-backdrop" role="presentation"><form className="confirm-modal" role="dialog" aria-modal="true" aria-label={`${title.slice(0, -1)} silme onayı`} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}><button className="confirm-close" type="button" onClick={() => setDeleteTarget(null)} aria-label="Kapat">×</button><h2>{title.slice(0, -1)} sil</h2><p><strong>{deleteTarget.name}</strong> kaydını silmek istediğinize emin misiniz?</p><div className="confirm-actions"><button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>Vazgeç</button><button className="button danger" type="submit" autoFocus disabled={remove.isPending}>{remove.isPending ? "Siliniyor…" : "Sil"}</button></div></form></div>}
  </div>;
}

export function WebsitesPage() {
  const navigate = useNavigate();
  const { user } = useAuth();
  const canCreate = hasPermission(user, "websites.create");
  const canUpdate = hasPermission(user, "websites.update");
  const canDelete = hasPermission(user, "websites.delete");
  const canAddGuideFiles = hasPermission(user, "guide.create");
  const canDeleteGuideFiles = hasPermission(user, "guide.delete");
  const client = useQueryClient();
  const list = useList<Website>("/websites");
  const [editing, setEditing] = useState<Website | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Website | null>(null);
  const [previewProject, setPreviewProject] = useState<Website | null>(null);
  const [guideFiles, setGuideFiles] = useState<File[]>([]);
  const [fileError, setFileError] = useState("");
  const [version, setVersion] = useState(0);
  function reset() { setEditing(null); setGuideFiles([]); setFileError(""); setVersion((value) => value + 1); }
  const save = useMutation({
    mutationFn: async ({ id, name, url, files }: { id?: string; name: string; url: string; files: File[] }) => {
      const response = id ? await api.patch(`/websites/${id}`, { name, url }) : await api.post("/websites", { name, url, isActive: true });
      const websiteId = response.data.data.id as string;
      if (files.length) {
        const data = new FormData();
        files.forEach(file => data.append("files", file));
        try { await api.post(`/websites/${websiteId}/guide-files`, data); }
        catch (error) { if (!id) await api.delete(`/websites/${websiteId}`).catch(() => undefined); throw error; }
      }
      return response.data.data as Website;
    },
    onSuccess: async () => { await client.invalidateQueries({ queryKey: ["/websites"] }); reset(); },
    onError: async () => { await client.invalidateQueries({ queryKey: ["/websites"] }); },
  });
  const changeStatus = useSave("/websites", undefined, ["websites"]);
  const remove = useDelete("/websites", ["websites"]);
  function submit(event: FormEvent<HTMLFormElement>) {
    const form = formValues(event);
    save.mutate({ id: editing?.id, name: String(form.get("name") ?? ""), url: String(form.get("url") ?? ""), files: guideFiles });
  }
  return <main className="page">
    <Heading title="Projeler" description="Talep açarken seçilebilecek projeleri ve URL adreslerini yönetin." />
    <div className="management-grid">
      <section className="management-panel">
        <Search value={list.search} onChange={list.setSearch} label="Proje ara" limit={list.limit} onLimitChange={list.setLimit} />
        <ErrorMessage error={remove.error} />
        <ListState loading={list.isPending} error={list.error} empty={!list.data?.data.length} />
        {!!list.data?.data.length && <div className="management-table-wrap"><table className="management-table"><thead><tr><th>Ad</th><th>URL</th>{canUpdate && <th>Durum</th>}<th>İşlemler</th></tr></thead><tbody>{list.data.data.map((site) => <tr key={site.id} {...editableRowProps(() => { setEditing(site); setGuideFiles([]); setFileError(""); setVersion((value) => value + 1); save.reset(); })} className={!site.isActive ? "inactive-record management-editable-row" : "management-editable-row"}><td><strong>{site.name}</strong></td><td><a href={site.url} target="_blank" rel="noreferrer">{site.url}</a></td>{canUpdate && <td><label className="switch"><input type="checkbox" checked={site.isActive} disabled={changeStatus.isPending} onChange={(event) => changeStatus.mutate({ id: site.id, data: { isActive: event.target.checked } })} /><span /></label><small>{site.isActive ? "Aktif" : "Pasif"}</small></td>}<td><div className="management-actions">{canUpdate && <button className="icon-button" type="button" aria-label={`${site.name} düzenle`} title="Düzenle" onClick={() => { setEditing(site); setGuideFiles([]); setFileError(""); setVersion((value) => value + 1); save.reset(); }}><Pencil size={15} aria-hidden="true" /></button>}<button className={`icon-button ${site.guideFileCount ? "" : "is-muted"}`} type="button" aria-label={`${site.name} rehberini gör`} title={site.guideFileCount ? "Rehber dosyasını gör" : "Rehber dosyası yok"} disabled={!site.guideFileCount} onClick={() => setPreviewProject(site)}><Eye size={15} aria-hidden="true" /></button>{canDelete && <button className="icon-button danger-icon" type="button" aria-label={`${site.name} sil`} title="Sil" disabled={remove.isPending} onClick={() => setDeleteTarget(site)}><Trash2 size={15} aria-hidden="true" /></button>}</div></td></tr>)}</tbody></table></div>}
        <Pagination pagination={list.data?.pagination} onChange={list.setPage} alwaysVisible />
      </section>
      {(editing ? canUpdate : canCreate) && <section className="management-panel">
        <h2>{editing ? "Projeyi düzenle" : "Proje ekle"}</h2>
        <form key={version} className="management-form" onSubmit={submit}>
          <label><span className="field-label">Proje adı</span><input name="name" required minLength={2} maxLength={100} defaultValue={editing?.name} /></label>
          <label><span className="field-label">URL</span><input name="url" type="url" required maxLength={500} placeholder="https://ornek.com" defaultValue={editing?.url} /></label>
          <div className="customer-form-upload">
          <label className="project-guide-upload-trigger">
            <span className="field-label">Dosya ekle</span>
            <input name="guideFiles" type="file" aria-label="Dosya seçin" aria-describedby="project-guide-size-hint" multiple disabled={save.isPending || !canAddGuideFiles} accept=".pdf,.jpg,.jpeg,.png,.webp" onChange={event => {
              const selected = Array.from(event.target.files ?? []);
              if (selected.some(file => file.size > 25 * 1024 * 1024)) {
                setFileError("Dosya başına en fazla 25 MB yüklenebilir.");
              } else { setGuideFiles(selected); setFileError(""); }
              event.target.value = "";
            }} />
          </label>
          </div>
          <p className="field-warning" id="project-guide-size-hint"><span className="field-warning-icon" aria-hidden="true">!</span><span>Dosya başına en fazla 25 MB yüklenebilir.</span></p>
          {canAddGuideFiles && <ComposerFiles files={guideFiles} setFiles={setGuideFiles} disabled={save.isPending} />}
          {fileError && <p className="error" role="alert">{fileError}</p>}
          <ErrorMessage error={save.error} />
          <FormActions pending={save.isPending} onCancel={editing ? reset : undefined} />
        </form>
      </section>}
    </div>
    {deleteTarget && <DeleteModal title="Projeyi sil" pending={remove.isPending} onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate(deleteTarget.id, { onSuccess: () => { if (editing?.id === deleteTarget.id) reset(); setDeleteTarget(null); } })} error={<ErrorMessage error={remove.error} />}><p><strong>{deleteTarget.name}</strong> projesi ve bağlı rehber dosyaları silinecek.</p></DeleteModal>}
    {previewProject && <ProjectGuideFileModal websiteId={previewProject.id} projectName={previewProject.name} canManage={canDeleteGuideFiles} onClose={() => setPreviewProject(null)} />}
  </main>;
}

export function SavedRepliesPage() {
  const [params, setParams] = useSearchParams();
  const templates = params.get("tab") === "templates";
  return <main className="page">
    <Heading title={templates ? "Hazır şablonlar" : "Hazır yanıtlar"} description={templates ? "Duyuru şablonlarını yönetin; eklediğiniz şablonları duyuru ekranında kullanın." : "Sık kullanılan yanıtları ekibinizle paylaşın; görüşme içinde seçip düzenleyerek gönderin."} />
    <nav className="catalog-tabs saved-content-tabs" role="tablist" aria-label="Hazır içerikler" onKeyDown={event => {
      if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
      event.preventDefault();
      const next = event.key === "Home" ? false : event.key === "End" ? true : !templates;
      setParams({ tab: next ? "templates" : "replies" });
      event.currentTarget.querySelectorAll<HTMLButtonElement>("button")[next ? 1 : 0]?.focus();
    }}>
      <button type="button" role="tab" tabIndex={templates ? -1 : 0} aria-selected={!templates} aria-controls="saved-content-panel" className={!templates ? "active" : ""} onClick={() => setParams({ tab: "replies" })}>Hazır yanıtlar</button>
      <button type="button" role="tab" tabIndex={templates ? 0 : -1} aria-selected={templates} aria-controls="saved-content-panel" className={templates ? "active" : ""} onClick={() => setParams({ tab: "templates" })}>Hazır şablonlar</button>
    </nav>
    <div id="saved-content-panel" role="tabpanel" aria-label={templates ? "Hazır şablonlar" : "Hazır yanıtlar"}>{templates ? <AnnouncementTemplates /> : <SavedRepliesContent />}</div>
  </main>;
}

function SavedRepliesContent() {
  const { user } = useAuth();
  const list = useList<SavedReply>("/saved-replies");
  const [editing, setEditing] = useState<SavedReply | null>(null);
  const [deleting, setDeleting] = useState<SavedReply | null>(null);
  const [version, setVersion] = useState(0);
  function reset() {
    setEditing(null);
    setVersion((v) => v + 1);
  }
  const save = useSave("/saved-replies", reset, ["saved-replies"]);
  const remove = useDelete("/saved-replies", ["saved-replies"]);
  function submit(event: FormEvent<HTMLFormElement>) {
    const form = formValues(event);
    save.mutate({
      id: editing?.id,
      data: { title: form.get("title"), body: form.get("body") },
    });
  }
  return (
    <>
      <div className="management-grid">
        <section className="management-panel">
          <Search value={list.search} onChange={list.setSearch} />
          <ErrorMessage error={remove.error} />
          <ListState
            loading={list.isPending}
            error={list.error}
            empty={!list.data?.data.length}
          />
          {!!list.data?.data.length && <div className="management-table-wrap saved-content-table-wrap">
            <table className="management-table saved-content-table" aria-label="Hazır yanıtlar">
              <thead><tr><th>Yanıt başlığı</th><th>Yanıt metni</th><th>Ekleyen</th><th>İşlemler</th></tr></thead>
              <tbody>{list.data.data.map((reply) => {
                const canEdit = user?.role === "ADMIN" || user?.id === reply.authorId;
                return <tr key={reply.id} {...editableRowProps(() => { setEditing(reply); setVersion((v) => v + 1); save.reset(); })}>
                  <td><strong>{reply.title}</strong></td>
                  <td><p className="saved-content-preview">{reply.body}</p></td>
                  <td>{reply.author?.name ?? "Ekip"}</td>
                  <td>{canEdit && <div className="management-actions">
                    <button className="button secondary saved-reply-action saved-reply-action-edit" type="button" aria-label={`${reply.title} düzenle`} title="Düzenle" onClick={() => { setEditing(reply); setVersion((v) => v + 1); save.reset(); }}><Pencil size={15} aria-hidden="true" /></button>
                    <button className="button management-danger saved-reply-action saved-reply-action-delete" type="button" aria-label={`${reply.title} sil`} title="Sil" disabled={remove.isPending} onClick={() => { remove.reset(); setDeleting(reply); }}><Trash2 size={15} aria-hidden="true" /></button>
                  </div>}</td>
                </tr>;
              })}</tbody>
            </table>
          </div>}
          <Pagination
            pagination={list.data?.pagination}
            onChange={list.setPage}
          />
        </section>
        <section className="management-panel">
          <h2>{editing ? "Yanıtı düzenle" : "Hazır yanıt oluştur"}</h2>
          <form key={version} className="management-form" onSubmit={submit}>
            <label>
              <span className="field-label">Başlık</span>
              <input
                name="title"
                required
                minLength={2}
                maxLength={100}
                defaultValue={editing?.title}
              />
            </label>
            <label>
              <span className="field-label">Yanıt metni</span>
              <textarea
                className="saved-reply-body"
                name="body"
                required
                minLength={1}
                maxLength={10000}
                rows={8}
                defaultValue={editing?.body}
              />
            </label>
            <ErrorMessage error={save.error} />
            <FormActions
              pending={save.isPending}
              onCancel={editing ? reset : undefined}
            />
          </form>
        </section>
      </div>
      {deleting && <DeleteModal title="Hazır yanıtı sil" pending={remove.isPending} onClose={() => setDeleting(null)} onConfirm={() => remove.mutate(deleting.id, { onSuccess: () => { if (editing?.id === deleting.id) reset(); setDeleting(null); } })} error={<ErrorMessage error={remove.error} />}><p><strong>{deleting.title}</strong> hazır yanıtı silinecek.</p></DeleteModal>}
    </>
  );
}
