// KiCad dosyalarının listesi: hem CLI (yazmak için) hem test (güncel mi diye) kullanır.

import { kicadSymbolLibrary } from "../chips/kicad.ts";
import { CHIPS } from "../chips/library.ts";
import type { Board } from "./board.ts";
import { bomCsv, cardSchematic, kicadProject, SYM_LIB_TABLE, type SchematicOptions } from "./kicad-sch.ts";
import { buildMachineBoard } from "./machine-board.ts";
import { PASSIVES } from "./passives.ts";
import { buildProgrammerBoard } from "./programmer-card.ts";

export const KICAD_DIR = "cpu16/kicad";

/**
 * Bilgisayarın kartları (her biri ayrı KiCad projesi, arka panelle birbirine bağlı).
 * board = "computer": test bilgisayarı (CPU + test bellek + saat; buildComputerBoard, ortak bom.csv);
 * board = "machine": anakart (buildMachineBoard; referanslar o kartta numaralanır, BOM kart klasöründe).
 */
export const KICAD_CARDS: { card: string; title: string; paper: SchematicOptions["paper"]; board: "computer" | "machine" }[] = [
  { card: "cpu", title: "CPU16 — CPU kartı", paper: "A0", board: "computer" },
  { card: "mem", title: "CPU16 — Test bellek kartı (64 KB + UART çıkışı)", paper: "A3", board: "computer" },
  { card: "clk", title: "CPU16 — Saat ve reset kartı", paper: "A3", board: "computer" },
  { card: "bellek", title: "CPU16 — Bellek kartı (Flash 128 KB + RAM 512 KB, bank register'ları)", paper: "A2", board: "machine" },
  { card: "onbellek", title: "CPU16 — Önbellek kartı (2 KB doğrudan eşlemeli, sayaçlar)", paper: "A1", board: "machine" },
];
const DATE = "2026-10-11";

export interface KicadFile {
  path: string;
  content: string;
  /** şema dosyalarında: hangi kartın şeması */
  board?: Board;
  card?: string;
}

function project(board: Board, card: string, title: string, paper: SchematicOptions["paper"]): KicadFile[] {
  return [
    { path: `${KICAD_DIR}/${card}/${card}.kicad_sch`, content: cardSchematic(board, card, { project: card, title, paper, date: DATE }), board, card },
    { path: `${KICAD_DIR}/${card}/${card}.kicad_pro`, content: kicadProject(card) },
    { path: `${KICAD_DIR}/${card}/sym-lib-table`, content: SYM_LIB_TABLE },
  ];
}

/** `board`: test bilgisayarı (buildComputerBoard), `machine`: anakart (buildMachineBoard) */
export function writeKicadFiles(board: Board, machine: Board = buildMachineBoard().board): KicadFile[] {
  const files: KicadFile[] = [{ path: `${KICAD_DIR}/cpu16.kicad_sym`, content: kicadSymbolLibrary([...CHIPS, ...Object.values(PASSIVES)]) }];
  const computerCards = KICAD_CARDS.filter((c) => c.board === "computer");
  for (const c of computerCards) files.push(...project(board, c.card, c.title, c.paper));
  files.push({ path: `${KICAD_DIR}/bom.csv`, content: bomCsv(board, computerCards.map((c) => c.card)) });
  for (const c of KICAD_CARDS.filter((x) => x.board === "machine")) {
    files.push(...project(machine, c.card, c.title, c.paper));
    files.push({ path: `${KICAD_DIR}/${c.card}/bom.csv`, content: bomCsv(machine, [c.card]) });
  }
  // ayrı bir alet: Flash programlayıcı
  const prog = buildProgrammerBoard().board;
  files.push(...project(prog, "prog", "CPU16 — Flash programlayıcı (Arduino Nano + 2 × 74HC595)", "A3"));
  files.push({ path: `${KICAD_DIR}/prog/bom.csv`, content: bomCsv(prog, ["prog"]) });
  return files;
}
