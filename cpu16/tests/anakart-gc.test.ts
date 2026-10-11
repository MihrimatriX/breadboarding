// Anakart G/Ç kartı (gc) ve video kartı: kapı seviyesi testler.
// Kartlar tek başına (bellek / CPU kartı olmadan) bir test tezgâhında çalışır: tezgâh arka paneli
// (CLK, TCLK, ~IO, ~MRD, ~MWE_E/O, A0..A7, DE/DO) CPU'nun veriyolu döngüleri gibi sürer, bellek
// kartının DE/DO çekme dirençlerini yerine koyar; CH340 ve PS/2 klavye seri dalga biçimi üretir.
// Doğruluk zinciri: Machine (emu/machine.ts) ← kapı seviyesi kart, döngüsü döngüsüne.
// Ayrıntı: cpu16/docs/anakart-gc-video.md

import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildBios } from "../bios/build.ts";
import { Board, erc } from "../board/board.ts";
import { IO_CARD_INPUTS, buildIoCard } from "../board/io-card.ts";
import { SYM_LIB_TABLE, cardSchematic, kicadProject } from "../board/kicad-sch.ts";
import { BACKPLANE, PASSIVES } from "../board/passives.ts";
import { kicadSymbolLibrary, parseSExpr, type SExpr } from "../chips/kicad.ts";
import { CHIPS } from "../chips/library.ts";
import { L0, L1, LogicSim, type Level } from "../chips/logic.ts";
import { textToScancodes } from "../emu/devices/keyboard.ts";
import { IO, Machine, TICK_CYCLES, UART_BYTE_CYCLES, VBLANK_START } from "../emu/machine.ts";

const bios = buildBios(readFileSync(new URL("../bios/bios.s", import.meta.url), "utf8"));
const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** UART bit süresi (TCLK döngüsü, 4 MHz / 115 200) */
const BIT = 4_000_000 / 115_200;
/** PS/2 klavye saat periyodu (12,5 kHz; Machine.KBD_BYTE_CYCLES = 11 × 320) */
const PS2_PERIOD = 320;
/** RX: başlangıç bitinin düştüğü döngüden RX_READY'nin kurulduğu TCLK kenarına (io-card.ts) */
const RX_LATENCY = 334;

// =============================================================================== test tezgâhı

interface Access {
  write: boolean;
  addr: number;
  /** kelime erişimi (A0 = 0, iki şerit tek döngüde) */
  word?: boolean;
  /** yazılan bayt (kelimede 16 bit) */
  value?: number;
}

/** Periyodik saat kaynağı (video piksel saati gibi): `next` anında `fire()` */
interface ClockSource {
  next: number;
  fire(): void;
}

/**
 * Döngü zamanlaması (Machine.cycles ile aynı ölçek): k. döngü TCLK'nin k. yükselen kenarında başlar.
 * TCLK = CLK (bekleme yok), ilk yarı yüksek. Erişim döngüsünde adres, ~IO ve ~MRD kenardan hemen
 * sonra değişir; yazma darbesi (WR_WIN) k + 5/8 … k + 7/8; CPU okunan veriyi k + 1 kenarında alır.
 * Dış olaylar (seri hatlar) kesirli zamanlarda; tam k anındaki olay kenardan hemen sonra işlenir.
 */
class Bench {
  readonly b = new Board();
  readonly sim: LogicSim;
  /** sıradaki döngü (bir sonraki TCLK yükselen kenarı) */
  cycle = -8;
  /** şu anki zaman (döngü, kesirli) */
  now = -8;
  /** son döngünün ilk yarısının sonunda okunan IRQ hattı */
  irq: Level = L0;
  readonly sources: ClockSource[] = [];
  private readonly q: { t: number; s: number; fn: () => void }[] = [];
  private seq = 0;
  private driving = false;
  private readonly tracked: { net: number; last: Level; log: [number, Level][] }[] = [];
  private readonly clk: number[];
  private readonly irqNet: number;

  constructor(build: (b: Board) => void) {
    build(this.b);
    this.b.finish();
    this.sim = new LogicSim(this.b.c);
    for (const p of this.b.pulls) this.sim.pull(p.net, p.level);
    // bellek kartının veriyolu çekme dirençleri
    for (let i = 0; i < 8; i++) {
      this.sim.pull(this.n(`DE${i}`), L1);
      this.sim.pull(this.n(`DO${i}`), L1);
    }
    this.clk = ["CLK", "TCLK"].map((x) => this.n(x));
    this.irqNet = this.b.has("IRQ") ? this.n("IRQ") : -1;
    for (const [name, v] of [["~RESET", 0], ["~IO", 1], ["~MRD", 1], ["~MWE_E", 1], ["~MWE_O", 1], ["TCLK", 0], ["CLK", 0]] as const) {
      this.drive(name, v);
    }
    for (let i = 0; i < 8; i++) this.drive(`A${i}`, 0);
    if (this.b.has("UART_RXD")) this.drive("UART_RXD", 1);
    if (!this.b.chips.some((c) => c.card === "video")) this.drive("VSYNC_REQ", 0);
    this.sim.settle();
    // güç açılışı: flip-flop'lar 0 (GateComputer gibi; gerçekte rastgele, reset tanımlı olanları düzeltir).
    // Saatler sabitken kurulur: aksi halde X → 1 geçişi "belki kenar" sayılır.
    this.b.c.gates.forEach((g, i) => {
      if (g.kind === "DFF" || g.kind === "LATCH") this.sim.setState(i, L0);
    });
    this.sim.settle();
    // reset −1. döngüde bırakılır: resetten sonraki ilk TCLK kenarı 0. kenardır, ön bölücü orada 96
    // yükler (GC_RSTD; gerçek saat kartında TCLK reset boyunca durur ve ilk kenarı 0. döngüdedir),
    // tıklar 4000k kenarlarında (Machine: TICK_CYCLES'ın katları)
    this.at(-0.75, () => this.drive("~RESET", 1));
    while (this.cycle < 0) this.step();
  }

