// Mimari diyagramının sahnesi: tanım (model.ts) + devre → konumlu çizim öğeleri. Uygulama
// (src/mimari, React) ve belge çıktısı (svg.ts, düz SVG) aynı sahneyi çizer; ikisi birbirinden
// ayrılmaz. Renkler sınıf adlarıyla verilir (mm-k-register, mm-y-veri …): uygulamada temanın
// belirteçleri, çıktıda açık temanın değerleri.
//
// Yazıların genişliği yazı tipinin (IBM Plex Sans / Mono) ortalama harf genişlikleriyle tahmin edilir
// (yedek yazı tipleri için %5 paylı); kutuya sığmayan satırlar `hatalar`a yazılır (testler boş
// olmasını ister). Sahne iki dilde kurulur: kutu ve yol metinleri diyagramdan, ortak olanlar (lejant,
// "+ N kapı", "N entegre", "ayrıntı ›") burada dile göre; denetim iki dilde de koşar.

import {
  adet, buyuk, cevirici, cipSayimi, Devre, kutuParcalari, pasifSayimi, sayimMetni, yolEtiketMetni,
  type BlokKimligi, type Dil, type Diyagram, type Grup, type KutuRolu, type Nokta, type Yol, type YolTuru,
} from "./model.ts";

// ---------------------------------------------------------------- ölçüler

/** Yazı boyları (diyagram birimi = ekranda 1:1 piksel) */
export const YAZI = {
  baslik: 26,
  altBaslik: 15,
  ad: 15,
  bolmeAd: 13.5,
  parca: 12.5,
  gorev: 12.5,
  kapi: 12,
  grupAd: 15,
  grupEk: 13,
  etiket: 12.5,
  bag: 12,
  lejBaslik: 13,
  lej: 12.5,
} as const;

const SATIR = { ad: 18, bolmeAd: 16, parca: 16, gorev: 16, kapi: 15 } as const;
const PAY = { x: 10, y: 8 } as const;
/** Başlık çubuğunun yüksekliği */
export const BASLIK_H = 56;

/** Yol çizgisinin kalınlığı: taşıdığı net sayısına göre */
export const yolKalinligi = (n: number): number => (n >= 8 ? 5.5 : n >= 2 ? 3.5 : 2.2);

// IBM Plex Sans'ın yaklaşık harf genişlikleri (1000 birim / em)
const GENIS: Record<string, number> = {
  A: 636, B: 632, C: 640, D: 682, E: 568, F: 538, G: 680, H: 694, I: 272, J: 488, K: 622, L: 524, M: 822, N: 700, O: 718,
  P: 600, Q: 718, R: 620, S: 574, T: 568, U: 680, V: 628, W: 924, X: 620, Y: 590, Z: 570,
  a: 540, b: 588, c: 516, d: 588, e: 556, f: 334, g: 538, h: 584, i: 248, j: 248, k: 520, l: 270, m: 880, n: 584, o: 576,
  p: 588, q: 588, r: 370, s: 488, t: 352, u: 584, v: 506, w: 788, x: 504, y: 506, z: 466,
  " ": 240, ".": 250, ",": 250, ":": 250, ";": 250, "'": 230, "’": 230, "(": 330, ")": 330, "-": 390, "–": 560, "—": 900,
  "/": 390, "×": 600, "+": 600, "=": 600, "~": 600, "·": 260, "→": 760, "←": 760, "↔": 900, "%": 860, "&": 680, "|": 260,
};
const TR: Record<string, string> = { Ç: "C", Ğ: "G", İ: "I", Ö: "O", Ş: "S", Ü: "U", ç: "c", ğ: "g", ı: "i", ö: "o", ş: "s", ü: "u", Â: "A", â: "a" };

/** Yazının tahmini genişliği (diyagram birimi) */
export function metinGenisligi(m: string, boyut: number, tur: "sans" | "kalin" | "mono"): number {
  if (tur === "mono") return [...m].length * 0.6 * boyut;
  let t = 0;
  for (const ch of m) {
    const c = TR[ch] ?? ch;
    t += GENIS[c] ?? (/[0-9]/.test(c) ? 600 : /[A-Z]/.test(c) ? 640 : /[a-z]/.test(c) ? 540 : 620);
  }
  // %5 pay: IBM Plex gelmezse yerine geçen yazı tipleri (DejaVu Sans, Segoe UI) biraz daha geniş
  return (t / 1000) * boyut * (tur === "kalin" ? 1.06 : 1) * 1.05;
}

