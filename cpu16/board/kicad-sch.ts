// Board tanımından KiCad 7 şeması (.kicad_sch) üretir: her kart ayrı bir proje/PCB.
// Bağlantılar tel yerine her pinin ucuna konan net etiketleriyle yapılır (aynı adlı etiketler
// KiCad'de aynı nettir). Böylece şema okunur kalır ve doğrudan "Update PCB from Schematic"
// ile karta aktarılabilir. Çizim düzeni otomatik ızgaradır; elle düzenlemek serbesttir.

import { kicadPinName, symbolDef, symbolLayout } from "../chips/kicad.ts";
import type { ChipDef, PinDef } from "../chips/types.ts";
import { partValue, type Board } from "./board.ts";
import { BACKPLANE, PASSIVES, type SymbolOnly } from "./passives.ts";

const G = 2.54;
const q = (s: string) => `"${s.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`;
const mm = (v: number) => (Math.round(v * 1000) / 1000).toString();
const snap = (v: number) => Math.round(v / G) * G;

/** Deterministik UUID (aynı girdi → aynı dosya; git farkları anlamlı kalır) */
function uuidGen(seed: string) {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  let n = 0;
  return () => {
    n++;
    const a = (Math.imul(h ^ n, 2654435761) >>> 0).toString(16).padStart(8, "0");
    const b = n.toString(16).padStart(12, "0");
    return `${a}-0000-4000-8000-${b}`;
  };
}

/** Net adı → KiCad etiket metni */
export function kicadNetName(name: string): string {
  if (/^n\d+$/.test(name)) return `N${name.slice(1)}`;
  const clean = name.replace(/\./g, "_").replace(/\s/g, "_");
  return kicadPinName(clean);
}

interface Placed {
  ref: string;
  def: SymbolOnly;
  /** şemadaki değer (74AC ailesi için farklı) */
  value?: string;
  footprint: string;
  nets: Record<string, number>; // pin numarası → net
  role: string;
}

export interface SchematicOptions {
  project: string;
  title: string;
  paper: "A4" | "A3" | "A2" | "A1" | "A0";
  date: string;
  /**
   * İki uçlu pasifler (dekuplaj kondansatörleri …) dar sütunlarda: etiketleri dikey olduğu için
   * yanlarında etiket payı gerekmez. Çok çipli kartın (CPU) A0'a sığması için.
   */
  densePassives?: boolean;
  /**
   * Entegreler de sıkı: iki yandaki etiket payı 50 yerine 30 mm (CPU kartının en uzun etiketi
   * ≈ 10 mm, iki komşu sütunun etiketleri yan yana sığar), alt alta iki entegre arası daha az (VCC ve
   * GND etiketlerine yetecek kadar). Hata ayıklama LED'leri ve çubuk göstergelerle CPU kartı A0'a
   * böyle sığar.
   */
  denseChips?: boolean;
}

const PAPER = { A4: [297, 210], A3: [420, 297], A2: [594, 420], A1: [841, 594], A0: [1189, 841] } as const;

function placedParts(board: Board, card: string, blocks?: ReadonlySet<string>): Placed[] {
  const placed: Placed[] = [];
  for (const ci of board.chips.filter((c) => c.card === card && (!blocks || blocks.has(c.block)))) {
    const nets: Record<string, number> = {};
    for (const p of ci.def.pins) if (ci.nets[p.name] !== undefined) nets[String(p.num)] = ci.nets[p.name];
    placed.push({ ref: ci.ref, def: ci.def, value: partValue(ci), footprint: ci.footprint, nets, role: ci.role });
  }
  for (const p of board.passives.filter((x) => x.card === card && (!blocks || blocks.has(x.block)))) {
    placed.push({ ref: p.ref, def: PASSIVES[p.part], footprint: PASSIVES[p.part].footprint, nets: p.pins, role: p.role });
  }
  return placed;
}

/** Bir netin karttaki kullanım sayısı (tek bağlantılı pinlere "bağlı değil" işareti) */
function netUses(placed: Placed[]): Map<number, number> {
  const uses = new Map<number, number>();
  for (const x of placed) for (const net of Object.values(x.nets)) uses.set(net, (uses.get(net) ?? 0) + 1);
  return uses;
}

/** Gömülü sembol tanımları */
function libSymbols(placed: Placed[]): string[] {
  const defs = new Map<string, SymbolOnly>();
  for (const x of placed) defs.set(x.def.part, x.def);
  return [`  (lib_symbols`, ...[...defs.values()].sort((a, b) => a.part.localeCompare(b.part)).map((d) => symbolDef(d, `cpu16:${d.part}`, "    ")), `  )`];
}

