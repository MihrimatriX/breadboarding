// cc16: CPU16 için C derleyicisi — tarayıcıda ve Node'da çalışan genel API.
//
//   compile(dosyalar, girişler, seçenekler)      → { asm, errors }       (bağlanmış as16 metni)
//   buildProgram(dosyalar, girişler, seçenekler) → { image, ranges, symbols, errors, ... }
//
// Hiçbir dosya sistemi erişimi yoktur: kaynaklar ve kütüphane (crt0.s, rt.s, libc16.c, başlıklar)
// bellekteki haritalardan gelir. Kütüphaneyi Node'da node.ts (loadLib), tarayıcıda lib-vite.ts sağlar.
//
// Aşamalar: önişlemci → ayrıştırıcı (tipli AST) → kod üreteci (parça listesi) → bağlayıcı → as16.

import { assemble, type AsmResult } from "../asm/assembler.ts";
import { codegen } from "./codegen.ts";
import { CompileError } from "./lexer.ts";
import { DEFAULT_LAYOUT, link, type Layout, type LinkResult, type MapEntry } from "./linker.ts";
import { asmToObject, type ObjFile } from "./object.ts";
import { parseTU } from "./parser.ts";
import { preprocess } from "./preprocess.ts";

export { DEFAULT_LAYOUT, demangle, type Layout, type MapEntry } from "./linker.ts";

/** cpu16/lib içeriği: "crt0.s", "rt.s", "libc16.c", "include/stdio.h" ... → metin */
export type LibSources = Record<string, string>;

export interface CcError {
  file: string;
  line: number;
  col: number;
  message: string;
}

export interface CompileOptions {
  /** çalışma zamanı kütüphanesi (crt0, rt, libc16 ve başlıklar) */
  lib?: LibSources;
  /** true: kütüphane bağlanmaz (crt0 dahil); program __reset'i kendisi tanımlamalı */
  nostdlib?: boolean;
  /** -D: önceden tanımlı makrolar */
  defines?: Record<string, string>;
  /** -I: ek başlık arama dizinleri */
  includeDirs?: string[];
  /** haritada bulunmayan dosyalar için okuma geri çağrısı (CLI diskten okur) */
  readFile?: (path: string) => string | undefined;
  /** register değişkenleri ve gözetleme deliği iyileştirmeleri (varsayılan: açık) */
  optimize?: boolean;
  /** bellek yerleşimi (varsayılan: ROM 0x0000–0x3FFF, RAM 0x4000–, yığın tepesi 0xFF00) */
  layout?: Partial<Layout>;
  /**
   * Hedef: "rom" (varsayılan) program 0x0000'dan, kendi vektörleriyle çalışır (Flash'a yazılır);
   * "bios" program RAM'e 0x4000'dan yüklenir, BIOS monitöründen G 4000 ile çalışır ve döner
   * (lib/hedef/bios/: crt0 ve BIOS çağrıları; putchar VGA + UART'a yazar).
   */
  target?: "rom" | "bios";
}

/** BIOS hedefinin bellek yerleşimi: kod 0x4000–0x9FFF (RAM, pencere 1–2), veri 0xA000–, yığın tepesi
 * 0xF800 (BIOS değişkenleri ve yığını 0xF800–0xFEFF'tedir, bkz. docs/bios.md) */
export const BIOS_LAYOUT: Layout = { romStart: 0x4000, romEnd: 0xa000, ramStart: 0xa000, stackTop: 0xf800, minStack: 0x400 };

export interface CompileResult {
  /** bağlanmış, as16 ile derlenebilir assembly (hata varsa boş olabilir) */
  asm: string;
  errors: CcError[];
  link?: LinkResult;
}

export interface BuildResult extends CompileResult {
  /** 64 KB bellek imajı */
  image: Uint8Array;
  /** yazılan bayt aralıkları [başlangıç, bitiş) */
  ranges: [number, number][];
  /** sembol → adres (C isimleri "_" önekli: main → _main) */
  symbols: Map<string, number>;
  romSize: number;
  ramSize: number;
  map: MapEntry[];
  /** as16 listesi (hata ayıklama için) */
  listing: AsmResult["listing"];
}

interface LibObjects {
  objs: ObjFile[];
  errors: CcError[];
}

const libCache = new WeakMap<LibSources, Map<string, LibObjects>>();

/** Kütüphane başlıkları: "include/stdio.h" → "stdio.h" */
function libHeaders(lib: LibSources | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(lib ?? {})) {
    const m = /^(?:\.\/)?include\/(.+)$/.exec(k);
    if (m) out[m[1]] = v;
  }
  return out;
}

function toCcError(e: unknown, file: string): CcError {
  if (e instanceof CompileError) return { file: e.file, line: e.line, col: e.col, message: e.message };
  // iç hatalar da kullanıcıya dosya bilgisiyle gösterilir
  return { file, line: 0, col: 0, message: `iç hata: ${(e as Error).message ?? String(e)}` };
}

/** Bir C çeviri birimini nesne dosyasına çevirir. */
function compileC(path: string, tag: string, lib: boolean, files: Record<string, string>, opts: CompileOptions, headers: Record<string, string>): { obj?: ObjFile; error?: CcError } {
  try {
    const toks = preprocess(path, {
      files,
      readFile: opts.readFile,
      libHeaders: headers,
      includeDirs: opts.includeDirs,
      defines: lib ? undefined : opts.defines,
    });
    const tu = parseTU(toks, tag);
    const obj = codegen(tu, path, { optimize: opts.optimize ?? true });
    obj.lib = lib;
    return { obj };
  } catch (e) {
    return { error: toCcError(e, path) };
  }
}

