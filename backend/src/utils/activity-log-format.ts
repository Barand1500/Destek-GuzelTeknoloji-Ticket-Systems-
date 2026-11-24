export type ActivityLog = {
  id: string;
  action: string;
  entity?: string;
  entityType?: string;
  entityId?: string;
  createdAt: string;
  user?: { id: string; name: string; email: string } | null;
  actor?: { name: string; email: string } | null;
  conversationId?: string | null;
  metadata?: { providerMessageId?: string; providerTimestamp?: string; name?: string; customerName?: string | null; title?: string; subject?: string; number?: number; code?: string; phone?: string | null; email?: string | null; company?: string | null; fields?: string[]; details?: string[]; changes?: Record<string, { from?: unknown; to?: unknown }>; originalName?: string; recipient?: string; reason?: string; attachmentCount?: number; deletedConversationCount?: number; recipientCount?: number; channels?: string[]; channel?: string; senderEmail?: string } | null;
};
export const actionLabels: Record<string, string> = {
  'conversation.email_queued': 'E-Posta gönderim kuyruğuna alındı',
  'conversation.channel_reply_queued': 'Kanal mesajı gönderim kuyruğuna alındı',
  'conversation.delivery_cancelled': 'Gönderim iptal edildi',
  "conversation.channel_reply_requested": "Kanal gönderimi başlatıldı",
  "conversation.channel_reply_sent": "Kanal gönderimi sağlayıcı tarafından kabul edildi",
  "conversation.whatsapp_sent": "WhatsApp mesajı gönderildi",
  "conversation.whatsapp_delivered": "WhatsApp mesajı teslim edildi",
  "conversation.whatsapp_read": "WhatsApp mesajı okundu",
  "conversation.whatsapp_failed": "WhatsApp mesajı teslim edilemedi",
  "conversation.whatsapp_deleted": "WhatsApp mesajı silindi",
  "profile.updated": "Profil bilgileri güncellendi",
  "survey.created": "Anket oluşturuldu",
  "survey.closed": "Anket kapatıldı",
  "announcement.created": "Duyuru oluşturuldu",
  "announcement.deleted": "Duyuru silindi",
  "conversation.whatsapp_received": "WhatsApp mesajı alındı",
  "conversation.sms_received": "SMS alındı",
  "conversation.channel_reply_failed": "Kanal mesajı gönderilemedi",
  "user.deleted": "Kullanıcı silindi",
  "department.created": "Departman oluşturuldu",
  "department.restored": "Departman yeniden etkinleştirildi",
  "department.deleted": "Departman silindi",
  "role.created": "Yetki rolü oluşturuldu",
  "role.updated": "Yetki rolü güncellendi",
  "role.deleted": "Yetki rolü silindi",
  "project_guide.files_uploaded": "Proje rehberine dosya eklendi",
  "project_guide.file_deleted": "Proje rehberi dosyası silindi",
  "announcement_template.created": "Duyuru şablonu oluşturuldu",
  "announcement_template.updated": "Duyuru şablonu güncellendi",
  "announcement_template.deleted": "Duyuru şablonu silindi",
  "saved_reply.created": "Hazır yanıt oluşturuldu",
  "saved_reply.updated": "Hazır yanıt güncellendi",
  "saved_reply.deleted": "Hazır yanıt silindi",
  "tag.created": "Etiket oluşturuldu",
  "tag.updated": "Etiket güncellendi",
  "tag.deleted": "Etiket silindi",
  "status.created": "Durum oluşturuldu",
  "status.updated": "Durum güncellendi",
  "status.deleted": "Durum silindi",
  "priority.created": "Öncelik oluşturuldu",
  "priority.updated": "Öncelik güncellendi",
  "priority.deleted": "Öncelik silindi",
  "user.created": "Kullanıcı oluşturuldu",
  "user.updated": "Kullanıcı bilgileri güncellendi",
  "customer.created": "Müşteri oluşturuldu",
  "customer.updated": "Müşteri bilgileri güncellendi",
  "customer.deleted": "Müşteri silindi",
  "customer.merged": "Müşteriler birleştirildi",
  "department.updated": "Departman güncellendi",
  "department.archived": "Departman silindi",
  "website.created": "Proje oluşturuldu",
  "website.updated": "Proje güncellendi",
  "website.deleted": "Proje silindi",
  "conversation.created": "Talep oluşturuldu",
  "conversation.claimed": "Talep üstlenildi",
  "conversation.deleted": "Talep silindi",
  "conversation.email_received": "E-Posta alındı",
  "conversation.replied": "Talebe yanıt verildi",
  "conversation.note_added": "Dahili not eklendi",
  "conversation.email_sent": "E-Posta gönderildi",
  "conversation.email_failed": "E-Posta gönderilemedi",
  "conversation.credit_used": "Talep için kredi kullanıldı",
  "conversation.credit_returned": "Talep yeniden açıldı, kredi geri verildi",
  "conversation.updated": "Talep bilgileri güncellendi",
  "customer.file_deleted": "Müşteri dosyası silindi",
  "customer.file_renamed": "Müşteri dosyası yeniden adlandırıldı",
  "integrations.updated": "Entegrasyon ayarları güncellendi",
  "credit_order.created": "Kredi siparişi oluşturuldu",
  "credit_order.cancelled": "Kredi siparişi iptal edildi",
  "credit_payment.paid": "Ödeme alındı",
  "credit_payment.failed": "Ödeme başarısız oldu",
  "credit_payment.refund_requested": "İade talebi oluşturuldu",
  "credit_payment.refund_request_rejected": "İade talebi reddedildi",
  "credit_payment.reversal_requested": "İade işlemi başlatıldı",
  "credit_payment.reversed": "İade tamamlandı",
  "credit_payment.reversal_failed": "İade gerçekleşmedi",
  "credit_payment.bank_response": "Banka iade yanıtı",
  "credit_payment.bank_transfer_requested": "Havale ödeme bildirimi oluşturuldu",
  "credit_payment.bank_transfer_approved": "Havale ödemesi onaylandı",
  "credit_payment.bank_transfer_rejected": "Havale ödemesi reddedildi",
  "payments.akbank_started": "Akbank ödemesi başlatıldı",
  "payments.nestpay_started": "Sanal POS ödemesi başlatıldı",
  "payments.akbank_callback_review": "Akbank ödeme dönüşü incelemeye alındı",
  "payments.akbank_paid_period_review": "Abonelik ödemesi incelemeye alındı",
  "payments.akbank_settings_updated": "Akbank ödeme ayarları güncellendi",
  "payments.settings_updated": "Ödeme ayarları güncellendi",
  "payments.confirmed_no_charge": "Ödeme alınmadığı doğrulandı",
  "subscription.stopped": "Abonelik durduruldu",
  "credit_period.created": "Kredi satış dönemi eklendi",
  "credit_period.archived": "Kredi satış dönemi arşivlendi",
  "credit_sales.plan_created": "Kredi paketi eklendi",
  "credit_sales.plan_updated": "Kredi paketi güncellendi",
  "credit_sales.plan_deleted": "Kredi paketi silindi",
  "credit_sales.settings_updated": "Kredi satış ayarları güncellendi",
  "agreement.created": "Anlaşma eklendi",
  "agreement.updated": "Anlaşma güncellendi",
  "agreement.cancelled": "Anlaşma iptal edildi",
  "agreement.reactivated": "Anlaşma yeniden etkinleştirildi",
  "agreement.deleted": "Anlaşma silindi",
  "agreement_type.created": "Anlaşma türü eklendi",
  "agreement_type.archived": "Anlaşma türü arşivlendi",
  "customer.parent_updated": "Müşterinin şirket bağlantısı güncellendi",
  "email.staff_sender_skipped": "Personel e-postası talebe dönüştürülmedi",
  "role.template_updated": "Rol şablonu güncellendi",
  TICKET_CREATED: "Görüşme oluşturuldu",
  TICKET_UPDATED: "Görüşme güncellendi",
  CONVERSATION_CREATED: "Görüşme oluşturuldu",
  CONVERSATION_UPDATED: "Görüşme güncellendi",
  MESSAGE_CREATED: "Mesaj eklendi",
  USER_CREATED: "Kullanıcı oluşturuldu",
  USER_UPDATED: "Kullanıcı güncellendi",
  DEPARTMENT_CREATED: "Departman oluşturuldu",
  DEPARTMENT_UPDATED: "Departman güncellendi",
  DEPARTMENT_ARCHIVED: "Departman silindi",
  TAG_CREATED: "Etiket oluşturuldu",
  TAG_UPDATED: "Etiket güncellendi",
  TAG_DELETED: "Etiket silindi",
  SETTINGS_UPDATED: "Ayarlar güncellendi",
  PROFILE_UPDATED: "Profil güncellendi",
  LOGIN: "Oturum açıldı",
  LOGOUT: "Oturum kapatıldı",
};
const fieldLabels: Record<string, string> = {
  name: "Ad soyad", email: "E-Posta", phone: "Telefon", company: "Şirket",
  staffNote: "Personel notu", extraPhones: "Ek telefonlar", extraEmails: "Ek e-postalar",
  isActive: "Hesap durumu", role: "Kullanıcı rolü", accessRoleId: "Yetki rolü",
  departmentIds: "Departmanlar", departmentId: "Departman", assignedAgentId: "Atanan personel",
  status: "Durum", priority: "Öncelik", websiteId: "Proje", websiteUrl: "Proje adresi",
  subject: "Konu", title: "Başlık", body: "Metin", color: "Renk", sortOrder: "Sıralama",
  tagIds: "Etiketler", permissions: "İzinler", scope: "Yetki kapsamı", skills: "Yetenekler",
  description: "Açıklama", smtpEnabled: "E-Posta gönderimi", imapEnabled: "E-Posta alımı",
  smsEnabled: "SMS entegrasyonu", whatsappEnabled: "WhatsApp entegrasyonu",
};
const channelLabels: Record<string, string> = { NOTIFICATION: "Sistem bildirimi", EMAIL: "E-Posta", SMS: "SMS", WHATSAPP: "WhatsApp" };
const sensitiveField = (field: string) => /password|token|secret/i.test(field);
export function activityActionLabel(action: string, metadata?: ActivityLog["metadata"]): string {
  if (action === "conversation.channel_reply_sent") {
    if (metadata?.channel === "WHATSAPP") return "WhatsApp gönderimi Meta tarafından kabul edildi";
    if (metadata?.channel === "SMS") return "SMS gönderimi Netgsm tarafından kabul edildi";
  }
  if (action === "conversation.channel_reply_failed") {
    if (metadata?.channel === "SMS") return "SMS gönderilemedi";
    if (metadata?.channel === "WHATSAPP") return "WhatsApp mesajı gönderilemedi";
  }
  const kind = (metadata as Record<string, unknown> | null | undefined)?.kind;
  if (action === "credit_payment.reversal_requested" && kind === "CANCEL") return "Ödeme iptali başlatıldı";
  if (action === "credit_payment.reversed" && kind === "CANCEL") return "Ödeme iptali tamamlandı";
  if (action === "payments.settings_updated" && (metadata as Record<string, unknown> | null | undefined)?.provider === "iyzico") return "iyzico ödeme ayarları güncellendi";
  return actionLabels[action] ?? "Sistem işlemi";
}

