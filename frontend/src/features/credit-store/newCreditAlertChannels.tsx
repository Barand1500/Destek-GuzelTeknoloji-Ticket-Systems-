import { MultiDropdownSelect } from "../../components/DropdownSelect";
import type { SalesSettings } from "./types";

type Channel = "IN_APP" | "EMAIL" | "SMS" | "WHATSAPP";
const channels: { value: Channel; label: string }[] = [
  { value: "IN_APP", label: "Uygulama içi bildirim" },
  { value: "EMAIL", label: "E-posta" },
  { value: "SMS", label: "SMS" },
  { value: "WHATSAPP", label: "WhatsApp" },
];

export function CreditAlertChannels({ draft, availability, disabled, onChange }: {
  draft: SalesSettings;
  availability?: { channel: Channel; available: boolean; reason?: string }[];
  disabled: boolean;
  onChange: <K extends keyof SalesSettings>(key: K, value: SalesSettings[K]) => void;
}) {
  const selected = draft.alertChannels ?? ["IN_APP"];
  const unavailable = channels.filter(({ value }) => selected.includes(value) && availability?.some(item => item.channel === value && !item.available));
  return <>
    <fieldset className="credit-fields" disabled={disabled}>
      <MultiDropdownSelect
        label="Bildirim kanalları"
        ariaLabel="Kredi bildirim kanalları"
        value={selected}
        options={channels.map(option => ({ ...option, label: option.label + (availability?.some(item => item.channel === option.value && !item.available) ? " (bağlantı gerekli)" : "") }))}
        onChange={value => onChange("alertChannels", value as Channel[])}
        emptyLabel="Kanal seçin"
        selectionLabel={channels.filter(option => selected.includes(option.value)).map(option => option.label).join(", ")}
        disabled={disabled}
        preserveOrderWhileOpen
        searchable={false}
      />
    </fieldset>
    <p className="credit-help">Hatırlatmalar yalnızca seçilen, bağlantısı etkin kanallardan ana müşteri/şirket hesabının geçerli iletişim bilgilerine gönderilir. Örneğin SMS seçili ama müşteride telefon yoksa SMS atlanır; seçili diğer kanallar kullanılır. Seçilmeyen kanallara geçilmez.</p>
    {unavailable.length > 0 && <p className="credit-help" role="status">{unavailable.map(option => option.label).join(", ")}: bağlantı gerekli. Bu kanallardaki hatırlatmalar bağlantı tamamlanana kadar atlanır.</p>}
    {draft.alertsEnabled && selected.length === 0 && <p role="alert">Bildirimler açıkken en az bir kanal seçin.</p>}
    {selected.includes("WHATSAPP") && <>
      <fieldset className="credit-fields" disabled={disabled}>
        <label><span>WhatsApp hatırlatma şablonu</span><input aria-label="WhatsApp hatırlatma şablonu" value={draft.whatsappCreditTemplateName ?? ""} maxLength={512} onChange={event => onChange("whatsappCreditTemplateName", event.target.value)} /></label>
        <label><span>WhatsApp şablon dili</span><input aria-label="WhatsApp şablon dili" value={draft.whatsappCreditTemplateLanguage ?? "tr"} maxLength={20} onChange={event => onChange("whatsappCreditTemplateLanguage", event.target.value)} /></label>
      </fieldset>
      <p className="credit-help">Onaylı bir utility şablonu kullanın. Şablon gövdesi tek değişken olarak hatırlatma mesajını almalıdır. OTP şablonu kullanmayın. Sağlayıcı bağlantısı Entegrasyonlar ekranından yapılır.</p>
    </>}
  </>;
}
