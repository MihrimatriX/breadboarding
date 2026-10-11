// Bir çipi transistör seviyesinde, Silikon3D'nin anahtar seviyesi motorunda çalıştırır.
// Pin adları ChipBench ile aynıdır; kapı modeliyle karşılaştırma testleri bunu kullanır.

import { SwitchLevelEngine } from "../../src/sim/SwitchLevelEngine.ts";
import type { ChipBench } from "./bench.ts";
import { toTransistors, type TransistorNetlist } from "./cmos.ts";

export class TransistorBench {
  readonly netlist: TransistorNetlist;
  readonly engine: SwitchLevelEngine;
  private readonly bench: ChipBench;

  constructor(bench: ChipBench) {
    this.bench = bench;
    this.netlist = toTransistors(bench.circuit, bench.def.part);
    this.engine = new SwitchLevelEngine(this.netlist.chip);
    this.engine.powerOn();
  }

  get transistorCount(): number {
    return this.engine.transistorCount;
  }

  private node(pin: string): number {
    return this.netlist.nodeOfNet(this.bench.net[pin]);
  }

  /** Pinleri aynı anda sür (tek yeniden hesaplama) */
  drive(pins: string[], values: (0 | 1)[]): void {
    this.engine.driveMany(pins.map((p) => this.node(p)), values.map((v) => v === 1));
  }

  release(pin: string): void {
    this.engine.release(this.node(pin));
  }

  get(pin: string): 0 | 1 {
    return this.engine.isHigh(this.node(pin)) ? 1 : 0;
  }
}
