// Sıralı çipler (flip-flop, mandal, sayıcı, kaydırmalı register) ve veriyolu tamponları.

import {
  b, busOut, busValue, comb, dipFootprint, pinsOf, range,
  type ChipDef, type RefIn, type RefModel, type RefOut,
} from "../types.ts";

type Bit = 0 | 1 | null;
const rising = (prev: RefIn, cur: RefIn, pin: string) => prev[pin] === 0 && cur[pin] === 1;
const notBit = (v: Bit): Bit => (v === null ? null : v ? 0 : 1);

export const HC74: ChipDef = {
  part: "74HC74",
  title: "2 × D flip-flop (asenkron preset ve clear)",
  pkg: "DIP-14",
  footprint: dipFootprint(14),
  pins: pinsOf("~1CLR 1D 1CLK ~1PRE 1Q ~1Q GND ~2Q 2Q ~2PRE 2CLK 2D ~2CLR VCC", { out: "1Q ~1Q 2Q ~2Q" }),
  build(c, p) {
    for (const u of [1, 2]) {
      c.dff({ d: p[`${u}D`], clk: p[`${u}CLK`], preN: p[`~${u}PRE`], clrN: p[`~${u}CLR`], q: p[`${u}Q`], qn: p[`~${u}Q`] });
    }
  },
  ref: {
    init: (): Bit[] => [null, null],
    eval(s: Bit[], prev, cur) {
      const next = [...s];
      const out: RefOut = {};
      for (const u of [1, 2]) {
        const pre = cur[`~${u}PRE`], clr = cur[`~${u}CLR`];
        let q = next[u - 1];
        if (!pre && !clr) {
          q = 1;
          out[`${u}Q`] = 1;
          out[`~${u}Q`] = 1;
        } else {
          if (!pre) q = 1;
          else if (!clr) q = 0;
          else if (rising(prev, cur, `${u}CLK`)) q = cur[`${u}D`];
          out[`${u}Q`] = q;
          out[`~${u}Q`] = notBit(q);
        }
        next[u - 1] = q;
      }
      return { s: next, out };
    },
  } satisfies RefModel<Bit[]>,
  usage: "Kesme isteği yakalama, adım/tek komut devresi, IRQ senkronlama",
};

export const HC161: ChipDef = {
  part: "74HC161",
  title: "4 bit senkron ikili sayıcı (asenkron reset)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("~MR CP D0 D1 D2 D3 CEP GND ~PE CET Q3 Q2 Q1 Q0 TC VCC", { out: "Q0 Q1 Q2 Q3 TC" }),
  build(c, p) {
    const q = range("Q", 4).map((n) => p[n]);
    const load = c.not(p["~PE"]);
    const nload = p["~PE"];
    const cnt = c.and([p.CEP, p.CET]);
    for (let i = 0; i < 4; i++) {
      const carry = i === 0 ? cnt : c.and([cnt, ...q.slice(0, i)]);
      const next = c.xor(q[i], carry);
      const d = c.or([c.and([next, nload]), c.and([p[`D${i}`], load])]);
      c.dff({ d, clk: p.CP, clrN: p["~MR"], q: q[i] });
    }
    c.and([p.CET, ...q], p.TC);
  },
  ref: {
    init: (): number | null => null,
    eval(s: number | null, prev, cur) {
      let q = s;
      if (!cur["~MR"]) q = 0;
      else if (rising(prev, cur, "CP")) {
        if (!cur["~PE"]) q = busValue(cur, range("D", 4));
        else if (cur.CEP && cur.CET) q = q === null ? null : (q + 1) & 15;
      }
      const tc: Bit = !cur.CET ? 0 : q === null ? null : b(q === 15);
      return { s: q, out: { ...busOut(range("Q", 4), q), TC: tc } };
    },
  } satisfies RefModel<number | null>,
  usage: "Program sayacı (PC, 4 adet), mikrokod adım sayacı, zamanlayıcı",
};

