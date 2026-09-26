import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, Info, Pencil, Trash2, X } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../auth/Auth";
import {
  roles,
  type User,
  type Role,
  type Department,
  type Page,
  type Conversation,
  priorities,
} from "../../types";
import { DirectorySelect } from "../../components/DirectorySelect";
import { DropdownSelect } from "../../components/DropdownSelect";
import { SearchableDropdown } from "../../components/SearchableDropdown";
import { EmailInput } from "../../components/EmailInput";
import { DeleteModal } from '../../components/DeleteModal';
import { conversationPath } from "../../router/paths";
import { TagSelect, FormDropdown } from "../tickets/TicketExtras";
import {
  ErrorMessage,
  FormActions,
  Heading,
  ListState,
  Pagination,
  Search,
  formValues,
  useList,
  useSave,
  useDebouncedValue,
  useDelete,
} from "./shared";

import { inboxPath } from "../../router/paths";
type ManagedUser = User & {
  isActive: boolean;
  createdAt: string;
  departments: { departmentId: string; department: Department }[];
  extraPhones?: string | null; extraEmails?: string | null;
  customerFileCount?: number;
};
type CustomerFile = { id: string; originalName: string; mimeType: string; size: number; createdAt: string };
const formatFileSize = (size: number) => size < 1024 ? `${size} B` : size < 1024 * 1024 ? `${Math.ceil(size / 1024)} KB` : `${(size / (1024 * 1024)).toFixed(1)} MB`;
function CustomerFileRow({ customerId, file, onDelete }: { customerId: string; file: CustomerFile; onDelete: () => void }) {
  const isImage = file.mimeType.startsWith('image/');
  const preview = useQuery({ queryKey: ['/customers', customerId, 'file-preview', file.id], enabled: isImage, queryFn: async () => (await api.get(`/customers/${customerId}/files/${file.id}/download`, { responseType: 'blob' })).data });
  const [previewUrl, setPreviewUrl] = useState<string>();
  useEffect(() => { if (!preview.data) return; const url = URL.createObjectURL(preview.data); setPreviewUrl(url); return () => URL.revokeObjectURL(url); }, [preview.data]);
  const triggerDownload = (blob: Blob) => { const url = URL.createObjectURL(blob); const link = document.createElement('a'); link.href = url; link.download = file.originalName; link.style.display = 'none'; document.body.appendChild(link); link.click(); window.setTimeout(() => { link.remove(); URL.revokeObjectURL(url); }, 1000); };
  const download = () => { if (preview.data) { triggerDownload(preview.data); return; } void (async () => { const response = await api.get(`/customers/${customerId}/files/${file.id}/download`, { responseType: 'blob' }); triggerDownload(response.data); })(); };
  return <div className="customer-file-row"><div className="customer-file-main">{isImage && previewUrl ? <img className="customer-file-preview" src={previewUrl} alt="" /> : <span className="customer-file-placeholder">{isImage ? 'IMG' : 'FILE'}</span>}<div><button className="customer-file-name" type="button" onClick={download}>{file.originalName}</button><small>{file.mimeType} · {formatFileSize(file.size)}</small><button className="customer-file-delete" type="button" onClick={onDelete}>Dosyayı sil</button></div></div></div>;
}
type ManagedDepartment = Department & { isActive: boolean };
const phoneDigits = (value: string) => value.replace(/\D/g, "");
const isPhoneSearch = (value: string) => Boolean(value.trim()) && /^[+\d\s()-]+$/.test(value);
const isEmailSearch = (value: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
const formatPhone = (value: string) => {
  let digits = phoneDigits(value);
  if (digits.startsWith("90") && digits.length > 2) digits = `0${digits.slice(2)}`;
  else if (digits && digits[0] !== "0") digits = `0${digits}`;
  digits = digits.slice(0, 11);
  if (digits.length <= 4) return digits;
  const groups = [digits.slice(0, 4), digits.slice(4, 7), digits.slice(7, 9), digits.slice(9, 11)].filter(Boolean);
  return groups.join(" ");
};
const placeKey = (value: string) => value.toLocaleLowerCase("tr-TR").replace(/ı/g, "i").normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/ş/g, "s").replace(/ğ/g, "g").replace(/ç/g, "c").replace(/ö/g, "o").replace(/ü/g, "u");

