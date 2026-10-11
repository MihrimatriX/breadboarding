import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assembleOrThrow } from "../asm/assembler.ts";
import { Cpu16, SimpleBus } from "../emu/cpu.ts";
import { disassemble } from "../emu/disasm.ts";
import { assembleMicrocode, parseStep } from "../micro/microasm.ts";
import { Datapath } from "../micro/datapath.ts";

const ucode = readFileSync(new URL("../micro/cpu16.ucode", import.meta.url), "utf8");
const micro = assembleMicrocode(ucode);

/** Aynı bellek imajıyla emülatör ve saat döngüsü modelini kurar. */
function pair(image: Uint8Array) {
  const eb = new SimpleBus();
  const db = new SimpleBus();
  eb.load(image);
  db.load(image);
  return { emu: new Cpu16(eb), dp: new Datapath(micro.rom, db), eb, db };
}

const state = (x: Cpu16 | Datapath) =>
  `pc=${x.pc.toString(16)} r=${Array.from(x.regs, (v) => v.toString(16)).join(",")} f=${x.flags.toString(2)} halt=${x.halted}`;

/** Komut komut lockstep: her komut sonunda mimari durum aynı olmalı. */
function lockstep(p: ReturnType<typeof pair>, maxInstr: number, onStep?: (n: number) => void) {
  for (let n = 0; n < maxInstr; n++) {
    onStep?.(n);
    const at = p.emu.pc;
    const w = p.emu.read16(at);
    const re = p.emu.step();
    const rd = p.dp.stepInstruction();
    const where = `komut #${n} @${at.toString(16)} ${disassemble(w, at)}`;
    expect(rd, where).toBe(re);
    expect(state(p.dp), where).toBe(state(p.emu));
    if (re !== "ok") break;
  }
  expect(p.db.output).toBe(p.eb.output);
  expect(Buffer.from(p.db.mem).equals(Buffer.from(p.eb.mem))).toBe(true);
}

describe("mikrokod derleyicisi", () => {
  it("cpu16.ucode hatasız derlenir", () => {
    expect(micro.errors).toEqual([]);
    expect(micro.routines.length).toBeGreaterThan(15);
  });

  it("adım sözdizimi ve hatalar", () => {
    expect(parseStep("ALU(ADD) -> REG(SP), MAR").sig).toEqual(new Set(["REG_W", "MAR_L"]));
    expect(() => parseStep("REG(RS1) -> REG(RD)")).toThrow(/iki farklı register/);
    expect(() => parseStep("MEM -> MEM")).toThrow(/Bellekten belleğe/);
    expect(() => parseStep("PC -> TA ; UÇ")).toThrow(/Bilinmeyen sinyal/);
    const bad = assembleMicrocode("fetch:\n  PC -> MAR\n  MEM -> IR ; PC+2\nirq:\n  - -> - ; END\nop 3:\n  PC -> TA\nop 3:\n  - -> - ; END");
    expect(bad.errors.map((e) => e.message).join("\n")).toMatch(/END içermeli[\s\S]*zaten tanımlı/);
  });
});

describe("lockstep: mikrokod modeli = referans emülatör", () => {
  for (const name of ["hello", "fib", "add32", "bubble"]) {
    it(`${name}.s`, () => {
      const res = assembleOrThrow(readFileSync(new URL(`../programs/${name}.s`, import.meta.url), "utf8"));
      lockstep(pair(res.image), 10_000);
    });
  }

  it("irq.s kesmelerle: HALT'tan uyanma, işleyici, RETI", () => {
    const res = assembleOrThrow(readFileSync(new URL("../programs/irq.s", import.meta.url), "utf8"));
    const p = pair(res.image);
    let raised = 0;
    for (let n = 0; n < 400 && raised <= 3; n++) {
      // işlemci HALT'ta bekliyorsa cihaz kesme ister; işleyici ACK yazınca hattı bırakır
      if (p.emu.halted && !p.emu.irq) {
        p.emu.irq = p.dp.irq = true;
        raised++;
      }
      if (p.emu.read16(0x4002) === 1) {
        p.emu.irq = p.dp.irq = false;
        for (const b of [p.eb, p.db]) { b.write8(0x4002, 0); b.write8(0x4003, 0); }
      }
      const at = p.emu.pc;
      const re = p.emu.step();
      const rd = p.dp.stepInstruction();
      expect(rd, `#${n} @${at.toString(16)}`).toBe(re);
      expect(state(p.dp), `#${n} @${at.toString(16)}`).toBe(state(p.emu));
    }
    expect(p.emu.read16(0x4000)).toBe(3);
    expect(Buffer.from(p.db.mem).equals(Buffer.from(p.eb.mem))).toBe(true);
  });

  it("rastgele komut akışları (her opcode, her bayrak)", () => {
    let seed = 12345;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) & 0xffff;
    for (let run = 0; run < 300; run++) {
      const image = new Uint8Array(0x10000);
      for (let a = 0; a < 0x10000; a += 2) {
        const w = rnd();
        image[a] = w & 0xff;
        image[a + 1] = w >> 8;
      }
      const p = pair(image);
      for (let r = 0; r < 8; r++) p.emu.regs[r] = p.dp.regs[r] = rnd();
      const f = rnd();
      p.emu.flags = f & 0x0f;
      p.dp.n = p.emu.n; p.dp.z = p.emu.z; p.dp.c = p.emu.c; p.dp.v = p.emu.v;
      lockstep(p, 200);
    }
  });
});

describe("çevrim sayıları", () => {
  it("komut başına saat döngüsü tablosu", () => {
    const cpi = (src: string) => {
      const res = assembleOrThrow(src);
      const b = new SimpleBus();
      b.load(res.image);
      const dp = new Datapath(micro.rom, b);
      dp.stepInstruction();
      return dp.cycles;
    };
    expect(cpi("ADD r1, r2, r3")).toBe(5);
    expect(cpi("MOV r1, r2")).toBe(4);
    expect(cpi("LI r1, 5")).toBe(5);
    expect(cpi("LW r1, [r2]")).toBe(6);
    expect(cpi("B 0")).toBe(5);
    expect(cpi("BNE 0")).toBe(5); // resette Z=0: dallanır
    expect(cpi("BEQ 0")).toBe(3); // dallanmaz
    expect(cpi("PUSH r1")).toBe(6);
    expect(cpi("CALL 0")).toBe(5);
  });
});
