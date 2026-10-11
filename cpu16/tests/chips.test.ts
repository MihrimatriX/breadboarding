import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ChipBench } from "../chips/bench.ts";
import { kicadSymbolLibrary, parseSExpr, type SExpr } from "../chips/kicad.ts";
import { CHIPS, CHIP_BY_PART, chip } from "../chips/library.ts";
import { PASSIVES } from "../board/passives.ts";
import { L0, L1, LZ, levelChar } from "../chips/logic.ts";
import type { EepromHandle, MemoryHandle } from "../chips/parts/memory.ts";
import { TBLC_NS, TWC_NS } from "../emu/devices/eeprom.ts";
import { TransistorBench } from "../chips/transistor-bench.ts";
import { range, type ChipDef, type RefIn, type RefOut } from "../chips/types.ts";

/** Tekrarlanabilir rastgele sayı üreteci */
function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

interface WalkOptions {
  steps: number;
  seed: number;
  /** Transistör seviyesi modeli de aynı adımlarla çalıştır */
  transistor: boolean;
  /** Tüm giriş kombinasyonlarını gray kodu sırasıyla gez (birleşimsel çipler) */
  exhaustive?: boolean;
}

/**
 * Her adımda tek bir giriş pinini değiştirir; her adımdan sonra
 *   kapı modeli == veri sayfası referansı, transistör modeli == kapı modeli
 * olmalı. Çift yönlü pinler, çip onları sürmüyorsa dışarıdan sürülür.
 */
function walk(def: ChipDef, o: WalkOptions) {
  const ref = def.ref!;
  const rand = rng(o.seed);
  const bench = new ChipBench(def);
  const tb = o.transistor ? new TransistorBench(bench) : null;
  const inPins = def.pins.filter((p) => p.dir === "in").map((p) => p.name);
  const bidir = def.pins.filter((p) => p.dir === "bidir").map((p) => p.name);
  const outPins = def.pins.filter((p) => p.dir === "out" || p.dir === "tri" || p.dir === "bidir").map((p) => p.name);
  const ext = new Set<string>();

  let cur: RefIn = {};
  for (const p of [...inPins, ...bidir]) cur[p] = rand() < 0.5 ? 0 : 1;
  let r = ref.eval(ref.init(), cur, cur);
  for (const p of bidir) if (r.out[p] === "Z") ext.add(p);
  const firstPins = [...inPins, ...ext];
  for (const p of firstPins) bench.drive(p, cur[p]);
  bench.settle();
  tb?.drive(firstPins, firstPins.map((p) => cur[p]));
  let state = r.s;

  const check = (step: number, out: RefOut) => {
    for (const pin of outPins) {
      if (ext.has(pin)) continue;
      const want = out[pin];
      if (want === undefined) throw new Error(`${def.part}: referans ${pin} çıkışını vermiyor`);
      if (want === null) continue;
      const got = bench.get(pin);
      const expected = want === "Z" ? LZ : want;
      if (got !== expected) {
        const ins = Object.entries(cur).map(([k, v]) => `${k}=${v}`).join(" ");
        throw new Error(`${def.part} adım ${step}: ${pin} kapı modeli ${levelChar(got)}, veri sayfası ${want} (${ins})`);
      }
      if (tb && want !== "Z" && tb.get(pin) !== want) {
        throw new Error(`${def.part} adım ${step}: ${pin} transistör modeli ${tb.get(pin)}, kapı modeli ${want}`);
      }
    }
  };
  check(0, r.out);

  const steps = o.exhaustive ? 1 << inPins.length : o.steps;
  for (let step = 1; step < steps; step++) {
    let pin: string;
    if (o.exhaustive) {
      let bit = 0;
      while (((step >> bit) & 1) === 0) bit++;
      pin = inPins[bit];
    } else {
      const choices = [...inPins, ...ext];
      pin = choices[Math.floor(rand() * choices.length)];
    }
    const next: RefIn = { ...cur, [pin]: cur[pin] ? 0 : 1 };
    const preview = ref.eval(state, cur, next);
    // çipin sürmeye başlayacağı çift yönlü pinleri bırak, bırakacaklarını biz sür
    const released: string[] = [];
    const taken: string[] = [];
    for (const p of bidir) {
      if (preview.out[p] !== "Z" && ext.has(p)) released.push(p);
      if (preview.out[p] === "Z" && !ext.has(p)) taken.push(p);
    }
    for (const p of released) {
      ext.delete(p);
      bench.release(p);
      tb?.release(p);
    }
    for (const p of taken) {
      const g = bench.get(p);
      next[p] = g === L0 || g === L1 ? g : 0;
      ext.add(p);
    }
    const changed = [pin, ...taken];
    for (const p of changed) bench.drive(p, next[p]);
    bench.settle();
    tb?.drive(changed, changed.map((p) => next[p]));
    r = ref.eval(state, cur, next);
    state = r.s;
    cur = next;
    check(step, r.out);
  }
  return { bench, tb };
}

