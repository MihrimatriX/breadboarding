// Kart görünümünün durumu: worker istemcisi, seçimler ve canlı net değerleri.

import { create } from "zustand";
import { assembleOrThrow } from "../../cpu16/asm/assembler";
import { buildComputerBoard, type GateState } from "../../cpu16/board/computer";
import { boardLayout, type BoardLayout } from "../../cpu16/board/layout";
import { assembleMicrocode } from "../../cpu16/micro/microasm";
import ucodeSource from "../../cpu16/micro/cpu16.ucode?raw";
import type { FromWorker, ToWorker } from "./protocol";

const sources = import.meta.glob("../../cpu16/programs/*.s", { query: "?raw", import: "default", eager: true }) as Record<string, string>;
export const PROGRAMS = Object.fromEntries(Object.entries(sources).map(([p, s]) => [p.split("/").pop()!.replace(/\.s$/, ""), s]));
export const PROGRAM_ORDER = ["hello", "fib", "add32", "bubble", "irq"].filter((n) => n in PROGRAMS);

/** Kartın yapısı ana iş parçacığında da kurulur (yerleşim, çip içi şemaları); worker'dakiyle aynı */
let model: ReturnType<typeof buildComputerBoard> | null = null;
let layout: BoardLayout | null = null;
export function boardModel() {
  model ??= buildComputerBoard();
  return model;
}
export function boardLayoutData() {
  layout ??= boardLayout(boardModel().board);
  return layout;
}

/** Her karede değişen net değerleri React durumuna konmaz; çizim döngüsü buradan okur */
export const liveNets = { values: null as Uint8Array | null, prev: null as Uint8Array | null, version: 0 };

export const SPEEDS = [
  { hz: 1, label: "1 Hz" },
  { hz: 4, label: "4 Hz" },
  { hz: 20, label: "20 Hz" },
  { hz: 200, label: "200 Hz" },
  { hz: 2000, label: "2 kHz" },
  { hz: 0, label: "en hızlı" },
];

interface KartState {
  ready: boolean;
  error: string | null;
  program: string;
  running: boolean;
  hz: number;
  state: GateState | null;
  cycles: number;
  rate: number;
  irq: boolean;
  uart: string;
  /** yan panelleri yenilemek için sayaç (saniyede ~10) */
  tick: number;
  chip: string | null;
  gate: number | null;
  net: number | null;
  hover: { ref: string; x: number; y: number } | null;
  setProgram(name: string): void;
  run(): void;
  pause(): void;
  step(mode: "cycle" | "instr"): void;
  reset(): void;
  setHz(hz: number): void;
  raiseIrq(): void;
  selectChip(ref: string | null): void;
  selectGate(g: number | null): void;
  selectNet(n: number | null): void;
}

let worker: Worker | null = null;
const send = (m: ToWorker) => worker?.postMessage(m);
const image = (name: string) => assembleOrThrow(PROGRAMS[name]).image;
let lastPanel = 0;

export const useKart = create<KartState>((set, get) => ({
  ready: false,
  error: null,
  program: PROGRAM_ORDER[0],
  running: false,
  hz: 20,
  state: null,
  cycles: 0,
  rate: 0,
  irq: false,
  uart: "",
  tick: 0,
  chip: null,
  gate: null,
  net: null,
  hover: null,
  setProgram(name) {
    set({ program: name, uart: "", running: false });
    send({ type: "load", image: image(name) });
  },
  run() {
    set({ running: true });
    send({ type: "run", hz: get().hz });
  },
  pause() {
    set({ running: false });
    send({ type: "pause" });
  },
  step(mode) {
    set({ running: false });
    send({ type: "step", mode });
  },
  reset() {
    set({ uart: "", running: false });
    send({ type: "reset" });
  },
  setHz(hz) {
    set({ hz });
    send({ type: "speed", hz });
  },
  raiseIrq() {
    send({ type: "irq" });
  },
  selectChip(ref) {
    set({ chip: ref, gate: null });
  },
  selectGate(g) {
    set({ gate: g });
  },
  selectNet(n) {
    set({ net: n });
  },
}));

/** Worker'ı başlatır (kart görünümü ilk açıldığında bir kez) */
export function startBoardWorker() {
  if (worker) return;
  try {
    const micro = assembleMicrocode(ucodeSource);
    if (micro.errors.length) throw new Error(`mikrokod: ${micro.errors[0].message}`);
    worker = new Worker(new URL("./board.worker.ts", import.meta.url), { type: "module" });
    worker.onmessage = (e: MessageEvent<FromWorker>) => {
      const m = e.data;
      if (m.type === "error") useKart.setState({ error: m.message });
      else if (m.type === "ready") useKart.setState({ ready: true });
      else {
        liveNets.prev = liveNets.values;
        liveNets.values = m.values;
        liveNets.version++;
        const now = performance.now();
        const s = useKart.getState();
        const patch: Partial<KartState> = {};
        if (m.out) patch.uart = s.uart + m.out;
        if (s.running !== m.running) patch.running = m.running;
        // paneller saniyede ~10 kez yenilenir; duraklatınca hemen
        if (!m.running || now - lastPanel > 100) {
          Object.assign(patch, { state: m.state, cycles: m.cycles, rate: m.rate, irq: m.irq, tick: s.tick + 1 });
          lastPanel = now;
        }
        if (Object.keys(patch).length) useKart.setState(patch);
      }
    };
    worker.onerror = (e) => useKart.setState({ error: e.message || "Simülasyon başlatılamadı" });
    send({ type: "init", microcode: micro.rom, image: image(useKart.getState().program) });
  } catch (err) {
    useKart.setState({ error: String((err as Error).message ?? err) });
  }
}
