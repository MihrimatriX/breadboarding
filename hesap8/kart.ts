// 8 bit hesap makinesi: iki 8 bitlik sayı DIP anahtarlarla, işlem 2'li bir DIP anahtarla seçilir;
// sayılar ve sonuç onluk 7 segment göstergelerde görünür. Program yok: bütün işlem 74HC çiplerinde,
// tamamen birleşimsel (saat yok). Anahtar değişince sonuç yalnızca kapı gecikmeleri kadar sonra
// (yüzlerce nanosaniye) göstergeye gelir.
//
// Şema = kod: aynı tanımdan kapı seviyesi simülasyon, 3D görünüm, KiCad şeması, BOM ve kurulum
// belgesi üretilir (CPU16 kartlarıyla aynı altyapı, cpu16/board/).
//
// Bloklar (hesap8/docs/tasarim.md):
//   Anahtarlar     A (8 bit), B (8 bit), işlem (2 bit), lamba testi; işlem LED'leri
//   Toplama/çıkarma  A + B ya da A − B (eksiyse işaret ve |A − B|)
//   Çarpma         8 × 8 dizi çarpıcı: 64 AND kapısı ve 7 sıra toplayıcı → 16 bit
//   Bölme          8 basamaklı geri yüklemeli bölücü → bölüm ve kalan; B = 0 → HATA
//   Sonuç seçici   işlem anahtarı 4 sonuçtan birini seçer (16 × 4'ten 1'e)
//   Onluğa çevirme ikiliden BCD'ye "3 ekle ve kaydır" ağı (her modül: ≥ 5 ise 3 ekle)
//   Göstergeler    her hane bir 74HC4511 + 8 × 470 Ω dizi + ortak katot gösterge; baştaki
//                  sıfırlar söner

import { Board, erc, type ChipInstance } from "../cpu16/board/board.ts";
import { onlugaCevir, type BcdAgi } from "./bcd.ts";
import { Havuz } from "./havuz.ts";

type Net = number;

export const ISLEMLER = [
  { kod: 0, ad: "toplama", simge: "+" },
  { kod: 1, ad: "çıkarma", simge: "−" },
  { kod: 2, ad: "çarpma", simge: "×" },
  { kod: 3, ad: "bölme", simge: "÷" },
] as const;

export type GrupAdi = "a" | "b" | "sonuc" | "kalan";

export interface Hane {
  /** göstergenin referansı (DISP_7SEG_CC) */
  ref: string;
  /** sürücü çip (74HC4511) */
  surucu: string;
  /** segment dizisi (RN_470_ISO_8) */
  dizi: string;
  /** a..g segmentlerini süren netler (4511 çıkışları, dirençten önce) */
  seg: Net[];
  /** hanenin BCD girişi (D0..D3); sabit 0 olan bitler GND */
  bcd: Net[];
}

export interface GostergeGrubu {
  ad: GrupAdi;
  baslik: string;
  /** en anlamlı haneden en az anlamlıya (soldan sağa) */
  haneler: Hane[];
  /** eksi işareti hanesi (yalnızca sonuçta): yalnız g segmenti, NEG ile */
  isaret?: { ref: string; g: Net };
}

