import type { MachineSnapshot, TraceRow } from "./machine";

/** Ana iş parçacığından simülasyon worker'ına giden mesajlar */
export type ToWorker =
  | { type: "load"; chipUrl: string; program: number[] }
  | { type: "run"; hz: number }
  | { type: "pause" }
  | { type: "setHz"; hz: number }
  | { type: "step"; halfSteps: number }
  | { type: "stepInstruction" }
  | { type: "reset" }
  | { type: "program"; bytes: number[] }
  | { type: "poke"; address: number; value: number }
  | { type: "pin"; name: string; high: boolean }
  | { type: "watch"; nodes: number[] };

export interface FramePayload {
  /** Düğüm başına 0/1 (görüntüleme kopyası) */
  nodeState: Uint8Array;
  /** Transistör başına 0/1 */
  transistorOn: Uint8Array;
  snapshot: MachineSnapshot;
  /** Son karede üretilen yeni iz satırları */
  rows: TraceRow[];
  /** İzlenen düğümler için yarım çevrim başına örnekler */
  watch: { node: number; samples: Uint8Array }[];
  running: boolean;
  /** Ölçülen hız (yarım çevrim/sn) */
  measuredHz: number;
}

export type FromWorker =
  | { type: "ready"; nodeCount: number; transistorCount: number }
  | ({ type: "frame" } & FramePayload)
  | { type: "error"; message: string };
