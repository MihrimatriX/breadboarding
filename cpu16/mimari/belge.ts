// Mimari diyagramlarının belgelerdeki karşılığı: düz SVG metni (açık tema, yazdırmaya uygun) ve kurulum
// belgelerine eklenen "Mimari" sayfası (A4 yatay). Yalnız Node'da: palet CSS dosyalarından okunur.
// İkisi de Türkçe ya da İngilizce yazılır (varsayılan Türkçe).
//
// Kullananlar: cli.ts (npm run cpu16 -- mimari), cpu16/breadboard/belge.ts (dizin belgesi),
// hesap8/breadboard/belge.ts (hesap makinesinin breadboard belgesi); belgelerdeki SVG'ler
// (cpu16/docs/img, hesap8/docs/img) ve onların güncelliğini denetleyen test.

import { esc } from "../kurulum/stil.ts";
import { svgMetni } from "./agac.ts";
import { diyagramKur, kayitAdlari, type DiyagramKimligi } from "./index.ts";
import type { Dil } from "./model.ts";
import { temaPaleti } from "./palet.ts";

/**
 * Diyagramın tek başına açılan SVG'si: stil gömülü, renkler düz. Baştaki yorumda "--" yok: XML yorumunda
 * yasak, varsa tarayıcı dosyayı <img> olarak açamaz (komut npm'in "--"suz biçimiyle yazılır).
 */
export function mimariSvg(id: DiyagramKimligi, tema: "acik" | "koyu" = "acik", dil: Dil = "tr"): string {
  const k = diyagramKur(id, dil);
  const ad = kayitAdlari(k.kayit, dil).ad;
  const svg = svgMetni(k.sahne, temaPaleti(tema), { baslik: dil === "en" ? `${ad}: architecture` : `${ad}: mimari`, aciklama: k.diyagram.aciklama });
  const not = dil === "en" ? "GENERATED, do not edit by hand" : "ÜRETİLİR, elle değiştirme";
  return svg.replace(/^(<svg[^>]*>)\n/, `$1\n  <!-- ${not}: npm run cpu16 mimari ${id} (cpu16/mimari/) -->\n`);
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
export function mimariBolumu(id: DiyagramKimligi, o: { baslik?: string; dil?: Dil } = {}): string {
  const dil = o.dil ?? "tr";
  const ad = kayitAdlari(diyagramKur(id, dil).kayit, dil).ad;
  const svg = mimariSvg(id, "acik", dil);
  const alt = dil === "en"
    ? `Boxes are function blocks: their names, roles, chips and chip counts come from the circuit (netlist). Lines are connections; thickness shows the bit count and arrows point from driver to reader. The blocks of every box, the nets of every connection and the arrow directions are checked against the netlist (cpu16/tests/mimari.test.ts). Interactive version: Silikon3D → Architecture; standalone SVG: <code>npm run cpu16 -- mimari ${id}</code>.`
    : `Kutular işlev blokları: adı, görevi, içindeki entegreler ve sayıları devreden (netlist) sayılır. Çizgiler yollar; kalınlık bit sayısı, ok sürenden okuyana. Her kutunun blokları, her yolun netleri ve okların yönü netlistle denetlenir (cpu16/tests/mimari.test.ts). Etkileşimli hâli: Silikon3D → Mimari; tek başına SVG: <code>npm run cpu16 -- mimari ${id}</code>.`;
  return `<section class="bolum yatay mimari" id="mimari-${id}">
<style>${STIL}</style>
<h2>${esc(o.baslik ?? (dil === "en" ? `Architecture: ${ad}` : `Mimari: ${ad}`))}</h2>
<figure class="mimari">${svg}<figcaption>${alt}</figcaption></figure>
</section>`;
}