const turkeyCities = ["Adana", "Adıyaman", "Afyonkarahisar", "Ağrı", "Amasya", "Ankara", "Antalya", "Artvin", "Aydın", "Balıkesir", "Bilecik", "Bingöl", "Bitlis", "Bolu", "Burdur", "Bursa", "Çanakkale", "Çankırı", "Çorum", "Denizli", "Diyarbakır", "Edirne", "Elazığ", "Erzincan", "Erzurum", "Eskişehir", "Gaziantep", "Giresun", "Gümüşhane", "Hakkâri", "Hatay", "Isparta", "Mersin", "İstanbul", "İzmir", "Kars", "Kastamonu", "Kayseri", "Kırklareli", "Kırşehir", "Kocaeli", "Konya", "Kütahya", "Malatya", "Manisa", "Kahramanmaraş", "Mardin", "Muğla", "Muş", "Nevşehir", "Niğde", "Ordu", "Rize", "Sakarya", "Samsun", "Siirt", "Sinop", "Sivas", "Tekirdağ", "Tokat", "Trabzon", "Tunceli", "Şanlıurfa", "Uşak", "Van", "Yozgat", "Zonguldak", "Aksaray", "Bayburt", "Karaman", "Kırıkkale", "Batman", "Şırnak", "Bartın", "Ardahan", "Iğdır", "Yalova", "Karabük", "Kilis", "Osmaniye", "Düzce"];
const turkeyDistricts: Record<string, string[]> = {
  "Adana": ["Aladağ", "Ceyhan", "Çukurova", "Feke", "İmamoğlu", "Karaisalı", "Karataş", "Kozan", "Pozantı", "Saimbeyli", "Sarıçam", "Seyhan", "Tufanbeyli", "Yumurtalık", "Yüreğir"],
  "Ankara": ["Akyurt", "Altındağ", "Ayaş", "Bala", "Beypazarı", "Çamlıdere", "Çankaya", "Çubuk", "Elmadağ", "Etimesgut", "Evren", "Gölbaşı", "Güdül", "Haymana", "Kalecik", "Kahramankazan", "Keçiören", "Kızılcahamam", "Mamak", "Nallıhan", "Polatlı", "Pursaklar", "Sincan", "Şereflikoçhisar", "Yenimahalle"],
  "Antalya": ["Akseki", "Aksu", "Alanya", "Demre", "Döşemealtı", "Elmalı", "Finike", "Gazipaşa", "Gündoğmuş", "İbradı", "Kaş", "Kemer", "Kepez", "Konyaaltı", "Korkuteli", "Kumluca", "Manavgat", "Muratpaşa", "Serik"],
  "Bursa": ["Büyükorhan", "Gemlik", "Gürsu", "Harmancık", "İnegöl", "İznik", "Karacabey", "Keles", "Kestel", "Mudanya", "Mustafakemalpaşa", "Nilüfer", "Orhaneli", "Orhangazi", "Osmangazi", "Yenişehir", "Yıldırım"],
  "Gaziantep": ["Araban", "İslahiye", "Karkamış", "Nizip", "Nurdağı", "Oğuzeli", "Şahinbey", "Şehitkamil", "Yavuzeli"],
  "İstanbul": ["Adalar", "Arnavutköy", "Ataşehir", "Avcılar", "Bağcılar", "Bahçelievler", "Bakırköy", "Başakşehir", "Bayrampaşa", "Beşiktaş", "Beykoz", "Beylikdüzü", "Beyoğlu", "Büyükçekmece", "Çatalca", "Çekmeköy", "Esenler", "Esenyurt", "Eyüpsultan", "Fatih", "Gaziosmanpaşa", "Güngören", "Kadıköy", "Kağıthane", "Kartal", "Küçükçekmece", "Maltepe", "Pendik", "Sancaktepe", "Sarıyer", "Silivri", "Sultanbeyli", "Sultangazi", "Şile", "Şişli", "Tuzla", "Ümraniye", "Üsküdar", "Zeytinburnu"],
  "İzmir": ["Aliağa", "Balçova", "Bayındır", "Bayraklı", "Bergama", "Beydağ", "Bornova", "Buca", "Çeşme", "Çiğli", "Dikili", "Foça", "Gaziemir", "Güzelbahçe", "Karabağlar", "Karaburun", "Karşıyaka", "Kemalpaşa", "Kınık", "Kiraz", "Konak", "Menderes", "Menemen", "Narlıdere", "Ödemiş", "Seferihisar", "Selçuk", "Tire", "Torbalı", "Urla"],
  "Kocaeli": ["Başiskele", "Çayırova", "Darica", "Derince", "Dilovası", "Gebze", "Gölcük", "İzmit", "Kandıra", "Karamürsel", "Kartepe", "Körfez"],
  "Konya": ["Ahırlı", "Akören", "Akşehir", "Altınekin", "Beyşehir", "Bozkır", "Cihanbeyli", "Çeltik", "Çumra", "Derbent", "Derebucak", "Doğanhisar", "Emirgazi", "Ereğli", "Güneysınır", "Hadim", "Halkapınar", "Hüyük", "Ilgın", "Kadınhanı", "Karapınar", "Karatay", "Kulu", "Meram", "Sarayönü", "Selçuklu", "Seydişehir", "Taşkent", "Tuzlukçu", "Yalıhüyük", "Yunak"],
  "Mersin": ["Akdeniz", "Anamur", "Aydıncık", "Bozyazı", "Çamlıyayla", "Erdemli", "Gülnar", "Mezitli", "Mut", "Silifke", "Tarsus", "Toroslar", "Yenişehir"],
  "Muğla": ["Bodrum", "Dalaman", "Datça", "Fethiye", "Kavaklıdere", "Köyceğiz", "Marmaris", "Menteşe", "Milas", "Ortaca", "Seydikemer", "Ula", "Yatağan"],
  "Sakarya": ["Adapazarı", "Akyazı", "Arifiye", "Erenler", "Ferizli", "Geyve", "Hendek", "Karapürçek", "Karasu", "Kaynarca", "Kocaali", "Pamukova", "Sapanca", "Serdivan", "Söğütlü", "Taraklı"],
  "Samsun": ["Alaçam", "Asarcık", "Atakum", "Ayvacık", "Bafra", "Canik", "Çarşamba", "Havza", "İlkadım", "Kavak", "Ladik", "19 Mayıs", "Salıpazarı", "Tekkeköy", "Terme", "Vezirköprü", "Yakakent"],
};

function LocationFields({ city = "", district = "", idPrefix }: { city?: string | null; district?: string | null; idPrefix: string }) {
  const [cityValue, setCityValue] = useState(city ?? "");
  const [districtValue, setDistrictValue] = useState(district ?? "");
  const selectedCity = turkeyCities.find((item) => item.localeCompare(cityValue, "tr", { sensitivity: "base" }) === 0) ?? cityValue;
  const districtDirectory = useQuery({
    queryKey: ["turkey-district-directory"],
    staleTime: Infinity,
    queryFn: async () => {
      const response = await fetch("https://raw.githubusercontent.com/open-admin-data/turkey-administrative-divisions/refs/heads/master/data/all-flat.json");
      if (!response.ok) throw new Error("İlçe listesi yüklenemedi.");
      const payload = await response.json() as { data: Array<{ level: number; name: { local: string }; parent: { name: { local: string } } | null }> };
      return payload.data.filter((item) => item.level === 2 && item.parent).reduce<Record<string, string[]>>((all, item) => {
        const province = item.parent!.name.local;
        (all[province] ??= []).push(item.name.local);
        return all;
      }, {});
    },
  });
  const remoteCity = Object.keys(districtDirectory.data ?? {}).find((item) => placeKey(item) === placeKey(selectedCity));
  const districts = (remoteCity ? districtDirectory.data?.[remoteCity] : undefined) ?? turkeyDistricts[selectedCity] ?? [];
  return <>
    <div className="phone-request-city"><SearchableDropdown label="İl" name="addressCity" value={cityValue} options={turkeyCities.map((item) => ({ value: item, label: item }))} onChange={(value) => { setCityValue(value); if (value !== selectedCity) setDistrictValue(""); }} /></div>
    <div className="phone-request-district"><SearchableDropdown label="İlçe" name="addressDistrict" value={districtValue} options={districts.map((item) => ({ value: item, label: item }))} onChange={setDistrictValue} disabled={!cityValue} placeholder={cityValue ? "İlçe ara" : "Önce il seçin"} /></div>
  </>;
}

