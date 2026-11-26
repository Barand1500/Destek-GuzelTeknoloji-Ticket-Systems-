import { useEffect, useState, type FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Pencil, Plus, RefreshCw, Trash2, X } from 'lucide-react';
import { api } from '../../services/api';
import { DropdownSelect } from '../../components/DropdownSelect';
import { ErrorMessage, Heading } from '../management/shared';
import { useAuth } from '../auth/Auth';
import { hasPermission } from '../auth/permissions';
import { currencyOptions, type Currency } from './types';
import './credit-store.css';

type RateType = 'ForexBuying' | 'ForexSelling' | 'BanknoteBuying' | 'BanknoteSelling';
type CurrencyRecord = {
  code: Currency;
  name: string;
  rateType: RateType;
  autoUpdate: boolean;
  rate: string;
  apiUrl: string;
  isActive: boolean;
  updatedAt?: string;
};

const DEFAULT_API_URL = 'https://www.tcmb.gov.tr/kurlar/today.xml';

const rateTypeOptions: { value: RateType; label: string }[] = [
  { value: 'ForexBuying', label: 'Döviz Alış' },
  { value: 'ForexSelling', label: 'Döviz Satış' },
  { value: 'BanknoteBuying', label: 'Efektif Alış' },
  { value: 'BanknoteSelling', label: 'Efektif Satış' },
];

const rateTypeLabel = (value: RateType) =>
  rateTypeOptions.find(option => option.value === value)?.label ?? value;

const defaultNameFor = (code: Currency) => {
  const found = currencyOptions.find(item => item.value === code)?.label ?? code;
  return found.replace(/\s*\([^)]*\)\s*$/, '');
};

