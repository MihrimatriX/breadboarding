// Şema = kod. Bir kart, kütüphanedeki çiplerin örneklerinden ve aralarındaki netlerden oluşur.
// Aynı tanımdan hem kapı seviyesi simülasyon (LogicSim), hem KiCad şeması/netlist'i, hem BOM,
// hem de 3D görünüm üretilir; şema değişirse hepsi birlikte değişir.

import { chip } from "../chips/library.ts";
import { refPrefix } from "../chips/kicad.ts";
import { Circuit } from "../chips/logic.ts";
import { BACKPLANE } from "./passives.ts";
import type { ChipDef, PinNets } from "../chips/types.ts";

export interface ChipInstance {
  /** KiCad referansı, ör. "U12" */
  ref: string;
  def: ChipDef;
  /** Hangi kart (şema sayfası) */
  card: string;
  /** Şemadaki görevi, ör. "R3 düşük bayt" */
  role: string;
  /** Kart üzerindeki işlev bloğu, ör. "ALU" (3D yerleşim bunu gruplar) */
  block: string;
  /** pin adı → net */
  nets: PinNets;
  /** Bu çipin circuit.gates içindeki kapı aralığı [başlangıç, bitiş) */
  gates: [number, number];
  /** build() dönüşü (bellek içeriği) */
  handle: unknown;
  /** KiCad footprint'i (kütüphanedekinden farklıysa, ör. ZIF soket) */
  footprint: string;
}

export interface Passive {
  ref: string;
  card: string;
  /** passives.ts içindeki eleman, ör. "C_100N" */
  part: string;
  /** pin numarası → net */
  pins: Record<string, number>;
  role: string;
}

type Net = number | string;

