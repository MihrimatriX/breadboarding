import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assemble, assembleOrThrow } from "../asm/assembler.ts";
import { fromIntelHex, toIntelHex } from "../asm/hex.ts";
import { Cpu16, SimpleBus } from "../emu/cpu.ts";
import { disassemble } from "../emu/disasm.ts";

const load = (name: string) => {
  const src = readFileSync(new URL(`../programs/${name}.s`, import.meta.url), "utf8");
  const res = assembleOrThrow(src);
  const bus = new SimpleBus();
  bus.load(res.image);
  return { cpu: new Cpu16(bus), bus, res };
};
const words = (cpu: Cpu16, addr: number, n: number) =>
  Array.from({ length: n }, (_, i) => cpu.read16(addr + 2 * i));

describe("örnek programlar", () => {
  it("hello.s UART'a mesaj yazar", () => {
    const { cpu, bus } = load("hello");
    expect(cpu.run()).toBe("halted");
    expect(bus.output).toBe("Merhaba, CPU16!\n");
  });

  it("fib.s ilk 20 Fibonacci sayısı", () => {
    const { cpu } = load("fib");
    expect(cpu.run()).toBe("halted");
    const want = [0, 1];
    while (want.length < 20) want.push((want.at(-1)! + want.at(-2)!) & 0xffff);
    expect(words(cpu, 0x4000, 20)).toEqual(want);
  });

  it("add32.s 32 bit toplama ve yazılımla çarpma", () => {
    const { cpu } = load("add32");
    expect(cpu.run()).toBe("halted");
    const w = words(cpu, 0x4000, 4);
    expect(w[0] | (w[1] << 16)).toBe(0x12345 + 0x2ffff);
    expect((w[2] | (w[3] << 16)) >>> 0).toBe(1234 * 5678);
  });

  it("bubble.s işaretli sayıları sıralar", () => {
    const { cpu } = load("bubble");
    expect(cpu.run()).toBe("halted");
    const sorted = [5, -3, 1000, 0, -32768, 42, 7, 32767].sort((a, b) => a - b).map((v) => v & 0xffff);
    expect(words(cpu, 0x4000, 8)).toEqual(sorted);
  });

  it("irq.s her kesmede sayacı artırır, HALT kesmeyle uyanır", () => {
    const { cpu } = load("irq");
    expect(cpu.run(100)).toBe("halted"); // EI + HALT: bekliyor
    for (let k = 1; k <= 3; k++) {
      cpu.irq = true; // cihaz kesme ister
      while (cpu.read16(0x4002) === 0) cpu.step(); // işleyici ACK yazana kadar
      cpu.irq = false; // cihaz hattı bırakır
      cpu.write16(0x4002, 0);
      expect(cpu.run(100)).toBe("halted");
      expect(cpu.read16(0x4000)).toBe(k);
    }
    expect(cpu.regs[6]).toBe(0xff00); // yığın dengede
  });
});

describe("as16", () => {
  it("ifadeler, etiketler, direktifler", () => {
    const r = assembleOrThrow(`
BASE = 0x40 << 8
      .org BASE
a:    .word a, b - a, -1, 'A'
b:    .byte 1, "hi"        ; 3 bayt, .align 1 bayt doldurur
      .align 2
c:    .ascii "x;y"   ; string içindeki ; yorum değil
      .asciz "\\n"
      .space 3, 0xEE
d:    .word lo(0x1234), hi(0x1234), (2 + 3) * 4 | 1
`);
    expect(r.symbols.get("a")).toBe(0x4000);
    expect(r.symbols.get("b")).toBe(0x4008);
    expect(r.symbols.get("c")).toBe(0x400c);
    expect(Array.from(r.image.subarray(0x4000, 0x400c))).toEqual(
      [0x00, 0x40, 0x08, 0x00, 0xff, 0xff, 0x41, 0x00, 1, 0x68, 0x69, 0],
    );
    expect(Array.from(r.image.subarray(0x400c, 0x4014))).toEqual([0x78, 0x3b, 0x79, 0x0a, 0, 0xee, 0xee, 0xee]);
    expect(r.symbols.get("d")).toBe(0x4014);
    expect(Array.from(r.image.subarray(0x4014, 0x401a))).toEqual([0x34, 0, 0x12, 0, 21, 0]);
    expect(r.ranges).toEqual([[0x4000, 0x401a]]);
  });

  it("LI ileri referansta her zaman 2 komut, küçük sabitte 1 komut", () => {
    const r = assembleOrThrow("LI r1, 5\nLI r2, later\nlater: HALT");
    expect(r.symbols.get("later")).toBe(6);
  });

  it("hataları satır numarasıyla raporlar", () => {
    const r = assemble("ADDI r1, r1, 40\nFOO r1\nLW r1, [r2+3]\nB nowhere\nr3: NOP\nx: NOP\nx: NOP");
    expect(r.errors.map((e) => e.line)).toEqual([1, 2, 3, 4, 5, 7]);
    expect(r.errors[0].message).toMatch(/aralık dışı/);
    expect(r.errors[1].message).toMatch(/Bilinmeyen komut/);
  });

  it("dallanma menzili sınırı", () => {
    const far = `B far\n.space 300\nfar: HALT`;
    expect(assemble(far).errors[0].message).toMatch(/Dallanma mesafesi/);
    expect(assemble(`B near\n.space 254\nnear: HALT`).errors).toEqual([]);
  });

  it("Intel HEX gidiş-dönüş", () => {
    const r = assembleOrThrow(".org 0x100\n.word 1,2,3\n.org 0x8000\nHALT");
    const hex = toIntelHex(r.image, r.ranges);
    expect(hex.split("\n")[0]).toBe(":06010000010002000300F3");
    expect(hex.trim().endsWith(":00000001FF")).toBe(true);
    expect(fromIntelHex(hex)).toEqual(r.image);
  });
});

describe("disassembler", () => {
  it("her geçerli komut kelimesi derlenip aynı metne döner", () => {
    let checked = 0;
    for (let w = 0; w < 0x10000; w++) {
      const pc = 0x4000;
      const text = disassemble(w, pc);
      if (text.startsWith(".word")) continue;
      const r = assemble(`.org ${pc}\n${text}`);
      expect(r.errors, `${w.toString(16)}: ${text}`).toEqual([]);
      const back = r.image[pc] | (r.image[pc + 1] << 8);
      expect(disassemble(back, pc), `${w.toString(16)}: ${text}`).toBe(text);
      checked++;
    }
    expect(checked).toBeGreaterThan(50000);
  });
});
