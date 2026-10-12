// Belge çıktısının paleti: uygulamanın açık (ya da koyu) temasının belirteçleri, düz renk olarak.
// src/styles.css ve src/mimari/mimari.css okunur (scripts/kontrast.mjs gibi); yarı saydam dolgular
// kâğıdın üstüne karıştırılıp onaltılık renge çevrilir ki SVG her görüntüleyicide aynı görünsün.
// Yalnız Node'da (dosya okur): uygulama aynı belirteçleri CSS'ten doğrudan kullanır (CSS_PALETI).

import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { Palet } from "./agac.ts";
import { KUTU_ROLLERI, YOL_TURLERI } from "./model.ts";

const oku = (yol: string) => readFileSync(fileURLToPath(new URL(yol, import.meta.url)), "utf8");

/** Bir seçicinin ilk bloğundaki --ad: değer çiftleri */
function blok(css: string, secici: string): Record<string, string> {
  const i = css.indexOf(secici);
  if (i < 0) return {};
  const bas = css.indexOf("{", i);
  const son = css.indexOf("}", bas);
  const out: Record<string, string> = {};
  for (const m of css.slice(bas + 1, son).matchAll(/--([\w-]+)\s*:\s*([^;]+);/g)) out[m[1]] = m[2].trim();
  return out;
}

type Rgba = [number, number, number, number];

function renk(d: string): Rgba {
  let m = /^#([0-9a-f]{6})$/i.exec(d);
  if (m) return [0, 2, 4].map((k) => parseInt(m![1].slice(k, k + 2), 16)).concat(1) as Rgba;
  m = /^#([0-9a-f]{3})$/i.exec(d);
  if (m) return [...m[1]].map((c) => parseInt(c + c, 16)).concat(1) as Rgba;
  m = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)\s*(?:,\s*([\d.]+)\s*)?\)$/i.exec(d);
  if (m) return [+m[1], +m[2], +m[3], m[4] === undefined ? 1 : +m[4]];
  throw new Error(`renk çözülemedi: ${d}`);
}

const hex = ([r, g, b]: Rgba | [number, number, number]) => `#${[r, g, b].map((c) => Math.round(c).toString(16).padStart(2, "0")).join("")}`;

/** Temanın paleti: "acik" belgeler için (beyaz kâğıt), "koyu" ekran için */
export function temaPaleti(tema: "acik" | "koyu" = "acik"): Palet {
  const stil = oku("../../src/styles.css");
  const mimari = oku("../../src/mimari/mimari.css");
  const koyu = { ...blok(stil, ':root[data-tema="koyu"]'), ...blok(mimari, ':root[data-tema="koyu"]') };
  const t = tema === "koyu" ? koyu : { ...koyu, ...blok(stil, ':root[data-tema="acik"]'), ...blok(mimari, ':root[data-tema="acik"]') };
  const coz = (ad: string, derinlik = 0): Rgba => {
    if (derinlik > 8) throw new Error(`döngü: ${ad}`);
    const v = t[ad];
    if (v === undefined) throw new Error(`belirteç yok: --${ad}`);
    const m = /^var\(--([\w-]+)\)$/.exec(v);
    return m ? coz(m[1], derinlik + 1) : renk(v);
  };
  const kagit = coz("mm-kagit");
  /** yarı saydam rengi kâğıdın üstüne karıştır */
  const duz = (ad: string) => {
    const [r, g, b, a] = coz(ad);
    return hex([r * a + kagit[0] * (1 - a), g * a + kagit[1] * (1 - a), b * a + kagit[2] * (1 - a)]);
  };
  return {
    kagit: hex(kagit),
    cerceve: duz("mm-cerceve"),
    baslikBg: duz("mm-baslik-bg"),
    baslikYazi: duz("mm-baslik-yazi"),
    grupBg: duz("mm-grup-bg"),
    grupCizgi: duz("mm-grup-cizgi"),
    yazi: duz("text"),
    ikincil: duz("text-muted"),
    soluk: duz("text-faint"),
    baglanti: duz("link"),
    sans: '"IBM Plex Sans", Inter, "DejaVu Sans", "Segoe UI", Arial, sans-serif',
    mono: '"IBM Plex Mono", "DejaVu Sans Mono", Consolas, monospace',
    yol: Object.fromEntries(YOL_TURLERI.map((y) => [y, duz(`mm-y-${y}`)])),
    kutu: Object.fromEntries(KUTU_ROLLERI.map((r) => [r, { cizgi: duz(`mm-k-${r}`), dolgu: duz(`mm-k-${r}-soft`) }])),
  };
}
