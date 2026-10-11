// cc16 ayrıştırıcısı: önişlenmiş token'lardan tipli AST üretir (chibicc tarzı recursive descent).
// Tip denetimi, örtük dönüşümler ve sabit katlama (constant folding) burada yapılır; kod üretici
// yalnızca tipleri belli, dönüşümleri açık (cast düğümleri) bir ağaç görür.

import { CompileError, convertNumber, type Token } from "./lexer.ts";
import {
  T, arrayOf, commonType, enumType, funcType, isInteger, isPtrLike, isScalar, isStructLike,
  pointerTo, promote, qualified, sameType, structType, typeName, wordsOf, wrap,
  type Func, type Member, type Node, type NodeKind, type Reloc, type Type, type Var,
} from "./types.ts";

const STORAGE = new Set(["typedef", "static", "extern", "inline", "__inline", "__inline__", "_Noreturn", "auto", "register"]);
const QUALS = new Set(["const", "__const", "volatile", "__volatile__", "restrict", "__restrict", "__restrict__"]);
const TYPE_KW = new Set([
  "void", "_Bool", "char", "short", "int", "long", "float", "double", "signed", "unsigned",
  "struct", "union", "enum", "_Alignas", ...STORAGE, ...QUALS,
]);
const KEYWORDS = new Set([
  ...TYPE_KW, "if", "else", "while", "do", "for", "switch", "case", "default", "break", "continue",
  "return", "goto", "sizeof", "_Alignof", "_Static_assert",
]);

interface VarScope {
  v?: Var;
  typedef?: Type;
  enumVal?: number;
}

interface Scope {
  vars: Map<string, VarScope>;
  tags: Map<string, Type>;
}

interface Attr {
  isTypedef: boolean;
  isStatic: boolean;
  isExtern: boolean;
}

interface Init {
  ty: Type;
  children?: Init[];
  expr?: Node;
  flexible?: boolean;
  /** union: başlatılan üyenin sırası */
  mem?: number;
  /** char dizisi string ile başlatıldı */
  str?: Token;
}

interface FnCtx {
  fn: Func;
  ret: Type;
  variadic: boolean;
  namedWords: number;
  labels: Map<string, string>;
  defined: Set<string>;
  gotos: { name: string; tok: Token }[];
}

export interface TranslationUnit {
  tag: string;
  funcs: Func[];
  /** tanımlanan global değişkenler (string sabitleri dahil) */
  globals: Var[];
}

const newAttr = (): Attr => ({ isTypedef: false, isStatic: false, isExtern: false });

function convertTokens(toks: Token[]): Token[] {
  const out: Token[] = [];
  for (const t of toks) {
    if (t.kind === "bad") throw new CompileError(t, t.err!);
    if (t.kind === "num") {
      const c = { ...t };
      convertNumber(c);
      out.push(c);
    } else if (t.kind === "str" && out.length && out[out.length - 1].kind === "str") {
      const prev = out[out.length - 1];
      out[out.length - 1] = { ...prev, bytes: [...prev.bytes!, ...t.bytes!] };
    } else {
      out.push(t);
    }
  }
  return out;
}

export function parseTU(toks: Token[], tag: string): TranslationUnit {
  return new Parser(convertTokens(toks), tag).program();
}

const alignTo = (n: number, a: number) => Math.ceil(n / a) * a;

class Parser {
  private toks: Token[];
  private pos = 0;
  private tag: string;
  private scopes: Scope[] = [{ vars: new Map(), tags: new Map() }];
  private globals: Var[] = [];
  private globalMap = new Map<string, Var>();
  private funcs: Func[] = [];
  private fn?: FnCtx;
  private labelNo = 0;
  private strings = new Map<string, Var>();
  private brk?: string;
  private cont?: string;
  private sw?: Node;
  private loopDepth = 0;

  constructor(toks: Token[], tag: string) {
    this.toks = toks;
    this.tag = tag;
  }

  // ---------------------------------------------------------------- token yardımcıları

  private tok(): Token {
    return this.toks[this.pos];
  }

  private peekTok(n: number): Token {
    return this.toks[Math.min(this.pos + n, this.toks.length - 1)];
  }

  private is(text: string): boolean {
    const t = this.tok();
    return (t.kind === "punct" || t.kind === "ident") && t.text === text;
  }

  private consume(text: string): boolean {
    if (this.is(text)) {
      this.pos++;
      return true;
    }
    return false;
  }

  private expect(text: string): Token {
    const t = this.tok();
    if (!this.is(text)) throw this.err(t, `'${text}' bekleniyordu, '${t.text || "dosya sonu"}' bulundu`);
    this.pos++;
    return t;
  }

  private ident(): Token {
    const t = this.tok();
    if (t.kind !== "ident" || KEYWORDS.has(t.text)) throw this.err(t, `İsim bekleniyordu, '${t.text || "dosya sonu"}' bulundu`);
    this.pos++;
    return t;
  }

  private err(t: Token, msg: string): CompileError {
    return new CompileError(t, msg);
  }

  private atEof(): boolean {
    return this.tok().kind === "eof";
  }

  private newLabel(): string {
    return `.${this.tag}_${this.labelNo++}`;
  }

  // ---------------------------------------------------------------- kapsamlar

  private enterScope(): void {
    this.scopes.push({ vars: new Map(), tags: new Map() });
  }

  private leaveScope(): void {
    this.scopes.pop();
  }

