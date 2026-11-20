import { useState, type FormEvent } from "react";
import { CreditCard } from "lucide-react";
import { api, errorText } from "../../services/api";
import { money } from "./types";
const empty = { holder: "", number: "", expiry: "", cvc: "" };
export function AkbankCardForm({
  orderId,
  total,
  currency,
}: {
  orderId: string;
  total: string;
  currency: string;
}) {
  const [card, setCard] = useState(empty);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const locked = busy;
  const digits = (value: string, length: number) =>
    value.replace(/\D/g, "").slice(0, length);
  function submitWindowForm(result: {
    action: string;
    fields: Record<string, string>;
  }) {
    const form = document.createElement("form");
    form.method = "POST";
    form.action = result.action;
    form.hidden = true;
    for (const [name, value] of Object.entries(result.fields)) {
      const input = document.createElement("input");
      input.type = "hidden";
      input.name = name;
      input.value = value;
      form.appendChild(input);
    }
    document.body.appendChild(form);
    setCard(empty);
    try {
      HTMLFormElement.prototype.submit.call(form);
    } finally {
      form.remove();
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (locked) return;
    setBusy(true);
    setError("");
    let response: any;
    try {
      response = await api.post(
        `/my/credit-store/orders/${encodeURIComponent(orderId)}/pay`,
        {
          card: {
            ...card,
            number: digits(card.number, 19),
            expiry: digits(card.expiry, 4),
          },
        },
      );
      const result = response.data.data as {
        action: string;
        fields: Record<string, string>;
      };
      if (
        ![
          "https://virtualpospaymentgateway.akbank.com/securepay",
          "https://virtualpospaymentgatewaypre.akbank.com/securepay",
        ].includes(result.action)
      )
        throw Error("Ödeme adresi doğrulanamadı.");
      submitWindowForm(result);
    } catch (failure) {
      if (failure && typeof failure === "object" && "config" in failure)
        (failure as any).config.data = undefined;
      setError(errorText(failure));
      setCard(empty);
    } finally {
      setBusy(false);
      if (response?.config) response.config.data = undefined;
      if (response?.data?.data?.fields)
        for (const key of Object.keys(response.data.data.fields))
          response.data.data.fields[key] = "";
    }
  }
  return (
    <form
      className="akbank-card-form"
      onSubmit={submit}
      autoComplete="off"
      aria-label="Kart ile ödeme"
    >
      <h3>
        <CreditCard size={20} /> Kredi / Banka Kartı
      </h3>
      <fieldset className="credit-checkout-billing" disabled={locked}>
        <label className="akbank-card-wide">
          <span className="field-label">Kart üzerindeki ad soyad *</span>
          <input
            required
            maxLength={100}
            autoComplete="cc-name"
            value={card.holder}
            onChange={(e) => setCard((v) => ({ ...v, holder: e.target.value }))}
          />
        </label>
        <label className="akbank-card-wide">
          <span className="field-label">Kart numarası *</span>
          <input
            required
            inputMode="numeric"
            autoComplete="off"
            maxLength={23}
            placeholder="0000 0000 0000 0000"
            value={card.number}
            onChange={(e) =>
              setCard((v) => ({
                ...v,
                number: digits(e.target.value, 19)
                  .replace(/(.{4})/g, "$1 ")
                  .trim(),
              }))
            }
          />
        </label>
        <label>
          <span className="field-label">Son kullanma tarihi *</span>
          <input
            required
            inputMode="numeric"
            autoComplete="off"
            pattern="(0[1-9]|1[0-2]) / [0-9]{2}"
            maxLength={7}
            placeholder="AA / YY"
            value={card.expiry}
            onChange={(e) => {
              const value = digits(e.target.value, 4);
              setCard((v) => ({
                ...v,
                expiry:
                  value.length > 2
                    ? value.slice(0, 2) + " / " + value.slice(2)
                    : value,
              }));
            }}
          />
        </label>
        <label>
          <span className="field-label">CVC *</span>
          <input
            required
            type="password"
            inputMode="numeric"
            autoComplete="off"
            pattern="[0-9]{3}"
            maxLength={3}
            placeholder="•••"
            value={card.cvc}
            onChange={(e) =>
              setCard((v) => ({ ...v, cvc: digits(e.target.value, 3) }))
            }
          />
        </label>
      </fieldset>
      {error && (
        <p className="notice error" role="alert">
          {error}
        </p>
      )}
      <button type="submit" className="button primary" disabled={locked}>
        {busy ? "Bankaya yönlendiriliyor…" : money(total, currency) + " Öde"}
      </button>
    </form>
  );
}
