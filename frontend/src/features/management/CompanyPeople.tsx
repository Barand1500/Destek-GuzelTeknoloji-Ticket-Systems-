import {displayEmail} from '../../utils/email';
import {ExistingCompanyPerson} from './ExistingCompanyPerson';
import { useId, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Pencil, Trash2, Plus, Search, FileText, Paperclip } from 'lucide-react';
import { api, errorText } from '../../services/api';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { inboxPath } from '../../router/paths';
import { CompanyPersonFiles } from './CompanyPersonFiles';
import { formatPhone } from '../../utils/phone';
import { EmailInput } from '../../components/EmailInput';

type Person = { id: string; name: string; company?: string | null; email?: string | null; phone?: string | null; isActive?: boolean };
type Relations = { customer: Person; children: Person[] };

export function CompanyPeoplePanel({ customer, onPendingChange }: { customer: Person; onPendingChange: (value: boolean) => void }) {
  const { user } = useAuth(); const client = useQueryClient(); const formId = useId();
  const editable = user?.role !== 'CUSTOMER' && hasPermission(user, 'customers.update');
  const canCreate = editable && hasPermission(user, 'customers.create');
  const canDelete = user?.role !== 'CUSTOMER' && hasPermission(user, 'customers.delete');
  const [editing, setEditing] = useState<Person | null>(null), [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const [filesPerson, setFilesPerson] = useState<Person | null>(null);
  const [existing, setExisting] = useState(false);
  const [attaching, setAttaching] = useState(false);
  const [files, setFiles] = useState<File[]>([]);
  const data = useQuery({ queryKey: ['customer-relations', customer.id], queryFn: async () => (await api.get('/customers/' + customer.id + '/relations')).data.data as Relations });
  const refresh = async () => { await Promise.all(['customer-relations', 'agreements', '/customers', 'directory', 'conversations'].map(key => client.invalidateQueries({ queryKey: [key] }))); };
  const save = useMutation({ mutationFn: async ({ person, values }: { person: Person | null; values: Record<string, FormDataEntryValue> }) => {
    onPendingChange(true);
    const payload = new FormData(); for (const [key,value] of Object.entries(values)) payload.set(key,value); for (const file of files) payload.append('files',file);
    if (person) return api.patch('/customers/' + person.id, payload);
    const created = await api.post<{ data: { id: string } }>('/customers/' + customer.id + '/relations', { direction: 'CHILD', customer: { ...values, company: customer.company || customer.name } });
    if (files.length) { const upload = new FormData(); for (const file of files) upload.append('files', file); await api.patch('/customers/' + created.data.data.id, upload); }
    return created;
  }, onSuccess: async () => { setEditing(null); setCreating(false); setFiles([]); await client.invalidateQueries({ queryKey: ['/customers'] }); await refresh(); }, onSettled: () => onPendingChange(false) });
  const remove = useMutation({ mutationFn: async (id: string) => { onPendingChange(true); return api.delete('/customers/' + id); }, onSuccess: refresh, onSettled: () => onPendingChange(false) });
  const toggle = useMutation({ mutationFn: async (person: Person) => { onPendingChange(true); return api.patch('/customers/' + person.id, { isActive: !person.isActive }); }, onSuccess: refresh, onSettled: () => onPendingChange(false) });
  const pending = save.isPending || remove.isPending || toggle.isPending || attaching;
  const people = (data.data?.children ?? []).filter(person => [person.name, person.email, displayEmail(person.email), person.phone].some(value => value?.toLocaleLowerCase('tr-TR').includes(search.toLocaleLowerCase('tr-TR'))));
  const pages = Math.max(1, Math.ceil(people.length / 10)), currentPage = Math.min(page, pages);
  const error = data.error || save.error || remove.error || toggle.error;
  if (filesPerson) return <CompanyPersonFiles person={filesPerson} canDelete={canDelete} onBack={() => setFilesPerson(null)} onPendingChange={onPendingChange} />;
  return <section className="company-people-panel">
    <div className="company-people-toolbar"><h3>Şirkete Bağlı Kişiler <span className="muted">({data.data?.children.length ?? 0})</span></h3><div>
      <label className="relation-list-search"><Search size={15} /><input aria-label="Şirket kişilerinde ara" placeholder="Ad, e-posta veya telefon ara…" value={search} onChange={event => { setSearch(event.target.value); setPage(1); }} /></label>
      {editable && !creating && !editing && <button type="button" className="button primary" disabled={pending} onClick={() => { save.reset(); setFiles([]); setExisting(!canCreate); setCreating(true); }}><Plus size={15} /> Kişi Ekle</button>}
    </div></div>
    {error && <p className="error" role="alert">{errorText(error)}</p>}
    {creating && <div className="customer-relation-choices company-person-add-tabs" aria-label="Kişi Ekleme Yöntemi">
      {canCreate && <button type="button" className={'relation-tab'+(!existing?' active':'')} aria-pressed={!existing} disabled={pending} onClick={()=>{setExisting(false);save.reset();}}>Yeni Kişi</button>}
      <button type="button" className={'relation-tab'+(existing?' active':'')} aria-pressed={existing} disabled={pending} onClick={()=>{setExisting(true);save.reset();}}>Mevcut Kişi</button>
    </div>}
    {creating && existing && <ExistingCompanyPerson customerId={customer.id} onPendingChange={value=>{setAttaching(value);onPendingChange(value);}} onCancel={()=>{setCreating(false);setExisting(false);}} onAdded={async()=>{setCreating(false);setExisting(false);await refresh();}} />}
    {((creating && !existing) || editing) && <form id={formId} key={editing?.id ?? 'new'} className="agreement-form agreement-entry-form relation-create-form company-person-form" onSubmit={event => { event.preventDefault(); if (!pending) save.mutate({ person: editing, values: Object.fromEntries(new FormData(event.currentTarget)) }); }}>
      <h3>{editing ? 'Kişiyi Düzenle' : 'Şirkete Kişi Ekle'}</h3>
      <label className="agreement-field"><span className="field-label">Ad Soyad</span><input name="name" required minLength={2} maxLength={100} defaultValue={editing?.name} disabled={pending} /></label>
      <label className="agreement-field"><span className="field-label">E-Posta</span><EmailInput name="email" required defaultValue={editing?.email ?? ''} /></label>
      <label className="agreement-field"><span className="field-label">Telefon</span><input name="phone" type="tel" inputMode="tel" autoComplete="tel" required minLength={7} maxLength={30} defaultValue={formatPhone(editing?.phone ?? '')} onInput={event => { event.currentTarget.value = formatPhone(event.currentTarget.value); }} disabled={pending} /></label>
      <div className="company-person-upload"><label className="agreement-field company-person-file-button"><span className="field-label">Dosya Ekle</span><Paperclip size={17} /><span>{files.length ? files.length+' dosya seçildi' : 'Dosya Seç'}</span><input className="company-person-file-input" aria-label="Kişiye dosya ekle" type="file" multiple disabled={pending} onChange={event => setFiles(Array.from(event.target.files ?? []))} /></label>{files.length>0&&<small>{files.map(file=>file.name).join(', ')}</small>}</div>
      <div className="agreement-page-actions"><button className="button secondary" type="button" disabled={pending} onClick={() => { setCreating(false); setEditing(null); save.reset(); }}>Vazgeç</button><button className="button primary" disabled={pending}>{pending ? 'Kaydediliyor…' : 'Kaydet'}</button></div>
    </form>}
    {data.isPending ? <p role="status">Kişiler yükleniyor…</p> : <div className="company-people-table-wrap"><table className="company-people-table" aria-label="Şirkete Bağlı Kişiler"><thead><tr><th>No</th><th>Ad Soyad</th><th>İletişim</th><th>Hesap</th><th>İşlemler</th></tr></thead><tbody>
      {people.slice((currentPage - 1) * 10, currentPage * 10).map((person, index) => <tr key={person.id}><td>{(currentPage - 1) * 10 + index + 1}</td><td><strong>{person.name}</strong></td><td>{displayEmail(person.email) || 'E-posta yok'}<small>{person.phone || 'Telefon yok'}</small></td><td><label className="switch"><input type="checkbox" aria-label={person.name + ' aktif'} checked={Boolean(person.isActive)} disabled={!editable || pending} onChange={() => toggle.mutate(person)} /><span /></label><small>{person.isActive ? 'Aktif' : 'Pasif'}</small></td><td><div className="management-actions">
        {hasPermission(user, 'conversations.view') && <Link className="button secondary" to={inboxPath(user!.role) + '?customerId=' + person.id}>Talepleri Gör</Link>}
        <button type="button" className="icon-button" aria-label={person.name + ' dosyaları'} title="Dosyalar" disabled={pending} onClick={() => setFilesPerson(person)}><FileText size={15} /></button>
        {editable && <button type="button" className="icon-button" aria-label={person.name + ' kişisini düzenle'} title="Düzenle" disabled={pending} onClick={() => { save.reset(); setFiles([]); setCreating(false); setExisting(false); setEditing(person); }}><Pencil size={15} /></button>}
        {canDelete && <button type="button" className="icon-button danger-icon" aria-label={person.name + ' kişisini sil'} title="Kişiyi Sil" disabled={pending} onClick={() => remove.mutate(person.id)}><Trash2 size={15} /></button>}
      </div></td></tr>)}
      {!people.length && !data.error && <tr><td colSpan={5} className="muted">{search ? 'Kişi bulunamadı.' : 'Henüz kişi eklenmemiş.'}</td></tr>}
    </tbody></table></div>}
    {pages > 1 && <nav className="relation-pagination" aria-label="Şirket Kişileri Sayfaları"><button className="button secondary" type="button" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)}>Önceki</button><span>{currentPage} / {pages}</span><button className="button secondary" type="button" disabled={currentPage >= pages} onClick={() => setPage(currentPage + 1)}>Sonraki</button></nav>}
  </section>;
}
