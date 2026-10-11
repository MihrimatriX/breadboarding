// Statik zamanlama analizi (Faz 9): şemadaki (Board) her çipin veri sayfası gecikmeleriyle en uzun
// yolları bulur ve kartın gerçekte en fazla hangi saat hızında çalışabileceğini hesaplar.
//
// Yöntem (gerçek STA araçlarının küçük hali):
//   1. Saat ağacı: verilen saat kökünden (ör. CLK) birleşimsel kapılardan geçerek her flip-flop'un
//      saat pinine varış süresi ve kenarı (kökün yükselen mi düşen kenarı) bulunur.
//   2. Veri yolları: her flip-flop çıkışı bir başlangıçtır (saat varışı + saat→Q). Gecikmeler
//      birleşimsel çiplerden geçerek ileri yayılır; her netin en geç varışı tutulur.
//   3. Uç noktalar: flip-flop veri girişleri (kurulum süresiyle) ve kapılı saatlerin izin girişleri
//      (izin, saat girişi "geçirgen" olmadan önce oturmalı).
//   4. Başlatan ve yakalayan kenar aynıysa yol bir tam periyoda, farklıysa yarım periyoda sığmalı.
//      CPU16'da kontrol register'ı düşen kenarda, durum register'ları yükselen kenarda yüklendiği
//      için ALU yolu YARIM periyoda sığmak zorundadır; asıl sınır budur.
//
// Gecikmeler 74HC veri sayfalarından (Nexperia / TI) yuvarlanmış değerlerdir: VCC = 4,5 V,
// 25 °C, CL = 50 pF. "tip" tipik, "maks" 25 °C'deki en kötü değerdir; -40..85 °C için maks'ı
// yaklaşık 1,25 ile çarp. Bellekler hız sınıfının garanti değeriyle (tAA, tOE) girilir. Çok yüklü
// netlerde (ör. iç veriyolu) yük düzeltmesi eklenir: her pin ≈5 pF + 10 pF hat, 50 pF üstü için
// tip 0,08, maks 0,12 ns/pF.

import type { Board, ChipInstance } from "./board.ts";

export type Kose = "tip" | "maks";
type D = readonly [tip: number, maks: number];

/** +1: çıkış girişle aynı yönde, -1: ters, 0: ikisi de olabilir (XOR, seçici) */
type Yon = 1 | -1 | 0;
interface Ark {
  from: string;
  to: string;
  d: D;
  yon: Yon;
}
interface Ardisik {
  /** saat pini */
  clock: string;
  /** -1: saat pininin düşen kenarında tetikler (ör. 74HC393); varsayılan yükselen */
  kenar?: -1;
  q: string[];
  clkq: D;
  data: string[];
  setup: D;
}
interface Model {
  arcs: Ark[];
  seq: Ardisik[];
  /** saat kapılaması için kapı birimleri: giriş pinleri → çıkış ve kontrol eden değer */
  gates?: { ins: string[]; out: string; kontrol: 0 | 1 }[];
}

const cross = (from: string[], to: string[], d: D, yon: Yon): Ark[] => from.flatMap((f) => to.map((t) => ({ from: f, to: t, d, yon })));
const rng = (p: string, n: number, from = 0) => Array.from({ length: n }, (_, i) => `${p}${i + from}`);

