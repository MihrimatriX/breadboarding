// cc16 sözcük çözümleyici: kaynak metni önişlemci token'larına böler.
// Sayılar önce "pp-number" olarak tutulur; önişlemciden sonra convertTokens() C sabitlerine çevirir.

import { T, type Type } from "./types.ts";

export type TokKind = "ident" | "punct" | "num" | "str" | "char" | "eof";

export interface Token {
  kind: TokKind;
  text: string;
  file: string;
  line: number;
  col: number;
  /** satırın ilk token'ı */
  bol: boolean;
  /** öncesinde boşluk var */
  space: boolean;
  /** makro genişletmede gizli küme (Prosser algoritması) */
  hide?: Set<string>;
  /** num/char: değer */
  val?: number;
  /** num/char/str: tip */
  ty?: Type;
  /** str: baytlar (sondaki 0 hariç) */
  bytes?: number[];
}

export interface SourcePos {
  file: string;
  line: number;
  col: number;
}

export class CompileError extends Error {
  file: string;
  line: number;
  col: number;
  constructor(pos: SourcePos, message: string) {
    super(message);
    this.file = pos.file;
    this.line = pos.line;
    this.col = pos.col;
  }
}

const PUNCTS = [
  "<<=", ">>=", "...", "->", "++", "--", "<<", ">>", "<=", ">=", "==", "!=", "&&", "||",
  "+=", "-=", "*=", "/=", "%=", "&=", "|=", "^=", "##",
];
const SINGLE = "+-*/%&|^~!<>=?:;,.()[]{}#";

/** "\\\n" satır birleştirmelerini kaldırır; satır numaraları kaymasın diye silinen satır sonlarını sonra ekler. */
function joinLines(src: string): string {
  let out = "";
  let pending = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (c === "\\" && src[i + 1] === "\n") {
      i++;
      pending++;
    } else if (c === "\\" && src[i + 1] === "\r" && src[i + 2] === "\n") {
      i += 2;
      pending++;
    } else if (c === "\n") {
      out += "\n".repeat(pending + 1);
      pending = 0;
    } else if (c !== "\r") {
      out += c;
    }
  }
  return out + "\n".repeat(pending);
}

/** Kaçış dizisini çözer; [değer, tüketilen karakter sayısı] döner. s[i] ters bölüden sonraki karakterdir. */
function readEscape(s: string, i: number, pos: SourcePos): [number, number] {
  const c = s[i];
  if (c >= "0" && c <= "7") {
    let v = 0;
    let n = 0;
    while (n < 3 && s[i + n] >= "0" && s[i + n] <= "7") {
      v = v * 8 + (s.charCodeAt(i + n) - 48);
      n++;
    }
    return [v & 0xff, n];
  }
  if (c === "x") {
    let n = 1;
    let v = 0;
    while (/[0-9a-fA-F]/.test(s[i + n] ?? "")) {
      v = v * 16 + parseInt(s[i + n], 16);
      n++;
    }
    if (n === 1) throw new CompileError(pos, "\\x kaçışında onaltılık rakam yok");
    return [v & 0xff, n];
  }
  const map: Record<string, number> = {
    n: 10, t: 9, r: 13, a: 7, b: 8, f: 12, v: 11, e: 27, "\\": 92, "'": 39, '"': 34, "?": 63,
  };
  if (c in map) return [map[c], 1];
  throw new CompileError(pos, `Bilinmeyen kaçış dizisi: \\${c}`);
}

/** Bir string'in karakterlerini UTF-8 baytlarına çevirir. */
function utf8(ch: string): number[] {
  const code = ch.codePointAt(0)!;
  if (code < 0x80) return [code];
  return Array.from(new TextEncoder().encode(ch));
}