/** Sözcükleri genişliğe göre satırlara böl (ayraç: boşluk; parça listesinde ", ") */
export function satirlaraBol(parcalar: string[], ayrac: string, genislik: number, olc: (s: string) => number): string[] {
  const satirlar: string[] = [];
  let cur = "";
  for (const p of parcalar) {
    const aday = cur ? `${cur}${ayrac}${p}` : p;
    // satır sonunda ayraç kalırsa (", " → ",") o da sığmalı
    if (!cur || olc(aday + ayrac.trimEnd()) <= genislik) cur = aday;
    else {
      satirlar.push(cur + ayrac.trimEnd());
      cur = p;
    }
  }
  if (cur) satirlar.push(cur);
  return satirlar;
}

// ---------------------------------------------------------------- sahne türleri

export type MetinSinifi =
  | "baslik" | "alt-baslik" | "ad" | "bolme-ad" | "parca" | "pasif" | "kapi" | "gorev"
  | "grup-ad" | "grup-ek" | "grup-link" | "etiket" | "bag" | "lej-baslik" | "lej" | "lej-kisa";

export interface SMetin {
  x: number;
  y: number;
  m: string;
  s: MetinSinifi;
  hiza?: "start" | "middle" | "end";
  /** -90° döndürülmüş (aşağıdan yukarı okunur) */
  dikey?: boolean;
}

export interface SKutu {
  id: string;
  rol: KutuRolu;
  x: number;
  y: number;
  w: number;
  h: number;
  cihaz: boolean;
  bolmeler: { x: number; y: number; w: number; h: number }[];
  metinler: SMetin[];
  /** başka diyagrama gider */
  ayrinti?: string;
}

export interface SGrup {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
  metinler: SMetin[];
  ayrinti?: string;
  sade: boolean;
}

export interface SCizgi {
  d: string;
  /** halenin yolu (dallanma ucunda kısaltılmış; verilmezse d) */
  hale?: string;
  /** çizginin değdiği kutu (gövdede yok) */
  kutu?: string;
  /** gövde çizgisi (önce çizilir: kollar gövdelerin üstünden geçer) */
  govde?: boolean;
}

export interface SYol {
  id: string;
  tur: YolTuru;
  w: number;
  cizgiler: SCizgi[];
  oklar: { d: string; kutu?: string }[];
  noktalar: { x: number; y: number; r: number }[];
  etiketler: SMetin[];
  baglayicilar: { x: number; y: number; w: number; h: number; metin: SMetin }[];
}

export interface Sahne {
  id: string;
  w: number;
  h: number;
  baslik: SMetin[];
  gruplar: SGrup[];
  kutular: SKutu[];
  yollar: SYol[];
  lejant: {
    x: number;
    y: number;
    w: number;
    h: number;
    cizgiler: { d: string; tur: YolTuru; w: number }[];
    kutucuklar: { x: number; y: number; w: number; h: number; rol: KutuRolu }[];
    metinler: SMetin[];
  };
  /** yerleşim hataları: sığmayan yazı, boşta kalan yol ucu (testler boş ister) */
  hatalar: string[];
}

// ---------------------------------------------------------------- adlar (lejant ve yan panel)

export const YOL_TURU_ADI: Record<YolTuru, { tr: string; en: string }> = {
  veri: { tr: "Veri yolu", en: "Data bus" },
  adres: { tr: "Adres yolu", en: "Address bus" },
  kontrol: { tr: "Kontrol hatları", en: "Control lines" },
  saat: { tr: "Saat ve reset", en: "Clock and reset" },
  yerel: { tr: "Yerel bağlantı", en: "Local link" },
  dis: { tr: "Dış bağlantı", en: "External link" },
};

export const KUTU_ROLU_ADI: Record<KutuRolu, { tr: string; en: string }> = {
  register: { tr: "Register, sayaç", en: "Register, counter" },
  islem: { tr: "İşlem birimi", en: "Processing unit" },
  secici: { tr: "Seçici, kod çözücü", en: "Selector, decoder" },
  tampon: { tr: "Tampon, alıcı-verici", en: "Buffer, transceiver" },
  bellek: { tr: "Bellek (ROM, RAM)", en: "Memory (ROM, RAM)" },
  kontrol: { tr: "Kontrol, zamanlama", en: "Control, timing" },
  gc: { tr: "Giriş / çıkış, bağlantı", en: "I/O, connection" },
  not: { tr: "Not", en: "Note" },
};

