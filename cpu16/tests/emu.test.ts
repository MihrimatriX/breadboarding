import { describe, expect, it } from "vitest";
import { assembleOrThrow } from "../asm/assembler.ts";
import { Cpu16, SimpleBus } from "../emu/cpu.ts";

/** Kaynağı 0x0000'a derler, HALT'a kadar çalıştırır. */
function run(src: string, setup?: (cpu: Cpu16) => void) {
  const res = assembleOrThrow(src);
  const bus = new SimpleBus();
  bus.load(res.image);
  const cpu = new Cpu16(bus);
  setup?.(cpu);
  const result = cpu.run(100_000);
  return { cpu, bus, result, symbols: res.symbols };
}

const flags = (cpu: Cpu16) =>
  `${cpu.n ? "N" : "-"}${cpu.z ? "Z" : "-"}${cpu.c ? "C" : "-"}${cpu.v ? "V" : "-"}`;

describe("ALU (op 0)", () => {
  const alu = (op: string, a: number, b: number, carry = false) => {
    const { cpu } = run(`LI r1, ${a}\nLI r2, ${b}\n${op} r3, r1, r2\nHALT`, (c) => {
      c.c = carry;
    });
    return { r: cpu.regs[3], f: flags(cpu), cpu };
  };

  it("ADD: taşma bayrakları", () => {
    expect(alu("ADD", 1, 2)).toMatchObject({ r: 3, f: "----" });
    expect(alu("ADD", 0xffff, 1)).toMatchObject({ r: 0, f: "-ZC-" });
    expect(alu("ADD", 0x7fff, 1)).toMatchObject({ r: 0x8000, f: "N--V" });
    expect(alu("ADD", 0x8000, 0x8000)).toMatchObject({ r: 0, f: "-ZCV" });
  });

  it("ADC: gelen elde", () => {
    // LI elde bayrağını bozmaz, bu yüzden setup'taki C korunur
    expect(alu("ADC", 1, 2, true).r).toBe(4);
    expect(alu("ADC", 0xffff, 0, true)).toMatchObject({ r: 0, f: "-ZC-" });
  });

  it("SUB: C = borç yok (ARM tarzı)", () => {
    expect(alu("SUB", 5, 3)).toMatchObject({ r: 2, f: "--C-" });
    expect(alu("SUB", 3, 5)).toMatchObject({ r: 0xfffe, f: "N---" });
    expect(alu("SUB", 7, 7)).toMatchObject({ r: 0, f: "-ZC-" });
    expect(alu("SUB", 0x8000, 1)).toMatchObject({ r: 0x7fff, f: "--CV" });
  });

  it("SBC: C=0 ise bir eksik", () => {
    expect(alu("SBC", 5, 3, true).r).toBe(2);
    expect(alu("SBC", 5, 3, false).r).toBe(1);
  });

  it("AND / OR / XOR: N,Z günceller, C,V korunur", () => {
    expect(alu("AND", 0xf0f0, 0x0ff0, true)).toMatchObject({ r: 0x00f0, f: "--C-" });
    expect(alu("OR", 0x8000, 0x0001)).toMatchObject({ r: 0x8001, f: "N---" });
    expect(alu("XOR", 0x1234, 0x1234)).toMatchObject({ r: 0, f: "-Z--" });
  });

  it("CMP sonucu yazmaz, sadece bayrak", () => {
    const { cpu } = run("LI r1, 5\nLI r2, 9\nLI r3, 77\nCMP r1, r2\nHALT");
    expect(cpu.regs[3]).toBe(77);
    expect(flags(cpu)).toBe("N---");
  });
});

describe("ALU2 (op 1)", () => {
  const u = (op: string, a: number, carry = false) => {
    const { cpu } = run(`LI r1, ${a}\n${op} r2, r1\nHALT`, (c) => {
      c.c = carry;
    });
    return { r: cpu.regs[2], f: flags(cpu) };
  };
  it("MOV, NOT, NEG", () => {
    expect(u("MOV", 0x8001)).toMatchObject({ r: 0x8001, f: "N---" });
    expect(u("NOT", 0)).toMatchObject({ r: 0xffff, f: "N---" });
    expect(u("NEG", 1)).toMatchObject({ r: 0xffff, f: "N---" });
    expect(u("NEG", 0x8000)).toMatchObject({ r: 0x8000, f: "N--V" });
  });
  it("1 bit kaydırma ve elde üzerinden döndürme", () => {
    expect(u("SHL", 0x8001)).toMatchObject({ r: 0x0002, f: "--C-" });
    expect(u("SHR", 0x0003)).toMatchObject({ r: 0x0001, f: "--C-" });
    expect(u("SAR", 0x8002)).toMatchObject({ r: 0xc001, f: "N---" });
    expect(u("ROL", 0x8000, true)).toMatchObject({ r: 0x0001, f: "--C-" });
    expect(u("ROR", 0x0001, true)).toMatchObject({ r: 0x8000, f: "N-C-" });
  });
});

