# Alan ve modal görünümü

Kullanıcı tercihi: Inputların içinde hover/odak parlaması, ikinci çerçeve veya iç gölge kullanılmaz. Metin alanı odak durumu dış çerçevenin renk değişimiyle gösterilir. Butonların ve kutucukların klavye odak göstergeleri korunur. Yeni ekranlarda da bu kural geçerlidir.

Modal başlığı ve alt işlem alanı çizgiyle ayrılır. Kaydet/Vazgeç alt sağda; aynı satırdaki alanlar aynı yükseklikte olmalıdır. Küçük aramanın yanındaki seçim alanı 38px, anlaşma formu alanları 46px kullanır. Açılır listeler modalın kaydırma alanına sığacak yönde açılır.

Bağlı müşteri seçimi aşağı açılır, sınırlı yükseklikten sonra kaydırılır. Salt okunur seçim kutularında metin imleci gösterilmez. Gerçek arama inputlarında imleç için yeterli satır yüksekliği ve iç boşluk bırakılır.

Anlaşma türü ve bağlı müşteri listeleri aşağı açılır; açılınca modal boyutu değişmez. Liste üst katmanda gösterilir, ekranın alt sınırına göre yüksekliği kısıtlanır ve içeriden kaydırılır. Şirket ortak kredi ayarı yalnızca alt müşterileri olan ana kayıtta gösterilir.

Anlaşmalar, Bağlı Müşteriler ve Duyurular modallarında yalnızca X ile aynı kapatma işini yapan alt Kapat/İptal/Vazgeç butonları gösterilmez. Mevcut pencere içinde ekleme/düzenleme modundan geri döndüren Vazgeç korunur. Anket kartı işlem simgeleri 32px, 8px köşe yarıçapı ve tema uyumlu yarı saydam hover kullanır.

Silme onay modallarında da X ile aynı kapatma davranışını tekrarlayan Vazgeç/İptal gösterilmez. Ortak DeleteModal, müşteri/toplu müşteri, etiket-katalog, bildirim, talep ve işlem geçmişi silme pencereleri bu kuralı kullanır. Formun kendi düzenleme durumunu sıfırlayan Vazgeç korunur.

Anlaşma tarihleri tema uyumlu özel takvimle seçilir: Pazartesi başlangıçlı Türkçe hafta/ay, ay geçişi, seçili gün/bugün, Temizle ve Bugün işlemleri. Takvim ikonun altında üst katmanda açılır, tarih sınırları ve otomatik dönem hesabı korunur. Bağlı Müşteriler işlem seçimi Duyurular gibi altı çizgili sekmeler kullanır. Tekli bakiye modal başlığında hareket geçmişinin yanında gösterilir; ortak kullanımı açık bağlı müşterilerin üçlü kredi özeti korunur. Anlaşma detayları sığdığı ölçüde yatay akışta gösterilir.

- Şirket kişisi formlarında Ad Soyad, E-Posta ve Telefon aynı 46px outlined alan düzenini kullanır. E-posta bileşeninin iç inputunda ikinci kenarlık olmaz. Telefon formatPhone ile 0530 123 45 67 biçiminde düzenlenir.
