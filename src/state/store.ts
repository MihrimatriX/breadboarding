import { create } from "zustand";
import type { ChipData } from "../chip/types";
import { buildChipIndex, type ChipIndex } from "../chip/chipIndex";
import type { MachineSnapshot, TraceRow } from "../sim/machine";

const MAX_ROWS = 256;
const MAX_SAMPLES = 256;

export interface WatchTrack {
  node: number;
  samples: number[];
}

export interface AppState {
  status: "loading" | "ready" | "error";
  error: string | null;
  chip: ChipData | null;
  index: ChipIndex | null;

  running: boolean;
  hz: number;
  measuredHz: number;
  snapshot: MachineSnapshot | null;
  rows: TraceRow[];
  watch: WatchTrack[];

  selectedNode: number | null;
  hoveredNode: number | null;
  focusRequest: { node: number; at: number } | null;

  layerVisible: Record<number, boolean>;
  explode: number;
  showTransistors: boolean;
  bloom: boolean;
  programId: string;

  setChip(chip: ChipData): void;
  setError(message: string): void;
  applyFrame(f: { snapshot: MachineSnapshot; rows: TraceRow[]; watch: { node: number; samples: Uint8Array }[]; running: boolean; measuredHz: number }): void;
  clearTrace(): void;
  select(node: number | null, focus?: boolean): void;
  hover(node: number | null): void;
  setHz(hz: number): void;
  setLayerVisible(id: number, v: boolean): void;
  setExplode(v: number): void;
  setShowTransistors(v: boolean): void;
  setBloom(v: boolean): void;
  setProgramId(id: string): void;
  toggleWatch(node: number): void;
}

export const useApp = create<AppState>((set, get) => ({
  status: "loading",
  error: null,
  chip: null,
  index: null,
  running: false,
  hz: 8,
  measuredHz: 0,
  snapshot: null,
  rows: [],
  watch: [],
  selectedNode: null,
  hoveredNode: null,
  focusRequest: null,
  layerVisible: {},
  explode: 1,
  showTransistors: false,
  bloom: true,
  programId: "counter",

  setChip(chip) {
    const layerVisible: Record<number, boolean> = {};
    chip.layers.forEach((l) => (layerVisible[l.id] = true));
    set({ chip, index: buildChipIndex(chip), layerVisible, status: "ready" });
  },
  setError(message) {
    set({ status: "error", error: message });
  },
  applyFrame(f) {
    const rows = f.rows.length ? [...get().rows, ...f.rows].slice(-MAX_ROWS) : get().rows;
    const watch = get().watch.map((w) => {
      const incoming = f.watch.find((x) => x.node === w.node);
      if (!incoming || incoming.samples.length === 0) return w;
      return { node: w.node, samples: [...w.samples, ...incoming.samples].slice(-MAX_SAMPLES) };
    });
    set({ snapshot: f.snapshot, rows, watch, running: f.running, measuredHz: f.measuredHz });
  },
  clearTrace() {
    set({ rows: [], watch: get().watch.map((w) => ({ node: w.node, samples: [] })) });
  },
  select(node, focus = false) {
    set({ selectedNode: node, focusRequest: focus && node !== null ? { node, at: performance.now() } : get().focusRequest });
  },
  hover(node) {
    if (get().hoveredNode !== node) set({ hoveredNode: node });
  },
  setHz(hz) {
    set({ hz });
  },
  setLayerVisible(id, v) {
    set({ layerVisible: { ...get().layerVisible, [id]: v } });
  },
  setExplode(v) {
    set({ explode: v });
  },
  setShowTransistors(v) {
    set({ showTransistors: v });
  },
  setBloom(v) {
    set({ bloom: v });
  },
  setProgramId(id) {
    set({ programId: id });
  },
  toggleWatch(node) {
    const w = get().watch;
    set({ watch: w.some((x) => x.node === node) ? w.filter((x) => x.node !== node) : [...w, { node, samples: [] }] });
  },
}));
