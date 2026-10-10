import type { ChipData } from "./types";

/** Arayüzün hızlı sorgular için kullandığı türetilmiş çip indeksleri */
export interface ChipIndex {
  namesByNode: Map<number, string[]>;
  /** İsimli sinyaller, arama kutusu için alfabetik */
  signalNames: string[];
  gatesByNode: Map<number, number[]>;
  channelsByNode: Map<number, number[]>;
  /** Düğüm başına [minX, minY, maxX, maxY] (çip koordinatı) */
  nodeBounds: Float32Array;
  segmentCount: Map<number, number>;
}

export function buildChipIndex(chip: ChipData): ChipIndex {
  const namesByNode = new Map<number, string[]>();
  for (const [name, node] of Object.entries(chip.nodeNames)) {
    if (node < 0) continue;
    const list = namesByNode.get(node) ?? [];
    list.push(name);
    namesByNode.set(node, list);
  }
  const gatesByNode = new Map<number, number[]>();
  const channelsByNode = new Map<number, number[]>();
  const push = (m: Map<number, number[]>, k: number, v: number) => {
    const l = m.get(k);
    if (l) l.push(v);
    else m.set(k, [v]);
  };
  chip.transistors.forEach((t, i) => {
    push(gatesByNode, t.gate, i);
    push(channelsByNode, t.c1, i);
    if (t.c2 !== t.c1) push(channelsByNode, t.c2, i);
  });
  const nodeBounds = new Float32Array(chip.nodeCount * 4);
  for (let i = 0; i < chip.nodeCount; i++) nodeBounds.set([Infinity, Infinity, -Infinity, -Infinity], i * 4);
  const segmentCount = new Map<number, number>();
  for (const s of chip.segments) {
    segmentCount.set(s.node, (segmentCount.get(s.node) ?? 0) + 1);
    const o = s.node * 4;
    for (let i = 0; i < s.points.length; i += 2) {
      const x = s.points[i], y = s.points[i + 1];
      if (x < nodeBounds[o]) nodeBounds[o] = x;
      if (y < nodeBounds[o + 1]) nodeBounds[o + 1] = y;
      if (x > nodeBounds[o + 2]) nodeBounds[o + 2] = x;
      if (y > nodeBounds[o + 3]) nodeBounds[o + 3] = y;
    }
  }
  const signalNames = Object.keys(chip.nodeNames)
    .filter((n) => chip.nodeNames[n] >= 0)
    .sort((a, b) => a.localeCompare(b, "en", { numeric: true }));
  return { namesByNode, signalNames, gatesByNode, channelsByNode, nodeBounds, segmentCount };
}

/** Çip koordinatını 3D dünya koordinatına çevirir (y ekseni derinliğe gider) */
export function chipToWorld(chip: ChipData, x: number, y: number): [number, number] {
  const cx = (chip.bounds.minX + chip.bounds.maxX) / 2;
  const cy = (chip.bounds.minY + chip.bounds.maxY) / 2;
  return [(x - cx) * chip.scale, -(y - cy) * chip.scale];
}