export const HC165: ChipDef = {
  part: "74HC165",
  title: "8 bit paralel giriş / seri çıkış kaydırmalı register",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("~PL CP D4 D5 D6 D7 ~Q7 GND Q7 DS D0 D1 D2 D3 ~CE VCC", { out: "Q7 ~Q7" }),
  build(c, p) {
    const pl = c.not(p["~PL"]);
    const clk = c.or([p.CP, p["~CE"]]);
    let prevQ = p.DS;
    for (let i = 0; i < 8; i++) {
      const d = p[`D${i}`];
      const ff = c.dff({
        d: prevQ,
        clk,
        preN: c.nand([pl, d]),
        clrN: c.nand([pl, c.not(d)]),
        q: i === 7 ? p.Q7 : undefined,
        qn: i === 7 ? p["~Q7"] : undefined,
      });
      prevQ = ff.q;
    }
  },
  ref: {
    init: (): Bit[] => Array(8).fill(null),
    eval(s: Bit[], prev, cur) {
      let r = s;
      const clkPrev = prev.CP | prev["~CE"];
      const clkCur = cur.CP | cur["~CE"];
      if (!cur["~PL"]) r = range("D", 8).map((n) => cur[n]);
      else if (clkPrev === 0 && clkCur === 1) r = [cur.DS, ...s.slice(0, 7)];
      return { s: r, out: { Q7: r[7], "~Q7": notBit(r[7]) } };
    },
  } satisfies RefModel<Bit[]>,
  usage: "Klavye (PS/2) ve UART alıcısı: seri bitleri toplama tarafı / buton okuma",
};

export const HC175: ChipDef = {
  part: "74HC175",
  title: "4 × D flip-flop (ortak saat, asenkron reset)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("~MR Q0 ~Q0 D0 D1 ~Q1 Q1 GND CP Q2 ~Q2 D2 D3 ~Q3 Q3 VCC", {
    out: "Q0 ~Q0 Q1 ~Q1 Q2 ~Q2 Q3 ~Q3",
  }),
  build(c, p) {
    for (let i = 0; i < 4; i++) c.dff({ d: p[`D${i}`], clk: p.CP, clrN: p["~MR"], q: p[`Q${i}`], qn: p[`~Q${i}`] });
  },
  ref: {
    init: (): Bit[] => Array(4).fill(null),
    eval(s: Bit[], prev, cur) {
      let r = s;
      if (!cur["~MR"]) r = [0, 0, 0, 0];
      else if (rising(prev, cur, "CP")) r = range("D", 4).map((n) => cur[n]);
      const out: RefOut = {};
      r.forEach((v, i) => {
        out[`Q${i}`] = v;
        out[`~Q${i}`] = notBit(v);
      });
      return { s: r, out };
    },
  } satisfies RefModel<Bit[]>,
  usage: "Bayrak register'ı (N Z C V), I biti",
};

function octalReg(kind: "latch" | "dff"): Pick<ChipDef, "build" | "ref"> {
  const clkPin = kind === "latch" ? "LE" : "CP";
  return {
    build(c, p) {
      const en = c.not(p["~OE"]);
      for (let i = 0; i < 8; i++) {
        const st = kind === "latch" ? c.latch({ d: p[`D${i}`], en: p.LE }) : c.dff({ d: p[`D${i}`], clk: p.CP });
        c.tbuf(st.q, en, p[`Q${i}`]);
      }
    },
    ref: {
      init: (): Bit[] => Array(8).fill(null),
      eval(s: Bit[], prev, cur) {
        let r = s;
        if (kind === "latch" ? cur.LE === 1 : rising(prev, cur, clkPin)) r = range("D", 8).map((n) => cur[n]);
        const out: RefOut = {};
        r.forEach((v, i) => (out[`Q${i}`] = cur["~OE"] ? "Z" : v));
        return { s: r, out };
      },
    } satisfies RefModel<Bit[]>,
  };
}

export const HC573: ChipDef = {
  part: "74HC573",
  title: "8 bit şeffaf mandal (üç durumlu çıkış)",
  pkg: "DIP-20",
  footprint: dipFootprint(20),
  pins: pinsOf("~OE D0 D1 D2 D3 D4 D5 D6 D7 GND LE Q7 Q6 Q5 Q4 Q3 Q2 Q1 Q0 VCC", { tri: range("Q", 8).join(" ") }),
  ...octalReg("latch"),
  usage: "Adres mandalı (bank register'ı çıkışı), video karakter mandalı",
};

export const HC574: ChipDef = {
  part: "74HC574",
  title: "8 bit D flip-flop register (üç durumlu çıkış)",
  pkg: "DIP-20",
  footprint: dipFootprint(20),
  pins: pinsOf("~OE D0 D1 D2 D3 D4 D5 D6 D7 GND CP Q7 Q6 Q5 Q4 Q3 Q2 Q1 Q0 VCC", { tri: range("Q", 8).join(" ") }),
  ...octalReg("dff"),
  usage: "Register dosyası (8 × 16 bit = 16 adet), IR, MAR, TA/TB, bank register'ları, G/Ç register'ları",
};

