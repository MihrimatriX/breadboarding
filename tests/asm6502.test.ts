import { describe, expect, it } from "vitest";
import { assemble, disassemble } from "../src/sim/asm6502";
import { PROGRAMS } from "../src/sim/programs";

describe("6502 assembler", () => {
  it("sayaç programını el ile çevrilmiş baytlara derler", () => {
    expect(PROGRAMS[0].bytes).toEqual([0xa2, 0x00, 0xe8, 0x86, 0x10, 0x8a, 0x18, 0x69, 0x02, 0x85, 0x11, 0x4c, 0x02, 0x00]);
  });
  it("geri dallanmayı doğru hesaplar", () => {
    expect(PROGRAMS[1].bytes).toEqual([0xa9, 0x00, 0xa2, 0x0a, 0x86, 0x21, 0x18, 0x65, 0x21, 0xca, 0xd0, 0xf8, 0x85, 0x20, 0x4c, 0x0e, 0x00]);
  });
  it("adresleme kiplerini ayırt eder", () => {
    const { bytes } = assemble("LDA ($10),Y\nSTA $1234,X\nLDX $20,Y\nJMP ($FFFC)\nASL A\n.byte 1,$FF");
    expect(bytes).toEqual([0xb1, 0x10, 0x9d, 0x34, 0x12, 0xb6, 0x20, 0x6c, 0xfc, 0xff, 0x0a, 0x01, 0xff]);
  });
  it("hatalı satırı bildirir", () => {
    expect(() => assemble("LDA #1\nFOO $10")).toThrow(/Satır 2/);
  });
  it("disassembler dallanma hedefini mutlak adres olarak gösterir", () => {
    const mem = PROGRAMS[1].bytes;
    expect(disassemble((a) => mem[a] ?? 0, 0x0a).text).toBe("BNE $0004");
  });
});
