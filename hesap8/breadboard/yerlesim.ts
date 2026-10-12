// Hesap makinesinin breadboard yerleşimi: hangi parça hangi board'da, hangi deliklerde.
//
// Taban plakasında 5 × 12 = 60 board (BB01 sol arka köşe, satır satır BB60 sağ ön köşe). Veri akışı
// önden arkaya: ön kenarda anahtarlar (kullanıcının eli), arkada işlem blokları, en arkada
// göstergeler (hesap makinesindeki gibi: tuşlar önde, ekran üstte):
//
//          X0        X1        X2         X3         X4
//   Y0    gösterge A gösterge B sonuç (−, 4, 3) sonuç (2, 1, 0) kalan   ← göstergeler (arka kenar)
//   Y1    sürücü A   sürücü B   sürücü S   sürücü S   sürücü K     ← 74HC4511 + söndürme kapıları
//   Y2–4  onluk A    onluk B    onluk S    onluk S    onluk K
//   Y5–8  çarpma     çarpma     onluk S    onluk S    bölme
//   Y9–10 toplama    seçici     seçici     bölme      bölme
//   Y11   toplama    giriş 1    giriş 2    bölme      bölme       ← anahtarlar (ön kenar)
//
// Board başına en çok 5 çip (tellere yer kalsın: 213 mantık çipi 53 board'a, ortalama 4). Bütün
// DIP'ler (çipler, DIP anahtarlar, 470 Ω diziler) ve göstergeler orta kanalın üstünde, çentik solda. Göstergelerin pin sıraları 15,24 mm arayla d ve h satırlarına oturur. Mantık çipleri her
// bölgenin board'larına benzetilmiş tavlamayla (tohumlu, her çalışmada aynı sonuç) dağıtılır: netlerin
// toplam yarım çevresi en küçük olsun, board'lar taşmasın. El yerleşimi: göstergeler, anahtarlar,
// LED'ler, buton, besleme girişi. 100 nF'lar çipin hemen üstünde, üst ray çiftinin arasında.

import type { ChipInstance, Passive } from "../../cpu16/board/board.ts";
import { PASSIVES } from "../../cpu16/board/passives.ts";
import type { HesapKarti } from "../kart.ts";
import { BX_ADIM, BY_ADIM, boardAdi, kureselX, kureselY, rayDeligiVar, type BbKonum } from "./geometri.ts";

export type ParcaTuru = "dip" | "gosterge" | "sip" | "direnc" | "led" | "kondansator" | "elektrolitik" | "buton" | "konnektor";

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
}

export interface BbBoard extends BbKonum {
  /** board'un işi, ör. "Çarpma", "Gösterge: sonuç (±, 4, 3)" */
  rol: string;
  /** en çok parçası hangi aşamada takılıyorsa */
  asama: number;
}

export interface BbYerlesim {
  nx: number;
  ny: number;
  boards: BbBoard[];
  parcalar: BbParca[];
}

// ---------------------------------------------------------------- aşamalar

export interface Asama {
  no: number;
  ad: string;
  bloklar: string[];
}

/** Kurulum aşamaları: her aşamanın sonunda bir test (kurulum-rehberi.md) */
export const ASAMALAR: Asama[] = [
  { no: 1, ad: "Taban, besleme ve anahtarlar", bloklar: ["Anahtarlar", "Besleme ve arka panel"] },
  { no: 2, ad: "A sayısının göstergesi", bloklar: ["Onluğa çevirme: A", "Gösterge: A"] },
  { no: 3, ad: "B sayısının göstergesi", bloklar: ["Onluğa çevirme: B", "Gösterge: B"] },
  { no: 4, ad: "Toplama ve çıkarma", bloklar: ["Toplama ve çıkarma"] },
  { no: 5, ad: "Çarpma", bloklar: ["Çarpma"] },
  { no: 6, ad: "Bölme", bloklar: ["Bölme"] },
  { no: 7, ad: "Sonuç seçici, sonuç ve kalan göstergeleri", bloklar: ["Sonuç seçici", "Onluğa çevirme: sonuç", "Onluğa çevirme: kalan", "Gösterge: Sonuç", "Gösterge: Kalan"] },
];

