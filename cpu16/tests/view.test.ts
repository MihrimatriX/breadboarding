import { describe, expect, it } from "vitest";
import { buildComputerBoard } from "../board/computer.ts";
import { chipInside, GateProbe } from "../board/inside.ts";
import { boardLayout } from "../board/layout.ts";
import { Circuit, L0, L1, LogicSim, type Gate, type GateKind, type Level } from "../chips/logic.ts";

const { board } = buildComputerBoard();

describe("Faz 5: 3D görünüm verisi", () => {
  it("kart yerleşimi: her çip kartının içinde, gövdeler çakışmıyor, pinler doğru netlerde", () => {
    const lay = boardLayout(board);
    expect(lay.chips).toHaveLength(board.chips.length);
    for (const c of lay.chips) {
      const card = lay.cards.find((k) => k.name === c.card)!;
      expect(c.x).toBeGreaterThanOrEqual(card.x);
      expect(c.x + c.w).toBeLessThanOrEqual(card.x + card.w);
      expect(c.y + c.h).toBeLessThanOrEqual(card.y + card.h);
      const ci = board.instance(c.ref);
      expect(c.pins).toHaveLength(ci.def.pins.length);
      for (const p of c.pins) if (ci.nets[p.name] !== undefined) expect(p.net).toBe(ci.nets[p.name]);
    }
    for (let i = 0; i < lay.chips.length; i++) {
      for (let j = i + 1; j < lay.chips.length; j++) {
        const a = lay.chips[i];
        const b = lay.chips[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.ref} ile ${b.ref}`).toBe(false);
      }
    }
  });

  it("çip içi şeması: her kapı bir kez yerleşir, her girişin kaynağı (pin, kapı ya da sabit) var", () => {
    for (const ci of board.chips) {
      const ins = chipInside(board.c.gates, ci);
      expect(ins.gates.map((g) => g.gate).sort((a, b) => a - b)).toEqual(Array.from({ length: ci.gates[1] - ci.gates[0] }, (_, i) => ci.gates[0] + i));
      const wiredTo = new Set(ins.wires.map((w) => `${w.net}@${w.points.at(-2)},${w.points.at(-1)}`));
      for (const g of ins.gates) {
        g.inputs.forEach((n, k) => {
          if (n <= 1) return;
          expect(wiredTo.has(`${n}@${g.inPorts[k][0]},${g.inPorts[k][1]}`), `${ci.ref} kapı ${g.gate} giriş ${k}`).toBe(true);
        });
      }
    }
  });

  // her kapı türünden ve giriş sayısından bir örnek
  const samples = new Map<string, Gate>();
  for (const g of board.c.gates) if (g.kind !== "BEHAV") samples.set(`${g.kind}/${g.inputs.length}`, g);

  for (const [key, gate] of samples) {
    it(`transistör seviyesi = kapı seviyesi: ${key}`, () => {
      // aynı kapıyı tek başına bir devrede kur, rastgele girişlerle iki modeli karşılaştır
      const c = new Circuit();
      const ins = gate.inputs.map((_, i) => c.net(`i${i}`));
      const outs = gate.outputs.map((_, i) => c.net(`o${i}`));
      c.add(gate.kind as GateKind, ins, outs);
      const sim = new LogicSim(c);
      const probe = new GateProbe(c.gates[0], (n) => c.netNames[n]);
      let seed = 12345;
      const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) & 1;
      const seq = gate.kind === "DFF" || gate.kind === "LATCH";
      // flip-flop: önce bilinen duruma getir (asenkron girişler pasif)
      if (seq) ins.forEach((n) => sim.set(n, L1));
      for (let step = 0; step < 400; step++) {
        ins.forEach((n, i) => {
          // DFF'te ~PRE/~CLR çoğunlukla pasif kalsın, ama ara sıra etkin olsun
          const v = gate.kind === "DFF" && i >= 2 ? (rnd() | rnd() | rnd() ? 1 : 0) : rnd();
          sim.set(n, v as Level);
        });
        // ekran kareleri gibi: güncellemeyi ara sıra atla
        if (step % 3 === 2) continue;
        probe.update(sim.value);
        const outsNow = gate.outputs.map((_, i) => sim.get(outs[i]));
        if (gate.kind === "TBUF" && sim.get(ins[1]) === L0) continue; // Z: düğüm boşta
        if (gate.kind === "DFF" && sim.get(ins[2]) === L0 && sim.get(ins[3]) === L0) continue; // ikisi birden: tanımsız
        outsNow.forEach((v, i) => {
          if (v !== L0 && v !== L1) return;
          expect(probe.level(probe.cm.outputNodes[i]), `adım ${step} çıkış ${i}`).toBe(v);
        });
      }
    });
  }
});
