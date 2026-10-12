// Pasif elemanların SVG çizimleri: renk bantlı direnç, LED'in anatomisi, "104" yazılı seramik,
// şeritli elektrolitik, SIP-9 direnç dizisi ve iç şeması, osilatör, LED + seri direnç devresi, çekme
// direnci, dekuplaj, renk kodu tablosu ve breadboard yerleşimi. Saf metin üretir (DOM yok): 3D
// görünümün bilgi paneli koyu paletle satır içi, rehberin görselleri (kit/gorseller/*.svg) açık
// paletle dosya olarak kullanır. Değerler ve renkler board/pasif-bilgi.ts ile board/passives.ts'ten.

import { LED_RENKLERI, type LedRenk } from "../board/passives.ts";
import {
  RENK_KODU, VCC, akimMetni, bantFormulu, carpanMetni, direncBantlari, faradMetni, ledAkimi, ohmMetni, renkKodu, sayi, ucHaneliKoduOku,
  type Bant,
} from "../board/pasif-bilgi.ts";

// ---------------------------------------------------------------- palet ve yardımcılar

export interface Palet {
  /** zemin (null: saydam) */
  zemin: string | null;
  yazi: string;
  soluk: string;
  cizgi: string;
  ince: string;
  kalay: string;
  vurgu: string;
  akim: string;
  yuksek: string;
  dusuk: string;
  z: string;
  vcc: string;
  gnd: string;
  /** breadboard gövdesi ve delikleri */
  tahta: string;
  delik: string;
}

/** Rehber görselleri: açık zemin (GitHub'ın açık ve koyu temasında okunur) */
export const ACIK: Palet = {
  zemin: "#fbfaf6", yazi: "#1d232a", soluk: "#5d6773", cizgi: "#2a323b", ince: "#d9dcdf", kalay: "#9aa3ab",
  vurgu: "#c8323a", akim: "#d97706", yuksek: "#d4283f", dusuk: "#5b6b7d", z: "#7b68d6", vcc: "#d4282c", gnd: "#2659cc",
  tahta: "#f1eee6", delik: "#c4beb0",
};

/** 3D görünümün paneli: saydam zemin, koyu tema */
export const KOYU: Palet = {
  zemin: null, yazi: "#e2e6ea", soluk: "#8f99a3", cizgi: "#c3cbd3", ince: "#2b343e", kalay: "#aeb6be",
  vurgu: "#ff5a6e", akim: "#ffb02e", yuksek: "#ff2a55", dusuk: "#9fb0c4", z: "#9d8cff", vcc: "#ff5a6e", gnd: "#6f9bff",
  tahta: "#1a2028", delik: "#3a4450",
};

export interface Parca {
  w: number;
  h: number;
  /** SVG gövdesi (0,0 sol üst) */
  g: string;
}

const SANS = "'IBM Plex Sans', 'Segoe UI', Helvetica, Arial, sans-serif";
const MONO = "'IBM Plex Mono', Consolas, monospace";

const n = (x: number) => Math.round(x * 10) / 10;
const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

type Oz = Record<string, string | number | undefined | null | false>;
const oz = (a: Oz) =>
  Object.entries(a)
    .filter(([, v]) => v !== undefined && v !== null && v !== false)
    .map(([k, v]) => ` ${k}="${typeof v === "number" ? n(v) : esc(String(v))}"`)
    .join("");

export const yerlestir = (p: Parca, x: number, y: number): string => `<g transform="translate(${n(x)} ${n(y)})">${p.g}</g>`;

/** Bir parçayı tam SVG belgesine sarar. genislik: dosyada doğal boyut (rehber); panelde CSS ölçekler. */
export function svgBelge(p: Parca, pal: Palet, baslik: string, o: { genislik?: boolean; kenar?: number } = {}): string {
  const k = o.kenar ?? (pal.zemin ? 16 : 0);
  const W = p.w + 2 * k;
  const H = p.h + 2 * k;
  const zemin = pal.zemin ? `<rect width="${n(W)}" height="${n(H)}" rx="10" fill="${pal.zemin}"/>` : "";
  const boyut = o.genislik ? ` width="${n(W)}" height="${n(H)}"` : "";
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n(W)} ${n(H)}"${boyut} font-family="${SANS}" role="img">` +
    `<title>${esc(baslik)}</title>${zemin}${k ? yerlestir(p, k, k) : p.g}</svg>`
  );
}

interface YaziOz {
  boy?: number;
  renk?: string;
  hiza?: "start" | "middle" | "end";
  kalin?: boolean | number;
  mono?: boolean;
  dondur?: number;
  italik?: boolean;
}

/** Palete bağlı çizim yardımcıları */
function cizer(pal: Palet) {
  const yazi = (x: number, y: number, s: string, o: YaziOz = {}) =>
    `<text${oz({
      x, y, "font-size": o.boy ?? 12, fill: o.renk ?? pal.yazi,
      "text-anchor": o.hiza && o.hiza !== "start" ? o.hiza : undefined,
      "font-weight": o.kalin === true ? 700 : o.kalin || undefined,
      "font-family": o.mono ? MONO : undefined,
      "font-style": o.italik ? "italic" : undefined,
      transform: o.dondur ? `rotate(${o.dondur} ${n(x)} ${n(y)})` : undefined,
    })}>${esc(s)}</text>`;
  const cizgi = (x1: number, y1: number, x2: number, y2: number, renk = pal.cizgi, k = 1.6, ek: Oz = {}) =>
    `<line${oz({ x1, y1, x2, y2, stroke: renk, "stroke-width": k, "stroke-linecap": "round", ...ek })}/>`;
  const yol = (d: string, a: Oz) => `<path d="${d}"${oz(a)}/>`;
  const kutu = (x: number, y: number, w: number, h: number, a: Oz) => `<rect${oz({ x, y, width: w, height: h, ...a })}/>`;
  const daire = (x: number, y: number, r: number, a: Oz) => `<circle${oz({ cx: x, cy: y, r, ...a })}/>`;
  const nokta = (x: number, y: number, renk = pal.cizgi, r = 2.6) => daire(x, y, r, { fill: renk });
  /** ok: çizgi ve dolu uç */
  const ok = (x1: number, y1: number, x2: number, y2: number, renk = pal.akim, k = 1.6, bas = 7) => {
    const a = Math.atan2(y2 - y1, x2 - x1);
    const p = (d: number, t: number) => `${n(x2 - bas * Math.cos(a) + d * Math.cos(a + t))},${n(y2 - bas * Math.sin(a) + d * Math.sin(a + t))}`;
    const bx = x2 - bas * Math.cos(a) * 0.8;
    const by = y2 - bas * Math.sin(a) * 0.8;
    return cizgi(x1, y1, bx, by, renk, k) + `<polygon points="${n(x2)},${n(y2)} ${p(bas * 0.45, Math.PI / 2)} ${p(bas * 0.45, -Math.PI / 2)}" fill="${renk}"/>`;
  };
  /** açıklama çizgisi: parçanın üstündeki noktadan yazıya */
  const lider = (x1: number, y1: number, x2: number, y2: number) =>
    cizgi(x1, y1, x2, y2, pal.soluk, 0.9) + nokta(x1, y1, pal.soluk, 1.8);
  /** GND simgesi: (x, y) bağlantı ucu */
  const toprak = (x: number, y: number, renk = pal.cizgi) =>
    cizgi(x, y, x, y + 7, renk) + cizgi(x - 10, y + 7, x + 10, y + 7, renk, 1.8) + cizgi(x - 6, y + 11, x + 6, y + 11, renk, 1.6) + cizgi(x - 2.5, y + 15, x + 2.5, y + 15, renk, 1.4);
  /** VCC simgesi: (x, y) bağlantı ucu, çubuk üstte */
  const besleme = (x: number, y: number, ad = "VCC (5 V)", renk = pal.cizgi) =>
    cizgi(x, y, x, y - 8, renk) + cizgi(x - 11, y - 8, x + 11, y - 8, renk, 2) + yazi(x + 15, y - 4, ad, { boy: 11.5, renk: pal.soluk });
  /** IEC direnç simgesi (dikdörtgen), merkez (x, y) */
  const direncSema = (x: number, y: number, dikey = false, uzun = 46, en = 15) =>
    kutu(dikey ? x - en / 2 : x - uzun / 2, dikey ? y - uzun / 2 : y - en / 2, dikey ? en : uzun, dikey ? uzun : en, { fill: "none", stroke: pal.cizgi, "stroke-width": 1.8, rx: 1.5 });
  /** kondansatör simgesi, merkez (x, y): dikey = plakalar yatay (akım yukarıdan aşağı) */
  const kondSema = (x: number, y: number, dikey = true, en = 26, ara = 9) =>
    dikey
      ? cizgi(x - en / 2, y - ara / 2, x + en / 2, y - ara / 2, pal.cizgi, 2.4) + cizgi(x - en / 2, y + ara / 2, x + en / 2, y + ara / 2, pal.cizgi, 2.4)
      : cizgi(x - ara / 2, y - en / 2, x - ara / 2, y + en / 2, pal.cizgi, 2.4) + cizgi(x + ara / 2, y - en / 2, x + ara / 2, y + en / 2, pal.cizgi, 2.4);
  /** diyot simgesi: anot (x, y), katot (x + boy, y) ya da aşağı doğru */
  const diyot = (x: number, y: number, asagi: boolean, dolgu: string | null, boy = 26) => {
    const h = boy * 0.55;
    if (asagi) {
      return `<polygon points="${n(x - h)},${n(y)} ${n(x + h)},${n(y)} ${n(x)},${n(y + boy)}" fill="${dolgu ?? "none"}" stroke="${pal.cizgi}" stroke-width="1.8" stroke-linejoin="round"/>` +
        cizgi(x - h, y + boy, x + h, y + boy, pal.cizgi, 2.2);
    }
    return `<polygon points="${n(x)},${n(y - h)} ${n(x)},${n(y + h)} ${n(x + boy)},${n(y)}" fill="${dolgu ?? "none"}" stroke="${pal.cizgi}" stroke-width="1.8" stroke-linejoin="round"/>` +
      cizgi(x + boy, y - h, x + boy, y + h, pal.cizgi, 2.2);
  };
  /** LED'in ışık okları: (x, y) çıkış noktası, sağ üste */
  const isinlar = (x: number, y: number, renk: string) => ok(x, y, x + 11, y - 11, renk, 1.4, 5) + ok(x + 7, y + 3, x + 18, y - 8, renk, 1.4, 5);
  /** tampon / evirici giriş üçgeni: sol uç (x, y) */
  const tampon = (x: number, y: number, boy = 28, evirici = false) =>
    `<polygon points="${n(x)},${n(y - boy / 2)} ${n(x)},${n(y + boy / 2)} ${n(x + boy)},${n(y)}" fill="none" stroke="${pal.cizgi}" stroke-width="1.8" stroke-linejoin="round"/>` +
    (evirici ? daire(x + boy + 3.5, y, 3.5, { fill: "none", stroke: pal.cizgi, "stroke-width": 1.6 }) : "");
  /** seviyenin rengi: 0, 1, 2 = Z, 3 = X */
  const seviyeRengi = (lv: number | undefined) => (lv === 1 ? pal.yuksek : lv === 0 ? pal.dusuk : lv === 2 ? pal.z : pal.cizgi);
  return { yazi, cizgi, yol, kutu, daire, nokta, ok, lider, toprak, besleme, direncSema, kondSema, diyot, isinlar, tampon, seviyeRengi };
}

