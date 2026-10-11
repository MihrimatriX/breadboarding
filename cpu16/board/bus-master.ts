// Veri yolu sürücüsü (bus-functional model): CPU kartı yerine arka paneli testten süren düzenek.
// Saat, bellek ve önbellek kartları gerçek (kapı seviyesi); A0..A15, ~MRD, DE/DO ve yazma istekleri
// CPU kartının zamanlamasıyla sürülür:
//   adres    R'de (CLK↑) değişir, adım boyunca sabit
//   okuma    F'de (CLK↓) ~MRD = 0, bir sonraki F'de 1
//   yazma    F'de DE/DO sürülür ve yazma isteği verilir; ~MWE_E/~MWE_O = NAND(istek, WR_WIN) (CPU
//            kartındaki kapının aynısı, düzenek kartında)
// Her veri yolu döngüsünden sonra bir boş adım gelir (mikrokodda iki veri yolu adımı art arda gelmez).
// Emülatörün veri yolu izi (Machine.onAccess) bununla kartlarda yeniden oynatılır.

import { L0, L1, LogicSim, type Level } from "../chips/logic.ts";
import { Board } from "./board.ts";
import { buildCacheCard, type CacheCard } from "./cache-card.ts";
import { buildClockCard } from "./clock-card.ts";
import { driveClockInputs, MemoryProbe, RESET_OSC_PERIODS } from "./machine-board.ts";
import { buildMemCard, type MemCard } from "./mem-card.ts";

/** Saat + bellek + önbellek kartları ve düzeneğin yazma darbesi kapıları */
export function buildMemoryBench() {
  const board = new Board();
  buildClockCard(board);
  const mem = buildMemCard(board);
  const cache = buildCacheCard(board);
  board.card = "bfm";
  board.block = "Test düzeneği";
  board.nand("WE_E_REQ", "WR_WIN", "~MWE_E", "çift bayt yazma darbesi (CPU kartındaki gibi)");
  board.nand("WE_O_REQ", "WR_WIN", "~MWE_O", "tek bayt yazma darbesi (CPU kartındaki gibi)");
  board.finish({ backplane: false });
  return { board, mem, cache };
}

/** Bir veri yolu döngüsü. Yazmada `lanes` hangi şeritlerin yazıldığını söyler. */
export interface BusOp {
  write: boolean;
  addr: number;
  /** word: iki şerit (DE = düşük, DO = yüksek bayt); even/odd: tek bayt yazma */
  lanes: "word" | "even" | "odd";
  /** yazılacak değer (word: 16 bit) */
  data?: number;
}

export interface BusResult {
  /** okumada CLK↑ anındaki DE ve DO (bilinmeyen bit varsa NaN) */
  de: number;
  do: number;
  /** bekleme turu sayısı */
  waits: number;
}

export class BusMaster {
  readonly board: Board;
  readonly mem: MemCard;
  readonly cache: CacheCard;
  readonly sim: LogicSim;
  readonly probe: MemoryProbe;
  /** toplam CPU saat döngüsü (boş adımlar dahil) */
  cycles = 0;
  private readonly osc: number;
  private readonly clk: number;
  private readonly a: number[];
  private readonly de: number[];
  private readonly dO: number[];

  constructor() {
    const { board, mem, cache } = buildMemoryBench();
    this.board = board;
    this.mem = mem;
    this.cache = cache;
    this.sim = new LogicSim(board.c);
    for (const p of board.pulls) this.sim.pull(p.net, p.level);
    this.probe = new MemoryProbe(this.sim, board, mem, cache);
    const net = (name: string) => board.n(name);
    driveClockInputs(this.sim, net);
    this.osc = net("OSC_XTAL");
    this.clk = net("CLK");
    this.a = board.bus("A", 16);
    this.de = board.bus("DE", 8);
    this.dO = board.bus("DO", 8);
    for (const n of this.a) this.sim.drive(n, false);
    this.sim.drive(net("~MRD"), true);
    this.sim.drive(net("WE_E_REQ"), false);
    this.sim.drive(net("WE_O_REQ"), false);
    this.sim.settle();
    this.reset();
  }

  /** RESET: ~RESET önbellek temizlemesi için yeterince uzun düşük */
  reset(): void {
    const s = this.sim;
    s.set(this.board.n("RST_RC"), false);
    for (let k = 0; k < RESET_OSC_PERIODS; k++) {
      s.set(this.osc, true);
      s.set(this.osc, false);
    }
    s.set(this.board.n("RST_RC"), true);
  }

  private read(nets: number[]): number {
    let v = 0;
    for (let i = 0; i < nets.length; i++) {
      const l = this.sim.get(nets[i]);
      if (l !== L0 && l !== L1) return NaN;
      v |= l << i;
    }
    return v;
  }

  private drive(nets: number[], v: number): void {
    nets.forEach((n, i) => this.sim.drive(n, ((v >> i) & 1) as Level));
  }

  /** Osilatörü CLK istenen seviyeye geçene kadar çalıştır; geçişte osilatör yüksekte bırakılır */
  private until(level: Level): number {
    const s = this.sim;
    let periods = 0;
    for (;;) {
      s.set(this.osc, true);
      periods++;
      if (s.get(this.clk) === level) return periods;
      s.set(this.osc, false);
      if (periods > 1000) throw new Error("CLK değişmiyor");
    }
  }

  /** Bir veri yolu döngüsü + bir boş adım. Başlangıçta ve sonda CLK yeni yükselmiştir (R). */
  access(op: BusOp): BusResult {
    const s = this.sim;
    const net = (name: string) => this.board.n(name);
    this.drive(this.a, op.addr);
    s.settle();
    // F: kontrol sinyalleri
    this.until(L0);
    if (op.write) {
      const d = op.data ?? 0;
      if (op.lanes === "word") {
        this.drive(this.de, d & 0xff);
        this.drive(this.dO, (d >> 8) & 0xff);
      } else this.drive(op.lanes === "even" ? this.de : this.dO, d & 0xff);
      s.drive(net("WE_E_REQ"), op.lanes !== "odd");
      s.drive(net("WE_O_REQ"), op.lanes !== "even");
    } else s.drive(net("~MRD"), false);
    s.settle();
    s.set(this.osc, false);
    // R'ye kadar: son örnek CLK düşükken alınır, R'den sonra da aynı kalmalı (tutma)
    let periods = 0;
    let de = NaN;
    let dO = NaN;
    for (;;) {
      if (!op.write) {
        de = this.read(this.de);
        dO = this.read(this.dO);
      }
      s.set(this.osc, true);
      periods++;
      if (s.get(this.clk) === L1) break;
      s.set(this.osc, false);
      if (periods > 1000) throw new Error("CLK yükselmedi: ~WAIT bırakılmıyor");
    }
    if (!op.write && (this.read(this.de) !== de || this.read(this.dO) !== dO)) {
      throw new Error(`${op.addr.toString(16)}: veri CLK↑'den sonra tutulmadı`);
    }
    s.set(this.osc, false);
    if ((periods - 4) % 8 !== 0) throw new Error(`F→R ${periods} osilatör periyodu`);
    const waits = (periods - 4) / 8;
    // boş adım: F'de sinyaller bırakılır
    this.until(L0);
    for (const n of [...this.de, ...this.dO]) s.release(n);
    s.drive(net("WE_E_REQ"), false);
    s.drive(net("WE_O_REQ"), false);
    s.drive(net("~MRD"), true);
    s.settle();
    s.set(this.osc, false);
    this.until(L1);
    s.set(this.osc, false);
    this.cycles += 2 + waits;
    return { de, do: dO, waits };
  }
}
