// PCB görünümünün kazınmış bakır yolları (src/board3d/pcbYol.ts): iki katmanlı kart (üst katman yatayı, alt
// katman dikeyi tercih eder; katman içinde kıvrım, gerekirse via), 45° pahlı köşeler, gövdelerden ve başka
// netlerin pedlerinden kaçınma, aynı netin bakırı paylaşması, bütün kartın kazınması.

import { describe, expect, it } from "vitest";
import { kartYerlesimi } from "../../src/board3d/aktif.ts";
import { izgaraKur, kazi, pahla, yolBul, type Kazinti } from "../../src/board3d/pcbYol.ts";
import { netEnds } from "../../src/board3d/store.ts";
import { allWires } from "../../src/board3d/wires.ts";

/** parçalar: [x0, y0, x1, y1] */
const parcalar = (p: number[]) => {
  const out: number[][] = [];
  for (let i = 0; i + 3 < p.length; i += 4) out.push(p.slice(i, i + 4));
  return out;
};
/** parçaların yönü 0°, 45° ya da 90°'nin katı (pinle düğüm arası kısa uçlar, ≤ 1 mm, hariç) */
const acilarDuzgun = (k: Kazinti) =>
  [...parcalar(k.ust), ...parcalar(k.alt)].every(([x0, y0, x1, y1]) => {
    const dx = Math.abs(x1 - x0), dy = Math.abs(y1 - y0);
    return Math.hypot(dx, dy) <= 1 || dx < 1e-6 || dy < 1e-6 || Math.abs(dx - dy) < 1e-6;
  });
/** yolun bakırının geçtiği noktalar (0,25 mm adımla) */
const noktalar = (k: Kazinti) => {
  const out: [number, number][] = [];
  for (const [x0, y0, x1, y1] of [...parcalar(k.ust), ...parcalar(k.alt)]) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.25));
    for (let s = 0; s <= n; s++) out.push([x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n]);
  }
  return out;
};
const yakin = (k: Kazinti, x: number, y: number) => noktalar(k).some(([a, b]) => Math.hypot(a - x, b - y) < 1e-6);

describe("kazınmış bakır yollar: iki katmanlı yönlendirme", () => {
  it("boş kartta L: tek katmanda, via yok, köşesi 45° pahlı; uçlar pinlerde", () => {
    const iz = izgaraKur({ x: 0, y: 0, w: 50, h: 50 }, [], []);
    const k = yolBul(iz, { x: 2.54, y: 2.54 }, { x: 30.48, y: 20.32 }, 5);
    expect(k.via).toEqual([]);
    expect(acilarDuzgun(k)).toBe(true);
    expect(parcalar([...k.ust, ...k.alt]).some(([x0, y0, x1, y1]) => Math.abs(Math.abs(x1 - x0) - Math.abs(y1 - y0)) < 1e-6 && Math.abs(x1 - x0) > 0.1)).toBe(true);
    expect(yakin(k, 2.54, 2.54) && yakin(k, 30.48, 20.32)).toBe(true);
  });

  it("katmanların tercih ettiği yön: yatay bağlantı üstte, dikey bağlantı altta", () => {
    const iz = izgaraKur({ x: 0, y: 0, w: 40, h: 40 }, [], []);
    const yatay = yolBul(iz, { x: 2.54, y: 10.16 }, { x: 35.56, y: 10.16 }, 3);
    expect(yatay.alt).toEqual([]);
    expect(yatay.via).toEqual([]);
    const dikey = yolBul(iz, { x: 20.32, y: 2.54 }, { x: 20.32, y: 35.56 }, 4);
    expect(dikey.ust).toEqual([]);
    expect(dikey.via).toEqual([]);
  });

  it("pahlama: düz giden noktalar atlanır, köşeler pahlanır, uçlar korunur", () => {
    expect(pahla([0, 0, 5, 0, 10, 0], 1)).toEqual([0, 0, 10, 0]);
    expect(pahla([0, 0, 10, 0, 10, 10], 1)).toEqual([0, 0, 9, 0, 10, 1, 10, 10]);
  });

  it("başka netin pedinin üstünden geçmez, dolanır", () => {
    const yabanci = { x: 20.32, y: 10.16, net: 9 };
    const iz = izgaraKur({ x: 0, y: 0, w: 40, h: 25 }, [], [yabanci, { x: 2.54, y: 10.16, net: 5 }, { x: 35.56, y: 10.16, net: 5 }]);
    const k = yolBul(iz, { x: 2.54, y: 10.16 }, { x: 35.56, y: 10.16 }, 5);
    expect(acilarDuzgun(k)).toBe(true);
    for (const [x, y] of noktalar(k)) expect(Math.hypot(x - yabanci.x, y - yabanci.y), `${x},${y}`).toBeGreaterThan(0.6);
  });

  it("başka netin bakırı dolanılır, aynı netinki paylaşılır", () => {
    const iz = izgaraKur({ x: 0, y: 0, w: 40, h: 20 }, [], []);
    yolBul(iz, { x: 0, y: 10.16 }, { x: 38.1, y: 10.16 }, 1);
    // başka net aynı satırda: ya başka satıra kaçar ya da alt katmana iner
    const b = yolBul(iz, { x: 1.27, y: 10.16 }, { x: 36.83, y: 10.16 }, 2);
    expect(b.via.length > 0 || noktalar(b).some(([, y]) => Math.abs(y - 10.16) > 1)).toBe(true);
    // aynı net aynı satırda: üst katmanda düz gider
    const c = yolBul(iz, { x: 2.54, y: 10.16 }, { x: 35.56, y: 10.16 }, 1);
    expect(c.via).toEqual([]);
    expect(noktalar(c).every(([, y]) => Math.abs(y - 10.16) < 1e-6)).toBe(true);
  });

  it("bütün kart: her kart içi bağlantı kazınır, açılar düzgün, bakır kartın içinde, yol başına az via", () => {
    const lay = kartYerlesimi("cpu16", "pcb");
    const edges = allWires(netEnds()).filter((e) => e.net > 1 && e.a.card === "clk" && e.b.card === "clk");
    const kart = lay.cards.find((c) => c.name === "clk")!;
    const sonuc = [...kazi(lay, edges)];
    expect(sonuc.length).toBe(edges.length);
    expect(sonuc.length).toBeGreaterThan(50);
    let via = 0;
    for (const k of sonuc) {
      via += k.via.length / 2;
      expect(acilarDuzgun(k)).toBe(true);
      for (const [x, y] of noktalar(k)) expect(x >= kart.x - 0.01 && x <= kart.x + kart.w + 0.01 && y >= kart.y - 0.01 && y <= kart.y + kart.h + 0.01).toBe(true);
    }
    expect(via / sonuc.length).toBeLessThan(3);
  });
});