/** Gecikme tablosu, ns: [tipik, en kötü] */
export const GECIKME = {
  "74HC00": [7, 18], "74HC02": [7, 18], "74HC04": [7, 17], "74HC08": [7, 18], "74HC10": [8, 20],
  "74HC14": [12, 27], "74HC32": [8, 20], "74HC86": [11, 24],
  "74HC125.A": [9, 22], "74HC125.OE": [11, 28],
  "74HC138.A": [15, 36], "74HC138.E": [14, 36], "74HC139": [14, 36], "74HC148": [18, 45],
  "74HC151.I": [19, 40], "74HC151.S": [22, 45], "74HC151.E": [15, 33],
  "74HC153.I": [14, 34], "74HC153.S": [17, 38], "74HC153.E": [11, 25],
  "74HC157.I": [11, 24], "74HC157.S": [15, 30], "74HC157.E": [14, 29],
  "74HC283.S": [20, 43], "74HC283.C": [16, 35], "74HC688": [15, 38], "74HC688.E": [12, 30],
  "74HC541.A": [9, 22], "74HC541.OE": [15, 35], "74HC245.A": [9, 22], "74HC245.OE": [15, 38],
  "74HC573.D": [14, 30], "74HC573.LE": [14, 32], "74HC573.OE": [15, 35],
  "74HC574.CP": [16, 33], "74HC574.OE": [14, 30], "74HC574.SU": [4, 12],
  "74HC175.CP": [15, 30], "74HC175.SU": [4, 12],
  "74HC74.CP": [15, 35], "74HC74.SU": [5, 15],
  "74HC161.CP": [15, 37], "74HC161.TC": [19, 42], "74HC161.CET": [13, 30], "74HC161.SU": [5, 15],
  "74HC165.CP": [17, 38], "74HC165.PL": [18, 40], "74HC165.D": [15, 35], "74HC165.SU": [4, 12],
  "74HC595.CP": [16, 35], "74HC595.OE": [15, 35], "74HC595.SU": [4, 12],
  "74HC05": [8, 20], "74HC166.CP": [16, 35], "74HC166.SU": [4, 12],
  "74HC193.CP": [20, 43], "74HC193.TC": [14, 33], "74HC193.PL": [22, 50], "74HC193.D": [20, 45],
  "74HC393.CP": [28, 60], "74HC273.CP": [15, 35], "74HC273.SU": [4, 12],
  "74HC590.CP": [20, 45], "74HC590.RCO": [14, 33], "74HC590.OE": [15, 35], "74HC590.SU": [5, 15],
  // bellekler: hız sınıfının garanti değeri (tip = maks)
  "SST39SF010A.A": [70, 70], "SST39SF010A.OE": [35, 35],
  "62256.A": [70, 70], "62256.OE": [35, 35],
  "AS6C4008.A": [55, 55], "AS6C4008.OE": [25, 25],
} satisfies Record<string, D>;
type GKey = keyof typeof GECIKME;
const g = (k: GKey): D => GECIKME[k];

function quad(part: GKey, yon: Yon, ins: string[], units: number, kontrol?: 0 | 1): Model {
  const arcs: Ark[] = [];
  const gates: Model["gates"] = [];
  for (let u = 1; u <= units; u++) {
    const i = ins.map((x) => `${u}${x}`);
    arcs.push(...cross(i, [`${u}Y`], g(part), yon));
    if (kontrol !== undefined) gates.push({ ins: i, out: `${u}Y`, kontrol });
  }
  return { arcs, seq: [], gates };
}