// ---------------------------------------------------------------- geometri

const yakin = (a: number, b: number) => Math.abs(a - b) < 0.6;
const P = (n: number) => Math.round(n * 10) / 10;
const yolD = (pts: readonly Nokta[]) => pts.map(([x, y], i) => `${i ? "L" : "M"}${P(x)} ${P(y)}`).join(" ");

type Dikdortgen = { x: number; y: number; w: number; h: number };

/** Nokta dikdörtgenin kenarında mı */
function kenarda([x, y]: Nokta, r: Dikdortgen): boolean {
  const icX = x >= r.x - 0.6 && x <= r.x + r.w + 0.6;
  const icY = y >= r.y - 0.6 && y <= r.y + r.h + 0.6;
  return ((yakin(x, r.x) || yakin(x, r.x + r.w)) && icY) || ((yakin(y, r.y) || yakin(y, r.y + r.h)) && icX);
}

/** Nokta çizginin üstünde mi (uçlar dahil) */
function cizgide([x, y]: Nokta, pts: readonly Nokta[]): boolean {
  for (let i = 1; i < pts.length; i++) {
    const [ax, ay] = pts[i - 1];
    const [bx, by] = pts[i];
    if (yakin(ax, bx) && yakin(x, ax) && y >= Math.min(ay, by) - 0.6 && y <= Math.max(ay, by) + 0.6) return true;
    if (yakin(ay, by) && yakin(y, ay) && x >= Math.min(ax, bx) - 0.6 && x <= Math.max(ax, bx) + 0.6) return true;
  }
  return false;
}

/** İki dik açılı çizginin kesişme ve değme noktaları */
function kesisimler(a: readonly Nokta[], b: readonly Nokta[]): Nokta[] {
  const out: Nokta[] = [];
  for (let i = 1; i < a.length; i++) {
    for (let j = 1; j < b.length; j++) {
      const [a0, a1, b0, b1] = [a[i - 1], a[i], b[j - 1], b[j]];
      const aYatay = yakin(a0[1], a1[1]);
      const bYatay = yakin(b0[1], b1[1]);
      if (aYatay === bYatay) continue;
      const [h0, h1, v0, v1] = aYatay ? [a0, a1, b0, b1] : [b0, b1, a0, a1];
      const x = v0[0];
      const y = h0[1];
      const icinde = (d: number, u: number, v: number) => d >= Math.min(u, v) - 0.6 && d <= Math.max(u, v) + 0.6;
      if (icinde(x, h0[0], h1[0]) && icinde(y, v0[1], v1[1])) out.push([x, y]);
    }
  }
  return out;
}

/** Ok başı: ucu `uc`ta, `yon` birim vektörü yönünde */
function okBasi(uc: Nokta, yon: Nokta, w: number): string {
  const L = 8 + 1.5 * w;
  const H = 4 + 0.85 * w;
  const [x, y] = uc;
  const [dx, dy] = yon;
  const bx = x - dx * L;
  const by = y - dy * L;
  return `M${P(x)} ${P(y)} L${P(bx - dy * H)} ${P(by + dx * H)} L${P(bx + dy * H)} ${P(by - dx * H)} Z`;
}
const okBoyu = (w: number) => 8 + 1.5 * w;

function birim(a: Nokta, b: Nokta): Nokta {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const l = Math.hypot(dx, dy) || 1;
  return [dx / l, dy / l];
}

/** Çizginin ucunu `k` kadar kısalt (ok başının altında çizgi görünmesin) */
function kisalt(pts: Nokta[], bastan: number, sondan: number): Nokta[] {
  const out = pts.map((p) => [p[0], p[1]] as [number, number]);
  if (sondan > 0 && out.length >= 2) {
    const n = out.length;
    const [dx, dy] = birim(out[n - 2], out[n - 1]);
    out[n - 1] = [out[n - 1][0] - dx * sondan, out[n - 1][1] - dy * sondan];
  }
  if (bastan > 0 && out.length >= 2) {
    const [dx, dy] = birim(out[1], out[0]);
    out[0] = [out[0][0] - dx * bastan, out[0][1] - dy * bastan];
  }
  return out;
}

