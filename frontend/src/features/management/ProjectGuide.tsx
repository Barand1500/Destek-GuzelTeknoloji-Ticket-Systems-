import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import {
  BookOpen,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  ExternalLink,
  Layers3,
  LifeBuoy,
  MessageCircleQuestion,
  Wrench,
} from "lucide-react";
import type { Page, Website } from "../../types";
import { api } from "../../services/api";
import { Heading, ListState } from "./shared";
import { projectKnowledge, type KnowledgeTopic } from "./projectGuideKnowledge";

type ProductArea = { title: string; description: string };
type Integration = { title: string; description: string };
type SupportPlaybook = {
  title: string;
  summary: string;
  checks: string[];
  collect: string[];
  outcome: string;
};
type SupportGuide = {
  sourceUrl: string;
  sourceLabel: string;
  productAreas: ProductArea[];
  integrations: Integration[];
  architecture: string[];
  playbooks: SupportPlaybook[];
  knowledgeTopics: KnowledgeTopic[];
};

const guides: Record<"etic7" | "anypay", SupportGuide> = {
  etic7: {
    sourceUrl: "https://etic7.com.tr/katalog",
    sourceLabel: "ETIC7 ürün kataloğunu aç",
    productAreas: [
      {
        title: "Ürün, kategori ve varyant",
        description:
          "Dinamik kategori ve ürün yönetimi ile ürün varyantları, çoklu dil ve para birimi akışları.",
      },
      {
        title: "Stok, fiyat ve B2B kuralları",
        description:
          "Stok yönetimi, fiyatlandırma, çoklu para birimi, B2B bayi sistemi ve kullanıcıya özel fiyat gösterimi.",
      },
      {
        title: "Sepet, sipariş ve iade",
        description:
          "Sepet ve sipariş yönetimiyle birlikte kargo, iptal ve iade durum akışları.",
      },
      {
        title: "Kampanya, kupon ve indirim",
        description:
          "Kampanya, indirim ve kupon tanımları ile müşteri segmentlerine uygulanma kuralları.",
      },
      {
        title: "Müşteri, bayi ve yetkilendirme",
        description:
          "Kullanıcı yönetimi, rol bazlı yetki, müşteri yönetimi ve B2B bayi modeli.",
      },
      {
        title: "Ödeme ve kargo entegrasyonları",
        description:
          "Banka, iyzico, PayTR ve Tosla ödeme altyapıları ile kargo firmalarının API bağlantıları.",
      },
      {
        title: "ERP ve muhasebe entegrasyonları",
        description:
          "ERP ve muhasebe sistemleriyle ürün, stok, sipariş ve cari veri aktarımı.",
      },
      {
        title: "SEO, Google ve Meta",
        description:
          "Dinamik sitemap, SEO uyumlu URL, Analytics, Ads, Merchant Center, Meta Pixel ve Meta Shop bağlantıları.",
      },
      {
        title: "Mobil uygulama ve PWA",
        description:
          "Flutter tabanlı iOS/Android uygulama, PWA, push bildirim ve mobil sipariş akışları.",
      },
    ],
    integrations: [
      {
        title: "Ödeme",
        description:
          "Bankalar, Sanal POS, iyzico, PayTR ve Tosla ödeme kanalları.",
      },
      {
        title: "Kargo",
        description:
          "Kargo ve lojistik API'leri, gönderi durumu ve takip numarası akışları.",
      },
      {
        title: "Pazarlama",
        description:
          "Google Analytics, Ads, Merchant Center ile Meta Shop ve olay verileri.",
      },
      {
        title: "Kurumsal sistemler",
        description:
          "ERP ve muhasebe yazılımlarıyla ürün, stok, sipariş ve cari aktarımı.",
      },
    ],
    architecture: [
      "Symfony",
      "RESTful API",
      "Flutter",
      "MySQL / PostgreSQL",
      "Redis",
      "Elasticsearch",
      "CDN",
      "Docker",
      "Kubernetes",
      "PWA",
    ],
    playbooks: [
      {
        title: "Ürün, kategori veya varyant görünmüyor",
        summary:
          "Katalog kaydı, yayın durumu, dil/para birimi ve kullanıcı yetkisi birlikte kontrol edilir.",
        checks: [
          "Ürün ve kategori aktif/yayında mı kontrol edin.",
          "Varyant, stok ve fiyat alanlarının dolu olduğunu doğrulayın.",
          "Seçili dil, para birimi, B2B/B2C veya katalog modunu kontrol edin.",
        ],
        collect: [
          "Ürün/kategori kimliği veya URL",
          "Etkilenen bayi ya da kullanıcı rolü",
          "Dil, para birimi ve ekran görüntüsü",
        ],
        outcome:
          "Kayıt panelde doğru, vitrinde görünmüyorsa sorun çoğunlukla önbellek veya arama indeksidir. Redis önbelleğini yenileyin ve ürünün Elasticsearch indeksine girip girmediğini kontrol edin.",
      },
      {
        title: "Stok veya fiyat bilgisi hatalı",
        summary:
          "Ürün kaydı ile ERP/muhasebe aktarımı, fiyat grubu ve önbellek sonucu karşılaştırılır.",
        checks: [
          "Doğru depo, varyant ve fiyat grubunun seçildiğini doğrulayın.",
          "Son ERP/muhasebe senkron zamanını kontrol edin.",
          "Kur, özel bayi fiyatı ve kampanya/indirim çakışmasını inceleyin.",
        ],
        collect: [
          "Ürün ve varyant kodu",
          "Beklenen/görünen stok veya fiyat",
          "ERP kaynak kaydı ve son senkron zamanı",
        ],
        outcome:
          "ERP kaydı doğru, ETIC7 verisi farklıysa son senkron başarısız veya gecikmiş olabilir. İlgili ürün için API yanıtını kontrol edip senkronizasyonu güvenli biçimde yeniden çalıştırın.",
      },
      {
        title: "Sepet, sipariş, iptal veya iade sorunu",
        summary:
          "Sepet toplamı, sipariş durum geçişi, kampanya ve kargo adımları uçtan uca izlenir.",
        checks: [
          "Sepetteki ürün, adet, fiyat, kupon ve kargo seçimini doğrulayın.",
          "Sipariş durum geçmişinde takılan adımı bulun.",
          "İptal/iade tutarı ile ödeme ve kargo durumunu karşılaştırın.",
        ],
        collect: [
          "Sipariş numarası",
          "Müşteri/bayi ve işlem zamanı",
          "Hata mesajı ile beklenen işlem",
        ],
        outcome:
          "Siparişin takıldığı durumdan bir önceki başarılı olayı bulun. Ödeme başarılıysa siparişi yeniden tahsil etmeyin; kargo veya durum güncelleme kaydını sipariş numarasıyla tekrar kontrol edin.",
      },
      {
        title: "Ödeme veya Sanal POS işlemi başarısız",
        summary:
          "Banka/PSP yanıtı, 3D akışı ve sipariş sonucu aynı işlem üzerinden eşleştirilir.",
        checks: [
          "Ödeme kanalının ve banka/PSP servis durumunun uygunluğunu kontrol edin.",
          "3D doğrulama dönüşü ile sipariş durumunu karşılaştırın.",
          "Aynı işlem için tekrar tahsilat oluşmadığını doğrulayın.",
        ],
        collect: [
          "Sipariş ve işlem numarası",
          "Banka/PSP hata kodu",
          "Tarih-saat, tutar ve ödeme kanalı",
        ],
        outcome:
          "Banka/PSP başarılı, sipariş beklemede ise dönüş bildirimi işlenmemiş olabilir. Banka/PSP başarısızsa hata kodundaki nedeni düzeltin. Durum belirsizken yeniden ödeme başlatmayın.",
      },
      {
        title: "Kargo, takip veya teslimat durumu güncellenmiyor",
        summary:
          "Sipariş-kargo eşleşmesi, takip numarası ve taşıyıcı API yanıtı kontrol edilir.",
        checks: [
          "Siparişte kargo firması ve takip numarası bulunduğunu doğrulayın.",
          "Kargo etiketi/çıkış işleminin tamamlandığını kontrol edin.",
          "Taşıyıcı sistemindeki güncel durumla ETIC7 durumunu karşılaştırın.",
        ],
        collect: [
          "Sipariş ve takip numarası",
          "Kargo firması",
          "Son doğru durum ve değişiklik zamanı",
        ],
        outcome:
          "Taşıyıcıda durum güncel, ETIC7'de eskiyse kargo durum bildirimi alınmamış olabilir. Takip numarasıyla son API cevabını kontrol edip durum sorgusunu yeniden çalıştırın.",
      },
      {
        title: "Arama, SEO, Google veya Meta verisi eksik",
        summary:
          "Arama indeksi, sitemap/feed çıktısı ve ölçüm olayları ayrı ayrı doğrulanır.",
        checks: [
          "Ürün kaydının yayında ve arama indeksine uygun olduğunu kontrol edin.",
          "Sitemap, Merchant/Meta ürün feed'i veya ilgili URL çıktısını açın.",
          "Analytics, Ads ya da Pixel olayının tarayıcıda tetiklendiğini doğrulayın.",
        ],
        collect: [
          "Etkilenen URL veya ürün kodu",
          "Servis ve hesap/akış adı",
          "Hata çıktısı ve son başarılı zaman",
        ],
        outcome:
          "Ürün sayfası doğruysa arama için Elasticsearch indeksini, reklam kanalı için ilgili feed çıktısını yenileyin. Olay verisi eksikse tarayıcıdaki Analytics/Pixel isteğinin hata kodunu kontrol edin.",
      },
      {
        title: "Mobil uygulama, PWA veya performans sorunu",
        summary:
          "Cihaz ve sürüm bilgisiyle ağ, önbellek ve servis davranışı ayrıştırılır.",
        checks: [
          "Web, PWA ve mobil uygulamada sorunun tekrar edip etmediğini karşılaştırın.",
          "Ağ bağlantısı, uygulama sürümü ve bildirim izinlerini kontrol edin.",
          "Çıkış-giriş ve güvenli önbellek yenilemesinden sonra tekrar deneyin.",
        ],
        collect: [
          "Cihaz, işletim sistemi ve uygulama sürümü",
          "Bağlantı türü ve tekrar adımları",
          "Ekran kaydı ile tarih-saat",
        ],
        outcome:
          "Sorun web ve mobilde aynıysa API veya altyapı kaynaklıdır; yalnızca tek cihazdaysa uygulama/önbellek kaynaklıdır. İstek zamanında API, Redis, CDN ve veritabanı gecikmelerini karşılaştırın.",
      },
    ],
    knowledgeTopics: projectKnowledge.etic7,
  },
  anypay: {
    sourceUrl: "https://anypay.com.tr/katalog",
    sourceLabel: "AnyPay ürün kataloğunu aç",
    productAreas: [
      {
        title: "Merkezi ödeme orkestrasyonu",
        description:
          "Banka Sanal POS'ları ve ödeme kuruluşlarının tek API ve merkezi panel üzerinden yönetimi.",
      },
      {
        title: "BIN kontrolü ve Smart Routing",
        description:
          "Kart tipine, bankaya, komisyona ve başarı oranına göre uygun POS yönlendirmesi.",
      },
      {
        title: "Failover",
        description:
          "Banka altyapısındaki kesintide işlemin alternatif POS üzerinden güvenli biçimde yeniden denenmesi.",
      },
      {
        title: "Taksit ve komisyon yönetimi",
        description:
          "Müşteri grubu, şube veya kullanıcı bazında dinamik taksit ve komisyon setleri.",
      },
      {
        title: "Bayi, alt bayi ve şube",
        description:
          "Ana firma, şube, bayi, alt bayi ve plasiyer için kademeli yetkilendirme ve tahsilat.",
      },
      {
        title: "Ödeme linki ve dinamik QR",
        description:
          "Müşteriye özel, süreli ve tek kullanımlı ödeme linkleriyle dinamik QR kod üretimi.",
      },
      {
        title: "Mobil tahsilat ve Soft POS",
        description:
          "Flutter mobil uygulamada QR tahsilat, biyometrik doğrulama, bildirim ve offline-first kuyruklama.",
      },
      {
        title: "ERP, muhasebe ve mutabakat",
        description:
          "Vega, Logo, Mikro, Nebim ve Dia veri aktarımı ile otomatik mutabakat.",
      },
      {
        title: "Güvenlik",
        description:
          "PCI-DSS ve KVKK uyumu, tokenization, rol bazlı erişim, izole sunucu ve firewall katmanları.",
      },
    ],
    integrations: [
      {
        title: "Banka ve PSP",
        description:
          "Sanal POS'lar ile iyzico ve PayTR gibi ödeme kuruluşlarının API bağlantıları.",
      },
      {
        title: "ERP ve muhasebe",
        description:
          "Vega, Logo, Mikro, Nebim, Dia ve Zirve ile API/Webservice veri akışı.",
      },
      {
        title: "Web ve mobil",
        description:
          "Merkezi AnyPay Web paneli ile Flutter tabanlı AnyPay App operasyonları.",
      },
      {
        title: "Altyapı ve güvenlik",
        description:
          "İzole sunucu, yedeklilik, firewall, erişim kontrolü ve finansal veri güvenliği.",
      },
    ],
    architecture: [
      "PHP Symfony",
      "RESTful API",
      "Flutter & Dart",
      "MySQL",
      "Redis",
      "VMware ESXi 8.1",
      "Ubuntu Server",
      "CloudPanel",
      "Firewall",
      "Modüler mimari",
    ],
    playbooks: [
      {
        title: "Ödeme başarısız veya beklemede kaldı",
        summary:
          "İşlem; 3D Secure, banka/PSP cevabı, Smart Routing ve Failover adımlarında izlenir.",
        checks: [
          "İşlem durumunu AnyPay paneli ve banka/PSP tarafında karşılaştırın.",
          "3D Secure dönüşü, hata kodu ve yönlendirilen POS'u kontrol edin.",
          "Failover/retry oluştuysa mükerrer tahsilat bulunmadığını doğrulayın.",
        ],
        collect: [
          "İşlem/ödeme referansı",
          "İşyeri, banka/PSP ve yönlendirilen POS",
          "Tarih-saat, tutar, para birimi ve hata kodu",
        ],
        outcome:
          "Banka/PSP başarılı, AnyPay beklemede ise callback işlenmemiş olabilir. Banka/PSP başarısızsa hata kodunu esas alın. Failover çalıştıysa ikinci POS sonucunu görmeden işlemi yeniden denemeyin.",
      },
      {
        title: "BIN, taksit, komisyon veya routing hatalı",
        summary:
          "Kart sınıfı ile müşteri/şube ödeme seti ve POS yönlendirme kuralı karşılaştırılır.",
        checks: [
          "Kartın bankası ve bireysel/ticari sınıfının doğru algılandığını kontrol edin.",
          "Müşteri, şube veya kullanıcıya bağlı taksit/komisyon setini doğrulayın.",
          "İlgili POS'un aktifliği, komisyonu ve başarı kuralını inceleyin.",
        ],
        collect: [
          "Yalnızca ilk 6-8 ve son 4 hane",
          "Müşteri/şube ve ödeme seti",
          "Beklenen/görünen taksit, komisyon veya POS",
        ],
        outcome:
          "BIN doğru, taksit veya komisyon yanlışsa müşteri/şube ödeme seti önceliğini düzeltin. POS seçimi yanlışsa aktiflik, komisyon ve başarı oranı kurallarının sırasını kontrol edin.",
      },
      {
        title: "Ödeme linki veya dinamik QR çalışmıyor",
        summary:
          "Link/QR geçerlilik süresi, tek kullanım durumu ve ödeme kaydı kontrol edilir.",
        checks: [
          "Linkin süresinin dolmadığını ve daha önce kullanılmadığını doğrulayın.",
          "Tutar, para birimi ve müşteri eşleşmesini kontrol edin.",
          "Farklı ağ/cihazda açılış ve yönlendirme sonucunu test edin.",
        ],
        collect: [
          "Link/QR kimliği; gizli anahtar değil",
          "Oluşturan bayi/kullanıcı",
          "Hata ekranı, cihaz ve tarih-saat",
        ],
        outcome:
          "Süresi dolmuş veya kullanılmış link için yeni link üretin. Kayıt geçerli olduğu halde açılmıyorsa oluşturma cevabındaki URL ile yönlendirme cevabını karşılaştırın.",
      },
      {
        title: "Bayi, alt bayi, şube veya yetki sorunu",
        summary:
          "Hiyerarşi, rol yetkisi, tahsilat kapsamı ve hak ediş bağlantısı birlikte doğrulanır.",
        checks: [
          "Kullanıcının doğru firma/şube/bayi altında olduğunu kontrol edin.",
          "Rolün işlem görüntüleme, tahsilat ve rapor izinlerini doğrulayın.",
          "Komisyon, taksit ve hak ediş kuralının doğru seviyeden miras alındığını inceleyin.",
        ],
        collect: [
          "Firma, şube/bayi ve kullanıcı kimliği",
          "Eksik işlem veya menü",
          "Rol adı ve beklenen yetki",
        ],
        outcome:
          "Kullanıcı doğru hiyerarşideyse eksik izin rol tanımındadır. Rolün tahsilat, rapor ve işlem görüntüleme izinlerini güncelleyip oturumu yenileyin.",
      },
      {
        title: "ERP aktarımı veya mutabakat uyuşmuyor",
        summary:
          "AnyPay işlemi, banka hareketi ve ERP/muhasebe kaydı aynı referansla eşleştirilir.",
        checks: [
          "İşlemin başarılı/iptal/iade durumunu doğrulayın.",
          "Banka hareketi ve otomatik mutabakat sonucunu karşılaştırın.",
          "Vega, Logo, Mikro, Nebim, Dia veya Zirve aktarım durumunu kontrol edin.",
        ],
        collect: [
          "İşlem ve mutabakat referansı",
          "ERP sistemi ile belge/fiş numarası",
          "Beklenen/görünen tutar ve son aktarım zamanı",
        ],
        outcome:
          "Ödeme ve banka hareketi aynı, ERP kaydı eksikse Webservice aktarımı başarısızdır. Belge numarası çakışmasını giderip yalnızca eksik kaydı yeniden gönderin.",
      },
      {
        title: "Mobil tahsilat veya Soft POS sorunu",
        summary:
          "Flutter uygulaması, biyometrik doğrulama, bağlantı ve offline-first kuyruğu kontrol edilir.",
        checks: [
          "Uygulama sürümü, oturum ve biyometrik izinleri doğrulayın.",
          "Bağlantı koptuysa işlemin çevrimdışı kuyrukta olup olmadığını kontrol edin.",
          "QR/link üretimi ve push bildirim sonucunu ayrı ayrı test edin.",
        ],
        collect: [
          "Cihaz, işletim sistemi ve uygulama sürümü",
          "Plasiyer/kullanıcı ile işlem referansı",
          "Bağlantı türü, tekrar adımları ve ekran kaydı",
        ],
        outcome:
          "İşlem çevrimdışı kuyruktaysa bağlantı geldikten sonra senkron durumunu kontrol edin; aynı tahsilatı tekrar oluşturmayın. Kuyruk boşsa API bağlantısı ve oturum süresini yenileyin.",
      },
      {
        title: "Şüpheli işlem, güvenlik veya altyapı alarmı",
        summary:
          "Fraud sinyali, erişim kaydı ve servis sağlığı korunarak olay yönetimi başlatılır.",
        checks: [
          "İşlemi yeniden denemeyin; kullanıcı ve oturum etkinliğini doğrulayın.",
          "Firewall/IDS-IPS alarmı ile banka/PSP sonucunu karşılaştırın.",
          "Etkilenen işyeri ve zaman aralığını belirleyin.",
        ],
        collect: [
          "Maskeli işlem referansı ve olay zamanı",
          "Alarm/hata kodu ve etkilenen servis",
          "IP/oturum bilgisi; parola veya anahtar değil",
        ],
        outcome:
          "Şüpheli oturumu kapatın, ilgili erişim anahtarını devre dışı bırakın ve etkilenen zaman aralığının kayıtlarını koruyun. Tam kart numarası, CVV, parola veya API anahtarını ekranda paylaşmayın.",
      },
    ],
    knowledgeTopics: projectKnowledge.anypay,
  },
};

