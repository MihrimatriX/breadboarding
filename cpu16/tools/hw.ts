// Donanım komutları (cli.ts üzerinden çağrılır):
//   chips                       parça kütüphanesi: kapı ve transistör sayıları
//   kicad-sym [-o dosya]        KiCad sembol kütüphanesini üret (varsayılan cpu16/kicad/cpu16.kicad_sym)

import { writeFileSync } from "node:fs";
import { ChipBench } from "../chips/bench.ts";
import { toTransistors } from "../chips/cmos.ts";
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
  writeFileSync(out, kicadSymbolLibrary(CHIPS));
  console.log(`${out}: ${CHIPS.length} sembol`);
}
