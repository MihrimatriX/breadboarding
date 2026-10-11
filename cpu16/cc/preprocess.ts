// cc16 önişlemcisi: #include, #define (nesne ve fonksiyon benzeri, # ve ##, __VA_ARGS__),
// #undef, #if/#ifdef/#ifndef/#elif/#else/#endif, #error, #pragma once.
// Dosya sistemi kullanmaz: dosyalar bellekteki bir haritadan (ve isteğe bağlı readFile geri çağrısından)
// okunur, böylece aynı kod tarayıcıda da çalışır. Makro genişletme chibicc'deki gizli küme algoritmasıdır.

import { CompileError, tokenize, type Token } from "./lexer.ts";

/** Kütüphane başlıklarının sanal dizini (ör. <stdio.h> → /cc16/include/stdio.h). */
export const LIB_INCLUDE = "/cc16/include";

export interface PPOptions {
  /** kullanıcı dosyaları: yol → içerik */
  files: Record<string, string>;
  /** haritada olmayan dosyalar için (CLI'da diskten okur) */
  readFile?: (path: string) => string | undefined;
  /** sistem başlıkları: "stdio.h" → içerik */
  libHeaders?: Record<string, string>;
  /** ek arama dizinleri (-I) */
  includeDirs?: string[];
  /** önceden tanımlı makrolar: AD → değer */
  defines?: Record<string, string>;
}

interface Macro {
  params?: string[];
  variadic: boolean;
  body: Token[];
  builtin?: (tok: Token) => Token;
}

export function dirname(path: string): string {
  const i = path.lastIndexOf("/");
  if (i < 0) return "";
  return i === 0 ? "/" : path.slice(0, i);
}

export function normalizePath(path: string): string {
  const abs = path.startsWith("/");
  const out: string[] = [];
  for (const part of path.split("/")) {
    if (part === "" || part === ".") continue;
    if (part === ".." && out.length && out[out.length - 1] !== "..") out.pop();
    else if (part === ".." && abs) continue;
    else out.push(part);
  }
  return (abs ? "/" : "") + out.join("/");
}

export function joinPath(dir: string, name: string): string {
  if (name.startsWith("/") || dir === "") return normalizePath(name);
  return normalizePath(`${dir}/${name}`);
}

const union = (a: Set<string> | undefined, b: Set<string>): Set<string> => {
  if (!a || a.size === 0) return b;
  const s = new Set(a);
  for (const x of b) s.add(x);
  return s;
};

const intersect = (a: Set<string> | undefined, b: Set<string> | undefined): Set<string> => {
  const s = new Set<string>();
  if (!a || !b) return s;
  for (const x of a) if (b.has(x)) s.add(x);
  return s;
};

const isP = (t: Token | undefined, text: string) => !!t && t.kind === "punct" && t.text === text;

export class Preprocessor {
  private macros = new Map<string, Macro>();
  /** okunacak token'lar, ters sırada (sonraki token = son eleman) */
  private stack: Token[] = [];
  private conds: { ctx: "then" | "elif" | "else"; included: boolean; tok: Token }[] = [];
  private includes: { file: string; condDepth: number }[] = [];
  private once = new Set<string>();
  private cache = new Map<string, string | undefined>();
  private opts: PPOptions;

  constructor(opts: PPOptions) {
    this.opts = opts;
    const def = (name: string, value: string) => this.defineText(name, value);
    def("__CPU16__", "1");
    def("__CC16__", "1");
    def("__STDC__", "1");
    def("__STDC_HOSTED__", "1");
    def("__CHAR_UNSIGNED__", "1");
    def("__SIZEOF_SHORT__", "2");
    def("__SIZEOF_INT__", "2");
    def("__SIZEOF_LONG__", "4");
    def("__SIZEOF_POINTER__", "2");
    this.macros.set("__FILE__", {
      variadic: false, body: [],
      builtin: (t) => tokenize(JSON.stringify(t.file), t.file).map((x) => ({ ...x, line: t.line, col: t.col }))[0],
    });
    this.macros.set("__LINE__", {
      variadic: false, body: [],
      builtin: (t) => ({ ...t, kind: "num", text: String(t.line), hide: undefined }),
    });
    for (const [k, v] of Object.entries(opts.defines ?? {})) def(k, v);
  }

