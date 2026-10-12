// Breadboard yerleşiminin ortak parçaları: parçaların ve board'ların tipleri, bacak kalıpları (DIP,
// geniş DIP, gösterge, sıra, iki bacaklı), board'daki çiplerin sütunları ve mantık çiplerini board'lara
// dağıtan benzetilmiş tavlama. Projeye özgü yerleşim (hangi blok hangi board'da, el yerleşimleri)
// projenin kendi dosyasındadır: hesap8/breadboard/yerlesim.ts, cpu16/breadboard/yerlesim.ts.
//
// Tavlama: her board'da en çok `yuva` çip (tellere yer kalsın). Çipler bölge bölge yerleşir: önce
// netlist sırasıyla board'lara dengeli, sonra rastgele yer değiştirmeler (tohumlu: her çalışmada aynı
// sonuç) netlerin toplam tel boyu tahminini (uçların Manhattan en küçük kapsayan ağacı) küçültür.
// Sonunda her board'un çipleri sütunlara eşit aralıkla dizilir.

import type { ChipInstance, Passive } from "../board.ts";
import { PASSIVES } from "../passives.ts";
import { BX_ADIM, BY_ADIM, kureselX, kureselY, type BbKonum } from "./geometri.ts";

export type ParcaTuru =
  | "dip" | "gosterge" | "sip" | "direnc" | "led" | "kondansator" | "elektrolitik" | "buton" | "konnektor"
  // CPU16: geniş DIP (15,24 mm: 62256, 28C256), şerit kablo uyarlayıcısı (2 × 32 → kanalın iki yanı),
  // kristal osilatör (DIP-14 kılıf), trimpot, sürgülü anahtar, tek sıra pinli modül (CH340, PS/2, VGA)
  | "genis" | "uyarlayici" | "osilator" | "pot" | "anahtar" | "modul";

export interface BbBacak {
  /** parçanın pin numarası (butonun her pininin iki bacağı vardır) */
  pin: number;
  X: number;
  Y: number;
}

export interface BbParca {
  ref: string;
  part: string;
  /** mantık çipi mi (yoksa pasif) */
  cipMi: boolean;
  tur: ParcaTuru;
  blok: string;
  rol: string;
  board: number;
  asama: number;
  bacaklar: BbBacak[];
  /** tellerin üstünden geçemeyeceği gövde: [x0, y0, x1, y1] ızgara noktaları, uçlar dahil */
  govde: [number, number, number, number];
  /** DIP'lerde ve SIP'te 1. pinin yerel sütunu; ötekilerde en soldaki bacağın sütunu */
  sutun: number;
  /** SIP 180° dönük (1. pin sağda) */
  ters?: boolean;
  /** dekuplaj kondansatörünün çipi */
  bagliCip?: string;
  /**
   * Netlistte olmayan, yalnız fiziksel parça (ör. panonun besleme girişi): bacaklarının netleri burada
   * (pin → net). Doğrulama bunları netlistle değil bu netlerle karşılaştırır.
   */
  ek?: Record<number, number>;
}

export interface BbBoard extends BbKonum {
  /** board'un işi, ör. "Çarpma", "Gösterge: sonuç (±, 4, 3)" */
  rol: string;
  /** en çok parçası hangi aşamada takılıyorsa */
  asama: number;
  /** modüler yerleşimde board'un çip grupları (pano tanımının `duzen`inden; 3D ve belgelerde etiketi) */
  gruplar?: string[];
}

export interface BbYerlesim {
  nx: number;
  ny: number;
  boards: BbBoard[];
  parcalar: BbParca[];
}

export interface Asama {
  no: number;
  ad: string;
  bloklar: string[];
}

// ---------------------------------------------------------------- netler

/** Pinin neti (bağlantısız: -1) */
export function pinNeti(x: ChipInstance | Passive, num: number): number {
  if ("def" in x) {
    const p = x.def.pins.find((q) => q.num === num);
    return p ? (x.nets[p.name] ?? -1) : -1;
  }
  return x.pins[String(num)] ?? -1;
}

/** Parçanın bütün pin numaraları */
export function pinNumaralari(x: ChipInstance | Passive): number[] {
  if ("def" in x) return x.def.pins.map((p) => p.num);
  const def = PASSIVES[x.part];
  if (def) return def.pins.map((p) => p.num);
  return Object.keys(x.pins).map(Number);
}

