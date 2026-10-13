// Bir çipin "içi": kapı seviyesi şema (kapılar sütun sütun, mantık derinliğine göre) ve bir kapının
// CMOS transistör şeması (her katın PMOS ağı üstte, NMOS ağı altta). 3D görünüm ve yan panel bu
// yerleşimleri çizer; canlı değerler kapı seviyesi simülasyonun net değerlerinden gelir. Transistör
// seviyesinde ise seçilen kapı Silikon3D'nin anahtar seviyesi motorunda ayrıca çalıştırılır.

import { SwitchLevelEngine } from "../../src/sim/SwitchLevelEngine.ts";
import { toTransistors, GND_NODE, VCC_NODE, type TransistorNetlist } from "../chips/cmos.ts";
import { Circuit, L0, L1, type Gate, type GateKind, type Level } from "../chips/logic.ts";
import type { PinDir } from "../chips/types.ts";
import type { ChipInstance } from "./board.ts";

// ---------------------------------------------------------------- kapı seviyesi şema

export interface InsideGate {
  /** circuit.gates indeksi */
  gate: number;
  kind: GateKind;
  x: number;
  y: number;
  w: number;
  h: number;
  inputs: number[];
  outputs: number[];
  /** giriş / çıkış uçlarının konumu (inputs/outputs ile aynı sırada) */
  inPorts: [number, number][];
  outPorts: [number, number][];
}

export interface InsidePin {
  name: string;
  dir: PinDir;
  net: number;
  x: number;
  y: number;
  side: "left" | "right";
}

export interface InsideWire {
  net: number;
  /** x0,y0,x1,y1,... kırık çizgi */
  points: number[];
}

export interface ChipInside {
  ref: string;
  part: string;
  width: number;
  height: number;
  gates: InsideGate[];
  pins: InsidePin[];
  wires: InsideWire[];
  /** sabit girişler (GND/VCC) için kısa uç: x, y, değer */
  ties: { x: number; y: number; v: 0 | 1 }[];
  /** davranışsal model mi (bellek çipleri) */
  behavioral: boolean;
}

const COL_W = 70;
const PIN_GAP = 14;
const GATE_W = 34;
const PORT_GAP = 9;

const gateHeight = (g: Gate) => Math.max(g.inputs.length, g.outputs.length, 2) * PORT_GAP + 8;