  private defineText(name: string, value: string): void {
    const toks = tokenize(value, "<komut satırı>");
    toks.pop();
    this.macros.set(name, { variadic: false, body: toks });
  }

  // ---------------------------------------------------------------- dosya erişimi

  private read(path: string): string | undefined {
    if (this.cache.has(path)) return this.cache.get(path);
    let text: string | undefined;
    if (path.startsWith(LIB_INCLUDE + "/")) {
      text = this.opts.libHeaders?.[path.slice(LIB_INCLUDE.length + 1)];
    } else {
      text = this.opts.files[path] ?? this.opts.readFile?.(path);
    }
    this.cache.set(path, text);
    return text;
  }

  private resolveInclude(name: string, from: string, quoted: boolean): string | undefined {
    const cands: string[] = [];
    if (quoted) cands.push(joinPath(dirname(from), name));
    for (const d of this.opts.includeDirs ?? []) cands.push(joinPath(d, name));
    cands.push(joinPath(LIB_INCLUDE, name));
    return cands.find((p) => this.read(p) !== undefined);
  }

  // ---------------------------------------------------------------- token akışı

  private next(): Token {
    const t = this.stack.pop();
    if (!t) throw new Error("iç hata: token akışı bitti");
    return t;
  }

  private peek(): Token {
    return this.stack[this.stack.length - 1];
  }

  private pushFront(toks: Token[]): void {
    for (let i = toks.length - 1; i >= 0; i--) this.stack.push(toks[i]);
  }

  /** Yönerge satırının kalanını okur. */
  private readLine(): Token[] {
    const out: Token[] = [];
    while (this.stack.length && !this.peek().bol && this.peek().kind !== "eof") out.push(this.next());
    return out;
  }

  // ---------------------------------------------------------------- ana döngü

  run(file: string): Token[] {
    const text = this.read(file);
    if (text === undefined) throw new CompileError({ file, line: 1, col: 1 }, `Dosya bulunamadı: ${file}`);
    this.pushFront(tokenize(text, file));
    this.includes.push({ file, condDepth: 0 });
    const out: Token[] = [];
    for (;;) {
      const tok = this.next();
      if (tok.kind === "eof") {
        const ctx = this.includes.pop()!;
        if (this.conds.length > ctx.condDepth) {
          throw new CompileError(this.conds[this.conds.length - 1].tok, "Kapanmamış #if (#endif eksik)");
        }
        if (this.includes.length === 0) {
          out.push(tok);
          return out;
        }
        continue;
      }
      if (isP(tok, "#") && tok.bol) {
        this.directive(tok);
        continue;
      }
      if (this.expandMacro(tok)) continue;
      out.push(tok);
    }
  }

  /** Bir token listesini (yönerge işlemeden) tamamen genişletir. */
  private expandAll(toks: Token[]): Token[] {
    const saved = this.stack;
    const sentinel: Token = { kind: "eof", text: "", file: "", line: 0, col: 0, bol: true, space: false };
    this.stack = [sentinel];
    this.pushFront(toks.map((t) => ({ ...t, bol: false })));
    const out: Token[] = [];
    try {
      for (;;) {
        const t = this.next();
        if (t === sentinel) break;
        if (t.kind === "eof") throw new CompileError(t, "Makro çağrısı kapanmadan dosya bitti");
        if (this.expandMacro(t)) continue;
        out.push(t);
      }
    } finally {
      this.stack = saved;
    }
    return out;
  }

  // ---------------------------------------------------------------- yönergeler