type Website = { id: string; name: string; url: string; isActive: boolean };
function PhoneRequestFields({ departmentId, setDepartmentId, websiteId, setWebsiteId, assignedAgentId, setAssignedAgentId, customer }: { departmentId: string; setDepartmentId: (value: string) => void; websiteId: string; setWebsiteId: (value: string) => void; assignedAgentId: string; setAssignedAgentId: (value: string) => void; customer?: ManagedUser | null }) {
  const websites = useQuery({ queryKey: ["websites", "phone-request"], queryFn: async () => (await api.get<Page<Website>>("/websites", { params: { limit: 100 } })).data });
  const agents = useQuery({ queryKey: ["department-agents", departmentId], enabled: Boolean(departmentId), queryFn: async () => (await api.get<Page<{ id: string; name: string }>>(`/departments/${departmentId}/agents`, { params: { limit: 100 } })).data });
  return <>
    {customer && <label className="phone-request-selected"><span className="field-label">Seçilen kişi</span><input readOnly value={customer.name} /></label>}
    <div className="phone-request-grid">
      <div className="phone-request-web"><input type="hidden" name="websiteId" value={websiteId} /><DropdownSelect label="Proje" value={websiteId} onChange={setWebsiteId} ariaLabel="Proje seçin" options={[{ value: "", label: "Proje seçin" }, ...(websites.data?.data ?? []).filter((site) => site.isActive).map((site) => ({ value: site.id, label: site.name }))]} /></div>
      <label className="phone-request-subject"><span className="field-label">Konu</span><input name="subject" required minLength={5} maxLength={200} autoFocus={Boolean(customer)} /></label>
      <label className="phone-request-message"><span className="field-label">Açıklama</span><textarea name="message" required maxLength={10000} rows={4} placeholder="Örn. Ödeme ekranında hata alıyor; hata mesajı: …" /></label>
      <div className="phone-request-department"><DirectorySelect endpoint="/departments" label="Departman" value={departmentId} onChange={(value) => { setDepartmentId(value); setAssignedAgentId(""); }} /></div>
      <div className="phone-request-assignee"><input type="hidden" name="assignedAgentId" value={assignedAgentId} /><DropdownSelect label="Atanan personel" value={assignedAgentId} onChange={setAssignedAgentId} ariaLabel="Atanan personeli seçin" options={[{ value: "", label: departmentId ? "Atanmamış" : "Önce departman seçin" }, ...(agents.data?.data ?? []).map((agent) => ({ value: agent.id, label: agent.name }))]} /></div>
    </div>
  </>;
}

