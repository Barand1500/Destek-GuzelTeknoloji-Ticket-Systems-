import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { DropdownSelect } from '../../components/DropdownSelect';
import { money, count } from './types';

type Reversal = { id: string; kind: string; status: string; credits: number; amount: string; currency: string; reason: string; createdAt: string };
type Summary = { data: Reversal[]; currency: string; refundableCredits: number; refundableAmount: string; originalCredits: number; total: string; refundedCredits: number; refundedAmount: string; hasPending: boolean; usedCredits: number; canCancel: boolean };
const states: Record<string, string> = { PENDING: 'İade bekliyor', REVIEW: 'Sonuç kontrol ediliyor', SUCCEEDED: 'İade edildi', FAILED: 'İade başarısız' };
export function PaymentReversalPanel({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['payment-reversals', orderId], queryFn: async () => (await api.get(`/credit-sales/orders/${orderId}/reversals`)).data.data as Summary, refetchInterval: 30000 });
  const [credits, setCredits] = useState(''), [kind, setKind] = useState('REFUND'), [reason, setReason] = useState(''), [consent, setConsent] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID()), [notice, setNotice] = useState('');
  const [manual, setManual] = useState<Reversal | null>(null), [reference, setReference] = useState(''), [confirmed, setConfirmed] = useState(false);
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['payment-reversals', orderId] }), client.invalidateQueries({ queryKey: ['/credit-sales/orders'] }), client.invalidateQueries({ queryKey: ['/my/credit-store/orders'] }), client.invalidateQueries({ queryKey: ['agreements'] })]); };
  const refund = useMutation({ mutationFn: () => api.post(`/credit-sales/orders/${orderId}/reversals`, { requestKey, kind, credits: Number(credits), reason }), onSuccess: async () => { setNotice('İade talebi kaydedildi. Sonuç aşağıda gösterilir.'); setRequestKey(crypto.randomUUID()); setCredits(''); setKind('REFUND'); setConsent(false); await refresh(); } });
  const check = useMutation({ mutationFn: ({ id, close }: { id: string; close: boolean }) => api.post(`/credit-sales/reversals/${id}/${close ? 'no-refund' : 'check'}`, close ? { confirmedNoRefund: confirmed, providerReference: reference } : {}), onSuccess: async () => { setManual(null); await refresh(); } });
  const data = query.data, value = Number(credits);
  const totalMinor = Math.round(Number(data?.total ?? 0) * 100), oldMinor = Math.round(Number(data?.refundedAmount ?? 0) * 100);
  const amount = data && Number.isSafeInteger(value) && value > 0 ? Math.max(0, Number(BigInt(totalMinor) * BigInt(data.refundedCredits + value) / BigInt(data.originalCredits) - BigInt(oldMinor))) / 100 : 0;
  const busy = refund.isPending || check.isPending;
  const edit = (fn: () => void) => { fn(); setRequestKey(crypto.randomUUID()); setConsent(false); refund.reset(); };
  return <section className="credit-sales-card payment-reversal-panel" aria-label="İade ve banka iptali">
    <div className="credit-store-title"><h3>İade ve Banka İptali</h3><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Kapat</button></div>
    <ErrorMessage error={query.error} /><ErrorMessage error={refund.error} /><ErrorMessage error={check.error} />
    {notice && <p role="status">{notice}</p>}
    {data && <><p>Kullanılmış: {count(data.usedCredits)} kredi · İade edilebilir: {count(data.refundableCredits)} kredi / {money(data.refundableAmount, data.currency)}</p>
      <p>İade başarılı olduğunda ilgili krediler kaldırılır ve bu aboneliğin otomatik yenilemesi kapanır. Talep ve kullanım geçmişi korunur. Banka iptali yalnızca hiç kullanılmamış ödemenin tamamı içindir; bankanın işlem günü kuralına bağlıdır.</p>
      {!data.hasPending && data.refundableCredits > 0 && <form onSubmit={e => { e.preventDefault(); refund.mutate(); }}>
        <fieldset className="payment-settings-fields" disabled={busy}>
          <DropdownSelect label="İşlem" ariaLabel="İade işlemi" value={kind} onChange={v => edit(() => { setKind(v); if (v === 'CANCEL') setCredits(String(data.originalCredits)); })} options={[{ value: 'REFUND', label: 'Tam / kısmi iade' }, ...(data.canCancel ? [{ value: 'CANCEL', label: 'Ödemenin tamamını bankadan iptal et' }] : [])]} />
          <label><span className="field-label">İade edilecek kredi *</span><input inputMode="numeric" required value={credits} onChange={e => edit(() => setCredits(e.target.value.replace(/\D/g, '')))} /></label>
          <label className="payment-public-url"><span className="field-label">İade nedeni *</span><input required minLength={3} maxLength={500} value={reason} onChange={e => edit(() => setReason(e.target.value))} /></label>
        </fieldset>
        <strong>İade tutarı: {money(amount, data.currency)}</strong>
        <label className="integration-toggle credit-renewal-choice"><span>{count(value || 0)} kredinin kullanıma kapatılmasını ve {money(amount, data.currency)} iade edilmesini onaylıyorum.</span><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><i aria-hidden="true" /></label>
        <button className="button primary" disabled={busy || !consent || !Number.isInteger(value) || value < 1 || value > data.refundableCredits || amount <= 0 || reason.trim().length < 3 || (kind === 'CANCEL' && (data.usedCredits > 0 || data.refundedCredits > 0 || value !== data.originalCredits))}>İadeyi Onayla</button>
      </form>}
      {data.hasPending && <p className="credit-store-notice">İade sonucu bekleniyor. İlgili kredi ayrıldı; yeniden iade veya yenileme çekimi başlatılmaz.</p>}
      {data.data.map(row => <article key={row.id} className="payment-reversal-row"><strong>{states[row.status] ?? row.status} · {money(row.amount, row.currency)} · {count(row.credits)} kredi</strong><p>{row.reason}</p>{['PENDING', 'REVIEW'].includes(row.status) && <div className="payment-settings-actions"><button className="button secondary" disabled={busy} onClick={() => check.mutate({ id: row.id, close: false })}>İade Sonucunu Sorgula</button><button className="button secondary" disabled={busy || Date.now() - new Date(row.createdAt).getTime() < 3600000} onClick={() => { setManual(row); setReference(''); setConfirmed(false); }}>İade Yapılmadığını Doğrula</button></div>}</article>)}
    </>}
    {manual && <div className="credit-sales-card"><p>Sağlayıcıdan bu iadenin yapılmadığını ve daha sonra tamamlanmayacağını doğrulamadan bu işlemi kullanmayın. Hatalı doğrulama kredi bakiyesini yanlış artırır.</p><label><span className="field-label">Sağlayıcı doğrulama referansı *</span><input value={reference} onChange={e => setReference(e.target.value)} maxLength={500} /></label><label className="integration-toggle"><span>İade yapılmadığını sağlayıcıdan doğruladım.</span><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><i aria-hidden="true" /></label><div className="payment-settings-actions"><button className="button secondary" disabled={busy} onClick={() => setManual(null)}>Vazgeç</button><button className="button primary" disabled={busy || !confirmed || reference.trim().length < 10} onClick={() => check.mutate({ id: manual.id, close: true })}>Doğrula ve Krediyi Geri Aç</button></div></div>}
  </section>;
}
