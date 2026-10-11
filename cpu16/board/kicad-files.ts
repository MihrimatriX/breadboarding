// KiCad dosyalarının listesi: hem CLI (yazmak için) hem test (güncel mi diye) kullanır.

import { kicadSymbolLibrary } from "../chips/kicad.ts";
import { CHIPS } from "../chips/library.ts";
import type { Board } from "./board.ts";
import { bomCsv, cardSchematic, kicadProject, SYM_LIB_TABLE } from "./kicad-sch.ts";
import { PASSIVES } from "./passives.ts";

export const KICAD_DIR = "cpu16/kicad";
export const KICAD_CARDS = [
  { card: "cpu", title: "CPU16 — CPU kartı", paper: "A0" as const },
  { card: "mem", title: "CPU16 — Test bellek kartı (64 KB + UART çıkışı)", paper: "A3" as const },
];
const DATE = "2026-10-11";

export function writeKicadFiles(board: Board): { path: string; content: string }[] {
  const files = [{ path: `${KICAD_DIR}/cpu16.kicad_sym`, content: kicadSymbolLibrary([...CHIPS, ...Object.values(PASSIVES)]) }];
  for (const c of KICAD_CARDS) {
    files.push({ path: `${KICAD_DIR}/${c.card}/${c.card}.kicad_sch`, content: cardSchematic(board, c.card, { project: c.card, title: c.title, paper: c.paper, date: DATE }) });
    files.push({ path: `${KICAD_DIR}/${c.card}/${c.card}.kicad_pro`, content: kicadProject(c.card) });
    files.push({ path: `${KICAD_DIR}/${c.card}/sym-lib-table`, content: SYM_LIB_TABLE });
  }
  files.push({ path: `${KICAD_DIR}/bom.csv`, content: bomCsv(board, KICAD_CARDS.map((c) => c.card)) });
  return files;
}
