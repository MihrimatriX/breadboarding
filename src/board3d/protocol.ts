// Kart simülasyonu worker'ı ile ana iş parçacığı arasındaki mesajlar.

import type { GateState } from "../../cpu16/board/computer";

export type ToWorker =
  | { type: "init"; microcode: Uint32Array; image: Uint8Array }
  | { type: "load"; image: Uint8Array }
  /** hz = 0: olabildiğince hızlı */
  | { type: "run"; hz: number }
  | { type: "speed"; hz: number }
  | { type: "pause" }
  | { type: "step"; mode: "cycle" | "instr" }
  | { type: "reset" }
  | { type: "irq" };

export interface Snapshot {
  type: "snap";
  /** her netin değeri (0, 1, 2 = Z, 3 = X) */
  values: Uint8Array;
  state: GateState;
  cycles: number;
  /** son anlık görüntüden beri UART'a yazılanlar */
  out: string;
  running: boolean;
  /** ölçülen saat hızı (döngü/sn) */
  rate: number;
  irq: boolean;
}

export type FromWorker = Snapshot | { type: "ready"; netCount: number; ms: number } | { type: "error"; message: string };