describe("sabitler ve bellek", () => {
  it("LI / LUI ve 16 bit LI sözde komutu", () => {
    const { cpu } = run("LI r1, 0x34\nLUI r1, 0x12\nLI r2, 0xBEEF\nLI r3, -2\nHALT");
    expect(cpu.regs[1]).toBe(0x1234);
    expect(cpu.regs[2]).toBe(0xbeef);
    expect(cpu.regs[3]).toBe(0xfffe);
  });

  it("ADDI işaretli sabit ve bayrak", () => {
    const { cpu } = run("LI r1, 1\nADDI r1, r1, -1\nHALT");
    expect(cpu.regs[1]).toBe(0);
    expect(cpu.z).toBe(true);
  });

  it("LW/SW little-endian, ofset ×2", () => {
    const { cpu, bus } = run("LI r1, 0x4000\nLI r2, 0xABCD\nSW r2, [r1+62]\nLW r3, [r1+62]\nSW r2, [r1-64]\nHALT");
    expect(bus.mem[0x403e]).toBe(0xcd);
    expect(bus.mem[0x403f]).toBe(0xab);
    expect(cpu.regs[3]).toBe(0xabcd);
    expect(cpu.read16(0x4000 - 64)).toBe(0xabcd);
  });

  it("LW tek adreste bit 0'ı yok sayar", () => {
    const { cpu } = run("LI r1, 0x4001\nLI r2, 0x1111\nSW r2, [r1]\nLW r3, [r1]\nHALT");
    expect(cpu.read16(0x4000)).toBe(0x1111);
    expect(cpu.regs[3]).toBe(0x1111);
  });

  it("LBU/SB ve SXB", () => {
    const { cpu } = run("LI r1, 0x4000\nLI r2, 0x1280\nSB r2, [r1+31]\nLBU r3, [r1+31]\nSXB r4, r3\nHALT");
    expect(cpu.regs[3]).toBe(0x80);
    expect(cpu.regs[4]).toBe(0xff80);
  });
});

describe("dallanma ve çağrı", () => {
  const cond = (c: string, a: number, b: number) => {
    const { cpu } = run(`LI r1, ${a}\nLI r2, ${b}\nLI r0, 0\nCMP r1, r2\nB${c} yes\nHALT\nyes: LI r0, 1\nHALT`);
    return cpu.regs[0] === 1;
  };
  it.each([
    ["EQ", 3, 3, true], ["EQ", 3, 4, false], ["NE", 3, 4, true],
    ["CS", 5, 3, true], ["CC", 3, 5, true],
    ["MI", 3, 5, true], ["PL", 5, 3, true],
    ["HI", 5, 3, true], ["HI", 3, 3, false], ["LS", 3, 3, true], ["LS", 0xffff, 1, false],
    ["GE", -1, -2, true], ["GE", -2, -1, false], ["LT", -2, 1, true], ["LT", 0x7fff, -1, false],
    ["GT", 1, -1, true], ["GT", 1, 1, false], ["LE", 1, 1, true], ["LE", -5, 2, true],
    ["", 0, 1, true],
  ] as const)("B%s %i,%i → %s", (c, a, b, want) => {
    expect(cond(c, a, b)).toBe(want);
  });

  it("VS / VC", () => {
    const vs = run("LI r1, 0x7FFF\nADDI r1, r1, 1\nLI r0, 0\nBVS y\nHALT\ny: LI r0, 1\nHALT");
    expect(vs.cpu.regs[0]).toBe(1);
    const vc = run("LI r1, 1\nADDI r1, r1, 1\nLI r0, 0\nBVC y\nHALT\ny: LI r0, 1\nHALT");
    expect(vc.cpu.regs[0]).toBe(1);
  });

  it("geri dallanma döngüsü", () => {
    const { cpu } = run("LI r1, 10\nLI r2, 0\nl: ADDI r2, r2, 3\nADDI r1, r1, -1\nBNE l\nHALT");
    expect(cpu.regs[2]).toBe(30);
  });

  it("JAL/RET ve JALR", () => {
    const { cpu } = run(`
      LI sp, 0xFF00
      CALL f
      LI r1, g
      JALR lr, r1, 0
      HALT
f:    LI r2, 11
      RET
g:    LI r3, 22
      RET`);
    expect(cpu.regs[2]).toBe(11);
    expect(cpu.regs[3]).toBe(22);
    expect(cpu.halted).toBe(true);
  });

  it("PUSH/POP azalan yığın", () => {
    const { cpu } = run("LI sp, 0x5000\nLI r1, 0xAAAA\nLI r2, 0x5555\nPUSH r1\nPUSH r2\nPOP r3\nPOP r4\nHALT");
    expect(cpu.regs[3]).toBe(0x5555);
    expect(cpu.regs[4]).toBe(0xaaaa);
    expect(cpu.regs[6]).toBe(0x5000);
    expect(cpu.read16(0x4ffe)).toBe(0xaaaa);
  });

  it("CMPI işaretli 9 bit", () => {
    const { cpu } = run("LI r1, -200\nCMPI r1, -200\nHALT");
    expect(cpu.z).toBe(true);
  });
});

describe("sistem ve kesmeler", () => {
  it("SWI vektör 0x0004'e gider, RETI geri döner ve bayrakları geri yükler", () => {
    const { cpu } = run(`
      B main
      B main
      B swi
main: LI sp, 0xFF00
      LI r1, 5
      CMPI r1, 5      ; Z=1
      SWI
      LI r3, 1        ; RETI buraya döner
      HALT
swi:  LI r2, 99
      CMPI r2, 0      ; Z=0 (dönüşte geri yüklenmeli)
      RETI`);
    expect(cpu.regs[2]).toBe(99);
    expect(cpu.regs[3]).toBe(1);
    expect(cpu.z).toBe(true);
  });

  it("DI iken IRQ yok sayılır", () => {
    const { cpu } = run("LI r0, 1\nDI\nHALT", (c) => {
      c.irq = true;
    });
    expect(cpu.halted).toBe(true);
    expect(cpu.pc).toBe(6);
  });

  it("yasadışı komut durdurur ve adresini verir", () => {
    const { cpu, result } = run("NOP\n.word 0x2000\nHALT");
    expect(result).toBe("illegal");
    expect(cpu.illegalAt).toBe(2);
  });
});
