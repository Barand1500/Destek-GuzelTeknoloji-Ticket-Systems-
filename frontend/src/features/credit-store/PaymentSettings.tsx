import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { money } from './types';
import { DropdownSelect } from '../../components/DropdownSelect';

type Settings = { provider: 'iyzico'; enabled: boolean; recurringEnabled: boolean; mode: 'sandbox' | 'production'; publicUrl: string; credentialsConfigured: boolean; testedAt: string | null; lastError: string | null };
export function PaymentSettings({ editable }: { editable: boolean }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['payment-settings'], queryFn: async () => (await api.get('/credit-sales/payment-settings')).data.data as Settings });
  const [draft, setDraft] = useState<Settings | null>(null), [apiKey, setApiKey] = useState(''), [secretKey, setSecretKey] = useState('');
  const [message, setMessage] = useState(''), [dirty, setDirty] = useState(false);
  useEffect(() => { if (query.data && !dirty) setDraft(query.data); }, [query.data, dirty]);
  const refresh = async () => { await Promise.all([client.invalidateQueries({ queryKey: ['payment-settings'] }), client.invalidateQueries({ queryKey: ['credit-store'] })]); };
  const save = useMutation({ mutationFn: () => api.put('/credit-sales/payment-settings', { provider: 'iyzico', enabled: draft!.enabled, recurringEnabled: draft!.recurringEnabled, mode: draft!.mode, publicUrl: draft!.publicUrl, ...(apiKey ? { apiKey } : {}), ...(secretKey ? { secretKey } : {}) }), onSuccess: async () => { setDirty(false); setApiKey(''); setSecretKey(''); setMessage('Ödeme ayarları kaydedildi.'); await refresh(); } });
  const check = useMutation({ mutationFn: () => api.post('/credit-sales/payment-settings/test'), onSuccess: async () => { setMessage('Bağlantı doğrulandı. Satışı açıp kaydedebilirsiniz.'); await refresh(); }, onError: refresh });
  const pending = save.isPending || check.isPending;
  const changedMode = Boolean(draft && query.data && draft.mode !== query.data.mode);
  const change = (patch: Partial<Settings>) => { setDraft(v => v ? { ...v, ...patch } : v); setDirty(true); setMessage(''); };
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  return <section className="credit-sales-card" aria-label="Ödeme Ayarları">
    <div className="credit-sales-card-heading payment-provider-heading"><h2>iyzico</h2>{draft && <label className="integration-toggle"><span>Online ödeme</span><input type="checkbox" role="switch" checked={draft.enabled} disabled={!editable || pending || !draft.testedAt} onChange={e => change({ enabled: e.target.checked })} /><i aria-hidden="true" /></label>}</div>
    <ErrorMessage error={query.error} />
    {draft && <form onSubmit={submit} autoComplete="off">
      <fieldset className="payment-settings-fields" disabled={!editable || pending}>
        <DropdownSelect label="Ortam" ariaLabel="iyzico ortamı" value={draft.mode} onChange={value => { setApiKey(''); setSecretKey(''); change({ mode: value as Settings['mode'], enabled: false, recurringEnabled: false, testedAt: null }); }} options={[{ value: 'production', label: 'Canlı ortam' }, { value: 'sandbox', label: 'Test ortamı' }]} />
        <label className="payment-callback-url"><span className="field-label">Dış erişim adresi *</span><input type="url" required value={draft.publicUrl} onChange={e => change({ publicUrl: e.target.value })} placeholder="https://destek.sirketiniz.com" /></label>
        <label><span className="field-label">API anahtarı</span><input type="password" autoComplete="new-password" required={changedMode || !draft.credentialsConfigured} value={apiKey} onChange={e => { setApiKey(e.target.value); change({ enabled: false, testedAt: null }); }} placeholder={draft.credentialsConfigured && !changedMode ? 'Kayıtlı · değiştirmek için girin' : 'API anahtarı'} /></label>
        <label><span className="field-label">Gizli anahtar</span><input type="password" autoComplete="new-password" required={changedMode || !draft.credentialsConfigured} value={secretKey} onChange={e => { setSecretKey(e.target.value); change({ enabled: false, testedAt: null }); }} placeholder={draft.credentialsConfigured && !changedMode ? 'Kayıtlı · değiştirmek için girin' : 'Gizli anahtar'} /></label>
      </fieldset>
      {draft.mode === 'sandbox' && <p className="credit-help">Sandbox hesabı ve test kartları kullanılır; gerçek para çekilmez.</p>}
      {changedMode && <p className="credit-help">Seçtiğiniz ortama ait API anahtarını ve gizli anahtarı yeniden girin.</p>}
      <div className="payment-settings-toggles">
        <label className="integration-toggle"><span>Otomatik yenileme</span><input type="checkbox" role="switch" checked={draft.recurringEnabled} disabled={!editable || pending} onChange={e => change({ recurringEnabled: e.target.checked })} /><i aria-hidden="true" /></label>
      </div>
      {!draft.testedAt && <p className="credit-help">Bilgileri kaydedip bağlantıyı test edin.</p>}
      {draft.recurringEnabled && <p className="credit-help">Otomatik yenileme için iyzico kart saklama yetkisi gerekir.</p>}
      {draft.testedAt && <p>Son bağlantı testi: {new Date(draft.testedAt).toLocaleString('tr-TR')}</p>}
      {draft.lastError && <p role="alert">{draft.lastError}</p>}
      {draft.publicUrl && <p className="credit-help">iyzico bildirim adresi: {draft.publicUrl.replace(/\/$/, '')}/api/v1/payments/iyzico/webhook</p>}
      <ErrorMessage error={save.error} /><ErrorMessage error={check.error} />
      {message && <p role="status">{message}</p>}
      {editable && <div className="payment-settings-actions"><button className="button secondary" type="button" disabled={pending || dirty || !draft.credentialsConfigured} onClick={() => check.mutate()}>Bağlantıyı Test Et</button><button className="button primary" disabled={pending || !dirty}>{save.isPending ? 'Kaydediliyor…' : 'Ödeme Ayarlarını Kaydet'}</button></div>}
    </form>}
  </section>;
}

