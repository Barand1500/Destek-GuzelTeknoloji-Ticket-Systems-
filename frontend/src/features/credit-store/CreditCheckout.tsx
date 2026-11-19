/// <reference types="vite/client" />
import { useEffect, useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, LockKeyhole } from 'lucide-react';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { count, money } from './types';
import './credit-store.css';
import { AkbankCardForm } from './AkbankCardForm';

type CheckoutOrder = { id: string; number: number; name: string; credits: number; total: string; currency: string; status: string; provider?: string; paymentAvailable: boolean; recurringAvailable?: boolean; recurringPayments?: number; renewalRequested?: boolean; periodStartsOn?: string | null; customer: { name: string; email?: string | null; phone?: string | null } };
export function CreditCheckout({ orderId, onBack }: { orderId: string; onBack?: () => void }) {
  const order = useQuery({ queryKey: ['credit-checkout', orderId], queryFn: async () => (await api.get(`/my/credit-store/orders/${encodeURIComponent(orderId)}/checkout`)).data.data as CheckoutOrder });
  const [billing, setBilling] = useState({ name: '', surname: '', identityNumber: '', email: '', phone: '', address: '', city: '', country: 'Turkey', renewalConsent: false });
  useEffect(() => { if (order.data) { const parts = order.data.customer.name.trim().split(/\s+/); const surname = parts.length > 1 ? parts.pop()! : ''; setBilling({ name: parts.join(' '), surname, identityNumber: '', email: order.data.customer.email || '', phone: order.data.customer.phone?.replace(/\D/g, '') || '', address: '', city: '', country: 'Turkey', renewalConsent: false }); } }, [order.data?.id]);
  const pay = useMutation({ mutationFn: async () => (await api.post(`/my/credit-store/orders/${encodeURIComponent(orderId)}/pay`, billing)).data.data as { paymentUrl: string }, onSuccess: value => { window.location.assign(value.paymentUrl); } });
  const data = order.data;
  const future = Boolean(data?.periodStartsOn && data.periodStartsOn.slice(0, 10) > new Intl.DateTimeFormat('sv-SE', { timeZone: 'Europe/Istanbul' }).format(new Date()));
  const field = (key: Exclude<keyof typeof billing, 'renewalConsent'>, label: string, maxLength: number, type = 'text') => <label><span className="field-label">{label} *</span><input type={type} required maxLength={maxLength} value={billing[key]} onChange={e => setBilling(v => ({ ...v, [key]: key === 'identityNumber' ? e.target.value.replace(/\D/g, '') : e.target.value }))} /></label>;
  return <section className="credit-checkout" aria-label="Sipariş ödemesi">
    <button className="button secondary" type="button" onClick={onBack}><ArrowLeft size={16} /> Siparişlerime Dön</button>
    <h2>Ödeme Özeti</h2><ErrorMessage error={order.error} />
    {order.isPending && <p role="status">Sipariş yükleniyor…</p>}
    {data && <div className="credit-sales-card">
      <h3>{data.name}</h3><p>Sipariş #{data.number} · {count(data.credits)} kredi</p><strong className="credit-price">{money(data.total, data.currency)}</strong>
      {future && <p className="credit-store-notice">Ödeme {data.periodStartsOn!.slice(0, 10).split('-').reverse().join('.')} tarihinde açılacak.</p>}
      {!data.paymentAvailable && <p className="credit-store-notice">Online ödeme şu anda kapalı.</p>}
      {data.paymentAvailable && !future && data.provider === 'akbank' && <AkbankCardForm key={data.id} orderId={data.id} total={data.total} currency={data.currency} renewalRequested={data.renewalRequested} recurringAvailable={data.recurringAvailable} recurringPayments={data.recurringPayments} />}
      {data.paymentAvailable && !future && data.provider !== 'akbank' && <form onSubmit={e => { e.preventDefault(); pay.mutate(); }}>
        <h3>Fatura ve İletişim Bilgileri</h3>
        <fieldset className="credit-checkout-billing" disabled={pay.isPending}>
          {field('name', 'Ad', 80)}{field('surname', 'Soyad', 80)}{field('identityNumber', 'T.C. Kimlik No', 11)}{field('email', 'E-posta', 191, 'email')}{field('phone', 'Telefon', 18, 'tel')}{field('city', 'Şehir', 80)}{field('address', 'Fatura adresi', 500)}{field('country', 'Ülke', 80)}
        </fieldset>
        {data.renewalRequested && <label className="integration-toggle credit-renewal-choice"><span>Kartımın iyzico tarafından saklanmasını ve seçtiğim dönemlerde aynı tutarın otomatik çekilmesini onaylıyorum. Yenilemeyi Aboneliklerim bölümünden kapatabilirim.</span><input type="checkbox" role="switch" checked={billing.renewalConsent} onChange={e => setBilling(v => ({ ...v, renewalConsent: e.target.checked }))} /><i aria-hidden="true" /></label>}
        <p><LockKeyhole size={16} /> Kart bilgilerinizi sonraki adımda gireceksiniz.</p>
        <ErrorMessage error={pay.error} />
        <button className="button primary" disabled={pay.isPending || Boolean(data.renewalRequested && (!billing.renewalConsent || !data.recurringAvailable))}>{pay.isPending ? 'Yönlendiriliyor…' : money(data.total, data.currency) + ' Ödemeye Geç'}</button>
        {data.renewalRequested && !data.recurringAvailable && <p role="alert">Otomatik yenileme şu anda kapalı. Yenilemesiz paket seçin veya yöneticiyle iletişime geçin.</p>}
      </form>}
    </div>}
  </section>;
}
