import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Handshake, MessagesSquare, Plus, Download, Trash2, Eye, X, Users, History, Pencil, Check } from 'lucide-react';
import { api } from '../../services/api';
import type { User } from '../../types';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { AgreementWorkspace, CreditHistory } from '../agreements/Agreements';
import { CompanyPeoplePanel } from './CompanyPeople';
import { CustomerRequests } from './CustomerRequests';
import { PhoneSupportPage } from './People';
import { EmailInput } from '../../components/EmailInput';
import { displayEmail } from '../../utils/email';
import { formatPhone } from '../../utils/phone';
import { ErrorMessage } from './shared';
import './customer-management.css';

type Customer = User & { isActive: boolean; parentCustomerId?: string | null };
type Person = { id: string; name: string; company?: string | null };
type Section = { id: string; label: string; icon: typeof Building2; permission?: string };
const sections: Section[] = [
  { id: 'details', label: 'Müşteri Bilgileri', icon: Building2 },
  { id: 'agreements', label: 'Anlaşmalar ve Krediler', icon: Handshake },
  { id: 'people', label: 'Şirkete Bağlı Kişiler', icon: Users },
  { id: 'history', label: 'Kredi Hareketleri', icon: History },
  { id: 'conversations', label: 'Görüşmeler', icon: MessagesSquare, permission: 'conversations.view' },
  { id: 'request', label: 'Talep Aç', icon: Plus, permission: 'conversations.create' },
];

export function CustomerManagementPage() {
  const { customerId = '' } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState(false);
  const customer = useQuery({ queryKey: ['/customers', customerId], queryFn: async () => (await api.get<{ data: Customer }>(`/customers/${customerId}`)).data.data });
  const relations = useQuery({
    queryKey: ['customer-relations', customerId],
    queryFn: async () => (await api.get<{ data: { customer: Person; children: Person[] } }>(`/customers/${customerId}/relations`)).data.data,
    enabled: Boolean(customer.data && !customer.data.parentCustomerId),
  });
  const tabs = sections.filter(section =>
    (!section.permission || hasPermission(user, section.permission)) &&
    (section.id !== 'people' || Boolean(customer.data && !customer.data.parentCustomerId)),
  );
  const requested = params.get('section') === 'company'
    ? params.get('companySection') ?? 'agreements'
    : params.get('section');
  const active = tabs.find(section => section.id === requested) ?? tabs[0];
  const people: Person[] | undefined = customer.data && relations.data
    ? [
        { id: customer.data.id, name: customer.data.company || customer.data.name },
        ...relations.data.children.map(person => ({ id: person.id, name: person.name })),
      ]
    : undefined;
  const changeSection = (id: string) => setParams(current => {
    const next = new URLSearchParams(current);
    next.set('section', id);
    next.delete('companySection');
    return next;
  });

  return <main className="page customer-management-page" key={customerId}>
    <Link className="customer-management-back" to=".." relative="path"><ArrowLeft size={17} /> Müşterilere Dön</Link>
    {customer.isPending && <p role="status">Müşteri yükleniyor…</p>}
    <ErrorMessage error={customer.error} />
    {customer.data && <>
      <header className="customer-management-heading"><div><h1>{customer.data.company || customer.data.name}</h1><p>{customer.data.name}</p></div></header>
      <nav className="integration-tabs customer-management-tabs" aria-label="Müşteri yönetimi bölümleri">
        {tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={active.id === id ? 'active' : ''} aria-current={active.id === id ? 'page' : undefined} disabled={pending} onClick={() => changeSection(id)}><Icon size={18} />{label}</button>)}
      </nav>
      <section className="customer-management-content" aria-label={active.label} key={`${customerId}-${active.id}`}>
        {active.id === 'details' && <div className="customer-details-layout"><CustomerDetails customer={customer.data} /><CustomerFiles customer={customer.data} /></div>}
        {active.id === 'agreements' && <CustomerAgreements customerId={customerId} />}
        {active.id === 'people' && <CompanyPeoplePanel customer={customer.data} onPendingChange={setPending} />}
        {active.id === 'history' && <CreditHistory customerId={customerId} />}
        {active.id === 'conversations' && <CustomerRequests customerId={customerId} name={customer.data.name} expanded people={people} />}
        {active.id === 'request' && <PhoneSupportPage key={customerId} fixedCustomerId={customerId} />}
      </section>
    </>}
  </main>;
}

