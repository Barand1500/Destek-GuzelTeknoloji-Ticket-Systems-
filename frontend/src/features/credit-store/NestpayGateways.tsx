import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Plus, Trash2 } from 'lucide-react';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { DropdownSelect } from '../../components/DropdownSelect';

type ConfiguredGateway = {
  provider: string;
  name: string;
  shortName: string;
  mode: 'sandbox' | 'production';
  credentialsConfigured: boolean;
  enabled: boolean;
  publicUrl: string;
  testedAt: string | null;
  lastError: string | null;
  paymentAvailable: boolean;
};

type CatalogItem = { id: string; name: string; shortName: string; configured: boolean };
type GatewaysResponse = { catalog: CatalogItem[]; configured: ConfiguredGateway[] };

function NestpayCard({
  item,
  editable,
  isNew,
  onCancelNew,
}: {
  item: ConfiguredGateway;
  editable: boolean;
  isNew?: boolean;
  onCancelNew?: () => void;
}) {
  const client = useQueryClient();
  const [draft, setDraft] = useState<ConfiguredGateway>(item);
  const [clientId, setClientId] = useState('');
  const [storeKey, setStoreKey] = useState('');
  const [apiUser, setApiUser] = useState('');
  const [apiPassword, setApiPassword] = useState('');
  const [message, setMessage] = useState('');
  const [dirty, setDirty] = useState(Boolean(isNew));

  useEffect(() => {
    if (!dirty) setDraft(item);
  }, [item, dirty]);

  const refresh = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['nestpay-gateways'] }),
      client.invalidateQueries({ queryKey: ['akbank-settings'] }),
      client.invalidateQueries({ queryKey: ['payment-settings'] }),
      client.invalidateQueries({ queryKey: ['credit-store'] }),
    ]);

  const save = useMutation({
    mutationFn: () =>
      api.put(`/credit-sales/payment-settings/gateways/${encodeURIComponent(item.provider)}`, {
        mode: draft.mode,
        enabled: draft.enabled,
        publicUrl: draft.publicUrl,
        ...(clientId ? { clientId } : {}),
        ...(storeKey ? { storeKey } : {}),
        ...(apiUser ? { apiUser } : {}),
        ...(apiPassword ? { apiPassword } : {}),
      }),
    onSuccess: async () => {
      setDirty(false);
      setClientId('');
      setStoreKey('');
      setApiUser('');
      setApiPassword('');
      setMessage(`${item.shortName} bilgileri kaydedildi.`);
      onCancelNew?.();
      await refresh();
    },
  });

  const test = useMutation({
    mutationFn: () => api.post(`/credit-sales/payment-settings/gateways/${encodeURIComponent(item.provider)}/test`),
    onSuccess: async () => {
      setMessage(`${item.shortName} bağlantısı doğrulandı. Online ödemeyi açıp kaydedebilirsiniz.`);
      await refresh();
    },
    onError: refresh,
  });

  const remove = useMutation({
    mutationFn: () => api.delete(`/credit-sales/payment-settings/gateways/${encodeURIComponent(item.provider)}`),
    onSuccess: async () => {
      await refresh();
    },
  });

  const pending = save.isPending || test.isPending || remove.isPending;
  const changedMode = !isNew && draft.mode !== item.mode;
  const keysRequired = isNew || changedMode || !draft.credentialsConfigured;
  const change = (patch: Partial<ConfiguredGateway>) => {
    setDraft(v => ({ ...v, ...patch }));
    setDirty(true);
    setMessage('');
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <section className="credit-sales-card" aria-label={item.name}>
      <div className="credit-sales-card-heading payment-provider-heading">
        <h2>{item.name}</h2>
        <label className="integration-toggle">
          <span>{item.shortName} online ödeme</span>
          <input
            type="checkbox"
            role="switch"
            checked={draft.enabled}
            disabled={!editable || pending || !draft.testedAt}
            onChange={e => change({ enabled: e.target.checked })}
          />
          <i aria-hidden="true" />
        </label>
      </div>
      <form onSubmit={submit} autoComplete="off">
        <fieldset className="payment-settings-fields" disabled={!editable || pending}>
          <DropdownSelect
            label="Ortam"
            ariaLabel={`${item.shortName} ortamı`}
            value={draft.mode}
            onChange={value => {
              setClientId('');
              setStoreKey('');
              setApiUser('');
              setApiPassword('');
              change({ mode: value as 'sandbox' | 'production', enabled: false, testedAt: null });
            }}
            options={[
              { value: 'production', label: 'Canlı ortam' },
              { value: 'sandbox', label: 'Test ortamı' },
            ]}
          />
          <label>
            <span className="field-label">Mağaza No (Client ID)</span>
            <input
              type="password"
              autoComplete="new-password"
              required={keysRequired}
              value={clientId}
              onChange={e => {
                setClientId(e.target.value);
                change({ enabled: false, testedAt: null });
              }}
              placeholder={keysRequired ? 'Mağaza No (Client ID)' : 'Kayıtlı · değiştirmek için girin'}
            />
          </label>
          <label>
            <span className="field-label">3D Anahtarı (Store Key)</span>
            <input
              type="password"
              autoComplete="new-password"
              required={keysRequired}
              value={storeKey}
              onChange={e => {
                setStoreKey(e.target.value);
                change({ enabled: false, testedAt: null });
              }}
              placeholder={keysRequired ? '3D Anahtarı (Store Key)' : 'Kayıtlı · değiştirmek için girin'}
            />
          </label>
          <label>
            <span className="field-label">API Kullanıcı Adı</span>
            <input
              type="password"
              autoComplete="new-password"
              required={keysRequired}
              value={apiUser}
              onChange={e => {
                setApiUser(e.target.value);
                change({ enabled: false, testedAt: null });
              }}
              placeholder={keysRequired ? 'API Kullanıcı Adı' : 'Kayıtlı · değiştirmek için girin'}
            />
          </label>
          <label>
            <span className="field-label">API Şifresi</span>
            <input
              type="password"
              autoComplete="new-password"
              required={keysRequired}
              value={apiPassword}
              onChange={e => {
                setApiPassword(e.target.value);
                change({ enabled: false, testedAt: null });
              }}
              placeholder={keysRequired ? 'API Şifresi' : 'Kayıtlı · değiştirmek için girin'}
            />
          </label>
          <label className="payment-callback-url">
            <span className="field-label">Dış erişim adresi *</span>
            <input
              type="url"
              required
              value={draft.publicUrl}
              onChange={e => change({ publicUrl: e.target.value })}
              placeholder="https://destek.sirketiniz.com"
            />
          </label>
        </fieldset>
        <p className="credit-help">NestPay / Payten (EST v3) altyapısı kullanılır. Boş bıraktığınız şifre alanları kayıtlı bilgileri korur.</p>
        {draft.testedAt && <p className="credit-help">Son bağlantı testi: {new Date(draft.testedAt).toLocaleString('tr-TR')}</p>}
        {draft.lastError && <p role="alert">{draft.lastError}</p>}
        <ErrorMessage error={save.error} />
        <ErrorMessage error={test.error} />
        <ErrorMessage error={remove.error} />
        {message && <p role="status">{message}</p>}
        {editable && (
          <div className="payment-settings-actions">
            {!isNew && (
              <button
                className="button secondary"
                type="button"
                disabled={pending || dirty || !draft.credentialsConfigured}
                onClick={() => test.mutate()}
              >
                Bağlantıyı Test Et
              </button>
            )}
            <button className="button primary" disabled={pending || !dirty}>
              {save.isPending ? 'Kaydediliyor…' : `${item.shortName} Bilgilerini Kaydet`}
            </button>
            {isNew ? (
              <button className="button secondary" type="button" disabled={pending} onClick={onCancelNew}>
                Vazgeç
              </button>
            ) : (
              !draft.enabled && (
                <button
                  className="button secondary"
                  type="button"
                  disabled={pending}
                  onClick={() => remove.mutate()}
                  title="Banka ayarını listeden kaldır"
                >
                  <Trash2 size={15} /> Kaldır
                </button>
              )
            )}
          </div>
        )}
      </form>
    </section>
  );
}

