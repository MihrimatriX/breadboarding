// Bütün bilgisayar (anakart: CPU, saat, bellek, önbellek, G/Ç, video kartları; ~360 çip, ~4 200 kapı)
// bu worker'da kapı seviyesinde, osilatör periyodu periyodu çalışır. Program Flash bank 0'dadır
// (BIOS'suz deneme programları gibi), RESET'ten çalışır. Video kartının kendi piksel saati
// (VID_OSC, 25,175 MHz) CPU saatine oranla (her CPU döngüsünde ≈ 6,3 piksel) ilerletilir.
// Ana iş parçacığı en fazla saniyede ~30 kez net değerlerinin kopyasını, ~10 kez ekranı alır.

import type { ChipInstance } from "../../cpu16/board/board";
import { FULL_MACHINE_CARDS, GateMachine } from "../../cpu16/board/machine-board";
import { PASSIVES } from "../../cpu16/board/passives";
import { L0, L1 } from "../../cpu16/chips/logic";
import type { MemoryHandle } from "../../cpu16/chips/parts/memory";
import { Beam, findVgaOutput, VGA_H, VGA_W } from "./beam";
import { memGeometry, rowWindow } from "./memview";
import type { FromWorker, MemWindow, ToWorker } from "./protocol";
import { findScreenSource, type ScreenSource } from "./screen-source";
import { Ps2Sender, UartSender, type LineIo } from "./serial-in";

/** Piksel saati / CPU saati (25,175 MHz / 4 MHz) */
const PIXELS_PER_CYCLE = 25.175 / 4;

let microcode: Uint32Array | null = null;
let flash = new Uint8Array(0);
let g: GateMachine | null = null;
let screen: ScreenSource | null = null;
let ps2: Ps2Sender | null = null;
let uartIn: UartSender | null = null;
let beam: Beam | null = null;
let beamOn = false;
let vidOsc = -1;
let pixelOwed = 0;
let running = false;
let hz = 0;
let out: number[] = [];
let lastSnap = 0;
let lastScreen = 0;
let lastBeam = 0;
let screenStamp = NaN;
let owed = 0;
let lastTick = 0;
let rate = 0;
let rateCycles = 0;
let rateT = 0;
let watched: { ci: ChipInstance; addr: number[]; we: number; geo: NonNullable<ReturnType<typeof memGeometry>>; lastAddr: number } | null = null;
let watchRef: string | null = null;
let nets = { halted: -1, fault: -1, iflag: -1 };

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

/** Bütün anakart; mikrokod CPU kartının ROM'larına yazılır */
function createMachine(): GateMachine {
  return new GateMachine(microcode!, { cards: FULL_MACHINE_CARDS });
}

/**
 * Güç açılışı: gerçek kartta flip-flop'lar rastgele ama tanımlı bir değerle başlar. Simülasyonda X
 * kalan (reseti olmayan, ör. video kartının sayaçları) flip-flop'lar 0'a kurulur; dalgalı sayaçlarda
 * bir basamağın saati öncekinin çıkışı olduğu için X kalmayana kadar tekrarlanır.
 */
function powerOn(m: GateMachine): void {
  const ffs: number[] = [];
  m.board.c.gates.forEach((gt, i) => {
    if (gt.kind === "DFF" || gt.kind === "LATCH") ffs.push(i);
  });
  for (let pass = 0; pass < 16; pass++) {
    let changed = 0;
    for (const f of ffs) {
      const q = m.sim.stateOf(f);
      if (q !== L0 && q !== L1) {
        m.sim.setState(f, L0);
        changed++;
      }
    }
    m.sim.settle();
    if (!changed) break;
  }
}

/** Bir pasifin pin adları (kütüphanede tanımlıysa) */
const pinNames = (part: string) => PASSIVES[part]?.pins.map((p) => p.name) ?? null;

/** Kartın dışındaki konnektörden bir pinin neti: pasifin adına göre değil pin adına göre */
function connectorNet(m: GateMachine, pin: string, also?: (names: string[]) => boolean): number {
  for (const p of m.board.passives) {
    const names = pinNames(p.part);
    if (!names || (also && !also(names))) continue;
    const i = names.indexOf(pin);
    if (i >= 0 && p.pins[String(i + 1)] !== undefined) return p.pins[String(i + 1)];
  }
  return -1;
}

