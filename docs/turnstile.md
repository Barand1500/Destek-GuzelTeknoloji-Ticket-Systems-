# Giriş ekranında bot doğrulaması

Turnstile; giriş, kayıt API'si ve şifre sıfırlama kodu isteme işlemlerini korur.
Mevcut uygulamada ayrı bir kayıt ekranı yoktur. Kod doğrulama ve yeni şifreyi
kaydetme işlemleri mevcut tek kullanımlık kod/token ve deneme sınırlarını kullanır.

## Sunucuda etkinleştirme

1. Cloudflare panelinde **Turnstile → Add widget** seçin.
2. Hostname olarak `destek.guzelteknoloji.com` ekleyin ve **Managed** türünü seçin.
3. Site Key ve Secret Key değerlerini sunucudaki `backend/.env` dosyasına yazın:

```dotenv
TURNSTILE_ENABLED=true
TURNSTILE_SITE_KEY=BURAYA_SITE_KEY
TURNSTILE_SECRET_KEY=BURAYA_SECRET_KEY
FRONTEND_URL=https://destek.guzelteknoloji.com
```

4. Güncel backend ve frontend dosyalarını aktarın. Backend klasöründe
   `npm run build` çalıştırın ve backend sürecini yeniden başlatın.
   Güncel frontend derlemesini yayınlayın ve giriş sayfasını yenileyin.

Secret Key yalnız backend'de tutulur; frontend dosyalarına, Git'e veya sohbete
eklenmez. Frontend, etkinlik durumunu ve herkese açık Site Key'i
`GET /api/v1/auth/security` üzerinden alır; frontend için ayrı anahtar gerekmez.
Bu özellik veritabanı migration'ı gerektirmez.

## Davranış

- Anahtarlar hazırlanana kadar `TURNSTILE_ENABLED=false` bırakılır; koruma henüz aktif değildir.
- Etkinleştirildiğinde iki anahtardan biri eksikse backend açıklayıcı yapılandırma hatasıyla başlamaz.
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