/** Parçanın zamanlama modeli; bilinmeyen parça için null */
function model(part: string): Model | null {
  switch (part) {
    case "74HC00": return quad("74HC00", -1, ["A", "B"], 4, 0);
    case "74HC08": return quad("74HC08", 1, ["A", "B"], 4, 0);
    case "74HC02": return quad("74HC02", -1, ["A", "B"], 4, 1);
    case "74HC32": return quad("74HC32", 1, ["A", "B"], 4, 1);
    case "74HC86": return quad("74HC86", 0, ["A", "B"], 4);
    case "74HC10": return quad("74HC10", -1, ["A", "B", "C"], 3, 0);
    case "74HC04": return quad("74HC04", -1, ["A"], 6);
    case "74HC05": return quad("74HC05", -1, ["A"], 6);
    case "74HC14": return quad("74HC14", -1, ["A"], 6);
    case "74HC125": {
      const arcs: Ark[] = [];
      for (let u = 1; u <= 4; u++) arcs.push(...cross([`${u}A`], [`${u}Y`], g("74HC125.A"), 1), ...cross([`~${u}OE`], [`${u}Y`], g("74HC125.OE"), 0));
      return { arcs, seq: [] };
    }
    case "74HC138": {
      const y = rng("~Y", 8);
      return { arcs: [...cross(rng("A", 3), y, g("74HC138.A"), 0), ...cross(["~E1", "~E2"], y, g("74HC138.E"), 1), ...cross(["E3"], y, g("74HC138.E"), -1)], seq: [] };
    }
    case "74HC139":
      return { arcs: [1, 2].flatMap((h) => cross([`~${h}E`, `${h}A0`, `${h}A1`], rng(`~${h}Y`, 4), g("74HC139"), 0)), seq: [] };
    case "74HC148":
      return { arcs: cross(["~EI", ...rng("~I", 8)], ["~A0", "~A1", "~A2", "~GS", "~EO"], g("74HC148"), 0), seq: [] };
    case "74HC151":
      return {
        arcs: [...cross(rng("I", 8), ["Y", "~Y"], g("74HC151.I"), 0), ...cross(["S0", "S1", "S2"], ["Y", "~Y"], g("74HC151.S"), 0), ...cross(["~E"], ["Y", "~Y"], g("74HC151.E"), 0)],
        seq: [],
      };
    case "74HC153":
      return {
        arcs: [1, 2].flatMap((h) => [
          ...cross(rng(`${h}I`, 4), [`${h}Y`], g("74HC153.I"), 1),
          ...cross(["S0", "S1"], [`${h}Y`], g("74HC153.S"), 0),
          ...cross([`~${h}E`], [`${h}Y`], g("74HC153.E"), 0),
        ]),
        seq: [],
      };
    case "74HC157":
      return {
        arcs: [1, 2, 3, 4].flatMap((h) => [
          ...cross([`${h}I0`, `${h}I1`], [`${h}Y`], g("74HC157.I"), 1),
          ...cross(["S"], [`${h}Y`], g("74HC157.S"), 0),
          ...cross(["~E"], [`${h}Y`], g("74HC157.E"), 0),
        ]),
        seq: [],
      };
    case "74HC283": {
      const ins = ["CIN", ...rng("A", 4, 1), ...rng("B", 4, 1)];
      return { arcs: [...cross(ins, rng("S", 4, 1), g("74HC283.S"), 0), ...cross(ins, ["COUT"], g("74HC283.C"), 0)], seq: [] };
    }
    case "74HC688":
      return { arcs: [...cross([...rng("P", 8), ...rng("Q", 8)], ["~EQ"], g("74HC688"), 0), ...cross(["~E"], ["~EQ"], g("74HC688.E"), 1)], seq: [] };
    case "74HC541":
      return {
        arcs: [...rng("A", 8).map((a, i) => ({ from: a, to: `Y${i}`, d: g("74HC541.A"), yon: 1 as Yon })), ...cross(["~OE1", "~OE2"], rng("Y", 8), g("74HC541.OE"), 0)],
        seq: [],
      };
    case "74HC245":
      // yalnızca B → A (bellekten okuma yönü); A → B yazma yönü kendi yazma penceresiyle ayrıca incelenir
      // (docs/uretim.md). İki yön birlikte modellenirse veriyolunda sahte döngü oluşur.
      return {
        arcs: [...rng("B", 8).map((x, i) => ({ from: x, to: `A${i}`, d: g("74HC245.A"), yon: 1 as Yon })), ...cross(["~OE", "DIR"], rng("A", 8), g("74HC245.OE"), 0)],
        seq: [],
      };
    case "74HC573":
      return {
        arcs: [
          ...rng("D", 8).map((x, i) => ({ from: x, to: `Q${i}`, d: g("74HC573.D"), yon: 1 as Yon })),
          ...cross(["LE"], rng("Q", 8), g("74HC573.LE"), 0),
          ...cross(["~OE"], rng("Q", 8), g("74HC573.OE"), 0),
        ],
        seq: [],
      };
    case "74HC574":
      return {
        arcs: cross(["~OE"], rng("Q", 8), g("74HC574.OE"), 0),
        seq: [{ clock: "CP", q: rng("Q", 8), clkq: g("74HC574.CP"), data: rng("D", 8), setup: g("74HC574.SU") }],
      };
    case "74HC175":
      return { arcs: [], seq: [{ clock: "CP", q: [...rng("Q", 4), ...rng("~Q", 4)], clkq: g("74HC175.CP"), data: rng("D", 4), setup: g("74HC175.SU") }] };
    case "74HC74":
      return {
        arcs: [],
        seq: [1, 2].map((h) => ({ clock: `${h}CLK`, q: [`${h}Q`, `~${h}Q`], clkq: g("74HC74.CP"), data: [`${h}D`], setup: g("74HC74.SU") })),
      };
    case "74HC161":
      return {
        arcs: cross(["CET"], ["TC"], g("74HC161.CET"), 1),
        seq: [
          { clock: "CP", q: rng("Q", 4), clkq: g("74HC161.CP"), data: [...rng("D", 4), "~PE", "CEP", "CET"], setup: g("74HC161.SU") },
          { clock: "CP", q: ["TC"], clkq: g("74HC161.TC"), data: [], setup: g("74HC161.SU") },
        ],
      };
    case "74HC165":
      return {
        arcs: [...cross(rng("D", 8), ["Q7", "~Q7"], g("74HC165.D"), 0), ...cross(["~PL"], ["Q7", "~Q7"], g("74HC165.PL"), 0)],
        seq: [{ clock: "CP", q: ["Q7", "~Q7"], clkq: g("74HC165.CP"), data: ["DS", "~CE"], setup: g("74HC165.SU") }],
      };
    case "74HC595":
      return {
        arcs: cross(["~OE"], rng("Q", 8), g("74HC595.OE"), 0),
        seq: [
          { clock: "SHCP", q: ["Q7S"], clkq: g("74HC595.CP"), data: ["DS"], setup: g("74HC595.SU") },
          { clock: "STCP", q: rng("Q", 8), clkq: g("74HC595.CP"), data: [], setup: g("74HC595.SU") },
        ],
      };
    case "74HC166":
      return { arcs: [], seq: [{ clock: "CP", q: ["Q7"], clkq: g("74HC166.CP"), data: ["DS", ...rng("D", 8), "~CE", "~PE"], setup: g("74HC166.SU") }] };
    case "74HC193":
      // sayma saatleri CPU / CPD; ~TCU / ~TCD saat düşükken birleşimsel (zincirleme sayaçların saati)
      return {
        arcs: [
          ...cross(["CPU"], ["~TCU"], g("74HC193.TC"), 1),
          ...cross(["CPD"], ["~TCD"], g("74HC193.TC"), 1),
          ...cross(["~PL"], rng("Q", 4), g("74HC193.PL"), 0),
          ...rng("D", 4).map((x, i) => ({ from: x, to: `Q${i}`, d: g("74HC193.D"), yon: 1 as Yon })),
        ],
        seq: [
          { clock: "CPU", q: [...rng("Q", 4), "~TCU", "~TCD"], clkq: g("74HC193.CP"), data: [], setup: g("74HC193.D") },
          { clock: "CPD", q: [...rng("Q", 4), "~TCU", "~TCD"], clkq: g("74HC193.CP"), data: [], setup: g("74HC193.D") },
        ],
      };
    case "74HC393":
      // dalgalı sayıcı: ~nCP'nin düşen kenarı; Q3'e kadar en kötü gecikme
      return { arcs: [], seq: [1, 2].map((h) => ({ clock: `~${h}CP`, kenar: -1 as const, q: rng(`${h}Q`, 4), clkq: g("74HC393.CP"), data: [], setup: g("74HC393.CP") })) };
    case "74HC273":
      return { arcs: [], seq: [{ clock: "CP", q: rng("Q", 8), clkq: g("74HC273.CP"), data: rng("D", 8), setup: g("74HC273.SU") }] };
    case "74HC590":
      return {
        arcs: [...cross(["~OE"], rng("Q", 8), g("74HC590.OE"), 0), ...cross(["~CEC"], ["~RCO"], g("74HC590.RCO"), 1)],
        seq: [
          { clock: "CPC", q: ["~RCO"], clkq: g("74HC590.CP"), data: ["~CEC"], setup: g("74HC590.SU") },
          { clock: "CPR", q: rng("Q", 8), clkq: g("74HC590.CP"), data: [], setup: g("74HC590.SU") },
        ],
      };
    case "SST39SF010A":
    case "62256":
    case "AS6C4008": {
      const bits = part === "62256" ? 15 : part === "AS6C4008" ? 19 : 17;
      const dq = part === "62256" ? rng("IO", 8) : rng("DQ", 8);
      return {
        arcs: [...cross([...rng("A", bits), "~CE"], dq, g(`${part}.A` as GKey), 0), ...cross(["~OE"], dq, g(`${part}.OE` as GKey), 0)],
        seq: [],
      };
    }
  }
  return null;
}

