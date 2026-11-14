# Müşteri anlaşmaları ve destek kredileri

Son kullanıcı düzeltmesi: Ücret girişi/gösterimi ertelendi. Yeni kayıtlarda API
ücret istemez (mevcut veritabanı sütunu 0 ile korunur). Aylık/yıllık tür seçimi
başlangıç gününe göre bitişi otomatik hesaplar; dönem günleri dahildir. Diğer
türlerde bitiş elle girilir. Ana/alt müşteri ekranı işlem seçimiyle tek yönü bir
defada gösterir: alt müşteri ekleme veya bir ana müşteriye bağlama.

Onaylanan yaklaşım: müşteriler listesindeki Anlaşmalar düğmesinden yönetilen, müşteriyle ilişkili birden fazla tarihli anlaşma. Her alım ayrı kayıt; başlangıç/bitiş, ücret (TRY), kredi ve aylık/yıllık/tek sefer türü. Aylık/yıllık tür bir paket etiketidir; otomatik fatura veya kendiliğinden kredi yenileme yoktur. Her dönem personelce açıkça eklenir.

Ana ve alt müşteriye ayrı anlaşma açılabilir. Tek seviyeli ilişki; döngü ve kendine bağlama yasak. Alt müşteri kendi ve ana müşterisinin geçerli anlaşmalarını kullanabilir. Ana müşteri doğrudan bağlı alt müşterilerin taleplerini okuyabilir; alt müşteri diğer alt müşterilerin kayıtlarını göremez. İlişki yönetimi personelin müşteriler güncelleme yetkisindedir.

Çözüldü/Kapalı geçişinde personel anlaşmayı ve harcanan tam sayı krediyi seçer. 0 ücretsiz çözüm. Talep ve kredi aynı işlemde kaydedilir, bakiye negatif olmaz. Her talep için tek tüketim kaydı; yeniden açıp çözmek ikinci tüketim oluşturmaz. Sonradan düzeltme/iade bu sürümün dışında. Süre geçmişinde kalan kredi kullanılmaz. Başlangıç ve bitiş Türkiye takvim günü olarak dahildir.

Kullanıcının uygulama sırasındaki düzeltmesi: Anlaşmalar penceresinde yalnızca Anlaşmalar ve Kredi Hareketleri bulunur. Ana müşteri özet kutusu burada gösterilmez. Alt müşteri yönetimi müşteriler listesinde ayrı Bağlı Müşteriler düğmesi ve penceresindedir. Müşteri girişini açma/parola yönetimi bu işin kapsamından çıkarılmıştır; mevcut ana giriş akışı ayrıca sonra ele alınacaktır. Yeni portal açma uç noktası eklenmez. Mevcut girişli müşteri hesabı anlaşmalarını okuyabilir; mevcut tek talep form bağlantılarının yetkisi genişletilmez.

Mali veri mevcut müşteri yetkileriyle personelce yönetilir; müşteri sadece kendisine ve doğrudan bağlı alt müşterilere ait veriyi okur. Yeni bağımlılık yok. Ücret Decimal, kredi tam sayı; işlem logu aktörü ve talebi saklar. Kayıtları silerek kredi geçmişi yok edilmez; anlaşmalar iptal edilebilir.