// ---------------------------------------------------------------- bacak kalıpları

/** Board'un yerel (r, c) deliğinin ızgara noktası */
export const izgaraNoktasi = (b: BbKonum, r: number, c: number): { X: number; Y: number } => ({ X: kureselX(b.bx, c), Y: kureselY(b.by, r) });
const G = izgaraNoktasi;

export type Kalip = { bacaklar: BbBacak[]; govde: BbParca["govde"] };

/** DIP (çip, DIP anahtar, DIP-16 dizi): 1. pin f satırında c0'da, n. pin e satırında c0'da */
export function dipBacaklari(b: BbKonum, c0: number, n: number): Kalip {
  const half = n / 2;
  const bacaklar: BbBacak[] = [];
  for (let k = 1; k <= n; k++) {
    const alt = k <= half;
    const c = c0 + (alt ? k - 1 : n - k);
    bacaklar.push({ pin: k, ...G(b, alt ? 10 : 7, c) });
  }
  const a = G(b, 7, c0);
  const z = G(b, 10, c0 + half - 1);
  return { bacaklar, govde: [a.X, a.Y, z.X, z.Y] };
}

/** Geniş DIP (15,24 mm, 0,6"): 1. pin h satırında c0'da, n. pin d satırında c0'da; gövde d…h */
export function genisDipBacaklari(b: BbKonum, c0: number, n: number): Kalip {
  const half = n / 2;
  const bacaklar: BbBacak[] = [];
  for (let k = 1; k <= n; k++) {
    const alt = k <= half;
    const c = c0 + (alt ? k - 1 : n - k);
    bacaklar.push({ pin: k, ...G(b, alt ? 12 : 6, c) });
  }
  const a = G(b, 6, c0);
  const z = G(b, 12, c0 + half - 1);
  return { bacaklar, govde: [a.X, a.Y, z.X, z.Y] };
}

/** 0,56" gösterge: 1–5 h satırında soldan sağa, 6–10 d satırında sağdan sola; gövde d…h */
export function gostergeBacaklari(b: BbKonum, c0: number): Kalip {
  const bacaklar: BbBacak[] = [];
  for (let k = 1; k <= 10; k++) bacaklar.push({ pin: k, ...(k <= 5 ? G(b, 12, c0 + k - 1) : G(b, 6, c0 + 10 - k)) });
  const a = G(b, 6, c0);
  const z = G(b, 12, c0 + 4);
  return { bacaklar, govde: [a.X, a.Y, z.X, z.Y] };
}

/** İki bacaklı eleman: gövde bacakların arası (bacaklar dahil) */
export function ikiBacak(p1: { X: number; Y: number }, p2: { X: number; Y: number }, pinler: [number, number] = [1, 2]): Kalip {
  return {
    bacaklar: [{ pin: pinler[0], ...p1 }, { pin: pinler[1], ...p2 }],
    govde: [Math.min(p1.X, p2.X), Math.min(p1.Y, p2.Y), Math.max(p1.X, p2.X), Math.max(p1.Y, p2.Y)],
  };
}

/** Tek sıra bacak: `pinler` soldan sağa, r satırında c0'dan başlayarak (SIP, modül, anahtar, trimpot) */
export function siraBacaklari(b: BbKonum, r: number, c0: number, pinler: number[]): Kalip {
  const bacaklar = pinler.map((pin, i) => ({ pin, ...G(b, r, c0 + i) }));
  const a = G(b, r, c0);
  const z = G(b, r, c0 + pinler.length - 1);
  return { bacaklar, govde: [a.X, a.Y, z.X, z.Y] };
}

// ---------------------------------------------------------------- çiplerin sütunları

/** Çiplerin kullanabileceği sütunlar: 1–61 (62–63 board içi ray köprülerinin yolu) */
export const SOL = 1;
export const SAG = 61;

