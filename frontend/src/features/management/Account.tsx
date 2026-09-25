import { useEffect, useState, type FormEvent } from "react";
import { ChevronDown, Eye, EyeOff, Mail, MessageCircle, MessageSquare, Search, Timer, Trash2 } from "lucide-react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { api } from "../../services/api";
import { useAuth } from "../auth/Auth";
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
  return <label className={`integration-toggle ${className}`}><span><strong>{label}</strong>{hint && <small>{hint}</small>}</span><input name={name} type="checkbox" defaultChecked={defaultChecked} /><i aria-hidden="true" /></label>;
}
export function IntegrationsPage() {
  const [tab, setTab] = useState<"email" | "sms" | "whatsapp">("email");
  const [emailTab, setEmailTab] = useState<"outgoing" | "incoming">("outgoing");
  const [imapDepartment, setImapDepartment] = useState("");
  const [imapAuthType, setImapAuthType] = useState<"BASIC" | "OAUTH2" | null>(null);
  const [smsDepartment, setSmsDepartment] = useState("");
  const [whatsappDepartment, setWhatsappDepartment] = useState("");
  const [visibleSecrets, setVisibleSecrets] = useState<Record<string, boolean>>({});
  const secretInput = (name: string, value: string, label: string) => <span className="password-field integration-password-field"><input name={name} type={visibleSecrets[name] ? "text" : "password"} defaultValue={value} aria-label={label} /><button className="password-toggle" type="button" onClick={() => setVisibleSecrets((current) => ({ ...current, [name]: !current[name] }))} aria-label={visibleSecrets[name] ? "Parolayı gizle" : "Parolayı göster"}>{visibleSecrets[name] ? <EyeOff size={17} /> : <Eye size={17} />}</button></span>;
  const [result, setResult] = useState<string | null>(null);
  useEffect(() => { setResult(null); }, [tab, emailTab]);
  const client = useQueryClient();
  const settings = useQuery({ queryKey: ["/integrations"], queryFn: async () => (await api.get("/integrations")).data.data as IntegrationSettings });
  useEffect(() => {
    document.querySelectorAll<HTMLInputElement>(".integrations-page input[name$='User'], .integrations-page input[name$='Password'], .integrations-page input[name='smtpPassword'], .integrations-page input[name='imapPassword']").forEach(input => {
      input.autocomplete = /password/i.test(input.name) ? "new-password" : "off";
    });
  }, [settings.data?.updatedAt]);
  const departments = useQuery({ queryKey: ["/departments", "integration-options"], queryFn: async () => (await api.get<{ data: Array<{ id: string; name: string }> }>("/departments", { params: { limit: 100 } })).data.data });
  const save = useMutation({ mutationFn: (data: Omit<IntegrationSettings, "lastTestChannel" | "lastTestSuccess" | "lastTestMessage" | "lastTestedAt" | "updatedAt">) => api.put("/integrations", data), onSuccess: async () => { await client.invalidateQueries({ queryKey: ["/integrations"] }); setResult("Ayarlar kaydedildi. Bağlantı testi başlatılıyor…"); } });
  const test = useMutation({ mutationFn: (channel: "SMTP" | "IMAP" | "SMS" | "WHATSAPP") => api.post("/integrations/test", { channel }), onSuccess: (response) => { const value = response.data.data; setResult(value.success ? `Bağlantı başarılı: ${value.message}` : `Bağlantı başarısız: ${value.message}`); void client.invalidateQueries({ queryKey: ["/integrations"] }); }, onError: (error: unknown) => { const response = error as { response?: { data?: { error?: { message?: string }; message?: string } }; message?: string }; setResult(`Bağlantı testi başlatılamadı: ${response.response?.data?.error?.message ?? response.response?.data?.message ?? response.message ?? "Bilinmeyen hata"}`); } });
  function submit(event: FormEvent<HTMLFormElement>) {
    const values = formValues(event); const current = settings.data!;
    const { id: _id, lastTestChannel, lastTestSuccess, lastTestMessage, lastTestedAt, updatedAt, ...data } = current as IntegrationSettings & { id?: string };
    if (tab === "email" && emailTab === "outgoing") Object.assign(data, {
      smtpEnabled: values.get("smtpEnabled") === "on", smtpHost: fieldValue(values, "smtpHost"), smtpPort: numberValue(values, "smtpPort", 587), smtpSecure: values.get("smtpSecure") === "on", smtpUser: fieldValue(values, "smtpUser"), smtpPassword: fieldValue(values, "smtpPassword"), smtpFromAddress: fieldValue(values, "smtpFromAddress"), smtpFromName: fieldValue(values, "smtpFromName"),
    });
    if (tab === "email" && emailTab === "incoming") Object.assign(data, {
      imapEnabled: values.get("imapEnabled") === "on", imapConnectionName: fieldValue(values, "imapConnectionName"), imapHost: fieldValue(values, "imapHost"), imapPort: numberValue(values, "imapPort", 993), imapSecure: values.get("imapSecure") === "on", imapAuthType: imapAuthType ?? current.imapAuthType, imapUser: fieldValue(values, "imapUser"), imapPassword: fieldValue(values, "imapPassword"), imapMailbox: fieldValue(values, "imapMailbox") || "INBOX", imapPollIntervalSeconds: numberValue(values, "imapPollIntervalSeconds", 60), imapCreateTickets: values.get("imapCreateTickets") === "on", imapCreateReplies: values.get("imapCreateReplies") === "on", imapDepartmentId: imapDepartment || current.imapDepartmentId || null,
    });
    if (tab === "sms") Object.assign(data, {
      smsEnabled: values.get("smsEnabled") === "on", smsApiUser: fieldValue(values, "smsApiUser"), smsApiPassword: fieldValue(values, "smsApiPassword"), smsSender: fieldValue(values, "smsSender"), smsVirtualNumber: fieldValue(values, "smsVirtualNumber"), smsWebhookSecret: fieldValue(values, "smsWebhookSecret"), smsDepartmentId: smsDepartment || current.smsDepartmentId || null,
    });
    if (tab === "whatsapp") Object.assign(data, {
      whatsappEnabled: values.get("whatsappEnabled") === "on", whatsappAppId: fieldValue(values, "whatsappAppId"), whatsappAppSecret: fieldValue(values, "whatsappAppSecret"), whatsappPhoneNumberId: fieldValue(values, "whatsappPhoneNumberId"), whatsappAccessToken: fieldValue(values, "whatsappAccessToken"), whatsappVerifyToken: fieldValue(values, "whatsappVerifyToken"), whatsappDepartmentId: whatsappDepartment || current.whatsappDepartmentId || null,
    });
    save.mutate(data, { onSuccess: () => test.mutate(tab === "email" ? emailTab === "outgoing" ? "SMTP" : "IMAP" : tab === "sms" ? "SMS" : "WHATSAPP") });
  }
  const departmentOptions = (departments.data ?? []).map(item => ({ value: item.id, label: item.name }));
  const activeTestChannel = tab === "email" ? emailTab === "outgoing" ? "SMTP" : "IMAP" : tab === "sms" ? "SMS" : "WHATSAPP";
  const visibleTestMessage = result || (settings.data?.lastTestChannel === activeTestChannel ? settings.data.lastTestMessage : null);
  return <main className="page integrations-page"><Heading title="Entegrasyonlar" description="Müşteri mesajlarını e-posta, SMS ve WhatsApp üzerinden alın; yanıtları aynı kanaldan gönderin." />
    <ListState loading={settings.isPending || departments.isPending} error={settings.error ?? departments.error} empty={false} />
    {settings.data && <form key={`${settings.data.updatedAt}-${tab}-${emailTab}`} className="integration-shell" onSubmit={submit} autoComplete="off">
      <div className="integration-tabs" role="tablist">{integrationTabs.map(item => { const Icon = item.icon; return <button type="button" role="tab" aria-selected={tab === item.id} className={tab === item.id ? "active" : ""} key={item.id} onClick={() => setTab(item.id)}><Icon size={17} />{item.label}</button>; })}</div>
      {tab === "email" && <><div className="integration-subtabs" role="tablist"><button type="button" className={emailTab === "outgoing" ? "active" : ""} onClick={() => setEmailTab("outgoing")}>Giden · SMTP</button><button type="button" className={emailTab === "incoming" ? "active" : ""} onClick={() => setEmailTab("incoming")}>Gelen · IMAP</button></div>
        {emailTab === "outgoing" ? <section className="integration-card smtp-card"><div className="integration-heading"><h2>Giden e-posta</h2><IntegrationToggle name="smtpEnabled" label="SMTP gönderimini etkinleştir" defaultChecked={settings.data.smtpEnabled} /></div><div className="integration-fields"><label><span className="field-label">Gönderen e-posta adresi</span><input name="smtpFromAddress" type="email" defaultValue={settings.data.smtpFromAddress} /></label><label><span className="field-label">Gönderen adı</span><input name="smtpFromName" defaultValue={settings.data.smtpFromName} /></label><div className="smtp-host-port"><label><span className="field-label">SMTP sunucusu</span><input name="smtpHost" placeholder="smtp.ornek.com" defaultValue={settings.data.smtpHost} /></label><label><span className="field-label">Port</span><input name="smtpPort" type="number" defaultValue={settings.data.smtpPort} /></label></div><label><span className="field-label">Kullanıcı adı</span><input name="smtpUser" defaultValue={settings.data.smtpUser} /></label><label><span className="field-label">Parola / API anahtarı</span>{secretInput("smtpPassword", settings.data.smtpPassword, "SMTP parolası")}</label><IntegrationToggle name="smtpSecure" label="SSL/TLS kullan" defaultChecked={settings.data.smtpSecure} /></div></section> : <section className="integration-card imap-card"><div className="integration-heading"><h2>Gelen e-posta</h2><IntegrationToggle name="imapEnabled" label="IMAP ile mesaj alımını etkinleştir" defaultChecked={settings.data.imapEnabled} /></div><div className="integration-fields"><label><span className="field-label">Bağlantı adı</span><input name="imapConnectionName" placeholder="Örn. Destek Gelen Kutusu" defaultValue={settings.data.imapConnectionName} /></label><DropdownSelect label="Kimlik doğrulama" ariaLabel="Kimlik doğrulama" value={imapAuthType ?? settings.data.imapAuthType} onChange={value => setImapAuthType(value as "BASIC" | "OAUTH2")} options={[{ value: "BASIC", label: "Basic" }, { value: "OAUTH2", label: "OAuth 2.0" }]} /><div className="smtp-host-port"><label><span className="field-label">IMAP sunucusu</span><input name="imapHost" placeholder="imap.gmail.com" defaultValue={settings.data.imapHost} /></label><label><span className="field-label">Port</span><input name="imapPort" type="number" defaultValue={settings.data.imapPort} /></label></div><label><span className="field-label">Kullanıcı adı</span><input name="imapUser" placeholder="kullanici@gmail.com" defaultValue={settings.data.imapUser} /></label><label><span className="field-label">{(imapAuthType ?? settings.data.imapAuthType) === "OAUTH2" ? "OAuth erişim belirteci" : "Parola / uygulama parolası"}</span>{secretInput("imapPassword", settings.data.imapPassword, "IMAP parolası")}</label><IntegrationToggle className="imap-secure" name="imapSecure" label="SSL/TLS kullan" defaultChecked={settings.data.imapSecure} /><label className="imap-folder"><span className="field-label">Klasör</span><input name="imapMailbox" defaultValue={settings.data.imapMailbox} /></label><label className="imap-poll"><span className="field-label">Tarama aralığı (saniye)</span><input name="imapPollIntervalSeconds" type="number" min="15" defaultValue={settings.data.imapPollIntervalSeconds} /></label><IntegrationToggle className="imap-create-ticket" name="imapCreateTickets" label="Yeni talep oluştur" defaultChecked={settings.data.imapCreateTickets} /><IntegrationToggle className="imap-create-reply" name="imapCreateReplies" label="Mevcut talebe yanıt ekle" defaultChecked={settings.data.imapCreateReplies} /><IntegrationDepartment className="imap-department" value={imapDepartment || settings.data.imapDepartmentId || ""} options={departmentOptions} onChange={setImapDepartment} /></div></section>}</>}
      {tab === "sms" && <section className="integration-card sms-card"><div className="integration-heading"><h2>Netgsm SMS</h2><IntegrationToggle name="smsEnabled" label="Netgsm entegrasyonunu etkinleştir" defaultChecked={settings.data.smsEnabled} /></div><div className="integration-fields"><label><span className="field-label">API kullanıcı adı</span><input name="smsApiUser" defaultValue={settings.data.smsApiUser} /></label><label><span className="field-label">API parolası</span><input name="smsApiPassword" defaultValue={settings.data.smsApiPassword} /></label><label><span className="field-label">Gönderici başlığı</span><input name="smsSender" defaultValue={settings.data.smsSender} /></label><label><span className="field-label">Sanal numara</span><input name="smsVirtualNumber" defaultValue={settings.data.smsVirtualNumber} /></label><label><span className="field-label">Webhook gizli anahtarı</span><input name="smsWebhookSecret" defaultValue={settings.data.smsWebhookSecret} /></label><IntegrationDepartment value={smsDepartment || settings.data.smsDepartmentId || ""} options={departmentOptions} onChange={setSmsDepartment} /></div></section>}
      {tab === "whatsapp" && <section className="integration-card whatsapp-card"><div className="integration-heading"><h2>Meta WhatsApp Cloud API</h2><IntegrationToggle name="whatsappEnabled" label="WhatsApp entegrasyonunu etkinleştir" defaultChecked={settings.data.whatsappEnabled} /></div><div className="integration-fields"><label><span className="field-label">Meta uygulama kimliği</span><input name="whatsappAppId" defaultValue={settings.data.whatsappAppId} /></label><label><span className="field-label">Uygulama gizli anahtarı</span><input name="whatsappAppSecret" defaultValue={settings.data.whatsappAppSecret} /></label><label><span className="field-label">Telefon numarası kimliği</span><input name="whatsappPhoneNumberId" defaultValue={settings.data.whatsappPhoneNumberId} /></label><label><span className="field-label">Erişim belirteci</span><input name="whatsappAccessToken" defaultValue={settings.data.whatsappAccessToken} /></label><label><span className="field-label">Webhook doğrulama belirteci</span><input name="whatsappVerifyToken" defaultValue={settings.data.whatsappVerifyToken} /></label><IntegrationDepartment value={whatsappDepartment || settings.data.whatsappDepartmentId || ""} options={departmentOptions} onChange={setWhatsappDepartment} /></div></section>}
      <div className="integration-footer">{visibleTestMessage && <p className={settings.data.lastTestSuccess === false && !result ? "error" : "muted"}>{visibleTestMessage}</p>}<button className="button primary" disabled={save.isPending || test.isPending}>{save.isPending || test.isPending ? "Kaydediliyor…" : "Kaydet ve test et"}</button></div>
    </form>}</main>;
}

