import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Trash2 } from "lucide-react";
import "./savedContent.css";
import { DeleteModal } from "../../components/DeleteModal";
import type { AnnouncementTemplate } from "../announcements/templates";
import {
  ErrorMessage,
  FormActions,
  ListState,
  Pagination,
  Search,
  editableRowProps,
  formValues,
  useDelete,
  useList,
  useSave,
} from "./shared";

export function AnnouncementTemplates() {
  const list = useList<AnnouncementTemplate>("/announcement-templates", { limit: 3 });
  const [editing, setEditing] = useState<AnnouncementTemplate | null>(null);
  const [deleting, setDeleting] = useState<AnnouncementTemplate | null>(null);
  const [version, setVersion] = useState(0);
  const visible = list.data?.data ?? [];
  useEffect(() => {
    if (list.isPlaceholderData || !list.data) return;
    const lastPage = Math.max(1, list.data.pagination.totalPages);
    if (list.page > lastPage) list.setPage(lastPage);
  }, [list.data, list.page, list.isPlaceholderData]);
  function reset() {
    setEditing(null);
    setVersion((value) => value + 1);
  }
  const save = useSave("/announcement-templates", reset, [
    "/announcement-templates",
  ]);
  const remove = useDelete("/announcement-templates", [
    "/announcement-templates",
  ]);
  function submit(event: FormEvent<HTMLFormElement>) {
    const form = formValues(event);
    save.mutate({
      id: editing?.id,
      data: {
        label: form.get("label"),
        title: form.get("title"),
        body: form.get("body"),
      },
    });
  }
  return (
    <>
      <div className="management-grid">
        <section className="management-panel">
          <Search
            value={list.search}
            onChange={list.setSearch}
            placeholder="Şablon adı veya içerik ara…"
          />
          <ErrorMessage error={remove.error} />
          <ListState
            loading={list.isPending}
            error={list.error}
            empty={!visible.length}
          />
          {!!visible.length && <div className="management-table-wrap saved-content-table-wrap">
            <table className="management-table saved-content-table announcement-templates-table" aria-label="Hazır şablonlar">
              <thead><tr><th>Şablon adı</th><th>Duyuru başlığı</th><th>İçerik</th><th>İşlemler</th></tr></thead>
              <tbody>{visible.map((item) => <tr key={item.id} {...editableRowProps(() => { setEditing(item); setVersion((value) => value + 1); save.reset(); })}>
                <td><strong>{item.label}</strong></td>
                <td>{item.title}</td>
                <td><p className="saved-content-preview">{item.body}</p></td>
                <td><div className="management-actions announcement-template-actions">
                  <button type="button" className="button secondary saved-reply-action saved-reply-action-edit" aria-label={`${item.label} şablonunu düzenle`} title="Düzenle" onClick={() => { setEditing(item); setVersion((value) => value + 1); save.reset(); }}><Pencil size={15} /></button>
                  <button type="button" className="button management-danger saved-reply-action saved-reply-action-delete" aria-label={`${item.label} şablonunu sil`} title="Sil" onClick={() => { remove.reset(); setDeleting(item); }}><Trash2 size={15} /></button>
                </div></td>
              </tr>)}</tbody>
            </table>
          </div>}
          <Pagination pagination={list.data?.pagination} onChange={list.setPage} />
        </section>
        <section className="management-panel">
          <h2>{editing ? "Şablonu düzenle" : "Yeni şablon ekle"}</h2>
          <form key={version} className="management-form" onSubmit={submit}>
            <label>
              <span className="field-label">Şablon adı</span>
              <input
                name="label"
                defaultValue={editing?.label}
                required
                minLength={2}
                maxLength={80}
                placeholder="Örn. Bakım bilgilendirmesi"
              />
            </label>
            <label>
              <span className="field-label">Duyuru başlığı</span>
              <input
                name="title"
                defaultValue={editing?.title}
                required
                minLength={2}
                maxLength={180}
              />
            </label>
            <label>
              <span className="field-label">Duyuru içeriği</span>
              <textarea
                className="announcement-template-body"
                name="body"
                aria-label="Duyuru içeriği"
                aria-describedby="announcement-template-name-hint"
                defaultValue={editing?.body}
                required
                minLength={2}
                maxLength={10000}
                rows={6}
              />
            </label>
            <p className="field-warning" id="announcement-template-name-hint">
              <span className="field-warning-icon" aria-hidden="true">!</span>
              <span>{"{isim}"} gönderim sırasında alıcının adıyla değiştirilir.</span>
            </p>
            <ErrorMessage error={save.error} />
            <FormActions
              pending={save.isPending}
              onCancel={editing ? reset : undefined}
              submitLabel={editing ? "Değişiklikleri kaydet" : "Şablon ekle"}
            />
          </form>
        </section>
      </div>
      {deleting && (
        <DeleteModal
          title="Hazır şablonu sil"
          pending={remove.isPending}
          onClose={() => setDeleting(null)}
          onConfirm={() =>
            remove.mutate(deleting.id, {
              onSuccess: () => {
                if (editing?.id === deleting.id) reset();
                setDeleting(null);
              },
            })
          }
          error={<ErrorMessage error={remove.error} />}
        >
          <p>
            <strong>{deleting.label}</strong> şablonu silinecek.
          </p>
        </DeleteModal>
      )}
    </>
  );
}
