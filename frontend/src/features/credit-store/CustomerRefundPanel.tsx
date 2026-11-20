import { reversalStateLabel } from './reversal-labels';
import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { count, money } from './types';

type Summary = {
  orderKind?: 'TOP_UP' | 'SUBSCRIPTION'; orderNumber?: number | string; orderName?: string; canCancel?: boolean; refundableCredits?: number; refundableAmount?: string;
  refundRequest?: { status: string; reason: string; reviewNote?: string | null } | null;
  canSelfRefund: boolean; usedCredits: number; total: string; currency: string; originalCredits: number; hasPending: boolean;
  data: { id: string; kind?: string; status: string; amount: string; currency: string }[];
};
export function CustomerRefundPanel({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [notice, setNotice] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const base = `/my/credit-store/orders/${encodeURIComponent(orderId)}/reversals`;
  const query = useQuery({ queryKey: ['customer-refunds', orderId], queryFn: async () => (await api.get(base)).data.data as Summary, refetchInterval: 30000 });
  const refund = useMutation({
    mutationFn: async () => (await api.post(base, { requestKey, reason })).data.data as { id?: string; kind?: string; status: string },
    onSuccess: result => { setConfirmed(false); if (result.status === 'FAILED') setRequestKey(crypto.randomUUID()); setNotice(result.kind === 'CANCEL' ? (result.status === 'SUCCEEDED' ? 'Ödeme iptali bankada doğrulandı. Hesabınıza yansıma süresi kartınızın bankasına bağlıdır.' : result.status === 'FAILED' ? 'Ödeme iptali tamamlanamadı. Krediniz hesabınızda kaldı.' : 'Ödeme iptali işleniyor. Banka sonucu burada güncellenecek.') : (result.status === 'SUCCEEDED' ? 'İade tamamlandı.' : result.status === 'FAILED' ? 'İade tamamlanamadı. Krediniz hesabınızda kaldı.' : 'İade işleniyor. Banka sonucu burada güncellenecek.')); },
    onSettled: async () => { await Promise.all([
      client.invalidateQueries({ queryKey: ['customer-refunds', orderId] }),
      client.invalidateQueries({ queryKey: ['/my/credit-store/orders'] }),
      client.invalidateQueries({ queryKey: ['agreements'] }),
      client.invalidateQueries({ queryKey: ['/my/credit-store/subscriptions'] }),
    ]); },
  });
  const request = useMutation({ mutationFn: () => api.post('/my/credit-store/orders/' + encodeURIComponent(orderId) + '/refund-request', { reason }), onSuccess: async () => { setNotice('İade talebiniz siparişe kaydedildi.'); await Promise.all([client.invalidateQueries({ queryKey: ['customer-refunds', orderId] }), client.invalidateQueries({ queryKey: ['/my/credit-store/orders'] })]); } });
  const data = query.data;
  const recorded = data?.data.find(row => ['PENDING', 'REVIEW', 'SUCCEEDED'].includes(row.status));
  const cancellation = (recorded?.kind ?? refund.data?.kind) === 'CANCEL' || (!recorded && !refund.data && data?.canCancel && data?.orderKind !== 'TOP_UP');
  return <section className="credit-sales-card payment-reversal-panel" aria-label="Sipariş iadesi">
    <div className="credit-store-title"><h3>{cancellation ? 'Ödeme İptali' : (data?.usedCredits || data?.orderKind === 'TOP_UP') ? 'İade Talebi' : 'Sipariş İadesi'}</h3><button className="button secondary" type="button" disabled={refund.isPending || request.isPending} onClick={onClose}>Kapat</button></div>
    <ErrorMessage error={request.error} /><ErrorMessage error={query.error} /><ErrorMessage error={refund.error} />
    {query.isPending && <p role="status">İade bilgileri yükleniyor…</p>}
    {notice && <p role="status">{notice}</p>}
    {data && <>
      {data.hasPending ? <p role="status">{cancellation ? 'Ödeme iptali sonucu bekleniyor.' : 'İade sonucu bekleniyor.'} İlgili krediler kullanıma kapalı.</p> : (data.usedCredits > 0 || data.orderKind === 'TOP_UP' || (!data.canSelfRefund && (data.refundableCredits ?? 0) > 0)) ? <div className="payment-reversal-form">
        <p>{count(data.usedCredits)} kredi kullanılmış. Kalan {count(data.refundableCredits ?? 0)} kredi için en fazla {money(data.refundableAmount ?? '0', data.currency)} iade talep edebilirsiniz.</p>
        {(data.refundableCredits ?? 0) > 0 ? <><p>Talebiniz destek ekibine iletilir. İade tutarı inceleme anındaki kullanılmamış krediye göre belirlenir. Talep oluşturmak kredinizi değiştirmez.</p>
        {data.refundRequest?.status === 'OPEN' ? <p role="status">İade talebiniz yönetici incelemesini bekliyor.</p> : <form className="payment-reversal-form" onSubmit={event => { event.preventDefault(); request.mutate(); }}>
          {data.refundRequest?.status === 'REJECTED' && <p>Önceki talep yanıtı: {data.refundRequest.reviewNote}</p>}
          <label><span className="field-label">İade talep nedeni *</span><textarea required minLength={3} maxLength={500} disabled={request.isPending} value={reason} onChange={event => setReason(event.target.value)} /></label>
          <button className="button primary" disabled={request.isPending || reason.trim().length < 3}>İade Talebini Gönder</button>
        </form>}</> : <p>İade edilebilir kredi kalmadı.</p>}
      </div> : data.canSelfRefund && <form className="payment-reversal-form" onSubmit={event => { event.preventDefault(); refund.mutate(); }}>
        <p><strong>{money(data.total, data.currency)}</strong> ödediğiniz karta iade edilecek; {count(data.originalCredits)} kredi kaldırılacak.</p>
        <label><span className="field-label">İade nedeni *</span><input required minLength={3} maxLength={500} disabled={refund.isPending} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <label className="integration-toggle credit-confirmation-choice"><span>İadeyi ve ilgili kredilerin kaldırılmasını onaylıyorum.</span><input type="checkbox" role="switch" checked={confirmed} disabled={refund.isPending} onChange={event => setConfirmed(event.target.checked)} /><i aria-hidden="true" /></label>
        <button className="button primary" disabled={refund.isPending || !confirmed || reason.trim().length < 3}>{refund.isPending ? 'İşleniyor…' : data.canCancel ? 'Ödeme İptalini Onayla' : 'İadeyi Onayla'}</button>
      </form>}
      {data.data.map(row => <article className="payment-reversal-row" key={row.id}><strong>{reversalStateLabel(row)} · {money(row.amount, row.currency)}</strong></article>)}
      {!data.canSelfRefund && !data.hasPending && !data.usedCredits && !data.data.length && <p>Bu sipariş şu anda iade edilemiyor.</p>}
    </>}
  </section>;
}
