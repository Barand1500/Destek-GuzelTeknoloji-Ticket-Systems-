import { useState, type FormEvent } from 'react';
import { api, errorText } from '../../services/api';
import type { User } from '../../types';
import { EmailInput } from '../../components/EmailInput';
import { TurnstileField, useTurnstile } from './Turnstile';

export function CustomerEmailLogin({ initialEmail, onBack, onAccept }: { initialEmail: string; onBack: () => void; onAccept: (data: { accessToken: string; user: User }) => void }) {
  const captcha = useTurnstile('login');
  const [email, setEmail] = useState(initialEmail), [challengeId, setChallengeId] = useState('');
  const [code, setCode] = useState(''), [notice, setNotice] = useState(''), [error, setError] = useState(''), [pending, setPending] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || (!challengeId && !captcha.ready)) return;
    setPending(true); setError('');
    try {
      if (challengeId) onAccept((await api.post('/auth/customer-email/verify', { challengeId, code })).data.data);
      else {
        const address = String(new FormData(event.currentTarget).get('email') ?? '').trim();
        const result = (await api.post('/auth/customer-email', { email: address, ...captcha.payload })).data.data;
        setEmail(address);
        setChallengeId(result.challengeId); setNotice(result.message); setCode('');
      }
    } catch (e) { setError(errorText(e)); }
    finally { setPending(false); captcha.reset(); }
  }
  return <form className="auth-form auth-slide-back" onSubmit={submit}>
    <h2>{challengeId ? 'Giriş Kodunu Girin' : 'E-Posta ile Devam Et'}</h2>
    <p className="muted">{challengeId ? `${email} adresine gönderilen 6 haneli kodu girin.` : 'Kayıtlı müşteri e-posta adresinizi girin. Şifreniz olmadan hesabınıza giriş yapabilirsiniz.'}</p>
    {challengeId ? <label key="code"><span className="field-label">Doğrulama Kodu</span><input name="code" aria-label="Doğrulama Kodu" autoFocus inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} disabled={pending} /></label> : <label key="email"><span className="field-label">E-Posta Adresi</span><EmailInput name="email" defaultValue={email} required /></label>}
    {notice && <p className="auth-notice" role="status">{notice}</p>}{error && <p className="error" role="alert">{error}</p>}
    {!challengeId && <TurnstileField captcha={captcha} />}
    <button className="button primary" disabled={pending || (!challengeId && !captcha.ready) || Boolean(challengeId && code.length !== 6)}>{pending ? 'Lütfen Bekleyin…' : challengeId ? 'Kodu Doğrula ve Giriş Yap' : 'Kod Gönder'}</button>
    {challengeId && <button className="button secondary" type="button" disabled={pending} onClick={() => { setChallengeId(''); setError(''); setNotice(''); }}>E-Postayı Değiştir / Yeni Kod İste</button>}
    <button className="button secondary" type="button" disabled={pending} onClick={onBack}>Şifre ile Girişe Dön</button>
  </form>;
}
