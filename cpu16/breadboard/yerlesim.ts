// CPU16 kartlarının breadboard yerleşimi: her kartın panosunda hangi parça hangi board'da, hangi
// deliklerde. Pano tanımları (ızgara, bölgeler, aşamalar) panolar.ts'te.
//
// - Şerit kablo uyarlayıcısı (kartın BACKPLANE_2x32 konnektörü) uyarlayıcı sırasındaki board'da, 32
//   sütun: k. sütunda (c0 + k − 1) 2k − 1. pin f satırında, 2k. pin e satırında.
// - Besleme: uyarlayıcı sırasındaki her board'da (her board sütununun başında) bir 5 V girişi (2 pinli
//   başlık, yalnız fiziksel parça) ve yanında 100 µF; kartın kendi 100 µF'ı (C1, C204 …) ilk girişin
//   yanında, öteki girişlerinki yalnız breadboard'a özgü ek parça. Arka sıradaki panolarda girişler
//   board'un alt ray çiftinde (ön kenar), ön sıradakilerde üst ray çiftinde (arka kenar).
// - Elle yerleşen pasifler (direnç dizileri, LED'ler, butonlar, anahtarlar, osilatörler, konnektörler)
//   board'un bir ucunda kendi sütunlarında; mantık çipleri kalan sütunlara.
// - Mantık çipleri bölge bölge tavlamayla (ortak motor, tohumlu: her çalışmada aynı sonuç) board'lara;
//   board'da hiçbir board boş kalmaz. Geniş DIP'ler (62256, 28C256) d ve h satırlarına oturur.
// - Modüler pano (tanımda `duzen`, CPU kartı): her çip grubunun çipleri yalnız grubun board'larına;
//   tek gruplu board'da çipler referans sırasıyla (R0'ın düşük baytı solda, yüksek baytı sağda).
//   Göstergeler (hata ayıklama LED'leri, çubuk göstergeler ve dirençleri) grubun "grup+" board'unda
//   ya da grubun ilk board'unun sağ ucunda: çubuk göstergeler bit 0 sağda (sayı okunur gibi), yüksek
//   bayt solda; her çubuğun direnç dizisi dış yanında; tek LED'ler bir sütunluk LED modülü.
// - Her çipin 100 nF'ı çipin hemen üstünde, üst ray çiftinin arasında (hesap makinesindeki gibi).

import type { Board, ChipInstance, Passive } from "../board/board.ts";
import { kartMetinleri, refleriAc } from "../board/bolum-bilgi.ts";
import { boardAdi, kafesKonumu, kureselX, kureselY, rayDeligiVar } from "../board/breadboard/geometri.ts";
import {
  dipBacaklari, genisDipBacaklari, ikiBacak, tersDipBacaklari, izgaraNoktasi, pinNeti, siraBacaklari, sutunlariDiz, tavlama, type BbBacak, type BbBoard, type BbParca, type BbYerlesim, type Kalip, type ParcaTuru,
} from "../board/breadboard/yerlesim.ts";
import { panoTanimi, type PanoTanimi } from "./panolar.ts";

const G = izgaraNoktasi;

export interface KartYerlesimSecenekleri {
  /** saklanan çip yerleri (ref → [board adı, 1. pinin sütunu]); verilmezse tavlama */
  yerler?: Map<string, [string, number]>;
  /** tavlama adımı (varsayılan 600 000) */
  adim?: number;
  /** pano tanımının yerine (deneme) */
  tanim?: PanoTanimi;
  /** deneme: bütün çipler tek bölgede, bütün board'lara */
  tekBolge?: boolean;
  /** tavlamada dikey uzaklığın ağırlığı */
  dikey?: number;
  /** tavlamada uzun bağlantı cezası (ızgara adımı, kat) */
  uzunCeza?: { esik: number; kat: number };
}

/** Yapıştırıcı çipin bölgesi: birimlerinin çoğunluğunun bloğu (eşitlikte ilk birim) */
export function cipBlogu(ci: ChipInstance): string {
  if (!ci.glueUnits?.length) return ci.block;
  const say = new Map<string, number>();
  for (const u of ci.glueUnits) say.set(u.block, (say.get(u.block) ?? 0) + 1);
  let en = "";
  let n = -1;
  for (const [b, k] of say) if (k > n) { en = b; n = k; }
  return en;
}

/** Besleme girişlerinin ve ek 100 µF'ların referansları (kartın referans tabanında, netlistte yok) */
const EK_TABAN: Record<string, number> = { cpu: 0, clk: 200, bellek: 400, onbellek: 500, gc: 600, video: 700, kyb: 800 };
export const beslemeRef = (kart: string, i: number): string => `JB${EK_TABAN[kart] + i + 1}`;
export const tamponRef = (kart: string, i: number): string => `CB${EK_TABAN[kart] + i + 1}`;