export function blokAsamasi(blok: string): number {
  const a = ASAMALAR.find((x) => x.bloklar.includes(blok));
  if (!a) throw new Error(`aşaması olmayan blok: ${blok}`);
  return a.no;
}

// ---------------------------------------------------------------- taban planı

/** Board'ların işi: d = gösterge, g = sürücü, o = onluğa çevirme, ç/b/t/s = çarpma/bölme/toplama/seçici, G = giriş */
const IZGARA: string[][] = [
  ["dA", "dB", "dS1", "dS2", "dK"],
  ["gA", "gB", "gS", "gS", "gK"],
  ["oA", "oB", "oS", "oS", "oK"],
  ["oA", "oB", "oS", "oS", "oK"],
  ["oA", "oB", "oS", "oS", "oK"],
  ["ç", "ç", "oS", "oS", "b"],
  ["ç", "ç", "oS", "oS", "b"],
  ["ç", "ç", "oS", "oS", "b"],
  ["ç", "ç", "oS", "oS", "b"],
  ["t", "s", "s", "b", "b"],
  ["t", "s", "s", "b", "b"],
  ["t", "G1", "G2", "b", "b"],
];

const ROL_ADI: Record<string, [string, number]> = {
  dA: ["Gösterge: A", 2], dB: ["Gösterge: B", 3], dS1: ["Gösterge: sonuç (−, 4, 3)", 7], dS2: ["Gösterge: sonuç (2, 1, 0) ve HATA", 7], dK: ["Gösterge: kalan", 7],
  gA: ["Sürücüler: A", 2], gB: ["Sürücüler: B", 3], gS: ["Sürücüler: sonuç", 7], gK: ["Sürücüler: kalan", 7],
  oA: ["Onluğa çevirme: A", 2], oB: ["Onluğa çevirme: B", 3], oS: ["Onluğa çevirme: sonuç", 7], oK: ["Onluğa çevirme: kalan", 7],
  ç: ["Çarpma", 5], b: ["Bölme", 6], t: ["Toplama ve çıkarma", 4], s: ["Sonuç seçici", 7],
  G1: ["Giriş: A ve B anahtarları", 1], G2: ["Giriş: işlem, lamba testi, besleme", 1],
};

/** Mantık çiplerinin bölgeleri: hangi bloklar hangi board'lara (tavlama yalnız bölge içinde değiştirir) */
interface Bolge {
  kodlar: string[];
  bloklar: string[];
  /** 74HC4511'ler yalnız bu board'lara (göstergelerin hemen önü) */
  surucu?: string;
}
const BOLGELER: Bolge[] = [
  { kodlar: ["gA", "oA"], bloklar: ["Onluğa çevirme: A", "Gösterge: A"], surucu: "gA" },
  { kodlar: ["gB", "oB"], bloklar: ["Onluğa çevirme: B", "Gösterge: B"], surucu: "gB" },
  { kodlar: ["gS", "oS"], bloklar: ["Onluğa çevirme: sonuç", "Gösterge: Sonuç"], surucu: "gS" },
  { kodlar: ["gK", "oK"], bloklar: ["Onluğa çevirme: kalan", "Gösterge: Kalan"], surucu: "gK" },
  { kodlar: ["ç"], bloklar: ["Çarpma"] },
  { kodlar: ["b"], bloklar: ["Bölme"] },
  { kodlar: ["t"], bloklar: ["Toplama ve çıkarma"] },
  { kodlar: ["s"], bloklar: ["Sonuç seçici"] },
];

/** Çiplerin kullanabileceği sütunlar: 1–61 (62–63 board içi ray köprülerinin yolu) */
const SOL = 1;
const SAG = 61;

// ---------------------------------------------------------------- parça kalıpları

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

const G = (b: BbBoard, r: number, c: number) => ({ X: kureselX(b.bx, c), Y: kureselY(b.by, r) });

