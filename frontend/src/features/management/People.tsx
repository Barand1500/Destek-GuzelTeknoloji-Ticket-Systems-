import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Eye, Pencil, Plus, Trash2, X } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../auth/Auth";
import { hasPermission } from '../auth/permissions';
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
import { DropdownSelect, MultiDropdownSelect } from "../../components/DropdownSelect";
import { SearchableDropdown } from "../../components/SearchableDropdown";
import { EmailInput } from "../../components/EmailInput";
import { useWorkSession } from "../../components/WorkSession";
import { DeleteModal } from '../../components/DeleteModal';
import { conversationPath } from "../../router/paths";
import { TagSelect, FormDropdown, ComposerFiles } from "../tickets/TicketExtras";
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
import { StaffSkills } from './StaffSkills';
import { SuggestedDescription } from './StaffSuggestions';
import type { StaffSkill } from '../../types';
type ManagedUser = User & {
  skills?: StaffSkill[];
  isActive: boolean;
  createdAt: string;
  departments: { departmentId: string; department: Department }[];
  extraPhones?: string | null; extraEmails?: string | null;
  customerFileCount?: number;
};
type AssignmentImpact = { id: string; number: number; subject: string; status: string; priority: string; createdAt: string; departmentId: string; department: { name: string }; customer: { name: string } };
type AssignmentTransferGroup = { conversationIds: string[]; departmentId: string; assignedAgentId: string | null; departmentName: string; assignedAgentName: string | null };
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
type OutgoingChannel = "EMAIL" | "SMS" | "WHATSAPP";
function PhoneRequestFields({ departmentId, setDepartmentId, websiteId, setWebsiteId, assignedAgentId, setAssignedAgentId, channel, setChannel, customer }: { departmentId: string; setDepartmentId: (value: string) => void; websiteId: string; setWebsiteId: (value: string) => void; assignedAgentId: string; setAssignedAgentId: (value: string) => void; channel: OutgoingChannel; setChannel: (value: OutgoingChannel) => void; customer?: ManagedUser | null }) {
  const [suggestedAgent, setSuggestedAgent] = useState<{ id: string; name: string; departmentId: string; departmentName: string } | null>(null);
  const websites = useQuery({ queryKey: ["websites", "phone-request"], queryFn: async () => (await api.get<Page<Website>>("/websites", { params: { limit: 100 } })).data });
  const channels = useQuery({ queryKey: ["communication-channels"], queryFn: async () => (await api.get<{ data: { EMAIL: boolean; SMS: boolean; WHATSAPP: boolean } }>("/communication-channels")).data.data });
  const agents = useQuery({ queryKey: ["department-agents", departmentId], enabled: Boolean(departmentId), refetchInterval: 30_000, queryFn: async () => (await api.get<Page<{ id: string; name: string; presence: "ONLINE" | "IDLE" | "OFFLINE"; openConversationCount: number }>>(`/departments/${departmentId}/agents`, { params: { limit: 100 } })).data });
  return <>
    {customer && <label className="phone-request-selected"><span className="field-label">Seçilen kişi</span><input readOnly value={customer.name} /></label>}
    <div className="phone-request-grid">
      <div className="phone-request-channel"><DropdownSelect label="Mesaj kanalı" value={channel} onChange={value => setChannel(value as OutgoingChannel)} ariaLabel="Mesaj kanalını seçin" options={[
        { value: "EMAIL", label: "Telefon talebi" },
        { value: "SMS", label: channels.isPending ? "SMS (durum kontrol ediliyor)" : channels.isError ? "SMS (durum alınamadı)" : channels.data?.SMS ? "SMS" : "SMS (ayarlarda etkin değil)" },
        { value: "WHATSAPP", label: channels.isPending ? "WhatsApp (durum kontrol ediliyor)" : channels.isError ? "WhatsApp (durum alınamadı)" : channels.data?.WHATSAPP ? "WhatsApp" : "WhatsApp (ayarlarda etkin değil)" },
      ]} /></div>
      <div className="phone-request-web"><input type="hidden" name="websiteId" value={websiteId} /><DropdownSelect label="Proje" value={websiteId} onChange={setWebsiteId} ariaLabel="Proje seçin" options={[{ value: "", label: "Proje seçin" }, ...(websites.data?.data ?? []).filter((site) => site.isActive).map((site) => ({ value: site.id, label: site.name }))]} /></div>
      <label className="phone-request-subject"><span className="field-label">Konu</span><input name="subject" required minLength={5} maxLength={200} autoFocus={Boolean(customer)} /></label>
      <SuggestedDescription departmentId={departmentId} assignedAgentId={assignedAgentId} onSelect={person => { setSuggestedAgent(person); setDepartmentId(person.departmentId); setAssignedAgentId(person.id); }} />
      <div className="phone-request-department"><DirectorySelect endpoint="/departments" label="Departman" value={departmentId} current={suggestedAgent?.departmentId === departmentId ? { id: departmentId, name: suggestedAgent.departmentName } : undefined} onChange={(value) => { setDepartmentId(value); setAssignedAgentId(""); }} params={{ accessible: "true" }} /></div>
      <div className="phone-request-assignee"><input type="hidden" name="assignedAgentId" value={assignedAgentId} /><DropdownSelect label="Atanan personel" value={assignedAgentId} onChange={setAssignedAgentId} ariaLabel="Atanan personeli seçin" options={[{ value: "", label: departmentId ? "Atanmamış" : "Önce departman seçin" }, ...(suggestedAgent?.departmentId === departmentId && !(agents.data?.data ?? []).some(agent => agent.id === suggestedAgent.id) ? [{ value: suggestedAgent.id, label: suggestedAgent.name }] : []), ...(agents.data?.data ?? []).map((agent) => ({ value: agent.id, label: agent.name, presence: agent.presence, openConversationCount: agent.openConversationCount }))]} /></div>
    </div>
  </>;
}