export function ResponseTimeRulesPage() {
  const client = useQueryClient();
  const [saved, setSaved] = useState(false);
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
  const fast = [settings.data?.responseFastFromMinutes ?? 0, settings.data?.responseFastToMinutes ?? 15];
  const normal = [settings.data?.responseNormalFromMinutes ?? 16, settings.data?.responseNormalToMinutes ?? 60];
  const late = [settings.data?.responseLateFromMinutes ?? 61, settings.data?.responseLateToMinutes ?? 10080];
  const fastColor = settings.data?.responseFastColor ?? "#16715d";
  const normalColor = settings.data?.responseNormalColor ?? "#a86606";
  const lateColor = settings.data?.responseLateColor ?? "#c2413c";
  return <main className="page response-rules-page"><Heading title="Yanıt süresi kuralları" description="Talep açılışı ile ilk personel yanıtı arasındaki süreyi sınıflandırın." />
    <ListState loading={settings.isPending} error={settings.error} empty={false} />
    {settings.data && <form className="management-form response-rules-form" onSubmit={submit}><section className="integration-card response-rules-card"><div className="integration-heading"><div><h2><Timer size={18} /> Renk ve süre eşikleri</h2><p>Her seviye için dakika aralığını ve yalnız yanıt yazısının rengini seçin.</p></div></div><div className="response-range-row"><strong>Hızlı yanıt</strong><label><span>Başlangıç dk</span><input name="responseFastFromMinutes" type="number" min="0" defaultValue={fast[0]} /></label><label><span>Bitiş dk</span><input name="responseFastToMinutes" type="number" min="0" defaultValue={fast[1]} /></label><label className="response-color-picker"><span>Renk</span><input name="responseFastColor" type="color" defaultValue={fastColor} /></label></div><div className="response-range-row"><strong>Normal yanıt</strong><label><span>Başlangıç dk</span><input name="responseNormalFromMinutes" type="number" min="0" defaultValue={normal[0]} /></label><label><span>Bitiş dk</span><input name="responseNormalToMinutes" type="number" min="0" defaultValue={normal[1]} /></label><label className="response-color-picker"><span>Renk</span><input name="responseNormalColor" type="color" defaultValue={normalColor} /></label></div><div className="response-range-row"><strong>Çok geç yanıt</strong><label><span>Başlangıç dk</span><input name="responseLateFromMinutes" type="number" min="0" defaultValue={late[0]} /></label><label><span>Bitiş dk</span><input name="responseLateToMinutes" type="number" min="0" defaultValue={late[1]} /></label><label className="response-color-picker"><span>Renk</span><input name="responseLateColor" type="color" defaultValue={lateColor} /></label></div><ErrorMessage error={save.error} />{saved && <p className="management-success">Yanıt süresi kuralları kaydedildi.</p>}</section><FormActions pending={save.isPending} submitLabel="Kuralları kaydet" /></form>}
  </main>;
}