const logicChips = CHIPS.filter((c) => !c.behavioral);
const isComb = (c: ChipDef) => c.ref!.combinational === true;

describe("parça kütüphanesi: pin düzenleri", () => {
  it.each(CHIPS.map((c) => [c.part, c] as const))("%s pinleri 1..N, GND N/2'de, VCC N'de", (_, def) => {
    const n = def.pins.length;
    expect(def.pkg).toBe(`DIP-${n}`);
    expect(def.pins.map((p) => p.num)).toEqual(range("", n).map((_, i) => i + 1));
    expect(new Set(def.pins.map((p) => p.name)).size).toBe(n);
    expect(def.pins[n / 2 - 1].dir).toBe("power");
    expect(def.pins[n - 1].dir).toBe("power");
    expect(def.pins.filter((p) => p.dir === "power")).toHaveLength(2);
  });

  it("kütüphanede 37 çip var", () => {
    expect(CHIPS).toHaveLength(37);
  });
});

describe("kapı modeli = veri sayfası, transistör modeli = kapı modeli", () => {
  for (const def of logicChips) {
    const comb = isComb(def);
    const inputs = def.pins.filter((p) => p.dir === "in").length;
    const exhaustive = comb && inputs <= 12;
    it(`${def.part}: ${exhaustive ? `${1 << inputs} kombinasyonun hepsi` : "3000 rastgele adım"}`, () => {
      walk(def, { steps: 3000, seed: 1, transistor: true, exhaustive });
      if (!exhaustive) walk(def, { steps: 3000, seed: 7, transistor: false });
    });
  }
});

describe("veri sayfası fonksiyon tablosu satırları", () => {
  it("74HC138: yalnızca E3=1, ~E1=~E2=0 iken seçilen çıkış düşük", () => {
    const c = new ChipBench(chip("74HC138"));
    c.write(["~E1", "~E2", "E3"], 0b100);
    c.write(["A0", "A1", "A2"], 5);
    expect(c.read(range("~Y", 8))).toBe(0xff & ~(1 << 5));
    c.set("~E2", 1);
    expect(c.read(range("~Y", 8))).toBe(0xff);
  });

  it("74HC283: 9 + 8 + 1 = 18 → toplam 2, elde 1", () => {
    const c = new ChipBench(chip("74HC283"));
    c.write(["A1", "A2", "A3", "A4"], 9);
    c.write(["B1", "B2", "B3", "B4"], 8);
    c.set("CIN", 1);
    expect(c.read(["S1", "S2", "S3", "S4"])).toBe(2);
    expect(c.get("COUT")).toBe(L1);
  });

  it("74HC161: reset, yükle 13, say 13→14→15 (TC=1) →0", () => {
    const c = new ChipBench(chip("74HC161"));
    const q = () => c.read(range("Q", 4));
    const clock = () => {
      c.set("CP", 0);
      c.set("CP", 1);
    };
    c.write(["CP", "CEP", "CET", "~PE", "~MR"], 0b01110);
    expect(q()).toBe(0);
    c.set("~MR", 1);
    c.write(range("D", 4), 13);
    c.set("~PE", 0);
    clock();
    expect(q()).toBe(13);
    c.set("~PE", 1);
    clock();
    expect(q()).toBe(14);
    clock();
    expect(q()).toBe(15);
    expect(c.get("TC")).toBe(L1);
    c.set("CET", 0);
    expect(c.get("TC")).toBe(L0);
    clock();
    expect(q()).toBe(15); // CET = 0: sayma yok
    c.set("CET", 1);
    clock();
    expect(q()).toBe(0);
  });

  it("74HC74: ~PRE ve ~CLR birlikte düşükken Q = ~Q = 1", () => {
    const c = new ChipBench(chip("74HC74"));
    c.write(["~1PRE", "~1CLR"], 0);
    expect(c.get("1Q")).toBe(L1);
    expect(c.get("~1Q")).toBe(L1);
    c.set("~1PRE", 1);
    expect(c.get("1Q")).toBe(L0);
  });

  it("74HC595: 8 bit kaydır, mandala al, oku", () => {
    const c = new ChipBench(chip("74HC595"));
    c.write(["SHCP", "STCP", "~OE", "~MR"], 0b1000);
    const byte = 0b1011_0010;
    for (let i = 7; i >= 0; i--) {
      c.set("DS", ((byte >> i) & 1) === 1);
      c.set("SHCP", 1);
      c.set("SHCP", 0);
    }
    expect(c.read(range("Q", 8))).toBeNull(); // henüz mandala alınmadı (güç açılışında tanımsız)
    c.set("STCP", 1);
    expect(c.read(range("Q", 8))).toBe(byte);
    c.set("~OE", 1);
    expect(c.get("Q0")).toBe(LZ);
  });

  it("74HC273: ~MR sıfırlar, CP'nin yükselen kenarında D'ler alınır", () => {
    const c = new ChipBench(chip("74HC273"));
    c.write(["CP", "~MR"], 0);
    expect(c.read(range("Q", 8))).toBe(0);
    c.set("~MR", 1);
    c.write(range("D", 8), 0xa5);
    expect(c.read(range("Q", 8))).toBe(0); // kenar yok
    c.set("CP", 1);
    expect(c.read(range("Q", 8))).toBe(0xa5);
    c.write(range("D", 8), 0x3c);
    c.set("CP", 0);
    expect(c.read(range("Q", 8))).toBe(0xa5); // düşen kenar etkisiz
    c.set("~MR", 0);
    expect(c.read(range("Q", 8))).toBe(0);
  });
});

