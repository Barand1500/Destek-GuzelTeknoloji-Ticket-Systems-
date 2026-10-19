import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../../services/api';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import '../tickets/form.css';

type Settings = { enabled: boolean; title: string };
export function FormSettingsPanel() {
  const { user } = useAuth(), client = useQueryClient();
  const editable = hasPermission(user, 'integrations.update');
  const settings = useQuery({ queryKey: ['form-settings'], queryFn: async () => (await api.get('/integrations/form')).data.data as Settings });
  const titleInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<Settings>({ enabled: false, title: 'Destek Talebi' });
  const [message, setMessage] = useState('');
  useEffect(() => { if (settings.data) setDraft({ enabled: settings.data.enabled, title: settings.data.title }); }, [settings.data]);
  const save = useMutation({ mutationFn: () => api.put('/integrations/form', draft), onSuccess: async () => { setMessage('Form ayarları kaydedildi.'); await Promise.all([client.invalidateQueries({ queryKey: ['form-settings'] }), client.invalidateQueries({ queryKey: ['communication-channels'] }), client.invalidateQueries({ queryKey: ['public-form'] })]); } });
  const link = `${window.location.origin}/form/destek`;
  const iframe = `<iframe src="${link}?embed=1" title="Destek Talebi" width="100%" height="1000" style="border:0;border-radius:12px" loading="lazy"></iframe>`;
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setMessage('Kopyalandı.'); } catch { setMessage('Kopyalanamadı. Metni seçip kopyalayabilirsiniz.'); } }
  return <div className="form-settings-panel"><section className="integration-card" aria-label="Form Ayarları" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
    <h2>Form</h2><div className="form-settings-intro"><p>Müşteriler hesap açmadan talep gönderebilir. Takip ve yanıtlama bağlantısı e-postalarına gönderilir.</p>
    {settings.data && <div className="integration-fields form-settings-fields">
      <label><span className="field-label">Form Başlığı</span><input ref={titleInput} required pattern={'.*\\S.*'} value={draft.title} maxLength={100} disabled={!editable || save.isPending} onChange={e => { setDraft({ ...draft, title: e.target.value }); setMessage(''); }} /></label>
      <label className="management-check"><input type="checkbox" checked={draft.enabled} disabled={!editable || save.isPending} onChange={e => { setDraft({ ...draft, enabled: e.target.checked }); setMessage(''); }} />Formu Etkinleştir</label>
    </div>}</div>
    {settings.isPending && <p role="status">Ayarlar yükleniyor…</p>}
    {settings.error && <p className="error" role="alert">{errorText(settings.error)}</p>}
    {settings.data && <><p className="muted">Müşteri talep açarken departmanı kendisi seçer. Takip bağlantıları için E-Posta gönderimi açık olmalıdır.</p>
    <div className="form-settings-links"><label><span>Form Bağlantısı</span><input readOnly value={link} onFocus={e => e.currentTarget.select()} /></label><div className="management-actions"><button className="button secondary" type="button" onClick={() => void copy(link)}>Bağlantıyı Kopyala</button><a className="button secondary" href={link} target="_blank" rel="noopener noreferrer">Formu Aç</a></div>
      <label><span>Siteye Gömme Kodu (iframe)</span><textarea readOnly value={iframe} onFocus={e => e.currentTarget.select()} /></label><button className="button secondary" type="button" onClick={() => void copy(iframe)}>Gömme Kodunu Kopyala</button>
    </div></>}
  </section>{settings.data && <div className="form-settings-actions"><button className="button primary" type="button" disabled={!editable || save.isPending} onClick={() => { if (!titleInput.current?.reportValidity()) return; setMessage(''); save.mutate(); }}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button></div>}
    {save.isError && <p role="alert" className="error">{errorText(save.error)}</p>}{message && <p role="status">{message}</p>}
  </div>;
}
