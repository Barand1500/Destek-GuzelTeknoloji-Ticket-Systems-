# Kredi satış ekranları
Kullanıcı onayı: yönetimden birim fiyat/plan ayarı, müşteride tutar-kredi hesaplama ve abonelikler. Son açıklama: ödeme sağlayıcısı bilgileri yok; önce ekranlar.
## Yaklaşım
Mevcut Agreement bakiyesi ve tüketimine dokunmadan ayrı fiyat kataloğu oluştur. Alternatif doğrudan Agreement oluşturma ödeme olmadan kredi üreteceğinden kullanılmaz. Kart/AnyPay/iyzico entegrasyonu anahtar ve doğrulanmış API dokümanı olmadan yapılmaz.
## Kapsam
TRY fiyatlar, iki ondalık, tam sayı kredi; tutar tam krediye bölünmüyorsa hata ve geçerli tutar önerisi. Birim fiyat, minimum/maksimum kredi, geçerlilik günü, satış görünürlüğü yönetimde. Aylık/yıllık plan: ad, dönem fiyatı, dönem toplam kredisi, açıklama, aktiflik. Dönem kredileri devretmez; yönetimde ve müşteride açık gösterilir. Yıllık planda kredi bütün yıl içindir; aylık dağıtım/otomatik yenileme henüz yok.
Müşteri kataloğu/hesaplama/özet ekranı; ödeme bağlantısı olmadığı açık, satın alma ve kredi yükleme yok. Şirket kredisi hesap sahibine aittir, hesap bilgisi müşteride gösterilir. Aktif müşteri ve şirket kontrol edilir.
## Yetki ve veri
Katalog yönetimi integrations.view/update izinleri. Müşteri katalog/teklif yalnızca CUSTOMER. İstekten fiyat kabul edilmez; sunucu kuruşla hesaplar. Plan kapatılırsa veya fiyat değişirse yeni özet güncel katalogdan üretilir. Veritabanına yalnızca yeni katalog tabloları eklenir; mevcut anlaşma ve krediler değişmez.

## 17 Kasım kullanıcı düzeltmeleri
Kredi fiyatı ve planlar için TRY/USD/EUR/GBP seçilebilir; kur dönüşümü yapılmaz. Para girişleri Türkçe binlik/ondalık biçimde gösterilir ve sunucuya noktalı ondalık olarak gönderilir. Bağlı kişiler katalog ve özet API erişiminden engellenir; satın alma alanı yalnızca ana müşteri/şirket hesabına görünür.
