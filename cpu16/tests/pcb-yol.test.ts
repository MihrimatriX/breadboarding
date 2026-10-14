// PCB görünümünün kazınmış bakır yolları (src/board3d/pcbYol.ts): iki katmanlı kart (üstte yatay, altta dikey,
// kıvrımlarda via), gövdelerden ve başka netlerin pedlerinden kaçınma, aynı netin bakırı paylaşması, bütün
// kartın kazınması.

import { describe, expect, it } from "vitest";
import { kartYerlesimi } from "../../src/board3d/aktif.ts";
import { izgaraKur, kazi, yolBul, type Kazinti } from "../../src/board3d/pcbYol.ts";
import { netEnds } from "../../src/board3d/store.ts";
import { allWires } from "../../src/board3d/wires.ts";

/** pinle düğüm arası uçlar hariç parçalar: [x0, y0, x1, y1] */
const parcalar = (p: number[]) => {
  const out: number[][] = [];
  for (let i = 0; i + 3 < p.length; i += 4) out.push(p.slice(i, i + 4));
  return out;
};
/** üst katman yalnız yatay, alt katman yalnız dikey (pinle düğüm arası kısa uçlar hariç) */
const katmanlarDuzgun = (k: Kazinti, uc = 1) =>
  parcalar(k.ust).every(([x0, y0, x1, y1]) => Math.abs(y1 - y0) < 1e-9 || Math.hypot(x1 - x0, y1 - y0) <= uc) &&
  parcalar(k.alt).every(([x0, y0, x1, y1]) => Math.abs(x1 - x0) < 1e-9 || Math.hypot(x1 - x0, y1 - y0) <= uc);
/** yolun bakırının geçtiği noktalar (0,25 mm adımla) */
const noktalar = (k: Kazinti) => {
  const out: [number, number][] = [];
  for (const [x0, y0, x1, y1] of [...parcalar(k.ust), ...parcalar(k.alt)]) {
    const n = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) / 0.25));
    for (let s = 0; s <= n; s++) out.push([x0 + ((x1 - x0) * s) / n, y0 + ((y1 - y0) * s) / n]);
  }
  return out;
};

describe("kazınmış bakır yollar: iki katmanlı yönlendirme", () => {
  it("boş kartta: üst katmanda yatay, altta dikey, köşede bir via; uçlar pinlerde", () => {
    const iz = izgaraKur({ x: 0, y: 0, w: 50, h: 50 }, [], []);
    const k = yolBul(iz, { x: 2.54, y: 2.54 }, { x: 30.48, y: 20.32 }, 5);
    expect(katmanlarDuzgun(k)).toBe(true);
    expect(k.via.length / 2).toBe(1);
    const uclar = noktalar(k);
    expect(uclar.some(([x, y]) => Math.hypot(x - 2.54, y - 2.54) < 1e-6)).toBe(true);
    expect(uclar.some(([x, y]) => Math.hypot(x - 30.48, y - 20.32) < 1e-6)).toBe(true);
  });

  it("aynı satırdaki iki pin: yalnız üst katman, via yok", () => {
    const iz = izgaraKur({ x: 0, y: 0, w: 40, h: 20 }, [], []);
    const k = yolBul(iz, { x: 2.54, y: 10.16 }, { x: 35.56, y: 10.16 }, 3);
    expect(k.alt).toEqual([]);
    expect(k.via).toEqual([]);
  });

  it("başka netin pedinin üstünden geçmez, dolanır", () => {
    const yabanci = { x: 20.32, y: 10.16, net: 9 };
    const iz = izgaraKur({ x: 0, y: 0, w: 40, h: 25 }, [], [yabanci, { x: 2.54, y: 10.16, net: 5 }, { x: 35.56, y: 10.16, net: 5 }]);
    const k = yolBul(iz, { x: 2.54, y: 10.16 }, { x: 35.56, y: 10.16 }, 5);
    expect(katmanlarDuzgun(k)).toBe(true);
    for (const [x, y] of noktalar(k)) expect(Math.hypot(x - yabanci.x, y - yabanci.y), `${x},${y}`).toBeGreaterThan(0.6);
  });

  it("başka netin bakırı dolanılır, aynı netinki paylaşılır", () => {
    const iz = izgaraKur({ x: 0, y: 0, w: 40, h: 20 }, [], []);
    yolBul(iz, { x: 0, y: 10.16 }, { x: 38.1, y: 10.16 }, 1);
    // başka net aynı satırda: ortası başka satıra kaçar
    const b = yolBul(iz, { x: 1.27, y: 10.16 }, { x: 36.83, y: 10.16 }, 2);
    expect(noktalar(b).some(([, y]) => Math.abs(y - 10.16) > 1)).toBe(true);
    // aynı net aynı satırda: düz gider
    const c = yolBul(iz, { x: 2.54, y: 10.16 }, { x: 35.56, y: 10.16 }, 1);
    expect(noktalar(c).every(([, y]) => Math.abs(y - 10.16) < 1e-6)).toBe(true);
  });

  it("bütün kart: her kart içi bağlantı kazınır, katmanlar düzgün, bakır kartın içinde", () => {
    const lay = kartYerlesimi("cpu16", "pcb");
    const edges = allWires(netEnds()).filter((e) => e.net > 1 && e.a.card === "clk" && e.b.card === "clk");
    const kart = lay.cards.find((c) => c.name === "clk")!;
    const sonuc = [...kazi(lay, edges)];
    expect(sonuc.length).toBe(edges.length);
    expect(sonuc.length).toBeGreaterThan(50);
    for (const k of sonuc) {
      expect(katmanlarDuzgun(k)).toBe(true);
      for (const [x, y] of noktalar(k)) expect(x >= kart.x - 0.01 && x <= kart.x + kart.w + 0.01 && y >= kart.y - 0.01 && y <= kart.y + kart.h + 0.01).toBe(true);
    }
  });
});
