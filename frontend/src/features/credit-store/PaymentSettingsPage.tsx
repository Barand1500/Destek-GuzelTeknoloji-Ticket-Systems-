import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { useQuery } from '@tanstack/react-query';
import { Plus } from 'lucide-react';
import { api } from '../../services/api';
import { PaymentSettings } from './PaymentSettings';
import { AkbankSettings } from './AkbankSettings';
import { NestpayCard, type GatewaysResponse } from './NestpayGateways';
import { DropdownSelect } from '../../components/DropdownSelect';
import { ErrorMessage, Heading } from '../management/shared';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import './credit-store.css';

const STORAGE_KEY = 'payment-settings-visible-gateways-v1';

function loadVisible(): string[] {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return ['akbank', 'iyzico'];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : ['akbank', 'iyzico'];
  } catch {
    return ['akbank', 'iyzico'];
  }
}

export function PaymentSettingsPage() {
  const { user } = useAuth();
  const editable = hasPermission(user, 'integrations.update');
  const [visibleIds, setVisibleIds] = useState<string[]>(loadVisible);
  const [selectedId, setSelectedId] = useState('');
  const [toast, setToast] = useState('');

  const akbankQuery = useQuery({
    queryKey: ['akbank-settings'],
    queryFn: async () => (await api.get('/credit-sales/payment-settings/akbank')).data.data as { enabled: boolean },
  });
  const iyzicoQuery = useQuery({
    queryKey: ['payment-settings'],
    queryFn: async () => (await api.get('/credit-sales/payment-settings')).data.data as { enabled: boolean },
  });
  const nestpayQuery = useQuery({
    queryKey: ['nestpay-gateways'],
    queryFn: async () => (await api.get('/credit-sales/payment-settings/gateways')).data.data as GatewaysResponse,
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(visibleIds));
    } catch { /* ignore storage quota errors */ }
  }, [visibleIds]);

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 4000);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Keep any currently enabled gateway visible so an active POS can never be hidden.
  useEffect(() => {
    const activeIds: string[] = [];
    if (akbankQuery.data?.enabled) activeIds.push('akbank');
    if (iyzicoQuery.data?.enabled) activeIds.push('iyzico');
    for (const item of nestpayQuery.data?.configured ?? []) {
      if (item.enabled) activeIds.push(item.provider);
    }
    if (activeIds.some(id => !visibleIds.includes(id))) {
      setVisibleIds(prev => [...new Set([...prev, ...activeIds])]);
    }
  }, [akbankQuery.data?.enabled, iyzicoQuery.data?.enabled, nestpayQuery.data?.configured, visibleIds]);

  const catalog = nestpayQuery.data?.catalog ?? [];
  const configuredMap = new Map((nestpayQuery.data?.configured ?? []).map(item => [item.provider, item]));

  const activeProvider: { id: string; name: string } | null = akbankQuery.data?.enabled
    ? { id: 'akbank', name: 'Akbank' }
    : iyzicoQuery.data?.enabled
      ? { id: 'iyzico', name: 'iyzico' }
      : (() => {
          const active = (nestpayQuery.data?.configured ?? []).find(item => item.enabled);
          return active ? { id: active.provider, name: active.shortName } : null;
        })();

  const allProviders = [
    { id: 'akbank', name: 'Akbank Sanal POS' },
    { id: 'iyzico', name: 'iyzico' },
    ...catalog.map(bank => ({ id: bank.id, name: bank.name })),
  ];
  const hiddenProviders = allProviders.filter(item => !visibleIds.includes(item.id));

  const addGateway = () => {
    const id = selectedId || hiddenProviders[0]?.id;
    if (!id || visibleIds.includes(id)) return;
    setVisibleIds(prev => [...prev, id]);
    setSelectedId('');
  };

  const hideGateway = (id: string) => {
    setVisibleIds(prev => prev.filter(item => item !== id));
  };

  return (
    <main className="page credit-sales-page">
      <Heading title="Ödeme Ayarları" description="Ödeme sağlayıcısını, bağlantı bilgilerini yönetin." />
      <div className="credit-sales-sections">
        {editable && hiddenProviders.length > 0 && (
          <section className="credit-sales-card" aria-label="Banka veya ödeme sağlayıcısı ekle">
            <div className="credit-sales-card-heading payment-provider-heading">
              <h2>Banka / Sanal POS Ekle</h2>
            </div>
            <p className="credit-help">
              Kullanmak istediğiniz banka veya ödeme sağlayıcısını seçip ekleyebilir, kullanmadığınız kartları sağ üstteki X ile gizleyebilirsiniz.
            </p>
            <div className="payment-settings-actions" style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}>
              <div style={{ minWidth: 260, flex: '1 1 260px', maxWidth: 380 }}>
                <DropdownSelect
                  label="Sağlayıcı seçin"
                  ariaLabel="Eklenecek ödeme sağlayıcısı"
                  value={selectedId && hiddenProviders.some(p => p.id === selectedId) ? selectedId : hiddenProviders[0]?.id || ''}
                  onChange={setSelectedId}
                  options={hiddenProviders.map(bank => ({ value: bank.id, label: bank.name }))}
                />
              </div>
              <button className="button primary" type="button" onClick={addGateway}>
                <Plus size={16} /> Banka Ekle
              </button>
            </div>
          </section>
        )}
        <ErrorMessage error={nestpayQuery.error} />
        {visibleIds.includes('akbank') && (
          <AkbankSettings
            editable={editable}
            activeProvider={activeProvider}
            onClose={() => hideGateway('akbank')}
            onToast={setToast}
          />
        )}
        {visibleIds.includes('iyzico') && (
          <PaymentSettings
            editable={editable}
            activeProvider={activeProvider}
            onClose={() => hideGateway('iyzico')}
            onToast={setToast}
          />
        )}
        {visibleIds
          .filter(id => id !== 'akbank' && id !== 'iyzico')
          .map(id => {
            const existing = configuredMap.get(id);
            const meta = catalog.find(bank => bank.id === id);
            if (!existing && !meta) return null;
            return (
              <NestpayCard
                key={id}
                editable={editable}
                isNew={!existing}
                activeProvider={activeProvider}
                onClose={() => hideGateway(id)}
                onToast={setToast}
                item={
                  existing ?? {
                    provider: meta!.id,
                    name: meta!.name,
                    shortName: meta!.shortName,
                    mode: 'production',
                    credentialsConfigured: false,
                    enabled: false,
                    publicUrl: window.location.origin,
                    testedAt: null,
                    lastError: null,
                    paymentAvailable: false,
                  }
                }
              />
            );
          })}
      </div>
      {toast && createPortal(<div className="management-toast" role="alert">{toast}</div>, document.body)}
    </main>
  );
}
