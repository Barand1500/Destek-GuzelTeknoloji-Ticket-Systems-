import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X, ArrowLeft, History } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorText } from '../../services/api';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { DropdownSelect } from '../../components/DropdownSelect';
import { conversationPath, inboxPath } from '../../router/paths';
import { agreementEndDate } from '../../utils/agreement-dates';
import './agreements.css';

type Person = { id: string; name: string; isActive?: boolean; parentCustomerId?: string | null; shareCreditsWithChildren?: boolean; personalCredits?: number };
export type Agreement = { id: string; name: string; type: string; startsOn: string; endsOn: string; fee: string; credits: number; usedCredits: number; remainingCredits: number; usable: boolean; state: string; customer: Person; customerId: string };
type Charge = { id: string; credits: number; createdAt: string; agreement: { name: string } | null; conversation: { id: string; number: number; subject: string; customer: { name: string } } };
type Summary = { customer: Person; parent: Person | null; children: Person[]; agreements: Agreement[]; charges: Charge[]; availableCredits: number; personalCredits: number; sharedCredits: number; parentCredits: number };
const types: Record<string, string> = { MONTHLY: 'Aylık', YEARLY: 'Yıllık', ONE_OFF: 'Ek Destek Kredisi', MAINTENANCE: 'Bakım Anlaşması' };
const states: Record<string, string> = { ACTIVE: 'Aktif', UPCOMING: 'Başlamadı', EXPIRED: 'Süresi Doldu', CANCELLED: 'İptal Edildi' };
const date = (value: string) => value.slice(0, 10).split('-').reverse().join('.');

export function AgreementDialog({ title, children, onClose, pending = false, headerActions, footer, compact = false }: { title: string; children: ReactNode; onClose: () => void; pending?: boolean; headerActions?: ReactNode; footer?: ReactNode; compact?: boolean }) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose); close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const overflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    panel.current?.focus();
    return () => { document.body.style.overflow = overflow; previous?.focus(); };
  }, []);
  return createPortal(<div className="confirm-backdrop agreement-backdrop"><div ref={panel} tabIndex={-1} className={`confirm-modal agreement-dialog${compact ? ' agreement-dialog--compact' : ''}`} role="dialog" aria-modal="true" aria-label={title} onKeyDown={event => {
    if (event.key === 'Escape' && !pending) { event.stopPropagation(); close.current(); }
    if (event.key === 'Tab') {
      const items = [...(panel.current?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), textarea:not(:disabled), select:not(:disabled), a[href], [tabindex="0"]') ?? [])].filter(el => el.getClientRects().length);
      const first = items[0], last = items.at(-1);
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel.current)) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  }}><header><h2>{title}</h2><div className="agreement-header-actions">{headerActions}<button className="standard-modal-close" type="button" aria-label="Kapat" disabled={pending} onClick={onClose}><X size={18} /></button></div></header><div className="agreement-dialog-body">{children}</div>{footer && <footer className="agreement-dialog-footer">{footer}</footer>}</div></div>, document.body);
}
export function CompanyCreditSharing({ customer }: { customer: Person }) {
  const { user } = useAuth(); const client = useQueryClient();
  const editable = user?.role === 'CUSTOMER' ? user.id === customer.id : hasPermission(user, 'customers.update');
  const [enabled, setEnabled] = useState(customer.shareCreditsWithChildren ?? true);
  useEffect(() => setEnabled(customer.shareCreditsWithChildren ?? true), [customer.id, customer.shareCreditsWithChildren]);
  const mutation = useMutation({ mutationFn: (enabled: boolean) => api.put(`/customers/${customer.id}/credit-sharing`, { enabled }), onError: () => setEnabled(customer.shareCreditsWithChildren ?? true), onSuccess: async () => {
    await Promise.all(['agreements', 'customer-relations', 'credit-options'].map(key => client.invalidateQueries({ queryKey: [key] })));
  } });
  return <section className="company-credit-policy" aria-label="Şirket Ortak Kredi Ayarı">
    <div><h3>Şirket ortak kredisi</h3><p className="muted">Alt müşteriler ortak krediyi kullanabilsin.</p></div>
    <div className="status-toggle"><label className="switch"><input type="checkbox" role="switch" aria-label="Alt müşteriler şirketin ortak kredisini kullanabilir" checked={enabled} disabled={!editable || mutation.isPending || customer.isActive === false} onChange={e => { setEnabled(e.target.checked); mutation.mutate(e.target.checked); }} /><span aria-hidden="true" /></label><strong>{enabled ? 'Açık' : 'Kapalı'}</strong></div>
    {mutation.error && <p className="error" role="alert">{errorText(mutation.error)}</p>}
  </section>;
}

