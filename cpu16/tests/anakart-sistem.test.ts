// Faz 6 anakart: saat kartının bekleme turları ve tam sistem, kapı seviyesinde.
//  1. Saat kartı tek başına: ~WAIT'i bir bellek kartı gibi süren düzenekle her bekleme turunun CPU
//     döngüsünü tam 8 osilatör periyodu uzattığı; CLK, WR_WIN ve TCLK kenarlarının yeri; kenar
//     sayısı 74HC590 sayaçlarıyla da sayılır (dalga içinde bir parazit olsaydı sayaç fazla sayardı);
//     ADIM kipinde bir basış = bekleme turları dahil tam bir CPU döngüsü.
//  2. GateMachine (CPU + saat + bellek + önbellek kartları) Machine ile komut komut: register'lar,
//     PC, bayraklar, döngü ve bekleme sayısı; sonda bellek, etiketler ve sayaçlar. RAM'den çalışan
//     programlar ve BIOS açılışı (başka bir kartın G/Ç adresinden ilk okumaya kadar).
//  3. G/Ç kartı da takılı: BIOS monitör istemine kadar, UART'a yazılanlar ve zamanlayıcı kesmesi dahil.

import { describe, expect, it } from "vitest";
import { assembleOrThrow } from "../asm/assembler.ts";
import { Board, type ChipInstance } from "../board/board.ts";
import { buildClockCard } from "../board/clock-card.ts";
import { buildIoCard } from "../board/io-card.ts";
import { chipDffs, driveClockInputs, GateMachine } from "../board/machine-board.ts";
import { L0, L1, LogicSim } from "../chips/logic.ts";
import { Machine } from "../emu/machine.ts";
import { bios, expectSameMemory, foreignIo, hex, micro, readText } from "./anakart-ortak.ts";

// ---------------------------------------------------------------- saat kartı

type Sig = "CLK" | "WR_WIN" | "TCLK";
const SIGS: Sig[] = ["CLK", "WR_WIN", "TCLK"];

/** Bir kenar: t = osilatörün yükselen kenarı sayısı (düşen kenarda +0,5) */
interface Edge {
  sig: Sig;
  up: boolean;
  t: number;
}

const fmtEdges = (e: Edge[]) => e.map((x) => `${x.sig}${x.up ? "↑" : "↓"}@${x.t}`).join(" ");

/**
 * F'de (CLK↓, zaman f) başlayan, `w` bekleme turlu bir CPU döngüsünün kenarları (clock-card.ts'deki
 * çizelge): TCLK her turun s2'sinde yükselir, s6'sında düşer; WR_WIN yalnız ilk turda s5–s7;
 * CLK son turun sonunda yükselir.
 */
function expectedEdges(f: number, w: number): Edge[] {
  const e: Edge[] = [{ sig: "TCLK", up: true, t: f - 2 }, { sig: "CLK", up: false, t: f }, { sig: "WR_WIN", up: true, t: f + 1 }];
  for (let j = 0; j <= w; j++) {
    if (j > 0) e.push({ sig: "TCLK", up: true, t: f - 2 + 8 * j });
    e.push({ sig: "TCLK", up: false, t: f + 2 + 8 * j });
    if (j === 0) e.push({ sig: "WR_WIN", up: false, t: f + 3 });
  }
  e.push({ sig: "CLK", up: true, t: f + 4 + 8 * w });
  return e.sort((a, b) => a.t - b.t);
}

/**
 * Saat kartı + kenar sayaçları + ~WAIT'i süren düzenek. Düzenek bir bellek kartı gibi davranır:
 * CLK düşünce plandaki bekleme sayısını alır, ~WAIT'i hemen ya da ilk TCLK↓'de düşürür, w. turda
 * (TCLK'ye göre) bırakır — her zaman örnekleme anlarının (s7 ortası) arasında.
 */
class ClockBench {
  readonly board = new Board();
  readonly sim: LogicSim;
  readonly counters: Record<Sig, ChipInstance>;
  readonly edges: Edge[] = [];
  t = 0;
  private readonly net: (name: string) => number;
  private readonly last: Record<Sig, number>;
  private plan: number[] = [];
  private dev: { w: number; falls: number; rises: number; late: boolean; onRise: boolean } | null = null;
  private seed = 12345;

