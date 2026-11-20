import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Handshake, MessagesSquare, Plus, Download, Trash2, Eye, X } from 'lucide-react';
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
const sections = [
  { id: 'details', label: 'Müşteri Bilgileri', icon: Building2 },
  { id: 'company', label: 'Şirket Yönetimi', icon: Handshake },
  { id: 'conversations', label: 'Görüşmeler', icon: MessagesSquare, permission: 'conversations.view' },
  { id: 'request', label: 'Talep Aç', icon: Plus, permission: 'conversations.create' },
];

export function CustomerManagementPage() {
  const { customerId = '' } = useParams();
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const [pending, setPending] = useState(false);
  const customer = useQuery({ queryKey: ['/customers', customerId], queryFn: async () => (await api.get<{ data: Customer }>(`/customers/${customerId}`)).data.data });
  const tabs = sections.filter(section => !section.permission || hasPermission(user, section.permission));
  const requestedSection = params.get('section');
  const active = tabs.find(section => section.id === (['people', 'agreements', 'history'].includes(requestedSection ?? '') ? 'company' : requestedSection)) ?? tabs[0];
  const companyPages = [{ id: 'agreements', label: 'Anlaşmalar ve Krediler' }, ...(!customer.data?.parentCustomerId ? [{ id: 'people', label: 'Şirkete Bağlı Kişiler' }] : []), { id: 'history', label: 'Kredi Hareketleri' }];
  const companyPage = companyPages.find(page => page.id === (params.get('companySection') ?? requestedSection)) ?? companyPages[0];
  return <main className="page customer-management-page" key={customerId}>
    <Link className="customer-management-back" to=".." relative="path"><ArrowLeft size={17} /> Müşterilere Dön</Link>
    {customer.isPending && <p role="status">Müşteri yükleniyor…</p>}
    <ErrorMessage error={customer.error} />
    {customer.data && <>
      <header className="customer-management-heading"><div><span className="muted">Müşteri / Şirket Yönetimi</span><h1>{customer.data.company || customer.data.name}</h1><p>{customer.data.name}</p></div><span className={`customer-management-status ${customer.data.isActive ? 'active' : ''}`}>{customer.data.isActive ? 'Aktif' : 'Pasif'}</span></header>
      <nav className="integration-tabs customer-management-tabs" aria-label="Müşteri yönetimi bölümleri">{tabs.map(({ id, label, icon: Icon }) => <button key={id} type="button" className={active.id === id ? 'active' : ''} aria-current={active.id === id ? 'page' : undefined} disabled={pending} onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('section', id); return next; })}><Icon size={18} />{label}</button>)}</nav>
      <section className={`customer-management-content${active.id === 'company' ? ' customer-management-content--company' : ''}`} aria-label={active.label} key={`${customerId}-${active.id}`}>
        {active.id === 'details' && <><CustomerDetails customer={customer.data} /><CustomerFiles customer={customer.data} /></>}
        {active.id === 'company' && <div className="customer-company-workspace">
          <nav className="integration-subtabs customer-company-pages" aria-label="Şirket yönetimi sayfaları">{companyPages.map(page => <button key={page.id} type="button" className={companyPage.id === page.id ? 'active' : ''} aria-current={companyPage.id === page.id ? 'page' : undefined} disabled={pending} onClick={() => setParams(current => { const next = new URLSearchParams(current); next.set('section', 'company'); next.set('companySection', page.id); return next; })}>{page.label}</button>)}</nav>
          <section aria-label={companyPage.label} key={companyPage.id}>
            {companyPage.id === 'agreements' && <><h2>Anlaşmalar ve Krediler</h2><CustomerAgreements customerId={customerId} /></>}
            {companyPage.id === 'people' && <CompanyPeoplePanel customer={customer.data} onPendingChange={setPending} />}
            {companyPage.id === 'history' && <><h2>Kredi Hareketleri</h2><CreditHistory customerId={customerId} /></>}
          </section>
        </div>}
        {active.id === 'conversations' && <CustomerRequests customerId={customerId} name={customer.data.name} expanded />}
        {active.id === 'request' && <PhoneSupportPage key={customerId} fixedCustomerId={customerId} />}
      </section>
    </>}
  </main>;
}

