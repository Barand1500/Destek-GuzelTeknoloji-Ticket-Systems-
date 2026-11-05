# Renk düzeltmeleri ve dahili notun geri alınması — 4 Kasım 2026

Kullanıcı, dahili notun eski görünümünün korunmasını ve diğer inceleme bulgularının düzeltilmesini istedi.

## Dahili not

Genel mesaj balonlarına eklenen kurallar dahili notun gövdesine de uygulanıyordu. Koyu not zemininin içinde ayrı bir mavi dikdörtgen oluşmasının nedeni buydu.

- Normal mesaj balonu kuralları artık `.internal-note` mesajlarını kapsamıyor.
- Önceki dahili not gövdesi geri geldi: saydam zemin, sıfır kenarlık ve gölge, köşesiz iç gövde.
- Açık moddaki `#fffbeb`, gece modundaki `#3a3520` not zemini korundu.
- Not açıklamasının önceki `#aa8232` rengi korundu; bu yazıya ayrıca kontrast/renk değişikliği uygulanmadı.
- Yön, tarih/isim düzeni, metin, not gönderme ve kişileri etiketleme davranışı değiştirilmedi.
- Gerek kendi yazdığı gerek diğer personelin yazdığı not için koruma testi eklendi.

[Geri getirilen gece modu görünümü](color-review-2026-11-04/11-dark-note-restored.png)

## Diğer uygulanan düzeltmeler

1. Takvim duyuruları, bildirim işlemleri ve anket etiketleri tema metin rengini kullanıyor. Gece modundaki koyu mavi yazı problemi giderildi.
2. Anket cevap/oluşturma ekranındaki küçük seçenek rozetlerinin zemin ve yazıları tema renklerine bağlandı.
3. Beyaz metin taşıyan ana düğmeler, oy kullanma düğmesi, rapor avatarları ve takvim işaretlerinde daha koyu mavi kullanıldı. Parlak mavi vurgu çizgileri ve uygun ikonlarda sürdürüldü.
4. Küçük açık mod bağlantıları ve rehber metinleri daha okunur koyu maviye bağlandı.
5. Form etiketi, kanal, seçili menü, bildirim alt bağlantısı ve durum rozeti yazıları koyulaştırıldı. Bildirim alt alanının istenen açık mavi zemini korundu.
6. Rapor grafiğinin açıklama noktası ile ilgili sütun aynı renk değişkenine bağlandı. Açık moddaki başarı yüzdesi ve sıralama sayısı da daha okunur hale getirildi; yeşil başarı rengi farklı bir renk ailesine çevrilmedi.
7. Kontrolde görülen genel hata kutusunun gece modu zemini/yazısı da koyu temaya uyarlandı.

İlk rapordaki dahili not yeniden tasarımı kapsam dışında bırakıldı. Başarı durumlarının tamamen maviye dönüştürülmesi gibi ayrı bir tasarım kararı uygulanmadı.

[Düzeltilen gece modu takvimi](color-review-2026-11-04/12-dark-calendar-fixed.png) · [Düzeltilen anket seçenekleri](color-review-2026-11-04/13-dark-survey-answer-fixed.png)

## Doğrulama

- `npm run build -w frontend`: başarılı.
- `e2e/theme-colors.spec.ts`: 4 test başarılı. Açık/gece modu için gelen/giden dahili notların eski stilini ve dolu takvim/bildirim/anket içeriklerinin en az 4,5:1 metin kontrastını kontrol eder.
- Dahili notlar 1440 px ve 390 px genişlikte ayrıca kontrol edildi.
- İnceleme betiğiyle yönetici/personel/müşteri/oturumsuz kullanıcı ekranları açık ve gece modunda yeniden görüntülendi. Örnek API verileri kullanıldı; gerçek hesaplarda kayıt değiştirilmedi.

Son taramanın çalışma dosyaları: `.local/color-review-fixed-2026-11-04/`. İlk raporun kanıtları önceki klasörde korunuyor.

## Bilerek korunanlar ve ölçüm sınırı

Dahili notun eski açıklama rengi kullanıcı talebiyle korundu. Otomatik tarama bu yazıyı hâlâ kontrast adayı olarak işaretleyebilir; bunu kaldırmak için not stili yeniden değiştirilmedi.

Logo, dekoratif uyarı simgeleri ve sütunların üstüne konan grafik sayılarında otomatik tarama sonuçları tek başına metin hatası kabul edilmedi. Canlı entegrasyonlar ve gerçek veri akışları için bu testler işlevsel güvence yerine geçmez.