const guideFor = (name: string): SupportGuide | null => {
  const key = name.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "");
  return key.includes("etic7")
    ? guides.etic7
    : key.includes("anypay")
      ? guides.anypay
      : null;
};

const projectNameForDisplay = (name: string) =>
  name.toLocaleLowerCase("tr-TR").replace(/[^a-z0-9]/g, "").includes("etic7")
    ? "Etic7"
    : name;

const ignoredQuestionWords = new Set([
  "acaba",
  "ama",
  "anypay",
  "bir",
  "bunu",
  "icin",
  "etic7",
  "ile",
  "miyim",
  "nasil",
  "neden",
  "oldu",
  "olan",
  "olarak",
  "sorun",
  "var",
  "ve",
]);

const normalizeQuestion = (value: string) =>
  value
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("tr-TR")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();

function playbooksFor(question: string, playbooks: SupportPlaybook[]) {
  const tokens = normalizeQuestion(question)
    .split(" ")
    .filter((token) => token.length > 2 && !ignoredQuestionWords.has(token));
  if (!tokens.length) return [];
  return playbooks
    .map((playbook) => {
      const title = normalizeQuestion(playbook.title);
      const body = normalizeQuestion(
        [
          playbook.summary,
          ...playbook.checks,
          ...playbook.collect,
          playbook.outcome,
        ].join(" "),
      );
      const score = tokens.reduce(
        (total, token) =>
          total +
          (title.includes(token) ? 4 : 0) +
          (body.includes(token) ? 1 : 0),
        0,
      );
      return { playbook, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ playbook }) => playbook);
}

