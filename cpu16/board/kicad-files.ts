// KiCad dosyalarının listesi: hem CLI (yazmak için) hem test (güncel mi diye) kullanır.

import { kicadSymbolLibrary } from "../chips/kicad.ts";
import { CHIPS } from "../chips/library.ts";
import type { Board } from "./board.ts";
import { bomCsv, cardSchematic, kicadProject, SYM_LIB_TABLE } from "./kicad-sch.ts";
import { PASSIVES } from "./passives.ts";
import { buildProgrammerBoard } from "./programmer-card.ts";

export const KICAD_DIR = "cpu16/kicad";
/** Bilgisayarın kartları (aynı Board, arka panelle birbirine bağlı) */
export const KICAD_CARDS = [
  { card: "cpu", title: "CPU16 — CPU kartı", paper: "A0" as const },
  { card: "mem", title: "CPU16 — Test bellek kartı (64 KB + UART çıkışı)", paper: "A3" as const },
  { card: "clk", title: "CPU16 — Saat ve reset kartı", paper: "A3" as const },
];
const DATE = "2026-10-11";

export interface KicadFile {
  path: string;
  content: string;
  /** şema dosyalarında: hangi kartın şeması */
  board?: Board;
  card?: string;
}

function project(board: Board, card: string, title: string, paper: "A0" | "A3"): KicadFile[] {
  return [
    { path: `${KICAD_DIR}/${card}/${card}.kicad_sch`, content: cardSchematic(board, card, { project: card, title, paper, date: DATE }), board, card },
    { path: `${KICAD_DIR}/${card}/${card}.kicad_pro`, content: kicadProject(card) },
    { path: `${KICAD_DIR}/${card}/sym-lib-table`, content: SYM_LIB_TABLE },
  ];
}

export function writeKicadFiles(board: Board): KicadFile[] {
  const files: KicadFile[] = [{ path: `${KICAD_DIR}/cpu16.kicad_sym`, content: kicadSymbolLibrary([...CHIPS, ...Object.values(PASSIVES)]) }];
  for (const c of KICAD_CARDS) files.push(...project(board, c.card, c.title, c.paper));
  files.push({ path: `${KICAD_DIR}/bom.csv`, content: bomCsv(board, KICAD_CARDS.map((c) => c.card)) });
  // ayrı bir alet: Flash programlayıcı
  const prog = buildProgrammerBoard().board;
  files.push(...project(prog, "prog", "CPU16 — Flash programlayıcı (Arduino Nano + 2 × 74HC595)", "A3"));
  files.push({ path: `${KICAD_DIR}/prog/bom.csv`, content: bomCsv(prog, ["prog"]) });
  return files;
}
