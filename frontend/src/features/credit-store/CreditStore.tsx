import { normalizeCreditEntry, formatCreditEntry } from "./number-format";
import { Link, useNavigate } from "react-router-dom";
import { MoneyInput } from "./MoneyInput";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Coins, CalendarDays, ArrowRight, Info } from "lucide-react";
import { api } from "../../services/api";
import { ErrorMessage } from "../management/shared";
import {
  periodLabel,
  money,
  count,
  type SalesCatalog,
  type Quote,
} from "./types";
import "./credit-store.css";

type Selection =
  | { amount: string }
  | { credits: number }
  | { planId: string; renewalRequested: boolean };
type Preview = Quote & { selection: Selection; requestKey: string };
export function CustomerCreditStore() {
  const client = useQueryClient();
  const navigate = useNavigate();
  const catalog = useQuery({
    queryKey: ["credit-store"],
    queryFn: async () =>
      (await api.get("/my/credit-store")).data.data as SalesCatalog,
  });
  const [tab, setTab] = useState<"credits" | "plans">("credits");
  const [amount, setAmount] = useState(""),
    [credits, setCredits] = useState(""),
    [source, setSource] = useState<"amount" | "credits">("credits");
  const [creditsFocused, setCreditsFocused] = useState(false);
  const [renewalChoices, setRenewalChoices] = useState<Record<string, boolean>>(
    {},
  );
  const [preview, setPreview] = useState<Preview | null>(null);
  const previewRef = useRef<HTMLDivElement>(null);
  const catalogVersion = JSON.stringify(catalog.data);
  const quote = useMutation({
    mutationFn: async (
      input:
        | { amount: string }
        | { credits: number }
        | { planId: string; renewalRequested: boolean },
    ) => (await api.post("/my/credit-store/quote", input)).data.data as Quote,
    onSuccess: (value, selection) => {
      create.reset();
      setPreview({ ...value, selection, requestKey: crypto.randomUUID() });
      requestAnimationFrame(() => previewRef.current?.focus());
    },
  });
  const create = useMutation({
    mutationFn: async (value: Preview) =>
      (
        await api.post("/my/credit-store/orders", {
          selection: value.selection,
          quoteKey: value.quoteKey,
          requestKey: value.requestKey,
        })
      ).data.data as { id: string; number: number },
    onSuccess: async (created) => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["/my/credit-store/orders"] }),
        client.invalidateQueries({ queryKey: ["notifications"] }),
        client.invalidateQueries({ queryKey: ["/notifications"] }),
      ]);
      navigate(`/customer/agreements?view=checkout&orderId=${encodeURIComponent(created.id)}`);
    },
  });
  useEffect(() => {
    setPreview(null);
    quote.reset();
  }, [catalogVersion]);
  useEffect(() => {
    setAmount("");
    setCredits("");
    setPreview(null);
  }, [catalog.data?.settings.unitPrice, catalog.data?.settings.currency]);
  const data = catalog.data;
  const priceMinor = Math.round(Number(data?.settings.unitPrice ?? 0) * 100);
  const reset = () => {
    setPreview(null);
    quote.reset();
    create.reset();
  };
  const changeCredits = (value: string) => {
    reset();
    setSource("credits");
    setCredits(value);
    setAmount(
      /^\d+$/.test(value)
        ? ((Number(value) * priceMinor) / 100).toFixed(2)
        : "",
    );
  };
  const changeAmount = (value: string) => {
    reset();
    setSource("amount");
    setAmount(value);
    const normalized = value.replace(",", ".");
    const minor = /^\d+(\.\d{0,2})?$/.test(normalized)
      ? Math.round(Number(normalized) * 100)
      : NaN;
    setCredits(
      priceMinor > 0 && Number.isSafeInteger(minor) && minor % priceMinor === 0
        ? String(minor / priceMinor)
        : "",
    );
  };
  function submit(event: FormEvent) {
    event.preventDefault();
    setPreview(null);
    quote.mutate(
      source === "amount"
        ? { amount: amount.replace(",", ".") }
        : { credits: Number(credits) },
    );
  }
  return (
    <section className="credit-store" aria-label="Kredi ve abonelik satın alma">
      <div className="credit-store-title">
        <button
          className="button secondary"
          type="button"
          disabled={create.isPending || quote.isPending || catalog.isFetching}
          onClick={() => void catalog.refetch()}
        >
          Fiyatları Yenile
        </button>
        <div>
          <h2>Kredi ve Abonelikler</h2>
          <p>
            İhtiyacınız kadar kredi seçin veya düzenli destek planlarını
            inceleyin.
          </p>
        </div>
      </div>
      {catalog.isPending && <p role="status">Paketler yükleniyor…</p>}
      <ErrorMessage error={catalog.error} />
      {create.isSuccess && (
        <p role="status" className="credit-success">
          #{create.data.number} numaralı siparişiniz kaydedildi.{" "}
          <Link to="/customer/agreements?view=orders">Siparişlerime Git</Link>
          {" · "}<Link to={`/customer/agreements?view=checkout&orderId=${encodeURIComponent(create.data.id)}`}>Ödemeye Geç</Link>
        </p>
      )}
      {data && (
        <>
          <div className="credit-store-owner">
            <Coins size={18} />
            <span>
              {data.owner?.isCompany ? "Şirket hesabı" : "Müşteri hesabı"}:{" "}
              <strong>{data.owner?.company || data.owner?.name}</strong>
            </span>
          </div>
          {!data.settings.enabled ? (
            <p className="credit-store-notice" role="status">
              Kredi ve abonelik satışı şu anda kapalı.
            </p>
          ) : (
            <>
              <div className="credit-store-tabs" aria-label="Satın alma türü">
                {(["credits", "plans"] as const).map((value) => (
                  <button
                    type="button"
                    key={value}
                    aria-pressed={tab === value}
                    disabled={quote.isPending || create.isPending}
                    className={tab === value ? "active" : ""}
                    onClick={() => {
                      setTab(value);
                      reset();
                    }}
                  >
                    {value === "credits" ? "Kredi Yükle" : "Abonelikler"}
                  </button>
                ))}
              </div>
              {tab === "credits" ? (
                <div className="credit-purchase-grid">
                  <form className="credit-sales-card" onSubmit={submit}>
                    <div className="credit-card-heading">
                      <Coins size={22} />
                      <h3>İhtiyacınız kadar kredi</h3>
                    </div>
                    <p>
                      Tutarı veya kredi sayısını girin. Diğer alan otomatik
                      hesaplanır.
                    </p>
                    <fieldset
                      disabled={quote.isPending || create.isPending}
                      className="credit-fields"
                    >
                      <label>
                        <span>Kredi sayısı</span>
                        <input
                          inputMode="numeric"
                          value={
                            creditsFocused
                              ? credits
                              : formatCreditEntry(credits)
                          }
                          onFocus={() => setCreditsFocused(true)}
                          onBlur={() => setCreditsFocused(false)}
                          onChange={(e) => {
                            const value = normalizeCreditEntry(e.target.value);
                            if (value !== null) changeCredits(value);
                          }}
                          placeholder="Örn. 100"
                          aria-label="Satın alınacak kredi sayısı"
                        />
                      </label>
                      <label>
                        <span>
                          Tutar (
                          {data.settings.currency === "TRY"
                            ? "TL"
                            : data.settings.currency}
                          )
                        </span>
                        <MoneyInput
                          value={amount}
                          onChange={changeAmount}
                          placeholder="Örn. 500,00"
                          ariaLabel="Kredi için ödenecek tutar"
                        />
                      </label>
                    </fieldset>
                    <p className="credit-help">
                      {count(data.settings.minCredits)}–
                      {count(data.settings.maxCredits)} tam kredi alınabilir.
                      Tutar, birim fiyatın katı olmalıdır.
                    </p>
                    <button
                      className="button primary"
                      disabled={
                        quote.isPending ||
                        create.isPending ||
                        (!credits && !amount)
                      }
                    >
                      {quote.isPending ? "Hesaplanıyor…" : "Özeti Gör"}
                      <ArrowRight size={16} />
                    </button>
                  </form>
                  <aside className="credit-sales-card credit-purchase-info">
                    <span className="credit-kicker">BİRİM FİYAT</span>
                    <div className="credit-price">
                      {money(data.settings.unitPrice, data.settings.currency)}
                      <small>/ kredi</small>
                    </div>
                    <div className="credit-rule">
                      <CalendarDays size={18} />
                      <span>
                        Satın alma tarihinden itibaren{" "}
                        <strong>{data.settings.validityDays} gün</strong>{" "}
                        geçerli.
                      </span>
                    </div>
                    <p>
                      Ay sonunda sıfırlanmaz. Geçerlilik süresi sona erene kadar
                      kullanılabilir.
                    </p>
                    <p>
                      Kredi, yukarıdaki{" "}
                      {data.owner?.isCompany ? "şirket" : "müşteri"} hesabına
                      tanımlanır.
                    </p>
                  </aside>
                </div>
              ) : (
                <div className="credit-plan-grid">
                  {data.plans.length ? (
                    data.plans.map((plan) => (
                      <article
                        className="credit-sales-card credit-plan-card"
                        key={plan.id}
                      >
                        <span className="credit-kicker">
                          {periodLabel(plan)} DESTEK
                        </span>
                        <h3>{plan.name}</h3>
                        <p className="credit-plan-description">
                          {plan.description ||
                            "Destek ihtiyaçlarınız için dönemlik kredi planı."}
                        </p>
                        <div className="credit-price">
                          {money(plan.price, plan.currency)}
                          <small>/ {periodLabel(plan)}</small>
                        </div>
                        <strong>{count(plan.credits)} kredi / dönem</strong>
                        <p>
                          {periodLabel(plan)} boyunca toplam{" "}
                          {count(plan.credits)} kredi. Dönem sonunda kalan kredi
                          sona erer, devretmez.
                        </p>
                        <label className="integration-toggle credit-sales-toggle credit-renewal-choice">
                          <span>
                            <strong>{"D\u00f6nem sonunda tekrarla"}</strong>
                          </span>
                          <input
                            type="checkbox"
                            role="switch"
                            aria-label={plan.name + " dönem sonunda tekrarla"}
                            checked={
                              renewalChoices[plan.id] ??
                              plan.renewalRequested ??
                              false
                            }
                            onChange={(event) => {
                              reset();
                              setRenewalChoices((current) => ({
                                ...current,
                                [plan.id]: event.target.checked,
                              }));
                            }}
                          />
                          <i aria-hidden="true" />
                        </label>
                        <p className="credit-help">
                          Tercihiniz kaydedilir. Ödeme entegrasyonu tamamlanana
                          kadar otomatik yenileme veya tahsilat yapılmaz.
                        </p>
                        <button
                          className="button primary"
                          type="button"
                          disabled={quote.isPending || create.isPending}
                          onClick={() => {
                            setPreview(null);
                            quote.mutate({
                              planId: plan.id,
                              renewalRequested:
                                renewalChoices[plan.id] ??
                                plan.renewalRequested ??
                                false,
                            });
                          }}
                        >
                          Planı İncele
                          <ArrowRight size={16} />
                        </button>
                      </article>
                    ))
                  ) : (
                    <p>Henüz satışa açık abonelik planı bulunmuyor.</p>
                  )}
                </div>
              )}
              <ErrorMessage error={quote.error} />
              {preview && (
                <div
                  className="credit-sales-card credit-quote"
                  tabIndex={-1}
                  ref={previewRef}
                >
                  <h3>Satın Alma Özeti</h3>
                  <dl>
                    <div>
                      <dt>Paket</dt>
                      <dd>{preview.name}</dd>
                    </div>
                    <div>
                      <dt>Hesap</dt>
                      <dd>{preview.owner.company || preview.owner.name}</dd>
                    </div>
                    <div>
                      <dt>Kredi</dt>
                      <dd>{count(preview.credits)}</dd>
                    </div>
                    <div>
                      <dt>Geçerlilik</dt>
                      <dd>
                        {"planId" in preview.selection
                          ? periodLabel({
                              ...preview,
                              periodDays: preview.validityDays,
                            })
                          : preview.validityDays
                            ? preview.validityDays + " gün"
                            : periodLabel(preview)}
                      </dd>
                    </div>
                    {"planId" in preview.selection && (
                      <div>
                        <dt>Dönem sonunda tekrarla</dt>
                        <dd>
                          <label className="integration-toggle credit-sales-toggle">
                            <span>
                              <strong>
                                {preview.renewalRequested
                                  ? "Evet"
                                  : "Hay\u0131r"}
                              </strong>
                            </span>
                            <input
                              type="checkbox"
                              role="switch"
                              aria-label="Özette dönem sonunda tekrarla"
                              checked={
                                preview.renewalRequested ??
                                preview.selection.renewalRequested
                              }
                              disabled={
                                quote.isPending ||
                                create.isPending ||
                                create.isSuccess
                              }
                              onChange={(event) => {
                                if ("planId" in preview.selection) {
                                  const selection = {
                                    ...preview.selection,
                                    renewalRequested: event.target.checked,
                                  };
                                  setRenewalChoices((current) => ({
                                    ...current,
                                    [selection.planId]:
                                      selection.renewalRequested,
                                  }));
                                  setPreview(null);
                                  quote.mutate(selection);
                                }
                              }}
                            />
                            <i aria-hidden="true" />
                          </label>
                          <small>
                            {
                              "Yaln\u0131zca tercih; otomatik tahsilat yap\u0131lmaz."
                            }
                          </small>
                        </dd>
                      </div>
                    )}
                    <div>
                      <dt>Toplam</dt>
                      <dd>{money(preview.total, preview.currency)}</dd>
                    </div>
                  </dl>
                  <p className="credit-store-notice">
                    <Info size={18} /> Online ödeme henüz etkin değil. Sipariş
                    kaydı oluşturabilirsiniz; ödeme alınmaz ve hesabınıza kredi
                    yüklenmez.
                  </p>
                  {create.isSuccess ? (
                    <p>Bu sipariş kaydedildi.</p>
                  ) : (
                    <button
                      className="button primary credit-quote-submit"
                      type="button"
                      disabled={create.isPending || !preview.quoteKey}
                      onClick={() => create.mutate(preview)}
                    >
                      {create.isPending ? "Kaydediliyor…" : "Sipariş Oluştur"}
                    </button>
                  )}
                  <ErrorMessage error={create.error} />
                </div>
              )}
            </>
          )}
        </>
      )}
    </section>
  );
}