export function UsersPage({ defaultRole }: { defaultRole?: Role }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [roleInfoOpen, setRoleInfoOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const remove = useDelete('/users', ['/customers']);
  const [formVersion, setFormVersion] = useState(0);
  const [role, setRole] = useState<Role>(defaultRole ?? "AGENT");
  const list = useList<ManagedUser>("/users", defaultRole ? { role: defaultRole } : {});
  const departments = useQuery({
    queryKey: ["/departments", "all-options"],
    queryFn: async () => {
      const values: ManagedDepartment[] = [];
      for (let page = 1; ; page++) {
        const result = (
          await api.get<Page<ManagedDepartment>>("/departments", {
            params: { page, limit: 100, includeInactive: true },
          })
        ).data;
        values.push(...result.data);
        if (!result.pagination || page >= result.pagination.totalPages)
          return values;
      }
    },
  });
  function reset() {
    setEditing(null);
    setRole(defaultRole ?? "AGENT");
    setFormVersion((v) => v + 1);
  }
  const save = useSave("/users", reset);
  const changeStatus = useSave("/users");
  function edit(value: ManagedUser) {
    save.reset();
    setEditing(value);
    setRole(value.role);
    setFormVersion((v) => v + 1);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    const values = formValues(event);
    save.mutate({
      id: editing?.id,
      data: {
        name: values.get("name"),
        email: values.get("email"),
        role,
        departmentIds:
          role === "CUSTOMER" ? [] : values.getAll("departmentIds"),
        ...(!editing ? { password: values.get("password") } : {}),
      },
    });
  }
  return (
    <main className="page">
      <button type="button" className="role-info-button" aria-label="Roller ve yetkiler" title="Roller ve yetkiler" onClick={() => setRoleInfoOpen(true)}><Info size={17} /></button>
      {roleInfoOpen && <div className="confirm-backdrop" role="presentation" onMouseDown={() => setRoleInfoOpen(false)}><section className="role-info-modal" role="dialog" aria-modal="true" aria-labelledby="role-info-title" onMouseDown={(event) => event.stopPropagation()}><button type="button" className="confirm-close" aria-label="Kapat" onClick={() => setRoleInfoOpen(false)}><X size={18} /></button><h2 id="role-info-title">Roller ve yetkiler</h2><div className="role-info-list"><article><strong>Yönetici</strong><p>Tüm talepleri, kullanıcıları, departmanları ve sistem ayarlarını yönetir.</p></article><article><strong>Departman sorumlusu</strong><p>Kendi departmanındaki talepleri görür; atama, departmana aktarma ve web bilgilerini yönetebilir.</p></article><article><strong>Destek uzmanı</strong><p>Kendisine atanan veya departman kuyruğundaki talepleri görür ve yanıtlar.</p></article></div></section></div>}
      <Heading
        title={defaultRole === "AGENT" ? "Destek uzmanları" : defaultRole === "SUPERVISOR" ? "Departman sorumluları" : "Personeller"}
        description="Ekibinizin rollerini ve departman erişimlerini yönetin."
      />
      {!defaultRole && <nav className="catalog-tabs" aria-label="Personel alanları"><button type="button" className="active">Kullanıcılar</button><button type="button" onClick={() => navigate("/admin/departments")}>Departmanlar</button></nav>}
      <div className="management-grid">
        <section className="management-panel">
          <Search
            value={list.search}
            onChange={list.setSearch}
            label="Genel personel araması"
          />
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
                    <th>Kullanıcı</th>
                    <th>Rol ve departman</th>
                    <th>Durum</th>
                    <th>İşlemler</th>
                  </tr>
                </thead>
                <tbody>
                  {list.data.data.map((person) => (
                    <tr key={person.id} className={!person.isActive ? "inactive-record" : undefined}>
                      <td>
                        <strong>{person.name}</strong>
                        <small>{person.email}</small>
                      </td>
                      <td>
                        {roles[person.role]}
                        <small>
                          {person.departments
                            .map((d) => d.department.name)
                            .join(", ") || "Departman yok"}
                        </small>
                      </td>
                      <td>
                        <div className="status-toggle"><label className="switch"><input type="checkbox" role="switch" aria-label={`${person.name} aktif`} checked={person.isActive} disabled={changeStatus.isPending || person.id === user?.id} onChange={() => changeStatus.mutate({ id: person.id, data: { isActive: !person.isActive } })} /><span /></label><span>{person.isActive ? 'Aktif' : 'Pasif'}</span></div>
                      </td>
                      <td>
                        <div className="management-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`${person.name} düzenle`}
                            title="Düzenle"
                            onClick={() => edit(person)}
                          ><Pencil size={15} aria-hidden="true" />
                            
                          </button>
                          <button
                            type="button"
                            className="icon-button danger-icon"
                            aria-label={`${person.name} sil`}
                            title="Sil"
                            disabled={
                              remove.isPending || person.id === user?.id
                            }
                            onClick={() => { remove.reset(); setDeleteTarget(person); }}
                          ><Trash2 size={15} aria-hidden="true" />
                            
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
          <h2>{editing ? "Kullanıcıyı düzenle" : "Kullanıcı oluştur"}</h2>
          <form key={formVersion} className="management-form" onSubmit={submit}>
            <label>
              <span className="field-label">Ad soyad</span>
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={editing?.name}
                autoComplete="off"
              />
            </label>
            <label>
              <span className="field-label">E-posta</span>
              <input
                name="email"
                type="email"
                required
                defaultValue={editing?.email ?? ""}
                autoComplete="off"
              />
            </label>
            {!editing && (
              <label>
                <span className="field-label">İlk şifre</span>
                <input
                  name="password"
                  type="password"
                  required
                  minLength={10}
                  maxLength={72}
                  autoComplete="new-password"
                />
              </label>
            )}
            <DropdownSelect
              label="Rol"
              ariaLabel="Kullanıcı rolü"
              value={role}
              onChange={(value) => setRole(value as Role)}
              options={Object.entries(roles).map(([value, label]) => ({ value, label }))}
            />
            {role !== "CUSTOMER" && (
              <fieldset>
                <legend>Departman üyelikleri</legend>
                <ErrorMessage error={departments.error} />
                {departments.isPending ? (
                  <p className="muted">Departmanlar yükleniyor…</p>
                ) : (
                  departments.data?.map((department) => (
                    <label className="management-check" key={department.id}>
                      <input
                        type="checkbox"
                        name="departmentIds"
                        value={department.id}
                        defaultChecked={editing?.departments.some(
                          (d) => d.departmentId === department.id,
                        )}
                      />
                      {department.name}
                      {!department.isActive && " (Pasif)"}
                    </label>
                  ))
                )}
                {departments.data?.length === 0 && (
                  <p className="muted">Önce bir departman oluşturun.</p>
                )}
              </fieldset>
            )}
            <ErrorMessage error={save.error} />
            <FormActions
              pending={
                save.isPending || (role !== "CUSTOMER" && !departments.data)
              }
              onCancel={editing ? reset : undefined}
            />
          </form>
        </section>
      </div>
      {deleteTarget && <DeleteModal title="Kullanıcıyı sil" pending={remove.isPending} onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate(deleteTarget.id, { onSuccess: () => { if (editing?.id === deleteTarget.id) reset(); setDeleteTarget(null); } })} error={<ErrorMessage error={remove.error} />}><p><strong>{deleteTarget.name}</strong> silinecek. Geçmiş görüşmeler korunur; açık atamalar departman kuyruğuna alınır.</p></DeleteModal>}
    </main>
  );
}

export function CustomersPage() {
  const {user} = useAuth();
  const queryClient = useQueryClient();
  const list = useList<ManagedUser>("/customers");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [formVersion, setFormVersion] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [filesCustomer, setFilesCustomer] = useState<ManagedUser | null>(null);
  const customerFormRef = useRef<HTMLElement>(null);
  const save = useSave('/customers', () => {
    setEditing(null);
    setCustomerModalOpen(false);
    setFormVersion(version => version + 1);
  }, ['/customers']);
  const remove = useDelete('/customers', ['/customers']);
  const files = useQuery({ queryKey: ['/customers', filesCustomer?.id, 'files'], enabled: Boolean(filesCustomer), queryFn: async () => (await api.get<{ data: CustomerFile[] }>(`/customers/${filesCustomer!.id}/files`)).data.data });
  const deleteFile = useMutation({ mutationFn: async ({ customerId, fileId }: { customerId: string; fileId: string }) => api.delete(`/customers/${customerId}/files/${fileId}`), onSuccess: async () => { await queryClient.invalidateQueries({ queryKey: ['/customers', filesCustomer?.id, 'files'] }); await queryClient.invalidateQueries({ queryKey: ['/customers'] }); } });
  const bulkRemove = useMutation({
    mutationFn: async (ids: string[]) => Promise.all(ids.map((id) => api.delete(`/customers/${id}`))),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["/customers"] });
      setSelectedCustomerIds([]);
      setBulkSelectionMode(false);
      setBulkDeleteConfirm(false);
    },
  });
  function edit(customer: ManagedUser) {
    save.reset();
    setEditing(customer);
    setCustomerModalOpen(true);
    setFormVersion(version => version + 1);
  }
  useEffect(() => {
    if (editing) customerFormRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [editing]);
  return (
    <main className="page">
      <Heading
        title="Müşteriler"
        description="Müşteri kayıtlarını yönetin, iletişim bilgilerini güncelleyin ve hızlıca yeni talep oluşturun."
      />
      <section className="management-panel">
        <div className="customer-search-row"><Search value={list.search} onChange={(value) => list.setSearch(isPhoneSearch(value) ? formatPhone(value) : value)} label="Ad, telefon veya e-posta ile ara" placeholder="" /><button className={`button ${bulkSelectionMode ? "danger" : "secondary"} customer-bulk-delete-button`} type="button" onClick={() => { if (!bulkSelectionMode) { setBulkSelectionMode(true); return; } if (selectedCustomerIds.length) { setBulkDeleteConfirm(true); return; } setBulkSelectionMode(false); }} aria-label={bulkSelectionMode ? "Seçilen müşterileri sil" : "Toplu sil"} title={bulkSelectionMode ? "Seçilen müşterileri sil" : "Toplu sil"}><Trash2 size={17} />{bulkSelectionMode && selectedCustomerIds.length > 0 && <span>{selectedCustomerIds.length}</span>}</button><button className="button primary customer-add-button" type="button" onClick={() => { save.reset(); setEditing(null); setCustomerModalOpen(true); }} aria-label="Yeni müşteri ekle">+</button></div>
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
                  <th>{bulkSelectionMode ? "Seç" : "Müşteri"}</th>
                  <th>İletişim</th>
                  <th>Hesap durumu</th>
                  <th>Görüşmeler</th>
                </tr>
              </thead>
              <tbody>
                {list.data.data.map((customer) => (
                  <tr key={customer.id} className={!customer.isActive ? "inactive-record" : undefined}>
                    <td className={bulkSelectionMode ? "customer-select-cell" : undefined}>
                      {bulkSelectionMode && <input type="checkbox" checked={selectedCustomerIds.includes(customer.id)} onChange={(event) => setSelectedCustomerIds((current) => event.target.checked ? [...current, customer.id] : current.filter((id) => id !== customer.id))} aria-label={`${customer.name} müşterisini seç`} />}
                      <strong>{customer.name}</strong>
                    </td>
                    <td>{customer.phone ?? "Telefon yok"}<small>{customer.email ?? "E-posta yok"}{customer.company ? ` · ${customer.company}` : ""}</small>{customer.staffNote && <small>Personel notu: {customer.staffNote}</small>}</td>
                    <td><label className="switch"><input type="checkbox" checked={customer.isActive} onChange={(event) => save.mutate({ id: customer.id, data: { isActive: event.target.checked } })} /><span /></label><small>{customer.isActive ? "Aktif" : "Pasif"}</small></td>
                    <td>
                      <div className="management-actions customer-table-actions">
                      <Link
                        className="button secondary"
                        to={`${inboxPath(user!.role)}?customerId=${encodeURIComponent(customer.id)}`}
                      >
                        Görüşmeleri aç
                      </Link>
                      <Link className="button primary" to={`${user!.role === 'ADMIN' ? '/admin' : '/agent'}/phone-support?customerId=${customer.id}`}>Talep aç</Link>
                      <button className="icon-button" type="button" aria-label={`${customer.name} düzenle`} title="Düzenle" onClick={() => edit(customer)}><Pencil size={15} aria-hidden="true" /></button>
                      <button className={`icon-button ${customer.customerFileCount ? '' : 'is-muted'}`} type="button" aria-label={`${customer.name} dosyaları gör`} title={customer.customerFileCount ? 'Dosyaları gör' : 'Dosya yok'} disabled={!customer.customerFileCount} onClick={() => setFilesCustomer(customer)}><Eye size={15} aria-hidden="true" /></button>
                      <button className="icon-button danger-icon" type="button" aria-label={`${customer.name} sil`} title="Sil" onClick={() => setDeleteTarget(customer)}><Trash2 size={15} aria-hidden="true" /></button>
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
      {deleteTarget && (
        <div className="confirm-backdrop" role="presentation">
          <form className="confirm-modal" role="dialog" aria-modal="true" aria-label="Müşteri silme onayı" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); remove.mutate(deleteTarget.id, { onSuccess: () => setDeleteTarget(null) }); }}>
            <button className="confirm-close" type="button" onClick={() => setDeleteTarget(null)} aria-label="Kapat">×</button>
            <h2>Müşteriyi sil</h2>
            <p><strong>{deleteTarget.name}</strong> adlı müşteriyi silmek istediğinize emin misiniz?</p>
            <div className="confirm-actions"><button className="button secondary" type="button" onClick={() => setDeleteTarget(null)}>Vazgeç</button><button className="button danger" type="submit" autoFocus disabled={remove.isPending}>{remove.isPending ? "Siliniyor…" : "Müşteriyi sil"}</button></div>
          </form>
        </div>
      )}
      {bulkDeleteConfirm && <div className="confirm-backdrop" role="presentation">
        <form className="confirm-modal" role="dialog" aria-modal="true" aria-label="Toplu müşteri silme onayı" onMouseDown={(event) => event.stopPropagation()} onSubmit={(event) => { event.preventDefault(); bulkRemove.mutate(selectedCustomerIds); }}>
          <button className="confirm-close" type="button" onClick={() => setBulkDeleteConfirm(false)} aria-label="Kapat">×</button>
          <h2>Müşterileri sil</h2>
          <p>Seçilen <strong>{selectedCustomerIds.length}</strong> müşteriyi silmek istediğinize emin misiniz?</p>
          <div className="confirm-actions"><button className="button secondary" type="button" onClick={() => setBulkDeleteConfirm(false)}>Vazgeç</button><button className="button danger" type="submit" autoFocus disabled={bulkRemove.isPending}>{bulkRemove.isPending ? "Siliniyor…" : "Seçilenleri sil"}</button></div>
        </form>
      </div>}
      {customerModalOpen && <div className="confirm-backdrop" role="presentation">
      <section ref={customerFormRef} className="confirm-modal customer-form-panel" role="dialog" aria-modal="true" onMouseDown={(event) => event.stopPropagation()}>
        <div className="customer-form-heading">
          <h2>{editing ? "Müşteri bilgilerini düzenle" : "Yeni arayan müşteri"}</h2>
          <button className="customer-form-close" type="button" onClick={() => setCustomerModalOpen(false)} aria-label="Kapat" title="Kapat">×</button>
        </div>
        <form key={formVersion} className="management-form" onSubmit={event => {
          const values = new FormData(event.currentTarget);
          const data = new FormData();
          for (const name of ['name', 'phone', 'email', 'company', 'staffNote', 'extraPhones', 'extraEmails']) { const value = values.get(name); if (typeof value === 'string' && value) data.append(name, value); }
          for (const file of values.getAll('customerFiles')) if (file instanceof File && file.size) data.append('files', file);
          save.mutate({ id: editing?.id, data });
        }}>
          <label><span className="field-label">Ad soyad</span><input name="name" required minLength={2} maxLength={100} defaultValue={editing?.name} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase("tr-TR"); }}/></label>
          <label><span className="field-label">Telefon</span><input name="phone" required minLength={7} maxLength={30} inputMode="tel" defaultValue={formatPhone(editing?.phone ?? "")} onInput={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }}/></label>
          <label><span className="field-label">Ek telefonlar</span><input name="extraPhones" placeholder="Virgülle ayırabilirsiniz" defaultValue={editing?.extraPhones ?? ""} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.split(",").map((phone) => formatPhone(phone.trim())).filter(Boolean).join(", "); }} /></label>
          <label><span className="field-label">E-posta</span> <EmailInput name="email" defaultValue={editing?.email ?? ""} /></label>
          <label><span className="field-label">Ek e-posta adresleri</span><EmailInput name="extraEmails" multiple autoComplete="email" defaultValue={editing?.extraEmails ?? ""} /></label>
          <label><span className="field-label">Şirket</span> <input name="company" maxLength={120} defaultValue={editing?.company ?? ""}/></label>
          <label><span className="field-label">Müşteri notu</span> <textarea name="staffNote" maxLength={2000} rows={4} defaultValue={editing?.staffNote ?? ""} placeholder="Örn. Arama nedeni, tercih ettiği dönüş saati veya personel için önemli bilgi"/></label>
          <label><span className="field-label">Dosya ekle</span><input type="file" name="customerFiles" multiple /></label>
          <ErrorMessage error={save.error}/><FormActions pending={save.isPending}/>
        </form>
      </section>
      </div>}
      {filesCustomer && <div className="confirm-backdrop" role="presentation"><section className="attachment-preview-modal customer-files-modal" role="dialog" aria-modal="true" aria-label={`${filesCustomer.name} dosyaları`} onMouseDown={(event) => event.stopPropagation()}><div className="customer-form-heading"><h2>{filesCustomer.name} - Dosyalar</h2><button className="customer-form-close" type="button" onClick={() => setFilesCustomer(null)} aria-label="Kapat"><X size={18} /></button></div>{files.isPending ? <p className="muted">Dosyalar yükleniyor...</p> : files.error ? <ErrorMessage error={files.error} /> : files.data?.length ? <div className="customer-files-list">{files.data.map(file => <CustomerFileRow key={file.id} customerId={filesCustomer.id} file={file} onDelete={() => deleteFile.mutate({ customerId: filesCustomer.id, fileId: file.id })} />)}</div> : <p className="muted">Bu müşteriye ait dosya bulunmuyor.</p>}</section></div>}
    </main>
  );
}

