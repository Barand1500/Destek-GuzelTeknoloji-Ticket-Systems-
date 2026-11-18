import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '../../services/api';
import { DropdownSelect } from '../../components/DropdownSelect';
import { ErrorMessage } from '../management/shared';
import { money } from './types';

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
  const change = (patch: Partial<Settings>) => { setDraft(v => v ? { ...v, ...patch } : v); setDirty(true); setMessage(''); };
  function submit(event: FormEvent) { event.preventDefault(); save.mutate(); }
  return <section className="credit-sales-card" aria-label="Ödeme Ayarları">
    <h2>Ödeme Ayarları</h2>
    <p>Önce kapalı olarak kaydedin, bağlantıyı test edin, ardından online ödemeyi açın.</p>
    <ErrorMessage error={query.error} />
    {draft && <form onSubmit={submit} autoComplete="off">
      <fieldset className="payment-settings-fields" disabled={!editable || pending}>
        <DropdownSelect ariaLabel="Ödeme sağlayıcısı" label="Ödeme sağlayıcısı" value="iyzico" onChange={() => {}} options={[{ value: 'iyzico', label: 'iyzico' }]} />
        <DropdownSelect ariaLabel="Ödeme ortamı" label="Ortam" value={draft.mode} onChange={mode => change({ mode: mode as Settings['mode'], enabled: false })} options={[{ value: 'sandbox', label: 'Test ortamı' }, { value: 'production', label: 'Canlı ortam' }]} />
        <label className="payment-public-url"><span className="field-label">Dış erişim adresi *</span><input type="url" required value={draft.publicUrl} onChange={e => change({ publicUrl: e.target.value })} placeholder="https://destek.sirketiniz.com" /></label>
        <label><span className="field-label">API anahtarı</span><input type="password" autoComplete="new-password" value={apiKey} onChange={e => { setApiKey(e.target.value); change({ enabled: false, testedAt: null }); }} placeholder={draft.credentialsConfigured ? 'Kayıtlı · değiştirmek için girin' : 'API anahtarı'} /></label>
        <label><span className="field-label">Gizli anahtar</span><input type="password" autoComplete="new-password" value={secretKey} onChange={e => { setSecretKey(e.target.value); change({ enabled: false, testedAt: null }); }} placeholder={draft.credentialsConfigured ? 'Kayıtlı · değiştirmek için girin' : 'Gizli anahtar'} /></label>
      </fieldset>
      <div className="payment-settings-toggles">
        <label className="integration-toggle"><span>Online ödeme</span><input type="checkbox" role="switch" checked={draft.enabled} disabled={!editable || pending || !draft.testedAt} onChange={e => change({ enabled: e.target.checked })} /><i aria-hidden="true" /></label>
        <label className="integration-toggle"><span>Otomatik yenileme</span><input type="checkbox" role="switch" checked={draft.recurringEnabled} disabled={!editable || pending} onChange={e => change({ recurringEnabled: e.target.checked })} /><i aria-hidden="true" /></label>
      </div>
      <p className="credit-help">Tek çekim kullanılır. Otomatik yenileme için iyzico hesabınızda kart saklama ve saklı karttan ödeme yetkisi açık olmalı. Bankaya aktarım hesabı iyzico panelinde yönetilir.</p>
      {draft.testedAt && <p>Son bağlantı testi: {new Date(draft.testedAt).toLocaleString('tr-TR')}</p>}
      {draft.lastError && <p role="alert">{draft.lastError}</p>}
      {draft.publicUrl && <p className="credit-help">iyzico bildirim adresi: {draft.publicUrl.replace(/\/$/, '')}/api/v1/payments/iyzico/webhook</p>}
      <ErrorMessage error={save.error} /><ErrorMessage error={check.error} />
      {message && <p role="status">{message}</p>}
      {editable && <div className="payment-settings-actions"><button className="button secondary" type="button" disabled={pending || dirty || !draft.credentialsConfigured} onClick={() => check.mutate()}>Bağlantıyı Test Et</button><button className="button primary" disabled={pending || !dirty}>{save.isPending ? 'Kaydediliyor…' : 'Ödeme Ayarlarını Kaydet'}</button></div>}
    </form>}
    <PaymentReviews editable={editable} />
  </section>;
}

type Review = { id: string; createdAt: string; order: { number: number; name: string; total: string; currency: string } };
function PaymentReviews({ editable }: { editable: boolean }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['payment-reviews'], queryFn: async () => (await api.get('/credit-sales/payment-settings/pending')).data.data as { total: number; data: Review[] }, refetchInterval: 60000 });
  const [target, setTarget] = useState<Review | null>(null), [reference, setReference] = useState(''), [confirmed, setConfirmed] = useState(false);
  const action = useMutation({ mutationFn: ({ id, close }: { id: string; close: boolean }) => api.post(`/credit-sales/payment-settings/pending/${id}/${close ? 'no-charge' : 'check'}`, close ? { confirmedNoCharge: confirmed, providerReference: reference } : {}), onSuccess: async () => { setTarget(null); await client.invalidateQueries({ queryKey: ['payment-reviews'] }); } });
  return <div className="payment-reviews"><ErrorMessage error={query.error} /><ErrorMessage error={action.error} />
    {!!query.data?.total && <><h3>Sonucu bekleyen ödemeler ({query.data.total})</h3><p>15 dakikadan uzun süren işlemler burada listelenir. Belirsiz ödeme yeniden çekilmez. En fazla 50 kayıt gösterilir.</p>
      {query.data.data.map(row => <div key={row.id} className="credit-store-title"><span>#{row.order.number} · {row.order.name} · {money(row.order.total, row.order.currency)}</span>{editable && <div className="payment-settings-actions"><button className="button secondary" disabled={action.isPending} onClick={() => action.mutate({ id: row.id, close: false })}>Sonucu Sorgula</button><button className="button secondary" disabled={action.isPending || Date.now() - new Date(row.createdAt).getTime() < 3600000} onClick={() => { setTarget(row); setReference(''); setConfirmed(false); }}>Tahsilat Yok Doğrulaması</button></div>}</div>)}
    </>}
    {target && <div className="credit-sales-card" role="region" aria-label="Tahsilat yok doğrulaması"><h3>#{target.order.number} için dış doğrulama</h3><p>Önce iyzico panelinden veya destek ekibinden bu işlemin tahsil edilmediğini ve sonradan tamamlanmayacağını doğrulayın. Hatalı doğrulama mükerrer ödemeye neden olabilir.</p><label><span className="field-label">Sağlayıcı doğrulama referansı / açıklama *</span><input value={reference} maxLength={500} onChange={e => setReference(e.target.value)} /></label><label className="integration-toggle"><span>Sağlayıcıdan tahsilat yapılmadığını doğruladım.</span><input type="checkbox" checked={confirmed} onChange={e => setConfirmed(e.target.checked)} /><i aria-hidden="true" /></label><div className="payment-settings-actions"><button className="button secondary" disabled={action.isPending} onClick={() => setTarget(null)}>Vazgeç</button><button className="button primary" disabled={action.isPending || !confirmed || reference.trim().length < 10} onClick={() => action.mutate({ id: target.id, close: true })}>Doğrulamayı Kaydet</button></div></div>}
  </div>;
}
