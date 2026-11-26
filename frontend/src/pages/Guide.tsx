import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  Activity, BarChart3, Bell, BookOpen, Building2, CheckCircle2, ChevronRight, ClipboardList, FileText, History, Inbox,
  LayoutDashboard, MessageSquare, Phone, Settings, ShieldCheck, Tags,
  Timer, UserPlus, UserRound, UsersRound, X,
} from "lucide-react";

type Detail = { title: string; text: string };
type GuideShot = {
  src: string;
  label: string;
  alt: string;
  pins?: Array<{
    detail: number;
    labelX: number;
    labelY: number;
    targetX: number;
    targetY: number;
  }>;
};
type GuideScreen = {
  id: string;
  number: string;
  title: string;
  icon: LucideIcon;
  summary: string;
  route: string;
  screenshots?: GuideShot[];
  details: Detail[];
  next: string;
};

const workScreens: GuideScreen[] = [
  {
    id: "dashboard", number: "01", title: "Genel Bakış", icon: LayoutDashboard,
    summary: "Güne başlarken taleplerin ve ekibin genel durumunu burada kontrol edin.",
    route: "/admin/dashboard",
    screenshots: [{
      src: "/guide/genel-bakis.png",
      label: "Genel Görünüm",
      alt: "Genel Bakış ekranında talep sayaçları ve durum grafiği",
      pins: [
        { detail: 1, labelX: 28, labelY: 23, targetX: 38, targetY: 32 },
        { detail: 2, labelX: 81, labelY: 38, targetX: 88, targetY: 51 },
        { detail: 3, labelX: 61, labelY: 69, targetX: 70, targetY: 76 },
        { detail: 4, labelX: 81, labelY: 12, targetX: 94, targetY: 16 },
      ],
    }],
    details: [
      { title: "Talep Sayaçları", text: "Açık, bekleyen, çözülen ve kapalı taleplerin sayısını görün." },
      { title: "Ekip Yükü", text: "Atanmamış talepleri ve aktif personeli kontrol edin." },
      { title: "Durum Grafiği", text: "Bir duruma tıklayarak ilgili talepleri gelen kutusunda açın." },
      { title: "Talepleri Görüntüleyin", text: "Gelen kutusuna geçip işlem yapacağınız talebi açın." },
    ],
    next: "İşlem gerektiren bir talep gördüğünüzde Gelen Kutusu ekranına geçin.",
  },
  {
    id: "inbox", number: "02", title: "Gelen Kutusu", icon: Inbox,
    summary: "Tüm destek taleplerini bulun, süzün ve ilgili konuşmayı açın.",
    route: "/admin/conversations",
    screenshots: [
      {
        src: "/guide/gelen-kutusu.png",
        label: "Talep Listesi",
        alt: "Gelen Kutusu talep listesi, sekmeler ve filtreler",
        pins: [
          { detail: 1, labelX: 18, labelY: 18, targetX: 25, targetY: 25 },
          { detail: 2, labelX: 36, labelY: 23, targetX: 25, targetY: 33 },
          { detail: 3, labelX: 60, labelY: 39, targetX: 53, targetY: 46 },
          { detail: 4, labelX: 68, labelY: 39, targetX: 77, targetY: 46 },
          { detail: 5, labelX: 16, labelY: 52, targetX: 23, targetY: 45 },
        ],
      },
    ],
    details: [
      { title: "Görünüm Sekmeleri", text: "Kanal veya atamaya göre geçiş yapın. Kalem düğmesiyle sekmeleri düzenleyin." },
      { title: "Arama ve Filtreler", text: "Talebi arayın; kaynak site, durum ve öncelik filtrelerini kullanın." },
      { title: "Talep Tablosu", text: "Sorumlu ekibi, atanan kişiyi ve kullanılan krediyi görün." },
      { title: "Yanıt Süresi", text: "Bekleyen yanıtları ve ilk yanıt süresini takip edin." },
      { title: "Konuşmaya Geçiş", text: "Talep başlığına tıklayarak mesajları ve yanıt alanını açın." },
    ],
    next: "Talebi açınca konuşmayı okuyun, gerekiyorsa personel atayın ve yanıtlayın.",
  },
  {
    id: "customers", number: "03", title: "Müşteriler", icon: UsersRound,
    summary: "Arayanları ve talep sahiplerini tek kayıt altında yönetin.",
    route: "/admin/customers",
    screenshots: [
      {
        src: "/guide/musteriler.png",
        label: "Müşteri Yönetimi",
        alt: "Müşteri arama, kayıt listesi ve hızlı işlem düğmeleri",
        pins: [
          { detail: 1, labelX: 20, labelY: 19, targetX: 26, targetY: 27 },
          { detail: 2, labelX: 89, labelY: 19, targetX: 95, targetY: 27 },
          { detail: 3, labelX: 37, labelY: 51, targetX: 24, targetY: 42 },
        ],
      },
      {
        src: "/guide/musteri-gelen-kutusu.png",
        label: "Müşterinin Görüşmeleri",
        alt: "Müşteri detayındaki Görüşmeler sekmesi ve talep kartları",
        pins: [
          { detail: 4, labelX: 40, labelY: 23, targetX: 49, targetY: 30 },
          { detail: 5, labelX: 65, labelY: 24, targetX: 55, targetY: 30 },
        ],
      },
    ],
    details: [
      { title: "Müşteri Arama", text: "Ad, telefon veya e-posta ile doğru kişiyi bulun." },
      { title: "Yeni Müşteri", text: "Sağdaki + düğmesiyle müşteri kaydı oluşturun." },
      { title: "Kayıt Listesi", text: "Şirket, iletişim, kredi ve hesap durumunu kontrol edin." },
      { title: "Görüşmeler", text: "Müşterinin taleplerini açın; şirkete bağlı kişilere göre filtreleyin." },
      { title: "Talep Aç", text: "Müşteri kaydındaki Talep Aç sekmesinden yeni talep oluşturun." },
    ],
    next: "Müşteri bulunduysa kaydı açıp Talep Aç sekmesiyle devam edin; yeni arayan için Telefon talebi ekranını kullanın.",
  },
  {
    id: "phone", number: "04", title: "Telefon Talebi", icon: Phone,
    summary: "Telefon görüşmesini mevcut ya da yeni müşteri adına talebe dönüştürün.",
    route: "/admin/phone-support",
    screenshots: [
      {
        src: "/guide/telefon-arama.png",
        label: "Arayanı Bul",
        alt: "Telefon desteği ekranında mevcut müşteri araması",
        pins: [
          { detail: 1, labelX: 46, labelY: 20, targetX: 54, targetY: 28 },
          { detail: 2, labelX: 88, labelY: 20, targetX: 95, targetY: 28 },
        ],
      },
      {
        src: "/guide/telefon-mevcut-kisi.png",
        label: "Mevcut Kişiye Talep",
        alt: "Seçilen mevcut müşteri için telefon talebi formu",
        pins: [
          { detail: 3, labelX: 30, labelY: 38, targetX: 23, targetY: 49 },
        ],
      },
      {
        src: "/guide/telefon-yeni-kisi.png",
        label: "Yeni Arayan",
        alt: "Yeni arayan kişi ve talep bilgilerinin birlikte girildiği form",
        pins: [
          { detail: 4, labelX: 27, labelY: 39, targetX: 36, targetY: 57 },
          { detail: 5, labelX: 84, labelY: 39, targetX: 76, targetY: 59 },
          { detail: 6, labelX: 67, labelY: 88, targetX: 54, targetY: 89 },
        ],
      },
    ],
    details: [
      { title: "Arayanı Bul", text: "Telefon, e-posta veya adla arayıp doğru kişiyi seçin." },
      { title: "Yeni Arayan Ekle", text: "Kişi kayıtlı değilse + düğmesine basın; yeni kişi formu açılır." },
      { title: "Kayıtlı Kişiye Talep Aç", text: "Kişiyi seçin; iletişim bilgileri hazır gelir." },
      { title: "Yeni Kişi Bilgileri", text: "Ad, telefon, e-posta ve varsa şirket bilgisini girin." },
      { title: "Talep Bilgileri", text: "Proje, konu, açıklama, departman ve sorumlu personeli belirleyin." },
      { title: "Konuşmaya Geçiş", text: "Talep oluşturulduğunda konuşma ekranından devam edin." },
    ],
    next: "Talebi oluşturduktan sonra konuşma ekranından devam edin.",
  },
  {
    id: "conversation", number: "05", title: "Konuşma Ekranı", icon: MessageSquare,
    summary: "Müşteriyle yazışın, talebin sorumlusunu belirleyin ve çözüm sürecini yönetin.",
    route: "/admin/conversations",
    screenshots: [{
      src: "/guide/konusma-detayi.png",
      label: "Konuşma ve Talep Yönetimi",
      alt: "Mesaj geçmişi, yanıt alanı ve talep bilgileri bulunan konuşma ekranı",
      pins: [
        { detail: 1, labelX: 75, labelY: 11, targetX: 88, targetY: 17 },
        { detail: 2, labelX: 38, labelY: 15, targetX: 30, targetY: 22 },
        { detail: 3, labelX: 40, labelY: 28, targetX: 37, targetY: 37 },
        { detail: 4, labelX: 60, labelY: 68, targetX: 50, targetY: 83 },
        { detail: 5, labelX: 80, labelY: 43, targetX: 91, targetY: 54 },
        { detail: 6, labelX: 79, labelY: 61, targetX: 88, targetY: 67 },
      ],
    }],
    details: [
      { title: "Talep Kaynağı ve Durumu", text: "Talebi kimin oluşturduğunu, kanalı ve durumunu görün." },
      { title: "Müşteri Bilgileri", text: "Başlığın altından müşteri iletişim bilgilerine ulaşın." },
      { title: "Mesaj Geçmişi", text: "Müşteri ve personel mesajlarını zaman sırasıyla okuyun." },
      { title: "Yanıt ve Dahili Not", text: "Müşteriye yanıt verin veya ekibin görebileceği dahili not ekleyin." },
      { title: "Talep Bilgileri", text: "Durum, öncelik, proje, departman, sorumlu personel ve etiketleri düzenleyin." },
      { title: "Talebi Sonuçlandır", text: "Çözüm tamamlandığında talebin durumunu güncelleyin." },
    ],
    next: "Yanıtı gönderdikten sonra talebin durumunu güncelleyin ve çözüm tamamlandıysa talebi kapatın.",
  },
];