export function chipInside(gates: readonly Gate[], ci: ChipInstance): ChipInside {
  const [g0, g1] = ci.gates;
  const ids = Array.from({ length: g1 - g0 }, (_, i) => g0 + i);
  const driver = new Map<number, number>();
  for (const gi of ids) for (const o of gates[gi].outputs) driver.set(o, gi);

  // mantık derinliği: geri besleme (flip-flop, sayaç) döngüleri DFS'te kesilir
  const depth = new Map<number, number>();
  const visiting = new Set<number>();
  const depthOf = (gi: number): number => {
    const d = depth.get(gi);
    if (d !== undefined) return d;
    if (visiting.has(gi)) return 0;
    visiting.add(gi);
    let m = 0;
    for (const n of gates[gi].inputs) {
      const src = driver.get(n);
      if (src !== undefined && src !== gi) m = Math.max(m, depthOf(src) + 1);
    }
    visiting.delete(gi);
    depth.set(gi, m);
    return m;
  };
  ids.forEach(depthOf);

  // pinler: girişler solda, çıkışlar sağda; çift yönlüler yarı yarıya
  const sig = ci.def.pins.filter((p) => p.dir !== "power" && p.dir !== "nc");
  const bidir = sig.filter((p) => p.dir === "bidir");
  const left = sig.filter((p) => p.dir === "in" || (p.dir === "bidir" && bidir.indexOf(p) < bidir.length / 2));
  const right = sig.filter((p) => p.dir === "out" || p.dir === "tri" || (p.dir === "bidir" && bidir.indexOf(p) >= bidir.length / 2));

  const cols = Math.max(1, ...ids.map((g) => (depth.get(g) ?? 0) + 1));
  const byCol: number[][] = Array.from({ length: cols }, () => []);
  for (const gi of ids) byCol[depth.get(gi) ?? 0].push(gi);

  const x0 = 72;
  const pinY = new Map<number, number>();
  left.forEach((p, i) => pinY.set(ci.nets[p.name], 20 + i * PIN_GAP));

  // sütun içinde sıralama: kaynaklarının ortalama yüksekliğine göre (kesişmeleri azaltır)
  const outY = new Map<number, number>();
  const placed: InsideGate[] = [];
  let height = 20 + Math.max(left.length, right.length) * PIN_GAP;
  byCol.forEach((list, c) => {
    const key = (gi: number) => {
      const ys = gates[gi].inputs.map((n) => outY.get(n) ?? pinY.get(n)).filter((v): v is number => v !== undefined);
      return ys.length ? ys.reduce((a, b) => a + b, 0) / ys.length : 0;
    };
    const sorted = [...list].sort((a, b) => key(a) - key(b));
    let y = 12;
    for (const gi of sorted) {
      const g = gates[gi];
      const h = gateHeight(g);
      // istenen konum: kaynaklarının ortası; üst üste binmesin
      const want = key(gi) - h / 2;
      y = Math.max(y, want);
      const x = x0 + c * COL_W + 10;
      const inPorts = g.inputs.map((_, k): [number, number] => [x, y + (k + 1) * (h / (g.inputs.length + 1))]);
      const outPorts = g.outputs.map((_, k): [number, number] => [x + GATE_W, y + (k + 1) * (h / (g.outputs.length + 1))]);
      g.outputs.forEach((o, k) => outY.set(o, outPorts[k][1]));
      placed.push({ gate: gi, kind: g.kind, x, y, w: GATE_W, h, inputs: g.inputs, outputs: g.outputs, inPorts, outPorts });
      y += h + 8;
    }
    height = Math.max(height, y + 8);
  });
  const width = x0 + cols * COL_W + 100;

  const pins: InsidePin[] = [
    ...left.map((p, i): InsidePin => ({ name: p.name, dir: p.dir, net: ci.nets[p.name], x: 52, y: 20 + i * PIN_GAP, side: "left" })),
    ...right.map((p): InsidePin => ({ name: p.name, dir: p.dir, net: ci.nets[p.name], x: width - 52, y: 0, side: "right" })),
  ];
  // sağ pinler sürücülerinin hizasında, çakışmasın
  const rightPins = pins.filter((p) => p.side === "right").sort((a, b) => (outY.get(a.net) ?? 0) - (outY.get(b.net) ?? 0));
  let ry = 20;
  for (const p of rightPins) {
    p.y = Math.max(ry, outY.get(p.net) ?? ry);
    ry = p.y + PIN_GAP;
  }
  height = Math.max(height, ry + 10);

  // teller: kaynaktan (sürücü kapı ya da giriş pini) her hedefe dik açılı yol
  const source = new Map<number, [number, number]>();
  for (const p of pins) if (p.side === "left") source.set(p.net, [p.x, p.y]);
  for (const g of placed) g.outputs.forEach((o, k) => source.set(o, g.outPorts[k]));
  const wires: InsideWire[] = [];
  const ties: ChipInside["ties"] = [];
  const route = (net: number, to: [number, number]) => {
    const from = source.get(net);
    if (!from) return;
    const jog = to[0] - 6 - (net % 4) * 2;
    const mx = Math.max(from[0] + 3, jog);
    wires.push({ net, points: [from[0], from[1], mx, from[1], mx, to[1], to[0], to[1]] });
  };
  for (const g of placed) {
    g.inputs.forEach((n, k) => {
      const [px, py] = g.inPorts[k];
      if (n === 0 || n === 1) ties.push({ x: px - 8, y: py, v: n as 0 | 1 });
      else route(n, [px, py]);
    });
  }
  for (const p of pins) if (p.side === "right" && source.has(p.net)) {
    const from = source.get(p.net)!;
    if (from[0] !== p.x || from[1] !== p.y) route(p.net, [p.x, p.y]);
  }
  return {
    ref: ci.ref, part: ci.def.part, width, height, gates: placed, pins, wires, ties,
    behavioral: !!ci.def.behavioral,
  };
}