  n(name: string): number {
    if (!this.b.has(name)) throw new Error(`Böyle bir net yok: ${name}`);
    return this.b.n(name);
  }

  get(name: string): Level {
    return this.sim.get(this.n(name));
  }

  drive(name: string, v: number): void {
    this.sim.drive(this.n(name), v ? L1 : L0);
  }

  release(name: string): void {
    this.sim.release(this.n(name));
  }

  /** Dış olay: t anında fn (zamanı geçmişse hata) */
  at(t: number, fn: () => void): void {
    if (t < this.now) throw new Error(`geçmişe olay: ${t} < ${this.now}`);
    const e = { t, s: this.seq++, fn };
    let lo = 0;
    let hi = this.q.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      const x = this.q[mid];
      if (x.t < t || (x.t === t && x.s < e.s)) lo = mid + 1;
      else hi = mid;
    }
    this.q.splice(lo, 0, e);
  }

  /** Bir netin değişimlerini zamanlarıyla kaydet */
  track(name: string): [number, Level][] {
    const net = this.n(name);
    const log: [number, Level][] = [[this.now, this.sim.get(net)]];
    this.tracked.push({ net, last: this.sim.get(net), log });
    return log;
  }

  private settle(): void {
    this.sim.settle();
    for (const x of this.tracked) {
      const v = this.sim.get(x.net);
      if (v !== x.last) {
        x.last = v;
        x.log.push([this.now, v]);
      }
    }
  }

  /** t'den önceki bütün dış olayları ve saat kaynaklarını sırayla işle */
  flush(t: number): void {
    for (;;) {
      let src: ClockSource | undefined;
      for (const s of this.sources) if (s.next < t && (!src || s.next < src.next)) src = s;
      const e = this.q[0];
      if (e && e.t < t && (!src || e.t <= src.next)) {
        this.q.shift();
        this.now = e.t;
        e.fn();
      } else if (src) {
        this.now = src.next;
        src.fire();
      } else break;
      this.settle();
    }
    this.now = Math.max(this.now, t);
  }

  private edge(v: Level): void {
    for (const net of this.clk) this.sim.drive(net, v);
    this.settle();
  }

  byte(lane: "DE" | "DO"): number {
    let v = 0;
    for (let i = 0; i < 8; i++) {
      const x = this.get(`${lane}${i}`);
      if (x > 1) return -1; // X ya da Z: veriyolu çakışması
      v |= x << i;
    }
    return v;
  }

  /** Bir CPU döngüsü (isteğe bağlı veriyolu erişimiyle). Okumada [DE, DO] döner. */
  step(acc?: Access): [number, number] | undefined {
    const k = this.cycle;
    this.flush(k);
    this.edge(L1);
    if (this.driving) {
      for (let i = 0; i < 8; i++) {
        this.release(`DE${i}`);
        this.release(`DO${i}`);
      }
      this.driving = false;
    }
    if (acc) {
      for (let i = 0; i < 8; i++) this.drive(`A${i}`, (acc.addr >> i) & 1);
      this.drive("~IO", acc.addr >= 0xff00 ? 0 : 1);
      this.drive("~MRD", acc.write ? 1 : 0);
      if (acc.write) {
        const v = acc.value ?? 0;
        const lanes = acc.word ? [v & 0xff, (v >> 8) & 0xff] : acc.addr & 1 ? [-1, v] : [v, -1];
        lanes.forEach((x, li) => {
          if (x >= 0) for (let i = 0; i < 8; i++) this.drive(`${li ? "DO" : "DE"}${i}`, (x >> i) & 1);
        });
        this.driving = true;
      }
    } else {
      this.drive("~IO", 1);
      this.drive("~MRD", 1);
    }
    this.settle();
    this.flush(k + 0.5);
    if (this.irqNet >= 0) this.irq = this.sim.get(this.irqNet);
    this.edge(L0);
    if (acc?.write) {
      const even = acc.word || !(acc.addr & 1);
      const odd = acc.word || acc.addr & 1;
      this.flush(k + 0.625);
      if (even) this.drive("~MWE_E", 0);
      if (odd) this.drive("~MWE_O", 0);
      this.settle();
      this.flush(k + 0.875);
      this.drive("~MWE_E", 1);
      this.drive("~MWE_O", 1);
      this.settle();
    }
    let data: [number, number] | undefined;
    if (acc && !acc.write) {
      this.flush(k + 1);
      data = [this.byte("DE"), this.byte("DO")];
    }
    this.cycle = k + 1;
    return data;
  }

  idle(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  idleUntil(cycle: number): void {
    while (this.cycle < cycle) this.step();
  }

  rd8(addr: number): number {
    const [de, dO] = this.step({ write: false, addr })!;
    return addr & 1 ? dO : de;
  }

  rd16(addr: number): number {
    const [de, dO] = this.step({ write: false, addr, word: true })!;
    return de | (dO << 8);
  }

  wr8(addr: number, value: number): void {
    this.step({ write: true, addr, value });
  }

  wr16(addr: number, value: number): void {
    this.step({ write: true, addr, value, word: true });
  }
}

