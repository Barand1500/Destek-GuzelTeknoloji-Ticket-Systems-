import { useState, type FormEvent } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../auth/Auth";
import { DeleteModal } from '../../components/DeleteModal';
import type { Department } from "../../types";
import {
  ErrorMessage,
  FormActions,
  Heading,
  ListState,
  Pagination,
  Search,
  formValues,
  useDelete,
  useList,
  useSave,
} from "./shared";

type ManagedDepartment = Department & { isActive: boolean };
type Tag = { id: string; name: string; code: string; color: string };
type Website = { id: string; name: string; url: string; isActive: boolean };
type SavedReply = {
  id: string;
  title: string;
  body: string;
  authorId: string;
  author?: { id: string; name: string };
};

export function DepartmentsPage() {
  const navigate = useNavigate();
  const list = useList<ManagedDepartment>("/departments", { includeInactive: true });
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
        title="Personeller"
        description="Görüşmeleri doğru ekibe yönlendirin, departman yapınızı düzenleyin."
      />
      <nav className="catalog-tabs" aria-label="Personel alanları"><button type="button" onClick={() => navigate("/admin/users")}>Kullanıcılar</button><button type="button" className="active">Departmanlar</button></nav>
      <div className="management-grid">
        <section className="management-panel">
          <Search value={list.search} onChange={list.setSearch} />
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
                    <th>Durum</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((item) => (
                    <tr key={item.id} className={!item.isActive ? "inactive-record" : undefined}>
                      <td>
                        <strong>{item.name}</strong>
                      </td>
                      <td>
                        <div className="status-toggle"><label className="switch"><input type="checkbox" role="switch" aria-label={`${item.name} aktif`} checked={item.isActive} disabled={changeStatus.isPending} onChange={() => changeStatus.mutate({ id: item.id, data: { isActive: !item.isActive } })} /><span /></label><span>{item.isActive ? 'Aktif' : 'Pasif'}</span></div>
                      </td>
                      <td>
                        <div className="management-actions">
                          <button
                            className="button secondary"
                            onClick={() => {
                              setEditing(item);
                              setVersion((v) => v + 1);
                              save.reset();
                            }}
                          >
                            Düzenle
                          </button>
                          <button
                            className="button management-danger"
                            disabled={remove.isPending}
                            onClick={() => { remove.reset(); setDeleteTarget(item); }}
                          >
                            Sil
                          </button>
                        </div>
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
        <section className="management-panel">
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
        </section>
      </div>
      {deleteTarget && <DeleteModal title="Departmanı sil" pending={remove.isPending} onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate(deleteTarget.id, { onSuccess: () => { if (editing?.id === deleteTarget.id) reset(); setDeleteTarget(null); } })} error={<ErrorMessage error={remove.error} />}><p><strong>{deleteTarget.name}</strong> listeden silinecek. Mevcut görüşmeler ve ekip erişimi korunur.</p></DeleteModal>}
    </main>
  );
}