// ---------------------------------------------------------------- kutu içeriği

interface Icerik {
  satirlar: { m: string; s: MetinSinifi; boy: number; yuk: number; tur: "sans" | "kalin" | "mono" }[];
}

/** Bir kutunun ya da bölmenin yazıları: ad, parçalar, pasifler, kapılar, görev */
function icerik(ad: string, parcaMetinleri: string[], pasifMetinleri: string[], kapi: number, gorev: string, genislik: number, bolme: boolean, dil: Dil): Icerik {
  const satirlar: Icerik["satirlar"] = [];
  const adBoy = bolme ? YAZI.bolmeAd : YAZI.ad;
  const adOlc = (s: string) => metinGenisligi(s, adBoy, "kalin");
  for (const m of satirlaraBol(ad.split(" "), " ", genislik, adOlc)) satirlar.push({ m, s: bolme ? "bolme-ad" : "ad", boy: adBoy, yuk: bolme ? SATIR.bolmeAd : SATIR.ad, tur: "kalin" });
  if (parcaMetinleri.length) {
    const olc = (s: string) => metinGenisligi(s, YAZI.parca, "mono");
    for (const m of satirlaraBol(parcaMetinleri, ", ", genislik, olc)) satirlar.push({ m, s: "parca", boy: YAZI.parca, yuk: SATIR.parca, tur: "mono" });
  }
  if (pasifMetinleri.length) {
    const olc = (s: string) => metinGenisligi(s, YAZI.gorev, "sans");
    for (const m of satirlaraBol(pasifMetinleri, ", ", genislik, olc)) satirlar.push({ m, s: "pasif", boy: YAZI.gorev, yuk: SATIR.gorev, tur: "sans" });
  }
  if (kapi > 0) {
    // dar kutularda kısa biçim (açıklaması yapıştırıcı lojik notunda)
    const kisa = `+ ${adet(kapi, "kapı", ["gate", "gates"], dil)}`;
    const uzun = `${kisa} ${dil === "en" ? "(in glue logic)" : "(yapıştırıcı lojikte)"}`;
    const m = metinGenisligi(uzun, YAZI.kapi, "sans") <= genislik ? uzun : kisa;
    satirlar.push({ m, s: "kapi", boy: YAZI.kapi, yuk: SATIR.kapi, tur: "sans" });
  }
  if (gorev) {
    const olc = (s: string) => metinGenisligi(s, YAZI.gorev, "sans");
    for (const m of satirlaraBol(gorev.split(" "), " ", genislik, olc)) satirlar.push({ m, s: "gorev", boy: YAZI.gorev, yuk: SATIR.gorev, tur: "sans" });
  }
  return { satirlar };
}

/** İçeriği dikdörtgenin ortasına diz; taşarsa hata yaz */
function diz(ic: Icerik, r: Dikdortgen, ad: string, hatalar: string[]): SMetin[] {
  const ARA = 3;
  let toplam = 0;
  let onceki: MetinSinifi | null = null;
  for (const s of ic.satirlar) {
    toplam += s.yuk + (onceki && onceki !== s.s ? ARA : 0);
    onceki = s.s;
  }
  const icW = r.w - 2 * PAY.x;
  if (toplam > r.h - 2 * PAY.y + 0.5) hatalar.push(`${ad}: yazı kutuya sığmıyor (${Math.ceil(toplam)} > ${r.h - 2 * PAY.y})`);
  const out: SMetin[] = [];
  let y = r.y + (r.h - toplam) / 2;
  onceki = null;
  const cx = r.x + r.w / 2;
  for (const s of ic.satirlar) {
    y += onceki && onceki !== s.s ? ARA : 0;
    onceki = s.s;
    // taban çizgisi: satırın ortasından yazının yarı yüksekliği kadar aşağıda
    out.push({ x: cx, y: P(y + s.yuk / 2 + s.boy * 0.35), m: s.m, s: s.s, hiza: "middle" });
    const g = metinGenisligi(s.m, s.boy, s.tur);
    if (g > icW + 0.5) hatalar.push(`${ad}: "${s.m}" satırı kutudan geniş (${Math.ceil(g)} > ${icW})`);
    y += s.yuk;
  }
  return out;
}

// ---------------------------------------------------------------- sahne

