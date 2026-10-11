// Tek bir çipi kapı seviyesinde çalıştırmak için test tezgâhı (testler ve web arayüzü için).

import { Circuit, LogicSim, type Level } from "./logic.ts";
import type { ChipDef, PinNets } from "./types.ts";

export class ChipBench {
  readonly def: ChipDef;
  readonly circuit: Circuit;
  readonly sim: LogicSim;
  readonly net: PinNets;
  /** build() dönüş değeri (bellek çiplerinde içerik) */
  readonly handle: unknown;

  constructor(def: ChipDef) {
    this.def = def;
    const c = new Circuit();
    c.owner = def.part;
    this.net = {};
    for (const p of def.pins) {
      if (p.dir === "power") this.net[p.name] = /^(GND|VSS)$/.test(p.name) ? c.GND : c.VCC;
      else this.net[p.name] = c.net(p.name);
    }
    this.handle = def.build(c, this.net);
    this.circuit = c;
    this.sim = new LogicSim(c);
  }

  /** Pini sür ve yerleşmesini bekle */
  set(pin: string, v: 0 | 1 | boolean): void {
    this.sim.set(this.net[pin], typeof v === "boolean" ? v : v === 1);
  }

  /** Pini sür ama yayma (birden fazla pini aynı anda değiştirmek için; sonra settle()) */
  drive(pin: string, v: 0 | 1 | boolean): void {
    this.sim.drive(this.net[pin], typeof v === "boolean" ? v : v === 1);
  }

  release(pin: string): void {
    this.sim.release(this.net[pin]);
  }

  settle(): void {
    this.sim.settle();
  }

  get(pin: string): Level {
    return this.sim.get(this.net[pin]);
  }

  /** Birden fazla pini sayı olarak oku (names[0] en düşük bit); bilinmeyen bit varsa null */
  read(names: string[]): number | null {
    let v = 0;
    for (let i = 0; i < names.length; i++) {
      const l = this.get(names[i]);
      if (l > 1) return null;
      v |= l << i;
    }
    return v;
  }

  /** Birden fazla pini sür ve yerleştir */
  write(names: string[], v: number): void {
    names.forEach((n, i) => this.drive(n, ((v >> i) & 1) === 1));
    this.settle();
  }
}
