import { MoneyInput } from './MoneyInput';
import { reversalStateLabel } from './reversal-labels';
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { money, count } from './types';

type Reversal = { id: string; kind: string; status: string; credits: number; amount: string; currency: string; reason: string; failureCode?: string | null; createdAt: string };
type Summary = { refundRequest?: { status: string; reason: string; reviewNote?: string | null } | null; data: Reversal[]; currency: string; refundableCredits: number; refundableAmount: string; maxRefundAmount?: string; originalCredits: number; total: string; refundedCredits: number; refundedAmount: string; hasPending: boolean; usedCredits: number; canCancel: boolean };
export function PaymentReversalPanel({ orderId, kind = 'REFUND', onClose }: { orderId: string; kind?: 'REFUND' | 'CANCEL'; onClose: () => void }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['payment-reversals', orderId], queryFn: async () => (await api.get(`/credit-sales/orders/${orderId}/reversals`)).data.data as Summary, refetchInterval: 30000 });
  const [credits, setCredits] = useState<string | null>(null), [reason, setReason] = useState(''), [consent, setConsent] = useState(false);
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID()), [notice, setNotice] = useState('');
  const [customAmount, setCustomAmount] = useState<string | null>(null);
  const [reviewNote, setReviewNote] = useState('');
  const [manual, setManual] = useState<Reversal | null>(null), [reference, setReference] = useState(''), [confirmed, setConfirmed] = useState(false);
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['payment-reversals', orderId] }), client.invalidateQueries({ queryKey: ['/credit-sales/orders'] }), client.invalidateQueries({ queryKey: ['/my/credit-store/orders'] }), client.invalidateQueries({ queryKey: ['agreements'] })]); };
  const refund = useMutation({ mutationFn: () => api.post(`/credit-sales/orders/${orderId}/reversals`, { requestKey, kind: actionKind, credits: value, reason, ...(customAmount !== null && actionKind === 'REFUND' ? { amount: customAmount } : {}) }), onSuccess: async () => { setNotice(actionKind === 'CANCEL' ? 'Ödeme iptali talebi kaydedildi. Sonuç aşağıda gösterilir.' : 'İade talebi kaydedildi. Sonuç aşağıda gösterilir.'); setRequestKey(crypto.randomUUID()); setCredits(null); setCustomAmount(null); setConsent(false); await refresh(); } });
  const check = useMutation({ mutationFn: ({ id, close }: { id: string; close: boolean }) => api.post(`/credit-sales/reversals/${id}/${close ? 'no-refund' : 'check'}`, close ? { confirmedNoRefund: confirmed, providerReference: reference } : {}), onSuccess: async () => { setManual(null); await refresh(); } });
  const reject = useMutation({ mutationFn: () => api.post('/credit-sales/orders/' + encodeURIComponent(orderId) + '/refund-request/reject', { reason: reviewNote }), onSuccess: refresh });
  const data = query.data, actionKind = kind === 'CANCEL' && data?.canCancel ? 'CANCEL' : 'REFUND', value = Number(customAmount !== null ? data?.refundableCredits ?? 0 : credits ?? (actionKind === 'CANCEL' ? data?.originalCredits : data?.refundableCredits) ?? 0);
  useEffect(() => { setCredits(null); setConsent(false); setRequestKey(crypto.randomUUID()); }, [actionKind]);
  const validCredits = !!data && Number.isSafeInteger(value) && value > 0 && value <= data.refundableCredits;
  const totalMinor = Math.round(Number(data?.total ?? 0) * 100), oldMinor = Math.round(Number(data?.refundedAmount ?? 0) * 100);
  const calculatedAmount = data && validCredits && data.originalCredits > 0 ? Math.max(0, Number(BigInt(totalMinor) * BigInt(data.refundedCredits + value) / BigInt(data.originalCredits) - BigInt(oldMinor))) / 100 : 0;
  const amount = customAmount === null ? calculatedAmount : Number(customAmount);
  const maxAmount = Number(data?.maxRefundAmount ?? (Number(data?.total ?? 0) - Number(data?.refundedAmount ?? 0)));
  const validAmount = Number.isFinite(amount) && amount > 0 && amount <= maxAmount && (customAmount === null || amount >= Number(data?.refundableAmount ?? 0));
  const recordedCancellation = data?.refundableCredits === 0 && data.data.some(row => row.kind === 'CANCEL' && ['PENDING', 'REVIEW', 'SUCCEEDED'].includes(row.status));
  const busy = refund.isPending || check.isPending || reject.isPending;
  const edit = (fn: () => void) => { fn(); setRequestKey(crypto.randomUUID()); setConsent(false); refund.reset(); };
  return <section className="credit-sales-card payment-reversal-panel" aria-label="İade ve banka iptali">
    <div className="credit-store-title"><h3>{actionKind === 'CANCEL' || recordedCancellation ? 'Banka İptali' : 'Sipariş İadesi'}</h3><button className="button secondary" type="button" disabled={busy} onClick={onClose}>Kapat</button></div>
    <ErrorMessage error={reject.error} /><ErrorMessage error={query.error} /><ErrorMessage error={refund.error} /><ErrorMessage error={check.error} />
    {notice && <p role="status">{notice}</p>}
    {data && <>{data.refundRequest?.status === 'OPEN' && <aside className="credit-store-notice"><strong>Müşterinin iade talebi</strong><p>{data.refundRequest.reason}</p><label><span className="field-label">Ret gerekçesi</span><textarea maxLength={500} rows={3} className="refund-reason-field" value={reviewNote} disabled={busy} onChange={e => setReviewNote(e.target.value)} /></label><button className="button secondary" disabled={busy || data.hasPending || reviewNote.trim().length < 3} onClick={() => reject.mutate()}>Talebi Reddet</button></aside>}<p>Kullanılmış: {count(data.usedCredits)} kredi · İade edilebilir: {count(data.refundableCredits)} kredi / {money(data.refundableAmount, data.currency)}</p>
      <p>İade başarılı olduğunda ilgili krediler kaldırılır. Talep ve kullanım geçmişi korunur. Banka iptali yalnızca hiç kullanılmamış ödemenin tamamı içindir; bankanın işlem günü kuralına bağlıdır.</p>
      {!data.hasPending && maxAmount > 0 && <form className="payment-reversal-form" onSubmit={e => { e.preventDefault(); refund.mutate(); }}>
        <fieldset className="payment-settings-fields" disabled={busy}>
          {actionKind === 'CANCEL' ? <div className="payment-cancel-total"><span>İptal edilecek ödemenin tamamı</span><strong>{count(data.originalCredits)} kredi / {money(data.total, data.currency)}</strong></div> : <label><span className="field-label">İade edilecek kredi *</span><input type="number" min={0} disabled={customAmount !== null} max={data.refundableCredits} step={1} required value={customAmount !== null ? String(data.refundableCredits) : credits ?? String(data.refundableCredits)} onChange={e => edit(() => { setCredits(e.target.value); setCustomAmount(null); })} /></label>}
          <label className="payment-public-url"><span className="field-label">İade nedeni *</span><input required minLength={3} maxLength={500} value={reason} onChange={e => edit(() => setReason(e.target.value))} /></label>
        </fieldset>
        {actionKind === 'REFUND' && <label><span className="field-label">İade edilecek tutar *</span><MoneyInput value={customAmount ?? calculatedAmount.toFixed(2)} onChange={next => edit(() => setCustomAmount(next))} ariaLabel="İade edilecek tutar" /><small>Varsayılan tutar kullanılmamış kredi içindir. Kullanılmış kısım dahil en fazla {money(maxAmount, data.currency)} iade edebilirsiniz. Tutarı artırırsanız kalan kredinin tamamı kapatılır.</small></label>}
        {!validAmount && (validCredits || customAmount !== null) && <p role="alert">İade tutarı kullanılmamış kredi karşılığından az veya kalan ödeme tutarından fazla olamaz.</p>}
        {!validCredits && customAmount === null && <p role="alert">En fazla {count(data.refundableCredits)} kredi iade edilebilir.</p>}
        {actionKind === 'CANCEL' && !data.canCancel && <p role="alert">Bu ödeme banka iptaline uygun değil. İade işlemini kullanın.</p>}
        <strong>İade tutarı: {money(amount, data.currency)}</strong>
        <label className="integration-toggle credit-confirmation-choice"><span>{count(value || 0)} kredinin kullanıma kapatılmasını ve {money(amount, data.currency)} iade edilmesini onaylıyorum.</span><input type="checkbox" checked={consent} onChange={e => setConsent(e.target.checked)} /><i aria-hidden="true" /></label>
        <button className="button primary" disabled={busy || !consent || !Number.isInteger(value) || value < 0 || (value === 0 && customAmount === null) || value > data.refundableCredits || !validAmount || reason.trim().length < 3 || (actionKind === 'CANCEL' && (!data.canCancel || data.usedCredits > 0 || data.refundedCredits > 0 || value !== data.originalCredits))}>{actionKind === 'CANCEL' ? 'Banka İptalini Onayla' : 'İadeyi Onayla'}</button>
      </form>}
      {data.hasPending && <p className="credit-store-notice">{actionKind === 'CANCEL' || recordedCancellation ? 'Ödeme iptali sonucu bekleniyor.' : 'İade sonucu bekleniyor.'} İlgili kredi ayrıldı; yeniden iade başlatılmaz.</p>}
      {data.data.map(row => <article key={row.id} className="payment-reversal-row"><strong>{reversalStateLabel(row)} · {money(row.amount, row.currency)} · {count(row.credits)} kredi</strong><p>{row.reason}</p>{row.failureCode === 'VPS-1021' && <p>Bankanın gün sonu kapanışı yapılmamış. Uygunsa banka iptalini seçin; değilse gün sonundan sonra iade edin.</p>}{['PENDING', 'REVIEW'].includes(row.status) && <div className="payment-settings-actions"><button className="button secondary" disabled={busy} onClick={() => check.mutate({ id: row.id, close: false })}>İade Sonucunu Sorgula</button><button className="button secondary" disabled={busy || Date.now() - new Date(row.createdAt).getTime() < 3600000} onClick={() => { setManual(row); setReference(''); setConfirmed(false); }}>İade Yapılmadığını Doğrula</button></div>}</article>)}
    </>}
    {manual && <div className="credit-sales-card payment-reversal-recovery"><p>Sağlayıcıdan bu iadenin yapılmadığını ve daha sonra tamamlanmayacağını doğrulamadan bu işlemi kullanmayın. Hatalı doğrulama kredi bakiyesini yanlış artırır.</p><label><span className="field-label">Sağlayıcı doğrulama referansı *</span><input value={reference} onChange={e => setReference(e.target.value)} maxLength={500} /></label><label className="integration-toggle"><span>İade yapılmadığını sağlayıcıdan doğruladım.</span><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><i aria-hidden="true" /></label><div className="payment-settings-actions"><button className="button secondary" disabled={busy} onClick={() => setManual(null)}>Vazgeç</button><button className="button primary" disabled={busy || !confirmed || reference.trim().length < 10} onClick={() => check.mutate({ id: manual.id, close: true })}>Doğrula ve Krediyi Geri Aç</button></div></div>}
  </section>;
}
