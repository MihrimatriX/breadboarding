// Anakart bellek ve önbellek kartları için eklenen sıralı çipler (Faz 6):
//   74HC273  8 bit D flip-flop register, ortak asenkron reset (bank register'ları)
//   74HC590  8 bit ikili sayıcı + çıkış register'ı, üç durumlu çıkış (önbellek isabet/ıskalama sayaçları)

import { busOut, dipFootprint, pinsOf, range, type ChipDef, type RefIn, type RefModel, type RefOut } from "../types.ts";

type Bit = 0 | 1 | null;
const rising = (prev: RefIn, cur: RefIn, pin: string) => prev[pin] === 0 && cur[pin] === 1;

export const HC273: ChipDef = {
  part: "74HC273",
  title: "8 bit D flip-flop register (ortak asenkron reset)",
  pkg: "DIP-20",
  footprint: dipFootprint(20),
  pins: pinsOf("~MR Q0 D0 D1 Q1 Q2 D2 D3 Q3 GND CP Q4 D4 D5 Q5 Q6 D6 D7 Q7 VCC", { out: range("Q", 8).join(" ") }),
  build(c, p) {
    for (let i = 0; i < 8; i++) c.dff({ d: p[`D${i}`], clk: p.CP, clrN: p["~MR"], q: p[`Q${i}`] });
  },
  ref: {
    init: (): Bit[] => Array(8).fill(null),
    eval(s: Bit[], prev, cur) {
      let r = s;
      if (!cur["~MR"]) r = Array(8).fill(0);
      else if (rising(prev, cur, "CP")) r = range("D", 8).map((n) => cur[n]);
      const out: RefOut = {};
      r.forEach((v, i) => (out[`Q${i}`] = v));
      return { s: r, out };
    },
  } satisfies RefModel<Bit[]>,
  usage: "Bank register'ları (reset'te sıfırlanır; 1 olması gereken bitler evirici çiftiyle saklanır)",
};

interface Hc590State {
  /** sayıcı (null = güç verildikten sonra bilinmiyor) */
  cnt: number | null;
  /** çıkış register'ı */
  reg: number | null;
}

/**
 * 74HC590: sayıcı CPC'nin yükselen kenarında ~CEC = 0 iken bir artar, ~MRC = 0 iken asenkron sıfırlanır.
 * Çıkış register'ı CPR'nin yükselen kenarında sayıcının o anki değerini alır; Q0..Q7 = register (~OE = 1 iken Z).
 * ~RCO: sayıcı 255 iken düşük (sayma izninden bağımsız). Kartlarda üst sayıcının ~CEC'si
 * ~CEC_alt ∨ ~RCO_alt yapılır; böylece ~RCO'nun izinle kapılanıp kapılanmaması sonucu değiştirmez.
 */
export const HC590: ChipDef = {
  part: "74HC590",
  title: "8 bit ikili sayıcı + çıkış register'ı (üç durumlu çıkış)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("Q1 Q2 Q3 Q4 Q5 Q6 Q7 GND ~RCO ~MRC CPC ~CEC CPR ~OE Q0 VCC", { out: "~RCO", tri: range("Q", 8).join(" ") }),
  build(c, p) {
    const en = c.not(p["~CEC"]);
    const oe = c.not(p["~OE"]);
    const q = range("q", 8).map(() => c.net());
    for (let i = 0; i < 8; i++) {
      const carry = i === 0 ? en : c.and([en, ...q.slice(0, i)]);
      c.dff({ d: c.xor(q[i], carry), clk: p.CPC, clrN: p["~MRC"], q: q[i] });
    }
    for (let i = 0; i < 8; i++) {
      const st = c.dff({ d: q[i], clk: p.CPR });
      c.tbuf(st.q, oe, p[`Q${i}`]);
    }
    c.nand(q, p["~RCO"]);
  },
  ref: {
    init: (): Hc590State => ({ cnt: null, reg: null }),
    eval(s: Hc590State, prev, cur) {
      let { cnt, reg } = s;
      if (!cur["~MRC"]) cnt = 0;
      else if (rising(prev, cur, "CPC") && !cur["~CEC"]) cnt = cnt === null ? null : (cnt + 1) & 0xff;
      if (rising(prev, cur, "CPR")) reg = cnt;
      const out: RefOut = { "~RCO": cnt === null ? null : cnt === 255 ? 0 : 1 };
      if (cur["~OE"]) range("Q", 8).forEach((n) => (out[n] = "Z"));
      else busOut(range("Q", 8), reg, out);
      return { s: { cnt, reg }, out };
    },
  } satisfies RefModel<Hc590State>,
  usage: "Önbellek isabet ve ıskalama sayaçları (2 × 2 adet = iki 16 bit sayaç, G/Ç'den okunur)",
};

export const BELLEK_EK_CHIPS = [HC273, HC590];
