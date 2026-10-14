// Deney rehberlerinin otomatik bölümleri: her deneyde hangi entegreler takılır, hangi pin hangi
// nete bağlanır, hangi netler henüz kurulmamış bloklardan gelir (elle sürülür) ya da onlara gider
// (LED'le izlenir). Kaynak kart tanımlarının kendisi (board/*.ts): şema değişirse rehber de değişir,
// testler depodaki rehberlerin güncel olduğunu denetler.

import type { Board } from "../board/board.ts";
import { buildComputerBoard } from "../board/computer.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { BACKPLANE, PASSIVES } from "../board/passives.ts";
import { buildProgrammerBoard } from "../board/programmer-card.ts";
import { ChipBench } from "../chips/bench.ts";
import { toTransistors } from "../chips/cmos.ts";
import { chip } from "../chips/library.ts";
import type { PinDir } from "../chips/types.ts";
import { DENEYLER, SADECE_SIM, dosyaAdi, type Deney, type KitBoard } from "./deneyler.ts";

export const KIT_DIR = "cpu16/kit";
export const OTO_BASLA = "<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->";
export const OTO_BITTI = "<!-- otomatik: bitti -->";

interface Pin {
  num: number;
  name: string;
  dir: PinDir;
  net: number;
}

interface Elem {
  /** "U12", glue biriminde "U116/2" */
  id: string;
  ref: string;
  part: string;
  title: string;
  card: string;
  block: string;
  role: string;
  passive: boolean;
  pins: Pin[];
  /** Yapıştırıcı lojik çipinin kendisi (besleme ve boş birimler) */
  shell?: boolean;
  unit?: number;
  deney?: number;
}

const BACKPLANE_PIN = new Map(Object.entries(BACKPLANE).map(([num, name]) => [name, Number(num)]));

function elements(board: Board): Elem[] {
  const out: Elem[] = [];
  for (const ci of board.chips) {
    const sig = ci.def.pins.filter((p) => p.dir !== "power" && p.dir !== "nc").map((p) => ({ num: p.num, name: p.name, dir: p.dir, net: ci.nets[p.name] }));
    const base = { ref: ci.ref, part: ci.def.part, title: ci.def.title, card: ci.card, passive: false };
    if (ci.glueUnits) {
      const used = new Set(ci.glueUnits.flatMap((u) => u.pins));
      ci.glueUnits.forEach((u, k) => out.push({
        ...base, id: `${ci.ref}/${k + 1}`, block: u.block, role: u.role || "yapıştırıcı kapı", unit: k + 1,
        pins: sig.filter((p) => u.pins.includes(p.name)),
      }));
      out.push({ ...base, id: ci.ref, block: "", role: ci.role, shell: true, pins: sig.filter((p) => !used.has(p.name)) });
    } else {
      out.push({ ...base, id: ci.ref, block: ci.block, role: ci.role, pins: sig });
    }
  }
  for (const p of board.passives) {
    if (p.part === "BACKPLANE_2x32") continue;
    const def = PASSIVES[p.part];
    out.push({
      id: p.ref, ref: p.ref, part: p.part, title: def?.title ?? p.part, card: p.card, block: p.block, role: p.role, passive: true,
      pins: Object.entries(p.pins).map(([num, net]) => ({ num: Number(num), name: def?.pins.find((x) => x.num === Number(num))?.name ?? num, dir: "passive" as PinDir, net })),
    });
  }
  return out;
}

export interface KitData {
  boards: Record<KitBoard, Board>;
  elems: Record<KitBoard, Elem[]>;
}

