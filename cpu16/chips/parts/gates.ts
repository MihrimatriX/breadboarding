// SSI kapı çipleri: 74HC00 02 04 08 10 14 32 86 ve üç durumlu tampon 74HC125.

import type { GateKind } from "../logic.ts";
import { b, comb, dipFootprint, pinsOf, type ChipDef, type RefOut } from "../types.ts";

const QUAD2 = "1A 1B 1Y 2A 2B 2Y GND 3Y 3A 3B 4Y 4A 4B VCC";

function quad2(part: string, title: string, kind: GateKind, fn: (a: number, b: number) => boolean, usage: string): ChipDef {
  return {
    part,
    title,
    pkg: "DIP-14",
    footprint: dipFootprint(14),
    pins: pinsOf(QUAD2, { out: "1Y 2Y 3Y 4Y" }),
    build(c, p) {
      for (let u = 1; u <= 4; u++) c.add(kind, [p[`${u}A`], p[`${u}B`]], [p[`${u}Y`]]);
    },
    ref: comb((p) => {
      const out: RefOut = {};
      for (let u = 1; u <= 4; u++) out[`${u}Y`] = b(fn(p[`${u}A`], p[`${u}B`]));
      return out;
    }),
    usage,
  };
}

function hexInv(part: string, title: string, usage: string): ChipDef {
  return {
    part,
    title,
    pkg: "DIP-14",
    footprint: dipFootprint(14),
    pins: pinsOf("1A 1Y 2A 2Y 3A 3Y GND 4Y 4A 5Y 5A 6Y 6A VCC", { out: "1Y 2Y 3Y 4Y 5Y 6Y" }),
    build(c, p) {
      for (let u = 1; u <= 6; u++) c.not(p[`${u}A`], p[`${u}Y`]);
    },
    ref: comb((p) => {
      const out: RefOut = {};
      for (let u = 1; u <= 6; u++) out[`${u}Y`] = b(!p[`${u}A`]);
      return out;
    }),
    usage,
  };
}

export const HC00 = quad2("74HC00", "4 × 2 girişli NAND", "NAND", (a, c) => !(a && c), "Deney 2 (NAND'ın içi), genel yapıştırıcı lojik");
export const HC08 = quad2("74HC08", "4 × 2 girişli AND", "AND", (a, c) => !!(a && c), "Saat kapılama, adres çözme");
export const HC32 = quad2("74HC32", "4 × 2 girişli OR", "OR", (a, c) => !!(a || c), "Kontrol sinyali birleştirme, IRQ VEYA'sı");
export const HC86 = quad2("74HC86", "4 × 2 girişli XOR", "XOR", (a, c) => a !== c, "ALU (çıkarmada B'yi tersleme), koşul biriminde tersleme");

export const HC02: ChipDef = {
  part: "74HC02",
  title: "4 × 2 girişli NOR",
  pkg: "DIP-14",
  footprint: dipFootprint(14),
  pins: pinsOf("1Y 1A 1B 2Y 2A 2B GND 3A 3B 3Y 4A 4B 4Y VCC", { out: "1Y 2Y 3Y 4Y" }),
  build(c, p) {
    for (let u = 1; u <= 4; u++) c.nor([p[`${u}A`], p[`${u}B`]], p[`${u}Y`]);
  },
  ref: comb((p) => {
    const out: RefOut = {};
    for (let u = 1; u <= 4; u++) out[`${u}Y`] = b(!(p[`${u}A`] || p[`${u}B`]));
    return out;
  }),
  usage: "Z bayrağı (sıfır algılama ağacı), reset mantığı",
};

export const HC04 = hexInv("74HC04", "6 × NOT (evirici)", "Aktif düşük sinyalleri çevirme");
export const HC14 = hexInv("74HC14", "6 × Schmitt tetiklemeli NOT", "Saat ve reset butonu (gürültü bastırma; histerezis modellenmez)");

export const HC10: ChipDef = {
  part: "74HC10",
  title: "3 × 3 girişli NAND",
  pkg: "DIP-14",
  footprint: dipFootprint(14),
  pins: pinsOf("1A 1B 2A 2B 2C 2Y GND 3Y 3A 3B 3C 1Y 1C VCC", { out: "1Y 2Y 3Y" }),
  build(c, p) {
    for (let u = 1; u <= 3; u++) c.nand([p[`${u}A`], p[`${u}B`], p[`${u}C`]], p[`${u}Y`]);
  },
  ref: comb((p) => {
    const out: RefOut = {};
    for (let u = 1; u <= 3; u++) out[`${u}Y`] = b(!(p[`${u}A`] && p[`${u}B`] && p[`${u}C`]));
    return out;
  }),
  usage: "Bellek seçme (adres çözücü yardımcı kapıları)",
};

export const HC125: ChipDef = {
  part: "74HC125",
  title: "4 × üç durumlu tampon (aktif düşük OE)",
  pkg: "DIP-14",
  footprint: dipFootprint(14),
  pins: pinsOf("~1OE 1A 1Y ~2OE 2A 2Y GND 3Y 3A ~3OE 4Y 4A ~4OE VCC", { tri: "1Y 2Y 3Y 4Y" }),
  build(c, p) {
    for (let u = 1; u <= 4; u++) c.tbuf(p[`${u}A`], c.not(p[`~${u}OE`]), p[`${u}Y`]);
  },
  ref: comb((p) => {
    const out: RefOut = {};
    for (let u = 1; u <= 4; u++) out[`${u}Y`] = p[`~${u}OE`] ? "Z" : p[`${u}A`];
    return out;
  }),
  usage: "Bayrakları veriyoluna sürme, tek bitlik paylaşılan hatlar",
};

export const GATE_CHIPS = [HC00, HC02, HC04, HC08, HC10, HC14, HC32, HC86, HC125];
