import { CreditCheckout } from "../credit-store/CreditCheckout";
import { CreditOrders } from "../credit-store/CreditOrders";
import { CustomerCreditStore } from '../credit-store/CreditStore';
import '../credit-store/credit-store.css';
import { useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { X, ArrowLeft, History, Trash2, Pencil } from 'lucide-react';
import { createPortal } from 'react-dom';
import { useIsMutating, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api, errorText } from '../../services/api';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { SearchableDropdown } from '../../components/SearchableDropdown';
import { AgreementDateField } from '../../components/AgreementDateField';
import { AgreementTypeSelect } from './AgreementTypeSelect';
import { CompanyPeoplePanel } from '../management/CompanyPeople';
import { conversationPath } from '../../router/paths';
import { agreementEndDate } from '../../utils/agreement-dates';
import './agreements.css';

type Person = { id: string; name: string; company?: string | null; isActive?: boolean; parentCustomerId?: string | null; shareCreditsWithChildren?: boolean; personalCredits?: number };
export type Agreement = { id: string; name: string; type: string; typeLabel?: string; startsOn: string; endsOn: string; fee: string; credits: number; usedCredits: number; remainingCredits: number; renewalRequested?: boolean; usable: boolean; state: string; customer: Person; customerId: string };
type Charge = { id: string; credits: number; createdAt: string; agreement: { name: string } | null; conversation: { id: string; number: number; subject: string; customer: { name: string } } };
type Summary = { companyName?: string | null; customer: Person; parent: Person | null; children: Person[]; agreements: Agreement[]; charges: Charge[]; availableCredits: number; personalCredits: number; sharedCredits: number; parentCredits: number };
const types: Record<string, string> = { MONTHLY: 'Aylık', YEARLY: 'Yıllık', ONE_OFF: 'Ek Destek Kredisi', MAINTENANCE: 'Bakım Anlaşması' };
const states: Record<string, string> = { ACTIVE: 'Aktif', UPCOMING: 'Başlamadı', EXPIRED: 'Süresi Doldu', CANCELLED: 'İptal Edildi', DEPLETED: 'Kredi Tükendi' };
const creditNumber = new Intl.NumberFormat('tr-TR');
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
export function CustomerAgreementsModal({ customer, onClose }: { customer: Person; onClose: () => void }) {
  const { user } = useAuth();
  const canEdit = user?.role !== 'CUSTOMER' && hasPermission(user, 'customers.update');
  const summary = useQuery({ refetchOnMount: 'always', queryKey: ['agreements', customer.id], queryFn: async () => (await api.get(`/customers/${customer.id}/agreements`)).data.data as Summary });
  const [tab, setTab] = useState<'agreements' | 'people'>('agreements');
  const [editing, setEditing] = useState<Agreement | null>(null);
  const [history, setHistory] = useState(false);
  const [adding, setAdding] = useState(false), [pending, setPending] = useState(false), [ready, setReady] = useState(false);
  const formId = useId();
  const companyCustomer = summary.data?.customer ?? customer;
  const showPeople = !companyCustomer.parentCustomerId;
  useEffect(() => { if (!showPeople) setTab('agreements'); }, [showPeople]);
  const switchTab = (next: 'agreements' | 'people') => { setTab(next); setHistory(false); setAdding(false); setEditing(null); };
  return <AgreementDialog title={customer.name + ' — Yönetim'} onClose={onClose} pending={pending}
    footer={tab === 'people' || history || !canEdit || summary.data?.customer.parentCustomerId ? undefined : editing ? <><button className="button secondary" type="button" disabled={pending} onClick={() => setEditing(null)}>Vazgeç</button><button className="button primary" type="submit" form={formId} disabled={pending}>{pending ? 'Kaydediliyor…' : 'Değişiklikleri Kaydet'}</button></> : <>{adding && <button className="button secondary" type="button" disabled={pending} onClick={() => setAdding(false)}>Vazgeç</button>}{ready && (adding ? <button type="submit" form={formId} className="button primary" disabled={pending}>{pending ? 'Kaydediliyor…' : 'Anlaşmayı Kaydet'}</button> : <button type="button" className="button primary" disabled={pending} onClick={() => setAdding(true)}>+ Anlaşma Ekle</button>)}</>}
    headerActions={<>{summary.data && <div className="agreement-header-credit"><span>{summary.data.parent || summary.data.children.length ? 'Şirket kredisi' : 'Kullanılabilir kredi'}</span><strong>{new Intl.NumberFormat('tr-TR').format(summary.data.availableCredits)}</strong></div>}{tab === 'agreements' && <button className="standard-modal-close" type="button" aria-label="Kredi Hareketleri" title="Kredi Hareketleri" disabled={pending || Boolean(editing)} aria-pressed={history} onClick={() => setHistory(v => !v)}><History size={18} /></button>}</>}>
    <div className="customer-relation-choices company-management-tabs" aria-label="Yönetim Bölümleri">
      <button type="button" className={'relation-tab' + (tab === 'agreements' ? ' active' : '')} aria-pressed={tab === 'agreements'} disabled={pending} onClick={() => switchTab('agreements')}>Anlaşmalar ve Kredi</button>
      {showPeople && <button type="button" className={'relation-tab' + (tab === 'people' ? ' active' : '')} aria-pressed={tab === 'people'} disabled={pending} onClick={() => switchTab('people')}>Şirkete Bağlı Kişiler</button>}
    </div>
    {tab === 'people' && showPeople ? <CompanyPeoplePanel customer={companyCustomer} onPendingChange={setPending} /> : <><div hidden={history}><AgreementWorkspace customerId={customer.id} modalControl={{ adding, setAdding, editing, setEditing, formId, onPendingChange: setPending, onReadyChange: setReady }} /></div>{history && <CreditHistory customerId={customer.id} onBack={() => setHistory(false)} />}</>}
  </AgreementDialog>;
}
export function CustomerAgreementsPage() {
  const { user } = useAuth(); const [params, setParams] = useSearchParams();
  const [history, setHistory] = useState(false);
  const shopping = params.get("view") === "store", ordersVisible = params.get("view") === "orders", checkoutVisible = params.get("view") === "checkout";
  const changeView = (view: string) => { const next = new URLSearchParams(params); next.set("view", view); setParams(next); };
  const customerId = params.get('customerId') || user!.id;
  const summary = useQuery({queryKey:['agreements',customerId],queryFn:async()=>(await api.get(`/customers/${customerId}/agreements`)).data.data as Summary});
  const data=summary.data;
  const companyName=data?.companyName?.trim() || (data?.parent ? data.parent.company?.trim() : data?.customer.company?.trim());
  return <main className="page customer-agreements-page"><div className="page-heading customer-agreements-heading"><div><h1>Anlaşmalarım ve Kredilerim</h1>{companyName&&<p className="customer-agreements-company">{companyName}</p>}</div><div className="customer-agreements-actions">{data&&<div className="agreement-header-credit"><span>{data.parent||data.children.length?'Şirket kredisi':'Kullanılabilir kredi'}</span><strong>{new Intl.NumberFormat('tr-TR').format(data.availableCredits)}</strong></div>}{data && !data.customer.parentCustomerId && <button className="button primary" type="button" aria-pressed={shopping} onClick={() => changeView(shopping ? "agreements" : "store")}>{shopping ? "Anlaşmalarıma Dön" : "Kredi Yükle ve Paketler"}</button>}{data && !data.customer.parentCustomerId && <button className="button secondary" type="button" aria-pressed={ordersVisible} onClick={() => changeView(ordersVisible ? "agreements" : "orders")}>{ordersVisible ? "Anlaşmalarıma Dön" : "Siparişlerim"}</button>}<button className="button secondary" type="button" onClick={() => setHistory(true)}><History size={17} /> Kredi Hareketleri</button></div></div>{checkoutVisible && data && !data.customer.parentCustomerId ? <CreditCheckout key={params.get("orderId") || ""} orderId={params.get("orderId") || ""} onBack={() => changeView("orders")} /> : ordersVisible && data && !data.customer.parentCustomerId ? <CreditOrders /> : shopping && data && !data.customer.parentCustomerId ? <CustomerCreditStore /> : <AgreementWorkspace key={customerId} customerId={customerId} />}
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
type WorkspaceModalControl = { editing: Agreement | null; setEditing: (agreement: Agreement | null) => void; adding: boolean; setAdding: (value: boolean) => void; formId: string; onPendingChange: (pending: boolean) => void; onReadyChange: (ready: boolean) => void };
function AgreementWorkspace({ customerId, modalControl }: { customerId: string; modalControl?: WorkspaceModalControl }) {
  const { user } = useAuth(); const client = useQueryClient();
  const summary = useQuery({ queryKey: ['agreements', customerId], queryFn: async () => (await api.get(`/customers/${customerId}/agreements`)).data.data as Summary });
  const editable = user?.role !== 'CUSTOMER' && !summary.data?.customer.parentCustomerId && hasPermission(user, 'customers.update');
  const canDelete = user?.role !== 'CUSTOMER' && !summary.data?.customer.parentCustomerId && hasPermission(user, 'customers.delete');

  const [editPending, setEditPending] = useState(false);
  const [localEditing, setLocalEditing] = useState<Agreement | null>(null);
  const editing = modalControl?.editing ?? localEditing, setEditing = modalControl?.setEditing ?? setLocalEditing;
  const [localAdding, setLocalAdding] = useState(false), [notice, setNotice] = useState('');
  const localFormId = useId();
  const adding = modalControl?.adding ?? localAdding, setAdding = modalControl?.setAdding ?? setLocalAdding;
  const formId = modalControl?.formId ?? localFormId;
  const typeMutations = useIsMutating({ mutationKey: ['agreement-types'] });
  const [agreementType, setAgreementType] = useState('MONTHLY'), [startsOn, setStartsOn] = useState(''), [manualEnd, setManualEnd] = useState('');
  const [renewalRequested, setRenewalRequested] = useState(false);
  const automaticPeriod = ['MONTHLY', 'YEARLY'].includes(agreementType);
  const endsOn = automaticPeriod ? agreementEndDate(startsOn, agreementType) : manualEnd;
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['agreements'] }), client.invalidateQueries({ queryKey: ['/customers'] }), client.invalidateQueries({ queryKey: ['conversations'] }), client.invalidateQueries({ queryKey: ['credit-options'] })]); };
  const save = useMutation({ mutationFn: (data: object) => api.post(`/customers/${customerId}/agreements`, data), onSuccess: async () => { setAdding(false); setNotice(''); await refresh(); } });
  const cancel = useMutation({ mutationFn: (id: string) => api.post(`/customers/${customerId}/agreements/${id}/cancel`), onSuccess: async () => { setNotice('Anlaşma iptal edildi. Geçmiş hareketleri korundu.'); await refresh(); } });
  const reactivate = useMutation({ mutationFn: (id: string) => api.post(`/customers/${customerId}/agreements/${id}/reactivate`), onSuccess: async () => { setNotice('Anlaşma yeniden etkinleştirildi.'); await refresh(); } });
  const remove = useMutation({ mutationFn: (agreement: Agreement) => api.delete(`/customers/${agreement.customerId}/agreements/${agreement.id}`), onSuccess: async () => { setNotice('Anlaşma silindi.'); await refresh(); } });
  const pending = save.isPending || cancel.isPending || remove.isPending || reactivate.isPending || editPending || typeMutations > 0;
  useEffect(() => { modalControl?.onReadyChange(Boolean(summary.data)); }, [Boolean(summary.data), modalControl?.onReadyChange]);
  useEffect(() => { modalControl?.onPendingChange(pending); }, [pending, modalControl?.onPendingChange]);
  const error = summary.error || save.error || cancel.error || reactivate.error || remove.error;
  if (summary.isPending) return <p role="status">Anlaşmalar yükleniyor…</p>;
  const data = summary.data;
  const visibleAgreements = data?.agreements ?? [];
  return <section className="agreement-workspace">
    {error && <p className="error" role="alert">{errorText(error)}</p>}
    {data && <>
        <div className="agreement-section-title"><h3>Anlaşmalar</h3>{editable && !modalControl && !editing && <button className="button primary" type="button" onClick={() => { save.reset(); setAdding(!adding); }}>{adding ? 'Vazgeç' : '+ Anlaşma Ekle'}</button>}</div>
        {editing && <EditAgreementForm key={editing.id} agreement={editing} formId={formId} onPendingChange={setEditPending} inlineActions={!modalControl} onClose={() => setEditing(null)} onSaved={async () => { setEditing(null); setNotice("Anlaşma güncellendi."); await refresh(); }} />}
        {adding && !editing && editable && <form id={formId} className="agreement-form agreement-entry-form" onSubmit={event => {
          event.preventDefault(); if (pending) return; const values = Object.fromEntries(new FormData(event.currentTarget)); setNotice(''); save.mutate({ ...values, credits: Number(values.credits), renewalRequested });
        }}>
          <label className="agreement-field"><span className="field-label">Anlaşma Adı</span><input name="name" required maxLength={150} /></label>
          <AgreementTypeSelect value={agreementType} onChange={value => { if (automaticPeriod) setManualEnd(endsOn); setAgreementType(value); }} />
          <AgreementDateField label="Başlangıç Tarihi" name="startsOn" min="1000-01-01" max="9998-12-31" value={startsOn} onChange={setStartsOn} />
          <AgreementDateField label="Bitiş Tarihi" name="endsOn" min={startsOn || "1000-01-01"} value={endsOn} readOnly={automaticPeriod} onChange={setManualEnd} />
          <label className="agreement-field"><span className="field-label">Kredi Miktarı</span><input name="credits" type="number" min="0" max="1000000" step="1" required /></label>
          <AgreementRenewalToggle checked={renewalRequested} onChange={setRenewalRequested} disabled={pending} />
          {!modalControl && <div className="agreement-page-actions"><button className="button secondary" type="button" disabled={pending} onClick={() => setAdding(false)}>Vazgeç</button><button className="button primary" disabled={pending}>{save.isPending ? 'Kaydediliyor…' : 'Anlaşmayı Kaydet'}</button></div>}
        </form>}
        {!adding && !editing && !visibleAgreements.length && <p className="muted">Henüz anlaşma bulunmuyor.</p>}
        {visibleAgreements.map(a => <details className="agreement-card" key={a.id}><summary><span className="agreement-package-overview"><strong>{a.name}</strong><span className="agreement-package-dates">Başlangıç: <time dateTime={a.startsOn}>{date(a.startsOn)}</time> · Bitiş: <time dateTime={a.endsOn}>{date(a.endsOn)}</time></span><span className="agreement-package-credits">Toplam: <strong>{creditNumber.format(a.credits)}</strong> · Kullanılan: <strong>{creditNumber.format(a.usedCredits)}</strong> · Kalan: <strong>{creditNumber.format(a.remainingCredits)}</strong></span></span><span className="agreement-summary-actions"><span>{a.customer.name} · {states[a.state]}</span>{editable && <button className="agreement-edit-button" type="button" aria-label={a.name + " anlaşmasını düzenle"} title="Anlaşmayı Düzenle" disabled={pending} onClick={event => { event.preventDefault(); event.stopPropagation(); setAdding(false); setEditing(a); }}><Pencil size={16} /></button>}{canDelete && <button className="agreement-delete-button" type="button" aria-label={a.name + " anlaşmasını sil"} title="Anlaşmayı Sil" disabled={pending} onClick={event => { event.preventDefault(); event.stopPropagation(); if (!pending) { remove.reset(); setNotice(''); remove.mutate(a); } }}><Trash2 size={16} /></button>}</span></summary><div className="agreement-card-body"><p className="muted">{data.parent || data.children.length ? 'Şirket paketi' : 'Bireysel müşteri paketi'}</p><p>{a.typeLabel ?? types[a.type] ?? 'Özel Anlaşma'} · {date(a.startsOn)} — {date(a.endsOn)}</p><p>Verilen: <strong>{creditNumber.format(a.credits)}</strong> · Kullanılan: <strong>{creditNumber.format(a.usedCredits)}</strong> · Kalan: <strong>{creditNumber.format(a.remainingCredits)}</strong></p>{a.state !== 'ACTIVE' && <p className="muted">Bu anlaşmanın kredileri şu anda kullanılamaz.</p>}{editable && a.customerId === customerId && a.state === 'CANCELLED' && <button className="button secondary" type="button" disabled={pending} onClick={() => reactivate.mutate(a.id)}>Yeniden Etkinleştir</button>}{editable && a.customerId === customerId && a.state !== 'CANCELLED' && <button className="button secondary" type="button" disabled={pending} onClick={() => cancel.mutate(a.id)}>Anlaşmayı İptal Et</button>}</div></details>)}
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
  return <AgreementDialog title="Talebi Çöz" onClose={onClose} pending={save.isPending} compact footer={options.data && <><button className="button primary" type="submit" form={formId} disabled={save.isPending || Boolean(options.error) || (!options.data.charge && Number(credits) > 0 && !selected)}>{save.isPending ? 'Kaydediliyor…' : 'Çözümü Kaydet'}</button></>}>
    {options.isPending && <p role="status">Krediler yükleniyor…</p>}{(options.error || save.error) && <p className="error" role="alert">{errorText(options.error || save.error)}</p>}
    {options.data && <form id={formId} className="agreement-resolution" onSubmit={event => { event.preventDefault(); save.mutate(); }}>
      {options.data.charge ? <p>Daha önce {options.data.charge.credits} kredi kullanıldı. Yeniden düşülmez.</p> : <>
        <SearchableDropdown label="Kullanılacak Anlaşma" name="agreementId" value={selected} onChange={setSelected} options={[{ value: '', label: 'Anlaşma seçin' }, ...options.data.agreements.filter(a => a.remainingCredits > 0).map(a => ({ value: a.id, label: `${a.name} — ${a.customer.name} (${a.remainingCredits} kredi)` }))]} />
        {agreement && <p>{date(agreement.startsOn)} — {date(agreement.endsOn)} · Kullanılabilir: <strong>{agreement.remainingCredits} kredi</strong></p>}
        <label className="agreement-credit-input"><span>Kullanılacak Kredi</span><input aria-label="Kullanılacak Kredi" type="number" min="0" max={agreement?.remainingCredits ?? 1000000} step="1" required value={credits} onChange={e => setCredits(e.target.value)} /></label>

      </>}

    </form>}
  </AgreementDialog>;
}