type SettingsScreen = {
  icon: LucideIcon;
  title: string;
  text: string;
  details: string[];
};

const settingsScreens: SettingsScreen[] = [
  { icon: UsersRound, title: "Personeller ve Departmanlar", text: "Ekip hesaplarını ve çalışma birimlerini yönetin.", details: ["Rol ve departman atayın; hesapları aktif veya pasif yapın.","Personel formundan yetenekleri ekleyin."] },
  { icon: Tags, title: "Kategoriler ve Personel Yetenekleri", text: "Talepleri ve ekip yeteneklerini sınıflandırın.", details: ["Etiket, durum ve öncelikleri düzenleyin.","Personel Yetenekleri bölümünde kategori, yetenek ve seviye tanımlayın."] },
  { icon: Settings, title: "Entegrasyonlar", text: "Mesaj kanallarını ve form bağlantılarını kurun.", details: ["E-Posta, SMS ve WhatsApp bağlantılarını test edin.","Form alanlarını ve Cloudflare doğrulamasını ayarlayın."] },
  { icon: Timer, title: "Yanıt Süreleri", text: "Yanıt eşiklerini ve personelin boşta kalma süresini belirleyin.", details: ["Süre aralıklarını ve renkleri seçin.","Personel Süresi sekmesinden boşta kalma eşiğini ayarlayın."] },
  { icon: ShieldCheck, title: "Roller", text: "Personelin erişebileceği ekranları ve işlemleri belirleyin.", details: ["Hazır şablonu kullanın veya yeni rol oluşturun.","İzinleri ve talep kapsamını belirleyip rolü personele atayın."] },
  { icon: Activity, title: "Personel Etkinliği", text: "Ekibin anlık durumunu ve destek yükünü görün.", details: ["Çevrimiçi, Boşta veya Çevrimdışı durumuna göre filtreleyin.","Yanıt, çözüm ve açık atama sayılarını inceleyin."] },
  { icon: Tags, title: "Projeler", text: "Destek verilen ürün, site ve hizmetleri tanımlayın.", details: ["Proje adı, web adresi ve dosyalarını ekleyin.","Talep oluştururken ilgili projeyi seçin."] },
  { icon: BookOpen, title: "Rehber", text: "Proje bilgilerine ve kullanım adımlarına ulaşın.", details: ["Proje Rehberi bölümünden destek bilgilerini bulun.","Sistem Rehberi görsellerini tam boy açarak inceleyin."] },
  { icon: ClipboardList, title: "Anketler", text: "Ekipten görüş ve geri bildirim alın.", details: ["Soruları ve katılımcıları belirleyin.","Katılımı ve yanıtları İstatistikler bölümünde görün."] },
  { icon: BarChart3, title: "Raporlar", text: "Talep, ekip ve departman performansını inceleyin.", details: ["Dönemi, personeli veya departmanı seçin.","Personel kredi kullanımını ve ilgili talepleri takip edin."] },
  { icon: History, title: "İşlem Geçmişi", text: "Kimin, ne zaman, hangi işlemi yaptığını bulun.", details: ["Kullanıcı veya işlemle arayın.","Talebe bağlı kayıttan görüşmeyi açın."] },
  { icon: FileText, title: "Kredi ve Paketler", text: "Kredi paketlerini, siparişleri ve abonelikleri yönetin.", details: ["Paket içeriklerini ve fiyatlarını düzenleyin.","Siparişlerin ödeme ve kredi durumlarını takip edin."] },
  { icon: Settings, title: "Ödeme Ayarları", text: "Banka ve ödeme sağlayıcılarını bağlayın.", details: ["Sağlayıcı bilgilerini girip bağlantıyı test edin.","İlgili sağlayıcının online ödeme anahtarını kullanın."] },
  { icon: BarChart3, title: "Para Birimleri", text: "Kur ve otomatik güncelleme ayarlarını yönetin.", details: ["Para birimini ve kur tipini seçin.","Kurları güncelleyin; aktiflik durumunu değiştirin."] },
  { icon: Building2, title: "Müşteri Anlaşmaları ve Kredi Geçmişi", text: "Müşteri kaydından anlaşmaları ve kredi hareketlerini inceleyin.", details: ["Anlaşma tarihlerini, toplam ve kalan krediyi görün.","Şirket ve kişi filtreleriyle kullanımları inceleyin; geçmişi Excel olarak indirin."] },
  { icon: FileText, title: "Dosyalar", text: "Dosyaları klasörlerde düzenleyip paylaşın.", details: ["Klasör oluşturun veya dosya yükleyin.","Aramayla dosyayı bulun; liste ya da kart görünümünü kullanın."] },
  { icon: ClipboardList, title: "Takvim", text: "Duyuruları ve özel günleri aylık görünümde takip edin.", details: ["Oklarla ay değiştirin; Bugün ile bu aya dönün.","Bir güne dokunup o günün duyurularını açın."] },
  { icon: MessageSquare, title: "Hazır Yanıtlar", text: "Sık kullanılan destek mesajlarını kaydedin.", details: ["Şablonları oluşturun ve düzenleyin.","Konuşmadaki hazır yanıt alanından seçip kullanın."] },
  { icon: Bell, title: "Bildirimler", text: "Yeni talepleri ve ekip duyurularını takip edin.", details: ["Üst çubuktaki zilden bildirimleri açın.","Bildirim Ayarları bölümünden gönderim tercihlerini yönetin."] },
  { icon: UserRound, title: "Profil", text: "Hesap ve güvenlik bilgilerinizi yönetin.", details: ["Sağ üstteki profil düğmesinden hesabınızı açın.","İletişim ve güvenlik bilgilerinizi güncelleyin."] },
];

