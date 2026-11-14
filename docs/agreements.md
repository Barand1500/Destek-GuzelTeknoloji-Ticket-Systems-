# Anlaşmalar ve destek kredileri

Müşteriler listesindeki el sıkışma simgesi Anlaşmalar penceresini açar. Bu pencere
anlaşmaları, kredi özetini ve ana müşteride alt müşteri listesini içerir. Kredi Hareketleri, sağ üstte X simgesinin solundaki geçmiş simgesinden açılır. Anlaşma eklerken ad,
tür, başlangıç/bitiş günü ve tam sayı kredi girilir. Ücret girişi ve gösterimi
sonraya bırakılmıştır; eski ücret kayıtları veritabanında korunur. Her satın alma ayrı
kayıttır. Aylık/yıllık seçimleri otomatik ödeme veya yenileme başlatmaz.

Geçerlilik günleri Türkiye saatine göre değerlendirilir; başlangıç ve bitiş günü
dahildir. Aylık/yıllık seçiminde bitiş başlangıca göre otomatik hesaplanır:
14 Kasım → aylık 13 Aralık, yıllık ertesi yıl 13 Kasım. Ay sonu veya 29 Şubat
gibi karşılığı olmayan günlerde hedef ayın son günü kullanılır. Ek Destek Kredisi
ve Bakım Anlaşması türlerinde bitiş elle girilir. Süresi dolmuş, henüz başlamamış ve iptal edilmiş paketlerin kalan
kredileri görünür fakat kullanılamaz. Anlaşma silinmez, iptal edilir; kullanılmış
kredi geçmişi korunur. Kaydın başlangıç/bitiş bilgileri açılır satırdadır.

Talep detayında Çözüldü veya Kapalı seçildiğinde kredi penceresi açılır. Personel
uygun anlaşmayı ve harcanan krediyi seçer; ücretsiz destek için 0 girer. Kaydet,
talep durumunu ve kredi işlemini tek veritabanı işleminde tamamlar. Vazgeç hiçbir
değişikliği kaydetmez. Talep tekrar açılıp çözülse bile yeniden kredi düşülmez.
Bu ilk sürümde sonradan kredi düzeltme/iade ekranı yoktur.

Ana/alt müşteri bağlantıları Anlaşmalar penceresinde değildir. Müşteriler
listesindeki ağ simgesi ayrı Bağlı Müşteriler penceresini açar. Önce işlem seçilir:
“Bu müşteriye alt müşteri ekle” veya “Bu müşteriyi bir ana müşteriye bağla”.
Her işlem yalnızca kendi seçimini ve bağlantı listesini gösterir. Bağlantılar tek
seviyelidir. Ana müşteriye veya alt müşteriye ayrı paket eklenebilir; alt müşteri
kendi paketlerini, şirket ortak kullanımı açıksa aktif ana müşterisinin geçerli paketlerini kullanabilir. Ana müşteri
alt müşterilerin taleplerini salt okunur görüntüler; kardeş müşteriler birbirinin
taleplerini göremez. Anlaşması veya müşteri bağlantısı olan kayıtlar, geçmişi
korumak için mevcut müşteri birleştirme işlemine alınmaz.

Mevcut girişli müşteri hesabında Anlaşmalarım ve Kredilerim menüsü bulunur.
Ana giriş ekranındaki “E-Posta ile Devam Et” kayıtlı müşteriye tek kullanımlık kod
gönderir; doğrulamadan sonra müşteri paneli açılır. Ayrıntılar: [Müşteri girişi](customer-email-login.md). Form takip tokenlarının yetkisi değişmez.

Anlaşma/hiyerarşi okumaları mevcut `customers.view`, değişiklikleri
`customers.update` personel yetkilerini kullanır. Çözüm mevcut talep yetkilerini
de korur. Yeni paketler ve tüketimler aktörüyle işlem geçmişine kaydedilir.

## Şirket ortak kredisi

Ana müşteri kaydındaki Şirket ortak kredisi anahtarı, tüm doğrudan alt müşteriler için
tek ayardır. Yetkili personel şirketin Anlaşmalar veya Bağlı Müşteriler penceresinden;
ana müşteri de kendi Anlaşmalarım ve Kredilerim ekranından değiştirebilir.
Alt müşteri şirket ayarını değiştiremez. Başlangıçta açık gelir; kapatmak geçmiş
harcamaları, kişisel paketleri ve talep görüntüleme yetkilerini değiştirmez.
Şirket kendi paketlerini kullanmaya devam eder. Ayar ve kredi tüketimi şirket kaydı
üzerinden kilitlenir; önceden açılmış çözüm ekranı veya eski veritabanı anlık görüntüsüyle
ortak kullanımı kapatılmış bir paketten düşüm yapılamaz.