export function CustomerAgreementsModal({ customer, onClose }: { customer: Person; onClose: () => void }) {
  const [selected, setSelected] = useState(customer);
  const [history, setHistory] = useState(false);
  return <AgreementDialog title={`${selected.name} — ${history ? 'Kredi Hareketleri' : 'Anlaşmalar'}`} onClose={onClose} headerActions={<button className="standard-modal-close" type="button" aria-label="Kredi Hareketleri" title="Kredi Hareketleri" aria-pressed={history} onClick={() => setHistory(v => !v)}><History size={18} /></button>}>
    {!history && selected.id !== customer.id && <button className="button secondary agreement-back" onClick={() => setSelected(customer)}><ArrowLeft size={16} /> {customer.name} Anlaşmalarına Dön</button>}
    <div hidden={history}><AgreementWorkspace key={selected.id} customerId={selected.id} onSelectCustomer={setSelected} /></div>{history && <CreditHistory key={selected.id} customerId={selected.id} onBack={() => setHistory(false)} />}
  </AgreementDialog>;
}
export function CustomerAgreementsPage() {
  const { user } = useAuth(); const [params] = useSearchParams();
  const [history, setHistory] = useState(false);
  const customerId = params.get('customerId') || user!.id;
  return <main className="page"><div className="page-heading"><h1>Anlaşmalarım ve Kredilerim</h1><button className="button secondary" type="button" onClick={() => setHistory(true)}><History size={17} /> Kredi Hareketleri</button></div><AgreementWorkspace key={customerId} customerId={customerId} />
    {history && <AgreementDialog title="Kredi Hareketleri" onClose={() => setHistory(false)}><CreditHistory customerId={customerId} /></AgreementDialog>}
  </main>;
}
function CreditHistory({ customerId, onBack }: { customerId: string; onBack?: () => void }) {
  const { user } = useAuth(); const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ['agreements', customerId], queryFn: async () => (await api.get(`/customers/${customerId}/agreements`)).data.data as Summary });
  const charges = query.data?.charges ?? [], pages = Math.max(1, Math.ceil(charges.length / 20));
  return <section className="credit-log">
    <div className="credit-log-toolbar">{onBack && <button className="button secondary" type="button" onClick={onBack}><ArrowLeft size={16} /> Anlaşmalara Dön</button>}<span className="muted">Son 100 kullanım</span></div>
    {query.isPending && <p role="status">Hareketler yükleniyor…</p>}{query.error && <p className="error" role="alert">{errorText(query.error)}</p>}
    <div className="credit-log-table-wrap"><table className="credit-log-table" aria-label="Kredi Hareketleri"><thead><tr><th scope="col">Tarih / Saat</th><th scope="col">Müşteri</th><th scope="col">Talep</th><th scope="col">Anlaşma</th><th scope="col">Kredi</th></tr></thead>
      <tbody>{charges.slice((page - 1) * 20, page * 20).map(c => <tr key={c.id}><td><time dateTime={c.createdAt}>{new Date(c.createdAt).toLocaleString('tr-TR', { timeZone: 'Europe/Istanbul' })}</time></td><td>{c.conversation.customer.name}</td><td><Link to={conversationPath(user!.role, c.conversation.id)}>#TK-{String(c.conversation.number).padStart(5, '0')}</Link><small>{c.conversation.subject}</small></td><td>{c.agreement?.name ?? 'Ücretsiz destek'}</td><td className="credit-log-amount">{c.credits > 0 ? '-' : ''}{c.credits}</td></tr>)}
      {!query.isPending && !query.error && charges.length === 0 && <tr><td colSpan={5} className="credit-log-empty">Henüz kredi kullanımı yok.</td></tr>}</tbody></table></div>
    {pages > 1 && <nav className="pagination" aria-label="Kredi Hareketleri Sayfaları"><button className="button secondary" disabled={page === 1} onClick={() => setPage(v => v - 1)}>Önceki</button><span>{page} / {pages}</span><button className="button secondary" disabled={page >= pages} onClick={() => setPage(v => v + 1)}>Sonraki</button></nav>}
  </section>;
}
function AgreementWorkspace({ customerId, onSelectCustomer }: { customerId: string; onSelectCustomer?: (customer: Person) => void }) {
  const { user } = useAuth(); const client = useQueryClient();
  const editable = user?.role !== 'CUSTOMER' && hasPermission(user, 'customers.update');
  const summary = useQuery({ queryKey: ['agreements', customerId], queryFn: async () => (await api.get(`/customers/${customerId}/agreements`)).data.data as Summary });
  const [adding, setAdding] = useState(false), [notice, setNotice] = useState('');
  const [agreementType, setAgreementType] = useState('MONTHLY'), [startsOn, setStartsOn] = useState(''), [manualEnd, setManualEnd] = useState('');
  const automaticPeriod = ['MONTHLY', 'YEARLY'].includes(agreementType);
  const endsOn = automaticPeriod ? agreementEndDate(startsOn, agreementType) : manualEnd;
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['agreements'] }), client.invalidateQueries({ queryKey: ['/customers'] }), client.invalidateQueries({ queryKey: ['conversations'] })]); };
  const save = useMutation({ mutationFn: (data: object) => api.post(`/customers/${customerId}/agreements`, data), onSuccess: async () => { setAdding(false); setNotice('Anlaşma eklendi.'); await refresh(); } });
  const cancel = useMutation({ mutationFn: (id: string) => api.post(`/customers/${customerId}/agreements/${id}/cancel`), onSuccess: async () => { setNotice('Anlaşma iptal edildi. Geçmiş hareketleri korundu.'); await refresh(); } });
  const error = summary.error || save.error || cancel.error;
  if (summary.isPending) return <p role="status">Anlaşmalar yükleniyor…</p>;
  const data = summary.data;
  return <section className="agreement-workspace">
    {error && <p className="error" role="alert">{errorText(error)}</p>}
    {data && <>
      {user?.role === 'CUSTOMER' && data.parent?.id === user.id && <Link className="button secondary agreement-back" to="/customer/agreements"><ArrowLeft size={16} /> Şirket Anlaşmalarına Dön</Link>}
      <div className={`agreement-overview ${data.parent ? 'has-parent' : ''}`}>
        <div><span>{data.parent ? 'Kendi kredisi' : 'Kullanılabilir kredi'}</span><strong>{data.personalCredits ?? data.availableCredits}</strong></div>
        {data.parent && <><div><span>Şirket ortak bakiyesi</span><strong>{data.parentCredits}</strong><small>{data.parent.name} · {data.parent.shareCreditsWithChildren ? 'Ortak kullanım açık' : 'Ortak kullanım kapalı'}</small></div><div><span>Kullanılabilir toplam</span><strong>{data.availableCredits}</strong><small>Kendi kredisi + kullanılabilen ortak kredi</small></div></>}
      </div>
      {data.parent && <p className="agreement-credit-note muted">{data.parent.shareCreditsWithChildren ? 'Ortak bakiye tüm alt müşterilerce kullanılır.' : 'Ortak kullanım kapalı; yalnızca kendi krediniz kullanılabilir.'}</p>}
      {!data.customer.parentCustomerId && !data.parent && <CompanyCreditSharing customer={data.customer} />}
      {data.children.length > 0 && <section className="agreement-children" aria-label="Alt Müşteriler">
        <h3>Alt Müşteriler</h3>
        {data.children.map(child => <div className="agreement-history" key={child.id}><div><strong>{child.name}</strong><small>{child.isActive ? 'Kişisel kalan kredi' : 'Pasif müşteri'}: {child.personalCredits ?? 0}</small></div><div className="management-actions">
          {onSelectCustomer ? <button type="button" className="button secondary" onClick={() => onSelectCustomer(child)}>{child.name} Anlaşmaları</button> : <Link className="button secondary" to={`/customer/agreements?customerId=${child.id}`}>Anlaşmaları Gör</Link>}
          <Link className="button secondary" to={`${inboxPath(user!.role)}?customerId=${child.id}`}>Talepleri Gör</Link>
        </div></div>)}
      </section>}
        <div className="agreement-section-title"><h3>Anlaşmalar</h3>{editable && <button className="button primary" type="button" onClick={() => { save.reset(); setAdding(v => !v); }}>{adding ? 'Vazgeç' : '+ Anlaşma Ekle'}</button>}</div>
        {adding && <form className="agreement-form" onSubmit={event => {
          event.preventDefault(); const values = Object.fromEntries(new FormData(event.currentTarget)); setNotice(''); save.mutate({ ...values, credits: Number(values.credits) });
        }}>
          <label><span>Anlaşma Adı</span><input name="name" required maxLength={150} /></label>
          <label><span>Anlaşma Türü</span><select name="type" value={agreementType} onChange={event => { if (automaticPeriod) setManualEnd(endsOn); setAgreementType(event.target.value); }}>{Object.entries(types).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
          <label><span>Başlangıç Tarihi</span><input name="startsOn" type="date" min="1000-01-01" max="9998-12-31" required value={startsOn} onChange={event => setStartsOn(event.target.value)} /></label><label><span>Bitiş Tarihi</span><input name="endsOn" type="date" min={startsOn || '1000-01-01'} max="9999-12-31" required value={endsOn} readOnly={automaticPeriod} onChange={event => setManualEnd(event.target.value)} />{automaticPeriod && <small className="muted">{agreementType === 'MONTHLY' ? 'Başlangıca göre bir aylık süre hesaplanır.' : 'Başlangıca göre bir yıllık süre hesaplanır.'}</small>}</label>
          <label><span>Kredi Miktarı</span><input name="credits" type="number" min="0" max="1000000" step="1" required /></label>
          <p className="muted">Paketler otomatik yenilenmez.</p><button className="button primary" disabled={save.isPending}>{save.isPending ? 'Kaydediliyor…' : 'Anlaşmayı Kaydet'}</button>
        </form>}
        {!data.agreements.length && <p className="muted">Henüz anlaşma bulunmuyor.</p>}
        {data.agreements.map(a => <details className="agreement-card" key={a.id}><summary><strong>{a.name}</strong><span>{a.customer.name} · {states[a.state]} · {a.remainingCredits} / {a.credits} kredi</span></summary><div className="agreement-card-body"><p className="muted">{a.customerId === customerId ? 'Bu müşterinin kendi paketi' : a.customerId === data.parent?.id ? 'Şirketin ortak paketi' : 'Alt müşterinin kişisel paketi'}{a.customerId === data.parent?.id && !data.parent.shareCreditsWithChildren ? ' · Ortak kullanım kapalı' : ''}</p><p>{types[a.type]} · {date(a.startsOn)} — {date(a.endsOn)}</p><p>Verilen: <strong>{a.credits}</strong> · Kullanılan: <strong>{a.usedCredits}</strong> · Kalan: <strong>{a.remainingCredits}</strong></p>{a.state !== 'ACTIVE' && <p className="muted">Bu anlaşmanın kredileri şu anda kullanılamaz.</p>}{editable && a.customerId === customerId && a.state !== 'CANCELLED' && <button className="button secondary" type="button" disabled={cancel.isPending} onClick={() => cancel.mutate(a.id)}>Anlaşmayı İptal Et</button>}</div></details>)}
    </>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}

export function ResolveWithCreditModal({ conversationId, status, onClose, onResolved }: { conversationId: string; status: string; onClose: () => void; onResolved: () => void }) {
  const formId = useId();
  const [selected, setSelected] = useState(''), [credits, setCredits] = useState('0');
  const options = useQuery({ queryKey: ['credit-options', conversationId], queryFn: async () => (await api.get(`/conversations/${conversationId}/credit-options`)).data.data as { agreements: Agreement[]; charge: { credits: number } | null } });
  useEffect(() => {
    if (options.data) setSelected(current => options.data.agreements.some(a => a.id === current && a.remainingCredits > 0) ? current : options.data.agreements.find(a => a.remainingCredits > 0)?.id ?? '');
  }, [options.data]);
  const save = useMutation({ mutationFn: () => api.patch(`/conversations/${conversationId}`, { status, ...(!options.data?.charge ? { creditResolution: { agreementId: Number(credits) > 0 ? selected : null, credits: Number(credits) } } : {}) }), onSuccess: () => { onResolved(); onClose(); } });
  const agreement = options.data?.agreements.find(a => a.id === selected);
  return <AgreementDialog title="Talebi Çöz" onClose={onClose} pending={save.isPending} compact footer={options.data && <><button className="button secondary" type="button" disabled={save.isPending} onClick={onClose}>Vazgeç</button><button className="button primary" type="submit" form={formId} disabled={save.isPending || Boolean(options.error) || (!options.data.charge && Number(credits) > 0 && !selected)}>{save.isPending ? 'Kaydediliyor…' : 'Çözümü Kaydet'}</button></>}>
    {options.isPending && <p role="status">Krediler yükleniyor…</p>}{(options.error || save.error) && <p className="error" role="alert">{errorText(options.error || save.error)}</p>}
    {options.data && <form id={formId} className="agreement-resolution" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      {options.data.charge ? <p>Daha önce {options.data.charge.credits} kredi kullanıldı. Yeniden düşülmez.</p> : <>
        <DropdownSelect label="Kullanılacak Anlaşma" ariaLabel="Kullanılacak Anlaşma" value={selected} onChange={setSelected} options={[{ value: '', label: 'Anlaşma seçin' }, ...options.data.agreements.filter(a => a.remainingCredits > 0).map(a => ({ value: a.id, label: `${a.name} — ${a.customer.name} (${a.remainingCredits} kredi)` }))]} />
        {agreement && <p>{date(agreement.startsOn)} — {date(agreement.endsOn)} · Kullanılabilir: <strong>{agreement.remainingCredits} kredi</strong></p>}
        <label className="agreement-credit-input"><span>Kullanılacak Kredi</span><input aria-label="Kullanılacak Kredi" type="number" min="0" max={agreement?.remainingCredits ?? 1000000} step="1" required value={credits} onChange={e => setCredits(e.target.value)} /></label>
        <p className="muted">Ücretsiz destek için 0 girin.</p>
      </>}

    </form>}
  </AgreementDialog>;
}
