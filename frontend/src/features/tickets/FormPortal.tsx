import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { TurnstileField, useTurnstile } from '../auth/Turnstile';
import { EmailInput } from '../../components/EmailInput';
import { errorText } from '../../services/api';
import './form.css';

// Guest credentials must never replace staff credentials or trigger staff-session refresh.
const guest = axios.create({ baseURL: '/api/v1/public/form', withCredentials: false });
type Message = { id: string; body: string; type: string; createdAt: string; author: { name: string }; attachments: { id: string; originalName: string; size: number }[] };
type Thread = { number: number; subject: string; status: string; closed: boolean; messages: Message[]; hasMore: boolean; direction: 'latest' | 'after' | 'before' };
type FormFieldId = 'company' | 'name' | 'phone' | 'email' | 'subject' | 'message' | 'files';
const defaultFieldOrder: FormFieldId[] = ['company', 'name', 'phone', 'email', 'subject', 'message', 'files'];
function Files({ maxSize = 30 * 1024 * 1024 }: { maxSize?: number }) {
  return <label className="form-files"><span className="field-label">Dosya Ekle (isteğe bağlı)</span><input name="files" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.zip" onChange={event => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.setCustomValidity(files.reduce((sum, file) => sum + file.size, 0) > maxSize ? `Dosyaların toplam boyutu en fazla ${Math.floor(maxSize / 1024 / 1024)} MB olabilir.` : '');
    event.currentTarget.reportValidity();
  }} /><small>Dosyaların toplam boyutu en fazla {Math.floor(maxSize / 1024 / 1024)} MB olabilir.</small></label>;
}
function formData(form: HTMLFormElement) {
  const data = new FormData(form);
  // The callback token is sent explicitly; do not submit an extra widget field.
  data.delete('cf-turnstile-response');
  const files = data.getAll('files').filter((value): value is File => value instanceof File && value.size > 0);
  data.delete('files');
  for (const file of files) data.append('files', file);
  return data;
}
export function FormPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tracking, setTracking] = useState(location.pathname === '/form/talep');
  const token = /^[a-f0-9]{64}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : '';
  const captcha = useTurnstile(tracking ? 'form_access' : 'form_submit');
  const settings = useQuery({ queryKey: ['public-form'], queryFn: async () => (await guest.get('/settings')).data.data as { enabled: boolean; title: string; fieldOrder?: FormFieldId[]; requirePhone: boolean; requireCompany: boolean; requireSubject: boolean; requireMessage: boolean; maxTotalFileSize?: number } });
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [created, setCreated] = useState<number>();
  const [trackingNumber, setTrackingNumber] = useState('');
  const [challengeId, setChallengeId] = useState(''), [code, setCode] = useState('');
  useEffect(() => { setTracking(location.pathname === '/form/talep'); setCreated(undefined); setError(''); setNotice(''); }, [location.pathname]);
  useEffect(() => {
    const meta = document.createElement('meta'); meta.name = 'referrer'; meta.content = 'no-referrer'; document.head.appendChild(meta);
    return () => meta.remove();
  }, []);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending || !captcha.ready) return;
    const data = formData(event.currentTarget);
    setPending(true); setError(''); setNotice('');
    try {
      if (tracking) {
        const login = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement && ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value === 'login';
        const result = await guest.post(login ? '/login' : '/access', { email: data.get('email'), number: Number(String(data.get('number')).replace(/^#?TK-0*/i, '')), ...captcha.payload });
        if (login) { setChallengeId(result.data.data.challengeId); setCode(''); }
        setNotice(result.data.data.message);
      } else {
        if (captcha.payload.turnstileToken) data.set('turnstileToken', captcha.payload.turnstileToken);
        const result = await guest.post('/requests', data);
        setCreated(result.data.data.number);
      }
    } catch (e) { setError(errorText(e)); }
    finally { setPending(false); captcha.reset(); }
  }
  async function verify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    setPending(true); setError('');
    try {
      const result = await guest.post('/login/verify', { challengeId, code });
      setChallengeId(''); setCode(''); setNotice('');
      navigate(`/form/talep#${result.data.data.token}`, { replace: true });
    } catch (e) { setError(errorText(e)); }
    finally { setPending(false); }
  }
  const embedded = new URLSearchParams(location.search).get('embed') === '1';
  const fieldOrder = defaultFieldOrder;
  const renderField = (field: FormFieldId) => {
    if (field === 'company') return <label><span className="field-label">Firma / Şirket{settings.data?.requireCompany === true ? '' : ' (isteğe bağlı)'}</span><input name="company" autoComplete="organization" maxLength={150} required={settings.data?.requireCompany === true} /></label>;
    if (field === 'name') return <label><span className="field-label">Ad Soyad</span><input name="name" autoComplete="name" required maxLength={100} /></label>;
    if (field === 'phone') return <label><span className="field-label">Telefon{settings.data?.requirePhone === true ? '' : ' (isteğe bağlı)'}</span><input name="phone" autoComplete="tel-national" type="tel" inputMode="numeric" maxLength={10} pattern="5[0-9]{9}" placeholder="5XXXXXXXXX" required={settings.data?.requirePhone === true} onInput={event => { const digits = event.currentTarget.value.replace(/\D/g, '').slice(0, 10); event.currentTarget.value = digits.startsWith('5') ? digits : '';  event.currentTarget.setCustomValidity(''); }} onInvalid={event => event.currentTarget.setCustomValidity('Telefon 5 ile başlayan 10 haneli GSM numarası olmalıdır.')} /></label>;
    if (field === 'email') return <label><span className="field-label">E-Posta Adresi</span><EmailInput name="email" required autoComplete="email" /></label>;
    if (field === 'subject') return <label><span className="field-label">Konu{settings.data?.requireSubject !== false ? '' : ' (isteğe bağlı)'}</span><input name="subject" required={settings.data?.requireSubject !== false} pattern={settings.data?.requireSubject !== false ? '.*\\S.*' : undefined} maxLength={200} onInvalid={e => e.currentTarget.setCustomValidity('Konu boş bırakılamaz.')} onInput={e => e.currentTarget.setCustomValidity('')} /></label>;
    if (field === 'message') return <label><span className="field-label">Açıklama{settings.data?.requireMessage !== false ? '' : ' (isteğe bağlı)'}</span><textarea name="message" required={settings.data?.requireMessage !== false} maxLength={10000} rows={6} /></label>;
    return <Files maxSize={settings.data?.maxTotalFileSize} />;
  };
  return <main className={`public-form-page${embedded ? ' embedded' : ''}`}><section className="public-form-card">
    {token ? <FormThread key={token} token={token} maxSize={settings.data?.maxTotalFileSize} newRequestHref={embedded ? '/form/destek?embed=1' : '/form/destek'} /> : <>
      <div className="public-form-heading"><h1>{tracking ? 'Talebimi Takip Et' : settings.data?.title ?? 'Destek Talebi'}</h1><button type="button" className="button secondary" onClick={() => { setTracking(created ? false : !tracking); setCreated(undefined); setChallengeId(''); setCode(''); setError(''); setNotice(''); captcha.reset(); }}>{tracking || created ? 'Yeni Talep Aç' : 'Mevcut Talebimi Takip Et'}</button></div>
      {created ? <div role="status"><h2>Talebiniz alındı.</h2><p>Talep numaranız: <strong>#TK-{String(created).padStart(5, '0')}</strong></p><p>Mesajları görmek ve yanıtlamak için e-postanıza gönderilen bağlantıyı açın. Gelen kutunuza düşmediyse spam klasörünü kontrol edin.</p><button type="button" className="button secondary" onClick={() => { setTrackingNumber(`TK-${String(created).padStart(5, '0')}`); setCreated(undefined); setTracking(true); }}>Talebimi Takip Et</button></div> : <>
        <p>{tracking ? challengeId ? 'E-postanıza gönderilen 6 haneli kodu girin. Kod 10 dakika geçerlidir.' : 'Talep numaranızı ve e-posta adresinizi yazın. Takip bağlantısı isteyin veya e-posta koduyla giriş yapın.' : 'Talebinizi iletin. Yanıtları e-postanızdan veya size göndereceğimiz takip bağlantısından görebilirsiniz.'}</p>
        {settings.isPending && <p role="status">Form yükleniyor…</p>}
        {settings.isError && <p role="alert" className="error">{errorText(settings.error)}</p>}
        {tracking && challengeId ? <form onSubmit={verify} className="public-form-fields">
          <label><span className="field-label">Giriş Kodu</span><input autoFocus name="code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
          <button className="button primary" disabled={pending || code.length !== 6}>{pending ? 'Doğrulanıyor…' : 'Doğrula ve Giriş Yap'}</button>
          <button type="button" className="auth-forgot" disabled={pending} onClick={() => { setChallengeId(''); setCode(''); setNotice(''); setError(''); }}>Bilgileri Değiştir / Yeni Kod İste</button>
        </form> : (tracking || settings.data?.enabled) && <form onSubmit={submit} className="public-form-fields">
          {tracking ? <><label key="tracking-number"><span className="field-label">Talep No</span><input name="number" value={trackingNumber} onChange={event => setTrackingNumber(event.target.value)} required placeholder="TK-00123" maxLength={20} /></label><label><span className="field-label">E-Posta Adresi</span><EmailInput name="email" required autoComplete="email" /></label></> : fieldOrder.map((field, index) => {
            if (field === 'email' && fieldOrder[index - 1] === 'phone') return null;
            if (field === 'phone' && fieldOrder[index + 1] === 'email') return <div className="public-form-columns" key={`${field}-email`}>{renderField(field)}{renderField('email')}</div>;
            return <div key={field}>{renderField(field)}</div>;
          })}
          <TurnstileField captcha={captcha} />
          {tracking ? <div className="form-tracking-actions"><button className="button secondary" name="intent" value="link" disabled={pending || !captcha.ready}>Takip Bağlantısı Gönder</button><button className="button primary" name="intent" value="login" disabled={pending || !captcha.ready}>{pending ? 'Gönderiliyor…' : 'Giriş Yap'}</button></div> : <button className="button primary" disabled={pending || !captcha.ready}>{pending ? 'Gönderiliyor…' : 'Talebi Gönder'}</button>}
        </form>}
        {!tracking && settings.data && !settings.data.enabled && <p role="status">Form şu anda talep kabul etmiyor.</p>}
        {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
      </>}
    </>}
  </section></main>;
}
function FormThread({ token, maxSize, newRequestHref }: { token: string; maxSize?: number; newRequestHref: string }) {
  const headers = { 'x-form-token': token };
  const latest = useRef(''), timeline = useRef<HTMLElement>(null), pin = useRef(true), prepend = useRef<{ top: number; height: number } | null>(null);
  const query = useQuery({ queryKey: ['form-thread', token], queryFn: async () => (await guest.get('/conversation', { headers, params: latest.current ? { after: latest.current } : undefined })).data.data as Thread, retry: false, refetchInterval: state => state.state.data?.direction === 'after' && state.state.data.hasMore ? 500 : 5000 });
  const [messages, setMessages] = useState<Message[]>([]), [hasMore, setHasMore] = useState(false), [pending, setPending] = useState(false), [older, setOlder] = useState(false), [error, setError] = useState('');
  const merge = (incoming: Message[]) => setMessages(current => [...new Map([...current, ...incoming].map(item => [item.id, item])).values()].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)));
  useEffect(() => { if (query.data) { merge(query.data.messages); if (query.data.messages.length) latest.current = query.data.messages.at(-1)!.id; if (query.data.direction === 'latest') setHasMore(query.data.hasMore); } }, [query.data]);
  useLayoutEffect(() => {
    const element = timeline.current;
    if (!element) return;
    if (prepend.current) { element.scrollTop = prepend.current.top + element.scrollHeight - prepend.current.height; prepend.current = null; }
    else if (pin.current) element.scrollTop = element.scrollHeight;
  }, [messages]);
  async function previous() {
    if (older || !messages.length) return;
    setOlder(true); setError('');
    try { const result = (await guest.get('/conversation', { headers, params: { before: messages[0].id } })).data.data as Thread; pin.current = false; if (timeline.current) prepend.current = { top: timeline.current.scrollTop, height: timeline.current.scrollHeight }; merge(result.messages); setHasMore(result.hasMore); }
    catch (e) { setError(errorText(e)); } finally { setOlder(false); }
  }
  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (pending) return;
    const form = event.currentTarget, data = formData(form);
    if (!String(data.get('body') ?? '').trim() && !data.getAll('files').some(file => file instanceof File && file.size > 0)) return;
    setPending(true); setError('');
    try { await guest.post('/conversation/messages', data, { headers }); form.reset(); pin.current = true; await query.refetch(); }
    catch (e) { setError(errorText(e)); } finally { setPending(false); }
  }
  async function download(file: Message['attachments'][number]) {
    try { const result = await guest.get(`/conversation/attachments/${file.id}`, { headers, responseType: 'blob' }); const url = URL.createObjectURL(result.data); const a = document.createElement('a'); a.href = url; a.download = file.originalName; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); }
    catch { setError('Dosya indirilemedi. Bağlantınızın süresi dolmuş olabilir.'); }
  }
  if (query.isPending) return <p role="status">Talep yükleniyor…</p>;
  if (query.isError) return <><h1>Talep açılamadı</h1><p role="alert" className="error">{errorText(query.error)}</p><Link to="/form/talep">Yeni takip bağlantısı iste</Link></>;
  const thread = query.data;
  return <><div className="public-form-heading"><h1>{thread.subject}</h1><Link className="button secondary" to={newRequestHref}>Yeni Talep Aç</Link></div><p><strong>#TK-{String(thread.number).padStart(5, '0')}</strong> · {thread.status}</p>
    <section className="form-thread" aria-label="Konuşma" ref={timeline} onScroll={event => { const el = event.currentTarget; pin.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (el.scrollTop < 40 && hasMore && !older) void previous(); }}>
      {hasMore && <button className="button secondary" type="button" disabled={older} onClick={() => void previous()}>{older ? 'Yükleniyor…' : 'Önceki Mesajları Göster'}</button>}
      {messages.map(message => <article key={message.id} className={`form-message ${message.type === 'AGENT_REPLY' ? 'staff' : ''}`}><header><strong>{message.author.name}</strong><time>{new Date(message.createdAt).toLocaleString('tr-TR')}</time></header><p>{message.body}</p>{message.attachments.map(file => <button className="button secondary" key={file.id} type="button" onClick={() => void download(file)}>{file.originalName}</button>)}</article>)}
    </section>
    {thread.closed ? <p>Bu talep kapatıldı. <Link to="/form/destek">Yeni talep açabilirsiniz.</Link></p> : <form className="public-form-fields" onSubmit={send}><label><span className="field-label">Yanıtınız</span><textarea name="body" maxLength={10000} rows={4} disabled={pending} onKeyDown={event => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (!pending && !event.repeat) event.currentTarget.form?.requestSubmit();
    }} /></label><Files maxSize={maxSize} /><button className="button primary" disabled={pending}>{pending ? 'Gönderiliyor…' : 'Yanıt Gönder'}</button></form>}
    {error && <p role="alert" className="error">{error}</p>}
  </>;
}