Alt müşteri ekranında Kendi kredisi, Şirket ortak bakiyesi ve Kullanılabilir toplam
ayrıdır. Şirket bakiyesi kişiye tahsis edilmiş değildir. Ortak kullanım kapalıysa şirket
bakiyesi bilgi olarak görünür, toplama katılmaz ve çözümde seçilemez.
Ana müşterinin özet bakiyesine alt müşterilerin kişisel kredileri katılmaz.
Alt Müşteriler bölümünde kişisel kalan kredi, anlaşma detayı ve taleplere geçiş vardır.
Personel aynı modal içinde alt kayda geçebilir ve geri dönebilir; müşteri panelinde
ana müşteri kendi alt kaydının detaylarına geçebilir. Geçerli paketler önce kişisel,
sonra şirket paketi; her grupta bitişi en yakın olan önce sıralanır. Son seçim personeldedir.

Anlaşma, bağlantı ve çözüm pencereleri dosya penceresindeki gibi başlık altı çizgisi ve standart Lucide X simgesini kullanır. Çözüm penceresi 560px ile sınırlıdır; işlem düğmeleri çizgiyle ayrılmış alt sağ alandadır. Kredi hareketleri ayrı tablo görünümündedir: tarih, müşteri, talep bağlantısı, anlaşma, düşülen kredi. Mevcut son 100 kullanım 20 satırlık sayfalarla gösterilir. Geçmişe geçip geri dönmek yarım kalmış anlaşma formunu silmez. Müşteri panelinden de Kredi Hareketleri düğmesiyle tablo açılabilir. Klavye odağı ve Escape davranışı korunur.

## Yayınlama

Backend ve frontend kaynaklarını aktarın, backend ortamını koruyarak
`npm run db:migrate` ve `npm run build` çalıştırın. Yeni migration:
`20261114120000_customer_agreements`, `20261114140000_customer_email_login` ve
`20261114160000_company_credit_sharing`. Backend sürecini yeniden başlatın ve frontend
derlemesini yayınlayın. Migration mevcut müşterilere otomatik anlaşma veya kredi
tanımlamaz. Yerel ortamda migration uygulanmıştır; canlıya otomatik yayın yapılmaz.

## Türler ve müşteri seçimi

Anlaşma türü ve anlaşma seçimi talep bilgilerindeki SearchableDropdown bileşenini kullanır. Hazır Aylık/Yıllık/Ek Destek Kredisi/Bakım Anlaşması türleri sabittir. Personel, tür listesinin altındaki + ve küçük giriş alanıyla özel tür ekler. Yalnızca özel türlerde çöp kutusu vardır; silme arşivler, eski anlaşmaların adını ve kredilerini korur. Özel türlerde başlangıç/bitiş elle girilir; hazır aylık/yıllık otomatik tarih hesabı sürer. Yönetim customers.update yetkisine tabidir. Yeni migration: `20261114180000_agreement_types`. Yerelde uygulanmıştır.

Bağlı Müşteriler bölümünde seçim alanı aramanın solundadır; sağ üstteki küçük arama sonuçları modalın gövdesine getirir. Arama sonuçları sunucuda, mevcut bağlantılar kendi listesinde beşer satırla sayfalanır. Adaylar aktif, başka ana müşteriye bağlı olmayan ve tek seviyeli ilişkiye uygun müşteri kayıtlarıdır. Seçimden sonra alt sağdaki düğmeyle bağlanır; yeni kişi oluşturma da alt işlem alanından kaydedilir.

Anlaşmaların alt müşteri listesi kapalı gelen akordiyondur; ana müşteri kendi portalında şirket bakiyesini ve açtığında kişilerin kişisel kredilerini görebilir. Önceden kredi kaydı bulunan (0 kredi dahil) bir talep tekrar çözülürken ikinci kredi onayı açılmaz; yalnızca durum güncellenir. İlk çözümde kredi miktarı seçimi korunur.

## Alan ve açılır liste düzeltmeleri

Anlaşma formunun etiketleri standart çerçeve etiketidir; alanlar 46px ve aynı satırda hizalıdır. Kaydet/Vazgeç modalın çizgiyle ayrılan alt sağ bölümündedir. Tür ekleme + düğmesi girişin sağındadır. Tür kataloğunda işlem sürerken anlaşma kaydı bekler. Bağlı müşteri seçimi aramayla aynı 38px yüksekliği kullanır. Açılır liste modalın kaydırma alanına göre yön ve yükseklik seçer; kesilmez ve Escape önce listeyi kapatır. Input odak/hover gölgeleri uygulama genelinde kaldırılmıştır; tercih [UI kuralları](ui-conventions.md) dosyasında kayıtlıdır.

Kontrol edilen akışlar: kişisel/ortak bakiye ayrımı, ortak kredi kapatma yetkisi, eşzamanlı tüketim ve tekrar çözümde tek düşüm; özel tür arşivleme ve eski etiketlerin korunması; aday arama/sayfalama/bağlama; e-posta koduyla giriş. Bunlar hedefli testlerdir, kapsamlı bağımsız denetim değildir. Bilinen kapsam sınırları: kredi iade/düzeltme arayüzü yok; kullanım geçmişinde son 100 kayıt gösteriliyor; tek çözüm bir paketten düşüyor.