/** Board'daki çiplerin sol sütunları: boşluklar eşit, artan sütunlar ortaya yakın aralıklara */
export function sutunlariDiz(enler: number[], sol = SOL, sag = SAG): number[] | null {
  const n = enler.length;
  if (!n) return [];
  const toplam = enler.reduce((a, x) => a + x, 0);
  const bos = sag - sol + 1 - toplam;
  if (bos < n - 1) return null;
  // n + 1 aralık: sol kenar, n − 1 iç, sağ kenar; iç aralıklar en az 1
  const ara = Array<number>(n + 1).fill(0);
  let kalan = bos;
  for (let i = 1; i < n; i++) {
    ara[i] = 1;
    kalan--;
  }
  const taban = Math.floor(kalan / (n + 1));
  for (let i = 0; i <= n; i++) ara[i] += taban;
  kalan -= taban * (n + 1);
  // artanlar ortadan dışa doğru iç aralıklara
  const sira = Array.from({ length: n - 1 }, (_, i) => i + 1).sort((a, b) => Math.abs(a - n / 2) - Math.abs(b - n / 2));
  for (let i = 0; kalan > 0 && sira.length; i = (i + 1) % sira.length, kalan--) ara[sira[i]]++;
  if (kalan > 0) ara[0] += kalan;
  const out: number[] = [];
  let c = sol + ara[0];
  for (let i = 0; i < n; i++) {
    out.push(c);
    c += enler[i] + ara[i + 1];
  }
  return out;
}

// ---------------------------------------------------------------- tavlama

