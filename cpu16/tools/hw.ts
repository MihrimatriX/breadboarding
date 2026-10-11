// Donanım komutları (cli.ts üzerinden çağrılır):
//   chips                       parça kütüphanesi: kapı ve transistör sayıları
//   kicad-sym [-o dosya]        KiCad sembol kütüphanesini üret (varsayılan cpu16/kicad/cpu16.kicad_sym)
//   board                       kartların çip sayıları ve ERC (test bilgisayarı ve anakart)
//   board kicad                 cpu16/kicad/<kart>/ şemaları + BOM'ları yeniden üret
//   roms                        cpu16/roms/ altındaki Flash imajlarını (mikrokod, ALU) yeniden üret
//   zamanlama [--tip] [--yol N] şemadan statik zamanlama analizi: en uzun yollar, en yüksek saat hızı
//   zamanlama --anakart [--tip] bütün anakart (6 kart, 6 saat kökü)

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { romFiles } from "../board/roms.ts";
import { erc, type Board } from "../board/board.ts";
import { CLOCK_INPUTS } from "../board/clock-card.ts";
import { buildComputerBoard } from "../board/computer.ts";
import { KICAD_CARDS, writeKicadFiles } from "../board/kicad-files.ts";
import { raporMetni, zamanlamaAnalizi } from "../board/zamanlama.ts";
import { anakartZamanlamasi, buildFullMachineBoard } from "../board/machine-board.ts";
import { ChipBench } from "../chips/bench.ts";
import { toTransistors } from "../chips/cmos.ts";
import { PASSIVES } from "../board/passives.ts";
import { kicadSymbolLibrary } from "../chips/kicad.ts";
import { CHIPS } from "../chips/library.ts";

const [cmd, ...rest] = process.argv.slice(2);
const opt = (name: string) => {
  const i = rest.indexOf(name);
  return i >= 0 ? (rest[i + 1] ?? "") : undefined;
};

if (cmd === "chips") {
  console.log("Parça         Kılıf    Kapı  Transistör  Açıklama");
  for (const def of CHIPS) {
    const bench = new ChipBench(def);
    const gates = bench.circuit.gates.length;
    const tr = def.behavioral ? "-" : String(toTransistors(bench.circuit).chip.transistors.length);
    console.log(`${def.part.padEnd(13)} ${def.pkg.padEnd(8)} ${String(def.behavioral ? "-" : gates).padStart(4)}  ${tr.padStart(10)}  ${def.title}`);
  }
} else if (cmd === "kicad-sym") {
  const out = opt("-o") ?? "cpu16/kicad/cpu16.kicad_sym";
  writeFileSync(out, kicadSymbolLibrary([...CHIPS, ...Object.values(PASSIVES)]));
  console.log(`${out}: ${CHIPS.length} sembol`);
}
else if (cmd === "board") {
  const { board } = buildComputerBoard();
  if (rest[0] === "kicad") {
    for (const f of writeKicadFiles(board)) {
      mkdirSync(f.path.replace(/\/[^/]+$/, ""), { recursive: true });
      writeFileSync(f.path, f.content);
      console.log(f.path);
    }
  } else {
    const show = (title: string, b: Board) => {
      console.log(`== ${title}`);
      for (const [card, parts] of Object.entries(b.summary())) {
        const total = Object.values(parts).reduce((x, n) => x + n, 0);
        console.log(`${card} kartı: ${total} entegre`);
        for (const [part, n] of Object.entries(parts).sort()) console.log(`  ${part.padEnd(12)} × ${n}`);
      }
      const problems = erc(b, ["IRQ", ...CLOCK_INPUTS, "VID_OSC"]); // osilatörlerin sürdüğü netler
      console.log(problems.length ? problems.join("\n") : "ERC: sorun yok");
    };
    show("Test bilgisayarı: CPU + test bellek + saat (buildComputerBoard)", board);
    show("Anakart: CPU + saat + bellek + önbellek + G/Ç + video (buildFullMachineBoard)", buildFullMachineBoard().board);
    console.log(`KiCad kartları: ${KICAD_CARDS.map((c) => c.card).join(", ")}`);
  }
}
else if (cmd === "roms") {
  for (const f of romFiles(readFileSync("cpu16/micro/cpu16.ucode", "utf8"))) {
    mkdirSync(f.path.replace(/\/[^/]+$/, ""), { recursive: true });
    writeFileSync(f.path, f.content);
    console.log(f.path);
  }
}
else if (cmd === "zamanlama" && rest.includes("--anakart")) {
  const kose = rest.includes("--tip") ? "tip" : "maks";
  console.log(raporMetni(anakartZamanlamasi(kose), Number(opt("--yol") ?? 3)));
}
else if (cmd === "zamanlama") {
  const { board } = buildComputerBoard();
  const kose = rest.includes("--tip") ? "tip" : "maks";
  const r = zamanlamaAnalizi(board, { kokler: [{ net: "CLK", ad: "CPU saati" }, { net: "OSC_SRC", ad: "osilatör (CPU × 8)" }], kose });
  console.log(raporMetni(r, Number(opt("--yol") ?? 3)));
  const cpu = r.kokler.find((k) => k.kok === "CLK")!;
  const osc = r.kokler.find((k) => k.kok === "OSC_SRC")!;
  console.log(`\nSonuç: CPU en fazla ${Math.min(cpu.fmaxMHz, osc.fmaxMHz / 8).toFixed(2)} MHz (osilatör ${Math.min(cpu.fmaxMHz * 8, osc.fmaxMHz).toFixed(1)} MHz)`);
}