// ---------------------------------------------------------------- transistör şeması

export interface CmosTransistor {
  index: number;
  pmos: boolean;
  gate: number;
  c1: number;
  c2: number;
  /** kanalın üst ve alt ucu */
  x: number;
  y1: number;
  y2: number;
}

export interface CmosNode {
  node: number;
  label: string;
  /** yatay çubuk */
  x1: number;
  x2: number;
  y: number;
  rail?: "VCC" | "GND";
}

export interface GateCmos {
  netlist: TransistorNetlist;
  /** mini devredeki düğüm → kartın neti (dış uçlar); iç düğümler yok */
  boardNet: Map<number, number>;
  /** kapı girişlerinin düğümleri (giriş sırasıyla) */
  inputNodes: number[];
  outputNodes: number[];
  transistors: CmosTransistor[];
  nodes: CmosNode[];
  width: number;
  height: number;
}

const LANE = 60;
const RANK = 38;

/** Tek kapıyı transistörlere açar ve şemasını yerleştirir. */
export function gateCmos(gate: Gate, netName: (n: number) => string, pinName?: (n: number) => string | undefined): GateCmos {
  if (gate.kind === "BEHAV") throw new Error("Davranışsal blok transistörlere açılamaz");
  const c = new Circuit();
  const map = new Map<number, number>([[0, 0], [1, 1]]);
  const boardNet = new Map<number, number>();
  const local = (n: number) => {
    let m = map.get(n);
    if (m === undefined) {
      m = c.net(pinName?.(n) ?? netName(n));
      map.set(n, m);
      boardNet.set(m, n);
    }
    return m;
  };
  const inputNodes = gate.inputs.map(local);
  const outputNodes = gate.outputs.map(local);
  c.add(gate.kind, inputNodes, outputNodes);
  const netlist = toTransistors(c, gate.kind);
  const ts = netlist.chip.transistors;
  const rails = (n: number) => n === GND_NODE || n === VCC_NODE;

  // katlar: raylar dışında kanal kanala bağlı düğüm grupları
  const parent = new Map<number, number>();
  const find = (n: number): number => {
    const p = parent.get(n) ?? n;
    if (p === n) return n;
    const r = find(p);
    parent.set(n, r);
    return r;
  };
  for (const t of ts) {
    if (!rails(t.c1)) parent.set(t.c1, parent.get(t.c1) ?? t.c1);
    if (!rails(t.c2)) parent.set(t.c2, parent.get(t.c2) ?? t.c2);
    if (!rails(t.c1) && !rails(t.c2)) parent.set(find(t.c1), find(t.c2));
  }
  const stageOf = (i: number) => find(rails(ts[i].c1) ? ts[i].c2 : ts[i].c1);
  const stages: number[] = [];
  ts.forEach((_, i) => {
    const s = stageOf(i);
    if (!stages.includes(s)) stages.push(s);
  });

  // iç düğüm adları: kat çıkışları s1, s2…; seri zincir düğümleri boş
  const outputsOfStages = new Set<number>();
  for (const t of ts) if (!rails(t.gate)) outputsOfStages.add(t.gate);
  for (const o of outputNodes) outputsOfStages.add(o);
  let sCount = 0;
  const labels = new Map<number, string>();
  // VCC'ye bağlı girişleri besleyen sabit-1 hücresi (kapısı GND'de PMOS)
  for (const t of ts) if (t.kind === "pmos" && t.gate === GND_NODE && (t.c2 === VCC_NODE || t.c1 === VCC_NODE)) labels.set(t.c1 === VCC_NODE ? t.c2 : t.c1, "sabit1");
  const label = (n: number): string => {
    if (n === VCC_NODE) return "VCC";
    if (n === GND_NODE) return "GND";
    const known = labels.get(n);
    if (known !== undefined) return known;
    let l = "";
    if (n < c.netCount) l = c.netNames[n];
    else if (outputsOfStages.has(n)) l = `s${++sCount}`;
    labels.set(n, l);
    return l;
  };

  const transistors: CmosTransistor[] = [];
  const nodes: CmosNode[] = [];
  let x = 30;
  let maxY = 0;
  const top = 30;
  for (const s of stages) {
    const idx = ts.map((_, i) => i).filter((i) => stageOf(i) === s);
    // PMOS: VCC'den uzaklık; NMOS: GND'den uzaklık
    const dist = (pmos: boolean) => {
      const rail = pmos ? VCC_NODE : GND_NODE;
      const d = new Map<number, number>([[rail, 0]]);
      let frontier = [rail];
      while (frontier.length) {
        const next: number[] = [];
        for (const n of frontier) {
          for (const i of idx) {
            const t = ts[i];
            if ((t.kind === "pmos") !== pmos) continue;
            const o = t.c1 === n ? t.c2 : t.c2 === n ? t.c1 : -1;
            if (o >= 0 && !d.has(o)) {
              d.set(o, d.get(n)! + 1);
              next.push(o);
            }
          }
        }
        frontier = next;
      }
      return d;
    };
    const dp = dist(true);
    const dn = dist(false);
    const outs = [...dp.keys()].filter((n) => dn.has(n) && !rails(n));
    const yOut = Math.max(1, ...outs.map((n) => dp.get(n)!));
    const maxN = Math.max(1, ...outs.map((n) => dn.get(n)!));
    const yOf = (n: number, pmosSide: boolean): number => {
      if (n === VCC_NODE) return top;
      if (n === GND_NODE) return top + (yOut + maxN) * RANK;
      if (outs.includes(n)) return top + yOut * RANK;
      return pmosSide ? top + (dp.get(n) ?? 0) * RANK : top + (yOut + maxN - (dn.get(n) ?? 0)) * RANK;
    };
    // şeritler: aynı yükseklik bandındaki transistörler yan yana
    const bands = new Map<string, number[]>();
    const geo = idx.map((i) => {
      const t = ts[i];
      const p = t.kind === "pmos";
      const a = yOf(t.c1, p);
      const b = yOf(t.c2, p);
      const key = `${Math.min(a, b)}:${Math.max(a, b)}`;
      const list = bands.get(key) ?? [];
      list.push(i);
      bands.set(key, list);
      return { i, y1: Math.min(a, b), y2: Math.max(a, b), key };
    });
    const lanes = Math.max(...[...bands.values()].map((l) => l.length));
    const cx = x + (lanes * LANE) / 2;
    const stageX = new Map<number, number>();
    for (const list of bands.values()) list.forEach((i, k) => stageX.set(i, cx + (k - (list.length - 1) / 2) * LANE));
    for (const g of geo) {
      const t = ts[g.i];
      transistors.push({ index: g.i, pmos: t.kind === "pmos", gate: t.gate, c1: t.c1, c2: t.c2, x: stageX.get(g.i)!, y1: g.y1, y2: g.y2 });
    }
    // düğüm çubukları: bağlı transistörlerin uçları arasında
    const nodeSet = new Set<number>();
    for (const i of idx) {
      nodeSet.add(ts[i].c1);
      nodeSet.add(ts[i].c2);
    }
    for (const n of nodeSet) {
      const xs: number[] = [];
      let y = 0;
      for (const t of transistors) {
        if (!idx.includes(t.index)) continue;
        if (t.c1 === n || t.c2 === n) {
          xs.push(t.x);
          const p = t.pmos;
          y = yOf(n, p);
        }
      }
      nodes.push({
        node: n, label: label(n), x1: Math.min(...xs) - 8, x2: Math.max(...xs) + 8, y,
        rail: n === VCC_NODE ? "VCC" : n === GND_NODE ? "GND" : undefined,
      });
      maxY = Math.max(maxY, y);
    }
    x += lanes * LANE + 40;
  }
  // transistör kapı uçlarının adları için etiketleri hazırla
  for (const t of transistors) label(t.gate);
  return { netlist, boardNet, inputNodes, outputNodes, transistors, nodes, width: x + 10, height: maxY + 30 };
}

