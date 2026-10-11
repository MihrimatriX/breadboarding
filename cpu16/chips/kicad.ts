// Parça kütüphanesinden KiCad sembol kütüphanesi (.kicad_sym) üretir.
// Pin numaraları ve adları tek kaynaktan (library.ts) gelir; şema çizerken kullanılan sembol ile
// simülatörün çalıştırdığı model böylece hiç ayrışmaz. Biçim: KiCad 7+ (sürüm 20220914).

import type { ChipDef, PinDef } from "./types.ts";

const G = 2.54;
const ELEC: Record<PinDef["dir"], string> = {
  in: "input",
  out: "output",
  tri: "tri_state",
  bidir: "bidirectional",
  power: "power_in",
  nc: "no_connect",
  passive: "passive",
};

const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const mm = (v: number) => (Math.round(v * 1000) / 1000).toString();
const font = "(effects (font (size 1.27 1.27)))";
const fontHidden = "(effects (font (size 1.27 1.27)) hide)";

/** "~OE" → "~{OE}" (KiCad üst çizgi) */
export const kicadPinName = (n: string) => (n.startsWith("~") ? `~{${n.slice(1)}}` : n);

export interface SymbolPin {
  pin: PinDef;
  /** bağlantı noktası (sembol koordinatı, y yukarı) */
  x: number;
  y: number;
  angle: number;
}

/** Sembol yerleşimi: girişler solda, çıkışlar sağda, VCC üstte, GND altta */
export function symbolLayout(def: Pick<ChipDef, "pins">): { w: number; h: number; pins: SymbolPin[] } {
  const passive = def.pins.filter((p) => p.dir === "passive");
  if (passive.length === 2 && def.pins.length === 2) {
    // iki uçlu eleman (direnç, kondansatör, LED): dikey, 1 üstte
    const w = G;
    const h = G;
    return { w, h, pins: [{ pin: def.pins[0], x: 0, y: h + G, angle: 270 }, { pin: def.pins[1], x: 0, y: -h - G, angle: 90 }] };
  }
  const left = def.pins.filter((p) => p.dir === "in" || p.dir === "nc" || (p.dir === "passive" && p.num % 2 === 1));
  const right = def.pins.filter((p) => p.dir === "out" || p.dir === "tri" || p.dir === "bidir" || (p.dir === "passive" && p.num % 2 === 0));
  const power = def.pins.filter((p) => p.dir === "power");
  const rows = Math.max(left.length, right.length);
  const h = (Math.ceil(rows / 2) + 1) * G; // yarım yükseklik, ızgaraya oturur
  const w = 3 * G;
  const top = h - G;
  const pins: SymbolPin[] = [
    ...left.map((pin, i) => ({ pin, x: -w - G, y: top - i * G, angle: 0 })),
    ...right.map((pin, i) => ({ pin, x: w + G, y: top - i * G, angle: 180 })),
    ...power.map((pin, i) => {
      const ground = /^(GND|VSS)$/.test(pin.name) || (power.length === 2 && i === 1 && !/^(VCC|VDD)$/.test(pin.name));
      return { pin, x: 0, y: ground ? -h - G : h + G, angle: ground ? 90 : 270 };
    }),
  ];
  return { w, h, pins };
}

