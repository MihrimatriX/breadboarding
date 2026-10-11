// Pinden pine teller: hangi pin hangi pinlere bağlı, teller nasıl kavis çizer. Saf fonksiyonlar
// (sahneden ve React'ten bağımsız); 3D sahne ve Bağlantılar paneli bunları kullanır, testler de.

import type { BoardLayout, PinPlace } from "../../cpu16/board/layout";

/** Bir netin ucu: bir çipin ya da pasif elemanın bir pini */
export interface Endpoint {
  kind: "chip" | "passive";
  ref: string;
  part: string;
  card: string;
  num: number;
  name: string;
  net: number;
  /** yerleşimdeki konum (mm) */
  x: number;
  y: number;
  /** kartın arka panel konnektörünün pini (kartlar arası teller alçaktan, panel boyunca gider) */
  bus?: boolean;
}

/** Bütün netlerin uçları (GND = 0 ve VCC = 1 dahil; bağlantısız pinler hariç) */
export function netEndpoints(lay: BoardLayout): Map<number, Endpoint[]> {
  const m = new Map<number, Endpoint[]>();
  const add = (kind: Endpoint["kind"], ref: string, part: string, card: string, p: PinPlace, bus?: boolean) => {
    if (p.net < 0) return;
    let list = m.get(p.net);
    if (!list) m.set(p.net, (list = []));
    const e: Endpoint = { kind, ref, part, card, num: p.num, name: p.name, net: p.net, x: p.x, y: p.y };
    if (bus) e.bus = true;
    list.push(e);
  };
  for (const c of lay.chips) for (const p of c.pins) add("chip", c.ref, c.part, c.card, p);
  for (const c of lay.passives) for (const p of c.pins) add("passive", c.ref, c.part, c.card, p, c.edge);
  return m;
}

/** En kısa yayılan ağaç (Prim, O(n²)): n − 1 kenar, her nokta bağlı */
export function mstEdges(pts: readonly { x: number; y: number }[]): [number, number][] {
  const n = pts.length;
  if (n < 2) return [];
  const inTree = new Uint8Array(n);
  const best = new Float64Array(n).fill(Infinity);
  const from = new Int32Array(n).fill(-1);
  const out: [number, number][] = [];
  let cur = 0;
  inTree[0] = 1;
  for (let k = 1; k < n; k++) {
    let next = -1;
    for (let i = 0; i < n; i++) {
      if (inTree[i]) continue;
      const d = (pts[i].x - pts[cur].x) ** 2 + (pts[i].y - pts[cur].y) ** 2;
      if (d < best[i]) {
        best[i] = d;
        from[i] = cur;
      }
      if (next < 0 || best[i] < best[next]) next = i;
    }
    inTree[next] = 1;
    out.push([from[next], next]);
    cur = next;
  }
  return out;
}

/** Bir tel: iki uç ve netin numarası */
export interface WireEdge {
  a: Endpoint;
  b: Endpoint;
  net: number;
}

export interface WireOptions {
  /** GND ve VCC tellerini de çiz */
  power?: boolean;
}

const isPower = (net: number) => net <= 1;

/**
 * Bir netin telleri: her kartın içindeki uçlar kendi aralarında en kısa yayılan ağaçla birleşir,
 * kartlar birbirine arka panel konnektörlerinden bağlanır (konnektörü olmayan kart ilk ucuyla).
 * Böylece kartlar arası teller çipten çipe değil konnektörden konnektöre gider.
 */
export function netTree(net: number, list: readonly Endpoint[]): WireEdge[] {
  const out: WireEdge[] = [];
  const byCard = new Map<string, Endpoint[]>();
  for (const e of list) {
    let g = byCard.get(e.card);
    if (!g) byCard.set(e.card, (g = []));
    g.push(e);
  }
  for (const g of byCard.values()) for (const [i, j] of mstEdges(g)) out.push({ a: g[i], b: g[j], net });
  if (byCard.size > 1) {
    const reps = [...byCard.values()].map((g) => g.find((e) => e.bus) ?? g[0]);
    for (const [i, j] of mstEdges(reps)) out.push({ a: reps[i], b: reps[j], net });
  }
  return out;
}

