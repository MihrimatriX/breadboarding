// Arama motorları ve paylaşım kartları (src/seo.ts): derlemenin index.html'den ürettiği bölüm sayfaları,
// site haritası, robots.txt, bildirim ve sekme başlığı. Önizleme görselleri ve simgeler public/'te durur.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  bildirim,
  bolumBasligi,
  OG_GENISLIK,
  OG_YUKSEKLIK,
  robots,
  SAYFALAR,
  sayfaDosyasi,
  sayfaHtml,
  siteAdresi,
  siteHaritasi,
  tamAdres,
} from "../../src/seo.ts";
import { BOLUMLER } from "../../src/ui/ModeSwitch.tsx";

const kok = new URL("../../", import.meta.url);
const SITE = "https://silikon3d.example";
const HTML = `<!doctype html>
<html lang="tr">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" href="data:image/svg+xml,abc" />
    <meta name="description" content="eski" />
    <title>Silikon3D</title>
    <script type="module" src="./assets/index-abc.js"></script>
  </head>
  <body><div id="root"></div></body>
</html>`;

/** PNG'nin IHDR'sindeki genişlik ve yükseklik */
function pngBoyutu(yol: string): [number, number] {
  const b = readFileSync(new URL(`public/${yol}`, kok));
  expect(b.subarray(1, 4).toString("latin1")).toBe("PNG");
  return [b.readUInt32BE(16), b.readUInt32BE(20)];
}

describe("SEO: sayfalar", () => {
  it("her uygulama bölümünün bir sayfası var, ana sayfa başta", () => {
    expect(SAYFALAR[0].yol).toBe("/");
    expect(SAYFALAR[0].hash).toBeNull();
    expect(SAYFALAR.slice(1).map((s) => s.hash)).toEqual(BOLUMLER.map((b) => b.hash));
    expect(new Set(SAYFALAR.map(sayfaDosyasi)).size).toBe(SAYFALAR.length);
  });

  it("başlık ve açıklama paylaşım kartına sığar", () => {
    for (const s of SAYFALAR) {
      for (const dil of ["tr", "en"] as const) {
        expect(s.baslik[dil].length).toBeLessThanOrEqual(70);
        expect(s.aciklama[dil].length).toBeGreaterThan(50);
        expect(s.aciklama[dil].length).toBeLessThanOrEqual(200);
      }
    }
  });

  it("önizleme görselleri public/'te, 1200×630 PNG", () => {
    for (const s of SAYFALAR) expect(pngBoyutu(s.gorsel), s.gorsel).toEqual([OG_GENISLIK, OG_YUKSEKLIK]);
  });

  it("bildirimin ve sayfaların simgeleri public/'te", () => {
    expect(pngBoyutu("apple-touch-icon.png")).toEqual([180, 180]);
    for (const i of bildirim().icons as { src: string; sizes: string }[]) {
      if (i.src.endsWith(".png")) expect(pngBoyutu(i.src).join("x")).toBe(i.sizes);
      else expect(readFileSync(new URL(`public/${i.src}`, kok), "utf8")).toContain("<svg");
    }
  });
});

describe("SEO: adresler", () => {
  it("SITE_URL düzeltilir, geçersizse yok sayılır", () => {
    expect(siteAdresi(" https://a.example/ ")).toBe("https://a.example");
    expect(siteAdresi("http://a.example/alt//")).toBe("http://a.example/alt");
    expect(siteAdresi("a.example")).toBeNull();
    expect(siteAdresi("")).toBeNull();
    expect(siteAdresi(undefined)).toBeNull();
  });

  it("tam adres: site varsa mutlak, yoksa göreli", () => {
    expect(tamAdres(SITE, "/")).toBe(`${SITE}/`);
    expect(tamAdres(SITE, "/kart")).toBe(`${SITE}/kart`);
    expect(tamAdres(SITE, "og/kart.png")).toBe(`${SITE}/og/kart.png`);
    expect(tamAdres(null, "/")).toBe("./");
    expect(tamAdres(null, "og/kart.png")).toBe("og/kart.png");
  });

  it("sayfa dosyaları kökte: index.html, kart.html", () => {
    expect(SAYFALAR.map(sayfaDosyasi)).toEqual(["index.html", "6502.html", "cpu16.html", "kart.html", "hesap.html", "mimari.html", "belgeler.html"]);
  });
});