  constructor() {
    const b = this.board;
    buildClockCard(b);
    b.card = "sınama";
    b.block = "Kenar sayaçları";
    const counter = (sig: Sig) => b.place("74HC590", { CPC: sig, "~CEC": "GND", "~MRC": "~RESET", CPR: "GND", "~OE": "VCC" }, `${sig} yükselen kenar sayacı`);
    this.counters = { CLK: counter("CLK"), WR_WIN: counter("WR_WIN"), TCLK: counter("TCLK") };
    b.finish({ backplane: false });
    this.net = (name) => b.n(name);
    this.sim = new LogicSim(b.c);
    for (const p of b.pulls) this.sim.pull(p.net, p.level);
    driveClockInputs(this.sim, this.net);
    this.sim.settle();
    this.last = { CLK: this.level("CLK"), WR_WIN: this.level("WR_WIN"), TCLK: this.level("TCLK") };
  }

  private level(sig: string): number {
    return this.sim.get(this.net(sig));
  }

  private rnd(): boolean {
    this.seed = (this.seed * 1103515245 + 12345) >>> 0;
    return ((this.seed >>> 16) & 1) === 1;
  }

  set(name: string, v: boolean): void {
    this.sim.set(this.net(name), v);
  }

  /** Reset (RST_RC düşük) ve bırak; AUTO istenen konumda */
  reset(auto: boolean): void {
    this.set("AUTO", auto);
    this.set("RST_RC", false);
    this.periods(4);
    this.set("RST_RC", true);
    this.edges.length = 0;
  }

  /** Sonraki CPU döngülerinin bekleme turu sayıları */
  queue(...waits: number[]): void {
    this.plan.push(...waits);
  }

  private waitLow(low: boolean): void {
    const n = this.net("~WAIT");
    if (low) this.sim.drive(n, L0);
    else this.sim.release(n);
    this.sim.settle();
  }

  private observe(): void {
    for (const sig of SIGS) {
      const v = this.level(sig);
      if (v === this.last[sig]) continue;
      if (v !== L0 && v !== L1) throw new Error(`${sig} belirsiz (t=${this.t})`);
      this.last[sig] = v;
      const up = v === L1;
      this.edges.push({ sig, up, t: this.t });
      this.device(sig, up);
    }
  }

  /** ~WAIT'i süren düzenek (bellek kartının yerine) */
  private device(sig: Sig, up: boolean): void {
    if (sig === "CLK" && !up) {
      const w = this.plan.shift() ?? 0;
      this.dev = { w, falls: 0, rises: 0, late: this.rnd(), onRise: this.rnd() };
      if (w > 0 && !this.dev.late) this.waitLow(true);
      return;
    }
    const d = this.dev;
    if (sig !== "TCLK" || !d || d.w === 0) return;
    if (!up) {
      if (d.falls === 0 && d.late) this.waitLow(true);
      if (!d.onRise && d.falls === d.w) this.waitLow(false);
      d.falls++;
    } else {
      if (d.onRise && d.rises === d.w - 1) this.waitLow(false);
      d.rises++;
    }
  }

  /** Osilatörün n periyodu */
  periods(n: number): void {
    const osc = this.net("OSC_XTAL");
    for (let k = 0; k < n; k++) {
      this.t += 1;
      this.sim.set(osc, true);
      this.observe();
      this.t += 0.5;
      this.sim.set(osc, false);
      this.observe();
      this.t -= 0.5;
    }
  }

  /** 74HC590 kenar sayacının değeri */
  count(sig: Sig): number {
    const ff = chipDffs(this.board, this.counters[sig]);
    let v = 0;
    for (let i = 0; i < 8; i++) v |= (this.sim.stateOf(ff[i]) === L1 ? 1 : 0) << i;
    return v;
  }

  /** Kaydedilen kenarların yükselenleri (sayaçlarla karşılaştırmak için, mod 256) */
  rises(sig: Sig): number {
    return this.edges.filter((e) => e.sig === sig && e.up).length & 0xff;
  }
}

/** Kaydedilen kenarları planlanan döngülerin beklenen kenarlarıyla karşılaştır */
function checkCycles(bench: ClockBench, waits: number[], from = 0): void {
  const falls = bench.edges.filter((e) => e.sig === "CLK" && !e.up).map((e) => e.t);
  for (let k = 0; k < waits.length; k++) {
    const f = falls[from + k];
    const want = expectedEdges(f, waits[k]);
    const got = bench.edges.filter((e) => e.t >= f - 2 && e.t <= f + 4 + 8 * waits[k]);
    if (fmtEdges(got) !== fmtEdges(want)) throw new Error(`döngü ${k} (${waits[k]} bekleme):\n  beklenen ${fmtEdges(want)}\n  kart     ${fmtEdges(got)}`);
  }
}

// ---------------------------------------------------------------- tam sistem

