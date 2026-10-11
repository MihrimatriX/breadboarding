// Donanım komutları (cli.ts üzerinden çağrılır):
//   chips                       parça kütüphanesi: kapı ve transistör sayıları
//   kicad-sym [-o dosya]        KiCad sembol kütüphanesini üret (varsayılan cpu16/kicad/cpu16.kicad_sym)
//   board                       kartların çip sayıları
//   board kicad                 cpu16/kicad/<kart>/ şemaları + BOM'u yeniden üret

import { mkdirSync, writeFileSync } from "node:fs";
import { erc } from "../board/board.ts";
import { buildComputerBoard } from "../board/computer.ts";
import { KICAD_CARDS, writeKicadFiles } from "../board/kicad-files.ts";
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
    for (const [card, parts] of Object.entries(board.summary())) {
      const total = Object.values(parts).reduce((a, b) => a + b, 0);
      console.log(`${card} kartı: ${total} entegre`);
      for (const [part, n] of Object.entries(parts).sort()) console.log(`  ${part.padEnd(12)} × ${n}`);
    }
    const problems = erc(board, ["CLK", "WR_WIN", "~RESET", "IRQ"]);
    console.log(problems.length ? problems.join("\n") : "ERC: sorun yok");
    console.log(`kartlar: ${KICAD_CARDS.map((c) => c.card).join(", ")}`);
  }
}