/** DIP (çip, DIP anahtar, DIP-16 dizi): 1. pin f satırında c0'da, n. pin e satırında c0'da */
function dipBacaklari(b: BbBoard, c0: number, n: number): { bacaklar: BbBacak[]; govde: BbParca["govde"] } {
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

/** 0,56" gösterge: 1–5 h satırında soldan sağa, 6–10 d satırında sağdan sola; gövde d…h */
function gostergeBacaklari(b: BbBoard, c0: number): { bacaklar: BbBacak[]; govde: BbParca["govde"] } {
  const bacaklar: BbBacak[] = [];
  for (let k = 1; k <= 10; k++) bacaklar.push({ pin: k, ...(k <= 5 ? G(b, 12, c0 + k - 1) : G(b, 6, c0 + 10 - k)) });
  const a = G(b, 6, c0);
  const z = G(b, 12, c0 + 4);
  return { bacaklar, govde: [a.X, a.Y, z.X, z.Y] };
}

/** İki bacaklı eleman: gövde bacakların arası (bacaklar dahil) */
function ikiBacak(p1: { X: number; Y: number }, p2: { X: number; Y: number }, pinler: [number, number] = [1, 2]): { bacaklar: BbBacak[]; govde: BbParca["govde"] } {
  return {
    bacaklar: [{ pin: pinler[0], ...p1 }, { pin: pinler[1], ...p2 }],
    govde: [Math.min(p1.X, p2.X), Math.min(p1.Y, p2.Y), Math.max(p1.X, p2.X), Math.max(p1.Y, p2.Y)],
  };
}

// ---------------------------------------------------------------- yerleşim

/**
 * Yerleşim. `yerler` verilirse mantık çipleri tavlanmaz, saklanan yerlerine (ref → [board adı, 1. pinin
 * sütunu]) konur (veri.ts); verilmezse tavlama (birkaç saniye).
 */
export function bbYerlesimi(k: HesapKarti, yerler?: Map<string, [string, number]>): BbYerlesim {
  const board = k.board;
  const ny = IZGARA.length;
  const nx = IZGARA[0].length;
  const boards: BbBoard[] = [];
  const kodBoardlari = new Map<string, BbBoard[]>();
  for (let by = 0; by < ny; by++) {
    for (let bx = 0; bx < nx; bx++) {
      const kod = IZGARA[by][bx];
      const [rol, asama] = ROL_ADI[kod];
      const no = boards.length;
      const bb: BbBoard = { no, ad: boardAdi(no), bx, by, rol, asama };
      boards.push(bb);
      if (!kodBoardlari.has(kod)) kodBoardlari.set(kod, []);
      kodBoardlari.get(kod)!.push(bb);
    }
  }
  const tek = (kod: string) => kodBoardlari.get(kod)![0];
  const parcalar: BbParca[] = [];
  const pasif = new Map(board.passives.map((p) => [p.ref, p]));
  const yerlesti = new Set<string>();

  const pasifEkle = (ref: string, b: BbBoard, tur: ParcaTuru, sutun: number, g: { bacaklar: BbBacak[]; govde: BbParca["govde"] }, ek: Partial<BbParca> = {}) => {
    const p = pasif.get(ref);
    if (!p) throw new Error(`pasif yok: ${ref}`);
    if (yerlesti.has(ref)) throw new Error(`iki kez yerleşti: ${ref}`);
    yerlesti.add(ref);
    parcalar.push({ ref, part: p.part, cipMi: false, tur, blok: p.block, rol: p.role, board: b.no, asama: blokAsamasi(p.block), ...g, sutun, ...ek });
  };
  const cipEkle = (ci: ChipInstance, b: BbBoard, c0: number) => {
    if (yerlesti.has(ci.ref)) throw new Error(`iki kez yerleşti: ${ci.ref}`);
    yerlesti.add(ci.ref);
    parcalar.push({ ref: ci.ref, part: ci.def.part, cipMi: true, tur: "dip", blok: ci.block, rol: ci.role, board: b.no, asama: blokAsamasi(ci.block), ...dipBacaklari(b, c0, ci.def.pins.length), sutun: c0 });
  };

  // --- göstergeler (arka kenar): her hane [470 Ω dizi][gösterge], dizinin çıkışları üst şeritlerde
  const haneYerlestir = (b: BbBoard, dizi: string, gosterge: string, c: number) => {
    pasifEkle(dizi, b, "dip", c, dipBacaklari(b, c, 16));
    pasifEkle(gosterge, b, "gosterge", c + 11, gostergeBacaklari(b, c + 11));
  };
  /** 330 Ω kanalın üstünden (üst şerit = sinyal, alt şerit = LED'in anotu), LED alt şeritten alt − rayına */
  const ledModulu = (b: BbBoard, r: string, d: string, c: number) => {
    pasifEkle(r, b, "direnc", c, ikiBacak(G(b, 7, c), G(b, 10, c)));
    pasifEkle(d, b, "led", c, ikiBacak(G(b, 14, c), G(b, 16, c)));
  };
  const grup = (ad: string) => k.gruplar.find((g) => g.ad === ad)!;
  const haneler3 = (kod: string, ad: string) => {
    const b = tek(kod);
    grup(ad).haneler.forEach((h, i) => haneYerlestir(b, h.dizi, h.ref, 4 + i * 20));
  };
  haneler3("dA", "a");
  haneler3("dB", "b");
  haneler3("dK", "kalan");
  {
    const s = grup("sonuc");
    const b1 = tek("dS1");
    const b2 = tek("dS2");
    // eksi işareti: 330 Ω a satırında, 2. bacağı işaret göstergesinin 10. pininin (g) şeridinde
    const isaret = s.isaret!;
    const rIsaret = board.passives.find((p) => p.part === "R_330" && Object.values(p.pins).includes(isaret.g))!;
    pasifEkle(isaret.ref, b1, "gosterge", 15, gostergeBacaklari(b1, 15));
    pasifEkle(rIsaret.ref, b1, "direnc", 12, ikiBacak(G(b1, 3, 12), G(b1, 3, 15)));
    haneYerlestir(b1, s.haneler[0].dizi, s.haneler[0].ref, 22);
    haneYerlestir(b1, s.haneler[1].dizi, s.haneler[1].ref, 42);
    s.haneler.slice(2).forEach((h, i) => haneYerlestir(b2, h.dizi, h.ref, 4 + i * 18));
    // HATA LED'i sonucun sağında
    const rHata = board.passives.find((p) => p.part === "R_330" && /^HATA\b/.test(p.role))!;
    const dHata = board.passives.find((p) => p.part === "LED" && /^HATA\b/.test(p.role))!;
    ledModulu(b2, rHata.ref, dHata.ref, 59);
  }

  // --- giriş 1: A ve B anahtarları; 10 kΩ SIP'ler anahtarların üst şeritlerinde (d satırı, ters:
  // 9. pin solda), ortak uç anahtarın sağındaki şeritte
  const sipYerlestir = (ref: string, b: BbBoard, r: number, c0: number) => {
    const bacaklar: BbBacak[] = [];
    for (let p = 1; p <= 9; p++) bacaklar.push({ pin: p, ...G(b, r, c0 + 9 - p) });
    const a = G(b, r, c0);
    const z = G(b, r, c0 + 8);
    pasifEkle(ref, b, "sip", c0, { bacaklar, govde: [a.X, a.Y, z.X, z.Y] }, { ters: true });
  };
  const cekme = (net: number) => board.passives.find((p) => p.part === "RN_10K_8" && Object.values(p.pins).includes(net))!.ref;
  {
    const b = tek("G1");
    pasifEkle(k.anahtarlar.a, b, "dip", 10, dipBacaklari(b, 10, 16));
    sipYerlestir(cekme(k.a[0]), b, 6, 10);
    pasifEkle(k.anahtarlar.b, b, "dip", 36, dipBacaklari(b, 36, 16));
    sipYerlestir(cekme(k.b[0]), b, 6, 36);
  }
  // --- giriş 2: işlem anahtarı (SIP'in boş 6 pini solundaki ölü şeritlerde), işlem LED'leri,
  // lamba testi butonu, işlem kod çözme çipleri, besleme girişi ve 100 µF alt rayda
  {
    const b = tek("G2");
    const cOp = 9;
    pasifEkle(k.anahtarlar.islem, b, "dip", cOp, dipBacaklari(b, cOp, 4));
    sipYerlestir(cekme(k.op[0]), b, 6, cOp - 6);
    const islemAdlari = ["TOPLA", "CIKAR", "CARP", "BOL"];
    islemAdlari.forEach((ad, i) => {
      const r = board.passives.find((p) => p.part === "R_330" && p.role.startsWith(`ISLEM_${ad} `))!;
      const d = board.passives.find((p) => p.part === "LED" && p.role.startsWith(`ISLEM_${ad} `))!;
      ledModulu(b, r.ref, d.ref, 15 + 2 * i);
    });
    const cBtn = 24;
    const btn = k.anahtarlar.lambaTesti;
    pasifEkle(btn, b, "buton", cBtn, {
      bacaklar: [{ pin: 1, ...G(b, 7, cBtn) }, { pin: 1, ...G(b, 10, cBtn) }, { pin: 2, ...G(b, 7, cBtn + 2) }, { pin: 2, ...G(b, 10, cBtn + 2) }],
      govde: [G(b, 7, cBtn).X, G(b, 7, cBtn).Y, G(b, 10, cBtn + 2).X, G(b, 10, cBtn + 2).Y],
    });
    const rLt = board.passives.find((p) => p.part === "R_10K" && Object.values(p.pins).includes(k.ltN))!;
    // 10 kΩ dik: 1. bacak (VCC) üst + rayında, 2. bacak LT_N şeridinin a deliğinde
    pasifEkle(rLt.ref, b, "direnc", cBtn, ikiBacak(G(b, 0, cBtn), G(b, 3, cBtn)));
    const kod = board.chips.filter((c) => c.block === "Anahtarlar");
    kod.forEach((ci, i) => cipEkle(ci, b, 32 + i * 10));
    const j1 = board.passives.find((p) => p.part === "CONN_5V")!;
    const c1 = board.passives.find((p) => p.part === "C_100U")!;
    // besleme girişi alt ray çiftinde: 1. pin (+5 V) dış + rayında, 2. pin iç − rayında
    pasifEkle(j1.ref, b, "konnektor", 55, ikiBacak(G(b, 17, 55), G(b, 16, 55)));
    pasifEkle(c1.ref, b, "elektrolitik", 57, ikiBacak(G(b, 17, 57), G(b, 16, 57)));
  }

  // --- mantık çipleri: bölge bölge tavlama
  const sabitNoktalar = new Map<number, { X: number; Y: number }[]>();
  for (const p of parcalar) {
    const x = p.cipMi ? board.chips.find((c) => c.ref === p.ref)! : pasif.get(p.ref)!;
    for (const bc of p.bacaklar) {
      const net = pinNeti(x, bc.pin);
      if (net <= 1) continue;
      if (!sabitNoktalar.has(net)) sabitNoktalar.set(net, []);
      // dizinin girişleri ve SIP: telin çıkacağı yer şeridin dış ucu
      sabitNoktalar.get(net)!.push({ X: bc.X, Y: bc.Y });
    }
  }
  if (yerler) {
    const adla = new Map(boards.map((b) => [b.ad, b]));
    for (const ci of board.chips) {
      if (yerlesti.has(ci.ref)) continue;
      const y = yerler.get(ci.ref);
      if (!y) throw new Error(`saklanan yerleşimde çip yok: ${ci.ref}`);
      const b = adla.get(y[0]);
      if (!b) throw new Error(`saklanan yerleşimde bilinmeyen board: ${y[0]}`);
      cipEkle(ci, b, y[1]);
    }
  } else {
    const tavla = tavlama(board.chips, kodBoardlari, sabitNoktalar);
    for (const [ref, [b, c0]] of tavla) cipEkle(board.chips.find((c) => c.ref === ref)!, b, c0);
  }

  // --- dekuplaj: her çipin 100 nF'ı üst ray çiftinin arasında, VCC bacağının hemen sağındaki ray sütununda
  const dolu = new Set<string>();
  const cips = parcalar.filter((p) => p.cipMi);
  for (const p of cips) {
    const b = boards[p.board];
    const n = p.bacaklar.length;
    const c100 = board.passives.find((q) => q.part === "C_100N" && q.role === `${p.ref} dekuplaj`);
    if (!c100) throw new Error(`dekuplaj yok: ${p.ref}`);
    let cx = -1;
    for (const c of [p.sutun + 1, p.sutun + 2, p.sutun + 3, p.sutun + 4, p.sutun + 5, p.sutun - 1, p.sutun + n / 2]) {
      // 3–5 ve 59–61 ray köprülerinin uçları
      if (c >= 6 && c <= 58 && rayDeligiVar(c) && !dolu.has(`${b.no}:${c}`)) {
        cx = c;
        break;
      }
    }
    if (cx < 0) throw new Error(`dekuplaj yeri yok: ${p.ref}`);
    dolu.add(`${b.no}:${cx}`);
    pasifEkle(c100.ref, b, "kondansator", cx, ikiBacak(G(b, 0, cx), G(b, 1, cx)), { bagliCip: p.ref });
  }

  const eksik = [...board.chips.map((c) => c.ref), ...board.passives.map((p) => p.ref)].filter((r) => !yerlesti.has(r));
  if (eksik.length) throw new Error(`yerleşmeyen parçalar: ${eksik.join(", ")}`);
  return { nx, ny, boards, parcalar };
}

// ---------------------------------------------------------------- tavlama

/** Basit, tohumlu sözde rastgele sayı (mulberry32): yerleşim her çalışmada aynı */
function rastgele(tohum: number): () => number {
  let a = tohum >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Board'daki çiplerin sol sütunları: boşluklar eşit, artan sütunlar ortaya yakın aralıklara */
export function sutunlariDiz(enler: number[]): number[] | null {
  const n = enler.length;
  if (!n) return [];
  const toplam = enler.reduce((a, x) => a + x, 0);
  const bos = SAG - SOL + 1 - toplam;
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
  let c = SOL + ara[0];
  for (let i = 0; i < n; i++) {
    out.push(c);
    c += enler[i] + ara[i + 1];
  }
  return out;
}

/** Çiplerin pin konumları (tavlamada telin çıkacağı satır: üst pinler c, alt pinler h) */
function pinOfseti(n: number, num: number): [number, number] {
  const half = n / 2;
  return num <= half ? [num - 1, 12] : [n - num, 5];
}

/** Tavlamada board başına 5 yuva (en çok 5 çip), sonunda boşluklar eşitlenir */
const YUVA = 5;
const YUVA_EN = (SAG - SOL + 1) / YUVA;

function tavlama(chips: ChipInstance[], kodBoardlari: Map<string, BbBoard[]>, sabit: Map<number, { X: number; Y: number }[]>): Map<string, [BbBoard, number]> {
  const rnd = rastgele(80008);
  interface Hc { ci: ChipInstance; n: number; izin: number[]; yuva: number }
  // yuvalar: [board, sıra]
  const yBoard: BbBoard[] = [];
  const yX: number[] = [];
  const yY: number[] = [];
  const yIcerik: number[] = [];
  const hc: Hc[] = [];
  const yuvalar = new Map<BbBoard, number[]>();
  // board başına toplam en ve çip sayısı (sığma denetimi: en + aralar ≤ 61)
  const bEn = new Map<BbBoard, number>();
  const bSay = new Map<BbBoard, number>();
  const sigar = (b: BbBoard, ekEn: number, ekSay: number) => (bEn.get(b) ?? 0) + ekEn + (bSay.get(b) ?? 0) + ekSay - 1 <= SAG - SOL + 1;
  const yuvaAc = (b: BbBoard): number[] => {
    if (!yuvalar.has(b)) {
      const list: number[] = [];
      for (let k = 0; k < YUVA; k++) {
        list.push(yBoard.length);
        yBoard.push(b);
        yX.push(b.bx * BX_ADIM + SOL + Math.round(k * YUVA_EN));
        yY.push(b.by * BY_ADIM);
        yIcerik.push(-1);
      }
      yuvalar.set(b, list);
    }
    return yuvalar.get(b)!;
  };
  for (const bolge of BOLGELER) {
    const boards = bolge.kodlar.flatMap((kod) => kodBoardlari.get(kod)!);
    const hepsi = boards.flatMap(yuvaAc);
    const surucu = bolge.surucu ? kodBoardlari.get(bolge.surucu)!.flatMap(yuvaAc) : hepsi;
    const list = chips.filter((c) => bolge.bloklar.includes(c.block));
    const sirali = [...list.filter((c) => c.def.part === "74HC4511"), ...list.filter((c) => c.def.part !== "74HC4511")];
    for (const ci of sirali) {
      const izin = ci.def.part === "74HC4511" ? surucu : hepsi;
      // başlangıç: netlist sırasıyla, board'lara dengeli (her board'un sıradaki boş yuvası)
      const bos = izin.filter((y) => yIcerik[y] < 0);
      if (!bos.length) throw new Error(`bölge sığmıyor: ${bolge.kodlar.join(",")}`);
      const doluluk = (y: number) => yuvalar.get(yBoard[y])!.filter((q) => yIcerik[q] >= 0).length;
      const y = bos.filter((q) => sigar(yBoard[q], ci.def.pins.length / 2, 0)).sort((a, b) => doluluk(a) - doluluk(b) || a - b)[0];
      if (y === undefined) throw new Error(`bölge sığmıyor: ${bolge.kodlar.join(",")}`);
      yIcerik[y] = hc.length;
      hc.push({ ci, n: ci.def.pins.length, izin, yuva: y });
      bEn.set(yBoard[y], (bEn.get(yBoard[y]) ?? 0) + ci.def.pins.length / 2);
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
  const px = new Float64Array(64);
  const py = new Float64Array(64);
  const enYakin = new Float64Array(64);
  const agacta = new Uint8Array(64);
  const netMaliyeti = (j: number): number => {
    let k = 0;
    for (const u of hUc[j]) {
      const y = hc[u.i].yuva;
      px[k] = yX[y] + u.dx;
      py[k] = (yY[y] + u.dy) * 1.3;
      k++;
    }
    for (const p of sUc[j]) {
      px[k] = p.X;
      py[k] = p.Y * 1.3;
      k++;
    }
    if (k <= 1) return 0;
    if (k === 2) return Math.abs(px[0] - px[1]) + Math.abs(py[0] - py[1]);
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
      son = ei;
    }
    return toplam;
  };
  const nm = new Float64Array(netler.length);
  for (let j = 0; j < netler.length; j++) nm[j] = netMaliyeti(j);
  const isaret = new Int32Array(netler.length);
  let damga = 0;
  const ADIMLAR = 1_200_000;
  let T = 25;
  const carpan = Math.pow(0.05 / T, 1 / ADIMLAR);
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
      const en1 = h.n / 2;
      const en2 = j >= 0 ? hc[j].n / 2 : 0;
      const s1 = bSay.get(b1)!;
      const s2 = bSay.get(b2) ?? 0;
      const yeniS1 = j >= 0 ? s1 : s1 - 1;
      const yeniS2 = j >= 0 ? s2 : s2 + 1;
      if (!sigar(b2, en1 - en2, yeniS2 - s2) || !sigar(b1, en2 - en1, yeniS1 - s1)) continue;
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
        const en1 = h.n / 2;
        const en2 = j >= 0 ? hc[j].n / 2 : 0;
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
    const s = sutunlariDiz(icerik.map((i) => hc[i].n / 2))!;
    icerik.forEach((i, q) => out.set(hc[i].ci.ref, [b, s[q]]));
  }
  return out;
}