const contentId = (prefix: string, value: string) =>
  `${prefix}-${normalizeQuestion(value).replaceAll(" ", "-")}`;

function knowledgeFor(question: string, topics: KnowledgeTopic[]) {
  const tokens = normalizeQuestion(question)
    .split(" ")
    .filter((token) => token.length > 2 && !ignoredQuestionWords.has(token));
  if (!tokens.length) return topics;
  return topics
    .map((item) => {
      const title = normalizeQuestion(item.title);
      const body = normalizeQuestion(
        [
          item.category,
          item.summary,
          ...item.points,
          ...item.required,
          item.note,
        ].join(" "),
      );
      const score = tokens.reduce(
        (total, token) =>
          total +
          (title.includes(token) ? 4 : 0) +
          (body.includes(token) ? 1 : 0),
        0,
      );
      return { item, score };
    })
    .filter(({ score }) => score > 0)
    .sort((left, right) => right.score - left.score)
    .map(({ item }) => item);
}

function SectionHeading({
  icon,
  eyebrow,
  title,
  description,
}: {
  icon: ReactNode;
  eyebrow: string;
  title: string;
  description: string;
}) {
  return (
    <header className="project-guide-section-heading">
      <span className="project-guide-section-icon" aria-hidden="true">
        {icon}
      </span>
      <div>
        <span>{eyebrow}</span>
        <h3>{title}</h3>
        <p>{description}</p>
      </div>
    </header>
  );
}