/** Bir rengi beyaza (k > 0) ya da siyaha (k < 0) doğru karıştırır */
function ton(hex: string, k: number): string {
  const v = parseInt(hex.slice(1), 16);
  const c = [v >> 16, (v >> 8) & 255, v & 255].map((x) => Math.round(k >= 0 ? x + (255 - x) * k : x * (1 + k)));
  return `#${c.map((x) => x.toString(16).padStart(2, "0")).join("")}`;
}

/** Binlik ayraçlı tam sayı: 100000 → "100 000" */
const binlik = (x: number) => String(Math.round(x)).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
const ust = (s: string) => s.split("").map((d) => "⁰¹²³⁴⁵⁶⁷⁸⁹"[Number(d)] ?? d).join("");

// ---------------------------------------------------------------- direnç (renk bantları)

/** Eksenel direncin "kemik" gövdesi: x0 sol uç, cy eksen */
function kemik(x0: number, cy: number, L: number, hc: number, hm: number, cl: number): string {
  const P = (x: number, y: number) => `${n(x0 + x)},${n(cy + y)}`;
  return (
    `M${P(0, 0)} C${P(0, -hc * 0.9)} ${P(4, -hc)} ${P(14, -hc)} L${P(cl - 12, -hc)} C${P(cl - 4, -hc)} ${P(cl - 2, -hm)} ${P(cl + 8, -hm)} ` +
    `L${P(L - cl - 8, -hm)} C${P(L - cl + 2, -hm)} ${P(L - cl + 4, -hc)} ${P(L - cl + 12, -hc)} L${P(L - 14, -hc)} C${P(L - 4, -hc)} ${P(L, -hc * 0.9)} ${P(L, 0)} ` +
    `C${P(L, hc * 0.9)} ${P(L - 4, hc)} ${P(L - 14, hc)} L${P(L - cl + 12, hc)} C${P(L - cl + 4, hc)} ${P(L - cl + 2, hm)} ${P(L - cl - 8, hm)} ` +
    `L${P(cl + 8, hm)} C${P(cl - 2, hm)} ${P(cl - 4, hc)} ${P(cl - 12, hc)} L${P(14, hc)} C${P(4, hc)} ${P(0, hc * 0.9)} ${P(0, 0)} Z`
  );
}

export const DIRENC_GOVDE = { karbon: "#d8c39b", metal: "#6f9fe0" };
const BANT_YERI: Record<number, number[]> = { 4: [26, 58, 84, 176], 5: [24, 48, 70, 92, 178] };
const BANT_GOREVI = (b: Bant, i: number) => (b.gorev === "rakam" ? `${i + 1}. rakam` : b.gorev === "carpan" ? "çarpan" : "tolerans");

/**
 * Renk bantlı eksenel direnç. etiket: her bandın altında rengi, anlamı ve görevi, en altta okunuşu.
 * id: satır içi birden çok çizimde kırpma yolunun adı tekil olmalı.
 */
export function direncCizimi(ohm: number, tolerans: number, pal: Palet, o: { id: string; etiket?: boolean; baslik?: string; govde?: string }): Parca {
  const c = cizer(pal);
  const bantlar = direncBantlari(ohm, tolerans);
  const govde = o.govde ?? (tolerans <= 2 ? DIRENC_GOVDE.metal : DIRENC_GOVDE.karbon);
  const W = 340;
  const L = 200;
  const x0 = 70;
  const cy = o.baslik ? 52 : 30;
  const hc = 21;
  const d = kemik(x0, cy, L, hc, 16, 44);
  const kid = `${o.id}-k`;
  let g = o.baslik ? c.yazi(W / 2, 16, o.baslik, { boy: 13.5, kalin: 600, hiza: "middle" }) : "";
  g += c.cizgi(8, cy, x0 + 2, cy, pal.kalay, 3.4) + c.cizgi(x0 + L - 2, cy, W - 8, cy, pal.kalay, 3.4);
  g += `<clipPath id="${kid}"><path d="${d}"/></clipPath>`;
  g += `<path d="${d}" fill="${govde}"/>`;
  const xs = BANT_YERI[bantlar.length];
  g += `<g clip-path="url(#${kid})">`;
  bantlar.forEach((b, i) => (g += c.kutu(x0 + xs[i] - 5.5, cy - hc - 2, 11, 2 * hc + 4, { fill: b.hex })));
  g += c.kutu(x0, cy - hc, L, hc * 0.55, { fill: "#ffffff", opacity: 0.26 });
  g += c.kutu(x0, cy + hc * 0.35, L, hc * 0.65, { fill: "#000000", opacity: 0.16 });
  g += `</g><path d="${d}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="1"/>`;
  if (!o.etiket) return { w: W, h: cy + hc + 12, g };
  const lx0 = 38;
  const lx1 = W - 38;
  const yb = cy + hc;
  bantlar.forEach((b, i) => {
    const bx = x0 + xs[i];
    const lx = lx0 + ((lx1 - lx0) * i) / (bantlar.length - 1);
    g += c.yol(`M${n(bx)},${n(yb + 3)} L${n(bx)},${n(yb + 9)} L${n(lx)},${n(yb + 22)}`, { fill: "none", stroke: pal.soluk, "stroke-width": 0.9 });
    g += c.kutu(lx - 28, yb + 24, 56, 22, { rx: 11, fill: b.hex, stroke: "#000", "stroke-opacity": 0.25 });
    g += c.yazi(lx, yb + 39.5, b.anlam, { boy: 13, kalin: 700, hiza: "middle", renk: renkKodu(b.renk).yazi });
    g += c.yazi(lx, yb + 61, b.ad, { boy: 11, hiza: "middle", renk: pal.soluk });
    g += c.yazi(lx, yb + 75, BANT_GOREVI(b, i), { boy: 10.5, hiza: "middle", renk: pal.soluk, italik: true });
  });
  g += c.yazi(W / 2, yb + 100, `${bantFormulu(bantlar, ohm)} ${bantlar.at(-1)!.anlam}`, { boy: 13.5, kalin: 700, hiza: "middle" });
  return { w: W, h: yb + 108, g };
}

// ---------------------------------------------------------------- LED (anatomi)