const ioBench = () => new Bench((b) => buildIoCard(b));

// =============================================================================== seri aygıtlar

/** CH340'ın TX ucu: t anında başlayan 8N1 çerçeve (bit süresi `bit` döngü) */
function uartFrame(g: Bench, t: number, byte: number, bit = BIT): number {
  const bits = [0, ...range(8).map((i) => (byte >> i) & 1), 1];
  bits.forEach((v, i) => g.at(t + i * bit, () => g.drive("UART_RXD", v)));
  return t + 10 * bit;
}

/** Tek eşlikli (odd parity) PS/2 çerçevesi: 11 düşen saat kenarı f0, f0 + p, … (açık-akaç sürüş) */
function ps2Frame(g: Bench, f0: number, byte: number, p = PS2_PERIOD): number {
  const data = range(8).map((i) => (byte >> i) & 1);
  const parity = data.reduce((a, x) => a ^ x, 1);
  [0, ...data, parity, 1].forEach((v, i) => {
    const f = f0 + i * p;
    g.at(f - p / 4, () => (v ? g.release("PS2_DAT") : g.drive("PS2_DAT", 0)));
    g.at(f, () => g.drive("PS2_CLK", 0));
    g.at(f + p / 2, () => g.release("PS2_CLK"));
  });
  return f0 + 10 * p;
}

/** CH340 köprüsü: kuyruktaki baytları CTS# (kartın RTS# = RX_READY) düşükken gönderir */
class Ch340 {
  readonly queue: number[] = [];
  /** CTS# yüzünden bekletilen çerçeve sayısı */
  waits = 0;
  private busy = false;
  constructor(private readonly g: Bench, private readonly bit = BIT) {}

  send(bytes: number[], t = this.g.now): void {
    this.queue.push(...bytes);
    if (!this.busy) {
      this.busy = true;
      this.g.at(t, () => this.next());
    }
  }

  private next(): void {
    if (!this.queue.length) {
      this.busy = false;
      return;
    }
    if (this.g.get("GC_RXRDY")) {
      this.waits++;
      this.g.at(this.g.now + 10, () => this.next()); // CTS# pasif: bekle
      return;
    }
    const end = uartFrame(this.g, this.g.now, this.queue.shift()!, this.bit);
    this.g.at(end, () => this.next());
  }
}

/** PS/2 klavye: göndermeden önce saat hattına bakar; host aşağı çekiyorsa (inhibit) bekler */
class Ps2Keyboard {
  readonly queue: number[] = [];
  inhibited = 0;
  private busy = false;
  constructor(private readonly g: Bench, private readonly p = PS2_PERIOD) {}

  send(bytes: number[], t = this.g.now): void {
    this.queue.push(...bytes);
    if (!this.busy) {
      this.busy = true;
      this.g.at(t, () => this.next());
    }
  }

  private next(): void {
    if (!this.queue.length) {
      this.busy = false;
      return;
    }
    if (!this.g.get("PS2_CLK")) {
      this.inhibited++;
      this.g.at(this.g.now + 40, () => this.next());
      return;
    }
    const f10 = ps2Frame(this.g, this.g.now + this.p / 2, this.queue.shift()!, this.p);
    this.g.at(f10 + this.p, () => this.next());
  }
}

/** TX hattının kaydından 8N1 çözümü: [başlangıç zamanı, bayt][] (örnek bit ortasında) */
function decodeUart(log: [number, Level][], bit = BIT): [number, number][] {
  const at = (t: number) => {
    let v: Level = log[0][1];
    for (const [tt, x] of log) if (tt <= t) v = x;
    return v;
  };
  const out: [number, number][] = [];
  for (let i = 1; i < log.length; i++) {
    const [t, v] = log[i];
    if (v !== 0 || log[i - 1][1] !== 1) continue;
    if (out.length && t < out[out.length - 1][0] + 9.5 * bit) continue; // çerçeve içi kenar
    expect(at(t + bit / 2)).toBe(0);
    let byte = 0;
    for (let k = 0; k < 8; k++) byte |= at(t + (k + 1.5) * bit) << k;
    expect(at(t + 9.5 * bit), "bitiş biti").toBe(1);
    out.push([t, byte]);
  }
  return out;
}

