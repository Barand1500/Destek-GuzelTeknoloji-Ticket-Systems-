import type { LucideIcon } from "lucide-react";
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import {
  Activity, ArrowRight, Bell, BookOpen, CheckCircle2, ChevronRight, FileText, Inbox,
  LayoutDashboard, Mail, MessageSquare, Phone, Settings, Tags,
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
    id: "dashboard", number: "01", title: "Genel bakış", icon: LayoutDashboard,
    summary: "Güne başlarken taleplerin ve ekibin genel durumunu burada kontrol edin.",
    route: "/admin/dashboard",
    screenshots: [{
      src: "/guide/genel-bakis.png",
      label: "Genel görünüm",
      alt: "Genel bakış ekranında talep sayaçları ve durum grafiği",
      pins: [
        { detail: 1, labelX: 28, labelY: 23, targetX: 36, targetY: 33 },
        { detail: 2, labelX: 81, labelY: 61, targetX: 88, targetY: 52 },
        { detail: 3, labelX: 61, labelY: 69, targetX: 70, targetY: 76 },
        { detail: 4, labelX: 86, labelY: 20, targetX: 94, targetY: 15 },
      ],
    }],
    details: [
      { title: "Talep sayaçları", text: "Toplam, açık, bekleyen, çözülen ve kapalı talep sayılarını; bugün açılan talepleri görün." },
      { title: "Ekip yükü", text: "Atanmamış talepleri ve aktif personel sayısını izleyerek hangi işe öncelik vereceğinizi belirleyin." },
      { title: "Durum grafiği", text: "Taleplerin durumlara dağılımını görün. Grafiğin yanındaki duruma tıklayınca gelen kutusu o duruma göre açılır." },
      { title: "Taleplere git", text: "Üstteki düğme sizi doğrudan gelen kutusuna götürür." },
    ],
    next: "İşlem gerektiren bir talep gördüğünüzde Gelen kutusuna geçin.",
  },
  {
    id: "inbox", number: "02", title: "Gelen kutusu", icon: Inbox,
    summary: "Tüm destek taleplerini bulun, süzün ve ilgili konuşmayı açın.",
    route: "/admin/conversations",
    screenshots: [
      {
        src: "/guide/gelen-kutusu.png",
        label: "Talep listesi",
        alt: "Gelen kutusu talep listesi, sekmeler ve filtreler",
        pins: [
          { detail: 1, labelX: 18, labelY: 18, targetX: 25, targetY: 25 },
          { detail: 2, labelX: 36, labelY: 23, targetX: 25, targetY: 32 },
          { detail: 3, labelX: 60, labelY: 39, targetX: 53, targetY: 46 },
          { detail: 4, labelX: 79, labelY: 38, targetX: 83, targetY: 46 },
          { detail: 5, labelX: 16, labelY: 52, targetX: 23, targetY: 44 },
        ],
      },
    ],
    details: [
      { title: "Görünüm sekmeleri", text: "Tümü, Mail, Bana atanan, Atanmamış ve etiket görünümleri arasında geçin. Kalem simgesiyle sekmeleri düzenleyin." },
      { title: "Arama ve filtreler", text: "Talep numarası, konu, müşteri veya personel arayın. Kayıt sayısını, durumu ve önceliği ayrıca seçin." },
      { title: "Talep tablosu", text: "Her satırda kanal, durum, öncelik, departman, atanan personel, açılış ve son güncelleme bilgisi vardır." },
      { title: "Yanıt süresi", text: "Yanıt bekleyen veya cevaplanmış talebin süre bilgisini aynı satırda izleyin." },
      { title: "Konuşmaya geçiş", text: "Talep başlığına tıklayın; mesaj geçmişi ve yanıt alanı açılır." },
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
        label: "Müşteri yönetimi",
        alt: "Müşteri arama, kayıt listesi ve hızlı işlem düğmeleri",
        pins: [
          { detail: 1, labelX: 20, labelY: 19, targetX: 26, targetY: 27 },
          { detail: 2, labelX: 89, labelY: 19, targetX: 95, targetY: 27 },
          { detail: 3, labelX: 42, labelY: 61, targetX: 49, targetY: 52 },
          { detail: 4, labelX: 56, labelY: 31, targetX: 61, targetY: 41 },
          { detail: 5, labelX: 74, labelY: 31, targetX: 68, targetY: 40 },
        ],
      },
      {
        src: "/guide/musteri-gelen-kutusu.png",
        label: "Müşterinin görüşmeleri",
        alt: "Görüşmeleri aç düğmesiyle seçili müşteriye göre filtrelenmiş gelen kutusu",
        pins: [
          { detail: 4, labelX: 47, labelY: 20, targetX: 31, targetY: 14 },
        ],
      },
    ],
    details: [
      { title: "Müşteri arama", text: "Ad, telefon veya e-posta ile kayıt arayın. Aynı adlı kişileri iletişim bilgilerinden ayırt edin." },
      { title: "Yeni müşteri", text: "Sağdaki + düğmesiyle ad, telefon, ek iletişim bilgileri, şirket, personel notu ve dosya ekleyin." },
      { title: "Kayıt listesi", text: "İletişim bilgilerini, hesap durumunu ve kayıt üzerindeki personel notunu inceleyin. Kaydı düzenleyebilir veya dosyalarını görebilirsiniz." },
      { title: "Görüşmeleri aç", text: "Seçili müşterinin taleplerini gelen kutusunda filtreli olarak açın." },
      { title: "Talep aç", text: "Müşteriyi önceden seçilmiş olarak Telefon talebi ekranına geçin." },
    ],
    next: "Müşteri bulunduysa Talep aç ile devam edin; yeni arayan için Telefon talebi ekranını kullanın.",
  },
  {
    id: "phone", number: "04", title: "Telefon talebi", icon: Phone,
    summary: "Telefon görüşmesini mevcut ya da yeni müşteri adına talebe dönüştürün.",
    route: "/admin/phone-support",
    screenshots: [
      {
        src: "/guide/telefon-arama.png",
        label: "Arayanı bul",
        alt: "Telefon desteği ekranında mevcut müşteri araması",
        pins: [
          { detail: 1, labelX: 46, labelY: 20, targetX: 54, targetY: 30 },
          { detail: 2, labelX: 88, labelY: 20, targetX: 95, targetY: 30 },
        ],
      },
      {
        src: "/guide/telefon-mevcut-kisi.png",
        label: "Mevcut kişiye talep",
        alt: "Seçilen mevcut müşteri için telefon talebi formu",
        pins: [
          { detail: 3, labelX: 30, labelY: 22, targetX: 17, targetY: 31 },
        ],
      },
      {
        src: "/guide/telefon-yeni-kisi.png",
        label: "Yeni arayan",
        alt: "Yeni arayan kişi ve talep bilgilerinin birlikte girildiği form",
        pins: [
          { detail: 4, labelX: 27, labelY: 49, targetX: 36, targetY: 58 },
          { detail: 5, labelX: 84, labelY: 49, targetX: 76, targetY: 58 },
          { detail: 6, labelX: 64, labelY: 89, targetX: 54, targetY: 84 },
        ],
      },
    ],
    details: [
      { title: "Arayanı bul", text: "Telefon, e-posta veya ad yazın. Eşleşen kayıtların iletişim bilgilerini karşılaştırıp doğru kişiyi seçin." },
      { title: "Yeni arayan ekle", text: "Aynı adla kayıt bulunsa bile Enter veya sağdaki + yeni kişi formunu açar; arama sonuçları gizlenir." },
      { title: "Kayıtlı kişiye talep aç", text: "Arama sonucundan kayıtlı kişiyi seçtiğinizde kişinin adı hazır gelir ve yalnızca Talep bilgileri formu gösterilir." },
      { title: "Yeni kişi bilgileri", text: "Yeni arayan için ad, telefon, e-posta, şirket ve isteğe bağlı kalıcı müşteri notunu doldurun." },
      { title: "Talep bilgileri", text: "Proje, konu, açıklama, departman ve atanacak personeli seçin. Gerekli alanları tamamlayıp talebi oluşturun." },
      { title: "Konuşmaya geçiş", text: "Oluşturulan talep sizi doğrudan konuşma ekranına taşır." },
    ],
    next: "Talep açılınca konuşma ekranından yanıtı ve durumunu takip edin.",
  },
  {
    id: "conversation", number: "05", title: "Konuşma ekranı", icon: MessageSquare,
    summary: "Müşteriyle yazışın, talebin sorumlusunu belirleyin ve çözüm sürecini yönetin.",
    route: "/admin/conversations",
    screenshots: [{
      src: "/guide/konusma-detayi.png",
      label: "Konuşma ve talep yönetimi",
      alt: "Mesaj geçmişi, yanıt alanı ve talep bilgileri bulunan konuşma ekranı",
      pins: [
        { detail: 1, labelX: 75, labelY: 12, targetX: 88, targetY: 18 },
        { detail: 2, labelX: 38, labelY: 17, targetX: 30, targetY: 24 },
        { detail: 3, labelX: 40, labelY: 38, targetX: 50, targetY: 48 },
        { detail: 4, labelX: 60, labelY: 73, targetX: 50, targetY: 84 },
        { detail: 5, labelX: 80, labelY: 43, targetX: 91, targetY: 54 },
        { detail: 6, labelX: 79, labelY: 70, targetX: 89, targetY: 78 },
      ],
    }],
    details: [
      { title: "Talep kaynağı ve durumu", text: "Sağ üstte talebi kimin oluşturduğunu, geldiği kanalı ve güncel durumunu kontrol edin." },
      { title: "Müşteri bilgileri", text: "Talep sahibinin adını, telefonunu ve e-posta adresini başlığın altındaki bilgi şeridinde görün." },
      { title: "Mesaj geçmişi", text: "Müşteri ve personel mesajlarını zaman sırasıyla okuyun; mesaj sayısını konuşma başlığından takip edin." },
      { title: "Yanıt ve dahili not", text: "Müşteriye yanıt yazın veya yalnızca personelin görebileceği Dahili not ekleyin. Hazır yanıt ve dosya ekleme araçlarını kullanın." },
      { title: "Talep bilgileri", text: "Sağ panelden durum, öncelik, proje, departman, atanan personel ve etiketleri güncelleyin." },
      { title: "Talebi sonuçlandır", text: "İşlem tamamlandığında Çözüldü olarak işaretle düğmesini kullanın; silme işlemini yalnızca gerçekten gerekiyorsa yapın." },
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
  {
    icon: Settings,
    title: "Entegrasyonlar",
    text: "Sisteme mesaj getiren ve sistemden yanıt gönderen kanallar burada bağlanır.",
    details: [
      "E-posta hesabının IMAP ve SMTP bağlantı bilgilerini girin.",
      "Bağlantıyı test edin; çalışan ve sorunlu kanalları durum bilgisinden izleyin.",
      "SMS ve WhatsApp kullanıma açıldığında ilgili hesapları aynı alandan yönetin.",
    ],
  },
  {
    icon: Timer,
    title: "Yanıt süreleri",
    text: "Ekibin yanıt performansında kullanılacak süre kuralları iki ayrı sekmede yönetilir.",
    details: [
      "Yanıt süresi sekmesinde ilk yanıt için süre aralıklarını belirleyin.",
      "Personel süresi sekmesinde işlem yapılmadığında kaç dakika sonra Boşta görüneceğini ayarlayın.",
      "Değişiklikleri kaydettikten sonra yeni hesaplamalar belirlenen süreleri kullanır.",
    ],
  },
  {
    icon: Mail,
    title: "E-posta bildirimleri",
    text: "Müşteriye gönderilen otomatik e-postaların içeriğini ve görünümünü düzenleyin.",
    details: [
      "Talep oluşturulduğunda gönderilecek konu ve mesaj metnini belirleyin.",
      "Yeni yanıt ve durum değişikliği bildirimlerini ayrı ayrı düzenleyin.",
      "Şablondaki değişkenleri koruyarak müşteri ve talep bilgilerinin otomatik gelmesini sağlayın.",
    ],
  },
  {
    icon: Activity,
    title: "Personel aktivitesi",
    text: "Ekibin o anki durumunu ve destek performansını tek ekranda takip edin.",
    details: [
      "Çevrimiçi, Boşta veya Çevrimdışı özet kutusuna basarak personeli filtreleyin.",
      "Personelin şu an ne yaptığını ve son hareket zamanını görün.",
      "Bugün cevaplanan, bugün çözülen, toplam cevaplanan, açık atama ve ortalama ilk yanıt değerlerini inceleyin.",
    ],
  },
  {
    icon: UsersRound,
    title: "Personeller",
    text: "Destek ekibinin hesaplarını, yetkilerini ve çalışma alanlarını yönetin.",
    details: [
      "Yeni personel hesabı açın veya mevcut hesabın bilgilerini güncelleyin.",
      "Yönetici, departman sorumlusu ve destek uzmanı gibi rol ve yetkileri belirleyin.",
      "Personeli bir veya birden fazla departmana bağlayın; gerekirse hesabı pasif duruma alın.",
    ],
  },
  {
    icon: Tags,
    title: "Kategoriler",
    text: "Taleplerin düzenli bulunmasını sağlayan etiket ve sınıflandırmaları yönetin.",
    details: [
      "Yeni kategori veya etiket ekleyin ve adını düzenleyin.",
      "Gelen kutusunda kullanılacak özel görünümleri sınıflandırmalara göre hazırlayın.",
      "Artık kullanılmayan kayıtları silmeden önce bağlı talepleri kontrol edin.",
    ],
  },
  {
    icon: Tags,
    title: "Projeler",
    text: "Talebin hangi ürün, site veya hizmetle ilgili olduğunu gösteren proje kayıtlarını yönetin.",
    details: [
      "Yeni proje ekleyin; proje adını ve varsa web adresini kaydedin.",
      "Telefon talebi ve konuşma panelindeki Proje alanı bu listedeki kayıtları kullanır.",
      "Proje seçimi sayesinde aynı müşterinin farklı ürünlerle ilgili taleplerini ayırın.",
    ],
  },
  {
    icon: BookOpen,
    title: "Sistem rehberi",
    text: "Günlük talep akışını ve yönetici ekranlarının ne işe yaradığını burada öğrenin.",
    details: [
      "Üstteki bölüm beş ana çalışma ekranını gerçek görüntülerle anlatır.",
      "Numaralı oklar, açıklamadaki adımın ekranda bulunduğu yeri gösterir.",
      "Ayar ekranlarının güncel görüntüleri geldikçe bu bölüm ayrıca görselleştirilecektir.",
    ],
  },
];

function AnnotatedShot({ shot, markerId, eager = false }: { shot: GuideShot; markerId: string; eager?: boolean }) {
  return (
    <div className="guide-annotated-shot">
      <img src={`${shot.src}?v=20261007`} alt={shot.alt} loading={eager ? "eager" : "lazy"} />
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
                <div className="guide-fullscreen-heading"><div><strong>{screen.title}</strong><span>{activeShot.label}</span></div><button type="button" onClick={() => setIsFullscreen(false)} aria-label="Tam boy görünümü kapat"><X size={20} /></button></div>
                <div className="guide-fullscreen-canvas"><AnnotatedShot shot={activeShot} markerId={`${arrowMarkerId}-fullscreen`} eager /></div>
              </div>
            </div>,
            document.body,
          )}
        </>
      ) : (
        <div className="guide-shot-pending"><screen.icon size={32} /><strong>{screen.title}</strong><span>Güncel ekran görüntüsü bekleniyor</span><Link to={screen.route}>Ekranı aç <ChevronRight size={14} /></Link></div>
      )}
    </div>
  );
}

