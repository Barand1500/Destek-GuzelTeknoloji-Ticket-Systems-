import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { List, Users, ArrowLeft, FilterX, FileSpreadsheet, Loader2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import { api, errorText } from '../../services/api';
import { DropdownSelect } from '../../components/DropdownSelect';
import { DateRangeField } from '../../components/DateRangeField';
import { useAuth } from '../auth/Auth';
import { conversationPath } from '../../router/paths';
type Person = { id: string; name: string };
type Movement = { id: string; credits: number; kind: 'USED' | 'RETURNED'; createdAt: string; agreement: Person | null; conversation: { id: string; number: number; subject: string; customer: Person } };
type Usage = Person & { spent: number; returned: number; net: number; ticketCount: number };
type Report = { data: (Movement | Usage)[]; summary: { spent: number; returned: number; net: number; tickets: number }; people: Person[]; agreements: Person[]; pagination: { page: number; totalPages: number; total: number } };
const number = (value: number) => value.toLocaleString('tr-TR');
export function CompanyCreditHistory({ customerId, onBack }: { customerId: string; onBack?: () => void }) {
  const { user } = useAuth();
  const [view, setView] = useState<'movements' | 'people'>('movements');
  const [exporting, setExporting] = useState(false), [exportError, setExportError] = useState('');
  const [personId, setPerson] = useState(''), [agreementId, setAgreement] = useState('');
  const [startsOn, setStart] = useState(''), [endsOn, setEnd] = useState(''), [page, setPage] = useState(1), [limit, setLimit] = useState(20);
  const invalid = Boolean(startsOn && endsOn && startsOn > endsOn);
  const query = useQuery({ queryKey: ['credit-history', customerId, view, personId, agreementId, startsOn, endsOn, page, limit], enabled: !invalid,
    queryFn: async () => (await api.get(`/customers/${customerId}/agreements/credit-history`, { params: { view, page, limit, personId: personId || undefined, agreementId: agreementId || undefined, startsOn: startsOn || undefined, endsOn: endsOn || undefined } })).data as Report });
  const update = (setter: (value: string) => void, value: string) => { setter(value); setPage(1); };
  const switchView = (value: typeof view) => { setView(value); setPage(1); };
  const summary = query.data?.summary;
  const downloadExcel = async () => {
    setExporting(true); setExportError('');
    try {
      const response = await api.get(`/customers/${customerId}/agreements/credit-history/export`, { responseType: 'blob', params: { view, personId: personId || undefined, agreementId: agreementId || undefined, startsOn: startsOn || undefined, endsOn: endsOn || undefined } });
      const url = URL.createObjectURL(response.data);
      const link = document.createElement('a'); link.href = url;
      link.download = `kredi-${view === 'people' ? 'kisi-kullanimi' : 'hareketleri'}-${new Date().toISOString().slice(0, 10)}.xlsx`;
      document.body.appendChild(link); link.click(); link.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch { setExportError('Excel dosyası indirilemedi. Lütfen tekrar deneyin.'); }
    finally { setExporting(false); }
  };
  return <section className="credit-log company-credit-history">
    {onBack && <button className="button secondary" onClick={onBack}><ArrowLeft size={16} />Anlaşmalara Dön</button>}
    <div className="company-credit-filters">
      <div className="company-credit-overview" aria-live="polite">
        <h3>{view === 'people' ? 'Kişilere göre kullanım' : 'Son hareketler'}</h3>
        {summary && <p><strong>{number(summary.net)}</strong> kredi kullanıldı<span>·</span>{number(summary.tickets)} talep</p>}
      </div>
      <DropdownSelect ariaLabel="Kredi kişisi" label="Kişi" value={personId} onChange={value => update(setPerson, value)} options={[{ value: '', label: 'Tüm kişiler' }, ...(query.data?.people ?? []).map(person => ({ value: person.id, label: person.name }))]} />
      <DateRangeField label="Tarih aralığı" from={startsOn} to={endsOn} onChange={range => { setStart(range.from); setEnd(range.to); setPage(1); }} />
      <DropdownSelect ariaLabel="Kredi anlaşması" label="Anlaşma / Paket" value={agreementId} onChange={value => update(setAgreement, value)} options={[{ value: '', label: 'Tüm anlaşmalar' }, ...(query.data?.agreements ?? []).map(row => ({ value: row.id, label: row.name }))]} />
      <div className="company-credit-actions">
      {user?.role !== 'CUSTOMER' && <button className="button secondary" aria-label="Excel indir" title="Excel indir (filtreye uyan tüm kayıtlar)" disabled={exporting || invalid || query.isPending || query.isError} onClick={() => void downloadExcel()}>{exporting ? <Loader2 size={19} /> : <FileSpreadsheet size={19} />}</button>}
      <button className="button secondary" aria-label="Filtreleri temizle" title="Filtreleri temizle" onClick={() => { setPerson(''); setAgreement(''); setStart(''); setEnd(''); setPage(1); }}><FilterX size={19} /></button>
      <div className="company-credit-view" role="group" aria-label="Kredi görünümü">
        <button className="button secondary" aria-label="Son hareketler" title="Son hareketler" aria-pressed={view === 'movements'} onClick={() => switchView('movements')}><List size={19} /></button>
        <button className="button secondary" aria-label="Kişilere göre kullanım" title="Kişilere göre kullanım" aria-pressed={view === 'people'} onClick={() => switchView('people')}><Users size={19} /></button>
      </div>
      </div>
    </div>
    {invalid && <p role="alert" className="error">Bitiş tarihi başlangıçtan önce olamaz.</p>}
    {exportError && <p role="alert" className="error">{exportError}</p>}
    {summary && summary.returned > 0 && <p className="company-credit-return-note">Yeniden açılan taleplerden {number(summary.returned)} kredi bakiyeye eklendi. Kullanılan kredi toplamından düşüldü.</p>}
    {query.isPending && !invalid && <p role="status">Hareketler yükleniyor…</p>}{query.error && <p role="alert" className="error">{errorText(query.error)}</p>}
    {!invalid && <div className="credit-log-table-wrap"><table className="credit-log-table" aria-label={view === 'people' ? 'Kişilere göre kredi kullanımı' : 'Kredi Hareketleri'}>
      <thead><tr>{(view === 'people' ? ['Kişi', 'Talep sayısı', 'Kullanılan kredi'] : ['Tarih / Saat', 'Kişi', 'Talep', 'Anlaşma / Paket', 'Kredi']).map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
      <tbody>{query.data?.data.map(row => 'ticketCount' in row ? <tr key={row.id}>
        <td><button className="credit-person-link" onClick={() => { setPerson(row.id); switchView('movements'); }}>{row.name}</button></td><td className="credit-log-ticket-count">{number(row.ticketCount)}</td><td className="credit-log-amount">{number(row.net)}</td>
      </tr> : <tr key={row.id}><td>{new Date(row.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</td><td>{row.conversation.customer.name}</td><td><Link to={conversationPath(user!.role, row.conversation.id)}>#TK-{String(row.conversation.number).padStart(5, '0')}</Link><small>{row.conversation.subject}</small></td><td>{row.agreement?.name ?? 'Ücretsiz destek'}</td><td className="credit-log-amount">{row.credits ? row.kind === 'USED' ? '−' : '+' : ''}{number(row.credits)}{row.kind === 'RETURNED' && <small>Bakiyeye eklendi</small>}</td></tr>)}
        {!query.isPending && !query.error && !query.data?.data.length && <tr><td colSpan={view === 'people' ? 3 : 5} className="credit-log-empty">Seçilen filtrelere uygun kredi hareketi yok.</td></tr>}
      </tbody></table></div>}
    <div className="company-credit-pagination"><DropdownSelect ariaLabel="Kredi sayfa boyutu" label="Sayfa başına" value={String(limit)} onChange={value => { setLimit(Number(value)); setPage(1); }} options={[10, 20, 50, 100].map(value => ({ value: String(value), label: String(value) }))} />
      {query.data && <nav className="pagination" aria-label="Kredi Hareketleri Sayfaları"><span>{number(query.data.pagination.total)} kayıt · {query.data.pagination.page} / {query.data.pagination.totalPages}</span><button className="button secondary" disabled={query.data.pagination.page <= 1 || query.isFetching} onClick={() => setPage(query.data!.pagination.page - 1)}>Önceki</button><button className="button secondary" disabled={query.data.pagination.page >= query.data.pagination.totalPages || query.isFetching} onClick={() => setPage(query.data!.pagination.page + 1)}>Sonraki</button></nav>}
    </div>
  </section>;
}
