// Mimari diyagramlarının belgelerdeki karşılığı: düz SVG metni (açık tema, yazdırmaya uygun) ve kurulum
// belgelerine eklenen "Mimari" sayfası (A4 yatay). Yalnız Node'da: palet CSS dosyalarından okunur.
//
// Kullananlar: cli.ts (npm run cpu16 -- mimari), cpu16/breadboard/belge.ts (dizin belgesi),
// hesap8/breadboard/belge.ts (hesap makinesinin breadboard belgesi); belgelerdeki SVG'ler
// (cpu16/docs/img, hesap8/docs/img) ve onların güncelliğini denetleyen test.

import { esc } from "../kurulum/stil.ts";
import { svgMetni } from "./agac.ts";
import { diyagramKur, type DiyagramKimligi } from "./index.ts";
import { temaPaleti } from "./palet.ts";

/**
 * Diyagramın tek başına açılan SVG'si: stil gömülü, renkler düz. Baştaki yorumda "--" yok: XML yorumunda
 * yasak, varsa tarayıcı dosyayı <img> olarak açamaz (komut npm'in "--"suz biçimiyle yazılır).
 */
export function mimariSvg(id: DiyagramKimligi, tema: "acik" | "koyu" = "acik"): string {
  const k = diyagramKur(id);
  const svg = svgMetni(k.sahne, temaPaleti(tema), { baslik: `${k.kayit.ad}: mimari`, aciklama: k.diyagram.aciklama });
  return svg.replace(/^(<svg[^>]*>)\n/, `$1\n  <!-- ÜRETİLİR, elle değiştirme: npm run cpu16 mimari ${id} (cpu16/mimari/) -->\n`);
}

/** Sayfa: A4 yatayın yazı alanı ≈ 275 × 186 mm; başlık ve alt yazıdan kalan yükseklik diyagramın */
const STIL = `
section.mimari h2 { margin-bottom: 1.5mm; }
figure.mimari { margin: 0; break-inside: avoid; }
figure.mimari > svg { display: block; width: 100%; height: auto; max-height: 166mm; }
figure.mimari figcaption { margin-top: 1.2mm; font-size: 7.5pt; color: var(--muted); }
`;

/**
 * Kurulum belgelerinde "Mimari" sayfası: diyagram bütün sayfayı kaplar (A4 yatay). `baslik` verilmezse
 * diyagramın adı. Stil sayfanın içinde: belgenin kendi stiline dokunmaz.
 */
export function mimariBolumu(id: DiyagramKimligi, o: { baslik?: string } = {}): string {
  const k = diyagramKur(id);
  const svg = mimariSvg(id);
  return `<section class="bolum yatay mimari" id="mimari-${id}">
<style>${STIL}</style>
<h2>${esc(o.baslik ?? `Mimari: ${k.kayit.ad}`)}</h2>
<figure class="mimari">${svg}<figcaption>Kutular işlev blokları: adı, görevi, içindeki entegreler ve sayıları devreden (netlist) sayılır. Çizgiler yollar; kalınlık bit sayısı, ok sürenden okuyana. Her kutunun blokları, her yolun netleri ve okların yönü netlistle denetlenir (cpu16/tests/mimari.test.ts). Etkileşimli hali: Silikon3D → Mimari; tek başına SVG: <code>npm run cpu16 -- mimari ${id}</code>.</figcaption></figure>
</section>`;
}