describe("bellek çipleri (davranışsal)", () => {
  function memBench(part: string, dq: string[], addrBits: number) {
    const c = new ChipBench(chip(part));
    const addr = range("A", addrBits);
    c.write(["~CE", "~OE", "~WE"], 0b111);
    const write = (a: number, d: number) => {
      c.write(addr, a);
      c.write(dq, d);
      c.set("~CE", 0);
      c.set("~WE", 0);
      c.set("~WE", 1);
      c.set("~CE", 1);
      for (const p of dq) c.release(p);
      c.settle();
    };
    const read = (a: number) => {
      c.write(addr, a);
      c.set("~CE", 0);
      c.set("~OE", 0);
      const v = c.read(dq);
      c.set("~OE", 1);
      c.set("~CE", 1);
      return v;
    };
    return { c, write, read, handle: c.handle as MemoryHandle };
  }

  it("62256: yaz, oku, çıkışlar seçili değilken Z", () => {
    const m = memBench("62256", range("IO", 8), 15);
    m.write(0x1234, 0xa5);
    m.write(0x7fff, 0x3c);
    expect(m.read(0x1234)).toBe(0xa5);
    expect(m.read(0x7fff)).toBe(0x3c);
    expect(m.handle.data[0x1234]).toBe(0xa5);
    expect(m.c.get("IO0")).toBe(LZ);
  });

  it("28C256: sayfa yazma; yazma sürerken DATA yoklaması (D7 ters) ve toggle biti (D6); yazılım koruması", () => {
    const m = memBench("28C256", range("IO", 8), 15);
    const h = m.c.handle as EepromHandle;
    let t = 0;
    h.now = () => t;
    const settle = () => (t += TBLC_NS + TWC_NS);
    expect(m.read(0x1234)).toBe(0xff); // fabrikadan boş ve korumasız
    m.write(0x1234, 0xa5);
    m.write(0x1235, 0x5a);
    const [s1, s2] = [m.read(0x1234)!, m.read(0x1234)!];
    expect(s1 & 0x80).toBe(0x80); // son yazılan 0x5A'nın D7'si 0 → durum D7 = 1
    expect((s1 ^ s2) & 0x40).toBe(0x40);
    t += TBLC_NS; // bayt yükleme penceresi kapandı: iç yazma döngüsü
    expect(m.read(0x1234)! & 0x80).toBe(0x80);
    m.write(0x1236, 0x77); // yazma döngüsünde yok sayılır
    t += TWC_NS;
    expect([m.read(0x1234), m.read(0x1235), m.read(0x1236)]).toEqual([0xa5, 0x5a, 0xff]);
    expect([h.core.writeCycles, h.core.bytesWritten]).toEqual([1, 2]);
    // AA 55 A0 dizisi korumayı açar ve ardından yüklenen sayfayı yazar; komut baytları veri değildir
    const cmd = (...pairs: number[]) => {
      for (let i = 0; i < pairs.length; i += 2) m.write(pairs[i], pairs[i + 1]);
    };
    cmd(0x5555, 0xaa, 0x2aaa, 0x55, 0x5555, 0xa0, 0x0100, 0x11);
    settle();
    expect([m.read(0x100), m.read(0x5555), m.read(0x2aaa)]).toEqual([0x11, 0xff, 0xff]);
    expect(h.core.sdp).toBe(true);
    m.write(0x0100, 0x22); // korumalı: dizisiz yazma yok sayılır
    settle();
    expect(m.read(0x100)).toBe(0x11);
    // AA 55 80 AA 55 20: korumayı kapatır
    cmd(0x5555, 0xaa, 0x2aaa, 0x55, 0x5555, 0x80, 0x5555, 0xaa, 0x2aaa, 0x55, 0x5555, 0x20);
    settle();
    expect(h.core.sdp).toBe(false);
    m.write(0x0100, 0x22);
    settle();
    expect(m.read(0x100)).toBe(0x22);
    expect(m.c.get("IO0")).toBe(LZ);
  });

  it("SST39SF010A: düz yazma yok sayılır; komutla programla, kimlik oku, sektör ve çip sil", () => {
    const m = memBench("SST39SF010A", range("DQ", 8), 17);
    const cmd = (...pairs: number[]) => {
      for (let i = 0; i < pairs.length; i += 2) m.write(pairs[i], pairs[i + 1]);
    };
    m.write(0x100, 0x12);
    expect(m.read(0x100)).toBe(0xff);
    cmd(0x5555, 0xaa, 0x2aaa, 0x55, 0x5555, 0xa0, 0x100, 0x12);
    expect(m.read(0x100)).toBe(0x12);
    cmd(0x5555, 0xaa, 0x2aaa, 0x55, 0x5555, 0xa0, 0x1100, 0x34);
    cmd(0x5555, 0xaa, 0x2aaa, 0x55, 0x5555, 0x90);
    expect([m.read(0), m.read(1)]).toEqual([0xbf, 0xb5]);
    cmd(0, 0xf0);
    expect(m.read(0)).toBe(0xff);
    cmd(0x5555, 0xaa, 0x2aaa, 0x55, 0x5555, 0x80, 0x5555, 0xaa, 0x2aaa, 0x55, 0x1000, 0x30);
    expect(m.read(0x1100)).toBe(0xff); // 0x1000–0x1FFF sektörü silindi
    expect(m.read(0x100)).toBe(0x12); // diğer sektör duruyor
    cmd(0x5555, 0xaa, 0x2aaa, 0x55, 0x5555, 0x80, 0x5555, 0xaa, 0x2aaa, 0x55, 0x5555, 0x10);
    expect(m.read(0x100)).toBe(0xff);
  });
});

