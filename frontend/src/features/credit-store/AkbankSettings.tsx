import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { DropdownSelect } from '../../components/DropdownSelect';

type Settings = { mode: 'sandbox' | 'production'; credentialsConfigured: boolean; enabled: boolean; recurringEnabled: boolean; publicUrl: string; testedAt: string | null; lastError: string | null };
const emptyKeys = { merchantSafeId: '', terminalSafeId: '', secretKey: '' };
export function AkbankSettings({ editable }: { editable: boolean }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['akbank-settings'], queryFn: async () => (await api.get('/credit-sales/payment-settings/akbank')).data.data as Settings });
  const [mode, setMode] = useState<Settings['mode']>('production');
  const [keys, setKeys] = useState(emptyKeys);
  const [enabled, setEnabled] = useState(false), [recurringEnabled, setRecurringEnabled] = useState(false), [publicUrl, setPublicUrl] = useState('');
  const [dirty, setDirty] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { if (query.data && !dirty) { setMode(query.data.mode); setEnabled(query.data.enabled); setRecurringEnabled(query.data.recurringEnabled); setPublicUrl(query.data.publicUrl); } }, [query.data, dirty]);
  const save = useMutation({ mutationFn: () => api.put('/credit-sales/payment-settings/akbank', { mode, enabled, recurringEnabled, publicUrl, ...keys }), onSuccess: async () => {
    setKeys(emptyKeys); setDirty(false); setMessage('Akbank ayarları kaydedildi.');
    await client.invalidateQueries({ queryKey: ['akbank-settings'] });
    await client.invalidateQueries({ queryKey: ['credit-store'] });
  } });
  const check = useMutation({ mutationFn: () => api.post('/credit-sales/payment-settings/akbank/test'), onSuccess: async () => { setMessage('Akbank bağlantısı doğrulandı. Online ödemeyi açıp kaydedebilirsiniz.'); await client.invalidateQueries({ queryKey: ['akbank-settings'] }); }, onError: async () => { await client.invalidateQueries({ queryKey: ['akbank-settings'] }); } });
  const busy = save.isPending || check.isPending;
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  const changedMode = Boolean(query.data && query.data.mode !== mode);
  const required = !query.data?.credentialsConfigured || changedMode;
  return <section className="credit-sales-card" aria-label="Akbank Sanal POS">
    <div className="credit-sales-card-heading payment-provider-heading"><h2>Akbank Sanal POS</h2>
      <label className="integration-toggle"><span>Akbank online ödeme</span><input type="checkbox" role="switch" checked={enabled} disabled={!editable || busy || !query.data?.testedAt || changedMode || Object.values(keys).some(Boolean)} onChange={event => { setEnabled(event.target.checked); setDirty(true); }} /><i aria-hidden="true" /></label>
    </div>
    <ErrorMessage error={query.error} />
    {query.isPending && <p role="status">Ayarlar yükleniyor…</p>}
    {query.data && <form onSubmit={submit} autoComplete="off">
      <fieldset className="payment-settings-fields" disabled={!editable || busy}>
        <DropdownSelect label="Ortam" ariaLabel="Akbank ortamı" value={mode} onChange={value => { setMode(value as Settings['mode']); setKeys(emptyKeys); setEnabled(false); setDirty(true); setMessage(''); }} options={[{ value: 'production', label: 'Canlı ortam' }, { value: 'sandbox', label: 'Test ortamı' }]} />
        {([{ key: 'merchantSafeId', label: 'İşyeri kimliği (Merchant Safe ID)' }, { key: 'terminalSafeId', label: 'Terminal Safe ID' }, { key: 'secretKey', label: 'Güvenlik anahtarı' }] as const).map(({ key, label }) => <label key={key}><span className="field-label">{label}{required ? ' *' : ''}</span>
          <input type="password" autoComplete="new-password" required={required} maxLength={key === 'secretKey' ? 512 : 128} value={keys[key]} placeholder={query.data.credentialsConfigured ? 'Kayıtlı · değiştirmek için girin' : label} onChange={event => { setKeys(value => ({ ...value, [key]: event.target.value })); setEnabled(false); setDirty(true); setMessage(''); }} />
        </label>)}
        <label className="payment-callback-url"><span className="field-label">Dış erişim adresi *</span><input type="url" required value={publicUrl} onChange={event => { setPublicUrl(event.target.value); setDirty(true); }} placeholder="https://destek.sirketiniz.com" /></label>
      </fieldset>
      <label className="integration-toggle payment-recurring-toggle"><span>Akbank otomatik yenileme</span><input type="checkbox" role="switch" checked={recurringEnabled} disabled={!editable || busy || !query.data.testedAt} onChange={event => { setRecurringEnabled(event.target.checked); setDirty(true); setMessage(''); }} /><i aria-hidden="true" /></label>
      <p className="credit-help">{recurringEnabled ? 'Bankada dönemsel tahsilat talimatı kurulur; kart bilgisi uygulamada saklanmaz.' : 'Otomatik yenileme kapalı; yalnızca tek çekim yapılır.'}</p>
      {mode === 'sandbox' && <p className="credit-help">Test bankası ve test kartları kullanılır; gerçek para çekilmez. Canlı ortamın bilgileri burada kullanılamaz.</p>}
      {!query.data.testedAt && <p className="credit-help">Bilgileri kaydedin, bağlantıyı test edin ve online ödemeyi açın.</p>}
      {query.data.credentialsConfigured && <p className="credit-help">Boş bıraktığınız şifre alanları kayıtlı bilgileri korur.</p>}
      {changedMode && <p className="credit-help">Seçtiğiniz ortama ait üç bilgiyi yeniden girin.</p>}
      <ErrorMessage error={save.error} />
      <ErrorMessage error={check.error} />
      {query.data.lastError && <p role="alert">{query.data.lastError}</p>}
      {query.data.testedAt && <p className="credit-help">Son bağlantı testi: {new Date(query.data.testedAt).toLocaleString('tr-TR')}</p>}
      {message && <p role="status">{message}</p>}
      {editable && <div className="payment-settings-actions"><button type="button" className="button secondary" disabled={busy || dirty || !query.data.credentialsConfigured} onClick={() => check.mutate()}>Akbank Bağlantısını Test Et</button><button className="button primary" disabled={!dirty || busy}>{save.isPending ? 'Kaydediliyor…' : 'Akbank Bilgilerini Kaydet'}</button></div>}
    </form>}
  </section>;
}