/** Bir çerçevenin bütün blokları: içindeki kutularınkiler ve kendi blokları */
export function grupBloklari(dg: Diyagram, g: Grup): BlokKimligi[] {
  const out: BlokKimligi[] = [...(g.bloklar ?? [])];
  for (const id of g.kutular) {
    const k = dg.kutular.find((x) => x.id === id);
    if (k) out.push(...k.bloklar);
  }
  return out;
}

/** Çerçevedeki entegreler */
export const grupCipleri = (dg: Diyagram, g: Grup, devre: Devre) => devre.parcalar(grupBloklari(dg, g)).cipler;

/** Bir kutu ya da çerçevenin blokları (yol uçlarının denetimi ve yan panel için) */
export function ucBloklari(dg: Diyagram, id: string): BlokKimligi[] {
  const k = dg.kutular.find((x) => x.id === id);
  if (k) return k.bloklar;
  const g = dg.gruplar.find((x) => x.id === id);
  return g ? grupBloklari(dg, g) : [];
}

/** Diyagramın sahnesi; `dil` ortak yazıların dili (kutu ve yol metinleri diyagramdan) */
export function sahneKur(dg: Diyagram, devre: Devre, dil: Dil = "tr"): Sahne {
  const t = cevirici(dil);
  const hatalar: string[] = [];
  const kutuYeri = new Map<string, Dikdortgen>();
  for (const k of dg.kutular) kutuYeri.set(k.id, k);
  for (const g of dg.gruplar) kutuYeri.set(g.id, g);

  // ---- başlık
  const baslik: SMetin[] = [
    { x: 24, y: P(BASLIK_H / 2 + YAZI.baslik * 0.36), m: buyuk(dg.baslik, dil), s: "baslik", hiza: "start" },
    { x: dg.genislik - 24, y: P(BASLIK_H / 2 + YAZI.altBaslik * 0.36), m: dg.altBaslik, s: "alt-baslik", hiza: "end" },
  ];
  // başlık ve alt başlık çakışmasın
  const baslikSag = 24 + metinGenisligi(baslik[0].m, YAZI.baslik, "kalin") + 24 + metinGenisligi(dg.altBaslik, YAZI.altBaslik, "sans") + 24;
  if (baslikSag > dg.genislik + 0.5) hatalar.push(`başlık ve alt başlık sığmıyor (${Math.ceil(baslikSag)} > ${dg.genislik})`);

  // ---- kutular
  const kutular: SKutu[] = dg.kutular.map((k) => {
    const metinler: SMetin[] = [];
    const bolmeler: SKutu["bolmeler"] = [];
    const yaz = (ad: string, gorev: string, r: Dikdortgen, bolme: boolean, b?: NonNullable<typeof k.bolmeler>[number]) => {
      if (k.cihaz) {
        metinler.push(...diz(icerik(ad, [], [], 0, gorev, r.w - 2 * PAY.x, bolme, dil), r, k.id, hatalar));
        return;
      }
      const p = kutuParcalari(devre, k, b);
      const cipler = cipSayimi(p.cipler).map(sayimMetni);
      const pasifler = pasifSayimi(p.pasifler, dil).map(sayimMetni);
      const kapi = k.rol === "not" ? 0 : p.kapilar.length;
      metinler.push(...diz(icerik(ad, cipler, pasifler, kapi, gorev, r.w - 2 * PAY.x, bolme, dil), r, b ? `${k.id}/${b.ad}` : k.id, hatalar));
    };
    if (k.bolmeler?.length) {
      for (const b of k.bolmeler) {
        const r = { x: k.x + b.x, y: k.y + b.y, w: b.w, h: b.h };
        bolmeler.push(r);
        yaz(b.ad, b.gorev ?? "", r, true, b);
      }
    } else yaz(k.ad, k.gorev, k, false);
    return { id: k.id, rol: k.rol, x: k.x, y: k.y, w: k.w, h: k.h, cihaz: !!k.cihaz, bolmeler, metinler, ayrinti: k.ayrinti };
  });

  // ---- gruplar (kart çerçeveleri)
  const gruplar: SGrup[] = dg.gruplar.map((g) => {
    const cipSayisi = grupCipleri(dg, g, devre).length;
    const ad = buyuk(g.ad, dil);
    const metinler: SMetin[] = [
      { x: g.x + 14, y: g.y + 23, m: ad, s: "grup-ad", hiza: "start" },
    ];
    const adW = metinGenisligi(ad, YAZI.grupAd, "kalin");
    // bloklarAdi tekil yazılır, İngilizcede çoğulu "s" ile ("gate chip" → "gate chips")
    const kendi = g.bloklar?.length && g.bloklarAdi ? ` · ${adet(devre.parcalar(g.bloklar).cipler.length, g.bloklarAdi, [g.bloklarAdi, `${g.bloklarAdi}s`], dil)}` : "";
    const ek = g.ek ?? `${adet(cipSayisi, "entegre", ["chip", "chips"], dil)}${kendi}`;
    metinler.push({ x: P(g.x + 14 + adW + 10), y: g.y + 23, m: ek, s: "grup-ek", hiza: "start" });
    let sag = g.x + 14 + adW + 10 + metinGenisligi(ek, YAZI.grupEk, "sans");
    if (g.ayrinti) {
      const link = t("ayrıntı ›", "details ›");
      metinler.push({ x: g.x + g.w - 14, y: g.y + 23, m: link, s: "grup-link", hiza: "end" });
      sag += 12 + metinGenisligi(link, YAZI.grupEk, "kalin");
    }
    if (sag > g.x + g.w - 14 + 0.5) hatalar.push(`${g.id}: çerçeve başlığı sığmıyor (${Math.ceil(sag - g.x)} > ${g.w - 14})`);
    return { id: g.id, x: g.x, y: g.y, w: g.w, h: g.h, metinler, ayrinti: g.ayrinti, sade: !!g.sade };
  });

  // ---- yollar
  const yollar = dg.yollar.map((y) => yolCiz(y, kutuYeri, hatalar, dil));

  // ---- lejant
  const lejant = lejantKur(dg, hatalar, dil);

  return { id: dg.id, w: dg.genislik, h: dg.yukseklik, baslik, gruplar, kutular, yollar, lejant, hatalar };
}

