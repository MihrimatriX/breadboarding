// cc16 komut satırı: npm run cpu16 -- cc dosya.c [diğer.c|.s ...] [seçenekler]
//
//   -o çıktı.hex|.bin|.s   çıktı (varsayılan: ilk dosyanın adı + .hex; --run varsa dosya yazılmaz)
//   --run                  emülatörde çalıştır, UART çıktısını yazdır
//   --hedef rom|bios       rom (varsayılan): 0x0000'dan, kendi vektörleriyle; bios: RAM'e 0x4000'dan
//                          yüklenir, BIOS monitöründen G 4000 ile çalışır (--run anakart + BIOS'ta çalıştırır;
//                          stdin bir boru ya da dosyaysa içeriği programa UART'tan klavye girdisi olarak gider)
//   --max N                en fazla komut sayısı; BIOS hedefinde döngü sayısı (varsayılan 50 milyon)
//   -I dizin               başlık arama dizini (birden fazla olabilir)
//   -D AD[=değer]          makro tanımla
//   -O0                    iyileştirmeleri kapat
//   --nostdlib             crt0 ve libc16'yı bağlama
//   --map                  sembol / parça yerleşimini yazdır

import { readFileSync, writeFileSync } from "node:fs";
import { toIntelHex } from "../asm/hex.ts";
import { buildBios } from "../bios/build.ts";
import { buildProgram, demangle, formatErrors, type BuildResult } from "../cc/index.ts";
import { Machine } from "../emu/machine.ts";
import { diskReader, loadLib } from "../cc/node.ts";
import { runProgram } from "../cc/run.ts";
import { CODEPAGE } from "../video/font.ts";

const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

export function ccMain(args: string[]): number {
  const inputs: string[] = [];
  const includeDirs: string[] = [];
  const defines: Record<string, string> = {};
  let output: string | undefined;
  let run = false;
  let max = 50_000_000;
  let optimize = true;
  let nostdlib = false;
  let showMap = false;
  let target: "rom" | "bios" = "rom";
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const val = () => {
      const v = args[++i];
      if (v === undefined) throw new Error(`${a} bir değer bekler`);
      return v;
    };
    if (a === "-o") output = val();
    else if (a === "--run") run = true;
    else if (a === "--max") max = Number(val());
    else if (a === "-I") includeDirs.push(val());
    else if (a.startsWith("-I")) includeDirs.push(a.slice(2));
    else if (a === "-D" || a.startsWith("-D")) {
      const d = a === "-D" ? val() : a.slice(2);
      const eq = d.indexOf("=");
      if (eq < 0) defines[d] = "1";
      else defines[d.slice(0, eq)] = d.slice(eq + 1);
    } else if (a === "-O0") optimize = false;
    else if (a === "-O" || a === "-O1" || a === "-O2") optimize = true;
    else if (a === "--nostdlib") nostdlib = true;
    else if (a === "--map") showMap = true;
    else if (a === "--hedef") {
      const t = val();
      if (t !== "rom" && t !== "bios") throw new Error(`--hedef rom ya da bios olmalı: ${t}`);
      target = t;
    }
    else if (a.startsWith("-")) throw new Error(`bilinmeyen seçenek: ${a}`);
    else inputs.push(a);
  }
  if (!inputs.length) {
    console.error("kullanım: npm run cpu16 -- cc dosya.c [diğer.c ...] [-o çıktı.hex|.bin|.s] [--run] [-I dizin] [-D AD=değer] [-O0] [--map]");
    return 1;
  }

  const files: Record<string, string> = {};
  for (const f of inputs) {
    try {
      files[f] = readFileSync(f, "utf8");
    } catch {
      console.error(`${f}: dosya okunamadı`);
      return 1;
    }
  }
  const res = buildProgram(files, inputs, { lib: loadLib(), readFile: diskReader, includeDirs, defines, optimize, nostdlib, target });
  if (res.errors.length) {
    console.error(formatErrors(res.errors));
    return 1;
  }

  const start = target === "bios" ? 0x4000 : 0;
  const summary = `kod ${res.romSize} bayt (0x${hex4(start)}–0x${hex4(start + res.romSize)}), RAM ${res.ramSize} bayt`;
  if (output || !run) {
    const out = output ?? inputs[0].replace(/\.[cs]$/, "") + ".hex";
    if (out.endsWith(".s")) writeFileSync(out, res.asm);
    else if (out.endsWith(".bin")) writeFileSync(out, res.image.subarray(0, Math.max(...res.ranges.map(([, e]) => e))));
    else writeFileSync(out, toIntelHex(res.image, res.ranges));
    console.error(`${out}: ${summary}`);
  } else {
    console.error(summary);
  }
  if (showMap) {
    for (const m of [...res.map].sort((a, b) => a.addr - b.addr)) {
      console.error(`  ${hex4(m.addr)}  ${String(m.size).padStart(5)}  ${m.section.padEnd(6)}  ${demangle(m.name).padEnd(24)} ${m.file}`);
    }
  }
  if (!run) return 0;
  if (target === "bios") return runOnBios(res, max);

  const r = runProgram(res.image, {
    maxSteps: max,
    onOutput: (ch) => process.stdout.write(Buffer.from([ch.charCodeAt(0)])),
  });
  const why = r.result === "halted" ? `çıkış kodu ${r.exitCode}` : r.result === "illegal" ? `yasadışı komut, PC=0x${hex4(r.cpu.pc)}` : `${max} komut sınırına ulaşıldı`;
  console.error(`\n[${r.result}] ${why}, ${r.steps} komut${r.romWrites ? `, UYARI: ROM'a ${r.romWrites} yazma yok sayıldı` : ""}`);
  return r.result === "halted" ? 0 : 2;
}

