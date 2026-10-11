// Kart testi komutu: npm run cpu16 -- kart-testi [--port /dev/ttyUSB0] [--baud 115200]
//
// cpu16/bios/testler/ altındaki programları önce simülatörde çalıştırıp beklenen çıktıyı alır,
// sonra gerçek karta (USB-UART, BIOS monitörü istemde) aynı yoldan yükleyip çıktıları karşılaştırır.
// --port verilmezse karşı taraf da simülatördür (aracın kendisini denemek için).
// Seri port Linux / macOS'ta aygıt dosyası olarak açılır (stty ile ayarlanır); Windows'ta Web IDE'deki
// "Kart testi" düğmesini (Web Serial) kullan.

import { execFileSync } from "node:child_process";
import { openSync, readdirSync, readFileSync } from "node:fs";
import { ReadStream, WriteStream } from "node:tty";
import { buildBios } from "../bios/build.ts";
import { beklenenCiktilar, kartTesti, kartTestProgramlari, simMakinesi, sonucMetni } from "../bios/kart-testi.ts";
import { MachineLink } from "../bios/simlink.ts";
import type { SerialLink } from "../bios/uploader.ts";
import { loadLib } from "../cc/node.ts";

/** Seri port aygıtı (ör. /dev/ttyUSB0, /dev/cu.usbserial-110) üzerinden SerialLink. Aygıt bir tty
 * olduğu için Node'un tty akışlarıyla (engellemeyen G/Ç) okunur ve yazılır. */
class AygitLink implements SerialLink {
  private readonly rx: ReadStream;
  private readonly tx: WriteStream;
  private readonly queue: string[] = [];
  private waiter: (() => void) | null = null;

  constructor(path: string, baud: number) {
    const flag = process.platform === "darwin" ? "-f" : "-F";
    execFileSync("stty", [flag, path, String(baud), "raw", "-echo", "-ixon", "-crtscts", "cs8", "-cstopb", "-parenb", "clocal"]);
    const fd = openSync(path, "r+");
    this.rx = new ReadStream(fd);
    this.tx = new WriteStream(fd);
    this.rx.on("data", (buf) => {
      for (const b of buf as Buffer) this.queue.push(String.fromCharCode(b));
      this.waiter?.();
    });
  }

  write(text: string): Promise<void> {
    return new Promise((resolve, reject) => this.tx.write(Buffer.from(Array.from(text, (c) => c.charCodeAt(0) & 0xff)), (e) => (e ? reject(e) : resolve())));
  }

  read(timeoutMs: number): Promise<string | null> {
    if (this.queue.length) return Promise.resolve(this.queue.shift()!);
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

  close(): void {
    this.rx.destroy();
    this.tx.destroy();
  }
}

export async function kartTestiMain(args: string[]): Promise<number> {
  const opt = (name: string) => {
    const i = args.indexOf(name);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const port = opt("--port");
  const baud = Number(opt("--baud") ?? 115200);
  const dir = new URL("../bios/testler/", import.meta.url);
  const kaynak = Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(new URL(f, dir), "utf8")]));
  const bios = buildBios(readFileSync(new URL("../bios/bios.s", import.meta.url), "utf8"));
  const programlar = kartTestProgramlari(kaynak, loadLib());
  console.error(`${programlar.length} test programı; beklenen çıktılar simülatörde hesaplanıyor…`);
  const beklenen = await beklenenCiktilar(programlar, bios.flash);

  let link: SerialLink;
  let kapat = () => {};
  if (port) {
    const a = new AygitLink(port, baud);
    link = a;
    kapat = () => a.close();
    console.error(`${port} (${baud} baud): kart açık ve monitör istemde ("> ") olmalı`);
  } else {
    const m = simMakinesi(bios.flash);
    const ml = new MachineLink(m, true);
    m.uartOnOutput = (b) => ml.push(b);
    link = ml;
    console.error("--port verilmedi: karşı taraf simülatör");
  }
  try {
    const tty = process.stderr.isTTY;
    const sonuc = await kartTesti(link, programlar, beklenen, tty ? (s) => process.stderr.write(`\r${s.padEnd(50)}`) : undefined);
    if (tty) process.stderr.write("\r".padEnd(52) + "\r");
    console.log(sonucMetni(programlar, sonuc));
    return sonuc.every((s) => s.ok) ? 0 : 1;
  } finally {
    kapat();
  }
}
