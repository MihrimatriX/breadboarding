// CPU16 saat döngüsü modeli: veriyolu, register dosyası, ALU, PC, MAR, IR ve bayraklar.
// Ne yapacağını bilmez; her saat döngüsünde mikrokod ROM'undan kontrol kelimesini okur ve uygular.
// Bu yüzden emülatörle lockstep karşılaştırma, mikrokodun kendisini doğrular.

import type { Bus } from "../emu/cpu.ts";
import { FLAG_C, FLAG_I, FLAG_N, FLAG_V, FLAG_Z, sext } from "../emu/isa.ts";
import { ALUOP, BUS, IMM, RSEL, decodeControl, romAddress, type Control } from "./control.ts";

export interface AluResult {
  out: number;
  n: boolean;
  z: boolean;
  c: boolean;
  v: boolean;
  /** Bu işlemin güncellediği bayraklar (FLAGS_L sadece bunları yazar) */
  sets: { c: boolean; v: boolean };
}

/** 16 bit ALU. Donanımdaki gibi tek toplayıcı + mantık kapıları + kaydırıcı + çıkış seçici. */
export function alu(op: number, a: number, b: number, carry: boolean, h: boolean): AluResult {
  let out = 0;
  let c = carry;
  let v = false;
  let setsC = false;
  let setsV = false;
  const adder = (x: number, y: number, cin: number) => {
    const sum = x + y + cin;
    out = sum & 0xffff;
    c = sum > 0xffff;
    v = ((x ^ out) & (y ^ out) & 0x8000) !== 0;
    setsC = setsV = true;
  };
  switch (op) {
    case ALUOP.ADD: adder(a, b, 0); break;
    case ALUOP.ADC: adder(a, b, carry ? 1 : 0); break;
    case ALUOP.SUB:
    case ALUOP.CMP: adder(a, ~b & 0xffff, 1); break;
    case ALUOP.SBC: adder(a, ~b & 0xffff, carry ? 1 : 0); break;
    case ALUOP.NEG: adder(0, ~a & 0xffff, 1); break;
    case ALUOP.AND: out = a & b; break;
    case ALUOP.OR: out = a | b; break;
    case ALUOP.XOR: out = a ^ b; break;
    case ALUOP.MOV: out = a; break;
    case ALUOP.NOT: out = ~a & 0xffff; break;
    case ALUOP.SXB: out = sext(a & 0xff, 8) & 0xffff; break;
    case ALUOP.MERGE: out = (h ? a & 0x00ff : 0) | b; break;
    default: {
      // kaydırıcı: 1 bit, çıkan bit C'ye, V = 0
      const cin = carry ? 1 : 0;
      if (op === ALUOP.SHL) { out = (a << 1) & 0xffff; c = (a & 0x8000) !== 0; }
      else if (op === ALUOP.ROL) { out = ((a << 1) | cin) & 0xffff; c = (a & 0x8000) !== 0; }
      else if (op === ALUOP.SHR) { out = a >>> 1; c = (a & 1) !== 0; }
      else if (op === ALUOP.SAR) { out = (a >>> 1) | (a & 0x8000); c = (a & 1) !== 0; }
      else if (op === ALUOP.ROR) { out = (a >>> 1) | (cin << 15); c = (a & 1) !== 0; }
      else return { out: 0, n: false, z: true, c: carry, v: false, sets: { c: false, v: false } };
      v = false;
      setsC = setsV = true;
    }
  }
  return { out, n: (out & 0x8000) !== 0, z: out === 0, c, v, sets: { c: setsC, v: setsV } };
}

/**
 * Koşul birimi: cond[3:1] 8 girişli seçiciyi (74HC151) sürer, cond[0] sonucu tersler (74HC86).
 * Çift 7 = "her zaman": 14 = AL, 15 = NV (asla).
 */
export function condition(cond: number, n: boolean, z: boolean, c: boolean, v: boolean): boolean {
  const base = [z, c, n, v, c && !z, n === v, !z && n === v, true][cond >> 1];
  return cond & 1 ? !base : base;
}

export class Datapath {
  readonly regs = new Uint16Array(8);
  pc = 0;
  ta = 0;
  tb = 0;
  mar = 0;
  ir = 0;
  n = false;
  z = false;
  c = false;
  v = false;
  i = false;
  step = 0;
  /** Adım 0'da örneklenen kesme isteği; rutin bitene kadar sabit kalır */
  intLatch = false;
  halted = false;
  illegal = false;
  illegalAt: number | null = null;
  irq = false;
  cycles = 0;
  instructions = 0;
  /** Son saat döngüsünün kontrol kelimesi ve veriyolu değeri (görselleştirme için) */
  last: { control: Control; bus: number; address: number } | null = null;

  readonly rom: Uint32Array;
  readonly mem: Bus;

  constructor(rom: Uint32Array, mem: Bus) {
    this.rom = rom;
    this.mem = mem;
  }

  get flags(): number {
    return (this.v ? FLAG_V : 0) | (this.c ? FLAG_C : 0) | (this.z ? FLAG_Z : 0) | (this.n ? FLAG_N : 0) | (this.i ? FLAG_I : 0);
  }

  private regIndex(rsel: number): number {
    switch (rsel) {
      case RSEL.RD: return (this.ir >> 9) & 7;
      case RSEL.RS1: return (this.ir >> 6) & 7;
      case RSEL.RS2: return (this.ir >> 3) & 7;
      case RSEL.SP: return 6;
      default: return 7;
    }
  }