// ---------------------------------------------------------------------------------------------

export interface SaatKoku {
  /** saat kaynağı netinin adı (ör. "CLK") */
  net: string;
  ad: string;
}

export interface Adim {
  ref: string;
  part: string;
  from: string;
  to: string;
  net: string;
  /** bu adımın gecikmesi (yük düzeltmesi dahil), ns */
  d: number;
  /** adımdan sonraki toplam varış, ns */
  t: number;
}

export interface Yol {
  kok: string;
  /** başlatan / yakalayan kenar */
  baslat: "yükselen" | "düşen";
  yakala: "yükselen" | "düşen";
  /** yolun sığması gereken pay: 1 = tam periyot, 0.5 = yarım */
  pay: 1 | 0.5;
  tur: "kurulum" | "saat kapılama";
  bitis: { ref: string; pin: string; net: string };
  adimlar: Adim[];
  /** başlatan saat varışı + saat→Q + birleşimsel gecikme, ns */
  varis: number;
  /** kurulum süresi (kapılamada 0) */
  kurulum: number;
  /** yakalayan saatin varışı (saat ağacı gecikmesi), ns */
  yakalaSaat: number;
  /** bu yolun gerektirdiği en kısa periyot, ns */
  periyot: number;
}

export interface TutmaKontrolu {
  ref: string;
  pin: string;
  net: string;
  /** izin sinyalinin en erken değişimi ile saat girişinin kontrol eden değere geçişi arasındaki pay, ns (tip) */
  pay: number;
}

