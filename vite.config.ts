import { defineConfig } from "vitest/config";
import type { Plugin } from "vite";
import react from "@vitejs/plugin-react";
import { bildirim, robots, SAYFALAR, sayfaDosyasi, sayfaHtml, siteAdresi, siteHaritasi } from "./src/seo.ts";

/**
 * Dış kütüphaneler ayrı parçalarda: React (her bölümde, ilk açılışta), three (3D bölümleri),
 * react-three-fiber ve drei (3D bölümleri), postprocessing (yalnız 6502 die'ın parlaması). Bölümlerin
 * kendi kodu Root.tsx'teki React.lazy ile ayrı parçalara düşer; bölüm değişse de bu parçalar önbellekte
 * kalır. Burada adı geçmeyen paketler (ör. three-mesh-bvh) onları kullanan bölümün parçasına girer.
 */
const VENDOR: Record<string, string> = {
  react: "vendor-react",
  "react-dom": "vendor-react",
  scheduler: "vendor-react",
  zustand: "vendor-react",
  "use-sync-external-store": "vendor-react",
  three: "vendor-three",
  "react-reconciler": "vendor-r3f",
  "three-stdlib": "vendor-r3f",
  "its-fine": "vendor-r3f",
  "suspend-react": "vendor-r3f",
  "react-use-measure": "vendor-r3f",
  debounce: "vendor-r3f",
  postprocessing: "vendor-efekt",
  n8ao: "vendor-efekt",
  maath: "vendor-efekt",
};

const PARCALAR = ["vendor-react", "vendor-three", "vendor-r3f", "vendor-efekt"];

function vendorParcasi(id: string): string | undefined {
  // Vite'ın ön yükleme yardımcısı ilk açılışta gerekir; 3D parçasına düşerse giriş three'yi de çekerdi
  if (id.includes("vite/preload-helper") || id.includes("commonjsHelpers")) return "vendor-react";
  const i = id.lastIndexOf("/node_modules/");
  if (i < 0) return undefined;
  // @react-three paketlerinin kendi içindeki bağımlılıklar (ör. fiber'in zustand 3'ü) de onlarla gider
  if (id.includes("/node_modules/@react-three/postprocessing/")) return "vendor-efekt";
  if (id.includes("/node_modules/@react-three/")) return "vendor-r3f";
  const yol = id.slice(i + "/node_modules/".length).split("/");
  const paket = yol[0].startsWith("@") ? `${yol[0]}/${yol[1]}` : yol[0];
  return VENDOR[paket];
}

/**
 * Arama motorları ve paylaşım kartları (src/seo.ts): derlenen index.html'e ana sayfanın etiketleri, kökte her
 * bölümün kendi sayfası (6502.html, kart.html, …: aynı uygulama, kendi başlığı ve önizlemesiyle, o bölümde
 * açılır), robots.txt, site.webmanifest ve sitenin adresi verilmişse sitemap.xml. Adres: SITE_URL ortam
 * değişkeni (örn. SITE_URL=https://silikon3d.example npm run build).
 */
function seoEklentisi(): Plugin {
  const site = siteAdresi(process.env.SITE_URL);
  return {
    name: "silikon3d-seo",
    apply: "build",
    enforce: "post",
    generateBundle(_, bundle) {
      const idx = bundle["index.html"];
      if (!idx || idx.type !== "asset") return;
      const html = String(idx.source);
      for (const sayfa of SAYFALAR) {
        const kaynak = sayfaHtml(html, sayfa, site);
        if (sayfaDosyasi(sayfa) === "index.html") idx.source = kaynak;
        else this.emitFile({ type: "asset", fileName: sayfaDosyasi(sayfa), source: kaynak });
      }
      this.emitFile({ type: "asset", fileName: "robots.txt", source: robots(site) });
      this.emitFile({ type: "asset", fileName: "site.webmanifest", source: `${JSON.stringify(bildirim(), null, 2)}\n` });
      if (site) this.emitFile({ type: "asset", fileName: "sitemap.xml", source: siteHaritasi(site, new Date().toISOString().slice(0, 10)) });
      else this.warn("SITE_URL verilmedi: kanonik bağlantı, og:url ve sitemap.xml yazılmadı, önizleme görselleri göreli");
    },
  };
}

export default defineConfig({
  plugins: [react(), seoEklentisi()],
  base: "./",
  worker: { format: "es" },
  build: {
    rolldownOptions: {
      output: {
        // her parça ayrı grup, sırası öncelik: rolldown bir grubun yakaladığı modülün bağımlılıklarını da
        // yanına çeker; postprocessing three'yi import ettiği için three önce kendi grubuna düşmeli
        codeSplitting: {
          groups: PARCALAR.map((ad, i) => ({ name: ad, test: (id: string) => vendorParcasi(id) === ad, priority: PARCALAR.length - i })),
        },
        // tezgâhla kart bölümünün ortak parçası (C derleyicisi, assembler, emülatör): adı ilk modülden
        // ("serial") gelmesin, ne olduğu belli olsun
        chunkFileNames: (c) => (c.moduleIds.some((id) => id.includes("/cpu16/cc/")) ? "assets/cpu16-ortak-[hash].js" : "assets/[name]-[hash].js"),
      },
    },
    // three'nin çekirdeği tek başına ~700 kB (sıkıştırılmış ~180 kB) ve bölünemez; uyarı ondan büyükler için
    chunkSizeWarningLimit: 750,
  },
  // vitest 3'ten beri eşzamanlı testler de süre sınırına tabi; kapı seviyesi testler tek başına 10-15 s sürer
  test: { environment: "node", testTimeout: 60_000, exclude: ["**/node_modules/**", "dist/**", ".claude/**"] },
});
