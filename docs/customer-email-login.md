# Müşteri e-posta girişi ve hızlı bağlantı

Ana `/auth` ekranında “E-Posta ile Devam Et” ile kayıtlı müşteri adresine 6 haneli kod gönderilir. Doğrulama normal müşteri oturumu açar; talepler, anlaşmalar ve krediler mevcut yetkilere göre görünür. Yeni hesap açılmaz. Personel, pasif, silinmiş veya personel yetki rolü taşıyan hesaplar bu akışı kullanamaz. Aynı iletişim adresi birden fazla müşterideyse kod gönderilmez; benzersiz giriş adresi varsa önceliklidir. Kullanıcı bulunup bulunmadığı genel yanıtla gizlenir.

Kod 10 dakika geçerlidir; 5 yanlış denemeden sonra kullanılamaz. Yeni kod eskisini iptal eder; müşteri başına saatte en fazla 5 gönderim yapılır. Mevcut IP sınırı ve etkinse Turnstile uygulanır. Kod özeti saklanır; ileti mevcut dayanıklı e-posta kuyruğuna eklenir. SMTP ayarlarının çalışması gerekir.

Kodla girişten sonraki 15 dakika içinde Profil > Güvenlik üzerinden mevcut şifre olmadan şifre belirlenebilir. Bu hak tek kullanımlıktır; diğer oturumlar kapatılır. E-posta değişikliği mevcut şifreyi gerektirir. Sonraki girişlerde hem şifre hem e-posta kodu kullanılabilir. Müşteri panelinde personel duyurusu oluşturma düğmesi gösterilmez.

Bağlı Müşteriler penceresinde önce işlem seçilir. Listede olmayan kişi için “+ Yeni Kişi Ekle”; yeni merkez için “+ Yeni Ana Müşteri Ekle” seçilir. Ad, firma, e-posta ve telefonla “Oluştur ve Bağla” kaydı ve bağlantıyı aynı işlemde oluşturur. Oluşturma ve güncelleme yetkileri birlikte gerekir. Mevcut müşteri doğrulamaları korunur.

Yayınlama: `npm run db:migrate`, `npm run build`, backend yeniden başlatma ve frontend dağıtımı. Yeni migration `20261114140000_customer_email_login`. Yerel veritabanında uygulanmıştır; canlıya otomatik yayın yapılmamıştır. Testler gerçek alıcıya e-posta göndermeden kuyruk kayıtlarını doğrular.