export interface HesapKarti {
  board: Board;
  /** A0..A7, B0..B7 (bit 0 en düşük) ve işlem anahtarları OP0, OP1; anahtar kapalıyken çekme direnci 0 yapar */
  a: Net[];
  b: Net[];
  op: Net[];
  /** lamba testi butonu (basılıyken 0): bütün segmentler yanar */
  ltN: Net;
  anahtarlar: { a: string; b: string; islem: string; lambaTesti: string };
  gruplar: GostergeGrubu[];
  /** iç sonuçlar (testler ve yan panel) */
  ic: {
    toplamFark: Net[]; // |A ± B| alt 8 bit
    toplamElde: Net; // toplamanın 9. biti
    negatif: Net;
    carpim: Net[]; // 16 bit
    bolum: Net[];
    kalan: Net[];
    sonuc: Net[]; // seçilen 16 bit
    hata: Net; // sıfıra bölme
    islem: Net[]; // TOPLA, CIKAR, CARP, BOL (aktif yüksek)
  };
  bcd: Record<GrupAdi, BcdAgi>;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function buildHesapBoard(): HesapKarti {
  const b = new Board();
  b.card = "hesap";
  const GND = b.c.GND;

  // ------------------------------------------------------------ anahtarlar
  b.block = "Anahtarlar";
  const A = b.bus("A", 8);
  const B = b.bus("B", 8);
  const OP = b.bus("OP", 2);
  // anahtar 1 en anlamlı bit: soldan sağa okununca ikili sayı (1. anahtar = A7)
  const swA = b.passive("SW_DIP_8", Object.fromEntries(range(8).flatMap((k) => [[String(k + 1), "VCC"], [String(16 - k), A[7 - k]]])), "A sayısı (soldan sağa A7 … A0, açık = 1)");
  b.pullDown(A, "A anahtarları açıkken 0");
  const swB = b.passive("SW_DIP_8", Object.fromEntries(range(8).flatMap((k) => [[String(k + 1), "VCC"], [String(16 - k), B[7 - k]]])), "B sayısı (soldan sağa B7 … B0, açık = 1)");
  b.pullDown(B, "B anahtarları açıkken 0");
  const swOp = b.passive("SW_DIP_2", { "1": "VCC", "2": "VCC", "4": OP[1], "3": OP[0] }, "işlem: OP1 OP0 = 00 +, 01 −, 10 ×, 11 ÷");
  b.pullDown(OP, "işlem anahtarları açıkken 0");
  const ltN = b.n("LT_N");
  const btn = b.passive("SW_PUSH", { "1": ltN, "2": "GND" }, "LAMBA TESTİ: basılıyken bütün segmentler yanar");
  b.pullUp([ltN], "lamba testi butonu çekme direnci");

  const giris = new Havuz(b, "işlem kod çözme");
  const nOp0 = giris.not(OP[0], b.n("OP0_N"));
  const nOp1 = giris.not(OP[1], b.n("OP1_N"));
  const TOPLA = giris.nor(OP[0], OP[1], b.n("TOPLA"), "işlem = toplama");
  const CIKAR = giris.and(OP[0], nOp1, b.n("CIKAR"), "işlem = çıkarma");
  const CARP = giris.and(nOp0, OP[1], b.n("CARP"), "işlem = çarpma");
  const BOL = giris.and(OP[0], OP[1], b.n("BOL"), "işlem = bölme");
  giris.bitir();
  b.led(TOPLA, "ISLEM_TOPLA");
  b.led(CIKAR, "ISLEM_CIKAR");
  b.led(CARP, "ISLEM_CARP");
  b.led(BOL, "ISLEM_BOL");

  // ------------------------------------------------------------ toplama / çıkarma
  // Çıkarma: A − B = A + ~B + 1 (OP0 = 1 iken B'nin bitleri XOR ile ters çevrilir, elde girişi 1).
  // Sonuç eksiyse (çıkarmada elde çıkışı 0) işaret yanar ve fark tekrar tümlenir: |A − B| = ~S + 1.
  b.block = "Toplama ve çıkarma";
  const ts = new Havuz(b, "toplama / çıkarma");
  const BX = B.map((x, i) => ts.xor(x, OP[0], b.n(`BX${i}`), "B ya da ~B (çıkarmada ters)"));
  ts.bitir();
  const S = b.bus("S", 8);
  const C4 = b.n("S_C4");
  const C8 = b.n("S_C8");
  topla4(b, A.slice(0, 4), BX.slice(0, 4), OP[0], S.slice(0, 4), C4, "A + B (± düşük 4 bit)");
  topla4(b, A.slice(4), BX.slice(4), C4, S.slice(4), C8, "A + B (± yüksek 4 bit, elde çıkışı = 9. bit)");
  const neg = new Havuz(b, "işaret ve tümleme");
  const nC8 = neg.not(C8, b.n("S_C8_N"));
  const NEG = neg.and(CIKAR, nC8, b.n("NEG"), "çıkarmada sonuç eksi (A < B)");
  const T8 = neg.and(C8, TOPLA, b.n("T8"), "toplamanın 9. biti (elde)");
  const SX = S.map((x, i) => neg.xor(x, NEG, b.n(`SX${i}`), "eksiyse farkın tümleyeni"));
  neg.bitir();
  const M = b.bus("M", 8);
  const M4 = b.n("M_C4");
  topla4(b, SX.slice(0, 4), [GND, GND, GND, GND], NEG, M.slice(0, 4), M4, "|A − B| = ~S + 1 (düşük 4 bit)");
  topla4(b, SX.slice(4), [GND, GND, GND, GND], M4, M.slice(4), undefined, "|A − B| = ~S + 1 (yüksek 4 bit)");

  // ------------------------------------------------------------ çarpma
  // Kısmi çarpımlar pp[i][j] = A[j]·B[i]; satır satır toplanır: her satırda bir önceki toplamın
  // bir bit sağa kaymışı ile yeni kısmi çarpım (2 × 74HC283), düşen bit çarpımın bir biti olur.
  b.block = "Çarpma";
  const pp: Net[][] = range(8).map(() => []);
  for (let i = 0; i < 8; i++) {
    const h = new Havuz(b, `kısmi çarpımlar B${i} · A`);
    for (let j = 0; j < 8; j++) pp[i][j] = h.and(A[j], B[i], b.n(`PP${i}_${j}`), `B${i}·A${j}`);
    h.bitir();
  }
  const P: Net[] = Array(16);
  P[0] = pp[0][0];
  let acc = pp[0];
  let elde: Net = GND;
  for (let i = 1; i < 8; i++) {
    const x = [...acc.slice(1), elde];
    const s = i === 7 ? range(8).map((k) => b.n(`P${7 + k}`)) : b.bus(`CS${i}_`, 8);
    const c4 = b.n(`CS${i}_C4`);
    const cout = i === 7 ? b.n("P15") : b.n(`CS${i}_C8`);
    topla4(b, x.slice(0, 4), pp[i].slice(0, 4), GND, s.slice(0, 4), c4, `çarpım satırı ${i}: + B${i}·A (düşük 4 bit)`);
    topla4(b, x.slice(4), pp[i].slice(4), c4, s.slice(4), cout, `çarpım satırı ${i}: + B${i}·A (yüksek 4 bit)`);
    P[i] = s[0];
    acc = s;
    elde = cout;
  }
  for (let k = 1; k < 8; k++) P[7 + k] = acc[k];
  P[15] = elde;

  // ------------------------------------------------------------ bölme
  // Geri yüklemeli bölme, 8 aynı basamak (A7'den A0'a): kalan bir bit sola kayar, A'nın sıradaki
  // biti girer; kalan ≥ B ise B çıkarılır ve bölümün o biti 1 olur, değilse kalan olduğu gibi kalır.
  // Kalan 9 bit olabilir (en çok 2B − 1); 9. bit 1 ise kalan kesinlikle ≥ B'dir.
  b.block = "Bölme";
  // bölme denetimi: ~B, B = 0 algılama ve her basamağın bölüm biti (kapılar bir havuzda, az çip)
  const bd = new Havuz(b, "bölme denetimi");
  const NB = B.map((x, i) => bd.not(x, b.n(`NB${i}`), "~B (çıkarma için)"));
  const BSIFIR_N = bd.nand8(NB, b.n("B_SIFIR_N"), "B = 0 ise 0");
  const Q: Net[] = Array(8);
  let R: Net[] = range(8).map(() => GND);
  for (let s = 7; s >= 0; s--) {
    const rin = [A[s], ...R.slice(0, 7)]; // 9 bitin alt 8'i
    const r8 = R[7];
    const d = b.bus(`D${s}_`, 8);
    const dc4 = b.n(`D${s}_C4`);
    const dc8 = b.n(`D${s}_C8`);
    topla4(b, rin.slice(0, 4), NB.slice(0, 4), "VCC", d.slice(0, 4), dc4, `bölme basamağı ${s}: kalan − B (düşük 4 bit)`);
    topla4(b, rin.slice(4), NB.slice(4), dc4, d.slice(4), dc8, `bölme basamağı ${s}: kalan − B (yüksek 4 bit)`);
    Q[s] = bd.or(r8, dc8, b.n(`Q${s}`), `bölümün ${s}. biti: kalan ≥ B`);
    const rn = s === 0 ? b.bus("K", 8) : b.bus(`R${s}_`, 8);
    sec4(b, rin.slice(0, 4), d.slice(0, 4), Q[s], rn.slice(0, 4), `bölme basamağı ${s}: yeni kalan (düşük 4 bit)`);
    sec4(b, rin.slice(4), d.slice(4), Q[s], rn.slice(4), `bölme basamağı ${s}: yeni kalan (yüksek 4 bit)`);
    R = rn;
  }
  const K = R;
  const BSIFIR = bd.not(BSIFIR_N, b.n("B_SIFIR"));
  const HATA = bd.and(BOL, BSIFIR, b.n("HATA"), "sıfıra bölme");
  const KALAN_YOK = bd.nand(BOL, BSIFIR_N, b.n("KALAN_SONUK"), "kalan yalnız bölmede (B ≠ 0) görünür");
  bd.bitir();
  b.led(HATA, "HATA");

  // ------------------------------------------------------------ sonuç seçici
  b.block = "Sonuç seçici";
  const SON = b.bus("SONUC", 16);
  for (let k = 0; k < 16; k += 2) {
    const kaynak = (bit: number): [Net, Net, Net, Net] =>
      bit < 8 ? [M[bit], M[bit], P[bit], Q[bit]] : bit === 8 ? [T8, GND, P[8], GND] : [GND, GND, P[bit], GND];
    const [a0, a1, a2, a3] = kaynak(k);
    const [b0, b1, b2, b3] = kaynak(k + 1);
    b.place("74HC153", {
      S0: OP[0], S1: OP[1], "~1E": GND, "~2E": GND,
      "1I0": a0, "1I1": a1, "1I2": a2, "1I3": a3, "1Y": SON[k],
      "2I0": b0, "2I1": b1, "2I2": b2, "2I3": b3, "2Y": SON[k + 1],
    }, `sonuç bit ${k} ve ${k + 1}: + − × ÷ arasından seç`);
  }

  // ------------------------------------------------------------ onluğa çevirme ve göstergeler
  const bcd: Record<GrupAdi, BcdAgi> = {
    a: onlugaCevir(b, A, 3, "Onluğa çevirme: A", "A"),
    b: onlugaCevir(b, B, 3, "Onluğa çevirme: B", "B"),
    sonuc: onlugaCevir(b, SON, 5, "Onluğa çevirme: sonuç", "SN"),
    kalan: onlugaCevir(b, K, 3, "Onluğa çevirme: kalan", "KL"),
  };
  const gruplar: GostergeGrubu[] = [
    gosterge(b, "a", "A", bcd.a, ltN, undefined),
    gosterge(b, "b", "B", bcd.b, ltN, undefined),
    gosterge(b, "sonuc", "Sonuç", bcd.sonuc, ltN, HATA, NEG),
    gosterge(b, "kalan", "Kalan", bcd.kalan, ltN, KALAN_YOK),
  ];

  // tek başına bir alet: arka panel yok, besleme 2 pinli girişten (giriş kondansatörünü finish ekler)
  b.block = "Besleme ve arka panel";
  b.passive("CONN_5V", { "1": "VCC", "2": "GND" }, "5 V besleme girişi (en çok ≈ 0,6 A: lamba testinde bütün segmentler)");
  b.finish({ backplane: false });
  return {
    board: b,
    a: A,
    b: B,
    op: OP,
    ltN,
    anahtarlar: { a: swA.ref, b: swB.ref, islem: swOp.ref, lambaTesti: btn.ref },
    gruplar,
    ic: { toplamFark: M, toplamElde: T8, negatif: NEG, carpim: P, bolum: Q, kalan: K, sonuc: SON, hata: HATA, islem: [TOPLA, CIKAR, CARP, BOL] },
    bcd,
  };
}

/** 4 bit toplayıcı (74HC283): a + b + cin → s, cout */
function topla4(b: Board, a: (Net | string)[], x: (Net | string)[], cin: Net | string, s: Net[], cout: Net | undefined, role: string): ChipInstance {
  return b.place("74HC283", {
    A1: a[0], A2: a[1], A3: a[2], A4: a[3], B1: x[0], B2: x[1], B3: x[2], B4: x[3], CIN: cin,
    S1: s[0], S2: s[1], S3: s[2], S4: s[3], ...(cout === undefined ? {} : { COUT: cout }),
  }, role);
}

/** 4 × 2'den 1'e seçici (74HC157): s = 0 → a, s = 1 → x */
function sec4(b: Board, a: Net[], x: Net[], s: Net, y: Net[], role: string): ChipInstance {
  return b.place("74HC157", {
    S: s, "~E": b.c.GND,
    "1I0": a[0], "1I1": x[0], "1Y": y[0],
    "2I0": a[1], "2I1": x[1], "2Y": y[1],
    "3I0": a[2], "3I1": x[2], "3Y": y[2],
    "4I0": a[3], "4I1": x[3], "4Y": y[3],
  }, role);
}

/**
 * Bir sayı grubunun göstergeleri: her hane 74HC4511 → 8 × 470 Ω dizi → ortak katotlu gösterge.
 * Baştaki sıfırlar söner (en sağdaki hane hiç sönmez); `sonuk` 1 iken bütün grup söner.
 */
function gosterge(b: Board, ad: GrupAdi, baslik: string, ag: BcdAgi, ltN: Net, sonuk: Net | undefined, neg?: Net): GostergeGrubu {
  b.block = `Gösterge: ${baslik}`;
  const n = ag.haneler.length;
  // hane sıfır mı (değişken bitlerin hepsi 0)
  const h = new Havuz(b, `${baslik}: baştaki sıfırları söndürme`);
  const sifir = ag.haneler.map((bits, k) => {
    if (k === 0) return null; // en düşük hane hiç sönmez
    const v = bits.filter((x) => x !== b.c.GND);
    if (v.length === 1) return h.not(v[0]);
    const o1 = v.length >= 3 ? h.or(v[0], v[1]) : v[0];
    const o2 = v.length === 4 ? h.or(v[2], v[3]) : v.length === 3 ? v[2] : v[1];
    return h.nor(o1, o2, undefined, `${baslik} ${k}. hane = 0`);
  });
  // soldan: söndür = bu hane ve soldaki bütün haneler 0
  const son: (Net | null)[] = Array(n).fill(null);
  for (let k = n - 1; k >= 1; k--) son[k] = k === n - 1 ? sifir[k]! : h.and(son[k + 1]!, sifir[k]!);
  // ~BI (aktif düşük): söndür ya da grup sönük değilse 1
  const biN = range(n).map((k) => {
    const s = son[k];
    const nm = b.n(`${ad.toUpperCase()}_BI${k}_N`);
    if (s === null && sonuk === undefined) return b.c.VCC;
    if (s === null) return h.not(sonuk!, nm, `${baslik}: grup sönük`);
    if (sonuk === undefined) return h.not(s, nm, `${baslik} ${k}. hane: baştaki sıfır`);
    return h.nor(s, sonuk, nm, `${baslik} ${k}. hane: baştaki sıfır ya da grup sönük`);
  });
  h.bitir();
  const haneler: Hane[] = [];
  for (let k = n - 1; k >= 0; k--) {
    const bits = ag.haneler[k];
    const seg = ["a", "b", "c", "d", "e", "f", "g"].map((s) => b.n(`${ad.toUpperCase()}${k}_${s}`));
    const u = b.place("74HC4511", {
      A: bits[0], B: bits[1], C: bits[2], D: bits[3], LE: b.c.GND, "~BI": biN[k], "~LT": ltN,
      a: seg[0], b: seg[1], c: seg[2], d: seg[3], e: seg[4], f: seg[5], g: seg[6],
    }, `${baslik}: ${k === 0 ? "birler" : k === 1 ? "onlar" : k === 2 ? "yüzler" : k === 3 ? "binler" : "on binler"} hanesi sürücüsü`);
    const anot = ["a", "b", "c", "d", "e", "f", "g"].map((s) => b.n(`${ad.toUpperCase()}${k}_${s}_LED`));
    const dizi = b.passive("RN_470_ISO_8", Object.fromEntries(range(7).flatMap((i) => [[String(i + 1), seg[i]], [String(16 - i), anot[i]]])), `${baslik} ${k}. hane segment dirençleri (a … g)`);
    // gösterge pinleri: 1 e, 2 d, 3 CC, 4 c, 5 DP, 6 b, 7 a, 8 CC, 9 f, 10 g
    const disp = b.passive("DISP_7SEG_CC", {
      "7": anot[0], "6": anot[1], "4": anot[2], "2": anot[3], "1": anot[4], "9": anot[5], "10": anot[6], "3": "GND", "8": "GND",
    }, `${baslik}: ${k}. hane`);
    haneler.push({ ref: disp.ref, surucu: u.ref, dizi: dizi.ref, seg, bcd: bits });
  }
  let isaret: GostergeGrubu["isaret"];
  if (neg !== undefined) {
    const anot = b.n("ISARET_g_LED");
    b.passive("R_330", { "1": neg, "2": anot }, `${baslik}: eksi işareti direnci`);
    const disp = b.passive("DISP_7SEG_CC", { "10": anot, "3": "GND", "8": "GND" }, `${baslik}: eksi işareti (yalnız g segmenti)`);
    isaret = { ref: disp.ref, g: neg };
  }
  return { ad, baslik, haneler, isaret };
}

/** Kural denetimi: dış girişler anahtarlar (çekme dirençli) */
export function hesapErc(k: HesapKarti): string[] {
  return erc(k.board);
}

/** KiCad şemasının sayfaları (tek sayfaya sığmaz): her sayfa bir ya da iki blok */
export const HESAP_SAYFALARI: { name: string; file: string; blocks: string[] }[] = [
  { name: "Anahtarlar, işlem seçimi, besleme", file: "hesap-anahtarlar.kicad_sch", blocks: ["Anahtarlar", "Besleme ve arka panel"] },
  { name: "Toplama ve çıkarma", file: "hesap-toplama.kicad_sch", blocks: ["Toplama ve çıkarma"] },
  { name: "Çarpma (8 × 8 dizi çarpıcı)", file: "hesap-carpma.kicad_sch", blocks: ["Çarpma"] },
  { name: "Bölme (geri yüklemeli, 8 basamak)", file: "hesap-bolme.kicad_sch", blocks: ["Bölme"] },
  { name: "Sonuç seçici", file: "hesap-secici.kicad_sch", blocks: ["Sonuç seçici"] },
  { name: "Onluğa çevirme: A ve B", file: "hesap-onluk-ab.kicad_sch", blocks: ["Onluğa çevirme: A", "Onluğa çevirme: B"] },
  { name: "Onluğa çevirme: sonuç (16 bit)", file: "hesap-onluk-sonuc.kicad_sch", blocks: ["Onluğa çevirme: sonuç"] },
  { name: "Onluğa çevirme: kalan", file: "hesap-onluk-kalan.kicad_sch", blocks: ["Onluğa çevirme: kalan"] },
  { name: "Göstergeler: A ve B", file: "hesap-gosterge-ab.kicad_sch", blocks: ["Gösterge: A", "Gösterge: B"] },
  { name: "Göstergeler: sonuç ve kalan", file: "hesap-gosterge-sonuc.kicad_sch", blocks: ["Gösterge: Sonuç", "Gösterge: Kalan"] },
];
