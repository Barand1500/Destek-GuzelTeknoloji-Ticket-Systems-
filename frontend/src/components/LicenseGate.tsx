import { useEffect, useState, type ReactNode } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { RefreshCw, ShieldAlert } from 'lucide-react';
import { api, errorText } from '../services/api';

export type LicenseStatusResponse = {
  enabled: boolean;
  valid: boolean;
  reason: string;
  message: string;
  companyName: string | null;
  packageName: string | null;
  productName: string | null;
  domain: string | null;
  startsAt: string | null;
  expiresAt: string | null;
  checkedAt: string;
  graceMode: boolean;
};

function formatDate(value: string | null | undefined) {
  if (!value) return null;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Intl.DateTimeFormat('tr-TR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(parsed);
}

const reasonLabels: Record<string, string> = {
  NOT_CONFIGURED: 'Lisans Yapılandırılmamış',
  API_KEY_INVALID: 'Servis Anahtarı Geçersiz',
  SERVICE_DISABLED: 'Lisans Servisi Kapalı',
  NO_ACTIVE_LICENSE: 'Aktif Lisans Bulunamadı',
  KEY_MISMATCH: 'Lisans Anahtarı Uyuşmazlığı',
  SERVER_UNREACHABLE: 'Lisans Sunucusuna Ulaşılamadı',
  INVALID: 'Lisans Geçersiz',
};

export function LicenseGate({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const [refreshError, setRefreshError] = useState('');

  const licenseQuery = useQuery({
    queryKey: ['/public/license'],
    queryFn: async () =>
      (await api.get<{ data: LicenseStatusResponse }>('/public/license')).data.data,
    staleTime: 60_000,
    retry: 1,
  });

  useEffect(() => {
    const onLicenseInvalid = (event: Event) => {
      const detail = (event as CustomEvent<LicenseStatusResponse | undefined>).detail;
      if (detail && typeof detail === 'object' && 'valid' in detail) {
        queryClient.setQueryData(['/public/license'], detail);
      } else {
        void queryClient.invalidateQueries({ queryKey: ['/public/license'] });
      }
    };
    window.addEventListener('license-invalid', onLicenseInvalid);
    return () => window.removeEventListener('license-invalid', onLicenseInvalid);
  }, [queryClient]);

  const refreshMutation = useMutation({
    mutationFn: async () =>
      (await api.post<{ data: LicenseStatusResponse }>('/public/license/refresh')).data.data,
    onSuccess: (status) => {
      setRefreshError('');
      queryClient.setQueryData(['/public/license'], status);
    },
    onError: (err) => {
      setRefreshError(errorText(err));
    },
  });

  const status = licenseQuery.data;
  const isDark =
    typeof window !== 'undefined' &&
    window.localStorage.getItem('helpdesk-theme') === 'dark';

  if (licenseQuery.isLoading) {
    return (
      <div
        className="loading-screen"
        data-theme={isDark ? 'dark' : 'light'}
        style={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        Lisans kontrol ediliyor…
      </div>
    );
  }

  if (!status || !status.enabled || status.valid) {
    return <>{children}</>;
  }

  const expiresFormatted = formatDate(status.expiresAt);
  const checkedFormatted = formatDate(status.checkedAt);
  const badgeLabel = reasonLabels[status.reason] ?? 'Lisans Hatası';

  return (
    <div
      data-theme={isDark ? 'dark' : 'light'}
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '24px',
        background: isDark ? '#0b1220' : '#f1f5f9',
        color: isDark ? '#e2e8f0' : '#0f172a',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: '520px',
          borderRadius: '16px',
          padding: '28px',
          background: isDark ? '#111b2b' : '#ffffff',
          border: `1px solid ${isDark ? '#243247' : '#e2e8f0'}`,
          boxShadow: isDark
            ? '0 20px 50px rgba(0, 0, 0, 0.45)'
            : '0 20px 45px rgba(15, 23, 42, 0.08)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
          <div
            style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              background: isDark ? 'rgba(239, 68, 68, 0.16)' : '#fee2e2',
              color: isDark ? '#f87171' : '#dc2626',
              flexShrink: 0,
            }}
          >
            <ShieldAlert size={22} />
          </div>
          <div>
            <h1 style={{ margin: 0, fontSize: '1.15rem', fontWeight: 700 }}>
              Lisans Doğrulaması Gerekli
            </h1>
            <span
              style={{
                display: 'inline-block',
                marginTop: '4px',
                fontSize: '0.78rem',
                fontWeight: 600,
                padding: '2px 8px',
                borderRadius: '999px',
                background: isDark ? 'rgba(239, 68, 68, 0.14)' : '#fef2f2',
                color: isDark ? '#fca5a5' : '#b91c1c',
                border: `1px solid ${isDark ? 'rgba(248, 113, 113, 0.25)' : '#fecaca'}`,
              }}
            >
              {badgeLabel}
            </span>
          </div>
        </div>

        <p
          style={{
            margin: '0 0 18px 0',
            fontSize: '0.94rem',
            lineHeight: 1.55,
            color: isDark ? '#cbd5e1' : '#475569',
          }}
        >
          {status.message}
        </p>

        {(status.companyName || status.packageName || status.productName || status.domain || expiresFormatted) && (
          <div
            style={{
              borderRadius: '10px',
              padding: '12px 14px',
              marginBottom: '18px',
              background: isDark ? '#0f172a' : '#f8fafc',
              border: `1px solid ${isDark ? '#1e293b' : '#e2e8f0'}`,
              display: 'grid',
              gap: '6px',
              fontSize: '0.86rem',
            }}
          >
            {status.companyName && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Firma</span>
                <strong>{status.companyName}</strong>
              </div>
            )}
            {status.productName && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Ürün</span>
                <strong>{status.productName}</strong>
              </div>
            )}
            {status.packageName && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Paket</span>
                <strong>{status.packageName}</strong>
              </div>
            )}
            {status.domain && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Alan Adı</span>
                <strong>{status.domain}</strong>
              </div>
            )}
            {expiresFormatted && (
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: '12px' }}>
                <span style={{ color: isDark ? '#94a3b8' : '#64748b' }}>Bitiş Tarihi</span>
                <strong>{expiresFormatted}</strong>
              </div>
            )}
          </div>
        )}

        {refreshError && (
          <p
            style={{
              margin: '0 0 14px 0',
              fontSize: '0.84rem',
              color: isDark ? '#f87171' : '#dc2626',
            }}
          >
            {refreshError}
          </p>
        )}

        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: '12px',
            flexWrap: 'wrap',
          }}
        >
          <span style={{ fontSize: '0.78rem', color: isDark ? '#94a3b8' : '#64748b' }}>
            {checkedFormatted ? `Son kontrol: ${checkedFormatted}` : ''}
          </span>
          <button
            type="button"
            className="primary"
            disabled={refreshMutation.isPending}
            onClick={() => refreshMutation.mutate()}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '8px',
              padding: '10px 16px',
              borderRadius: '10px',
              border: 'none',
              background: '#0284c7',
              color: '#ffffff',
              fontWeight: 600,
              fontSize: '0.88rem',
              cursor: refreshMutation.isPending ? 'not-allowed' : 'pointer',
              opacity: refreshMutation.isPending ? 0.7 : 1,
            }}
          >
            <RefreshCw size={16} />
            {refreshMutation.isPending ? 'Kontrol ediliyor…' : 'Lisansı Tekrar Kontrol Et'}
          </button>
        </div>
      </div>
    </div>
  );
}