/** Bir yolun çizgileri, okları, dallanma noktaları, etiketleri */
function yolCiz(y: Yol, kutuYeri: Map<string, Dikdortgen>, hatalar: string[], dil: Dil): SYol {
  const w = yolKalinligi(y.netler.length);
  const out: SYol = { id: y.id, tur: y.tur, w, cizgiler: [], oklar: [], noktalar: [], etiketler: [], baglayicilar: [] };
  const govde = y.govde ?? [];
  const tum = [...govde, ...y.kollar];
  const ucKutusu = (p: Nokta): { id: string; yon: (typeof y.uclar)[number]["yon"] } | null => {
    for (const u of y.uclar) {
      const r = kutuYeri.get(u.kutu);
      if (!r) continue;
      if (kenarda(p, r)) return { id: u.kutu, yon: u.yon };
    }
    return null;
  };
  const baglayici = (p: Nokta) => y.baglayicilar?.find((b) => yakin(b.nokta[0], p[0]) && yakin(b.nokta[1], p[1]));
  const baskaCizgide = (p: Nokta, ben: readonly Nokta[]) => tum.some((c) => c !== ben && cizgide(p, c));

  for (const u of y.uclar) if (!kutuYeri.has(u.kutu)) hatalar.push(`${y.id}: uç kutusu yok: ${u.kutu}`);

  for (const c of govde) out.cizgiler.push({ d: yolD(c), govde: true });

  for (const kol of y.kollar) {
    if (kol.length < 2) {
      hatalar.push(`${y.id}: kolda en az iki nokta olmalı`);
      continue;
    }
    for (let i = 1; i < kol.length; i++) {
      if (!yakin(kol[i][0], kol[i - 1][0]) && !yakin(kol[i][1], kol[i - 1][1])) hatalar.push(`${y.id}: kol dik açılı değil (${kol[i - 1]} → ${kol[i]})`);
    }
    const bas = kol[0];
    const son = kol[kol.length - 1];
    const kb = ucKutusu(bas);
    const ks = ucKutusu(son);
    if (!kb && !ks) hatalar.push(`${y.id}: kolun hiçbir ucu bir kutuda değil (${bas} … ${son})`);
    const kutuUcu = kb ?? ks;
    let kisaltBas = 0;
    let kisaltSon = 0;
    // dallanma ucunda hale, kolun bağlandığı çizgiyi oymasın
    let haleBas = 0;
    let haleSon = 0;
    const ok = (uc: Nokta, onceki: Nokta, icine: number) => {
      const yon = birim(onceki, uc);
      const tepe: Nokta = [uc[0] - yon[0] * icine, uc[1] - yon[1] * icine];
      out.oklar.push({ d: okBasi(tepe, yon, w), kutu: kutuUcu?.id });
    };
    // her uç: kutuda mı, başka çizgide mi (dallanma), bağlayıcıda mı
    const ucuIsle = (uc: Nokta, komsu: Nokta, kutu: ReturnType<typeof ucKutusu>, ben: readonly Nokta[]): number => {
      if (kutu) {
        if (kutu.yon === "giris" || kutu.yon === "iki") {
          ok(uc, komsu, 0);
          return okBoyu(w) * 0.8;
        }
        return 0;
      }
      const bg = baglayici(uc);
      if (bg) {
        out.baglayicilar.push(baglayiciCiz(bg.nokta, bg.metin, bg.yon));
        // kutudan çıkan yol bağlayıcıya ok ile girer
        if (kutuUcu && (kutuUcu.yon === "cikis" || kutuUcu.yon === "iki")) {
          ok(uc, komsu, 0);
          return okBoyu(w) * 0.8;
        }
        return 0;
      }
      if (baskaCizgide(uc, ben)) {
        // dallanma: kutu çıkışsa ok gövdeye doğru, değilse nokta
        if (kutuUcu && (kutuUcu.yon === "cikis" || kutuUcu.yon === "iki")) {
          ok(uc, komsu, w / 2);
          return okBoyu(w) * 0.8 + w / 2;
        }
        out.noktalar.push({ x: uc[0], y: uc[1], r: P(w * 0.8 + 1.8) });
        return -1;
      }
      hatalar.push(`${y.id}: kolun ucu boşta (${uc})`);
      return 0;
    };
    kisaltBas = ucuIsle(bas, kol[1], kb, kol);
    kisaltSon = ucuIsle(son, kol[kol.length - 2], ks, kol);
    if (kisaltBas < 0) {
      kisaltBas = 0;
      haleBas = w / 2 + 3;
    }
    if (kisaltSon < 0) {
      kisaltSon = 0;
      haleSon = w / 2 + 3;
    }
    const kutular = [kb?.id, ks?.id].filter(Boolean) as string[];
    const d = yolD(kisalt([...kol], kisaltBas, kisaltSon));
    const hale = haleBas || haleSon ? yolD(kisalt([...kol], Math.max(kisaltBas, haleBas), Math.max(kisaltSon, haleSon))) : undefined;
    out.cizgiler.push({ d, hale, kutu: kutular.length ? kutular.join(" ") : undefined });
  }
  // aynı yolun çizgileri kesişiyorsa (ya da gövdenin ucu bir kolun ortasına değiyorsa) bağlıdır: nokta
  const kolUclari = y.kollar.flatMap((k) => [k[0], k[k.length - 1]]);
  const noktaVar = (p: Nokta) => out.noktalar.some((n) => yakin(n.x, p[0]) && yakin(n.y, p[1])) || kolUclari.some((u) => yakin(u[0], p[0]) && yakin(u[1], p[1]));
  for (let i = 0; i < tum.length; i++) {
    for (let j = i + 1; j < tum.length; j++) {
      for (const p of kesisimler(tum[i], tum[j])) {
        if (!noktaVar(p)) out.noktalar.push({ x: p[0], y: p[1], r: P(w * 0.8 + 1.8) });
      }
    }
  }
  // her uç kutusuna en az bir kol değmeli
  for (const u of y.uclar) {
    const r = kutuYeri.get(u.kutu);
    if (r && !y.kollar.some((k) => kenarda(k[0], r) || kenarda(k[k.length - 1], r))) hatalar.push(`${y.id}: ${u.kutu} kutusuna değen kol yok`);
  }
  for (const e of y.etiketler) {
    out.etiketler.push({ x: e.x, y: e.y, m: yolEtiketMetni(y, e, dil), s: "etiket", hiza: e.hiza === "bas" ? "start" : e.hiza === "son" ? "end" : "middle", dikey: e.dikey });
  }
  return out;
}