/** BIOS hedefli programı anakart modelinde çalıştırır: BIOS açılır, program RAM'e konur, G 4000. */
function runOnBios(res: BuildResult, maxCycles: number): number {
  const m = new Machine();
  m.loadFlash(buildBios(readFileSync(new URL("../bios/bios.s", import.meta.url), "utf8")).flash);
  m.reset();
  m.runUntil(() => m.uartOutput.endsWith("> "), 4_000_000);
  for (const [s, e] of res.ranges) m.pokeCpu(s, res.image.subarray(s, e));
  const from = m.uartOutput.length;
  // BIOS'un ekranı CP857'dir (çerçeve karakterleri, Türkçe harfler): 0x80 üstü baytlar terminale
  // o kod sayfasıyla çözülerek yazılır (machine komutu gibi)
  m.uartOnOutput = (b) => process.stdout.write(b < 0x80 ? String.fromCharCode(b) : String.fromCodePoint(CODEPAGE[b] || 0x3f));
  m.uartSend("G 4000\r");
  // Boru ya da dosyadan gelen girdi (ör. echo "2+3" | ... --run) G'den sonra UART'tan gönderilir:
  // program onu bios_getc / bios_getline ile klavyeden yazılmış gibi okur. Terminalde (TTY) beklenmez.
  if (!process.stdin.isTTY) {
    const input = readFileSync(0);
    if (input.length) m.uartSend(input);
  }
  // Bitti: monitör istemi ("> ") geldi VE yığın göstergesi BIOS'un yığınında (0xF800 üstü). Program
  // kendi yığınında (0xF800 altı) çalışır; çıktısında "> " geçse bile o sırada SP 0xF800'ün altındadır.
  const done = m.runUntil(
    () => m.uartOutput.length > from + 8 && m.uartOutput.endsWith("> ") && m.cpu.regs[6] > 0xf800,
    maxCycles,
  );
  console.error(`\n[${done ? "monitöre döndü" : `${maxCycles} döngü sınırı`}] ${m.cycles} döngü (${(m.cycles / 4e6).toFixed(2)} s, 4 MHz)`);
  console.error(m.renderText().replace(/\s+$/gm, "").replace(/\n{2,}/g, "\n"));
  return done ? 0 : 2;
}
