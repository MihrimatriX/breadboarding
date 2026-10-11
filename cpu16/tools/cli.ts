// CPU16 komut satırı: npm run cpu16 -- <komut> <dosya.s> [seçenekler]
//   asm  dosya.s [-o çıktı.hex|.bin] [--list]   derle
//   run  dosya.s [--trace] [--max N]            derle ve emülatörde çalıştır
//   dis  dosya.bin [--org 0x0000]               ikili dosyayı geri çevir
//   ucode dosya.ucode                           mikrokodu derle ve denetle (yordamlar ve döngü sayıları)
//   chips | kicad-sym | board | kontrol | zamanlama  donanım komutları (tools/hw.ts)
//   kit                                         deney rehberlerinin otomatik bölümlerini üret (kit/)
//   bios [-o bios.hex|.bin]                     BIOS'u derle (.bin: 32 KB EEPROM imajı)
//   charrom [-o charrom.bin]                    video kartının karakter ROM'u
//   machine [dosya.s] [--flash|--rom [--led]] [--cycles N] [--screen]
//                                               anakart: BIOS + önyükleyici, UART stdin/stdout'ta
//                                               (--rom: BIOS'suz, program EEPROM bank 0'da)
//   cc   dosya.c [...] [-o x.hex|.bin|.s] [--run] C derle (cc16, ayrıntılar: tools/cc.ts)
//   kart-testi [--port /dev/ttyUSB0] [--baud N]  gerçek kartı UART üzerinden simülatörle karşılaştır
//   kurulum [kart|hepsi] [-o dizin] [--html]     kurulum belgeleri: tel listesi, çip kartları, el kitabı (HTML + PDF)

import { readFileSync, writeFileSync } from "node:fs";
import { assemble } from "../asm/assembler.ts";
import { toIntelHex } from "../asm/hex.ts";
import { Cpu16, SimpleBus } from "../emu/cpu.ts";
import { disassemble } from "../emu/disasm.ts";
import { assembleMicrocode } from "../micro/microasm.ts";
import { ccMain } from "./cc.ts";
import { biosCommand, charromCommand, machineCommand } from "./machine-cli.ts";

const [cmd, file, ...rest] = process.argv.slice(2);
const opt = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? (rest[i + 1] ?? "") : undefined;
};
const hex4 = (n: number) => n.toString(16).toUpperCase().padStart(4, "0");

function build(path: string) {
  const res = assemble(readFileSync(path, "utf8"));
  if (res.errors.length) {
    for (const e of res.errors) console.error(`${path}:${e.line}: ${e.message}`);
    process.exit(1);
  }
  return res;
}

if (["chips", "kicad-sym", "board", "kontrol", "zamanlama"].includes(cmd)) {
  await import("./hw.ts");
  process.exit(0);
}
if (cmd === "kit") {
  await import("../kit/cli.ts");
  process.exit(0);
}
if (cmd === "kurulum") {
  const { kurulumMain } = await import("../kurulum/cli.ts");
  process.exit(await kurulumMain(process.argv.slice(3)));
}
if (cmd === "kart-testi") {
  const { kartTestiMain } = await import("./kart-testi.ts");
  process.exit(await kartTestiMain(process.argv.slice(3)));
}

const machineCmds: Record<string, (args: string[]) => void | Promise<void>> = {
  bios: biosCommand, charrom: charromCommand, machine: machineCommand,
};

if (cmd && cmd in machineCmds) {
  await machineCmds[cmd](process.argv.slice(3));
} else if (!cmd || !file) {
  console.log("kullanım: npm run cpu16 -- asm|run|dis|ucode|cc <dosya> [seçenekler]  ·  bios|charrom|machine|kit|kurulum|kart-testi|zamanlama [seçenekler]");
  process.exit(cmd ? 1 : 0);
} else if (cmd === "cc") {
  process.exitCode = ccMain([file, ...rest]);
} else if (cmd === "asm") {
  const res = build(file);
  const out = opt("-o") ?? file.replace(/\.s$/, ".hex");
  if (out.endsWith(".bin")) {
    const end = Math.max(...res.ranges.map(([, e]) => e));
    writeFileSync(out, res.image.subarray(0, end));
  } else {
    writeFileSync(out, toIntelHex(res.image, res.ranges));
  }
  if (rest.includes("--list")) {
    for (const l of res.listing) {
      const bytes = l.bytes.map((b) => b.toString(16).padStart(2, "0")).join(" ");
      console.log(`${hex4(l.addr)}  ${bytes.slice(0, 23).padEnd(23)}  ${l.source}`);
    }
  }
  const size = res.ranges.reduce((n, [s, e]) => n + e - s, 0);
  console.log(`${out}: ${size} bayt, ${res.symbols.size} sembol`);
} else if (cmd === "run") {
  const res = build(file);
  const bus = new SimpleBus();
  bus.load(res.image);
  bus.onOutput = (ch) => process.stdout.write(ch);
  const cpu = new Cpu16(bus);
  const max = Number(opt("--max") ?? 10_000_000);
  const trace = rest.includes("--trace");
  let result = "ok";
  for (let s = 0; s < max && result === "ok"; s++) {
    if (trace) {
      const w = cpu.read16(cpu.pc);
      const regs = Array.from(cpu.regs, hex4).join(" ");
      console.error(`${hex4(cpu.pc)}  ${hex4(w)}  ${disassemble(w, cpu.pc).padEnd(24)} ${regs}`);
    }
    result = cpu.step();
  }
  const f = `${cpu.n ? "N" : "-"}${cpu.z ? "Z" : "-"}${cpu.c ? "C" : "-"}${cpu.v ? "V" : "-"}${cpu.i ? "I" : "-"}`;
  console.log(`\n[${result}] ${cpu.instructions} komut, PC=${hex4(cpu.pc)} ${f}`);
  console.log(Array.from(cpu.regs, (v, i) => `r${i}=${hex4(v)}`).join(" "));
  if (result === "illegal") process.exit(2);
} else if (cmd === "dis") {
  const bin = readFileSync(file);
  const org = Number(opt("--org") ?? 0);
  for (let i = 0; i + 1 < bin.length; i += 2) {
    const w = bin[i] | (bin[i + 1] << 8);
    console.log(`${hex4(org + i)}  ${hex4(w)}  ${disassemble(w, org + i)}`);
  }
} else if (cmd === "ucode") {
  const res = assembleMicrocode(readFileSync(file, "utf8"));
  if (res.errors.length) {
    for (const e of res.errors) console.error(`${file}:${e.line}: ${e.message}`);
    process.exit(1);
  }
  const kelimeler = new Set(res.rom).size;
  console.log(`${file}: hatasız, ${res.rom.length} adres, ${kelimeler} farklı kontrol kelimesi (kart devresi: npm run cpu16 -- kontrol)`);
  for (const r of res.routines) console.log(`  ${r.name.padEnd(20)} ${r.steps.length + 2} döngü`);
} else {
  console.error(`bilinmeyen komut: ${cmd}`);
  process.exit(1);
}