/**
 * Sayfaya ızgara yerleşimi (sütun sütun): sembol örnekleri ve pin uçlarındaki etiketler.
 * `path`: sembol örneklerinin hiyerarşi yolu (kök sayfada kökün uuid'si); `global`: sayfalar
 * arası bağlantı için global etiket. Sayfaya sığmazsa null.
 */
function layoutPage(
  board: Board, placed: Placed[], uses: Map<number, number>, paper: SchematicOptions["paper"], densePassives: boolean,
  uuid: () => string, path: string, project: string, global: boolean, denseChips = false,
): { instances: string[]; labels: string[] } | null {
  const [pw, ph] = PAPER[paper];
  const margin = 25;
  let x = margin + 30;
  let y = margin + 20;
  let colW = 0;
  const labels: string[] = [];
  const instances: string[] = [];
  const sorted = [...placed].sort((a, b) => order(a) - order(b));
  for (const p of sorted) {
    const lay = symbolLayout(p.def);
    const twoPin = p.def.pins.length === 2;
    const height = 2 * lay.h + (denseChips && !twoPin ? 3 * G + 6 : 4 * G + 8);
    const width = 2 * lay.w + 2 * G + (densePassives && twoPin ? 15 : denseChips ? 30 : 50); // etiketler için iki yanda pay
    if (y + height > ph - margin) {
      x += colW;
      y = margin + 20;
      colW = 0;
    }
    colW = Math.max(colW, width);
    const sx = snap(x);
    const sy = snap(y + lay.h + 2 * G);
    y += height;
    instances.push(symbolInstance(p, sx, sy, lay.h, uuid, path, project));
    for (const sp of lay.pins) {
      const net = p.nets[String(sp.pin.num)];
      const px = sx + sp.x;
      const py = sy - sp.y;
      if (net === undefined) {
        labels.push(`  (no_connect (at ${mm(px)} ${mm(py)}) (uuid ${uuid()}))`);
        continue;
      }
      if ((uses.get(net) ?? 0) < 2 && !isBackplane(board.netName(net))) {
        labels.push(`  (no_connect (at ${mm(px)} ${mm(py)}) (uuid ${uuid()}))`);
        continue;
      }
      labels.push((global ? globalLabelAt : labelAt)(kicadNetName(board.netName(net)), px, py, sp.angle, uuid()));
    }
  }
  return x > pw ? null : { instances, labels };
}

export function cardSchematic(board: Board, card: string, o: SchematicOptions): string {
  const uuid = uuidGen(`${o.project}/${card}`);
  const rootUuid = uuid();
  const placed = placedParts(board, card);
  const uses = netUses(placed);
  const out: string[] = [];
  out.push(`(kicad_sch (version 20230121) (generator cpu16_board)`);
  out.push(`  (uuid ${rootUuid})`);
  out.push(`  (paper ${q(o.paper)})`);
  out.push(`  (title_block (title ${q(o.title)}) (date ${q(o.date)}) (rev "1") (company "CPU16") (comment 1 "Bu dosya cpu16/board kaynak kodundan üretildi: npm run cpu16 -- board kicad"))`);
  out.push(...libSymbols(placed));
  const page = layoutPage(board, placed, uses, o.paper, !!o.densePassives, uuid, rootUuid, o.project, false, !!o.denseChips);
  if (!page) throw new Error(`${card} kartı ${o.paper} kâğıdına sığmadı`);
  out.push(...page.instances, ...page.labels);
  out.push(`  (sheet_instances (path "/" (page "1")))`);
  out.push(`)`);
  return out.join("\n") + "\n";
}

export interface SchematicSheet {
  /** sayfa adı (KiCad'de alt sayfa başlığı) */
  name: string;
  /** dosya adı, ör. "hesap-carpma.kicad_sch" */
  file: string;
  /** bu sayfadaki işlev blokları */
  blocks: string[];
}

/**
 * Çok sayfalı (hiyerarşik) şema: kök sayfada her alt sayfa bir kutu, alt sayfalarda blokların
 * çipleri ve pasifleri. Sayfalar arası bağlantılar global etiketlerle (aynı ad = aynı net).
 * Tek sayfaya sığmayan büyük kartlar için (8 bit hesap makinesi). Kağıt boyu her alt sayfa için
 * A3'ten A0'a sığan en küçüğü.
 */
