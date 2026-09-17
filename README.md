# Destek — Helpdesk

`proje.md` temel alınarak geliştirilen, tek şirket için destek talebi sistemi. İlk kilometre taşı gerçek PostgreSQL ve REST API üzerinde uygulanmıştır. V1'in tamamı henüz bitmiş değildir.

## Çalışan akış

Müşteri kayıt/giriş → talep oluşturma → admin veya departman sorumlusunun ataması → agent yanıtı → müşterinin yanıtı görmesi → çözümleme/kapatma.

- React, TypeScript, Vite, React Router, Axios, TanStack Query ve Tailwind CSS.
- Express 5, TypeScript, Prisma 7 ve PostgreSQL.
- bcrypt şifreleme, 15 dakikalık JWT erişim anahtarı, HTTP-only cookie içinde tek kullanımlık dönen yenileme anahtarı. Veritabanında yenileme anahtarının yalnızca SHA-256 özeti saklanır. Oturumun toplam ömrü 7 gündür; çıkış, mevcut JWT erişimini de iptal eder.
- ADMIN / SUPERVISOR / AGENT / CUSTOMER yetkileri API'de uygulanır. Her istekte güncel rol ve oturum kontrol edilir.
- Talep, mesaj ve dashboard sorgularında kullanıcı/departman sınırı. Müşteri yalnızca kendi kayıtlarını; agent yalnızca kendisine atananları; supervisor yalnızca kendi departmanlarını görür. Erişilemeyen talep 404 döner; kayıt varlığı açıklanmaz.
- Departmana uygun agent atama, durum/öncelik güncelleme, müşteri yanıtı ve dahili notlar. Dahili notlar müşteri API yanıtlarında ve mesaj sayılarında yer almaz.
- Sunucuda sayfalama, arama ve filtreleme; Türkçe `İ/i` dönüşümünü destekleyen normalleştirilmiş konu araması.
- Oluşturma, mesaj, atama ve durum değişikliklerinde aynı transaction içinde activity log.
- Masaüstü ve mobil giriş, kayıt, gelen kutusu, talep detayı, yeni talep ve gerçek veriden dashboard.

## Bu bilgisayarda hızlı başlatma

Bağımlılıklar, migration ve seed kurulmuştur. Projeye özel PostgreSQL verisi `.local/pgdata` içindedir; sunucu yalnızca `127.0.0.1:55432` adresini dinler. Diğer PostgreSQL veritabanları kullanılmaz.

```powershell
powershell -ExecutionPolicy Bypass -File scripts/database.ps1 start
npm run dev
```

- Uygulama: http://localhost:5173
- API: http://localhost:3000/api/v1
- Sağlık kontrolü: http://localhost:3000/api/health
- Admin ve agent giriş bilgileri: **`.local/accounts.txt`**. Şifreler rastgele üretilmiştir ve Git'e dahil değildir.
- Müşteri: giriş ekranındaki **Kayıt olun** bağlantısıyla yeni hesap oluşturun.

Akışı denemek için müşteri hesabıyla **Teknik Destek** departmanına bir talep açın. Ayrı tarayıcı oturumunda admin ile giriş yapın, talep detayında **Destek Uzmanı** kişisini atayın. Agent hesabında gelen kutusundan talebi yanıtlayın. Aynı tarayıcıdaki sekmeler ortak cookie kullanır; farklı hesapları ayrı tarayıcı profili veya gizli pencerede deneyin.