function ScreenGuide({ screen }: { screen: GuideScreen }) {
  return (
    <section className="guide-screen-row" id={screen.id}>
      <Screenshot screen={screen} />
      <div className="guide-screen-copy">
        <span className="guide-eyebrow">{screen.number} · Çalışma alanı</span>
        <h2>{screen.title}</h2>
        <p>{screen.summary}</p>
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
      title: "Normal destek akışı",
      description: "E-posta veya diğer kanallardan gelen bir talebi bulup sonuçlandırma sırası.",
      steps: [
        [LayoutDashboard, "Genel bakış", "Açık, bekleyen ve atanmamış talepleri kontrol edin."],
        [Inbox, "Gelen kutusu", "Talebi arayın veya filtreleyin ve başlığına tıklayın."],
        [MessageSquare, "Konuşma", "Mesajı okuyun, atamayı yapın ve müşteriye yanıt verin."],
        [CheckCircle2, "Sonuçlandır", "Durumu güncelleyin ve tamamlanan talebi çözüldü olarak işaretleyin."],
      ],
    },
    {
      title: "Telefon talebi · mevcut kişi",
      description: "Arayan kişi sistemde kayıtlıysa bilgilerini yeniden girmeden talep açın.",
      steps: [
        [Phone, "Arayanı ara", "Telefon, e-posta veya adı arama alanına yazın."],
        [UsersRound, "Kaydı seç", "İletişim bilgisini kontrol edip doğru müşteriye tıklayın."],
        [FileText, "Talebi doldur", "Proje, konu, açıklama, departman ve personel bilgilerini seçin."],
        [MessageSquare, "Takibe geç", "Talebi oluşturun; açılan konuşma ekranından süreci yönetin."],
      ],
    },
    {
      title: "Telefon talebi · yeni kişi ekleme",
      description: "Arayan sistemde yoksa kişi kaydıyla talebi aynı işlem içinde oluşturun.",
      steps: [
        [Phone, "Önce arayın", "Mükerrer kayıt oluşmaması için adı, telefonu veya e-postayı kontrol edin."],
        [UserPlus, "Enter veya +", "Eşleşme olsun ya da olmasın Enter'a veya sağdaki + düğmesine basın."],
        [UsersRound, "Kişi + talep", "Solda yeni kişinin, sağda açılacak talebin bilgilerini doldurun."],
        [MessageSquare, "Birlikte oluştur", "Kişiyi ve talebi oluşturun; konuşma ekranından devam edin."],
      ],
    },
  ];
  return (
    <main className="page guide-page">
      <div className="page-heading guide-page-heading"><div><h1>Sistemi adım adım kullanın</h1></div></div>
      <section className="guide-flow-section" aria-labelledby="work-flow-title">
        <span className="guide-eyebrow">Günlük kullanım</span>
        <h2 id="work-flow-title">Talep ekranları birbirine nasıl bağlanır?</h2>
        <p className="guide-flow-intro">Aşağıdaki üç akıştan size uygun olanı izleyin. Her kutu, bir sonraki ekrana hangi işlemle geçileceğini gösterir.</p>
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
        <div className="guide-phone-add-note"><UserPlus size={18} /><div><strong>Yeni kişi eklerken önemli</strong><p>Arama sonucunda aynı isimli kişiler görünse bile yeni bir kayıt açabilirsiniz. Enter veya sağdaki + düğmesi sonuç listesini kapatır ve Yeni arayan kişi formunu açar. Böylece aynı isimli farklı bir kişiye telefon ve e-posta bilgileriyle ayrı kayıt oluşturulur.</p></div></div>
      </section>
      <div className="guide-screen-list">{workScreens.map((screen) => <ScreenGuide key={screen.id} screen={screen} />)}</div>
      <section className="guide-settings" id="settings">
        <div className="guide-section-heading"><span className="guide-eyebrow">Yönetici alanı</span><h2>Ayarlar ekranları</h2><p>Bu bölüm destek işleminin günlük akışından ayrıdır. Yetkili kullanıcılar burada kanalları, süreleri ve ekip kayıtlarını yapılandırır.</p></div>
        <div className="guide-settings-flow">
          {[
            "Kanalları bağla",
            "Süre ve bildirimleri ayarla",
            "Personel ve projeleri tanımla",
            "Aktiviteyi takip et",
          ].map((step, index, items) => <span key={step}><b>{index + 1}</b>{step}{index < items.length - 1 && <ArrowRight size={22} />}</span>)}
        </div>
        <div className="guide-directory-grid">
          {settingsScreens.map(({ icon: Icon, title, text, details }, index) => (
            <article key={title}>
              <div className="guide-setting-icon"><Icon size={18} /></div>
              <div className="guide-setting-copy">
                <span className="guide-setting-number">Ayar {String(index + 1).padStart(2, "0")}</span>
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
