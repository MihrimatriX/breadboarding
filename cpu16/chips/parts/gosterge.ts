// 7 segment gösterge sürücüsü: 8 bit hesap makinesinin (hesap8/) onluk göstergeleri.

import { b, busValue, dipFootprint, pinsOf, type ChipDef, type RefIn, type RefModel, type RefOut } from "../types.ts";

/** Segment sırası: a b c d e f g */
export const SEGMENTLER = ["a", "b", "c", "d", "e", "f", "g"] as const;

/**
 * 74HC4511'in rakam deseni (veri sayfası işlev tablosu): her rakam için yanan segmentler.
 * 4511'de 6'nın üst çizgisi (a) ve 9'un alt çizgisi (d) yoktur ("kuyruksuz" 6 ve 9).
 * 10–15 girişleri göstergeyi söndürür.
 */
export const RAKAM_SEGMENT: readonly string[] = [
  "abcdef", // 0
  "bc", // 1
  "abdeg", // 2
  "abcdg", // 3
  "bcfg", // 4
  "acdfg", // 5
  "cdefg", // 6 (kuyruksuz)
  "abc", // 7
  "abcdefg", // 8
  "abcfg", // 9 (kuyruksuz)
];

/** Rakamın segment değerleri (a..g); 10–15 → hepsi sönük */
export const segmentDegerleri = (v: number): (0 | 1)[] => SEGMENTLER.map((s) => b(v <= 9 && RAKAM_SEGMENT[v].includes(s)));

const GIRIS = ["A", "B", "C", "D"];

export const HC4511: ChipDef = {
  part: "74HC4511",
  title: "BCD'den 7 segmente kod çözücü / sürücü (mandallı, ortak katot)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("B C ~LT ~BI LE D A GND e d c b a g f VCC", { out: "a b c d e f g" }),
  build(c, p) {
    // LE = 0: mandal geçirgen (girişi izler); LE = 1: son değeri tutar
    const len = c.not(p.LE);
    const q = GIRIS.map((n) => c.latch({ d: p[n], en: len }));
    const bit = q.map((x) => x.q);
    const nbit = q.map((x) => x.qn);
    // her rakam için bir AND (minterm): 0–9 dışındaki girişlerde hiçbiri 1 olmaz → sönük
    const rakam = RAKAM_SEGMENT.map((_, v) => c.and(bit.map((x, i) => ((v >> i) & 1 ? x : nbit[i]))));
    // söndürme (~BI = 0) ve lamba testi (~LT = 0, söndürmeden önceliklidir)
    const lt = c.not(p["~LT"]);
    for (const s of SEGMENTLER) {
      const yanan = RAKAM_SEGMENT.flatMap((d, v) => (d.includes(s) ? [rakam[v]] : []));
      const seg = c.or(yanan);
      const acik = c.and([seg, p["~BI"]]);
      c.or([acik, lt], p[s]);
    }
  },
  ref: {
    init: (): number | null => null,
    eval(s: number | null, _prev: RefIn, cur: RefIn) {
      const v = cur.LE ? s : busValue(cur, GIRIS);
      const out: RefOut = {};
      const seg = !cur["~LT"] ? SEGMENTLER.map(() => 1 as const) : !cur["~BI"] ? SEGMENTLER.map(() => 0 as const) : v === null ? null : segmentDegerleri(v);
      SEGMENTLER.forEach((n, i) => (out[n] = seg === null ? null : seg[i]));
      return { s: v, out };
    },
  } satisfies RefModel<number | null>,
  usage: "8 bit hesap makinesi: her onluk hane için bir sürücü (ortak katotlu 7 segment gösterge, segment başına 330 Ω)",
};

export const GOSTERGE_CHIPS = [HC4511];
