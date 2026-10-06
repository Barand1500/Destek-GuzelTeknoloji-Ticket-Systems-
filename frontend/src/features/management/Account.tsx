import { useEffect, useState, type FormEvent } from "react";
import { Activity, ChevronDown, Eye, EyeOff, Mail, MessageCircle, MessageSquare, Search, Timer, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { useAuth } from "../auth/Auth";
import { hasPermission } from '../auth/permissions';
import { roles, type User } from "../../types";
import {
  ErrorMessage,
  FormActions,
  Heading,
  ListState,
  Pagination,
  formatDate,
  formValues,
  useList,
} from "./shared";

import { conversationPath } from "../../router/paths";
import { EmailInput } from "../../components/EmailInput";
import { DropdownSelect } from "../../components/DropdownSelect";
type IntegrationSettings = {
  responseFastMinutes: number; responseNormalMinutes: number; responseFastColor: string; responseNormalColor: string; responseLateColor: string; responseFastFromMinutes: number; responseFastToMinutes: number; responseNormalFromMinutes: number; responseNormalToMinutes: number; responseLateFromMinutes: number; responseLateToMinutes: number;
  smtpEnabled: boolean; smtpHost: string; smtpPort: number; smtpSecure: boolean; smtpUser: string; smtpPassword: string; smtpFromAddress: string; smtpFromName: string;
  imapEnabled: boolean; imapConnectionName: string; imapHost: string; imapPort: number; imapSecure: boolean; imapAuthType: "BASIC" | "OAUTH2"; imapUser: string; imapPassword: string; imapMailbox: string; imapPollIntervalSeconds: number; imapCreateTickets: boolean; imapCreateReplies: boolean; imapDepartmentId: string | null;
  smsEnabled: boolean; smsApiUser: string; smsApiPassword: string; smsSender: string; smsVirtualNumber: string; smsWebhookSecret: string; smsDepartmentId: string | null;
  whatsappEnabled: boolean; whatsappAppId: string; whatsappAppSecret: string; whatsappPhoneNumberId: string; whatsappAccessToken: string; whatsappVerifyToken: string; whatsappDepartmentId: string | null;
  lastTestChannel: string | null; lastTestSuccess: boolean | null; lastTestMessage: string | null; lastTestedAt: string | null; updatedAt: string;
};
type Notification = {
  id: string;
  title: string;
  message: string;
  isRead: boolean;
  createdAt: string;
  conversationId?: string | null;
};
const notificationDeleteLabels = {
  day: "Son 24 saatteki bildirimleri sil",
  week: "Son 7 gündeki bildirimleri sil",
  month: "Son 30 gündeki bildirimleri sil",
  all: "Tüm bildirimleri sil",
};

/* notification grid */
export function NotificationsPage() {
  const { user } = useAuth();
  const [unread, setUnread] = useState(false);
  const [limit, setLimit] = useState(15);
  const [deletePeriod, setDeletePeriod] = useState<"day" | "week" | "month" | "all" | null>(null);
  const [deleteMenuOpen, setDeleteMenuOpen] = useState(false);
  const list = useList<Notification>(
    "/notifications",
    unread ? { isRead: "false", limit: String(limit) } : { limit: String(limit) },
  );
  const client = useQueryClient();
  const read = useMutation({
    mutationFn: (id?: string) =>
      api.patch(id ? `/notifications/${id}/read` : "/notifications/read-all"),
    onSuccess: async () => {
      await client.invalidateQueries({ queryKey: ["/notifications"] });
      await client.invalidateQueries({ queryKey: ["notifications"] });
    },
  });
  const remove = useMutation({
    mutationFn: (period: "day" | "week" | "month" | "all") => api.delete("/notifications", { params: { period } }),
    onSuccess: () => void client.invalidateQueries({ queryKey: ["/notifications"] }),
  });
  return (
    <main className="page notifications-page">
      <Heading
        title="Bildirimler"
        description="Görüşmelerinizdeki gelişmeleri ve ekip güncellemelerini takip edin."
      >
        <button
          className="button secondary"
          disabled={read.isPending || !list.data?.data.length}
          onClick={() => read.mutate(undefined)}
        >
          Tümünü okundu işaretle
        </button>
      </Heading>
      <section className="management-panel">
        <div className="notification-toolbar">
          <label className="notification-search"><Search size={16} aria-hidden="true" /><input aria-label="Bildirimlerde ara" placeholder="Bildirimlerde ara…" value={list.search} onChange={(e) => list.setSearch(e.target.value)} /></label>
          <div className="notification-limit"><span>Kayıt sayısı</span><DropdownSelect value={String(limit)} onChange={(value) => { setLimit(Number(value)); list.setPage(1); }} ariaLabel="Kayıt sayısı" options={[10, 15, 20, 50].map((value) => ({ value: String(value), label: String(value) }))} /></div>
          <label className="notification-toggle"><span>Yalnızca okunmamış</span><input type="checkbox" checked={unread} onChange={(e) => { setUnread(e.target.checked); list.setPage(1); }} /></label>
          <button className="button secondary" disabled={read.isPending || !list.data?.data.length} onClick={() => read.mutate(undefined)}>Tümünü okundu işaretle</button>
          <div className={`notification-delete${deleteMenuOpen ? " open" : ""}`}>
            <button type="button" className="notification-delete-trigger" aria-haspopup="menu" aria-expanded={deleteMenuOpen} onClick={() => setDeleteMenuOpen((open) => !open)}><Trash2 size={16} aria-hidden="true" /><span>Bildirimleri sil</span><ChevronDown size={15} aria-hidden="true" /></button>
            {deleteMenuOpen && <div className="notification-delete-menu" role="menu">{Object.entries(notificationDeleteLabels).map(([period, label]) => <button key={period} type="button" role="menuitem" onClick={() => { setDeletePeriod(period as "day" | "week" | "month" | "all"); setDeleteMenuOpen(false); }}>{label}</button>)}</div>}
          </div>
        </div>
        <label className="management-check management-read-note">
          <input
            type="checkbox"
            checked={unread}
            onChange={(e) => {
              setUnread(e.target.checked);
              list.setPage(1);
            }}
          />
          Yalnızca okunmamış bildirimler
        </label>
        <ErrorMessage error={read.error} />
        <div className="management-notifications notification-grid">
          <div className="notification-grid-head"><span>Bildirim</span><span>Mesaj</span><span>Tarih</span><span>Durum</span><span>İşlem</span></div>
          {list.data?.data.map((notification) => (
            <article
              key={notification.id}
              className={`management-notification ${notification.isRead ? "" : "unread"}`}
            >
              <div>
                <strong>{notification.title}</strong>
                <p>{notification.message}</p>
                <small>
                  {formatDate(notification.createdAt)}
                </small>
                <span className="notification-read-state">{notification.isRead ? "Okundu" : "Okunmadı"}</span>
                {notification.conversationId && (
                  <div className="notification-conversation-actions">
                    {!notification.isRead && (
                      <button
                        type="button"
                        className="button secondary"
                        disabled={read.isPending}
                        onClick={() => read.mutate(notification.id)}
                      >
                        Okundu işaretle
                      </button>
                    )}
                    <Link
                      className={`notification-conversation-link${notification.isRead ? " standalone" : ""}`}
                      to={conversationPath(user!.role, notification.conversationId)}
                      aria-label="Görüşmeye git"
                      title="Görüşmeye git"
                    >
                      {notification.isRead ? "Görüşmeye git →" : "→"}
                    </Link>
                  </div>
                )}
              </div>
              {!notification.isRead && !notification.conversationId && (
                <button
                  className="button secondary"
                  disabled={read.isPending}
                  onClick={() => read.mutate(notification.id)}
                >
                  Okundu işaretle
                </button>
              )}
            </article>
          ))}
        </div>
        <ListState
          loading={list.isPending}
          error={list.error}
          empty={!list.data?.data.length}
        />
        <Pagination
          pagination={list.data?.pagination}
          onChange={list.setPage}
        />
      </section>
      {deletePeriod && (
        <div className="confirm-backdrop" role="presentation">
          <section className="confirm-modal" role="dialog" aria-modal="true" aria-label="Bildirim silme onayı" onMouseDown={(event) => event.stopPropagation()}>
            <button className="confirm-close" type="button" onClick={() => setDeletePeriod(null)} aria-label="Kapat">×</button>
            <h2>{notificationDeleteLabels[deletePeriod]}</h2>
            <p>Bu bildirimleri silmek istediğinize emin misiniz?</p>
            <div className="confirm-actions"><button className="button secondary" type="button" onClick={() => setDeletePeriod(null)}>Vazgeç</button><button className="button danger" type="button" disabled={remove.isPending} onClick={() => remove.mutate(deletePeriod, { onSuccess: () => setDeletePeriod(null) })}>{remove.isPending ? "Siliniyor…" : "Sil"}</button></div>
          </section>
        </div>
      )}
    </main>
  );
}

type EmailNotificationSettings = {
  ticketCreatedSubject: string;
  ticketCreatedBody: string;
  ticketReplySubject: string;
  ticketReplyBody: string;
};

function EmailNotificationFields({ settings, mode, hidden }: { settings: EmailNotificationSettings; mode: "outgoing" | "incoming"; hidden: boolean }) {
  return <section hidden={hidden} className="integration-card email-notification-card">
    <div className="integration-heading"><h2>{mode === "outgoing" ? "Talep olu\u015fturma e-postas\u0131" : "Yan\u0131t e-postas\u0131"}</h2></div>
    <div className="email-notification-message">
      {mode === "outgoing" ? <>
        <label><span className="field-label">Talep oluşturma konu başlığı</span><input name="ticketCreatedSubject" required maxLength={191} defaultValue={settings.ticketCreatedSubject} /></label>
        <label><span className="field-label">Talep oluşturma mesajı</span><textarea name="ticketCreatedBody" required maxLength={10000} rows={7} defaultValue={settings.ticketCreatedBody} /></label>
</> : <>
        <label><span className="field-label">Yanıt konu başlığı</span><input name="ticketReplySubject" required maxLength={191} defaultValue={settings.ticketReplySubject} /></label>
        <label><span className="field-label">Yanıt mesajı</span><textarea name="ticketReplyBody" required maxLength={10000} rows={7} defaultValue={settings.ticketReplyBody} /></label>
</>}
    </div>
  </section>;
}

const integrationTabs = [
  { id: "email", label: "E-posta", icon: Mail },
  { id: "sms", label: "SMS", icon: MessageSquare },
  { id: "whatsapp", label: "WhatsApp", icon: MessageCircle },
] as const;
const fieldValue = (values: FormData, name: string) => String(values.get(name) ?? "").trim();
const numberValue = (values: FormData, name: string, fallback: number) => Number(values.get(name)) || fallback;
function IntegrationDepartment({ value, options, onChange, label = "Varsayılan departman", className = "" }: { value: string; options: Array<{ value: string; label: string }>; onChange: (value: string) => void; label?: string; className?: string }) {
  return <div className={`integration-department ${className}`}><DropdownSelect label={label} ariaLabel={label} value={value} onChange={onChange} options={[{ value: "", label: "İlk aktif departman" }, ...options]} /></div>;
}
function IntegrationToggle({ name, label, defaultChecked, hint, className = "" }: { name: string; label: string; defaultChecked: boolean; hint?: string; className?: string }) {
  const { user } = useAuth();
  return <label className={`integration-toggle ${className}`}><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span><input name={name} type="checkbox" disabled={!hasPermission(user, 'integrations.update')} defaultChecked={defaultChecked} /><i aria-hidden="true" /></label>;
}
export function IntegrationsPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<"email" | "sms" | "whatsapp">("email");
  const [emailTab, setEmailTab] = useState<"outgoing" | "incoming">("outgoing");
  const [imapDepartment, setImapDepartment] = useState<string | null>(null);
  const [imapAuthType, setImapAuthType] = useState<"BASIC" | "OAUTH2" | null>(null);
  const [smsDepartment, setSmsDepartment] = useState<string | null>(null);
  const [whatsappDepartment, setWhatsappDepartment] = useState<string | null>(null);
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const secretInput = (name: string, value: string, label: string) => <span className="password-field integration-password-field"><input name={name} type={visibleSecrets[name] ? "text" : "password"} defaultValue={value} aria-label={label} autoComplete="new-password" /><button className="password-toggle" type="button" onClick={() => setVisibleSecrets((current) => ({ ...current, [name]: !current[name] }))} aria-label={visibleSecrets[name] ? "Parolayı gizle" : "Parolayı göster"}>{visibleSecrets[name] ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>;
  const [result, setResult] = useState<string | null>(null);
  const [webhookCopied, setWebhookCopied] = useState(false);
  const [whatsappWebhookCopied, setWhatsappWebhookCopied] = useState(false);
  useEffect(() => { setResult(null); setWebhookCopied(false); setWhatsappWebhookCopied(false); }, [tab, emailTab]);
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["/integrations"], queryFn: async () => (await api.get("/integrations")).data.data as IntegrationSettings });
  const notifications = useQuery({ queryKey: ["/notification-settings"], queryFn: async () => (await api.get("/notification-settings")).data.data as EmailNotificationSettings });
  useEffect(() => {
    document.querySelectorAll<HTMLInputElement>(".integrations-page input[name$='User'], .integrations-page input[name$='Password'], .integrations-page input[name='smtpPassword'], .integrations-page input[name='imapPassword']").forEach(input => {
      input.autocomplete = /password/i.test(input.name) ? "new-password" : "off";
    });
  }, [settings.data?.updatedAt]);
  const departments = useQuery({ queryKey: ["/departments", "integration-options"], queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string }> }>("/departments", { params: { limit: 100 } })).data.data });
  const save = useMutation({ mutationFn: (data: Omit<IntegrationSettings, "lastTestChannel" | "lastTestSuccess" | "lastTestMessage" | "lastTestedAt" | "updatedAt"> & { emailNotifications: EmailNotificationSettings }) => api.put("/integrations", data), onSuccess: async () => { await Promise.all([client.invalidateQueries({ queryKey: ["/integrations"] }), client.invalidateQueries({ queryKey: ["/notification-settings"] })]); setResult("Ayarlar ve e-posta metinleri kaydedildi."); } });
  function submit(event: FormEvent<HTMLFormElement>) {
    if (!hasPermission(user, 'integrations.update')) { event.preventDefault(); return; }
    const values = formValues(event); const current = settings.data!;
    const { id: _id, lastTestChannel, lastTestSuccess, lastTestMessage, lastTestedAt, updatedAt, ...data } = current as IntegrationSettings & { id?: string };
    if (values.has("smtpHost")) Object.assign(data, {
      smtpEnabled: values.get("smtpEnabled") === "on", smtpHost: fieldValue(values, "smtpHost"), smtpPort: numberValue(values, "smtpPort", 587), smtpSecure: values.get("smtpSecure") === "on", smtpUser: fieldValue(values, "smtpUser"), smtpPassword: fieldValue(values, "smtpPassword"), smtpFromAddress: fieldValue(values, "smtpFromAddress"), smtpFromName: fieldValue(values, "smtpFromName"),
    });
    if (values.has("imapHost")) Object.assign(data, {
      imapEnabled: values.get("imapEnabled") === "on", imapConnectionName: fieldValue(values, "imapConnectionName"), imapHost: fieldValue(values, "imapHost"), imapPort: numberValue(values, "imapPort", 993), imapSecure: values.get("imapSecure") === "on", imapAuthType: imapAuthType ?? current.imapAuthType, imapUser: fieldValue(values, "imapUser"), imapPassword: fieldValue(values, "imapPassword"), imapMailbox: fieldValue(values, "imapMailbox") || "INBOX", imapPollIntervalSeconds: numberValue(values, "imapPollIntervalSeconds", 60), imapCreateTickets: values.get("imapCreateTickets") === "on", imapCreateReplies: values.get("imapCreateReplies") === "on", imapDepartmentId: (imapDepartment ?? current.imapDepartmentId) || null,
    });
    if (values.has("smsApiUser")) Object.assign(data, {
      smsEnabled: values.get("smsEnabled") === "on", smsApiUser: fieldValue(values, "smsApiUser"), smsApiPassword: fieldValue(values, "smsApiPassword"), smsSender: fieldValue(values, "smsSender"), smsVirtualNumber: fieldValue(values, "smsVirtualNumber"), smsWebhookSecret: fieldValue(values, "smsWebhookSecret"), smsDepartmentId: (smsDepartment ?? current.smsDepartmentId) || null,
    });
    if (values.has("whatsappAppId")) Object.assign(data, {
      whatsappEnabled: values.get("whatsappEnabled") === "on", whatsappAppId: fieldValue(values, "whatsappAppId"), whatsappAppSecret: fieldValue(values, "whatsappAppSecret"), whatsappPhoneNumberId: fieldValue(values, "whatsappPhoneNumberId"), whatsappAccessToken: fieldValue(values, "whatsappAccessToken"), whatsappVerifyToken: fieldValue(values, "whatsappVerifyToken"), whatsappDepartmentId: (whatsappDepartment ?? current.whatsappDepartmentId) || null,
    });
    save.mutate({ ...data, emailNotifications: {
      ticketCreatedSubject: fieldValue(values, "ticketCreatedSubject"),
      ticketCreatedBody: fieldValue(values, "ticketCreatedBody"),
      ticketReplySubject: fieldValue(values, "ticketReplySubject"),
      ticketReplyBody: fieldValue(values, "ticketReplyBody"),
    } });
  }
  const departmentOptions = (departments.data ?? []).map(item => ({ value: item.id, label: item.name }));
  const webhookBase = `${window.location.origin}/api/v1/webhooks`;
  const netgsmWebhook = `${webhookBase}/netgsm?token=${encodeURIComponent(settings.data?.smsWebhookSecret || "WEBHOOK_GIZLI_ANAHTARI")}`;
  const copyNetgsmWebhook = async () => {
    try { await navigator.clipboard.writeText(netgsmWebhook); setWebhookCopied(true); }
    catch { setResult("Yönlendirme adresi kopyalanamadı. Tarayıcının pano iznini kontrol edin."); }
  };
  const copyWhatsappWebhook = async () => {
    try { await navigator.clipboard.writeText(`${webhookBase}/whatsapp`); setWhatsappWebhookCopied(true); }
    catch { setResult("WhatsApp callback adresi kopyalanamadı. Tarayıcının pano iznini kontrol edin."); }
  };
  return <main className="page integrations-page"><Heading title="Entegrasyonlar" description="Müşteri mesajlarını e-posta, SMS ve WhatsApp üzerinden alın; yanıtları aynı kanaldan gönderin." />
    <ListState loading={settings.isPending || departments.isPending || notifications.isPending} error={settings.error ?? departments.error ?? notifications.error} empty={false} />
    {settings.data && notifications.data && <form className="integration-shell" onChange={() => { setResult(null); save.reset(); }} onSubmit={submit} autoComplete="off">
      <div className="integration-tabs" role="tablist">{integrationTabs.map(item => { const Icon = item.icon; return <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}><Icon size={17} />{item.label}</button>; })}</div>
      <div className="integration-email-panel" hidden={tab !== "email"}><div className="integration-subtabs" role="tablist"><button type="button" role="tab" aria-selected={emailTab === "outgoing"} className={emailTab === "outgoing" ? "active" : ""} onClick={() => setEmailTab("outgoing")}>Giden e-posta (SMTP)</button><button type="button" role="tab" aria-selected={emailTab === "incoming"} className={emailTab === "incoming" ? "active" : ""} onClick={() => setEmailTab("incoming")}>Gelen e-posta (IMAP)</button></div>
        <section hidden={emailTab !== "outgoing"} className="integration-card smtp-card"><div className="integration-heading"><h2>Giden e-posta (SMTP)</h2><IntegrationToggle name="smtpEnabled" label="SMTP gönderimini etkinleştir" defaultChecked={settings.data.smtpEnabled} /></div><div className="integration-fields"><label><span className="field-label">Gönderen e-posta adresi</span><input name="smtpFromAddress" type="email" defaultValue={settings.data.smtpFromAddress} /></label><label><span className="field-label">Gönderen adı</span><input name="smtpFromName" defaultValue={settings.data.smtpFromName} /></label><div className="smtp-host-port"><label><span className="field-label">SMTP sunucusu</span><input name="smtpHost" placeholder="smtp.ornek.com" defaultValue={settings.data.smtpHost} /></label><label><span className="field-label">Port</span><input name="smtpPort" type="number" defaultValue={settings.data.smtpPort} /></label></div><label><span className="field-label">Kullanıcı adı</span><input name="smtpUser" defaultValue={settings.data.smtpUser} /></label><label><span className="field-label">Parola / API anahtarı</span>{secretInput("smtpPassword", settings.data.smtpPassword, "SMTP parolası")}</label><IntegrationToggle name="smtpSecure" label="SSL/TLS kullan" defaultChecked={settings.data.smtpSecure} /></div></section><section hidden={emailTab !== "incoming"} className="integration-card imap-card"><div className="integration-heading"><h2>Gelen e-posta (IMAP)</h2><IntegrationToggle name="imapEnabled" label="IMAP ile mesaj alımını etkinleştir" defaultChecked={settings.data.imapEnabled} /></div><div className="integration-fields"><label><span className="field-label">Bağlantı adı</span><input name="imapConnectionName" placeholder="Örn. Destek Gelen Kutusu" defaultValue={settings.data.imapConnectionName} /></label><DropdownSelect label="Kimlik doğrulama" ariaLabel="Kimlik doğrulama" value={imapAuthType ?? settings.data.imapAuthType} onChange={value => setImapAuthType(value as "BASIC" | "OAUTH2")} options={[{ value: "BASIC", label: "Basic" }, { value: "OAUTH2", label: "OAuth 2.0" }]} /><div className="smtp-host-port"><label><span className="field-label">IMAP sunucusu</span><input name="imapHost" placeholder="imap.gmail.com" defaultValue={settings.data.imapHost} /></label><label><span className="field-label">Port</span><input name="imapPort" type="number" defaultValue={settings.data.imapPort} /></label></div><label><span className="field-label">Kullanıcı adı</span><input name="imapUser" placeholder="kullanici@gmail.com" defaultValue={settings.data.imapUser} /></label><label><span className="field-label">{(imapAuthType ?? settings.data.imapAuthType) === "OAUTH2" ? "OAuth erişim belirteci" : "Parola / uygulama parolası"}</span>{secretInput("imapPassword", settings.data.imapPassword, "IMAP parolası")}</label><IntegrationToggle className="imap-secure" name="imapSecure" label="SSL/TLS kullan" defaultChecked={settings.data.imapSecure} /><label className="imap-folder"><span className="field-label">Klasör</span><input name="imapMailbox" defaultValue={settings.data.imapMailbox} /></label><label className="imap-poll"><span className="field-label">Tarama aralığı (saniye)</span><input name="imapPollIntervalSeconds" type="number" min="15" defaultValue={settings.data.imapPollIntervalSeconds} /></label><IntegrationToggle className="imap-create-ticket" name="imapCreateTickets" label="Yeni talep oluştur" defaultChecked={settings.data.imapCreateTickets} /><IntegrationToggle className="imap-create-reply" name="imapCreateReplies" label="Mevcut talebe yanıt ekle" defaultChecked={settings.data.imapCreateReplies} /><IntegrationDepartment className="imap-department" value={imapDepartment ?? settings.data.imapDepartmentId ?? ""} options={departmentOptions} onChange={setImapDepartment} /></div></section><EmailNotificationFields settings={notifications.data} mode="outgoing" hidden={emailTab !== "outgoing"} /><EmailNotificationFields settings={notifications.data} mode="incoming" hidden={emailTab !== "incoming"} /></div>
      <section hidden={tab !== "sms"} className="integration-card sms-card"><div className="integration-heading"><h2>Netgsm SMS</h2><IntegrationToggle name="smsEnabled" label="Netgsm entegrasyonunu etkinleştir" defaultChecked={settings.data.smsEnabled} /></div><div className="integration-fields"><label><span className="field-label">API kullanıcı adı</span><input name="smsApiUser" defaultValue={settings.data.smsApiUser} /></label><label><span className="field-label">API parolası</span>{secretInput("smsApiPassword", settings.data.smsApiPassword, "Netgsm API parolası")}</label><label><span className="field-label">Gönderici başlığı</span><input name="smsSender" minLength={3} maxLength={11} defaultValue={settings.data.smsSender} /></label><label><span className="field-label">Sanal numara</span><input name="smsVirtualNumber" placeholder="0850… veya 05…" defaultValue={settings.data.smsVirtualNumber} /></label><label><span className="field-label">Webhook gizli anahtarı</span>{secretInput("smsWebhookSecret", settings.data.smsWebhookSecret, "Netgsm webhook gizli anahtarı")}</label><IntegrationDepartment value={smsDepartment ?? settings.data.smsDepartmentId ?? ""} options={departmentOptions} onChange={setSmsDepartment} /></div><details className="integration-webhook-details"><summary>Gelen SMS kurulumu</summary><div className="integration-webhook-help"><strong>Netgsm yönlendirme adresi</strong><div className="integration-webhook-copy"><code>{webhookBase}/netgsm?token=••••••••</code><button className="button secondary" type="button" onClick={() => void copyNetgsmWebhook()}>{webhookCopied ? "Kopyalandı" : "Adresi kopyala"}</button></div><small>Yalnızca gelen SMS’lerin Gelen kutusuna aktarılması için gereklidir. Netgsm panelinde SMS Hizmeti → İnteraktif SMS → URL Adresine Yönlendir alanına kaydedin. Canlı adres HTTPS ve dışarıdan erişilebilir olmalıdır.</small></div></details></section>
      <section hidden={tab !== "whatsapp"} className="integration-card whatsapp-card"><div className="integration-heading"><h2>Meta WhatsApp Cloud API</h2><IntegrationToggle name="whatsappEnabled" label="WhatsApp entegrasyonunu etkinleştir" defaultChecked={settings.data.whatsappEnabled} /></div><div className="integration-fields"><label><span className="field-label">Meta uygulama kimliği</span><input name="whatsappAppId" defaultValue={settings.data.whatsappAppId} /></label><label><span className="field-label">Uygulama gizli anahtarı</span>{secretInput("whatsappAppSecret", settings.data.whatsappAppSecret, "Meta uygulama gizli anahtarı")}</label><label><span className="field-label">Telefon numarası kimliği</span><input name="whatsappPhoneNumberId" defaultValue={settings.data.whatsappPhoneNumberId} /></label><label><span className="field-label">Erişim belirteci</span>{secretInput("whatsappAccessToken", settings.data.whatsappAccessToken, "Meta erişim belirteci")}</label><label><span className="field-label">Webhook doğrulama belirteci</span>{secretInput("whatsappVerifyToken", settings.data.whatsappVerifyToken, "WhatsApp webhook doğrulama belirteci")}</label><IntegrationDepartment value={whatsappDepartment ?? settings.data.whatsappDepartmentId ?? ""} options={departmentOptions} onChange={setWhatsappDepartment} /></div><details className="integration-webhook-details"><summary>Gelen WhatsApp kurulumu</summary><div className="integration-webhook-help"><strong>Meta callback adresi</strong><div className="integration-webhook-copy"><code>{webhookBase}/whatsapp</code><button className="button secondary" type="button" onClick={() => void copyWhatsappWebhook()}>{whatsappWebhookCopied ? "Kopyalandı" : "Adresi kopyala"}</button></div><small>Yalnızca gelen WhatsApp mesajlarının Gelen kutusuna aktarılması için gereklidir. Meta panelinde callback URL olarak kaydedin, yukarıdaki doğrulama belirtecini kullanın ve <b>messages</b> alanına abone olun. Canlı adres HTTPS olmalıdır.</small></div></details></section>
      <ErrorMessage error={save.error} />
      <div className="integration-footer">{result && <p className="management-success" role="status">{result}</p>}<button className="button primary" disabled={save.isPending || !hasPermission(user, 'integrations.update')}>{save.isPending ? "Kaydediliyor\u2026" : "Kaydet"}</button></div>
    </form>}</main>;
}