function build(): number {
  const t0 = performance.now();
  const m = createMachine();
  g = m;
  const b = m.board;
  const has = (name: string) => (b.has(name) ? b.n(name) : -1);
  nets = { halted: has("HALTED"), fault: has("FAULT"), iflag: has("IFLAG") };
  m.onOutput = (ch) => out.push(ch.charCodeAt(0) & 0xff);
  screen = findScreenSource(m);
  vidOsc = has("VID_OSC");
  if (vidOsc >= 0) m.sim.set(vidOsc, false);
  const io: LineIo = {
    drive: (n, v) => m.sim.set(n, v ? L1 : L0),
    release: (n) => {
      m.sim.release(n);
      m.sim.settle();
    },
    get: (n) => m.sim.get(n),
  };
  // PS/2 konnektörü (DATA, CLK pinleri) ve USB-UART konnektörü (TXD → kartın RX'i, ~CTS ← RX_READY)
  const isPs2 = (n: string[]) => n.includes("DATA") && n.includes("CLK");
  const ps2Clk = connectorNet(m, "CLK", isPs2);
  const ps2Dat = connectorNet(m, "DATA", isPs2);
  ps2 = ps2Clk >= 0 && ps2Dat >= 0 ? new Ps2Sender(io, ps2Clk, ps2Dat) : null;
  const isUart = (n: string[]) => n.includes("TXD") && n.includes("RXD");
  const rxd = connectorNet(m, "TXD", isUart);
  uartIn = rxd >= 0 ? new UartSender(io, rxd, connectorNet(m, "~CTS", isUart)) : null;
  const vga = findVgaOutput(b, pinNames);
  beam = vga && vidOsc >= 0 ? new Beam(vga) : null;
  powerOn(m);
  m.loadFlash(flash);
  m.reset();
  pixelOwed = 0;
  screenStamp = NaN;
  setWatch(watchRef);
  return performance.now() - t0;
}

function setWatch(ref: string | null): void {
  watchRef = ref;
  watched = null;
  if (!g || !ref) return;
  const ci = g.board.chips.find((c) => c.ref === ref);
  const geo = ci && memGeometry(ci.def);
  if (!ci || !geo || !(ci.handle as MemoryHandle | null)?.data) return;
  watched = { ci, geo, addr: geo.addrPins.map((p) => ci.nets[p] ?? -1), we: ci.nets["~WE"] ?? -1, lastAddr: 0 };
}

function memWindow(): MemWindow | null {
  if (!g || !watched) return null;
  const { ci, geo, addr } = watched;
  let a = 0;
  let known = true;
  addr.forEach((n, i) => {
    const v = n < 0 ? L0 : g!.sim.get(n);
    if (v !== L0 && v !== L1) known = false;
    a |= (v === L1 ? 1 : 0) << i;
  });
  if (known) watched.lastAddr = a;
  const data = (ci.handle as MemoryHandle).data;
  const w = rowWindow(watched.lastAddr, geo);
  const bytes = data.slice(w.first * geo.bytesPerRow, (w.first + w.count) * geo.bytesPerRow);
  return { ref: ci.ref, addr: known ? a : -1, first: w.first, rows: w.count, bytes, writing: watched.we >= 0 && g.sim.get(watched.we) === L0 };
}

function snap() {
  if (!g) return;
  const values = g.sim.value.slice();
  post({ type: "snap", values, state: g.state, cycles: g.cycles, out, running, rate, mem: memWindow() }, [values.buffer]);
  out = [];
  lastSnap = performance.now();
}

function sendScreen(force = false) {
  lastScreen = performance.now();
  if (!screen) return;
  const s = screen.stamp();
  if (!force && s === screenStamp) return;
  screenStamp = s;
  const frame = screen.frame();
  post({ type: "screen", frame }, [frame.pixels.buffer]);
}

function sendBeam() {
  lastBeam = performance.now();
  if (!beam || !beamOn) return;
  const rgba = beam.rgba.slice();
  post({ type: "beam", width: VGA_W, height: VGA_H, rgba, x: beam.x, y: beam.y, frames: beam.frames }, [rgba.buffer]);
}

