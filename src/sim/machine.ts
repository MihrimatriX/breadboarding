import type { SwitchLevelEngine } from "./SwitchLevelEngine";

/** Bir yarım çevrimin sonunda okunan veri yolu ve yazmaç değerleri */
export interface TraceRow {
  halfCycle: number;
  ab: number;
  db: number;
  rw: boolean;
  sync: boolean;
  clk: boolean;
  pc: number;
  a: number;
  x: number;
  y: number;
  sp: number;
  p: number;
}

export interface MachineSnapshot {
  trace: TraceRow;
  pins: Record<string, boolean>;
  zeroPage: Uint8Array;
  stackPage: Uint8Array;
  oscillations: number;
}

/** Simüle edilen çip + çevresi (bellek, saat). Yeni çipler bu arayüzü uygular. */
export interface Machine {
  readonly engine: SwitchLevelEngine;
  readonly memory: Uint8Array;
  halfCycle: number;
  loadProgram(bytes: ArrayLike<number>, address?: number): void;
  reset(): void;
  halfStep(): void;
  setPin(name: string, high: boolean): void;
  trace(): TraceRow;
  snapshot(): MachineSnapshot;
}