const RAM_BANK = 33; // pencere 2'nin reset değeri: CPU 0x8000 = fiziksel 0x84000

/** Flash'taki tek komutluk başlangıç: pencere 2'deki programa atla */
const STUB = assembleOrThrow(".org 0\n        LI   r6, 0x8000\n        JALR r6, r6, 0\n").image.subarray(0, 16);

/** Örnek programı pencere 2'de (RAM) çalışacak şekilde derle */
function ramProgram(src: string): Uint8Array {
  return assembleOrThrow(src.replace(/\.org\s+0(x0000)?\b/, ".org 0x8000")).image.slice(0x8000);
}

/**
 * Machine ve GateMachine'i komut komut çalıştır. Machine'in komutu başka bir kartın G/Ç adresini
 * okuduysa (o kartlar kapı modelinde yok; okunan 0xFF olurdu) karşılaştırma orada biter.
 */
function lockstep(g: GateMachine, m: Machine, maxInstr: number, o: { io?: boolean; until?: () => boolean } = {}) {
  let foreignRead = -1;
  let irqs = 0;
  // G/Ç kartı takılıysa yalnızca video register'ları "başka kart"tır
  const foreign = o.io ? (addr: number) => addr >= 0xff20 && addr < 0xff30 : foreignIo;
  m.onAccess = (write, addr) => {
    if (!write && foreign(addr) && foreignRead < 0) foreignRead = addr;
  };
  const c0 = m.cycles;
  const g0 = g.cycles;
  let n = 0;
  try {
    for (; n < maxInstr; n++) {
      if (m.cpu.halted || o.until?.()) break;
      const irq = m.cpu.irq && m.cpu.i;
      if (!o.io) expect(irq, "kesme (G/Ç kartı yok)").toBe(false);
      const pc = m.cpu.pc;
      m.step();
      g.step();
      // Machine'in bir adımı kesmeye girişi ve vektördeki ilk komutu birlikte yapar
      if (irq) {
        g.step();
        irqs++;
      }
      // bu komutun okuduğu değer kartlarda 0xFF (kart yok): register'lar artık karşılaştırılamaz,
      // ama bellek tarafı (erişimler, beklemeler, sayaçlar) aynı komutu yaptı
      if (foreignRead >= 0) {
        expect([g.cycles - g0, g.waitCycles]).toEqual([m.cycles - c0, m.waitCycles]);
        break;
      }
      const s = g.state;
      const want = { pc: m.cpu.pc, regs: Array.from(m.cpu.regs), flags: [m.cpu.n, m.cpu.z, m.cpu.c, m.cpu.v, m.cpu.i], cycles: m.cycles - c0, waits: m.waitCycles };
      const got = { pc: s.pc, regs: s.regs, flags: [s.n, s.z, s.c, s.v, s.i], cycles: g.cycles - g0, waits: g.waitCycles };
      if (JSON.stringify(got) !== JSON.stringify(want)) throw new Error(`komut ${n} (PC ${hex(pc)}):\n  Machine ${JSON.stringify(want)}\n  kartlar ${JSON.stringify(got)}`);
    }
  } finally {
    m.onAccess = undefined;
  }
  return { instructions: n, cycles: g.cycles - g0, foreignRead, irqs };
}

function ramMachines(prog: Uint8Array) {
  const m = new Machine();
  m.loadFlash(STUB);
  m.pokePhys(RAM_BANK * 0x4000, prog);
  m.reset();
  const g = new GateMachine(micro.rom);
  g.loadFlash(STUB);
  g.loadPhys(prog, RAM_BANK * 0x4000);
  return { m, g };
}

/**
 * CPU'nun kendi erişimleriyle bellek kartı ve önbellek: 64 bankta pencere 1'den yaz/oku, bank
 * register'larını kelime olarak oku, önbelleği kapat/aç, Flash kimliği (SST komut dizisi; kod RAM'de
 * olduğu için mümkün), Flash yazmasının önbellek satırını geçersiz kılması, sayaçlar ve FF30 yazması.
 */
