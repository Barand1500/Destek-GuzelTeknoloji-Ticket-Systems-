/// <reference types="vite/client" />
import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Building2, CreditCard, LockKeyhole } from 'lucide-react';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { count, money } from './types';
import './credit-store.css';
import { AkbankCardForm } from './AkbankCardForm';

type CheckoutOrder = { id: string; number: number; name: string; credits: number; total: string; currency: string; status: string; provider?: string; paymentAvailable: boolean; periodStartsOn?: string | null; customer: { name: string; email?: string | null; phone?: string | null } };
export function CreditCheckout({ orderId, onBack }: { orderId: string; onBack?: () => void }) {
  const client = useQueryClient();
  const order = useQuery({ queryKey: ['credit-checkout', orderId], queryFn: async () => (await api.get(`/my/credit-store/orders/${encodeURIComponent(orderId)}/checkout`)).data.data as CheckoutOrder });
  const [method, setMethod] = useState<'card' | 'transfer'>('card');
  const [transferNote, setTransferNote] = useState('');
  const [transferSent, setTransferSent] = useState(false);
  const [billing, setBilling] = useState({ name: '', surname: '', identityNumber: '', email: '', phone: '', address: '', city: '', country: 'Turkey' });
  useEffect(() => { if (order.data) { if (!order.data.paymentAvailable) setMethod('transfer'); const parts = order.data.customer.name.trim().split(/\s+/); const surname = parts.length > 1 ? parts.pop()! : ''; setBilling({ name: parts.join(' '), surname, identityNumber: '', email: order.data.customer.email || '', phone: order.data.customer.phone?.replace(/\D/g, '') || '', address: '', city: '', country: 'Turkey' }); } }, [order.data?.id, order.data?.paymentAvailable]);
  const pay = useMutation({ mutationFn: async () => (await api.post(`/my/credit-store/orders/${encodeURIComponent(orderId)}/pay`, billing)).data.data as { paymentUrl: string }, onSuccess: value => { window.location.assign(value.paymentUrl); } });
  const bankTransfer = useMutation({
    mutationFn: async () => (await api.post(`/my/credit-store/orders/${encodeURIComponent(orderId)}/bank-transfer`, transferNote.trim() ? { note: transferNote.trim() } : {})).data.data,
    onSuccess: async () => {
      setTransferSent(true);
      await Promise.all([
        client.invalidateQueries({ queryKey: ['/my/credit-store/orders'] }),
        client.invalidateQueries({ queryKey: ['/credit-sales/orders'] }),
      ]);
    },
  });
  const data = order.data;
  const future = Boolean(data?.periodStartsOn && data.periodStartsOn.slice(0, 10) > new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date()));
  const field = (key: keyof typeof billing, label: string, maxLength: number, type = 'text') => <label><span className="field-label">{label} *</span><input type={type} required maxLength={maxLength} value={billing[key]} onChange={e => setBilling(v => ({ ...v, [key]: key === 'identityNumber' ? e.target.value.replace(/\D/g, '') : e.target.value }))} /></label>;
  return <section className="credit-checkout" aria-label="Sipariş ödemesi">
    <button className="button secondary" type="button" onClick={onBack}><ArrowLeft size={16} /> Siparişlerime Dön</button>
    <h2>Ödeme Özeti</h2><ErrorMessage error={order.error} />
    {order.isPending && <p role="status">Sipariş yükleniyor…</p>}
    {data && <div className="credit-sales-card">
      <h3>{data.name}</h3><p>Sipariş #{data.number} · {count(data.credits)} kredi</p><strong className="credit-price">{money(data.total, data.currency)}</strong>
      {future && <p className="credit-store-notice">Ödeme {data.periodStartsOn!.slice(0, 10).split('-').reverse().join('.')} tarihinde açılacak.</p>}
      {!future && (
        <div className="integration-tabs credit-workspace-tabs" role="tablist" aria-label="Ödeme yöntemi" style={{ marginTop: 18, marginBottom: 18 }}>
          {data.paymentAvailable && (
            <button type="button" role="tab" className={method === 'card' ? 'active' : ''} aria-selected={method === 'card'} onClick={() => setMethod('card')}>
              <CreditCard size={16} /> Kart ile Online Öde
            </button>
          )}
          <button type="button" role="tab" className={method === 'transfer' ? 'active' : ''} aria-selected={method === 'transfer'} onClick={() => setMethod('transfer')}>
            <Building2 size={16} /> Havale / EFT ile Öde
          </button>
        </div>
      )}
      {!future && method === 'transfer' && (
        transferSent ? (
          <div className="credit-store-notice" role="status">
            Havale / EFT ödeme bildiriminiz alındı. Yönetici onayladığında <strong>{count(data.credits)} kredi</strong> hesabınıza otomatik olarak tanımlanacaktır.
          </div>
        ) : (
          <form onSubmit={e => { e.preventDefault(); bankTransfer.mutate(); }} style={{ display: 'grid', gap: 14 }}>
            <p className="credit-help" style={{ margin: 0 }}>
              Havale veya EFT işlemini tamamladıktan sonra aşağıdan ödeme bildirimi gönderebilirsiniz. Yönetici onayladığında kredileriniz otomatik olarak hesabınıza yüklenir.
            </p>
            <label>
              <span className="field-label">Gönderen Adı / Açıklama (isteğe bağlı)</span>
              <input maxLength={300} value={transferNote} disabled={bankTransfer.isPending} onChange={e => setTransferNote(e.target.value)} placeholder="Örn: Havale yapan kişi veya banka bilgisi" />
            </label>
            <ErrorMessage error={bankTransfer.error} />
            <div>
              <button className="button primary" disabled={bankTransfer.isPending}>
                {bankTransfer.isPending ? 'Gönderiliyor…' : 'Havale / EFT Bildirimi Gönder'}
              </button>
            </div>
          </form>
        )
      )}
      {data.paymentAvailable && !future && method === 'card' && data.provider && data.provider !== 'iyzico' && <AkbankCardForm key={data.id} orderId={data.id} total={data.total} currency={data.currency} />}
      {data.paymentAvailable && !future && method === 'card' && (!data.provider || data.provider === 'iyzico') && <form onSubmit={e => { e.preventDefault(); pay.mutate(); }}>
        <h3>Fatura ve İletişim Bilgileri</h3>
        <fieldset className="credit-checkout-billing" disabled={pay.isPending}>
          {field('name', 'Ad', 80)}{field('surname', 'Soyad', 80)}{field('identityNumber', 'T.C. Kimlik No', 11)}{field('email', 'E-posta', 191, 'email')}{field('phone', 'Telefon', 18, 'tel')}{field('city', 'Şehir', 80)}{field('address', 'Fatura adresi', 500)}{field('country', 'Ülke', 80)}
        </fieldset>
        <p><LockKeyhole size={16} /> Kart bilgilerinizi sonraki adımda gireceksiniz.</p>
        <ErrorMessage error={pay.error} />
        <button className="button primary" disabled={pay.isPending}>{pay.isPending ? 'Yönlendiriliyor…' : money(data.total, data.currency) + ' Ödemeye Geç'}</button>
      </form>}
    </div>}
  </section>;
}