export function ResponseTimeRulesPage() {
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState<"response" | "presence">("response");
  const idleSettings = useQuery({ queryKey: ["/staff-presence"], queryFn: async () => (await api.get<{ data: { idleMinutes: number } }>("/staff-presence")).data.data });
  const saveIdle = useMutation({ mutationFn: (idleMinutes: number) => api.put("/staff-presence/settings", { idleMinutes }), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["/staff-presence"] }); } });
  const settings = useQuery({ queryKey: ["/response-time-settings"], queryFn: async () => (await api.get("/response-time-settings")).data.data as Pick<IntegrationSettings, "responseFastFromMinutes" | "responseFastToMinutes" | "responseNormalFromMinutes" | "responseNormalToMinutes" | "responseLateFromMinutes" | "responseLateToMinutes" | "responseFastColor" | "responseNormalColor" | "responseLateColor"> });
  const save = useMutation({
    mutationFn: (rules: Pick<IntegrationSettings, "responseFastFromMinutes" | "responseFastToMinutes" | "responseNormalFromMinutes" | "responseNormalToMinutes" | "responseLateFromMinutes" | "responseLateToMinutes" | "responseFastColor" | "responseNormalColor" | "responseLateColor">) => {
      return api.put("/response-time-settings", rules);
    },
    onSuccess: async () => { setSaved(true); await client.invalidateQueries({ queryKey: ["/response-time-settings"] }); await client.invalidateQueries({ queryKey: ["conversations"] }); },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    const values = formValues(event);
    setSaved(false);
    save.mutate({ responseFastFromMinutes: numberValue(values, "responseFastFromMinutes", 0), responseFastToMinutes: numberValue(values, "responseFastToMinutes", 15), responseNormalFromMinutes: numberValue(values, "responseNormalFromMinutes", 16), responseNormalToMinutes: numberValue(values, "responseNormalToMinutes", 60), responseLateFromMinutes: numberValue(values, "responseLateFromMinutes", 61), responseLateToMinutes: numberValue(values, "responseLateToMinutes", 10080), responseFastColor: fieldValue(values, "responseFastColor"), responseNormalColor: fieldValue(values, "responseNormalColor"), responseLateColor: fieldValue(values, "responseLateColor") });
  }
  function submitIdle(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const idleMinutes = Number(new FormData(event.currentTarget).get("idleMinutes"));
    if (Number.isInteger(idleMinutes) && idleMinutes >= 1 && idleMinutes <= 120) saveIdle.mutate(idleMinutes);
  }
  const fast = [settings.data?.responseFastFromMinutes ?? 0, settings.data?.responseFastToMinutes ?? 15];
  const normal = [settings.data?.responseNormalFromMinutes ?? 16, settings.data?.responseNormalToMinutes ?? 60];
  const late = [settings.data?.responseLateFromMinutes ?? 61, settings.data?.responseLateToMinutes ?? 10080];
  const fastColor = settings.data?.responseFastColor ?? "#16715d";
  const normalColor = settings.data?.responseNormalColor ?? "#a86606";
  const lateColor = settings.data?.responseLateColor ?? "#c2413c";
  return <main className={`page response-rules-page tab-${tab}`}><Heading title={tab === "response" ? "Yanıt süresi kuralları" : "Personel süresi"} description={tab === "response" ? "Talep açılışı ile ilk personel yanıtı arasındaki süreyi sınıflandırın." : "Personelin işlem yapmadığında ne zaman boşta görüneceğini belirleyin."} />
    <div className="integration-subtabs response-settings-tabs" role="tablist" aria-label="Süre ayarları"><button type="button" role="tab" aria-selected={tab === "response"} className={tab === "response" ? "active" : ""} onClick={() => setTab("response")}>Yanıt süresi</button><button type="button" role="tab" aria-selected={tab === "presence"} className={tab === "presence" ? "active" : ""} onClick={() => setTab("presence")}>Personel süresi</button></div>
    <ListState loading={tab === "response" ? settings.isPending : idleSettings.isPending} error={tab === "response" ? settings.error : idleSettings.error} empty={false} />
    {settings.data && <form className="management-form response-rules-form" onSubmit={submit}><section className="integration-card response-rules-card"><div className="integration-heading"><div><h2><Timer size={18} /> Renk ve süre eşikleri</h2><p>Her seviye için dakika aralığını ve yalnız yanıt yazısının rengini seçin.</p></div></div><div className="response-range-row"><strong>Hızlı yanıt</strong><label><span className="field-label">Başlangıç dk</span><input name="responseFastFromMinutes" type="number" min="0" defaultValue={fast[0]} /></label><label><span className="field-label">Bitiş dk</span><input name="responseFastToMinutes" type="number" min="0" defaultValue={fast[1]} /></label><label className="response-color-picker"><span className="field-label">Renk</span><input name="responseFastColor" type="color" defaultValue={fastColor} /></label></div><div className="response-range-row"><strong>Normal yanıt</strong><label><span className="field-label">Başlangıç dk</span><input name="responseNormalFromMinutes" type="number" min="0" defaultValue={normal[0]} /></label><label><span className="field-label">Bitiş dk</span><input name="responseNormalToMinutes" type="number" min="0" defaultValue={normal[1]} /></label><label className="response-color-picker"><span className="field-label">Renk</span><input name="responseNormalColor" type="color" defaultValue={normalColor} /></label></div><div className="response-range-row"><strong>Çok geç yanıt</strong><label><span className="field-label">Başlangıç dk</span><input name="responseLateFromMinutes" type="number" min="0" defaultValue={late[0]} /></label><label><span className="field-label">Bitiş dk</span><input name="responseLateToMinutes" type="number" min="0" defaultValue={late[1]} /></label><label className="response-color-picker"><span className="field-label">Renk</span><input name="responseLateColor" type="color" defaultValue={lateColor} /></label></div><ErrorMessage error={save.error} />{saved && <p className="management-success">Yanıt süresi kuralları kaydedildi.</p>}</section><FormActions pending={save.isPending} submitLabel="Kuralları kaydet" /></form>}
    {idleSettings.data && <form className="management-form presence-idle-form" onSubmit={submitIdle}><section className="integration-card presence-idle-card"><div className="integration-heading"><div><h2><Activity size={18}/> Personel boşta kalma süresi</h2><p>İşlem yapılmadığında personelin kaç dakika sonra boşta görüneceğini belirleyin.</p></div></div><div className="presence-idle-control"><label><span className="field-label">Boşta sayılma süresi</span><input name="idleMinutes" type="number" min="1" max="120" defaultValue={idleSettings.data.idleMinutes}/></label><span>dakika</span></div><ErrorMessage error={saveIdle.error}/>{saveIdle.isSuccess&&<p className="management-success">Boşta kalma süresi güncellendi.</p>}</section><FormActions pending={saveIdle.isPending} submitLabel="Süreyi kaydet"/></form>}
  </main>;
}

