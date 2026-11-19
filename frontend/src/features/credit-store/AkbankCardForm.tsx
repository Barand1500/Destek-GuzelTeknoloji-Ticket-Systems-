import { useEffect, useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { CreditCard } from 'lucide-react';
import { api, errorText } from '../../services/api';
import { money } from './types';

const empty = { holder: '', number: '', expiry: '', cvc: '' };
type Stage = 'idle' | 'waiting' | 'enrolling' | 'review' | 'done';

export function AkbankCardForm({ orderId, total, currency, renewalRequested, recurringAvailable, recurringPayments }: {
  orderId: string;
  total: string;
  currency: string;
  renewalRequested?: boolean;
  recurringAvailable?: boolean;
  recurringPayments?: number;
}) {
  const [card, setCard] = useState(empty), [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [stage, setStage] = useState<Stage>('idle');
  const poll = useRef<number | null>(null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      if (poll.current) window.clearInterval(poll.current);
    };
  }, []);

  const recurring = Boolean(renewalRequested && recurringAvailable);
  const locked = busy || stage === 'waiting' || stage === 'enrolling';
  const digits = (value: string, length: number) => value.replace(/\D/g, '').slice(0, length);
  const cardPayload = () => ({ ...card, number: digits(card.number, 19), expiry: digits(card.expiry, 4) });
  const failureText = (failure: unknown) => failure instanceof Error && !('response' in failure) ? failure.message : errorText(failure);
  const stopPoll = () => {
    if (poll.current) {
      window.clearInterval(poll.current);
      poll.current = null;
    }
  };
  const complete = (message: string) => {
    if (!mounted.current) return;
    stopPoll();
    setStage('done');
    setNotice(message);
    setCard(empty);
    setConsent(false);
    setBusy(false);
  };
  const fail = (message: string) => {
    if (!mounted.current) return;
    stopPoll();
    setStage('idle');
    setError(message);
    setCard(empty);
    setBusy(false);
  };

  function submitWindowForm(result: { action: string; fields: Record<string, string> }) {
    const form = document.createElement('form');
    form.method = 'POST';
    form.action = result.action;
    form.hidden = true;
    for (const [name, value] of Object.entries(result.fields)) {
      const input = document.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    setCard(empty);
    try {
      HTMLFormElement.prototype.submit.call(form);
    } finally {
      form.remove();
    }
  }

  function submitPopupForm(popup: Window, result: { action: string; fields: Record<string, string> }) {
    const doc = popup.document;
    doc.open();
    doc.write('<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>Akbank 3D Doğrulama</title></head><body></body></html>');
    doc.close();
    const form = doc.createElement('form');
    form.method = 'POST';
    form.action = result.action;
    for (const [name, value] of Object.entries(result.fields)) {
      const input = doc.createElement('input');
      input.type = 'hidden';
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    (doc.body ?? doc.documentElement).appendChild(form);
    form.submit();
  }

  async function enroll(sessionId: string) {
    if (!mounted.current) return;
    setStage('enrolling');
    setBusy(true);
    setError('');
    let response: any;
    try {
      response = await api.post(`/my/credit-store/orders/akbank-enrollment/${encodeURIComponent(sessionId)}`, {
        card: cardPayload(),
        consent: true,
      });
      const result = response.data.data as { state: string };
      if (!mounted.current) return;
      if (result.state === 'ACTIVE') {
        complete('İlk ödeme alındı ve bankada otomatik yenileme talimatı kuruldu.');
        return;
      }
      if (result.state === 'REVIEW' || result.state === 'STOP_REQUESTED' || result.state === 'REGISTERING') {
        setStage('review');
        setBusy(false);
        setCard(empty);
        setNotice('İlk ödeme alındı. Bankadaki yenileme talimatı doğrulanıyor; sonuç Aboneliklerim bölümünde görünecek.');
        pollInstruction(sessionId);
        return;
      }
      fail('İlk ödeme alındı ancak bankada otomatik yenileme talimatı kurulamadı. Aboneliklerim bölümünden kontrol edin.');
    } catch (failure) {
      if (failure && typeof failure === 'object' && 'config' in failure) (failure as any).config.data = undefined;
      fail(`İlk ödeme alındı ancak otomatik yenileme kurulamadı: ${failureText(failure)}`);
    } finally {
      if (response?.config) response.config.data = undefined;
    }
  }

  function pollInstruction(sessionId: string) {
    stopPoll();
    let attempts = 0;
    poll.current = window.setInterval(async () => {
      if (!mounted.current) return;
      attempts += 1;
      try {
        const result = (await api.get(`/my/credit-store/orders/akbank-enrollment/${encodeURIComponent(sessionId)}`)).data.data as { recurringState: string | null };
        if (result.recurringState === 'ACTIVE') complete('İlk ödeme alındı ve bankada otomatik yenileme talimatı doğrulandı.');
        else if (result.recurringState === 'FAILED' || result.recurringState === 'STOPPED') fail('İlk ödeme alındı ancak bankadaki yenileme talimatı kurulamadı. Aboneliklerim bölümünden kontrol edin.');
        else if (attempts >= 20) {
          stopPoll();
          setStage('review');
          setNotice('İlk ödeme alındı. Bankadaki yenileme talimatı hâlâ doğrulanıyor; sonuç Aboneliklerim bölümünde görünecek.');
        }
      } catch {
        if (attempts >= 20) {
          stopPoll();
          setStage('review');
          setNotice('İlk ödeme alındı. Bankadaki yenileme talimatı hâlâ doğrulanıyor; sonuç Aboneliklerim bölümünde görünecek.');
        }
      }
    }, 3000);
  }

  function pollPayment(sessionId: string) {
    stopPoll();
    let attempts = 0;
    poll.current = window.setInterval(async () => {
      if (!mounted.current) return;
      attempts += 1;
      try {
        const result = (await api.get(`/my/credit-store/orders/akbank-enrollment/${encodeURIComponent(sessionId)}`)).data.data as { status: string };
        if (result.status === 'PAID') {
          stopPoll();
          await enroll(sessionId);
        } else if (result.status === 'FAILED') {
          fail('Ödeme banka tarafından tamamlanamadı. Kart bilgileri temizlendi; yeniden deneyebilirsiniz.');
        } else if (attempts >= 150) {
          fail('Ödeme sonucu zaman aşımına uğradı. Siparişlerim bölümünden kontrol edin.');
        }
      } catch {
        if (attempts >= 150) fail('Ödeme sonucu zaman aşımına uğradı. Siparişlerim bölümünden kontrol edin.');
      }
    }, 2000);
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked || (renewalRequested && !consent)) return;
    setBusy(true);
    setError('');
    setNotice('');
    let popup: Window | null = null;
    let response: any;
    try {
      if (recurring) {
        popup = window.open('', `akbank-3d-${orderId}-${Date.now()}`, 'width=520,height=760');
        if (!popup) throw Error('3D doğrulama penceresi açılamadı. Tarayıcı açılır pencereyi engelliyor olabilir.');
        popup.opener = null;
      }
      response = await api.post(
        `/my/credit-store/orders/${encodeURIComponent(orderId)}/pay`,
        recurring
          ? { card: cardPayload(), renewalConsent: true }
          : { card: cardPayload(), manualRenewalConsent: consent },
      );
      const result = response.data.data as { action: string; fields: Record<string, string>; sessionId?: string; recurringRequested?: boolean };
      if (!['https://virtualpospaymentgateway.akbank.com/securepay', 'https://virtualpospaymentgatewaypre.akbank.com/securepay'].includes(result.action))
        throw Error('Ödeme adresi doğrulanamadı.');
      if (recurring) {
        if (!result.sessionId || !result.recurringRequested) throw Error('Bankadaki otomatik yenileme oturumu başlatılamadı.');
        submitPopupForm(popup!, result);
        setBusy(false);
        setStage('waiting');
        setNotice('3D doğrulaması ayrı pencerede açıldı. Ödeme onaylandıktan sonra aynı kart bilgisiyle bankada otomatik yenileme talimatı kurulacak.');
        pollPayment(result.sessionId);
      } else {
        submitWindowForm(result);
        setBusy(false);
      }
    } catch (failure) {
      popup?.close();
      if (failure && typeof failure === 'object' && 'config' in failure) (failure as any).config.data = undefined;
      fail(failureText(failure));
    } finally {
      if (response?.config) response.config.data = undefined;
      if (response?.data?.data?.fields) for (const key of Object.keys(response.data.data.fields)) response.data.data.fields[key] = '';
    }
  }

  if (stage === 'done' || stage === 'review') {
    return <section className="akbank-card-form" aria-label="Akbank otomatik yenileme sonucu">
      <h3><CreditCard size={20} /> Ödeme ve yenileme</h3>
      <p role="status">{notice}</p>
      <Link className="button secondary" to="/customer/agreements?view=subscriptions">Aboneliklerim</Link>
    </section>;
  }

  return <form className="akbank-card-form" onSubmit={submit} autoComplete="off" aria-label="Kart ile ödeme">
    <h3><CreditCard size={20} /> Kredi / Banka Kartı</h3>
    <fieldset className="credit-checkout-billing" disabled={locked}>
      <label className="akbank-card-wide"><span className="field-label">Kart üzerindeki ad soyad *</span><input required maxLength={100} autoComplete="cc-name" value={card.holder} onChange={e => setCard(v => ({ ...v, holder: e.target.value }))} /></label>
      <label className="akbank-card-wide"><span className="field-label">Kart numarası *</span><input required inputMode="numeric" autoComplete="off" maxLength={23} placeholder="0000 0000 0000 0000" value={card.number} onChange={e => setCard(v => ({ ...v, number: digits(e.target.value, 19).replace(/(.{4})/g, '$1 ').trim() }))} /></label>
      <label><span className="field-label">Son kullanma tarihi *</span><input required inputMode="numeric" autoComplete="off" pattern="(0[1-9]|1[0-2]) / [0-9]{2}" maxLength={7} placeholder="AA / YY" value={card.expiry} onChange={e => { const value = digits(e.target.value, 4); setCard(v => ({ ...v, expiry: value.length > 2 ? value.slice(0, 2) + ' / ' + value.slice(2) : value })); }} /></label>
      <label><span className="field-label">CVC *</span><input required type="password" inputMode="numeric" autoComplete="off" pattern="[0-9]{3}" maxLength={3} placeholder="•••" value={card.cvc} onChange={e => setCard(v => ({ ...v, cvc: digits(e.target.value, 3) }))} /></label>
    </fieldset>
    {renewalRequested && recurring && <label className="integration-toggle credit-renewal-choice"><span>İlk ödemeyi şimdi yapmayı ve aynı kartla {recurringPayments ? `sonraki ${recurringPayments} dönem için` : 'bankanın izin verdiği sınırlı sayıda dönem için'} otomatik tahsilat talimatı kurulmasını onaylıyorum. Yenilemeyi Aboneliklerim’den kapatabilirim. Kart bilgisi uygulamada saklanmaz.</span><input type="checkbox" role="switch" checked={consent} disabled={locked} onChange={e => setConsent(e.target.checked)} /><i aria-hidden="true" /></label>}
    {renewalRequested && !recurring && <label className="integration-toggle credit-renewal-choice"><span>Bu paketi tek ödemeyle almayı kabul ediyorum. Sonraki dönemde kartımdan otomatik ödeme çekilmeyecek.</span><input type="checkbox" role="switch" checked={consent} disabled={locked} onChange={e => setConsent(e.target.checked)} /><i aria-hidden="true" /></label>}
    {notice && <p role="status" className="credit-help">{notice}</p>}
    {error && <p className="notice error" role="alert">{error}</p>}
    <button type="submit" className="button primary" disabled={locked || Boolean(renewalRequested && !consent)}>
      {stage === 'waiting' ? 'Ödeme bekleniyor…' : stage === 'enrolling' ? 'Yenileme kuruluyor…' : busy ? 'Bankaya yönlendiriliyor…' : money(total, currency) + ' Öde'}
    </button>
  </form>;
}