/** Kütüphanede ya da şemaya gömülü sembol tanımı. `name` gömülüde "cpu16:74HC00" olur. */
export function symbolDef(def: Pick<ChipDef, "part" | "title" | "pins" | "footprint" | "usage">, name = def.part, indent = "  "): string {
  const { w, h, pins } = symbolLayout(def);
  const pinLine = (sp: SymbolPin) =>
    `${indent}    (pin ${ELEC[sp.pin.dir]} line (at ${mm(sp.x)} ${mm(sp.y)} ${sp.angle}) (length ${G})${sp.pin.dir === "nc" ? " hide" : ""}\n` +
    `${indent}      (name ${q(kicadPinName(sp.pin.name))} ${font})\n${indent}      (number ${q(String(sp.pin.num))} ${font}))`;
  return [
    `${indent}(symbol ${q(name)} (pin_names (offset 1.016)) (in_bom yes) (on_board yes)`,
    `${indent}  (property "Reference" ${q(def.part.startsWith("~") ? "X" : refPrefix(def.part))} (at ${mm(-w)} ${mm(h + 1.27)} 0) ${font})`,
    `${indent}  (property "Value" ${q(def.part)} (at ${mm(w)} ${mm(h + 1.27)} 0) ${font})`,
    `${indent}  (property "Footprint" ${q(def.footprint)} (at 0 0 0) ${fontHidden})`,
    `${indent}  (property "Datasheet" "" (at 0 0 0) ${fontHidden})`,
    `${indent}  (property "ki_description" ${q(def.title)} (at 0 0 0) ${fontHidden})`,
    `${indent}  (property "CPU16_Kullanim" ${q(def.usage)} (at 0 0 0) ${fontHidden})`,
    `${indent}  (symbol ${q(`${def.part}_0_1`)}`,
    `${indent}    (rectangle (start ${mm(-w)} ${mm(h)}) (end ${mm(w)} ${mm(-h)}) (stroke (width 0.254) (type default)) (fill (type background)))`,
    `${indent}  )`,
    `${indent}  (symbol ${q(`${def.part}_1_1`)}`,
    ...pins.map(pinLine),
    `${indent}  )`,
    `${indent})`,
  ].join("\n");
}

/** Referans harfi: entegre U, direnç R, direnç dizisi RN, kondansatör C, LED D, konnektör J, anahtar SW, pot RV, osilatör X, modül A */
export function refPrefix(part: string): string {
  if (part.startsWith("RN")) return "RN";
  if (part.startsWith("R_")) return "R";
  if (part.startsWith("C_")) return "C";
  if (part.startsWith("LED")) return "D";
  if (part.startsWith("CONN") || part.startsWith("BACKPLANE")) return "J";
  if (part.startsWith("SW_")) return "SW";
  if (part.startsWith("POT")) return "RV";
  if (part.startsWith("OSC")) return "X";
  if (part.startsWith("ARDUINO")) return "A";
  return "U";
}

export function kicadSymbolLibrary(chips: Pick<ChipDef, "part" | "title" | "pins" | "footprint" | "usage">[]): string {
  return [
    "(kicad_symbol_lib (version 20220914) (generator cpu16_chips)",
    ...chips.map((c) => symbolDef(c)),
    ")",
    "",
  ].join("\n");
}

/** Basit S-ifadesi ayrıştırıcı (testler ve içe aktarıcı için): parantez dengesi + ağaç */
export type SExpr = string | SExpr[];
export function parseSExpr(src: string): SExpr {
  let i = 0;
  const ws = () => {
    while (i < src.length && /\s/.test(src[i])) i++;
  };
  const read = (): SExpr => {
    ws();
    if (src[i] === "(") {
      i++;
      const list: SExpr[] = [];
      for (;;) {
        ws();
        if (i >= src.length) throw new Error("S-ifadesi: kapanmayan parantez");
        if (src[i] === ")") {
          i++;
          return list;
        }
        list.push(read());
      }
    }
    if (src[i] === '"') {
      let s = "";
      i++;
      while (src[i] !== '"') {
        if (i >= src.length) throw new Error("S-ifadesi: kapanmayan dize");
        if (src[i] === "\\") i++;
        s += src[i++];
      }
      i++;
      return s;
    }
    const start = i;
    while (i < src.length && !/[\s()]/.test(src[i])) i++;
    if (start === i) throw new Error(`S-ifadesi: beklenmeyen karakter '${src[i]}' (${i})`);
    return src.slice(start, i);
  };
  const tree = read();
  ws();
  if (i !== src.length) throw new Error("S-ifadesi: fazladan içerik");
  return tree;
}
