// Anakart bellek kartı için eklenen sıralı çip (Faz 6):
//   74HC273  8 bit D flip-flop register, ortak asenkron reset (bank register'ları)

import { dipFootprint, pinsOf, range, type ChipDef, type RefIn, type RefModel, type RefOut } from "../types.ts";

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

export const BELLEK_EK_CHIPS = [HC273];
