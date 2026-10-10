import type { ChipData } from "../../chip/types";
import { SwitchLevelEngine } from "../SwitchLevelEngine";
import type { Machine, MachineSnapshot, TraceRow } from "../machine";

/**
 * Die simülasyonunu bir bilgisayara bağlar: 64 KB RAM, saat sinyali ve
 * veri/adres yolu. Her `halfStep` clk0'ı çevirir; okuma fazında bellekten
 * veri yoluna, yazma fazında veri yolundan belleğe aktarım yapılır.
 */
export class Mos6502Machine implements Machine {
  readonly engine: SwitchLevelEngine;
  readonly memory = new Uint8Array(65536);
  halfCycle = 0;

  private readonly n: Record<string, number>;
  private readonly dbNodes: number[];

  constructor(private readonly chip: ChipData) {
    this.engine = new SwitchLevelEngine(chip);
    this.n = chip.nodeNames;
    this.dbNodes = Array.from({ length: 8 }, (_, i) => this.n["db" + i]);
  }

  private hi(name: string): boolean {
    const id = this.n[name];
    return id !== undefined && this.engine.isHigh(id);
  }

  private set(name: string, high: boolean): void {
    this.engine.drive(this.n[name], high);
  }

  readBits(prefix: string, width: number): number {
    let v = 0;
    for (let i = 0; i < width; i++) if (this.hi(prefix + i)) v |= 1 << i;
    return v;
  }

  loadProgram(bytes: ArrayLike<number>, address = 0): void {
    this.memory.fill(0);
    this.memory.set(Array.from(bytes, (b) => b & 0xff), address);
  }

  /** visual6502 initChip ile aynı reset dizisi */
  reset(): void {
    this.engine.powerOn();
    this.set("res", false);
    this.set("clk0", false);
    this.set("rdy", true);
    this.set("so", false);
    this.set("irq", true);
    this.set("nmi", true);
    for (let i = 0; i < 8; i++) {
      this.set("clk0", true);
      this.set("clk0", false);
    }
    this.set("res", true);
    for (let i = 0; i < 18; i++) this.halfStep();
    this.halfCycle = 0;
  }

  halfStep(): void {
    if (this.hi("clk0")) {
      this.set("clk0", false);
      if (this.hi("rw")) this.writeDataBus(this.memory[this.readBits("ab", 16)]);
    } else {
      this.set("clk0", true);
      if (!this.hi("rw")) this.memory[this.readBits("ab", 16)] = this.readBits("db", 8);
    }
    this.halfCycle++;
  }

  private writeDataBus(value: number): void {
    this.engine.driveMany(
      this.dbNodes,
      this.dbNodes.map((_, i) => ((value >> i) & 1) === 1),
    );
  }

  setPin(name: string, high: boolean): void {
    this.set(name, high);
  }

  trace(): TraceRow {
    return {
      halfCycle: this.halfCycle,
      ab: this.readBits("ab", 16),
      db: this.readBits("db", 8),
      rw: this.hi("rw"),
      sync: this.hi("sync"),
      clk: this.hi("clk0"),
      pc: (this.readBits("pch", 8) << 8) | this.readBits("pcl", 8),
      a: this.readBits("a", 8),
      x: this.readBits("x", 8),
      y: this.readBits("y", 8),
      sp: this.readBits("s", 8),
      p: this.readBits("p", 8),
    };
  }

  snapshot(): MachineSnapshot {
    return {
      trace: this.trace(),
      pins: {
        clk0: this.hi("clk0"),
        rw: this.hi("rw"),
        sync: this.hi("sync"),
        res: this.hi("res"),
        irq: this.hi("irq"),
        nmi: this.hi("nmi"),
        rdy: this.hi("rdy"),
      },
      zeroPage: this.memory.slice(0, 256),
      stackPage: this.memory.slice(256, 512),
      oscillations: this.engine.oscillations,
    };
  }

  get chipData(): ChipData {
    return this.chip;
  }
}
