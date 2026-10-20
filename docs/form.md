# Form kanalı

Form; ayrı sayfa, paylaşım bağlantısı ve iframe olarak aynı adresi kullanır:
`https://destek.guzelteknoloji.com/form/destek`.

## Sunucuya aktarma

Güncel backend/frontend kaynaklarını ve
`backend/prisma/mysql/migrations/20261019120000_form_channel/` ve
`backend/prisma/mysql/migrations/20261019140000_form_login_code/` klasörlerini aktarın.
Sunucuda **backend klasöründen** sırasıyla:

```sh
npm run db:migrate
npm run build
```

Backend sürecini yeniden başlatın. Güncel frontend derlemesini de yayınlayın.
`FRONTEND_URL=https://destek.guzelteknoloji.com` olmalı; takip bağlantıları bu
ayardaki adresle oluşturulur. Turnstile açıksa yeni `form_submit` ve `form_access`
işlemleri de aynı widget ile doğrulanır.

**Entegrasyonlar → Form** bölümünden formu etkinleştirin ve sol alttaki
**Kaydet** düğmesine basın. Bu kaydetme diğer kanal ayarlarından
bağımsızdır. E-Posta (SMTP) gönderimi ayarlanmış olmalıdır.

## Kullanım

- Alanlar: ad soyad, e-posta, telefon, firma/şirket, departman, konu, açıklama, dosyalar.
  Telefon, şirket ve dosyalar isteğe bağlıdır. Kısa konu kabul edilir; boş konu edilmez.
- Entegrasyonlar'dan bağlantı veya iframe kodunu kopyalayın.
- Talep gelen kutusunda **Form** kanalında görünür.
- Departmanı müşteri formda seçer. Yalnız aktif ve silinmemiş departmanlar gösterilir.
  Departman seçimi zorunludur; pasif, silinmiş veya bulunmayan departmana talep açılamaz.
  Entegrasyon ayarındaki eski sabit departman alanı kullanılmaz. Bu düzeltme için ek migration gerekmez.
- E-posta eşleşirse mevcut müşteri kullanılır; profil bilgileri üzerine yazılmaz.
  Formda verilen bilgiler talebe ayrıca kaydedilir. Konuşmada mevcut müşteri bilgi satırı kullanılır.
  Paylaşılan adres belirsizse rastgele bir müşterinin kaydı seçilmez.
- Müşterinin şifre belirlemesi gerekmez. E-postasına yalnız ilgili talebi açan
  güvenli bağlantı gönderilir. Bağlantı 7 gün geçerlidir; **Talebimi Takip Et**
  ekranında talep no ve e-posta ile yenisi istenir. Var olmayan bilgiler için de
  aynı genel yanıt gösterilir.
- **Giriş Yap** seçeneğinde müşteri talep no ve e-postasını yazar. E-postasına
  tek kullanımlık 6 haneli kod gönderilir; kod doğrulanınca yalnız o talep açılır.
  Kod 10 dakika geçerlidir, 5 yanlış denemede kullanılamaz. Yeni kod eskisini
  geçersiz kılar. Talep başına saatte en fazla 5 kod gönderilir; isteklerde aynı
  genel yanıt gösterilir. Kodlar veritabanında gizli anahtarlı hash olarak tutulur.
  Doğrulama normal müşteri/personel hesabında oturum açmaz ve başka talepleri açmaz.
- Personel mevcut konuşma ekranından yanıtlar; müşteri takip ekranından veya
  e-postaya yanıt vererek devam eder. E-posta yanıtları için IMAP bağlantısı açık
  olmalı ve **Mevcut Talebe Yanıt Ekle** etkin olmalıdır.
- E-posta yanıtı yeni bir talep oluşturmaz; Form talebine eklenir. Kanal Form kalır.
- Takip ekranı yalnız gönderilirken **Form** kanalı seçilmiş personel yanıtlarını
  ve bunların dosyalarını gösterir. Yalnız E-Posta/SMS/WhatsApp/Telefon seçilen
  yanıtlar burada görünmez. Sonradan kanal değiştirmek eski yanıtları açmaz veya
  gizlemez. Müşteri mesajları görünmeye devam eder.
- `20261019160000_form_message_visibility` migration'ı eski personel yanıtlarının
  Form görünürlüğünü kayıtlı gönderim işindeki takip bağlantısından belirler.
  Canlıda backend'i açmadan önce `npm run db:migrate` ve `npm run build` çalıştırın.
- Müşteri yalnız açık mesajları ve bunların dosyalarını görür; dahili notları,
  işlem geçmişini, personel iletişim bilgilerini ve diğer talepleri göremez.
- Form/takip ekranında en fazla 3 dosya; her biri en fazla 5 MB veya sunucunun
  daha düşük dosya sınırı kabul edilir. Dosya türü ve gerçek içeriği doğrulanır.
- Talep, dosyalar ve e-posta işi işlem içinde kaydedilir; gönderimler mevcut
  kalıcı kuyruktan devam eder. Sunucu yeniden başlasa da takip bağlantıları korunur.
- Formu kapatmak yeni gönderimleri durdurur; mevcut takip bağlantıları çalışır.
- IP ve e-posta başına gönderim sınırları uygulanır. Bağlantı anahtarları veritabanında
  hash olarak tutulur; bağlantılar özel bilgidir ve başkalarıyla paylaşılmamalıdır.

## iframe ve sunucu başlıkları

Frontend sunucusu `/form/destek` ve `/form/talep` yollarını SPA'nın `index.html`
dosyasına yönlendirmelidir. Bu zaten diğer uygulama sayfalarının kullandığı davranıştır.

Başka sitedeki iframe yalnız **form sayfasını** açar; backend'e harici CORS izni
vermek veya giriş cookie'si paylaşmak gerekmez. Dış sitenin CSP'si de destek
alan adının `frame-src` içinde açılmasına izin vermelidir.

Sunucu genelinde `X-Frame-Options: DENY/SAMEORIGIN` veya CSP `frame-ancestors 'self'`
varsa başka sitede iframe engellenir. Yalnız `/form/destek` için bu engeli kaldırıp
`frame-ancestors` içine formu gömecek sitenin tam origin'ini ekleyin. Yönetim ve
talep takip sayfalarının çerçeve korumasını kaldırmayın. API'deki Helmet ayarlarını
genel olarak gevşetmeyin. Bu başlıklar üretim sunucusunun yapılandırmasına bağlıdır.

Yerelde ve tarayıcı testlerinde form/konuşma ve iframe davranışı doğrulanır;
canlı SMTP teslimatı ve sunucunun iframe başlıkları yayınlama sonrası ayrıca doğrulanmalıdır.