Uygulamayı durdurmak için terminalde `Ctrl+C`. Yalnızca projeye ait veritabanını durdurmak için:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/database.ps1 stop
```

## Yeni ortam kurulumu

Node.js 22.12+ ve PostgreSQL 16+ gerekir. Kendi PostgreSQL sunucunuzu kullanabilirsiniz:

```powershell
npm ci
Copy-Item backend/.env.example backend/.env
# backend/.env içindeki DATABASE_URL, JWT_ACCESS_SECRET ve seed hesaplarını düzenleyin.
npm run db:generate
npm run db:migrate
npm run db:seed
npm run dev
```

`.env.example` şifre ve secret alanları örnektir; gerçek değerler ile değiştirilmelidir. `db:seed` var olan hesapların şifresini veya rolünü değiştirmez.

Bu projedeki gibi ayrı bir Windows geliştirme veritabanı için, `.env` oluşturmadan önce:

```powershell
powershell -ExecutionPolicy Bypass -File scripts/setup-local.ps1
& 'C:/Program Files/PostgreSQL/16/bin/initdb.exe' -D .local/pgdata -U helpdesk --auth=scram-sha-256 --pwfile=.local/pg-password.txt --encoding=UTF8 --locale=C
powershell -ExecutionPolicy Bypass -File scripts/database.ps1 start
$env:PGPASSWORD = [IO.File]::ReadAllText((Join-Path (Get-Location) '.local/pg-password.txt'))
& 'C:/Program Files/PostgreSQL/16/bin/createdb.exe' -h 127.0.0.1 -p 55432 -U helpdesk helpdesk
Remove-Item Env:PGPASSWORD
npm run db:generate
npm run db:migrate
npm run db:seed
```

PostgreSQL farklı konumdaysa yolları değiştirin. `database.ps1` ayrıca `-PostgresBin` parametresi kabul eder. `.local` klasörü veritabanı ve yerel şifreler içerir; paylaşmayın.

## Test ve derleme

```powershell
npm test
npm run build
# İlk tarayıcı testi kurulumu:
$env:PLAYWRIGHT_BROWSERS_PATH = Join-Path (Get-Location) '.local/playwright'
npx playwright install chromium --only-shell
npm run test:e2e
```

API testleri gerçek PostgreSQL üzerinde rastgele kimlikli geçici kayıtlar oluşturur; yalnızca bu kayıtları temizler, veritabanını sıfırlamaz. Kendi bağımsız geliştirme/test veritabanınızda çalıştırın. Senaryolar: hesap yetki yükseltme engeli, müşteri izolasyonu, departman sınırı, uygun agent atama, yanıt/not görünürlüğü, durum değişikliği, erişim iptali, Türkçe arama, sayfalama, dashboard kapsamı, yenileme anahtarı tekrar kullanım engeli ve logout sonrası JWT iptali.

Tarayıcı testi kayıt, talep, admin ataması, agent yanıtı/notu, müşteri görünürlüğü, çözümleme, mobil taşma ve logout akışını doğrular. `.local/screenshots` altında ekran görüntüleri oluşturur. Admin ve agent hesaplarının seed ile oluşturulmuş olması gerekir.

`npm run build` üretim dosyalarını `backend/dist` ve `frontend/dist` altına yazar. API, backend dizininden `npm start` ile çalıştırılabilir. Üretim hosting/reverse proxy/HTTPS kurulumu bu aşamanın kapsamında değildir.

## Mevcut API

Tüm adresler `/api/v1` altındadır. Başarılı yanıt `{success:true,data:...}`, hata `{success:false,error:{code,message}}`. Listeler ayrıca `pagination` döndürür.

| İşlem       | Adres                                                            | Yetki                                |
| ----------- | ---------------------------------------------------------------- | ------------------------------------ |
| POST        | `/auth/register`, `/auth/login`, `/auth/refresh`, `/auth/logout` | Kimlik/oturum akışı                  |
| GET         | `/auth/me`                                                       | Giriş yapmış kullanıcı               |
| GET / POST  | `/tickets`                                                       | Kendi görünürlüğü / CUSTOMER         |
| GET / PATCH | `/tickets/:id`                                                   | Kendi görünürlüğü / yetkili personel |
| GET / POST  | `/tickets/:id/messages`                                          | Kendi görünürlüğü                    |
| GET / POST  | `/departments`                                                   | Giriş yapmış kullanıcı / ADMIN       |
| GET         | `/agents?departmentId=...`                                       | ADMIN / ilgili SUPERVISOR            |
| GET         | `/dashboard`                                                     | Kullanıcının görebildiği talepler    |

Liste filtreleri: `page`, `limit` (en fazla 100), `search`, `status`, `priority`, `departmentId`, `assignedAgentId`, `view=all|mine|unassigned`. Mesajlar da sayfalanır. Durum, öncelik ve atama aynı PATCH endpoint'inde doğrulanır; ayrı alias endpoint'ler henüz eklenmedi.

## Sonraki aşama

İlk akışın ardından sırayla dosya yükleme ve yetkili indirme, etiketler, bildirimler, Socket.IO, hazır yanıtlar, kullanıcı/personel/departman yönetim ekranları ve activity log ekranı geliştirilecek. Şimdilik mesaj listesi 15 saniyede bir REST üzerinden güncellenir; Socket.IO henüz yoktur. Departman transferi, soft-delete endpoint'i, ayrıntılı raporlar ve sistem ayarları da bekleyen işlerdir. Modeldeki `deletedAt` alanı mevcut sorgularda dikkate alınır.

V2/V3 kapsamındaki e-posta, SLA, AI ve çok kiracılı SaaS özellikleri eklenmedi. V1'de sabit rol enum'u kullanıldı; dinamik Role/Permission tabloları ileri yetkilendirme aşamasına bırakıldı.

Prisma geliştirme araçlarının dolaylı `deepmerge-ts` ve `mysql2` bağımlılıkları güvenlik düzeltmesi sürümlerine `overrides` ile sabitlenmiştir. PostgreSQL sürücüsü `pg@8` ve Prisma adapter birlikte çalışırken test çıktısında pg@9 için ileri uyumluluk uyarısı görülebilir; desteklenen sürümler lock dosyasında sabittir.

Sürüm uyumu için kullanılan resmi kaynaklar: [Prisma 7 geçiş rehberi](https://docs.prisma.io/docs/guides/upgrade-prisma-orm/v7), [Vite kurulum gereksinimleri](https://vite.dev/guide/).