export interface KokRaporu {
  kok: string;
  ad: string;
  /** saat pini bulunan ardışık eleman sayısı */
  elemanlar: number;
  enKisaPeriyot: number;
  fmaxMHz: number;
  yollar: Yol[];
  tutma: TutmaKontrolu[];
  /**
   * Kapılı saatin izni, kapı AÇIKKEN değişebilecek bir kaynaktan geliyor (aynı kenarda başlatılan
   * flip-flop). Statik analiz mikrokodu bilmez: bu izinlerin o adımda sabit kaldığını mikrokod garanti
   * etmeli (ör. IR yüklenirken REG_W = 0). Aksi halde saat darbesinde sıçrama olur.
   */
  aciktaDegisen: TutmaKontrolu[];
}

/**
 * Analizden çıkarılan zamanlama yayları (SDC'deki set_disable_timing). Yalnızca mantıksal olarak
 * hiç duyarlı olmayan yollar için: ör. okuma tamponunun veriyoluna sürdüğü değer yazma mantığına
 * gidemez, çünkü okuma ve yazma aynı döngüde olmaz.
 */
export interface KapaliYay {
  neden: string;
  yay: (ch: ChipInstance, from: string, to: string) => boolean;
}

/**
 * Kartların veriyoluna (DE / DO) okuma için sürdüğü yollar. CPU dışındaki saat alanlarında (TCLK,
 * PS/2, piksel saati) bunlar yanlış yoldur: veriyolundaki okuma verisini yalnızca CPU örnekler; o
 * alanın yazma mantığı veriyolunu yalnızca yazma döngüsünde, okuma sürücüleri kapalıyken dinler.
 */
export function okumaSuruculeri(b: Board, kartlar: string[]): KapaliYay {
  return {
    neden: `${kartlar.join(", ")} ${kartlar.length > 1 ? "kartlarının" : "kartının"} veriyoluna okuma sürücüleri: okuma ile yazma aynı döngüde olmaz`,
    yay: (ch, _from, to) => kartlar.includes(ch.card) && ch.nets[to] !== undefined && /^D[EO]\d+$/.test(b.netName(ch.nets[to])),
  };
}

export interface ZamanlamaRaporu {
  kose: Kose;
  kokler: KokRaporu[];
  /** kapatılan yaylar: neden ve sayısı */
  kapali: { neden: string; sayi: number }[];
  uyarilar: string[];
  bilinmeyen: string[];
}

interface Node {
  net: number;
  t: number;
  prev?: { node: Node; ref: string; part: string; from: string; to: string; d: number };
}

const isPower = (dir: string) => dir === "power" || dir === "nc" || dir === "passive";

/** Netteki pin sayısına göre yük düzeltmesi (ns) */
function yukEki(pins: number, kose: Kose): number {
  const c = pins * 5 + 10;
  return c <= 50 ? 0 : (c - 50) * (kose === "tip" ? 0.08 : 0.12);
}

