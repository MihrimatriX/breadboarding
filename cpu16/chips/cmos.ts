// Kapı → CMOS transistör açılımı. Çıktı, Silikon3D'nin anahtar seviyesi motorunun
// (src/sim/SwitchLevelEngine.ts) okuduğu ChipData biçimindedir; böylece 74HC çiplerinin içi
// 6502 ile aynı motorda, transistör transistör çalıştırılabilir.
//
// Kurallar (statik CMOS):
//   NOT  : 1 PMOS (VCC→Y) + 1 NMOS (Y→GND)                                    = 2T
//   NANDk: k paralel PMOS + k seri NMOS                                       = 2k T
//   NORk : k seri PMOS + k paralel NMOS                                       = 2k T
//   AND/OR = NAND/NOR + NOT; BUF = 2 × NOT
//   XOR  : 2 evirici + AOI22  ( Y = ¬(a·b + ā·b̄) )                           = 12T
//   TBUF : evirici + üç durumlu evirici (seri P-P / N-N yığını)               = 8T
//   DFF  : 7474 yapısı, 6 adet 3 girişli NAND (kenar tetiklemeli)             = 36T
//   LATCH: 4 NAND + 1 NOT (kapılı D mandalı)                                  = 18T
// Gerçek 74HC çiplerinde ayrıca giriş koruma diyotları ve tamponlanmış çıkış katları vardır;
// bunlar mantığı değiştirmediği için modellenmez.

import type { ChipData, Transistor, TransistorKind } from "../../src/chip/types.ts";
import type { Circuit } from "./logic.ts";

export interface TransistorNetlist {
  chip: ChipData;
  /** lojik net → transistör düğümü (aynı numara; ek iç düğümler sona eklenir) */
  nodeOfNet: (net: number) => number;
  /** her transistörün ait olduğu lojik kapı (circuit.gates indeksi) */
  gateOf: Int32Array;
  /** her lojik kapının transistör sayısı */
  perGate: Int32Array;
}

export const GND_NODE = 0;
export const VCC_NODE = 1;

