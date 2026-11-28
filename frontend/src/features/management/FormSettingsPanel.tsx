import { useEffect, useRef, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, errorText } from '../../services/api';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { DropdownSelect } from '../../components/DropdownSelect';
import '../tickets/form.css';

export type FormSettings = {
  enabled: boolean; title: string; departmentId: string | null;
  requirePhone: boolean; requireCompany: boolean; requireSubject: boolean; requireMessage: boolean;
  fieldOrder: FormFieldId[];
};
export type FormFieldId = 'company' | 'name' | 'phone' | 'email' | 'subject' | 'message' | 'files';
const defaultFieldOrder: FormFieldId[] = ['company', 'name', 'phone', 'email', 'subject', 'message', 'files'];
const fieldLabels: Record<FormFieldId, string> = { company: 'Firma / Şirket', name: 'Ad Soyad', phone: 'Telefon', email: 'E-Posta Adresi', subject: 'Konu', message: 'Açıklama', files: 'Dosya Ekle' };
export function FormSettingsPanel() {
  const { user } = useAuth(), client = useQueryClient();
  const editable = hasPermission(user, 'integrations.update');
  const settings = useQuery({ queryKey: ['form-settings'], queryFn: async () => (await api.get('/integrations/form')).data.data as FormSettings });
  const departments = useQuery({ queryKey: ['/departments', 'integration-options'], queryFn: async () => (await api.get<{ data: { id: string; name: string; isActive?: boolean }[] }>('/departments', { params: { limit: 100 } })).data.data });
  const titleInput = useRef<HTMLInputElement>(null);
  const [draft, setDraft] = useState<FormSettings>({ enabled: false, title: 'Destek Talebi', departmentId: null, requirePhone: false, requireCompany: false, requireSubject: true, requireMessage: true, fieldOrder: defaultFieldOrder });
  const [message, setMessage] = useState('');
  useEffect(() => { if (settings.data) setDraft({ ...settings.data, departmentId: settings.data.departmentId ?? null, requirePhone: settings.data.requirePhone ?? false, requireCompany: settings.data.requireCompany ?? false, requireSubject: settings.data.requireSubject ?? true, requireMessage: settings.data.requireMessage ?? true, fieldOrder: defaultFieldOrder }); }, [settings.data]);
  const save = useMutation({ mutationFn: () => api.put('/integrations/form', draft), onSuccess: async () => { setMessage('Form ayarları kaydedildi.'); await Promise.all([client.invalidateQueries({ queryKey: ['form-settings'] }), client.invalidateQueries({ queryKey: ['communication-channels'] }), client.invalidateQueries({ queryKey: ['public-form'] })]); } });
  const link = `${window.location.origin}/form/destek`;
  const iframe = `<iframe src="${link}?embed=1" title="Destek Talebi" width="100%" height="1000" style="border:0;border-radius:12px" loading="lazy"></iframe>`;
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setMessage('Kopyalandı.'); } catch { setMessage('Kopyalanamadı. Metni seçip kopyalayabilirsiniz.'); } }
  return <div className="form-settings-panel"><section className="integration-card" aria-label="Form Ayarları" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) event.preventDefault(); }}>
    <div className="integration-heading"><h2>Form</h2>{settings.data && <div className="status-toggle"><label className="switch"><input id="form-enabled" type="checkbox" role="switch" aria-label="Formu Etkinleştir" checked={draft.enabled} disabled={!editable || save.isPending} onChange={e => { setDraft({ ...draft, enabled: e.target.checked }); setMessage(''); }} /><span aria-hidden="true" /></label><label htmlFor="form-enabled">Formu Etkinleştir</label></div>}</div><div className="form-settings-intro"><p>Müşteriler hesap açmadan talep gönderebilir. Takip ve yanıtlama bağlantısı e-postalarına gönderilir.</p>
    {settings.data && <div className="integration-fields form-settings-fields">
      <label><span className="field-label">Form Başlığı</span><input ref={titleInput} required pattern={'.*\\S.*'} value={draft.title} maxLength={100} disabled={!editable || save.isPending} onChange={e => { setDraft({ ...draft, title: e.target.value }); setMessage(''); }} /></label>
    </div>}</div>
    {settings.isPending && <p role="status">Ayarlar yükleniyor…</p>}
    {settings.error && <p className="error" role="alert">{errorText(settings.error)}</p>}
    {settings.data && <><fieldset className="form-settings-department" disabled={!editable || save.isPending || departments.isPending || departments.isError}><DropdownSelect ariaLabel="Taleplerin Düşeceği Departman" label="Taleplerin Düşeceği Departman" value={draft.departmentId ?? ''} onChange={value => { setDraft({ ...draft, departmentId: value || null }); setMessage(''); }} options={[{ value: '', label: 'İlk Aktif Departman' }, ...(departments.data ?? []).filter(item => item.isActive !== false).map(item => ({ value: item.id, label: item.name }))]} /></fieldset>
    <fieldset className="form-required-fields" disabled={!editable || save.isPending}>
      <legend>Zorunlu alanlar</legend>
      <p className="muted">Ad Soyad ve E-Posta Adresi her zaman zorunludur.</p>
      <div className="form-required-options">{(['company', 'phone', 'subject', 'message'] as const).map(field => {
        const key = field === 'company' ? 'requireCompany' : field === 'phone' ? 'requirePhone' : field === 'subject' ? 'requireSubject' : 'requireMessage';
        return <label className="management-check" key={field}><input type="checkbox" checked={draft[key]} onChange={event => { setDraft({ ...draft, [key]: event.target.checked }); setMessage(''); }} />{fieldLabels[field]}</label>;
      })}</div>
    </fieldset>
    {departments.isError && <p className="error" role="alert">{errorText(departments.error)}</p>}
    <p className="muted">Form talepleri seçtiğiniz departmana düşer. Takip bağlantıları için E-Posta gönderimi açık olmalıdır.</p>
    <div className="form-settings-links"><label><span>Form Bağlantısı</span><input readOnly value={link} onFocus={e => e.currentTarget.select()} /></label><div className="management-actions"><button className="button secondary" type="button" onClick={() => void copy(link)}>Bağlantıyı Kopyala</button><a className="button secondary" href={link} target="_blank" rel="noopener noreferrer">Formu Aç</a></div>
      <label><span>Siteye Gömme Kodu (iframe)</span><textarea readOnly value={iframe} onFocus={e => e.currentTarget.select()} /></label><button className="button secondary" type="button" onClick={() => void copy(iframe)}>Gömme Kodunu Kopyala</button>
    </div></>}
  </section>
    <FormSourcesPanel editable={editable} />
    {settings.data && <div className="form-settings-actions"><button className="button primary" type="button" disabled={!editable || save.isPending} onClick={() => { if (!titleInput.current?.reportValidity()) return; setMessage(''); save.mutate(); }}>{save.isPending ? 'Kaydediliyor…' : 'Kaydet'}</button></div>}
    {save.isError && <p role="alert" className="error">{errorText(save.error)}</p>}{message && <p role="status">{message}</p>}
  </div>;
}

