import { Trash2 } from "lucide-react";
import { DeleteModal } from "../../components/DeleteModal";
import { CreditSubscriptions } from './CreditSubscriptions';
import { CreditAlertChannels } from "./newCreditAlertChannels";
import { PeriodSelect } from "./PeriodSelect";
import { periodLabel } from "./types";
import { CreditOrders } from "./CreditOrders";
import { useSearchParams } from "react-router-dom";
import { MoneyInput } from "./MoneyInput";
import { currencyOptions, type Currency } from "./types";
import { useEffect, useState, type FormEvent } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  useIsMutating,
} from "@tanstack/react-query";
import { Coins, Plus, Pencil, X, ShoppingBag, Repeat } from "lucide-react";
import { api } from "../../services/api";
import { useAuth } from "../auth/Auth";
import { hasPermission } from "../auth/permissions";
import { DropdownSelect } from "../../components/DropdownSelect";
import { Heading, ErrorMessage } from "../management/shared";
import {
  count,
  money,
  type SalesCatalog,
  type SalesPlan,
  type SalesSettings,
} from "./types";
import "./credit-store.css";
const emptyPlan = {
  name: "",
  description: "",
  periodMonths: 1,
  periodDays: null,
  periodName: null,
  renewalRequested: false,
  price: "",
  credits: 100,
  active: false,
  currency: "TRY" as Currency,
};
export function CreditSalesPage() {
  const [params, setParams] = useSearchParams();
  const ordersVisible = params.get("view") === "orders";
  const subscriptionsVisible = params.get("view") === "subscriptions";
  const { user } = useAuth(),
    client = useQueryClient();
  const periodWrites = useIsMutating({ mutationKey: ["credit-sales-periods"] });
  const editable = hasPermission(user, "integrations.update");
  const query = useQuery({
    queryKey: ["credit-sales"],
    queryFn: async () =>
      (await api.get("/credit-sales")).data.data as SalesCatalog,
  });
  const [draft, setDraft] = useState<SalesSettings | null>(null),
    [dirty, setDirty] = useState(false);
  const [plan, setPlan] = useState<
    (Omit<SalesPlan, "id"> & { id?: string }) | null
  >(null);
  const [deleteTarget, setDeleteTarget] = useState<SalesPlan | null>(null);
  const [message, setMessage] = useState("");
  useEffect(() => {
    if (query.data && !dirty)
      setDraft({
        ...query.data.settings,
        alertsEnabled: query.data.settings.alertsEnabled ?? true,
        lowCreditPercent: query.data.settings.lowCreditPercent ?? 20,
        expiryNoticeDays: query.data.settings.expiryNoticeDays ?? 7,
        alertChannels: query.data.settings.alertChannels ?? ["IN_APP"],
        whatsappCreditTemplateName: query.data.settings.whatsappCreditTemplateName ?? "",
        whatsappCreditTemplateLanguage: query.data.settings.whatsappCreditTemplateLanguage ?? "tr",
      });
  }, [query.data, dirty]);
  const refresh = async () => {
    await Promise.all([
      client.invalidateQueries({ queryKey: ["credit-sales"] }),
      client.invalidateQueries({ queryKey: ["credit-store"] }),
    ]);
  };
  const save = useMutation({
    mutationFn: () =>
      api.put("/credit-sales/settings", {
        ...draft,
        unitPrice: draft!.unitPrice.replace(",", "."),
      }),
    onSuccess: async () => {
      setDirty(false);
      setMessage("Kredi satış ayarları kaydedildi.");
      await refresh();
    },
  });
  const savePlan = useMutation({
    mutationFn: () => {
      const { id, ...input } = plan!;
      const body = { ...input, price: input.price.replace(",", ".") };
      return id
        ? api.put("/credit-sales/plans/" + id, body)
        : api.post("/credit-sales/plans", body);
    },
    onSuccess: async () => {
      setPlan(null);
      setMessage("Abonelik planı kaydedildi.");
      await refresh();
    },
  });
  const removePlan = useMutation({
    mutationFn: (id: string) => api.delete('/credit-sales/plans/' + id),
    onSuccess: async (_, id) => {
      setDeleteTarget(null);
      setPlan(current => current?.id === id ? null : current);
      setMessage('Abonelik planı silindi.');
      await refresh();
    },
  });
  const planPending = savePlan.isPending || removePlan.isPending || periodWrites > 0;
  const editSetting = <K extends keyof SalesSettings>(
    key: K,
    value: SalesSettings[K],
  ) => {
    setDraft((current) => (current ? { ...current, [key]: value } : current));
    setDirty(true);
    setMessage("");
    save.reset();
  };
  const choosePlan = (value: typeof plan) => {
    if (periodWrites) return;
    setPlan(
      value
        ? {
            ...value,
            periodMonths: value.periodDays ? null : (value.periodMonths ?? 1),
            periodDays: value.periodDays ?? null,
            periodName: value.periodName ?? null,
            renewalRequested: value.renewalRequested ?? false,
          }
        : null,
    );
    setMessage("");
    savePlan.reset();
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    if (draft?.alertsEnabled && !(draft.alertChannels ?? ["IN_APP"]).length) return;
    save.mutate();
  }
  return (
    <main className="page credit-sales-page">
      <Heading
        title="Kredi ve Paket Ayarları"
        description="Kredi birim fiyatını ve müşterilerin göreceği abonelikleri yönetin."
      />
      <div className="integration-tabs credit-workspace-tabs" role="tablist" aria-label="Kredi ve paket sayfaları">
        <button type="button" role="tab" className={!ordersVisible && !subscriptionsVisible ? 'active' : ''} aria-selected={!ordersVisible && !subscriptionsVisible} onClick={() => setParams({})}><Coins size={17} />Kredi ve Paketler</button>
        <button type="button" role="tab" className={ordersVisible || subscriptionsVisible ? 'active' : ''} aria-selected={ordersVisible || subscriptionsVisible} onClick={() => setParams({ view: 'orders' })}><ShoppingBag size={17} />Siparişler ve Abonelikler</button>
      </div>
      {(ordersVisible || subscriptionsVisible) && <div className="integration-shell customer-billing-workspace"><div className="integration-subtabs" role="tablist" aria-label="Sipariş ve abonelik yönetimi">
        <button type="button" role="tab" className={ordersVisible ? 'active' : ''} aria-selected={ordersVisible} onClick={() => setParams({ view: 'orders' })}><ShoppingBag size={17} />Siparişler</button>
        <button type="button" role="tab" className={subscriptionsVisible ? 'active' : ''} aria-selected={subscriptionsVisible} onClick={() => setParams({ view: 'subscriptions' })}><Repeat size={17} />Abonelikler</button>
      </div>
      {ordersVisible && <CreditOrders admin />}
      {subscriptionsVisible && <CreditSubscriptions admin />}
      </div>}
      <div className="credit-sales-sections" hidden={ordersVisible || subscriptionsVisible}>

        {query.isPending && <p role="status">Ayarlar yükleniyor…</p>}
        <ErrorMessage error={query.error} />
        {draft && (
          <form className="credit-sales-card" onSubmit={submit}>
            <div className="credit-sales-card-heading">
              <h2>Kredi Satışı</h2>
              <SalesToggle
                label="Kredi satışını etkinleştir"
                text={draft.enabled ? "Satış açık" : "Satış kapalı"}
                checked={draft.enabled}
                disabled={!editable || save.isPending}
                onChange={(value) => editSetting("enabled", value)}
              />
            </div>
            <fieldset
              disabled={!editable || save.isPending}
              className="credit-fields credit-settings-fields"
            >
              <DropdownSelect
                label="Para birimi"
                ariaLabel="Kredi para birimi"
                value={draft.currency}
                onChange={(value) => editSetting("currency", value as Currency)}
                options={currencyOptions}
              />
              <label>
                <span>
                  1 kredi fiyatı (
                  {draft.currency === "TRY" ? "TL" : draft.currency}) *
                </span>
                <MoneyInput
                  required
                  value={draft.unitPrice}
                  onChange={(value) => editSetting("unitPrice", value)}
                />
              </label>
              <label>
                <span>Minimum kredi *</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="1000000"
                  step="1"
                  value={draft.minCredits}
                  onChange={(e) =>
                    editSetting("minCredits", Number(e.target.value))
                  }
                />
              </label>
              <label>
                <span>Maksimum kredi *</span>
                <input
                  required
                  type="number"
                  min={draft.minCredits}
                  max="1000000"
                  step="1"
                  value={draft.maxCredits}
                  onChange={(e) =>
                    editSetting("maxCredits", Number(e.target.value))
                  }
                />
              </label>
              <label>
                <span>Geçerlilik (gün) *</span>
                <input
                  required
                  type="number"
                  min="1"
                  max="3650"
                  step="1"
                  value={draft.validityDays}
                  onChange={(e) =>
                    editSetting("validityDays", Number(e.target.value))
                  }
                />
              </label>
            </fieldset>
            <section className="credit-notice-settings">
              <div className="credit-sales-card-heading">
                <h3>Kredi Bildirimleri</h3>
                <SalesToggle
                  label="Kredi bildirimlerini etkinleştir"
                  text="Bildirimler"
                  checked={draft.alertsEnabled}
                  disabled={!editable || save.isPending}
                  onChange={(value) => editSetting("alertsEnabled", value)}
                />
              </div>
              <CreditAlertChannels
                draft={draft}
                availability={query.data?.channelAvailability}
                disabled={!editable || save.isPending || !draft.alertsEnabled}
                onChange={editSetting}
              >
                <label>
                  <span>Kalan kredi eşiği (%)</span>
                  <input
                    type="number"
                    min="1"
                    max="100"
                    required
                    value={draft.lowCreditPercent}
                    onChange={(event) =>
                      editSetting(
                        "lowCreditPercent",
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
                <label>
                  <span>Bitişten kaç gün önce</span>
                  <input
                    type="number"
                    min="1"
                    max="365"
                    required
                    value={draft.expiryNoticeDays}
                    onChange={(event) =>
                      editSetting(
                        "expiryNoticeDays",
                        Number(event.target.value),
                      )
                    }
                  />
                </label>
              </CreditAlertChannels>
            </section>
            <ErrorMessage error={save.error} />
            <div className="credit-form-actions">
              <button
                className="button primary"
                disabled={!editable || save.isPending || !dirty || (draft.alertsEnabled && !(draft.alertChannels ?? ["IN_APP"]).length)}
              >
                {save.isPending ? "Kaydediliyor…" : "Ayarları Kaydet"}
              </button>
            </div>
          </form>
        )}
        <section className="credit-sales-card">
          <div className="credit-store-title">
            <div>
              <h2>Abonelik Planları</h2>
            </div>
            {editable && (
              <button
                className="button primary"
                type="button"
                disabled={planPending}
                onClick={() => choosePlan({ ...emptyPlan })}
              >
                <Plus size={16} />
                Plan Ekle
              </button>
            )}
          </div>
          {plan && (
            <form
              className="credit-plan-editor"
              onSubmit={(e) => {
                e.preventDefault();
                if (periodWrites) return;
                setMessage("");
                savePlan.mutate();
              }}
            >
              <div className="credit-store-title">
                <h3>{plan.id ? "Planı Düzenle" : "Yeni Abonelik Planı"}</h3>
                <button
                  className="standard-modal-close credit-plan-close"
                  type="button"
                  aria-label="Plan düzenlemeyi kapat"
                  disabled={planPending}
                  onClick={() => choosePlan(null)}
                >
                  <X size={18} />
                </button>
              </div>
              <fieldset
                disabled={!editable || planPending}
                className="credit-fields"
              >
                <label>
                  <span>Plan adı *</span>
                  <input
                    required
                    maxLength={100}
                    value={plan.name}
                    onChange={(e) => setPlan({ ...plan, name: e.target.value })}
                  />
                </label>
                <PeriodSelect
                  value={plan}
                  onChange={(terms) => setPlan({ ...plan, ...terms })}
                />
                <DropdownSelect
                  label="Para birimi"
                  ariaLabel="Plan para birimi"
                  value={plan.currency}
                  onChange={(value) =>
                    setPlan({ ...plan, currency: value as Currency })
                  }
                  options={currencyOptions}
                />
                <label>
                  <span>
                    Dönem fiyatı (
                    {plan.currency === "TRY" ? "TL" : plan.currency}) *
                  </span>
                  <MoneyInput
                    required
                    value={plan.price}
                    onChange={(value) => setPlan({ ...plan, price: value })}
                  />
                </label>
                <label>
                  <span>Dönem boyunca toplam kredi *</span>
                  <input
                    required
                    type="number"
                    min="1"
                    max="1000000"
                    step="1"
                    value={plan.credits}
                    onChange={(e) =>
                      setPlan({ ...plan, credits: Number(e.target.value) })
                    }
                  />
                </label>
                <label className="credit-wide">
                  <span>Açıklama</span>
                  <textarea
                    aria-label="Açıklama"
                    rows={3}
                    maxLength={1000}
                    value={plan.description}
                    onChange={(e) =>
                      setPlan({ ...plan, description: e.target.value })
                    }
                  />
                </label>
                <SalesToggle
                  label="Dönem sonunda tekrarla"
                  text="Dönem sonunda tekrarla"
                  checked={plan.renewalRequested ?? false}
                  disabled={!editable || planPending}
                  onChange={(value) =>
                    setPlan({ ...plan, renewalRequested: value })
                  }
                />
                <SalesToggle
                  label="Müşterilere göster"
                  text="Müşterilere göster"
                  checked={plan.active}
                  disabled={!editable || planPending}
                  onChange={(value) => setPlan({ ...plan, active: value })}
                />
              </fieldset>
              <p className="credit-help">
                Dönem kredisi devretmez; otomatik yenileme ve tahsilat yapılmaz.
              </p>
              <ErrorMessage error={savePlan.error} />
              <div className="credit-form-actions">
                <button
                  className="button secondary"
                  type="button"
                  disabled={planPending}
                  onClick={() => choosePlan(null)}
                >
                  Vazgeç
                </button>
                <button
                  className="button primary"
                  disabled={!editable || planPending}
                >
                  {planPending ? "Kaydediliyor…" : "Planı Kaydet"}
                </button>
              </div>
            </form>
          )}
          {deleteTarget && <DeleteModal title="Abonelik Planını Sil" pending={removePlan.isPending} onClose={() => setDeleteTarget(null)} onConfirm={() => removePlan.mutate(deleteTarget.id)} error={<ErrorMessage error={removePlan.error} />}><p><strong>{deleteTarget.name}</strong> silinecek. Mevcut siparişler, abonelikler ve alınmış krediler korunur.</p></DeleteModal>}
          <div className="credit-admin-plans">
            {query.data?.plans.map((item) => (
              <article key={item.id}>
                <Coins size={20} />
                <div>
                  <strong>{item.name}</strong>
                  <span>
                    {periodLabel(item)} · {count(item.credits)} kredi ·{" "}
                    {money(item.price, item.currency)}
                  </span>
                </div>
                <span
                  className={
                    "credit-plan-state" + (item.active ? " active" : "")
                  }
                >
                  {item.active ? "Görünür" : "Gizli"}
                </span>
                {editable && (
                  <button
                    className="button secondary"
                    type="button"
                    disabled={planPending}
                    onClick={() =>
                      choosePlan({
                        id: item.id,
                        name: item.name,
                        description: item.description,
                        periodMonths: item.periodMonths,
                        periodDays: item.periodDays ?? null,
                        periodName: item.periodName ?? null,
                        renewalRequested: item.renewalRequested ?? false,
                        price: item.price,
                        currency: item.currency,
                        credits: item.credits,
                        active: item.active,
                      })
                    }
                  >
                    <Pencil size={15} />
                    Düzenle
                  </button>
                )}
                {editable && <button className="icon-button danger-icon credit-plan-delete" type="button" aria-label={item.name + ' planını sil'} title="Planı Sil" disabled={planPending} onClick={() => { removePlan.reset(); setDeleteTarget(item); }}><Trash2 size={16} /></button>}
              </article>
            ))}
            {query.data && !query.data.plans.length && (
              <p>Henüz abonelik planı yok. Plan ekleyerek başlayabilirsiniz.</p>
            )}
          </div>
        </section>
        {message && (
          <p className="credit-success" role="status">
            {message}
          </p>
        )}
      </div>
    </main>
  );
}

function SalesToggle({
  label,
  text,
  checked,
  disabled,
  onChange,
}: {
  label: string;
  text: string;
  checked: boolean;
  disabled: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="integration-toggle credit-sales-toggle">
      <span>
        <strong>{text}</strong>
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-label={label}
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <i aria-hidden="true" />
    </label>
  );
}