/** CPU durdu ve kendiliğinden uyanamaz: hata, ya da kesmeler kapalıyken HALT */
const stopped = () => {
  const s = g!.sim;
  if (nets.fault >= 0 && s.get(nets.fault) === L1) return true;
  return nets.halted >= 0 && s.get(nets.halted) === L1 && (nets.iflag < 0 || s.get(nets.iflag) !== L1);
};

/** Bir CPU saat döngüsü (bekleme turları dahil); piksel saati ve dış seri hatlar da ilerler */
function cycle(): void {
  const m = g!;
  const n = m.cycle();
  if (vidOsc >= 0) {
    pixelOwed += n * PIXELS_PER_CYCLE;
    const s = m.sim;
    const sampling = beamOn && beam;
    while (pixelOwed >= 1) {
      pixelOwed -= 1;
      s.set(vidOsc, true);
      if (sampling) beam!.sample((x) => s.get(x));
      s.set(vidOsc, false);
    }
  }
  ps2?.tick(m.cycles);
  uartIn?.tick(m.cycles);
}

function tick() {
  if (!running || !g) return;
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  const budgetEnd = now + 14;
  let n = 0;
  const c0 = g.cycles;
  if (hz > 0) {
    owed += hz * dt;
    while (owed >= 1 && performance.now() < budgetEnd) {
      cycle();
      owed -= 1;
      n++;
      if (stopped()) break;
    }
    if (owed > hz) owed = 0; // yetişemiyorsak birikmesin
  } else {
    while (performance.now() < budgetEnd) {
      for (let k = 0; k < 20; k++) cycle();
      if (stopped()) break;
    }
  }
  n = g.cycles - c0;
  rateCycles += n;
  if (now - rateT > 500) {
    rate = (rateCycles * 1000) / (now - rateT);
    rateCycles = 0;
    rateT = now;
  }
  if (stopped()) running = false;
  if (!running || now - lastSnap > 33) snap();
  if (!running || now - lastScreen > 100) sendScreen();
  if (beamOn && (!running || now - lastBeam > 200)) sendBeam();
  if (running) setTimeout(tick, hz > 0 && hz < 60 ? 16 : 0);
}

function start() {
  if (running) return;
  running = true;
  lastTick = rateT = performance.now();
  owed = 0;
  rateCycles = 0;
  tick();
}

function refresh() {
  snap();
  sendScreen();
  if (beamOn) sendBeam();
}

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    switch (m.type) {
      case "init": {
        microcode = m.microcode;
        flash = m.flash;
        const ms = build();
        post({ type: "ready", netCount: g!.board.c.netCount, ms, screen: !!screen, keyboard: !!ps2, uart: !!uartIn, beam: !!beam });
        snap();
        sendScreen(true);
        break;
      }
      case "load":
        // programlayıcı Flash'a yazar, sonra RESET (RAM ve VRAM gerçek kartta olduğu gibi kalır)
        flash = m.flash;
        running = false;
        out = [];
        g!.loadFlash(flash);
        g!.reset();
        refresh();
        if (m.run) start();
        break;
      case "reset":
        running = false;
        g!.reset();
        refresh();
        break;
      case "run":
        hz = m.hz;
        start();
        break;
      case "speed":
        hz = m.hz;
        owed = 0;
        break;
      case "pause":
        running = false;
        refresh();
        break;
      case "step":
        if (!g) break;
        running = false;
        if (m.mode === "cycle") cycle();
        else {
          // komut sınırına kadar: mikro adım tekrar 0 olana dek (en fazla 64 döngü)
          for (let k = 0; k < 64; k++) {
            cycle();
            if (g.state.step === 0 || stopped()) break;
          }
        }
        refresh();
        break;
      case "key":
        // baytlar kart çalışırken klavyeden gider
        ps2?.queue.push(...m.codes);
        break;
      case "uart":
        uartIn?.queue.push(...m.bytes);
        break;
      case "watch":
        setWatch(m.ref);
        if (!running) snap();
        break;
      case "beam":
        beamOn = m.on;
        if (beamOn && !running) sendBeam();
        break;
    }
  } catch (err) {
    running = false;
    post({ type: "error", message: String((err as Error).message ?? err) });
  }
};