describe("SEO: sayfa HTML'i", () => {
  const kart = SAYFALAR.find((s) => s.yol === "/kart")!;

  it("eski başlık, açıklama ve satır içi simge yerine sayfanın etiketleri", () => {
    const h = sayfaHtml(HTML, kart, SITE);
    expect(h).not.toContain("<title>Silikon3D</title>");
    expect(h).not.toContain('content="eski"');
    expect(h).not.toContain("data:image/svg+xml");
    expect(h.match(/<title>/g)).toHaveLength(1);
    expect(h.match(/name="description"/g)).toHaveLength(1);
    expect(h).toContain(`<title>${kart.baslik.tr}</title>`);
    expect(h).toContain(`<meta property="og:image" content="${SITE}/og/kart.png" />`);
    expect(h).toContain('<meta name="twitter:card" content="summary_large_image" />');
    expect(h).toContain('<link rel="manifest" href="site.webmanifest" />');
    // derlenmiş sayfanın varlık bağlantıları yerinde
    expect(h).toContain('src="./assets/index-abc.js"');
  });

  it("kanonik adres ve og:url yalnız site adresi biliniyorsa", () => {
    const var_ = sayfaHtml(HTML, kart, SITE);
    expect(var_).toContain(`<link rel="canonical" href="${SITE}/kart" />`);
    expect(var_).toContain(`<meta property="og:url" content="${SITE}/kart" />`);
    const yok = sayfaHtml(HTML, kart, null);
    expect(yok).not.toContain("canonical");
    expect(yok).not.toContain("og:url");
    expect(yok).toContain('<meta property="og:image" content="og/kart.png" />');
  });

  it("bölüm sayfası uygulamayı kendi bölümünde açar, ana sayfa açmaz", () => {
    const h = sayfaHtml(HTML, kart, null);
    expect(h).toContain('"#kart"');
    expect(h.indexOf("history.replaceState")).toBeLessThan(h.indexOf("./assets/index-abc.js"));
    expect(sayfaHtml(HTML, SAYFALAR[0], null)).not.toContain("history.replaceState");
  });

  it("öznitelikler kaçışlı, JSON-LD geçerli", () => {
    const h = sayfaHtml(HTML, { ...kart, gorselAlt: 'a "b" <c> & d' }, SITE);
    expect(h).toContain('content="a &quot;b&quot; &lt;c&gt; &amp; d"');
    const ld = h.match(/<script type="application\/ld\+json">(.*?)<\/script>/)![1];
    const veri = JSON.parse(ld);
    expect(veri["@type"]).toBe("WebApplication");
    expect(veri.url).toBe(`${SITE}/kart`);
  });
});

describe("SEO: site dosyaları", () => {
  it("site haritası bütün sayfaları tam adresle listeler", () => {
    const x = siteHaritasi(SITE, "2026-10-14");
    expect(x.match(/<loc>/g)).toHaveLength(SAYFALAR.length);
    for (const s of SAYFALAR) expect(x).toContain(`<loc>${tamAdres(SITE, s.yol)}</loc>`);
    expect(x).toContain("<lastmod>2026-10-14</lastmod>");
  });

  it("robots.txt site haritasını yalnız adres biliniyorsa gösterir", () => {
    expect(robots(SITE)).toContain(`Sitemap: ${SITE}/sitemap.xml`);
    expect(robots(null)).not.toContain("Sitemap");
    expect(robots(null)).toContain("Allow: /");
  });
});

describe("SEO: sekme başlığı", () => {
  it("bölüme ve dile göre, alt adreslerde de", () => {
    expect(bolumBasligi("", "tr")).toBe(SAYFALAR[0].baslik.tr);
    expect(bolumBasligi("#kart", "en")).toBe(SAYFALAR.find((s) => s.hash === "#kart")!.baslik.en);
    expect(bolumBasligi("#belgeler/cpu16/docs/spec.md", "tr")).toBe(SAYFALAR.find((s) => s.hash === "#belgeler")!.baslik.tr);
    expect(bolumBasligi("#mimari/hesap", "tr")).toBe(SAYFALAR.find((s) => s.hash === "#mimari")!.baslik.tr);
    expect(bolumBasligi("#yok", "tr")).toBe(SAYFALAR[0].baslik.tr);
  });
});
