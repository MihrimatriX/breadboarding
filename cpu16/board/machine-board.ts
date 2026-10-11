// Kapı seviyesi anakart (Faz 6): CPU + saat + bellek + önbellek kartları, kütüphanedeki çiplerden
// kurulur ve LogicSim'de osilatör periyodu periyodu çalışır. G/Ç ve video kartları ek kart
// kurucusu olarak takılır (buildMachineBoard({ cards: [buildIoCard, buildVideoCard] })).
// Testler bunu emülatördeki Machine ile komut komut karşılaştırır (cpu16/tests/anakart-bellek.test.ts).

import { L0, L1, LogicSim, type Level } from "../chips/logic.ts";
import type { EepromHandle, MemoryHandle } from "../chips/parts/memory.ts";
import type { At28c256 } from "../emu/devices/eeprom.ts";
import { CYCLE_NS, RAM_BASE, RAM_SIZE, RESET_BANKS } from "../emu/machine.ts";
import { aluRomImages } from "./alu-rom.ts";
import { Board, type ChipInstance } from "./board.ts";
import { buildCacheCard, type CacheCard } from "./cache-card.ts";
import { buildClockCard, type ClockCard } from "./clock-card.ts";
import type { GateState } from "./computer.ts";
import { buildCpuCard, type CpuCard } from "./cpu-card.ts";
import { buildIoCard, ioCardYanlisYollar } from "./io-card.ts";
import { buildKybCard } from "./kyb-card.ts";
import { buildMemCard, type MemCard } from "./mem-card.ts";
import { buildVideoCard } from "./video-card.ts";
import { veriyoluGirisleri, zamanlamaAnalizi, type KapaliYay, type Kose, type SaatKoku } from "./zamanlama.ts";

/** Ek kart kurucusu (ör. G/Ç kartı, video kartı): aynı Board'a kendi kartını ekler */
export type CardBuilder = (b: Board) => unknown;

export interface MachineBoardOptions {
  /** Ek kartlar, takılma sırasıyla */
  cards?: CardBuilder[];
}

/** Anakartı kurar (simülasyon olmadan): şema, BOM ve KiCad dosyaları da bunu kullanır */
export function buildMachineBoard(o: MachineBoardOptions = {}) {
  const board = new Board();
  const cpu = buildCpuCard(board);
  const clock = buildClockCard(board);
  const mem = buildMemCard(board);
  const cache = buildCacheCard(board);
  const extras = (o.cards ?? []).map((build) => build(board));
  board.finish();
  return { board, cpu, clock, mem, cache, extras };
}

/**
 * Bütün anakart: CPU, saat, bellek, önbellek, G/Ç, video ve kendin yap bellek (eğitim kartı, FF40–FF4F)
 * kartları (şema, BOM, KiCad, zamanlama)
 */
export function buildFullMachineBoard() {
  return buildMachineBoard({ cards: [buildIoCard, buildVideoCard, buildKybCard] });
}

/** Anakartın saat kökleri (zamanlama analizi) */
export const ANAKART_SAATLERI: SaatKoku[] = [
  { net: "CLK", ad: "CPU saati" },
  { net: "OSC", ad: "osilatör (CPU × 8)" },
  { net: "TCLK", ad: "TCLK (bekleme turları dahil CPU zamanı)" },
  { net: "PS2_CLK", ad: "PS/2 saati (klavye, ≤ 16,7 kHz)" },
  { net: "VID_OSC", ad: "piksel saati (25,175 MHz)" },
  { net: "V_H2", ad: "karakter saati (piksel / 8)" },
];

/** Anakartta mantıksal olarak duyarsız yollar (bkz. zamanlama.ts KapaliYay) */
export function anakartYanlisYollar(b: Board): KapaliYay[] {
  return [...ioCardYanlisYollar(b), veriyoluGirisleri(b, ["gc", "video"])];
}

/** Bütün anakartın statik zamanlama analizi */
export function anakartZamanlamasi(kose: Kose = "maks") {
  const { board } = buildFullMachineBoard();
  return zamanlamaAnalizi(board, { kokler: ANAKART_SAATLERI, kose, kapali: anakartYanlisYollar(board) });
}

/** Reset sırasında osilatör periyodu: önbellek etiket temizleme sayacı 1024 satırı dolaşmalı */
export const RESET_OSC_PERIODS = 1100;

