// CPU16 kontrol kelimesi: mikrokod ROM'undaki her 32 bitlik kelime bir saat döngüsünde
// hangi sinyallerin aktif olduğunu söyler. Donanımda 4 adet 8 bit Flash çipine bölünür.
// Ayrıntılı açıklama: cpu16/docs/mikromimari.md

/** Veriyoluna kim yazar (aynı anda tek sürücü). */
export const BUS = { NONE: 0, REG: 1, ALU: 2, PC: 3, MEM: 4, IMM: 5, FLAGS: 6 } as const;
/** Register dosyasının hangi indeksi seçilir. */
export const RSEL = { RD: 0, RS1: 1, RS2: 2, SP: 3, LR: 4 } as const;
/** Sabit birimi çıkışı. */
export const IMM = { IMM6: 0, IMM6X2: 1, IMM8: 2, IMM9: 3, OFF8X2: 4, OFF12X2: 5, C2: 6, C4: 7 } as const;
/** ALU işlemleri. 0–7 ve 8–15, IR'deki f3 alanıyla aynı sırada (ALU_IR ile doğrudan seçilir). */
export const ALUOP = {
  ADD: 0, ADC: 1, SUB: 2, SBC: 3, AND: 4, OR: 5, XOR: 6, CMP: 7,
  MOV: 8, NOT: 9, NEG: 10, SHL: 11, SHR: 12, SAR: 13, ROL: 14, ROR: 15,
  SXB: 17, MERGE: 18,
} as const;

/** Tek bitlik sinyaller ve bit konumları. */
export const SIG = {
  REG_W: 16, TA_L: 17, TB_L: 18, PC_L: 19, PC_INC: 20, MAR_L: 21, MEM_W: 22, IR_L: 23,
  FLAGS_L: 24, FLAGS_BUS_L: 25, I_SET: 26, I_CLR: 27, BYTE: 28, HALT: 29, ILLEGAL: 30, END: 31,
} as const;
export type Signal = keyof typeof SIG;

export interface Control {
  bus: number;
  rsel: number;
  aluOp: number;
  aluIr: boolean;
  imm: number;
  sig: Set<Signal>;
}

/** Bit düzeni: [2:0] BUS, [5:3] RSEL, [10:6] ALU_OP, [11] ALU_IR, [15:12] IMM, [31:16] tek bitlik sinyaller */
export function encodeControl(c: Partial<Control>): number {
  let w = (c.bus ?? 0) | ((c.rsel ?? 0) << 3) | ((c.aluOp ?? 0) << 6) | ((c.aluIr ? 1 : 0) << 11) | ((c.imm ?? 0) << 12);
  for (const s of c.sig ?? []) w |= 1 << SIG[s];
  return w >>> 0;
}

export function decodeControl(w: number): Control {
  const sig = new Set<Signal>();
  for (const [name, bit] of Object.entries(SIG) as [Signal, number][]) if ((w >>> bit) & 1) sig.add(name);
  return {
    bus: w & 7,
    rsel: (w >>> 3) & 7,
    aluOp: (w >>> 6) & 31,
    aluIr: ((w >>> 11) & 1) === 1,
    imm: (w >>> 12) & 15,
    sig,
  };
}

/** Mikrokod ROM adresi: [12] INT, [11:8] op, [7:5] f3, [4] COND, [3:0] adım → 8192 kelime */
export const ROM_WORDS = 1 << 13;
export function romAddress(int: boolean, op: number, f3: number, cond: boolean, step: number): number {
  return ((int ? 1 : 0) << 12) | (op << 8) | (f3 << 5) | ((cond ? 1 : 0) << 4) | step;
}
