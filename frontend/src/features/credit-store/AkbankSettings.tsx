import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { DropdownSelect } from '../../components/DropdownSelect';
import { ErrorMessage } from '../management/shared';

type Settings = { mode: 'sandbox' | 'production'; credentialsConfigured: boolean; enabled: boolean; publicUrl: string; testedAt: string | null; lastError: string | null };
const emptyKeys = { merchantSafeId: '', terminalSafeId: '', secretKey: '' };
export function AkbankSettings({ editable }: { editable: boolean }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['akbank-settings'], queryFn: async () => (await api.get('/credit-sales/payment-settings/akbank')).data.data as Settings });
  const [mode, setMode] = useState<Settings['mode']>('sandbox');
  const [keys, setKeys] = useState(emptyKeys);
  const [enabled, setEnabled] = useState(false), [publicUrl, setPublicUrl] = useState('');
  const [dirty, setDirty] = useState(false), [message, setMessage] = useState('');
  useEffect(() => { if (query.data && !dirty) { setMode(query.data.mode); setEnabled(query.data.enabled); setPublicUrl(query.data.publicUrl); } }, [query.data, dirty]);
  const save = useMutation({ mutationFn: () => api.put('/credit-sales/payment-settings/akbank', { mode, enabled, publicUrl, ...keys }), onSuccess: async () => {
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
    <h2>Akbank Sanal POS</h2>
    <p>Bankanın işyerinize verdiği bağlantı bilgilerini girin. Kart sahibinin bilgileri bu alana yazılmaz.</p>
    <p>Kart bilgileri müşteri panelinde girilir; doğrulama Akbank 3D Pay üzerinden yapılır. Tek çekim kullanılır.</p>
    <ErrorMessage error={query.error} />
    {query.isPending && <p role="status">Ayarlar yükleniyor…</p>}
    {query.data && <form onSubmit={submit} autoComplete="off">
      <fieldset className="payment-settings-fields" disabled={!editable || busy}>
        <DropdownSelect label="Ortam" ariaLabel="Akbank ortamı" value={mode} options={[{ value: 'sandbox', label: 'Test ortamı' }, { value: 'production', label: 'Canlı ortam' }]} onChange={value => { setMode(value as Settings['mode']); setEnabled(false); setDirty(true); setMessage(''); }} />
        {([{ key: 'merchantSafeId', label: 'İşyeri kimliği (Merchant Safe ID)' }, { key: 'terminalSafeId', label: 'Terminal Safe ID' }, { key: 'secretKey', label: 'Güvenlik anahtarı' }] as const).map(({ key, label }) => <label key={key}><span className="field-label">{label}{required ? ' *' : ''}</span>
          <input type="password" autoComplete="new-password" required={required} maxLength={key === 'secretKey' ? 512 : 128} value={keys[key]} placeholder={query.data.credentialsConfigured ? 'Kayıtlı · değiştirmek için girin' : label} onChange={event => { setKeys(value => ({ ...value, [key]: event.target.value })); setEnabled(false); setDirty(true); setMessage(''); }} />
        </label>)}
        <label className="payment-public-url"><span className="field-label">Dış erişim adresi *</span><input type="url" required value={publicUrl} onChange={event => { setPublicUrl(event.target.value); setDirty(true); }} placeholder="https://destek.sirketiniz.com" /></label>
      </fieldset>
      <label className="integration-toggle"><span>Akbank online ödeme</span><input type="checkbox" role="switch" checked={enabled} disabled={!editable || busy || !query.data.testedAt || changedMode || Object.values(keys).some(Boolean)} onChange={event => { setEnabled(event.target.checked); setDirty(true); }} /><i aria-hidden="true" /></label>
      {!query.data.testedAt && <p className="credit-help">Önce bilgileri kapalı olarak kaydedin, bağlantıyı test edin; ardından online ödemeyi açın. iyzico açıksa önce kapatın.</p>}
      {query.data.credentialsConfigured && <p className="credit-help">Bilgiler kayıtlıdır; güvenlik nedeniyle tekrar gösterilmez. Boş alanlar mevcut değerleri korur.</p>}
      {changedMode && <p className="credit-help">Seçtiğiniz ortama ait üç bilgiyi yeniden girin.</p>}
      <ErrorMessage error={save.error} />
      <ErrorMessage error={check.error} />
      {query.data.lastError && <p role="alert">{query.data.lastError}</p>}
      {query.data.testedAt && <p className="credit-help">Son bağlantı testi: {new Date(query.data.testedAt).toLocaleString('tr-TR')}</p>}
      {message && <p role="status">{message}</p>}
      {editable && <div className="payment-settings-actions"><button type="button" className="button secondary" disabled={busy || dirty || !query.data.credentialsConfigured} onClick={() => check.mutate()}>Akbank Bağlantısını Test Et</button><button className="button primary" disabled={!dirty || busy}>{save.isPending ? 'Kaydediliyor…' : 'Akbank Bilgilerini Kaydet'}</button></div>}
      <p className="credit-help">Bağlantı testi para çekmez. Banka hesabının desteklediği para birimleri ve 3D yetkisi ayrıca geçerli olmalı. Akbank ile otomatik kart yenilemesi bu sürümde kullanılmaz.</p>
    </form>}
  </section>;
}
