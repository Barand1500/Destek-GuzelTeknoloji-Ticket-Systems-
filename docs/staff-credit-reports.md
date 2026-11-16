# Personel kredi kullanım raporu

Raporlar ekranındaki Personel Kredi Kullanımları bölümü, CreditCharge kayıtlarını kredi kullanım tarihi üzerinden raporlar. Genel raporda tüm erişilebilir kullanımlar, Kişi Raporunda seçilen işlemi yapan personel, Departman Raporunda seçilen departman gösterilir. Üstteki 7/30/90 günlük dönem bu bölüme de uygulanır.

Her satırda tarih/saat (Türkiye saati), işlemi yapan personel, talep numarası ve konusu, müşteri, departman, anlaşma ve kullanılan kredi bulunur. Sıfır kredi kayıtları korunur. Personel toplamları ve genel toplam bütün filtre sonucuna göre hesaplanır; detaylar 20 kayıtlık sayfalara ayrılır.

GET /reports/credit-usage, reports.view yetkisi ve mevcut talep görünürlük kapsamını uygular. OWN kapsamı yalnızca oturum sahibinin yaptığı kullanımları verir. Kayıtlar mevcut atanan personele değil CreditCharge.actorId değerine göre gruplanır. Şema veya bakiye değişikliği yoktur. Mevcut Rapor İndir düğmesi mevcut istatistik CSV raporunu üretmeye devam eder; yeni kredi tablosu bu CSV içine eklenmedi.

## Arama ve sayfalama
- Panelde ad/personel, müşteri, konu, talep numarası (#TK-00719 dahil) ve anlaşma adına göre sunucuda arama yapılır. Arama Ara düğmesi veya Enter ile uygulanır.
- Tüm kullanımlar, kredi harcananlar (>0) ve ücretsiz destekler (=0) filtreleri vardır. Üstteki kişi/departman/dönem filtreleriyle birlikte çalışır.
- Sayfa boyutu 10/20/50; varsayılan 20. Filtre ve boyut değişince sayfa 1'e döner. API limiti en fazla 100.
- Personel kartları yalnızca görünür sayfadaki personellerin filtrelenmiş dönem toplamlarını içerir; bütün personel listesi istemciye gönderilmez. Genel kredi ve kayıt toplamı bütün filtrelenen sonuçlara aittir.
- Eski sorgular iptal edilir; aynı sorgu 30 saniye önbellekte tutulur.