// =============================================================================== Machine izi

interface BusCycle {
  c: number;
  write: boolean;
  addr: number;
  word: boolean;
  value: number;
  /** komut başındaki IRQ (yalnız komutun ilk veriyolu döngüsünde karşılaştırılır) */
  irq: boolean | null;
}

interface Trace {
  bus: BusCycle[];
  /** komut başları ve o andaki IRQ hattı */
  starts: number[];
  irqs: boolean[];
  /** UART RX_READY'nin ve klavye READY'nin kurulduğu anlar */
  rx: { t: number; v: number }[];
  kbd: { t: number; v: number }[];
  end: number;
  screen: string;
  uart: string;
}

/** BIOS'u Machine'de çalıştırır: açılış, klavyeden ve UART'tan komutlar; G/Ç erişimlerini kaydeder. */
function biosTrace(): Trace {
  const m = new Machine();
  m.loadFlash(bios.flash);
  m.reset();
  const raw: { c: number; w: boolean; a: number; v: number; irq: boolean }[] = [];
  const starts: number[] = [];
  const irqs: boolean[] = [];
  const rx: Trace["rx"] = [];
  const kbd: Trace["kbd"] = [];
  let irq = false;
  m.onAccess = (w, a, v, c) => {
    if (a >= 0xff00 && a < 0xff10) raw.push({ c, w, a, v, irq });
  };
  const run = (cond: () => boolean, max: number) => {
    const end = m.cycles + max;
    while (!cond()) {
      if (m.cycles >= end) throw new Error("BIOS izi: koşul sağlanmadı");
      irq = m.cpu.irq;
      starts.push(m.cycles);
      irqs.push(irq);
      const r0 = m.uart.rxReady;
      const k0 = m.kbd.ready;
      m.step();
      if (!r0 && m.uart.rxReady) rx.push({ t: m.cycles, v: m.uart.rxData });
      if (!k0 && m.kbd.ready) kbd.push({ t: m.cycles, v: m.kbd.data });
    }
  };
  const prompt = () => m.uartOutput.endsWith("> ");
  run(prompt, 1_000_000);
  // klavyeden "b" + Enter (bank göster), UART'tan "I" + CR (Flash kimliği); ikisi arasında zamanlayıcı tıkları
  let n = m.uartOutput.length;
  m.typeText("b\n");
  run(() => m.uartOutput.length > n + 4 && prompt(), 2_000_000);
  n = m.uartOutput.length;
  m.uartSend("i\r");
  run(() => m.uartOutput.length > n + 4 && prompt(), 2_000_000);
  // komut satırına birkaç bayt birden (akış kontrolü: her bayt okunduktan sonra gelir) ve sil
  m.uartSend("xyz\b\b\b");
  m.keyPress([0xe0, 0x75, 0xe0, 0xf0, 0x75]); // yukarı ok basma/bırakma (E0, F0 önekleri)
  const t0 = m.cycles;
  run(() => m.cycles > t0 + 60_000 && !m.kbd.queue.length && !m.uart.rxQueue.length && !m.kbd.ready && !m.uart.rxReady, 1_000_000);
  // erişimleri veriyolu döngülerine çevir: kelime = çift adres + hemen ardından tek adres, aynı komut
  const bus: BusCycle[] = [];
  for (let i = 0; i < raw.length; i++) {
    const x = raw[i];
    const y = raw[i + 1];
    const word = !(x.a & 1) && y !== undefined && y.c === x.c && y.w === x.w && y.a === x.a + 1;
    const prev = bus[bus.length - 1];
    const first = i === 0 || raw[i - 1].c !== x.c;
    bus.push({
      c: first ? x.c : prev.c + 1, // aynı komuttaki sonraki erişim sonraki döngüde
      write: x.w, addr: x.a, word, value: word ? x.v | (y.v << 8) : x.v, irq: first ? x.irq : null,
    });
    if (word) i++;
  }
  return { bus, starts, irqs, rx, kbd, end: m.cycles, screen: m.renderText(), uart: m.uartOutput };
}

// =============================================================================== testler

describe("G/Ç kartı (gc): yapı", () => {
  it("elektriksel kural denetimi temiz; adres çözme yalnız FF00–FF0F", () => {
    const b = new Board();
    buildIoCard(b);
    b.finish();
    expect(erc(b, IO_CARD_INPUTS)).toEqual([]);
    expect(b.chips.every((c) => c.card === "gc")).toBe(true);
    // FF10 (bank), FF20 (video), FF30 (önbellek) okunurken kart veriyolunu sürmez
    const g = ioBench();
    for (const a of [0xff10, 0xff11, 0xff13, 0xff20, 0xff22, 0xff26, 0xff30, 0xff34, 0xff0c, 0xff0f, 0xff40, 0xff80]) {
      expect(g.rd8(a), a.toString(16)).toBe(0xff);
    }
  });
});