  private findVar(name: string): VarScope | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i].vars.get(name);
      if (s) return s;
    }
    return undefined;
  }

  private findTag(name: string): Type | undefined {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      const s = this.scopes[i].tags.get(name);
      if (s) return s;
    }
    return undefined;
  }

  private findTypedef(t: Token): Type | undefined {
    if (t.kind !== "ident") return undefined;
    return this.findVar(t.text)?.typedef;
  }

  private isTypename(t: Token = this.tok()): boolean {
    if (t.kind !== "ident") return false;
    return TYPE_KW.has(t.text) || this.findTypedef(t) !== undefined;
  }

  private scope(): Scope {
    return this.scopes[this.scopes.length - 1];
  }

  // ---------------------------------------------------------------- değişkenler

  private mkVar(name: string, ty: Type, tok: Token, isLocal: boolean, sym: string): Var {
    return {
      name, ty, tok, isLocal, offset: 0, addrTaken: false, weight: 0, isParam: false, paramWord: 0,
      sym, isStatic: false, isFunction: false, isDefinition: false,
      isConst: constObj(ty), isVolatile: !!ty.isVolatile,
    };
  }

  private newLocal(name: string, ty: Type, tok: Token, declare = true): Var {
    const v = this.mkVar(name, ty, tok, true, "");
    this.fn!.fn.locals.push(v);
    if (declare) this.scope().vars.set(name, { v });
    return v;
  }

  private newGlobal(name: string, ty: Type, tok: Token, sym: string): Var {
    const v = this.mkVar(name, ty, tok, false, sym);
    this.globals.push(v);
    return v;
  }

  private stringVar(tok: Token): Var {
    const bytes = tok.bytes!;
    const key = bytes.join(",");
    let v = this.strings.get(key);
    if (!v) {
      v = this.newGlobal("", arrayOf(T.char, bytes.length + 1), tok, `.${this.tag}_s${this.strings.size}`);
      v.isStatic = true;
      v.isDefinition = true;
      v.isConst = true;
      v.isString = true;
      v.init = [...bytes, 0];
      v.relocs = [];
      this.strings.set(key, v);
    }
    return v;
  }

  // ---------------------------------------------------------------- program

  program(): TranslationUnit {
    while (!this.atEof()) {
      if (this.consume(";")) continue;
      if (this.is("_Static_assert")) {
        this.staticAssert();
        continue;
      }
      const attr = newAttr();
      const base = this.declspec(attr);
      if (attr.isTypedef) {
        this.typedefDecl(base);
        continue;
      }
      this.globalDecl(base, attr);
    }
    for (const v of this.globals) {
      if (v.isDefinition && v.ty.kind === "array" && v.ty.len! < 0) {
        v.ty = arrayOf(v.ty.base!, 1); // belirsiz boyutlu geçici tanım: 1 elemanlı
      }
      if (v.isDefinition && (v.ty.kind === "struct" || v.ty.kind === "union") && !v.ty.complete) {
        throw this.err(v.tok, `'${v.name}' tamamlanmamış tipte (${typeName(v.ty)})`);
      }
    }
    return { tag: this.tag, funcs: this.funcs, globals: this.globals.filter((v) => v.isDefinition && !v.isFunction) };
  }

  private staticAssert(): void {
    const t = this.expect("_Static_assert");
    this.expect("(");
    const v = this.constExpr();
    let msg = "";
    if (this.consume(",")) {
      const s = this.tok();
      if (s.kind !== "str") throw this.err(s, "_Static_assert mesajı string olmalı");
      msg = String.fromCharCode(...s.bytes!);
      this.pos++;
    }
    this.expect(")");
    this.expect(";");
    if (!v) throw this.err(t, `_Static_assert başarısız${msg ? ": " + msg : ""}`);
  }

  private typedefDecl(base: Type): void {
    let first = true;
    while (!this.consume(";")) {
      if (!first) this.expect(",");
      first = false;
      const { ty, name } = this.declarator(base);
      if (!name) throw this.err(this.tok(), "typedef bir isim bekler");
      this.scope().vars.set(name.text, { typedef: ty });
    }
  }

  private globalDecl(base: Type, attr: Attr): void {
    let first = true;
    while (!this.consume(";")) {
      if (!first) this.expect(",");
      const { ty, name } = this.declarator(base);
      if (!name) throw this.err(this.tok(), "Bildirimde isim eksik");
      if (ty.kind === "func") {
        const f = this.declareFunc(name, ty, attr);
        if (first && this.is("{")) {
          this.functionBody(f, name, ty);
          return;
        }
        first = false;
        continue;
      }
      first = false;
      this.declareGlobalVar(name, ty, attr);
    }
  }

  private declareFunc(name: Token, ty: Type, attr: Attr): Var {
    if (ty.ret!.kind === "array" || ty.ret!.kind === "func") {
      throw this.err(name, "Fonksiyon dizi ya da fonksiyon döndüremez");
    }
    let v = this.globalMap.get(name.text);
    if (v) {
      if (!v.isFunction) throw this.err(name, `'${name.text}' farklı türde yeniden bildirildi`);
      if (attr.isStatic && !v.isStatic) throw this.err(name, `'${name.text}' önce extern bildirildi, static yapılamaz`);
      if (v.ty.proto && ty.proto && (v.ty.params!.length !== ty.params!.length || v.ty.variadic !== ty.variadic)) {
        throw this.err(name, `'${name.text}' için çakışan bildirimler`);
      }
      if (ty.proto || !v.ty.proto) v.ty = ty;
    } else {
      v = this.mkVar(name.text, ty, name, false, attr.isStatic ? `_${name.text}.${this.tag}` : `_${name.text}`);
      v.isFunction = true;
      v.isStatic = attr.isStatic;
      this.globalMap.set(name.text, v);
    }
    this.scope().vars.set(name.text, { v });
    return v;
  }

  private declareGlobalVar(name: Token, ty: Type, attr: Attr): Var {
    if (ty.kind === "void") throw this.err(name, "void tipinde değişken olamaz");
    let v = this.globalMap.get(name.text);
    if (v) {
      if (v.isFunction) throw this.err(name, `'${name.text}' farklı türde yeniden bildirildi`);
      if (v.ty.kind === "array" && ty.kind === "array" && v.ty.len! < 0) v.ty = ty;
      else if (!sameType(v.ty, ty) && !(ty.kind === "array" && ty.len! < 0)) {
        throw this.err(name, `'${name.text}' için çakışan tipler`);
      }
    } else {
      const sym = attr.isStatic ? `_${name.text}.${this.tag}` : `_${name.text}`;
      v = this.newGlobal(name.text, ty, name, sym);
      v.isStatic = attr.isStatic;
      this.globalMap.set(name.text, v);
    }
    this.scope().vars.set(name.text, { v });
    if (this.consume("=")) {
      if (v.init) throw this.err(name, `'${name.text}' yeniden tanımlandı`);
      this.globalInit(v);
    } else if (!attr.isExtern) {
      v.isDefinition = true;
    }
    v.isConst = constObj(v.ty);
    return v;
  }

  private functionBody(fv: Var, name: Token, ty: Type): void {
    if (fv.isDefinition) throw this.err(name, `'${name.text}' fonksiyonu yeniden tanımlandı`);
    fv.isDefinition = true;
    const fn: Func = {
      name: name.text, sym: fv.sym, ty, tok: name, isStatic: fv.isStatic, params: [], locals: [],
      body: undefined as unknown as Node,
    };
    this.fn = {
      fn, ret: ty.ret!, variadic: !!ty.variadic, namedWords: 0,
      labels: new Map(), defined: new Set(), gotos: [],
    };
    this.enterScope();
    let word = 0;
    if (isStructLike(ty.ret!)) {
      const rp = this.newLocal("", pointerTo(ty.ret!), name, false);
      rp.isParam = true;
      rp.paramWord = 0;
      fn.retPtr = rp;
      fn.params.push(rp);
      word = 1;
    }
    ty.params!.forEach((pty, i) => {
      if (pty.kind === "void") throw this.err(name, "void parametre");
      const pn = ty.paramNames?.[i];
      if (isStructLike(pty) && !pty.complete) throw this.err(pn ?? name, "Tamamlanmamış tipte parametre");
      const v = this.newLocal(pn?.text ?? "", pty, pn ?? name, !!pn);
      v.isParam = true;
      v.paramWord = word;
      word += wordsOf(pty);
      fn.params.push(v);
    });
    this.fn.namedWords = word;
    fn.body = this.compound();
    this.leaveScope();
    for (const g of this.fn.gotos) {
      if (!this.fn.defined.has(g.name)) throw this.err(g.tok, `Tanımsız etiket: '${g.name}'`);
    }
    this.funcs.push(fn);
    this.fn = undefined;
  }

  // ---------------------------------------------------------------- bildirim belirteçleri

  private skipAttributes(): void {
    while (this.is("__attribute__") || this.is("__attribute")) {
      this.pos++;
      this.expect("(");
      let depth = 1;
      while (depth > 0) {
        if (this.atEof()) throw this.err(this.tok(), "__attribute__ kapanmamış");
        if (this.is("(")) depth++;
        if (this.is(")")) depth--;
        this.pos++;
      }
    }
  }

  private declspec(attr?: Attr): Type {
    const VOID = 1 << 0, BOOL = 1 << 2, CHAR = 1 << 4, SHORT = 1 << 6, INT = 1 << 8, LONG = 1 << 10;
    const OTHER = 1 << 12, SIGNED = 1 << 13, UNSIGNED = 1 << 14;
    let ty: Type = T.int;
    let counter = 0;
    let isConst = false;
    let isVolatile = false;
    for (;;) {
      this.skipAttributes();
      const t = this.tok();
      if (!this.isTypename(t)) break;
      const s = t.text;
      if (s === "register" || s === "auto") {
        // yalnızca bir ipucu; register değişkenlerini derleyici kendisi seçer
        this.pos++;
        continue;
      }
      if (STORAGE.has(s)) {
        if (!attr) throw this.err(t, `'${s}' bu bağlamda kullanılamaz`);
        if (s === "typedef") attr.isTypedef = true;
        else if (s === "static") attr.isStatic = true;
        else if (s === "extern") attr.isExtern = true;
        if (attr.isTypedef && (attr.isStatic || attr.isExtern)) {
          throw this.err(t, "typedef, static/extern ile birlikte kullanılamaz");
        }
        this.pos++;
        continue;
      }
      if (QUALS.has(s)) {
        if (s === "const" || s === "__const") isConst = true;
        if (s === "volatile" || s === "__volatile__") isVolatile = true;
        this.pos++;
        continue;
      }
      if (s === "_Alignas") {
        this.pos++;
        this.expect("(");
        if (this.isTypename()) this.typename();
        else this.constExpr();
        this.expect(")");
        continue;
      }
      const td = this.findTypedef(t);
      if (s === "struct" || s === "union" || s === "enum" || td) {
        if (counter) break;
        this.pos++;
        if (s === "struct" || s === "union") ty = this.structDecl(s);
        else if (s === "enum") ty = this.enumSpec();
        else ty = td!;
        counter += OTHER;
        continue;
      }
      if (s === "float" || s === "double") throw this.err(t, `'${s}' desteklenmiyor (kayan nokta yok)`);
      switch (s) {
        case "void": counter += VOID; break;
        case "_Bool": counter += BOOL; break;
        case "char": counter += CHAR; break;
        case "short": counter += SHORT; break;
        case "int": counter += INT; break;
        case "long": counter += LONG; break;
        case "signed": counter |= SIGNED; break;
        case "unsigned": counter |= UNSIGNED; break;
      }
      this.pos++;
      switch (counter) {
        case VOID: ty = T.void; break;
        case BOOL: ty = T.bool; break;
        case CHAR: ty = T.char; break;
        case SIGNED + CHAR: ty = T.schar; break;
        case UNSIGNED + CHAR: ty = T.uchar; break;
        case SHORT: case SHORT + INT: case SIGNED + SHORT: case SIGNED + SHORT + INT:
          ty = T.short; break;
        case UNSIGNED + SHORT: case UNSIGNED + SHORT + INT:
          ty = T.ushort; break;
        case INT: case SIGNED: case SIGNED + INT:
          ty = T.int; break;
        case UNSIGNED: case UNSIGNED + INT:
          ty = T.uint; break;
        case LONG: case LONG + INT: case LONG + LONG: case LONG + LONG + INT:
        case SIGNED + LONG: case SIGNED + LONG + INT: case SIGNED + LONG + LONG: case SIGNED + LONG + LONG + INT:
          ty = T.long; break;
        case UNSIGNED + LONG: case UNSIGNED + LONG + INT: case UNSIGNED + LONG + LONG: case UNSIGNED + LONG + LONG + INT:
          ty = T.ulong; break;
        default:
          throw this.err(t, "Geçersiz tip belirteci birleşimi");
      }
    }
    return qualified(ty, isConst, isVolatile);
  }

  private pointers(ty: Type): Type {
    while (this.consume("*")) {
      ty = pointerTo(ty);
      for (;;) {
        const s = this.tok().text;
        if (this.tok().kind !== "ident" || !QUALS.has(s)) break;
        ty = qualified(ty, s === "const" || s === "__const", s === "volatile" || s === "__volatile__");
        this.pos++;
      }
    }
    return ty;
  }

  private declarator(ty: Type): { ty: Type; name?: Token } {
    ty = this.pointers(ty);
    if (this.is("(") && !this.isTypename(this.peekTok(1)) && !(this.peekTok(1).text === ")")) {
      const start = this.pos;
      this.pos++;
      this.declarator(T.int); // sadece atlamak için
      this.expect(")");
      const outer = this.typeSuffix(ty);
      const after = this.pos;
      this.pos = start + 1;
      const r = this.declarator(outer);
      this.expect(")");
      this.pos = after;
      return r;
    }
    let name: Token | undefined;
    if (this.tok().kind === "ident" && !KEYWORDS.has(this.tok().text)) {
      name = this.tok();
      this.pos++;
    }
    ty = this.typeSuffix(ty);
    this.skipAttributes();
    return { ty, name };
  }

  private abstractDeclarator(ty: Type): Type {
    ty = this.pointers(ty);
    if (this.is("(") && !this.isTypename(this.peekTok(1)) && !(this.peekTok(1).text === ")")) {
      const start = this.pos;
      this.pos++;
      this.abstractDeclarator(T.int);
      this.expect(")");
      const outer = this.typeSuffix(ty);
      const after = this.pos;
      this.pos = start + 1;
      const r = this.abstractDeclarator(outer);
      this.expect(")");
      this.pos = after;
      return r;
    }
    return this.typeSuffix(ty);
  }

  private typename(): Type {
    const base = this.declspec();
    return this.abstractDeclarator(base);
  }

  private typeSuffix(ty: Type): Type {
    if (this.consume("(")) return this.funcParams(ty);
    if (this.consume("[")) return this.arrayDims(ty);
    return ty;
  }

  private funcParams(ret: Type): Type {
    if (this.is("void") && this.peekTok(1).text === ")") {
      this.pos += 2;
      return funcType(ret, [], false, true);
    }
    if (this.consume(")")) return funcType(ret, [], false, false);
    const params: Type[] = [];
    const names: (Token | undefined)[] = [];
    let variadic = false;
    for (;;) {
      if (this.consume("...")) {
        variadic = true;
        this.expect(")");
        break;
      }
      const t = this.tok();
      if (!this.isTypename()) throw this.err(t, "Parametre tipi bekleniyordu");
      const base = this.declspec();
      let { ty, name } = this.declarator(base);
      if (ty.kind === "array") ty = pointerTo(ty.base!);
      else if (ty.kind === "func") ty = pointerTo(ty);
      params.push(ty);
      names.push(name);
      if (this.consume(")")) break;
      this.expect(",");
    }
    const f = funcType(ret, params, variadic, true);
    f.paramNames = names;
    return f;
  }

  private arrayDims(base: Type): Type {
    while (this.is("static") || this.is("restrict") || this.is("const")) this.pos++;
    if (this.consume("]")) {
      const inner = this.typeSuffix(base);
      return arrayOf(inner, -1);
    }
    const t = this.tok();
    const node = this.conditional();
    const c = this.tryConst(node);
    if (!c || c.sym !== undefined) throw this.err(t, "Dizi boyutu sabit olmalı (VLA desteklenmiyor)");
    if (c.val < 0) throw this.err(t, "Dizi boyutu negatif");
    this.expect("]");
    const inner = this.typeSuffix(base);
    if (inner.kind === "array" && inner.len! < 0) throw this.err(t, "İç dizi boyutu belirsiz");
    if (isStructLike(inner) && !inner.complete) throw this.err(t, "Tamamlanmamış tipte dizi");
    return arrayOf(inner, c.val);
  }

  private structDecl(kind: "struct" | "union"): Type {
    this.skipAttributes();
    let tagTok: Token | undefined;
    if (this.tok().kind === "ident" && !KEYWORDS.has(this.tok().text)) {
      tagTok = this.tok();
      this.pos++;
    }
    if (tagTok && !this.is("{")) {
      const found = this.findTag(tagTok.text);
      if (found) {
        if (found.kind !== kind) throw this.err(tagTok, `'${tagTok.text}' farklı türde bir etiket`);
        return found;
      }
      const ty = structType(kind, tagTok.text);
      this.scope().tags.set(tagTok.text, ty);
      return ty;
    }
    const open = this.expect("{");
    let ty: Type;
    const existing = tagTok ? this.scope().tags.get(tagTok.text) : undefined;
    if (existing && existing.kind === kind && !existing.complete) ty = existing;
    else if (existing) throw this.err(tagTok!, `'${tagTok!.text}' yeniden tanımlandı`);
    else {
      ty = structType(kind, tagTok?.text);
      if (tagTok) this.scope().tags.set(tagTok.text, ty);
    }
    const members: Member[] = [];
    while (!this.consume("}")) {
      if (this.is("_Static_assert")) {
        this.staticAssert();
        continue;
      }
      const t = this.tok();
      if (!this.isTypename()) throw this.err(t, "Üye bildirimi bekleniyordu");
      const base = this.declspec();
      if (isStructLike(base) && this.consume(";")) {
        members.push({ name: "", ty: base, offset: 0 });
        continue;
      }
      let first = true;
      while (!this.consume(";")) {
        if (!first) this.expect(",");
        first = false;
        const { ty: mty, name } = this.declarator(base);
        if (this.is(":")) throw this.err(this.tok(), "Bit alanları desteklenmiyor");
        if (!name) throw this.err(this.tok(), "Üye adı eksik");
        if (mty.kind === "func") throw this.err(name, "Üye fonksiyon olamaz");
        if (isStructLike(mty) && !mty.complete) throw this.err(name, "Tamamlanmamış tipte üye");
        if (members.some((m) => m.name === name.text)) throw this.err(name, `'${name.text}' üyesi iki kez tanımlandı`);
        members.push({ name: name.text, ty: mty, offset: 0 });
      }
    }
    if (!members.length) throw this.err(open, "Boş struct/union desteklenmiyor");
    let size = 0;
    members.forEach((m, i) => {
      if (m.ty.kind === "array" && m.ty.len! < 0 && (i !== members.length - 1 || kind === "union")) {
        throw this.err(open, "Esnek dizi üyesi yalnızca struct'ın son üyesi olabilir");
      }
      if (kind === "struct") {
        size = alignTo(size, m.ty.align);
        m.offset = size;
        size += m.ty.size;
      } else {
        m.offset = 0;
        size = Math.max(size, m.ty.size);
      }
    });
    ty.members = members;
    ty.size = alignTo(size, 2);
    ty.align = 2;
    ty.complete = true;
    this.skipAttributes();
    return ty;
  }

  private enumSpec(): Type {
    let tagTok: Token | undefined;
    if (this.tok().kind === "ident" && !KEYWORDS.has(this.tok().text)) {
      tagTok = this.tok();
      this.pos++;
    }
    if (tagTok && !this.is("{")) {
      const found = this.findTag(tagTok.text);
      if (found) {
        if (found.kind !== "enum") throw this.err(tagTok, `'${tagTok.text}' bir enum değil`);
        return found;
      }
      const ty = enumType();
      this.scope().tags.set(tagTok.text, ty);
      return ty;
    }
    this.expect("{");
    const ty = enumType();
    let val = 0;
    while (!this.consume("}")) {
      const name = this.ident();
      if (this.consume("=")) val = this.constExpr();
      this.scope().vars.set(name.text, { enumVal: val });
      val++;
      if (this.consume("}")) break;
      this.expect(",");
    }
    if (tagTok) this.scope().tags.set(tagTok.text, ty);
    return ty;
  }

  // ---------------------------------------------------------------- başlatıcılar

  private newInit(ty: Type, flexible: boolean): Init {
    const init: Init = { ty };
    if (ty.kind === "array") {
      if (ty.len! < 0) {
        if (flexible) init.flexible = true;
        init.children = [];
        return init;
      }
      init.children = Array.from({ length: ty.len! }, () => this.newInit(ty.base!, false));
    } else if (isStructLike(ty)) {
      init.children = ty.members!.map((m) => this.newInit(m.ty, false));
    }
    return init;
  }

  private initializer(ty: Type): Init {
    const init = this.newInit(ty, true);
    this.initializer2(init);
    return init;
  }

  private isEnd(): boolean {
    return this.is("}") || (this.is(",") && this.peekTok(1).text === "}");
  }

  private consumeEnd(): boolean {
    if (this.consume("}")) return true;
    if (this.is(",") && this.peekTok(1).text === "}") {
      this.pos += 2;
      return true;
    }
    return false;
  }

  private initializer2(init: Init): void {
    const ty = init.ty;
    if (ty.kind === "array" && this.tok().kind === "str" && ty.base!.kind === "char") {
      const s = this.tok();
      this.pos++;
      if (init.flexible) Object.assign(init, this.newInit(arrayOf(ty.base!, s.bytes!.length + 1), false));
      init.str = s;
      return;
    }
    if (ty.kind === "array") {
      if (this.is("{")) this.arrayInit1(init);
      else this.arrayInit2(init);
      return;
    }
    if (ty.kind === "struct") {
      if (this.is("{")) {
        this.structInit1(init);
        return;
      }
      const start = this.pos;
      const e = this.assign();
      if (isStructLike(e.ty)) {
        if (!sameType(e.ty, ty)) throw this.err(e.tok, "Başlatıcının struct tipi uyuşmuyor");
        init.expr = e;
        return;
      }
      this.pos = start;
      this.structInit2(init);
      return;
    }
    if (ty.kind === "union") {
      if (this.is("{")) {
        this.pos++;
        let idx = 0;
        if (this.is(".")) {
          this.pos++;
          const n = this.ident();
          idx = ty.members!.findIndex((m) => m.name === n.text);
          if (idx < 0) throw this.err(n, `'${n.text}' üyesi yok`);
          init.mem = idx;
          this.designation(init.children![idx]);
        } else {
          init.mem = idx;
          this.initializer2(init.children![idx]);
        }
        if (!this.consumeEnd()) throw this.err(this.tok(), "Union başlatıcısında fazla eleman");
        return;
      }
      const start = this.pos;
      const e = this.assign();
      if (isStructLike(e.ty)) {
        if (!sameType(e.ty, ty)) throw this.err(e.tok, "Başlatıcının union tipi uyuşmuyor");
        init.expr = e;
        return;
      }
      this.pos = start;
      init.mem = 0;
      this.initializer2(init.children![0]);
      return;
    }
    if (this.consume("{")) {
      this.initializer2(init);
      if (!this.consumeEnd()) throw this.err(this.tok(), "Skaler başlatıcıda fazla eleman");
      return;
    }
    const t = this.tok();
    const e = this.assign();
    init.expr = this.assignConv(e, ty, t);
  }

  private countArrayElems(ty: Type): number {
    const start = this.pos;
    const dummy = this.newInit(ty.base!, false);
    let i = 0;
    let max = 0;
    let first = true;
    this.expect("{");
    while (!this.consumeEnd()) {
      if (!first) this.expect(",");
      first = false;
      if (this.consume("[")) {
        i = this.constExpr();
        this.expect("]");
        this.designation(dummy);
      } else this.initializer2(dummy);
      i++;
      max = Math.max(max, i);
    }
    this.pos = start;
    return max;
  }

  private arrayInit1(init: Init): void {
    if (init.flexible) {
      const n = this.countArrayElems(init.ty);
      Object.assign(init, this.newInit(arrayOf(init.ty.base!, n), false));
      init.flexible = false;
    }
    this.expect("{");
    let i = 0;
    let first = true;
    while (!this.consumeEnd()) {
      if (!first) this.expect(",");
      first = false;
      if (this.is("[")) {
        const t = this.tok();
        this.pos++;
        i = this.constExpr();
        this.expect("]");
        if (i < 0 || i >= init.ty.len!) throw this.err(t, "Dizi göstergesi sınır dışı");
        this.designation(init.children![i]);
        i++;
        continue;
      }
      if (i >= init.ty.len!) throw this.err(this.tok(), "Dizi başlatıcısında fazla eleman");
      this.initializer2(init.children![i]);
      i++;
    }
  }

  private arrayInit2(init: Init): void {
    if (init.flexible) throw this.err(this.tok(), "Boyutu belirsiz dizi '{' ile başlatılmalı");
    for (let i = 0; i < init.ty.len! && !this.isEnd(); i++) {
      if (i > 0) this.expect(",");
      this.initializer2(init.children![i]);
    }
  }

  private structInit1(init: Init): void {
    this.expect("{");
    const members = init.ty.members!;
    let i = 0;
    let first = true;
    while (!this.consumeEnd()) {
      if (!first) this.expect(",");
      first = false;
      if (this.is(".")) {
        this.pos++;
        const n = this.ident();
        i = members.findIndex((m) => m.name === n.text);
        if (i < 0) throw this.err(n, `'${n.text}' üyesi yok`);
        this.designation(init.children![i]);
        i++;
        continue;
      }
      if (i >= members.length) throw this.err(this.tok(), "Struct başlatıcısında fazla eleman");
      this.initializer2(init.children![i]);
      i++;
    }
  }

  /**
   * İlk göstergeden sonraki kısım: ardışık ".üye" / "[n]" göstergeleri (ör. ".pos.y = 1",
   * "[2].x = 5"), ardından '=' ve hedef alt nesnenin başlatıcısı.
   */
  private designation(init: Init): void {
    let cur = init;
    for (;;) {
      const t = this.tok();
      if (this.consume(".")) {
        if (!isStructLike(cur.ty)) throw this.err(t, "'.' göstergesi struct ya da union ister");
        const n = this.ident();
        const idx = cur.ty.members!.findIndex((m) => m.name === n.text);
        if (idx < 0) throw this.err(n, `'${n.text}' üyesi yok`);
        if (cur.ty.kind === "union") cur.mem = idx;
        cur = cur.children![idx];
      } else if (this.consume("[")) {
        if (cur.ty.kind !== "array" || cur.ty.len! < 0) throw this.err(t, "'[ ]' göstergesi boyutu belli bir dizi ister");
        const i = this.constExpr();
        this.expect("]");
        if (i < 0 || i >= cur.ty.len!) throw this.err(t, "Dizi göstergesi sınır dışı");
        cur = cur.children![i];
      } else break;
    }
    this.expect("=");
    this.initializer2(cur);
  }

  private structInit2(init: Init): void {
    const members = init.ty.members!;
    for (let i = 0; i < members.length && !this.isEnd(); i++) {
      if (i > 0) this.expect(",");
      this.initializer2(init.children![i]);
    }
  }

  private globalInit(v: Var): void {
    const init = this.initializer(v.ty);
    v.ty = init.ty;
    const buf = new Array<number>(v.ty.size).fill(0);
    const relocs: Reloc[] = [];
    this.writeInit(init, buf, 0, relocs);
    v.init = buf;
    v.relocs = relocs;
    v.isDefinition = true;
  }

  private writeInit(init: Init, buf: number[], off: number, relocs: Reloc[]): void {
    const ty = init.ty;
    if (init.str) {
      const b = [...init.str.bytes!, 0];
      for (let i = 0; i < Math.min(b.length, ty.size); i++) buf[off + i] = b[i];
      return;
    }
    if (init.expr) {
      if (isStructLike(init.expr.ty)) throw this.err(init.expr.tok, "Global başlatıcı sabit bir ifade olmalı");
      const c = this.tryConst(init.expr);
      if (!c) throw this.err(init.expr.tok, "Global başlatıcı sabit bir ifade olmalı");
      if (c.sym !== undefined) {
        if (ty.size !== 2) throw this.err(init.expr.tok, "Adres sabiti yalnızca 16 bitlik alana yazılabilir");
        relocs.push({ offset: off, sym: c.sym, add: c.val });
        return;
      }
      let v = wrap(c.val, ty);
      for (let i = 0; i < ty.size; i++) {
        buf[off + i] = v & 0xff;
        v = Math.floor(v / 256);
      }
      return;
    }
    if (ty.kind === "array") {
      init.children!.forEach((c, i) => this.writeInit(c, buf, off + i * ty.base!.size, relocs));
    } else if (ty.kind === "struct") {
      init.children!.forEach((c, i) => this.writeInit(c, buf, off + ty.members![i].offset, relocs));
    } else if (ty.kind === "union" && init.mem !== undefined) {
      this.writeInit(init.children![init.mem], buf, off, relocs);
    }
  }

  private fullyInit(init: Init): boolean {
    if (init.expr) return true;
    if (init.str) return init.str.bytes!.length + 1 >= init.ty.size;
    if (init.ty.kind === "union") {
      return init.mem !== undefined && init.ty.members![init.mem].ty.size === init.ty.size && this.fullyInit(init.children![init.mem]);
    }
    if (init.children) return init.children.length > 0 && init.children.every((c) => this.fullyInit(c));
    return false;
  }

  private localInit(v: Var, tok: Token): Node {
    const init = this.initializer(v.ty);
    v.ty = init.ty;
    const stmts: Node[] = [];
    const zeroed = !init.expr && !this.fullyInit(init);
    if (zeroed) stmts.push(this.mk("memzero", tok, T.void, { v }));
    this.initAssign(init, this.varNode(v, tok, false), zeroed, stmts, tok);
    return this.mk("block", tok, T.void, { stmts });
  }

  private initAssign(init: Init, lv: Node, zeroed: boolean, out: Node[], tok: Token): void {
    const ty = init.ty;
    if (init.str) {
      const bytes = [...init.str.bytes!, 0].slice(0, ty.size);
      if (bytes.length > 6) {
        const sv = this.stringVar(init.str);
        out.push(this.mk("strinit", tok, T.void, { lhs: lv, str: sv, val: bytes.length }));
        return;
      }
      bytes.forEach((b, i) => {
        if (b === 0 && zeroed) return;
        const el = this.newDeref(this.newAdd(lv, this.num(i, T.int, tok), tok), tok);
        out.push(this.exprStmt(this.newAssign(el, this.num(b, T.int, tok), tok, true)));
      });
      return;
    }
    if (init.expr) {
      if (zeroed && init.expr.kind === "num" && init.expr.val === 0) return;
      out.push(this.exprStmt(this.newAssign(lv, init.expr, tok, true)));
      return;
    }
    if (ty.kind === "array") {
      init.children!.forEach((c, i) => {
        const el = this.newDeref(this.newAdd(lv, this.num(i, T.int, tok), tok), tok);
        this.initAssign(c, el, zeroed, out, tok);
      });
    } else if (ty.kind === "struct") {
      init.children!.forEach((c, i) => {
        this.initAssign(c, this.memberNode(lv, ty.members![i], tok), zeroed, out, tok);
      });
    } else if (ty.kind === "union" && init.mem !== undefined) {
      this.initAssign(init.children![init.mem], this.memberNode(lv, ty.members![init.mem], tok), zeroed, out, tok);
    }
  }

  // ---------------------------------------------------------------- deyimler

  private exprStmt(e: Node): Node {
    return this.mk("expr", e.tok, T.void, { lhs: e });
  }

  private compound(): Node {
    const tok = this.expect("{");
    this.enterScope();
    const stmts: Node[] = [];
    while (!this.consume("}")) {
      if (this.atEof()) throw this.err(tok, "'}' eksik");
      if (this.is("_Static_assert")) {
        this.staticAssert();
        continue;
      }
      if (this.isTypename() && this.peekTok(1).text !== ":") {
        const attr = newAttr();
        const base = this.declspec(attr);
        if (attr.isTypedef) {
          this.typedefDecl(base);
          continue;
        }
        stmts.push(this.declaration(base, attr));
        continue;
      }
      stmts.push(this.stmt());
    }
    this.leaveScope();
    return this.mk("block", tok, T.void, { stmts });
  }

  private declaration(base: Type, attr: Attr): Node {
    const tok = this.tok();
    const stmts: Node[] = [];
    let first = true;
    while (!this.consume(";")) {
      if (!first) this.expect(",");
      first = false;
      const { ty, name } = this.declarator(base);
      if (!name) throw this.err(this.tok(), "Değişken adı eksik");
      if (ty.kind === "func") {
        this.declareFunc(name, ty, attr);
        continue;
      }
      if (attr.isExtern) {
        const g = this.globalMap.get(name.text);
        if (g) this.scope().vars.set(name.text, { v: g });
        else {
          const v = this.newGlobal(name.text, ty, name, `_${name.text}`);
          this.globalMap.set(name.text, v);
          this.scope().vars.set(name.text, { v });
        }
        continue;
      }
      if (ty.kind === "void") throw this.err(name, "void tipinde değişken olamaz");
      if (attr.isStatic) {
        const v = this.newGlobal(name.text, ty, name, `_${this.fn!.fn.name}.${name.text}.${this.tag}.${this.labelNo++}`);
        v.isStatic = true;
        v.isDefinition = true;
        this.scope().vars.set(name.text, { v });
        if (this.consume("=")) this.globalInit(v);
        v.isConst = constObj(v.ty);
        continue;
      }
      const v = this.newLocal(name.text, ty, name);
      if (this.consume("=")) stmts.push(this.localInit(v, name));
      if (v.ty.kind === "array" && v.ty.len! < 0) throw this.err(name, `'${name.text}' dizisinin boyutu belirsiz`);
      if (isStructLike(v.ty) && !v.ty.complete) throw this.err(name, `'${name.text}' tamamlanmamış tipte`);
      v.isConst = constObj(v.ty);
    }
    return this.mk("block", tok, T.void, { stmts });
  }

  private loopBody(): Node {
    this.loopDepth++;
    try {
      return this.stmt();
    } finally {
      this.loopDepth--;
    }
  }

  private stmt(): Node {
    const tok = this.tok();
    if (this.consume("return")) {
      const ret = this.fn!.ret;
      if (this.consume(";")) return this.mk("return", tok, T.void, {});
      const e = this.expr();
      this.expect(";");
      if (ret.kind === "void") {
        if (e.ty.kind !== "void") throw this.err(tok, "void fonksiyon değer döndüremez");
        return this.mk("block", tok, T.void, { stmts: [this.exprStmt(e), this.mk("return", tok, T.void, {})] });
      }
      if (isStructLike(ret)) {
        if (!sameType(e.ty, ret)) throw this.err(tok, "Dönüş değerinin tipi uyuşmuyor");
        return this.mk("return", tok, T.void, { lhs: e });
      }
      return this.mk("return", tok, T.void, { lhs: this.assignConv(e, ret, tok) });
    }
    if (this.consume("if")) {
      this.expect("(");
      const cond = this.condExpr(this.expr());
      this.expect(")");
      const then = this.stmt();
      const els = this.consume("else") ? this.stmt() : undefined;
      return this.mk("if", tok, T.void, { cond, then, els });
    }
    if (this.consume("switch")) {
      this.expect("(");
      let cond = this.expr();
      if (!isInteger(cond.ty)) throw this.err(tok, "switch ifadesi tamsayı olmalı");
      cond = this.newCast(cond, promote(cond.ty), tok);
      this.expect(")");
      const node = this.mk("switch", tok, T.void, { cond, cases: [], brk: this.newLabel() });
      const [sw, brk] = [this.sw, this.brk];
      this.sw = node;
      this.brk = node.brk;
      node.then = this.stmt();
      this.sw = sw;
      this.brk = brk;
      return node;
    }
    if (this.consume("case")) {
      if (!this.sw) throw this.err(tok, "switch dışında case");
      const v = wrap(this.constExpr(), this.sw.cond!.ty);
      this.expect(":");
      if (this.sw.cases!.some((c) => c.val === v)) throw this.err(tok, `case ${v} iki kez kullanıldı`);
      const label = this.newLabel();
      this.sw.cases!.push({ val: v, label });
      return this.mk("case", tok, T.void, { label, then: this.stmt() });
    }
    if (this.consume("default")) {
      if (!this.sw) throw this.err(tok, "switch dışında default");
      if (this.sw.defLabel) throw this.err(tok, "default iki kez kullanıldı");
      this.expect(":");
      const label = this.newLabel();
      this.sw.defLabel = label;
      return this.mk("case", tok, T.void, { label, then: this.stmt() });
    }
    if (this.consume("for")) {
      this.expect("(");
      this.enterScope();
      let init: Node | undefined;
      if (this.isTypename()) {
        const attr = newAttr();
        const base = this.declspec(attr);
        if (attr.isTypedef) throw this.err(tok, "for içinde typedef olamaz");
        init = this.declaration(base, attr);
      } else if (!this.consume(";")) {
        init = this.exprStmt(this.expr());
        this.expect(";");
      }
      this.loopDepth++;
      const cond = this.is(";") ? undefined : this.condExpr(this.expr());
      this.expect(";");
      const inc = this.is(")") ? undefined : this.expr();
      this.expect(")");
      this.loopDepth--;
      const node = this.mk("for", tok, T.void, { init, cond, inc, brk: this.newLabel(), cont: this.newLabel() });
      const [brk, cont] = [this.brk, this.cont];
      this.brk = node.brk;
      this.cont = node.cont;
      node.then = this.loopBody();
      this.brk = brk;
      this.cont = cont;
      this.leaveScope();
      return node;
    }
    if (this.consume("while")) {
      this.expect("(");
      this.loopDepth++;
      const cond = this.condExpr(this.expr());
      this.loopDepth--;
      this.expect(")");
      const node = this.mk("for", tok, T.void, { cond, brk: this.newLabel(), cont: this.newLabel() });
      const [brk, cont] = [this.brk, this.cont];
      this.brk = node.brk;
      this.cont = node.cont;
      node.then = this.loopBody();
      this.brk = brk;
      this.cont = cont;
      return node;
    }
    if (this.consume("do")) {
      const node = this.mk("do", tok, T.void, { brk: this.newLabel(), cont: this.newLabel() });
      const [brk, cont] = [this.brk, this.cont];
      this.brk = node.brk;
      this.cont = node.cont;
      node.then = this.loopBody();
      this.brk = brk;
      this.cont = cont;
      this.expect("while");
      this.expect("(");
      this.loopDepth++;
      node.cond = this.condExpr(this.expr());
      this.loopDepth--;
      this.expect(")");
      this.expect(";");
      return node;
    }
    if (this.consume("goto")) {
      const name = this.ident();
      this.expect(";");
      this.fn!.gotos.push({ name: name.text, tok: name });
      return this.mk("goto", tok, T.void, { label: this.userLabel(name.text) });
    }
    if (this.consume("break")) {
      if (!this.brk) throw this.err(tok, "Döngü ya da switch dışında break");
      this.expect(";");
      return this.mk("break", tok, T.void, { label: this.brk });
    }
    if (this.consume("continue")) {
      if (!this.cont) throw this.err(tok, "Döngü dışında continue");
      this.expect(";");
      return this.mk("continue", tok, T.void, { label: this.cont });
    }
    if (tok.kind === "ident" && !KEYWORDS.has(tok.text) && this.peekTok(1).text === ":" && this.peekTok(1).kind === "punct") {
      this.pos += 2;
      if (this.fn!.defined.has(tok.text)) throw this.err(tok, `'${tok.text}' etiketi iki kez tanımlandı`);
      this.fn!.defined.add(tok.text);
      const label = this.userLabel(tok.text);
      const then = this.is("}") ? this.mk("null", tok, T.void, {}) : this.stmt();
      return this.mk("label", tok, T.void, { label, then });
    }
    if (this.is("{")) return this.compound();
    if (this.consume(";")) return this.mk("null", tok, T.void, {});
    const e = this.expr();
    this.expect(";");
    return this.exprStmt(e);
  }

  private userLabel(name: string): string {
    let l = this.fn!.labels.get(name);
    if (!l) {
      l = this.newLabel();
      this.fn!.labels.set(name, l);
    }
    return l;
  }

  /** Koşul ifadesi skaler olmalı. */
  private condExpr(e: Node): Node {
    if (!isScalar(vt(e.ty))) throw this.err(e.tok, `Koşul skaler olmalı (${typeName(e.ty)})`);
    return e;
  }

  // ---------------------------------------------------------------- ifadeler

  private mk(kind: NodeKind, tok: Token, ty: Type, fields: Partial<Node>): Node {
    return { kind, tok, ty, ...fields };
  }

  private num(v: number, ty: Type, tok: Token): Node {
    return { kind: "num", tok, ty, val: wrap(v, ty) };
  }

  private varNode(v: Var, tok: Token, count = true): Node {
    if (count && v.isLocal) v.weight += this.loopDepth === 0 ? 1 : 8 ** Math.min(this.loopDepth, 3);
    return { kind: "var", tok, ty: v.ty, v };
  }

  private constExpr(): number {
    const t = this.tok();
    const n = this.conditional();
    const c = this.tryConst(n);
    if (!c || c.sym !== undefined) throw this.err(t, "Sabit ifade bekleniyordu");
    return c.val;
  }

  /** Sabit değerlendirme: adres sabitleri {sym, val} olarak döner; sabit değilse undefined. */
  private tryConst(n: Node): { sym?: string; val: number } | undefined {
    switch (n.kind) {
      case "num":
        return { val: n.val! };
      case "var":
        if (!n.v!.isLocal && (n.ty.kind === "array" || n.ty.kind === "func")) return { sym: n.v!.sym, val: 0 };
        return undefined;
      case "addr":
        return this.constAddr(n.lhs!);
      case "cast": {
        const c = this.tryConst(n.lhs!);
        if (!c) return undefined;
        if (c.sym !== undefined) return n.ty.size >= 2 || n.ty.kind === "void" ? c : undefined;
        return { val: wrap(c.val, n.ty) };
      }
      case "add":
      case "sub": {
        const a = this.tryConst(n.lhs!);
        const b = this.tryConst(n.rhs!);
        if (!a || !b) return undefined;
        if (n.kind === "add") {
          if (a.sym !== undefined && b.sym !== undefined) return undefined;
          return { sym: a.sym ?? b.sym, val: wrap(a.val + b.val, n.ty) };
        }
        if (b.sym !== undefined) return undefined;
        return { sym: a.sym, val: a.sym !== undefined ? a.val - b.val : wrap(a.val - b.val, n.ty) };
      }
      case "cond": {
        const c = this.tryConst(n.cond!);
        if (!c || c.sym !== undefined) return undefined;
        return this.tryConst(c.val ? n.then! : n.els!);
      }
      case "comma":
        return this.tryConst(n.rhs!);
      default:
        return undefined;
    }
  }

  private constAddr(n: Node): { sym?: string; val: number } | undefined {
    if (n.kind === "var" && !n.v!.isLocal) return { sym: n.v!.sym, val: 0 };
    if (n.kind === "deref") return this.tryConst(n.lhs!);
    if (n.kind === "member") {
      const b = this.constAddr(n.lhs!);
      return b && { sym: b.sym, val: b.val + n.mem!.offset };
    }
    return undefined;
  }

  private expr(): Node {
    let node = this.assign();
    while (this.is(",")) {
      const tok = this.tok();
      this.pos++;
      const rhs = this.assign();
      node = this.mk("comma", tok, rhs.ty, { lhs: node, rhs });
    }
    return node;
  }

  private static ASSIGN_OPS: Record<string, NodeKind> = {
    "+=": "add", "-=": "sub", "*=": "mul", "/=": "div", "%=": "mod",
    "&=": "band", "|=": "bor", "^=": "bxor", "<<=": "shl", ">>=": "shr",
  };

  private assign(): Node {
    const lhs = this.conditional();
    const tok = this.tok();
    if (this.consume("=")) return this.newAssign(lhs, this.assign(), tok);
    const op = tok.kind === "punct" ? Parser.ASSIGN_OPS[tok.text] : undefined;
    if (op) {
      this.pos++;
      return this.newOpAssign(op, lhs, this.assign(), tok);
    }
    return lhs;
  }

  private conditional(): Node {
    const cond = this.logor();
    const tok = this.tok();
    if (!this.consume("?")) return cond;
    this.condExpr(cond);
    const then = this.expr();
    this.expect(":");
    const els = this.conditional();
    return this.newCondOp(cond, then, els, tok);
  }

  private logor(): Node {
    let node = this.logand();
    while (this.is("||")) {
      const tok = this.tok();
      this.pos++;
      node = this.newLogical("logor", node, this.logand(), tok);
    }
    return node;
  }

  private logand(): Node {
    let node = this.bitor();
    while (this.is("&&")) {
      const tok = this.tok();
      this.pos++;
      node = this.newLogical("logand", node, this.bitor(), tok);
    }
    return node;
  }

  private bitor(): Node {
    let node = this.bitxor();
    while (this.is("|")) {
      const tok = this.tok();
      this.pos++;
      node = this.newArith("bor", node, this.bitxor(), tok);
    }
    return node;
  }

  private bitxor(): Node {
    let node = this.bitand();
    while (this.is("^")) {
      const tok = this.tok();
      this.pos++;
      node = this.newArith("bxor", node, this.bitand(), tok);
    }
    return node;
  }

  private bitand(): Node {
    let node = this.equality();
    while (this.is("&")) {
      const tok = this.tok();
      this.pos++;
      node = this.newArith("band", node, this.equality(), tok);
    }
    return node;
  }

  private equality(): Node {
    let node = this.relational();
    for (;;) {
      const tok = this.tok();
      if (this.consume("==")) node = this.newCompare("eq", node, this.relational(), tok);
      else if (this.consume("!=")) node = this.newCompare("ne", node, this.relational(), tok);
      else return node;
    }
  }

  private relational(): Node {
    let node = this.shift();
    for (;;) {
      const tok = this.tok();
      if (this.consume("<")) node = this.newCompare("lt", node, this.shift(), tok);
      else if (this.consume("<=")) node = this.newCompare("le", node, this.shift(), tok);
      else if (this.consume(">")) node = this.newCompare("gt", node, this.shift(), tok);
      else if (this.consume(">=")) node = this.newCompare("ge", node, this.shift(), tok);
      else return node;
    }
  }

  private shift(): Node {
    let node = this.add();
    for (;;) {
      const tok = this.tok();
      if (this.consume("<<")) node = this.newShift("shl", node, this.add(), tok);
      else if (this.consume(">>")) node = this.newShift("shr", node, this.add(), tok);
      else return node;
    }
  }

  private add(): Node {
    let node = this.mul();
    for (;;) {
      const tok = this.tok();
      if (this.consume("+")) node = this.newAdd(node, this.mul(), tok);
      else if (this.consume("-")) node = this.newSub(node, this.mul(), tok);
      else return node;
    }
  }

  private mul(): Node {
    let node = this.cast();
    for (;;) {
      const tok = this.tok();
      if (this.consume("*")) node = this.newArith("mul", node, this.cast(), tok);
      else if (this.consume("/")) node = this.newArith("div", node, this.cast(), tok);
      else if (this.consume("%")) node = this.newArith("mod", node, this.cast(), tok);
      else return node;
    }
  }

  private cast(): Node {
    if (this.is("(") && this.isTypename(this.peekTok(1))) {
      const tok = this.tok();
      this.pos++;
      const ty = this.typename();
      this.expect(")");
      if (this.is("{")) return this.postfix(this.compoundLiteral(ty, tok));
      return this.newCast(this.cast(), ty, tok, true);
    }
    return this.unary();
  }

  /**
   * Bileşik sabit "(tip){ ... }": fonksiyon içinde adsız bir yerel değişken, her değerlendirmede
   * yeniden başlatılır: *(başlat, &geçici) — böylece bir lvalue olur. Dosya kapsamında statik nesne.
   */
  private compoundLiteral(ty: Type, tok: Token): Node {
    if (!this.fn) {
      const g = this.newGlobal("", ty, tok, `__cl.${this.tag}.${this.labelNo++}`);
      g.isStatic = true;
      g.isDefinition = true;
      this.globalInit(g);
      g.isConst = constObj(g.ty);
      return this.varNode(g, tok, false);
    }
    const v = this.newLocal("", ty, tok, false);
    const init = this.localInit(v, tok);
    if (isStructLike(v.ty) && !v.ty.complete) throw this.err(tok, "Bileşik sabitin tipi tamamlanmamış");
    const addr = this.newAddr(this.varNode(v, tok, false), tok);
    return this.newDeref(this.mk("comma", tok, addr.ty, { lhs: init, rhs: addr }), tok);
  }

  private unary(): Node {
    const tok = this.tok();
    if (tok.kind === "punct") {
      switch (tok.text) {
        case "+": {
          this.pos++;
          const e = this.cast();
          if (!isInteger(e.ty)) throw this.err(tok, "Tekli + tamsayı ister");
          return this.newCast(e, promote(e.ty), tok);
        }
        case "-": {
          this.pos++;
          let e = this.cast();
          if (!isInteger(e.ty)) throw this.err(tok, "Tekli - tamsayı ister");
          e = this.newCast(e, promote(e.ty), tok);
          if (e.kind === "num") return this.num(-e.val!, e.ty, tok);
          return this.mk("neg", tok, e.ty, { lhs: e });
        }
        case "~": {
          this.pos++;
          let e = this.cast();
          if (!isInteger(e.ty)) throw this.err(tok, "~ tamsayı ister");
          e = this.newCast(e, promote(e.ty), tok);
          if (e.kind === "num") return this.num(~e.val!, e.ty, tok);
          return this.mk("bitnot", tok, e.ty, { lhs: e });
        }
        case "!": {
          this.pos++;
          const e = this.cast();
          this.condExpr(e);
          if (e.kind === "num") return this.num(e.val ? 0 : 1, T.int, tok);
          return this.mk("not", tok, T.int, { lhs: e });
        }
        case "&": {
          this.pos++;
          const e = this.cast();
          return this.newAddr(e, tok);
        }
        case "*": {
          this.pos++;
          return this.newDeref(this.cast(), tok);
        }
        case "++":
        case "--": {
          this.pos++;
          const e = this.unary();
          return this.newOpAssign(tok.text === "++" ? "add" : "sub", e, this.num(1, T.int, tok), tok);
        }
      }
    }
    if (this.consume("sizeof")) {
      let ty: Type;
      if (this.is("(") && this.isTypename(this.peekTok(1))) {
        this.pos++;
        ty = this.typename();
        this.expect(")");
      } else {
        ty = this.unary().ty;
      }
      if ((ty.kind === "array" && ty.len! < 0) || (isStructLike(ty) && !ty.complete) || ty.kind === "void" || ty.kind === "func") {
        throw this.err(tok, `sizeof tamamlanmamış tipe uygulanamaz (${typeName(ty)})`);
      }
      return this.num(ty.size, T.uint, tok);
    }
    if (this.consume("_Alignof")) {
      this.expect("(");
      const ty = this.typename();
      this.expect(")");
      return this.num(ty.align, T.uint, tok);
    }
    return this.postfix();
  }

  private postfix(start?: Node): Node {
    let node = start ?? this.primary();
    for (;;) {
      const tok = this.tok();
      if (this.consume("(")) {
        node = this.funcall(node, tok);
      } else if (this.consume("[")) {
        const idx = this.expr();
        this.expect("]");
        node = this.newDeref(this.newAdd(node, idx, tok), tok);
      } else if (this.consume(".")) {
        node = this.newMember(node, this.ident(), tok);
      } else if (this.consume("->")) {
        node = this.newMember(this.newDeref(node, tok), this.ident(), tok);
      } else if (this.is("++") || this.is("--")) {
        this.pos++;
        node = this.newPostInc(node, tok.text === "++" ? 1 : -1, tok);
      } else {
        return node;
      }
    }
  }

  private primary(): Node {
    const tok = this.tok();
    if (this.consume("(")) {
      if (this.is("{")) throw this.err(tok, "Deyim ifadeleri ({ ... }) desteklenmiyor");
      const e = this.expr();
      this.expect(")");
      return e;
    }
    if (tok.kind === "num") {
      this.pos++;
      return this.num(tok.val!, tok.ty!, tok);
    }
    if (tok.kind === "char") {
      this.pos++;
      return this.num(tok.val!, T.int, tok);
    }
    if (tok.kind === "str") {
      this.pos++;
      return this.varNode(this.stringVar(tok), tok);
    }
    if (tok.kind === "ident") {
      if (tok.text === "__builtin_va_start") {
        this.pos++;
        this.expect("(");
        if (!this.is(")")) this.assign();
        this.expect(")");
        if (!this.fn || !this.fn.variadic) throw this.err(tok, "va_start yalnızca değişken argümanlı fonksiyonda kullanılabilir");
        return this.mk("vastart", tok, pointerTo(T.char), { val: this.fn.namedWords });
      }
      if (KEYWORDS.has(tok.text)) throw this.err(tok, `Beklenmeyen '${tok.text}'`);
      this.pos++;
      const sc = this.findVar(tok.text);
      if (!sc && (tok.text === "__func__" || tok.text === "__FUNCTION__") && this.fn) {
        const name = this.fn.fn.name;
        const bytes = Array.from(name, (c) => c.charCodeAt(0) & 0xff);
        return this.varNode(this.stringVar({ ...tok, kind: "str", bytes }), tok);
      }
      if (sc?.v) return this.varNode(sc.v, tok);
      if (sc?.enumVal !== undefined) return this.num(sc.enumVal, T.int, tok);
      if (sc?.typedef) throw this.err(tok, `'${tok.text}' bir tip adı, ifade değil`);
      if (this.is("(")) throw this.err(tok, `Bildirilmemiş fonksiyon: '${tok.text}'`);
      throw this.err(tok, `Tanımsız değişken: '${tok.text}'`);
    }
    throw this.err(tok, `İfade bekleniyordu, '${tok.text || "dosya sonu"}' bulundu`);
  }

  private funcall(fn: Node, tok: Token): Node {
    let fty = fn.ty;
    if (fty.kind === "ptr" && fty.base!.kind === "func") fty = fty.base!;
    else if (fty.kind !== "func") throw this.err(tok, "Çağrılan ifade bir fonksiyon değil");
    const args: Node[] = [];
    if (!this.consume(")")) {
      for (;;) {
        args.push(this.assign());
        if (this.consume(")")) break;
        this.expect(",");
      }
    }
    const params = fty.params!;
    if (fty.proto && (args.length < params.length || (!fty.variadic && args.length > params.length))) {
      const name = fn.kind === "var" ? `'${fn.v!.name}' ` : "";
      throw this.err(tok, `${name}${params.length} argüman bekler, ${args.length} verildi`);
    }
    const conv = args.map((a, i) => {
      if (i < params.length) {
        if (isStructLike(params[i]) || isStructLike(a.ty)) {
          if (!sameType(a.ty, params[i])) throw this.err(a.tok, "Argümanın struct tipi uyuşmuyor");
          return a;
        }
        return this.assignConv(a, params[i], a.tok);
      }
      if (a.ty.kind === "void") throw this.err(a.tok, "void argüman");
      if (isStructLike(a.ty)) return a;
      if (isInteger(a.ty)) return this.newCast(a, promote(a.ty), a.tok);
      return this.newCast(a, vt(a.ty), a.tok);
    });
    const node = this.mk("call", tok, fty.ret!, { fn, args: conv, fty });
    if (isStructLike(fty.ret!)) node.retBuf = this.newLocal("", fty.ret!, tok, false);
    return node;
  }

  // ---------------------------------------------------------------- düğüm kurucuları

  private isLvalue(e: Node): boolean {
    return (e.kind === "var" && !e.v!.isFunction) || e.kind === "deref" || e.kind === "member" || e.kind === "lvval";
  }

  private checkModifiable(e: Node, tok: Token): void {
    if (!this.isLvalue(e)) throw this.err(tok, "Atamanın sol tarafı değiştirilebilir bir değer (lvalue) olmalı");
    if (e.ty.kind === "array") throw this.err(tok, "Diziye atama yapılamaz");
    if (e.ty.isConst) throw this.err(tok, "const nesne değiştirilemez");
  }

  /** Atama dönüşümü (tip uyumu + cast). */
  private assignConv(e: Node, ty: Type, tok: Token): Node {
    const from = vt(e.ty);
    if (isStructLike(ty)) {
      if (!sameType(e.ty, ty)) throw this.err(tok, `${typeName(e.ty)} → ${typeName(ty)} atanamaz`);
      return e;
    }
    if (ty.kind === "void") return e;
    if (!isScalar(from)) throw this.err(tok, `${typeName(e.ty)} → ${typeName(ty)} dönüştürülemez`);
    return this.newCast(e, ty, tok);
  }

  private newAssign(lhs: Node, rhs: Node, tok: Token, isInit = false): Node {
    if (isInit) {
      if (!this.isLvalue(lhs)) throw this.err(tok, "Başlatma hedefi geçersiz");
    } else {
      this.checkModifiable(lhs, tok);
    }
    if (isStructLike(lhs.ty)) {
      if (!sameType(lhs.ty, rhs.ty)) throw this.err(tok, "Atamada struct tipleri uyuşmuyor");
      return this.mk("assign", tok, lhs.ty, { lhs, rhs });
    }
    return this.mk("assign", tok, lhs.ty, { lhs, rhs: this.assignConv(rhs, lhs.ty, tok) });
  }

  private newOpAssign(op: NodeKind, lhs: Node, rhs: Node, tok: Token): Node {
    this.checkModifiable(lhs, tok);
    if (isStructLike(lhs.ty)) throw this.err(tok, "struct üzerinde bileşik atama yapılamaz");
    const lv = this.mk("lvval", tok, lhs.ty, {});
    let e: Node;
    if (op === "add") e = this.newAdd(lv, rhs, tok);
    else if (op === "sub") e = this.newSub(lv, rhs, tok);
    else if (op === "shl" || op === "shr") e = this.newShift(op, lv, rhs, tok);
    else e = this.newArith(op, lv, rhs, tok);
    return this.mk("opassign", tok, lhs.ty, { lhs, rhs: this.newCast(e, lhs.ty, tok) });
  }

  private newPostInc(e: Node, dir: number, tok: Token): Node {
    this.checkModifiable(e, tok);
    if (!isScalar(e.ty)) throw this.err(tok, "++/-- skaler bir değer ister");
    let delta = dir;
    if (e.ty.kind === "ptr") {
      const sz = e.ty.base!.kind === "void" ? 1 : e.ty.base!.size;
      if (sz <= 0) throw this.err(tok, "Tamamlanmamış tipe işaretçi artırılamaz");
      delta = dir * sz;
    }
    return this.mk("postinc", tok, e.ty, { lhs: e, val: delta });
  }

  newCast(e: Node, ty: Type, tok: Token, explicit = false): Node {
    if (ty.kind === "void") return this.mk("cast", tok, T.void, { lhs: e });
    if (isStructLike(ty) || ty.kind === "array" || ty.kind === "func") {
      if (isStructLike(ty) && sameType(ty, e.ty)) return e;
      throw this.err(tok, `${typeName(ty)} tipine dönüştürülemez`);
    }
    const from = vt(e.ty);
    if (!isScalar(from)) throw this.err(tok, `${typeName(e.ty)} → ${typeName(ty)} dönüştürülemez`);
    if (e.ty === ty) return e;
    if (e.kind === "num") return this.num(e.val!, ty, tok);
    if (!explicit && sameType(e.ty, ty) && e.ty.kind !== "array") return e;
    return this.mk("cast", tok, ty, { lhs: e });
  }

  private fold(kind: NodeKind, a: number, b: number, ty: Type): number | undefined {
    const is32 = ty.size === 4;
    switch (kind) {
      case "add": return a + b;
      case "sub": return a - b;
      case "mul": return is32 ? Math.imul(a, b) : a * b;
      case "div": return b === 0 ? undefined : Math.trunc(a / b);
      case "mod": return b === 0 ? undefined : a % b;
      case "band": return Number(BigInt.asUintN(32, BigInt(a) & BigInt(b)));
      case "bor": return Number(BigInt.asUintN(32, BigInt(a) | BigInt(b)));
      case "bxor": return Number(BigInt.asUintN(32, BigInt(a) ^ BigInt(b)));
      default: return undefined;
    }
  }

  private newArith(kind: NodeKind, a: Node, b: Node, tok: Token): Node {
    if (!isInteger(a.ty) || !isInteger(b.ty)) {
      throw this.err(tok, `Geçersiz işlenen tipleri: ${typeName(a.ty)} ve ${typeName(b.ty)}`);
    }
    const ty = commonType(a.ty, b.ty);
    a = this.newCast(a, ty, tok);
    b = this.newCast(b, ty, tok);
    if (a.kind === "num" && b.kind === "num") {
      const v = this.fold(kind, a.val!, b.val!, ty);
      if (v !== undefined) return this.num(v, ty, tok);
    }
    return this.mk(kind, tok, ty, { lhs: a, rhs: b });
  }

  private newShift(kind: NodeKind, a: Node, b: Node, tok: Token): Node {
    if (!isInteger(a.ty) || !isInteger(b.ty)) throw this.err(tok, "Kaydırma tamsayı ister");
    a = this.newCast(a, promote(a.ty), tok);
    b = this.newCast(b, T.int, tok);
    const ty = a.ty;
    if (a.kind === "num" && b.kind === "num") {
      const n = b.val!;
      const bits = ty.size * 8;
      if (n >= 0 && n < bits) {
        if (kind === "shl") return this.num(a.val! * 2 ** n, ty, tok);
        return this.num(Math.floor(a.val! / 2 ** n), ty, tok);
      }
    }
    return this.mk(kind, tok, ty, { lhs: a, rhs: b });
  }

  newAdd(a: Node, b: Node, tok: Token): Node {
    let ta = vt(a.ty);
    let tb = vt(b.ty);
    if (isInteger(ta) && isInteger(tb)) return this.newArith("add", a, b, tok);
    if (isPtrLike(ta) && isPtrLike(tb)) throw this.err(tok, "İki işaretçi toplanamaz");
    if (!isPtrLike(ta)) {
      [a, b] = [b, a];
      [ta, tb] = [tb, ta];
    }
    if (!isInteger(tb)) throw this.err(tok, "İşaretçiye yalnızca tamsayı eklenebilir");
    const idx = this.scaleIndex(b, ta, tok);
    if (a.kind === "num" && idx.kind === "num") return this.num(a.val! + idx.val!, ta, tok);
    if (idx.kind === "num" && idx.val === 0) return a.ty === ta ? a : this.mk("cast", tok, ta, { lhs: a });
    return this.mk("add", tok, ta, { lhs: a, rhs: idx });
  }

  private scaleIndex(b: Node, pty: Type, tok: Token): Node {
    const base = pty.base!;
    if (base.kind === "func") throw this.err(tok, "Fonksiyon işaretçisinde aritmetik yapılamaz");
    const size = base.kind === "void" ? 1 : base.size;
    if (size <= 0) throw this.err(tok, "Tamamlanmamış tipe işaretçi aritmetiği");
    const idx = this.newCast(b, b.ty.unsigned && b.ty.size <= 2 ? T.uint : T.int, tok);
    if (size === 1) return idx;
    return this.newArith("mul", idx, this.num(size, T.int, tok), tok);
  }

  newSub(a: Node, b: Node, tok: Token): Node {
    const ta = vt(a.ty);
    const tb = vt(b.ty);
    if (isInteger(ta) && isInteger(tb)) return this.newArith("sub", a, b, tok);
    if (isPtrLike(ta) && isInteger(tb)) {
      const idx = this.scaleIndex(b, ta, tok);
      if (a.kind === "num" && idx.kind === "num") return this.num(a.val! - idx.val!, ta, tok);
      return this.mk("sub", tok, ta, { lhs: a, rhs: idx });
    }
    if (isPtrLike(ta) && isPtrLike(tb)) {
      const size = ta.base!.kind === "void" ? 1 : ta.base!.size;
      if (size !== (tb.base!.kind === "void" ? 1 : tb.base!.size)) throw this.err(tok, "Farklı tipte işaretçiler çıkarılamaz");
      const d = this.mk("sub", tok, T.int, { lhs: a, rhs: b });
      if (size === 1) return d;
      return this.mk("div", tok, T.int, { lhs: d, rhs: this.num(size, T.int, tok), exact: true });
    }
    throw this.err(tok, "Geçersiz çıkarma işlenenleri");
  }

  private newCompare(kind: NodeKind, a: Node, b: Node, tok: Token): Node {
    const ta = vt(a.ty);
    const tb = vt(b.ty);
    if (isInteger(ta) && isInteger(tb)) {
      const ty = commonType(ta, tb);
      a = this.newCast(a, ty, tok);
      b = this.newCast(b, ty, tok);
      if (a.kind === "num" && b.kind === "num") {
        const x = a.val!;
        const y = b.val!;
        const r = { eq: x === y, ne: x !== y, lt: x < y, le: x <= y, gt: x > y, ge: x >= y }[kind as "eq"];
        return this.num(r ? 1 : 0, T.int, tok);
      }
      return this.mk(kind, tok, T.int, { lhs: a, rhs: b });
    }
    if ((isPtrLike(ta) || isInteger(ta)) && (isPtrLike(tb) || isInteger(tb))) {
      a = this.newCast(a, T.uint, tok);
      b = this.newCast(b, T.uint, tok);
      return this.mk(kind, tok, T.int, { lhs: a, rhs: b });
    }
    throw this.err(tok, `Karşılaştırılamaz tipler: ${typeName(a.ty)} ve ${typeName(b.ty)}`);
  }

  private newLogical(kind: NodeKind, a: Node, b: Node, tok: Token): Node {
    this.condExpr(a);
    this.condExpr(b);
    if (a.kind === "num") {
      const av = a.val !== 0;
      if (kind === "logand" && !av) return this.num(0, T.int, tok);
      if (kind === "logor" && av) return this.num(1, T.int, tok);
      if (b.kind === "num") return this.num(b.val !== 0 ? 1 : 0, T.int, tok);
    }
    return this.mk(kind, tok, T.int, { lhs: a, rhs: b });
  }

  private newCondOp(c: Node, a: Node, b: Node, tok: Token): Node {
    const ta = vt(a.ty);
    const tb = vt(b.ty);
    let ty: Type;
    if (ta.kind === "void" || tb.kind === "void") ty = T.void;
    else if (isInteger(ta) && isInteger(tb)) ty = commonType(ta, tb);
    else if (isPtrLike(ta) && (isPtrLike(tb) || isInteger(tb))) ty = ta;
    else if (isInteger(ta) && isPtrLike(tb)) ty = tb;
    else if (isStructLike(ta) && sameType(ta, tb)) ty = ta;
    else throw this.err(tok, `?: dallarının tipleri uyuşmuyor: ${typeName(a.ty)} ve ${typeName(b.ty)}`);
    if (ty.kind !== "void" && !isStructLike(ty)) {
      a = this.newCast(a, ty, tok);
      b = this.newCast(b, ty, tok);
    }
    if (c.kind === "num") return c.val ? a : b;
    return this.mk("cond", tok, ty, { cond: c, then: a, els: b });
  }

  private newAddr(e: Node, tok: Token): Node {
    if (e.kind === "var" && e.v!.isFunction) return this.mk("addr", tok, pointerTo(e.ty), { lhs: e });
    if (!this.isLvalue(e) || e.kind === "lvval") throw this.err(tok, "& işleci bir lvalue ister");
    markAddrTaken(e);
    if (e.kind === "deref") {
      // &*p == p
      return this.newCast(e.lhs!, pointerTo(e.ty), tok);
    }
    return this.mk("addr", tok, pointerTo(e.ty), { lhs: e });
  }

  newDeref(e: Node, tok: Token): Node {
    const t = vt(e.ty);
    if (t.kind !== "ptr") throw this.err(tok, `İşaretçi olmayan değer (${typeName(e.ty)}) * ile kullanılamaz`);
    const base = t.base!;
    if (base.kind === "void") throw this.err(tok, "void * işaretçisi * ile kullanılamaz");
    if (base.kind === "func") return e.ty.kind === "func" ? e : this.mk("deref", tok, base, { lhs: e });
    return this.mk("deref", tok, base, { lhs: e });
  }

  private memberNode(e: Node, m: Member, tok: Token): Node {
    return this.mk("member", tok, e.ty.isConst ? qualified(m.ty, true, false) : m.ty, { lhs: e, mem: m });
  }

  private newMember(e: Node, name: Token, tok: Token): Node {
    if (!isStructLike(e.ty)) throw this.err(tok, `'.' / '->' struct ya da union ister (${typeName(e.ty)})`);
    if (!e.ty.complete) throw this.err(tok, `Tamamlanmamış tip: ${typeName(e.ty)}`);
    const m = findMember(e.ty, name.text);
    if (!m) throw this.err(name, `${typeName(e.ty)} içinde '${name.text}' üyesi yok`);
    return this.memberNode(e, m, tok);
  }
}

/** Değer tipi: dizi ve fonksiyon işaretçiye dönüşür. */
function vt(t: Type): Type {
  if (t.kind === "array") return pointerTo(t.base!);
  if (t.kind === "func") return pointerTo(t);
  return t;
}

function constObj(ty: Type): boolean {
  if (ty.isConst) return true;
  if (ty.kind === "array") return constObj(ty.base!);
  return false;
}

function markAddrTaken(e: Node): void {
  if (e.kind === "var") e.v!.addrTaken = true;
  else if (e.kind === "member") markAddrTaken(e.lhs!);
}

function findMember(ty: Type, name: string): Member | undefined {
  for (const m of ty.members!) {
    if (m.name === name) return m;
    if (m.name === "" && isStructLike(m.ty)) {
      const inner = findMember(m.ty, name);
      if (inner) return { name, ty: inner.ty, offset: m.offset + inner.offset };
    }
  }
  return undefined;
}