function compileAsm(path: string, source: string, tag: string, lib: boolean): { obj: ObjFile; errors: CcError[] } {
  const r = asmToObject(source, path, tag, lib);
  return { obj: r.obj, errors: r.errors.map((e) => ({ file: e.file, line: e.line, col: 0, message: e.message })) };
}

function libObjects(lib: LibSources, opts: CompileOptions): LibObjects {
  const key = String(opts.optimize ?? true);
  let perLib = libCache.get(lib);
  if (!perLib) libCache.set(lib, (perLib = new Map()));
  const hit = perLib.get(key);
  if (hit) return hit;
  const headers = libHeaders(lib);
  const objs: ObjFile[] = [];
  const errors: CcError[] = [];
  const names = Object.keys(lib)
    .filter((k) => !k.includes("/") && /\.(c|s)$/.test(k))
    .sort();
  names.forEach((name, j) => {
    const path = `lib/${name}`;
    const tag = `c${j}`;
    if (name.endsWith(".s")) {
      const r = compileAsm(path, lib[name], tag, true);
      objs.push(r.obj);
      errors.push(...r.errors);
    } else {
      const r = compileC(path, tag, true, { [path]: lib[name] }, {}, headers);
      if (r.obj) objs.push(r.obj);
      if (r.error) errors.push(r.error);
    }
  });
  const res = { objs, errors };
  perLib.set(key, res);
  return res;
}

/** Kaynakları derleyip bağlar; sonuç tek bir as16 metnidir. */
export function compile(files: Record<string, string>, entry: string[], opts: CompileOptions = {}): CompileResult {
  const errors: CcError[] = [];
  const headers = libHeaders(opts.lib);
  const objs: ObjFile[] = [];
  if (!entry.length) errors.push({ file: "", line: 0, col: 0, message: "Derlenecek dosya verilmedi" });
  entry.forEach((path, i) => {
    const tag = `u${i}`;
    const src = files[path] ?? opts.readFile?.(path);
    if (src === undefined) {
      errors.push({ file: path, line: 0, col: 0, message: `Dosya bulunamadı: ${path}` });
      return;
    }
    if (/\.(s|asm)$/i.test(path)) {
      const r = compileAsm(path, src, tag, false);
      objs.push(r.obj);
      errors.push(...r.errors);
    } else {
      const r = compileC(path, tag, false, { ...files, [path]: src }, opts, headers);
      if (r.obj) objs.push(r.obj);
      if (r.error) errors.push(r.error);
    }
  });
  if (opts.target === "bios" && !opts.nostdlib && opts.lib) {
    // hedef dosyaları kullanıcı nesnesi gibi bağlanır: tanımları kütüphanedekilerin (crt0, putchar …) yerine geçer
    Object.keys(opts.lib).filter((k) => /^hedef\/bios\/[^/]+\.s$/.test(k)).sort().forEach((k, j) => {
      const r = compileAsm(`lib/${k}`, opts.lib![k], `h${j}`, false);
      objs.push(r.obj);
      errors.push(...r.errors);
    });
  }
  if (!opts.nostdlib) {
    if (!opts.lib) {
      errors.push({ file: "", line: 0, col: 0, message: "Çalışma zamanı kütüphanesi verilmedi (opts.lib ya da nostdlib)" });
    } else {
      const l = libObjects(opts.lib, opts);
      errors.push(...l.errors);
      objs.push(...l.objs);
    }
  }
  if (errors.length) return { asm: "", errors };
  const layout: Layout = { ...(opts.target === "bios" ? BIOS_LAYOUT : DEFAULT_LAYOUT), ...opts.layout };
  const res = link(objs, "__reset", layout);
  return { asm: res.asm, errors: res.errors.map((e) => ({ ...e })), link: res };
}

/** Derler, bağlar ve as16 ile bellek imajına çevirir. */
export function buildProgram(files: Record<string, string>, entry: string[], opts: CompileOptions = {}): BuildResult {
  const c = compile(files, entry, opts);
  const empty: BuildResult = {
    ...c, image: new Uint8Array(0x10000), ranges: [], symbols: new Map(), romSize: 0, ramSize: 0, map: [], listing: [],
  };
  if (c.errors.length || !c.link) return empty;
  const asm = assemble(c.asm);
  const errors: CcError[] = asm.errors.map((e) => ({
    file: "<as16>", line: e.line, col: 0, message: `iç hata (as16): ${e.message}`,
  }));
  // bağlayıcının hesapladığı adresler as16'nınkilerle aynı olmalı (LI boyutu, dallanma uzatma)
  if (!errors.length) {
    for (const [name, addr] of c.link.symbols) {
      const a = asm.symbols.get(name);
      if (a !== undefined && a !== addr) {
        errors.push({ file: "<bağlayıcı>", line: 0, col: 0, message: `iç hata: '${name}' adresi uyuşmuyor (bağlayıcı 0x${addr.toString(16)}, as16 0x${a.toString(16)})` });
        break;
      }
    }
  }
  if (errors.length) return { ...empty, errors };
  return {
    ...c,
    image: asm.image,
    ranges: asm.ranges,
    symbols: asm.symbols,
    romSize: c.link.romSize,
    ramSize: c.link.ramSize,
    map: c.link.map,
    listing: asm.listing,
  };
}

/** Hata listesini "dosya:satır:sütun: mesaj" satırlarına çevirir. */
export function formatErrors(errors: CcError[]): string {
  return errors.map((e) => (e.line ? `${e.file}:${e.line}:${e.col}: ${e.message}` : e.file ? `${e.file}: ${e.message}` : e.message)).join("\n");
}
