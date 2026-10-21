# Giriş ekranında bot doğrulaması

Turnstile; giriş, kayıt API'si, şifre sıfırlama kodu isteme ve Form işlemlerini korur.
Mevcut uygulamada ayrı bir kayıt ekranı yoktur. Kod doğrulama ve yeni şifreyi
kaydetme işlemleri mevcut tek kullanımlık kod/token ve deneme sınırlarını kullanır.

## Sunucuda etkinleştirme

1. Cloudflare panelinde **Turnstile → Add widget** seçin.
2. Hostname olarak `destek.guzelteknoloji.com` ekleyin ve **Managed** türünü seçin.
3. Güncel kaynakları ve `backend/prisma/mysql/migrations/20261021120000_turnstile_panel_settings/`
   klasörünü sunucuya aktarın. Backend klasöründe çalıştırın:

```sh
npm run db:migrate
npm run build
```

4. Backend'i yeniden başlatın ve güncel frontend derlemesini yayınlayın.
5. **Entegrasyonlar → Cloudflare** sekmesinde Site Key ve Secret Key değerlerini
   girin, **Doğrulamayı Etkinleştir** seçeneğini açın ve sol alttan **Kaydet**'e basın.
   Sonraki panel değişiklikleri yeniden başlatma veya derleme gerektirmez.

Yeni kurulumlarda Turnstile anahtarlarını `.env` dosyasına yazmak gerekmez.
Mevcut `TURNSTILE_*` ayarları, panelden ilk kayıt yapılana kadar kullanılır.
İlk kayıttan sonra etkinlik durumu dahil panel ayarı önceliklidir; panelden kapatmak
`.env` açık olsa bile doğrulamayı kapatır. `FRONTEND_URL` gerçek site adresini göstermelidir.

Secret Key AES-256-GCM ile veritabanında şifreli saklanır. Entegrasyonları düzenleme
yetkisi olan kullanıcılar göz simgesiyle kayıtlı anahtarı görüntüleyebilir; bu istek
önbelleğe alınmaz. Secret Key alanını boş bırakmak mevcut anahtarı korur.
Şifreleme mevcut `JWT_ACCESS_SECRET` değerinden türetilir; bu sunucu anahtarı değiştirilirse
Cloudflare Secret Key panelden yeniden girilmelidir.
Secret Key frontend dosyalarına, Git'e veya sohbete
eklenmez. Frontend, etkinlik durumunu ve herkese açık Site Key'i
`GET /api/v1/auth/security` üzerinden alır; frontend için ayrı anahtar gerekmez.
Yalnız `integrations.view` yetkililer ayarı görebilir; değiştirmek için
`integrations.update` gerekir. İşlem geçmişine anahtar değerleri yazılmaz.

## Davranış

- Anahtarlar hazırlanana kadar panelde doğrulama kapalı bırakılır.
- Panelden açılırken iki anahtardan biri eksikse kayıt reddedilir. Canlı ortamda
  Cloudflare test anahtarlarıyla etkinleştirme reddedilir.
- Etkin ayar her doğrulamada veritabanından okunur. Önceden açık giriş/Form ekranları
  ayarı 30 saniyede bir ve pencereye dönüldüğünde yeniler.
- Aktifken token eksik/geçersiz/süresi dolmuşsa işlem reddedilir.
- Doğrulama sırasında Cloudflare'a ulaşılamazsa koruma atlanmaz; kullanıcı yeniden dener.
- Doğrulanan hostname, izinli frontend hostname'iyle; action ise işlemle eşleşmelidir.
- Token tek kullanımlıktır. Başarısız girişten veya kod gönderiminden sonra widget yenilenir.
- Mevcut istek sınırları korunur. Bu özellik iki aşamalı doğrulama değildir.

Sunucuda HTML için CSP tanımlıysa `script-src` ve `frame-src` kuralları
`https://challenges.cloudflare.com` adresine izin vermelidir. Widget yüklenemiyorsa
giriş sayfası hata ve yeniden deneme düğmesi gösterir.

Resmî kaynaklar: [kurulum](https://developers.cloudflare.com/turnstile/get-started/),
[backend doğrulaması](https://developers.cloudflare.com/turnstile/get-started/server-side-validation/),
[CSP](https://developers.cloudflare.com/turnstile/reference/content-security-policy/).