export function CurrenciesPage() {
  const { user } = useAuth();
  const editable = hasPermission(user, 'integrations.update');
  const client = useQueryClient();
  const [search, setSearch] = useState('');
  const [modalMode, setModalMode] = useState<'create' | 'edit' | null>(null);
  const [draft, setDraft] = useState<CurrencyRecord | null>(null);
  const [toast, setToast] = useState('');

  const query = useQuery({
    queryKey: ['currencies'],
    queryFn: async () => (await api.get('/credit-sales/currencies')).data.data as CurrencyRecord[],
  });

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(''), 3500);
    return () => window.clearTimeout(timer);
  }, [toast]);

  useEffect(() => {
    if (!modalMode) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setModalMode(null);
        setDraft(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [modalMode]);

  const refreshCache = () =>
    Promise.all([
      client.invalidateQueries({ queryKey: ['currencies'] }),
      client.invalidateQueries({ queryKey: ['credit-store'] }),
    ]);

  const save = useMutation({
    mutationFn: (payload: CurrencyRecord) =>
      api.put('/credit-sales/currencies', {
        code: payload.code,
        name: payload.name,
        rateType: payload.rateType,
        autoUpdate: payload.autoUpdate,
        rate: payload.rate.replace(',', '.'),
        apiUrl: payload.apiUrl,
        isActive: payload.isActive,
      }),
    onSuccess: async () => {
      setModalMode(null);
      setDraft(null);
      setToast('Para birimi kaydedildi.');
      await refreshCache();
    },
  });

  const refreshRate = useMutation({
    mutationFn: (code: string) => api.post(`/credit-sales/currencies/${encodeURIComponent(code)}/refresh`),
    onSuccess: async (_, code) => {
      setToast(code === 'ALL' ? 'Tüm kurlar güncellendi.' : `${code} kuru güncellendi.`);
      await refreshCache();
    },
  });

  const remove = useMutation({
    mutationFn: (code: string) => api.delete(`/credit-sales/currencies/${encodeURIComponent(code)}`),
    onSuccess: async () => {
      setToast('Para birimi silindi.');
      await refreshCache();
    },
  });

  const rows = query.data ?? [];
  const existingCodes = new Set(rows.map(r => r.code));
  const addableOptions = currencyOptions.filter(opt => !existingCodes.has(opt.value as Currency));
  const filtered = search.trim()
    ? rows.filter(row =>
        `${row.name} ${row.code}`.toLocaleLowerCase('tr-TR').includes(search.trim().toLocaleLowerCase('tr-TR')),
      )
    : rows;

  const openCreate = () => {
    const first = (addableOptions[0]?.value as Currency | undefined) ?? 'USD';
    save.reset();
    setDraft({
      code: first,
      name: defaultNameFor(first),
      rateType: 'ForexSelling',
      autoUpdate: false,
      rate: '0.0000',
      apiUrl: DEFAULT_API_URL,
      isActive: true,
    });
    setModalMode('create');
  };

  const openEdit = (row: CurrencyRecord) => {
    save.reset();
    setDraft({ ...row, apiUrl: row.code === 'TRY' ? '' : row.apiUrl || DEFAULT_API_URL });
    setModalMode('edit');
  };

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (!draft || save.isPending) return;
    save.mutate(draft);
  };

  const busy = save.isPending || refreshRate.isPending || remove.isPending;

  return (
    <main className="page credit-sales-page">
      <div className="credit-store-title" style={{ marginBottom: 20 }}>
        <Heading
          title="Para Birimleri"
          description="Döviz kurlarını, kur tipini ve manuel / otomatik güncelleme ayarlarını yönetin."
        />
        {editable && (
          <div className="payment-settings-actions">
            <button
              className="button secondary"
              type="button"
              disabled={busy || rows.filter(r => r.code !== 'TRY').length === 0}
              onClick={() => refreshRate.mutate('ALL')}
            >
              <RefreshCw size={15} /> Kurları Güncelle
            </button>
            {addableOptions.length > 0 && (
              <button className="button primary" type="button" disabled={busy} onClick={openCreate}>
                <Plus size={16} /> Ekle
              </button>
            )}
          </div>
        )}
      </div>

        <div className="credit-orders-filters currency-search-toolbar">
          <label className="credit-orders-search">
            <span className="field-label">Ara</span>
            <input
              aria-label="Para birimi ara"
              maxLength={80}
              value={search}
              onChange={event => setSearch(event.target.value)}
            />
          </label>
        </div>

      <section className="credit-sales-card currency-list-card" aria-label="Para birimleri listesi">
        <ErrorMessage error={query.error || save.error || refreshRate.error || remove.error} />
        {query.isPending && <p role="status">Para birimleri yükleniyor…</p>}

        {!query.isPending && (
          <div className="management-table-wrap">
            <table className="management-table">
              <thead>
                <tr>
                  <th>Adı</th>
                  <th>Kısa Adı</th>
                  <th>Kur Tipi</th>
                  <th style={{ textAlign: 'right' }}>Kur (TL)</th>
                  <th>Oto Güncelleme</th>
                  <th>Durum</th>
                  {editable && <th style={{ textAlign: 'right' }}>İşlemler</th>}
                </tr>
              </thead>
              <tbody>
                {filtered.map(row => (
                  <tr key={row.code}>
                    <td><strong>{row.name}</strong></td>
                    <td>{row.code}</td>
                    <td>{row.code === 'TRY' ? '—' : rateTypeLabel(row.rateType)}</td>
                    <td style={{ textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>
                      <strong>{row.rate.replace('.', ',')}</strong>
                    </td>
                    <td>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}>
                        <span className={row.autoUpdate ? 'credit-order-status credit-order-status-paid' : 'badge status-CLOSED'}>
                          {row.autoUpdate ? 'Açık' : 'Kapalı'}
                        </span>
                        {editable && row.code !== 'TRY' && (
                          <button
                            className="icon-button"
                            type="button"
                            disabled={busy}
                            title={`${row.code} kurunu API'den şimdi güncelle`}
                            aria-label={`${row.code} kurunu güncelle`}
                            onClick={() => refreshRate.mutate(row.code)}
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="status-toggle">
                        <label className="switch">
                          <input type="checkbox" role="switch" aria-label={`${row.name} aktif`} checked={row.isActive} disabled={!editable || busy || row.code === 'TRY'} onChange={() => save.mutate({ ...row, isActive: !row.isActive })} />
                          <span aria-hidden="true" />
                        </label>
                        <span>{row.isActive ? 'Aktif' : 'Pasif'}</span>
                      </div>
                    </td>
                    {editable && (
                      <td style={{ textAlign: 'right' }}>
                        <div className="management-actions" style={{ justifyContent: 'flex-end' }}>
                          <button
                            className="icon-button"
                            type="button"
                            disabled={busy}
                            title="Düzenle"
                            aria-label={`${row.name} düzenle`}
                            onClick={() => openEdit(row)}
                          >
                            <Pencil size={15} />
                          </button>
                          {row.code !== 'TRY' && (
                            <button
                              className="icon-button danger-icon"
                              type="button"
                              disabled={busy}
                              title="Sil"
                              aria-label={`${row.name} sil`}
                              onClick={() => remove.mutate(row.code)}
                            >
                              <Trash2 size={15} />
                            </button>
                          )}
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {!filtered.length && (
                  <tr>
                    <td colSpan={editable ? 7 : 6} className="muted">
                      Eşleşen para birimi bulunamadı.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {modalMode && draft && createPortal(
        <div
          className="customer-file-modal-backdrop credit-sales-page"
          role="presentation"
          onMouseDown={() => { if (!save.isPending) { setModalMode(null); setDraft(null); } }}
        >
          <section
            className="customer-file-modal currency-modal"
            role="dialog"
            aria-modal="true"
            aria-label={modalMode === 'create' ? 'Para Birimi Ekle' : 'Para Birimi Düzenle'}
            onMouseDown={event => event.stopPropagation()}
          >
            <header className="customer-file-modal-header">
              <h3>{modalMode === 'create' ? 'Para Birimi Ekle' : `Para Birimi Düzenle (${draft.code})`}</h3>
              <button
                className="icon-button"
                type="button"
                aria-label="Kapat"
                disabled={save.isPending}
                onClick={() => { setModalMode(null); setDraft(null); }}
              >
                <X size={18} />
              </button>
            </header>
            <form className="currency-modal-form" onSubmit={submit}>
              <fieldset className="credit-fields" disabled={save.isPending} style={{ marginTop: 6 }}>
                {modalMode === 'create' ? (
                  <DropdownSelect
                    label="Kısa Adı *"
                    ariaLabel="Para birimi kodu"
                    value={draft.code}
                    onChange={value => {
                      const code = value as Currency;
                      setDraft(prev => prev ? { ...prev, code, name: defaultNameFor(code) } : prev);
                    }}
                    options={addableOptions}
                  />
                ) : (
                  <label>
                    <span>Kısa Adı *</span>
                    <input value={draft.code} readOnly disabled />
                  </label>
                )}
                <label>
                  <span>Adı *</span>
                  <input
                    required
                    maxLength={80}
                    value={draft.name}
                    onChange={e => setDraft(prev => prev ? { ...prev, name: e.target.value } : prev)}
                  />
                </label>
                {draft.code !== 'TRY' && (
                  <>
                    <DropdownSelect
                      label="Kur Tipi *"
                      ariaLabel="Kur tipi"
                      value={draft.rateType}
                      onChange={value => setDraft(prev => prev ? { ...prev, rateType: value as RateType } : prev)}
                      options={rateTypeOptions}
                    />
                    <label>
                      <span>Kur (TL) *</span>
                      <input
                        required
                        inputMode="decimal"
                        value={draft.rate}
                        onChange={e => setDraft(prev => prev ? { ...prev, rate: e.target.value } : prev)}
                        placeholder="Örn: 51.0000"
                      />
                    </label>
                    <label className="credit-wide">
                      <span>API URL</span>
                      <input
                        type="url"
                        maxLength={500}
                        value={draft.apiUrl}
                        onChange={e => setDraft(prev => prev ? { ...prev, apiUrl: e.target.value } : prev)}
                        placeholder={DEFAULT_API_URL}
                      />
                    </label>
                    <div className="credit-wide currency-modal-toggles">
                      <label className="integration-toggle">
                        <span>Oto Güncelleme (kapalıysa elle girilen kur kullanılır)</span>
                        <input
                          type="checkbox"
                          role="switch"
                          checked={draft.autoUpdate}
                          onChange={e => setDraft(prev => prev ? { ...prev, autoUpdate: e.target.checked } : prev)}
                        />
                        <i aria-hidden="true" />
                      </label>
                      <label className="integration-toggle">
                        <span>Durum: {draft.isActive ? 'Aktif' : 'Pasif'}</span>
                        <input
                          type="checkbox"
                          role="switch"
                          checked={draft.isActive}
                          onChange={e => setDraft(prev => prev ? { ...prev, isActive: e.target.checked } : prev)}
                        />
                        <i aria-hidden="true" />
                      </label>
                    </div>
                  </>
                )}
              </fieldset>
              <ErrorMessage error={save.error} />
              <div className="currency-modal-footer">
                <button className="button primary" type="submit" disabled={save.isPending}>
                  {save.isPending ? 'Kaydediliyor…' : 'Kaydet'}
                </button>
              </div>
            </form>
          </section>
        </div>,
        document.body,
      )}

      {toast && createPortal(<div className="management-toast" role="status">{toast}</div>, document.body)}
    </main>
  );
}