function KnowledgeCenter({
  topics,
  query,
}: {
  topics: KnowledgeTopic[];
  query: string;
}) {
  return (
    <section id="bilgi-merkezi" className="project-guide-section">
      <SectionHeading
        icon={<BookOpen size={20} />}
        eyebrow="04 · BİLGİ MERKEZİ"
        title="Konu bazlı kullanım ve destek rehberi"
        description={
          query.trim()
            ? `Üstteki aramanızla eşleşen ${topics.length} konu gösteriliyor.`
            : "Konular aşağıda normal sayfa akışında sıralanır. Üstteki tek arama alanından konu arayabilir veya sorunuzu yazabilirsiniz."
        }
      />
      {topics.length ? (
        <div className="project-guide-knowledge-flow">
          {topics.map((item, index) => (
            <details
              className="project-guide-knowledge-topic"
              id={`konu-${item.id}`}
              key={item.id}
              open={query.trim() ? true : index === 0 ? true : undefined}
            >
              <summary>
                <span className="project-guide-knowledge-number">
                  04.{String(index + 1).padStart(2, "0")}
                </span>
                <div>
                  <small>{item.category}</small>
                  <strong>{item.title}</strong>
                  <p>{item.summary}</p>
                </div>
                <ChevronRight size={18} aria-hidden="true" />
              </summary>
              <div className="project-guide-knowledge-body">
                <section>
                  <h4>Bu konuda neler var?</h4>
                  <ul>
                    {item.points.map((point) => (
                      <li key={point}>{point}</li>
                    ))}
                  </ul>
                </section>
                <section>
                  <h4>Sorunu anlamak için gerekli bilgiler</h4>
                  <ul>
                    {item.required.map((required) => (
                      <li key={required}>{required}</li>
                    ))}
                  </ul>
                </section>
                <aside>
                  <BookOpen size={18} />
                  <div>
                    <strong>Önemli not</strong>
                    <p>{item.note}</p>
                  </div>
                </aside>
              </div>
            </details>
          ))}
        </div>
      ) : (
        <div className="project-guide-knowledge-empty">
          <BookOpen size={22} />
          <strong>Konu bulunamadı</strong>
          <p>Üstteki aramayı temizleyin veya farklı bir konu yazın.</p>
        </div>
      )}
    </section>
  );
}

