import { useEffect, useId, useState } from 'react';
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Search } from 'lucide-react';
import { api, errorText } from '../../services/api';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { AgreementDialog } from '../agreements/Agreements';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { inboxPath } from '../../router/paths';
import { EmailInput } from '../../components/EmailInput';
type Person = { id: string; name: string; company?: string | null; email?: string | null; isActive?: boolean; parentCustomerId?: string | null; shareCreditsWithChildren?: boolean };
type Relations = { customer: Person; parent: Person | null; children: Person[] };
type Candidates = { data: Person[]; pagination: { total: number; totalPages: number } };
export function CustomerRelationsModal({ customer, onClose }: { customer: Person; onClose: () => void }) {
  const { user } = useAuth(); const client = useQueryClient(); const formId = useId();
  const editable = user?.role !== 'CUSTOMER' && hasPermission(user, 'customers.update');
  const canCreate = editable && hasPermission(user, 'customers.create');
  const data = useQuery({ queryKey: ['customer-relations', customer.id], queryFn: async () => (await api.get('/customers/' + customer.id + '/relations')).data.data as Relations });
  const [action, setAction] = useState<'children' | 'parent'>('children');
  const [selection, setSelection] = useState<Person | null>(null), [search, setSearch] = useState(''), [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { setSelection(data.data?.parent ?? null); setAction(data.data?.parent ? 'parent' : 'children'); setPage(1); }, [data.data?.parent?.id]);
  const blocked = Boolean(data.data && (action === 'children' ? data.data.parent : data.data.children.length > 0));
  const candidates = useQuery({ queryKey: ['relation-candidates', customer.id, action, search, page], enabled: Boolean(editable && data.data && !blocked), queryFn: async () => (await api.get('/customers/' + customer.id + '/relation-candidates', { params: { direction: action === 'children' ? 'CHILD' : 'PARENT', search, page, limit: 5 } })).data as Candidates });
  const picker = useInfiniteQuery({
    queryKey: ['relation-candidates', customer.id, 'options', action],
    enabled: Boolean(editable && data.data && !blocked), initialPageParam: 1,
    queryFn: async ({ pageParam }) => (await api.get('/customers/' + customer.id + '/relation-candidates', { params: { direction: action === 'children' ? 'CHILD' : 'PARENT', page: pageParam, limit: 25 } })).data as Candidates,
    getNextPageParam: (last, pages) => pages.length < last.pagination.totalPages ? pages.length + 1 : undefined,
  });
  const loadMoreChoices = () => { if (picker.hasNextPage && !picker.isFetching) void picker.fetchNextPage(); };
  const refresh = async () => { await Promise.all(['customer-relations', 'relation-candidates', 'agreements', '/customers', 'conversations', 'directory'].map(key => client.invalidateQueries({ queryKey: [key] }))); };
  const link = useMutation({ mutationFn: ({ id, parent }: { id: string; parent: string | null }) => api.put('/customers/' + id + '/parent', { parentCustomerId: parent }), onSuccess: async () => { setSelection(null); setSearch(''); setPage(1); setNotice('Bağlantı kaydedildi.'); await refresh(); } });
  const create = useMutation({ mutationFn: (input: object) => api.post('/customers/' + customer.id + '/relations', input), onSuccess: async () => { setCreating(false); setSearch(''); setPage(1); setNotice('Müşteri oluşturuldu ve bağlandı.'); await refresh(); } });
  const pending = link.isPending || create.isPending;
  const mayCreate = canCreate && data.data && !blocked;
  const searching = Boolean(search.trim());
  const linked = action === 'children' ? data.data?.children ?? [] : data.data?.parent ? [data.data.parent] : [];
  const rows = searching ? candidates.data?.data ?? [] : linked.slice((page - 1) * 5, page * 5);
  const pages = searching ? candidates.data?.pagination.totalPages ?? 1 : Math.max(1, Math.ceil(linked.length / 5));
  const choices = [...new Map((picker.data?.pages.flatMap(p => p.data) ?? []).map(person => [person.id, person])).values()];
  const options = [{ value: '', label: 'Seçin' }, ...(selection && !choices.some(c => c.id === selection.id) ? [{ value: selection.id, label: selection.name }] : []), ...choices.map(c => ({ value: c.id, label: c.name }))];
  const chooseAction = (next: 'children' | 'parent') => { setAction(next); setSelection(next === 'parent' ? data.data?.parent ?? null : null); setSearch(''); setPage(1); setCreating(false); setNotice(''); link.reset(); create.reset(); };
  const saveLink = () => { if (!selection || pending) return; link.mutate(action === 'children' ? { id: selection.id, parent: customer.id } : { id: customer.id, parent: selection.id }); };
  const canLink = editable && !blocked && selection && (action === 'children' || selection.id !== data.data?.parent?.id);
  return <AgreementDialog title={customer.name + ' — Bağlı Müşteriler'} onClose={onClose} pending={pending} footer={<>
    {mayCreate && !creating && <button className="button secondary relation-footer-create" type="button" disabled={pending} onClick={() => { setCreating(true); create.reset(); }}>{action === 'children' ? '+ Yeni Kişi Ekle' : '+ Yeni Ana Müşteri Ekle'}</button>}
    {creating && <button className="button secondary" type="button" disabled={pending} onClick={() => setCreating(false)}>Vazgeç</button>}
    {creating ? <button className="button primary" type="submit" form={formId} disabled={pending}>{create.isPending ? 'Kaydediliyor…' : 'Oluştur ve Bağla'}</button> : editable && <button className="button primary" type="button" disabled={!canLink || pending} onClick={saveLink}>{action === 'children' ? 'Alt Müşteri Ekle' : 'Ana Müşteriye Bağla'}</button>}
  </>}>
    <div className="customer-relation-choices">
      <button type="button" disabled={pending} className={'relation-tab' + (action === 'children' ? ' active' : '')} aria-pressed={action === 'children'} onClick={() => chooseAction('children')}>Bu müşteriye alt müşteri ekle</button>
      <button type="button" disabled={pending} className={'relation-tab' + (action === 'parent' ? ' active' : '')} aria-pressed={action === 'parent'} onClick={() => chooseAction('parent')}>Bu müşteriyi bir ana müşteriye bağla</button>
    </div>
    {data.isPending && <p role="status">Bağlı müşteriler yükleniyor…</p>}
    {(data.error || link.error || create.error) && <p className="error" role="alert">{errorText(data.error || link.error || create.error)}</p>}
    {data.data && <>
      <section className="customer-relation-panel">
        <div className="relation-list-heading"><h3>{action === 'children' ? 'Alt Müşteriler' : 'Ana Müşteri'}</h3>
          {editable && !blocked && <div className="relation-list-tools"><SearchableDropdown placement="bottom" label={action === 'children' ? 'Eklenecek Alt Müşteri' : 'Ana Müşteri Seçin'} name="relatedCustomerId" value={selection?.id ?? ''} options={options} onMenuEnd={loadMoreChoices} footer={(picker.hasNextPage || picker.isFetching || picker.error) ? <div className="relation-picker-more">{picker.error && <span role="alert">{errorText(picker.error)}</span>}<button type="button" className="button secondary" disabled={picker.isFetching} onClick={() => picker.error ? void picker.refetch() : loadMoreChoices()}>{picker.isFetching ? 'Yükleniyor…' : picker.error ? 'Tekrar Dene' : 'Daha Fazla Göster'}</button></div> : undefined} disabled={pending} onChange={id => setSelection(choices.find(c => c.id === id) ?? (selection?.id === id ? selection : null))} />
            <label className="relation-list-search"><Search size={15} /><input aria-label="Bağlı Müşterilerde Ara" placeholder="Müşteri ara…" value={search} onChange={e => { setSearch(e.target.value); setSelection(null); setPage(1); }} disabled={pending} /></label>
          </div>}
        </div>
        {blocked ? <p className="muted">{action === 'children' ? 'Önce ana müşteri bağlantısını kaldırın.' : 'Önce mevcut alt müşteri bağlantılarını kaldırın.'}</p> : <>
          {searching && candidates.isFetching && <p role="status">Aranıyor…</p>}
          {candidates.error && <p className="error" role="alert">{errorText(candidates.error)}</p>}
          <div className="relation-results" aria-label={searching ? 'Müşteri Arama Sonuçları' : 'Bağlı Müşteri Listesi'}>
            {rows.map(person => <div className={'agreement-history relation-result' + (searching && selection?.id === person.id ? ' selected' : '')} key={person.id}><div><strong>{person.name}</strong>{searching && (person.company || person.email) && <small>{person.company || person.email}</small>}</div><div className="management-actions">
              {searching ? <button type="button" className="button secondary" disabled={pending} onClick={() => setSelection(person)}>{selection?.id === person.id ? 'Seçildi' : 'Seç'}</button> : <><Link className="button secondary" to={inboxPath(user!.role) + '?customerId=' + person.id}>Talepleri Gör</Link>{editable && <button type="button" className="button secondary" disabled={pending} onClick={() => link.mutate({ id: action === 'children' ? person.id : customer.id, parent: null })}>{action === 'children' ? 'Bağı Kaldır' : 'Ana Müşteri Bağını Kaldır'}</button>}</>}
            </div></div>)}
            {rows.length === 0 && !candidates.isFetching && <p className="muted">{searching ? 'Müşteri bulunamadı.' : action === 'children' ? 'Henüz alt müşteri eklenmemiş.' : 'Bir ana müşteriye bağlı değil.'}</p>}
          </div>
          {(pages > 1 || searching) && <nav className="relation-pagination" aria-label="Bağlı Müşteriler Sayfaları"><button className="button secondary" type="button" disabled={pending || page <= 1} onClick={() => setPage(v => v - 1)}>Önceki</button><span>{page} / {pages}</span><button className="button secondary" type="button" disabled={pending || candidates.isFetching || page >= pages} onClick={() => setPage(v => v + 1)}>Sonraki</button></nav>}
        </>}
      </section>
    </>}
    {mayCreate && creating && <form id={formId} className="agreement-form relation-create-form" onSubmit={event => { event.preventDefault(); if (pending) return; const values = Object.fromEntries(new FormData(event.currentTarget)); create.mutate({ direction: action === 'children' ? 'CHILD' : 'PARENT', customer: values }); }}>
      <h3>{action === 'children' ? 'Yeni Alt Müşteri' : 'Yeni Ana Müşteri'}</h3>
      <label><span>Ad Soyad / Müşteri Adı</span><input name="name" required minLength={2} maxLength={100} disabled={pending} /></label>
      <label><span>Firma / Şirket</span><input name="company" required minLength={2} maxLength={120} defaultValue={action === 'children' ? (customer.company || customer.name).slice(0, 120) : ''} disabled={pending} /></label>
      <label><span>E-Posta Adresi</span><EmailInput name="email" required /></label>
      <label><span>Telefon Numarası</span><input name="phone" type="tel" required minLength={7} maxLength={30} disabled={pending} /></label>
    </form>}
    {notice && <p role="status" className="relation-notice">{notice}</p>}
  </AgreementDialog>;
}
