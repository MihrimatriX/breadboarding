// Arama motorları ve paylaşım kartları (Open Graph, Twitter) için sayfalar: ana sayfa ve her bölümün kendi
// adresi (/6502, /kart, …). Bölümler uygulamada #6502 gibi adreslerde açılır; arama motorları ve paylaşım
// kartları # sonrasını görmez, bu yüzden her bölümün derlemede üretilen kendi sayfası var (vite.config.ts
// seoEklentisi): başlığı, açıklaması, önizleme görseli ve uygulamayı o bölümde açan küçük bir betiği.
// Sitenin adresi derlemede SITE_URL ortam değişkeninden (örn. https://silikon3d.example); verilmezse adresler
// göreli kalır, kanonik bağlantı ve site haritası yazılmaz. Saf fonksiyonlar (React'ten bağımsız); testleri
// tests/seo.test.ts. Önizleme görselleri public/og/ (scripts/og-gorselleri.html ile üretilir).

export type Dil = "tr" | "en";

export interface SeoSayfa {
  /** sayfanın yolu ("/", "/6502", …); dosyası kökte (index.html, 6502.html, …): uygulama göreli yollarla
   * (vite base "./") yüklendiği için bölüm sayfaları alt klasörde değil, ana sayfanın yanında */
  yol: string;
  /** uygulamadaki bölüm adresi (ana sayfada yok: uygulama varsayılan bölümde açılır) */
  hash: string | null;
  baslik: Record<Dil, string>;
  aciklama: Record<Dil, string>;
  /** önizleme görseli (public/ altında, 1200 × 630) ve görselin metin karşılığı */
  gorsel: string;
  gorselAlt: string;
}

export const SITE_ADI = "Silikon3D";
export const DEPO = "https://github.com/MihrimatriX/breadboarding";
export const OG_GENISLIK = 1200;
export const OG_YUKSEKLIK = 630;

export const SAYFALAR: readonly SeoSayfa[] = [
  {
    yol: "/",
    hash: null,
    baslik: {
      tr: "Silikon3D: transistörden karta, tarayıcıda çalışan bilgisayar",
      en: "Silikon3D: a computer from transistors to boards, in your browser",
    },
    aciklama: {
      tr: "MOS 6502'nin 3.510 transistörlü kalıbından 74HC çipleriyle kurulan kendi 16 bit bilgisayarımız CPU16'nın kartlarına kadar: 3D, canlı sinyallerle, tarayıcıda. Açık kaynak.",
      en: "From the 3,510-transistor MOS 6502 die to the boards of CPU16, our own 16-bit computer built from 74HC chips: in 3D, with live signals, in your browser. Open source.",
    },
    gorsel: "og/silikon3d.png",
    gorselAlt: "Silikon3D: transistörden karta, tarayıcıda çalışan bilgisayar",
  },
  {
    yol: "/6502",
    hash: "#6502",
    baslik: {
      tr: "MOS 6502 kalıbı 3D: 3.510 transistör canlı | Silikon3D",
      en: "MOS 6502 die in 3D: 3,510 live transistors | Silikon3D",
    },
    aciklama: {
      tr: "Gerçek MOS 6502 işlemcisinin kalıbı transistör seviyesinde, katman katman 3D'de çalışıyor. Sinyalleri izle, transistörlere ve yollara bak. Veri visual6502'den.",
      en: "The die of a real MOS 6502 processor runs at the transistor level, layer by layer in 3D. Follow the signals and look at transistors and wires. Data from visual6502.",
    },
    gorsel: "og/6502.png",
    gorselAlt: "MOS 6502 kalıbı: transistörler ve metal katmanı",
  },
  {
    yol: "/cpu16",
    hash: "#cpu16",
    baslik: {
      tr: "CPU16 tezgâhı: 16 bit işlemci, assembly ve C | Silikon3D",
      en: "CPU16 workbench: a 16-bit processor, assembly and C | Silikon3D",
    },
    aciklama: {
      tr: "Kendi 16 bit işlemcimiz CPU16'ya assembly ya da C ile program yaz, derle, BIOS'lu bilgisayarda çalıştır. VGA ekranı, PS/2 klavye ve UART terminali tarayıcıda.",
      en: "Write assembly or C for CPU16, our own 16-bit processor, compile it and run it on the computer with its BIOS. VGA screen, PS/2 keyboard and UART terminal in your browser.",
    },
    gorsel: "og/cpu16.png",
    gorselAlt: "CPU16 tezgâhı: program düzenleyicisi ve VGA ekranı",
  },
  {
    yol: "/kart",
    hash: "#kart",
    baslik: {
      tr: "CPU16 kartları 3D: 74HC çiplerle bilgisayar | Silikon3D",
      en: "CPU16 boards in 3D: a computer from 74HC chips | Silikon3D",
    },
    aciklama: {
      tr: "Yaygın 74HC mantık çiplerinden kurulan CPU16 bilgisayarı bütün kartlarıyla 3D'de, kapı seviyesinde çalışıyor. PCB ya da breadboard görünümü, tel tel kurulum rehberi.",
      en: "The CPU16 computer, built from common 74HC logic chips, runs at the gate level in 3D with all its boards. PCB or breadboard view and a wire-by-wire build guide.",
    },
    gorsel: "og/kart.png",
    gorselAlt: "CPU16 bilgisayarının kartları ve arka paneli 3D'de",
  },
  {
    yol: "/hesap",
    hash: "#hesap",
    baslik: {
      tr: "8 bit hesap makinesi 3D: 74HC ile dört işlem | Silikon3D",
      en: "8-bit calculator in 3D: four operations in 74HC | Silikon3D",
    },
    aciklama: {
      tr: "74HC mantık çipleriyle kurulmuş 8 bit dört işlem hesap makinesi, breadboard ve PCB'de 3D, kapı seviyesinde. Anahtarları çevir, sonucu göstergelerde izle.",
      en: "An 8-bit four-operation calculator built from 74HC logic chips, in 3D on breadboards and PCB at the gate level. Flip the switches and watch the result on the displays.",
    },
    gorsel: "og/hesap.png",
    gorselAlt: "8 bit hesap makinesi: anahtarlar ve yedi parçalı göstergeler",
  },
  {
    yol: "/mimari",
    hash: "#mimari",
    baslik: {
      tr: "CPU16 mimarisi: blok diyagramları | Silikon3D",
      en: "CPU16 architecture: block diagrams | Silikon3D",
    },
    aciklama: {
      tr: "CPU16 bilgisayarının ve 8 bit hesap makinesinin blok diyagramları: veri yolları, kontrol birimi, bellek ve G/Ç. Her diyagram devrenin kodundan üretilir.",
      en: "Block diagrams of the CPU16 computer and the 8-bit calculator: buses, control unit, memory and I/O. Every diagram is generated from the circuit's code.",
    },
    gorsel: "og/mimari.png",
    gorselAlt: "CPU16 blok diyagramı: veri yolu ve bloklar",
  },
  {
    yol: "/belgeler",
    hash: "#belgeler",
    baslik: {
      tr: "Belgeler: CPU16 komut seti, kartlar, kurulum | Silikon3D",
      en: "Docs: CPU16 instruction set, boards, build | Silikon3D",
    },
    aciklama: {
      tr: "CPU16'nın komut seti, emülatörü, kartları, breadboard kurulumu, C derleyicisi ve BIOS belgeleri uygulamanın içinde, Türkçe ve İngilizce.",
      en: "Documentation for CPU16's instruction set, emulator, boards, breadboard build, C compiler and BIOS, inside the app, in Turkish and English.",
    },
    gorsel: "og/belgeler.png",
    gorselAlt: "Silikon3D belgeleri",
  },
];

