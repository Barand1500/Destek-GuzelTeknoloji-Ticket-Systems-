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
  metadata?: { name?: string; customerName?: string | null; title?: string; subject?: string; number?: number; code?: string; phone?: string | null; email?: string | null; company?: string | null; fields?: string[]; changes?: Record<string, { from?: unknown; to?: unknown }>; originalName?: string; recipient?: string; reason?: string; attachmentCount?: number; deletedConversationCount?: number; recipientCount?: number; channels?: string[]; channel?: string; senderEmail?: string } | null;
};
export const actionLabels: Record<string, string> = {
  "profile.updated": "Profil bilgileri güncellendi",
  "survey.created": "Anket oluşturuldu",
  "survey.closed": "Anket kapatıldı",
  "announcement.created": "Duyuru oluşturuldu",
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
  "department.updated": "Departman güncellendi",
  "department.archived": "Departman silindi",
  "website.created": "Proje oluşturuldu",
  "website.updated": "Proje güncellendi",
  "website.deleted": "Proje silindi",
  "conversation.created": "Talep oluşturuldu",
  "conversation.claimed": "Talep üstlenildi",
  "conversation.deleted": "Talep silindi",
  "conversation.email_received": "E-posta alındı",
  "conversation.replied": "Talebe yanıt verildi",
  "conversation.note_added": "Dahili not eklendi",
  "conversation.email_sent": "E-posta gönderildi",
  "conversation.email_failed": "E-posta gönderilemedi",
  "conversation.updated": "Talep bilgileri güncellendi",
  "customer.file_deleted": "Müşteri dosyası silindi",
  "integrations.updated": "Entegrasyon ayarları güncellendi",
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
  name: "Ad soyad", email: "E-posta", phone: "Telefon", company: "Şirket",
  staffNote: "Personel notu", extraPhones: "Ek telefonlar", extraEmails: "Ek e-postalar",
  isActive: "Hesap durumu", role: "Kullanıcı rolü", accessRoleId: "Yetki rolü",
  departmentIds: "Departmanlar", departmentId: "Departman", assignedAgentId: "Atanan personel",
  status: "Durum", priority: "Öncelik", websiteId: "Proje", websiteUrl: "Proje adresi",
  subject: "Konu", title: "Başlık", body: "Metin", color: "Renk", sortOrder: "Sıralama",
  tagIds: "Etiketler", permissions: "İzinler", scope: "Yetki kapsamı", skills: "Yetenekler",
  description: "Açıklama", smtpEnabled: "E-posta gönderimi", imapEnabled: "E-posta alımı",
  smsEnabled: "SMS entegrasyonu", whatsappEnabled: "WhatsApp entegrasyonu",
};
const channelLabels: Record<string, string> = { NOTIFICATION: "Sistem bildirimi", EMAIL: "E-posta", SMS: "SMS", WHATSAPP: "WhatsApp" };
const sensitiveField = (field: string) => /password|token|secret/i.test(field);
export function activityActionLabel(action: string, metadata?: ActivityLog["metadata"]): string {
  if (action === "conversation.channel_reply_failed") {
    if (metadata?.channel === "SMS") return "SMS gönderilemedi";
    if (metadata?.channel === "WHATSAPP") return "WhatsApp mesajı gönderilemedi";
  }
  return actionLabels[action] ?? "Sistem işlemi";
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
    TICKET: "Destek talebi", LIVE_CHAT: "Canlı sohbet", ...channelLabels,
  };
  return labels[String(value)] ?? String(value);
}
export function richDescriptionFor(log: ActivityLog) {
  const metadata = log.metadata;
  if (log.action === "conversation.channel_reply_failed") {
    const channel = metadata?.channel === "SMS" ? "SMS" : metadata?.channel === "WHATSAPP" ? "WhatsApp" : "Kanal mesajı";
    const provider = metadata?.channel === "SMS" ? "Netgsm" : metadata?.channel === "WHATSAPP" ? "Meta/WhatsApp" : "mesaj sağlayıcısı";
    const context = [
      metadata?.subject && `Konu: ${metadata.subject}`,
      metadata?.number && `Talep no: #TK-${String(metadata.number).padStart(5, "0")}`,
    ].filter(Boolean).join(" · ");
    const reason = metadata?.reason?.trim();
    return [`${channel} gönderimi başarısız oldu.`, reason && `${provider} yanıtı: ${reason}`, context].filter(Boolean).join(" ");
  }
  const details = [
    metadata?.name && `Ad: ${metadata.name}`,
    metadata?.title && `Başlık: ${metadata.title}`,
    metadata?.subject && `Konu: ${metadata.subject}`,
    metadata?.number && `Talep no: #TK-${String(metadata.number).padStart(5, "0")}`,
    metadata?.phone && `Telefon: ${metadata.phone}`,
    metadata?.email && `E-posta: ${metadata.email}`,
    metadata?.company && `Şirket: ${metadata.company}`,
    metadata?.recipientCount !== undefined && `Alıcı sayısı: ${metadata.recipientCount}`,
    metadata?.channels?.length && `Kanallar: ${metadata.channels.map(channel => channelLabels[channel] ?? "Diğer kanal").join(', ')}`,
    metadata?.fields?.length && `Güncellenen alanlar: ${[...new Set(metadata.fields.filter(field => !sensitiveField(field)).map(fieldLabel))].join(', ') || "Profil bilgileri"}`,
    metadata?.changes && Object.entries(metadata.changes).filter(([field]) => !sensitiveField(field)).map(([field, change]) => `${fieldLabel(field)}: ${activityValueLabel(change.from)} → ${activityValueLabel(change.to)}`).join(" · "),
    metadata?.originalName && `Dosya: ${metadata.originalName}`,
    metadata?.recipient && `Alıcı: ${metadata.recipient}`,
    metadata?.senderEmail && `Gönderen: ${metadata.senderEmail}`,
    metadata?.reason && `Hata: ${metadata.reason}`,
    metadata?.attachmentCount && `Ek dosya sayısı: ${metadata.attachmentCount}`,
    metadata?.deletedConversationCount !== undefined && `Silinen talep sayısı: ${metadata.deletedConversationCount}`,
  ].filter(Boolean).join(" · ");
  if (details) return details;
  if (log.action === "customer.file_deleted") return [metadata?.customerName && `Müşteri: ${metadata.customerName}`, metadata?.originalName && `Silinen dosya: ${metadata.originalName}`].filter(Boolean).join(" · ") || "Müşteri dosyası silindi.";
  if (log.action === "conversation.replied") return metadata?.attachmentCount ? `Yanıt ve ${metadata.attachmentCount} ek dosya gönderildi.` : "Talebe yanıt gönderildi.";
  if (log.action === "conversation.email_sent") return metadata?.recipient ? `Alıcı: ${metadata.recipient}` : "E-posta gönderildi.";
  if (log.action === "conversation.email_received") return "Müşteriden e-posta alındı.";
  if (log.action === "conversation.email_failed") return metadata?.reason ? `Gönderilemedi: ${metadata.reason}` : "E-posta gönderilemedi.";
  return `${activityActionLabel(log.action)}.`;
}