export function tokenize(source: string, file: string): Token[] {
  const s = joinLines(source);
  const toks: Token[] = [];
  let i = 0;
  let line = 1;
  let lineStart = 0;
  let bol = true;
  let space = false;

  const pos = (): SourcePos => ({ file, line, col: i - lineStart + 1 });
  const push = (kind: TokKind, start: number, extra?: Partial<Token>) => {
    toks.push({
      kind, text: s.slice(start, i), file, line, col: start - lineStart + 1, bol, space, ...extra,
    });
    bol = false;
    space = false;
  };

  while (i < s.length) {
    const c = s[i];
    if (c === "\n") {
      i++;
      line++;
      lineStart = i;
      bol = true;
      space = false;
      continue;
    }
    if (c === " " || c === "\t" || c === "\f" || c === "\v") {
      i++;
      space = true;
      continue;
    }
    if (c === "/" && s[i + 1] === "/") {
      while (i < s.length && s[i] !== "\n") i++;
      space = true;
      continue;
    }
    if (c === "/" && s[i + 1] === "*") {
      const p = pos();
      i += 2;
      for (;;) {
        if (i >= s.length) throw new CompileError(p, "Kapanmamış yorum (/* ... */)");
        if (s[i] === "*" && s[i + 1] === "/") {
          i += 2;
          break;
        }
        if (s[i] === "\n") {
          line++;
          lineStart = i + 1;
        }
        i++;
      }
      space = true;
      continue;
    }
    const start = i;
    // pp-number
    if (/[0-9]/.test(c) || (c === "." && /[0-9]/.test(s[i + 1] ?? ""))) {
      i++;
      for (;;) {
        const d = s[i] ?? "";
        if (/[eEpP]/.test(d) && /[+-]/.test(s[i + 1] ?? "")) i += 2;
        else if (/[\w.]/.test(d)) i++;
        else break;
      }
      push("num", start);
      continue;
    }
    if (c === '"' || ((c === "L" || c === "u" || c === "U") && s[i + 1] === '"')) {
      const p = pos();
      if (c !== '"') throw new CompileError(p, "Geniş karakterli string'ler desteklenmiyor");
      i++;
      const bytes: number[] = [];
      for (;;) {
        if (i >= s.length || s[i] === "\n") throw new CompileError(p, "Kapanmamış string");
        if (s[i] === '"') break;
        if (s[i] === "\\") {
          const [v, n] = readEscape(s, i + 1, pos());
          bytes.push(v);
          i += 1 + n;
        } else {
          const ch = String.fromCodePoint(s.codePointAt(i)!);
          bytes.push(...utf8(ch));
          i += ch.length;
        }
      }
      i++;
      push("str", start, { bytes });
      continue;
    }
    if (c === "'") {
      const p = pos();
      i++;
      let v: number;
      if (s[i] === "\\") {
        const [ev, n] = readEscape(s, i + 1, pos());
        v = ev;
        i += 1 + n;
      } else {
        if (s[i] === "'" || s[i] === "\n" || i >= s.length) throw new CompileError(p, "Boş ya da kapanmamış karakter sabiti");
        const ch = String.fromCodePoint(s.codePointAt(i)!);
        const b = utf8(ch);
        if (b.length !== 1) throw new CompileError(p, "Karakter sabiti tek bayt olmalı (ASCII dışı karakter)");
        v = b[0];
        i += ch.length;
      }
      if (s[i] !== "'") throw new CompileError(p, "Karakter sabiti tek karakter içermeli");
      i++;
      push("char", start, { val: v, ty: T.int });
      continue;
    }
    if (/[A-Za-z_]/.test(c)) {
      while (i < s.length && /\w/.test(s[i])) i++;
      push("ident", start);
      continue;
    }
    const p3 = PUNCTS.find((p) => s.startsWith(p, i));
    if (p3) {
      i += p3.length;
      push("punct", start);
      continue;
    }
    if (SINGLE.includes(c)) {
      i++;
      push("punct", start);
      continue;
    }
    throw new CompileError(pos(), `Geçersiz karakter: '${c}'`);
  }
  toks.push({ kind: "eof", text: "", file, line, col: 1, bol: true, space: false });
  return toks;
}

/** pp-number metnini C tamsayı sabitine çevirir (C99 tip kuralları, int = 16 bit, long = 32 bit). */
export function convertNumber(tok: Token): void {
  const text = tok.text;
  const m = /^(0[xX][0-9a-fA-F]+|0[bB][01]+|[0-9]+)([uUlL]*)$/.exec(text);
  if (!m) {
    if (/^[0-9]*\.|^[0-9]+[eE]|^0[xX].*[pP]|[fF]$/.test(text) && !/^0[xX][0-9a-fA-F]+$/.test(text)) {
      throw new CompileError(tok, `Kayan noktalı sayılar (float/double) desteklenmiyor: ${text}`);
    }
    throw new CompileError(tok, `Geçersiz sayı: ${text}`);
  }
  const body = m[1];
  const suffix = m[2].toLowerCase();
  if (!["", "u", "l", "ul", "lu", "ll", "ull", "llu"].includes(suffix)) {
    throw new CompileError(tok, `Geçersiz sayı soneki: ${text}`);
  }
  let v: number;
  let base = 10;
  if (/^0[xX]/.test(body)) {
    v = parseInt(body.slice(2), 16);
    base = 16;
  } else if (/^0[bB]/.test(body)) {
    v = parseInt(body.slice(2), 2);
    base = 2;
  } else if (body.length > 1 && body[0] === "0") {
    if (/[89]/.test(body)) throw new CompileError(tok, `Geçersiz sekizlik sayı: ${text}`);
    v = parseInt(body, 8);
    base = 8;
  } else {
    v = parseInt(body, 10);
  }
  if (v > 0xffffffff) throw new CompileError(tok, `Sayı 32 bite sığmıyor: ${text}`);
  const u = suffix.includes("u");
  const l = suffix.includes("l");
  let ty: Type;
  if (base === 10) {
    if (u) ty = !l && v <= 0xffff ? T.uint : T.ulong;
    else if (!l && v <= 0x7fff) ty = T.int;
    else if (v <= 0x7fffffff) ty = T.long;
    else ty = T.ulong;
  } else {
    if (!l && !u && v <= 0x7fff) ty = T.int;
    else if (!l && v <= 0xffff) ty = T.uint;
    else if (!u && v <= 0x7fffffff) ty = T.long;
    else ty = T.ulong;
  }
  tok.val = v;
  tok.ty = ty;
}
