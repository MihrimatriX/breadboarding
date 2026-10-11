// cc16 bağlayıcısı (ld16): nesne dosyalarını tek bir as16 assembly metnine bağlar.
//
//  1. Sembol çözümleme: kullanıcı nesnelerindeki global semboller tek olmalı (yoksa "birden fazla
//     tanımlı" hatası); kütüphane parçaları arşiv gibi davranır: yalnızca kullanıcı tanımlamadıysa ve
//     gerekiyorsa bağlanır (kullanıcı putchar'ı yazarsa kütüphanenin putchar'ı atılır).
//  2. Kullanılmayan parçaların atılması: giriş noktasından (__reset) erişilebilen parçalar kalır.
//  3. Yerleşim: ROM'a kod (.text) + sabitler (.rodata) + .data'nın ilk değer imajı; RAM'e .data ve .bss.
//     .data etiketleri RAM adresleriyle "AD = adres" sabiti olarak yazılır, baytlar ROM'daki imaja
//     konur; crt0 açılışta imajı RAM'e kopyalar (__data_load → __data_start).
//  4. Dallanma uzatma: Bcc ±256 B, JAL ±4 KB; sığmayan dallanma/çağrılar uzun biçime çevrilir.
//  5. Çıktı: tek parça, .org'lu, doğrudan as16 ile derlenebilen metin.

import { chunkLabels, chunkRefs, evalConstExpr, INVERT, type Chunk, type Item, type ObjFile } from "./object.ts";

export interface Layout {
  romStart: number;
  romEnd: number;
  ramStart: number;
  /** yığının tepesi; RAM bunun altında biter */
  stackTop: number;
  /** yığın için ayrılacak en az bayt */
  minStack: number;
}

export const DEFAULT_LAYOUT: Layout = {
  romStart: 0x0000,
  romEnd: 0x4000,
  ramStart: 0x4000,
  stackTop: 0xff00,
  minStack: 0x400,
};

export interface LinkError {
  file: string;
  line: number;
  col: number;
  message: string;
}

export interface MapEntry {
  name: string;
  section: string;
  file: string;
  addr: number;
  size: number;
}

export interface LinkResult {
  asm: string;
  errors: LinkError[];
  /** tüm etiket ve sabitlerin adresleri */
  symbols: Map<string, number>;
  /** ROM'da kullanılan bayt (kod + sabit + .data imajı) */
  romSize: number;
  /** RAM'de .data + .bss */
  ramSize: number;
  map: MapEntry[];
}

/** C sembolünü okunur hale getir: "_foo" → "foo", "_foo.u1" → "foo (static)" */
export function demangle(sym: string): string {
  const m = /^_([A-Za-z_]\w*)(?:\.(.+))?$/.exec(sym);
  if (!m) return sym;
  return m[2] ? `${m[1]} (static)` : m[1];
}

const LINKER_SYMS = ["__data_load", "__data_start", "__data_end", "__bss_start", "__bss_end", "__heap_start", "__heap_end", "__stack_top"];

interface Placed {
  chunk: Chunk;
  obj: ObjFile;
}