export function kitData(): KitData {
  const boards: Record<KitBoard, Board> = {
    bilgisayar: buildComputerBoard().board,
    anakart: buildFullMachineBoard().board,
    programlayici: buildProgrammerBoard().board,
  };
  const elems = { bilgisayar: elements(boards.bilgisayar), anakart: elements(boards.anakart), programlayici: elements(boards.programlayici) };
  // yalnızca simülasyonda olan bloklar rehbere girmez (deney 0)
  for (const k of SADECE_SIM) {
    for (const e of elems[k.board]) if (e.card === k.card && !e.shell && (!k.blocks || k.blocks.includes(e.block))) e.deney = 0;
  }
  // kartın besleme girişi kartın ilk deneyinde; dekuplaj kondansatörü kendi çipiyle birlikte
  for (const d of DENEYLER) {
    for (const k of d.kartlar ?? []) {
      for (const e of elems[k.board]) if (e.card === k.card && e.block === "Besleme ve arka panel") e.deney ??= d.no;
    }
  }
  for (const d of DENEYLER) {
    for (const k of d.kartlar ?? []) {
      for (const e of elems[k.board]) {
        if (e.deney !== undefined || e.shell || e.card !== k.card) continue;
        if (!k.blocks || k.blocks.includes(e.block)) e.deney = d.no;
      }
    }
  }
  // anakartın CPU ve saat kartı bilgisayardakiyle aynı (aynı referanslar): onların deneyinde kurulur
  const ortak = new Map(elems.bilgisayar.filter((e) => e.card === "cpu" || e.card === "clk").map((e) => [`${e.card}/${e.id}`, e.deney]));
  for (const e of elems.anakart) {
    if (e.card !== "cpu" && e.card !== "clk") continue;
    if (!ortak.has(`${e.card}/${e.id}`)) throw new Error(`anakartta bilgisayarda olmayan ${e.card} elemanı: ${e.id}`);
    e.deney = ortak.get(`${e.card}/${e.id}`);
  }
  for (const list of Object.values(elems)) {
    for (const e of list) {
      if (!e.shell) continue;
      const units = list.filter((u) => u.ref === e.ref && !u.shell && u.deney);
      e.deney = units.length ? Math.min(...units.map((u) => u.deney!)) : undefined;
    }
    for (const e of list) {
      const m = e.passive && /^(U\d+) dekuplaj$/.exec(e.role);
      if (m) e.deney = list.find((c) => c.id === m[1])?.deney ?? e.deney;
    }
    const missing = list.filter((e) => e.deney === undefined);
    if (missing.length) throw new Error(`Hiçbir deneye atanmamış elemanlar: ${missing.map((e) => `${e.id} (${e.card}/${e.block})`).join(", ")}`);
  }
  return { boards, elems };
}

const natural = (a: string, b: string) => a.localeCompare(b, "tr", { numeric: true });
const pinText = (e: Elem, p: Pin) => (e.passive ? `${e.ref}.${p.num}` : `${e.ref}-${p.num} ${p.name}`);
const isDriver = (e: Elem, p: Pin) => e.passive || p.dir === "out" || p.dir === "tri" || p.dir === "bidir";

/** Bir deneyin otomatik bölümü (markdown) */
export function deneyBolumu(d: Deney, data: KitData): string {
  const lines: string[] = [];
  if (d.cip) lines.push(...cipBolumu(d.cip));
  const boards = [...new Set((d.kartlar ?? []).map((k) => k.board))];
  for (const bn of boards) {
    const board = data.boards[bn];
    const all = data.elems[bn];
    const mine = all.filter((e) => e.deney === d.no);
    const before = all.filter((e) => e.deney! > 0 && e.deney! < d.no);
    const later = all.filter((e) => e.deney! > d.no);
    const baslik = { programlayici: "Programlayıcı kartı", bilgisayar: "Bilgisayar (CPU, saat ve test kartı)", anakart: "Anakart" }[bn];
    if (boards.length > 1) lines.push(`### ${baslik}`, "");
    lines.push(...malzeme(mine, all), ...baglantilar(board, mine, before, later));
  }
  if (!lines.length) lines.push("Bu deneyde yeni donanım kurulmaz; önceki deneylerin kartları kullanılır.");
  return lines.join("\n");
}