  private directive(hash: Token): void {
    if (!this.stack.length || this.peek().bol || this.peek().kind === "eof") return; // boş yönerge
    const t = this.next();
    const name = t.text;
    switch (name) {
      case "include":
        return this.include(t);
      case "define":
        return this.define(t);
      case "undef": {
        const line = this.readLine();
        if (!line.length || line[0].kind !== "ident") throw new CompileError(t, "#undef bir makro adı bekler");
        this.macros.delete(line[0].text);
        return;
      }
      case "if": {
        const v = this.evalIf(this.readLine(), t);
        this.conds.push({ ctx: "then", included: v, tok: hash });
        if (!v) this.skipCond();
        return;
      }
      case "ifdef":
      case "ifndef": {
        const line = this.readLine();
        if (!line.length || line[0].kind !== "ident") throw new CompileError(t, `#${name} bir makro adı bekler`);
        let v = this.macros.has(line[0].text);
        if (name === "ifndef") v = !v;
        this.conds.push({ ctx: "then", included: v, tok: hash });
        if (!v) this.skipCond();
        return;
      }
      case "elif": {
        const top = this.conds[this.conds.length - 1];
        if (!top || top.ctx === "else") throw new CompileError(t, "Beklenmeyen #elif");
        top.ctx = "elif";
        const line = this.readLine();
        if (top.included) this.skipCond();
        else if (this.evalIf(line, t)) top.included = true;
        else this.skipCond();
        return;
      }
      case "else": {
        const top = this.conds[this.conds.length - 1];
        if (!top || top.ctx === "else") throw new CompileError(t, "Beklenmeyen #else");
        top.ctx = "else";
        this.readLine();
        if (top.included) this.skipCond();
        else top.included = true;
        return;
      }
      case "endif":
        if (this.conds.length <= this.includes[this.includes.length - 1].condDepth) {
          throw new CompileError(t, "Beklenmeyen #endif");
        }
        this.conds.pop();
        this.readLine();
        return;
      case "error": {
        const line = this.readLine();
        throw new CompileError(t, `#error ${line.map((x) => (x.space ? " " : "") + x.text).join("").trim()}`);
      }
      case "warning":
      case "line":
      case "ident":
        this.readLine();
        return;
      case "pragma": {
        const line = this.readLine();
        if (line[0]?.text === "once") this.once.add(t.file);
        return;
      }
      default:
        if (t.kind === "num") {
          this.readLine(); // # 12 "dosya" biçimindeki satır bilgisi
          return;
        }
        throw new CompileError(t, `Bilinmeyen önişlemci yönergesi: #${name}`);
    }
  }

  /** Yanlış koşullu bloğu, eşleşen #elif/#else/#endif'e kadar atlar. */
  private skipCond(): void {
    let depth = 0;
    for (;;) {
      const t = this.next();
      if (t.kind === "eof") {
        this.stack.push(t);
        return; // kapanmamış #if, eof işlenirken raporlanır
      }
      if (!(isP(t, "#") && t.bol)) continue;
      const d = this.peek();
      if (d.bol || d.kind !== "ident") continue;
      if (d.text === "if" || d.text === "ifdef" || d.text === "ifndef") {
        depth++;
      } else if (d.text === "endif") {
        if (depth === 0) {
          this.stack.push(t);
          return;
        }
        depth--;
      } else if ((d.text === "elif" || d.text === "else") && depth === 0) {
        this.stack.push(t);
        return;
      }
    }
  }

  private include(t: Token): void {
    let line = this.readLine();
    if (line.length && line[0].kind !== "str" && !isP(line[0], "<")) line = this.expandAll(line);
    let name: string;
    let quoted: boolean;
    if (line.length && line[0].kind === "str") {
      name = line[0].text.slice(1, -1);
      quoted = true;
    } else if (line.length && isP(line[0], "<")) {
      const end = line.findIndex((x) => isP(x, ">"));
      if (end < 0) throw new CompileError(t, "#include <...> kapanmamış");
      name = line.slice(1, end).map((x, i) => (i > 0 && x.space ? " " : "") + x.text).join("");
      quoted = false;
    } else {
      throw new CompileError(t, '#include "dosya" ya da <dosya> bekler');
    }
    const path = this.resolveInclude(name, t.file, quoted);
    if (!path) throw new CompileError(t, `Başlık dosyası bulunamadı: ${name}`);
    if (this.once.has(path)) return;
    if (this.includes.length > 100) throw new CompileError(t, "#include çok derin (döngüsel include?)");
    this.pushFront(tokenize(this.read(path)!, path));
    this.includes.push({ file: path, condDepth: this.conds.length });
  }

