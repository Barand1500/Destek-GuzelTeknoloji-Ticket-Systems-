import { useEffect, useLayoutEffect, useRef, useState, type FormEvent } from 'react';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { TurnstileField, useTurnstile } from '../auth/Turnstile';
import { EmailInput } from '../../components/EmailInput';
import { FilePreviewModal, displayFileName } from './TicketExtras';
import { errorText } from '../../services/api';
import { Paperclip, Send, X } from 'lucide-react';
import { DropdownSelect } from '../../components/DropdownSelect';
import './form.css';

// Guest credentials must never replace staff credentials or trigger staff-session refresh.
const guest = axios.create({ baseURL: '/api/v1/public/form', withCredentials: false });
type Message = { id: string; body: string; type: string; createdAt: string; author: { name: string }; attachments: { id: string; originalName: string; size: number; mimeType: string }[] };
type Thread = { number: number; subject: string; status: string; closed: boolean; messages: Message[]; hasMore: boolean; direction: 'latest' | 'after' | 'before' };
type FormAccountTicket = { id: string; number: number; subject: string; status: string; channel: string; createdAt: string; updatedAt: string };
type FormFieldId = 'company' | 'name' | 'phone' | 'email' | 'subject' | 'message' | 'files';
const defaultFieldOrder: FormFieldId[] = ['company', 'name', 'phone', 'email', 'subject', 'message', 'files'];
function Files({ maxSize = 30 * 1024 * 1024 }: { maxSize?: number }) {
  return <label className="form-files"><span className="field-label">Dosya Ekle (isteğe bağlı)</span><input name="files" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.zip" onChange={event => {
    const files = Array.from(event.currentTarget.files ?? []);
    event.currentTarget.setCustomValidity(files.reduce((sum, file) => sum + file.size, 0) > maxSize ? `Dosyaların toplam boyutu en fazla ${Math.floor(maxSize / 1024 / 1024)} MB olabilir.` : '');
    event.currentTarget.reportValidity();
  }} /></label>;
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
  const [tracking, setTracking] = useState(location.pathname !== '/form/destek');
  const token = location.pathname === '/form/talep' && /^[a-f0-9]{64}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : '';
  const accountToken = location.pathname.startsWith('/form/hesap') && /^[a-f0-9]{64}$/.test(location.hash.slice(1)) ? location.hash.slice(1) : '';
  const accountConversationId = location.pathname.match(/^\/form\/hesap\/([0-9a-f-]{36})$/i)?.[1] ?? '';
  const captcha = useTurnstile(tracking ? 'form_access' : 'form_submit');
  const settings = useQuery({ queryKey: ['public-form'], queryFn: async () => (await guest.get('/settings')).data.data as { enabled: boolean; title: string; fieldOrder?: FormFieldId[]; requirePhone: boolean; requireCompany: boolean; requireSubject: boolean; requireMessage: boolean; maxTotalFileSize?: number } });
  const accountTickets = useQuery({ queryKey: ['public-form-account-tickets-v2', accountToken], queryFn: async () => (await guest.get('/tickets', { headers: { 'x-form-token': accountToken } })).data.data as FormAccountTicket[], enabled: Boolean(accountToken) && !accountConversationId, retry: false });
  const [pending, setPending] = useState(false), [error, setError] = useState(''), [notice, setNotice] = useState('');
  const [created, setCreated] = useState<number>();
  const [challengeId, setChallengeId] = useState(''), [code, setCode] = useState('');
  const [deliveryChannel, setDeliveryChannel] = useState<'EMAIL' | 'SMS'>('EMAIL');
  useEffect(() => { setTracking(location.pathname !== '/form/destek'); setCreated(undefined); setError(''); setNotice(''); }, [location.pathname]);
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
        const identity = data.get('identity');
        const result = await guest.post('/login', { ...(deliveryChannel === 'EMAIL' ? { email: identity } : { phone: identity }), deliveryChannel, ...captcha.payload });
        if (!result.data.data.found) { setError(deliveryChannel === 'EMAIL' ? 'Bu e-posta adresiyle eşleşen bir talep bulunamadı.' : 'Bu telefon numarasıyla eşleşen bir talep bulunamadı.'); return; }
        setChallengeId(result.data.data.challengeId); setCode('');
        setNotice(deliveryChannel === 'EMAIL' ? 'Doğrulama kodu e-posta adresinize gönderildi.' : 'Doğrulama kodu telefon numaranıza SMS olarak gönderildi.');
      } else {
        if (captcha.payload.turnstileToken) data.set('turnstileToken', captcha.payload.turnstileToken);
        const sourceId = new URLSearchParams(location.search).get('source');
        if (sourceId) data.set('sourceId', sourceId);
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
      navigate(`/form/hesap#${result.data.data.token}`, { replace: true });
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
  return <main className={`public-form-page${embedded ? ' embedded' : ''}${!token && accountToken && !accountConversationId ? ' form-account-page' : ''}`}><section className="public-form-card">
    {token ? <FormThread key={token} token={token} maxSize={settings.data?.maxTotalFileSize} newRequestHref={embedded ? '/form/destek?embed=1' : '/form/destek'} /> : accountToken ? accountConversationId ? <FormThread key={accountConversationId} token={accountToken} conversationId={accountConversationId} backHref={`/form/hesap#${accountToken}`} maxSize={settings.data?.maxTotalFileSize} newRequestHref="/form/destek" /> : <>
      <div className="public-form-heading"><h1>Taleplerim</h1><Link className="button secondary" to="/form/destek">Yeni Talep Aç</Link></div>
      {accountTickets.isPending && <p role="status">Talepler yükleniyor…</p>}
      {accountTickets.isError && <div role="alert" className="error"><p>{errorText(accountTickets.error)}</p><button className="button secondary" type="button" onClick={() => navigate('/form/talep', { replace: true })}>E-posta ile yeniden giriş yap</button></div>}
      {accountTickets.data && <section className="form-account-ticket-list" aria-label="Destek taleplerim">{accountTickets.data.length ? accountTickets.data.map(ticket => <button className="form-account-ticket" type="button" key={ticket.id} onClick={() => navigate(`/form/hesap/${ticket.id}#${accountToken}`)}><span className="form-account-ticket-main"><strong>{ticket.subject}</strong><small>#{`TK-${String(ticket.number).padStart(5, '0')}`} · {ticket.status}</small></span><time dateTime={ticket.updatedAt}>{new Date(ticket.updatedAt).toLocaleDateString('tr-TR')}</time></button>) : <p>Doğrulanan iletişim bilginizle eşleşen bir talep bulunamadı.</p>}</section>}
    </> : <>
      <div className="public-form-heading"><h1>{tracking ? 'Taleplerime Giriş' : settings.data?.title ?? 'Destek Talebi'}</h1><button type="button" className="button secondary" onClick={() => { setTracking(created ? false : !tracking); setCreated(undefined); setChallengeId(''); setCode(''); setError(''); setNotice(''); captcha.reset(); }}>{tracking || created ? 'Yeni Talep Aç' : 'Mevcut Talebimi Takip Et'}</button></div>
      {created ? <div role="status"><h2>Talebiniz alındı.</h2><p>Talep numaranız: <strong>#TK-{String(created).padStart(5, '0')}</strong></p><p>Mesajları görmek ve yanıtlamak için e-postanıza gönderilen bağlantıyı açın. Gelen kutunuza düşmediyse spam klasörünü kontrol edin.</p><button type="button" className="button secondary" onClick={() => { setCreated(undefined); setTracking(true); }}>Taleplerimi Gör</button></div> : <>
        {tracking && <p>{challengeId ? 'E-posta veya SMS ile gönderilen 6 haneli kodu girin. Kod 10 dakika geçerlidir.' : 'E-posta ile giriş yapabilir veya telefonunuza SMS ile doğrulama kodu isteyebilirsiniz.'}</p>}
        {settings.isPending && <p role="status">Form yükleniyor…</p>}
        {settings.isError && <p role="alert" className="error">{errorText(settings.error)}</p>}
        {tracking && challengeId ? <form onSubmit={verify} className="public-form-fields">
          <label><span className="field-label">Giriş Kodu</span><input autoFocus name="code" value={code} onChange={e => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))} inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required /></label>
          <button className="button primary" disabled={pending || code.length !== 6}>{pending ? 'Doğrulanıyor…' : 'Doğrula ve Taleplerimi Gör'}</button>
          <button type="button" className="auth-forgot" disabled={pending} onClick={() => { setChallengeId(''); setCode(''); setNotice(''); setError(''); }}>Bilgileri Değiştir / Yeni Kod İste</button>
        </form> : (tracking || settings.data?.enabled) && <form onSubmit={submit} className="public-form-fields">
          {tracking ? <><DropdownSelect ariaLabel="Kod gönderme yöntemi" value={deliveryChannel} onChange={value => setDeliveryChannel(value as 'EMAIL' | 'SMS')} options={[{ value: 'EMAIL', label: 'E-Posta' }, { value: 'SMS', label: 'SMS' }]} />{deliveryChannel === 'EMAIL' ? <label><span className="field-label">E-Posta Adresi</span><EmailInput name="identity" required autoComplete="email" /></label> : <label><span className="field-label">Telefon Numarası</span><input name="identity" type="tel" inputMode="numeric" autoComplete="tel-national" required placeholder="5XX XXX XX XX" maxLength={13} pattern="5[0-9]{2} [0-9]{3} [0-9]{2} [0-9]{2}" title="5 ile başlayan 10 haneli GSM numarası girin." onInput={event => { const input = event.currentTarget; const digits = input.value.replace(/\D/g, "").slice(0, 10); input.value = digits.startsWith("5") ? [digits.slice(0, 3), digits.slice(3, 6), digits.slice(6, 8), digits.slice(8, 10)].filter(Boolean).join(" ") : ""; input.setCustomValidity(""); }} onInvalid={event => event.currentTarget.setCustomValidity("5 ile başlayan 10 haneli GSM numarası girin.")} /></label>}</> : fieldOrder.map((field, index) => {
            if (field === 'email' && fieldOrder[index - 1] === 'phone') return null;
            if (field === 'phone' && fieldOrder[index + 1] === 'email') return <div className="public-form-columns" key={`${field}-email`}>{renderField(field)}{renderField('email')}</div>;
            return <div key={field}>{renderField(field)}</div>;
          })}
          <TurnstileField captcha={captcha} />
          {tracking ? <button className="button primary" disabled={pending || !captcha.ready}>{pending ? 'Kod Gönderiliyor…' : 'Doğrulama Kodu Gönder'}</button> : <button className="button primary" disabled={pending || !captcha.ready}>{pending ? 'Gönderiliyor…' : 'Talebi Gönder'}</button>}
        </form>}
        {!tracking && settings.data && !settings.data.enabled && <p role="status">Form şu anda talep kabul etmiyor.</p>}
        {error && <p role="alert" className="error">{error}</p>}{notice && <p role="status">{notice}</p>}
      </>}
    </>}
  </section></main>;
}
function FormThread({ token, maxSize, newRequestHref, conversationId, backHref }: { token: string; maxSize?: number; newRequestHref: string; conversationId?: string; backHref?: string }) {
  const headers = { 'x-form-token': token, ...(conversationId ? { 'x-form-conversation': conversationId } : {}) };
  const latest = useRef(''), timeline = useRef<HTMLElement>(null), pin = useRef(true), prepend = useRef<{ top: number; height: number } | null>(null);
  const query = useQuery({
    queryKey: ['form-thread', token, conversationId ?? 'direct-link'],
    queryFn: async ({ signal }) => (await guest.get('/conversation', { headers, signal, params: latest.current ? { after: latest.current } : undefined })).data.data as Thread,
    // Incremental responses are only valid while this thread's local message history exists.
    gcTime: 0,
    retry: false,
    refetchInterval: state => state.state.data?.direction === 'after' && state.state.data.hasMore ? 500 : 5000,
  });
  const [messages, setMessages] = useState<Message[]>([]), [hasMore, setHasMore] = useState(false), [pending, setPending] = useState(false), [older, setOlder] = useState(false), [error, setError] = useState('');
  const [draftBody, setDraftBody] = useState(''), [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const composerFocus = useComposerFocus(pending, conversationId ?? token);
  const [preview, setPreview] = useState<{ name: string; mimeType: string; data: Blob } | null>(null);
  const [openingFile, setOpeningFile] = useState('');
  const hasDraft = Boolean(draftBody.trim()) || selectedFiles.length > 0;
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
    data.delete('files');
    for (const file of selectedFiles) data.append('files', file);
    if (!String(data.get('body') ?? '').trim() && !data.getAll('files').some(file => file instanceof File && file.size > 0)) return;
    composerFocus.restoreAfterSend();
    setPending(true); setError('');
    try { await guest.post('/conversation/messages', data, { headers }); form.reset(); setDraftBody(''); setSelectedFiles([]); pin.current = true; await query.refetch(); }
    catch (e) { setError(errorText(e)); } finally { setPending(false); }
  }
  async function openAttachment(file: Message['attachments'][number]) {
    setOpeningFile(file.id); setError('');
    try {
      const result = await guest.get<Blob>(`/conversation/attachments/${file.id}`, { headers, responseType: 'blob' });
      const mimeType = file.mimeType || result.data.type;
      setPreview({ name: file.originalName, mimeType, data: new Blob([result.data], { type: mimeType }) });
    }
    catch { setError('Dosya açılamadı. Bağlantınızın süresi dolmuş olabilir.'); }
    finally { setOpeningFile(''); }
  }
  if (query.isPending) return <p role="status">Talep yükleniyor…</p>;
  if (query.isError) return <><h1>Talep açılamadı</h1><p role="alert" className="error">{errorText(query.error)}</p><Link to="/form/talep">Yeni takip bağlantısı iste</Link></>;
  const thread = query.data;
  return <><div className="public-form-heading"><div className="form-thread-heading-main"><Link className="form-account-back" to={backHref ?? '/form/talep'}>← Tüm Taleplerime Dön</Link><h1>{thread.subject}</h1></div><Link className="button secondary" to={newRequestHref}>Yeni Talep Aç</Link></div><p><strong>#TK-{String(thread.number).padStart(5, '0')}</strong> · {thread.status}</p>
    <div className="form-thread-divider" aria-hidden="true" />
    <section className="form-thread" aria-label="Konuşma" ref={timeline} onScroll={event => { const el = event.currentTarget; pin.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; if (el.scrollTop < 40 && hasMore && !older) void previous(); }}>
      {hasMore && <button className="button secondary" type="button" disabled={older} onClick={() => void previous()}>{older ? 'Yükleniyor…' : 'Önceki Mesajları Göster'}</button>}
      {messages.map(message => <article key={message.id} className={`form-message ${message.type === 'AGENT_REPLY' ? 'staff' : ''}`}><header><strong>{message.author.name}</strong><time>{new Date(message.createdAt).toLocaleString('tr-TR')}</time></header><p>{message.body}</p>{message.attachments.map(file => <button className="button secondary" key={file.id} type="button" disabled={openingFile === file.id} onClick={() => void openAttachment(file)}>{openingFile === file.id ? "Açılıyor…" : file.originalName}</button>)}</article>)}
    </section>
    {thread.closed ? <p>Bu talep kapatıldı. <Link to="/form/destek">Yeni talep açabilirsiniz.</Link></p> : <form ref={composerFocus.formRef} className="form-thread-reply" onSubmit={send}>
      {selectedFiles.length > 0 && <ul className="form-selected-files" aria-label="Gönderilecek dosyalar">{selectedFiles.map((file, index) => <li key={`${file.name}-${file.size}-${file.lastModified}`}><Paperclip size={16} aria-hidden="true"/><span title={file.name}>{file.name}<small>{file.size < 1024 * 1024 ? `${Math.ceil(file.size / 1024)} KB` : `${(file.size / 1024 / 1024).toFixed(1)} MB`}</small></span><button type="button" disabled={pending} aria-label={`${file.name} dosyasını kaldır`} title="Dosyayı kaldır" onClick={() => setSelectedFiles(current => current.filter((_, position) => position !== index))}><X size={16} aria-hidden="true"/></button></li>)}</ul>}
      <div className="form-thread-compose"><label className="form-thread-compose-message"><span className="sr-only">Yanıtınız</span><textarea name="body" placeholder="Yanıtınızı yazın..." maxLength={10000} rows={2} disabled={pending} value={draftBody} onChange={event => setDraftBody(event.currentTarget.value)} onKeyDown={event => {
      if (event.key !== 'Enter' || event.shiftKey || event.ctrlKey || event.altKey || event.metaKey || event.nativeEvent.isComposing || event.keyCode === 229) return;
      event.preventDefault();
      if (!pending && !event.repeat) event.currentTarget.form?.requestSubmit();
    }} /></label><label className="form-thread-attach" aria-label="Dosya ekle" title="Dosya ekle"><Paperclip size={20} aria-hidden="true"/><input aria-label="Dosya ekle" name="files" type="file" multiple disabled={pending} accept=".jpg,.jpeg,.png,.webp,.pdf,.docx,.xlsx,.txt,.zip" onChange={event => {
      const files = Array.from(event.currentTarget.files ?? []).filter(file => file.size > 0);
      event.currentTarget.value = '';
      const combined = [...selectedFiles];
      for (const file of files) if (!combined.some(existing => existing.name === file.name && existing.size === file.size && existing.lastModified === file.lastModified)) combined.push(file);
      const limit = maxSize ?? 30 * 1024 * 1024;
      if (combined.reduce((sum, file) => sum + file.size, 0) > limit) { setError(`Dosyaların toplam boyutu en fazla ${Math.floor(limit / 1024 / 1024)} MB olabilir. Yeni seçilen dosyalar eklenmedi.`); return; }
      setSelectedFiles(combined); setError('');
    }} /></label>{hasDraft && <button className="form-thread-send" type="submit" aria-label="Yanıtı gönder" title="Yanıtı gönder" disabled={pending}><Send size={19} aria-hidden="true" /></button>}</div></form>}
    {error && <p role="alert" className="error">{error}</p>}
    {preview && <FilePreviewModal file={preview} onClose={() => setPreview(null)} />}
  </>;
}
import { useComposerFocus } from '../../components/useComposerFocus';
