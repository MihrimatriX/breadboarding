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
};

const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const mm = (v: number) => (Math.round(v * 1000) / 1000).toString();
const font = "(effects (font (size 1.27 1.27)))";
const fontHidden = "(effects (font (size 1.27 1.27)) hide)";

/** "~OE" → "~{OE}" (KiCad üst çizgi) */
export const kicadPinName = (n: string) => (n.startsWith("~") ? `~{${n.slice(1)}}` : n);

function symbol(def: ChipDef): string {
  const left = def.pins.filter((p) => p.dir === "in" || p.dir === "nc");
  const right = def.pins.filter((p) => p.dir === "out" || p.dir === "tri" || p.dir === "bidir");
  const power = def.pins.filter((p) => p.dir === "power");
  const rows = Math.max(left.length, right.length);
  const h = (Math.ceil(rows / 2) + 1) * G; // yarım yükseklik, ızgaraya oturur
  const w = 3 * G;
  const pinLine = (p: PinDef, x: number, y: number, angle: number) =>
    `      (pin ${ELEC[p.dir]} line (at ${mm(x)} ${mm(y)} ${angle}) (length ${G})${p.dir === "nc" ? " hide" : ""}\n` +
    `        (name ${q(kicadPinName(p.name))} ${font})\n        (number ${q(String(p.num))} ${font}))`;
  const top = h - G;
  const pins = [
    ...left.map((p, i) => pinLine(p, -w - G, top - i * G, 0)),
    ...right.map((p, i) => pinLine(p, w + G, top - i * G, 180)),
    ...power.map((p) => {
      const ground = /^(GND|VSS)$/.test(p.name);
      return pinLine(p, 0, ground ? -h - G : h + G, ground ? 90 : 270);
    }),
  ];
  const name = def.part;
  return [
    `  (symbol ${q(name)} (pin_names (offset 1.016)) (in_bom yes) (on_board yes)`,
    `    (property "Reference" "U" (at ${mm(-w)} ${mm(h + 1.27)} 0) ${font})`,
    `    (property "Value" ${q(name)} (at ${mm(w)} ${mm(h + 1.27)} 0) ${font})`,
    `    (property "Footprint" ${q(def.footprint)} (at 0 0 0) ${fontHidden})`,
    `    (property "Datasheet" "" (at 0 0 0) ${fontHidden})`,
    `    (property "ki_description" ${q(def.title)} (at 0 0 0) ${fontHidden})`,
    `    (property "CPU16_Kullanim" ${q(def.usage)} (at 0 0 0) ${fontHidden})`,
    `    (symbol ${q(`${name}_0_1`)}`,
    `      (rectangle (start ${mm(-w)} ${mm(h)}) (end ${mm(w)} ${mm(-h)}) (stroke (width 0.254) (type default)) (fill (type background)))`,
    `    )`,
    `    (symbol ${q(`${name}_1_1`)}`,
    ...pins,
    `    )`,
    `  )`,
  ].join("\n");
}

export function kicadSymbolLibrary(chips: ChipDef[]): string {
  return [
    "(kicad_symbol_lib (version 20220914) (generator cpu16_chips)",
    ...chips.map(symbol),
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
