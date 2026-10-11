// Kapı seviyesi bilgisayar: saat kartı + CPU kartı + test bellek kartı, kütüphanedeki çiplerden
// kurulur ve LogicSim'de saat saat çalışır (test düzeneği yalnızca osilatörü ve butonları sürer). Testler bunu saat döngüsü modeliyle (datapath) her döngüde,
// emülatörle de program sonunda karşılaştırır.

import { L0, L1, LogicSim, type Level } from "../chips/logic.ts";
import type { MemoryHandle } from "../chips/parts/memory.ts";
import { aluRomImages } from "./alu-rom.ts";
import { Board, type ChipInstance } from "./board.ts";
import { buildClockCard, type ClockCard } from "./clock-card.ts";
import { buildCpuCard, type CpuCard } from "./cpu-card.ts";
import { buildTestMemCard, type TestMemCard } from "./test-mem-card.ts";

export interface GateState {
  pc: number;
  regs: number[];
  n: boolean;
  z: boolean;
  c: boolean;
  v: boolean;
  i: boolean;
  step: number;
  ir: number;
  ta: number;
  tb: number;
  mar: number;
  halted: boolean;
  fault: boolean;
}

/** Kartları kurar (simülasyon olmadan): şema, BOM ve 3D görünüm de bunu kullanır */
export function buildComputerBoard() {
  const board = new Board();
  const cpu = buildCpuCard(board);
  const mem = buildTestMemCard(board);
  const clock = buildClockCard(board);
  board.finish();
  return { board, cpu, mem, clock };
}

export class GateComputer {
  readonly board: Board;
  readonly cpu: CpuCard;
  readonly mem: TestMemCard;
  readonly clock: ClockCard;
  readonly sim: LogicSim;
  output = "";
  onOutput?: (ch: string) => void;
  cycles = 0;
  private readonly net: (name: string) => number;
  private uartCp: Level = L1;

  constructor(microcode: Uint32Array) {
    const { board, cpu, mem, clock } = buildComputerBoard();
    this.board = board;
    this.cpu = cpu;
    this.mem = mem;
    this.clock = clock;
    this.net = (name) => {
      if (!board.has(name)) throw new Error(`Böyle bir net yok: ${name}`);
      return board.n(name);
    };
    // ROM'lar ve RAM simülasyon kurulmadan önce doldurulur (programlayıcıyla yazılmış gibi)
    cpu.microcode.forEach((ci, k) => {
      const h = ci.handle as MemoryHandle;
      for (let a = 0; a < microcode.length; a++) h.data[a] = (microcode[a] >>> (8 * k)) & 0xff;
    });
    aluRomImages().forEach((img, k) => (cpu.aluRom[k].handle as MemoryHandle).data.set(img));
    this.sim = new LogicSim(board.c);
    for (const p of board.pulls) this.sim.pull(p.net, p.level);
    // saat kartı: kristal, OTOMATİK kip, butonlar bırakılmış
    for (const [name, v] of [["OSC_XTAL", 0], ["SLOW_SEL", 0], ["SLOW_RC", 0], ["AUTO", 1], ["STEP_RC", 1]] as const) this.sim.drive(this.net(name), v === 1);
    this.sim.settle();
    this.reset();
  }

  /** Programı RAM'e yükle (çift adresler çift çipe, tek adresler tek çipe) */
  load(image: Uint8Array, origin = 0): void {
    const even = (this.mem.ramEven.handle as MemoryHandle).data;
    const odd = (this.mem.ramOdd.handle as MemoryHandle).data;
    for (let i = 0; i < image.length && origin + i < 0x10000; i++) {
      const a = origin + i;
      (a & 1 ? odd : even)[a >> 1] = image[i];
    }
  }

  read8(addr: number): number {
    const h = (addr & 1 ? this.mem.ramOdd : this.mem.ramEven).handle as MemoryHandle;
    return h.data[(addr & 0xffff) >> 1];
  }

  write8(addr: number, v: number): void {
    const h = (addr & 1 ? this.mem.ramOdd : this.mem.ramEven).handle as MemoryHandle;
    h.data[(addr & 0xffff) >> 1] = v & 0xff;
  }

  /** RESET butonu; register'lar (gerçekte rastgele) testler için 0'lanır */
  reset(): void {
    const s = this.sim;
    s.drive(this.net("IRQ"), false);
    s.set(this.net("OSC_XTAL"), false);
    s.set(this.net("RST_RC"), false);
    for (const r of this.cpu.regs) for (const ci of r) this.fill(ci, 0, 8);
    for (const grp of [this.cpu.ir, this.cpu.ta, this.cpu.tb, this.cpu.mar]) grp.forEach((ci) => this.fill(ci, 0, 8));
    s.settle();
    s.set(this.net("RST_RC"), true);
    this.uartCp = s.get(this.net("UART_CP"));
  }

