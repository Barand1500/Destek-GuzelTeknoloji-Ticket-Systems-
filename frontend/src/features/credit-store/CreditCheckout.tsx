import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ArrowLeft, CreditCard, LockKeyhole, Info } from "lucide-react";
import { api } from "../../services/api";
import { ErrorMessage } from "../management/shared";
import { formatPhone } from "../../utils/phone";
import { bankLogo } from "./bank-logos";
import { count, money } from "./types";
import { cardDigits, cardScheme, formatCardNumber, formatExpiry, validCardNumber, validExpiry, validCvc } from "./card-format";
import "./credit-store.css";
import "./checkout.css";

type CheckoutOrder = {
  id: string; number: number | string; name: string; credits: number;
  total: string; currency: string; status: string; validityDays: number | null;
  periodStartsOn?: string | null; periodEndsOn?: string | null;
  periodMonths: number | null; periodName?: string | null; renewalRequested?: boolean;
  customer: { id: string; name: string; company?: string | null; email?: string | null; phone?: string | null };
};
type BankInfo = {
  available: boolean;
  bankName?: string;
  bankColor?: string;
  bankMark?: string;
  bankKey?: string;
  cardAssociation?: string;
  cardFamily?: string;
  cardType?: string;
  source?: "provider" | "local" | "public";
};

export function CreditCheckout({ orderId, onBack }: { orderId: string; onBack?: () => void }) {
  // A fresh keyed component keeps card details local to this order and this mounted screen.
  return <CheckoutForm key={orderId} orderId={orderId} onBack={onBack} />;
}