function CustomerAgreements({ customerId }: { customerId: string }) {
  const summary = useQuery({ queryKey: ['agreements', customerId], queryFn: async () => (await api.get(`/customers/${customerId}/agreements`)).data.data as { availableCredits: number } });
  return <>{summary.data && <p className="customer-credit-balance">Kullanılabilir kredi: <strong>{summary.data.availableCredits.toLocaleString('tr-TR')}</strong></p>}<AgreementWorkspace customerId={customerId} /></>;
}

function CustomerDetails({ customer }: { customer: Customer }) {
  const { user } = useAuth();
  const editable = hasPermission(user, 'customers.update');
  const client = useQueryClient();
  const save = useMutation({ mutationFn: (data: FormData) => api.patch(`/customers/${customer.id}`, data), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['/customers'] }); } });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); if (editable && !save.isPending) save.mutate(new FormData(event.currentTarget)); }
  return <form className="management-form customer-details-form" onSubmit={submit}>
    <div className="customer-section-heading"><h2>Şirket ve Müşteri Bilgileri</h2><p>Şirketi ve şirketin ana iletişim kişisini buradan yönetin.</p></div>
    <fieldset disabled={!editable || save.isPending} key={customer.id + customer.company + customer.name + customer.phone + customer.email}>
      <label><span className="field-label">Şirket Adı *</span><input name="company" required minLength={2} maxLength={120} defaultValue={customer.company ?? ''} /></label>
      <label><span className="field-label">Ad Soyad *</span><input name="name" required minLength={2} maxLength={100} defaultValue={customer.name} onInput={event => { event.currentTarget.value = event.currentTarget.value.toLocaleUpperCase('tr-TR'); }} /></label>
      <label><span className="field-label">Telefon *</span><input name="phone" required minLength={7} maxLength={30} inputMode="tel" defaultValue={formatPhone(customer.phone ?? '')} onInput={event => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} /></label>
      <label><span className="field-label">E-Posta *</span><EmailInput name="email" required defaultValue={displayEmail(customer.email)} /></label>
      <label><span className="field-label">Ek Telefon</span><input name="extraPhones" maxLength={500} defaultValue={customer.extraPhones ?? ''} /></label>
      <label><span className="field-label">Ek E-Posta</span><EmailInput name="extraEmails" multiple defaultValue={customer.extraEmails ?? ''} /></label>
      <label className="customer-details-wide"><span className="field-label">Müşteri Notu</span><textarea name="staffNote" maxLength={2000} rows={4} defaultValue={customer.staffNote ?? ''} /></label>
    </fieldset>
    <ErrorMessage error={save.error} />{save.isSuccess && <p role="status">Müşteri bilgileri kaydedildi.</p>}
    {editable && <footer><button className="button primary" disabled={save.isPending}>{save.isPending ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}</button></footer>}
  </form>;
}

