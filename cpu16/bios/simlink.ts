// Simülatördeki UART'a bağlanan SerialLink: Web IDE, CLI ve testler önyükleyiciyi bununla sürer.

import type { Machine } from "../emu/machine.ts";
import { CPU_HZ } from "../emu/machine.ts";
import type { SerialLink } from "./uploader.ts";

export class MachineLink implements SerialLink {
  readonly machine: Machine;
  /** true: read() makineyi kendisi çalıştırır (testler, CLI). false: makineyi başka bir döngü
   * (tarayıcıda requestAnimationFrame) çalıştırır, read() gerçek zamanda bekler. */
  readonly drive: boolean;
  private readonly queue: string[] = [];
  private waiter: (() => void) | null = null;

  constructor(machine: Machine, drive: boolean) {
    this.machine = machine;
    this.drive = drive;
  }

  /** Makinenin UART çıkışından gelen bayt (makinenin uartOnOutput'una bağlanır). */
  push(byte: number): void {
    this.queue.push(String.fromCharCode(byte));
    this.waiter?.();
  }

  async write(text: string): Promise<void> {
    this.machine.uartSend(text);
  }

  async read(timeoutMs: number): Promise<string | null> {
    if (this.queue.length) return this.queue.shift()!;
    if (this.drive) {
      const end = this.machine.cycles + (timeoutMs * CPU_HZ) / 1000;
      while (!this.queue.length && this.machine.cycles < end) {
        if (this.machine.run(500) === "illegal") break;
      }
      return this.queue.shift() ?? null;
    }
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        this.waiter = null;
        resolve(this.queue.shift() ?? null);
      }, timeoutMs);
      this.waiter = () => {
        clearTimeout(timer);
        this.waiter = null;
        resolve(this.queue.shift() ?? null);
      };
    });
  }
}