export function TagsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const section = params.get("section") === "statuses" || params.get("section") === "priorities" ? params.get("section") : "tags";
  const list = useList<Tag>("/tags");
  const [editing, setEditing] = useState<Tag | null>(null);
  const [editingView, setEditingView] = useState<{ id: string; name: string; code: string } | null>(null);
  const [viewLabels, setViewLabels] = useState<Record<string, string>>({});
  const [hiddenViews, setHiddenViews] = useState<string[]>([]);
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
    { id: "view-mail", name: "Mail", code: "EMAIL", color: "#7c9b91", href: "/admin/conversations?view=all&category=EMAIL" },
    { id: "view-mine", name: "Bana atanan", code: "MINE", color: "#7c9b91", href: "/admin/conversations?view=mine&category=MINE" },
    { id: "view-unassigned", name: "Atanmamış", code: "UNASSIGNED", color: "#7c9b91", href: "/admin/conversations?view=unassigned&category=UNASSIGNED" },
  ].filter((view) => !hiddenViews.includes(view.id)).map((view) => ({ ...view, name: viewLabels[view.code] ?? view.name }));
  function selectSection(value: "tags" | "statuses" | "priorities") {
    if (value === "tags") setParams({});
    else setParams({ section: value });
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    const form = formValues(event);
    if (editingView) {
      const key = editingView.code === "EMAIL" ? "mail" : editingView.code === "UNASSIGNED" ? "unassigned" : editingView.code === "MINE" ? "mine" : "all";
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
          <Search value={list.search} onChange={list.setSearch} />
          <ErrorMessage error={remove.error} />
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
                    <th>Görünen ad</th>
                    <th>Sistem kodu</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {inboxViews.map((view) => (
                    <tr key={view.id}>
                      <td>{view.name}</td>
                      <td><code>{view.code}</code></td>
                      <td><div className="management-actions"><button className="button secondary" type="button" onClick={() => { setEditing(null); setEditingView({ id: view.id, name: view.name, code: view.code }); setVersion((v) => v + 1); }}>Düzenle</button><button className="button management-danger" type="button" onClick={() => { const key = view.code === "EMAIL" ? "mail" : view.code === "UNASSIGNED" ? "unassigned" : view.code === "MINE" ? "mine" : "all"; try { const storageKey = `helpdesk-inbox-tabs-${user?.id}`; const saved = JSON.parse(window.localStorage.getItem(storageKey) ?? "{}"); window.localStorage.setItem(storageKey, JSON.stringify({ ...saved, enabled: { ...saved.enabled, [key]: false } })); } catch { /* local storage unavailable */ } setHiddenViews((current) => [...current, view.id]); if (editingView?.id === view.id) reset(); }}>Sil</button></div></td>
                    </tr>
                  ))}
                  {list.data.data.map((tag) => (
                    <tr key={tag.id}>
                      <td>{tag.name}</td>
                      <td><code>{tag.code}</code></td>
                      <td>
                        <div className="management-actions">
                          <button
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
                          </button>
                          <button
                            className="button management-danger"
                            disabled={remove.isPending}
                            onClick={() => setDeleteTarget(tag)}
                          >
                            Sil
                          </button>
                        </div>
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
        <section className="management-panel">
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
        </section>
        {deleteTarget && <div className="confirm-backdrop" role="presentation"><form className="confirm-modal" role="dialog" aria-modal="true" aria-label="Etiket silme onayı" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}><button className="confirm-close" type="button" onClick={() => setDeleteTarget(null)} aria-label="Kapat">×</button><h2>Etiketi sil</h2><p><strong>{deleteTarget.name}</strong> etiketini silmek istediğinize emin misiniz? Görüşmelerdeki etiket bağlantıları da kaldırılır.</p><div className="confirm-actions"><button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>Vazgeç</button><button className="button danger" type="submit" autoFocus disabled={remove.isPending}>{remove.isPending ? "Siliniyor…" : "Etiketi sil"}</button></div></form></div>}
      </div> : <OptionSection kind={section === "statuses" ? "status" : "priority"} />}
    </main>
  );
}

type ManagedOption = { id: string; code: string; name: string; color: string; isActive: boolean };
function OptionSection({ kind }: { kind: "status" | "priority" }) {
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
      <Search value={list.search} onChange={list.setSearch} label={`${title} içinde ara`} />
      <ErrorMessage error={remove.error} />
      <ListState loading={list.isPending} error={list.error} empty={!list.data?.data.length} />
      {!!list.data?.data.length && <div className="management-table-wrap"><table className="management-table"><thead><tr><th>{title.slice(0, -1)}</th><th>Kod</th><th>İşlemler</th></tr></thead><tbody>{list.data.data.map((item) => <tr key={item.id}><td><span className="management-swatch" style={{ backgroundColor: displayColor(item) }} />{item.name}</td><td><code>{item.code}</code></td><td><div className="management-actions"><button className="button secondary" onClick={() => { setEditing(item); setVersion((value) => value + 1); save.reset(); }}>Düzenle</button><button className="button management-danger" disabled={remove.isPending} onClick={() => setDeleteTarget(item)}>Sil</button></div></td></tr>)}</tbody></table></div>}
      <Pagination pagination={list.data?.pagination} onChange={list.setPage} />
    </section>
    <section className="management-panel"><h2>{editing ? `${title.slice(0, -1)} düzenle` : `${title.slice(0, -1)} ekle`}</h2><form key={version} className="management-form" onSubmit={submit}><label><span className="field-label">Görünen ad</span><input required minLength={1} maxLength={60} name="name" defaultValue={editing?.name} placeholder={isStatus ? "Beklemede" : "Yüksek"} /></label><label><span className="field-label">Sistem kodu</span><input required pattern="[A-Z0-9_]+" maxLength={40} name="code" defaultValue={editing?.code} placeholder={isStatus ? "WAITING" : "IMPORTANT"} /></label><label><span className="field-label">Renk</span><input name="color" type="color" defaultValue={editing?.color ?? (isStatus ? "#398571" : "#64748b")} /></label><ErrorMessage error={save.error} /><FormActions pending={save.isPending} onCancel={editing ? reset : undefined} /></form></section>
    {deleteTarget && <div className="confirm-backdrop" role="presentation"><form className="confirm-modal" role="dialog" aria-modal="true" aria-label={`${title.slice(0, -1)} silme onayı`} onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}><button className="confirm-close" type="button" onClick={() => setDeleteTarget(null)} aria-label="Kapat">×</button><h2>{title.slice(0, -1)} sil</h2><p><strong>{deleteTarget.name}</strong> kaydını silmek istediğinize emin misiniz?</p><div className="confirm-actions"><button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>Vazgeç</button><button className="button danger" type="submit" autoFocus disabled={remove.isPending}>{remove.isPending ? "Siliniyor…" : "Sil"}</button></div></form></div>}
  </div>;
}