/** "hepsi" kipi: her netin uçları birleşir (atlama telleri zinciri, kartlar arası arka panelden) */
export function allWires(ends: Map<number, Endpoint[]>, o: WireOptions = {}): WireEdge[] {
  const out: WireEdge[] = [];
  for (const [net, list] of ends) {
    if (list.length < 2 || (!o.power && isPower(net))) continue;
    for (const e of netTree(net, list)) out.push(e);
  }
  return out;
}

/** "seçili çip" kipi: seçili elemanın her pininden aynı netteki bütün öteki uçlara bir tel */
export function partWires(ref: string, ends: Map<number, Endpoint[]>, o: WireOptions = {}): WireEdge[] {
  const out: WireEdge[] = [];
  const seen = new Set<number>();
  for (const [net, list] of ends) {
    if (!o.power && isPower(net)) continue;
    const mine = list.filter((e) => e.ref === ref);
    if (!mine.length || seen.has(net)) continue;
    seen.add(net);
    for (const a of mine) for (const b of list) if (b.ref !== ref) out.push({ a, b, net });
    // aynı elemanın aynı nete bağlı iki pini (ör. birleştirilmiş girişler) de birbirine
    for (let k = 1; k < mine.length; k++) out.push({ a: mine[k - 1], b: mine[k], net });
  }
  return out;
}

/** Seçili netin telleri */
export function netWires(net: number, ends: Map<number, Endpoint[]>): WireEdge[] {
  return netTree(net, ends.get(net) ?? []);
}

/** Kavisin tepe yüksekliği (dünya birimi): kısa teller alçak, uzunlar yüksek */
export const arcHeight = (d: number) => Math.min(6, 0.18 + 0.15 * d);

/** İki arka panel konnektörü arasındaki tel: kartların üstünden alçak geçer */
export const busArcHeight = (d: number) => Math.min(1.2, arcHeight(d));

/** Kavis parça sayısı */
export const arcSegments = (d: number) => Math.max(3, Math.min(24, Math.ceil(2 + d * 1.2)));

/**
 * Parabol biçimli kavis: (ax, y0, az) → (bx, y0, bz), ortada h (verilmezse arcHeight(d)) kadar
 * yukarıda. Dönen dizi: x, y, z noktaları (parça sayısı + 1 nokta).
 */
export function arcPoints(ax: number, az: number, bx: number, bz: number, y0: number, height?: number): number[] {
  const d = Math.hypot(bx - ax, bz - az);
  const h = height ?? arcHeight(d);
  const n = arcSegments(d);
  const out: number[] = [];
  for (let k = 0; k <= n; k++) {
    const t = k / n;
    out.push(ax + (bx - ax) * t, y0 + 4 * h * t * (1 - t), az + (bz - az) * t);
  }
  return out;
}

/** Kartlar arası telin yolu: iki uç arasındaki ara noktalar (mm), ya da null (kavis çizilir) */
export type BusRoute = (a: Endpoint, b: Endpoint) => { x: number; y: number }[] | null;

/**
 * İki arka panel konnektörü arasındaki teller arka panel şeridi boyunca gider; farklı kart
 * sıralarındaysa soldaki sıra kablosundan iner. Her net şeritte kendi şeridinde (lane) durur.
 */