export function hierarchicalSchematic(board: Board, card: string, o: Omit<SchematicOptions, "paper">, sheets: SchematicSheet[]): { file: string; content: string }[] {
  const uuid = uuidGen(`${o.project}/${card}`);
  const rootUuid = uuid();
  const all = placedParts(board, card);
  const uses = netUses(all);
  const covered = new Set(sheets.flatMap((s) => s.blocks));
  const missing = [...new Set([...board.chips, ...board.passives].filter((x) => x.card === card && !covered.has(x.block)).map((x) => x.block))];
  if (missing.length) throw new Error(`${card}: şema sayfalarında olmayan bloklar: ${missing.join(", ")}`);
  const header = (u: string, paper: string, title: string) => [
    `(kicad_sch (version 20230121) (generator cpu16_board)`,
    `  (uuid ${u})`,
    `  (paper ${q(paper)})`,
    `  (title_block (title ${q(title)}) (date ${q(o.date)}) (rev "1") (company "CPU16") (comment 1 "Bu dosya kaynak koddan üretildi: npm run cpu16 -- board kicad"))`,
  ];
  const files: { file: string; content: string }[] = [];
  const boxes: string[] = [];
  sheets.forEach((sh, i) => {
    const sheetUuid = uuid();
    const placed = placedParts(board, card, new Set(sh.blocks));
    let page: ReturnType<typeof layoutPage> = null;
    let paper: SchematicOptions["paper"] = "A3";
    for (const pp of ["A3", "A2", "A1", "A0"] as const) {
      // uuid sırası sayfa denemelerinden bağımsız olsun: her deneme kendi üretecini kullanır
      page = layoutPage(board, placed, uses, pp, !!o.densePassives, uuidGen(`${o.project}/${card}/${sh.file}`), `${rootUuid}/${sheetUuid}`, o.project, true);
      paper = pp;
      if (page) break;
    }
    if (!page) throw new Error(`${card} / ${sh.name}: A0 kâğıdına da sığmadı`);
    const subUuid = uuidGen(`${o.project}/${card}/${sh.file}/kök`)();
    files.push({ file: sh.file, content: [...header(subUuid, paper, `${o.title} — ${sh.name}`), ...libSymbols(placed), ...page.instances, ...page.labels, `)`].join("\n") + "\n" });
    // kök sayfada kutu: 4 sütun
    const bx = 40 + (i % 4) * 90;
    const by = 50 + Math.floor(i / 4) * 45;
    boxes.push([
      `  (sheet (at ${mm(bx)} ${mm(by)}) (size 76.2 25.4) (fields_autoplaced)`,
      `    (stroke (width 0.1524) (type solid)) (fill (color 0 0 0 0.0000))`,
      `    (uuid ${sheetUuid})`,
      `    (property "Sheetname" ${q(sh.name)} (at ${mm(bx)} ${mm(by - 0.7)} 0) (effects (font (size 1.27 1.27)) (justify left bottom)))`,
      `    (property "Sheetfile" ${q(sh.file)} (at ${mm(bx)} ${mm(by + 26)} 0) (effects (font (size 1.27 1.27)) (justify left top)))`,
      `    (instances (project ${q(o.project)} (path ${q(`/${rootUuid}`)} (page ${q(String(i + 2))}))))`,
      `  )`,
    ].join("\n"));
  });
  const root = [...header(rootUuid, "A3", o.title), `  (lib_symbols)`, ...boxes, `  (sheet_instances (path "/" (page "1")))`, `)`].join("\n") + "\n";
  return [{ file: `${o.project}.kicad_sch`, content: root }, ...files];
}

/** Yerleşim sırası: konnektör, entegreler (yerleştirme sırasıyla), pasifler */
function order(p: Placed): number {
  const n = Number(p.ref.replace(/^\D+/, ""));
  if (p.ref.startsWith("J")) return n;
  if (p.ref.startsWith("U")) return 1000 + n;
  return 100_000 + p.ref.charCodeAt(0) * 1000 + n;
}

/** Arka panel netleri: kartta tek uçlu olsalar da etiketlenir (konnektör üzerinden başka karta gider) */
const BACKPLANE_NETS = new Set(Object.values(BACKPLANE));
const isBackplane = (name: string) => BACKPLANE_NETS.has(name);