describe("G/Ç kartı: UART", () => {
  it("TX: 8N1, LSB önce, bit kenarları 115 200 baud'a yakın; TX_EMPTY tam 347 döngü sonra", { timeout: 30_000 }, () => {
    const g = ioBench();
    const txd = g.track("UART_TXD");
    expect(g.rd8(IO.UART_STAT) & 2).toBe(2);
    const text = "Hi!\n\x00\xff\xa5";
    const starts: number[] = [];
    for (const ch of text) {
      while (!(g.rd8(IO.UART_STAT) & 2));
      const c = g.cycle;
      g.wr8(IO.UART_DATA, ch.charCodeAt(0));
      starts.push(c);
      expect(g.rd8(IO.UART_STAT) & 2).toBe(0);
      g.idleUntil(c + UART_BYTE_CYCLES - 1);
      expect(g.rd8(IO.UART_STAT) & 2, "c + 346").toBe(0);
      expect(g.rd8(IO.UART_STAT) & 2, "c + 347").toBe(2);
    }
    g.idle(400);
    const frames = decodeUart(txd);
    expect(frames.map(([, v]) => String.fromCharCode(v)).join("")).toBe(text);
    // her kenarın ideal yerinden sapması (başlangıç biti yazma darbesinde başlar: c + 5/8)
    let worst = 0;
    for (const [t0] of frames) {
      expect(starts).toContain(t0 - 0.625);
      for (const [t] of txd.filter(([t]) => t > t0 && t < t0 + 9.5 * BIT)) {
        const k = Math.round((t - t0) / BIT);
        worst = Math.max(worst, Math.abs(t - t0 - k * BIT));
      }
    }
    expect(worst).toBeLessThan(0.06 * BIT);
  });

  it("RX: 115 200 ± %2 baud; RTS# = RX_READY, köprü bayt okunana kadar bekler (kayıp yok)", { timeout: 30_000 }, () => {
    for (const bit of [BIT, BIT * 1.02, BIT / 1.02]) {
      const g = ioBench();
      const host = new Ch340(g, bit);
      const text = "Merhaba\x00\xff\x55";
      host.send([...text].map((c) => c.charCodeAt(0)));
      let got = "";
      let lastReady = -1;
      while (got.length < text.length && g.cycle < 40_000) {
        // CPU yavaş: her baytı RX_READY'den 600 döngü sonra okur (köprü bu sürede bekletilir)
        if (g.rd8(IO.UART_STAT) & 1) {
          if (lastReady < 0) lastReady = g.cycle;
          expect(g.get("GC_RXRDY")).toBe(1); // CTS# pasif
          if (g.cycle - lastReady > 600) {
            got += String.fromCharCode(g.rd8(IO.UART_DATA));
            g.idle(1);
            expect(g.rd8(IO.UART_STAT) & 1).toBe(0);
            lastReady = -1;
          }
        }
        g.idle(20);
      }
      expect(got).toBe(text);
      expect(host.waits).toBeGreaterThan(10);
    }
  });

  it("RX gecikmesi: başlangıç biti t döngüsünde düşerse RX_READY t + 334. kenarda", () => {
    const g = ioBench();
    g.idle(10);
    const t = g.cycle + 3;
    uartFrame(g, t + 0.3, 0x5a);
    g.idleUntil(t + RX_LATENCY - 1);
    expect(g.rd8(IO.UART_STAT) & 1).toBe(0);
    expect(g.rd8(IO.UART_STAT) & 1).toBe(1);
    expect(g.rd8(IO.UART_DATA)).toBe(0x5a);
  });
});

describe("G/Ç kartı: PS/2 klavye", () => {
  it("11 bitlik çerçeve, READY, okuyunca silinir; READY iken saat hattı aşağıda (inhibit)", { timeout: 30_000 }, () => {
    for (const period of [PS2_PERIOD, 240, 400]) {
      const g = ioBench();
      g.wr8(IO.IRQ_MASK, 0b0010);
      const kb = new Ps2Keyboard(g, period);
      const codes = textToScancodes("Ab\n");
      codes.push(0xe0, 0x75, 0xe0, 0xf0, 0x75, 0x00, 0xff, 0x80);
      kb.send(codes);
      const got: number[] = [];
      while (got.length < codes.length && g.cycle < 200_000) {
        g.idle(200);
        if (!(g.rd8(IO.KBD_STAT) & 1)) {
          expect(g.irq).toBe(L0);
          continue;
        }
        g.idle(1);
        expect(g.irq).toBe(L1);
        expect(g.rd8(IO.IRQ_SRC)).toBe(1);
        // klavye saati bıraktıktan sonra da hat aşağıda: kart tutuyor
        g.idle(period);
        expect(g.get("PS2_CLK")).toBe(0);
        got.push(g.rd8(IO.KBD_DATA));
        g.idle(1);
        expect(g.get("PS2_CLK")).toBe(1);
        expect(g.rd8(IO.KBD_STAT)).toBe(0);
        expect(g.rd8(IO.IRQ_SRC)).toBe(0xff);
      }
      expect(got).toEqual(codes);
      expect(kb.inhibited).toBeGreaterThan(0);
    }
  });

  it("READY değilken KBD_DATA okumak gelmekte olan çerçeveyi bozmaz", () => {
    const g = ioBench();
    const f10 = ps2Frame(g, g.cycle + 100, 0x1c);
    g.idleUntil(f10 - 5 * PS2_PERIOD);
    g.rd8(IO.KBD_DATA);
    g.idleUntil(f10 + 10);
    expect(g.rd8(IO.KBD_STAT)).toBe(1);
    expect(g.rd8(IO.KBD_DATA)).toBe(0x1c);
  });
});

