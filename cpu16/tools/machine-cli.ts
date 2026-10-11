// Anakart komutları (cli.ts çağırır):
//   bios    [-o bios.hex|bios.bin]          BIOS'u derle (.bin = 128 KB Flash imajı, .hex = sadece BIOS)
//   charrom [-o charrom.bin]                video kartının 4 KB karakter ROM'u
//   machine [dosya.s] [--flash] [--cycles N] [--screen]
//                                           BIOS'u aç, programı UART önyükleyicisiyle yükleyip
//                                           çalıştır; UART stdin/stdout'a bağlı (çıkış: Ctrl-])

import { readFileSync, writeFileSync } from "node:fs";
import { assemble } from "../asm/assembler.ts";
import { BIOS, buildBios } from "../bios/build.ts";
import { MachineLink } from "../bios/simlink.ts";
import { programHex, uploadHex, intelHex } from "../bios/uploader.ts";
import { CPU_HZ, Machine } from "../emu/machine.ts";
import { CODEPAGE, FONT_8X16 } from "../video/font.ts";

const biosPath = new URL("../bios/bios.s", import.meta.url);

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? (args[i + 1] ?? "") : undefined;
}

function loadBios() {
  return buildBios(readFileSync(biosPath, "utf8"));
}

/** UART baytını terminal metnine çevirir (0x80+ CP857). */
function decode(byte: number): string {
  return byte < 0x80 ? String.fromCharCode(byte) : String.fromCodePoint(CODEPAGE[byte] || 0x3f);
}

export function biosCommand(args: string[]): void {
  const b = loadBios();
  const out = opt(args, "-o") ?? "bios.hex";
  if (out.endsWith(".bin")) writeFileSync(out, b.flash);
  else writeFileSync(out, intelHex(b.asm.ranges.map(([s, e]) => ({ addr: s, data: b.asm.image.subarray(s, e) }))));
  console.log(`${out}: BIOS ${b.size} bayt (bank 0'ın ${((b.size / 0x4000) * 100).toFixed(0)}%'i)` +
    (out.endsWith(".bin") ? ", 128 KB SST39SF010 imajı" : ""));
  console.log("Atlama tablosu:");
  for (const [name, addr] of Object.entries(BIOS)) console.log(`  ${name.padEnd(11)} 0x${addr.toString(16).toUpperCase().padStart(4, "0")}`);
}

export function charromCommand(args: string[]): void {
  const out = opt(args, "-o") ?? "charrom.bin";
  // .hex: Flash programlayıcısı (yaz.py) için Intel HEX; diğerleri ham imaj
  writeFileSync(out, out.endsWith(".hex") ? intelHex([{ addr: 0, data: FONT_8X16 }]) : FONT_8X16);
  console.log(`${out}: ${FONT_8X16.length} bayt (256 karakter × 16 satır; adres = kod·16 + satır)`);
}

export async function machineCommand(args: string[]): Promise<void> {
  const file = args.find((a, i) => !a.startsWith("-") && !["--cycles"].includes(args[i - 1] ?? ""));
  const cyclesArg = opt(args, "--cycles");
  const m = new Machine();
  m.loadFlash(loadBios().flash);
  m.reset();
  const link = new MachineLink(m, true);
  m.uartOnOutput = (b) => {
    link.push(b);
    process.stdout.write(decode(b));
  };
  m.runUntil(() => m.uartOutput.endsWith("> "), 2_000_000);

  if (file) {
    const asm = assemble(readFileSync(file, "utf8"));
    if (asm.errors.length) {
      for (const e of asm.errors) console.error(`${file}:${e.line}: ${e.message}`);
      process.exit(1);
    }
    const { hex } = programHex(asm);
    const res = await uploadHex(link, hex, { mode: args.includes("--flash") ? "flash" : "ram", run: !args.includes("--flash") });
    if (!res.ok) {
      console.error(`\nyükleme başarısız: ${res.message}`);
      process.exit(1);
    }
  }

  const finish = () => {
    if (args.includes("--screen")) {
      console.log("\n----- VGA ekranı -----");
      console.log(m.renderText());
    }
    const sec = (m.cycles / CPU_HZ).toFixed(2);
    console.error(`\n[${m.cycles} döngü = ${sec} s @ 4 MHz, ${m.cpu.instructions} komut]`);
  };

  if (cyclesArg !== undefined) {
    // Toplu mod: stdin'i (varsa) gönder, verilen döngü kadar çalıştır.
    if (!process.stdin.isTTY) {
      const chunks: Buffer[] = [];
      for await (const c of process.stdin) chunks.push(c as Buffer);
      m.uartSend(Buffer.concat(chunks));
    }
    m.run(Number(cyclesArg));
    finish();
    return;
  }

  // Etkileşimli: gerçek zamanlı (4 MHz) çalış, stdin → UART.
  const tty = process.stdin.isTTY;
  if (tty) process.stdin.setRawMode(true);
  let stdinDone = false;
  let quietSince = m.cycles;
  let lastOut = m.uartOutput.length;
  process.stdin.on("data", (d: Buffer) => {
    if (d.includes(0x1d)) {
      // Ctrl-]
      finish();
      process.exit(0);
    }
    m.uartSend(d);
  });
  process.stdin.on("end", () => {
    stdinDone = true;
  });
  if (tty) console.error("[UART stdin/stdout'a bağlı; çıkış: Ctrl-]]");
  let last = performance.now();
  const timer = setInterval(() => {
    const now = performance.now();
    const cycles = Math.min(0.1, (now - last) / 1000) * CPU_HZ;
    last = now;
    if (m.run(cycles) === "illegal") {
      console.error(`\nyasadışı komut @ ${m.cpu.illegalAt?.toString(16)}`);
      clearInterval(timer);
      finish();
      process.exit(2);
    }
    if (m.uartOutput.length !== lastOut) {
      lastOut = m.uartOutput.length;
      quietSince = m.cycles;
    }
    // Boru modunda girdi bitip makine yarım saniye sustuysa çık.
    if (stdinDone && m.uart.rxQueue.length === 0 && m.cycles - quietSince > CPU_HZ / 2) {
      clearInterval(timer);
      finish();
      process.exit(0);
    }
  }, 10);
}