export function PhoneSupportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const initialCustomerId = params.get("customerId") ?? "";
  const [search, setSearch] = useState("");
  const deferredSearch = useDebouncedValue(search);
  const [hasSearched, setHasSearched] = useState(false);
  const [selected, setSelected] = useState<ManagedUser | null>(null);
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const [phonePage, setPhonePage] = useState(1);
  const [showCreate, setShowCreate] = useState(false);
  const [enterCreateRequested, setEnterCreateRequested] = useState(false);
  const [departmentId, setDepartmentId] = useState("");
  const [tagIds, setTagIds] = useState<string[]>([]);
  const [websiteId, setWebsiteId] = useState("");
  const [assignedAgentId, setAssignedAgentId] = useState("");
  const initialCustomer = useQuery({
    queryKey: ["/customers", initialCustomerId],
    queryFn: async () => (await api.get<{ data: ManagedUser }>(`/customers/${initialCustomerId}`)).data.data,
    enabled: Boolean(initialCustomerId),
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const customers = useQuery({
    queryKey: ["/customers", "phone-support", phonePage, deferredSearch],
    queryFn: async () =>
      (await api.get<Page<ManagedUser>>("/customers", { params: { page: phonePage, limit: 15, search: deferredSearch } })).data,
    enabled: hasSearched && deferredSearch.trim().length > 0,
    placeholderData: previous => previous,
    staleTime: 15_000,
    refetchOnWindowFocus: false,
  });
  const createCustomer = useSave("/customers", undefined, ["/customers"]);
  const createConversation = useSave("/conversations");
  const results = customers.data?.data ?? [];
  const displayResults = hasSearched ? results : [];
  const activeCustomer = selected ?? (!hasSearched ? initialCustomer.data : null) ?? displayResults.find(customer => customer.id === customerId) ?? null;
  const noResults = hasSearched && deferredSearch === search && !customers.isPending && !customers.isError && !displayResults.length;
  useEffect(() => {
    if (enterCreateRequested && noResults) {
      setShowCreate(true);
      setEnterCreateRequested(false);
    }
  }, [enterCreateRequested, noResults]);
  useEffect(() => {
    if (showCreate) window.setTimeout(() => {
      const field = isPhoneSearch(search) || isEmailSearch(search) ? "name" : "phone";
      document.querySelector<HTMLInputElement>(`.phone-support-create input[name='${field}']`)?.focus();
    }, 0);
  }, [showCreate, search]);
  function searchCustomers(value: string) {
    setSearch(isPhoneSearch(value) ? formatPhone(value) : value);
    setHasSearched(value.trim().length > 0);
    setPhonePage(1);
    setShowCreate(false);
    setSelected(null);
    setCustomerId("");
  }
  function selectCustomer(customer: ManagedUser) {
    setSelected(customer);
    setCustomerId(customer.id);
  }
  function returnToSearch() {
    setSelected(null);
    setCustomerId("");
    setSearch("");
    setHasSearched(true);
    setShowCreate(false);
  }
  function focusNextField(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    const fields = Array.from(event.currentTarget.form?.querySelectorAll<HTMLInputElement>("input:not([type=hidden]), textarea, select") ?? []);
    fields[fields.indexOf(event.currentTarget) + 1]?.focus();
  }
  function submitCustomer(event: FormEvent<HTMLFormElement>) {
    const values = formValues(event);
    createCustomer.mutate(
      { data: { name: values.get("name"), phone: values.get("phone"), email: values.get("email") || undefined, company: values.get("company") || undefined, staffNote: values.get("staffNote") || undefined } },
      { onSuccess: (result) => {
        const customer = (result as { data: { data: ManagedUser } }).data.data;
        createConversation.mutate(
          { data: { customerId: customer.id, departmentId, subject: values.get("subject"), message: values.get("message"), priority: "NORMAL", websiteId: values.get("websiteId") || undefined, assignedAgentId: values.get("assignedAgentId") || undefined, tagIds } },
          { onSuccess: (conversationResult) => navigate(conversationPath(user!.role, (conversationResult as { data: { data: Conversation } }).data.data.id)) },
        );
      } },
    );
  }
  function submitConversation(event: FormEvent<HTMLFormElement>) {
    const values = formValues(event);
    createConversation.mutate(
      { data: { customerId, departmentId, subject: values.get("subject"), message: values.get("message"), priority: "NORMAL", websiteId: values.get("websiteId") || undefined, assignedAgentId: values.get("assignedAgentId") || undefined, tagIds } },
      { onSuccess: (result) => navigate(conversationPath(user!.role, (result as { data: { data: Conversation } }).data.data.id)) },
    );
  }
  return (
    <main className="page">
      <Heading title={activeCustomer ? `${activeCustomer.name} için Telefon desteği aç` : "Telefon desteği için talep aç"} description={activeCustomer ? "Bu kişi için talep bilgilerini doldurun ve destek kuyruğuna gönderin." : "Arayan kişiyi bulun, seçin ve görüşmeyi doğrudan destek kuyruğuna gönderin."} />
      {activeCustomer && <button type="button" className="button secondary phone-support-back" onClick={returnToSearch}>← Aramaya geri dön</button>}
      <div className="management-grid phone-support-grid">
        <section className="management-panel phone-support-search-panel">
          <label className="phone-support-search">
            Telefon, e-posta veya ad ile ara
            <span>
              <input type="search" value={search} onChange={(event) => searchCustomers(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); setEnterCreateRequested(true); searchCustomers(event.currentTarget.value); } }} placeholder="Arayanın telefonu, e-postası veya adı" autoFocus />
              {noResults && <button type="button" className="button primary phone-support-add" onClick={() => setShowCreate(true)} aria-label="Yeni kişi ekle" title="Yeni kişi ekle">+</button>}
            </span>
          </label>
          {!hasSearched && <p className="management-empty phone-support-empty">Arayan kişinin bilgilerini yazmaya başlayın.</p>}
          {hasSearched && <ListState loading={customers.isPending} error={customers.error} empty={false} />}
          {displayResults.map((customer) => <button className={`customer-choice ${customerId === customer.id ? "selected" : ""}`} type="button" key={customer.id} onClick={() => selectCustomer(customer)}><strong>{customer.name}</strong><span>{customer.phone ?? "Telefon yok"} · {customer.email ?? "E-posta yok"}</span>{customer.company && <small>{customer.company}</small>}{customer.staffNote && <small>Personel notu: {customer.staffNote}</small>}</button>)}
          {noResults && <p className="phone-support-no-result">Eşleşen kişi bulunamadı. Sağdaki <strong>+</strong> düğmesiyle arayanı ekleyin.</p>}
          {hasSearched && <Pagination pagination={customers.data?.pagination} onChange={setPhonePage} />}
          {showCreate && <form className="management-form phone-support-create" onSubmit={submitCustomer}><h2>Yeni arayan kişi</h2><label><span className="field-label">Ad soyad</span><input name="name" required minLength={2} maxLength={100} defaultValue={!isPhoneSearch(search) && !isEmailSearch(search) ? search.toLocaleUpperCase("tr-TR") : ""} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase("tr-TR"); }} onKeyDown={focusNextField} /></label><label><span className="field-label">Telefon</span><input name="phone" required minLength={7} maxLength={30} inputMode="tel" defaultValue={isPhoneSearch(search) ? formatPhone(search) : ""} onInput={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} onKeyDown={focusNextField} /></label><label><span className="field-label">E-posta</span><EmailInput name="email" defaultValue={isEmailSearch(search) ? search.trim().toLowerCase() : ""} /></label><label><span className="field-label">Şirket</span><input name="company" maxLength={120} /></label><label><span className="field-label">Müşteri notu</span><textarea name="staffNote" maxLength={2000} rows={3} placeholder="İsteğe bağlı kalıcı müşteri notu" /></label><div className="phone-support-ticket-fields"><h2>Talep bilgileri</h2><label><span className="field-label">Konu</span><input name="subject" required minLength={5} maxLength={200} /></label><DirectorySelect endpoint="/departments" label="Departman" value={departmentId} onChange={setDepartmentId} /><FormDropdown name="priority" label="Öncelik" defaultValue="NORMAL" options={Object.entries(priorities).map(([value, label]) => ({ value, label }))} /><TagSelect value={tagIds} onChange={setTagIds} /><label><span className="field-label">Açıklama</span><textarea name="message" required maxLength={10000} rows={7} placeholder="Örn. Ödeme ekranında hata alıyor; hata mesajı: …" /></label></div><ErrorMessage error={createCustomer.error ?? createConversation.error} /><div className="management-actions"><button className="button primary" disabled={createCustomer.isPending || createConversation.isPending || !departmentId}>{createCustomer.isPending || createConversation.isPending ? "Kaydediliyor…" : "Kişiyi ve talebi oluştur"}</button><button className="button secondary" type="button" onClick={() => setShowCreate(false)}>Vazgeç</button></div></form>}
          {showCreate && <form className="management-form phone-support-create phone-support-create-v2" onSubmit={submitCustomer}>
            <section className="phone-caller-fields">
              <h2>Yeni arayan kişi</h2>
              <label className="phone-caller-name"><span className="field-label">Ad soyad</span><input name="name" required minLength={2} maxLength={100} defaultValue={!isPhoneSearch(search) && !isEmailSearch(search) ? search.toLocaleUpperCase("tr-TR") : ""} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase("tr-TR"); }} onKeyDown={focusNextField} /></label>
              <label className="phone-caller-phone"><span className="field-label">Telefon</span><input name="phone" required minLength={7} maxLength={30} inputMode="tel" defaultValue={isPhoneSearch(search) ? formatPhone(search) : ""} onInput={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} onKeyDown={focusNextField} /></label>
              <label className="phone-caller-email"><span className="field-label">E-posta</span><EmailInput name="email" defaultValue={isEmailSearch(search) ? search.trim().toLowerCase() : ""} /></label>
              <label className="phone-caller-company"><span className="field-label">Şirket</span><input name="company" maxLength={120} /></label>
              <label className="phone-caller-note"><span className="field-label">Müşteri notu</span><textarea name="staffNote" maxLength={2000} rows={3} placeholder="İsteğe bağlı kalıcı müşteri notu" /></label>
            </section>
            <section className="phone-new-request-fields">
              <h2>Talep bilgileri</h2>
              <PhoneRequestFields departmentId={departmentId} setDepartmentId={setDepartmentId} websiteId={websiteId} setWebsiteId={setWebsiteId} assignedAgentId={assignedAgentId} setAssignedAgentId={setAssignedAgentId} />
            </section>
            <ErrorMessage error={createCustomer.error ?? createConversation.error} />
            <div className="management-actions"><button className="button primary" disabled={createCustomer.isPending || createConversation.isPending || !departmentId}>{createCustomer.isPending || createConversation.isPending ? "Kaydediliyor…" : "Kişiyi ve talebi oluştur"}</button><button className="button secondary" type="button" onClick={() => setShowCreate(false)}>Vazgeç</button></div>
          </form>}
        </section>
        {activeCustomer && <section className="management-panel phone-support-action-panel">
          {!activeCustomer ? <div className="phone-support-next"><h2>Talep oluştur</h2><p>Arama sonucundan bir kişi seçtiğinizde talep bilgileri burada açılır.</p></div> : <><form className="management-form" onSubmit={submitConversation}><label><span className="field-label">Seçilen kişi</span><input readOnly value={activeCustomer.name} /></label><label><span className="field-label">Konu</span> <input name="subject" required minLength={5} maxLength={200} autoFocus /></label><DirectorySelect endpoint="/departments" label="Departman" value={departmentId} onChange={setDepartmentId} /><FormDropdown name="priority" label="Öncelik" defaultValue="NORMAL" options={Object.entries(priorities).map(([value, label]) => ({ value, label }))} /><TagSelect value={tagIds} onChange={setTagIds} /><label><span className="field-label">Açıklama</span> <textarea name="message" required maxLength={10000} rows={7} placeholder="Örn. Ödeme ekranında hata alıyor; hata mesajı: …" /></label><ErrorMessage error={createConversation.error} /><button className="button primary" disabled={createConversation.isPending || !departmentId}>{createConversation.isPending ? "Oluşturuluyor…" : "Talebi oluştur ve gönder"}</button></form></>}
        </section>}
        {activeCustomer && <section className="management-panel phone-support-action-panel phone-support-action-panel-v2">
          <form className="management-form phone-support-request-form" onSubmit={submitConversation}>
            <h2>Talep bilgileri</h2>
            <PhoneRequestFields departmentId={departmentId} setDepartmentId={setDepartmentId} websiteId={websiteId} setWebsiteId={setWebsiteId} assignedAgentId={assignedAgentId} setAssignedAgentId={setAssignedAgentId} customer={activeCustomer} />
            <ErrorMessage error={createConversation.error} />
            <div className="management-actions"><button className="button primary" disabled={createConversation.isPending || !departmentId}>{createConversation.isPending ? "Oluşturuluyor…" : "Talebi oluştur ve gönder"}</button></div>
          </form>
        </section>}
      </div>
    </main>
  );
}