  private immediate(sel: number): number {
    const ir = this.ir;
    switch (sel) {
      case IMM.IMM6: return sext(ir & 0x3f, 6) & 0xffff;
      case IMM.IMM6X2: return (sext(ir & 0x3f, 6) * 2) & 0xffff;
      case IMM.IMM8: return (ir >> 8) & 1 ? (ir & 0xff) << 8 : ir & 0xff;
      case IMM.IMM9: return sext(ir & 0x1ff, 9) & 0xffff;
      case IMM.OFF8X2: return (sext(ir & 0xff, 8) * 2) & 0xffff;
      case IMM.OFF12X2: return (sext(ir & 0xfff, 12) * 2) & 0xffff;
      case IMM.C2: return 2;
      default: return 4;
    }
  }

  private readMem(addr: number, byte: boolean): number {
    if (byte) return this.mem.read8(addr & 0xffff);
    const a = addr & 0xfffe;
    return this.mem.read8(a) | (this.mem.read8((a + 1) & 0xffff) << 8);
  }

  /** Bir saat döngüsü. Bir komut bittiyse true döner. */
  clock(): boolean {
    if (this.halted) {
      if (this.illegal || !(this.irq && this.i)) return false;
      this.halted = false; // HALT, kesmeyle uyanır
    }
    if (this.step === 0) this.intLatch = this.irq && this.i;

    const ir = this.ir;
    const op = (ir >> 12) & 15;
    const f3 = ir & 7;
    const cond = condition((ir >> 8) & 15, this.n, this.z, this.c, this.v);
    const address = romAddress(this.intLatch, op, f3, cond, this.step);
    const k = decodeControl(this.rom[address]);
    const s = k.sig;

    // ---- kombinasyonel kısım: veriyolu ve ALU (eski durumdan)
    const aluOp = k.aluIr ? ((op & 1) << 3) | f3 : k.aluOp;
    const r = alu(aluOp, this.ta, this.tb, this.c, ((ir >> 8) & 1) === 1);
    const ri = this.regIndex(k.rsel);
    const byte = s.has("BYTE");
    let bus = 0;
    switch (k.bus) {
      case BUS.REG: bus = this.regs[ri]; break;
      case BUS.ALU: bus = r.out; break;
      case BUS.PC: bus = this.pc; break;
      case BUS.MEM: bus = this.readMem(this.mar, byte); break;
      case BUS.IMM: bus = this.immediate(k.imm); break;
      case BUS.FLAGS: bus = this.flags; break;
      case BUS.NONE: bus = 0; break;
    }
    this.last = { control: k, bus, address };

    // ---- saat kenarı: yüklemeler
    const pcBefore = this.pc;
    if (s.has("REG_W")) this.regs[ri] = bus;
    if (s.has("TA_L")) this.ta = bus;
    if (s.has("TB_L")) this.tb = bus;
    if (s.has("MAR_L")) this.mar = bus;
    if (s.has("IR_L")) this.ir = bus;
    if (s.has("PC_L")) this.pc = bus & 0xfffe;
    if (s.has("PC_INC")) this.pc = (pcBefore + 2) & 0xffff;
    if (s.has("MEM_W")) {
      if (byte) this.mem.write8(this.mar, bus & 0xff);
      else {
        const a = this.mar & 0xfffe;
        this.mem.write8(a, bus & 0xff);
        this.mem.write8((a + 1) & 0xffff, (bus >> 8) & 0xff);
      }
    }
    if (s.has("FLAGS_BUS_L")) {
      this.v = (bus & FLAG_V) !== 0;
      this.c = (bus & FLAG_C) !== 0;
      this.z = (bus & FLAG_Z) !== 0;
      this.n = (bus & FLAG_N) !== 0;
      this.i = (bus & FLAG_I) !== 0;
    }
    if (s.has("FLAGS_L")) {
      this.n = r.n;
      this.z = r.z;
      if (r.sets.c) this.c = r.c;
      if (r.sets.v) this.v = r.v;
    }
    if (s.has("I_SET")) this.i = true;
    if (s.has("I_CLR")) this.i = false;
    if (s.has("ILLEGAL")) {
      this.illegal = true;
      this.halted = true;
      this.illegalAt = (this.pc - 2) & 0xffff;
    }
    if (s.has("HALT")) this.halted = true;
    this.cycles++;

    if (s.has("END")) {
      const wasIrq = this.intLatch;
      this.step = 0;
      this.intLatch = false;
      if (!wasIrq) {
        this.instructions++;
        return true;
      }
      return false;
    }
    this.step++;
    if (this.step > 15) throw new Error(`Mikrokod END olmadan 16 adımı aştı (adres 0x${address.toString(16)})`);
    return false;
  }

  /** Bir komut bitene (ya da işlemci durana) kadar saat ver. */
  stepInstruction(maxCycles = 64): "ok" | "halted" | "illegal" {
    for (let n = 0; n < maxCycles; n++) {
      const wasHalted = this.halted;
      const done = this.clock();
      if (this.illegal) return "illegal";
      if (done) return this.halted ? "halted" : "ok";
      if (wasHalted && this.halted) return "halted";
    }
    throw new Error("Komut çok uzun sürdü");
  }
}