export const HC595: ChipDef = {
  part: "74HC595",
  title: "8 bit seri giriş / paralel çıkış kaydırmalı register (çıkış mandallı)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("Q1 Q2 Q3 Q4 Q5 Q6 Q7 GND Q7S ~MR SHCP STCP ~OE DS Q0 VCC", { out: "Q7S", tri: range("Q", 8).join(" ") }),
  build(c, p) {
    const en = c.not(p["~OE"]);
    let prevQ = p.DS;
    for (let i = 0; i < 8; i++) {
      const sr = c.dff({ d: prevQ, clk: p.SHCP, clrN: p["~MR"], q: i === 7 ? p.Q7S : undefined });
      const st = c.dff({ d: sr.q, clk: p.STCP });
      c.tbuf(st.q, en, p[`Q${i}`]);
      prevQ = sr.q;
    }
  },
  ref: {
    init: () => ({ sr: Array(8).fill(null) as Bit[], st: Array(8).fill(null) as Bit[] }),
    eval(s: { sr: Bit[]; st: Bit[] }, prev, cur) {
      let { sr, st } = s;
      if (!cur["~MR"]) sr = Array(8).fill(0);
      else if (rising(prev, cur, "SHCP")) sr = [cur.DS, ...sr.slice(0, 7)];
      if (rising(prev, cur, "STCP")) st = [...sr];
      const out: RefOut = { Q7S: sr[7] };
      st.forEach((v, i) => (out[`Q${i}`] = cur["~OE"] ? "Z" : v));
      return { s: { sr, st }, out };
    },
  },
  usage: "EEPROM programlayıcısı (Arduino + 2 × 595 adres), LED panel sürme, UART verici",
};

export const HC245: ChipDef = {
  part: "74HC245",
  title: "8 bit çift yönlü veriyolu alıcı-vericisi",
  pkg: "DIP-20",
  footprint: dipFootprint(20),
  pins: pinsOf("DIR A0 A1 A2 A3 A4 A5 A6 A7 GND B7 B6 B5 B4 B3 B2 B1 B0 ~OE VCC", {
    bidir: [...range("A", 8), ...range("B", 8)].join(" "),
  }),
  build(c, p) {
    const en = c.not(p["~OE"]);
    const ab = c.and([en, p.DIR]);
    const ba = c.and([en, c.not(p.DIR)]);
    for (let i = 0; i < 8; i++) {
      c.tbuf(p[`A${i}`], ab, p[`B${i}`]);
      c.tbuf(p[`B${i}`], ba, p[`A${i}`]);
    }
  },
  ref: comb((p) => {
    const out: RefOut = {};
    for (let i = 0; i < 8; i++) {
      const oe = !p["~OE"];
      out[`B${i}`] = oe && p.DIR ? p[`A${i}`] : "Z";
      out[`A${i}`] = oe && !p.DIR ? p[`B${i}`] : "Z";
    }
    return out;
  }),
  usage: "Kartlar arası veriyolu (backplane) ve bellek veri yolu yön kontrolü",
};

export const HC541: ChipDef = {
  part: "74HC541",
  title: "8 bit üç durumlu tampon (iki aktif düşük OE)",
  pkg: "DIP-20",
  footprint: dipFootprint(20),
  pins: pinsOf("~OE1 A0 A1 A2 A3 A4 A5 A6 A7 GND Y7 Y6 Y5 Y4 Y3 Y2 Y1 Y0 ~OE2 VCC", { tri: range("Y", 8).join(" ") }),
  build(c, p) {
    const en = c.nor([p["~OE1"], p["~OE2"]]);
    for (let i = 0; i < 8; i++) c.tbuf(p[`A${i}`], en, p[`Y${i}`]);
  },
  ref: comb((p) => {
    const en = !p["~OE1"] && !p["~OE2"];
    const out: RefOut = {};
    for (let i = 0; i < 8; i++) out[`Y${i}`] = en ? p[`A${i}`] : "Z";
    return out;
  }),
  usage: "İç veriyolu sürücüleri (PC, ALU, sabit birimi → veriyolu), adres tamponu",
};

export const SEQ_CHIPS = [HC74, HC161, HC165, HC175, HC573, HC574, HC595];
export const BUS_CHIPS = [HC245, HC541];
