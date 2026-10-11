// Kart simülasyonu worker'ı ile ana iş parçacığı arasındaki mesajlar.

import type { GateState } from "../../cpu16/board/computer";
import type { ScreenFrame } from "./screen";

export type ToWorker =
  /** microcode: mikrokod ROM'u (CPU kartı); flash: 128 KB Flash imajı (program bank 0'da) */
  | { type: "init"; microcode: Uint32Array; flash: Uint8Array }
  /** Flash'a yeni imaj yaz (programlayıcı) ve RESET'e bas */
  | { type: "load"; flash: Uint8Array; run: boolean }
  /** hz = 0: olabildiğince hızlı */
  | { type: "run"; hz: number }
  | { type: "speed"; hz: number }
  | { type: "pause" }
  | { type: "step"; mode: "cycle" | "instr" }
  | { type: "reset" }
  /** PS/2 klavyeden tarama kodu baytları */
  | { type: "key"; codes: number[] }
  /** UART'a (bilgisayardan karta) baytlar */
  | { type: "uart"; bytes: number[] }
  /** içi izlenecek bellek çipi (yoksa null) */
  | { type: "watch"; ref: string | null }
  /** ışın kipi: piksel saatinde VGA çıkışını örnekle */
  | { type: "beam"; on: boolean };

/** İzlenen bellek çipinin bir penceresi */
export interface MemWindow {
  ref: string;
  /** adres pinlerindeki adres (bilinmiyorsa −1) */
  addr: number;
  /** pencerenin ilk satırı ve satır sayısı; bytes = satır × satır başına bayt */
  first: number;
  rows: number;
  bytes: Uint8Array;
  /** ~WE düşük mü (yazma) */
  writing: boolean;
}

export interface Snapshot {
  type: "snap";
  /** her netin değeri (0, 1, 2 = Z, 3 = X) */
  values: Uint8Array;
  state: GateState;
  cycles: number;
  /** son anlık görüntüden beri UART'a yazılan baytlar */
  out: number[];
  running: boolean;
  /** ölçülen saat hızı (döngü/sn) */
  rate: number;
  mem: MemWindow | null;
}

export interface ScreenMessage {
  type: "screen";
  frame: ScreenFrame;
}

/** Işın kipi: VGA konnektöründen örneklenen 640 × 480 RGBA ve ışının yeri */
export interface BeamMessage {
  type: "beam";
  width: number;
  height: number;
  rgba: Uint8ClampedArray;
  x: number;
  y: number;
  frames: number;
}

export type FromWorker =
  | Snapshot
  | ScreenMessage
  | BeamMessage
  | { type: "ready"; netCount: number; ms: number; screen: boolean; keyboard: boolean; uart: boolean; beam: boolean }
  | { type: "error"; message: string };
