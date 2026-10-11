// CPU16 referans emülatörü (altın model).
// Komut seviyesinde çalışır: her step() bir komutu bitirir. Sonraki bütün katmanlar
// (mikrokod modeli, kapı seviyesi kart, gerçek kart) bu sınıfla lockstep karşılaştırılır.

import {
  OP, f, sext, REG_SP, REG_LR, VEC_IRQ, VEC_SWI, IO_UART_DATA,
  FLAG_C, FLAG_I, FLAG_N, FLAG_V, FLAG_Z,
} from "./isa.ts";

export interface Bus {
  read8(addr: number): number;
  write8(addr: number, value: number): void;
}

/** Faz 1 veriyolu: düz 64 KB RAM + 0xFF00'da konsol (UART TX yerine). */
export class SimpleBus implements Bus {
  readonly mem = new Uint8Array(0x10000);
  output = "";
  onOutput?: (ch: string) => void;

  read8(addr: number): number {
    return this.mem[addr & 0xffff];
  }

  write8(addr: number, value: number): void {
    addr &= 0xffff;
    if (addr === IO_UART_DATA) {
      const ch = String.fromCharCode(value & 0xff);
      this.output += ch;
      this.onOutput?.(ch);
      return;
    }
    this.mem[addr] = value & 0xff;
  }

  load(image: Uint8Array, origin = 0): void {
    this.mem.set(image.subarray(0, 0x10000 - origin), origin);
  }
}

export type StepResult = "ok" | "halted" | "illegal";

export interface CpuState {
  pc: number;
  regs: number[];
  n: boolean;
  z: boolean;
  c: boolean;
  v: boolean;
  i: boolean;
  halted: boolean;
}

export class Cpu16 {
  readonly regs = new Uint16Array(8);
  pc = 0;
  n = false;
  z = false;
  c = false;
  v = false;
  i = false;
  halted = false;
  /** Seviye tetiklemeli kesme hattı; cihaz kendi register'ı okununca bırakır. */
  irq = false;
  /** Son yasadışı komutun adresi (hata ayıklama için). */
  illegalAt: number | null = null;
  instructions = 0;
  readonly bus: Bus;

  constructor(bus: Bus) {
    this.bus = bus;
  }

  reset(): void {
    this.regs.fill(0);
    this.pc = 0;
    this.n = this.z = this.c = this.v = this.i = false;
    this.halted = false;
    this.illegalAt = null;
    this.instructions = 0;
  }

  // ---- bellek ----
  read16(addr: number): number {
    addr &= 0xfffe; // bit 0 yok sayılır (spec: hizalı kelime erişimi)
    return this.bus.read8(addr) | (this.bus.read8((addr + 1) & 0xffff) << 8);
  }

  write16(addr: number, value: number): void {
    addr &= 0xfffe;
    this.bus.write8(addr, value & 0xff);
    this.bus.write8((addr + 1) & 0xffff, (value >> 8) & 0xff);
  }

  // ---- bayraklar ----
  get flags(): number {
    return (this.v ? FLAG_V : 0) | (this.c ? FLAG_C : 0) | (this.z ? FLAG_Z : 0) |
      (this.n ? FLAG_N : 0) | (this.i ? FLAG_I : 0);
  }

  set flags(value: number) {
    this.v = (value & FLAG_V) !== 0;
    this.c = (value & FLAG_C) !== 0;
    this.z = (value & FLAG_Z) !== 0;
    this.n = (value & FLAG_N) !== 0;
    this.i = (value & FLAG_I) !== 0;
  }

  private setNZ(r: number): void {
    this.n = (r & 0x8000) !== 0;
    this.z = (r & 0xffff) === 0;
  }

  /** a + b + carryIn, NZCV günceller. */
  private add(a: number, b: number, carryIn: number): number {
    const sum = a + b + carryIn;
    const r = sum & 0xffff;
    this.setNZ(r);
    this.c = sum > 0xffff;
    this.v = ((a ^ r) & (b ^ r) & 0x8000) !== 0;
    return r;
  }

  /** a - b - (1 - carryIn); C = borç yok (ARM tarzı). */
  private sub(a: number, b: number, carryIn: number): number {
    return this.add(a, ~b & 0xffff, carryIn);
  }

  private condition(cond: number): boolean {
    switch (cond) {
      case 0: return this.z;
      case 1: return !this.z;
      case 2: return this.c;
      case 3: return !this.c;
      case 4: return this.n;
      case 5: return !this.n;
      case 6: return this.v;
      case 7: return !this.v;
      case 8: return this.c && !this.z;
      case 9: return !this.c || this.z;
      case 10: return this.n === this.v;
      case 11: return this.n !== this.v;
      case 12: return !this.z && this.n === this.v;
      case 13: return this.z || this.n !== this.v;
      case 14: return true;
      default: return false; // 15 = NV (asla); koşul biriminin doğal çıkışı
    }
  }

  private push(value: number): void {
    this.regs[REG_SP] = (this.regs[REG_SP] - 2) & 0xffff;
    this.write16(this.regs[REG_SP], value);
  }

  private pop(): number {
    const value = this.read16(this.regs[REG_SP]);
    this.regs[REG_SP] = (this.regs[REG_SP] + 2) & 0xffff;
    return value;
  }

  /** Kesmeye gir: PC ve bayrakları yığına at, I=0, vektöre atla. */
  private enterInterrupt(vector: number): void {
    this.push(this.pc);
    this.push(this.flags);
    this.i = false;
    this.pc = vector;
  }