  private define(t: Token): void {
    const nameTok = this.next();
    if (nameTok.kind !== "ident" || nameTok.bol) throw new CompileError(t, "#define bir makro adı bekler");
    const name = nameTok.text;
    if (name === "defined") throw new CompileError(nameTok, "'defined' makro adı olamaz");
    const p = this.peek();
    if (isP(p, "(") && !p.space && !p.bol) {
      this.next();
      const params: string[] = [];
      let variadic = false;
      for (;;) {
        const x = this.next();
        if (x.bol || x.kind === "eof") throw new CompileError(x, "Makro parametre listesi kapanmamış");
        if (isP(x, ")") && params.length === 0 && !variadic) break;
        if (isP(x, "...")) {
          variadic = true;
          params.push("__VA_ARGS__");
          if (!isP(this.next(), ")")) throw new CompileError(x, "'...' sonrası ')' bekleniyordu");
          break;
        }
        if (x.kind !== "ident") throw new CompileError(x, "Makro parametresi bir isim olmalı");
        params.push(x.text);
        const sep = this.next();
        if (isP(sep, ")")) break;
        if (!isP(sep, ",")) throw new CompileError(sep, "Makro parametreleri arasında ',' bekleniyordu");
      }
      this.macros.set(name, { params, variadic, body: this.readLine() });
    } else {
      this.macros.set(name, { variadic: false, body: this.readLine() });
    }
  }

  // ---------------------------------------------------------------- makro genişletme

  private expandMacro(tok: Token): boolean {
    if (tok.kind !== "ident") return false;
    if (tok.hide?.has(tok.text)) return false;
    const m = this.macros.get(tok.text);
    if (!m) return false;
    if (m.builtin) {
      this.stack.push({ ...m.builtin(tok), bol: tok.bol, space: tok.space });
      return true;
    }
    const at = (list: Token[], hs: Set<string>): Token[] =>
      list.map((x, i) => ({
        ...x, file: tok.file, line: tok.line, col: tok.col,
        hide: union(x.hide, hs),
        bol: i === 0 ? tok.bol : false,
        space: i === 0 ? tok.space : x.space,
      }));
    if (!m.params) {
      this.pushFront(at(m.body, union(tok.hide, new Set([tok.text]))));
      return true;
    }
    // fonksiyon benzeri: ardından '(' gelmiyorsa sıradan isim
    const p = this.peek();
    if (!p || !isP(p, "(")) return false;
    this.next();
    const { args, rparen } = this.readArgs(tok, m);
    const hs = intersect(tok.hide, rparen.hide);
    hs.add(tok.text);
    this.pushFront(at(this.subst(m, args), hs));
    return true;
  }

  private readArgs(tok: Token, m: Macro): { args: Token[][]; rparen: Token } {
    const n = m.params!.length;
    const args: Token[][] = [[]];
    let depth = 0;
    for (;;) {
      const t = this.next();
      if (t.kind === "eof") throw new CompileError(tok, `'${tok.text}' makro çağrısı kapanmamış`);
      if (isP(t, "(")) depth++;
      else if (isP(t, ")")) {
        if (depth === 0) {
          if (n === 0 && args.length === 1 && args[0].length === 0) return { args: [], rparen: t };
          if (m.variadic && args.length === n - 1) args.push([]);
          if (args.length !== n) {
            throw new CompileError(tok, `'${tok.text}' makrosu ${n} argüman bekler, ${args.length} verildi`);
          }
          return { args, rparen: t };
        }
        depth--;
      } else if (isP(t, ",") && depth === 0 && !(m.variadic && args.length === n)) {
        args.push([]);
        continue;
      }
      args[args.length - 1].push({ ...t, bol: false });
    }
  }