type StaffPresence = {
  id:string; name:string; email:string|null; role:"ADMIN"|"SUPERVISOR"|"AGENT"; departments:string[];
  state:"ONLINE"|"IDLE"|"OFFLINE"; page:string; path:string; lastActivityAt:string|null; lastSeenAt:string|null;
  openAssigned:number; answeredToday:number; answeredTotal:number; resolvedToday:number; averageFirstResponseMinutes:number|null; lastReplyAt:string|null;
};
type PresenceResponse = { idleMinutes:number; updatedAt:string; staff:StaffPresence[] };
const presenceState = { ONLINE:"Çevrimiçi", IDLE:"Boşta", OFFLINE:"Çevrimdışı" } as const;
const durationText = (minutes:number|null) => minutes === null ? "—" : minutes < 60 ? `${minutes} dk` : `${Math.floor(minutes/60)} sa ${minutes%60} dk`;
function PresencePeople({staff}:{staff:StaffPresence[]}) {
  const columns=[staff.slice(0,3),staff.slice(3,6)],hidden=staff.slice(6);
  return <span className="presence-summary-people">{columns.filter(column=>column.length>0).map((column,index)=><span className="presence-summary-column" key={index}>{column.map(person=><span className="presence-summary-person" title={person.name} key={person.id}>{person.name}</span>)}</span>)}{hidden.length>0&&<span className="presence-summary-overflow" data-tooltip={hidden.map(person=>person.name).join("\n")} aria-label={`${hidden.length} kişi daha: ${hidden.map(person=>person.name).join(", ")}`}>+{hidden.length}</span>}</span>;
}

