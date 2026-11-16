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

## Anlaşma silme

Yetkili personel satırdaki çöp kutusundan onayla anlaşmayı silebilir. Ana müşteriye ait ortak paket de görüntülendiği ekrandan kendi müşteri kimliğiyle silinir. Agreement.deletedAt listeden ve bakiyeden çıkarır; CreditCharge ve anlaşma adı korunur, silinmiş paketten yeni kredi tüketilemez. İşlem agreement.deleted günlüğüne yazılır. Yeni migration: 20261116120000_agreement_soft_delete (prisma/mysql/migrations). Yerelde uygulanmıştır; canlı dağıtımda migration uygulanmalıdır.

## Anlaşma düzenleme

Personel satırdaki kalem simgesinden ad, tür, başlangıç/bitiş ve kredi miktarını düzenler. Form mevcut tarihleri açılışta değiştirmez; aylık/yıllık tür veya başlangıç değişince dönem yeniden hesaplanır. Kullanılmış kredi korunur, yeni toplam bunun altına inemez. Güncelleme kredi tüketimiyle aynı anlaşma satırında kilitlenir, silinmiş anlaşma güncellenemez. Arşivlenmiş mevcut tür korunabilir, yeni tür seçiminde yalnızca aktif tür kabul edilir. Eski ücret korunur; arayüzde ücret alanı yoktur. Önceki/yeni değerler agreement.updated günlüğüne kaydedilir.

Düzenleme mevcut Anlaşmalar penceresinin iç görünümüdür; ikinci modal açılmaz. Kaydet/Vazgeç mevcut alt işlem alanında kalır. Kredi miktarı alanlarında sayısal doğrulama korunur; tarayıcı spinner okları gösterilmez.

Ortak kredi ayarı yalnızca Anlaşmalar görünümünde Alt Müşteriler akordiyon başlığının sağında yer alır; Bağlı Müşteriler ekranında bulunmaz. Toggle akordiyonu açıp kapatmaz. Ortak paketten kullanılan kredi, talebin customerId kaydının ve ana müşterisinin hareketlerinde görünür; aynı isimli farklı müşteri kayıtlarının geçmişleri birleştirilmez.

Düzenleme formu, ekleme formuyla aynı konumda (Anlaşmalar başlığının altında) açılır. Kredi özetleri ve anlaşma listesi görünür kalır; pencere başlığı Anlaşmalar olarak korunur.

Ortak kredi paylaşımı kapalıyken alt müşterinin Anlaşmalar görünümünde şirket bakiyesi, kullanılabilir toplam kartı, ortak kullanım açıklaması ve ana müşterinin paketleri gösterilmez. API de ana müşterinin paketlerini sorguya dahil etmez ve parentCredits değerini 0 döndürür. Ana müşterinin kendi bakiyesi/paketleri ve geçmiş kredi hareketleri korunur; paylaşım açıldığında ortak alanlar geri gelir.

İptal edilmiş anlaşmanın detayında Yeniden Etkinleştir işlemi vardır. customers.update yetkili personel yalnızca silinmemiş ve iptal durumundaki anlaşmayı açabilir. cancelledAt temizlenir; tarihler, toplam/kullanılan kredi ve geçmiş hareketler korunur. Süresi dolmuş paket EXPIRED kalır; gelecekte başlayan paket başlangıcı gelene kadar kullanılamaz. agreement.reactivated işlem günlüğü oluşturulur.

Anlaşma silme için ek onay modalı açılmaz: çöp kutusu doğrudan silme isteği gönderir. İstek sürerken işlem düğmeleri kilitlenir; hata mevcut ekranda gösterilir. Geçmişi koruyan silme davranışı aynıdır.

Anlaşma yetkileri: ekleme/düzenleme/iptal/yeniden etkinleştirme customers.update, silme customers.delete. Müşteri rolü bu yazma işlemlerinden bağımsız olarak engellenir. Personelde silme ve düzenleme düğmeleri ayrı kontrol edilir; yalnızca düzenleme yetkisi silme API erişimi sağlamaz.

## 16 Kasım 2026 — Şirket ve kişiler yönetimi

Önceki kişisel/ortak kredi ve aç/kapat kurallarının yerini aşağıdaki model alır:

- Müşteriler ana listesi rootsOnly=true ile yalnızca bağımsız hesapları gösterir. Şirkete bağlı kişiler, aynı yönetim modalındaki Şirkete Bağlı Kişiler sekmesindedir; talep açma dizinlerinde görünmeye devam ederler.
- Tek yönetim butonu Anlaşmalar ve Kredi / Şirkete Bağlı Kişiler sekmelerini açar. Kişi oluşturma, düzenleme, aktiflik, dosyalar ve talepler bu tabloda korunur.
- Bağımsız müşteriler kendi anlaşmalarını kullanır. Bağlı kişiler sadece aktif şirketin anlaşmalarını kullanır. Eski shareCreditsWithChildren değeri artık tüketimi değiştirmez; aç/kapat API'si kaldırılan politika için 410 döner.
- Bağlı kişiler için kişisel anlaşma oluşturma, düzenleme, iptal, yeniden etkinleştirme ve silme engellenir. Önceki kişisel anlaşmalar veri tabanında kalır ve personele salt okunur geçmiş olarak gösterilir; bakiye otomatik taşınmaz.
- Şirket hareketleri şirket anlaşmasından yapılan geçmiş harcamaları da kapsar; kişi hareketleri yalnızca kendi taleplerini gösterir.
- Aktif veya pasif, silinmemiş kişileri bulunan şirket silinemez. Kişiler yönetilmeden gizli/yönetilemez kayıt oluşmasına izin verilmez.
- Yetkiler: müşterileri düzenle = kişi ve anlaşma düzenleme; müşterileri oluştur + düzenle = şirkete kişi ekleme; müşterileri sil = kişi/anlaşma/dosya silme. Müşteri rolüne bu personel işlemleri açılmaz.
- Mevcut parentCustomerId ilişkisi kullanılır; şirket adı benzerliğine göre otomatik eşleştirme veya veri göçü yapılmaz. Şema değişmedi.

## Müşteri iletişim bilgilerinin benzersizliği

Ana e-posta ve telefon birbirinden bağımsız kontrol edilir; farklı ad veya şirket çakışmayı geçersiz kılmaz. Silinmemiş pasif kayıtlar da kontrol kapsamındadır. Telefon boşluk/noktalama, 0, +90 ve 0090 farklarından arındırılarak; e-posta canonicalEmail ile karşılaştırılır. Müşteri oluşturma/düzenleme, şirket kişisi oluşturma, müşteri profili, kayıt ve otomatik kanal oluşturma yolları aynı işlem içi kilitli kontrolü kullanır. Mevcut kayıtlar otomatik birleştirilmez veya değiştirilmez. Veritabanına eski mükerrerleri silmeyi gerektirecek bir unique index göçü uygulanmadı. Hatalar CUSTOMER_EMAIL_EXISTS / CUSTOMER_PHONE_EXISTS kodlarıyla alanı açıkça belirtir.

- Şirket yönetiminde yalnızca şirketin anlaşmaları listelenir. Önceki kişisel anlaşmalar bölümü ve API yanıtındaki legacyAgreements kaldırıldı; eski veriler silinmedi ve kullanılabilir şirket kredisine eklenmedi.