/** Yapıştırıcı (glue) kapı türleri: hangi çipten, birimde hangi pinler */
const GLUE = {
  and: { part: "74HC08", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  or: { part: "74HC32", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  nand: { part: "74HC00", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  nor: { part: "74HC02", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  xor: { part: "74HC86", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  not: { part: "74HC04", units: 6, pins: (u: number) => [`${u}A`, `${u}Y`] },
  nand3: { part: "74HC10", units: 3, pins: (u: number) => [`${u}A`, `${u}B`, `${u}C`, `${u}Y`] },
} as const;
type GlueKind = keyof typeof GLUE;

export class Board {
  readonly c = new Circuit();
  readonly chips: ChipInstance[] = [];
  readonly passives: Passive[] = [];
  /** Net çekme dirençleri (simülasyonda zayıf sürücü) */
  readonly pulls: { net: number; level: 0 | 1 }[] = [];
  card = "cpu";
  /** Sonraki çiplerin işlev bloğu */
  block = "";
  private readonly named = new Map<string, number>();
  private readonly glue: { kind: GlueKind; card: string; nets: number[]; role: string }[] = [];
  private finished = false;

  constructor() {
    this.named.set("GND", this.c.GND);
    this.named.set("VCC", this.c.VCC);
  }

  /** Adlı net (yoksa oluşturur) */
  n(name: string): number {
    let id = this.named.get(name);
    if (id === undefined) {
      id = this.c.net(name);
      this.named.set(name, id);
    }
    return id;
  }

  has(name: string): boolean {
    return this.named.has(name);
  }

  /** prefix0..prefix(n-1) adlı netler */
  bus(prefix: string, n: number): number[] {
    return Array.from({ length: n }, (_, i) => this.n(`${prefix}${i}`));
  }

  netName(id: number): string {
    return this.c.netNames[id];
  }

  private resolve(x: Net): number {
    return typeof x === "number" ? x : this.n(x);
  }

  /** Bir çip yerleştir. Bağlanmamış giriş pini hata verir (CMOS girişi boşta bırakılmaz). */
  place(part: string, conn: Record<string, Net>, role = "", opts: { footprint?: string } = {}): ChipInstance {
    if (this.finished) throw new Error("Kart tamamlandıktan sonra çip eklenemez");
    const def = chip(part);
    const ref = `U${this.chips.length + 1}`;
    const nets: PinNets = {};
    for (const p of def.pins) {
      if (p.dir === "power") {
        nets[p.name] = /^(GND|VSS)$/.test(p.name) ? this.c.GND : this.c.VCC;
        continue;
      }
      if (p.dir === "nc") continue;
      const x = conn[p.name];
      if (x === undefined) {
        if (p.dir === "in") throw new Error(`${ref} (${part}, ${role}): ${p.name} girişi bağlanmamış`);
        nets[p.name] = this.c.net(`${ref}.${p.name}`);
      } else nets[p.name] = this.resolve(x);
    }
    for (const k of Object.keys(conn)) {
      if (!def.pins.some((p) => p.name === k)) throw new Error(`${ref} (${part}): böyle bir pin yok: ${k}`);
    }
    this.c.owner = ref;
    const start = this.c.gates.length;
    const handle = def.build(this.c, nets);
    const inst: ChipInstance = {
      ref, def, card: this.card, role, block: this.block, nets, gates: [start, this.c.gates.length], handle,
      footprint: opts.footprint ?? def.footprint,
    };
    this.chips.push(inst);
    return inst;
  }

  /** Pasif eleman (direnç dizisi, kondansatör, LED, konnektör): simülasyona etkisi yok, BOM ve şema için */
  passive(part: string, pins: Record<string, Net>, role: string): Passive {
    const prefix = refPrefix(part);
    if (prefix === "U") throw new Error(`${part}: pasif elemanın referans harfi U olamaz (entegrelerle çakışır)`);
    const n = this.passives.filter((x) => refPrefix(x.part) === prefix).length + 1;
    const resolved: Record<string, number> = {};
    for (const [k, v] of Object.entries(pins)) resolved[k] = this.resolve(v);
    const p: Passive = { ref: `${prefix}${n}`, card: this.card, part, pins: resolved, role };
    this.passives.push(p);
    return p;
  }

  /** Netleri bir direnç dizisiyle GND'ye çek (10 kΩ, 8'li SIP, ortak uç GND) */
  pullDown(nets: number[], role: string): void {
    for (let i = 0; i < nets.length; i += 8) {
      const group = nets.slice(i, i + 8);
      const pins: Record<string, Net> = { "1": "GND" };
      group.forEach((net, k) => (pins[String(k + 2)] = net));
      this.passive("RN_10K_8", pins, role);
      for (const net of group) this.pulls.push({ net, level: 0 });
    }
  }

  /** Netleri VCC'ye çek: tek net için 10 kΩ direnç, fazlası için 8'li SIP dizi (ortak uç VCC) */
  pullUp(nets: Net[], role: string): void {
    const ids = nets.map((x) => this.resolve(x));
    if (ids.length === 1) {
      this.passive("R_10K", { "1": "VCC", "2": ids[0] }, role);
    } else {
      for (let i = 0; i < ids.length; i += 8) {
        const pins: Record<string, Net> = { "1": "VCC" };
        ids.slice(i, i + 8).forEach((net, k) => (pins[String(k + 2)] = net));
        this.passive("RN_10K_8", pins, role);
      }
    }
    for (const net of ids) this.pulls.push({ net, level: 1 });
  }

  /** Durum LED'i: sinyal → 330 Ω → LED → GND */
  led(signal: Net, name: string): void {
    const mid = this.n(`LED_${name}`);
    this.passive("R_330", { "1": signal, "2": mid }, `${name} LED direnci`);
    this.passive("LED", { "1": mid, "2": "GND" }, `${name} LED'i`);
  }

  // ---- yapıştırıcı kapılar: kart bitince gerçek çiplere paketlenir
  private gate(kind: GlueKind, ins: Net[], out?: Net, role = ""): number {
    const y = out === undefined ? this.c.net() : this.resolve(out);
    this.glue.push({ kind, card: this.card, nets: [...ins.map((x) => this.resolve(x)), y], role });
    return y;
  }
  and(a: Net, b: Net, out?: Net, role?: string) { return this.gate("and", [a, b], out, role); }
  or(a: Net, b: Net, out?: Net, role?: string) { return this.gate("or", [a, b], out, role); }
  nand(a: Net, b: Net, out?: Net, role?: string) { return this.gate("nand", [a, b], out, role); }
  nor(a: Net, b: Net, out?: Net, role?: string) { return this.gate("nor", [a, b], out, role); }
  xor(a: Net, b: Net, out?: Net, role?: string) { return this.gate("xor", [a, b], out, role); }
  not(a: Net, out?: Net, role?: string) { return this.gate("not", [a], out, role); }
  nand3(a: Net, b: Net, c: Net, out?: Net, role?: string) { return this.gate("nand3", [a, b, c], out, role); }

  /** Yapıştırıcı kapıları çiplere yerleştir; kullanılmayan birimlerin girişlerini GND'ye bağla. */
  finish(o: { backplane?: boolean } = {}): void {
    if (this.finished) return;
    const savedCard = this.card;
    this.block = "Yapıştırıcı lojik";
    for (const kind of Object.keys(GLUE) as GlueKind[]) {
      const g = GLUE[kind];
      const cards = [...new Set(this.glue.filter((x) => x.kind === kind).map((x) => x.card))];
      for (const card of cards) {
        const items = this.glue.filter((x) => x.kind === kind && x.card === card);
        this.card = card;
        for (let i = 0; i < items.length; i += g.units) {
          const conn: Record<string, Net> = {};
          const roles: string[] = [];
          for (let u = 1; u <= g.units; u++) {
            const item = items[i + u - 1];
            const pins = g.pins(u);
            if (item) {
              pins.forEach((p, k) => (conn[p] = item.nets[k]));
              if (item.role) roles.push(item.role);
            } else {
              pins.slice(0, -1).forEach((p) => (conn[p] = "GND")); // boş birim: girişler GND
            }
          }
          this.place(g.part, conn, roles.length ? `yapıştırıcı: ${[...new Set(roles)].join(", ")}` : "yapıştırıcı lojik");
        }
      }
    }
    // her kart: arka panel konnektörü (istenirse), giriş kondansatörü, her entegreye 100 nF
    for (const card of [...new Set(this.chips.map((c) => c.card))]) {
      this.card = card;
      if (o.backplane !== false) {
        const pins: Record<string, Net> = {};
        for (const [num, name] of Object.entries(BACKPLANE)) if (this.has(name)) pins[num] = name;
        this.passive("BACKPLANE_2x32", pins, "arka panel konnektörü");
      }
      this.passive("C_100U", { "1": "VCC", "2": "GND" }, "besleme girişi");
      for (const ci of this.chips.filter((c) => c.card === card)) this.passive("C_100N", { "1": "VCC", "2": "GND" }, `${ci.ref} dekuplaj`);
    }
    this.card = savedCard;
    this.finished = true;
  }

  /** Çiplerin kart başına sayısı */
  summary(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const ci of this.chips) {
      out[ci.card] ??= {};
      out[ci.card][ci.def.part] = (out[ci.card][ci.def.part] ?? 0) + 1;
    }
    return out;
  }

  instance(ref: string): ChipInstance {
    const ci = this.chips.find((x) => x.ref === ref);
    if (!ci) throw new Error(`Böyle bir çip yok: ${ref}`);
    return ci;
  }
}

/** Elektriksel kural denetimi: çakışan çıkışlar ve sürülmeyen girişler */
export function erc(b: Board, externalInputs: string[] = []): string[] {
  const problems: string[] = [];
  const info = new Map<number, { out: string[]; tri: string[]; inp: string[] }>();
  const get = (net: number) => {
    let x = info.get(net);
    if (!x) info.set(net, (x = { out: [], tri: [], inp: [] }));
    return x;
  };
  for (const ci of b.chips) {
    for (const p of ci.def.pins) {
      const net = ci.nets[p.name];
      if (net === undefined || net === b.c.GND || net === b.c.VCC) continue;
      const where = `${ci.ref}.${p.name}`;
      if (p.dir === "out") get(net).out.push(where);
      else if (p.dir === "tri" || p.dir === "bidir") get(net).tri.push(where);
      else if (p.dir === "in") get(net).inp.push(where);
    }
  }
  const pulled = new Set(b.pulls.map((p) => p.net));
  const ext = new Set(externalInputs.map((n) => b.n(n)));
  for (const [net, x] of info) {
    const name = b.netName(net);
    if (x.out.length > 1) problems.push(`${name}: birden fazla çıkış sürüyor (${x.out.join(", ")})`);
    if (x.out.length && x.tri.length) problems.push(`${name}: itme-çekme çıkış ile üç durumlu çıkış aynı nette (${[...x.out, ...x.tri].join(", ")})`);
    if (x.inp.length && !x.out.length && !x.tri.length && !pulled.has(net) && !ext.has(net)) {
      problems.push(`${name}: sürülmeyen giriş (${x.inp.join(", ")})`);
    }
  }
  return problems;
}
