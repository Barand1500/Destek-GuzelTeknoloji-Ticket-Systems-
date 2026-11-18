import { useState, type FormEvent } from 'react';
import { CreditCard, LockKeyhole } from 'lucide-react';
import { api, errorText } from '../../services/api';
import { money } from './types';

const empty = { holder: '', number: '', expiry: '', cvc: '' };
export function AkbankCardForm({ orderId, total, currency, renewalRequested }: { orderId: string; total: string; currency: string; renewalRequested?: boolean }) {
  const [card, setCard] = useState(empty), [consent, setConsent] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const digits = (value: string, length: number) => value.replace(/\D/g, '').slice(0, length);
  async function submit(event: FormEvent) {
    event.preventDefault(); if (busy) return;
    setBusy(true); setError('');
    let response: any;
    try {
      response = await api.post(`/my/credit-store/orders/${encodeURIComponent(orderId)}/pay`, { card: { ...card, number: digits(card.number, 19), expiry: digits(card.expiry, 4) }, manualRenewalConsent: consent });
      const result = response.data.data as { action: string; fields: Record<string, string> };
      if (!['https://virtualpospaymentgateway.akbank.com/securepay', 'https://virtualpospaymentgatewaypre.akbank.com/securepay'].includes(result.action)) throw Error('Ödeme adresi doğrulanamadı.');
      const form = document.createElement('form'); form.method = 'POST'; form.action = result.action; form.hidden = true;
      for (const [name, value] of Object.entries(result.fields)) { const input = document.createElement('input'); input.type = 'hidden'; input.name = name; input.value = value; form.appendChild(input); }
      document.body.appendChild(form); setCard(empty);
      try { HTMLFormElement.prototype.submit.call(form); } finally { form.remove(); }
    } catch (failure: any) {
      setError(errorText(failure));
      if (failure?.config) failure.config.data = undefined;
      setCard(empty);
    } finally {
      if (response?.config) response.config.data = undefined;
      if (response?.data?.data?.fields) for (const key of Object.keys(response.data.data.fields)) response.data.data.fields[key] = '';
      setBusy(false);
    }
  }
  return <form className="akbank-card-form" onSubmit={submit} autoComplete="off" aria-label="Kart ile ödeme">
    <h3><CreditCard size={20} /> Kredi / Banka Kartı</h3>
    <fieldset className="credit-checkout-billing" disabled={busy}>
      <label className="akbank-card-wide"><span className="field-label">Kart üzerindeki ad soyad *</span><input required maxLength={100} autoComplete="cc-name" value={card.holder} onChange={e => setCard(v => ({ ...v, holder: e.target.value }))} /></label>
      <label className="akbank-card-wide"><span className="field-label">Kart numarası *</span><input required inputMode="numeric" autoComplete="off" maxLength={23} placeholder="0000 0000 0000 0000" value={card.number} onChange={e => setCard(v => ({ ...v, number: digits(e.target.value, 19).replace(/(.{4})/g, '$1 ').trim() }))} /></label>
      <label><span className="field-label">Son kullanma tarihi *</span><input required inputMode="numeric" autoComplete="off" pattern="(0[1-9]|1[0-2]) / [0-9]{2}" maxLength={7} placeholder="AA / YY" value={card.expiry} onChange={e => { const value = digits(e.target.value, 4); setCard(v => ({ ...v, expiry: value.length > 2 ? value.slice(0, 2) + ' / ' + value.slice(2) : value })); }} /></label>
      <label><span className="field-label">CVC *</span><input required type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{3}" maxLength={3} placeholder="•••" value={card.cvc} onChange={e => setCard(v => ({ ...v, cvc: digits(e.target.value, 3) }))} /></label>
    </fieldset>
    {renewalRequested && <label className="integration-toggle credit-renewal-choice"><span>Bu paketi tek ödemeyle almayı kabul ediyorum. Sonraki dönemde kartımdan otomatik ödeme çekilmeyecek.</span><input type="checkbox" role="switch" checked={consent} onChange={e => setConsent(e.target.checked)} /><i aria-hidden="true" /></label>}
    <p className="credit-help"><LockKeyhole size={16} /> Tek çekim. Kartı doğrulamak için bankanızın 3D ekranına geçeceksiniz. Kart bilgileriniz kaydedilmez.</p>
    {error && <p className="notice error" role="alert">{error}</p>}
    <button type="submit" className="button primary" disabled={busy || Boolean(renewalRequested && !consent)}>{busy ? 'Bankaya yönlendiriliyor…' : money(total, currency) + ' Öde'}</button>
  </form>;
}