export function WebsitesPage() {
  const list = useList<Website>("/websites");
  const [editing, setEditing] = useState<Website | null>(null);
  const [version, setVersion] = useState(0);
  function reset() { setEditing(null); setVersion((value) => value + 1); }
  const save = useSave("/websites", reset, ["websites"]);
  const changeStatus = useSave("/websites", undefined, ["websites"]);
  const remove = useDelete("/websites", ["websites"]);
  function submit(event: FormEvent<HTMLFormElement>) {
    const form = formValues(event);
    save.mutate({ id: editing?.id, data: { name: form.get("name"), url: form.get("url"), ...(editing ? {} : { isActive: true }) } });
  }
  return <main className="page">
    <Heading title="Web siteleri" description="Talep açarken seçilebilecek web sitelerini ve URL adreslerini yönetin." />
    <div className="management-grid">
      <section className="management-panel">
        <Search value={list.search} onChange={list.setSearch} label="Web sitesi ara" />
        <ErrorMessage error={remove.error} />
        <ListState loading={list.isPending} error={list.error} empty={!list.data?.data.length} />
        {!!list.data?.data.length && <div className="management-table-wrap"><table className="management-table"><thead><tr><th>Ad</th><th>URL</th><th>Durum</th><th>İşlemler</th></tr></thead><tbody>{list.data.data.map((site) => <tr key={site.id} className={!site.isActive ? "inactive-record" : undefined}><td><strong>{site.name}</strong></td><td><a href={site.url} target="_blank" rel="noreferrer">{site.url}</a></td><td><label className="switch"><input type="checkbox" checked={site.isActive} disabled={changeStatus.isPending} onChange={(event) => changeStatus.mutate({ id: site.id, data: { isActive: event.target.checked } })} /><span /></label><small>{site.isActive ? "Aktif" : "Pasif"}</small></td><td><div className="management-actions"><button className="button secondary" onClick={() => { setEditing(site); setVersion((value) => value + 1); save.reset(); }}>Düzenle</button><button className="button management-danger" disabled={remove.isPending} onClick={() => { if (window.confirm(`“${site.name}” web sitesi silinsin mi?`)) remove.mutate(site.id); }}>Sil</button></div></td></tr>)}</tbody></table></div>}
        <Pagination pagination={list.data?.pagination} onChange={list.setPage} />
      </section>
      <section className="management-panel">
        <h2>{editing ? "Web sitesini düzenle" : "Web sitesi ekle"}</h2>
        <form key={version} className="management-form" onSubmit={submit}>
          <label><span className="field-label">Web sitesi adı</span><input name="name" required minLength={2} maxLength={100} defaultValue={editing?.name} /></label>
          <label><span className="field-label">URL</span><input name="url" type="url" required maxLength={500} placeholder="https://ornek.com" defaultValue={editing?.url} /></label>
          <ErrorMessage error={save.error} />
          <FormActions pending={save.isPending} onCancel={editing ? reset : undefined} />
        </form>
      </section>
    </div>
  </main>;
}

export function SavedRepliesPage() {
  const { user } = useAuth();
  const list = useList<SavedReply>("/saved-replies");
  const [editing, setEditing] = useState<SavedReply | null>(null);
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
    <main className="page">
      <Heading
        title="Hazır yanıtlar"
        description="Sık kullanılan yanıtları ekibinizle paylaşın; görüşme içinde seçip düzenleyerek gönderin."
      />
      <div className="management-grid">
        <section className="management-panel">
          <Search value={list.search} onChange={list.setSearch} />
          <ErrorMessage error={remove.error} />
          <ListState
            loading={list.isPending}
            error={list.error}
            empty={!list.data?.data.length}
          />
          <div className="management-notifications">
            {list.data?.data.map((reply) => {
              const canEdit =
                user?.role === "ADMIN" || user?.id === reply.authorId;
              return (
                <article key={reply.id} className="management-notification">
                  <div>
                    <strong>{reply.title}</strong>
                    <p style={{ whiteSpace: "pre-wrap" }}>{reply.body}</p>
                    <small>{reply.author?.name ?? "Ekip"}</small>
                  </div>
                  {canEdit && (
                    <div className="management-actions">
                      <button
                        className="button secondary"
                        onClick={() => {
                          setEditing(reply);
                          setVersion((v) => v + 1);
                          save.reset();
                        }}
                      >
                        Düzenle
                      </button>
                      <button
                        className="button management-danger"
                        disabled={remove.isPending}
                        onClick={() => {
                          if (
                            window.confirm(
                              `“${reply.title}” hazır yanıtı silinsin mi?`,
                            )
                          )
                            remove.mutate(reply.id);
                        }}
                      >
                        Sil
                      </button>
                    </div>
                  )}
                </article>
              );
            })}
          </div>
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
    </main>
  );
}