/** Machine ile adım adım: aynı döngüde aynı erişim; her okuma ve her döngüde IRQ hattı karşılaştırılır */
class Lockstep {
  readonly m = new Machine();
  readonly g = ioBench();
  irqChecks = 0;

  /** Machine'i kapı tezgâhının zamanına getir; video kartının VSYNC_REQ'i Machine'in bayrağından */
  private sync(): void {
    while (this.m.cycles < this.g.cycle) this.m.idle(1);
    this.g.drive("VSYNC_REQ", this.m.video.vsyncFlag ? 1 : 0);
  }

  /** bir döngü: IRQ hattı döngünün başındaki (erişimden önceki) Machine durumuyla karşılaştırılır */
  private step(acc?: Access, machine?: () => void): [number, number] | undefined {
    this.sync();
    const want = this.m.cpu.irq;
    machine?.();
    const r = this.g.step(acc);
    expect(this.g.irq, `IRQ, döngü ${this.g.cycle - 1}`).toBe(want ? L1 : L0);
    this.irqChecks++;
    return r;
  }

  idle(n: number): void {
    for (let i = 0; i < n; i++) this.step();
  }

  rd8(addr: number): number {
    let want = 0;
    const [de, dO] = this.step({ write: false, addr }, () => (want = this.m.read8(addr)))!;
    const got = addr & 1 ? dO : de;
    expect(got, `oku ${addr.toString(16)} @${this.g.cycle - 1}`).toBe(want);
    return got;
  }

  rd16(addr: number): number {
    let want = 0;
    const [de, dO] = this.step({ write: false, addr, word: true }, () => (want = this.m.read8(addr) | (this.m.read8(addr + 1) << 8)))!;
    expect(de | (dO << 8), `oku16 ${addr.toString(16)} @${this.g.cycle - 1}`).toBe(want);
    return want;
  }

  wr8(addr: number, v: number): void {
    this.step({ write: true, addr, value: v }, () => this.m.write8(addr, v));
  }

  wr16(addr: number, v: number): void {
    this.step({ write: true, addr, value: v, word: true }, () => {
      this.m.write8(addr, v & 0xff);
      this.m.write8(addr + 1, v >> 8);
    });
  }
}

