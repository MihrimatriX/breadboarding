import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import type { ChipData } from "../src/chip/types";
import { Mos6502Machine } from "../src/sim/machines/mos6502";
import { PROGRAMS } from "../src/sim/programs";

const chip = JSON.parse(readFileSync(new URL("../public/chips/mos6502/chip.json", import.meta.url), "utf8")) as ChipData;

function run(bytes: number[], halfSteps: number) {
  const m = new Mos6502Machine(chip);
  m.loadProgram(bytes);
  m.reset();
  for (let i = 0; i < halfSteps; i++) m.halfStep();
  return m;
}

describe("MOS 6502 transistör seviyesi simülasyon", () => {
  it("reset sonrası $FFFC vektöründen (0) başlar ve SP=$FD olur", () => {
    const m = run([0xea, 0xea, 0xea], 4);
    expect(m.trace().sp).toBe(0xfd);
    expect(m.trace().pc).toBeLessThan(0x10);
  });

  it("sayaç programı belleğe doğru değerleri yazar", () => {
    const m = run(PROGRAMS[0].bytes, 200);
    // her döngüde $10 = X, $11 = X + 2
    const x = m.memory[0x10];
    expect(x).toBeGreaterThan(2);
    // $11 bir önceki ya da bu turun değerini tutar
    expect([(x + 1) & 0xff, (x + 2) & 0xff]).toContain(m.memory[0x11]);
  });

  it("toplama döngüsü 1+2+...+10 = 55 hesaplar", () => {
    const prog = PROGRAMS.find((p) => p.id === "sum")!;
    const m = run(prog.bytes, 1200);
    expect(m.memory[0x20]).toBe(55);
  });
});

describe("visual6502 chipsim ile birebir uyum", () => {
  it("600 yarım çevrim boyunca adres/veri yolu ve R/W aynı", () => {
    const golden = JSON.parse(readFileSync(new URL("./fixtures/sum-trace.json", import.meta.url), "utf8")) as { rows: string[] };
    const prog = PROGRAMS.find((p) => p.id === "sum")!;
    const m = new Mos6502Machine(chip);
    m.loadProgram(prog.bytes);
    m.reset();
    golden.rows.forEach((row, i) => {
      const t = m.trace();
      expect(`${t.ab},${t.db},${t.rw ? 1 : 0},${t.sync ? 1 : 0}`, `yarım çevrim ${i}`).toBe(row);
      m.halfStep();
    });
  });
});