const SISTEM_S = `
IOB   = 0xFF20
SONUC = 0xC000          ; sonuçlar pencere 3'te (bank 34)
        .org 0x8000
        LI   r5, IOB
        LI   r4, SONUC
        LW   r0, [r5+16]    ; açılıştaki isabet sayısı
        SW   r0, [r4+12]
        LI   r1, 0          ; bank
        LI   r2, 0          ; sağlama toplamı
bnk:    SB   r1, [r5-15]    ; pencere 1 = bank r1
        LI   r3, 0x7F00
        LW   r0, [r3]
        ADD  r2, r2, r0
        ADD  r0, r1, r2
        SW   r0, [r3]       ; Flash'ta komut baytı, boş bölgede yok sayılır
        LW   r0, [r3]
        XOR  r2, r2, r0
        LBU  r0, [r5-15]
        ADD  r2, r2, r0
        LW   r0, [r5-16]    ; BANK0/BANK1 kelime olarak
        ADD  r2, r2, r0
        ADDI r1, r1, 1
        CMPI r1, 64
        BNE  bnk
        SW   r2, [r4]
        LI   r1, 32
        SB   r1, [r5-15]
        ; önbellek kapalı: okuma doldurmaz ve sayılmaz
        LI   r0, 0
        SB   r0, [r5+20]
        LI   r3, 0x4000
        LW   r0, [r3]
        LW   r0, [r3]
        LBU  r1, [r5+20]
        SW   r1, [r4+2]
        LI   r0, 1
        SB   r0, [r5+20]
        LW   r0, [r3]       ; ıskalama
        LW   r0, [r3]       ; isabet
        SW   r0, [r3+2]
        ; Flash kimliği: önbellek kapalı, pencere 1 = bank 1 (5555), pencere 0 = bank 0 (2AAA)
        LI   r0, 0
        SB   r0, [r5+20]
        LI   r0, 1
        SB   r0, [r5-15]
        LI   r1, 0x5555
        LI   r2, 0x2AAA
        LI   r0, 0xAA
        SB   r0, [r1]
        LI   r0, 0x55
        SB   r0, [r2]
        LI   r0, 0x90
        SB   r0, [r1]
        LI   r3, 0
        LBU  r0, [r3]
        SB   r0, [r4+4]
        LBU  r0, [r3+1]
        SB   r0, [r4+5]
        LI   r0, 0xF0       ; kimlik kipinden çık (önbellekteki satır 0 geçersiz olur)
        SB   r0, [r3]
        LBU  r0, [r3+2]
        SB   r0, [r4+6]
        LI   r0, 32
        SB   r0, [r5-15]
        LI   r0, 1
        SB   r0, [r5+20]
        LW   r0, [r3]       ; satır 0 yeniden dolar
        SW   r0, [r4+8]
        ; sayaçlar; FF30'a yazma ikisini de sıfırlar
        LW   r0, [r5+16]
        SW   r0, [r4+14]
        LW   r0, [r5+18]
        SW   r0, [r4+16]
        SB   r0, [r5+16]
        LW   r1, [r5+16]
        LW   r2, [r5+18]
        HALT
`;

describe("Faz 6 anakart: saat kartı bekleme turları", () => {
  it("OTOMATİK: her bekleme turu tam 8 osilatör periyodu; CLK, WR_WIN, TCLK yerinde ve parazitsiz", () => {
    const bench = new ClockBench();
    bench.reset(true);
    const waits = Array.from({ length: 60 }, (_, k) => [0, 1, 2, 0, 3, 5, 0, 0, 1, 4, 2, 0][k % 12]);
    bench.queue(...waits);
    bench.periods(8 * waits.reduce((a, w) => a + w + 1, 0) + 1); // son döngünün CLK↑ kenarına kadar
    checkCycles(bench, waits);
    // kenarlar yalnız osilatörün yükselen kenarında
    expect(bench.edges.every((e) => Number.isInteger(e.t))).toBe(true);
    // ardışık CLK↑ arası 8·(1 + bekleme)
    const ups = bench.edges.filter((e) => e.sig === "CLK" && e.up).map((e) => e.t);
    expect(ups.slice(1).map((t, k) => t - ups[k])).toEqual(waits.slice(1).map((w) => 8 * (w + 1)));
    // sayaçlar: kapı dalgalarındaki parazitler de sayılırdı
    for (const sig of SIGS) expect(bench.count(sig), sig).toBe(bench.rises(sig));
    expect(bench.rises("CLK")).toBe(waits.length);
    expect(bench.rises("WR_WIN")).toBe(waits.length);
  });

  it("ADIM kipi: bir basış = bekleme turları dahil tam bir CPU döngüsü; basışlar arasında saat durur", () => {
    const bench = new ClockBench();
    bench.reset(false);
    bench.periods(40);
    expect(bench.edges).toEqual([]);
    const waits = [0, 1, 2, 3, 5, 0, 2, 1, 4, 0, 3, 2];
    bench.queue(...waits);
    let tclk = 0;
    waits.forEach((w, i) => {
      const before = bench.edges.length;
      bench.set("STEP_RC", false);
      bench.periods(3 + (i % 5)); // basış süresi değişse de tek döngü
      bench.set("STEP_RC", true);
      bench.periods(8 * (w + 1) + 30);
      const mine = bench.edges.slice(before);
      expect(mine.filter((e) => e.sig === "CLK").map((e) => e.up), `basış ${i}`).toEqual([false, true]);
      expect(mine.filter((e) => e.sig === "WR_WIN").length, `basış ${i}`).toBe(2);
      tclk += w + 1;
      expect(bench.rises("TCLK"), `basış ${i}`).toBe(tclk);
      expect(bench.sim.get(bench.board.n("CLK"))).toBe(L1); // sayaç s0'da bekliyor
    });
    checkCycles(bench, waits);
    for (const sig of SIGS) expect(bench.count(sig), sig).toBe(bench.rises(sig));
  });
});

