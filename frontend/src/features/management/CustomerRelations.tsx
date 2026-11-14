import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { api, errorText } from '../../services/api';
import { DirectorySelect } from '../../components/DirectorySelect';
import { AgreementDialog, CompanyCreditSharing } from '../agreements/Agreements';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { inboxPath } from '../../router/paths';
import { EmailInput } from '../../components/EmailInput';

type Person = { id: string; name: string; company?: string | null; isActive?: boolean; parentCustomerId?: string | null; shareCreditsWithChildren?: boolean };
export function CustomerRelationsModal({ customer, onClose }: { customer: Person; onClose: () => void }) {
  const { user } = useAuth();
  const client = useQueryClient();
  const editable = user?.role !== 'CUSTOMER' && hasPermission(user, 'customers.update');
  const data = useQuery({ queryKey: ['customer-relations', customer.id], queryFn: async () => (await api.get(`/customers/${customer.id}/relations`)).data.data as { customer: Person; parent: Person | null; children: Person[] } });
  const [parentId, setParentId] = useState(''), [childId, setChildId] = useState('');
  const [notice, setNotice] = useState('');
  const [creating, setCreating] = useState(false);
  const canCreate = editable && hasPermission(user, 'customers.create');
  const [action, setAction] = useState<'children' | 'parent'>('children');
  useEffect(() => setParentId(data.data?.parent?.id ?? ''), [data.data?.parent?.id]);
  useEffect(() => setAction(data.data?.parent ? 'parent' : 'children'), [data.data?.parent?.id]);
  const link = useMutation({ mutationFn: ({ id, parent }: { id: string; parent: string | null }) => api.put(`/customers/${id}/parent`, { parentCustomerId: parent }), onSuccess: async () => {
    setChildId(''); setNotice('Müşteri bağlantısı kaydedildi.');
    await Promise.all(['customer-relations', 'agreements', '/customers', 'conversations'].map(key => client.invalidateQueries({ queryKey: [key] })));
  } });
  const create = useMutation({ mutationFn: (input: object) => api.post(`/customers/${customer.id}/relations`, input), onSuccess: async () => {
    setCreating(false); setNotice('Yeni müşteri oluşturuldu ve bağlantısı kaydedildi.');
    await Promise.all(['customer-relations', 'agreements', '/customers', 'conversations', 'directory'].map(key => client.invalidateQueries({ queryKey: [key] })));
  } });
  const pending = link.isPending || create.isPending;
  const mayCreate = canCreate && data.data && (action === 'children' ? !data.data.parent : data.data.children.length === 0);
  return <AgreementDialog title={`${customer.name} — Bağlı Müşteriler`} onClose={onClose} pending={pending}>
    <div className="customer-relation-choices">
      <button type="button" disabled={pending} className={`button ${action === 'children' ? 'primary' : 'secondary'}`} aria-pressed={action === 'children'} onClick={() => { setAction('children'); setCreating(false); link.reset(); create.reset(); setNotice(''); }}>Bu müşteriye alt müşteri ekle</button>
      <button type="button" disabled={pending} className={`button ${action === 'parent' ? 'primary' : 'secondary'}`} aria-pressed={action === 'parent'} onClick={() => { setAction('parent'); setCreating(false); link.reset(); create.reset(); setNotice(''); }}>Bu müşteriyi bir ana müşteriye bağla</button>
    </div>
    {data.isPending && <p role="status">Bağlı müşteriler yükleniyor…</p>}
    {(data.error || link.error || create.error) && <p className="error" role="alert">{errorText(data.error || link.error || create.error)}</p>}
    {data.data && <>
      {!data.data.customer?.parentCustomerId && !data.data.parent && <CompanyCreditSharing customer={data.data.customer ?? customer} />}
      {action === 'parent' ? <section className="customer-relation-panel">
        <h3>Ana Müşteri</h3>
        
        <p>Bağlı olduğu: <strong>{data.data.parent?.name ?? 'Bir ana müşteriye bağlı değil'}</strong></p>
        {data.data.children.length > 0 ? <p className="muted">Önce mevcut alt müşteri bağlantılarını kaldırın.</p> : editable && <div className="agreement-family-edit"><DirectorySelect endpoint="/customers" label="Ana Müşteri Seçin" value={parentId} current={data.data.parent ?? undefined} filter={p => p.id !== customer.id} onChange={setParentId} /><button type="button" className="button primary" disabled={!parentId || pending} onClick={() => link.mutate({ id: customer.id, parent: parentId })}>Ana Müşteriye Bağla</button></div>}
        {editable && data.data.parent && <button type="button" className="button secondary" disabled={pending} onClick={() => link.mutate({ id: customer.id, parent: null })}>Ana Müşteri Bağını Kaldır</button>}
      </section> : <section className="customer-relation-panel">
        <h3>Alt Müşteriler</h3>
        
        {data.data.parent ? <p><strong>{data.data.parent.name}</strong> kaydına bağlı. Önce bu bağlantıyı kaldırın.</p> : editable && <div className="agreement-family-edit"><DirectorySelect endpoint="/customers" label="Eklenecek Alt Müşteri" value={childId} filter={p => p.id !== customer.id && !data.data!.children.some(c => c.id === p.id)} onChange={setChildId} /><button className="button primary" disabled={!childId || pending} type="button" onClick={() => link.mutate({ id: childId, parent: customer.id })}>Alt Müşteri Ekle</button></div>}
        {data.data.children.map(c => <div className="agreement-history" key={c.id}><span>{c.name}{c.isActive ? '' : ' (Pasif)'}</span><div className="management-actions"><Link className="button secondary" to={`${inboxPath(user!.role)}?customerId=${c.id}`}>Talepleri Gör</Link>{editable && <button className="button secondary" disabled={pending} type="button" onClick={() => link.mutate({ id: c.id, parent: null })}>Bağı Kaldır</button>}</div></div>)}
        {!data.data.children.length && <p className="muted">Henüz alt müşteri eklenmemiş.</p>}
      </section>}
    </>}
    {mayCreate && <button className="button secondary relation-create-trigger" type="button" disabled={pending} onClick={() => { setCreating(v => !v); create.reset(); }}>{creating ? 'Yeni Kişi Eklemekten Vazgeç' : action === 'children' ? '+ Yeni Kişi Ekle' : '+ Yeni Ana Müşteri Ekle'}</button>}
    {mayCreate && creating && <form className="agreement-form relation-create-form" onSubmit={event => { event.preventDefault(); if (pending) return; const values = Object.fromEntries(new FormData(event.currentTarget)); create.mutate({ direction: action === 'children' ? 'CHILD' : 'PARENT', customer: values }); }}>
      <h3>{action === 'children' ? 'Yeni Alt Müşteri' : 'Yeni Ana Müşteri'}</h3>
      <label><span>Ad Soyad / Müşteri Adı</span><input name="name" required minLength={2} maxLength={100} disabled={pending} /></label>
      <label><span>Firma / Şirket</span><input name="company" required minLength={2} maxLength={120} defaultValue={action === 'children' ? (customer.company || customer.name).slice(0, 120) : ''} disabled={pending} /></label>
      <label><span>E-Posta Adresi</span><EmailInput name="email" required /></label>
      <label><span>Telefon Numarası</span><input name="phone" type="tel" required minLength={7} maxLength={30} disabled={pending} /></label>
      
      <button className="button primary" disabled={pending}>{create.isPending ? 'Kaydediliyor…' : 'Oluştur ve Bağla'}</button>
    </form>}
    {notice && <p role="status">{notice}</p>}
  </AgreementDialog>;
}