function malzeme(mine: Elem[], all: Elem[]): string[] {
  const chips = mine.filter((e) => !e.passive && !e.unit);
  const units = mine.filter((e) => e.unit);
  const passives = mine.filter((e) => e.passive);
  const nChips = chips.length;
  const out = [`#### Malzeme (${nChips} entegre, ${passives.length} pasif eleman)`, ""];
  const group = (list: Elem[]) => {
    const m = new Map<string, Elem[]>();
    for (const e of list) (m.get(e.part) ?? m.set(e.part, []).get(e.part)!).push(e);
    return [...m.entries()].sort((a, b) => natural(a[0], b[0]));
  };
  if (chips.length) {
    out.push("| Parça | Adet | Referanslar | Açıklama | Besleme |", "|---|---|---|---|---|");
    for (const [part, list] of group(chips)) {
      const def = chip(part);
      const pwr = def.pins.filter((p) => p.dir === "power").map((p) => `${p.name} ${p.num}`).join(", ");
      out.push(`| ${part} | ${list.length} | ${list.map((e) => e.ref).sort(natural).join(" ")} | ${def.title} | ${pwr} |`);
    }
    out.push("");
  }
  if (passives.length) {
    out.push("| Pasif | Adet | Referanslar | Açıklama |", "|---|---|---|---|");
    for (const [part, list] of group(passives)) out.push(`| ${part} | ${list.length} | ${list.map((e) => e.ref).sort(natural).join(" ")} | ${list[0].title} |`);
    out.push("");
  }
  const shared = [...new Set(units.map((u) => u.ref))].sort(natural);
  if (shared.length) {
    out.push("Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:", "");
    for (const ref of shared) {
      const us = all.filter((u) => u.ref === ref && u.unit);
      const here = us.filter((u) => units.includes(u)).map((u) => `${u.unit}. kapı (${u.role})`);
      const other = us.filter((u) => !units.includes(u)).map((u) => `${u.unit}. kapı → Deney ${u.deney}`);
      const placed = all.find((e) => e.ref === ref && e.shell)!.deney;
      const where = placed === mine[0]?.deney ? "bu deneyde takılır" : `${placed}. deneyde takıldı`;
      out.push(`- **${ref}** (${us[0].part}, ${where}): ${here.join("; ")}${other.length ? `. Diğerleri: ${other.join(", ")}` : ""}`);
    }
    out.push("");
  }
  return out;
}