/** Bağlayıcı etiketi: çizginin ucunda yuvarlak köşeli kutu, içinde ad */
function baglayiciCiz(p: Nokta, metin: string, yon: "sol" | "sag" | "yukari" | "asagi") {
  const tw = metinGenisligi(metin, YAZI.bag, "kalin");
  const w = P(tw + 16);
  const h = 22;
  let x = p[0];
  let y = p[1] - h / 2;
  if (yon === "sol") x = p[0] - w;
  else if (yon === "yukari") {
    x = p[0] - w / 2;
    y = p[1] - h;
  } else if (yon === "asagi") {
    x = p[0] - w / 2;
    y = p[1];
  }
  return { x: P(x), y: P(y), w, h, metin: { x: P(x + w / 2), y: P(y + h / 2 + YAZI.bag * 0.36), m: metin, s: "bag" as const, hiza: "middle" as const } };
}

/** Lejant: yol türleri, kutu rolleri, kısaltmalar */
function lejantKur(dg: Diyagram, hatalar: string[], dil: Dil): Sahne["lejant"] {
  const t = cevirici(dil);
  const L = dg.lejant;
  const cizgiler: Sahne["lejant"]["cizgiler"] = [];
  const kutucuklar: Sahne["lejant"]["kutucuklar"] = [];
  const metinler: SMetin[] = [];
  const PADX = 16;
  const ust = L.y + 14;
  const SATIR_H = 19;
  const satirSayisi = Math.max(1, Math.floor((L.h - 28 - 20) / SATIR_H));
  let x = L.x + PADX;

  const bolum = (baslik: string, ogeler: { ciz: (ox: number, oy: number) => number; metin: string; kisa?: string }[]) => {
    metinler.push({ x, y: ust + 12, m: baslik, s: "lej-baslik", hiza: "start" });
    const sutunlar = Math.ceil(ogeler.length / satirSayisi);
    for (let s = 0; s < sutunlar; s++) {
      const parca = ogeler.slice(s * satirSayisi, (s + 1) * satirSayisi);
      let enGenis = 0;
      const kw = Math.max(0, ...parca.map((o) => (o.kisa ? metinGenisligi(o.kisa, YAZI.lej, "kalin") + 12 : 0)));
      parca.forEach((o, i) => {
        const oy = ust + 24 + i * SATIR_H;
        const iw = o.ciz(x, oy);
        const mx = x + iw;
        if (o.kisa) {
          metinler.push({ x: mx, y: oy + 13, m: o.kisa, s: "lej-kisa", hiza: "start" });
          metinler.push({ x: mx + kw, y: oy + 13, m: o.metin, s: "lej", hiza: "start" });
          enGenis = Math.max(enGenis, iw + kw + metinGenisligi(o.metin, YAZI.lej, "sans"));
        } else {
          metinler.push({ x: mx, y: oy + 13, m: o.metin, s: "lej", hiza: "start" });
          enGenis = Math.max(enGenis, iw + metinGenisligi(o.metin, YAZI.lej, "sans"));
        }
      });
      x += enGenis + 26;
    }
    x += 14;
  };

  const turler = [...new Set(dg.yollar.map((y) => y.tur))];
  bolum(t("YOLLAR", "CONNECTIONS"), turler.map((tur) => ({
    metin: YOL_TURU_ADI[tur][dil],
    ciz: (ox, oy) => {
      const yy = oy + 9;
      cizgiler.push({ d: `M${ox} ${yy} L${ox + 30} ${yy}`, tur, w: 4 });
      return 40;
    },
  })));
  const roller = [...new Set(dg.kutular.map((k) => k.rol))];
  bolum(t("KUTULAR", "BOXES"), roller.map((r) => ({
    metin: KUTU_ROLU_ADI[r][dil],
    ciz: (ox, oy) => {
      kutucuklar.push({ x: ox, y: oy + 2, w: 24, h: 15, rol: r });
      return 34;
    },
  })));
  if (L.kisaltmalar.length) bolum(t("KISALTMALAR", "ABBREVIATIONS"), L.kisaltmalar.map(([k, u]) => ({ metin: u, kisa: k, ciz: () => 0 })));
  if (x - 14 > L.x + L.w + 0.5) hatalar.push(`lejant sığmıyor (${Math.ceil(x - 14 - L.x)} > ${L.w})`);
  return { x: L.x, y: L.y, w: L.w, h: L.h, cizgiler, kutucuklar, metinler };
}
