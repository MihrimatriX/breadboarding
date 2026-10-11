// Kapı seviyesi CPU16 bilgisayarı (153 çip, ~1 800 kapı) bu worker'da saat saat çalışır.
// Ana iş parçacığı ekrana çizmek için en fazla saniyede ~30 kez net değerlerinin kopyasını alır.

import { GateComputer } from "../../cpu16/board/computer";
import type { FromWorker, ToWorker } from "./protocol";

let microcode: Uint32Array | null = null;
let image = new Uint8Array(0);
let g: GateComputer | null = null;
let running = false;
let hz = 0;
let out = "";
let irq = false;
let lastSnap = 0;
let owed = 0;
let lastTick = 0;
let rate = 0;
let rateCycles = 0;
let rateT = 0;

const post = (m: FromWorker, transfer: Transferable[] = []) => (self as unknown as Worker).postMessage(m, transfer);

function build() {
  const t0 = performance.now();
  g = new GateComputer(microcode!);
  g.load(image);
  g.onOutput = (ch) => (out += ch);
  irq = false;
  return performance.now() - t0;
}

function snap() {
  if (!g) return;
  const values = g.sim.value.slice();
  post({ type: "snap", values, state: g.state, cycles: g.cycles, out, running, rate, irq }, [values.buffer]);
  out = "";
  lastSnap = performance.now();
}

const halted = () => g!.sim.get(g!.board.n("HALTED")) === 1 || g!.sim.get(g!.board.n("FAULT")) === 1;

/** Bir saat döngüsü; kesme işleyicisine girilince (I = 0) IRQ hattı bırakılır */
function cycle() {
  g!.cycle();
  if (irq && g!.sim.get(g!.board.n("IFLAG")) === 0) {
    irq = false;
    g!.irq = false;
  }
}

function tick() {
  if (!running || !g) return;
  const now = performance.now();
  const dt = Math.min(0.1, (now - lastTick) / 1000);
  lastTick = now;
  const budgetEnd = now + 14;
  let n = 0;
  if (hz > 0) {
    owed += hz * dt;
    while (owed >= 1 && performance.now() < budgetEnd) {
      cycle();
      owed -= 1;
      n++;
      if (halted() && !irq) break;
    }
    if (owed > hz) owed = 0; // yetişemiyorsak birikmesin
  } else {
    while (performance.now() < budgetEnd) {
      for (let k = 0; k < 50; k++) cycle();
      n += 50;
      if (halted() && !irq) break;
    }
  }
  rateCycles += n;
  if (now - rateT > 500) {
    rate = (rateCycles * 1000) / (now - rateT);
    rateCycles = 0;
    rateT = now;
  }
  if (halted() && !irq) running = false;
  if (!running || now - lastSnap > 33) snap();
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

self.onmessage = (e: MessageEvent<ToWorker>) => {
  const m = e.data;
  try {
    switch (m.type) {
      case "init": {
        microcode = m.microcode;
        image = m.image;
        const ms = build();
        post({ type: "ready", netCount: g!.board.c.netCount, ms });
        snap();
        break;
      }
      case "load":
        image = m.image;
        running = false;
        out = "";
        build();
        snap();
        break;
      case "reset":
        running = false;
        build();
        snap();
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
        snap();
        break;
      case "step":
        if (!g) break;
        running = false;
        if (m.mode === "cycle") cycle();
        else {
          // komut sınırına kadar: mikro adım tekrar 0 olana dek (en fazla 64 döngü)
          for (let k = 0; k < 64; k++) {
            cycle();
            if (g.state.step === 0 || halted()) break;
          }
        }
        snap();
        break;
      case "irq":
        if (!g) break;
        irq = true;
        g.irq = true;
        snap();
        break;
    }
  } catch (err) {
    post({ type: "error", message: String((err as Error).message ?? err) });
  }
};
