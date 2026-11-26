import { SortableTableHead, sortTableRows, useTableSort } from "../../components/TableSorting";
import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { api, errorText } from "../../services/api";
import { DropdownSelect } from "../../components/DropdownSelect";
import { DeleteModal } from "../../components/DeleteModal";
import { Heading, ListState, Pagination, Search } from "./shared";
import { usePageSize } from '../../components/usePageSize';
import { useAuth } from "../auth/Auth";
import { hasPermission } from "../auth/permissions";

export type SkillDefinition = {
  id: string;
  kind: "category" | "level" | "skill";
  name: string;
  categoryId: string | null;
  rank: number;
};
export type SkillCatalog = {
  categories: SkillDefinition[];
  levels: SkillDefinition[];
  skills: SkillDefinition[];
};
export function useSkillCatalog() {
  return useQuery({
    queryKey: ["skill-catalog"],
    queryFn: async () =>
      (await api.get<{ data: SkillCatalog }>("/skill-catalog")).data.data,
  });
}
const labels = {
  skill: "Yetenekler",
  category: "Kategoriler",
  level: "Seviyeler",
};
export function SkillsPage() {
  const { user } = useAuth();
  const catalog = useSkillCatalog();
  const [page, setPage] = useState(1);
  const sorting = useTableSort(() => setPage(1));
  const client = useQueryClient();
  const [kind, setKind] = useState<SkillDefinition["kind"]>("category");
  const [limit, setLimit] = usePageSize(`skill-catalog:${kind}`);
  const [editing, setEditing] = useState<SkillDefinition | null>(null);
  const [name, setName] = useState(""),
    [categoryId, setCategoryId] = useState(""),
    [rank, setRank] = useState("1"),
    [search, setSearch] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<SkillDefinition | null>(
    null,
  );
  const reset = () => {
    setEditing(null);
    setName("");
    setCategoryId("");
    setRank("1");
  };
  const save = useMutation({
    mutationFn: async () => {
      const data = {
        name,
        rank: Number(rank),
        ...(kind === "skill" ? { categoryId } : {}),
      };
      return editing
        ? api.patch(`/skill-catalog/${kind}/${editing.id}`, data)
        : api.post(`/skill-catalog/${kind}`, data);
    },
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["skill-catalog"] });
      reset();
    },
  });
  const remove = useMutation({
    mutationFn: (id: string) => api.delete(`/skill-catalog/${id}`),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["skill-catalog"] });
      setDeleteTarget(null);
      reset();
    },
  });
  const items =
    (kind === "skill"
      ? catalog.data?.skills
      : kind === "category"
        ? catalog.data?.categories
        : catalog.data?.levels) ?? [];
  const filtered = items.filter((item) =>
    item.name
      .toLocaleLowerCase("tr-TR")
      .includes(search.toLocaleLowerCase("tr-TR")),
  );
  const sorted = sortTableRows(filtered, sorting.sort, (item, field) => field === 'name' ? item.name : kind === 'skill' ? catalog.data?.categories.find(category => category.id === item.categoryId)?.name ?? '' : kind === 'level' ? item.rank : catalog.data?.skills.filter(skill => skill.categoryId === item.id).length ?? 0);
  const totalPages = Math.ceil(sorted.length / limit);
  const visible = sorted.slice((page - 1) * limit, page * limit);
  useEffect(() => { if (page > Math.max(1, totalPages)) setPage(Math.max(1, totalPages)); }, [page, totalPages]);
  const edit = (item: SkillDefinition) => {
    setEditing(item);
    setName(item.name);
    setCategoryId(item.categoryId ?? "");
    setRank(String(item.rank));
    save.reset();
  };
  const canSave = hasPermission(
    user,
    editing ? "skills.update" : "skills.create",
  );
  function submit(event: FormEvent) {
    event.preventDefault();
    if (canSave) save.mutate();
  }
  return (
    <main className="page skills-page">
      <Heading
        title="Yetenekler"
        description="Personel formunda seçilecek yetenekleri, kategorileri ve seviyeleri yönetin."
      />
      <nav className="catalog-tabs" aria-label="Yetenek Yönetimi Bölümleri">
        {(["category", "skill", "level"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            className={kind === tab ? "active" : ""}
            onClick={() => {
              setKind(tab);
              setPage(1);
              sorting.resetSort();
              setSearch("");
              reset();
              save.reset();
            }}
          >
            {labels[tab]}
          </button>
        ))}
      </nav>
      <div className="management-grid">
        <section className="management-panel">
          <Search
            label={`${labels[kind]} içinde ara`}
            value={search}
            onChange={value => { setSearch(value); setPage(1); }}
            limit={limit}
            onLimitChange={value => { setLimit(value); setPage(1); }}
          />
          <ListState
            loading={catalog.isPending}
            error={catalog.error}
            empty={!catalog.isPending && !catalog.error && !visible.length}
          />
          {!!visible.length && (
            <div className="management-table-wrap">
              <table className="management-table mobile-record-table">
<SortableTableHead sorting={sorting} columns={[{label:'Ad',field:'name'},{label:kind==='skill'?'Kategori':kind==='level'?'Sıra':'Yetenek Sayısı',field:'detail'},{label:'İşlemler'}]} />
                <tbody>
                  {visible.map((item) => (
                    <tr key={item.id}>
                      <td data-label="Ad">
                        <strong>{item.name}</strong>
                      </td>
                      <td data-label={kind === 'skill' ? 'Kategori' : kind === 'level' ? 'Sıra' : 'Yetenek Sayısı'}>
                        {kind === "skill"
                          ? catalog.data?.categories.find(
                              (category) => category.id === item.categoryId,
                            )?.name
                          : kind === "level"
                            ? item.rank
                            : catalog.data?.skills.filter(
                                (skill) => skill.categoryId === item.id,
                              ).length}
                      </td>
                      <td data-label="İşlemler">
                        <div className="management-actions">
                          {hasPermission(user, "skills.update") && (
                            <button
                              type="button"
                              className="icon-button"
                              aria-label={`${item.name} düzenle`}
                              onClick={() => edit(item)}
                            >
                              <Pencil size={15} />
                            </button>
                          )}
                          {hasPermission(user, "skills.delete") && (
                            <button
                              type="button"
                              className="icon-button danger-icon"
                              aria-label={`${item.name} sil`}
                              onClick={() => {
                                remove.reset();
                                setDeleteTarget(item);
                              }}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!catalog.isPending && !catalog.isError && <Pagination pagination={{ page, limit, total: sorted.length, totalPages }} onChange={setPage} alwaysVisible />}
        </section>
        {(hasPermission(user, "skills.create") || editing) && (
          <section className="management-panel">
            <h2>
              {editing
                ? "Tanımı Düzenle"
                : kind === "skill"
                  ? "Yetenek Ekle"
                  : kind === "category"
                    ? "Kategori Ekle"
                    : "Seviye Ekle"}
            </h2>
            <form className="management-form" onSubmit={submit}>
              <label>
                <span className="field-label">
                  {kind === "skill"
                    ? "Yetenek Adı"
                    : kind === "category"
                      ? "Kategori Adı"
                      : "Seviye Adı"}
                </span>
                <input
                  name="name"
                  required
                  maxLength={
                    kind === "level" ? 20 : kind === "category" ? 60 : 80
                  }
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                />
              </label>
              {kind === "skill" && (
                <DropdownSelect
                  label="Kategori"
                  ariaLabel="Yetenek Kategorisi"
                  value={categoryId}
                  onChange={setCategoryId}
                  options={[
                    { value: "", label: "Kategori Seçin" },
                    ...(catalog.data?.categories ?? []).map((item) => ({
                      value: item.id,
                      label: item.name,
                    })),
                  ]}
                />
              )}
              {kind === "level" && (
                <>
                  <DropdownSelect
                    label="Seviye Sırası"
                    ariaLabel="Seviye Sırası"
                    value={rank}
                    onChange={setRank}
                    options={Array.from({ length: 10 }, (_, index) => ({
                      value: String(index + 1),
                      label: String(index + 1),
                    }))}
                  />
                  <small className="muted">
                    Yüksek sıra, personel önerilerinde daha yüksek yetkinlik
                    olarak değerlendirilir.
                  </small>
                </>
              )}
              {kind === "skill" && !catalog.data?.categories.length && (
                <p className="muted">
                  Önce Kategoriler sekmesinden bir kategori ekleyin.
                </p>
              )}
              {save.error && (
                <p className="error" role="alert">
                  {errorText(save.error)}
                </p>
              )}
              <div className="management-actions">
                <button
                  className="button primary"
                  disabled={
                    save.isPending ||
                    !canSave ||
                    !name.trim() ||
                    (kind === "skill" && !categoryId)
                  }
                >
                  <Plus size={15} />
                  {save.isPending
                    ? "Kaydediliyor..."
                    : editing
                      ? "Kaydet"
                      : "Ekle"}
                </button>
                {editing && (
                  <button
                    type="button"
                    className="button secondary"
                    onClick={() => {
                      reset();
                      save.reset();
                    }}
                  >
                    Vazgeç
                  </button>
                )}
              </div>
            </form>
          </section>
        )}
      </div>
      {deleteTarget && (
        <DeleteModal
          title="Tanımı Sil"
          pending={remove.isPending}
          onClose={() => setDeleteTarget(null)}
          onConfirm={() => remove.mutate(deleteTarget.id)}
          error={
            remove.error ? (
              <p className="error">{errorText(remove.error)}</p>
            ) : null
          }
        >
          <p>
            {deleteTarget.name} silinecek. Personelde kullanılan tanımlar ve
            yetenek içeren kategoriler silinemez.
          </p>
        </DeleteModal>
      )}
    </main>
  );
}
