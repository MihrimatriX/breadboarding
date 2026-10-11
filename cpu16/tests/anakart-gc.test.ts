// Anakart G/Ç kartı (gc), video kartı ve kendin yap bellek kartı (kyb): kapı seviyesi testler.
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
import { Board, erc, type ChipInstance } from "../board/board.ts";
import { IO_CARD_INPUTS, buildIoCard } from "../board/io-card.ts";
import { SYM_LIB_TABLE, cardSchematic, kicadProject } from "../board/kicad-sch.ts";
import { KYB_CARD_INPUTS, buildKybCard } from "../board/kyb-card.ts";
import { anakartYanlisYollar, buildFullMachineBoard } from "../board/machine-board.ts";
import { BACKPLANE, PASSIVES } from "../board/passives.ts";
import { VIDEO_CARD_INPUTS, buildVideoCard, type VideoCard } from "../board/video-card.ts";
import { zamanlamaAnalizi, type Kose } from "../board/zamanlama.ts";
import { kicadSymbolLibrary, parseSExpr, type SExpr } from "../chips/kicad.ts";
import { CHIPS } from "../chips/library.ts";
import { L0, L1, LogicSim, type Level } from "../chips/logic.ts";
import type { MemoryHandle } from "../chips/parts/memory.ts";
import { textToScancodes } from "../emu/devices/keyboard.ts";
import { FRAME_CYCLES, IO, KYB_SIZE, Machine, TICK_CYCLES, UART_BYTE_CYCLES, VBLANK_START } from "../emu/machine.ts";
import { FONT_8X16 } from "../video/font.ts";
import { CGA_PALETTE } from "../../src/cpu16/vga.ts";

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
  /** kenar yerleştikten sonra (örnekleme) */
  after?(): void;
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
  /** son döngüde, yazma darbesinden hemen önce (k + 5/8) okunan IRQ hattı (yalnız video kartında VSYNC_REQ) */
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
    this.clk = ["CLK", "TCLK"].filter((x) => this.b.has(x)).map((x) => this.n(x));
    // IRQ hattı (G/Ç kartı) ya da yalnız video kartında VSYNC_REQ
    this.irqNet = this.b.has("IRQ") ? this.n("IRQ") : this.b.has("VSYNC_REQ") ? this.n("VSYNC_REQ") : -1;
    for (const [name, v] of [["~RESET", 0], ["~IO", 1], ["~MRD", 1], ["~MWE_E", 1], ["~MWE_O", 1]] as const) if (this.b.has(name)) this.drive(name, v);
    for (const net of this.clk) this.sim.drive(net, L0);
    for (let i = 0; i < 8; i++) if (this.b.has(`A${i}`)) this.drive(`A${i}`, 0); // kyb kartı A0 kullanmaz
    if (this.b.has("UART_RXD")) this.drive("UART_RXD", 1);
    if (this.b.has("VID_OSC")) this.drive("VID_OSC", 0);
    if (this.b.has("VSYNC_REQ") && !this.b.chips.some((c) => c.card === "video")) this.drive("VSYNC_REQ", 0);
    this.sim.settle();
    // güç açılışı: flip-flop'lar 0 (GateComputer gibi; gerçekte rastgele, reset tanımlı olanları düzeltir).
    this.setFlipFlops(range(this.b.c.gates.length).filter((i) => ["DFF", "LATCH"].includes(this.b.c.gates[i].kind)), () => L0);
    // reset −1. döngüde bırakılır: resetten sonraki ilk TCLK kenarı 0. kenardır, ön bölücü orada 96
    // yükler (GC_RSTD; gerçek saat kartında TCLK reset boyunca durur ve ilk kenarı 0. döngüdedir),
    // tıklar 4000k kenarlarında (Machine: TICK_CYCLES'ın katları)
    if (this.b.has("~RESET")) this.at(-0.75, () => this.drive("~RESET", 1));
    while (this.cycle < 0) this.step();
  }

  /**
   * Flip-flop'ların iç durumunu ayarla (yalnız simülasyon: güç açılışı, sayaç başlangıcı). Saatler
   * sabitken yapılmalıdır, yoksa X → 1 geçişi "belki kenar" sayılır; dalgalı sayaçlarda bir basamağın
   * saati öncekinin çıkışı olduğundan, durumlar değişmez olana kadar tekrarlanır (asenkron
   * preset/clear'i etkin olanlar onun dediğinde kalır).
   */
  setFlipFlops(gates: number[], value: (k: number) => Level): void {
    let prev = "";
    for (let pass = 0; pass < 12; pass++) {
      gates.forEach((x, k) => this.sim.setState(x, value(k)));
      this.sim.settle();
      const now = gates.map((x) => this.sim.stateOf(x)).join("");
      if (now === prev) return;
      prev = now;
    }
    throw new Error("flip-flop'lar yerleşmedi");
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
        this.settle();
        src.after?.();
        continue;
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
      for (let i = 0; i < 8; i++) if (this.b.has(`A${i}`)) this.drive(`A${i}`, (acc.addr >> i) & 1);
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
    this.edge(L0);
    // IRQ (ya da VSYNC_REQ) yazma darbesinden hemen önce örneklenir
    this.flush(k + 0.625);
    if (this.irqNet >= 0) this.irq = this.sim.get(this.irqNet);
    if (acc?.write) {
      const even = acc.word || !(acc.addr & 1);
      const odd = acc.word || acc.addr & 1;
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
  // klavyeden "b" + Enter (bank göster), UART'tan "I" + CR (EEPROM yazma koruması); ikisi arasında zamanlayıcı tıkları
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
  readonly g: Bench;
  irqChecks = 0;
  /** video kartı tezgâhı: IRQ yerine VSYNC_REQ, Machine'de vsyncFlag */
  private readonly video: boolean;

  constructor(g?: Bench) {
    this.g = g ?? ioBench();
    this.video = !this.g.b.has("IRQ");
  }

  /** Machine'i kapı tezgâhının zamanına getir; G/Ç kartında video kartının VSYNC_REQ'i Machine'in bayrağından */
  private sync(): void {
    while (this.m.cycles < this.g.cycle) this.m.idle(1);
    if (!this.video) this.g.drive("VSYNC_REQ", this.m.video.vsyncFlag ? 1 : 0);
  }

  /** bir döngü: IRQ hattı döngünün başındaki (erişimden önceki) Machine durumuyla karşılaştırılır */
  private step(acc?: Access, machine?: () => void): [number, number] | undefined {
    this.sync();
    const want = this.video ? this.m.video.vsyncFlag : this.m.cpu.irq;
    machine?.();
    const r = this.g.step(acc);
    expect(this.g.irq, `${this.video ? "VSYNC_REQ" : "IRQ"}, döngü ${this.g.cycle - 1}`).toBe(want ? L1 : L0);
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
    expect(got, `oku ${addr.toString(16)} @${this.g.cycle - 1} (Machine ${this.m.cycles})`).toBe(want);
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

  it("IRQ_PEND, IRQ_MASK (reset 0), IRQ_SRC (öncelik kapıları, yoksa 0xFF), IRQ = OR(bekleyen ∧ maske)", () => {
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
    expect(tr.uart).toContain("EEPROM 28C256");
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

// =============================================================================== kendin yap bellek

describe("kendin yap bellek kartı (kyb): 16 bayt, her bayt bir 74HC574", () => {
  it("yapı: ERC temiz; 4 × 74HC138, 2 × 74HC245, 16 × 74HC574; adres çözme yalnız FF40–FF4F", () => {
    const b = new Board();
    const card = buildKybCard(b);
    b.finish();
    expect(erc(b, KYB_CARD_INPUTS)).toEqual([]);
    expect(b.summary().kyb).toEqual({ "74HC138": 4, "74HC245": 2, "74HC574": 16 });
    expect(card.bytes.map((c) => c.def.part)).toEqual(Array(16).fill("74HC574"));
    // tek başına kart: FF4x dışında veriyoluna hiç sürmez (çekme dirençleri: 0xFF)
    const g = new Bench((x) => buildKybCard(x));
    for (let a = 0; a < 16; a++) g.wr8(0xff40 + a, 0x10 + a);
    for (const a of [0xff00, 0xff20, 0xff30, 0xff3f, 0xff50, 0xff5f, 0xffc0, 0xffcf]) {
      g.wr8(a, 0);
      expect(g.rd16(a & ~1), a.toString(16)).toBe(0xffff);
    }
    for (let a = 0; a < 16; a++) expect(g.rd8(0xff40 + a), `bayt ${a}`).toBe(0x10 + a);
  });

  it("G/Ç kartıyla birlikte, Machine ile döngü döngüsüne: kelime/bayt yazma ve okuma, geri okuma", () => {
    const s = new Lockstep(new Bench((b) => {
      buildIoCard(b);
      buildKybCard(b);
    }));
    const gap = () => s.idle(5); // G/Ç komutu 6 döngü
    // kelime yazması: iki bayt birlikte (çift DE, tek DO)
    for (let k = 0; k < 8; k++) {
      s.wr16(IO.KYB + 2 * k, 0x0101 * (k + 1) ^ 0xa55a);
      gap();
    }
    for (let a = 0; a < KYB_SIZE; a += 2) {
      s.rd16(IO.KYB + a);
      gap();
    }
    for (let a = 0; a < KYB_SIZE; a++) {
      s.rd8(IO.KYB + a);
      gap();
    }
    // bayt yazması yalnız kendi şeridini değiştirir
    s.wr8(IO.KYB + 5, 0x3c);
    gap();
    s.wr8(IO.KYB + 10, 0xc3);
    gap();
    for (let a = 0; a < KYB_SIZE; a += 2) {
      s.rd16(IO.KYB + a);
      gap();
    }
    // rastgele erişimler (sabit tohum)
    let seed = 12345;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) >> 8) % n;
    for (let i = 0; i < 300; i++) {
      const a = IO.KYB + rnd(KYB_SIZE);
      switch (rnd(4)) {
        case 0: s.wr8(a, rnd(256)); break;
        case 1: s.wr16(a & ~1, rnd(65536)); break;
        case 2: s.rd8(a); break;
        default: s.rd16(a & ~1);
      }
      s.idle(rnd(3) ? 5 : 5 + rnd(20));
    }
    // sonda bütün içerik Machine'deki kopya ile aynı
    for (let a = 0; a < KYB_SIZE; a += 2) expect(s.rd16(IO.KYB + a)).toBe(s.m.kyb[a] | (s.m.kyb[a + 1] << 8));
  });
});

// =============================================================================== video kartı

/** Piksel saati periyodu (CPU döngüsü): bir kare = 420 000 piksel saati = FRAME_CYCLES (Machine) */
const PIXELS_PER_FRAME = 800 * 525;

interface VideoBench {
  g: Bench;
  card: VideoCard;
  /** bir sonraki piksel saati yükselen kenarının numarası */
  pixel(): number;
}

/**
 * Piksel saatinin TCLK'ye göre fazı (döngü). Gerçekte iki osilatör bağımsızdır; Machine vblank'i
 * tam döngüye yuvarlar (VBLANK_START = 60 953, kare başı 66 667k). Kartta vblank 384 000. piksel
 * kenarında (kare başından 60 952,84 döngü sonra) başlar, 420 000. kenarda biter; faz bu iki anı
 * Machine'in döngülerine denk getirir (okuma döngü sonunda, IRQ k + 5/8'de örneklenir): [0,16; 0,625).
 */
const PIXEL_PHASE = 0.4;

/**
 * Tezgâhın sayımıyla (n = k + 1, hc = n mod 800) görünür piksel x, hc = x + 17'de çıkar. Kartın
 * kendi sayacında x, hc = x + 16'dadır (karakter j, j + 2 boyunca gösterilir: karakter ROM'undan
 * sonra font register'ı; video-card.ts); açılışta faz sayacı p7'de olduğundan kartın hc'si
 * tezgâhınkinden bir eksiktir. Senkronlar da aynı kenardan geçtiği için VGA zamanlaması görünür
 * alana göre standarttır.
 */
const GOSTERIM = 17;

/**
 * Video kartı tezgâhı. Piksel saatinin k. yükselen kenarı PIXEL_PHASE + k · FRAME_CYCLES / 420 000
 * anında: kare tam olarak Machine'in 66 667 döngüsü. `onPixel(k)` her yükselen kenardan sonra
 * çağrılır (k + 1 = kenardan sonraki sayaç konumu).
 */
function videoBench(onPixel?: (k: number, g: Bench) => void): VideoBench {
  let card!: VideoCard;
  const g = new Bench((b) => (card = buildVideoCard(b)));
  (card.fontRom.handle as MemoryHandle).data.set(FONT_8X16);
  const osc = g.n("VID_OSC");
  let k = 0;
  let high = false;
  g.sources.push({
    next: PIXEL_PHASE,
    fire() {
      high = !high;
      g.sim.drive(osc, high ? L1 : L0);
    },
    after() {
      if (high) {
        onPixel?.(k, g);
        this.next = PIXEL_PHASE + ((2 * k + 1) * FRAME_CYCLES) / (2 * PIXELS_PER_FRAME);
      } else {
        k++;
        this.next = PIXEL_PHASE + (k * FRAME_CYCLES) / PIXELS_PER_FRAME;
      }
    },
  });
  return { g, card, pixel: () => k };
}

/** Kartın IRGB çıkışı (I = bit 3, R, G, B = bit 0) */
const irgb = (g: Bench) => (g.get("V_I") << 3) | (g.get("V_R") << 2) | (g.get("V_G") << 1) | g.get("V_B");

/** Machine'in çizicisiyle (src/cpu16/vga.ts) aynı kural: görünür (x, y) pikselinin rengi */
function refPixel(vram: Uint8Array, cursor: number, x: number, y: number): number {
  const cell = (y >> 4) * 80 + (x >> 3);
  const r = y & 15;
  const bits = cell === cursor && r >= 14 ? 0xff : FONT_8X16[vram[cell * 2] * 16 + r];
  const at = vram[cell * 2 + 1];
  return bits & (0x80 >> (x & 7)) ? at & 15 : at >> 4;
}

/** Deneme ekranı: başlık çubuğu + bütün karakter kodları ve bütün renk baytları */
function testScreen(): Uint8Array {
  const v = new Uint8Array(4800);
  const title = " CPU16 BIOS v1".padEnd(80);
  for (let i = 0; i < 2400; i++) {
    v[2 * i] = i < 80 ? title.charCodeAt(i) : (i * 5 + (i >> 7)) & 0xff;
    v[2 * i + 1] = i < 80 ? 0x1f : (i * 7 + (i >> 8)) & 0xff;
  }
  return v;
}

/** Ekran DAC'ı: renk biti 680 Ω, parlaklık 1,3 kΩ, 75 Ω monitör girişine (5 V çıkış) */
const dac = (hi: number, lo: number) => (5 * (hi / 680 + lo / 1300)) / (1 / 680 + 1 / 1300 + 1 / 75);

describe("video kartı: yapı", () => {
  it("elektriksel kural denetimi temiz; adres çözme yalnız FF20–FF2F", () => {
    const b = new Board();
    buildVideoCard(b);
    b.finish();
    expect(erc(b, VIDEO_CARD_INPUTS)).toEqual([]);
    expect(b.chips.every((c) => c.card === "video")).toBe(true);
    const { g } = videoBench();
    for (const a of [0xff00, 0xff01, 0xff08, 0xff0a, 0xff10, 0xff20, 0xff21, 0xff27, 0xff2f, 0xff30, 0xff40]) {
      expect(g.rd8(a), a.toString(16)).toBe(0xff);
    }
  });
});

describe("video kartı: CPU portu ve tarama (Machine ile döngü döngüsüne)", () => {
  it("ekran port üzerinden yazılır ve geri okunur; sonraki kare IRGB = font/renk referansı; HSYNC/VSYNC; VSTAT", { timeout: 60_000 }, () => {
    const F = 1; // karşılaştırılan kare (0. karede ekran yazılıyor)
    const shot = new Uint8Array(PIXELS_PER_FRAME); // IRGB | HSYNC << 4 | VSYNC << 5
    const dacSeen = new Map<number, string>();
    const vb = videoBench((k, g) => {
      const n = k + 1;
      if (Math.floor(n / PIXELS_PER_FRAME) !== F) return;
      const c = irgb(g);
      shot[n % PIXELS_PER_FRAME] = c | (g.get("VGA_HSYNC") << 4) | (g.get("VGA_VSYNC") << 5);
      if (!dacSeen.has(c)) dacSeen.set(c, ["V_R", "V_I", "V_GH", "V_GL", "V_B"].map((x) => g.get(x)).join(""));
    });
    const s = new Lockstep(vb.g);
    const { m, g } = s;
    const gap = () => s.idle(5); // G/Ç komutu 6 döngü: erişimler en az 6 döngü arayla

    s.wr8(IO.VCTRL, 1);
    s.wr8(IO.CURSOR_X, 37);
    s.wr8(IO.CURSOR_Y, 21);
    for (const a of [IO.VCTRL, IO.CURSOR_X, IO.CURSOR_Y, IO.VADDR, IO.VADDR + 1, IO.VSTAT]) s.rd8(a);
    s.rd16(IO.CURSOR_X);
    // ekranı yaz: VADDR = 0 (kelime), 4800 × VDATA
    const scr = testScreen();
    s.wr16(IO.VADDR, 0);
    gap();
    for (const v of scr) {
      s.wr8(IO.VDATA, v);
      gap();
    }
    // VRAM'in kendisi Machine'inkiyle aynı (iki şerit)
    const lane = (ci: ChipInstance) => (ci.handle as MemoryHandle).data;
    for (let a = 0; a < 4800; a++) expect(lane(a & 1 ? vb.card.vramAttr : vb.card.vramChar)[a >> 1], `VRAM ${a}`).toBe(m.video.vram[a]);
    // ön okuma: her VDATA okuması aynı veriyolu döngüsünde VRAM[VADDR]
    for (const start of [0, 1, 161, 2399, 4790]) {
      s.wr16(IO.VADDR, start);
      gap();
      for (let j = 0; j < 12; j++) {
        s.rd8(IO.VDATA);
        gap();
      }
    }
    // yalnız düşük / yüksek bayt, sonra okuma ve yazma karışık; kelime okuması (VDATA + VCTRL)
    s.wr8(IO.VADDR, 0x40);
    gap();
    s.wr8(IO.VADDR + 1, 0x01);
    gap();
    for (let j = 0; j < 6; j++) {
      s.rd8(IO.VDATA);
      gap();
      s.wr8(IO.VDATA, 0x41 + j);
      gap();
      s.rd16(IO.VDATA);
      gap();
    }
    s.wr16(IO.VADDR, 0x1ffe); // 13 bit: sondan başa sarar
    gap();
    for (let j = 0; j < 4; j++) {
      s.rd8(IO.VDATA);
      gap();
    }
    // VSTAT: vblank başlangıcında (60 952) her döngü; bayrak 1 yazınca silinir; kare sonu
    s.idle(VBLANK_START - 6 - g.cycle);
    for (let j = 0; j < 12; j++) s.rd8(IO.VSTAT);
    s.wr8(IO.VSTAT, 1); // bit1 = 0: silmez
    s.rd8(IO.VSTAT);
    s.wr8(IO.VSTAT, 2);
    for (let j = 0; j < 3; j++) s.rd8(IO.VSTAT);
    s.idle(FRAME_CYCLES - 5 - g.cycle);
    for (let j = 0; j < 10; j++) s.rd8(IO.VSTAT);
    // 1. kare boyunca dokunma (VSYNC_REQ her döngü karşılaştırılıyor), ikinci vblank'te bayrak yine
    s.idle((F + 1) * FRAME_CYCLES + 2 - g.cycle);
    expect(s.rd8(IO.VSTAT)).toBe(2);
    expect(m.video.frames).toBe(2);
    const fc = vb.card.frames.nets;
    const count = ["1Q0", "1Q1", "1Q2", "1Q3", "2Q0"].reduce((a, p, i) => a | (g.sim.get(fc[p]) << i), 0);
    expect(count, "kare sayacı").toBe(m.video.frames);
    expect(s.irqChecks).toBeGreaterThan(130_000);

    // kare F: görünür alan referansla aynı, dışı siyah; senkronlar
    const cursor = m.video.cursorVisible ? m.video.cursorY * 80 + m.video.cursorX : -1;
    expect(cursor).toBe(21 * 80 + 37);
    const bad: string[] = [];
    for (let vc = 0; vc < 525; vc++) {
      for (let hc = 0; hc < 800; hc++) {
        const v = shot[vc * 800 + hc];
        const x = hc - GOSTERIM;
        const want = x >= 0 && x < 640 && vc < 480 ? refPixel(m.video.vram, cursor, x, vc) : 0;
        if ((v & 15) !== want && bad.length < 5) bad.push(`(${x}, ${vc}): ${v & 15} ≠ ${want}`);
        const hs = hc >= 656 + GOSTERIM && hc < 752 + GOSTERIM ? 0 : 1;
        const pos = vc * 800 + hc;
        const vs = pos >= 490 * 800 + GOSTERIM && pos < 492 * 800 + GOSTERIM ? 0 : 1;
        if (((v >> 4) & 1) !== hs && bad.length < 5) bad.push(`HSYNC (${hc}, ${vc})`);
        if (((v >> 5) & 1) !== vs && bad.length < 5) bad.push(`VSYNC (${hc}, ${vc})`);
      }
    }
    expect(bad).toEqual([]);
    // DAC: 16 rengin hepsi göründü; gerilimler CGA paletiyle aynı (0,7 V = 0xFF)
    expect(dacSeen.size).toBe(16);
    for (const [c, bits] of dacSeen) {
      const [r, i, gh, gl, b] = [...bits].map(Number);
      const want = CGA_PALETTE[c];
      const volts = [dac(r, i), dac(gh, gl), dac(b, i)];
      [want >> 16, (want >> 8) & 0xff, want & 0xff].forEach((comp, k) => {
        expect(Math.abs(volts[k] - (comp / 255) * 0.72), `renk ${c} bileşen ${k}`).toBeLessThan(0.02);
      });
    }
  });
});

describe("video kartı: imleç", () => {
  /** İmleç (5, 0) ve 0. karakter satırının tarama satırları; kare sayacı başlangıcı ayarlanabilir */
  function cursorRow(o: { vctrl: number; frames: number }): number[][] {
    const rows: number[][] = Array.from({ length: 16 }, () => Array(48).fill(-1));
    const vb = videoBench((k, g) => {
      const n = k + 1;
      const hc = n % 800;
      const vc = Math.floor(n / 800);
      if (vc < 16 && hc >= GOSTERIM && hc < 48 + GOSTERIM) rows[vc][hc - GOSTERIM] = irgb(g);

    });
    const { g, card } = vb;
    // kare sayacı (74HC393) başlangıç değeri: simülasyonda doğrudan (gerçekte güç açılışında rastgele)
    const ffs = range(card.frames.gates[1] - card.frames.gates[0]).map((i) => card.frames.gates[0] + i)
      .filter((x) => g.b.c.gates[x].kind === "DFF");
    g.setFlipFlops(ffs, (i) => ((o.frames >> i) & 1) as Level);
    // VRAM doğrudan doldurulur (tarama başlamadan); hücre 5: "_", sarı / mavi
    (card.vramChar.handle as MemoryHandle).data[5] = "_".charCodeAt(0);
    (card.vramAttr.handle as MemoryHandle).data[5] = 0x1e;
    g.wr8(IO.CURSOR_X, 5);
    g.idle(5);
    g.wr8(IO.CURSOR_Y, 0);
    g.idle(5);
    g.wr8(IO.VCTRL, o.vctrl);
    while (vb.pixel() < 16 * 800 + 64) g.step();
    return rows;
  }

  it("açıkken tarama satırı 14–15 yazı renginde; kapalıyken ve yanıp sönmenin sönük yarısında görünmez", { timeout: 30_000 }, () => {
    const glyph = (r: number, x: number) => (FONT_8X16["_".charCodeAt(0) * 16 + r] & (0x80 >> (x & 7)) ? 0xe : 0x1);
    const cell = (rows: number[][], cursor: boolean) => {
      for (let r = 0; r < 16; r++) {
        for (let x = 0; x < 48; x++) {
          const inCell = x >= 40;
          const want = !inCell ? 0 : cursor && r >= 14 ? 0xe : glyph(r, x);
          expect(rows[r][x], `satır ${r}, x ${x}`).toBe(want);
        }
      }
    };
    cell(cursorRow({ vctrl: 1, frames: 0 }), true);
    cell(cursorRow({ vctrl: 1, frames: 15 }), true); // 0–15: yanık
    cell(cursorRow({ vctrl: 1, frames: 16 }), false); // 16–31: sönük
    cell(cursorRow({ vctrl: 0, frames: 0 }), false);
  });
});

describe("video kartı: statik zamanlama (bütün anakartta)", () => {
  // Piksel saatinde yalnızca faz sayacı (74AC161), H2 / LD7 register'ı (74AC74) ve kaydırıcı çalışır;
  // geri kalan her şey karakter saatinde (H2 = piksel / 8). İki alan arasındaki geçişler elle
  // hesaplanmıştır (cpu16/docs/anakart-gc-video.md, "Statik zamanlama").
  const { board } = buildFullMachineBoard();
  const analiz = (kose: Kose) =>
    zamanlamaAnalizi(board, {
      kokler: [{ net: "VID_OSC", ad: "piksel saati" }, { net: "V_H2", ad: "karakter saati" }],
      kose,
      kapali: anakartYanlisYollar(board),
    });
  const m = analiz("maks");
  const t = analiz("tip");
  const PIKSEL_MHZ = 25.175;

  it("piksel saati en kötü ve tipik değerlerle 25,175 MHz'e sığar; kapılı saat yok", () => {
    for (const r of [m, t]) {
      const k = r.kokler[0];
      expect(k.fmaxMHz, r.kose).toBeGreaterThanOrEqual(PIKSEL_MHZ);
      expect(k.aciktaDegisen, r.kose).toEqual([]);
      expect(k.tutma, r.kose).toEqual([]);
    }
    // 74AC olarak yerleştirilen yalnızca bu iki çip
    const ac = board.chips.filter((c) => c.card === "video" && c.aile === "AC").map((c) => c.def.part);
    expect(ac.sort()).toEqual(["74HC161", "74HC74"]);
  });

  it("karakter saati (3,15 MHz) en kötü durumda sığar; satır başı saatinin tutma payı ≥ 5 ns", () => {
    expect(m.kokler[1].fmaxMHz).toBeGreaterThanOrEqual(PIKSEL_MHZ / 8);
    for (const x of t.kokler[1].tutma) expect(x.pay, `${x.ref}.${x.pin} ${x.net}`).toBeGreaterThanOrEqual(5);
    // OPW yalnızca VRAM ~OE'sini (V_SOE) ve ~WE'yi kapılar; ikisi de saat değildir ve ~WE'de
    // yazma darbesi WRP = H2 ∧ Q1, OPW'nin değiştiği p4'te zaten 0'dır
    expect(new Set(m.kokler[1].aciktaDegisen.map((x) => x.net))).toEqual(new Set(["V_OPW"]));
  });
});

// =============================================================================== KiCad

/** Tek başına anakart G/Ç + video + kendin yap bellek kartları (arka panel konnektörüyle) */
function standaloneBoard(): Board {
  const b = new Board();
  buildIoCard(b);
  buildVideoCard(b);
  buildKybCard(b);
  b.finish();
  return b;
}
const KICAD_CARDS = [
  { card: "gc", title: "CPU16 — Anakart G/Ç kartı (UART, PS/2, zamanlayıcı, kesme)" },
  { card: "video", title: "CPU16 — Anakart video kartı (80 × 30 metin, VGA 640 × 480)" },
  { card: "kyb", title: "CPU16 — Kendin yap bellek kartı (16 bayt, 74HC574)" },
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
  it("üç kart birlikte: elektriksel kural denetimi temiz (VSYNC_REQ video kartından)", () => {
    const ext = [...IO_CARD_INPUTS, ...VIDEO_CARD_INPUTS, ...KYB_CARD_INPUTS].filter((x) => x !== "VSYNC_REQ");
    expect(erc(board, ext)).toEqual([]);
    const counts = board.summary();
    expect(Object.keys(counts).sort()).toEqual(["gc", "kyb", "video"]);
  });

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