type FormSource = { id: string; name: string; url: string; enabled: boolean };
function FormSourcesPanel({ editable }: { editable: boolean }) {
  const client = useQueryClient();
  const sources = useQuery({ queryKey: ['form-sources'], queryFn: async () => (await api.get('/integrations/form/sources')).data.data as FormSource[] });
  const [name, setName] = useState(''), [url, setUrl] = useState(''), [notice, setNotice] = useState('');
  const nameInput = useRef<HTMLInputElement>(null), urlInput = useRef<HTMLInputElement>(null);
  function addSource() {
    if (create.isPending || !nameInput.current?.reportValidity() || !urlInput.current?.reportValidity()) return;
    setNotice(''); create.mutate();
  }
  const create = useMutation({ mutationFn: () => api.post('/integrations/form/sources', { name, url }), onSuccess: async () => { setName(''); setUrl(''); setNotice('Kaynak site eklendi. Siteye özel iframe kodunu kopyalayabilirsiniz.'); await client.invalidateQueries({ queryKey: ['form-sources'] }); } });
  const toggle = useMutation({ mutationFn: (source: FormSource) => api.patch(`/integrations/form/sources/${source.id}`, { enabled: !source.enabled }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ['form-sources'] }); } });
  const remove = useMutation({ mutationFn: (id: string) => api.delete(`/integrations/form/sources/${id}`), onSuccess: async () => { setNotice('Kaynak site silindi. Eski taleplerin kaynak bilgisi korundu.'); await client.invalidateQueries({ queryKey: ['form-sources'] }); } });
  async function copy(value: string) { try { await navigator.clipboard.writeText(value); setNotice('Kopyalandı.'); } catch { setNotice('Kopyalanamadı. Metni seçip kopyalayabilirsiniz.'); } }
  return <section className="integration-card form-source-settings" aria-label="Kaynak Siteler">
    <h2>Kaynak Siteler</h2>
    <p>Her siteye özel kodla gelen taleplerde kaynak site görünür. Kod başka bir sitede kullanılırsa aynı kaynakla kaydedilir.</p>
    <p className="muted">Site Ekle ve etkinlik değişiklikleri hemen kaydedilir. Alttaki Kaydet düğmesi genel form ayarlarını kaydeder.</p>
    {editable && <div className="form-source-create" onKeyDown={event => { if (event.key === 'Enter' && event.target instanceof HTMLInputElement) { event.preventDefault(); addSource(); } }}>
      <label><span>Site Adı</span><input ref={nameInput} required pattern={'.*\\S.*'} maxLength={100} value={name} onChange={event => setName(event.target.value)} disabled={create.isPending} /></label>
      <label><span>Site Adresi</span><input ref={urlInput} required type="url" placeholder="https://ornek.com" maxLength={500} value={url} onChange={event => setUrl(event.target.value)} disabled={create.isPending} /></label>
      <button type="button" className="button primary" disabled={create.isPending} onClick={addSource}>{create.isPending ? 'Ekleniyor…' : 'Site Ekle'}</button>
    </div>}
    {sources.isPending && <p role="status">Kaynak siteler yükleniyor…</p>}
    {sources.data?.length === 0 && <p className="muted">Henüz kaynak site tanımlanmadı.</p>}
    {sources.data?.map(source => {
      const link = `${window.location.origin}/form/destek?source=${encodeURIComponent(source.id)}`;
      const iframe = `<iframe src="${link}&amp;embed=1" title="Destek Talebi" width="100%" height="1000" style="border:0;border-radius:12px" loading="lazy"></iframe>`;
      return <details key={source.id} name="form-source" className="form-source-accordion">
        <summary><span className="form-source-heading"><strong>{source.name}</strong><span className="muted">{source.url}</span></span><button type="button" role="switch" aria-checked={source.enabled} aria-label={`${source.name} kaynağını etkinleştir`} className="form-source-toggle" disabled={!editable || toggle.isPending || remove.isPending} onClick={event => { event.preventDefault(); event.stopPropagation(); setNotice(''); toggle.mutate(source); }}><span>{source.enabled ? 'Aktif' : 'Pasif'}</span><span className="form-source-toggle-track" aria-hidden="true"><span /></span></button><span className="form-source-chevron" aria-hidden="true">⌄</span></summary>
        <div className="form-settings-links form-source-content">
        {source.enabled ? <><label><span>Siteye Özel Form Bağlantısı</span><input readOnly value={link} onFocus={event => event.currentTarget.select()} /></label>
          <label><span>Siteye Özel iframe Kodu</span><textarea readOnly value={iframe} onFocus={event => event.currentTarget.select()} /></label>
          </> : <p className="muted">Bu kaynağın bağlantısı yeni talep kabul etmez. Eski taleplerin kaynak bilgisi korunur.</p>}
        <div className="management-actions form-source-actions">
          {source.enabled && <><button className="button secondary" type="button" onClick={() => void copy(iframe)}>iframe Kodunu Kopyala</button><button className="button secondary" type="button" onClick={() => void copy(link)}>Bağlantıyı Kopyala</button><a className="button secondary" href={link} target="_blank" rel="noopener noreferrer">Formu Aç</a></>}
        {editable && <button className="button secondary" type="button" disabled={remove.isPending || toggle.isPending} onClick={() => { setNotice(''); remove.mutate(source.id); }}>{remove.isPending && remove.variables === source.id ? 'Siliniyor…' : 'Sil'}</button>}
        </div></div>
      </details>;
    })}
    {(sources.error || create.error || toggle.error || remove.error) && <p role="alert" className="error">{errorText(sources.error || create.error || toggle.error || remove.error)}</p>}
    {notice && <p role="status">{notice}</p>}
  </section>;
}