describe("Faz 6 anakart: tam sistem (CPU + saat + bellek + önbellek kartları) Machine ile komut komut", () => {
  for (const name of ["fib", "bubble", "add32", "hello"]) {
    it(`${name}.s RAM'den (pencere 2, bank ${RAM_BANK}): register, PC, bayrak, döngü ve bekleme`, { timeout: 30_000 }, () => {
      const { m, g } = ramMachines(ramProgram(readText(`../programs/${name}.s`)));
      const r = lockstep(g, m, 20_000);
      expect(m.cpu.halted).toBe(true);
      expect(g.state.halted).toBe(true);
      expect(r.foreignRead).toBe(-1);
      expect(g.waitCycles).toBeGreaterThan(0);
      expect(g.output).toBe(m.uartOutput);
      if (name === "hello") expect(g.output).toBe("Merhaba, CPU16!\n");
      expectSameMemory(g.probe, m);
    });
  }

  it("sınama programı RAM'den: 64 bank, bank okuma, önbellek kapalı/açık, Flash kimliği, gözetleme, sayaçlar", { timeout: 30_000 }, () => {
    const { m, g } = ramMachines(assembleOrThrow(SISTEM_S).image.slice(0x8000));
    const r = lockstep(g, m, 20_000);
    expect(m.cpu.halted).toBe(true);
    expect(r.instructions).toBeGreaterThan(900);
    const res = (o: number) => m.peekPhys(34 * 0x4000 + o);
    expect([res(4), res(5)]).toEqual([0xbf, 0xb5]); // SST39SF010A kimliği
    expect(res(2)).toBe(0); // CACHE_CTRL okuması (kapalı)
    expect(m.cpu.regs[1] + m.cpu.regs[2]).toBeLessThanOrEqual(2); // FF30 yazmasından sonra yalnız iki komut getirme
    expect(res(14) | (res(15) << 8)).toBeGreaterThan(500); // isabetler
    expectSameMemory(g.probe, m);
  });

  it("BIOS açılışı: reset'ten başka bir kartın G/Ç adresinden ilk okumaya kadar", { timeout: 60_000 }, () => {
    const m = new Machine();
    m.loadFlash(bios.flash);
    m.reset();
    const g = new GateMachine(micro.rom);
    g.loadFlash(bios.flash);
    const r = lockstep(g, m, 100_000);
    expect(r.foreignRead).toBeGreaterThanOrEqual(0xff00); // UART durumu yoklanana kadar
    expect(r.cycles).toBeGreaterThan(50_000);
    // açılış: bank register'ları, önbellek açık, değişkenler sıfır, Flash rutinleri RAM'e kopyalandı
    expect(expectSameMemory(g.probe, m)).toBeGreaterThan(100);
    expect(g.probe.hits).toBeGreaterThan(10_000);
  });

  it("G/Ç kartı da takılı: BIOS reset'ten monitör istemine kadar, zamanlayıcı kesmesi dahil", { timeout: 120_000 }, () => {
    const m = new Machine();
    m.loadFlash(bios.flash);
    m.reset();
    const g = new GateMachine(micro.rom, { cards: [buildIoCard] });
    g.loadFlash(bios.flash);
    const r = lockstep(g, m, 40_000, { io: true, until: () => m.uartOutput.endsWith("> ") });
    expect(r.foreignRead).toBe(-1); // açılışta video register'ı okunmaz
    expect(m.uartOutput).toMatch(/^ CPU16 BIOS v1 .*\r\n512 KB RAM.*\r\nKomutlar icin \? yazin\.\r\n> $/s);
    expect(g.output).toBe(m.uartOutput); // FF00'a yazılan baytlar
    expect(r.irqs).toBeGreaterThan(0);
    expect(r.cycles).toBeGreaterThan(100_000);
    expectSameMemory(g.probe, m);
  });
});