function CustomerAgreements({ customerId }: { customerId: string }) {
  return <AgreementWorkspace customerId={customerId} showAvailableBalance />;
}

function CustomerDetails({ customer }: { customer: Customer }) {
  const { user } = useAuth();
  const editable = hasPermission(user, 'customers.update');
  const client = useQueryClient();
  const [notice, setNotice] = useState('');
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(''), 3000);
    return () => window.clearTimeout(timer);
  }, [notice]);
  const save = useMutation({
    mutationFn: (data: FormData) => api.patch(`/customers/${customer.id}`, data),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ['/customers'] });
      setNotice('Müşteri bilgileri kaydedildi.');
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (editable && !save.isPending) save.mutate(new FormData(event.currentTarget)); }
  return <form className="management-form customer-details-form" onSubmit={submit}>
    <fieldset disabled={!editable || save.isPending} key={customer.id + customer.company + customer.name + customer.phone + customer.email}>
      <label><span className="field-label">Şirket Adı *</span><input name="company" required minLength={2} maxLength={120} defaultValue={customer.company ?? ''} /></label>
      <label><span className="field-label">Ad Soyad *</span><input name="name" required minLength={2} maxLength={100} defaultValue={customer.name} onInput={event => { event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase('tr-TR'); }} /></label>
      <label><span className="field-label">Telefon *</span><input name="phone" required minLength={7} maxLength={30} inputMode="tel" defaultValue={formatPhone(customer.phone ?? '')} onInput={event => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} /></label>
      <label><span className="field-label">E-Posta *</span><EmailInput name="email" required defaultValue={displayEmail(customer.email)} /></label>
      <label><span className="field-label">Ek Telefon</span><input name="extraPhones" maxLength={500} defaultValue={customer.extraPhones ?? ''} /></label>
      <label><span className="field-label">Ek E-Posta</span><EmailInput name="extraEmails" multiple defaultValue={customer.extraEmails ?? ''} /></label>
      <label className="customer-details-wide"><span className="field-label">Müşteri Notu</span><textarea name="staffNote" className="customer-note-field" maxLength={2000} rows={4} defaultValue={customer.staffNote ?? ''} /></label>
    </fieldset>
    <ErrorMessage error={save.error} />
    {editable && <footer><button className="button primary" disabled={save.isPending}>{save.isPending ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}</button></footer>}
    {notice && <div className="management-toast" role="status">{notice}</div>}
  </form>;
}