describe("transistör sayıları", () => {
  it("74HC00 = 16, 74HC283 kapı modelinden açılır ve NAND = 4T", () => {
    expect(new TransistorBench(new ChipBench(chip("74HC00"))).transistorCount).toBe(16);
    expect(new TransistorBench(new ChipBench(chip("74HC283"))).transistorCount).toBeGreaterThan(100);
  });
});

describe("KiCad sembol kütüphanesi", () => {
  const generated = kicadSymbolLibrary([...CHIPS, ...Object.values(PASSIVES)]);

  it("depodaki cpu16.kicad_sym güncel (npm run cpu16 -- kicad-sym)", () => {
    const committed = readFileSync(new URL("../kicad/cpu16.kicad_sym", import.meta.url), "utf8");
    expect(committed).toBe(generated);
  });

  it("geçerli S-ifadesi; her sembolde pin sayısı ve numaraları kılıfla aynı", () => {
    const tree = parseSExpr(generated) as SExpr[];
    expect(tree[0]).toBe("kicad_symbol_lib");
    const symbols = tree.filter((x) => Array.isArray(x) && x[0] === "symbol") as SExpr[][];
    expect(symbols).toHaveLength(CHIPS.length + Object.keys(PASSIVES).length);
    for (const sym of symbols) {
      const def = CHIP_BY_PART[sym[1] as string] ?? PASSIVES[sym[1] as string];
      const unit = sym.find((x) => Array.isArray(x) && x[0] === "symbol" && (x[1] as string).endsWith("_1_1")) as SExpr[];
      const nums = unit
        .filter((x) => Array.isArray(x) && x[0] === "pin")
        .map((pin) => ((pin as SExpr[]).find((x) => Array.isArray(x) && x[0] === "number") as SExpr[])[1]);
      expect(nums.map(Number).sort((a, c) => a - c)).toEqual(def.pins.map((p) => p.num));
    }
  });
});
