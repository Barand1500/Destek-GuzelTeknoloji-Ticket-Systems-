import { useMemo, useState, type FormEvent } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2 } from "lucide-react";
import "./savedContent.css";
import { DeleteModal } from "../../components/DeleteModal";
import { api } from "../../services/api";
import type { Page } from "../../types";
import type { AnnouncementTemplate } from "../announcements/templates";
import {
  ErrorMessage,
  FormActions,
  ListState,
  Search,
  formValues,
  useDelete,
  useSave,
} from "./shared";

export function AnnouncementTemplates() {
  const [search, setSearch] = useState("");
  const [editing, setEditing] = useState<AnnouncementTemplate | null>(null);
  const [deleting, setDeleting] = useState<AnnouncementTemplate | null>(null);
  const [version, setVersion] = useState(0);
  const list = useQuery({
    queryKey: ["/announcement-templates", "manage"],
    queryFn: async () =>
      (
        await api.get<Page<AnnouncementTemplate>>("/announcement-templates", {
          params: { page: 1, limit: 100 },
        })
      ).data,
  });
  const templates = list.data?.data ?? [];
  const visible = useMemo(
    () =>
      templates.filter((item) =>
        `${item.label} ${item.title} ${item.body}`
          .toLocaleLowerCase("tr-TR")
          .includes(search.toLocaleLowerCase("tr-TR")),
      ),
    [templates, search],
  );
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
            value={search}
            onChange={setSearch}
            placeholder="Şablon adı veya içerik ara…"
          />
          <p className="muted">
            Bütün şablonları düzenleyebilir veya silebilirsiniz.
          </p>
          <ErrorMessage error={remove.error} />
          <ListState
            loading={list.isPending}
            error={list.error}
            empty={!visible.length}
          />
          <div className="management-notifications announcement-template-list">
            {visible.map((item) => {
              return (
                <article key={item.id} className="management-notification">
                  <div>
                    <strong>{item.label}</strong>
                    <p style={{ whiteSpace: "pre-wrap" }}>{item.body}</p>
                    <small>{item.title}</small>
                  </div>
                  <div className="management-actions announcement-template-actions">
                    <button
                      type="button"
                      className="button secondary saved-reply-action saved-reply-action-edit"
                      aria-label={`${item.label} şablonunu düzenle`}
                      title="Düzenle"
                      onClick={() => {
                        setEditing(item);
                        setVersion((value) => value + 1);
                        save.reset();
                      }}
                    >
                      <Pencil size={15} />
                    </button>
                    <button
                      type="button"
                      className="button management-danger saved-reply-action saved-reply-action-delete"
                      aria-label={`${item.label} şablonunu sil`}
                      title="Sil"
                      onClick={() => {
                        remove.reset();
                        setDeleting(item);
                      }}
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
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
              <small id="announcement-template-name-hint">
                {"{isim}"} gönderim sırasında alıcının adıyla değiştirilir.
              </small>
            </label>
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