type CustomerFile = { id: string; originalName: string; size: number; mimeType?: string };
function FilePreview({ customerId, file }: { customerId: string; file: CustomerFile }) {
  const preview = useQuery({ queryKey: ['/customers', customerId, 'file-preview', file.id], enabled: Boolean(file.mimeType?.startsWith('image/')), queryFn: async () => (await api.get(`/customers/${customerId}/files/${file.id}/download`, { responseType: 'blob' })).data as Blob });
  const [url, setUrl] = useState('');
  useEffect(() => { if (!preview.data) return; const next = URL.createObjectURL(preview.data); setUrl(next); return () => URL.revokeObjectURL(next); }, [preview.data]);
  return url ? <img className="customer-management-file-preview" src={url} alt={file.originalName} /> : null;
}
function splitFileName(name: string) {
  const dot = name.lastIndexOf('.');
  return dot > 0 ? { stem: name.slice(0, dot), ext: name.slice(dot) } : { stem: name, ext: '' };
}
function CustomerFiles({ customer }: { customer: Customer }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const canEdit = hasPermission(user, 'customers.update');
  const [selected, setSelected] = useState<{ file: File; stem: string; ext: string }[]>([]);
  const [opened, setOpened] = useState<CustomerFile | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const files = useQuery({ queryKey: ['/customers', customer.id, 'files'], queryFn: async () => (await api.get<{ data: CustomerFile[] }>(`/customers/${customer.id}/files`)).data.data });
  const upload = useMutation({
    mutationFn: async () => {
      const data = new FormData();
      selected.forEach(({ file, stem, ext }) => {
        const cleanStem = stem.trim();
        const finalName = cleanStem ? `${cleanStem}${ext}` : file.name;
        const nextFile = finalName === file.name ? file : new File([file], finalName, { type: file.type, lastModified: file.lastModified });
        data.append('files', nextFile);
      });
      await api.patch(`/customers/${customer.id}`, data);
    },
    onSuccess: async () => { setSelected([]); await client.invalidateQueries({ queryKey: ['/customers'] }); },
  });
  const rename = useMutation({
    mutationFn: ({ fileId, name }: { fileId: string; name: string }) => api.patch<{ data: CustomerFile }>(`/customers/${customer.id}/files/${fileId}`, { name }),
    onSuccess: async (response) => {
      const updated = response.data.data;
      setEditingId(null);
      setEditingName('');
      if (opened?.id === updated.id) setOpened(updated);
      await client.invalidateQueries({ queryKey: ['/customers', customer.id, 'files'] });
    },
  });
  const remove = useMutation({ mutationFn: (fileId: string) => api.delete(`/customers/${customer.id}/files/${fileId}`), onSuccess: async (_, fileId) => { if (opened?.id === fileId) setOpened(null); if (editingId === fileId) setEditingId(null); await client.invalidateQueries({ queryKey: ['/customers'] }); } });
  const download = useMutation({ mutationFn: async (file: CustomerFile) => { const response = await api.get(`/customers/${customer.id}/files/${file.id}/download`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = file.originalName; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } });
  const startRename = (file: CustomerFile) => {
    if (!canEdit || rename.isPending) return;
    rename.reset();
    setEditingId(file.id);
    setEditingName(splitFileName(file.originalName).stem);
  };
  const submitRename = (file: CustomerFile) => {
    const trimmed = editingName.trim();
    if (!trimmed || rename.isPending) return;
    const { ext } = splitFileName(file.originalName);
    rename.mutate({ fileId: file.id, name: `${trimmed}${ext}` });
  };
  return <div className="customer-files-workspace"><h2>Müşteri Dosyaları</h2>
    {canEdit && <form className="customer-file-upload" onSubmit={event => { event.preventDefault(); if (selected.length && !upload.isPending) upload.mutate(); }}>
      <label><span className="field-label">Dosya Ekle</span><input type="file" multiple disabled={upload.isPending} onChange={event => { const picked = Array.from(event.target.files ?? []).map(file => ({ file, ...splitFileName(file.name) })); setSelected(picked); event.target.value = ''; }} /></label>
      {selected.length > 0 && <div className="customer-pending-uploads">
        {selected.map((item, idx) => <div className="customer-pending-upload-row" key={`${item.file.name}-${idx}`}>
          <input type="text" aria-label={`Dosya adı (${item.file.name})`} maxLength={160} disabled={upload.isPending} value={item.stem} onChange={e => setSelected(prev => prev.map((entry, i) => i === idx ? { ...entry, stem: e.target.value } : entry))} placeholder="Dosya adı" />
          {item.ext && <span className="customer-file-ext">{item.ext}</span>}
          <button className="icon-button" type="button" disabled={upload.isPending} aria-label="Dosyayı kaldır" onClick={() => setSelected(prev => prev.filter((_, i) => i !== idx))}><X size={15} /></button>
        </div>)}
        <button className="button primary" disabled={upload.isPending}>{upload.isPending ? 'Yükleniyor…' : 'Dosyaları Yükle'}</button>
      </div>}
    </form>}
    <ErrorMessage error={files.error || upload.error || rename.error || remove.error || download.error} />
    {files.isPending && <p role="status">Dosyalar yükleniyor…</p>}
    {files.data?.length === 0 && <p className="muted">Bu müşteriye ait dosya bulunmuyor.</p>}
    {!!files.data?.length && <div className="customer-files-list">
      {files.data.map(file => {
        const isEditing = editingId === file.id;
        const { ext } = splitFileName(file.originalName);
        return <div className="customer-management-file" key={file.id}>
          <div className="customer-management-file-top">
            <FilePreview customerId={customer.id} file={file} />
            <div className="customer-management-file-info">
              {isEditing ? <form className="customer-file-rename-form" onSubmit={e => { e.preventDefault(); submitRename(file); }}>
                <div className="customer-file-rename-input">
                  <input type="text" autoFocus maxLength={160} disabled={rename.isPending} value={editingName} onChange={e => setEditingName(e.target.value)} onKeyDown={e => { if (e.key === 'Escape') { e.preventDefault(); setEditingId(null); } }} aria-label="Yeni dosya adı" />
                  {ext && <span className="customer-file-ext">{ext}</span>}
                </div>
                <div className="management-actions">
                  <button className="icon-button" type="submit" disabled={rename.isPending || !editingName.trim()} aria-label="Dosya adını kaydet" title="Kaydet"><Check size={15} /></button>
                  <button className="icon-button" type="button" disabled={rename.isPending} aria-label="Ad değiştirmeden vazgeç" title="Vazgeç" onClick={() => setEditingId(null)}><X size={15} /></button>
                </div>
              </form> : <button className="customer-file-open" type="button" title={canEdit ? 'Açmak için tıklayın, yeniden adlandırmak için çift tıklayın' : file.originalName} onClick={() => setOpened(file)} onDoubleClick={e => { e.preventDefault(); startRename(file); }}>{file.originalName}</button>}
              <small>{Math.ceil(file.size / 1024)} KB</small>
            </div>
          </div>
          <div className="management-actions customer-management-file-actions">
            {canEdit && !isEditing && <button className="icon-button" type="button" aria-label={`${file.originalName} adını düzenle`} title="Adı düzenle" onClick={() => startRename(file)}><Pencil size={16} /></button>}
            <button className="icon-button" type="button" aria-label={`${file.originalName} aç`} title="Önizle" onClick={() => setOpened(file)}><Eye size={17} /></button>
            <button className="icon-button" type="button" disabled={download.isPending} aria-label={`${file.originalName} indir`} title="İndir" onClick={() => download.mutate(file)}><Download size={17} /></button>
            {hasPermission(user, 'customers.delete') && <button className="icon-button danger-icon" type="button" disabled={remove.isPending} aria-label={`${file.originalName} sil`} title="Sil" onClick={() => remove.mutate(file.id)}><Trash2 size={17} /></button>}
          </div>
        </div>;
      })}
    </div>}
    {opened && <CustomerFileViewer key={opened.id} customerId={customer.id} file={opened} onDownload={() => download.mutate(opened)} onClose={() => setOpened(null)} />}
  </div>;
}

function CustomerFileViewer({ customerId, file, onDownload, onClose }: { customerId: string; file: CustomerFile; onDownload: () => void; onClose: () => void }) {
  const query = useQuery({ queryKey: ['/customers', customerId, 'file-preview', file.id], queryFn: async () => (await api.get(`/customers/${customerId}/files/${file.id}/download`, { responseType: 'blob' })).data as Blob });
  const [url, setUrl] = useState('');
  useEffect(() => { if (!query.data) return; const next = URL.createObjectURL(query.data); setUrl(next); return () => URL.revokeObjectURL(next); }, [query.data]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  return createPortal(
    <div className="customer-file-modal-backdrop" role="presentation" onMouseDown={onClose}>
      <section className="customer-file-modal" role="dialog" aria-modal="true" aria-label={file.originalName} onMouseDown={event => event.stopPropagation()}>
        <header className="customer-file-modal-header">
          <h3>{file.originalName}</h3>
          <div className="management-actions">
            <button className="icon-button" type="button" aria-label={`${file.originalName} indir`} title="İndir" onClick={onDownload}><Download size={17} /></button>
            <button className="icon-button" type="button" aria-label="Dosya görüntülemeyi kapat" title="Kapat" onClick={onClose}><X size={18} /></button>
          </div>
        </header>
        <div className="customer-file-modal-body">
          <ErrorMessage error={query.error} />
          {query.isPending && <p role="status">Dosya açılıyor…</p>}
          {url && (file.mimeType?.startsWith('image/')
            ? <img src={url} alt={file.originalName} />
            : file.mimeType === 'application/pdf'
              ? <iframe title={file.originalName} src={url} />
              : <p>Bu dosya türü burada görüntülenemiyor. Dosyayı indirerek açabilirsiniz.</p>)}
        </div>
      </section>
    </div>,
    document.body,
  );
}