export function UsersPage({ defaultRole }: { defaultRole?: Role }) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const navigate = useNavigate();
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const remove = useMutation({
    mutationFn: async (input: { id: string; assignmentTransfers?: Array<{ conversationIds: string[]; departmentId: string; assignedAgentId: string | null }> }) => api.delete(`/users/${input.id}`, { data: { assignmentTransfers: input.assignmentTransfers ?? [] } }),
    onSuccess: async () => Promise.all(["/users", "/customers"].map((key) => queryClient.invalidateQueries({ queryKey: [key] }))),
  });
  const [formVersion, setFormVersion] = useState(0);
  const [role, setRole] = useState<Role>(user?.accessRole ? 'ADMIN' : defaultRole ?? "AGENT");
  const [accessRoleId, setAccessRoleId] = useState<string | null>(user?.accessRole?.id ?? null);
  const roleOptions = useQuery({ queryKey: ['/role-options'], queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string }> }>('/role-options')).data.data });
  const [selectedDepartmentIds, setSelectedDepartmentIds] = useState<string[]>([]);
  const [assignmentImpact, setAssignmentImpact] = useState<AssignmentImpact[]>([]);
  const [assignmentModalOpen, setAssignmentModalOpen] = useState(false);
  const [assignmentAction, setAssignmentAction] = useState<"update" | "delete">("update");
  const [pendingUserUpdate, setPendingUserUpdate] = useState<Record<string, unknown> | null>(null);
  const [selectedAssignmentIds, setSelectedAssignmentIds] = useState<string[]>([]);
  const [transferDepartmentId, setTransferDepartmentId] = useState("");
  const [transferAgentId, setTransferAgentId] = useState("");
  const [transferGroups, setTransferGroups] = useState<AssignmentTransferGroup[]>([]);
  const list = useList<ManagedUser>("/users", defaultRole ? { role: defaultRole } : {});
  const departments = useQuery({
    queryKey: ["/departments", "all-options"],
    queryFn: async () => {
      const values: ManagedDepartment[] = [];
      for (let page = 1; ; page++) {
        const result = (
          await api.get<Page<ManagedDepartment>>("/departments", {
            params: { page, limit: 100, ...(user?.role === 'ADMIN' && !user.accessRole ? { includeInactive: true } : { accessible: true }) },
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
    setRole(user?.accessRole ? 'ADMIN' : defaultRole ?? "AGENT");
    setAccessRoleId(user?.accessRole?.id ?? null);
    setSelectedDepartmentIds([]);
    setAssignmentImpact([]);
    setAssignmentModalOpen(false);
    setAssignmentAction("update");
    setPendingUserUpdate(null);
    setSelectedAssignmentIds([]);
    setTransferDepartmentId("");
    setTransferAgentId("");
    setTransferGroups([]);
    setFormVersion((v) => v + 1);
  }
  const save = useSave("/users", reset);
  const checkAssignmentImpact = useMutation({
    mutationFn: async (input: { id: string; target: { role: Role; accessRoleId: string | null; isActive: boolean; departmentIds: string[] }; data: Record<string, unknown> }) => ({
      ...input,
      impact: (await api.get<{ data: AssignmentImpact[] }>(`/users/${input.id}/assignment-impact`, { params: { ...input.target, departmentIds: input.target.departmentIds.join(",") } })).data.data,
    }),
    onSuccess: ({ id, data, impact }) => {
      if (!impact.length) {
        save.mutate({ id, data });
        return;
      }
      setPendingUserUpdate(data);
      setAssignmentImpact(impact);
      setAssignmentAction("update");
      setSelectedAssignmentIds([]);
      setTransferGroups([]);
      setTransferDepartmentId("");
      setTransferAgentId("");
      setAssignmentModalOpen(true);
    },
  });
  const prepareDelete = useMutation({
    mutationFn: async (person: ManagedUser) => ({ person, impact: (await api.get<{ data: AssignmentImpact[] }>(`/users/${person.id}/assignment-impact`, { params: { role: person.role, accessRoleId: person.accessRoleId ?? null, isActive: person.isActive, departmentIds: person.departments.map((department) => department.departmentId).join(","), forDeletion: true } })).data.data }),
    onSuccess: ({ person, impact }) => {
      remove.reset();
      setDeleteTarget(person);
      if (!impact.length) return;
      setAssignmentAction("delete");
      setAssignmentImpact(impact);
      setPendingUserUpdate(null);
      setSelectedAssignmentIds([]);
      setTransferGroups([]);
      setTransferDepartmentId("");
      setTransferAgentId("");
      setAssignmentModalOpen(true);
    },
  });
  const transferAgents = useQuery({
    queryKey: ["/departments", transferDepartmentId, "assignment-transfer-agents"],
    enabled: assignmentModalOpen && Boolean(transferDepartmentId),
    queryFn: async () => (await api.get<Page<{ id: string; name: string }>>(`/departments/${transferDepartmentId}/agents`, { params: { page: 1, limit: 100 } })).data.data,
  });
  function addTransferGroup() {
    const department = departments.data?.find((item) => item.id === transferDepartmentId);
    const agent = transferAgents.data?.find((item) => item.id === transferAgentId) ?? (editing?.id === transferAgentId && editedUserCanReceive ? { id: editing.id, name: editing.name } : undefined);
    if (!department || !selectedAssignmentIds.length || (transferAgentId && !agent)) return;
    setTransferGroups((current) => [...current, {
      conversationIds: [...selectedAssignmentIds],
      departmentId: department.id,
      assignedAgentId: transferAgentId || null,
      departmentName: department.name,
      assignedAgentName: agent?.name ?? null,
    }]);
    setSelectedAssignmentIds([]);
    setTransferDepartmentId("");
    setTransferAgentId("");
  }
  const assignedInGroups = new Set(transferGroups.flatMap((group) => group.conversationIds));
  const remainingAssignments = assignmentImpact.filter((conversation) => !assignedInGroups.has(conversation.id));
  const canTransferDepartments = hasPermission(user, 'conversations.transfer');
  const canAssignStaff = hasPermission(user, 'conversations.assign');
  const editedUserCanReceive = Boolean(assignmentAction === "update" && editing?.isActive && transferDepartmentId && selectedDepartmentIds.includes(transferDepartmentId) && (accessRoleId || role === 'AGENT' || role === 'SUPERVISOR'));
  const selectedChangesDepartment = selectedAssignmentIds.some((id) => assignmentImpact.find((conversation) => conversation.id === id)?.departmentId !== transferDepartmentId);
  const transferGroupsNeedDepartmentPermission = transferGroups.some((group) => group.conversationIds.some((id) => assignmentImpact.find((conversation) => conversation.id === id)?.departmentId !== group.departmentId));
  function applyTransferGroups() {
    if (transferGroups.reduce((sum, group) => sum + group.conversationIds.length, 0) !== assignmentImpact.length) return;
    const assignmentTransfers = transferGroups.map(({ conversationIds, departmentId, assignedAgentId }) => ({ conversationIds, departmentId, assignedAgentId }));
    if (assignmentAction === "delete") {
      if (!deleteTarget) return;
      remove.mutate({ id: deleteTarget.id, assignmentTransfers }, { onSuccess: () => { setAssignmentModalOpen(false); setDeleteTarget(null); setAssignmentImpact([]); setTransferGroups([]); if (editing?.id === deleteTarget.id) reset(); } });
      return;
    }
    if (!editing || !pendingUserUpdate) return;
    save.mutate({ id: editing.id, data: { ...pendingUserUpdate, assignmentTransfers } });
  }
  const changeStatus = useSave("/users");
  function edit(value: ManagedUser) {
    save.reset();
    setEditing(value);
    setRole(value.role);
    setAccessRoleId(value.accessRoleId ?? null);
    setSelectedDepartmentIds(value.departments.map((department) => department.departmentId));
    setFormVersion((v) => v + 1);
  }
  function submit(event: FormEvent<HTMLFormElement>) {
    const values = formValues(event);
    const data = {
        name: values.get("name"),
        email: values.get("email"),
        phone: values.get("phone"),
        role,
        accessRoleId,
        skills: role === 'CUSTOMER' ? [] : JSON.parse(String(values.get('skills') ?? '[]')),
        departmentIds:
          role === "CUSTOMER" ? [] : selectedDepartmentIds,
        ...(!editing ? { password: values.get("password") } : {}),
      };
    if (editing) {
      checkAssignmentImpact.mutate({
        id: editing.id,
        data,
        target: {
          role,
          accessRoleId,
          isActive: editing.isActive,
          departmentIds: role === "CUSTOMER" ? [] : selectedDepartmentIds,
        },
      });
    } else {
      save.mutate({ data });
    }
  }
  return (
    <main className="page">
      <Heading
        title={defaultRole === "AGENT" ? "Destek uzmanları" : defaultRole === "SUPERVISOR" ? "Departman sorumluları" : "Personeller"}
        description="Ekibinizin rollerini ve departman erişimlerini yönetin."
      />
      {!defaultRole && <nav className="catalog-tabs" aria-label="Personel alanları"><button type="button" className="active">Kullanıcılar</button>{user?.role === 'ADMIN' && <button type="button" onClick={() => navigate("/admin/departments")}>Departmanlar</button>}</nav>}
      <div className="management-grid users-management-grid">
        <section className="management-panel">
          <Search
            value={list.search}
            onChange={list.setSearch}
            label="Genel personel araması"
            limit={list.limit}
            onLimitChange={list.setLimit}
          />
          <ErrorMessage error={changeStatus.error} />
          <ErrorMessage error={prepareDelete.error} />
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
                        {person.phone && <small>{formatPhone(person.phone)}</small>}
                      </td>
                      <td>
                        {person.accessRole?.name ?? roles[person.role]}
                        <small>
                          {person.departments
                            .map((d) => d.department.name)
                            .join(", ") || "Departman yok"}
                        </small>
                      </td>
                      <td>
                        {(person.role !== "ADMIN" || Boolean(person.accessRoleId)) && <div className="status-toggle"><label className="switch"><input type="checkbox" role="switch" aria-label={`${person.name} aktif`} checked={person.isActive} disabled={changeStatus.isPending || person.id === user?.id} onChange={() => changeStatus.mutate({ id: person.id, data: { isActive: !person.isActive } })} /><span /></label><span>{person.isActive ? 'Aktif' : 'Pasif'}</span></div>}
                      </td>
                      <td>
                        <div className="management-actions">
                          <button
                            type="button"
                            className="icon-button"
                            aria-label={`${person.name} düzenle`}
                            title="Düzenle"
                            onClick={() => edit(person)}
                            disabled={!hasPermission(user, 'users.update') || Boolean(user?.accessRole && person.accessRoleId !== user.accessRole.id)}
                          ><Pencil size={15} aria-hidden="true" />
                            
                          </button>
                          {(person.role !== "ADMIN" || Boolean(person.accessRoleId)) && <button
                            type="button"
                            className="icon-button danger-icon"
                            aria-label={`${person.name} sil`}
                            title="Sil"
                            disabled={
                              remove.isPending || prepareDelete.isPending || person.id === user?.id || !hasPermission(user, 'users.delete')
                            }
                            onClick={() => { remove.reset(); prepareDelete.mutate(person); }}
                          ><Trash2 size={15} aria-hidden="true" />
                            
                          </button>}
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
            alwaysVisible
          />
        </section>
        <section className="management-panel users-editor-panel">
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
            <div className="users-form-row">
            <label>
              <span className="field-label">Telefon</span>
              <input
                name="phone"
                type="tel"
                inputMode="tel"
                minLength={7}
                maxLength={30}
                defaultValue={formatPhone(editing?.phone ?? "")}
                onInput={(event) => {
                  event.currentTarget.value = formatPhone(
                    event.currentTarget.value,
                  );
                }}
                autoComplete="tel"
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
            </div>
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
            <div className={`users-form-row${role === "CUSTOMER" ? " single" : ""}`}>
            <DropdownSelect
              label="Rol"
              ariaLabel="Kullanıcı rolü"
              value={accessRoleId ?? role}
              onChange={(value) => { const custom = roleOptions.data?.find(item => item.id === value); setAccessRoleId(custom?.id ?? null); setRole(custom ? 'ADMIN' : value as Role); }}
              options={user?.accessRole ? [{ value: user.accessRole.id, label: user.accessRole.name }] : [...Object.entries(roles).map(([value, label]) => ({ value, label })), ...(roleOptions.data ?? []).map(item => ({ value: item.id, label: item.name }))]}
            />
            {role !== "CUSTOMER" && (
              <div className="users-department-control">
                <MultiDropdownSelect
                  label="Departman üyelikleri"
                  ariaLabel="Departman üyelikleri"
                  value={selectedDepartmentIds}
                  onChange={setSelectedDepartmentIds}
                  options={(departments.data ?? []).map((department) => ({ value: department.id, label: `${department.name}${department.isActive ? "" : " (Pasif)"}` }))}
                  emptyLabel={departments.isPending ? "Yükleniyor…" : "Departman seçin"}
                  selectionLabel={`${selectedDepartmentIds.length} departman seçili`}
                />
                <ErrorMessage error={departments.error} />
                {departments.data?.length === 0 && (
                  <p className="muted">Önce bir departman oluşturun.</p>
                )}
              </div>
            )}
            </div>
            {role !== 'CUSTOMER' && <StaffSkills initial={editing?.skills ?? []} />}
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
      {deleteTarget && !assignmentModalOpen && <DeleteModal title="Kullanıcıyı sil" pending={remove.isPending} onClose={() => setDeleteTarget(null)} onConfirm={() => remove.mutate({ id: deleteTarget.id }, { onSuccess: () => { if (editing?.id === deleteTarget.id) reset(); setDeleteTarget(null); } })} error={<ErrorMessage error={remove.error ?? prepareDelete.error} />}><p><strong>{deleteTarget.name}</strong> silinecek. Geçmiş görüşmeler korunur.</p></DeleteModal>}
      {assignmentModalOpen && (editing || deleteTarget) && <div className="confirm-backdrop assignment-transfer-backdrop" role="presentation">
        <section className="confirm-modal assignment-transfer-modal" role="dialog" aria-modal="true" aria-labelledby="assignment-transfer-title">
          <button type="button" className="confirm-close" aria-label="Pencereyi kapat" onClick={() => { setAssignmentModalOpen(false); if (assignmentAction === "delete") setDeleteTarget(null); }}><X size={20} /></button>
          <header className="assignment-transfer-header"><h2 id="assignment-transfer-title">{assignmentAction === "delete" ? "Personeli silmeden önce talepleri aktar" : "Açık talepleri aktar"}</h2><p><strong>{(assignmentAction === "delete" ? deleteTarget : editing)!.name}</strong> {assignmentAction === "delete" ? "kişisinin açık taleplerini gruplara ayırıp departmanlara, isteğe bağlı personele aktarın. Aktarım bitince personel silinir." : "kişisinin açık taleplerini gruplara ayırıp departmanlara, isteğe bağlı personele aktarın. İşlem bitince değişiklik kaydedilir."}</p></header>
          <div className="assignment-transfer-content">
            <section className="assignment-transfer-list-section">
              <div className="assignment-transfer-section-heading"><div><h3>Aktarılacak talepler</h3><span>{remainingAssignments.length} henüz gruplandırılmadı / {assignmentImpact.length} toplam</span></div><button type="button" className="button secondary" onClick={() => setSelectedAssignmentIds(remainingAssignments.map((conversation) => conversation.id))} disabled={!remainingAssignments.length}>Kalanların tümünü seç</button></div>
              {remainingAssignments.length ? <div className="assignment-transfer-table-wrap"><table className="management-table assignment-transfer-table"><thead><tr><th aria-label="Seçim" /><th>Talep</th><th>Mevcut departman</th><th>Atanan personel</th></tr></thead><tbody>{remainingAssignments.map((conversation) => <tr key={conversation.id}><td><input type="checkbox" aria-label={`${conversation.number} numaralı talebi seç`} checked={selectedAssignmentIds.includes(conversation.id)} onChange={(event) => setSelectedAssignmentIds((current) => event.target.checked ? [...current, conversation.id] : current.filter((id) => id !== conversation.id))} /></td><td><strong>#{conversation.number} · {conversation.subject}</strong><small>{conversation.customer.name} · {conversation.status}</small></td><td>{conversation.department.name}</td><td>{(assignmentAction === "delete" ? deleteTarget : editing)!.name}<small>Bu kullanıcı</small></td></tr>)}</tbody></table></div> : <p className="assignment-transfer-empty">Tüm açık talepler aktarım gruplarına eklendi.</p>}
              {!!transferGroups.length && <div className="assignment-transfer-groups"><h3>Aktarım grupları</h3>{transferGroups.map((group, index) => <article className="assignment-transfer-group" key={`${group.departmentId}-${index}`}><div><strong>Grup {index + 1} · {group.conversationIds.length} talep</strong><span>{group.departmentName} → {group.assignedAgentName ?? "Atanmamış (departman kuyruğu)"}</span><small>{group.conversationIds.map((id) => `#${assignmentImpact.find((conversation) => conversation.id === id)?.number ?? id}`).join(", ")}</small></div><button type="button" className="icon-button danger-icon" aria-label={`Grup ${index + 1} kaldır`} title="Grubu kaldır" onClick={() => { setTransferGroups((current) => current.filter((_, groupIndex) => groupIndex !== index)); setSelectedAssignmentIds((current) => [...current, ...group.conversationIds]); }}><Trash2 size={15} /></button></article>)}</div>}
            </section>
            <aside className="assignment-transfer-builder"><h3>Seçilenleri aktarım grubuna ekle</h3><p>{selectedAssignmentIds.length} talep seçildi. Farklı hedefler için bu adımı tekrarlayabilirsiniz.</p><DirectorySelect endpoint="/departments" label="Hedef departman" value={transferDepartmentId} onChange={(value) => { setTransferDepartmentId(value); setTransferAgentId(""); }} params={{ accessible: "true" }} /><DropdownSelect label="Atanan personel" ariaLabel="Aktarım hedefi personeli" value={transferAgentId} onChange={setTransferAgentId} options={[{ value: "", label: transferDepartmentId ? "Atanmamış · departman kuyruğu" : "Önce departman seçin" }, ...(editedUserCanReceive && !transferAgents.data?.some((agent) => agent.id === editing?.id) ? [{ value: editing!.id, label: `${editing!.name} (bu kullanıcı)` }] : []), ...(transferAgents.data ?? []).map((agent) => ({ value: agent.id, label: agent.name }))]} />{!canTransferDepartments && <small className="assignment-transfer-permission-note">Farklı departmana aktarım için “Talepleri departmanlar arasında aktar” izni gerekir.</small>}{!canAssignStaff && <small className="assignment-transfer-permission-note">Personel atama izni olmadan atanan kişiyi değiştiremez veya talebi kuyruğa bırakamazsınız.</small>}<button type="button" className="button secondary assignment-transfer-add" onClick={addTransferGroup} disabled={!selectedAssignmentIds.length || !transferDepartmentId || (!canTransferDepartments && selectedChangesDepartment) || (!canAssignStaff && transferAgentId !== editing?.id)}><Plus size={16} /> Aktarım grubuna ekle</button></aside>
          </div>
          <footer className="assignment-transfer-footer"><ErrorMessage error={checkAssignmentImpact.error ?? save.error ?? remove.error} /><div className="confirm-actions"><button type="button" className="button secondary" onClick={() => { setAssignmentModalOpen(false); if (assignmentAction === "delete") setDeleteTarget(null); }} disabled={save.isPending || remove.isPending}>Vazgeç</button><button type="button" className="button primary" onClick={applyTransferGroups} disabled={save.isPending || remove.isPending || remainingAssignments.length > 0 || !transferGroups.length || (transferGroupsNeedDepartmentPermission && !canTransferDepartments) || (!canAssignStaff && transferGroups.some((group) => group.assignedAgentId !== editing?.id))}>{save.isPending || remove.isPending ? "İşleniyor…" : <><Check size={16} /> {assignmentAction === "delete" ? "Aktarımları uygula ve kullanıcıyı sil" : "Aktarımları uygula ve kullanıcıyı kaydet"}</>}</button></div></footer>
        </section>
      </div>}
    </main>
  );
}

export function CustomersPage() {
  const {user} = useAuth();
  const queryClient = useQueryClient();
  const list = useList<ManagedUser>("/customers");
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [customerFiles, setCustomerFiles] = useState<File[]>([]);
  const [formVersion, setFormVersion] = useState(0);
  const [deleteTarget, setDeleteTarget] = useState<ManagedUser | null>(null);
  const [bulkSelectionMode, setBulkSelectionMode] = useState(false);
  const [selectedCustomerIds, setSelectedCustomerIds] = useState<string[]>([]);
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [filesCustomer, setFilesCustomer] = useState<ManagedUser | null>(null);
  const customerFormRef = useRef<HTMLElement>(null);
  useEffect(() => {
    setCustomerFiles([]);
  }, [customerModalOpen, formVersion]);
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
        <div className="customer-search-row"><Search value={list.search} onChange={list.setSearch} label="Ad, telefon veya e-posta ile ara" placeholder="" limit={list.limit} onLimitChange={list.setLimit} /><button className={`button ${bulkSelectionMode ? "danger" : "secondary"} customer-bulk-delete-button`} type="button" onClick={() => { if (!bulkSelectionMode) { setBulkSelectionMode(true); return; } if (selectedCustomerIds.length) { setBulkDeleteConfirm(true); return; } setBulkSelectionMode(false); }} aria-label={bulkSelectionMode ? "Seçilen müşterileri sil" : "Toplu sil"} title={bulkSelectionMode ? "Seçilen müşterileri sil" : "Toplu sil"}><Trash2 size={17} />{bulkSelectionMode && selectedCustomerIds.length > 0 && <span>{selectedCustomerIds.length}</span>}</button><button className="button primary customer-add-button" type="button" onClick={() => { save.reset(); setEditing(null); setCustomerModalOpen(true); }} aria-label="Yeni müşteri ekle">+</button></div>
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
                      <button className="icon-button" type="button" aria-label={`${customer.name} düzenle`} title="Düzenle" disabled={!hasPermission(user, 'customers.update')} onClick={() => edit(customer)}><Pencil size={15} aria-hidden="true" /></button>
                      <button className={`icon-button ${customer.customerFileCount ? '' : 'is-muted'}`} type="button" aria-label={`${customer.name} dosyaları gör`} title={customer.customerFileCount ? 'Dosyaları gör' : 'Dosya yok'} disabled={!customer.customerFileCount} onClick={() => setFilesCustomer(customer)}><Eye size={15} aria-hidden="true" /></button>
                      <button className="icon-button danger-icon" type="button" aria-label={`${customer.name} sil`} title="Sil" disabled={!hasPermission(user, 'customers.delete')} onClick={() => setDeleteTarget(customer)}><Trash2 size={15} aria-hidden="true" /></button>
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
          alwaysVisible
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
      {customerModalOpen && <div className="confirm-backdrop customer-form-backdrop" role="presentation">
      <section ref={customerFormRef} className="confirm-modal customer-form-panel" role="dialog" aria-modal="true" aria-labelledby="customer-form-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="customer-form-heading">
          <h2 id="customer-form-title">{editing ? "Müşteri bilgilerini düzenle" : "Yeni arayan müşteri"}</h2>
          <button className="customer-form-close" type="button" onClick={() => setCustomerModalOpen(false)} aria-label="Kapat" title="Kapat"><X size={18} /></button>
        </div>
        <form key={formVersion} className="management-form" onSubmit={event => {
          const values = formValues(event);
          const data = new FormData();
          for (const name of ['name', 'phone', 'email', 'company', 'staffNote', 'extraPhones', 'extraEmails']) { const value = values.get(name); if (typeof value === 'string' && value) data.append(name, value); }
          for (const file of customerFiles) if (file.size) data.append('files', file);
          save.mutate({ id: editing?.id, data });
        }}>
          <div className="customer-form-body">
          <label><span className="field-label">Ad soyad</span><input name="name" required minLength={2} maxLength={100} defaultValue={editing?.name} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase("tr-TR"); }}/></label>
          <label><span className="field-label">Telefon</span><input name="phone" required minLength={7} maxLength={30} inputMode="tel" defaultValue={formatPhone(editing?.phone ?? "")} onInput={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }}/></label>
          <label><span className="field-label">Ek telefonlar</span><input name="extraPhones" placeholder="Virgülle ayırabilirsiniz" defaultValue={editing?.extraPhones ?? ""} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.split(",").map((phone) => formatPhone(phone.trim())).filter(Boolean).join(", "); }} /></label>
          <label><span className="field-label">E-posta</span> <EmailInput name="email" defaultValue={editing?.email ?? ""} /></label>
          <label><span className="field-label">Ek e-posta adresleri</span><EmailInput name="extraEmails" multiple autoComplete="email" defaultValue={editing?.extraEmails ?? ""} /></label>
          <label><span className="field-label">Şirket</span> <input name="company" maxLength={120} defaultValue={editing?.company ?? ""}/></label>
          <label><span className="field-label">Müşteri notu</span> <textarea name="staffNote" maxLength={2000} rows={4} defaultValue={editing?.staffNote ?? ""} placeholder="Örn. Arama nedeni, tercih ettiği dönüş saati veya personel için önemli bilgi"/></label>
          <div className="customer-form-upload">
            <label><span className="field-label">Dosya ekle</span><input type="file" name="customerFiles" multiple disabled={save.isPending} onChange={(event) => { setCustomerFiles(Array.from(event.currentTarget.files ?? [])); event.currentTarget.value = ""; }} /></label>
            <ComposerFiles files={customerFiles} setFiles={setCustomerFiles} disabled={save.isPending} />
          </div>
          <ErrorMessage error={save.error}/>
          </div>
          <footer className="customer-form-footer">
            <button className="button secondary" type="button" onClick={() => setCustomerModalOpen(false)} disabled={save.isPending}>İptal</button>
            <button className="button primary" type="submit" disabled={save.isPending}>{save.isPending ? "Kaydediliyor…" : "Kaydet"}</button>
          </footer>
        </form>
      </section>
      </div>}
      {filesCustomer && <div className="confirm-backdrop" role="presentation"><section className="attachment-preview-modal customer-files-modal" role="dialog" aria-modal="true" aria-label={`${filesCustomer.name} dosyaları`} onMouseDown={(event) => event.stopPropagation()}><div className="customer-form-heading"><h2>{filesCustomer.name} - Dosyalar</h2><button className="standard-modal-close" type="button" onClick={() => setFilesCustomer(null)} aria-label="Kapat"><X size={18} /></button></div>{files.isPending ? <p className="muted">Dosyalar yükleniyor...</p> : files.error ? <ErrorMessage error={files.error} /> : files.data?.length ? <div className="customer-files-list">{files.data.map(file => <CustomerFileRow key={file.id} customerId={filesCustomer.id} file={file} onDelete={() => deleteFile.mutate({ customerId: filesCustomer.id, fileId: file.id })} />)}</div> : <p className="muted">Bu müşteriye ait dosya bulunmuyor.</p>}</section></div>}
    </main>
  );
}

export function PhoneSupportPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { completePhoneRequest } = useWorkSession();
  function openCreatedConversation(id: string) {
    const path = conversationPath(user!.role, id);
    completePhoneRequest(path);
    navigate(path);
  }
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
  const [channel, setChannel] = useState<OutgoingChannel>("EMAIL");
  const [channelFormError, setChannelFormError] = useState("");
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
  const displayResults = hasSearched && !showCreate ? results : [];
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
      const candidates = Array.from(document.querySelectorAll<HTMLInputElement>(`.phone-support-create input[name='${field}']`));
      candidates.find((input) => input.offsetParent !== null)?.focus();
    }, 0);
  }, [showCreate, search]);
  function searchCustomers(value: string) {
    setSearch(value);
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
    if (channel === "EMAIL" && !String(values.get("email") ?? "").trim()) {
      setChannelFormError("E-posta kanalını kullanmak için yeni müşterinin e-posta adresini girin veya başka kanal seçin.");
      return;
    }
    setChannelFormError("");
    createCustomer.mutate(
      { data: { name: values.get("name"), phone: values.get("phone"), email: values.get("email") || undefined, company: values.get("company") || undefined, staffNote: values.get("staffNote") || undefined } },
      { onSuccess: (result) => {
        const customer = (result as { data: { data: ManagedUser } }).data.data;
        createConversation.mutate(
          { data: { customerId: customer.id, departmentId, channel, source: "PHONE_SUPPORT", subject: values.get("subject"), message: values.get("message"), priority: "NORMAL", websiteId: values.get("websiteId") || undefined, assignedAgentId: values.get("assignedAgentId") || undefined, tagIds } },
          { onSuccess: (conversationResult) => openCreatedConversation((conversationResult as { data: { data: Conversation } }).data.data.id) },
        );
      } },
    );
  }
  function submitConversation(event: FormEvent<HTMLFormElement>) {
    const values = formValues(event);
    createConversation.mutate(
      { data: { customerId, departmentId, channel, source: "PHONE_SUPPORT", subject: values.get("subject"), message: values.get("message"), priority: "NORMAL", websiteId: values.get("websiteId") || undefined, assignedAgentId: values.get("assignedAgentId") || undefined, tagIds } },
      { onSuccess: (result) => openCreatedConversation((result as { data: { data: Conversation } }).data.data.id) },
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
              <input type="search" value={search} onChange={(event) => searchCustomers(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") { event.preventDefault(); searchCustomers(event.currentTarget.value); setEnterCreateRequested(false); setShowCreate(true); } }} placeholder="Arayanın telefonu, e-postası veya adı" autoFocus />
              <button type="button" className="button primary phone-support-add" onClick={() => setShowCreate(true)} aria-label="Yeni kişi ekle" title="Yeni kişi ekle">+</button>
            </span>
          </label>
          {!hasSearched && <p className="management-empty phone-support-empty">Arayan kişinin bilgilerini yazmaya başlayın.</p>}
          {hasSearched && <ListState loading={customers.isPending} error={customers.error} empty={false} />}
          {displayResults.map((customer) => <button className={`customer-choice ${customerId === customer.id ? "selected" : ""}`} type="button" key={customer.id} onClick={() => selectCustomer(customer)}><strong>{customer.name}</strong><span>{customer.phone ?? "Telefon yok"} · {customer.email ?? "E-posta yok"}</span>{customer.company && <small>{customer.company}</small>}{customer.staffNote && <small>Personel notu: {customer.staffNote}</small>}</button>)}
          {noResults && <p className="phone-support-no-result">Eşleşen kişi bulunamadı. Sağdaki <strong>+</strong> düğmesiyle arayanı ekleyin.</p>}
          {hasSearched && <Pagination pagination={customers.data?.pagination} onChange={setPhonePage} />}
          {showCreate && <form className="management-form phone-support-create" onSubmit={submitCustomer}><h2>Yeni arayan kişi</h2><label><span className="field-label">Ad soyad</span><input name="name" required minLength={2} maxLength={100} defaultValue={!isPhoneSearch(search) && !isEmailSearch(search) ? search.toLocaleUpperCase("tr-TR") : ""} onInput={(event) => { event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase("tr-TR"); }} onKeyDown={focusNextField} /></label><label><span className="field-label">Telefon</span><input name="phone" required minLength={7} maxLength={30} inputMode="tel" defaultValue={isPhoneSearch(search) ? formatPhone(search) : ""} onInput={(event) => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} onKeyDown={focusNextField} /></label><label><span className="field-label">E-posta</span><EmailInput name="email" defaultValue={isEmailSearch(search) ? search.trim().toLowerCase() : ""} /></label><label><span className="field-label">Şirket</span><input name="company" maxLength={120} /></label><label><span className="field-label">Müşteri notu</span><textarea name="staffNote" maxLength={2000} rows={3} placeholder="İsteğe bağlı kalıcı müşteri notu" /></label><div className="phone-support-ticket-fields"><h2>Talep bilgileri</h2><label><span className="field-label">Konu</span><input name="subject" required minLength={5} maxLength={200} /></label><DirectorySelect endpoint="/departments" label="Departman" value={departmentId} onChange={setDepartmentId} params={{ accessible: "true" }} /><FormDropdown name="priority" label="Öncelik" defaultValue="NORMAL" options={Object.entries(priorities).map(([value, label]) => ({ value, label }))} /><TagSelect value={tagIds} onChange={setTagIds} /><label><span className="field-label">Açıklama</span><textarea name="message" required maxLength={10000} rows={7} placeholder="Örn. Ödeme ekranında hata alıyor; hata mesajı: …" /></label></div><ErrorMessage error={createCustomer.error ?? createConversation.error} /><div className="management-actions"><button className="button primary" disabled={createCustomer.isPending || createConversation.isPending || !departmentId}>{createCustomer.isPending || createConversation.isPending ? "Kaydediliyor…" : "Kişiyi ve talebi oluştur"}</button><button className="button secondary" type="button" onClick={() => setShowCreate(false)}>Vazgeç</button></div></form>}
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
              <PhoneRequestFields departmentId={departmentId} setDepartmentId={setDepartmentId} websiteId={websiteId} setWebsiteId={setWebsiteId} assignedAgentId={assignedAgentId} setAssignedAgentId={setAssignedAgentId} channel={channel} setChannel={setChannel} />
            </section>
            {channelFormError && <p className="error">{channelFormError}</p>}
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
          <PhoneRequestFields departmentId={departmentId} setDepartmentId={setDepartmentId} websiteId={websiteId} setWebsiteId={setWebsiteId} assignedAgentId={assignedAgentId} setAssignedAgentId={setAssignedAgentId} channel={channel} setChannel={setChannel} customer={activeCustomer} />
            <ErrorMessage error={createConversation.error} />
            <div className="management-actions"><button className="button primary" disabled={createConversation.isPending || !departmentId}>{createConversation.isPending ? "Oluşturuluyor…" : "Talebi oluştur ve gönder"}</button></div>
          </form>
        </section>}
      </div>
    </main>
  );
}