/** İç düğüm adlarının İngilizcesi (arayüz İngilizceyken); net, pin ve kat (s1, s2…) adları değişmez */
const ETIKET_EN: Record<string, string> = { sabit1: "tie-hi" };

/** Düğüm etiketi seçili dilde: CmosNode.label ve nodeLabel() Türkçe üretir, arayüz buradan çevirir */
export const etiketDili = (label: string, dil: "tr" | "en" = "tr"): string => (dil === "en" ? ETIKET_EN[label] ?? label : label);

/** Kapı uçlarının etiketi (giriş adı, iç kat çıkışı ya da boş), seçili dilde */
export function nodeLabel(cm: GateCmos, node: number, dil: "tr" | "en" = "tr"): string {
  if (node === VCC_NODE) return "VCC";
  if (node === GND_NODE) return "GND";
  const n = cm.nodes.find((x) => x.node === node);
  if (n?.label) return etiketDili(n.label, dil);
  const names = cm.netlist.chip.nodeNames;
  for (const k in names) if (names[k] === node) return k;
  return "";
}

/**
 * Seçilen kapıyı anahtar seviyesi motorda canlı tutar. Saat kenarlarının çoğu ekran kareleri
 * arasında kalır; bu yüzden flip-flop ve mandallar her güncellemede kapı seviyesi simülasyonun
 * sakladığı değerle "doldurulur" (önce o değeri yakalatan bir kenar, sonra gerçek girişler).
 * Böylece iç düğümler gerçek çipte olacakları duruma gelir.
 */
