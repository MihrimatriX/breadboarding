// Anakartın G/Ç ve video kartları için eklenen çipler (Faz 6, kapı seviyesi):
//   74HC05  6 × açık-akaçlı (open-drain) evirici: PS/2 saat hattını "inhibit" için aşağı çekmek
//   74HC166 8 bit paralel giriş / seri çıkış kaydırmalı register, EŞZAMANLI yükleme: video piksel kaydırıcı
//   74HC393 2 × 4 bit dalgalı (ripple) ikili sayıcı: video kare sayacı (imleç yanıp sönmesi)
// Pin düzenleri veri sayfasıyla aynıdır; her çipin kapı devresi ve fonksiyon tablosu (ref) ayrı ayrı
// yazılır, testler (chips.test.ts) ikisini ve CMOS açılımını karşılaştırır.

import { busOut, comb, dipFootprint, pinsOf, range, type ChipDef, type RefIn, type RefModel, type RefOut } from "../types.ts";

type Bit = 0 | 1 | null;
const falling = (prev: RefIn, cur: RefIn, pin: string) => prev[pin] === 1 && cur[pin] === 0;

export const HC05: ChipDef = {
  part: "74HC05",
  title: "6 × NOT, açık-akaçlı (open-drain) çıkış",
  pkg: "DIP-14",
  footprint: dipFootprint(14),
  // çıkış ya 0 sürer ya da bırakır (Z): hattaki çekme direnci 1 yapar
  pins: pinsOf("1A 1Y 2A 2Y 3A 3Y GND 4Y 4A 5Y 5A 6Y 6A VCC", { tri: "1Y 2Y 3Y 4Y 5Y 6Y" }),
  build(c, p) {
    for (let u = 1; u <= 6; u++) c.tbuf(c.GND, p[`${u}A`], p[`${u}Y`]);
  },
  ref: comb((p) => {
    const out: RefOut = {};
    for (let u = 1; u <= 6; u++) out[`${u}Y`] = p[`${u}A`] ? 0 : "Z";
    return out;
  }),
  usage: "PS/2 klavye: READY iken saat hattını aşağı çeker (inhibit); paylaşılan açık-kollektör hatlar",
};

export const HC166: ChipDef = {
  part: "74HC166",
  title: "8 bit paralel giriş / seri çıkış kaydırmalı register (eşzamanlı yükleme)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("DS D0 D1 D2 D3 ~CE CP GND ~MR D4 D5 D6 Q7 D7 ~PE VCC", { out: "Q7" }),
  build(c, p) {
    // ~CE yüksekken saat engellenir (iç saat = CP + ~CE); ~PE düşükse kenarda yükler, yüksekse kaydırır
    const clk = c.or([p.CP, p["~CE"]]);
    const load = c.not(p["~PE"]);
    let prevQ = p.DS;
    for (let i = 0; i < 8; i++) {
      const d = c.mux2(prevQ, p[`D${i}`], load, p["~PE"]);
      const ff = c.dff({ d, clk, clrN: p["~MR"], q: i === 7 ? p.Q7 : undefined });
      prevQ = ff.q;
    }
  },
  ref: {
    init: (): Bit[] => Array(8).fill(null),
    eval(s: Bit[], prev, cur) {
      let r = s;
      const clkPrev = prev.CP | prev["~CE"];
      const clkCur = cur.CP | cur["~CE"];
      if (!cur["~MR"]) r = Array(8).fill(0);
      else if (clkPrev === 0 && clkCur === 1) r = cur["~PE"] ? [cur.DS, ...s.slice(0, 7)] : range("D", 8).map((n) => cur[n]);
      return { s: r, out: { Q7: r[7] } };
    },
  } satisfies RefModel<Bit[]>,
  usage: "Video kartı piksel kaydırıcısı: karakter ROM'unun satırını piksel saatinde dışarı kaydırır",
};

export const HC393: ChipDef = {
  part: "74HC393",
  title: "2 × 4 bit dalgalı (ripple) ikili sayıcı (düşen kenar, asenkron temizleme)",
  pkg: "DIP-14",
  footprint: dipFootprint(14),
  pins: pinsOf("~1CP 1MR 1Q0 1Q1 1Q2 1Q3 GND 2Q3 2Q2 2Q1 2Q0 2MR ~2CP VCC", {
    out: "1Q0 1Q1 1Q2 1Q3 2Q0 2Q1 2Q2 2Q3",
  }),
  build(c, p) {
    for (const u of [1, 2]) {
      const clrN = c.not(p[`${u}MR`]);
      // her basamak bir öncekinin düşen kenarında döner (T flip-flop: D = Q̅)
      let clk = c.not(p[`~${u}CP`]);
      for (let i = 0; i < 4; i++) {
        const qn = c.net();
        c.dff({ d: qn, clk, clrN, q: p[`${u}Q${i}`], qn });
        clk = qn;
      }
    }
  },
  ref: {
    init: (): (number | null)[] => [null, null],
    eval(s: (number | null)[], prev, cur) {
      const next = [...s];
      const out: RefOut = {};
      for (const u of [1, 2]) {
        let q = next[u - 1];
        if (cur[`${u}MR`]) q = 0;
        else if (falling(prev, cur, `~${u}CP`)) q = q === null ? null : (q + 1) & 15;
        next[u - 1] = q;
        busOut(range(`${u}Q`, 4), q, out);
      }
      return { s: next, out };
    },
  } satisfies RefModel<(number | null)[]>,
  usage: "Video kartı kare sayacı: imleç 16 karede bir yanıp söner",
};

export const GC_EK_CHIPS = [HC05, HC166, HC393];