/** Global etiket: çok sayfalı şemada sayfalar arası aynı net */
function globalLabelAt(text: string, x: number, y: number, pinAngle: number, id: string): string {
  const angle = { 0: 180, 180: 0, 90: 270, 270: 90 }[pinAngle] ?? 0;
  const justify = angle === 180 || angle === 270 ? "right" : "left";
  return `  (global_label ${q(text)} (shape passive) (at ${mm(x)} ${mm(y)} ${angle}) (fields_autoplaced) (effects (font (size 1.27 1.27)) (justify ${justify})) (uuid ${id})\n    (property "Intersheetrefs" "\${INTERSHEET_REFS}" (at ${mm(x)} ${mm(y)} 0) (effects (font (size 1.27 1.27)) hide)))`;
}

function labelAt(text: string, x: number, y: number, pinAngle: number, id: string): string {
  // pin açısı gövdeye doğru; etiket ters yöne yazılır
  const angle = { 0: 180, 180: 0, 90: 270, 270: 90 }[pinAngle] ?? 0;
  const justify = angle === 180 || angle === 270 ? "right" : "left";
  return `  (label ${q(text)} (at ${mm(x)} ${mm(y)} ${angle}) (fields_autoplaced) (effects (font (size 1.27 1.27)) (justify ${justify} bottom)) (uuid ${id}))`;
}

function symbolInstance(p: Placed, x: number, y: number, h: number, uuid: () => string, root: string, project: string): string {
  const def = p.def as ChipDef;
  const pins = (def.pins as PinDef[]).map((pin) => `    (pin ${q(String(pin.num))} (uuid ${uuid()}))`);
  return [
    `  (symbol (lib_id ${q(`cpu16:${def.part}`)}) (at ${mm(x)} ${mm(y)} 0) (unit 1)`,
    `    (in_bom yes) (on_board yes) (dnp no) (uuid ${uuid()})`,
    `    (property "Reference" ${q(p.ref)} (at ${mm(x)} ${mm(y - h - 1.27)} 0) (effects (font (size 1.27 1.27))))`,
    `    (property "Value" ${q(p.value ?? def.part)} (at ${mm(x)} ${mm(y + h + 1.27)} 0) (effects (font (size 1.27 1.27))))`,
    `    (property "Footprint" ${q(p.footprint)} (at ${mm(x)} ${mm(y)} 0) (effects (font (size 1.27 1.27)) hide))`,
    `    (property "Datasheet" "" (at ${mm(x)} ${mm(y)} 0) (effects (font (size 1.27 1.27)) hide))`,
    `    (property "Gorev" ${q(p.role)} (at ${mm(x)} ${mm(y)} 0) (effects (font (size 1.27 1.27)) hide))`,
    ...pins,
    `    (instances (project ${q(project)} (path ${q(`/${root}`)} (reference ${q(p.ref)}) (unit 1))))`,
    `  )`,
  ].join("\n");
}

/** KiCad proje dosyası (en az içerik; KiCad açınca kalanını varsayılanlarla doldurur) */
export function kicadProject(name: string): string {
  return JSON.stringify({ meta: { filename: `${name}.kicad_pro`, version: 1 }, schematic: { legacy_lib_dir: "", legacy_lib_list: [] }, boards: [], text_variables: {} }, null, 2) + "\n";
}

/** Projeye cpu16 sembol kütüphanesini tanıtan tablo */
export const SYM_LIB_TABLE = `(sym_lib_table
  (version 7)
  (lib (name "cpu16")(type "KiCad")(uri "\${KIPRJMOD}/../cpu16.kicad_sym")(options "")(descr "CPU16 parça kütüphanesi (cpu16/chips'ten üretilir)"))
)
`;

/** Kart başına malzeme listesi (CSV) */
export function bomCsv(board: Board, cards: string[]): string {
  const rows = new Map<string, { part: string; title: string; footprint: string; refs: string[]; cards: Set<string> }>();
  const add = (part: string, title: string, footprint: string, ref: string, card: string) => {
    const r = rows.get(part) ?? { part, title, footprint, refs: [], cards: new Set<string>() };
    r.refs.push(ref);
    r.cards.add(card);
    rows.set(part, r);
  };
  for (const ci of board.chips) if (cards.includes(ci.card)) add(partValue(ci), ci.def.title, ci.footprint, ci.ref, ci.card);
  for (const p of board.passives) if (cards.includes(p.card)) add(p.part, PASSIVES[p.part].title, PASSIVES[p.part].footprint, p.ref, p.card);
  const lines = ["Parça;Adet;Açıklama;Footprint;Kart;Referanslar"];
  for (const r of [...rows.values()].sort((a, b) => a.part.localeCompare(b.part))) {
    lines.push([r.part, r.refs.length, r.title, r.footprint, [...r.cards].join(" "), r.refs.join(" ")].join(";"));
  }
  return lines.join("\n") + "\n";
}