export function busRouter(lay: Pick<BoardLayout, "rows">): BusRoute {
  const rowOf = (y: number) => lay.rows.findIndex((r) => y >= r.y - 2 && y <= r.backplaneY + r.backplaneH + 2);
  return (a, b) => {
    if (!a.bus || !b.bus) return null;
    const ra = rowOf(a.y);
    const rb = rowOf(b.y);
    if (ra < 0 || rb < 0) return null;
    const lane = (ri: number, net: number) => {
      const r = lay.rows[ri];
      return r.backplaneY + 1.5 + ((((net * 7) % 16) + 0.5) / 16) * (r.backplaneH - 3);
    };
    const ya = lane(ra, a.net);
    const yb = lane(rb, b.net);
    if (ra === rb) return [{ x: a.x, y: ya }, { x: b.x, y: ya }];
    const cable = Math.min(lay.rows[ra].x, lay.rows[rb].x) - 8;
    return [{ x: a.x, y: ya }, { x: cable, y: ya }, { x: cable, y: yb }, { x: b.x, y: yb }];
  };
}

/** Arka panel boyunca giden tellerin yüksekliği (dünya birimi) */
export const ROUTE_Y = 0.05;

/** Birleştirilmiş tel geometrisi: her parça 6 sayı (iki uç), parçanın neti ayrı dizide */
export interface WireGeometry {
  positions: Float32Array;
  /** parça başına net */
  nets: Int32Array;
  segments: number;
}

/**
 * Telleri tek bir parça listesine çevirir. toWorld yerleşim koordinatını (mm) dünya x, z'ye,
 * pinTop bir ucun yüksekliğini verir; route verilirse yolu olan teller (arka panel) kavis yerine
 * o yoldan düz parçalarla gider.
 */
export function wireGeometry(
  edges: readonly WireEdge[],
  toWorld: (x: number, y: number) => [number, number],
  pinTop: (e: Endpoint) => number,
  route?: BusRoute,
): WireGeometry {
  let total = 0;
  const arcs: number[][] = [];
  for (const e of edges) {
    const [ax, az] = toWorld(e.a.x, e.a.y);
    const [bx, bz] = toWorld(e.b.x, e.b.y);
    const ya = pinTop(e.a);
    const yb = pinTop(e.b);
    const path = route?.(e.a, e.b);
    if (path) {
      const pts = [ax, ya, az];
      for (const p of path) {
        const [x, z] = toWorld(p.x, p.y);
        pts.push(x, ROUTE_Y, z);
      }
      pts.push(bx, yb, bz);
      arcs.push(pts);
      total += pts.length / 3 - 1;
      continue;
    }
    const bus = e.a.bus && e.b.bus;
    const pts = arcPoints(ax, az, bx, bz, 0, bus ? busArcHeight(Math.hypot(bx - ax, bz - az)) : undefined);
    // iki ucun yüksekliği farklı olabilir (çip pini / pasif): doğrusal geçiş
    const n = pts.length / 3 - 1;
    for (let k = 0; k <= n; k++) pts[3 * k + 1] += ya + ((yb - ya) * k) / n;
    arcs.push(pts);
    total += n;
  }
  const positions = new Float32Array(total * 6);
  const nets = new Int32Array(total);
  let s = 0;
  edges.forEach((e, i) => {
    const p = arcs[i];
    for (let k = 0; k + 5 < p.length; k += 3) {
      for (let j = 0; j < 6; j++) positions[s * 6 + j] = p[k + j];
      nets[s++] = e.net;
    }
  });
  return { positions, nets, segments: total };
}

/** Bir elemanın pin pin bağlantıları (Bağlantılar paneli) */
export interface PinLinks {
  num: number;
  name: string;
  net: number;
  /** aynı nete bağlı öteki uçlar */
  others: Endpoint[];
}

export function partLinks(ref: string, pins: readonly PinPlace[], ends: Map<number, Endpoint[]>): PinLinks[] {
  return [...pins]
    .sort((a, b) => a.num - b.num)
    .map((p) => ({ num: p.num, name: p.name, net: p.net, others: p.net < 0 ? [] : (ends.get(p.net) ?? []).filter((e) => !(e.ref === ref && e.num === p.num)) }));
}