/** Basit, tohumlu sözde rastgele sayı (mulberry32): yerleşim her çalışmada aynı */
export function rastgele(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Çiplerin pin konumları (tavlamada telin çıkacağı satır: üst pinler c, alt pinler h) */
function pinOfseti(n: number, num: number): [number, number] {
  const half = n / 2;
  return num <= half ? [num - 1, 12] : [n - num, 5];
}

/** Bir tavlama bölgesi: board'ları (yuvalar bu sırayla açılır) ve sırayla yerleşecek çipleri */
export interface TavlamaBolgesi {
  boards: BbBoard[];
  cipler: ChipInstance[];
  /** çipin gidebileceği board'lar (verilmezse bölgenin bütün board'ları) */
  izin?: (ci: ChipInstance) => BbBoard[] | undefined;
}

export interface TavlamaSecenekleri {
  tohum?: number;
  adim?: number;
  /** başlangıç ve bitiş sıcaklığı */
  T0?: number;
  Tson?: number;
  /** board başına en çok çip */
  yuva?: number;
  /** board'un çiplere açık sütunları (verilmezse 1–61) */
  aralik?: (b: BbBoard) => [number, number];
  /** hiçbir board boş kalmasın: son çipini başka board'a taşıyan hamle yapılmaz */
  bosKalmasin?: boolean;
  /** dikey uzaklığın ağırlığı (board'lar arası dikey yol daha pahalı) */
  dikey?: number;
  /**
   * Uzun bağlantı cezası: netin kapsayan ağacında `esik` ızgara adımından (dikey ağırlıklı) uzun her
   * kenar için fazlasının `kat` katı eklenir (uzun teller yerine kısa tellere yönelir)
   */
  uzunCeza?: { esik: number; kat: number };
  /** board başına yuva sayısı (verilmezse `yuva`) */
  yuvaSayisi?: (b: BbBoard) => number;
  /** sığma denetiminde çipin kapladığı sütun (verilmezse pin sayısının yarısı; geniş çiplere pay bırakmak için) */
  en?: (ci: ChipInstance) => number;
}

/**
 * Mantık çiplerini bölgelerinin board'larına dağıtır. `sabit`: yeri belli parçaların (pasifler, elle
 * yerleşen çipler) net başına bacak noktaları. Dönüş: ref → [board, 1. pinin sütunu].
 */
export function tavlama(bolgeler: TavlamaBolgesi[], sabit: Map<number, { X: number; Y: number }[]>, o: TavlamaSecenekleri = {}): Map<string, [BbBoard, number]> {
  const rnd = rastgele(o.tohum ?? 80008);
  const YUVA = o.yuva ?? 5;
  const aralik = o.aralik ?? (() => [SOL, SAG] as [number, number]);
  const dikeyK = o.dikey ?? 1.3;
  const enOf = o.en ?? ((ci: ChipInstance) => ci.def.pins.length / 2);
  const ceza = o.uzunCeza;
  interface Hc { ci: ChipInstance; n: number; en: number; izin: number[]; yuva: number }
  // yuvalar: [board, sıra]
  const yBoard: BbBoard[] = [];
  const yX: number[] = [];
  const yY: number[] = [];
  const yIcerik: number[] = [];
  const hc: Hc[] = [];
  const yuvalar = new Map<BbBoard, number[]>();
  // board başına toplam en ve çip sayısı (sığma denetimi: en + aralar ≤ sütun sayısı)
  const bEn = new Map<BbBoard, number>();
  const bSay = new Map<BbBoard, number>();
  const sigar = (b: BbBoard, ekEn: number, ekSay: number) => {
    const [sol, sag] = aralik(b);
    return (bEn.get(b) ?? 0) + ekEn + (bSay.get(b) ?? 0) + ekSay - 1 <= sag - sol + 1;
  };
  const yuvaAc = (b: BbBoard): number[] => {
    if (!yuvalar.has(b)) {
      const [sol, sag] = aralik(b);
      const ys = o.yuvaSayisi ? o.yuvaSayisi(b) : YUVA;
      const en = (sag - sol + 1) / ys;
      const list: number[] = [];
      for (let k = 0; k < ys; k++) {
        list.push(yBoard.length);
        yBoard.push(b);
        yX.push(b.bx * BX_ADIM + sol + Math.round(k * en));
        yY.push(b.by * BY_ADIM);
        yIcerik.push(-1);
      }
      yuvalar.set(b, list);
    }
    return yuvalar.get(b)!;
  };
  for (const bolge of bolgeler) {
    const hepsi = bolge.boards.flatMap(yuvaAc);
    for (const ci of bolge.cipler) {
      const izinB = bolge.izin?.(ci);
      const izin = izinB ? izinB.flatMap(yuvaAc) : hepsi;
      // başlangıç: netlist sırasıyla, board'lara dengeli (her board'un sıradaki boş yuvası)
      const bos = izin.filter((y) => yIcerik[y] < 0);
      if (!bos.length) throw new Error(`bölge sığmıyor: ${bolge.boards.map((b) => b.ad).join(",")}`);
      const doluluk = (y: number) => yuvalar.get(yBoard[y])!.filter((q) => yIcerik[q] >= 0).length;
      const en = enOf(ci);
      const y = bos.filter((q) => sigar(yBoard[q], en, 0)).sort((a, b) => doluluk(a) - doluluk(b) || a - b)[0];
      if (y === undefined) throw new Error(`bölge sığmıyor: ${bolge.boards.map((b) => b.ad).join(",")}`);
      yIcerik[y] = hc.length;
      hc.push({ ci, n: ci.def.pins.length, en, izin, yuva: y });
      bEn.set(yBoard[y], (bEn.get(yBoard[y]) ?? 0) + en);
      bSay.set(yBoard[y], (bSay.get(yBoard[y]) ?? 0) + 1);
    }
  }
  // netler: çip uçları (çip, dx, dy) ve sabit noktalar
  const netUclari = new Map<number, { i: number; dx: number; dy: number }[]>();
  hc.forEach((h, i) => {
    for (const p of h.ci.def.pins) {
      const net = h.ci.nets[p.name];
      if (net === undefined || net <= 1) continue;
      const [dx, dy] = pinOfseti(h.n, p.num);
      if (!netUclari.has(net)) netUclari.set(net, []);
      netUclari.get(net)!.push({ i, dx: dx + (h.n === 14 ? 1 : 0), dy });
    }
  });
  const netler = [...netUclari.keys()];
  const hUc = netler.map((n) => netUclari.get(n)!);
  const sUc = netler.map((n) => sabit.get(n) ?? []);
  const cipNetleri = hc.map(() => [] as number[]);
  hUc.forEach((list, j) => { for (const u of list) if (!cipNetleri[u.i].includes(j)) cipNetleri[u.i].push(j); });
  // netin tel boyu tahmini: uçların Manhattan en küçük kapsayan ağacı (yönlendirici de şeritleri
  // böyle, ağaç olarak bağlar); dikey mesafe biraz pahalı (board'lar arası)
  const enCokUc = Math.max(64, ...hUc.map((l, j) => l.length + sUc[j].length));
  const px = new Float64Array(enCokUc);
  const py = new Float64Array(enCokUc);
  const enYakin = new Float64Array(enCokUc);
  const agacta = new Uint8Array(enCokUc);
  const netMaliyeti = (j: number): number => {
    let k = 0;
    for (const u of hUc[j]) {
      const y = hc[u.i].yuva;
      px[k] = yX[y] + u.dx;
      py[k] = (yY[y] + u.dy) * dikeyK;
      k++;
    }
    for (const p of sUc[j]) {
      px[k] = p.X;
      py[k] = p.Y * dikeyK;
      k++;
    }
    if (k <= 1) return 0;
    if (k === 2) {
      const d = Math.abs(px[0] - px[1]) + Math.abs(py[0] - py[1]);
      return ceza && d > ceza.esik ? d + (d - ceza.esik) * ceza.kat : d;
    }
    for (let i = 0; i < k; i++) { enYakin[i] = Infinity; agacta[i] = 0; }
    let son = 0;
    agacta[0] = 1;
    let toplam = 0;
    for (let adim = 1; adim < k; adim++) {
      let en = Infinity;
      let ei = -1;
      for (let i = 0; i < k; i++) {
        if (agacta[i]) continue;
        const d = Math.abs(px[i] - px[son]) + Math.abs(py[i] - py[son]);
        if (d < enYakin[i]) enYakin[i] = d;
        if (enYakin[i] < en) { en = enYakin[i]; ei = i; }
      }
      agacta[ei] = 1;
      toplam += en;
      if (ceza && en > ceza.esik) toplam += (en - ceza.esik) * ceza.kat;
      son = ei;
    }
    return toplam;
  };
  const nm = new Float64Array(netler.length);
  for (let j = 0; j < netler.length; j++) nm[j] = netMaliyeti(j);
  const isaret = new Int32Array(netler.length);
  let damga = 0;
  const ADIMLAR = o.adim ?? 1_200_000;
  let T = o.T0 ?? 25;
  const carpan = Math.pow((o.Tson ?? 0.05) / T, 1 / ADIMLAR);
  const yeniDeger = new Float64Array(netler.length);
  for (let s = 0; s < ADIMLAR; s++, T *= carpan) {
    const i = Math.floor(rnd() * hc.length);
    const h = hc[i];
    const hedef = h.izin[Math.floor(rnd() * h.izin.length)];
    if (hedef === h.yuva) continue;
    const j = yIcerik[hedef];
    if (j >= 0 && !hc[j].izin.includes(h.yuva)) continue;
    const eskiY = h.yuva;
    const b1 = yBoard[eskiY];
    const b2 = yBoard[hedef];
    if (b1 !== b2) {
      const en1 = h.en;
      const en2 = j >= 0 ? hc[j].en : 0;
      const s1 = bSay.get(b1)!;
      const s2 = bSay.get(b2) ?? 0;
      const yeniS1 = j >= 0 ? s1 : s1 - 1;
      const yeniS2 = j >= 0 ? s2 : s2 + 1;
      if (!sigar(b2, en1 - en2, yeniS2 - s2) || !sigar(b1, en2 - en1, yeniS1 - s1)) continue;
      if (o.bosKalmasin && yeniS1 === 0) continue;
    }
    // yer değiştir
    h.yuva = hedef;
    if (j >= 0) hc[j].yuva = eskiY;
    damga++;
    let d = 0;
    const etkilenen: number[] = [];
    for (const x of j >= 0 ? [i, j] : [i]) for (const n of cipNetleri[x]) if (isaret[n] !== damga) { isaret[n] = damga; etkilenen.push(n); }
    for (const n of etkilenen) { const v = netMaliyeti(n); yeniDeger[n] = v; d += v - nm[n]; }
    if (d <= 0 || rnd() < Math.exp(-d / T)) {
      for (const n of etkilenen) nm[n] = yeniDeger[n];
      yIcerik[hedef] = i;
      yIcerik[eskiY] = j;
      if (b1 !== b2) {
        const en1 = h.en;
        const en2 = j >= 0 ? hc[j].en : 0;
        bEn.set(b1, bEn.get(b1)! - en1 + en2);
        bEn.set(b2, (bEn.get(b2) ?? 0) + en1 - en2);
        if (j < 0) {
          bSay.set(b1, bSay.get(b1)! - 1);
          bSay.set(b2, (bSay.get(b2) ?? 0) + 1);
        }
      }
    } else {
      h.yuva = eskiY;
      if (j >= 0) hc[j].yuva = hedef;
    }
  }
  // board'lardaki sıra yuva sırası; sütunlar eşit aralıkla
  const out = new Map<string, [BbBoard, number]>();
  for (const [b, list] of yuvalar) {
    const icerik = list.map((y) => yIcerik[y]).filter((i) => i >= 0);
    const [sol, sag] = aralik(b);
    const s = sutunlariDiz(icerik.map((i) => hc[i].n / 2), sol, sag)!;
    icerik.forEach((i, q) => out.set(hc[i].ci.ref, [b, s[q]]));
  }
  return out;
}