export function kartYerlesimi(board: Board, kart: string, o: KartYerlesimSecenekleri = {}): BbYerlesim {
  const tanim = o.tanim ?? panoTanimi(kart);
  const ny = tanim.izgara.length;
  const nx = tanim.izgara[0].length;
  const VCC = board.c.VCC;
  const GND = board.c.GND;

  // ---- aşamalar: blok → aşama
  const blokAsama = new Map<string, number>();
  for (const a of tanim.asamalar) for (const b of a.bloklar) if (!blokAsama.has(b)) blokAsama.set(b, a.no);
  const asamaOf = (blok: string): number => {
    const a = blokAsama.get(blok);
    if (a === undefined) throw new Error(`${kart}: aşaması olmayan blok: ${blok}`);
    return a;
  };
  /** çipin aşaması: yapıştırıcı çip birimlerinin en erken aşamasında takılır */
  const cipAsamasi = (ci: ChipInstance): number => (ci.glueUnits?.length ? Math.min(...ci.glueUnits.map((u) => asamaOf(u.block))) : asamaOf(ci.block));

  // ---- board'lar
  const boards: BbBoard[] = [];
  const kodBoardlari = new Map<string, BbBoard[]>();
  // modüller (bölgeler) arasında boşluk: her bölge taban plakasında ayrı bir ada
  const kafes = kafesKonumu(nx, ny, (bx, by) => tanim.izgara[by][bx]);
  for (let by = 0; by < ny; by++) {
    for (let bx = 0; bx < nx; bx++) {
      const kod = tanim.izgara[by][bx];
      const bolge = tanim.bolgeler[kod];
      if (!bolge) throw new Error(`${kart}: bilinmeyen bölge kodu ${kod}`);
      const no = boards.length;
      const bb: BbBoard = { no, ad: boardAdi(no), bx, by, ...kafes(bx, by), rol: bolge.ad, asama: 99 };
      boards.push(bb);
      if (!kodBoardlari.has(kod)) kodBoardlari.set(kod, []);
      kodBoardlari.get(kod)!.push(bb);
    }
  }
  const at = (bx: number, by: number): BbBoard => {
    const b = boards.find((q) => q.bx === bx && q.by === by);
    if (!b) throw new Error(`${kart}: board yok (${bx}, ${by})`);
    return b;
  };

  // ---- modüler yerleşim: board'ların grupları, grupların board'ları
  /** çip → grubu (bolum-metin.ts) */
  const grubu = new Map<string, string>();
  /** grup → board'ları (duzen'deki sırayla) */
  const grupBoardlari = new Map<string, BbBoard[]>();
  /** grup → göstergelerinin board'u ("grup+") */
  const gostergeBoardu = new Map<string, BbBoard>();
  if (tanim.duzen) {
    if (tanim.duzen.length !== ny || tanim.duzen.some((r) => r.length !== nx)) throw new Error(`${kart}: düzen ızgarayla aynı boyda değil`);
    for (const g of kartMetinleri(kart).gruplar) for (const r of refleriAc(g.refs)) grubu.set(r, g.id);
    for (const b of boards) {
      const ogeler = tanim.duzen[b.by][b.bx].split(/\s+/).filter(Boolean);
      b.gruplar = ogeler.map((g) => g.replace(/\+$/, ""));
      for (const o of ogeler) {
        const g = o.replace(/\+$/, "");
        if (!kartMetinleri(kart).gruplar.some((x) => x.id === g)) throw new Error(`${kart}: düzende bilinmeyen grup: ${g}`);
        if (o.endsWith("+")) {
          if (gostergeBoardu.has(g)) throw new Error(`${kart}: ${g} göstergeleri iki board'da`);
          gostergeBoardu.set(g, b);
        } else grupBoardlari.set(g, [...(grupBoardlari.get(g) ?? []), b]);
      }
    }
  }
  /** grubun board'u (modüler panoda; elle yerleşen pasifler için) */
  const grupBoardu = (g: string): BbBoard => {
    const b = grupBoardlari.get(g)?.[0];
    if (!b) throw new Error(`${kart}: düzende grup yok: ${g}`);
    return b;
  };

  // ---- parçalar ve doluluk denetimi
  const kartCipleri = board.chips.filter((c) => c.card === kart);
  const kartPasifleri = board.passives.filter((p) => p.card === kart);
  const pasif = new Map(kartPasifleri.map((p) => [p.ref, p]));
  const parcalar: BbParca[] = [];
  const yerlesti = new Set<string>();
  /** delik → ne oturuyor */
  const delik = new Map<string, string>();
  /** şerit ve ray düğümleri → net (elle yerleşen parçalar birbirine kısa devre yapmasın) */
  const serit = new Map<string, number>();
  /** board → elle yerleşen parçaların kullandığı şerit sütunları */
  const elSutun = new Map<number, number[]>();
  const dugumAnahtari = (b: BbBoard, r: number, c: number): string | undefined => {
    if (r >= 3 && r <= 7) return `${b.no}|u|${c}`;
    if (r >= 10 && r <= 14) return `${b.no}|a|${c}`;
    if (r === 0 || r === 17) return `${b.no}|+${r}`;
    if (r === 1 || r === 16) return `${b.no}|-${r}`;
    return undefined;
  };
  const yerelOf = (X: number, Y: number): { b: BbBoard; r: number; c: number } => {
    for (const b of boards) {
      const r = Y - b.y0;
      const c = X - b.x0;
      if (r >= -2 && r <= 19 && c >= 0 && c <= 64) return { b, r, c };
    }
    throw new Error(`${kart}: board dışında bacak (${X}, ${Y})`);
  };
  const isaretle = (ref: string, bacaklar: BbBacak[], netOf: (pin: number) => number, el: boolean) => {
    for (const bc of bacaklar) {
      const k = `${bc.X},${bc.Y}`;
      if (delik.has(k)) throw new Error(`${kart}: ${ref}.${bc.pin} deliği dolu (${delik.get(k)})`);
      delik.set(k, `${ref}.${bc.pin}`);
      const { b, r, c } = yerelOf(bc.X, bc.Y);
      const d = dugumAnahtari(b, r, c);
      if (!d) throw new Error(`${kart}: ${ref}.${bc.pin} delik olmayan satırda (${r})`);
      if ((r <= 1 || r >= 16) && !rayDeligiVar(c)) throw new Error(`${kart}: ${ref}.${bc.pin} ray deliği yok (${c})`);
      const net = netOf(bc.pin);
      const ray = r <= 1 || r >= 16;
      if (ray) {
        const kutup = r === 0 || r === 17 ? VCC : GND;
        if (net !== kutup) throw new Error(`${kart}: ${ref}.${bc.pin} (${board.netName(net)}) ${kutup === VCC ? "+" : "−"} rayında`);
        continue;
      }
      const id = net < 0 ? -1 - parcalar.length * 100 - bc.pin : net;
      const once = serit.get(d);
      if (once !== undefined && once !== id) throw new Error(`${kart}: ${ref}.${bc.pin} şeridi başka netin (${d})`);
      serit.set(d, id);
      if (el) {
        if (!elSutun.has(b.no)) elSutun.set(b.no, []);
        elSutun.get(b.no)!.push(c);
      }
    }
  };

  const pasifEkle = (ref: string, b: BbBoard, tur: ParcaTuru, k: Kalip, ek: Partial<BbParca> = {}, sutun?: number) => {
    const p = pasif.get(ref);
    if (!p) throw new Error(`${kart}: pasif yok: ${ref}`);
    if (yerlesti.has(ref)) throw new Error(`${kart}: iki kez yerleşti: ${ref}`);
    isaretle(ref, k.bacaklar, (pin) => p.pins[String(pin)] ?? -1, !ek.bagliCip);
    yerlesti.add(ref);
    const asama = ek.asama ?? asamaOf(p.block);
    parcalar.push({ ref, part: p.part, cipMi: false, tur, blok: p.block, rol: p.role, board: b.no, asama, bacaklar: k.bacaklar, govde: k.govde, sutun: sutun ?? Math.min(...k.bacaklar.map((x) => x.X)) - b.x0, ...ek });
  };
  /** yalnız fiziksel parça (netlistte yok): besleme girişi, ek 100 µF */
  const ekParca = (ref: string, part: string, rol: string, b: BbBoard, tur: ParcaTuru, k: Kalip, netler: Record<number, number>) => {
    isaretle(ref, k.bacaklar, (pin) => netler[pin] ?? -1, true);
    parcalar.push({ ref, part, cipMi: false, tur, blok: "Besleme ve arka panel", rol, board: b.no, asama: 1, bacaklar: k.bacaklar, govde: k.govde, sutun: Math.min(...k.bacaklar.map((x) => x.X)) - b.x0, ek: netler });
  };
  const cipEkle = (ci: ChipInstance, b: BbBoard, c0: number) => {
    if (yerlesti.has(ci.ref)) throw new Error(`${kart}: iki kez yerleşti: ${ci.ref}`);
    const n = ci.def.pins.length;
    const genis = ci.def.footprint.includes("W15.24");
    const k = genis ? genisDipBacaklari(b, c0, n) : dipBacaklari(b, c0, n);
    isaretle(ci.ref, k.bacaklar, (pin) => pinNeti(ci, pin), false);
    yerlesti.add(ci.ref);
    parcalar.push({ ref: ci.ref, part: ci.def.part, cipMi: true, tur: genis ? "genis" : "dip", blok: ci.block, rol: ci.role, board: b.no, asama: cipAsamasi(ci), ...k, sutun: c0 });
  };
  const pasifNet = (p: Passive, pin: number) => p.pins[String(pin)] ?? -1;

  /**
   * İki bacaklı pasif, c sütununda: iki ucu raylarda (alt ray çifti), biri VCC (a satırı ↔ üst + rayı),
   * biri GND (j satırı ↔ alt − rayı), ikisi de sinyal (kanalın üstünden: e ↔ f).
   */
  const ikili = (ref: string, b: BbBoard, c: number, tur: ParcaTuru, ek: Partial<BbParca> = {}) => {
    const p = pasif.get(ref)!;
    const n1 = pasifNet(p, 1);
    const n2 = pasifNet(p, 2);
    const guc = (n: number) => n === VCC || n === GND;
    let k: Kalip;
    if (guc(n1) && guc(n2)) k = ikiBacak(G(b, n1 === VCC ? 17 : 16, c), G(b, n2 === VCC ? 17 : 16, c));
    else if (n1 === VCC || n2 === VCC) k = n1 === VCC ? ikiBacak(G(b, 0, c), G(b, 3, c)) : ikiBacak(G(b, 3, c), G(b, 0, c));
    else if (n1 === GND || n2 === GND) k = n1 === GND ? ikiBacak(G(b, 16, c), G(b, 14, c)) : ikiBacak(G(b, 14, c), G(b, 16, c));
    else k = ikiBacak(G(b, 7, c), G(b, 10, c));
    pasifEkle(ref, b, tur, k, ek, c);
  };
  /** LED modülü: direnç kanalın üstünden (sinyal ↔ LED anodu), LED aynı sütunda alt şeritten alt − rayına */
  const ledModulu = (r: string, d: string, b: BbBoard, c: number) => {
    ikili(r, b, c, "direnc");
    ikili(d, b, c, "led");
  };
  const tekSira = (ref: string, b: BbBoard, r: number, c0: number, tur: ParcaTuru, pinler?: number[]) => {
    const p = pasif.get(ref)!;
    const nums = pinler ?? Object.keys(p.pins).map(Number).sort((x, y) => x - y);
    pasifEkle(ref, b, tur, siraBacaklari(b, r, c0, nums), {}, c0);
  };
  /** kristal osilatör modülü: DIP-14 kılıf, yalnız 1, 7, 8, 14. pinler */
  const osilator = (ref: string, b: BbBoard, c0: number) => {
    const k = dipBacaklari(b, c0, 14);
    pasifEkle(ref, b, "osilator", { bacaklar: k.bacaklar.filter((x) => [1, 7, 8, 14].includes(x.pin)), govde: k.govde }, {}, c0);
  };
  /** basmalı buton: kanalın üstünden, 1. pinin iki bacağı c'de (e ve f), 2. pininkiler c + 2'de */
  const buton = (ref: string, b: BbBoard, c: number) => {
    const a = G(b, 7, c);
    const z = G(b, 10, c + 2);
    pasifEkle(ref, b, "buton", {
      bacaklar: [{ pin: 1, ...G(b, 7, c) }, { pin: 1, ...G(b, 10, c) }, { pin: 2, ...G(b, 7, c + 2) }, { pin: 2, ...G(b, 10, c + 2) }],
      govde: [a.X, a.Y, z.X, z.Y],
    }, {}, c);
  };
  const bul = (desen: (p: Passive) => boolean): Passive => {
    const p = kartPasifleri.find(desen);
    if (!p) throw new Error(`${kart}: pasif bulunamadı`);
    return p;
  };

  // ---- 1. şerit kablo uyarlayıcısı
  const u = tanim.uyarlayici;
  const ub = at(u.bx, u.by);
  const bp = bul((p) => p.part === "BACKPLANE_2x32");
  {
    const bacaklar: BbBacak[] = [];
    for (let k = 1; k <= 32; k++) {
      bacaklar.push({ pin: 2 * k - 1, ...G(ub, 10, u.c0 + k - 1) });
      bacaklar.push({ pin: 2 * k, ...G(ub, 7, u.c0 + k - 1) });
    }
    const a = G(ub, 7, u.c0);
    const z = G(ub, 10, u.c0 + 31);
    pasifEkle(bp.ref, ub, "uyarlayici", { bacaklar, govde: [a.X, a.Y, z.X, z.Y] }, {}, u.c0);
  }

  // ---- 2. besleme girişleri: uyarlayıcı sırasının her board'unda
  {
    const kartC = bul((p) => p.part === "C_100U");
    const sira = boards.filter((b) => b.by === u.by).sort((a, b) => Math.abs(a.bx - u.bx) - Math.abs(b.bx - u.bx) || a.bx - b.bx);
    const alt = tanim.sira === "arka";
    const [arti, eksi] = alt ? [17, 16] : [0, 1];
    sira.forEach((b, i) => {
      const cg = 49;
      const cc = 51;
      ekParca(beslemeRef(kart, i), "CONN_5V", `5 V besleme girişi ${i + 1} (board sütunu ${b.bx + 1})`, b, "konnektor", ikiBacak(G(b, arti, cg), G(b, eksi, cg)), { 1: VCC, 2: GND });
      const k = ikiBacak(G(b, arti, cc), G(b, eksi, cc));
      if (i === 0) pasifEkle(kartC.ref, b, "elektrolitik", k, { asama: 1 }, cc);
      else ekParca(tamponRef(kart, i), "C_100U", `100 µF besleme tamponu ${i + 1}`, b, "elektrolitik", k, { 1: VCC, 2: GND });
    });
  }

  // ---- 3. elle yerleşen pasifler (karta özgü)
  const P = (ref: string) => pasif.get(ref);
  const varsa = (ref: string) => {
    if (!P(ref)) throw new Error(`${kart}: ${ref} yok`);
    return ref;
  };
  const sipDiz = (ref: string, b: BbBoard, c0: number) => tekSira(varsa(ref), b, 3, c0, "sip", [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  if (kart === "cpu") {
    // veriyolu çekme dirençleri register seçicilerinin ve çözücülerinin board'larının sağ ucunda;
    // durum LED'leri HALT ve hata flip-flop'larının board'unda
    sipDiz("RN1", grupBoardu("register-secimi"), 53);
    sipDiz("RN2", grupBoardu("register-cozuculeri"), 53);
    const kb = grupBoardu("halt-hata");
    const led = (ad: string) => {
      const d = bul((p) => p.part === "LED" && p.role.startsWith(ad));
      const rr = bul((p) => p.part === "R_330" && p.role.startsWith(ad));
      return [rr.ref, d.ref] as const;
    };
    ledModulu(...led("HALTED"), kb, 55);
    ledModulu(...led("FAULT"), kb, 57);
  } else if (kart === "clk") {
    const ob = kodBoardlari.get("O")![0];
    osilator(varsa("X201"), ob, 50);
    // kullanıcı paneli (ön kenar): RESET, ADIM, OTOMATİK/ADIM, YAVAŞ/HIZLI, hız potu, CLK LED'i
    const b = kodBoardlari.get("B")![0];
    // RESET: buton (1. pin RST_RC), 10 kΩ VCC'den, 10 µF GND'ye: hepsi 9. sütunun şeritlerinde
    buton(varsa("SW201"), b, 9);
    ikili(varsa("R201"), b, 9, "direnc");
    ikili(varsa("C201"), b, 9, "elektrolitik");
    buton(varsa("SW202"), b, 15);
    ikili(varsa("R202"), b, 15, "direnc");
    ikili(varsa("C202"), b, 15, "kondansator");
    // anahtarlar ve pot a satırında
    tekSira(varsa("SW203"), b, 3, 20, "anahtar", [1, 2, 3]);
    tekSira(varsa("SW204"), b, 3, 25, "anahtar", [1, 2, 3]);
    tekSira(varsa("RV201"), b, 3, 30, "pot", [1, 2, 3]);
    // yavaş osilatör: 1 kΩ (SLOW_FB ↔ SLOW_RC) kanalın üstünden, 1 µF SLOW_RC'den GND'ye
    ikili(varsa("R203"), b, 35, "direnc");
    ikili(varsa("C203"), b, 35, "kondansator");
    ikili(varsa("R204"), b, 39, "direnc");
    ledModulu(varsa("R205"), varsa("D201"), b, 43);
  } else if (kart === "bellek") {
    const e = kodBoardlari.get("E")!;
    sipDiz("RN401", e[e.length - 1], 53);
    const bb = at(0, ny - 1);
    sipDiz("RN402", bb, 43);
    sipDiz("RN403", bb, 53);
  } else if (kart === "gc") {
    // USB-seri modülü ve PS/2 konnektörü ön kenarda (j satırı)
    const ub2 = at(0, ny - 1);
    tekSira(varsa("J601"), ub2, 14, 50, "modul", [1, 2, 3, 4, 5, 6]);
    ikili(varsa("R601"), ub2, 57, "direnc");
    const kb = at(nx - 1, ny - 1);
    tekSira(varsa("J602"), kb, 14, 50, "modul", [1, 2, 3, 4, 5, 6]);
    ikili(varsa("R602"), kb, 57, "direnc");
    ikili(varsa("R603"), kb, 58, "direnc");
  } else if (kart === "video") {
    const s = kodBoardlari.get("S")!;
    osilator(varsa("X701"), s[0], 54);
    // renk DAC'ı ve VGA konnektörü ön kenarda, ortadaki board'un sağ ucunda
    const xb = at(1, ny - 1);
    tekSira(varsa("J701"), xb, 14, 40, "modul", Array.from({ length: 15 }, (_, i) => i + 1));
    ["R701", "R702", "R703", "R704", "R705", "R706"].forEach((r, i) => ikili(varsa(r), xb, 56 + i, "direnc"));
  }

  /** modüler panoda board'a çip gelecek mi (bir çipli grubu orada) */
  const cipli = (b: BbBoard): boolean =>
    !tanim.duzen || kartCipleri.some((c) => {
      const g = grubu.get(c.ref);
      return !!g && !!grupBoardlari.get(g)?.includes(b);
    });

  // ---- 3b. göstergeler (modüler panoda): grubun "grup+" board'unda ya da grubun ilk board'unun sağ
  // ucunda. Çubuk gösterge (DIP-20) ters takılır: 1. pin sağ üstte, 1. segment (bit 0) sağda; anotlar
  // üst şeritlerde (direnç dizisinin üst şeritlerine), katotlar alt şeritlerde (alt − rayına kısa tel).
  // Direnç dizisi (DIP-16) düz: k. direnç sinyalle (alt şerit) anot arasında (üst şerit), çubuğun dış
  // yanında. Tek LED'ler bir sütunluk LED modülü (ledModulu), ray deliği olan tek sütunlarda.
  if (tanim.duzen) {
    const gostergeMi = (q: Passive) => q.part === "LED" || q.part === "DISP_BAR_10" || q.part === "RN_1K_ISO_8";
    const bekleyen = kartPasifleri.filter((q) => gostergeMi(q) && !yerlesti.has(q.ref));
    /** board → çubuk çiftleri (yüksek bayt önce) ve LED'ler */
    const yerler = new Map<BbBoard, { cubuklar: { rn: Passive; bar: Passive; ilk: number }[]; ledler: { r: Passive; d: Passive }[] }>();
    const hedef = (q: Passive): BbBoard => {
      const g = grubu.get(q.ref);
      const b = g ? (gostergeBoardu.get(g) ?? grupBoardlari.get(g)?.[0]) : undefined;
      if (!b) throw new Error(`${kart}: ${q.ref} göstergesinin board'u yok (grubu: ${g ?? "yok"})`);
      if (!yerler.has(b)) yerler.set(b, { cubuklar: [], ledler: [] });
      return b;
    };
    const ortakNet = (a: Passive, b: Passive) => Object.values(a.pins).some((n) => n > 1 && Object.values(b.pins).includes(n));
    for (const bar of bekleyen.filter((q) => q.part === "DISP_BAR_10")) {
      const rn = bekleyen.find((q) => q.part === "RN_1K_ISO_8" && ortakNet(q, bar));
      if (!rn) throw new Error(`${kart}: ${bar.ref} çubuğunun direnç dizisi yok`);
      // çubuğun ilk segmentinin bit numarası (anot netinin adındaki sayı: BAR_BUS8 → 8)
      const anot = Object.entries(bar.pins).filter(([pin]) => Number(pin) <= 10).map(([, n]) => board.netName(n));
      const ilk = Math.min(...anot.map((a) => Number(/(\d+)$/.exec(a)?.[1] ?? 0)));
      yerler.get(hedef(bar))!.cubuklar.push({ rn, bar, ilk });
    }
    for (const d of bekleyen.filter((q) => q.part === "LED")) {
      const r = kartPasifleri.find((q) => q.part.startsWith("R_") && !yerlesti.has(q.ref) && ortakNet(q, d));
      if (!r) throw new Error(`${kart}: ${d.ref} LED'inin direnci yok`);
      yerler.get(hedef(d))!.ledler.push({ r, d });
    }
    for (const [b, { cubuklar, ledler }] of yerler) {
      cubuklar.sort((x, y) => y.ilk - x.ilk);
      const ledSutunu = (c: number) => {
        while (!rayDeligiVar(c) || c % 2 === 0) c++;
        return c;
      };
      const en = cubuklar.length * 19 + ledler.length * 2;
      // çipli board'da göstergeler sağ uçta (çipler solda), çipsizde ortada
      let c = cipli(b) ? Math.max(26, 59 - en) : Math.max(6, Math.round((63 - en) / 2));
      cubuklar.forEach((x, i) => {
        // yüksek bayt: dizi solda, çubuk sağda; düşük bayt: çubuk solda, dizi sağda (iki çubuk yan yana)
        const disSolda = i % 2 === 0;
        const yerlestir = (q: Passive, tur: "dip" | "cubuk") => {
          const n = Number(q.part === "DISP_BAR_10" ? 20 : 16);
          const k = tur === "cubuk" ? tersDipBacaklari(b, c, n) : dipBacaklari(b, c, n);
          pasifEkle(q.ref, b, "dip", k, tur === "cubuk" ? { ters: true } : {}, c);
          c += n / 2 + 1;
        };
        if (disSolda) {
          yerlestir(x.rn, "dip");
          yerlestir(x.bar, "cubuk");
        } else {
          yerlestir(x.bar, "cubuk");
          yerlestir(x.rn, "dip");
        }
      });
      for (const { r, d } of ledler.sort((x, y) => Number(x.d.ref.slice(1)) - Number(y.d.ref.slice(1)))) {
        c = ledSutunu(c);
        if (c > 58) throw new Error(`${kart}: ${b.ad}: göstergeler sığmıyor`);
        ledModulu(r.ref, d.ref, b, c);
        c += 2;
      }
    }
  }

  // ---- 4. mantık çipleri: bölge bölge tavlama
  // modüler panoda çipin bölgesi grubunun board'larının bölgesi; öbür panolarda bloğunun bölgesi
  const bolgeKodu = (ci: ChipInstance): string => {
    const g = grubu.get(ci.ref);
    const gb = g ? grupBoardlari.get(g)?.[0] : undefined;
    if (tanim.duzen && gb) return tanim.izgara[gb.by][gb.bx];
    const blok = cipBlogu(ci);
    for (const [kod, bolge] of Object.entries(tanim.bolgeler)) if (bolge.bloklar.includes(blok)) return kod;
    throw new Error(`${kart}: ${ci.ref} bloğunun (${blok}) bölgesi yok`);
  };
  const aralik = (b: BbBoard): [number, number] => {
    const el = elSutun.get(b.no);
    if (!el?.length || !cipli(b)) return [1, 61];
    const lo = Math.min(...el);
    const hi = Math.max(...el);
    if (lo >= 26) return [1, lo - 2];
    if (hi <= 36) return [hi + 2, 61];
    throw new Error(`${kart}: ${b.ad}: elle yerleşen parçalar iki uçta`);
  };
  if (o.yerler) {
    const adla = new Map(boards.map((b) => [b.ad, b]));
    for (const ci of kartCipleri) {
      const y = o.yerler.get(ci.ref);
      if (!y) throw new Error(`${kart}: saklanan yerleşimde çip yok: ${ci.ref}`);
      const b = adla.get(y[0]);
      if (!b) throw new Error(`${kart}: saklanan yerleşimde bilinmeyen board: ${y[0]}`);
      cipEkle(ci, b, y[1]);
    }
  } else {
    const sabit = new Map<number, { X: number; Y: number }[]>();
    for (const p of parcalar) {
      for (const bc of p.bacaklar) {
        const net = p.ek ? (p.ek[bc.pin] ?? -1) : pasifNet(pasif.get(p.ref)!, bc.pin);
        if (net <= 1) continue;
        if (!sabit.has(net)) sabit.set(net, []);
        sabit.get(net)!.push({ X: bc.X, Y: bc.Y });
      }
    }
    const kodlar = Object.keys(tanim.bolgeler);
    // modüler panoda çipin gidebileceği board'lar: grubunun board'ları (hepsi çipin bölgesinde). Aynı
    // çiplerden oluşan dizi (bit dilimleri: 8 × 74HC151 mantık birimi, 8 × 74HC153 sonuç seçici …)
    // board'larına referans sırasıyla eşit paylaşılır; karışık kapı grupları board'larında tavlanır.
    const sabitBoard = new Map<string, BbBoard>();
    for (const [g, bs] of grupBoardlari) {
      const cs = kartCipleri.filter((c) => grubu.get(c.ref) === g).sort((a, c) => Number(a.ref.replace(/\D/g, "")) - Number(c.ref.replace(/\D/g, "")));
      if (bs.length < 2 || new Set(cs.map((c) => c.def.part)).size !== 1) continue;
      let i = 0;
      bs.forEach((b, k) => {
        const n = Math.floor(cs.length / bs.length) + (k < cs.length % bs.length ? 1 : 0);
        for (const c of cs.slice(i, i + n)) sabitBoard.set(c.ref, b);
        i += n;
      });
    }
    const izin = tanim.duzen && !o.tekBolge
      ? (ci: ChipInstance): BbBoard[] => {
        const g = grubu.get(ci.ref);
        const kod = bolgeKodu(ci);
        const bs = g ? grupBoardlari.get(g) : undefined;
        if (!g || !bs) throw new Error(`${kart}: ${ci.ref} düzende yok (grubu: ${g ?? "yok"})`);
        const disari = bs.find((b) => tanim.izgara[b.by][b.bx] !== kod);
        if (disari) throw new Error(`${kart}: ${ci.ref} (${g}) bölgesinin (${kod}) dışında bir board'da: ${disari.ad}`);
        const sb = sabitBoard.get(ci.ref);
        return sb ? [sb] : bs;
      }
      : undefined;
    const bolgeler = o.tekBolge
      ? [{ boards, cipler: kartCipleri }]
      : kodlar.map((kod) => ({ boards: kodBoardlari.get(kod) ?? [], cipler: kartCipleri.filter((c) => bolgeKodu(c) === kod), izin })).filter((x) => x.cipler.length);
    for (const x of bolgeler) if (!x.boards.length) throw new Error(`${kart}: çipleri olan bölgenin board'u yok`);
    const tavla = tavlama(bolgeler, sabit, { tohum: 16016, adim: o.adim ?? 600_000, T0: 25, Tson: 0.05, yuva: tanim.yuva, aralik, bosKalmasin: true, dikey: o.dikey ?? 2,
      // geniş DIP (15,24 mm) d…h satırlarını kaplar: yanında dikey geçişe ve tel uçlarına yer kalsın
      en: (ci) => (ci.def.footprint.includes("W15.24") ? 20 : ci.def.pins.length / 2),
      // elle yerleşen parçaların board'unda yuvalar açık sütunlarla orantılı (uyarlayıcının board'unda 2)
      uzunCeza: o.uzunCeza ?? { esik: 60, kat: 2 },
      yuvaSayisi: (b) => Math.max(1, Math.round((tanim.yuva * (aralik(b)[1] - aralik(b)[0] + 1)) / 61)),
    });
    // tek gruplu board'da çipler referans sırasıyla (düşük bayt, düşük bitler solda)
    if (tanim.duzen) {
      const no = (r: string) => Number(r.replace(/\D/g, ""));
      for (const b of boards) {
        if (b.gruplar?.length !== 1) continue;
        const refs = [...tavla].filter(([, [x]]) => x === b).map(([r]) => r).sort((a, c) => no(a) - no(c));
        const [sol, sag] = aralik(b);
        const s = sutunlariDiz(refs.map((r) => kartCipleri.find((c) => c.ref === r)!.def.pins.length / 2), sol, sag);
        if (!s) throw new Error(`${kart}: ${b.ad} sığmıyor`);
        refs.forEach((r, i) => tavla.set(r, [b, s[i]]));
      }
    }
    for (const [ref, [b, c0]] of tavla) cipEkle(kartCipleri.find((c) => c.ref === ref)!, b, c0);
  }

  // ---- 5. dekuplaj: her çipin 100 nF'ı üst ray çiftinin arasında, VCC bacağına yakın
  for (const p of parcalar.filter((x) => x.cipMi)) {
    const b = boards[p.board];
    const n = p.bacaklar.length;
    const c100 = kartPasifleri.find((q) => q.part === "C_100N" && q.role === `${p.ref} dekuplaj`);
    if (!c100) throw new Error(`${kart}: dekuplaj yok: ${p.ref}`);
    let cx = -1;
    for (const c of [p.sutun + 1, p.sutun + 2, p.sutun + 3, p.sutun + 4, p.sutun + 5, p.sutun - 1, p.sutun - 2, p.sutun + 6, p.sutun + n / 2, p.sutun + 7, p.sutun + 8]) {
      // 3–5 ve 59–61: ray köprülerinin uçları
      if (c < 6 || c > 58 || !rayDeligiVar(c)) continue;
      if (delik.has(`${kureselX(b, c)},${kureselY(b, 0)}`) || delik.has(`${kureselX(b, c)},${kureselY(b, 1)}`)) continue;
      cx = c;
      break;
    }
    if (cx < 0) throw new Error(`${kart}: dekuplaj yeri yok: ${p.ref}`);
    pasifEkle(c100.ref, b, "kondansator", ikiBacak(G(b, 0, cx), G(b, 1, cx)), { bagliCip: p.ref, asama: p.asama }, cx);
  }

  const eksik = [...kartCipleri.map((c) => c.ref), ...kartPasifleri.map((p) => p.ref)].filter((r) => !yerlesti.has(r));
  if (eksik.length) throw new Error(`${kart}: yerleşmeyen parçalar: ${eksik.join(", ")}`);
  // board'un aşaması: çiplerinin (yoksa parçalarının) en erken aşaması
  for (const b of boards) {
    const list = parcalar.filter((p) => p.board === b.no);
    const cip = list.filter((p) => p.cipMi);
    if (!list.length) throw new Error(`${kart}: ${b.ad} boş`);
    b.asama = Math.min(...(cip.length ? cip : list).map((p) => p.asama));
  }
  return { nx, ny, boards, parcalar };
}