export function link(objs: ObjFile[], entry = "__reset", layout: Layout = DEFAULT_LAYOUT): LinkResult {
  const errors: LinkError[] = [];
  const err = (file: string, message: string) => errors.push({ file, line: 0, col: 0, message });
  const defs = new Map<string, Placed>();

  // ---- 1. sembol çözümleme
  for (const obj of objs.filter((o) => !o.lib)) {
    for (const chunk of obj.chunks) {
      for (const s of chunk.exports) {
        const prev = defs.get(s);
        if (prev) {
          err(obj.file, `'${demangle(s)}' birden fazla tanımlı (${prev.obj.file} ve ${obj.file})`);
          continue;
        }
        defs.set(s, { chunk, obj });
      }
    }
  }
  const userDefined = new Set(defs.keys());
  const skipped = new Set<Chunk>();
  for (const obj of objs.filter((o) => o.lib)) {
    for (const chunk of obj.chunks) {
      if (chunk.exports.some((s) => userDefined.has(s))) {
        skipped.add(chunk);
        continue;
      }
      for (const s of chunk.exports) {
        const prev = defs.get(s);
        if (prev) {
          err(obj.file, `kütüphane: '${demangle(s)}' birden fazla tanımlı (${prev.obj.file} ve ${obj.file})`);
          continue;
        }
        defs.set(s, { chunk, obj });
      }
    }
  }
  const equates = new Map<string, number>();
  for (const obj of objs) for (const [k, v] of Object.entries(obj.equates)) equates.set(k, v);

  // ---- 2. erişilebilir parçalar
  const live = new Set<Chunk>();
  const undefinedSeen = new Set<string>();
  const resolveRefs = (chunk: Chunk, obj: ObjFile, mark: boolean) => {
    const own = new Set(chunkLabels(chunk));
    for (const r of chunkRefs(chunk)) {
      if (own.has(r) || equates.has(r) || LINKER_SYMS.includes(r)) continue;
      const d = defs.get(r);
      if (!d) {
        const key = `${r}@${obj.file}`;
        if (!undefinedSeen.has(key)) {
          undefinedSeen.add(key);
          err(obj.file, `Tanımsız sembol: '${demangle(r)}' (${obj.file} içinde kullanıldı)`);
        }
        continue;
      }
      if (mark && !live.has(d.chunk)) {
        live.add(d.chunk);
        work.push(d);
      }
    }
  };
  const work: Placed[] = [];
  const root = defs.get(entry);
  if (!root) {
    err("<bağlayıcı>", `Giriş noktası '${entry}' bulunamadı (crt0 bağlanmadı mı?)`);
    return { asm: "", errors, symbols: new Map(), romSize: 0, ramSize: 0, map: [] };
  }
  live.add(root.chunk);
  work.push(root);
  while (work.length) {
    const p = work.pop()!;
    resolveRefs(p.chunk, p.obj, true);
  }
  // kullanıcı kodundaki tanımsız semboller (erişilmeyen fonksiyonlarda bile) raporlanır
  for (const obj of objs.filter((o) => !o.lib)) {
    for (const chunk of obj.chunks) if (!live.has(chunk)) resolveRefs(chunk, obj, false);
  }
  if (errors.length) return { asm: "", errors, symbols: new Map(), romSize: 0, ramSize: 0, map: [] };

  // ---- 3. sıralama
  const ordered: Placed[] = [];
  const pushSection = (sec: Chunk["section"]) => {
    for (const obj of [...objs.filter((o) => !o.lib), ...objs.filter((o) => o.lib)]) {
      for (const chunk of obj.chunks) {
        if (chunk.section === sec && live.has(chunk) && chunk !== root.chunk && !skipped.has(chunk)) ordered.push({ chunk, obj });
      }
    }
  };
  ordered.push(root);
  pushSection("text");
  const rodataStart = ordered.length;
  pushSection("rodata");
  const romChunks = ordered.slice();
  const dataChunks: Placed[] = [];
  const bssChunks: Placed[] = [];
  for (const obj of [...objs.filter((o) => !o.lib), ...objs.filter((o) => o.lib)]) {
    for (const chunk of obj.chunks) {
      if (!live.has(chunk) || skipped.has(chunk)) continue;
      if (chunk.section === "data") dataChunks.push({ chunk, obj });
      if (chunk.section === "bss") bssChunks.push({ chunk, obj });
    }
  }
  if (root.chunk.section !== "text") err(root.obj.file, `Giriş noktası '${entry}' .text bölümünde olmalı`);

  // ---- RAM yerleşimi (kod boyutundan bağımsız)
  const ramSyms = new Map<string, number>();
  const map: MapEntry[] = [];
  let ram = layout.ramStart;
  const dataItemOffsets = new Map<Chunk, number>();
  const placeRam = (list: Placed[]) => {
    for (const { chunk, obj } of list) {
      ram = alignUp(ram, chunk.align);
      const start = ram;
      dataItemOffsets.set(chunk, start);
      for (const it of chunk.items) {
        if (it.k === "label") ramSyms.set(it.name, ram);
        else ram += dataSize(it, ram, chunk);
      }
      map.push({ name: chunk.name, section: chunk.section, file: obj.file, addr: start, size: ram - start });
    }
  };
  ramSyms.set("__data_start", alignUp(ram, 2));
  placeRam(dataChunks);
  ram = alignUp(ram, 2);
  const dataEnd = ram;
  ramSyms.set("__data_end", dataEnd);
  ramSyms.set("__bss_start", ram);
  placeRam(bssChunks);
  ram = alignUp(ram, 2);
  ramSyms.set("__bss_end", ram);
  ramSyms.set("__heap_start", ram);
  ramSyms.set("__heap_end", layout.stackTop - layout.minStack);
  ramSyms.set("__stack_top", layout.stackTop);
  const ramSize = ram - layout.ramStart;
  if (ram > layout.stackTop - layout.minStack) {
    err("<bağlayıcı>", `RAM taştı: .data + .bss = ${ramSize} bayt, yığın için en az ${layout.minStack} bayt kalmalı`);
  }
  const dataImageSize = dataEnd - ramSyms.get("__data_start")!;

  // ---- 4. ROM yerleşimi ve dallanma uzatma
  const level = new Map<Item, number>();
  let romSyms = new Map<string, number>();
  const known = (addr: number) => (name: string): number | undefined => {
    const e = equates.get(name) ?? ramSyms.get(name);
    if (e !== undefined) return e;
    const a = romSyms.get(name);
    return a !== undefined && a <= addr ? a : undefined;
  };
  const liSize = (expr: string, addr: number): number => {
    const v = evalConstExpr(expr, known(addr));
    return v !== undefined && v >= 0 && v <= 255 ? 2 : 4;
  };
  const itemSize = (it: Item, addr: number, chunk: Chunk): number => {
    switch (it.k) {
      case "label":
        return 0;
      case "ins":
        return it.op === "LI" ? liSize(it.args[1] ?? "0", addr) : 2;
      case "br": {
        const l = level.get(it) ?? 0;
        return l === 0 ? 2 : l === 1 ? 4 : 2 + liSize(it.target, addr + 2) + 2;
      }
      case "jmp": {
        const l = level.get(it) ?? 0;
        return l <= 1 ? 2 : liSize(it.target, addr) + 2;
      }
      case "call":
        return (level.get(it) ?? 0) === 0 ? 2 : liSize(it.target, addr) + 2;
      default:
        return dataSize(it, addr, chunk);
    }
  };
  let romEnd = 0;
  let dataLoad = 0;
  const chunkAddr = new Map<Chunk, number>();
  for (let pass = 0; pass < 50; pass++) {
    romSyms = new Map();
    let pc = layout.romStart;
    const addrOf = new Map<Item, number>();
    for (const { chunk } of romChunks) {
      pc = alignUp(pc, chunk.align);
      chunkAddr.set(chunk, pc);
      for (const it of chunk.items) {
        if (it.k === "label") romSyms.set(it.name, pc);
        addrOf.set(it, pc);
        pc += itemSize(it, pc, chunk);
      }
    }
    pc = alignUp(pc, 2);
    dataLoad = pc;
    romSyms.set("__data_load", pc);
    romEnd = pc + dataImageSize;
    // erişim denetimi
    let changed = false;
    const reach = (target: string, from: number, lim: number) => {
      const t = romSyms.get(target);
      if (t === undefined) return false;
      const d = t - (from + 2);
      return d >= -lim && d <= lim - 2;
    };
    for (const { chunk } of romChunks) {
      for (const it of chunk.items) {
        if (it.k !== "br" && it.k !== "jmp" && it.k !== "call") continue;
        const a = addrOf.get(it)!;
        const l = level.get(it) ?? 0;
        let ok: boolean;
        if (it.k === "br") ok = l === 0 ? reach(it.target, a, 256) : l === 1 ? reach(it.target, a + 2, 4096) : true;
        else if (it.k === "jmp") ok = l === 0 ? reach(it.target, a, 256) : l === 1 ? reach(it.target, a, 4096) : true;
        else ok = l === 0 ? reach(it.target, a, 4096) : true;
        if (!ok) {
          level.set(it, l + 1);
          changed = true;
        }
      }
    }
    if (!changed) break;
  }
  if (romEnd > layout.romEnd) {
    err("<bağlayıcı>", `ROM taştı: program ${romEnd - layout.romStart} bayt, sınır ${layout.romEnd - layout.romStart} bayt`);
  }
  for (const { chunk, obj } of romChunks) {
    const start = chunkAddr.get(chunk)!;
    const idx = romChunks.findIndex((p) => p.chunk === chunk);
    const next = romChunks[idx + 1];
    const end = next ? chunkAddr.get(next.chunk)! : dataLoad;
    map.push({ name: chunk.name, section: chunk.section, file: obj.file, addr: start, size: end - start });
  }
  void rodataStart;

  // ---- 5. metin
  const lines: string[] = [];
  lines.push("; cc16 bağlayıcı çıktısı — as16 ile derlenir");
  lines.push(`; ROM 0x${hex(layout.romStart)}–0x${hex(romEnd)} (${romEnd - layout.romStart} B), RAM 0x${hex(layout.ramStart)}–0x${hex(ram)} (${ramSize} B)`);
  for (const [k, v] of equates) lines.push(`${k} = 0x${hex(v & 0xffff)}`);
  for (const [k, v] of ramSyms) lines.push(`${k} = 0x${hex(v)}`);
  lines.push(`        .org 0x${hex(layout.romStart)}`);
  let pc = layout.romStart;
  const emitItems = (chunk: Chunk, asData: boolean) => {
    if (pc % chunk.align) {
      lines.push(`        .align ${chunk.align}`);
      pc = alignUp(pc, chunk.align);
    }
    for (const it of chunk.items) {
      const size = asData ? dataSize(it, pc, chunk) : itemSize(it, pc, chunk);
      if (it.k === "label") {
        if (!asData) lines.push(`${it.name}:`);
      } else {
        lines.push(...render(it, pc));
      }
      pc += size;
    }
  };
  const render = (it: Item, at: number): string[] => {
    const I = (s: string) => `        ${s}`;
    switch (it.k) {
      case "ins":
        return [I(it.args.length ? `${it.op} ${it.args.join(", ")}` : it.op)];
      case "br": {
        const l = level.get(it) ?? 0;
        if (l === 0) return [I(`B${it.cond} ${it.target}`)];
        const inv = INVERT[it.cond];
        if (l === 1) return [I(`B${inv} $+4`), I(`JAL ${it.target}`)];
        const ls = liSize(it.target, at + 2);
        return [I(`B${inv} $+${2 + ls + 2}`), I(`LI r7, ${it.target}`), I("JALR r7, r7, 0")];
      }
      case "jmp": {
        const l = level.get(it) ?? 0;
        if (l === 0) return [I(`B ${it.target}`)];
        if (l === 1) return [I(`JAL ${it.target}`)];
        return [I(`LI r7, ${it.target}`), I("JALR r7, r7, 0")];
      }
      case "call":
        if ((level.get(it) ?? 0) === 0) return [I(`JAL ${it.target}`)];
        return [I(`LI r7, ${it.target}`), I("JALR r7, r7, 0")];
      case "word":
        return [I(`.word ${it.expr}`)];
      case "byte": {
        const out: string[] = [];
        for (let i = 0; i < it.bytes.length; i += 16) out.push(I(`.byte ${it.bytes.slice(i, i + 16).join(", ")}`));
        return out;
      }
      case "space":
        return it.n ? [I(`.space ${it.n}`)] : [];
      case "align":
        return [I(`.align ${it.n}`)];
      default:
        return [];
    }
  };
  let section = "";
  for (const { chunk, obj } of romChunks) {
    if (chunk.section !== section) {
      section = chunk.section;
      lines.push(`; ---- .${section}`);
    }
    lines.push(`; ${chunk.name} (${obj.file})`);
    emitItems(chunk, false);
  }
  if (pc % 2) {
    lines.push("        .align 2");
    pc = alignUp(pc, 2);
  }
  lines.push("; ---- .data ilk değer imajı (crt0 RAM'e kopyalar)");
  lines.push("__data_load:");
  for (const { chunk } of dataChunks) {
    const target = dataItemOffsets.get(chunk)! - ramSyms.get("__data_start")! + dataLoad;
    if (pc < target) {
      lines.push(`        .space ${target - pc}`);
      pc = target;
    }
    emitItems(chunk, true);
  }
  const symbols = new Map<string, number>([...equates, ...ramSyms, ...romSyms]);
  return { asm: lines.join("\n") + "\n", errors, symbols, romSize: romEnd - layout.romStart, ramSize, map };
}

function alignUp(n: number, a: number): number {
  return Math.ceil(n / a) * a;
}

function hex(n: number): string {
  return n.toString(16).toUpperCase().padStart(4, "0");
}

function dataSize(it: Item, addr: number, _chunk: Chunk): number {
  switch (it.k) {
    case "label":
      return 0;
    case "word":
      return 2;
    case "byte":
      return it.bytes.length;
    case "space":
      return it.n;
    case "align":
      return (it.n - (addr % it.n)) % it.n;
    default:
      return 2;
  }
}