  private illegal(addr: number): StepResult {
    this.illegalAt = addr;
    this.halted = true;
    return "illegal";
  }

  step(): StepResult {
    if (this.irq && this.i) {
      this.halted = false; // HALT, kesmeyle uyanır
      this.enterInterrupt(VEC_IRQ);
    }
    if (this.halted) return "halted";

    const at = this.pc;
    const w = this.read16(at);
    this.pc = (at + 2) & 0xffff;
    this.instructions++;
    const r = this.regs;
    const rd = f.rd(w);
    const rs1 = f.rs1(w);
    const rs2 = f.rs2(w);
    const f3 = f.f3(w);

    switch (f.op(w)) {
      case OP.ALU: {
        const a = r[rs1];
        const b = r[rs2];
        let out: number;
        switch (f3) {
          case 0: out = this.add(a, b, 0); break;
          case 1: out = this.add(a, b, this.c ? 1 : 0); break;
          case 2: out = this.sub(a, b, 1); break;
          case 3: out = this.sub(a, b, this.c ? 1 : 0); break;
          case 4: out = a & b; this.setNZ(out); break;
          case 5: out = a | b; this.setNZ(out); break;
          case 6: out = a ^ b; this.setNZ(out); break;
          default: this.sub(a, b, 1); return "ok"; // CMP: sonuç yazılmaz
        }
        r[rd] = out;
        return "ok";
      }
      case OP.ALU2: {
        const a = r[rs1];
        let out: number;
        switch (f3) {
          case 0: out = a; this.setNZ(out); break;
          case 1: out = ~a & 0xffff; this.setNZ(out); break;
          case 2: out = this.sub(0, a, 1); break;
          case 3: out = (a << 1) & 0xffff; this.c = (a & 0x8000) !== 0; this.v = false; this.setNZ(out); break;
          case 4: out = a >>> 1; this.c = (a & 1) !== 0; this.v = false; this.setNZ(out); break;
          case 5: out = (a >>> 1) | (a & 0x8000); this.c = (a & 1) !== 0; this.v = false; this.setNZ(out); break;
          case 6: out = ((a << 1) | (this.c ? 1 : 0)) & 0xffff; this.c = (a & 0x8000) !== 0; this.v = false; this.setNZ(out); break;
          default: out = (a >>> 1) | (this.c ? 0x8000 : 0); this.c = (a & 1) !== 0; this.v = false; this.setNZ(out); break;
        }
        r[rd] = out;
        return "ok";
      }
      case OP.ADDI:
        r[rd] = this.add(r[rs1], f.imm6(w) & 0xffff, 0);
        return "ok";
      case OP.LI:
        if (f.h(w)) r[rd] = (r[rd] & 0x00ff) | (f.imm8(w) << 8);
        else r[rd] = f.imm8(w);
        return "ok";
      case OP.LW:
        r[rd] = this.read16(r[rs1] + f.imm6(w) * 2);
        return "ok";
      case OP.SW:
        this.write16(r[rs1] + f.imm6(w) * 2, r[rd]); // S formatında rs2, rd alanında
        return "ok";
      case OP.LBU:
        r[rd] = this.bus.read8((r[rs1] + f.imm6(w)) & 0xffff);
        return "ok";
      case OP.SB:
        this.bus.write8((r[rs1] + f.imm6(w)) & 0xffff, r[rd] & 0xff);
        return "ok";
      case OP.BCC: {
        if (this.condition(f.cond(w))) this.pc = (this.pc + f.off8(w) * 2) & 0xffff;
        return "ok";
      }
      case OP.JAL:
        r[REG_LR] = this.pc;
        this.pc = (this.pc + f.off12(w) * 2) & 0xffff;
        return "ok";
      case OP.JALR: {
        const target = (r[rs1] + f.imm6(w) * 2) & 0xfffe;
        r[rd] = this.pc;
        this.pc = target;
        return "ok";
      }
      case OP.CMPI: {
        const a = r[(w >> 9) & 0x7];
        this.sub(a, f.imm9(w) & 0xffff, 1);
        return "ok";
      }
      case OP.STACK:
        if (f3 === 0) this.push(r[rs1]);
        else if (f3 === 1) r[rd] = this.pop();
        else return this.illegal(at);
        return "ok";
      case OP.SYS:
        switch (f3) {
          case 0: return "ok";
          case 1: this.halted = true; return "halted";
          case 2: this.i = true; return "ok";
          case 3: this.i = false; return "ok";
          case 4: this.flags = this.pop(); this.pc = this.pop() & 0xfffe; return "ok";
          case 5: this.enterInterrupt(VEC_SWI); return "ok";
          case 6: r[rd] = sext(r[rs1] & 0xff, 8) & 0xffff; this.setNZ(r[rd]); return "ok";
          default: return this.illegal(at);
        }
      default:
        return this.illegal(at);
    }
  }

  /** HALT'a, yasadışı komuta ya da adım sınırına kadar çalıştırır. */
  run(maxSteps = 1_000_000): StepResult {
    for (let s = 0; s < maxSteps; s++) {
      const res = this.step();
      if (res !== "ok") return res;
    }
    return "ok";
  }

  snapshot(): CpuState {
    return {
      pc: this.pc, regs: Array.from(this.regs),
      n: this.n, z: this.z, c: this.c, v: this.v, i: this.i, halted: this.halted,
    };
  }
}
