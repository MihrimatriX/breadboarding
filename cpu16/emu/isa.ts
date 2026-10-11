// CPU16 komut seti tanımları: emülatör, assembler ve disassembler bu dosyayı paylaşır.
// Kaynak: cpu16/docs/spec.md (v1.0) ve cpu16/docs/isa-ayrintilari.md

export const OP = {
  ALU: 0,
  ALU2: 1,
  // 2: rezerve (eski MULDIV)
  ADDI: 3,
  LI: 4, // h=0 LI, h=1 LUI
  LW: 5,
  SW: 6,
  LBU: 7,
  SB: 8,
  BCC: 9,
  JAL: 10,
  JALR: 11,
  CMPI: 12,
  STACK: 13,
  SYS: 14,
  // 15: rezerve
} as const;

export const ALU_F3 = ["ADD", "ADC", "SUB", "SBC", "AND", "OR", "XOR", "CMP"] as const;
export const ALU2_F3 = ["MOV", "NOT", "NEG", "SHL", "SHR", "SAR", "ROL", "ROR"] as const;
export const STACK_F3 = ["PUSH", "POP"] as const;
export const SYS_F3 = ["NOP", "HALT", "EI", "DI", "RETI", "SWI", "SXB"] as const;
export const CONDS = [
  "EQ", "NE", "CS", "CC", "MI", "PL", "VS", "VC",
  "HI", "LS", "GE", "LT", "GT", "LE", "AL",
] as const;

export const REG_SP = 6;
export const REG_LR = 7;

// Bellek haritası (spec §2e)
export const VEC_RESET = 0x0000;
export const VEC_IRQ = 0x0002;
export const VEC_SWI = 0x0004;
export const IO_BASE = 0xff00;
export const IO_UART_DATA = 0xff00; // yazınca karakter gönderir (Faz 1'de konsol)

// Bayrak register'ı bit düzeni (PUSH/RETI için)
export const FLAG_V = 1 << 0;
export const FLAG_C = 1 << 1;
export const FLAG_Z = 1 << 2;
export const FLAG_N = 1 << 3;
export const FLAG_I = 1 << 4;

export function sext(value: number, bits: number): number {
  const shift = 32 - bits;
  return (value << shift) >> shift;
}

// Alan çözücüler
export const f = {
  op: (w: number) => (w >> 12) & 0xf,
  rd: (w: number) => (w >> 9) & 0x7,
  rs1: (w: number) => (w >> 6) & 0x7,
  rs2: (w: number) => (w >> 3) & 0x7,
  f3: (w: number) => w & 0x7,
  imm6: (w: number) => sext(w & 0x3f, 6),
  h: (w: number) => (w >> 8) & 0x1,
  imm8: (w: number) => w & 0xff,
  imm9: (w: number) => sext(w & 0x1ff, 9),
  cond: (w: number) => (w >> 8) & 0xf,
  off8: (w: number) => sext(w & 0xff, 8),
  off12: (w: number) => sext(w & 0xfff, 12),
};

// Kodlayıcılar (değerlerin aralıkta olduğunu çağıran doğrular)
export const enc = {
  R: (op: number, rd: number, rs1: number, rs2: number, f3: number) =>
    ((op << 12) | (rd << 9) | (rs1 << 6) | (rs2 << 3) | f3) & 0xffff,
  I: (op: number, rd: number, rs1: number, imm6: number) =>
    ((op << 12) | (rd << 9) | (rs1 << 6) | (imm6 & 0x3f)) & 0xffff,
  L: (op: number, rd: number, h: number, imm8: number) =>
    ((op << 12) | (rd << 9) | (h << 8) | (imm8 & 0xff)) & 0xffff,
  C: (op: number, rs1: number, imm9: number) =>
    ((op << 12) | (rs1 << 9) | (imm9 & 0x1ff)) & 0xffff,
  B: (op: number, cond: number, off8: number) =>
    ((op << 12) | (cond << 8) | (off8 & 0xff)) & 0xffff,
  J: (op: number, off12: number) => ((op << 12) | (off12 & 0xfff)) & 0xffff,
};