  /** Osilatörün n periyodu (yükselen + düşen kenar) */
  osc(n: number): void {
    const s = this.sim;
    const osc = this.net("OSC_XTAL");
    for (let k = 0; k < n; k++) {
      s.set(osc, true);
      this.watchUart();
      s.set(osc, false);
    }
  }

  /** Saat kartındaki anahtar ve butonlar (adım kipi testleri için) */
  setAuto(on: boolean): void {
    this.sim.set(this.net("AUTO"), on);
  }

  stepButton(pressed: boolean): void {
    this.sim.set(this.net("STEP_RC"), !pressed);
  }

  /** Bir çipin içindeki flip-flopların kapı indeksleri (sırasıyla) */
  dffs(ci: ChipInstance): number[] {
    const out: number[] = [];
    for (let g = ci.gates[0]; g < ci.gates[1]; g++) {
      const k = this.board.c.gates[g].kind;
      if (k === "DFF" || k === "LATCH") out.push(g);
    }
    return out;
  }

  private fill(ci: ChipInstance, value: number, bits: number, shift = 0): void {
    const ff = this.dffs(ci);
    for (let i = 0; i < bits; i++) this.sim.setState(ff[i], ((value >> (i + shift)) & 1) as Level);
  }

  private bits(ci: ChipInstance, n: number): number {
    const ff = this.dffs(ci);
    let v = 0;
    for (let i = 0; i < n; i++) {
      const l = this.sim.stateOf(ff[i]);
      if (l !== L0 && l !== L1) return NaN;
      v |= l << i;
    }
    return v;
  }

  private bus(prefix: string, n: number, start = 0): number {
    let v = 0;
    for (let i = 0; i < n; i++) {
      const l = this.sim.get(this.net(`${prefix}${i + start}`));
      if (l !== L0 && l !== L1) return NaN;
      v |= l << i;
    }
    return v;
  }

  private flag(name: string): boolean {
    return this.sim.get(this.net(name)) === L1;
  }

  /** Testlerin başlangıç durumunu doğrudan yazar (register, PC, bayraklar) */
  setState(st: Partial<Pick<GateState, "pc" | "regs" | "n" | "z" | "c" | "v" | "i">>): void {
    if (st.regs) st.regs.forEach((v, r) => {
      this.fill(this.cpu.regs[r][0], v, 8);
      this.fill(this.cpu.regs[r][1], v, 8, 8);
    });
    if (st.pc !== undefined) {
      const half = st.pc >> 1;
      this.cpu.pc.forEach((ci, k) => this.fill(ci, half, 4, 4 * k));
    }
    const ff = (ci: ChipInstance, unit: number, v?: boolean) => {
      if (v !== undefined) this.sim.setState(this.dffs(ci)[unit], v ? L1 : L0);
    };
    ff(this.cpu.flags.nz, 0, st.n);
    ff(this.cpu.flags.nz, 1, st.z);
    ff(this.cpu.flags.cv, 0, st.c);
    ff(this.cpu.flags.cv, 1, st.v);
    ff(this.cpu.flags.i, 0, st.i);
    this.sim.settle();
  }

  set irq(v: boolean) {
    this.sim.set(this.net("IRQ"), v);
  }

  /**
   * Bir CPU saat döngüsü = osilatörün 8 periyodu (saat kartındaki Johnson sayacı): düşen kenar
   * (kontrol register'ı mikrokodu örnekler), yazma penceresi (bellek/G-Ç yazma darbesi),
   * yükselen kenar (bütün durum register'ları).
   */
  cycle(): void {
    this.osc(8);
    this.cycles++;
  }

  private watchUart(): void {
    const cp = this.sim.get(this.net("UART_CP"));
    if (this.uartCp === L0 && cp === L1) {
      const ch = String.fromCharCode(this.bus("TX", 8));
      this.output += ch;
      this.onOutput?.(ch);
    }
    this.uartCp = cp;
  }

  get state(): GateState {
    return {
      pc: this.bus("PC", 15, 1) * 2,
      regs: this.cpu.regs.map((r) => this.bits(r[0], 8) | (this.bits(r[1], 8) << 8)),
      n: this.flag("NFLAG"),
      z: this.flag("ZFLAG"),
      c: this.flag("CFLAG"),
      v: this.flag("VFLAG"),
      i: this.flag("IFLAG"),
      step: this.bus("STEP", 4),
      ir: this.bus("IR", 16),
      ta: this.bus("TA", 16),
      tb: this.bus("TB", 16),
      mar: this.bus("A", 16),
      halted: this.flag("HALTED") || this.flag("FAULT"),
      fault: this.flag("FAULT"),
    };
  }
}