export class GateProbe {
  readonly cm: GateCmos;
  readonly engine: SwitchLevelEngine;
  private readonly kind: GateKind;

  constructor(gate: Gate, netName: (n: number) => string, pinName?: (n: number) => string | undefined) {
    this.kind = gate.kind;
    this.cm = gateCmos(gate, netName, pinName);
    this.engine = new SwitchLevelEngine(this.cm.netlist.chip);
    this.engine.powerOn();
  }

  /** levels: kartın net değerleri (LogicSim.value) */
  update(levels: ArrayLike<number>): void {
    const ins = this.cm.inputNodes;
    const lv = (node: number) => {
      const n = this.cm.boardNet.get(node);
      return n === undefined ? node === VCC_NODE : levels[n] === L1;
    };
    const drive = (nodes: number[], vals: boolean[]) => {
      const keep = nodes.map((n, i) => [n, vals[i]] as const).filter(([n]) => n !== GND_NODE && n !== VCC_NODE);
      this.engine.driveMany(keep.map((k) => k[0]), keep.map((k) => k[1]));
    };
    if (this.kind === "DFF") {
      const [d, clk, pre, clr] = ins;
      const q = this.cm.outputNodes[0];
      const target = lv(q);
      drive([pre, clr, clk, d], [true, true, false, target]);
      drive([clk], [true]);
    } else if (this.kind === "LATCH") {
      const [d, en] = ins;
      drive([en, d], [true, lv(this.cm.outputNodes[0])]);
    }
    drive(ins, ins.map(lv));
  }

  level(node: number): Level {
    return this.engine.isHigh(node) ? L1 : L0;
  }

  on(t: number): boolean {
    return this.engine.transistor(t).on;
  }
}
