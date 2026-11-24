import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { X } from 'lucide-react';
import { api } from '../../services/api';
import { ErrorMessage } from '../management/shared';
import { DropdownSelect } from '../../components/DropdownSelect';

export type ConfiguredGateway = {
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

export type CatalogItem = { id: string; name: string; shortName: string; configured: boolean };
export type GatewaysResponse = { catalog: CatalogItem[]; configured: ConfiguredGateway[] };

export function NestpayCard({
  item,
  editable,
  isNew,
  activeProvider,
  onClose,
  onToast,
}: {
  item: ConfiguredGateway;
  editable: boolean;
  isNew?: boolean;
  activeProvider?: { id: string; name: string } | null;
  onClose: () => void;
  onToast: (text: string) => void;
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

  const pending = save.isPending || test.isPending;
  const changedMode = !isNew && draft.mode !== item.mode;
  const keysRequired = isNew || changedMode || !draft.credentialsConfigured;
  const hasUnsavedKeys = Boolean(clientId || storeKey || apiUser || apiPassword);
  const change = (patch: Partial<ConfiguredGateway>) => {
    setDraft(v => ({ ...v, ...patch }));
    setDirty(true);
    setMessage('');
  };

  const handleToggle = (next: boolean) => {
    if (!editable || pending) return;
    if (next) {
      if (activeProvider && activeProvider.id !== item.provider) {
        onToast(`Önce ${activeProvider.name} online ödemesini kapatın.`);
        return;
      }
      if (!draft.testedAt || changedMode || hasUnsavedKeys || isNew) {
        onToast('Online ödemeyi açmak için önce bilgileri kaydedip bağlantıyı test edin.');
        return;
      }
    }
    change({ enabled: next });
  };

  const handleClose = () => {
    if (draft.enabled || item.enabled) {
      onToast(`${item.shortName} kartını kaldırmadan önce online ödeme anahtarını kapatın.`);
      return;
    }
    onClose();
  };

  function submit(event: FormEvent) {
    event.preventDefault();
    save.mutate();
  }

  return (
    <section className="credit-sales-card" aria-label={item.name}>
      <div className="credit-sales-card-heading payment-provider-heading">
        <h2>{item.name}</h2>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <label className="integration-toggle">
            <span>{item.shortName} online ödeme</span>
            <input
              type="checkbox"
              role="switch"
              checked={draft.enabled}
              disabled={!editable || pending}
              onChange={e => handleToggle(e.target.checked)}
            />
            <i aria-hidden="true" />
          </label>
          {editable && (
            <button
              className="standard-modal-close"
              type="button"
              aria-label={`${item.name} kartını kapat`}
              title="Kartı kaldır"
              disabled={pending}
              onClick={handleClose}
            >
              <X size={18} />
            </button>
          )}
        </div>
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
          </div>
        )}
      </form>
    </section>
  );
}