function baglantilar(board: Board, mine: Elem[], before: Elem[], later: Elem[]): string[] {
  const { GND, VCC } = board.c;
  const pulled = new Set(board.pulls.map((p) => p.net));
  type End = { e: Elem; p: Pin };
  const ends = (list: Elem[]) => {
    const m = new Map<number, End[]>();
    for (const e of list) for (const p of e.pins) (m.get(p.net) ?? m.set(p.net, []).get(p.net)!).push({ e, p });
    return m;
  };
  const em = ends(mine);
  const eb = ends(before);
  const el = ends(later);
  const nets = [...em.keys()].filter((n) => n !== GND && n !== VCC);
  nets.sort((a, b) => natural(board.netName(a), board.netName(b)));
  const drive: string[] = [];
  const watch: string[] = [];
  const open: string[] = [];
  const rows: string[] = [];
  for (const net of nets) {
    const name = board.netName(net);
    const here = em.get(net)!;
    const prev = eb.get(net) ?? [];
    const next = el.get(net) ?? [];
    if (here.length === 1 && !prev.length && !next.length && !pulled.has(net) && here[0].p.dir !== "in") {
      open.push(pinText(here[0].e, here[0].p));
      continue;
    }
    const notes: string[] = [];
    const bp = BACKPLANE_PIN.get(name);
    if (bp) notes.push(`arka panel ${bp}`);
    if (pulled.has(net)) {
      const rn = [...here, ...prev, ...next].find((x) => x.e.passive && x.e.part.startsWith("RN"));
      notes.push(rn && rn.e.deney !== here[0].e.deney ? `çekme direnci ${rn.e.ref} (Deney ${rn.e.deney})` : "çekme direnci");
    }
    const driven = pulled.has(net) || [...here, ...prev].some((x) => isDriver(x.e, x.p));
    if (!driven && here.some((x) => x.p.dir === "in")) {
      const from = [...new Set(next.filter((x) => isDriver(x.e, x.p)).map((x) => x.e.deney))].sort((a, b) => a! - b!);
      notes.push(`▶ elle sür${from.length ? ` (Deney ${from.join(", ")})` : ""}`);
      drive.push(`\`${name}\``);
    } else if (here.some((x) => isDriver(x.e, x.p) && !x.e.passive) && next.length && !prev.length && here.every((x) => x.p.dir !== "in")) {
      notes.push("◀ LED'le izlenebilir");
      watch.push(`\`${name}\``);
    }
    if (prev.length) notes.push(`önceki: Deney ${[...new Set(prev.map((x) => x.e.deney))].sort((a, b) => a! - b!).join(", ")}`);
    const pins = here.map((x) => pinText(x.e, x.p)).sort(natural).join(", ");
    rows.push(`| ${/^n\d+$/.test(name) ? "(adsız)" : `\`${name}\``} | ${pins} | ${notes.join(" · ")} |`);
  }
  const tie = (level: number, label: string) => {
    const list = (em.get(level) ?? []).filter((x) => !x.e.passive).map((x) => pinText(x.e, x.p)).sort(natural);
    return list.length ? [`| **${label}** | ${list.join(", ")} | sabit seviye |`] : [];
  };
  const out = [`#### Bağlantılar (${rows.length} net)`, ""];
  out.push(
    "Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).",
    "Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur",
    "(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,",
    "elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.",
    "",
    "| Net | Pinler | Not |",
    "|---|---|---|",
    ...tie(GND, "GND"),
    ...tie(VCC, "VCC"),
    ...rows,
    "",
  );
  if (open.length) out.push(`**Boşta kalan çıkışlar (bağlanmaz):** ${open.sort(natural).join(", ")}`, "");
  if (drive.length) out.push(`**Elle sürülecek girişler (${drive.length}):** ${drive.join(", ")}`, "");
  if (watch.length) out.push(`**İzlenebilecek çıkışlar (${watch.length}):** ${watch.join(", ")}`, "");
  return out;
}

function cipBolumu(part: string): string[] {
  const def = chip(part);
  const bench = new ChipBench(def);
  const tr = toTransistors(bench.circuit).chip.transistors.length;
  const out = [`#### ${part}: ${def.title}`, "", `Kılıf ${def.pkg}, kapı seviyesinde ${bench.circuit.gates.length} kapı, CMOS açılımında ${tr} transistör.`, ""];
  out.push("| Pin | Ad | Yön |", "|---|---|---|");
  const dirs: Record<string, string> = { in: "giriş", out: "çıkış", tri: "üç durumlu çıkış", bidir: "çift yönlü", power: "besleme", nc: "boş", passive: "pasif" };
  for (const p of def.pins) out.push(`| ${p.num} | ${p.name} | ${dirs[p.dir]} |`);
  out.push("");
  const ins = def.pins.filter((p) => p.dir === "in").map((p) => p.name);
  const outs = def.pins.filter((p) => p.dir === "out").map((p) => p.name);
  if (ins.length <= 8 && /^1[A-Z]$/.test(ins[0] ?? "")) {
    // birim 1'in doğruluk tablosu, kapı modelini çalıştırarak
    const uIn = ins.filter((n) => n.startsWith("1"));
    const uOut = outs.filter((n) => n.startsWith("1"));
    out.push(`Birim 1'in doğruluk tablosu (kapı modeli çalıştırılarak üretildi):`, "", `| ${[...uIn, ...uOut].join(" | ")} |`, `|${"---|".repeat(uIn.length + uOut.length)}`);
    for (const n of ins) bench.drive(n, 0);
    for (let v = 0; v < 1 << uIn.length; v++) {
      uIn.forEach((n, i) => bench.drive(n, ((v >> (uIn.length - 1 - i)) & 1) === 1));
      bench.settle();
      out.push(`| ${[...uIn.map((_, i) => (v >> (uIn.length - 1 - i)) & 1), ...uOut.map((n) => bench.get(n))].join(" | ")} |`);
    }
    out.push("");
  }
  return out;
}

/** Rehber dosyasının otomatik bölümünü yenile (işaretler yoksa sona ekler) */
export function updateGuide(text: string, section: string): string {
  const block = `${OTO_BASLA}\n${section.trimEnd()}\n${OTO_BITTI}`;
  const a = text.indexOf(OTO_BASLA);
  const b = text.indexOf(OTO_BITTI);
  if (a < 0 || b < a) return `${text.trimEnd()}\n\n## Malzeme ve bağlantılar\n\n${block}\n`;
  return text.slice(0, a) + block + text.slice(b + OTO_BITTI.length);
}

export function guideFiles(read: (path: string) => string | null): { path: string; content: string }[] {
  const data = kitData();
  return DENEYLER.map((d) => {
    const path = `${KIT_DIR}/${dosyaAdi(d)}`;
    const text = read(path) ?? `# Deney ${d.no}: ${d.baslik}\n`;
    return { path, content: updateGuide(text, deneyBolumu(d, data)) };
  });
}