export function NestpayGateways({ editable }: { editable: boolean }) {
  const query = useQuery({
    queryKey: ['nestpay-gateways'],
    queryFn: async () => (await api.get('/credit-sales/payment-settings/gateways')).data.data as GatewaysResponse,
  });
  const [selectedId, setSelectedId] = useState('');
  const [draftIds, setDraftIds] = useState<string[]>([]);

  const catalog = query.data?.catalog ?? [];
  const configured = query.data?.configured ?? [];
  const configuredSet = new Set(configured.map(item => item.provider));
  const availableToAdd = catalog.filter(item => !configuredSet.has(item.id) && !draftIds.includes(item.id));

  const addSelected = () => {
    const id = selectedId || availableToAdd[0]?.id;
    if (!id || draftIds.includes(id)) return;
    setDraftIds(prev => [...prev, id]);
    setSelectedId('');
  };

  return (
    <>
      {editable && availableToAdd.length > 0 && (
        <section className="credit-sales-card" aria-label="Yeni banka ekle">
          <div className="credit-sales-card-heading payment-provider-heading">
            <h2>Diğer Bankalar (Sanal POS Ekle)</h2>
          </div>
          <p className="credit-help">
            İş Bankası, Ziraat Bankası, Halkbank, TEB, Şekerbank, ING ve Anadolubank için NestPay (EST v3) altyapısını buradan ekleyebilirsiniz.
          </p>
          <div className="payment-settings-actions" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
            <div style={{ minWidth: 260, flex: '1 1 260px', maxWidth: 380 }}>
              <DropdownSelect
                label="Banka seçin"
                ariaLabel="Eklenecek banka"
                value={selectedId || availableToAdd[0]?.id || ''}
                onChange={setSelectedId}
                options={availableToAdd.map(bank => ({ value: bank.id, label: bank.name }))}
              />
            </div>
            <button className="button primary" type="button" onClick={addSelected}>
              <Plus size={16} /> Banka Ekle
            </button>
          </div>
        </section>
      )}
      <ErrorMessage error={query.error} />
      {draftIds.map(id => {
        const meta = catalog.find(bank => bank.id === id);
        if (!meta || configuredSet.has(id)) return null;
        return (
          <NestpayCard
            key={`draft-${id}`}
            editable={editable}
            isNew
            onCancelNew={() => setDraftIds(prev => prev.filter(v => v !== id))}
            item={{
              provider: meta.id,
              name: meta.name,
              shortName: meta.shortName,
              mode: 'production',
              credentialsConfigured: false,
              enabled: false,
              publicUrl: window.location.origin,
              testedAt: null,
              lastError: null,
              paymentAvailable: false,
            }}
          />
        );
      })}
      {configured.map(item => (
        <NestpayCard key={item.provider} editable={editable} item={item} />
      ))}
    </>
  );
}