/** 3 mm LED'in yandan kesiti: kubbe, yonga, bağlantı teli, anot direği, katot örsü, flanş, bacaklar. */
export function ledCizimi(renk: LedRenk, pal: Palet, o: { id: string; yanik?: boolean; sembol?: boolean }): Parca {
  const c = cizer(pal);
  const info = LED_RENKLERI[renk];
  const yanik = o.yanik ?? false;
  const cx = 130;
  const r = 34;
  const top = 24;
  const fl = 172;
  let g = "";
  if (yanik) {
    const hid = `${o.id}-h`;
    g += `<radialGradient id="${hid}"><stop offset="0" stop-color="${info.isik}" stop-opacity=".75"/><stop offset=".45" stop-color="${info.isik}" stop-opacity=".22"/><stop offset="1" stop-color="${info.isik}" stop-opacity="0"/></radialGradient>`;
    g += c.daire(cx + 4, 112, 104, { fill: `url(#${hid})` });
  }
  // bacaklar: anot (sol, uzun), katot (sağ, kısa)
  const ax = cx - 16;
  const kx = cx + 16;
  g += c.cizgi(ax, fl + 10, ax, 326, pal.kalay, 4.2) + c.cizgi(kx, fl + 10, kx, 292, pal.kalay, 4.2);
  // iç: anot direği, katot örsü ve çanak, yonga, bağlantı teli
  g += c.kutu(ax - 4, 112, 8, fl - 104, { fill: "#a9b1b9" }) + c.kutu(ax - 8, 106, 16, 8, { fill: "#a9b1b9", rx: 1 });
  g += c.yol(`M${kx - 9},${fl + 8} L${kx - 9},132 L${kx - 17},114 L${kx + 15},114 L${kx + 9},132 L${kx + 9},${fl + 8} Z`, { fill: "#8f98a1" });
  g += c.kutu(kx - 6, 113, 12, 7, { fill: yanik ? "#ffffff" : ton(info.isik, -0.35) });
  if (yanik) g += c.daire(kx, 116, 9, { fill: info.isik, opacity: 0.55 });
  g += c.yol(`M${kx - 1},113 Q${cx - 2},84 ${ax + 2},106`, { fill: "none", stroke: "#d8b24a", "stroke-width": 1.4 });
  // epoksi gövde (kubbe) ve flanş: düz kenar katot (sağ) tarafında
  const govde = `M${cx - r},${fl} L${cx - r},${top + r} A${r} ${r} 0 0 1 ${cx + r},${top + r} L${cx + r},${fl} Z`;
  g += c.yol(govde, { fill: yanik ? info.isik : info.govde, "fill-opacity": yanik ? 0.42 : 0.38, stroke: ton(info.govde, -0.2), "stroke-width": 1.4 });
  g += c.yol(`M${cx - r + 7},${fl - 6} L${cx - r + 7},${top + r} A${r - 7} ${r - 7} 0 0 1 ${cx - 6},${top + 8}`, { fill: "none", stroke: "#ffffff", "stroke-opacity": 0.45, "stroke-width": 3, "stroke-linecap": "round" });
  g += c.kutu(cx - r - 8, fl, 2 * r + 10, 12, { fill: yanik ? info.isik : info.govde, "fill-opacity": yanik ? 0.55 : 0.5, stroke: ton(info.govde, -0.2), "stroke-width": 1.4, rx: 2 });
  // açıklamalar (sağ sütun)
  const sx = 206;
  const etiket = (y: number, a: string, b?: string, x1?: number, y1?: number) => {
    let s = "";
    if (x1 !== undefined && y1 !== undefined) s += c.lider(x1, y1, sx - 6, y - 4);
    s += c.yazi(sx, y, a, { boy: 12, kalin: 600 });
    if (b) s += c.yazi(sx, y + 14, b, { boy: 11, renk: pal.soluk });
    return s;
  };
  g += etiket(36, "mercek (epoksi kubbe)", "ışığı öne toplar", cx + 24, top + 12);
  g += etiket(82, "bağlantı teli (altın)", "yongayı anota bağlar", cx, 92);
  g += etiket(124, "yonga: ışık burada", `${info.ad}, Vf ≈ ${sayi(info.vf, 1)} V`, kx + 4, 117);
  g += etiket(160, "katot örsü + çanak", "yonga bunun üstünde", kx + 9, 150);
  g += etiket(200, "flanş", "düz kenarı = katot (−)", cx + r + 2, fl + 6);
  g += c.lider(ax + 6, 140, 78, 140) + c.yazi(74, 137, "anot", { boy: 12, kalin: 600, hiza: "end" }) + c.yazi(74, 151, "direği", { boy: 11, renk: pal.soluk, hiza: "end" });
  g += c.lider(kx, 286, kx + 12, 286) + c.yazi(kx + 16, 290, "katot (−): kısa bacak", { boy: 12, kalin: 600 });
  g += c.lider(ax, 320, ax + 12, 320) + c.yazi(ax + 16, 324, "anot (+): uzun bacak", { boy: 12, kalin: 600 });
  if (o.sembol !== false) {
    // şema simgesi: anot üstte, katot altta
    const sx0 = 42;
    g += c.yazi(sx0, 206, "şema simgesi", { boy: 10.5, renk: pal.soluk, hiza: "middle", italik: true });
    g += c.cizgi(sx0, 216, sx0, 232) + c.diyot(sx0, 232, true, yanik ? info.isik : null, 22) + c.cizgi(sx0, 254, sx0, 272);
    g += c.isinlar(sx0 + 12, 238, yanik ? info.isik : pal.soluk);
    g += c.yazi(sx0 - 12, 224, "A", { boy: 11.5, kalin: 700, hiza: "end" }) + c.yazi(sx0 - 12, 270, "K", { boy: 11.5, kalin: 700, hiza: "end" });
    g += c.ok(sx0 - 22, 236, sx0 - 22, 258, pal.akim, 1.4, 6) + c.yazi(sx0 - 26, 251, "I", { boy: 11, hiza: "end", renk: pal.akim, kalin: 700 });
  }
  return { w: 360, h: 334, g };
}

// ---------------------------------------------------------------- kondansatörler

export const SERAMIK_GOVDE = { "104": "#c27632", diger: "#d5a43c" };

