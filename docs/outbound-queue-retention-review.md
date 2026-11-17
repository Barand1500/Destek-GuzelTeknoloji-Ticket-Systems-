# Gönderim kuyruğu saklama incelemesi — 17 Kasım 2026

Kapsam: salt okunur kod incelemesi. Kuyruk, talep, mesaj, ek, log veya dış sağlayıcı eşleştirmesi silinmedi/değiştirilmedi. Henüz otomatik temizlik uygulanmıyor.

## Sonuç

Bütün kuyruk gövdeleri başka bir tablonun birebir kopyası değildir. Genel bir payload temizliği şu an güvenli kabul edilemez. Önceki “yalnızca ikinci kopya” açıklaması talep mesajının kendisi için geçerlidir; gönderilen bildirimin tam metni için her zaman geçerli değildir.

## İçerik nerede?

- Personelin talep yanıtı: ConversationMessage.body, yazarı, tarihi ve ConversationAttachment kayıtları asıl konuşmadır. Kredi/talep durumu bundan bağımsızdır. Bunlara dokunulmaz.
- Gönderilen e-posta: conversations.service enqueueConversationMessages yanıtı bildirim şablonu, iletişim imzası ve bazen form bağlantısıyla birleştirir. OutboundMessage.payload.text/subject o anda gönderilen tam gövdeyi tutar. Mevcut ActivityLog tam gövdeyi saklamaz. Şablon sonradan değişirse eski e-postanın birebir metni konuşmadan yeniden üretilemez.
- Karşılama, form takip/alındı, anket bildirimi ve müşteri/form giriş kodu e-postaları: hepsi ayrı ConversationMessage değildir. Bazılarının tam gönderim metni yalnızca kuyrukta bulunur. Giriş kodu challenge tablosunda hash olarak saklanır; bildirim metniyle aynı şey değildir.
- Ekler: EMAIL payload içinde dosya yolu/adı/türü vardır, dosya baytları JSON içinde değildir. Bu alanları temizlemek fiziksel dosyayı silmez; dosya temizliği ayrı işlemdir ve bu çalışma kapsamında yapılmadı.

## Takip ve idempotency bağımlılıkları

- OutboundMessage.id, dedupeKey, channel, conversationId, userId, status, attempts, providerMessageId, timestamps ve hata bilgileri ayrı amaçlarla tutulur. dedupeKey ile upsert tekrarlanan işi yeniden göndermeyi engeller; satırın tamamen silinmesi bu korumayı kaybettirebilir.
- ActivityLog: teslim sonucu, alıcı, outboundJobId, SMTP kabul/yanıt bilgileri, providerMessageId ve hata nedeni içerir. Tickets.tsx işlem geçmişi bunları gösterir; log ekranları kuyruk payload.text değerini okuyup mesaj gövdesi göstermiyor.
- WhatsApp callback: integrations.service güncel işlem logunu id/providerMessageId ile bulur, ExternalMessage kayıtlarıyla tekrarları önler ve bazı durumlarda OutboundMessage durumunu düzeltir. Bu loglar/eşleştirmeler silinmemelidir.
- PENDING/PROCESSING gönderimler payload'a ihtiyaç duyar. FAILED kayıtları da ileride tekrar denenecekse tam payload gerektirir. Bunlar otomatik sadeleştirmeye uygun kabul edilmedi.

## İleride güvenli bir yaklaşım

1. Önce geçmişte gönderilen tam içeriği saklamak isteniyor mu belirle. İsteniyorsa şablonun son halinden yeniden üretmek yerine gönderim anındaki subject/text/recipient/attachment kimliklerini kalıcı arşive kaydet.
2. Arşiv doğrulanmadan payload.text/subject silme. Kod ve geçici bağlantı bildirimlerini ayrı, açık saklama kurallarıyla ele al.
3. İş kimliği, dedupe ve sağlayıcı eşleştirmelerini koru; talep/mesaj/ek/işlem loglarına dokunma.
4. Ancak ardından terminal durumdaki uygun kayıtları küçük partilerle sadeleştir. Bu bir öneridir; uygulanmadı.

Kaynaklar: backend/src/services/outbound-queue.store.ts, outbound-queue.service.ts, conversations.service.ts (enqueueConversationMessages), mailer.service.ts, integrations.service.ts (recordWhatsappStatus), customer-email-login.service.ts, form-login.service.ts, forms.service.ts, management.service.ts (createCustomer), surveys.service.ts; frontend/src/features/tickets/Tickets.tsx (history metadata rendering).
