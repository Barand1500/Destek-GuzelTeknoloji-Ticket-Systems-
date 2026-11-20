# Otomatik yenilemenin kaldırılması

Yeni anlaşmalar, paketler ve ödemeler dönem sonunda otomatik tekrarlanmaz. Yeni banka talimatı oluşturma, kayıtlı karttan tahsilat, otomatik yenileme siparişi üretme ve yenileme onayı kaldırılmıştır. Dönemlik paketler, müşterinin başlattığı tek seferlik satın alma olarak çalışır.

## Yayına alma

1. Eski ödeme/yenileme işçilerini durdurun. Eski ve yeni ödeme işçilerini aynı anda çalıştırmayın.
2. Veritabanı yedeğini alın ve `npm run db:migrate --workspace backend` çalıştırın.
3. Yeni sunucu ve ön yüzü birlikte yayınlayın.
4. Bankada önceden oluşturulmuş Akbank talimatları varsa iptallerinin doğrulandığını kontrol edin. Kodu kaldırmak bankadaki talimatı kendiliğinden silmez.

Geçmiş tahsilatlar, kredi kullanımları, paket dönemleri ve iade kayıtları korunur. Veritabanındaki eski alanlar geçmiş kayıtların okunması ve güvenli geçiş için bırakılmıştır. Eski Akbank kayıtlarının iptal ve önceden alınmış ödemelerin doğrulama kodu, sonucun bankada doğrulanmasına kadar çalışır; yeni tahsilat veya talimat göndermez.

Eski otomatik yenileme uçlarına gelen talepler reddedilir. Normal tek seferlik ödeme sorgulaması ve iadeler devam eder.

## Geri dönüş

Bu sürümde otomatik yenileme yeniden açılamaz. Önceki sürüme dönmek bankada iptal edilmiş talimatları geri açmaz. Eski yenileme alanlarının eski değerlerini geri yüklemek için yedek gerekir; müşteri onayı ve banka yetkisi olmadan yeniden etkinleştirilmemelidir.