export function toTransistors(circuit: Circuit, name = "cmos"): TransistorNetlist {
  // Net 0 = GND, net 1 = VCC: transistör düğümleriyle aynı numaralar.
  let nodeCount = circuit.netCount;
  const ts: Transistor[] = [];
  const owner: number[] = [];
  const nodeNames: Record<string, number> = {};
  circuit.netNames.forEach((n, i) => (nodeNames[n] = i));
  let current = 0;

  const node = () => nodeCount++;
  // VCC'ye bağlı kapı girişleri bir "tie-high" hücresinden beslenir (GND kapılı PMOS):
  // anahtar seviyesi motoru güç raylarını yeniden hesaplamadığı için, VCC kapılı
  // transistörler güç verildiğinde doğru duruma geçmez. Gerçek çiplerde de böyledir.
  let tieHi = -1;
  const fet = (kind: TransistorKind, gate: number, c1: number, c2: number) => {
    if (gate === VCC_NODE) {
      if (tieHi < 0) {
        tieHi = node();
        ts.push({ name: `t${ts.length}`, gate: GND_NODE, c1: tieHi, c2: VCC_NODE, bbox: [0, 0, 0, 0], kind: "pmos" });
        owner.push(current);
      }
      gate = tieHi;
    }
    ts.push({ name: `t${ts.length}`, gate, c1, c2, bbox: [0, 0, 0, 0], kind });
    owner.push(current);
  };
  const inv = (a: number, y = node()) => {
    fet("pmos", a, y, VCC_NODE);
    fet("nmos", a, y, GND_NODE);
    return y;
  };
  /** Seri zincir: from → ... → to, her halkanın kapısı gates[i] */
  const series = (kind: TransistorKind, gates: number[], from: number, to: number) => {
    let a = from;
    gates.forEach((g, i) => {
      const bb = i === gates.length - 1 ? to : node();
      fet(kind, g, a, bb);
      a = bb;
    });
  };
  const nand = (ins: number[], y = node()) => {
    for (const g of ins) fet("pmos", g, y, VCC_NODE);
    series("nmos", ins, y, GND_NODE);
    return y;
  };
  const nor = (ins: number[], y = node()) => {
    series("pmos", ins, y, VCC_NODE);
    for (const g of ins) fet("nmos", g, y, GND_NODE);
    return y;
  };
  /** Y = ¬(a·b + c·d) */
  const aoi22 = (a: number, b: number, c: number, d: number, y = node()) => {
    series("nmos", [a, b], y, GND_NODE);
    series("nmos", [c, d], y, GND_NODE);
    const m = node();
    fet("pmos", a, m, VCC_NODE);
    fet("pmos", b, m, VCC_NODE);
    fet("pmos", c, y, m);
    fet("pmos", d, y, m);
    return y;
  };
  const xor2 = (a: number, b: number, y = node()) => aoi22(a, b, inv(a), inv(b), y);
  const xnor2 = (a: number, b: number, y = node()) => aoi22(a, inv(b), inv(a), b, y);

  circuit.gates.forEach((g, gi) => {
    current = gi;
    const [y] = g.outputs;
    const ins = g.inputs;
    switch (g.kind) {
      case "NOT": inv(ins[0], y); break;
      case "BUF": inv(inv(ins[0]), y); break;
      case "NAND": nand(ins, y); break;
      case "NOR": nor(ins, y); break;
      case "AND": inv(nand(ins), y); break;
      case "OR": inv(nor(ins), y); break;
      case "XOR":
      case "XNOR": {
        let acc = ins[0];
        for (let i = 1; i < ins.length; i++) {
          const last = i === ins.length - 1;
          acc = last ? (g.kind === "XOR" ? xor2 : xnor2)(acc, ins[i], y) : xor2(acc, ins[i]);
        }
        break;
      }
      case "TBUF": {
        const [a, en] = ins;
        const ia = inv(a);
        const enb = inv(en);
        const p1 = node();
        fet("pmos", ia, p1, VCC_NODE);
        fet("pmos", enb, y, p1);
        const n1 = node();
        fet("nmos", en, y, n1);
        fet("nmos", ia, n1, GND_NODE);
        break;
      }
      case "DFF": {
        // 7474: n1..n4 kenar algılayıcı, q/qn çıkış mandalı
        const [d, clk, preN, clrN] = ins;
        const [q, qn] = g.outputs;
        const n1 = node(), n2 = node(), n3 = node(), n4 = node();
        nand([preN, n4, n2], n1);
        nand([n1, clrN, clk], n2);
        nand([n2, clk, n4], n3);
        nand([n3, clrN, d], n4);
        nand([preN, n2, qn], q);
        nand([q, n3, clrN], qn);
        break;
      }
      case "LATCH": {
        const [d, en] = ins;
        const [q, qn] = g.outputs;
        const s = nand([d, en]);
        const r = nand([inv(d), en]);
        nand([s, qn], q);
        nand([r, q], qn);
        break;
      }
      case "BEHAV":
        throw new Error(`${g.owner}: davranışsal blok transistörlere açılamaz`);
    }
  });

  const gateOf = Int32Array.from(owner);
  const perGate = new Int32Array(circuit.gates.length);
  for (const o of owner) perGate[o]++;
  const chip: ChipData = {
    id: name,
    name,
    description: "Kapı seviyesi devreden üretilmiş CMOS transistör netlist'i",
    license: "MIT",
    bounds: { minX: 0, minY: 0, maxX: 1, maxY: 1 },
    scale: 1,
    layers: [],
    nodeCount,
    gnd: GND_NODE,
    vcc: VCC_NODE,
    pullups: [],
    segments: [],
    transistors: ts,
    nodeNames,
  };
  return { chip, nodeOfNet: (n) => n, gateOf, perGate };
}
