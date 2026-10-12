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

import type { ChipInstance } from "../../cpu16/board/board.ts";
import { boardAdi, kafesKonumu, rayDeligiVar } from "../../cpu16/board/breadboard/geometri.ts";
import {
  dipBacaklari, gostergeBacaklari, ikiBacak, izgaraNoktasi, pinNeti, tavlama, type Asama, type BbBacak, type BbBoard, type BbParca, type BbYerlesim, type ParcaTuru,
} from "../../cpu16/board/breadboard/yerlesim.ts";
import type { HesapKarti } from "../kart.ts";

export type { Asama, BbBacak, BbBoard, BbParca, BbYerlesim, ParcaTuru } from "../../cpu16/board/breadboard/yerlesim.ts";
export { pinNeti, pinNumaralari, sutunlariDiz } from "../../cpu16/board/breadboard/yerlesim.ts";

// ---------------------------------------------------------------- aşamalar

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

/** Board kodunun modülü (taban plakasındaki ada): d…, g…, o… ve G… kodları ilk harfleriyle birer modül */
export const MODUL_KODU = (kod: string): string => (/^[dgoG]/.test(kod) ? kod[0] : kod);

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

const G = izgaraNoktasi;

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
  // modüller arasında boşluk: göstergeler, sürücüler, onluğa çevirme ve giriş birer modül (A, B, sonuç
  // ve kalan kolları aynı modülde), çarpma, bölme, toplama ve sonuç seçici birer modül
  const kafes = kafesKonumu(nx, ny, (bx, by) => MODUL_KODU(IZGARA[by][bx]));
  for (let by = 0; by < ny; by++) {
    for (let bx = 0; bx < nx; bx++) {
      const kod = IZGARA[by][bx];
      const [rol, asama] = ROL_ADI[kod];
      const no = boards.length;
      const bb: BbBoard = { no, ad: boardAdi(no), bx, by, ...kafes(bx, by), rol, asama };
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
    // bölge bölge: 74HC4511'ler önce ve yalnız sürücü board'larına (göstergelerin hemen önü)
    const bolgeler = BOLGELER.map((bolge) => {
      const list = board.chips.filter((c) => bolge.bloklar.includes(c.block));
      return {
        boards: bolge.kodlar.flatMap((kod) => kodBoardlari.get(kod)!),
        cipler: [...list.filter((c) => c.def.part === "74HC4511"), ...list.filter((c) => c.def.part !== "74HC4511")],
        izin: (ci: ChipInstance) => (ci.def.part === "74HC4511" && bolge.surucu ? kodBoardlari.get(bolge.surucu)! : undefined),
      };
    });
    const tavla = tavlama(bolgeler, sabitNoktalar, { tohum: 80008, adim: 1_200_000, T0: 25, Tson: 0.05, yuva: 5 });
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