/** Bir çipin içindeki flip-flopların kapı indeksleri (sırasıyla) */
export function chipDffs(board: Board, ci: ChipInstance): number[] {
  const out: number[] = [];
  for (let g = ci.gates[0]; g < ci.gates[1]; g++) {
    const k = board.c.gates[g].kind;
    if (k === "DFF" || k === "LATCH") out.push(g);
  }
  return out;
}

/** Bellek/önbellek kartlarının durumu, emülatördeki biçimde (Machine.banks, Cache) */
export interface MemoryState {
  /** EEPROM içeriği ya da içerik + iç durum (Machine.flash) */
  flash: Uint8Array | At28c256;
  ram: Uint8Array;
  banks: ArrayLike<number>;
  cacheEnabled: boolean;
  hits: number;
  misses: number;
  /** satır etiketleri, -1 = geçersiz */
  tags: ArrayLike<number>;
  data: ArrayLike<number>;
}

/** Bellek ve önbellek kartlarının içini okur (test ve arayüz için) */
export class MemoryProbe {
  private readonly ffCache = new Map<ChipInstance, number[]>();
  readonly sim: LogicSim;
  readonly board: Board;
  readonly mem: MemCard;
  readonly cache: CacheCard;

  constructor(sim: LogicSim, board: Board, mem: MemCard, cache: CacheCard) {
    this.sim = sim;
    this.board = board;
    this.mem = mem;
    this.cache = cache;
  }

  private ffs(ci: ChipInstance): number[] {
    let ff = this.ffCache.get(ci);
    if (!ff) this.ffCache.set(ci, (ff = chipDffs(this.board, ci)));
    return ff;
  }

  /**
   * Kartların durumunu doğrudan yükler (yalnızca simülasyon: bir izin ortasından başlamak için).
   * EEPROM'un iç durumu (yazma döngüsü, koruma) da st.flash bir At28c256 ise kopyalanır.
   */
  load(st: MemoryState): void {
    if (st.flash instanceof Uint8Array) this.flash.set(st.flash);
    else this.eeprom.copyFrom(st.flash);
    this.ram.set(st.ram);
    const set = (ci: ChipInstance, from: number, n: number, v: number) => {
      const ff = this.ffs(ci);
      for (let i = 0; i < n; i++) this.sim.setState(ff[from + i], ((v >> i) & 1) as Level);
    };
    this.mem.banks.forEach((ci, k) => set(ci, 0, 6, st.banks[k] ^ RESET_BANKS[k]));
    set(this.cache.ctrl, 1, 1, st.cacheEnabled ? 1 : 0);
    this.cache.hits.forEach((ci, k) => set(ci, 0, 4, st.hits >> (4 * k)));
    this.cache.misses.forEach((ci, k) => set(ci, 0, 4, st.misses >> (4 * k)));
    const h = (ci: ChipInstance) => (ci.handle as MemoryHandle).data;
    for (let line = 0; line < 1024; line++) {
      const t = st.tags[line];
      h(this.cache.tagLo)[line] = t < 0 ? 0 : t & 0xff;
      h(this.cache.tagHi)[line] = t < 0 ? 0 : 2 | ((t >> 8) & 1);
      h(this.cache.dataEven)[line] = st.data[line] & 0xff;
      h(this.cache.dataOdd)[line] = st.data[line] >> 8;
    }
    this.sim.settle();
  }

  /** EEPROM çipinin modeli (içerik + yazma döngüsü / koruma durumu) */
  get eeprom(): At28c256 {
    return (this.mem.eeprom.handle as EepromHandle).core;
  }

  /** EEPROM içeriği (32 KB, fiziksel 0x00000'dan) */
  get flash(): Uint8Array {
    return (this.mem.eeprom.handle as EepromHandle).data;
  }

  /** RAM içeriği (128 KB, fiziksel 0x80000'den; dört 62256'nın tutamaçları bunun dilimleri) */
  get ram(): Uint8Array {
    return this.mem.ramData;
  }

  /** EEPROM'un gördüğü zaman (ns): yazma döngüsü bununla ölçülür */
  setClock(now: () => number): void {
    (this.mem.eeprom.handle as EepromHandle).now = now;
  }

  /** Fiziksel adresteki bayt (Machine.physRead gibi; boş bölge 0xFF) */
  physRead(phys: number): number {
    if (phys < this.flash.length) return this.flash[phys];
    if (phys >= RAM_BASE && phys < RAM_BASE + RAM_SIZE) return this.ram[phys - RAM_BASE];
    return 0xff;
  }