function AnnotatedShot({ shot, markerId, eager = false }: { shot: GuideShot; markerId: string; eager?: boolean }) {
  return (
    <div className="guide-annotated-shot">
      <img src={`${shot.src}?v=20261126`} alt={shot.alt} loading={eager ? "eager" : "lazy"} />
      {!!shot.pins?.length && (
        <svg className="guide-arrow-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <marker id={markerId} markerWidth="6" markerHeight="6" refX="5" refY="3" orient="auto" markerUnits="strokeWidth">
              <path d="M0,0 L6,3 L0,6 Z" />
            </marker>
          </defs>
          {shot.pins.map((pin) => (
            <line
              key={`${shot.src}-arrow-${pin.detail}`}
              x1={pin.labelX}
              y1={pin.labelY}
              x2={pin.targetX}
              y2={pin.targetY}
              markerEnd={`url(#${markerId})`}
            />
          ))}
        </svg>
      )}
      {shot.pins?.map((pin) => (
        <span
          className="guide-pin"
          key={`${shot.src}-${pin.detail}`}
          style={{ left: `${pin.labelX}%`, top: `${pin.labelY}%` }}
          aria-hidden="true"
        >
          {pin.detail}
        </span>
      ))}
    </div>
  );
}

function Screenshot({ screen }: { screen: GuideScreen }) {
  const [activeIndex, setActiveIndex] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const shots = screen.screenshots ?? [];
  const activeShot = shots[activeIndex];
  const arrowMarkerId = `guide-arrow-${screen.id}-${activeIndex}`;

  useEffect(() => {
    if (!isFullscreen) return undefined;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setIsFullscreen(false);
    };
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [isFullscreen]);

  return (
    <div className="guide-screen-media">
      {activeShot ? (
        <>
          <div className="guide-shot-stage">
            <button
              type="button"
              className="guide-shot-link"
              onClick={() => setIsFullscreen(true)}
              aria-label={`${activeShot.label} ekran görüntüsünü oklarla birlikte tam boy aç`}
            >
              <AnnotatedShot shot={activeShot} markerId={arrowMarkerId} />
              <span className="guide-zoom-hint">Tam boy görüntüle</span>
            </button>
          </div>
          {shots.length > 1 && (
            <div className="guide-shot-tabs" role="tablist" aria-label={`${screen.title} ekran görüntüleri`}>
              {shots.map((shot, index) => (
                <button
                  type="button"
                  role="tab"
                  aria-selected={index === activeIndex}
                  className={index === activeIndex ? "active" : ""}
                  onClick={() => setActiveIndex(index)}
                  key={shot.src}
                >
                  <span>{index + 1}</span>{shot.label}
                </button>
              ))}
            </div>
          )}
          {isFullscreen && createPortal(
            <div className="guide-fullscreen" role="dialog" aria-modal="true" aria-label={`${activeShot.label} tam boy görünümü`} onMouseDown={(event) => { if (event.currentTarget === event.target) setIsFullscreen(false); }}>
              <div className="guide-fullscreen-panel">
                <div className="guide-fullscreen-heading"><div><strong>{screen.title}</strong><span>{activeShot.label}</span></div><button type="button" onClick={() => setIsFullscreen(false)} aria-label="Tam Boy Görünümü Kapat"><X size={20} /></button></div>
                <div className="guide-fullscreen-canvas"><AnnotatedShot shot={activeShot} markerId={`${arrowMarkerId}-fullscreen`} eager /></div>
              </div>
            </div>,
            document.body,
          )}
        </>
      ) : (
        <div className="guide-shot-pending"><screen.icon size={32} /><strong>{screen.title}</strong><span>Güncel ekran görüntüsü bekleniyor</span><Link to={screen.route}>Ekranı Aç <ChevronRight size={14} /></Link></div>
      )}
    </div>
  );
}