/** Disk seramik kondansatör ve kodunun okunuşu */
export function seramikCizimi(kod: string, pal: Palet): Parca {
  const c = cizer(pal);
  const govde = kod === "104" ? SERAMIK_GOVDE["104"] : SERAMIK_GOVDE.diger;
  let g = "";
  g += c.yol("M52,96 L52,110 L44,122 L44,166", { fill: "none", stroke: pal.kalay, "stroke-width": 3.2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  g += c.yol("M88,96 L88,110 L96,122 L96,166", { fill: "none", stroke: pal.kalay, "stroke-width": 3.2, "stroke-linecap": "round", "stroke-linejoin": "round" });
  g += `<ellipse cx="70" cy="58" rx="46" ry="44" fill="${govde}" stroke="#000" stroke-opacity=".3"/>`;
  g += `<ellipse cx="54" cy="40" rx="20" ry="13" fill="#fff" opacity=".2"/>`;
  g += c.yazi(70, 67, kod, { boy: 26, kalin: 700, hiza: "middle", renk: "#2a1608" });
  // okunuş
  const pf = ucHaneliKoduOku(kod);
  const x = 150;
  g += c.yazi(x, 30, kod.slice(0, 2), { boy: 30, kalin: 700, renk: pal.akim, mono: true });
  g += c.yazi(x + 66, 30, kod[2], { boy: 30, kalin: 700, renk: pal.gnd, mono: true });
  g += c.yazi(x, 48, "rakamlar", { boy: 10.5, renk: pal.akim }) + c.yazi(x + 66, 48, "sıfır sayısı", { boy: 10.5, renk: pal.gnd });
  g += c.yazi(x, 78, `${kod.slice(0, 2)} × 10${ust(kod[2])} pF = ${binlik(pf)} pF`, { boy: 13 });
  const uf = pf * 1e-6;
  g += c.yazi(x, 100, `= ${faradMetni(pf * 1e-12)}${uf < 1 ? ` = ${sayi(uf, 3)} µF` : ""}`, { boy: 15, kalin: 700 });
  g += c.yazi(x, 128, "birim hep pF (pikofarad)", { boy: 11, renk: pal.soluk });
  g += c.yazi(x, 144, "kutupsuz: iki yönde de takılır", { boy: 11, renk: pal.soluk });
  return { w: 360, h: 172, g };
}

/** Elektrolitik kondansatör: şerit (−), uzun bacak (+), değer ve gerilim */
export function elektrolitikCizimi(deger: string, volt: number, pal: Palet): Parca {
  const c = cizer(pal);
  let g = "";
  const x0 = 40;
  const x1 = 112;
  g += c.cizgi(60, 150, 60, 238, pal.kalay, 3.2) + c.cizgi(92, 150, 92, 210, pal.kalay, 3.2);
  g += c.kutu(x0 + 6, 146, x1 - x0 - 12, 10, { fill: "#2c2f33", rx: 2 });
  g += c.yol(`M${x0},150 L${x0},30 Q${x0},20 ${x0 + 10},20 L${x1 - 10},20 Q${x1},20 ${x1},30 L${x1},150 Z`, { fill: "#1b2e6b" });
  g += c.cizgi(x0, 38, x1, 38, "#0d1736", 1.4);
  g += c.kutu(92, 21, 20, 129, { fill: "#c9d0da" });
  for (let y = 36; y < 146; y += 26) g += c.kutu(97, y, 10, 3.4, { fill: "#1b2e6b" });
  g += c.kutu(x0, 20, x1 - x0, 6, { fill: "#a9b2bc", rx: 3 });
  g += c.kutu(x0, 26, 12, 124, { fill: "#fff", opacity: 0.12 });
  g += `<text x="66" y="88" transform="rotate(-90 66 88)" text-anchor="middle" font-size="13" font-weight="700" fill="#e8ecf2">${esc(deger)}</text>`;
  g += `<text x="82" y="88" transform="rotate(-90 82 88)" text-anchor="middle" font-size="11" fill="#e8ecf2">${volt} V</text>`;
  const sx = 150;
  g += c.lider(110, 60, sx - 6, 44) + c.yazi(sx, 42, "açık renk şerit = eksi (−)", { boy: 12, kalin: 600 }) + c.yazi(sx, 56, "üstünde − işaretleri", { boy: 11, renk: pal.soluk });
  g += c.lider(74, 116, sx - 6, 96) + c.yazi(sx, 94, `${deger}: sığa`, { boy: 12, kalin: 600 }) + c.yazi(sx, 108, `${volt} V: en yüksek gerilim (hattın ≥ 2 katı)`, { boy: 11, renk: pal.soluk });
  g += c.lider(92, 204, sx - 6, 200) + c.yazi(sx, 204, "kısa bacak: − (GND)", { boy: 12, kalin: 600 });
  g += c.lider(60, 232, sx - 6, 228) + c.yazi(sx, 232, "uzun bacak: + (VCC)", { boy: 12, kalin: 600 });
  g += c.yazi(sx, 160, "Kutupludur: ters takılırsa ısınır,", { boy: 11.5, renk: pal.vurgu, kalin: 600 });
  g += c.yazi(sx, 174, "şişer, patlayabilir.", { boy: 11.5, renk: pal.vurgu, kalin: 600 });
  return { w: 360, h: 246, g };
}

// ---------------------------------------------------------------- direnç dizisi (SIP)

/** SIP direnç dizisi: dışı (nokta, kod) ve iç şeması (ortak bara, n − 1 direnç) */
export function diziCizimi(kod: string, pinler: number, pal: Palet, o: { ortak?: string; hat?: string; ohm?: number } = {}): Parca {
  const c = cizer(pal);
  const W = 360;
  const p = (W - 40) / (pinler - 1 + 0.0001);
  const px = (i: number) => 20 + i * p;
  let g = "";
  // dışı
  g += c.kutu(8, 10, W - 16, 40, { fill: "#1c1e21", rx: 4 });
  g += c.daire(24, 22, 4.2, { fill: "#f2f2ee" });
  g += c.yazi(W / 2, 37, kod, { boy: 19, kalin: 700, hiza: "middle", renk: "#f2f2ee" });
  for (let i = 0; i < pinler; i++) g += c.kutu(px(i) - 3, 50, 6, 14, { fill: pal.kalay });
  g += c.yazi(24, 6, "nokta = 1. bacak (ortak uç)", { boy: 10.5, renk: pal.soluk });
  // iç şema
  const yb = 96;
  g += c.kutu(8, 80, W - 16, 98, { fill: "none", stroke: pal.soluk, "stroke-dasharray": "4 3", rx: 4 });
  g += c.yazi(W - 14, 92, "içi", { boy: 10.5, renk: pal.soluk, hiza: "end", italik: true });
  g += c.cizgi(px(0), yb, px(pinler - 1), yb, pal.cizgi, 2);
  g += c.cizgi(px(0), yb, px(0), 196, pal.cizgi, 1.8);
  for (let i = 1; i < pinler; i++) {
    g += c.nokta(px(i), yb) + c.cizgi(px(i), yb, px(i), 116) + c.direncSema(px(i), 138, true, 40, 12) + c.cizgi(px(i), 158, px(i), 196);
  }
  g += c.nokta(px(0), yb);
  for (let i = 0; i < pinler; i++) g += c.yazi(px(i), 210, String(i + 1), { boy: 11.5, kalin: 700, hiza: "middle", mono: true });
  g += c.yazi(px(0) - 6, 234, o.ortak ?? "ortak", { boy: 11, hiza: "start", renk: pal.vcc, kalin: 600 });
  const orta = (px(1) + px(pinler - 1)) / 2;
  g += c.cizgi(px(1) - 4, 218, px(pinler - 1) + 4, 218, pal.soluk, 0.9) + c.yazi(orta + 50, 234, o.hat ?? `${pinler - 1} sinyal hattı`, { boy: 11, hiza: "middle", renk: pal.soluk });
  const ohm = o.ohm ?? ucHaneliKoduOku(kod.slice(1, 4));
  g += c.yazi(W / 2, 258, `${kod}: A = ortak uçlu dizi · ${kod.slice(1, 3)} × 10${ust(kod[3])} Ω = ${ohmMetni(ohm)} · J = ± %5`, { boy: 11.5, hiza: "middle" });
  return { w: W, h: 276, g: `<g transform="translate(0 10)">${g}</g>` };
}

// ---------------------------------------------------------------- osilatör

/** DIP-14 kılıflı kristal osilatörün üstten görünüşü: sivri köşe ve nokta 1. bacak */
export function osilatorCizimi(frekans: string, pal: Palet): Parca {
  const c = cizer(pal);
  let g = "";
  const x0 = 70;
  const x1 = 290;
  const y0 = 34;
  const y1 = 132;
  const rr = 12;
  const px = (i: number) => 90 + i * 30;
  for (let i = 0; i < 7; i++) {
    const var1 = i === 0 || i === 6;
    for (const [y, h] of [[y1, 12], [y0 - 12, 12]] as const) {
      g += var1 ? c.kutu(px(i) - 4, y, 8, h, { fill: pal.kalay }) : c.daire(px(i), y + h / 2, 2.6, { fill: "none", stroke: pal.ince, "stroke-width": 1.2 });
    }
  }
  g += c.yol(`M${x0},${y1} L${x0},${y0 + rr} Q${x0},${y0} ${x0 + rr},${y0} L${x1 - rr},${y0} Q${x1},${y0} ${x1},${y0 + rr} L${x1},${y1 - rr} Q${x1},${y1} ${x1 - rr},${y1} Z`, {
    fill: "#d9dde2", stroke: "#8d969f", "stroke-width": 1.4,
  });
  g += c.kutu(x0 + 8, y0 + 8, x1 - x0 - 16, y1 - y0 - 16, { fill: "none", stroke: "#b4bcc4", rx: 6 });
  g += c.daire(x0 + 14, y1 - 14, 4, { fill: "#2b3036" });
  g += c.yazi((x0 + x1) / 2, 84, frekans, { boy: 24, kalin: 700, hiza: "middle", renk: "#2b3036" });
  g += c.yazi((x0 + x1) / 2, 104, "MHz", { boy: 13, kalin: 600, hiza: "middle", renk: "#2b3036" });
  g += c.yazi(px(0), 160, "1 EN", { boy: 11.5, kalin: 700, hiza: "middle" }) + c.yazi(px(6), 160, "7 GND", { boy: 11.5, kalin: 700, hiza: "middle", renk: pal.gnd });
  g += c.yazi(px(0), 14, "14 VCC", { boy: 11.5, kalin: 700, hiza: "middle", renk: pal.vcc }) + c.yazi(px(6), 14, "8 OUT", { boy: 11.5, kalin: 700, hiza: "middle", renk: pal.akim });
  g += c.yazi(6, 110, "sivri köşe", { boy: 10.5, renk: pal.soluk }) + c.yazi(6, 123, "ve nokta:", { boy: 10.5, renk: pal.soluk }) + c.yazi(6, 136, "1. bacak", { boy: 10.5, renk: pal.soluk });
  return { w: 360, h: 170, g };
}

// ---------------------------------------------------------------- devreler

export interface LedDevreCizim {
  /** LED'i süren çıkış, ör. "U206.Y0" */
  surucu: string;
  sinyal: string;
  direnc: string;
  ohm: number;
  led: string;
  renk: LedRenk;
  /** sinyal seviyesi: 1 yanar, 0 söner, başka: bilinmiyor (aktif düşükte tersi) */
  seviye?: number;
  /** VCC → direnç → LED → sinyal: çıkış 0 olunca akım çeker ve LED yanar */
  aktifDusuk?: boolean;
}

/** Sinyal → direnç → LED → GND (ya da aktif düşükte VCC → direnç → LED → sinyal), düğüm gerilimleri, akım ve okunuşu */
export function ledDevreCizimi(d: LedDevreCizim, pal: Palet): Parca {
  if (d.aktifDusuk) return ledDevreDusukCizimi(d, pal);
  const c = cizer(pal);
  const info = LED_RENKLERI[d.renk];
  const yanik = d.seviye === 1;
  const I = ledAkimi(VCC, info.vf, d.ohm);
  const y = 66;
  const tel = yanik ? pal.yuksek : c.seviyeRengi(d.seviye);
  let g = "";
  g += c.tampon(18, y, 30) + c.yazi(33, y - 24, d.surucu, { boy: 11.5, kalin: 600, hiza: "middle", mono: true });
  g += c.cizgi(48, y, 104, y, tel, 2) + c.nokta(62, y, tel);
  g += c.yazi(62, y + 22, `${d.sinyal} = ${d.seviye === 0 || d.seviye === 1 ? d.seviye : "?"}`, { boy: 11, hiza: "middle", renk: tel, mono: true, kalin: 600 });
  g += c.yazi(62, y - 8, yanik ? "5 V" : d.seviye === 0 ? "0 V" : "", { boy: 11, hiza: "middle", renk: pal.soluk });
  g += c.direncSema(130, y, false, 52, 16);
  g += c.yazi(130, y - 16, d.direnc, { boy: 11.5, kalin: 600, hiza: "middle", mono: true }) + c.yazi(130, y + 26, ohmMetni(d.ohm), { boy: 11.5, hiza: "middle" });
  g += c.cizgi(156, y, 208, y, yanik ? pal.yuksek : c.seviyeRengi(d.seviye === 1 ? 1 : d.seviye === 0 ? 0 : undefined), 2) + c.nokta(182, y);
  g += c.yazi(182, y - 8, yanik ? `≈ ${sayi(info.vf, 1)} V` : d.seviye === 0 ? "0 V" : "", { boy: 11, hiza: "middle", renk: pal.soluk });
  if (yanik) g += c.daire(222, y, 26, { fill: info.isik, opacity: 0.22 }) + c.daire(222, y, 15, { fill: info.isik, opacity: 0.3 });
  g += c.diyot(208, y, false, yanik ? info.isik : null, 26) + c.isinlar(222, y - 18, yanik ? info.isik : pal.soluk);
  g += c.yazi(222, y - 38, `${d.led} (${info.ad})`, { boy: 11.5, kalin: 600, hiza: "middle" });
  g += c.cizgi(234, y, 292, y, pal.cizgi, 2) + c.cizgi(292, y, 292, y + 36, pal.cizgi, 2) + c.toprak(292, y + 36);
  g += c.yazi(300, y + 64, "GND 0 V", { boy: 11, renk: pal.soluk, hiza: "middle" });
  if (yanik) g += c.ok(70, y - 30, 100, y - 30, pal.akim, 1.8, 7) + c.yazi(85, y - 36, `I ≈ ${akimMetni(I)}`, { boy: 11, renk: pal.akim, kalin: 700, hiza: "middle" });
  // gerilim ölçüleri
  const vy = y + 44;
  const olcu = (a: number, b: number, s: string) =>
    c.cizgi(a, vy - 4, a, vy + 4, pal.soluk, 1) + c.cizgi(b, vy - 4, b, vy + 4, pal.soluk, 1) + c.cizgi(a, vy, b, vy, pal.soluk, 1) + c.yazi((a + b) / 2, vy + 16, s, { boy: 11, hiza: "middle", renk: pal.soluk });
  g += olcu(104, 156, `V_R = ${sayi(VCC - info.vf, 1)} V`) + olcu(206, 236, `Vf ≈ ${sayi(info.vf, 1)} V`);
  g += c.yazi(180, vy + 46, `I = (5 V − ${sayi(info.vf, 1)} V) / ${ohmMetni(d.ohm)} ≈ ${akimMetni(I)}`, { boy: 13.5, kalin: 700, hiza: "middle" });
  const durum = yanik ? `${d.sinyal} = 1: akım akar, LED yanar` : d.seviye === 0 ? `${d.sinyal} = 0: iki uç da 0 V, akım yok, LED sönük` : `${d.sinyal} 1 olunca yanar`;
  g += c.yazi(180, vy + 64, durum, { boy: 11.5, hiza: "middle", renk: yanik ? pal.akim : pal.soluk, kalin: 600 });
  return { w: 360, h: vy + 72, g };
}

/** Aktif düşük LED: VCC → direnç → LED → çıkış; çıkış 0 olunca akımı çeker */
function ledDevreDusukCizimi(d: LedDevreCizim, pal: Palet): Parca {
  const c = cizer(pal);
  const info = LED_RENKLERI[d.renk];
  const yanik = d.seviye === 0;
  const I = ledAkimi(VCC, info.vf, d.ohm);
  const y = 66;
  let g = "";
  g += c.besleme(40, y, "5 V") + c.cizgi(40, y, 104, y, pal.yuksek, 2);
  g += c.direncSema(130, y, false, 52, 16);
  g += c.yazi(130, y - 16, d.direnc, { boy: 11.5, kalin: 600, hiza: "middle", mono: true }) + c.yazi(130, y + 26, ohmMetni(d.ohm), { boy: 11.5, hiza: "middle" });
  // anot düğümü: yanarken ≈ Vf, sönükken 5 V (direnç akım taşımaz)
  g += c.cizgi(156, y, 208, y, yanik || d.seviye === 1 ? pal.yuksek : pal.cizgi, 2) + c.nokta(182, y);
  g += c.yazi(182, y - 8, yanik ? `≈ ${sayi(info.vf, 1)} V` : d.seviye === 1 ? "5 V" : "", { boy: 11, hiza: "middle", renk: pal.soluk });
  if (yanik) g += c.daire(222, y, 26, { fill: info.isik, opacity: 0.22 }) + c.daire(222, y, 15, { fill: info.isik, opacity: 0.3 });
  g += c.diyot(208, y, false, yanik ? info.isik : null, 26) + c.isinlar(222, y - 18, yanik ? info.isik : pal.soluk);
  g += c.yazi(222, y - 38, `${d.led} (${info.ad})`, { boy: 11.5, kalin: 600, hiza: "middle" });
  // katot: sinyal hattı ve onu süren çıkış (üçgen sola bakar, ucu hattta)
  const tel = c.seviyeRengi(d.seviye);
  g += c.cizgi(234, y, 312, y, tel, 2) + c.nokta(270, y, tel);
  g += c.yazi(270, y + 22, `${d.sinyal} = ${d.seviye === 0 || d.seviye === 1 ? d.seviye : "?"}`, { boy: 11, hiza: "middle", renk: tel, mono: true, kalin: 600 });
  g += c.yazi(270, y - 8, d.seviye === 0 ? "0 V" : d.seviye === 1 ? "5 V" : "", { boy: 11, hiza: "middle", renk: pal.soluk });
  g += `<polygon points="${n(342)},${n(y - 15)} ${n(342)},${n(y + 15)} ${n(312)},${n(y)}" fill="none" stroke="${pal.cizgi}" stroke-width="1.8" stroke-linejoin="round"/>`;
  g += c.yazi(327, y - 24, d.surucu, { boy: 11.5, kalin: 600, hiza: "middle", mono: true });
  if (yanik) g += c.ok(52, y - 30, 96, y - 30, pal.akim, 1.8, 7) + c.yazi(74, y - 36, `I ≈ ${akimMetni(I)}`, { boy: 11, renk: pal.akim, kalin: 700, hiza: "middle" });
  // gerilim ölçüleri
  const vy = y + 44;
  const olcu = (a: number, b: number, s: string) =>
    c.cizgi(a, vy - 4, a, vy + 4, pal.soluk, 1) + c.cizgi(b, vy - 4, b, vy + 4, pal.soluk, 1) + c.cizgi(a, vy, b, vy, pal.soluk, 1) + c.yazi((a + b) / 2, vy + 16, s, { boy: 11, hiza: "middle", renk: pal.soluk });
  g += olcu(104, 156, `V_R = ${sayi(VCC - info.vf, 1)} V`) + olcu(206, 236, `Vf ≈ ${sayi(info.vf, 1)} V`);
  g += c.yazi(180, vy + 46, `I = (5 V − ${sayi(info.vf, 1)} V) / ${ohmMetni(d.ohm)} ≈ ${akimMetni(I)}`, { boy: 13.5, kalin: 700, hiza: "middle" });
  const durum = yanik ? `${d.sinyal} = 0: çıkış akımı çeker, LED yanar` : d.seviye === 1 ? `${d.sinyal} = 1: iki uç da 5 V, akım yok, LED sönük` : `aktif düşük: ${d.sinyal} 0 olunca yanar`;
  g += c.yazi(180, vy + 64, durum, { boy: 11.5, hiza: "middle", renk: yanik ? pal.akim : pal.soluk, kalin: 600 });
  return { w: 360, h: vy + 72, g };
}

export interface CekmeCizim {
  yon: "yukari" | "asagi";
  ohm: number;
  /** direncin adı, ör. "R601" ya da "RN401 (8 hat)" */
  ref: string;
  /** çekilen hat */
  hat: string;
  /** hattın alıcısı, ör. "U601.RX" */
  alici?: string;
  seviye?: number;
  /** karşı taraftaki sürücünün açıklaması */
  surucu?: string;
}

/** Çekme direnci: VCC (ya da GND) → direnç → hat → giriş; karşı rayda sürücü (buton ya da çıkış) */
export function cekmeCizimi(d: CekmeCizim, pal: Palet): Parca {
  const c = cizer(pal);
  const yukari = d.yon === "yukari";
  const x = 110;
  const ny = 104;
  const tel = c.seviyeRengi(d.seviye);
  let g = "";
  // direnç tarafı
  if (yukari) {
    g += c.besleme(x, 26) + c.cizgi(x, 26, x, 40) + c.direncSema(x, 62, true, 44, 15) + c.cizgi(x, 84, x, ny, tel, 2);
  } else {
    g += c.cizgi(x, ny, x, 124, tel, 2) + c.direncSema(x, 146, true, 44, 15) + c.cizgi(x, 168, x, 178) + c.toprak(x, 178);
  }
  const ry = yukari ? 62 : 146;
  g += c.yazi(x + 14, ry - 2, d.ref, { boy: 11.5, kalin: 600, mono: true }) + (d.ref === ohmMetni(d.ohm) ? "" : c.yazi(x + 14, ry + 13, ohmMetni(d.ohm), { boy: 11.5 }));
  // karşı taraf: anahtar (buton ya da çıkış)
  const sy0 = yukari ? ny : 22;
  const s = (a: number) => (yukari ? sy0 + a : ny - a);
  if (yukari) g += c.cizgi(x, s(0), x, s(20), tel, 2);
  else g += c.besleme(x, 22, "VCC (5 V)") + c.cizgi(x, 22, x, 40);
  const k1 = yukari ? s(22) : 42;
  const k2 = yukari ? s(52) : 72;
  g += c.daire(x, k1, 2.6, { fill: "none", stroke: pal.cizgi, "stroke-width": 1.5 }) + c.daire(x, k2, 2.6, { fill: "none", stroke: pal.cizgi, "stroke-width": 1.5 });
  g += c.cizgi(x, yukari ? k1 + 2.6 : k1 + 2.6, x + 15, yukari ? k2 - 6 : k2 - 6, pal.cizgi, 1.8);
  if (yukari) g += c.cizgi(x, k2 + 2.6, x, s(66)) + c.toprak(x, s(66));
  else g += c.cizgi(x, k2 + 2.6, x, ny, tel, 2);
  const sur = d.surucu ?? (yukari ? "buton ya da çıkış: 0'a çeker" : "çıkış ya da buton: 1'e çeker");
  g += c.yazi(x + 24, (k1 + k2) / 2 + (yukari ? 14 : -2), sur, { boy: 10.5, renk: pal.soluk });
  // hat ve alıcı
  g += c.nokta(x, ny, tel, 3.2) + c.cizgi(x, ny, 252, ny, tel, 2) + c.tampon(252, ny, 28);
  g += c.yazi(182, ny - 8, d.hat, { boy: 11.5, kalin: 600, hiza: "middle", mono: true, renk: tel === pal.cizgi ? pal.yazi : tel });
  if (d.seviye === 0 || d.seviye === 1 || d.seviye === 2) g += c.yazi(182, ny + 18, `= ${d.seviye === 2 ? "Z" : d.seviye}`, { boy: 11.5, hiza: "middle", mono: true, renk: tel, kalin: 700 });
  if (d.alici) g += c.yazi(266, ny - 22, d.alici, { boy: 11, hiza: "middle", mono: true, renk: pal.soluk });
  g += c.yazi(266, ny + 32, "CMOS giriş", { boy: 10.5, hiza: "middle", renk: pal.soluk });
  const I = VCC / d.ohm;
  g += c.yazi(180, 212, `${yukari ? "0'a" : "1'e"} sürülünce I = 5 V / ${ohmMetni(d.ohm)} = ${akimMetni(I)}`, { boy: 12, kalin: 600, hiza: "middle" });
  g += c.yazi(180, 228, `kimse sürmezken hat ${yukari ? "1" : "0"}: akım yok`, { boy: 11, hiza: "middle", renk: pal.soluk });
  return { w: 360, h: 236, g };
}

/** Boşta (yüzen) CMOS girişi: hat hiçbir yere bağlı değil, seviyesi parazitle oynar */
export function yuzenGirisCizimi(pal: Palet): Parca {
  const c = cizer(pal);
  let g = "";
  const ny = 104;
  g += c.cizgi(84, ny, 252, ny, pal.z, 2, { "stroke-dasharray": "0" }) + c.daire(84, ny, 3.5, { fill: "none", stroke: pal.z, "stroke-width": 1.6 }) + c.tampon(252, ny, 28);
  g += c.yazi(170, ny - 10, "boşta: ?", { boy: 12, kalin: 700, hiza: "middle", renk: pal.z });
  g += c.yazi(266, ny + 32, "CMOS giriş", { boy: 10.5, hiza: "middle", renk: pal.soluk });
  // parazitle oynayan seviye
  const pts: string[] = [];
  for (let i = 0; i <= 48; i++) {
    const t = i / 48;
    const v = 0.5 + 0.38 * Math.sin(t * 17) * Math.sin(t * 5.3 + 1) + 0.08 * Math.sin(t * 61);
    pts.push(`${n(60 + t * 240)},${n(196 - v * 44)}`);
  }
  g += c.cizgi(56, 196, 304, 196, pal.ince, 1) + c.cizgi(56, 152, 304, 152, pal.ince, 1);
  g += c.yazi(52, 156, "1", { boy: 10, hiza: "end", renk: pal.soluk }) + c.yazi(52, 200, "0", { boy: 10, hiza: "end", renk: pal.soluk });
  g += `<polyline points="${pts.join(" ")}" fill="none" stroke="${pal.z}" stroke-width="1.6"/>`;
  g += c.yazi(180, 30, "Direnç yok: giriş yüzer", { boy: 12.5, kalin: 700, hiza: "middle" });
  g += c.yazi(180, 48, "parmak, komşu tel, parazit: 0 mı 1 mi belli değil", { boy: 11, hiza: "middle", renk: pal.soluk });
  g += c.yazi(180, 224, "giriş katı yarı iletimde: akım çeker, çip ısınır", { boy: 12, kalin: 600, hiza: "middle", renk: pal.vurgu });
  g += c.yazi(180, 240, "kural: CMOS girişi asla boşta kalmaz", { boy: 11, hiza: "middle", renk: pal.soluk });
  return { w: 360, h: 248, g };
}

export interface DekuplajCizim {
  cip: string;
  part: string;
  pinSayisi: number;
  vcc: number;
  gnd: number;
  ref: string;
  kod: string;
}

/** Dekuplaj: çipin VCC ve GND bacakları, yanındaki 100 nF, kısa akım döngüsü ve uzun besleme kablosu */
export function dekuplajCizimi(d: DekuplajCizim, pal: Palet): Parca {
  const c = cizer(pal);
  let g = "";
  const yV = 30;
  const yG = 196;
  const sira = d.pinSayisi / 2;
  const pit = Math.min(14, 100 / sira);
  const cx0 = 112;
  const cw = sira * pit + 10;
  const cy0 = 92;
  const ch = 50;
  const pinX = (k: number) => cx0 + 5 + pit / 2 + (k <= sira ? k - 1 : d.pinSayisi - k) * pit;
  const pinUst = (k: number) => k > sira;
  // raylar ve kaynak
  g += c.cizgi(20, yV, 300, yV, pal.vcc, 2.4) + c.cizgi(20, yG, 300, yG, pal.gnd, 2.4);
  g += c.yazi(20, yV - 8, "+5 V rayı", { boy: 11, renk: pal.vcc, kalin: 600 }) + c.yazi(20, yG + 18, "GND rayı", { boy: 11, renk: pal.gnd, kalin: 600 });
  g += c.kutu(304, yV - 6, 44, yG - yV + 12, { fill: "none", stroke: pal.soluk, rx: 6, "stroke-dasharray": "4 3" });
  g += c.yazi(326, (yV + yG) / 2 - 4, "güç", { boy: 11, hiza: "middle", renk: pal.soluk }) + c.yazi(326, (yV + yG) / 2 + 10, "kaynağı", { boy: 11, hiza: "middle", renk: pal.soluk });
  // uzun kablonun endüktansı
  let bobin = `M${248},${yV}`;
  for (let i = 0; i < 4; i++) bobin += ` a6 7 0 0 1 12 0`;
  g += c.kutu(244, yV - 4, 56, 8, { fill: pal.zemin ?? "#0e1217" });
  g += c.yol(bobin, { fill: "none", stroke: pal.vcc, "stroke-width": 2 });
  g += c.yazi(272, yV - 10, "uzun kablo (L)", { boy: 10.5, hiza: "middle", renk: pal.soluk });
  // çip
  for (let k = 1; k <= d.pinSayisi; k++) {
    const x = pinX(k);
    const renk = k === d.vcc ? pal.vcc : k === d.gnd ? pal.gnd : pal.kalay;
    g += c.kutu(x - 3, pinUst(k) ? cy0 - 8 : cy0 + ch, 6, 8, { fill: renk });
  }
  g += c.kutu(cx0, cy0, cw, ch, { fill: "#26292e", rx: 3 });
  g += c.yol(`M${cx0},${cy0 + ch / 2 - 7} A7 7 0 0 1 ${cx0},${cy0 + ch / 2 + 7}`, { fill: "#0b0d10" });
  g += c.yazi(cx0 + cw / 2, cy0 + ch / 2 - 2, d.part, { boy: 12, kalin: 700, hiza: "middle", renk: "#e8ecf2" });
  g += c.yazi(cx0 + cw / 2, cy0 + ch / 2 + 13, d.cip, { boy: 10.5, hiza: "middle", renk: "#aeb6be", mono: true });
  const vx = pinX(d.vcc);
  const gx = pinX(d.gnd);
  const vu = pinUst(d.vcc);
  const gu = pinUst(d.gnd);
  g += c.cizgi(vx, vu ? cy0 - 8 : cy0 + ch + 8, vx, yV, pal.vcc, 2) + c.nokta(vx, yV, pal.vcc);
  g += c.cizgi(gx, gu ? cy0 - 8 : cy0 + ch + 8, gx, yG, pal.gnd, 2) + c.nokta(gx, yG, pal.gnd);
  g += c.yazi(vx + 6, cy0 - 14, `${d.vcc} VCC`, { boy: 10.5, renk: pal.vcc, kalin: 700 });
  g += c.yazi(gx + 6, cy0 + ch + 22, `${d.gnd} GND`, { boy: 10.5, renk: pal.gnd, kalin: 700 });
  // kondansatör, çipin hemen yanında
  const kx = 72;
  g += c.cizgi(kx, yV, kx, 108, pal.vcc, 2) + c.kondSema(kx, 113, true, 24, 10) + c.cizgi(kx, 118, kx, yG, pal.gnd, 2);
  g += c.nokta(kx, yV, pal.vcc) + c.nokta(kx, yG, pal.gnd);
  g += c.yazi(kx - 16, 104, d.ref, { boy: 11, kalin: 600, hiza: "end", mono: true }) + c.yazi(kx - 16, 118, "100 nF", { boy: 11, hiza: "end" }) + c.yazi(kx - 16, 132, `(${d.kod})`, { boy: 10.5, hiza: "end", renk: pal.soluk });
  // kısa akım döngüsü
  const i0 = 10;
  const loop = `M${kx + i0},${108} L${kx + i0},${yV + i0} L${vx - i0},${yV + i0} L${vx - i0},${cy0 - 10} M${gx - i0},${cy0 + ch + 10} L${gx - i0},${yG - i0} L${kx + i0},${yG - i0} L${kx + i0},${122}`;
  g += c.yol(loop, { fill: "none", stroke: pal.akim, "stroke-width": 1.8, "stroke-dasharray": "5 3" });
  g += c.ok(kx + i0, 70, kx + i0, 52, pal.akim) + c.ok(gx - i0 - 30, yG - i0, gx - i0 - 60, yG - i0, pal.akim);
  const lx = cx0 + cw + 10;
  g += c.yazi(lx, cy0 + 8, "kısa döngü:", { boy: 11, kalin: 700, renk: pal.akim }) + c.yazi(lx, cy0 + 22, "darbeyi", { boy: 11, renk: pal.akim }) + c.yazi(lx, cy0 + 36, "100 nF verir", { boy: 11, renk: pal.akim });
  return { w: 360, h: 220, g };
}

/** VCC'nin dekuplajlı ve dekuplajsız görünüşü (osiloskop gibi) */
export function dekuplajDalgaCizimi(pal: Palet): Parca {
  const c = cizer(pal);
  let g = "";
  const kare = (x0: number, baslik: string, zipla: number, renk: string) => {
    let s = c.yazi(x0 + 80, 14, baslik, { boy: 11.5, kalin: 700, hiza: "middle", renk });
    s += c.kutu(x0, 22, 160, 76, { fill: "none", stroke: pal.ince, rx: 4 });
    s += c.cizgi(x0, 44, x0 + 160, 44, pal.ince, 0.8, { "stroke-dasharray": "3 3" });
    const pts: string[] = [];
    for (let i = 0; i <= 160; i += 2) {
      const t = i % 40;
      const dip = t < 10 ? Math.exp(-t / 3) * Math.cos(t * 1.4) : 0;
      pts.push(`${n(x0 + i)},${n(44 + dip * zipla)}`);
    }
    s += `<polyline points="${pts.join(" ")}" fill="none" stroke="${renk}" stroke-width="1.6"/>`;
    s += c.yazi(x0 + 4, 40, "5 V", { boy: 9.5, renk: pal.soluk });
    return s;
  };
  g += kare(10, "100 nF yok", 34, pal.vurgu) + kare(190, "100 nF var", 2.5, pal.gnd);
  g += c.yazi(90, 116, "her kenarda VCC çöker, GND zıplar", { boy: 10.5, hiza: "middle", renk: pal.soluk });
  g += c.yazi(270, 116, "≈ 20 mV: zararsız", { boy: 10.5, hiza: "middle", renk: pal.soluk });
  return { w: 360, h: 124, g };
}

// ---------------------------------------------------------------- tablolar

/** IEC 60062 renk kodu tablosu */
export function renkKoduTablosu(pal: Palet): Parca {
  const c = cizer(pal);
  const satir = 25;
  const kol = [0, 132, 200, 286, 370];
  let g = "";
  const bas = ["renk", "rakam", "çarpan", "tolerans"];
  bas.forEach((b, i) => (g += c.yazi(i ? (kol[i] + kol[i + 1]) / 2 : 8, 16, b, { boy: 11.5, kalin: 700, hiza: i ? "middle" : "start", renk: pal.soluk })));
  g += c.cizgi(0, 24, kol[4], 24, pal.ince, 1);
  RENK_KODU.forEach((r, i) => {
    const y = 28 + i * satir;
    if (i % 2) g += c.kutu(0, y, kol[4], satir, { fill: pal.ince, opacity: 0.35 });
    g += c.kutu(4, y + 3, 122, satir - 6, { fill: r.hex, rx: 3, stroke: "#000", "stroke-opacity": 0.2 });
    g += c.yazi(14, y + 17, r.ad, { boy: 12, kalin: 600, renk: r.yazi });
    const m = (k: number, s: string) => (g += c.yazi((kol[k] + kol[k + 1]) / 2, y + 17, s, { boy: 12.5, hiza: "middle", mono: true, kalin: 600 }));
    m(1, r.rakam === undefined ? "–" : String(r.rakam));
    m(2, r.us === undefined ? "–" : carpanMetni(r.us).replace("× ", "×"));
    m(3, r.tolerans === undefined ? "–" : `±%${sayi(r.tolerans)}`);
  });
  return { w: kol[4], h: 28 + RENK_KODU.length * satir + 4, g };
}

/** LED renkleri: ileri gerilim, dalga boyu, 330 Ω ile akım, kartta nerede */
export function ledRenkTablosu(pal: Palet, kartta: Partial<Record<LedRenk, string>>, ohm = 330): Parca {
  const c = cizer(pal);
  const satir = 26;
  const kol = [0, 144, 222, 304, 382, 640];
  let g = "";
  ["renk", "Vf", "dalga boyu", `I (${ohmMetni(ohm)})`, "bu bilgisayarda"].forEach((b, i) => (g += c.yazi(kol[i] + (i ? 4 : 30), 16, b, { boy: 11.5, kalin: 700, renk: pal.soluk })));
  g += c.cizgi(0, 24, kol[5], 24, pal.ince, 1);
  (Object.keys(LED_RENKLERI) as LedRenk[]).forEach((k, i) => {
    const r = LED_RENKLERI[k];
    const y = 28 + i * satir;
    if (i % 2) g += c.kutu(0, y, kol[5], satir, { fill: pal.ince, opacity: 0.35 });
    g += c.daire(14, y + 13, 7.5, { fill: r.isik, stroke: ton(r.govde, -0.2), "stroke-width": 1.2 });
    g += c.yazi(30, y + 17, r.ad, { boy: 12, kalin: 600 });
    g += c.yazi(kol[1] + 4, y + 17, `${r.vfAralik[0].toFixed(1).replace(".", ",")}–${r.vfAralik[1].toFixed(1).replace(".", ",")} V`, { boy: 12, mono: true });
    g += c.yazi(kol[2] + 4, y + 17, r.dalga ? `${r.dalga} nm` : "geniş", { boy: 12, mono: true });
    g += c.yazi(kol[3] + 4, y + 17, akimMetni(ledAkimi(VCC, r.vf, ohm)), { boy: 12, mono: true });
    g += c.yazi(kol[4] + 4, y + 17, kartta[k] ?? "–", { boy: 11.5, renk: kartta[k] ? pal.yazi : pal.soluk });
  });
  return { w: kol[5], h: 28 + Object.keys(LED_RENKLERI).length * satir + 4, g };
}

// ---------------------------------------------------------------- breadboard

const BB = 15;

/** Breadboard parçası: sütun (1..) ve satır adından (+, −, a..j) koordinat */
function tahta(pal: Palet, sutun: number, satirlar: string[], x0: number, y0: number) {
  const c = cizer(pal);
  const ys: Record<string, number> = {};
  let y = y0 + 16;
  for (const s of satirlar) {
    if (s === "|") {
      y += BB * 1.4;
      continue;
    }
    if (s === "_") {
      y += BB * 0.6;
      continue;
    }
    ys[s] = y;
    y += BB;
  }
  const h = y - y0 + 2;
  const w = sutun * BB + 30;
  const X = (k: number) => x0 + 18 + (k - 1) * BB;
  const Y = (s: string) => ys[s];
  let g = c.kutu(x0, y0, w, h, { fill: pal.tahta, rx: 6, stroke: pal.ince });
  for (const s of Object.keys(ys)) {
    const ray = /[+−]/.test(s);
    if (ray) g += c.cizgi(x0 + 8, Y(s) + (s.includes("+") ? -7 : 7), x0 + w - 8, Y(s) + (s.includes("+") ? -7 : 7), s.includes("+") ? pal.vcc : pal.gnd, 1.4);
    for (let k = 1; k <= sutun; k++) {
      if (ray && k % 6 === 0) continue;
      g += c.kutu(X(k) - 2.6, Y(s) - 2.6, 5.2, 5.2, { fill: pal.delik, rx: 1 });
    }
    if (!ray) g += c.yazi(x0 + 7, Y(s) + 3.5, s, { boy: 8.5, renk: pal.soluk, hiza: "middle" });
  }
  // orta kanal
  const ust = Object.keys(ys).filter((s) => /[f-j]/.test(s));
  const alt = Object.keys(ys).filter((s) => /[a-e]/.test(s));
  if (ust.length && alt.length) {
    const yk = (Math.max(...ust.map(Y)) + Math.min(...alt.map(Y))) / 2;
    g += c.kutu(x0 + 4, yk - 3, w - 8, 6, { fill: pal.delik, opacity: 0.45, rx: 3 });
  }
  return { g, X, Y, w, h };
}

/** Bacak: delikte kalay nokta */
const bacak = (pal: Palet, x: number, y: number) => `<circle cx="${n(x)}" cy="${n(y)}" r="2.6" fill="${pal.kalay}" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>`;

/** Atlama kablosu: hafif kavisli, uçları delikte */
function kablo(pal: Palet, x1: number, y1: number, x2: number, y2: number, renk: string, kavis = 8): string {
  const mx = (x1 + x2) / 2;
  const my = (y1 + y2) / 2;
  const dx = x2 - x1;
  const dy = y2 - y1;
  const L = Math.hypot(dx, dy) || 1;
  const cx = mx - (dy / L) * kavis;
  const cy = my + (dx / L) * kavis;
  return `<path d="M${n(x1)},${n(y1)} Q${n(cx)},${n(cy)} ${n(x2)},${n(y2)}" fill="none" stroke="${renk}" stroke-width="3.6" stroke-linecap="round"/>` + bacak(pal, x1, y1) + bacak(pal, x2, y2);
}

/** Direnç (üstten): iki delik arasında renk bantlı küçük gövde */
function bbDirenc(pal: Palet, x1: number, y1: number, x2: number, y2: number, ohm: number): string {
  const bantlar = direncBantlari(ohm, 5);
  const a = (Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI;
  const L = Math.hypot(x2 - x1, y2 - y1);
  const bl = Math.min(32, L - 10);
  let g = `<line x1="${n(x1)}" y1="${n(y1)}" x2="${n(x2)}" y2="${n(y2)}" stroke="${pal.kalay}" stroke-width="2"/>`;
  g += `<g transform="translate(${n((x1 + x2) / 2)} ${n((y1 + y2) / 2)}) rotate(${n(a)})">`;
  g += `<rect x="${n(-bl / 2)}" y="-5.5" width="${n(bl)}" height="11" rx="5" fill="${DIRENC_GOVDE.karbon}" stroke="#000" stroke-opacity=".35" stroke-width=".8"/>`;
  const xs = [-bl / 2 + 6, -bl / 2 + 11, -bl / 2 + 16, bl / 2 - 6];
  bantlar.forEach((b, i) => (g += `<rect x="${n(xs[i] - 1.6)}" y="-5.5" width="3.2" height="11" fill="${b.hex}"/>`));
  g += "</g>";
  return g + bacak(pal, x1, y1) + bacak(pal, x2, y2);
}

/** Breadboard üstünde okunan etiket: zemin renginde hale */
function not(pal: Palet, x: number, y: number, s: string, hiza: "start" | "middle" | "end" = "start", renk?: string): string {
  return `<text${oz({ x, y, "font-size": 11, "font-weight": 600, fill: renk ?? pal.yazi, "text-anchor": hiza === "start" ? undefined : hiza, stroke: pal.tahta, "stroke-width": 3, "paint-order": "stroke", "stroke-linejoin": "round" })}>${esc(s)}</text>`;
}

/** Disk seramik (üstten): iki bacağın ortasında */
function bbSeramik(pal: Palet, x1: number, y1: number, x2: number, y2: number): string {
  const cx = (x1 + x2) / 2;
  const cy = (y1 + y2) / 2;
  return bacak(pal, x1, y1) + bacak(pal, x2, y2) +
    `<ellipse cx="${n(cx)}" cy="${n(cy)}" rx="11" ry="8.5" fill="${SERAMIK_GOVDE["104"]}" stroke="#000" stroke-opacity=".35"/>` +
    `<text x="${n(cx)}" y="${n(cy + 3)}" font-size="8" font-weight="700" text-anchor="middle" fill="#2a1608">104</text>`;
}

/** Elektrolitik (üstten): lacivert daire, eksi tarafında açık renk dilim */
function bbElektrolitik(pal: Palet, xp: number, yp: number, xm: number, ym: number): string {
  const cx = (xp + xm) / 2;
  const cy = (yp + ym) / 2;
  const a = Math.atan2(ym - yp, xm - xp);
  const r = 12;
  const p = (t: number) => `${n(cx + r * Math.cos(a + t))},${n(cy + r * Math.sin(a + t))}`;
  return bacak(pal, xp, yp) + bacak(pal, xm, ym) +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="${r}" fill="#1b2e6b" stroke="#000" stroke-opacity=".35"/>` +
    `<path d="M${p(-0.95)} A${r} ${r} 0 0 1 ${p(0.95)} Z" fill="#c9d0da"/>` +
    `<circle cx="${n(cx)}" cy="${n(cy)}" r="6" fill="none" stroke="#9aa3ad" stroke-width="1.2"/>`;
}

/** 3 mm LED (üstten): bacaklar deliklerde, gövde (dx, dy) kaydırılmış; düz kenar katot tarafında */
function bbLed(pal: Palet, xa: number, ya: number, xk: number, yk: number, dx: number, dy: number, renk: LedRenk, yanik: boolean): string {
  const c = cizer(pal);
  const info = LED_RENKLERI[renk];
  const cx = (xa + xk) / 2 + dx;
  const cy = (ya + yk) / 2 + dy;
  const r = 10.5;
  let g = c.cizgi(xa, ya, cx - 3.5, cy, pal.kalay, 1.8) + c.cizgi(xk, yk, cx + 3.5, cy, pal.kalay, 1.8);
  g += bacak(pal, xa, ya) + bacak(pal, xk, yk);
  if (yanik) g += `<circle cx="${n(cx)}" cy="${n(cy)}" r="22" fill="${info.isik}" opacity=".22"/>`;
  // flanş: sağda (katot) düz
  const fx = r * 0.8;
  const fy = Math.sqrt(r * r - fx * fx);
  g += `<path d="M${n(cx + fx)},${n(cy - fy)} A${r} ${r} 0 1 0 ${n(cx + fx)},${n(cy + fy)} Z" fill="${yanik ? info.isik : info.govde}" fill-opacity=".85" stroke="${ton(info.govde, -0.25)}" stroke-width="1.2"/>`;
  g += `<circle cx="${n(cx - 1)}" cy="${n(cy)}" r="7" fill="${yanik ? "#ffffff" : info.isik}" opacity="${yanik ? 0.55 : 0.35}"/>`;
  return g;
}

/** Üç breadboard yerleşimi: LED + seri direnç, dekuplaj, çekme direnci + buton */
export function breadboardCizimi(pal: Palet): Parca {
  const c = cizer(pal);
  let g = "";
  const M = 70;
  const metin = (x: number, y: number, satirlar: string[]) =>
    satirlar.map((s, i) => c.yazi(x, y + i * 17, s, { boy: i ? 12 : 13.5, kalin: i ? undefined : 700, renk: i ? pal.soluk : pal.yazi })).join("");
  const led = LED_RENKLERI.mavi;
  const tx = M + 16 * BB + 30 + 30;
  const KAB = { sinyal: "#e6b422", gnd: "#30343a" };

  // 1) LED + 330 Ω: üst yarı (raylar + j..f)
  const y1 = 12;
  {
    const t = tahta(pal, 16, ["+", "−", "_", "j", "i", "h", "g", "f"], M, y1);
    g += t.g;
    // aynı sütundaki 5 delik içeride bağlı
    g += c.kutu(t.X(9) - 7, t.Y("j") - 7, 14, t.Y("f") - t.Y("j") + 14, { fill: "none", stroke: pal.akim, "stroke-width": 1.4, rx: 6, "stroke-dasharray": "3 2" });
    g += kablo(pal, M - 54, t.Y("h"), t.X(3), t.Y("h"), KAB.sinyal, 0);
    g += bbDirenc(pal, t.X(3), t.Y("j"), t.X(9), t.Y("j"), 330);
    g += bbLed(pal, t.X(9), t.Y("f"), t.X(10), t.Y("f"), 0, -(t.Y("f") - t.Y("h")) * 0.62, "mavi", true);
    g += kablo(pal, t.X(10), t.Y("j"), t.X(10), t.Y("−"), KAB.gnd, 0);
    g += not(pal, M - 56, t.Y("h") - 10, "74HC çıkışı");
    g += not(pal, t.X(6), t.Y("i") + 4, "330 Ω", "middle");
    g += not(pal, t.X(9) - 6, t.Y("f") + 18, "+ anot", "end", pal.vcc);
    g += not(pal, t.X(10) + 6, t.Y("f") + 18, "katot −", "start", pal.gnd);
    g += not(pal, t.X(11) + 4, t.Y("g") - 2, "LED", "start");
    g += metin(tx, y1 + 18, [
      "1 · LED ve seri direnç",
      "Sinyal teli 3. sütuna; 330 Ω 3 ile 9 arasında.",
      "LED'in uzun bacağı (anot) 9'a, direncin sütununa;",
      "kısa bacağı (katot, flanşın düz kenarı) 10'a.",
      "10'dan siyah kablo GND rayına (−).",
      "Kesikli çerçeve: bir sütunun 5 deliği içeride bağlı.",
      `${led.ad} LED: (5 − ${sayi(led.vf, 1)}) V / 330 Ω ≈ ${akimMetni(ledAkimi(VCC, led.vf, 330))}`,
    ]);
  }

  // 2) dekuplaj: tam yükseklik, 74HC00 ortada
  const y2 = y1 + 132 + 46;
  {
    const t = tahta(pal, 16, ["+", "−", "_", "j", "i", "h", "g", "f", "|", "e", "d", "c", "b", "a", "_", "+ ", "− "], M, y2);
    g += t.g;
    const c0 = 6;
    const yu = t.Y("f");
    const ya = t.Y("e");
    for (let k = 0; k < 7; k++) g += bacak(pal, t.X(c0 + k), yu) + bacak(pal, t.X(c0 + k), ya);
    g += c.kutu(t.X(c0) - 7, yu + 3, 6 * BB + 14, ya - yu - 6, { fill: "#26292e", rx: 2 });
    g += c.yol(`M${n(t.X(c0) - 7)},${n((yu + ya) / 2 - 5)} A5 5 0 0 1 ${n(t.X(c0) - 7)},${n((yu + ya) / 2 + 5)}`, { fill: "#0b0d10" });
    g += c.yazi(t.X(c0 + 3), (yu + ya) / 2 + 4, "74HC00", { boy: 10.5, kalin: 700, hiza: "middle", renk: "#e8ecf2" });
    // VCC (14) üst sol, GND (7) alt sağ
    g += kablo(pal, t.X(c0), t.Y("i"), t.X(c0), t.Y("+"), pal.vcc, 4);
    g += kablo(pal, t.X(c0 + 6), t.Y("b"), t.X(c0 + 6), t.Y("− "), KAB.gnd, -5);
    // 100 nF üst raylar arasında, VCC bacağının hemen yanında; 100 µF rayın ucunda
    g += bbSeramik(pal, t.X(c0 - 2), t.Y("+"), t.X(c0 - 1), t.Y("−"));
    g += bbElektrolitik(pal, t.X(15), t.Y("+"), t.X(15), t.Y("−"));
    // rayları sol uçta birleştir
    g += kablo(pal, t.X(1), t.Y("+"), t.X(1), t.Y("+ "), pal.vcc, 66) + kablo(pal, t.X(2), t.Y("−"), t.X(2), t.Y("− "), KAB.gnd, 62);
    g += c.lider(t.X(c0 - 1.5), t.Y("+") - 4, t.X(c0 - 1.5) - 30, y2 - 8) + not(pal, t.X(c0 - 1.5) - 34, y2 - 10, "100 nF (104)", "end");
    g += c.lider(t.X(15), t.Y("+") - 6, t.X(15) - 26, y2 - 8) + not(pal, t.X(15) - 30, y2 - 10, "100 µF, şerit − rayında", "end");
    g += not(pal, t.X(c0) + 8, t.Y("h") + 4, "14 VCC", "start", pal.vcc);
    g += not(pal, t.X(c0 + 6) - 8, t.Y("c") + 4, "GND 7", "end", pal.gnd);
    g += metin(tx, y2 + 18, [
      "2 · Dekuplaj: her entegreye 100 nF",
      "74HC00: VCC 14 (sol üst), GND 7 (sağ alt).",
      "100 nF (104) iki üst ray arasında, VCC bacağının",
      "hemen yanında; bacaklarını kısa kes.",
      "Rayın ucunda 100 µF: şeritli bacak − rayına.",
      "Üst ve alt rayları uçtan birbirine bağla; uzun",
      "breadboard'larda raylar ortadan bölünebilir.",
    ]);
  }

  // 3) çekme direnci ve buton: alt yarı (e..a + raylar)
  const y3 = y2 + 267 + 46;
  {
    const t = tahta(pal, 16, ["e", "d", "c", "b", "a", "_", "+", "−"], M, y3);
    g += t.g;
    g += kablo(pal, M - 54, t.Y("e"), t.X(5), t.Y("e"), KAB.sinyal, 0);
    g += bbDirenc(pal, t.X(5), t.Y("b"), t.X(2), t.Y("+"), 10000);
    const bx = (t.X(5) + t.X(8)) / 2;
    g += bacak(pal, t.X(5), t.Y("c")) + bacak(pal, t.X(8), t.Y("c"));
    g += c.kutu(bx - 19, t.Y("c") - 14, 38, 28, { fill: "#2a2d32", rx: 3, stroke: "#000", "stroke-opacity": 0.4 });
    g += c.daire(bx, t.Y("c"), 8, { fill: "#4b5058", stroke: "#000", "stroke-opacity": 0.4 });
    g += kablo(pal, t.X(8), t.Y("a"), t.X(8), t.Y("−"), KAB.gnd, -6);
    g += not(pal, M - 56, t.Y("e") - 10, "74HC14 girişi");
    g += not(pal, t.X(1) - 2, t.Y("−") + 24, "10 kΩ", "start");
    g += not(pal, bx + 24, t.Y("d") + 4, "buton", "start");
    g += metin(tx, y3 + 18, [
      "3 · Çekme direnci ve buton",
      "Giriş teli 5. sütunda; 10 kΩ + rayından 5'e:",
      "buton bırakılınca giriş 1 (yukarı çekme).",
      "Buton 5 ile 8 arasında, 8'den GND rayına:",
      "basınca giriş 0, dirençten 0,5 mA akar.",
      "Direnci unutma: buton bırakılınca giriş",
      "hiçbir yere bağlı kalmaz (yüzen giriş).",
    ]);
  }
  return { w: tx + 360, h: y3 + 132 + 30, g };
}