  private bits(ci: ChipInstance, from: number, n: number): number {
    const ff = this.ffs(ci);
    let v = 0;
    for (let i = 0; i < n; i++) {
      const l = this.sim.stateOf(ff[from + i]);
      if (l !== L0 && l !== L1) return NaN;
      v |= l << i;
    }
    return v;
  }

  /** Bank register'ları (reset değeri 1 olan bitler register'da ters saklanır) */
  get banks(): number[] {
    return this.mem.banks.map((ci, k) => this.bits(ci, 0, 6) ^ RESET_BANKS[k]);
  }

  get cacheEnabled(): boolean {
    return this.sim.stateOf(this.ffs(this.cache.ctrl)[1]) === L1;
  }

  /** 16 bit isabet / ıskalama sayaçları (4 × 74HC161) */
  get hits(): number {
    return this.cache.hits.reduce((v, ci, k) => v | (this.bits(ci, 0, 4) << (4 * k)), 0);
  }

  get misses(): number {
    return this.cache.misses.reduce((v, ci, k) => v | (this.bits(ci, 0, 4) << (4 * k)), 0);
  }

  /** Satırın etiketi (fiziksel adres >> 11), geçersizse -1 (Cache.tags ile aynı biçim) */
  tag(line: number): number {
    const lo = (this.cache.tagLo.handle as MemoryHandle).data[line];
    const hi = (this.cache.tagHi.handle as MemoryHandle).data[line];
    return hi & 2 ? lo | ((hi & 1) << 8) : -1;
  }

  /** Satırdaki kelime */
  data(line: number): number {
    return (this.cache.dataEven.handle as MemoryHandle).data[line] | ((this.cache.dataOdd.handle as MemoryHandle).data[line] << 8);
  }
}

/** Saat kartının girişlerini sür: kristal, OTOMATİK kip, butonlar bırakılmış, reset bırakılmış */
export function driveClockInputs(sim: LogicSim, net: (name: string) => number): void {
  for (const [name, v] of [["OSC_XTAL", 0], ["SLOW_SEL", 0], ["SLOW_RC", 0], ["AUTO", 1], ["STEP_RC", 1], ["RST_RC", 1]] as const) {
    sim.drive(net(name), v === 1);
  }
}

export class GateMachine {
  readonly board: Board;
  readonly cpu: CpuCard;
  readonly clock: ClockCard;
  readonly mem: MemCard;
  readonly cache: CacheCard;
  readonly extras: unknown[];
  readonly sim: LogicSim;
  readonly probe: MemoryProbe;
  /** CPU saat döngüsü (bekleme turları dahil) — Machine.cycles ile aynı ölçü */
  cycles = 0;
  /** Son komutun başladığı döngü: EEPROM'un saati (Machine erişimleri de komut başıyla damgalar) */
  instrStart = 0;
  /** Bekleme turları */
  waitCycles = 0;
  /** Test için UART çıkışı: 0xFF00'a yapılan çift bayt yazmaları (G/Ç kartı yokken) */
  output = "";
  onOutput?: (ch: string) => void;
  private readonly net: (name: string) => number;
  private readonly ownIrq: boolean;
  private lastWe: Level = L1;

  constructor(microcode: Uint32Array, o: MachineBoardOptions = {}) {
    const { board, cpu, clock, mem, cache, extras } = buildMachineBoard(o);
    this.board = board;
    this.cpu = cpu;
    this.clock = clock;
    this.mem = mem;
    this.cache = cache;
    this.extras = extras;
    this.net = (name) => {
      if (!board.has(name)) throw new Error(`Böyle bir net yok: ${name}`);
      return board.n(name);
    };
    cpu.microcode.forEach((ci, k) => {
      const h = ci.handle as MemoryHandle;
      for (let a = 0; a < microcode.length; a++) h.data[a] = (microcode[a] >>> (8 * k)) & 0xff;
    });
    aluRomImages().forEach((img, k) => (cpu.aluRom[k].handle as MemoryHandle).data.set(img));
    this.sim = new LogicSim(board.c);
    for (const p of board.pulls) this.sim.pull(p.net, p.level);
    this.probe = new MemoryProbe(this.sim, board, mem, cache);
    this.probe.setClock(() => this.instrStart * CYCLE_NS);
    // IRQ'yu süren bir kart (G/Ç kartı) takılı değilse düzenek 0'da tutar
    const driven = (net: number) => board.chips.some((ci) => ci.def.pins.some((p) => (p.dir === "out" || p.dir === "tri") && ci.nets[p.name] === net));
    this.ownIrq = !driven(board.n("IRQ"));
    // video kartı yokken G/Ç kartının vsync isteği 0
    if (board.has("VSYNC_REQ") && !driven(board.n("VSYNC_REQ"))) this.sim.drive(board.n("VSYNC_REQ"), false);
    driveClockInputs(this.sim, this.net);
    this.sim.settle();
    this.reset();
  }

