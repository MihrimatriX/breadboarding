// Anakart komutları (cli.ts çağırır):
//   bios    [-o bios.hex|bios.bin]          BIOS'u derle (.bin = 32 KB EEPROM imajı, .hex = sadece BIOS)
//   charrom [-o charrom.bin]                video kartının 4 KB karakter ROM'u
//   machine [dosya.s|dosya.c] [--flash] [--cycles N] [--screen]
//                                           BIOS'u aç, programı UART önyükleyicisiyle yükleyip
//                                           çalıştır; UART stdin/stdout'a bağlı (çıkış: Ctrl-]).
//                                           .c dosyaları cc16 ile BIOS hedefine (0x4000) derlenir
//   machine dosya.s --rom [--led] [--cycles N] [--screen]
//                                           BIOS'suz: program EEPROM bank 0'a yazılmış gibi reset'ten
//                                           çalışır (BIOS'tan önceki deneylerin programları, .org 0).
//                                           --led: FF00'a yazılanları test kartının 8 LED'i gibi göster

import { readFileSync, writeFileSync } from "node:fs";
import { assemble } from "../asm/assembler.ts";
import { BIOS, buildBios } from "../bios/build.ts";
import { MachineLink } from "../bios/simlink.ts";
import { programHex, uploadHex, intelHex } from "../bios/uploader.ts";
import { buildProgram, formatErrors } from "../cc/index.ts";
import { diskReader, loadLib } from "../cc/node.ts";
import { EEPROM_SIZE } from "../emu/devices/eeprom.ts";
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
    (out.endsWith(".bin") ? ", 32 KB 28C256 imajı" : ""));
  console.log("Atlama tablosu:");
  for (const [name, addr] of Object.entries(BIOS)) console.log(`  ${name.padEnd(11)} 0x${addr.toString(16).toUpperCase().padStart(4, "0")}`);
}

export function charromCommand(args: string[]): void {
  const out = opt(args, "-o") ?? "charrom.bin";
  // .hex: EEPROM programlayıcısı (yaz.py) için Intel HEX; diğerleri ham imaj
  writeFileSync(out, out.endsWith(".hex") ? intelHex([{ addr: 0, data: FONT_8X16 }]) : FONT_8X16);
  console.log(`${out}: ${FONT_8X16.length} bayt (256 karakter × 16 satır; adres = kod·16 + satır)`);
}

/** BIOS'suz çalışan bir programın 32 KB EEPROM imajı (program bank 0'da, CPU adresi 0x0000–0x3FFF) */
export function romImage(file: string): Uint8Array {
  const asm = assemble(readFileSync(file, "utf8"));
  if (asm.errors.length) throw new Error(asm.errors.map((e) => `${file}:${e.line}: ${e.message}`).join("\n"));
  const img = new Uint8Array(EEPROM_SIZE).fill(0xff);
  for (const [s, e] of asm.ranges) {
    if (e > 0x4000) throw new Error(`${file}: --rom programı 0x0000–0x3FFF içinde olmalı`);
    img.set(asm.image.subarray(s, e), s);
  }
  return img;
}

export async function machineCommand(args: string[]): Promise<void> {
  const file = args.find((a, i) => !a.startsWith("-") && !["--cycles"].includes(args[i - 1] ?? ""));
  const cyclesArg = opt(args, "--cycles");
  const rom = args.includes("--rom");
  const led = args.includes("--led");
  const m = new Machine();
  if (rom) {
    if (!file) throw new Error("--rom bir program dosyası ister");
    m.loadFlash(romImage(file));
  } else m.loadFlash(loadBios().flash);
  m.reset();
  const link = new MachineLink(m, true);
  m.uartOnOutput = (b) => {
    link.push(b);
    if (!led) process.stdout.write(decode(b));
  };
  if (led) {
    // G/Ç kartından önceki deneylerde FF00 test kartının çıkış mandalıdır (bit 7 solda)
    console.error("[FF00 LED'leri: bit 7 … bit 0; zaman 1 MHz CPU saatiyle]");
    m.onAccess = (w, a, v, c) => {
      if (!w || a !== 0xff00) return;
      const row = Array.from({ length: 8 }, (_, i) => ((v >> (7 - i)) & 1 ? "●" : "·")).join(" ");
      process.stdout.write(`${(c / 1e6).toFixed(3).padStart(9)} s   ${row}   0x${v.toString(16).toUpperCase().padStart(2, "0")}\n`);
    };
  }
  if (!rom) m.runUntil(() => m.uartOutput.endsWith("> "), 2_000_000);

  if (file && !rom) {
    let hex: string;
    if (file.endsWith(".c")) {
      // C: cc16 ile BIOS hedefine derle (kod 0x4000'dan); Web IDE'nin "Derle ve RAM'e yükle"si gibi
      const b = buildProgram({ [file]: readFileSync(file, "utf8") }, [file], { lib: loadLib(), readFile: diskReader, target: "bios" });
      if (b.errors.length) {
        console.error(formatErrors(b.errors));
        process.exit(1);
      }
      hex = intelHex(b.ranges.map(([s, e]) => ({ addr: s, data: b.image.subarray(s, e) })), 0x4000);
    } else {
      const asm = assemble(readFileSync(file, "utf8"));
      if (asm.errors.length) {
        for (const e of asm.errors) console.error(`${file}:${e.line}: ${e.message}`);
        process.exit(1);
      }
      hex = programHex(asm).hex;
    }
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