  private subst(m: Macro, args: Token[][]): Token[] {
    const params = m.params!;
    const body = m.body;
    const argOf = (t: Token | undefined): Token[] | undefined => {
      if (!t || t.kind !== "ident") return undefined;
      const i = params.indexOf(t.text);
      return i >= 0 ? args[i] : undefined;
    };
    const out: Token[] = [];
    for (let i = 0; i < body.length; i++) {
      const t = body[i];
      if (isP(t, "#")) {
        const a = argOf(body[i + 1]);
        if (!a) throw new CompileError(t, "'#' sonrası bir makro parametresi gelmeli");
        out.push(stringize(t, a));
        i++;
        continue;
      }
      // GNU: , ## __VA_ARGS__  — boşsa virgül de silinir
      if (isP(t, ",") && isP(body[i + 1], "##") && body[i + 2]?.text === "__VA_ARGS__" && m.variadic) {
        const a = args[params.length - 1];
        if (a.length === 0) i += 2;
        else {
          out.push(t);
          i += 1;
        }
        continue;
      }
      if (isP(t, "##")) {
        if (!out.length) throw new CompileError(t, "'##' makronun başında olamaz");
        const rhs = body[i + 1];
        if (!rhs) throw new CompileError(t, "'##' makronun sonunda olamaz");
        const a = argOf(rhs);
        if (a) {
          if (a.length) {
            out.push(paste(out.pop()!, a[0]));
            out.push(...a.slice(1));
          }
        } else {
          out.push(paste(out.pop()!, rhs));
        }
        i++;
        continue;
      }
      const a = argOf(t);
      if (a && isP(body[i + 1], "##")) {
        if (a.length === 0) {
          const rhs = body[i + 2];
          const a2 = argOf(rhs);
          if (a2) out.push(...a2);
          else if (rhs) out.push(rhs);
          i += 2;
        } else {
          out.push(...a);
        }
        continue;
      }
      if (a) {
        const e = this.expandAll(a);
        e.forEach((x, k) => out.push(k === 0 ? { ...x, space: t.space } : x));
        continue;
      }
      out.push(t);
    }
    return out;
  }

  // ---------------------------------------------------------------- #if ifadesi

  private evalIf(line: Token[], at: Token): boolean {
    const toks: Token[] = [];
    for (let i = 0; i < line.length; i++) {
      const t = line[i];
      if (t.kind === "ident" && t.text === "defined") {
        let nameTok = line[i + 1];
        let skip = 1;
        if (isP(nameTok, "(")) {
          nameTok = line[i + 2];
          if (!isP(line[i + 3], ")")) throw new CompileError(t, "defined( İSİM ) bekleniyordu");
          skip = 3;
        }
        if (!nameTok || nameTok.kind !== "ident") throw new CompileError(t, "defined bir makro adı bekler");
        toks.push({ ...t, kind: "num", text: this.macros.has(nameTok.text) ? "1" : "0" });
        i += skip;
        continue;
      }
      toks.push(t);
    }
    const ex = this.expandAll(toks);
    if (!ex.length) throw new CompileError(at, "#if bir ifade bekler");
    return new IfEval(ex, at).run() !== 0;
  }
}