/** SITE_URL'yi düzeltir: http(s) adresi, sonunda eğik çizgi yok; geçersiz ya da boşsa null */
export function siteAdresi(deger: string | undefined | null): string | null {
  const s = (deger ?? "").trim();
  if (!/^https?:\/\/[^\s/]+/i.test(s)) return null;
  return s.replace(/\/+$/, "");
}

/** Sitenin adresiyle tam adres; adres yoksa sayfanın klasörüne göreli (bütün sayfalar kökte) */
export const tamAdres = (site: string | null, yol: string): string => {
  const y = yol.replace(/^\//, "");
  return site ? `${site}/${y}` : y || "./";
};

/** Sayfanın derlemedeki dosyası: index.html, 6502.html, … */
export const sayfaDosyasi = (s: Pick<SeoSayfa, "yol">): string => (s.yol === "/" ? "index.html" : `${s.yol.slice(1)}.html`);

/** HTML öznitelik ve metin kaçışı */
export const kacir = (s: string): string => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

/** Sayfanın yapılandırılmış verisi (schema.org WebApplication) */
export function jsonLd(s: SeoSayfa, site: string | null): Record<string, unknown> {
  return {
    "@context": "https://schema.org",
    "@type": "WebApplication",
    name: s.yol === "/" ? SITE_ADI : s.baslik.tr.replace(/ \| Silikon3D$/, ""),
    alternateName: s.baslik.en,
    description: s.aciklama.tr,
    ...(site ? { url: tamAdres(site, s.yol), image: tamAdres(site, s.gorsel) } : {}),
    applicationCategory: "EducationalApplication",
    applicationSubCategory: "Computer architecture simulator",
    operatingSystem: "Web browser",
    browserRequirements: "WebGL, JavaScript",
    inLanguage: ["tr", "en"],
    isAccessibleForFree: true,
    offers: { "@type": "Offer", price: "0", priceCurrency: "TRY" },
    license: `${DEPO}/blob/main/LICENSE`,
    codeRepository: DEPO,
    isPartOf: { "@type": "WebSite", name: SITE_ADI, ...(site ? { url: `${site}/` } : {}) },
  };
}

/** <head>'e girecek etiketler: açıklama, kanonik adres, Open Graph, Twitter kartı, uygulama simgeleri, JSON-LD */
export function headEtiketleri(s: SeoSayfa, site: string | null): string {
  const m = (ad: string, icerik: string) => `<meta name="${ad}" content="${kacir(icerik)}" />`;
  const p = (ad: string, icerik: string) => `<meta property="${ad}" content="${kacir(icerik)}" />`;
  const gorsel = tamAdres(site, s.gorsel);
  const satirlar = [
    `<title>${kacir(s.baslik.tr)}</title>`,
    m("description", s.aciklama.tr),
    m("robots", "index, follow, max-image-preview:large"),
    m("application-name", SITE_ADI),
    ...(site ? [`<link rel="canonical" href="${kacir(tamAdres(site, s.yol))}" />`] : []),
    p("og:type", "website"),
    p("og:site_name", SITE_ADI),
    p("og:title", s.baslik.tr),
    p("og:description", s.aciklama.tr),
    ...(site ? [p("og:url", tamAdres(site, s.yol))] : []),
    p("og:image", gorsel),
    p("og:image:type", "image/png"),
    p("og:image:width", String(OG_GENISLIK)),
    p("og:image:height", String(OG_YUKSEKLIK)),
    p("og:image:alt", s.gorselAlt),
    p("og:locale", "tr_TR"),
    p("og:locale:alternate", "en_US"),
    m("twitter:card", "summary_large_image"),
    m("twitter:title", s.baslik.tr),
    m("twitter:description", s.aciklama.tr),
    m("twitter:image", gorsel),
    m("twitter:image:alt", s.gorselAlt),
    `<link rel="icon" type="image/svg+xml" href="favicon.svg" />`,
    `<link rel="apple-touch-icon" href="apple-touch-icon.png" />`,
    `<link rel="manifest" href="site.webmanifest" />`,
    `<script type="application/ld+json">${JSON.stringify(jsonLd(s, site)).replace(/</g, "\\u003c")}</script>`,
  ];
  return satirlar.join("\n    ");
}

/** Bölüm sayfasında uygulamayı o bölümde açan betik (adreste başka bir bölüm yoksa) */
export const bolumBetigi = (hash: string): string =>
  `<script>if (!location.hash) history.replaceState(null, "", location.pathname + location.search + ${JSON.stringify(hash)});</script>`;

/**
 * index.html'den bir sayfanın HTML'i: <title> ve açıklama yerine sayfanın etiketleri, eski satır içi simge
 * yerine dosya simgesi; bölüm sayfasında açılış betiği. Derlenmiş index.html (varlık bağlantılarıyla) de olur.
 */
export function sayfaHtml(html: string, s: SeoSayfa, site: string | null): string {
  let out = html
    .replace(/\s*<meta name="description"[^>]*>/, "")
    .replace(/\s*<link rel="icon"[^>]*>/, "")
    .replace(/<title>[\s\S]*?<\/title>/, headEtiketleri(s, site));
  if (s.hash) out = out.replace(/<head>/, `<head>\n    ${bolumBetigi(s.hash)}`);
  return out;
}

/** Site haritası (yalnız sitenin adresi biliniyorsa: haritada tam adresler olmalı) */
export function siteHaritasi(site: string, tarih: string): string {
  const url = (s: SeoSayfa) =>
    `  <url>\n    <loc>${kacir(tamAdres(site, s.yol))}</loc>\n    <lastmod>${tarih}</lastmod>\n    <changefreq>monthly</changefreq>\n    <priority>${s.yol === "/" ? "1.0" : "0.8"}</priority>\n  </url>`;
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${SAYFALAR.map(url).join("\n")}\n</urlset>\n`;
}

/** robots.txt: her şey açık; adres biliniyorsa site haritası */
export const robots = (site: string | null): string => `User-agent: *\nAllow: /\n${site ? `\nSitemap: ${site}/sitemap.xml\n` : ""}`;

/** Web uygulaması bildirimi (ana ekrana eklenince ad, renk, simgeler) */
export function bildirim(): Record<string, unknown> {
  return {
    name: SITE_ADI,
    short_name: SITE_ADI,
    description: SAYFALAR[0].aciklama.tr,
    lang: "tr",
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#15181d",
    theme_color: "#1b1f25",
    icons: [
      { src: "favicon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}

/** Uygulama içindeki bölümün sayfa başlığı (sekmede): bölüm değişince ve dil değişince */
export function bolumBasligi(hash: string, dil: Dil): string {
  const s = SAYFALAR.find((x) => x.hash !== null && (hash === x.hash || hash.startsWith(`${x.hash}/`)));
  return (s ?? SAYFALAR[0]).baslik[dil];
}