export function StaffPresencePage() {
  const [filter,setFilter]=useState<"ALL"|StaffPresence["state"]>("ALL");
  const query=useQuery({queryKey:["/staff-presence"],queryFn:async()=>(await api.get<{data:PresenceResponse}>("/staff-presence")).data.data,refetchInterval:60_000});
  const data=query.data;
  const onlineStaff=data?.staff.filter(item=>item.state==="ONLINE")??[];
  const idleStaff=data?.staff.filter(item=>item.state==="IDLE")??[];
  const offlineStaff=data?.staff.filter(item=>item.state==="OFFLINE")??[];
  const online=onlineStaff.length;
  const idle=idleStaff.length;
  const visibleStaff=data?.staff.filter(item=>filter==="ALL"||item.state===filter)??[];
  const chooseFilter=(state:StaffPresence["state"])=>setFilter(current=>current===state?"ALL":state);
  return <main className="page staff-presence-page">
    <Heading title="Personel aktivitesi" description="Ekibin anlık durumunu, çalıştığı ekranı ve destek performansını takip edin." />
    <ListState loading={query.isPending} error={query.error} empty={false}/>
    {data&&<>
      <section className="presence-summary" aria-label="Canlı durum özeti">
        <button type="button" className={`status-filter online ${filter==="ONLINE"?"active":""}`} aria-pressed={filter==="ONLINE"} onClick={()=>chooseFilter("ONLINE")}><span className="presence-summary-main"><span className="presence-dot online"/><strong>{online}</strong><small>Çevrimiçi</small></span><PresencePeople staff={onlineStaff}/></button>
        <button type="button" className={`status-filter idle ${filter==="IDLE"?"active":""}`} aria-pressed={filter==="IDLE"} onClick={()=>chooseFilter("IDLE")}><span className="presence-summary-main"><span className="presence-dot idle"/><strong>{idle}</strong><small>Boşta</small></span><PresencePeople staff={idleStaff}/></button>
        <button type="button" className={`status-filter offline ${filter==="OFFLINE"?"active":""}`} aria-pressed={filter==="OFFLINE"} onClick={()=>chooseFilter("OFFLINE")}><span className="presence-summary-main"><span className="presence-dot offline"/><strong>{offlineStaff.length}</strong><small>Çevrimdışı</small></span><PresencePeople staff={offlineStaff}/></button>
      </section>
      <section className="presence-grid">
        {visibleStaff.map(person=><article className="presence-card" key={person.id}>
          <header><div className="presence-avatar">{person.name.charAt(0)}</div><div><h2>{person.name}</h2><p>{roles[person.role]} · {person.departments.join(", ")||"Departman yok"}</p></div></header>
          <div className={`presence-current ${person.state.toLowerCase()}`}><Activity size={16}/><div><small>Şu an · {presenceState[person.state]}</small><strong>{person.page}</strong><span>{person.state==="OFFLINE"?(person.lastSeenAt?`Son görülme: ${formatDate(person.lastSeenAt)}`:"Henüz bağlantı yok"):(person.lastActivityAt?`Son hareket: ${formatDate(person.lastActivityAt)}`:"")}</span></div></div>
          <dl className="presence-metrics">
            <div><dt>Bugün cevaplanan</dt><dd>{person.answeredToday}</dd></div>
            <div><dt>Bugün çözülen</dt><dd>{person.resolvedToday}</dd></div>
            <div><dt>Toplam cevaplanan</dt><dd>{person.answeredTotal}</dd></div>
            <div><dt>Açık atama</dt><dd>{person.openAssigned}</dd></div>
            <div><dt>Ort. ilk yanıt</dt><dd>{durationText(person.averageFirstResponseMinutes)}</dd></div>
            <div><dt>Son cevap</dt><dd>{person.lastReplyAt?formatDate(person.lastReplyAt):"—"}</dd></div>
          </dl>
        </article>)}
      </section>
    </>}
  </main>;
}