export function zamanlamaAnalizi(
  b: Board,
  opts: { kokler: SaatKoku[]; kose?: Kose; yukDuzeltme?: boolean; enCok?: number; kapali?: KapaliYay[] },
): ZamanlamaRaporu {
  const kose = opts.kose ?? "maks";
  const k = kose === "tip" ? 0 : 1;
  const uyarilar: string[] = [];
  const bilinmeyen = new Set<string>();
  const GND = b.n("GND"), VCC = b.n("VCC");
  const sabit = (n: number) => n === GND || n === VCC;

  // netteki pin sayısı (yük)
  const pinSay = new Map<number, number>();
  for (const ch of b.chips) for (const p of ch.def.pins) if (!isPower(p.dir)) pinSay.set(ch.nets[p.name], (pinSay.get(ch.nets[p.name]) ?? 0) + 1);
  const ek = (net: number, kk: Kose) => (opts.yukDuzeltme === false || sabit(net) ? 0 : yukEki(pinSay.get(net) ?? 0, kk));

  interface Edge { ch: ChipInstance; from: string; to: string; src: number; dst: number; d: D; yon: Yon }
  const out = new Map<number, Edge[]>();
  const seqs: { ch: ChipInstance; s: Ardisik }[] = [];
  const gates: { ch: ChipInstance; ins: string[]; out: string; kontrol: 0 | 1 }[] = [];
  const kapali = (opts.kapali ?? []).map((k) => ({ neden: k.neden, sayi: 0 }));
  for (const ch of b.chips) {
    const m = model(ch.def.part);
    if (!m) {
      bilinmeyen.add(ch.def.part);
      continue;
    }
    for (const a of m.arcs) {
      const src = ch.nets[a.from], dst = ch.nets[a.to];
      if (src === undefined || dst === undefined) throw new Error(`${ch.def.part}: zamanlama modelinde bilinmeyen pin ${a.from}/${a.to}`);
      if (sabit(src) || sabit(dst)) continue;
      const kp = (opts.kapali ?? []).findIndex((k) => k.yay(ch, a.from, a.to));
      if (kp >= 0) {
        kapali[kp].sayi++;
        continue;
      }
      if (!out.has(src)) out.set(src, []);
      out.get(src)!.push({ ch, from: a.from, to: a.to, src, dst, d: a.d, yon: a.yon });
    }
    for (const s of m.seq) {
      // kapatılan saat → Q yayları (ör. okuma sırasında veriyolunu süren çıkış register'ı)
      const q = s.q.filter((qp) => {
        const kp = (opts.kapali ?? []).findIndex((k) => k.yay(ch, s.clock, qp));
        if (kp >= 0) kapali[kp].sayi++;
        return kp < 0;
      });
      seqs.push({ ch, s: q.length === s.q.length ? s : { ...s, q } });
    }
    for (const gt of m.gates ?? []) gates.push({ ch, ...gt });
  }

  // birleşimsel çizgenin topolojik sırası (döngüdeki kenarlar atılır ve bildirilir)
  const order: number[] = [];
  {
    const state = new Map<number, 1 | 2>();
    const back = new Set<Edge>();
    const visit = (root: number) => {
      const stack: { n: number; i: number }[] = [{ n: root, i: 0 }];
      state.set(root, 1);
      while (stack.length) {
        const top = stack[stack.length - 1];
        const es = out.get(top.n) ?? [];
        if (top.i < es.length) {
          const e = es[top.i++];
          const st = state.get(e.dst);
          if (st === 1) back.add(e);
          else if (st === undefined) {
            state.set(e.dst, 1);
            stack.push({ n: e.dst, i: 0 });
          }
        } else {
          state.set(top.n, 2);
          order.push(top.n);
          stack.pop();
        }
      }
    };
    for (const n of out.keys()) if (!state.has(n)) visit(n);
    order.reverse();
    for (const e of back) {
      uyarilar.push(`birleşimsel döngü: ${e.ch.ref} ${e.ch.def.part} ${e.from}→${e.to} (${b.netName(e.src)} → ${b.netName(e.dst)}) analizde atlandı`);
      const list = out.get(e.src)!;
      list.splice(list.indexOf(e), 1);
    }
  }

  const raporlar: KokRaporu[] = [];
  for (const kok of opts.kokler) {
    if (!b.has(kok.net)) throw new Error(`saat kökü bulunamadı: ${kok.net}`);
    const root = b.n(kok.net);

    // 1. saat ağacı: kökün yükselen kenarının her nete varışı ve yönü (+1 aynı, -1 ters)
    // t: seçilen köşede en geç varış; tTip: tipik gecikmelerle en geç varış (tutma kontrolü için)
    const saat = new Map<number, { t: number; tTip: number; yon: 1 | -1 }>();
    saat.set(root, { t: 0, tTip: 0, yon: 1 });
    for (const n of order) {
      const c = saat.get(n);
      if (!c) continue;
      for (const e of out.get(n) ?? []) {
        if (e.yon === 0) continue; // seçici / XOR üzerinden saat yayılmaz (seçim girişi sabit kabul edilir)
        const t = c.t + e.d[k] + ek(e.dst, kose);
        const tTip = c.tTip + e.d[0] + ek(e.dst, "tip");
        const yon = (c.yon * e.yon) as 1 | -1;
        const prev = saat.get(e.dst);
        if (prev && prev.yon !== yon) uyarilar.push(`${b.netName(e.dst)}: saat iki yönden geliyor`);
        saat.set(e.dst, { t: Math.max(t, prev?.t ?? -Infinity), tTip: Math.max(tTip, prev?.tTip ?? -Infinity), yon });
      }
    }

    // ardışık elemanlar: bu köke bağlı olanlar
    type Sinif = 1 | -1; // başlatan kenar: 1 yükselen, -1 düşen
    const elems = seqs
      .map(({ ch, s }) => {
        const c = saat.get(ch.nets[s.clock]);
        // kökün hangi kenarında tetiklendiği: pinin yönü × elemanın tetiklendiği kenar
        return { ch, s, c: c && { ...c, yon: (c.yon * (s.kenar ?? 1)) as 1 | -1 } };
      })
      .filter((x): x is { ch: ChipInstance; s: Ardisik; c: { t: number; tTip: number; yon: 1 | -1 } } => !!x.c);

    // saat kapılama: bir girişi saat ağacında, çıkışı saat ağacında olan kapılar
    // kenar: saat girişinin "geçirgen" olduğu kök kenarı (izin bundan önce oturmalı); kapanış: kontrol eden
    // değere döndüğü kenar (izin bundan sonra değişmeli); kapanisTip: o geçişin tipik varışı
    const kapilar: { ch: ChipInstance; pin: string; net: number; gerekli: number; kenar: Sinif; kapanisTip: number; kapanis: Sinif }[] = [];
    for (const gt of gates) {
      const outNet = gt.ch.nets[gt.out];
      const ci = gt.ins.find((p) => saat.has(gt.ch.nets[p]));
      if (!ci || !saat.has(outNet)) continue;
      const c = saat.get(gt.ch.nets[ci])!;
      // saat girişi kontrol eden değerden çıktığı an izin oturmuş olmalı: AND'de yükselirken, OR'da düşerken
      const kenar = (gt.kontrol === 0 ? c.yon : -c.yon) as Sinif;
      for (const p of gt.ins) {
        if (p === ci) continue;
        const net = gt.ch.nets[p];
        if (sabit(net) || saat.has(net)) continue;
        kapilar.push({ ch: gt.ch, pin: p, net, gerekli: c.t, kenar, kapanisTip: c.tTip, kapanis: -kenar as Sinif });
      }
    }

    const yollar: Yol[] = [];
    const tutma: TutmaKontrolu[] = [];
    const acikta: TutmaKontrolu[] = [];
    for (const sinif of [1, -1] as Sinif[]) {
      // 2. veri varışları
      const varis = new Map<number, Node>();
      const enErken = new Map<number, number>();
      for (const { ch, s, c } of elems) {
        if (c.yon !== sinif) continue;
        for (const q of s.q) {
          const net = ch.nets[q];
          if (net === undefined || sabit(net)) continue;
          const t = c.t + s.clkq[k] + ek(net, kose);
          const cur = varis.get(net);
          if (!cur || t > cur.t) varis.set(net, { net, t, prev: { node: { net: ch.nets[s.clock], t: c.t }, ref: ch.ref, part: ch.def.part, from: s.clock, to: q, d: s.clkq[k] + ek(net, kose) } });
          const tm = c.tTip + s.clkq[0];
          enErken.set(net, Math.min(enErken.get(net) ?? Infinity, tm));
        }
      }
      for (const n of order) {
        const cur = varis.get(n);
        const em = enErken.get(n);
        if (!cur && em === undefined) continue;
        for (const e of out.get(n) ?? []) {
          if (cur) {
            const d = e.d[k] + ek(e.dst, kose);
            const t = cur.t + d;
            const prev = varis.get(e.dst);
            if (!prev || t > prev.t) varis.set(e.dst, { net: e.dst, t, prev: { node: cur, ref: e.ch.ref, part: e.ch.def.part, from: e.from, to: e.to, d } });
          }
          if (em !== undefined) enErken.set(e.dst, Math.min(enErken.get(e.dst) ?? Infinity, em + e.d[0]));
        }
      }

      const izle = (n: Node): Adim[] => {
        const steps: Adim[] = [];
        for (let x: Node | undefined = n; x?.prev; x = x.prev.node) {
          steps.push({ ref: x.prev.ref, part: x.prev.part, from: x.prev.from, to: x.prev.to, net: b.netName(x.net), d: x.prev.d, t: x.t });
        }
        return steps.reverse();
      };
      const kenarAdi = (s: Sinif) => (s === 1 ? "yükselen" : "düşen");

      // 3. kurulum uç noktaları
      for (const { ch, s, c } of elems) {
        for (const p of s.data) {
          const net = ch.nets[p];
          const v = net === undefined ? undefined : varis.get(net);
          if (!v) continue;
          const pay = c.yon === sinif ? 1 : 0.5;
          const kur = s.setup[k];
          yollar.push({
            kok: kok.net, baslat: kenarAdi(sinif), yakala: kenarAdi(c.yon), pay, tur: "kurulum",
            bitis: { ref: ch.ref, pin: p, net: b.netName(net) }, adimlar: izle(v), varis: v.t, kurulum: kur, yakalaSaat: c.t,
            periyot: (v.t + kur - c.t) / pay,
          });
        }
      }
      for (const kp of kapilar) {
        const v = varis.get(kp.net);
        if (v) {
          const pay = kp.kenar === sinif ? 1 : 0.5;
          yollar.push({
            kok: kok.net, baslat: kenarAdi(sinif), yakala: kenarAdi(kp.kenar), pay, tur: "saat kapılama",
            bitis: { ref: kp.ch.ref, pin: kp.pin, net: b.netName(kp.net) }, adimlar: izle(v), varis: v.t, kurulum: 0, yakalaSaat: kp.gerekli,
            periyot: (v.t - kp.gerekli) / pay,
          });
        }
        const em = enErken.get(kp.net);
        if (em === undefined) continue;
        if (kp.kapanis === sinif) {
          // tutma: izin, kapının kapandığı kenarda başlatılıyorsa saat girişi kapandıktan SONRA değişmeli
          tutma.push({ ref: kp.ch.ref, pin: kp.pin, net: b.netName(kp.net), pay: em - kp.kapanisTip });
        } else {
          // izin, kapının açıldığı kenarda başlatılıyor: kapı açıkken değişebilir (mikrokod bunu dışlamalı)
          acikta.push({ ref: kp.ch.ref, pin: kp.pin, net: b.netName(kp.net), pay: em - kp.kapanisTip });
        }
      }
    }

    // aynı uç noktaya giden yollardan en kötüsünü tut
    const enKotu = new Map<string, Yol>();
    for (const y of yollar) {
      const key = `${y.bitis.ref}.${y.bitis.pin}`;
      const cur = enKotu.get(key);
      if (!cur || y.periyot > cur.periyot) enKotu.set(key, y);
    }
    const sirali = [...enKotu.values()].sort((a, b2) => b2.periyot - a.periyot);
    const enKisa = sirali.length ? sirali[0].periyot : 0;
    const tutmaSirali = tutma.sort((a, b2) => a.pay - b2.pay);
    raporlar.push({
      kok: kok.net, ad: kok.ad, elemanlar: elems.length, enKisaPeriyot: enKisa, fmaxMHz: enKisa > 0 ? 1000 / enKisa : Infinity,
      yollar: sirali.slice(0, opts.enCok ?? 10), tutma: dedupe(tutmaSirali), aciktaDegisen: dedupe(acikta),
    });
  }
  return { kose, kokler: raporlar, kapali, uyarilar, bilinmeyen: [...bilinmeyen].sort() };
}