describe("G/Ç kartı: zamanlayıcı ve kesme denetleyicisi (Machine ile döngü döngüsüne)", () => {
  it("1 kHz tık, 0'da yeniden yükleme, EXPIRED (1 yazınca silinir)", { timeout: 30_000 }, () => {
    const s = new Lockstep();
    s.wr8(IO.TIMER_RELOAD, 3);
    s.wr8(IO.TIMER_RELOAD + 1, 0);
    s.wr8(IO.TIMER_CTRL, 1);
    s.idle(TICK_CYCLES * 2 + 10);
    expect(s.rd8(IO.TIMER_STAT)).toBe(0);
    s.idle(TICK_CYCLES);
    expect(s.rd8(IO.TIMER_STAT)).toBe(1);
    expect(s.rd8(IO.IRQ_PEND) & 1).toBe(0);
    s.wr8(IO.TIMER_STAT, 1);
    expect(s.rd8(IO.TIMER_STAT)).toBe(0);
    s.idle(TICK_CYCLES * 3);
    expect(s.rd8(IO.TIMER_STAT)).toBe(1);
    // tık kenarına göre her konumda okuma / açma / silme (tıktan önceki, aynı ve sonraki döngü)
    const tick = Math.ceil(s.g.cycle / TICK_CYCLES) * TICK_CYCLES + TICK_CYCLES;
    s.wr8(IO.TIMER_CTRL, 0);
    s.wr16(IO.TIMER_RELOAD, 1);
    for (const d of [-2, -1, 0, 1]) {
      const t = tick + (d + 2) * TICK_CYCLES;
      s.idle(t + d - 1 - s.g.cycle);
      s.wr8(IO.TIMER_STAT, 1);
      s.wr8(IO.TIMER_CTRL, 3);
      s.rd8(IO.TIMER_STAT);
      s.idle(3);
      s.rd8(IO.TIMER_STAT);
      s.wr8(IO.TIMER_CTRL, 0);
    }
  });

  it("IRQ_PEND, IRQ_MASK (reset 0), IRQ_SRC (74HC148, yoksa 0xFF), IRQ = OR(bekleyen ∧ maske)", () => {
    const g = ioBench();
    expect(g.rd8(IO.IRQ_SRC)).toBe(0xff);
    expect(g.rd8(IO.IRQ_MASK)).toBe(0);
    g.wr8(IO.TIMER_RELOAD, 1);
    g.wr8(IO.TIMER_CTRL, 3);
    new Ps2Keyboard(g).send([0x1c]);
    new Ch340(g).send([0x78]);
    g.idleUntil(TICK_CYCLES + 10);
    expect(g.rd8(IO.IRQ_PEND)).toBe(0b0111);
    expect(g.rd8(IO.IRQ_SRC)).toBe(0xff); // maske kapalı
    expect(g.irq).toBe(L0);
    g.wr8(IO.IRQ_MASK, 0b0011);
    g.idle(1);
    expect(g.irq).toBe(L1);
    expect(g.rd8(IO.IRQ_SRC)).toBe(1);
    g.wr8(IO.IRQ_MASK, 0b1111);
    expect(g.rd8(IO.IRQ_MASK)).toBe(0b1111);
    expect(g.rd8(IO.IRQ_SRC)).toBe(2);
    g.rd8(IO.UART_DATA);
    expect(g.rd8(IO.IRQ_SRC)).toBe(1);
    g.rd8(IO.KBD_DATA);
    expect(g.rd8(IO.IRQ_SRC)).toBe(0);
    g.wr8(IO.TIMER_STAT, 1);
    expect(g.rd8(IO.IRQ_SRC)).toBe(0xff);
    expect(g.irq).toBe(L0);
    // vsync isteği (video kartından) kaynak 3
    g.drive("VSYNC_REQ", 1);
    g.idle(1);
    expect(g.rd8(IO.IRQ_PEND)).toBe(0b1000);
    expect(g.rd8(IO.IRQ_SRC)).toBe(3);
    expect(g.irq).toBe(L1);
  });

  it("rastgele erişimler: her okuma ve her döngüde IRQ Machine ile aynı", { timeout: 60_000 }, () => {
    const s = new Lockstep();
    let seed = 12345;
    const rnd = (n: number) => {
      // mulberry32
      seed = (seed + 0x6d2b79f5) >>> 0;
      let t = seed;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) % n;
    };
    for (let i = 0; i < 1500; i++) {
      const a = 0xff00 + rnd(16);
      const v = rnd(4) === 0 ? 0xff : rnd(256);
      switch (rnd(6)) {
        case 0: case 1: s.rd8(a); break;
        case 2:
          // kelime okuması: FF00/FF02 çiftinde yan etki sırası farklıdır (belgede), onlar bayt okunur
          if (a < 0xff04) s.rd8(a);
          else s.rd16(a & ~1);
          break;
        case 3:
          // zamanlayıcıyı sık bitir: küçük RELOAD
          if ((a & ~1) === IO.TIMER_RELOAD) s.wr16(IO.TIMER_RELOAD, rnd(4));
          else s.wr8(a, v);
          break;
        case 4: s.wr16(a & ~1, v | (rnd(256) << 8)); break;
        default: s.idle(rnd(3) ? rnd(40) : rnd(10_000));
      }
    }
    expect(s.irqChecks).toBeGreaterThan(200_000);
  });
});

describe("G/Ç kartı: BIOS izinin kapı seviyesinde tekrarı", () => {
  it("açılış + klavye + UART + zamanlayıcı: her G/Ç okuması ve IRQ hattı Machine ile aynı", { timeout: 60_000 }, () => {
    const tr = biosTrace();
    expect(tr.screen).toContain("CPU16 BIOS v1");
    expect(tr.uart).toContain("SST39SF010");
    expect(tr.rx.length).toBeGreaterThanOrEqual(8);
    expect(tr.kbd.length).toBeGreaterThanOrEqual(10);

    const g = ioBench();
    const errors: string[] = [];
    const err = (s: string) => {
      if (errors.length < 10) errors.push(s);
    };
    // seri dalga biçimleri: Machine'in "hazır" anlarına göre
    for (const { t, v } of tr.rx) {
      const start = t - RX_LATENCY + 0.5;
      g.at(start, () => {
        if (g.get("GC_RXRDY")) err(`UART ${t}: CTS# pasifken çerçeve`);
      });
      uartFrame(g, start, v, 34.7);
    }
    // video kartının dikey tarama isteği (BIOS VSTAT'a yazmaz: ilk vblank'ten sonra hep 1)
    g.at(VBLANK_START, () => g.drive("VSYNC_REQ", 1));
    for (const { t, v } of tr.kbd) {
      const f0 = t + 0.25 - 10 * PS2_PERIOD;
      g.at(f0 - PS2_PERIOD / 2, () => {
        if (!g.get("PS2_CLK")) err(`PS/2 ${t}: saat hattı inhibit iken çerçeve`);
      });
      ps2Frame(g, f0, v);
    }
    let si = 0;
    let reads = 0;
    let irqChecks = 0;
    const checkStart = () => {
      const c = g.cycle - 1;
      while (si < tr.starts.length && tr.starts[si] < c) si++;
      if (tr.starts[si] !== c) return;
      irqChecks++;
      if ((g.irq === L1) !== tr.irqs[si]) err(`IRQ @${c}: kapı ${g.irq}, Machine ${tr.irqs[si]}`);
    };
    for (const x of tr.bus) {
      while (g.cycle < x.c) {
        g.step();
        checkStart();
      }
      const r = g.step({ write: x.write, addr: x.addr, word: x.word, value: x.value });
      checkStart();
      if (x.irq !== null && (g.irq === L1) !== x.irq) err(`IRQ (erişim) @${x.c}`);
      if (r) {
        reads++;
        const got = x.word ? r[0] | (r[1] << 8) : x.addr & 1 ? r[1] : r[0];
        if (got !== x.value) err(`${x.addr.toString(16)} @${x.c}: kapı ${got.toString(16)}, Machine ${x.value.toString(16)}`);
      }
    }
    while (g.cycle < tr.end) {
      g.step();
      checkStart();
    }
    expect(errors).toEqual([]);
    expect(reads).toBeGreaterThan(500);
    expect(irqChecks).toBe(tr.starts.length);
    expect(tr.irqs.filter((x) => x).length).toBeGreaterThan(20); // kesme anları da karşılaştırıldı
  });
});