type CustomerFile = { id: string; originalName: string; size: number; mimeType?: string };
function FilePreview({ customerId, file }: { customerId: string; file: CustomerFile }) {
  const preview = useQuery({ queryKey: ['/customers', customerId, 'file-preview', file.id], enabled: Boolean(file.mimeType?.startsWith('image/')), queryFn: async () => (await api.get(`/customers/${customerId}/files/${file.id}/download`, { responseType: 'blob' })).data as Blob });
  const [url, setUrl] = useState('');
  useEffect(() => { if (!preview.data) return; const next = URL.createObjectURL(preview.data); setUrl(next); return () => URL.revokeObjectURL(next); }, [preview.data]);
  return url ? <img className="customer-management-file-preview" src={url} alt={file.originalName} /> : null;
}
function CustomerFiles({ customer }: { customer: Customer }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const [selected, setSelected] = useState<File[]>([]);
  const [opened, setOpened] = useState<CustomerFile | null>(null);
  const files = useQuery({ queryKey: ['/customers', customer.id, 'files'], queryFn: async () => (await api.get<{ data: CustomerFile[] }>(`/customers/${customer.id}/files`)).data.data });
  const upload = useMutation({ mutationFn: async () => { const data = new FormData(); selected.forEach(file => data.append('files', file)); await api.patch(`/customers/${customer.id}`, data); }, onSuccess: async () => { setSelected([]); await client.invalidateQueries({ queryKey: ['/customers'] }); } });
  const remove = useMutation({ mutationFn: (fileId: string) => api.delete(`/customers/${customer.id}/files/${fileId}`), onSuccess: async (_, fileId) => { if (opened?.id === fileId) setOpened(null); await client.invalidateQueries({ queryKey: ['/customers'] }); } });
  const download = useMutation({ mutationFn: async (file: CustomerFile) => { const response = await api.get(`/customers/${customer.id}/files/${file.id}/download`, { responseType: 'blob' }); const url = URL.createObjectURL(response.data); const link = document.createElement('a'); link.href = url; link.download = file.originalName; document.body.appendChild(link); link.click(); link.remove(); window.setTimeout(() => URL.revokeObjectURL(url), 1000); } });
  return <div className="customer-files-workspace"><h2>Müşteri Dosyaları</h2>
    {hasPermission(user, 'customers.update') && <form className="customer-file-upload" onSubmit={event => { event.preventDefault(); if (selected.length && !upload.isPending) upload.mutate(); }}><label><span className="field-label">Dosya Ekle</span><input type="file" multiple disabled={upload.isPending} onChange={event => { setSelected(Array.from(event.target.files ?? [])); event.target.value = ''; }} /></label>{selected.length > 0 && <><p>{selected.map(file => file.name).join(', ')}</p><button className="button primary" disabled={upload.isPending}>{upload.isPending ? 'Yükleniyor…' : 'Dosyaları Yükle'}</button></>}</form>}
    <ErrorMessage error={files.error || upload.error || remove.error || download.error} />
    {files.isPending && <p role="status">Dosyalar yükleniyor…</p>}
    {files.data?.length === 0 && <p className="muted">Bu müşteriye ait dosya bulunmuyor.</p>}
    {files.data?.map(file => <div className="customer-management-file" key={file.id}><FilePreview customerId={customer.id} file={file} /><div className="customer-management-file-info"><button className="customer-file-open" type="button" onClick={() => setOpened(file)}>{file.originalName}</button><small>{Math.ceil(file.size / 1024)} KB</small></div><div className="management-actions"><button className="icon-button" type="button" aria-label={`${file.originalName} aç`} onClick={() => setOpened(file)}><Eye size={17} /></button><button className="icon-button" type="button" disabled={download.isPending} aria-label={`${file.originalName} indir`} onClick={() => download.mutate(file)}><Download size={17} /></button>{hasPermission(user, 'customers.delete') && <button className="icon-button danger-icon" type="button" disabled={remove.isPending} aria-label={`${file.originalName} sil`} onClick={() => remove.mutate(file.id)}><Trash2 size={17} /></button>}</div></div>)}
    {opened && <CustomerFileViewer key={opened.id} customerId={customer.id} file={opened} onClose={() => setOpened(null)} />}
  </div>;
}

function CustomerFileViewer({ customerId, file, onClose }: { customerId: string; file: CustomerFile; onClose: () => void }) {
  const query = useQuery({ queryKey: ['/customers', customerId, 'file-preview', file.id], queryFn: async () => (await api.get(`/customers/${customerId}/files/${file.id}/download`, { responseType: 'blob' })).data as Blob });
  const [url, setUrl] = useState('');
  useEffect(() => { if (!query.data) return; const next = URL.createObjectURL(query.data); setUrl(next); return () => URL.revokeObjectURL(next); }, [query.data]);
  return <section className="customer-file-viewer" aria-label="Dosya görüntüleme"><header><h3>{file.originalName}</h3><button className="icon-button" type="button" aria-label="Dosya görüntülemeyi kapat" onClick={onClose}><X size={18} /></button></header>
    <ErrorMessage error={query.error} />{query.isPending && <p role="status">Dosya açılıyor…</p>}
    {url && (file.mimeType?.startsWith('image/') ? <img src={url} alt={file.originalName} /> : file.mimeType === 'application/pdf' ? <iframe title={file.originalName} src={url} /> : <p>Bu dosya türü burada görüntülenemiyor. Dosyayı indirerek açabilirsiniz.</p>)}
  </section>;
}