type Review = { id: string; createdAt: string; failureCode?: string | null; order: { number: number; name: string; total: string; currency: string } };
export function PaymentReviews({ editable, orderId }: { editable: boolean; orderId?: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['payment-reviews', orderId], queryFn: async () => (await api.get('/credit-sales/payment-settings/pending', { params: orderId ? { orderId } : undefined })).data.data as { total: number; data: Review[] }, refetchInterval: 60000 });
  const [resultMessage, setResultMessage] = useState('');
  const [target, setTarget] = useState<Review | null>(null), [reference, setReference] = useState(''), [confirmed, setConfirmed] = useState(false);
  const action = useMutation({ mutationFn: ({ id, close }: { id: string; close: boolean }) => api.post(`/credit-sales/payment-settings/pending/${id}/${close ? 'no-charge' : 'check'}`, close ? { confirmedNoCharge: confirmed, providerReference: reference } : {}), onMutate: () => setResultMessage(''), onSuccess: async response => { setTarget(null); setResultMessage(response.data.data.message); await Promise.all([client.invalidateQueries({ queryKey: ['payment-reviews'] }), client.invalidateQueries({ queryKey: ['/credit-sales/orders'] })]); } });
  return <div className="payment-reviews"><ErrorMessage error={query.error} /><ErrorMessage error={action.error} />
    {action.isPending && <p role="status">Banka sonucu sorgulanıyor…</p>}
    {resultMessage && <p role="status">{resultMessage}</p>}
    {!!query.data?.total && <><h3>Banka sonucu beklenen işlemler ({query.data.total})</h3><p>{orderId ? 'Bu sipariş için başlatılmış, sonucu kesinleşmemiş tahsilatlar.' : '15 dakikayı aşan işlemler · En fazla 50 kayıt'}</p>
      {query.data.data.map(row => <div key={row.id} className="credit-store-title"><span>#{row.order.number} · {row.order.name} · {money(row.order.total, row.order.currency)}{row.failureCode?.startsWith('AKBANK_CALLBACK_') && <small>Banka dönüşü kontrol edilmeli. {row.failureCode.includes('_INVALID') ? 'Dönüş imzası doğrulanamadı. ' : ''}{row.failureCode.match(/VPS-\d{4}$/)?.[0] ? 'Bildirilen kod: ' + row.failureCode.match(/VPS-\d{4}$/)![0] + '. ' : ''}Tahsilat durumu bankadan sorgulanır.</small>}</span>{editable && <div className="payment-settings-actions"><button className="button secondary" disabled={action.isPending} onClick={() => action.mutate({ id: row.id, close: false })}>Sonucu Sorgula</button><button className="button secondary" disabled={action.isPending || Date.now() - new Date(row.createdAt).getTime() < 3600000} onClick={() => { setTarget(row); setReference(''); setConfirmed(false); }}>Tahsilat Yok Doğrulaması</button></div>}</div>)}
    </>}
    {target && <div className="credit-sales-card" role="region" aria-label="Tahsilat yok doğrulaması"><h3>#{target.order.number} için dış doğrulama</h3><p>Önce ilgili ödeme sağlayıcısının panelinden veya destek ekibinden bu işlemin tahsil edilmediğini ve sonradan tamamlanmayacağını doğrulayın. Hatalı doğrulama mükerrer ödemeye neden olabilir.</p><label><span className="field-label">Sağlayıcı doğrulama referansı / açıklama *</span><input value={reference} maxLength={500} onChange={e => setReference(e.target.value)} /></label><label className="integration-toggle"><span>Sağlayıcıdan tahsilat yapılmadığını doğruladım.</span><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><i aria-hidden="true" /></label><div className="payment-settings-actions"><button className="button secondary" disabled={action.isPending} onClick={() => setTarget(null)}>Vazgeç</button><button className="button primary" disabled={action.isPending || !confirmed || reference.trim().length < 10} onClick={() => action.mutate({ id: target.id, close: true })}>Doğrulamayı Kaydet</button></div></div>}
  </div>;
}