export function ProfilePage() {
  const { updateUser } = useAuth();
  const [formVersion, setFormVersion] = useState(0);
  const client = useQueryClient();
  const [success, setSuccess] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const profile = useQuery({
    queryKey: ["/profile"],
    queryFn: async () => (await api.get("/profile")).data.data as User,
  });
  const save = useMutation({
    mutationFn: (data: Record<string, unknown>) => api.patch("/profile", data),
    onSuccess: async (result) => {
      updateUser(result.data.data);
      await client.invalidateQueries({ queryKey: ["/profile"] });
      setFormVersion((v) => v + 1);
      setSuccess(true);
    },
  });
  function submit(event: FormEvent<HTMLFormElement>) {
    const values = formValues(event);
    setSuccess(false);
    const email = String(values.get("email"));
    save.mutate({
      name: values.get("name"),
      ...(email !== profile.data?.email ? { email } : {}),
      ...(values.get("password") ? { password: values.get("password") } : {}),
      ...(values.get("currentPassword")
        ? { currentPassword: values.get("currentPassword") }
        : {}),
    });
  }
  return (
    <main className="page profile-page">
      <section className="profile-shell">
        <ListState
          loading={profile.isPending}
          error={profile.error}
          empty={false}
        />
        {profile.data && (
          <>
            <div className="profile-cover" aria-hidden="true">
              <div className="profile-avatar">{profile.data.name.slice(0, 1).toLocaleUpperCase("tr-TR")}</div>
            </div>
            <div className="profile-identity">
              <div>
                <h1>{profile.data.name}</h1>
                <p>Hesap bilgilerinizi ve şifrenizi yönetin.</p>
              </div>
              <span className="profile-role">{profile.data.accessRole?.name ?? roles[profile.data.role]}</span>
            </div>
            <form key={formVersion} className="management-form profile-form" onSubmit={submit}>
            <section className="profile-info-card" aria-label="İletişim bilgileri">
            <label>
              <span className="field-label">Ad soyad</span>
              <input
                name="name"
                required
                minLength={2}
                maxLength={100}
                defaultValue={profile.data.name}
                autoComplete="name"
              />
            </label>
            <label>
              <span className="field-label">E-posta adresi</span>
              <EmailInput name="email" required defaultValue={profile.data.email ?? ""} />
            </label>
            </section>
            <section className="profile-security" aria-labelledby="profile-security-title">
              <h2 id="profile-security-title">Güvenlik</h2>
            <label>
              <span className="field-label">Yeni şifre (isteğe bağlı)</span>
              <span className="password-field"><input name="password" type={showNewPassword ? "text" : "password"} minLength={10} maxLength={72} autoComplete="new-password" /><button className="password-toggle" type="button" onClick={() => setShowNewPassword((visible) => !visible)} aria-label={showNewPassword ? "Şifreyi gizle" : "Şifreyi göster"}>{showNewPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
            </label>
            <label>
              <span className="field-label">Mevcut şifre</span>
              <span className="password-field"><input name="currentPassword" type={showCurrentPassword ? "text" : "password"} maxLength={72} autoComplete="current-password" /><button className="password-toggle" type="button" onClick={() => setShowCurrentPassword((visible) => !visible)} aria-label={showCurrentPassword ? "Şifreyi gizle" : "Şifreyi göster"}>{showCurrentPassword ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>
            </label>
            <p className="muted">
              E-posta adresinizi veya şifrenizi değiştirmek için mevcut
              şifrenizi girin. Yeni şifre en az 10 karakter olmalıdır.
            </p>
            </section>
            <ErrorMessage error={save.error} />
            {success && (
              <p className="management-success" role="status">
                Profiliniz güncellendi.
              </p>
            )}
            <FormActions pending={save.isPending} />
            </form>
          </>
        )}
      </section>
    </main>
  );
}