function CheckoutForm({ orderId, onBack }: { orderId: string; onBack?: () => void }) {
  const order = useQuery({
    queryKey: ["credit-checkout", orderId],
    queryFn: async () =>
      (await api.get(`/my/credit-store/orders/${encodeURIComponent(orderId)}/checkout`)).data.data as CheckoutOrder,
  });
  const [name, setName] = useState("");
  const [identity, setIdentity] = useState("");
  const [phone, setPhone] = useState("");
  const [number, setNumber] = useState("");
  const [expiry, setExpiry] = useState("");
  const [cvc, setCvc] = useState("");
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [bank, setBank] = useState<{ bin: string; info: BankInfo } | null>(null);
  const digits = cardDigits(number);
  // Six digits are enough for the offline issuer list; eight digits are used by the provider.
  const bin = digits.length >= 6 ? digits.slice(0, 8) : "";
  const scheme = cardScheme(number);
  const pending = order.data?.status === "PENDING";

  useEffect(() => {
    if (order.data) {
      setName(order.data.customer.name);
      setPhone(formatPhone(order.data.customer.phone ?? ""));
    }
  }, [order.data]);

  useEffect(() => {
    setBank(null);
    if (!bin || !pending) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      void api
        .post("/my/credit-store/card-info", { bin }, { signal: controller.signal })
        .then((response) => {
          if (!controller.signal.aborted) setBank({ bin, info: response.data.data });
        })
        .catch(() => {
          /* Bank lookup is an informative helper; it never blocks editing. */
        });
    }, 300);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [bin, pending]);

  const bankInfo = bank?.bin === bin ? bank.info : null;
  const logoSrc = bankLogo(bankInfo?.bankKey);
  const identityError = identity.length > 0 && identity.length !== 11 ? "T.C. Kimlik No 11 haneli olmalıdır." : "";
  const phoneDigits = phone.replace(/\D/g, "").replace(/^0/, "");
  const phoneError = /^5\d{9}$/.test(phoneDigits) ? "" : "5 ile başlayan 10 haneli telefon numarası girin.";
  const errors: Record<string, string> = {
    phone: phoneError,
    number: validCardNumber(number) ? "" : "Geçerli bir kart numarası girin.",
    expiry: validExpiry(expiry) ? "" : "Geçerli bir son kullanma tarihi girin (AA/YY).",
    cvc: validCvc(cvc, scheme) ? "" : `${scheme === "Amex" ? 4 : 3} haneli güvenlik kodunu girin.`,
  };
  const blur = (field: string) => setTouched((value) => ({ ...value, [field]: true }));
  const error = (field: string) =>
    touched[field] && errors[field] ? (
      <small id={`checkout-${field}-error`} role="alert" className="checkout-error">
        {errors[field]}
      </small>
    ) : null;

  return (
    <section className="credit-store credit-checkout" aria-label="Sipariş ödemesi">
      {onBack ? (
        <button type="button" className="button secondary" onClick={onBack}>
          <ArrowLeft size={16} /> Siparişlerime Dön
        </button>
      ) : (
        <Link className="button secondary" to="/customer/agreements?view=orders">
          <ArrowLeft size={16} /> Siparişlerime Dön
        </Link>
      )}
      <div className="checkout-heading">
        <span className="credit-kicker">SİPARİŞİNİZİ TAMAMLAYIN</span>
        <h2>Ödeme Bilgileri</h2>
      </div>
      {order.isPending && <p role="status">Sipariş yükleniyor…</p>}
      <ErrorMessage error={order.error} />
      {order.data && !pending && (
        <p role="status" className="credit-store-notice">
          Bu sipariş ödeme beklemiyor. Yalnızca ödeme bekleyen siparişlerin ödeme formu açılabilir.
        </p>
      )}
      {order.data && pending && (
        <div className="checkout-grid">
          <form className="credit-sales-card checkout-form" autoComplete="off" onSubmit={(event) => event.preventDefault()}>
            <div className="checkout-card-heading">
              <CreditCard size={19} aria-hidden="true" />
              <h3>Kredi Kartı</h3>
            </div>
            <p className="credit-store-notice checkout-preview">
              <Info size={18} />
              <span>Ödeme önizlemesi. Ödeme henüz etkin değil; tahsilat yapılmaz ve kredi yüklenmez. Gerçek kart bilgilerinizi girmeyin.</span>
            </p>
            <fieldset className="credit-fields checkout-fields">
              <legend className="checkout-sr-only">Kart ve iletişim bilgileri</legend>
              <label className="credit-wide">
                <span>Ad Soyad *</span>
                <input
                  value={name}
                  onChange={(event) => setName(event.target.value)}
                  maxLength={120}
                  aria-label="Kart üzerindeki ad soyad"
                  autoComplete="cc-name"
                />
              </label>
              <label className="credit-wide">
                <span>T.C. Kimlik No</span>
                <input
                  value={identity}
                  onChange={(event) => setIdentity(cardDigits(event.target.value).slice(0, 11))}
                  onBlur={() => blur("identity")}
                  inputMode="numeric"
                  maxLength={11}
                  aria-label="T.C. Kimlik No"
                  aria-invalid={Boolean(touched.identity && identityError)}
                  aria-describedby={touched.identity && identityError ? "checkout-identity-error" : undefined}
                  placeholder="İsteğe bağlı"
                />
              </label>
              {touched.identity && identityError && (
                <div className="credit-wide">
                  <small id="checkout-identity-error" role="alert" className="checkout-error">
                    {identityError}
                  </small>
                </div>
              )}
              <label className="credit-wide">
                <span>Telefon No *</span>
                <input
                  type="tel"
                  value={phone}
                  onChange={(event) => setPhone(formatPhone(event.target.value))}
                  onBlur={() => blur("phone")}
                  inputMode="tel"
                  maxLength={15}
                  aria-label="Telefon numarası"
                  autoComplete="tel"
                  aria-invalid={Boolean(touched.phone && phoneError)}
                  aria-describedby={touched.phone && phoneError ? "checkout-phone-error" : undefined}
                  required
                />
              </label>
              {touched.phone && phoneError && (
                <div className="credit-wide">
                  <small id="checkout-phone-error" role="alert" className="checkout-error">
                    {phoneError}
                  </small>
                </div>
              )}
              <label className="credit-wide checkout-card-field">
                <span>Kart No *</span>
                <input
                  inputMode="numeric"
                  value={number}
                  placeholder="0000 0000 0000 0000"
                  onChange={(event) => setNumber(formatCardNumber(event.target.value))}
                  onBlur={() => blur("number")}
                  aria-label="Kart numarası"
                  aria-invalid={Boolean(touched.number && errors.number)}
                  aria-describedby={touched.number && errors.number ? "checkout-number-error" : undefined}
                  autoComplete="cc-number"
                />
                <div className="checkout-bank-badge" aria-live="polite">
                  {bankInfo?.available && bankInfo.bankName ? (
                    logoSrc ? (
                      <img className="checkout-bank-logo" src={logoSrc} alt={bankInfo.bankName} title={bankInfo.bankName} />
                    ) : (
                      <>
                        <i aria-hidden="true" style={{ background: bankInfo.bankColor ?? "#64748b" }}>
                          {bankInfo.bankMark ?? bankInfo.bankName.slice(0, 1)}
                        </i>
                        <strong>{bankInfo.bankName}</strong>
                      </>
                    )
                  ) : bankInfo && !bankInfo.available && digits.length >= 8 ? (
                    <em className="checkout-bank-unknown">Banka bulunamadı</em>
                  ) : scheme ? (
                    <em className="checkout-card-scheme">{scheme}</em>
                  ) : null}
                </div>
              </label>
              {touched.number && errors.number && <div className="credit-wide">{error("number")}</div>}
              <label>
                <span>Son Kullanım *</span>
                <input
                  inputMode="numeric"
                  value={expiry}
                  placeholder="AA/YY"
                  onChange={(event) => setExpiry(formatExpiry(event.target.value))}
                  onBlur={() => blur("expiry")}
                  aria-label="Son kullanma tarihi (AA/YY)"
                  aria-invalid={Boolean(touched.expiry && errors.expiry)}
                  aria-describedby={touched.expiry && errors.expiry ? "checkout-expiry-error" : undefined}
                  autoComplete="cc-exp"
                />
              </label>
              <label>
                <span>CVC *</span>
                <input
                  type="password"
                  inputMode="numeric"
                  value={cvc}
                  placeholder={scheme === "Amex" ? "••••" : "•••"}
                  onChange={(event) => setCvc(cardDigits(event.target.value).slice(0, scheme === "Amex" ? 4 : 3))}
                  onBlur={() => blur("cvc")}
                  aria-label="Güvenlik kodu (CVC)"
                  aria-invalid={Boolean(touched.cvc && errors.cvc)}
                  aria-describedby={touched.cvc && errors.cvc ? "checkout-cvc-error" : undefined}
                  autoComplete="cc-csc"
                />
              </label>
              {((touched.expiry && errors.expiry) || (touched.cvc && errors.cvc)) && (
                <div className="credit-wide">
                  {error("expiry")}
                  {error("cvc")}
                </div>
              )}
            </fieldset>
            <button type="submit" className="button primary checkout-pay" disabled>
              <LockKeyhole size={16} /> Ödeme henüz etkin değil
            </button>
            <p className="credit-help">
              Kart numarası ve güvenlik kodu gönderilmez veya kaydedilmez. Banka sorgusu için yalnızca kart numarasının ilk 8 hanesi kullanılır.
            </p>
          </form>
          <aside className="credit-sales-card checkout-summary">
            <span className="credit-kicker">SİPARİŞ #{order.data.number}</span>
            <h3>{order.data.name}</h3>
            <dl>
              <div>
                <dt>Hesap</dt>
                <dd>{order.data.customer.company || order.data.customer.name}</dd>
              </div>
              {order.data.customer.email && (
                <div>
                  <dt>E-posta</dt>
                  <dd>{order.data.customer.email}</dd>
                </div>
              )}
              {order.data.customer.phone && (
                <div>
                  <dt>Telefon</dt>
                  <dd>{formatPhone(order.data.customer.phone)}</dd>
                </div>
              )}
              <div>
                <dt>Kredi</dt>
                <dd>{count(order.data.credits)}</dd>
              </div>
              <div>
                <dt>Geçerlilik</dt>
                <dd>{order.data.periodName || (order.data.periodMonths ? `${order.data.periodMonths} ay` : `${order.data.validityDays} gün`)}</dd>
              </div>
              <div>
                <dt>Dönem sonunda tekrarla</dt>
                <dd>{order.data.renewalRequested ? "Evet" : "Hayır"}</dd>
              </div>
              {order.data.periodStartsOn && <div><dt>Paket başlangıcı</dt><dd>{order.data.periodStartsOn.slice(0,10).split("-").reverse().join(".")}</dd></div>}
              <div className="checkout-total">
                <dt>Toplam</dt>
                <dd>{money(order.data.total, order.data.currency)}</dd>
              </div>
            </dl>
            <p className="credit-help">Sipariş anındaki tutar gösterilir. Bu önizleme herhangi bir tahsilat veya otomatik yenileme yapmaz.</p>
          </aside>
        </div>
      )}
    </section>
  );
}