function SupportSection({ playbooks }: { playbooks: SupportPlaybook[] }) {
  return (
    <section
      id="teknik-destek"
      className="project-guide-section project-guide-section-soft"
    >
      <SectionHeading
        icon={<LifeBuoy size={20} />}
        eyebrow="01 · TEKNİK DESTEK"
        title="Soruna göre çözüm adımları"
        description="PDF'de tanımlanan modül ve entegrasyonlara göre uygulanabilecek kontrolleri açın ve sonucu aynı ekranda değerlendirin."
      />
      <div className="project-guide-playbooks">
        {playbooks.map((playbook, index) => (
          <details
            id={contentId("destek", playbook.title)}
            key={playbook.title}
          >
            <summary>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <strong>{playbook.title}</strong>
                <small>{playbook.summary}</small>
              </div>
              <ChevronRight size={18} aria-hidden="true" />
            </summary>
            <div className="project-guide-playbook-body">
              <div>
                <h5>
                  <ClipboardCheck size={16} /> İlk kontroller
                </h5>
                <ul>
                  {playbook.checks.map((check) => (
                    <li key={check}>{check}</li>
                  ))}
                </ul>
              </div>
              <div>
                <h5>
                  <Wrench size={16} /> Sorunu anlamak için gerekli bilgiler
                </h5>
                <ul>
                  {playbook.collect.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
              <div className="project-guide-escalate">
                <h5>Sonuç nasıl yorumlanır?</h5>
                <p>{playbook.outcome}</p>
              </div>
            </div>
          </details>
        ))}
      </div>
    </section>
  );
}

function SearchMatches({
  topics,
  playbooks,
}: {
  topics: KnowledgeTopic[];
  playbooks: SupportPlaybook[];
}) {
  const matches = [
    ...playbooks.map((item) => ({
      id: contentId("destek", item.title),
      category: "Teknik destek",
      title: item.title,
      summary: item.summary,
    })),
    ...topics.map((item) => ({
      id: `konu-${item.id}`,
      category: "Bilgi merkezi",
      title: item.title,
      summary: item.summary,
    })),
  ];
  return (
    <section className="project-guide-live-topics" aria-live="polite">
      <header>
        <strong>İlgili sonuçlar</strong>
        <span>{matches.length} sonuç</span>
      </header>
      <div>
        {matches.slice(0, 8).map((item) => (
          <button
            type="button"
            key={`${item.category}-${item.id}`}
            onClick={() =>
              document
                .getElementById(item.id)
                ?.scrollIntoView({ behavior: "smooth", block: "start" })
            }
          >
            <span>{item.category}</span>
            <strong>{item.title}</strong>
            <p>{item.summary}</p>
            <ChevronRight size={16} aria-hidden="true" />
          </button>
        ))}
      </div>
    </section>
  );
}

function GuideContent({ guide }: { guide: SupportGuide }) {
  const [question, setQuestion] = useState("");
  const searching = question.trim().length >= 2;
  const matchingPlaybooks = useMemo(
    () => (searching ? playbooksFor(question, guide.playbooks) : []),
    [guide.playbooks, question, searching],
  );
  const knowledgeTopics = useMemo(
    () =>
      searching
        ? knowledgeFor(question, guide.knowledgeTopics)
        : guide.knowledgeTopics,
    [guide.knowledgeTopics, question, searching],
  );
  return (
    <>
      <section className="project-guide-search-panel">
        <div className="project-guide-search-heading">
          <strong>Destek bilgisinde ara</strong>
          <a href={guide.sourceUrl} target="_blank" rel="noreferrer">
            {guide.sourceLabel}
            <ExternalLink size={15} />
          </a>
        </div>
        <div className="project-guide-search" role="search">
          <MessageCircleQuestion size={20} aria-hidden="true" />
          <label className="sr-only" htmlFor="project-guide-search-input">
            Teknik destek sorunuzu yazın
          </label>
          <input
            id="project-guide-search-input"
            type="search"
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Ödeme, sipariş, stok, QR, ERP veya yaşadığınız sorunu yazın…"
            autoComplete="off"
          />
          {question && (
            <button type="button" onClick={() => setQuestion("")}>
              Temizle
            </button>
          )}
        </div>
        <div
          className="project-guide-question-examples"
          aria-label="Örnek sorular"
        >
          <span>Örnek:</span>
          {guide.playbooks.slice(0, 3).map((playbook) => (
            <button
              type="button"
              key={playbook.title}
              onClick={() => setQuestion(playbook.title)}
            >
              {playbook.title}
            </button>
          ))}
        </div>
      </section>
      {searching &&
        (matchingPlaybooks.length > 0 || knowledgeTopics.length > 0) && (
          <SearchMatches
            topics={knowledgeTopics}
            playbooks={matchingPlaybooks}
          />
        )}
      {searching &&
        matchingPlaybooks.length === 0 &&
        knowledgeTopics.length === 0 && (
          <section
            className="project-guide-answer project-guide-answer-empty"
            aria-live="polite"
          >
            <MessageCircleQuestion size={22} />
            <strong>Bu soruyu proje kapsamıyla eşleştiremedim.</strong>
            <p>
              Ödeme, sipariş, stok, ERP, QR, mobil uygulama veya güvenlik gibi
              etkilenen modülü de yazarak tekrar sorun.
            </p>
          </section>
        )}
      <SupportSection playbooks={guide.playbooks} />
      {guide.productAreas.length > 0 && (
        <section id="kapsam" className="project-guide-section">
          <SectionHeading
            icon={<Layers3 size={20} />}
            eyebrow="02 · ÜRÜN ALANLARI"
            title="Destek verilebilecek ürün alanları"
            description="Proje belgesindeki modüller, sorunun hangi ürün alanıyla ilişkili olduğunu belirlemeyi kolaylaştırır."
          />
          <div className="project-guide-area-grid">
            {guide.productAreas.map((area, index) => (
              <article className="project-guide-area-card" key={area.title}>
                <span className="project-guide-card-number">
                  {String(index + 1).padStart(2, "0")}
                </span>
                <h4>{area.title}</h4>
                <p>{area.description}</p>
              </article>
            ))}
          </div>
        </section>
      )}
      {(guide.integrations.length > 0 || guide.architecture.length > 0) && (
        <section
          id="entegrasyonlar"
          className="project-guide-section project-guide-section-soft"
        >
          <SectionHeading
            icon={<CircleDot size={20} />}
            eyebrow="03 · ENTEGRASYON VE TEKNOLOJİ"
            title="Teknik inceleme noktaları"
            description="Sorunun hangi dış servis veya altyapı bileşeninde araştırılacağını belirlemek için kullanın."
          />
          {guide.integrations.length > 0 && (
            <div className="project-guide-integration-grid">
              {guide.integrations.map((item) => (
                <article key={item.title}>
                  <h4>{item.title}</h4>
                  <p>{item.description}</p>
                </article>
              ))}
            </div>
          )}
          <div
            className="project-guide-tech-list"
            aria-label="Teknoloji bileşenleri"
          >
            {guide.architecture.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
        </section>
      )}
      <KnowledgeCenter topics={knowledgeTopics} query={question} />
    </>
  );
}

function GeneralSupport({ projectName }: { projectName: string }) {
  return (
    <>
      <section className="project-guide-generic-heading">
        <BookOpen size={24} />
        <div>
          <strong>{projectName} proje rehberi</strong>
          <p>
            Bu projeye ait rehber içeriği henüz oluşturulmadı.
          </p>
        </div>
      </section>
      <section className="project-guide-section">
        <SectionHeading
          icon={<BookOpen size={20} />}
          eyebrow="PROJE REHBERİ"
          title="Bilgiler bekleniyor"
          description={`${projectName} projesine ait kapsam ve teknik bilgiler ulaştığında proje rehberi bu alanda hazırlanacaktır.`}
        />
      </section>
    </>
  );
}

export function ProjectGuidePage() {
  const [params, setParams] = useSearchParams();
  const projects = useQuery({
    queryKey: ["/websites", "project-guide"],
    queryFn: async () => {
      const first = (
        await api.get<Page<Website>>("/websites", {
          params: { page: 1, limit: 100 },
        })
      ).data;
      if (first.pagination.totalPages <= 1) return first.data;
      const rest = await Promise.all(
        Array.from({ length: first.pagination.totalPages - 1 }, (_, index) =>
          api.get<Page<Website>>("/websites", {
            params: { page: index + 2, limit: 100 },
          }),
        ),
      );
      return [...first.data, ...rest.flatMap((response) => response.data.data)];
    },
  });
  const visibleProjects = useMemo(() => projects.data ?? [], [projects.data]);
  const requested = params.get("project") ?? "";
  const selected =
    visibleProjects.find((project) => project.id === requested) ??
    visibleProjects[0];
  useEffect(() => {
    if (selected && selected.id !== requested)
      setParams({ project: selected.id }, { replace: true });
  }, [requested, selected, setParams]);
  const guide = selected ? guideFor(selected.name) : null;
  const selectProject = (project: Website) => {
    setParams({ project: project.id });
    window.requestAnimationFrame(() =>
      document
        .querySelector(".project-guide-panel")
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };
  return (
    <main className="page project-guide-page">
      <Heading title="Proje Rehberi" />
      <ListState
        loading={projects.isPending}
        error={projects.error}
        empty={!visibleProjects.length}
      />
      {!!visibleProjects.length && (
        <section className="project-guide-shell">
          <div
            className="project-guide-tabs integration-tabs"
            role="tablist"
            aria-label="Projeler"
          >
            {visibleProjects.map((project) => (
              <button
                key={project.id}
                id={`project-guide-tab-${project.id}`}
                type="button"
                role="tab"
                aria-controls="project-guide-panel"
                aria-selected={selected?.id === project.id}
                tabIndex={selected?.id === project.id ? 0 : -1}
                className={selected?.id === project.id ? "active" : ""}
                onClick={() => selectProject(project)}
                onKeyDown={(event) => {
                  if (
                    !["ArrowLeft", "ArrowRight", "Home", "End"].includes(
                      event.key,
                    )
                  )
                    return;
                  event.preventDefault();
                  const current = visibleProjects.findIndex(
                    (item) => item.id === project.id,
                  );
                  const next =
                    event.key === "Home"
                      ? 0
                      : event.key === "End"
                        ? visibleProjects.length - 1
                        : event.key === "ArrowRight"
                          ? (current + 1) % visibleProjects.length
                          : (current - 1 + visibleProjects.length) %
                            visibleProjects.length;
                  const nextProject = visibleProjects[next];
                  setParams({ project: nextProject.id });
                  window.requestAnimationFrame(() =>
                    document
                      .getElementById(`project-guide-tab-${nextProject.id}`)
                      ?.focus(),
                  );
                }}
              >
                {projectNameForDisplay(project.name)}
              </button>
            ))}
          </div>
          <div
            id="project-guide-panel"
            className={`project-guide-panel${guide ? "" : " project-guide-panel-compact"}`}
            role="tabpanel"
            aria-labelledby={
              selected ? `project-guide-tab-${selected.id}` : undefined
            }
          >
            {selected && guide ? (
              <GuideContent key={selected.id} guide={guide} />
            ) : selected ? (
              <GeneralSupport projectName={selected.name} />
            ) : null}
          </div>
        </section>
      )}
    </main>
  );
}