  /** EEPROM'a imaj yükle (programlayıcıyla yazılmış gibi: yazılım koruması açık kalır) */
  loadFlash(image: Uint8Array, offset = 0): void {
    this.probe.eeprom.load(image, offset);
  }

  /** RAM'e doğrudan yükle (fiziksel adres) */
  loadPhys(image: Uint8Array, phys: number): void {
    for (let i = 0; i < image.length; i++) {
      const p = phys + i;
      if (p < this.probe.flash.length) this.probe.flash[p] = image[i];
      else if (p >= RAM_BASE && p < RAM_BASE + RAM_SIZE) this.probe.ram[p - RAM_BASE] = image[i];
    }
  }

  /** RESET butonu: ~RESET, önbellek temizlemesi için RESET_OSC_PERIODS boyunca düşük tutulur */
  reset(): void {
    const s = this.sim;
    if (this.ownIrq) s.drive(this.net("IRQ"), false);
    s.set(this.net("OSC_XTAL"), false);
    s.set(this.net("RST_RC"), false);
    // register'lar gerçekte rastgele; testler için 0
    for (const r of this.cpu.regs) for (const ci of r) this.fill(ci, 0, 8);
    for (const grp of [this.cpu.ir, this.cpu.ta, this.cpu.tb, this.cpu.mar]) grp.forEach((ci) => this.fill(ci, 0, 8));
    s.settle();
    this.osc(RESET_OSC_PERIODS);
    s.set(this.net("RST_RC"), true);
    this.lastWe = s.get(this.net("~MWE_E"));
  }

  set irq(v: boolean) {
    if (!this.ownIrq) throw new Error("IRQ'yu bir kart sürüyor");
    this.sim.set(this.net("IRQ"), v);
  }

  /** Osilatörün n periyodu */
  osc(n: number): void {
    const s = this.sim;
    const osc = this.net("OSC_XTAL");
    for (let k = 0; k < n; k++) {
      s.set(osc, true);
      this.watchUart();
      s.set(osc, false);
      this.watchUart();
    }
  }

  /**
   * Bir CPU adımı: CLK'nin bir sonraki yükselen kenarına kadar osilatörü çalıştırır. Beklemesiz
   * adım 8, her bekleme turu 8 periyot daha sürer. Geçen CPU saat döngüsü sayısını döndürür.
   */
  cycle(): number {
    const s = this.sim;
    const osc = this.net("OSC_XTAL");
    const clk = this.net("CLK");
    let periods = 0;
    for (;;) {
      const before = s.get(clk);
      s.set(osc, true);
      this.watchUart();
      const rose = before === L0 && s.get(clk) === L1;
      s.set(osc, false);
      this.watchUart();
      periods++;
      if (rose) break;
      if (periods > 8 * 64) throw new Error("CLK yükselmedi: ~WAIT bırakılmıyor");
    }
    if (periods % 8 !== 0) throw new Error(`CPU adımı ${periods} osilatör periyodu sürdü (8'in katı değil)`);
    const n = periods / 8;
    this.cycles += n;
    this.waitCycles += n - 1;
    return n;
  }

  /** Bir komut: adım sayacı 0'a dönene kadar CPU adımları (durmuş CPU'da bir adım) */
  step(): void {
    this.instrStart = this.cycles;
    do this.cycle();
    while (this.bus("STEP", 4) !== 0 && !this.flag("HALTED") && !this.flag("FAULT"));
  }

  private watchUart(): void {
    const we = this.sim.get(this.net("~MWE_E"));
    if (this.lastWe === L0 && we === L1 && this.bus("A", 16) === 0xff00) {
      const ch = String.fromCharCode(this.bus("DE", 8));
      this.output += ch;
      this.onOutput?.(ch);
    }
    this.lastWe = we;
  }

  private dffs(ci: ChipInstance): number[] {
    return chipDffs(this.board, ci);
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

  bus(prefix: string, n: number, start = 0): number {
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
