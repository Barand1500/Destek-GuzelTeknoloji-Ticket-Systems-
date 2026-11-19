import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { count, money } from './types';

type Summary = {
  canSelfRefund: boolean; usedCredits: number; total: string; currency: string; originalCredits: number; hasPending: boolean;
  data: { id: string; status: string; amount: string; currency: string }[];
};
const states: Record<string, string> = { SUCCEEDED: 'Tamamlandı', FAILED: 'Başarısız', PENDING: 'İşleniyor', REVIEW: 'Banka sonucu bekleniyor' };
export function CustomerRefundPanel({ orderId, onClose }: { orderId: string; onClose: () => void }) {
  const client = useQueryClient();
  const [reason, setReason] = useState(''), [confirmed, setConfirmed] = useState(false), [notice, setNotice] = useState('');
  const [requestKey, setRequestKey] = useState(() => crypto.randomUUID());
  const base = `/my/credit-store/orders/${encodeURIComponent(orderId)}/reversals`;
  const query = useQuery({ queryKey: ['customer-refunds', orderId], queryFn: async () => (await api.get(base)).data.data as Summary, refetchInterval: 30000 });
  const refund = useMutation({
    mutationFn: async () => (await api.post(base, { requestKey, reason })).data.data as { status: string },
    onSuccess: result => { setConfirmed(false); if (result.status === 'FAILED') setRequestKey(crypto.randomUUID()); setNotice(result.status === 'SUCCEEDED' ? 'İade tamamlandı.' : result.status === 'FAILED' ? 'İade tamamlanamadı. Krediniz hesabınızda kaldı.' : 'İade işleniyor. Banka sonucu burada güncellenecek.'); },
    onSettled: async () => { await Promise.all([
      client.invalidateQueries({ queryKey: ['customer-refunds', orderId] }),
      client.invalidateQueries({ queryKey: ['/my/credit-store/orders'] }),
      client.invalidateQueries({ queryKey: ['agreements'] }),
      client.invalidateQueries({ queryKey: ['/my/credit-store/subscriptions'] }),
    ]); },
  });
  const data = query.data;
  return <section className="credit-sales-card payment-reversal-panel" aria-label="Sipariş iadesi">
    <div className="credit-store-title"><h3>Sipariş İadesi</h3><button className="button secondary" type="button" disabled={refund.isPending} onClick={onClose}>Kapat</button></div>
    <ErrorMessage error={query.error} /><ErrorMessage error={refund.error} />
    {query.isPending && <p role="status">İade bilgileri yükleniyor…</p>}
    {notice && <p role="status">{notice}</p>}
    {data && <>
      {data.hasPending ? <p role="status">İade sonucu bekleniyor. İlgili krediler kullanıma kapalı.</p> : data.usedCredits > 0 ? <p>Kredisi kullanılmış siparişler bu ekrandan iade edilemez.</p> : data.canSelfRefund && <form className="payment-reversal-form" onSubmit={event => { event.preventDefault(); refund.mutate(); }}>
        <p><strong>{money(data.total, data.currency)}</strong> ödediğiniz karta iade edilecek; {count(data.originalCredits)} kredi kaldırılacak.</p>
        <p>Bu sipariş aboneliğe aitse otomatik yenilemesi kapanır.</p>
        <label><span className="field-label">İade nedeni *</span><input required minLength={3} maxLength={500} disabled={refund.isPending} value={reason} onChange={event => setReason(event.target.value)} /></label>
        <label className="integration-toggle credit-renewal-choice"><span>İadeyi ve ilgili kredilerin kaldırılmasını onaylıyorum.</span><input type="checkbox" role="switch" checked={confirmed} disabled={refund.isPending} onChange={event => setConfirmed(event.target.checked)} /><i aria-hidden="true" /></label>
        <button className="button primary" disabled={refund.isPending || !confirmed || reason.trim().length < 3}>{refund.isPending ? 'İşleniyor…' : 'İadeyi Onayla'}</button>
      </form>}
      {data.data.map(row => <article className="payment-reversal-row" key={row.id}><strong>{states[row.status] ?? 'İşleniyor'} · {money(row.amount, row.currency)}</strong></article>)}
      {!data.canSelfRefund && !data.hasPending && !data.usedCredits && !data.data.length && <p>Bu sipariş şu anda iade edilemiyor.</p>}
    </>}
  </section>;
}
