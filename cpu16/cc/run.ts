// cc16 programlarını emülatörde çalıştırma yardımcıları (testler, CLI ve web IDE için).

import { Cpu16, SimpleBus, type StepResult } from "../emu/cpu.ts";

/** 0x4000 altını (ROM) yazmaya kapalı tutan veriyolu: yazmalar yok sayılır ve sayılır. */
export class RomGuardBus extends SimpleBus {
  romEnd: number;
  romWrites = 0;
  /** ilk ROM yazmasının adresi (hata ayıklama için) */
  firstRomWrite: number | null = null;

  constructor(romEnd = 0x4000) {
    super();
    this.romEnd = romEnd;
  }

  write8(addr: number, value: number): void {
    addr &= 0xffff;
    if (addr < this.romEnd) {
      this.romWrites++;
      if (this.firstRomWrite === null) this.firstRomWrite = addr;
      return;
    }
    super.write8(addr, value);
  }
}

export interface RunOptions {
  /** en fazla komut sayısı (varsayılan 20 milyon) */
  maxSteps?: number;
  /** UART'a yazılan her bayt için */
  onOutput?: (ch: string) => void;
}

export interface RunResult {
  /** UART çıktısı, UTF-8 olarak çözülmüş */
  output: string;
  /** UART'a yazılan ham baytlar */
  bytes: number[];
  /** main'in dönüş değeri (r0, işaretli 16 bit) */
  exitCode: number;
  result: StepResult;
  steps: number;
  romWrites: number;
  cpu: Cpu16;
  bus: RomGuardBus;
}

/** Latin-1 karakter dizisini (bayt başına bir karakter) UTF-8 olarak çöz. */
export function decodeBytes(bytes: number[]): string {
  return new TextDecoder().decode(new Uint8Array(bytes));
}

export function runProgram(image: Uint8Array, opts: RunOptions = {}): RunResult {
  const bus = new RomGuardBus();
  bus.load(image);
  const bytes: number[] = [];
  bus.onOutput = (ch) => {
    bytes.push(ch.charCodeAt(0));
    opts.onOutput?.(ch);
  };
  const cpu = new Cpu16(bus);
  const result = cpu.run(opts.maxSteps ?? 20_000_000);
  const r0 = cpu.regs[0];
  return {
    output: decodeBytes(bytes),
    bytes,
    exitCode: r0 >= 0x8000 ? r0 - 0x10000 : r0,
    result,
    steps: cpu.instructions,
    romWrites: bus.romWrites,
    cpu,
    bus,
  };
}
