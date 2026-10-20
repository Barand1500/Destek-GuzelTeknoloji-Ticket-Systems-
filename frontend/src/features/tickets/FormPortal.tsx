import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { TurnstileField, useTurnstile } from '../auth/Turnstile';
import { EmailInput } from '../../components/EmailInput';
import { DropdownSelect } from '../../components/DropdownSelect';
import { errorText } from '../../services/api';
import './form.css';
import { ArrowLeft } from 'lucide-react';

// Guest credentials must never replace staff credentials or trigger staff-session refresh.
const guest = axios.create({ baseURL: '/api/v1/public/form', withCredentials: false });
type Message = { id: string; body: string; type: string; createdAt: string; author: { name: string }; attachments: { id: string; originalName: string; size: number }[] };
type Thread = { number: number; subject: string; status: string; closed: boolean; messages: Message[]; hasMore: boolean; direction: 'latest' | 'after' | 'before' };
function Files({ maxSize = 5 * 1024 * 1024 }: { maxSize?: number }) {
  return <label className="form-files"><span>Dosya Ekle (isteğe bağlı)</span><input name="files" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.zip" onChange={event => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.setCustomValidity(files.length > 3 ? 'En fazla 3 dosya seçebilirsiniz.' : files.some(file => file.size > maxSize) ? `Her dosya en fazla ${Math.floor(maxSize / 1024 / 1024)} MB olabilir.` : '');
    event.currentTarget.reportValidity();
  }} /><small>En fazla 3 dosya, dosya başına {Math.floor(maxSize / 1024 / 1024)} MB.</small></label>;
}
function formData(form: HTMLFormElement) {
  const data = new FormData(form);
  // The callback token is sent explicitly; do not submit an extra widget field.
  data.delete('cf-turnstile-response');
  for (const [key, value] of [...data.entries()]) if (value instanceof File && !value.size) data.delete(key);
  return data;
}
export function FormPortal() {
  const location = useLocation();
  const navigate = useNavigate();
  const [tracking, setTracking] = useState(location.pathname === '/form/talep');
  const token = /^[a-f0-9]{64}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : '';
  const captcha = useTurnstile(tracking ? 'form_access' : 'form_submit');
  const settings = useQuery({ queryKey: ['public-form'], queryFn: async () => (await guest.get('/settings')).data.data as { enabled: boolean; title: string; maxFileSize: number; departments: { id: string; name: string }[] } });
  const [departmentId, setDepartmentId] = useState('');
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
    if (!tracking && !departmentId) { setError('Lütfen departman seçin.'); return; }
    const data = formData(event.currentTarget);
    setPending(true); setError(''); setNotice('');
    try {
      if (tracking) {
        const login = (event.nativeEvent as SubmitEvent).submitter instanceof HTMLButtonElement && ((event.nativeEvent as SubmitEvent).submitter as HTMLButtonElement).value === 'login';
        const result = await guest.post(login ? '/login' : '/access', { email: data.get('email'), number: Number(String(data.get('number')).replace(/^#?TK-0*/i, '')), ...captcha.payload });
        if (login) { setChallengeId(result.data.data.challengeId); setCode(''); }
        setNotice(result.data.data.message);
      } else {
        data.set('departmentId', departmentId);
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
  return <main className={`public-form-page${embedded ? ' embedded' : ''}`}><section className="public-form-card">
    {token && <Link className="form-back-link" to={embedded ? '/form/destek?embed=1' : '/form/destek'}><ArrowLeft size={16} aria-hidden="true" />Talep Açma Ekranına Dön</Link>}
    {token ? <FormThread key={token} token={token} maxSize={settings.data?.maxFileSize} /> : <>
      <h1>{tracking ? 'Talebimi Takip Et' : settings.data?.title ?? 'Destek Talebi'}</h1>
      {created ? <div role="status"><h2>Talebiniz alındı.</h2><p>Talep numaranız: <strong>#TK-{String(created).padStart(5, '0')}</strong></p><p>Mesajları görmek ve yanıtlamak için e-postanıza gönderilen bağlantıyı açın. Gelen kutunuza düşmediyse spam klasörünü kontrol edin.</p><button type="button" className="button secondary" onClick={() => { setTrackingNumber(`TK-${String(created).padStart(5, '0')}`); setCreated(undefined); setTracking(true); }}>Talebimi Takip Et</button></div> : <>
        <p>{tracking ? challengeId ? 'E-postanıza gönderilen 6 haneli kodu girin. Kod 10 dakika geçerlidir.' : 'Talep numaranızı ve e-posta adresinizi yazın. Takip bağlantısı isteyin veya e-posta koduyla giriş yapın.' : 'Talebinizi iletin. Yanıtları e-postanızdan veya size göndereceğimiz takip bağlantısından görebilirsiniz.'}</p>
        {settings.isPending && <p role="status">Form yükleniyor…</p>}
        {settings.isError && <p role="alert" className="error">{errorText(settings.error)}</p>}
        {tracking && challengeId ? <form onSubmit={verify} className="public-form-fields">
          <label><span>Giriş Kodu</span><input autoFocus name="code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
          <button className="button primary" disabled={pending || code.length !== 6}>{pending ? 'Doğrulanıyor…' : 'Doğrula ve Giriş Yap'}</button>
          <button type="button" className="auth-forgot" disabled={pending} onClick={() => { setChallengeId(''); setCode(''); setNotice(''); setError(''); }}>Bilgileri Değiştir / Yeni Kod İste</button>
        </form> : (tracking || settings.data?.enabled) && <form onSubmit={submit} className="public-form-fields">
          {tracking ? <label key="tracking-number"><span>Talep No</span><input name="number" value={trackingNumber} onChange={event => setTrackingNumber(event.target.value)} required placeholder="TK-00123" maxLength={20} /></label> : <label key="requester-name"><span>Ad Soyad</span><input name="name" autoComplete="name" required maxLength={100} /></label>}
          <label><span>E-Posta Adresi</span><EmailInput name="email" required autoComplete="email" /></label>
          {!tracking && <>
            <div className="public-form-columns"><label><span>Telefon (isteğe bağlı)</span><input name="phone" autoComplete="tel" type="tel" maxLength={30} /></label><label><span>Firma / Şirket (isteğe bağlı)</span><input name="company" autoComplete="organization" maxLength={150} /></label></div>
            <DropdownSelect label="Departman" ariaLabel="Departman" value={departmentId} onChange={value => { setDepartmentId(value); setError(''); }} options={[{ value: '', label: 'Departman Seçin' }, ...(settings.data?.departments ?? []).map(item => ({ value: item.id, label: item.name }))]} />
            <label><span>Konu</span><input name="subject" required pattern={'.*\\S.*'} maxLength={200} onInvalid={e => e.currentTarget.setCustomValidity('Konu boş bırakılamaz.')} onInput={e => e.currentTarget.setCustomValidity('')} /></label>
            <label><span>Açıklama</span><textarea name="message" required maxLength={10000} rows={6} /></label><Files maxSize={settings.data?.maxFileSize} />
          </>}
          <TurnstileField captcha={captcha} />
          {tracking ? <div className="form-tracking-actions"><button className="button secondary" name="intent" value="link" disabled={pending || !captcha.ready}>Takip Bağlantısı Gönder</button><button className="button primary" name="intent" value="login" disabled={pending || !captcha.ready}>{pending ? 'Gönderiliyor…' : 'Giriş Yap'}</button></div> : <button className="button primary" disabled={pending || !captcha.ready}>{pending ? 'Gönderiliyor…' : 'Talebi Gönder'}</button>}
        </form>}
        {!tracking && settings.data && !settings.data.enabled && <p role="status">Form şu anda talep kabul etmiyor.</p>}
        {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
        <button type="button" className="auth-forgot" onClick={() => { setTracking(!tracking); setChallengeId(''); setCode(''); setError(''); setNotice(''); captcha.reset(); }}>{tracking ? 'Yeni Talep Aç' : 'Mevcut Talebimi Takip Et'}</button>
      </>}
    </>}
  </section></main>;
}
function FormThread({ token, maxSize }: { token: string; maxSize?: number }) {
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
  return <><h1>{thread.subject}</h1><p><strong>#TK-{String(thread.number).padStart(5, '0')}</strong> · {thread.status}</p>
    <section className="form-thread" aria-label="Konuşma" ref={timeline} onScroll={event => { const el = event.currentTarget; pin.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (el.scrollTop < 40 && hasMore && !older) void previous(); }}>
      {hasMore && <button className="button secondary" type="button" disabled={older} onClick={() => void previous()}>{older ? 'Yükleniyor…' : 'Önceki Mesajları Göster'}</button>}
      {messages.map(message => <article key={message.id} className={`form-message ${message.type === 'AGENT_REPLY' ? 'staff' : ''}`}><header><strong>{message.author.name}</strong><time>{new Date(message.createdAt).toLocaleString('tr-TR')}</time></header><p>{message.body}</p>{message.attachments.map(file => <button className="button secondary" key={file.id} type="button" onClick={() => void download(file)}>{file.originalName}</button>)}</article>)}
    </section>
    {thread.closed ? <p>Bu talep kapatıldı. <Link to="/form/destek">Yeni talep açabilirsiniz.</Link></p> : <form className="public-form-fields" onSubmit={send}><label><span>Yanıtınız</span><textarea name="body" maxLength={10000} rows={4} disabled={pending} onKeyDown={event => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (!pending && !event.repeat) event.currentTarget.form?.requestSubmit();
    }} /></label><Files maxSize={maxSize} /><button className="button primary" disabled={pending}>{pending ? 'Gönderiliyor…' : 'Yanıt Gönder'}</button></form>}
    {error && <p role="alert" className="error">{error}</p>}
  </>;
}