function stringize(hash: Token, arg: Token[]): Token {
  let s = "";
  arg.forEach((t, i) => {
    if (i > 0 && t.space) s += " ";
    s += t.text;
  });
  const lit = '"' + s.replace(/\\/g, "\\\\").replace(/"/g, '\\"') + '"';
  const t = tokenize(lit, hash.file)[0];
  return { ...t, line: hash.line, col: hash.col, space: hash.space, bol: false };
}

function paste(lhs: Token, rhs: Token): Token {
  const text = lhs.text + rhs.text;
  let toks: Token[];
  try {
    toks = tokenize(text, lhs.file);
  } catch {
    toks = [];
  }
  if (toks.length !== 2) throw new CompileError(lhs, `'##' geçersiz bir token üretti: '${text}'`);
  return { ...toks[0], file: lhs.file, line: lhs.line, col: lhs.col, space: lhs.space, bol: false, hide: lhs.hide };
}

/** #if sabit ifadesini değerlendirir (tanımsız isimler 0). */
class IfEval {
  private toks: Token[];
  private i = 0;
  private at: Token;

  constructor(toks: Token[], at: Token) {
    this.toks = toks;
    this.at = at;
  }

  run(): number {
    const v = this.ternary();
    if (this.i < this.toks.length) throw new CompileError(this.toks[this.i], "#if ifadesinde fazlalık");
    return v;
  }

  private peekIs(text: string): boolean {
    const t = this.toks[this.i];
    return !!t && t.kind === "punct" && t.text === text;
  }

  private eat(text: string): boolean {
    if (this.peekIs(text)) {
      this.i++;
      return true;
    }
    return false;
  }

  private ternary(): number {
    const c = this.bin(0);
    if (this.eat("?")) {
      const a = this.ternary();
      if (!this.eat(":")) throw new CompileError(this.at, "#if: ':' bekleniyordu");
      const b = this.ternary();
      return c ? a : b;
    }
    return c;
  }

  private static LEVELS = [["||"], ["&&"], ["|"], ["^"], ["&"], ["==", "!="], ["<", ">", "<=", ">="], ["<<", ">>"], ["+", "-"], ["*", "/", "%"]];

  private bin(level: number): number {
    if (level >= IfEval.LEVELS.length) return this.unary();
    let a = this.bin(level + 1);
    for (;;) {
      const op = IfEval.LEVELS[level].find((o) => this.peekIs(o));
      if (!op) return a;
      this.i++;
      if (op === "||") {
        const b = this.bin(level + 1);
        a = a || b ? 1 : 0;
        continue;
      }
      if (op === "&&") {
        const b = this.bin(level + 1);
        a = a && b ? 1 : 0;
        continue;
      }
      const b = this.bin(level + 1);
      switch (op) {
        case "|": a = a | b; break;
        case "^": a = a ^ b; break;
        case "&": a = a & b; break;
        case "==": a = a === b ? 1 : 0; break;
        case "!=": a = a !== b ? 1 : 0; break;
        case "<": a = a < b ? 1 : 0; break;
        case ">": a = a > b ? 1 : 0; break;
        case "<=": a = a <= b ? 1 : 0; break;
        case ">=": a = a >= b ? 1 : 0; break;
        case "<<": a = a * 2 ** b; break;
        case ">>": a = Math.floor(a / 2 ** b); break;
        case "+": a = a + b; break;
        case "-": a = a - b; break;
        case "*": a = a * b; break;
        case "/":
        case "%":
          if (b === 0) throw new CompileError(this.at, "#if: sıfıra bölme");
          a = op === "/" ? Math.trunc(a / b) : a % b;
          break;
      }
    }
  }

  private unary(): number {
    if (this.eat("+")) return this.unary();
    if (this.eat("-")) return -this.unary();
    if (this.eat("!")) return this.unary() ? 0 : 1;
    if (this.eat("~")) return ~this.unary();
    if (this.eat("(")) {
      const v = this.ternary();
      if (!this.eat(")")) throw new CompileError(this.at, "#if: ')' bekleniyordu");
      return v;
    }
    const t = this.toks[this.i++];
    if (!t) throw new CompileError(this.at, "#if ifadesi eksik");
    if (t.kind === "ident") return 0;
    if (t.kind === "char") return t.val!;
    if (t.kind === "num") {
      const m = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+)[uUlL]*$/.exec(t.text);
      if (!m) throw new CompileError(t, `#if: geçersiz sayı ${t.text}`);
      const b = m[1];
      if (/^0[xX]/.test(b)) return parseInt(b.slice(2), 16);
      if (/^0[bB]/.test(b)) return parseInt(b.slice(2), 2);
      if (b.length > 1 && b[0] === "0") return parseInt(b, 8);
      return parseInt(b, 10);
    }
    throw new CompileError(t, `#if ifadesinde beklenmeyen '${t.text}'`);
  }
}

export function preprocess(file: string, opts: PPOptions): Token[] {
  return new Preprocessor(opts).run(file);
}
