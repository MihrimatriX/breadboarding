// UART terminali ve Web Serial bağlantısı.

import type { SerialLink } from "../../cpu16/bios/uploader";
import { CODEPAGE } from "../../cpu16/video/font";

/** UART bayt akışını basit bir terminal gibi metne çevirir: CR yok sayılır, BS bir karakter siler,
 * 0x80 üstü CP857 olarak çözülür, diğer kontrol karakterleri atılır. */
export class TerminalText {
  text = "";
  private readonly max: number;

  constructor(max = 20000) {
    this.max = max;
  }

  push(byte: number): void {
    if (byte === 10) this.text += "\n";
    else if (byte === 8) {
      if (this.text.length && !this.text.endsWith("\n")) this.text = this.text.slice(0, -1);
    } else if (byte >= 32 && byte < 127) this.text += String.fromCharCode(byte);
    else if (byte >= 0x80) this.text += String.fromCodePoint(CODEPAGE[byte] || 0x3f);
    if (this.text.length > this.max) this.text = this.text.slice(this.text.length - this.max * 0.8);
  }

  clear(): void {
    this.text = "";
  }
}

// ---- Web Serial (Chrome / Edge, https ya da localhost). TypeScript'in DOM tiplerinde yok.

interface SerialPortLike {
  open(options: { baudRate: number }): Promise<void>;
  close(): Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
}

interface SerialLike {
  requestPort(): Promise<SerialPortLike>;
}

export function webSerial(): SerialLike | null {
  const nav = navigator as unknown as { serial?: SerialLike };
  return nav.serial ?? null;
}

/** Gerçek karta USB-UART (CH340) üzerinden bağlanan SerialLink. */
export class WebSerialLink implements SerialLink {
  private readonly port: SerialPortLike;
  private reader: ReadableStreamDefaultReader<Uint8Array> | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private readonly queue: string[] = [];
  private waiter: (() => void) | null = null;
  /** Gelen her bayt (terminal kaydı için). */
  onByte?: (byte: number) => void;

  constructor(port: SerialPortLike) {
    this.port = port;
  }

  static async open(baudRate = 115200): Promise<WebSerialLink> {
    const serial = webSerial();
    if (!serial) throw new Error("Bu tarayıcıda Web Serial yok");
    const port = await serial.requestPort();
    await port.open({ baudRate });
    const link = new WebSerialLink(port);
    link.start();
    return link;
  }

  private start(): void {
    if (!this.port.readable || !this.port.writable) throw new Error("Seri port açılamadı");
    this.reader = this.port.readable.getReader();
    this.writer = this.port.writable.getWriter();
    void (async () => {
      try {
        for (;;) {
          const { value, done } = await this.reader!.read();
          if (done) break;
          for (const b of value) {
            this.queue.push(String.fromCharCode(b));
            this.onByte?.(b);
          }
          this.waiter?.();
        }
      } catch {
        // port kapandı
      }
    })();
  }

  async write(text: string): Promise<void> {
    await this.writer!.write(Uint8Array.from(text, (c) => c.charCodeAt(0) & 0xff));
  }

  async read(timeoutMs: number): Promise<string | null> {
    if (this.queue.length) return this.queue.shift()!;
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

  async close(): Promise<void> {
    try {
      await this.reader?.cancel();
      this.reader?.releaseLock();
      this.writer?.releaseLock();
      await this.port.close();
    } catch {
      // zaten kapalı
    }
  }
}