function dedupe(t: TutmaKontrolu[]): TutmaKontrolu[] {
  const seen = new Set<string>();
  return t.filter((x) => {
    const k = `${x.ref}.${x.pin}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

/** Raporu okunur metne çevirir */
export function raporMetni(r: ZamanlamaRaporu, yolSayisi = 3): string {
  const L: string[] = [];
  const ns = (x: number) => `${x.toFixed(0)} ns`;
  L.push(`Köşe: ${r.kose === "maks" ? "en kötü (veri sayfası maks, 4,5 V, 25 °C)" : "tipik (veri sayfası tip, 4,5 V, 25 °C)"}`);
  for (const k of r.kokler) {
    L.push("");
    L.push(`${k.ad} (${k.kok}): ${k.elemanlar} ardışık eleman, en kısa periyot ${ns(k.enKisaPeriyot)} → en fazla ${k.fmaxMHz.toFixed(2)} MHz`);
    k.yollar.slice(0, yolSayisi).forEach((y, i) => {
      L.push(`  ${i + 1}. ${y.tur}: ${y.baslat} kenar → ${y.yakala} kenar (${y.pay === 1 ? "tam" : "yarım"} periyot), bitiş ${y.bitis.ref}.${y.bitis.pin} (${y.bitis.net})`);
      for (const a of y.adimlar) L.push(`       ${a.ref.padEnd(6)} ${a.part.padEnd(12)} ${`${a.from} → ${a.to}`.padEnd(14)} ${a.net.padEnd(14)} +${a.d.toFixed(0).padStart(3)}  = ${a.t.toFixed(0).padStart(4)}`);
      const kur = y.kurulum ? ` + kurulum ${y.kurulum}` : "";
      const sk = y.yakalaSaat ? ` − yakalayan saat gecikmesi ${y.yakalaSaat.toFixed(0)}` : "";
      L.push(`       toplam ${y.varis.toFixed(0)}${kur}${sk} = ${(y.varis + y.kurulum - y.yakalaSaat).toFixed(0)} ns ≤ ${y.pay === 1 ? "T" : "T/2"} → T ≥ ${ns(y.periyot)}`);
    });
    const dar = k.tutma.filter((t) => t.pay < 5);
    if (k.tutma.length) {
      const enAz = k.tutma[0];
      L.push(`  saat kapılama tutma payı (tipik): en az ${enAz.pay.toFixed(0)} ns (${enAz.ref}.${enAz.pin} ${enAz.net})${dar.length ? `, 5 ns'den az: ${dar.length}` : ""}`);
    }
  }
  for (const k of r.kapali) L.push(`\nanaliz dışı: ${k.sayi} yay (${k.neden})`);
  if (r.bilinmeyen.length) L.push(`\nZamanlama modeli olmayan parçalar (atlandı): ${r.bilinmeyen.join(", ")}`);
  for (const u of r.uyarilar) L.push(`uyarı: ${u}`);
  return L.join("\n");
}
