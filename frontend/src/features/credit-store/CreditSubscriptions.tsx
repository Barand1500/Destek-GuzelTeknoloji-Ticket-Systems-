import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { DropdownSelect } from '../../components/DropdownSelect';
import { ErrorMessage, Pagination } from '../management/shared';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { money, count, periodLabel } from './types';
import './credit-orders.css';
import './credit-subscriptions.css';

type Subscription = {
  id: string; name: string; amount: string; currency: string; credits: number;
  periodMonths: number | null; periodDays: number | null; autoRenew: boolean;
  status: string; nextPaymentOn: string | null; currentEndsOn: string | null;
  customer: { name: string; company: string | null };
};
const statuses = { AWAITING_CONSENT: 'Onay bekliyor', AWAITING_PAYMENT: 'İlk ödeme bekliyor', ACTIVE: 'Aktif', PAST_DUE: 'Ödeme alınamadı', STOPPED: 'Yenileme kapalı' };
const date = (value: string | null) => value ? value.slice(0, 10).split('-').reverse().join('.') : '—';
export function CreditSubscriptions({ admin = false }: { admin?: boolean }) {
  const client = useQueryClient(), { user } = useAuth();
  const base = admin ? '/credit-sales/subscriptions' : '/my/credit-store/subscriptions';
  const [page, setPage] = useState(1), [search, setSearch] = useState(''), [term, setTerm] = useState(''), [status, setStatus] = useState('');
  const [target, setTarget] = useState<{ row: Subscription; action: 'accept' | 'stop' } | null>(null);
  const [consent, setConsent] = useState(false), [notice, setNotice] = useState('');
  useEffect(() => { const timer = setTimeout(() => { setTerm(search.trim()); setPage(1); }, 300); return () => clearTimeout(timer); }, [search]);
  const query = useQuery({ queryKey: [base, page, term, status], queryFn: async () => (await api.get(base, { params: { page, limit: 20, search: term, ...(status ? { status } : {}) } })).data as { data: Subscription[]; pagination: { total: number; page: number; limit: number; totalPages: number } } });
  useEffect(() => { if (query.data && page > query.data.pagination.totalPages) setPage(query.data.pagination.totalPages); }, [query.data, page]);
  const save = useMutation({ mutationFn: ({ row, action }: { row: Subscription; action: 'accept' | 'stop' }) => api.post(`${base}/${row.id}/${action}`), onSuccess: async (_, value) => {
    setTarget(null); setNotice(value.action === 'accept' ? 'Yenileme onayınız kaydedildi. Ödeme sağlayıcısı bağlanana kadar tahsilat yapılmaz.' : 'Otomatik yenileme kapatıldı. Mevcut ödenmiş döneminiz korunur.');
    await Promise.all([client.invalidateQueries({ queryKey: [base] }), client.invalidateQueries({ queryKey: ['agreements'] })]);
  } });
  const canStop = !admin || hasPermission(user, 'integrations.update');
  return <section className="credit-orders credit-subscriptions" aria-label={admin ? 'Abonelikler' : 'Aboneliklerim'}>
    <h2>{admin ? 'Abonelikler' : 'Aboneliklerim'}</h2>
    <p className="credit-store-notice">Ödeme bağlantısı henüz etkin değil. Buradaki tarihler yenileme planını gösterir; ödeme alınmaz ve yeni kredi yüklenmez.</p>
    <div className="credit-orders-filters">
      <label><span className="field-label">Abonelik Ara</span><input type="search" value={search} onChange={e => setSearch(e.target.value)} placeholder={admin ? 'Paket veya müşteri ara' : 'Paket veya anlaşma ara'} /></label>
      <DropdownSelect ariaLabel="Abonelik durumu" label="Durum" value={status} onChange={value => { setStatus(value); setPage(1); }} options={[{ value: '', label: 'Tüm durumlar' }, ...Object.entries(statuses).map(([value, label]) => ({ value, label }))]} />
    </div>
    <ErrorMessage error={query.error} /><ErrorMessage error={save.error} />
    {notice && <p role="status">{notice}</p>}
    {query.isPending && <p role="status">Abonelikler yükleniyor…</p>}
    {target && <div className="credit-sales-card subscription-confirmation" role="region" aria-label="Yenileme onayı">
      <h3>{target.action === 'accept' ? 'Otomatik yenilemeyi onayla' : 'Otomatik yenilemeyi kapat'}</h3>
      <p>{target.row.name} · {money(target.row.amount, target.row.currency)} / {periodLabel(target.row)} · {count(target.row.credits)} kredi</p>
      {target.action === 'accept' ? <label className="integration-toggle subscription-consent"><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><i aria-hidden="true" /><span>Belirtilen tutarın her dönem tahsil edilmesini onaylıyorum. Ödeme yöntemi ayrıca bağlanmalıdır.</span></label> : <p>Mevcut ödenmiş dönem ve kredileriniz korunur. Başlamış bir tahsilat varsa sonucu ayrıca işlenir.</p>}
      <div className="agreement-page-actions"><button type="button" className="button secondary" disabled={save.isPending} onClick={() => setTarget(null)}>Vazgeç</button><button type="button" className="button primary" disabled={save.isPending || (target.action === 'accept' && !consent)} onClick={() => save.mutate(target)}>{target.action === 'accept' ? 'Onayla' : 'Yenilemeyi Kapat'}</button></div>
    </div>}
    <div className="credit-log-table-wrap"><table className="credit-log-table" aria-label="Abonelik Listesi"><thead><tr>{admin && <th>Müşteri</th>}<th>Paket / Anlaşma</th><th>Dönem tutarı</th><th>Kredi</th><th>Durum</th><th>Mevcut dönem bitişi</th><th>Planlanan yenileme</th><th>İşlemler</th></tr></thead><tbody>
      {query.data?.data.map(row => <tr key={row.id}>{admin && <td>{row.customer.company || row.customer.name}</td>}<td>{row.name}<small>{periodLabel(row)}</small></td><td>{money(row.amount, row.currency)}</td><td>{count(row.credits)}</td><td>{statuses[row.status as keyof typeof statuses] ?? row.status}</td><td>{date(row.currentEndsOn)}</td><td>{date(row.nextPaymentOn)}</td><td><div className="subscription-actions">
        {!admin && row.status === 'AWAITING_CONSENT' && <button className="button primary" type="button" disabled={save.isPending} onClick={() => { setConsent(false); save.reset(); setTarget({ row, action: 'accept' }); }}>Koşulları Onayla</button>}
        {canStop && row.status !== 'STOPPED' && <button className="button secondary" type="button" disabled={save.isPending} onClick={() => { save.reset(); setTarget({ row, action: 'stop' }); }}>Yenilemeyi Kapat</button>}
        <Link className="button secondary" to={`?view=orders&subscriptionId=${row.id}`}>Siparişler</Link>
      </div></td></tr>)}
      {!query.isPending && !query.isError && !query.data?.data.length && <tr><td colSpan={admin ? 8 : 7}>Henüz abonelik bulunmuyor.</td></tr>}
    </tbody></table></div>
    {query.data && <Pagination pagination={query.data.pagination} onChange={setPage} />}
  </section>;
}