function EditAgreementForm({ agreement, formId, onClose, onSaved, onPendingChange, inlineActions }: { agreement: Agreement; formId: string; onClose: () => void; onSaved: () => Promise<void>; onPendingChange?: (pending: boolean) => void; inlineActions: boolean }) {
  const [name, setName] = useState(agreement.name), [type, setType] = useState(agreement.type);
  const [start, setStart] = useState(agreement.startsOn.slice(0, 10)), [end, setEnd] = useState(agreement.endsOn.slice(0, 10));
  const [credits, setCredits] = useState(String(agreement.credits));
  const [renewalRequested, setRenewalRequested] = useState(agreement.renewalRequested ?? false);
  const catalogPending = useIsMutating({ mutationKey: ['agreement-types'] });
  const save = useMutation({ mutationFn: () => api.put('/customers/' + agreement.customerId + '/agreements/' + agreement.id, { name, type, startsOn: start, endsOn: end, credits: Number(credits), renewalRequested }), onSuccess: onSaved });
  const pending = save.isPending || catalogPending > 0;
  useEffect(() => { onPendingChange?.(pending); return () => onPendingChange?.(false); }, [pending, onPendingChange]);
  const automatic = ['MONTHLY', 'YEARLY'].includes(type);
  return <section className="agreement-inline-editor">
    {save.error && <p className="error" role="alert">{errorText(save.error)}</p>}
    <form id={formId} className="agreement-form agreement-entry-form agreement-edit-form" onSubmit={event => { event.preventDefault(); if (!pending) save.mutate(); }}>
      <label className="agreement-field"><span className="field-label">Anlaşma Adı</span><input name="name" required maxLength={150} value={name} disabled={pending} onChange={e => setName(e.target.value)} /></label>
      <AgreementTypeSelect value={type} fallbackType={{ id: agreement.type, name: agreement.typeLabel ?? types[agreement.type] ?? 'Özel Anlaşma' }} onChange={next => { setType(next); if (['MONTHLY', 'YEARLY'].includes(next)) setEnd(agreementEndDate(start, next)); }} />
      <AgreementDateField label="Başlangıç Tarihi" name="startsOn" min="1000-01-01" max="9998-12-31" value={start} disabled={pending} onChange={value => { setStart(value); if (automatic) setEnd(agreementEndDate(value, type)); }} />
      <AgreementDateField label="Bitiş Tarihi" name="endsOn" min={start || "1000-01-01"} value={end} readOnly={automatic} disabled={pending} onChange={setEnd} />
      <label className="agreement-field"><span className="field-label">Kredi Miktarı</span><input name="credits" type="number" min={agreement.usedCredits} max="1000000" step="1" required disabled={pending} value={credits} onChange={e => setCredits(e.target.value)} /></label>
      <AgreementRenewalToggle checked={renewalRequested} onChange={setRenewalRequested} disabled={pending} />
      {agreement.usedCredits > 0 && <p className="muted">Kullanılan: {agreement.usedCredits} kredi</p>}
    </form>
    {inlineActions && <div className="agreement-page-actions"><button className="button secondary" type="button" disabled={pending} onClick={onClose}>Vazgeç</button><button className="button primary" type="submit" form={formId} disabled={pending}>Değişiklikleri Kaydet</button></div>}
  </section>;
}

function AgreementRenewalToggle({ checked, onChange, disabled }: { checked: boolean; onChange: (checked: boolean) => void; disabled: boolean }) {
  return <label className="integration-toggle agreement-renewal-toggle"><input type="checkbox" checked={checked} disabled={disabled} onChange={event => onChange(event.target.checked)} /><i aria-hidden="true" /><span><strong>Dönem sonunda tekrarla</strong><small>Yenileme tercihi kaydedilir. Otomatik yenileme ve tahsilat henüz etkin değil.</small></span></label>;
}
