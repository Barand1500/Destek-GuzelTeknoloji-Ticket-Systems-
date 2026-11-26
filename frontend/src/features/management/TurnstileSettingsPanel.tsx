import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Eye, EyeOff, ShieldCheck } from 'lucide-react';
import { api, errorText } from '../../services/api';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';

type Settings = { enabled: boolean; siteKey: string; secretConfigured: boolean; secretLength: number };
export function TurnstileSettingsPanel() {
  const { user } = useAuth(), client = useQueryClient();
  const editable = hasPermission(user, 'integrations.update');
  const settings = useQuery({ queryKey: ['turnstile-settings'], queryFn: async () => (await api.get<{ data: Settings }>('/integrations/turnstile')).data.data });
  const [enabled, setEnabled] = useState(false), [siteKey, setSiteKey] = useState(''), [secretKey, setSecretKey] = useState(''), [visible, setVisible] = useState(false);
  const [secretEdited, setSecretEdited] = useState(false);
  const reveal = useMutation({ mutationFn: async () => (await api.get<{ data: { secretKey: string } }>('/integrations/turnstile/secret')).data.data, onSuccess: result => { setSecretKey(result.secretKey); setVisible(true); } });
  const site = useRef<HTMLInputElement>(null);
  useEffect(() => { if (settings.data) { setEnabled(settings.data.enabled); setSiteKey(settings.data.siteKey); setSecretKey(''); setSecretEdited(false); } }, [settings.data]);
  const save = useMutation({ mutationFn: async () => (await api.put<{ data: Settings }>('/integrations/turnstile', { enabled, siteKey, ...(secretKey.trim() ? { secretKey } : {}) })).data.data,
    onSuccess: async result => {
      setSecretKey(''); setVisible(false); client.setQueryData(['turnstile-settings'], result);
      await Promise.all([client.invalidateQueries({ queryKey: ['auth-security'] }), client.invalidateQueries({ queryKey: ['public-form'] })]);
    } });
  return <div className="form-settings-panel"><section className="integration-card" aria-label="Cloudflare Ayarları" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
    <div className="integration-heading"><h2 className="turnstile-title"><ShieldCheck size={18} /> Cloudflare Turnstile</h2><div className="status-toggle"><label className="switch"><input id="turnstile-enabled" type="checkbox" role="switch" aria-label="Doğrulamayı Etkinleştir" checked={enabled} disabled={!editable || save.isPending || !settings.data} onChange={event => { setEnabled(event.target.checked); save.reset(); }} /><span aria-hidden="true" /></label><label htmlFor="turnstile-enabled">Doğrulamayı Etkinleştir</label></div></div>
    <p>Giriş, kayıt, şifre sıfırlama ve Form ekranlarını otomatik isteklere karşı korur.</p>
    {settings.isPending && <p role="status">Ayarlar yükleniyor…</p>}
    {settings.isError && <p className="error" role="alert">{errorText(settings.error)}</p>}
    {settings.data && <><div className="integration-fields">
      <label><span className="field-label">Site Key</span><input ref={site} name="turnstileSiteKey" value={siteKey} required={enabled} maxLength={256} autoComplete="off" disabled={!editable || save.isPending} onChange={event => { setSiteKey(event.target.value); save.reset(); }} /></label>
      <label><span className="field-label">Secret Key</span><span className="password-field integration-password-field"><input name="turnstileSecretKey" value={!secretEdited && !secretKey && settings.data.secretConfigured && !visible ? "*".repeat(settings.data.secretLength) : secretKey} onFocus={event => { if (!secretEdited && !secretKey && settings.data.secretConfigured) event.currentTarget.select(); }} type={visible ? 'text' : 'password'} maxLength={2048} autoComplete="new-password"  disabled={!editable || save.isPending} onChange={event => { setSecretKey(event.target.value); setSecretEdited(true); save.reset(); }} /><button className="password-toggle" type="button" aria-label={visible ? 'Gizli Anahtarı Gizle' : 'Gizli Anahtarı Göster'} disabled={!editable || reveal.isPending} onClick={() => { if (!visible && !secretKey && settings.data.secretConfigured) reveal.mutate(); else setVisible(!visible); }}>{visible ? <EyeOff size={17} /> : <Eye size={17} />}</button></span></label>
    </div><p className="muted">Anahtarları Cloudflare → Turnstile bölümünden alabilirsiniz. Alan adınız widget’a ekli olmalıdır.</p></>}
  </section>{settings.data && <div className="form-settings-actions"><button className="button primary" type="button" disabled={!editable || save.isPending} onClick={() => { if (!site.current?.reportValidity()) return; save.mutate(); }}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button></div>}
    {reveal.isError && <p className="error" role="alert">{errorText(reveal.error)}</p>}{save.isError && <p className="error" role="alert">{errorText(save.error)}</p>}{save.isSuccess && <p role="status" className="management-success">Cloudflare ayarları kaydedildi.</p>}
  </div>;
}
