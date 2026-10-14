// PCB görünümünün bakır yolları (src/board3d/pcbYol.ts): kartın ızgarasında dik açılı yönlendirme, gövdelerden
// ve başka netlerin pedlerinden kaçınma, 45° pahlı köşeler, gerçek kartta seçili çipin ve netin yolları.

import { describe, expect, it } from "vitest";
import { kartYerlesimi } from "../../src/board3d/aktif.ts";
import { bakirYollari, izgaraKur, pahla, yolBul, yolSeridi, yukle } from "../../src/board3d/pcbYol.ts";
import { netEnds } from "../../src/board3d/store.ts";
import { netTree } from "../../src/board3d/wires.ts";

/** yolun parçaları eksenlere paralel mi (uçlardaki kısa bağlantılar hariç) */
const dikAcili = (y: number[]) => {
  for (let k = 2; k + 5 < y.length; k += 2) if (Math.abs(y[k] - y[k + 2]) > 1e-6 && Math.abs(y[k + 1] - y[k + 3]) > 1e-6) return false;
  return true;
};
/** yolun içinden geçtiği noktalar (0,25 mm adımla) */
const noktalar = (y: number[]) => {
  const out: [number, number][] = [];
  for (let k = 0; k + 3 < y.length; k += 2) {
    const n = Math.max(1, Math.ceil(Math.hypot(y[k + 2] - y[k], y[k + 3] - y[k + 1]) / 0.25));
    for (let s = 0; s <= n; s++) out.push([y[k] + ((y[k + 2] - y[k]) * s) / n, y[k + 1] + ((y[k + 3] - y[k + 1]) * s) / n]);
  }
  return out;
};

describe("bakır yol yönlendirmesi", () => {
  it("boş kartta: uçlar aynı, dik açılı, en çok bir kıvrım", () => {
    const iz = izgaraKur({ x: 0, y: 0, w: 50, h: 50 }, [], []);
    const y = yolBul(iz, { x: 2.54, y: 2.54 }, { x: 30.48, y: 20.32 }, 5);
    expect(y.slice(0, 2)).toEqual([2.54, 2.54]);
    expect(y.slice(-2)).toEqual([30.48, 20.32]);
    expect(dikAcili(y)).toBe(true);
    expect(y.length / 2 - 2).toBeLessThanOrEqual(1);
  });

  it("aradaki gövdenin çevresinden dolanır, başka netin pedinin üstünden geçmez", () => {
    const govde = { x: 10, y: 0, w: 8, h: 30 };
    const yabanci = { x: 14, y: 35.56, net: 9 };
    const iz = izgaraKur({ x: 0, y: 0, w: 40, h: 40 }, [govde], [yabanci, { x: 2.54, y: 10.16, net: 5 }, { x: 30.48, y: 10.16, net: 5 }]);
    const y = yolBul(iz, { x: 2.54, y: 10.16 }, { x: 30.48, y: 10.16 }, 5);
    expect(dikAcili(y)).toBe(true);
    for (const [x, z] of noktalar(y)) {
      expect(x > govde.x + 0.1 && x < govde.x + govde.w - 0.1 && z < govde.y + govde.h - 0.1, `${x},${z}`).toBe(false);
      expect(Math.hypot(x - yabanci.x, z - yabanci.y), `${x},${z}`).toBeGreaterThan(0.6);
    }
  });

  it("döşenen yolun üstü pahalı: ikinci yol yanından gider", () => {
    const iz = izgaraKur({ x: 0, y: 0, w: 40, h: 20 }, [], []);
    const a = yolBul(iz, { x: 0, y: 10.16 }, { x: 38.1, y: 10.16 }, 1);
    yukle(iz, a);
    const b = yolBul(iz, { x: 1.27, y: 10.16 }, { x: 36.83, y: 10.16 }, 2);
    // uçlar aynı satırda olsa da ortası başka satırda
    expect(noktalar(b).some(([, z]) => Math.abs(z - 10.16) > 1)).toBe(true);
  });

  it("pahlama: köşeler 45°, uçlar korunur", () => {
    const p = pahla([0, 0, 10, 0, 10, 10, 20, 10], 1);
    expect(p.slice(0, 2)).toEqual([0, 0]);
    expect(p.slice(-2)).toEqual([20, 10]);
    for (let k = 0; k + 3 < p.length; k += 2) {
      const aci = (Math.atan2(p[k + 3] - p[k + 1], p[k + 2] - p[k]) * 180) / Math.PI;
      expect(Math.abs(aci % 45) < 1e-6 || Math.abs((aci % 45) - 45) < 1e-6 || Math.abs((aci % 45) + 45) < 1e-6, `${aci}`).toBe(true);
    }
  });

  it("yolun şeridi: her noktada iki köşe, genişlik w", () => {
    const s = yolSeridi([0, 0, 10, 0], 2);
    expect(s).toEqual([0, 1, 0, -1, 10, 1, 10, -1]);
  });

  it("gerçek kart: bir çipin bütün netleri ve bir arka panel sinyali kart içinde döşenir", () => {
    const lay = kartYerlesimi("cpu16", "pcb");
    const ends = netEnds();
    const u1 = lay.chips[0];
    const nets = [...new Set(u1.pins.map((p) => p.net).filter((n) => n > 1))];
    const edges = nets.flatMap((n) => netTree(n, ends.get(n) ?? []));
    const yollar = bakirYollari(lay, edges);
    expect(yollar.length).toBe(edges.filter((e) => e.a.card === e.b.card).length);
    const kart = lay.cards.find((c) => c.name === u1.card)!;
    for (const { yol } of yollar) {
      for (const [x, y] of noktalar(yol)) {
        expect(x >= kart.x - 0.01 && x <= kart.x + kart.w + 0.01 && y >= kart.y - 0.01 && y <= kart.y + kart.h + 0.01).toBe(true);
      }
    }
  });
});
