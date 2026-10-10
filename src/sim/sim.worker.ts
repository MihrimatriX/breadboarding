/// <reference lib="webworker" />
import type { ChipData } from "../chip/types";
import type { TraceRow } from "./machine";
import { Mos6502Machine } from "./machines/mos6502";
import type { FromWorker, ToWorker } from "./protocol";

/**
 * Simülasyon ayrı bir iş parçacığında koşar; böylece saniyede binlerce yarım
 * çevrim hesaplanırken 3D görünüm 60 FPS'te akmaya devam eder.
 */
declare const self: DedicatedWorkerGlobalScope;

let machine: Mos6502Machine | null = null;
let running = false;
let hz = 4;
let budget = 0;
let lastTick = performance.now();
let dirty = true;
let pendingRows: TraceRow[] = [];
let watched: number[] = [];
let watchBuf: number[][] = [];
let hzWindow: { t: number; n: number }[] = [];
const TICK_MS = 16;
const MAX_WORK_MS = 11;
const MAX_ROWS = 512;

function post(msg: FromWorker, transfer: Transferable[] = []) {
  self.postMessage(msg, transfer);
}

function doHalfStep() {
  if (!machine) return;
  machine.halfStep();
  pendingRows.push(machine.trace());
  if (pendingRows.length > MAX_ROWS) pendingRows.splice(0, pendingRows.length - MAX_ROWS);
  watched.forEach((node, i) => {
    watchBuf[i].push(machine!.engine.isHigh(node) ? 1 : 0);
    if (watchBuf[i].length > MAX_ROWS) watchBuf[i].shift();
  });
  hzWindow.push({ t: performance.now(), n: 1 });
  dirty = true;
}

function sendFrame() {
  if (!machine || !dirty) return;
  dirty = false;
  const e = machine.engine;
  const nodeState = new Uint8Array(e.nodeCount);
  e.copyDisplayState(nodeState);
  const transistorOn = e.tOn.slice();
  const now = performance.now();
  hzWindow = hzWindow.filter((s) => now - s.t < 1000);
  const watch = watched.map((node, i) => ({ node, samples: Uint8Array.from(watchBuf[i]) }));
  watchBuf = watched.map(() => []);
  const rows = pendingRows;
  pendingRows = [];
  post(
    {
      type: "frame",
      nodeState,
      transistorOn,
      snapshot: machine.snapshot(),
      rows,
      watch,
      running,
      measuredHz: running ? hzWindow.length : 0,
    },
    [nodeState.buffer, transistorOn.buffer],
  );
}

setInterval(() => {
  const now = performance.now();
  const dt = Math.min(0.25, (now - lastTick) / 1000);
  lastTick = now;
  if (machine && running) {
    budget += dt * hz;
    const start = performance.now();
    while (budget >= 1 && performance.now() - start < MAX_WORK_MS) {
      doHalfStep();
      budget -= 1;
    }
    if (budget > hz) budget = 0; // yetişemiyorsak birikmesin
  }
  sendFrame();
}, TICK_MS);

self.onmessage = async (ev: MessageEvent<ToWorker>) => {
  const msg = ev.data;
  try {
    switch (msg.type) {
      case "load": {
        const res = await fetch(msg.chipUrl);
        if (!res.ok) throw new Error(`Çip verisi yüklenemedi (HTTP ${res.status})`);
        const chip = (await res.json()) as ChipData;
        machine = new Mos6502Machine(chip);
        machine.loadProgram(msg.program);
        machine.reset();
        post({ type: "ready", nodeCount: chip.nodeCount, transistorCount: chip.transistors.length });
        break;
      }
      case "run":
        running = true;
        hz = msg.hz;
        budget = 0;
        break;
      case "pause":
        running = false;
        break;
      case "setHz":
        hz = msg.hz;
        break;
      case "step":
        running = false;
        for (let i = 0; i < msg.halfSteps; i++) doHalfStep();
        break;
      case "stepInstruction": {
        // bir sonraki SYNC (komut çekme) anına kadar ilerle
        running = false;
        if (!machine) break;
        let guard = 0;
        do doHalfStep(); while (guard++ < 40 && !(machine.trace().sync && machine.trace().clk));
        break;
      }
      case "reset":
        machine?.reset();
        pendingRows = [];
        watchBuf = watched.map(() => []);
        break;
      case "program":
        machine?.loadProgram(msg.bytes);
        machine?.reset();
        pendingRows = [];
        break;
      case "poke":
        if (machine) machine.memory[msg.address & 0xffff] = msg.value & 0xff;
        break;
      case "pin":
        machine?.setPin(msg.name, msg.high);
        break;
      case "watch":
        watched = msg.nodes;
        watchBuf = watched.map(() => []);
        break;
    }
    dirty = true;
  } catch (err) {
    post({ type: "error", message: err instanceof Error ? err.message : String(err) });
  }
};