type Detail = Record<string, any>;
const providerNames: Record<string, string> = {
  akbank: "Akbank", iyzico: "iyzico", bank_transfer: "Havale / EFT", isbank: "İş Bankası", ziraat: "Ziraat Bankası",
  halkbank: "Halkbank", teb: "TEB", sekerbank: "Şekerbank", ing: "ING", anadolubank: "Anadolubank",
};
const modeLabels: Record<string, string> = { sandbox: "Test", production: "Canlı" };
function money(amount: unknown, currency?: unknown) {
  if (amount === undefined || amount === null || amount === "") return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  return `${value.toFixed(2).replace(".", ",")} ${typeof currency === "string" && currency ? currency : "TRY"}`;
}
const clean = (parts: unknown[]) => parts.filter(Boolean).join(" · ");
/** Payment, credit, agreement and similar system actions. Returns null for actions handled elsewhere. */
function financeDescription(log: ActivityLog): string | null {
  const m = (log.metadata ?? {}) as Detail;
  const action = log.action;
  const order = m.orderNumber !== undefined ? `Sipariş no: #${m.orderNumber}` : null;
  const total = money(m.amount ?? m.total, m.currency);
  const credits = m.credits !== undefined && m.credits !== null ? `Kredi: ${m.credits}` : null;
  const provider = providerNames[String(m.provider)] ?? "Ödeme sağlayıcısı";
  const cancel = m.kind === "CANCEL";
  const reasonText = typeof m.reason === "string" && m.reason.trim() ? `Neden: ${m.reason.trim()}` : null;
  switch (action) {
    case "credit_order.created":
      return clean([m.number !== undefined && `Sipariş no: #${m.number}`, money(m.total, m.currency) && `Tutar: ${money(m.total, m.currency)}`, credits]) || "Kredi siparişi oluşturuldu.";
    case "credit_order.cancelled":
      return clean([order, "Ödeme bekleyen sipariş iptal edildi"]);
    case "payments.akbank_started":
      return clean(["Akbank ile ödeme başlatıldı", order, total && `Tutar: ${total}`]);
    case "payments.nestpay_started":
      return clean([`${provider} ile ödeme başlatıldı`, order, total && `Tutar: ${total}`]);
    case "credit_payment.paid":
      return clean([`${provider} ödemesi doğrulandı`, order, total && `Tutar: ${total}`]);
    case "credit_payment.failed":
      return clean([`${provider} ödemesi başarısız oldu`, order, total && `Tutar: ${total}`]);
    case "credit_payment.reversal_requested":
      return clean([cancel ? "Ödeme iptali bankaya iletildi" : "İade bankaya iletildi", order, total && `Tutar: ${total}`, m.credits ? `Geri alınan kredi: ${m.credits}` : null, reasonText]);
    case "credit_payment.reversed":
      return clean([cancel ? "Ödeme iptali bankada onaylandı" : "İade bankada onaylandı", order, total && `Tutar: ${total}`, m.credits ? `Geri alınan kredi: ${m.credits}` : null, typeof m.reference === "string" && m.reference ? `Banka referansı: ${m.reference}` : null]);
    case "credit_payment.reversal_failed": {
      const manual = m.reference === "MANUAL_NO_REFUND";
      return clean([manual ? "Yönetici bankada iade yapılmadığını doğruladı" : "Banka iadeyi gerçekleştirmedi", "ayrılan krediler geri verildi", order, total && `Tutar: ${total}`, !manual && m.reference ? `Hata kodu: ${m.reference}` : null]);
    }
    case "credit_payment.bank_transfer_requested":
      return clean(["Havale / EFT ödeme bildirimi gönderildi", order, total && `Tutar: ${total}`, reasonText]);
    case "credit_payment.bank_transfer_approved":
      return clean(["Havale / EFT ödemesi yönetici tarafından onaylandı", order, total && `Tutar: ${total}`]);
    case "credit_payment.bank_transfer_rejected":
      return clean(["Havale / EFT ödemesi reddedildi", order, total && `Tutar: ${total}`, reasonText]);
    case "credit_payment.bank_response": {
      const headline = m.outcome === "REJECTED" ? "Banka iade isteğini reddetti" : m.outcome === "NO_RESPONSE" ? "Bankadan yanıt alınamadı, sonuç sorgulanacak" : "Banka kesin sonuç bildirmedi, sonuç sorgulanacak";
      return clean([headline, `Sağlayıcı: ${provider}`, order, total && `Tutar: ${total}`, m.bankResponseCode ? `Yanıt kodu: ${m.bankResponseCode}` : null, m.bankMessage ? `Banka mesajı: ${m.bankMessage}` : null]);
    }
    case "payments.akbank_callback_review":
      return clean(["Akbank ödeme dönüşü kontrol edildi", m.callbackVerified === false ? "Banka imzası doğrulanamadı" : null, m.bankResponseCode ? `Banka yanıt kodu: ${m.bankResponseCode}` : null]);
    case "payments.akbank_paid_period_review":
      return "Banka iptali doğrulandı, abonelik dönemi yönetici incelemesinde.";
    case "payments.akbank_settings_updated":
    case "payments.settings_updated":
      return clean([`Sağlayıcı: ${provider}`, m.mode ? `Mod: ${modeLabels[m.mode] ?? "Diğer"}` : null, m.enabled !== undefined ? `Durum: ${m.enabled ? "Etkin" : "Devre dışı"}` : null, m.credentialsChanged ? "Bağlantı bilgileri değiştirildi" : null]);
    case "payments.confirmed_no_charge":
      return clean(["Bankada çekim olmadığı doğrulandı", typeof m.providerReference === "string" && m.providerReference ? `Banka referansı: ${m.providerReference}` : null]);
    case "subscription.stopped":
      return "Abonelik ve otomatik yenileme durduruldu.";
    case "credit_period.created":
    case "credit_period.archived":
    case "credit_sales.plan_created":
    case "credit_sales.plan_updated":
    case "credit_sales.plan_deleted":
      return clean([m.name && `Ad: ${m.name}`, credits, money(m.price, m.currency) && `Fiyat: ${money(m.price, m.currency)}`]) || `${activityActionLabel(action)}.`;
    case "credit_sales.settings_updated":
      return "Kredi satış ayarları güncellendi.";
    case "agreement.created":
    case "agreement.updated": {
      const after = (m.after ?? m) as Detail;
      const before = (m.before ?? {}) as Detail;
      const changes = m.before ? [before.name !== after.name && `Ad: ${before.name} → ${after.name}`, before.credits !== after.credits && `Kredi: ${before.credits} → ${after.credits}`].filter(Boolean) : [];
      return clean([after.name && `Anlaşma: ${after.name}`, !m.before && after.credits !== undefined && `Kredi: ${after.credits}`, ...changes]) || `${activityActionLabel(action)}.`;
    }
    case "agreement.cancelled":
    case "agreement.reactivated":
    case "agreement.deleted":
      return `${activityActionLabel(action)}.`;
    case "agreement_type.created":
      return m.name ? `Tür: ${m.name}` : `${activityActionLabel(action)}.`;
    case "agreement_type.archived":
      return `${activityActionLabel(action)}.`;
    case "customer.parent_updated":
      return m.createdCustomerId ? "Şirkete yeni bağlı kişi eklendi." : m.parentCustomerId ? "Müşteri bir şirkete bağlandı." : "Müşterinin şirket bağlantısı kaldırıldı.";
    case "email.staff_sender_skipped":
      return clean([m.sender && `Gönderen: ${m.sender}`, m.reason && `Neden: ${m.reason}`]) || `${activityActionLabel(action)}.`;
    case "role.template_updated":
      return m.name ? `Şablon: ${m.name}` : `${activityActionLabel(action)}.`;
    default:
      return null;
  }
}
function fieldLabel(field: string) {
  return fieldLabels[field] ?? "Diğer bilgiler";
}
export function activityValueLabel(value: unknown): string {
  if (value === null || value === undefined || value === '') return "Boş";
  if (typeof value === 'boolean') return value ? "Etkin" : "Devre dışı";
  if (Array.isArray(value)) return value.map(activityValueLabel).join(', ') || "Boş";
  if (typeof value === 'object') return "Güncellendi";
  const labels: Record<string, string> = {
    ADMIN: "Yönetici", SUPERVISOR: "Departman sorumlusu", AGENT: "Destek personeli", CUSTOMER: "Müşteri",
    OPEN: "Açık", PENDING: "Beklemede", IN_PROGRESS: "İşlemde", RESOLVED: "Çözüldü", CLOSED: "Kapalı",
    LOW: "Düşük", NORMAL: "Normal", HIGH: "Yüksek", URGENT: "Acil",
    ALL: "Tüm kayıtlar", DEPARTMENT: "Kendi departmanı", ASSIGNED: "Atanan kayıtlar",
    TICKET: "Telefon talebi", LIVE_CHAT: "Canlı sohbet", ...channelLabels,
  };
  return labels[String(value)] ?? String(value);
}
export function richDescriptionFor(log: ActivityLog) {
  const finance = financeDescription(log);
  if (finance) return finance;
  const metadata = log.metadata;
  if (log.action === "conversation.channel_reply_failed" || log.action === "conversation.whatsapp_failed") {
    const channel = metadata?.channel === "SMS" ? "SMS" : metadata?.channel === "WHATSAPP" ? "WhatsApp" : "Kanal mesajı";
    const provider = metadata?.channel === "SMS" ? "Netgsm" : metadata?.channel === "WHATSAPP" ? "Meta/WhatsApp" : "mesaj sağlayıcısı";
    const context = [
      metadata?.subject && `Konu: ${metadata.subject}`,
      metadata?.number && `Talep no: #TK-${String(metadata.number).padStart(5, "0")}`,
      metadata?.recipient && `Alıcı: ${metadata.recipient}`,
      metadata?.originalName && `Dosya: ${metadata.originalName}`,
      metadata?.providerMessageId && `Sağlayıcı mesaj no: ${metadata.providerMessageId}`,
      metadata?.providerTimestamp && `WhatsApp bildirim zamanı: ${new Date(metadata.providerTimestamp).toLocaleString('tr-TR')}`,
    ].filter(Boolean).join(" · ");
    const reason = metadata?.reason?.trim();
    return [log.action === "conversation.whatsapp_failed" ? "WhatsApp mesajı alıcıya teslim edilemedi." : `${channel} gönderimi başarısız oldu.`, reason ? `${provider} yanıtı: ${reason}` : "Sağlayıcı hata açıklaması bildirmedi.", context].filter(Boolean).join(" ");
  }
  const details = [
    log.action === "conversation.channel_reply_sent" && "Gönderim isteği sağlayıcı tarafından kabul edildi. Alıcıya teslim edildiği henüz doğrulanmadı.",
    log.action.startsWith('conversation.whatsapp_') && log.action !== 'conversation.whatsapp_received' && activityActionLabel(log.action),
    metadata?.providerMessageId && `Sağlayıcı mesaj no: ${metadata.providerMessageId}`,
    metadata?.providerTimestamp && `WhatsApp bildirim zamanı: ${new Date(metadata.providerTimestamp).toLocaleString('tr-TR')}`,
    metadata?.details?.join(" · "),
    metadata?.name && `Ad: ${metadata.name}`,
    metadata?.title && `Başlık: ${metadata.title}`,
    metadata?.subject && `Konu: ${metadata.subject}`,
    metadata?.number && `Talep no: #TK-${String(metadata.number).padStart(5, "0")}`,
    metadata?.phone && `Telefon: ${metadata.phone}`,
    metadata?.email && `E-Posta: ${metadata.email}`,
    metadata?.company && `Şirket: ${metadata.company}`,
    metadata?.recipientCount !== undefined && `Alıcı sayısı: ${metadata.recipientCount}`,
    metadata?.channels?.length && `Kanallar: ${metadata.channels.map(channel => channelLabels[channel] ?? "Diğer kanal").join(', ')}`,
    metadata?.fields?.length && `Güncellenen alanlar: ${[...new Set(metadata.fields.filter(field => !sensitiveField(field)).map(fieldLabel))].join(', ') || "Profil bilgileri"}`,
    metadata?.changes && Object.entries(metadata.changes).filter(([field]) => !sensitiveField(field)).map(([field, change]) => `${fieldLabel(field)}: ${activityValueLabel(change.from)} → ${activityValueLabel(change.to)}`).join(" · "),
    metadata?.originalName && `Dosya: ${metadata.originalName}`,
    metadata?.recipient && `Alıcı: ${metadata.recipient}`,
    metadata?.senderEmail && `Gönderen: ${metadata.senderEmail}`,
    metadata?.reason && `${log.action === 'conversation.email_sent' ? 'İşlem' : log.action === 'credit_payment.refund_requested' ? 'İade talebi nedeni' : log.action === 'credit_payment.refund_request_rejected' ? 'Ret gerekçesi' : log.action.startsWith('credit_payment.') ? 'Neden' : 'Hata'}: ${metadata.reason}`,
    metadata?.attachmentCount && `Ek dosya sayısı: ${metadata.attachmentCount}`,
    metadata?.deletedConversationCount !== undefined && `Silinen talep sayısı: ${metadata.deletedConversationCount}`,
  ].filter(Boolean).join(" · ");
  if (details) return details;
  if (log.action === "customer.file_deleted") return [metadata?.customerName && `Müşteri: ${metadata.customerName}`, metadata?.originalName && `Silinen dosya: ${metadata.originalName}`].filter(Boolean).join(" · ") || "Müşteri dosyası silindi.";
  if (log.action === "conversation.replied") return metadata?.attachmentCount ? `Yanıt ve ${metadata.attachmentCount} ek dosya gönderildi.` : "Talebe yanıt gönderildi.";
  if (log.action === "conversation.email_sent") return metadata?.recipient ? `Alıcı: ${metadata.recipient}` : "E-Posta gönderildi.";
  if (log.action === "conversation.email_received") return "Müşteriden e-posta alındı.";
  if (log.action === "conversation.email_failed") return metadata?.reason ? `Gönderilemedi: ${metadata.reason}` : "E-Posta gönderilemedi.";
  return `${activityActionLabel(log.action)}.`;
}