function ScreenGuide({ screen }: { screen: GuideScreen }) {
  return (
    <section className="guide-screen-row" id={screen.id}>
      <Screenshot screen={screen} />
      <div className="guide-screen-copy">
        <div className="guide-screen-intro">
        <span className="guide-eyebrow">{screen.number} · Çalışma Alanı</span>
        <h2>{screen.title}</h2>
        <p>{screen.summary}</p>
        </div>
        <ol className="guide-callout-list">
          {screen.details.map((detail, index) => (
            <li key={detail.title}><span>{index + 1}</span><div><h3>{detail.title}</h3><p>{detail.text}</p></div></li>
          ))}
        </ol>
        <p className="guide-next"><ChevronRight size={15} />{screen.next}</p>
      </div>
    </section>
  );
}

export function GuidePage() {
  const flowGroups: Array<{
    title: string;
    description: string;
    steps: Array<[LucideIcon, string, string]>;
  }> = [
    {
      title: "Normal Destek Akışı",
      description: "Gelen talebi bulun, yanıtlayın ve sonuçlandırın.",
      steps: [
        [LayoutDashboard, "Kontrol et", "Açık ve bekleyen talepleri görün."],
        [Inbox, "Talebi bul", "Arayın veya filtreleyin."],
        [MessageSquare, "Yanıtla", "Mesajı okuyup yanıt verin."],
        [CheckCircle2, "Sonuçlandır", "Talebin durumunu güncelleyin."],
      ],
    },
    {
      title: "Telefon Talebi · Mevcut Kişi",
      description: "Kayıtlı müşteri adına talep açın.",
      steps: [
        [Phone, "Arayanı bul", "Ad, telefon veya e-posta yazın."],
        [UsersRound, "Kişiyi seç", "İletişim bilgisini kontrol edin."],
        [FileText, "Talebi oluştur", "Konu ve açıklamayı doldurun."],
        [MessageSquare, "Takip et", "Konuşma ekranından devam edin."],
      ],
    },
    {
      title: "Telefon Talebi · Yeni Kişi Ekleme",
      description: "Yeni kişiyle talebi birlikte oluşturun.",
      steps: [
        [Phone, "Önce ara", "Kişinin kayıtlı olmadığını doğrulayın."],
        [UserPlus, "Yeni kişi", "+ düğmesiyle formu açın."],
        [UsersRound, "Bilgileri gir", "Kişi ve talep alanlarını doldurun."],
        [MessageSquare, "Oluştur", "Açılan konuşmadan devam edin."],
      ],
    },
  ];
  return (
    <main className="page guide-page">
      <div className="page-heading guide-page-heading"><div><h1>Sistemi Adım Adım Kullanın</h1></div></div>
      <section className="guide-flow-section" aria-labelledby="work-flow-title">
        <span className="guide-eyebrow">Günlük Kullanım</span>
        <h2 id="work-flow-title">Talep Ekranları Birbirine Nasıl Bağlanır?</h2>
        <p className="guide-flow-intro">İşinize uygun akışı seçin; adımları sırayla izleyin.</p>
        <div className="guide-flow-grid">
          {flowGroups.map(({ title, description, steps }) => (
            <article className="guide-flow-card" key={title}>
              <div className="guide-flow-card-heading"><h3>{title}</h3><p>{description}</p></div>
              <ol>
                {steps.map(([Icon, label, text], index) => (
                  <li key={label}>
                    <span className="guide-flow-step"><Icon size={16} /><b>{index + 1}</b></span>
                    <div><strong>{label}</strong><small>{text}</small></div>
                    {index < steps.length - 1 && <ChevronRight className="guide-flow-arrow" size={15} aria-hidden="true" />}
                  </li>
                ))}
              </ol>
            </article>
          ))}
        </div>
        <div className="guide-phone-add-note"><UserPlus size={18} /><div><strong>Yeni kişi eklerken önemli</strong><p>Aynı adlı kişiler olabilir. Yeni kayıt açmadan önce telefon ve e-postayı kontrol edin.</p></div></div>
      </section>
      <div className="guide-screen-list">{workScreens.map((screen) => <ScreenGuide key={screen.id} screen={screen} />)}</div>
      <section className="guide-settings" id="settings">
        <div className="guide-section-heading"><span className="guide-eyebrow">Yönetim ve Ekip Araçları</span><h2>Ayarlar ve Yönetim Ekranları</h2><p>Ekranlar ve yapabileceğiniz işlemler hesabınızın yetkilerine bağlıdır.</p></div>
        <div className="guide-directory-grid">
          {settingsScreens.map(({ icon: Icon, title, text, details }, index) => (
            <article key={title}>
              <div className="guide-setting-icon"><Icon size={18} /></div>
              <div className="guide-setting-copy">
                <span className="guide-setting-number">Ekran {String(index + 1).padStart(2, "0")}</span>
                <strong>{title}</strong>
                <p>{text}</p>
                <ul>{details.map((detail) => <li key={detail}>{detail}</li>)}</ul>
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="guide-footer-note"><Bell size={16} /><span>Bildirimler üst çubukta, Hazır yanıtlar alt menüde, Profil ise sağ üstte bulunur.</span><FileText size={16} /><UserRound size={16} /></section>
    </main>
  );
}