export function NotificationSettingsPage() {
  const settings = useQuery({ queryKey: ["/notification-settings"], queryFn: async () => (await api.get("/notification-settings")).data.data as { ticketCreatedSubject: string; ticketCreatedBody: string; ticketReplySubject: string; ticketReplyBody: string } });
  const save = useMutation({ mutationFn: (data: { ticketCreatedSubject: string; ticketCreatedBody: string; ticketReplySubject: string; ticketReplyBody: string }) => api.put("/notification-settings", data) });
  useEffect(() => { if (!save.isSuccess) return; const timer = window.setTimeout(() => save.reset(), 3000); return () => window.clearTimeout(timer); }, [save.isSuccess, save.reset]);
  function submit(event: FormEvent<HTMLFormElement>) { const values = formValues(event); save.mutate({ ticketCreatedSubject: fieldValue(values, "ticketCreatedSubject"), ticketCreatedBody: fieldValue(values, "ticketCreatedBody"), ticketReplySubject: fieldValue(values, "ticketReplySubject"), ticketReplyBody: fieldValue(values, "ticketReplyBody") }); }
  return <main className="page"><Heading title="E-posta bildirimleri" description="Talep oluşturulunca ve yanıt verilince gönderilen mesajları özelleştirin." /><ListState loading={settings.isPending} error={settings.error} empty={false} />{settings.data && <form className="management-form" onSubmit={submit}><section className="integration-card notification-settings-card"><div className="integration-fields"><label><span className="field-label">Talep oluşturma konu başlığı</span><input name="ticketCreatedSubject" defaultValue={settings.data.ticketCreatedSubject} /></label><label><span className="field-label">Talep oluşturma mesajı</span><textarea name="ticketCreatedBody" rows={6} defaultValue={settings.data.ticketCreatedBody} /></label><label><span className="field-label">Yanıt konu başlığı</span><input name="ticketReplySubject" defaultValue={settings.data.ticketReplySubject} /></label><label><span className="field-label">Yanıt mesajı</span><textarea name="ticketReplyBody" rows={8} defaultValue={settings.data.ticketReplyBody} /></label><p className="notification-help"><strong>Mesaj değişkenleri nasıl çalışır?</strong><code>&#123;name&#125;</code> müşterinin adını, <code>&#123;subject&#125;</code> talep başlığını, <code>&#123;number&#125;</code> talep numarasını ekler. Yanıt mesajında <code>&#123;reply&#125;</code> kullanırsanız personelin yazdığı yanıt eklenir. Değişkenleri silerseniz ilgili bilgi e-postada görünmez.</p></div></section><FormActions pending={save.isPending} submitLabel="Bildirimleri kaydet" />{save.isSuccess && <p className="management-success">Bildirim metinleri kaydedildi.</p>}{save.error && <ErrorMessage error={save.error} />}</form>}</main>;
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
              <span className="profile-role">{roles[profile.data.role]}</span>
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