// =============================================================================== KiCad

/** Tek başına anakart G/Ç + video kartları (arka panel konnektörüyle) */
function standaloneBoard(): Board {
  const b = new Board();
  buildIoCard(b);
  b.finish();
  return b;
}
const KICAD_CARDS = [
  { card: "gc", title: "CPU16 — Anakart G/Ç kartı (UART, PS/2, zamanlayıcı, kesme)" },
];

// KiCad kuruluysa (CI'da değil): şemayı geçici bir dizine yaz, kicad-cli'ye netlist'ini çıkart, kartın netleriyle karşılaştır
const hasKicad = (() => {
  try {
    execFileSync("kicad-cli", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe("anakart kartları: KiCad şeması", () => {
  const board = standaloneBoard();
  it("şema her çipi ve pasifi içerir; arka panel konnektörü paylaşılan pinlerde", () => {
    for (const { card, title } of KICAD_CARDS) {
      const sch = cardSchematic(board, card, { project: card, title, paper: "A1", date: "2026-10-11" });
      const tree = parseSExpr(sch) as SExpr[];
      const syms = tree.filter((x) => Array.isArray(x) && x[0] === "symbol");
      expect(syms.length).toBe(board.chips.filter((c) => c.card === card).length + board.passives.filter((p) => p.card === card).length);
      const bp = board.passives.find((p) => p.card === card && p.part === "BACKPLANE_2x32")!;
      for (const [num, name] of Object.entries(BACKPLANE)) {
        if (bp.pins[num] !== undefined) expect(board.netName(bp.pins[num])).toBe(name);
      }
    }
  });

  it.skipIf(!hasKicad)("kicad-cli netlist'i = kartın netleri", { timeout: 60_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "cpu16-anakart-"));
    writeFileSync(join(dir, "cpu16.kicad_sym"), kicadSymbolLibrary([...CHIPS, ...Object.values(PASSIVES)]));
    for (const { card, title } of KICAD_CARDS) {
      mkdirSync(join(dir, card));
      const sch = join(dir, card, `${card}.kicad_sch`);
      writeFileSync(sch, cardSchematic(board, card, { project: card, title, paper: "A1", date: "2026-10-11" }));
      writeFileSync(join(dir, card, `${card}.kicad_pro`), kicadProject(card));
      writeFileSync(join(dir, card, "sym-lib-table"), SYM_LIB_TABLE);
      const out = join(dir, card, `${card}.net`);
      execFileSync("kicad-cli", ["sch", "export", "netlist", "-o", out, sch], { stdio: "ignore" });
      const tree = parseSExpr(readFileSync(out, "utf8")) as SExpr[];
      const nets = (tree.find((x) => Array.isArray(x) && x[0] === "nets") as SExpr[]).slice(1) as SExpr[][];
      const kicad = new Set<string>();
      for (const net of nets) {
        const pins = (net.filter((x) => Array.isArray(x) && x[0] === "node") as SExpr[][]).map((nd) => {
          const ref = (nd.find((x) => Array.isArray(x) && x[0] === "ref") as string[])[1];
          const pin = (nd.find((x) => Array.isArray(x) && x[0] === "pin") as string[])[1];
          return `${ref}.${pin}`;
        });
        if (pins.length > 1) kicad.add(pins.sort().join(" "));
      }
      const ours = new Map<number, string[]>();
      const add = (net: number, pin: string) => ours.set(net, [...(ours.get(net) ?? []), pin]);
      for (const ci of board.chips.filter((c) => c.card === card)) {
        for (const p of ci.def.pins) if (ci.nets[p.name] !== undefined) add(ci.nets[p.name], `${ci.ref}.${p.num}`);
      }
      for (const p of board.passives.filter((x) => x.card === card)) {
        for (const [num, net] of Object.entries(p.pins)) add(net, `${p.ref}.${num}`);
      }
      const mine = new Set([...ours.values()].filter((v) => v.length > 1).map((v) => v.sort().join(" ")));
      expect([...mine].filter((x) => !kicad.has(x)).slice(0, 3), card).toEqual([]);
      expect([...kicad].filter((x) => !mine.has(x)).slice(0, 3), card).toEqual([]);
    }
  });
});
