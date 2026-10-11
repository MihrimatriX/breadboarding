// cc16 kod üreticisi: tipli AST → CPU16 komut öğeleri (object.ts).
//
// Register kullanımı (fonksiyon gövdesinde):
//   r0 (r0:r1)  ifade sonucu ("akümülatör"); 32 bit değerlerde r0 düşük, r1 yüksek kelime
//   r1 / r2:r3  ikinci işlenen; r0–r3 çağrılarda bozulur (caller-saved)
//   r4, r5      register değişkenleri (en sık kullanılan 2 skaler yerel), callee-saved
//   r6 = sp     yığın; çerçeve SP'ye göre adreslenir (this.depth = çerçeve tabanından sonraki itmeler)
//   r7          LR prologda yığına atıldığı için gövdede geçici register (adres hesabı, uzak atlama)
//
// "Basit" ifadeler (sabit, değişken, *p, a[i], s.x, &x ...) çağrı içermez ve hedef register'a
// yalnızca o register'ı ve r7'yi kullanarak yüklenebilir; ikili işlemlerde push/pop yerine doğrudan
// r1'e yüklenir. Bir ifadenin basit olup olmadığı, kodu geçici bir tampona üretmeye çalışarak anlaşılır.

import { CompileError } from "./lexer.ts";
import { INVERT, type Chunk, type Item, type ObjFile } from "./object.ts";
import type { TranslationUnit } from "./parser.ts";
import { T, is32, isSigned, isStructLike, isWord, wordsOf, type Func, type Node, type Type, type Var } from "./types.ts";

class NotSimple extends Error {}
const NS = new NotSimple("basit değil");

/** Bellek konumu: base "sp" (çerçeve ofseti; kullanımda depth eklenir), "abs" (sembol+ofset) ya da register. */
interface Loc {
  base: string;
  off: number;
  sym?: string;
}

export interface CodegenOptions {
  /** register değişkenleri ve gözetleme deliği (peephole) iyileştirmeleri */
  optimize: boolean;
}

const FLAG_OPS = new Set(["ADD", "ADC", "SUB", "SBC", "AND", "OR", "XOR", "MOV", "NOT", "NEG", "SHL", "SHR", "SAR", "ROL", "ROR", "ADDI", "SXB"]);

const toS16 = (v: number) => {
  v &= 0xffff;
  return v >= 0x8000 ? v - 0x10000 : v;
};

const isAggr = (t: Type) => isStructLike(t) || t.kind === "array" || t.kind === "func";

/** Tipi değiştirmeyen (16 bit ↔ 16 bit, dizi → işaretçi) dönüşümleri atlar. */
function stripNop(e: Node): Node {
  while (e.kind === "cast") {
    const from = e.lhs!.ty;
    const to = e.ty;
    const fromW = from.kind === "array" || from.kind === "func" ? 2 : from.size;
    if (to.size !== 2 || fromW !== 2 || to.kind === "bool") break;
    e = e.lhs!;
  }
  return e;
}

function memOp(base: string, off: number): string {
  return off === 0 ? `[${base}]` : off > 0 ? `[${base}+${off}]` : `[${base}-${-off}]`;
}

export function codegen(tu: TranslationUnit, file: string, opts: CodegenOptions): ObjFile {
  const chunks: Chunk[] = [];
  const counter = { n: 0 };
  for (const f of tu.funcs) {
    const g = new FnGen(f, tu.tag, counter, opts);
    chunks.push({
      name: f.sym, section: "text", align: 2, items: g.run(), exports: [f.sym], global: !f.isStatic, file,
    });
  }
  for (const v of tu.globals) chunks.push(dataChunk(v, file));
  return { file, chunks, equates: {}, lib: false };
}

function dataChunk(v: Var, file: string): Chunk {
  const size = Math.max(v.ty.size, 1);
  const init = v.init;
  const relocs = v.relocs ?? [];
  const items: Item[] = [{ k: "label", name: v.sym }];
  let section: Chunk["section"];
  if (v.isString || v.isConst) section = "rodata";
  else if (init && (init.some((b) => b !== 0) || relocs.length)) section = "data";
  else section = "bss";
  if (section === "bss") {
    items.push({ k: "space", n: size + (size & 1) });
  } else {
    const bytes = init ?? new Array<number>(size).fill(0);
    let pos = 0;
    for (const r of [...relocs].sort((a, b) => a.offset - b.offset)) {
      if (r.offset > pos) items.push({ k: "byte", bytes: bytes.slice(pos, r.offset) });
      items.push({ k: "word", expr: r.add ? `${r.sym}${r.add > 0 ? "+" : "-"}${Math.abs(r.add)}` : r.sym });
      pos = r.offset + 2;
    }
    const rest = bytes.slice(pos);
    if (rest.length & 1 || (bytes.length & 1)) rest.push(0);
    if (rest.length) items.push({ k: "byte", bytes: rest });
  }
  return { name: v.sym, section, align: 2, items, exports: [v.sym], global: !v.isStatic, file };
}

interface LvCtx {
  /** basit lvalue: her kullanımda yeniden hesaplanır */
  node?: Node;
  /** karmaşık lvalue: adresi bu derinlikte yığına atıldı */
  slot?: number;
}

class FnGen {
  private fn: Func;
  private tag: string;
  private counter: { n: number };
  private opts: CodegenOptions;
  private out: Item[] = [];
  private depth = 0;
  private lv?: LvCtx;
  private retLabel = "";
  private homeWords = 0;
  /** ev alanının (0. argüman kelimesi) çerçeve ofseti */
  private homeBase = 0;

  constructor(fn: Func, tag: string, counter: { n: number }, opts: CodegenOptions) {
    this.fn = fn;
    this.tag = tag;
    this.counter = counter;
    this.opts = opts;
  }

  // ---------------------------------------------------------------- yardımcılar

  private label(): string {
    return `.${this.tag}_c${this.counter.n++}`;
  }

  private ins(op: string, ...args: (string | number)[]): void {
    this.out.push({ k: "ins", op, args: args.map(String) });
  }

  private place(name: string): void {
    this.out.push({ k: "label", name });
  }

  private br(cond: string, target: string): void {
    this.out.push({ k: "br", cond, target });
  }

  private jmp(target: string): void {
    this.out.push({ k: "jmp", target });
  }

  private call(target: string): void {
    this.out.push({ k: "call", target });
  }

  private push(r: string): void {
    this.ins("PUSH", r);
    this.depth += 2;
  }

  private pop(r: string): void {
    this.ins("POP", r);
    this.depth -= 2;
  }

  private li(r: string, v: number): void {
    this.ins("LI", r, v & 0xffff);
  }

  private mov(rd: string, rs: string): void {
    if (rd !== rs) this.ins("MOV", rd, rs);
  }

  private fail(n: Node, msg: string): never {
    throw new CompileError(n.tok, msg);
  }

  /** rd = rs + c (16 bit). Gerekirse scratch kullanır. */
  private addImm(rd: string, rs: string, c: number, scratch?: string): void {
    c = toS16(c);
    if (c === 0) return this.mov(rd, rs);
    if (c >= -32 && c <= 31) return this.ins("ADDI", rd, rs, c);
    if (rd !== rs && rd !== "sp") {
      this.li(rd, c);
      this.ins("ADD", rd, rd, rs);
      return;
    }
    if (!scratch || scratch === rs) throw NS;
    this.li(scratch, c);
    this.ins("ADD", rd, rs, scratch);
  }

  /** sp += n (r7 serbest olmalı) */
  private addSp(n: number): void {
    if (n === 0) return;
    this.addImm("sp", "sp", n, "r7");
  }

  private symExpr(l: Loc): string {
    if (!l.sym) return String(l.off & 0xffff);
    return l.off === 0 ? l.sym : l.off > 0 ? `${l.sym}+${l.off}` : `${l.sym}-${-l.off}`;
  }

  /** [base+off]'tan skaler yükle (base "sp" ise depth eklenir). */
  private loadAt(rd: string, base: string, off: number, ty: Type): void {
    if (base === "sp") off += this.depth;
    const byte = ty.size === 1;
    const ok = byte ? off >= -32 && off <= 31 : off >= -64 && off <= 62 && !(off & 1);
    const op = byte ? "LBU" : "LW";
    if (ok) this.ins(op, rd, memOp(base, off));
    else if (rd !== base) {
      this.li(rd, off);
      this.ins("ADD", rd, rd, base);
      this.ins(op, rd, `[${rd}]`);
    } else {
      if (rd === "r7") throw NS;
      this.li("r7", off);
      this.ins("ADD", rd, rd, "r7");
      this.ins(op, rd, `[${rd}]`);
    }
    if (byte && ty.kind === "char" && !ty.unsigned) this.ins("SXB", rd, rd);
  }

  /** [base+off]'a sakla; ofset sığmazsa scratch'ı adres için kullanır. */
  private storeAt(rs: string, base: string, off: number, size: number, scratch?: string): void {
    if (base === "sp") off += this.depth;
    const byte = size === 1;
    const ok = byte ? off >= -32 && off <= 31 : off >= -64 && off <= 62 && !(off & 1);
    const op = byte ? "SB" : "SW";
    if (ok) return this.ins(op, rs, memOp(base, off));
    if (scratch && scratch !== base && scratch !== rs) {
      this.li(scratch, off);
      this.ins("ADD", scratch, scratch, base);
      this.ins(op, rs, `[${scratch}]`);
      return;
    }
    if (base !== "sp" && base !== rs && scratch === base && base !== "r7") {
      this.li("r7", off);
      this.ins("ADD", base, base, "r7");
      this.ins(op, rs, `[${base}]`);
      return;
    }
    throw NS;
  }

  private addrOf(l: Loc, R: string): void {
    if (l.base === "abs") return this.ins("LI", R, this.symExpr(l));
    if (l.base === "sp") {
      const off = l.off + this.depth;
      if (off >= -32 && off <= 31) return this.ins("ADDI", R, "sp", off);
      this.li(R, off);
      this.ins("ADD", R, R, "sp");
      return;
    }
    this.addImm(R, l.base, l.off, R === "r7" ? undefined : "r7");
  }

  private loadLoc(l: Loc, R: string, ty: Type): void {
    if (l.base === "abs") {
      this.ins("LI", R, this.symExpr(l));
      return this.loadAt(R, R, 0, ty);
    }
    this.loadAt(R, l.base, l.off, ty);
  }

  private storeLoc(l: Loc, V: string, size: number, A: string): void {
    if (l.base === "abs") {
      if (A === V) throw NS;
      this.ins("LI", A, this.symExpr(l));
      return this.storeAt(V, A, 0, size);
    }
    this.storeAt(V, l.base, l.off, size, A);
  }

  private loadLoc32(l: Loc, lo: string, hi: string): void {
    if (l.base === "abs") {
      this.ins("LI", hi, this.symExpr(l));
      this.ins("LW", lo, `[${hi}]`);
      this.ins("LW", hi, `[${hi}+2]`);
      return;
    }
    const off = l.base === "sp" ? l.off + this.depth : l.off;
    if (off >= -64 && off <= 60 && !(off & 1)) {
      if (l.base === lo) {
        this.ins("LW", hi, memOp(l.base, off + 2));
        this.ins("LW", lo, memOp(l.base, off));
      } else {
        this.ins("LW", lo, memOp(l.base, off));
        this.ins("LW", hi, memOp(l.base, off + 2));
      }
      return;
    }
    this.addrOf(l, hi);
    this.ins("LW", lo, `[${hi}]`);
    this.ins("LW", hi, `[${hi}+2]`);
  }

  private storeLoc32(l: Loc, lo: string, hi: string, A: string): void {
    if (l.base === "abs") {
      this.ins("LI", A, this.symExpr(l));
      this.ins("SW", lo, `[${A}]`);
      this.ins("SW", hi, `[${A}+2]`);
      return;
    }
    const off = l.base === "sp" ? l.off + this.depth : l.off;
    if (off >= -64 && off <= 60 && !(off & 1)) {
      this.ins("SW", lo, memOp(l.base, off));
      this.ins("SW", hi, memOp(l.base, off + 2));
      return;
    }
    if (A === l.base) throw NS;
    this.addrOf(l, A);
    this.ins("SW", lo, `[${A}]`);
    this.ins("SW", hi, `[${A}+2]`);
  }

  /** Kodu geçici tampona üretmeyi dener; basit değilse null. */
  private dry<R>(f: () => R): { items: Item[]; r: R } | null {
    const saved = this.out;
    this.out = [];
    try {
      const r = f();
      return { items: this.out, r };
    } catch (e) {
      if (e instanceof NotSimple) return null;
      throw e;
    } finally {
      this.out = saved;
    }
  }

  private emit(items: Item[]): void {
    for (const it of items) this.out.push(it);
  }

  private isRegVar(e: Node): string | undefined {
    if (e.kind === "var" && e.v!.reg) return e.v!.reg;
    if (e.kind === "lvval" && this.lv?.node) return this.isRegVar(this.lv.node);
    return undefined;
  }

  private lastSetsFlags(reg: string): boolean {
    const last = this.out[this.out.length - 1];
    return !!last && last.k === "ins" && FLAG_OPS.has(last.op) && last.args[0] === reg;
  }

  // ---------------------------------------------------------------- basit ifadeler

  private simpleLoc(e: Node, R: string): Loc {
    switch (e.kind) {
      case "var": {
        const v = e.v!;
        if (v.isLocal) {
          if (v.reg) throw NS;
          return { base: "sp", off: v.offset };
        }
        return { base: "abs", sym: v.sym, off: 0 };
      }
      case "member": {
        const l = this.simpleLoc(e.lhs!, R);
        return { ...l, off: l.off + e.mem!.offset };
      }
      case "deref":
        return this.simplePtr(e.lhs!, R);
      case "lvval":
        return this.lvLoc(R);
      default:
        throw NS;
    }
  }

  private lvLoc(R: string): Loc {
    const lv = this.lv;
    if (!lv) throw new Error("iç hata: lvval bağlamı yok");
    if (lv.node) return this.simpleLoc(lv.node, R);
    this.loadAt(R, "sp", -lv.slot!, T.uint);
    return { base: R, off: 0 };
  }

  /** p işaretçisinin gösterdiği bellek konumu. */
  private simplePtr(p: Node, R: string): Loc {
    p = stripNop(p);
    switch (p.kind) {
      case "var":
        if (p.ty.kind === "array") return this.simpleLoc(p, R);
        if (p.v!.reg) return { base: p.v!.reg, off: 0 };
        break;
      case "addr":
        return this.simpleLoc(p.lhs!, R);
      case "num":
        return { base: "abs", off: p.val! & 0xffff };
      case "add":
      case "sub": {
        if (p.ty.size !== 2) break;
        if (p.rhs!.kind === "num") {
          const l = this.simplePtr(p.lhs!, R);
          const c = toS16(p.rhs!.val!);
          return { ...l, off: l.off + (p.kind === "add" ? c : -c) };
        }
        if (p.kind === "add" && p.ty.kind === "ptr" && R !== "r7") {
          // dizi indeksleme: indeks R'ye, taban r7'ye
          this.loadSimple(p.rhs!, R);
          const b = this.simplePtr(p.lhs!, "r7");
          if (b.base === "sp") {
            this.ins("ADD", R, R, "sp");
            return { base: R, off: b.off + this.depth };
          }
          if (b.base === "abs") {
            this.ins("LI", "r7", this.symExpr(b));
            this.ins("ADD", R, R, "r7");
            return { base: R, off: 0 };
          }
          if (b.base === R) throw NS;
          this.ins("ADD", R, R, b.base);
          return { base: R, off: b.off };
        }
        break;
      }
    }
    this.loadSimple(p, R);
    return { base: R, off: 0 };
  }

  /** e'nin değerini R'ye yükler (16 bit ya da daha küçük; bileşik tipler için adres). */
  private loadSimple(e: Node, R: string): void {
    switch (e.kind) {
      case "num":
        if (is32(e.ty)) throw NS;
        return this.li(R, e.val!);
      case "var": {
        const v = e.v!;
        if (v.reg) return this.mov(R, v.reg);
        if (is32(e.ty)) throw NS;
        if (e.ty.kind === "func") return this.ins("LI", R, v.sym);
        const l = this.simpleLoc(e, R);
        return isAggr(e.ty) ? this.addrOf(l, R) : this.loadLoc(l, R, e.ty);
      }
      case "lvval":
      case "member":
      case "deref": {
        if (e.kind === "lvval" && this.lv?.node) return this.loadSimple(this.lv.node, R);
        if (e.ty.kind === "func") return this.loadSimple(e.lhs!, R);
        if (is32(e.ty)) throw NS;
        const l = this.simpleLoc(e, R);
        return isAggr(e.ty) ? this.addrOf(l, R) : this.loadLoc(l, R, e.ty);
      }
      case "addr": {
        const x = e.lhs!;
        if (x.kind === "var" && x.v!.isFunction) return this.ins("LI", R, x.v!.sym);
        return this.addrOf(this.simpleLoc(x, R), R);
      }
      case "cast": {
        const from = e.lhs!.ty;
        const to = e.ty;
        if (to.kind === "void" || to.kind === "bool" || is32(to)) throw NS;
        if (is32(from)) {
          const x = e.lhs!;
          if (x.kind === "num") this.li(R, x.val!);
          else if (x.kind === "var" || x.kind === "member" || x.kind === "deref" || x.kind === "lvval") {
            if (x.kind === "lvval" && this.lv?.node) {
              this.loadLoc(this.simpleLoc(this.lv.node, R), R, T.uint);
            } else this.loadLoc(this.simpleLoc(x, R), R, T.uint);
          } else throw NS;
        } else {
          this.loadSimple(e.lhs!, R);
        }
        return this.narrow(R, from, to, true);
      }
      case "add":
      case "sub": {
        if (e.rhs!.kind !== "num" || e.ty.size !== 2) throw NS;
        const c = toS16(e.kind === "add" ? e.rhs!.val! : -e.rhs!.val!);
        if (c < -32 || c > 31) throw NS;
        this.loadSimple(e.lhs!, R);
        return this.addImm(R, R, c);
      }
      case "mul":
      case "shl": {
        if (e.rhs!.kind !== "num" || e.ty.size !== 2) throw NS;
        const k = e.kind === "shl" ? e.rhs!.val! : Math.log2(e.rhs!.val!);
        if (!Number.isInteger(k) || k < 0 || k > 3) throw NS;
        this.loadSimple(e.lhs!, R);
        for (let i = 0; i < k; i++) this.ins("SHL", R, R);
        return;
      }
      case "vastart":
        return this.addrOf({ base: "sp", off: this.homeBase + 2 * e.val! }, R);
      default:
        throw NS;
    }
  }

  /** 16 bitlik bir değeri hedef tipe daralt (char / signed char). */
  private narrow(R: string, from: Type, to: Type, simple: boolean): void {
    if (to.kind !== "char") return;
    if (to.unsigned) {
      if ((from.kind === "char" && from.unsigned) || from.kind === "bool") return;
      if (simple && R === "r7") throw NS;
      const tmp = R === "r1" ? "r7" : simple ? "r7" : "r1";
      this.li(tmp, 255);
      this.ins("AND", R, R, tmp);
    } else {
      if (from.kind === "char" && !from.unsigned) return;
      this.ins("SXB", R, R);
    }
  }

  private loadSimple32(e: Node, lo: string, hi: string): void {
    switch (e.kind) {
      case "num": {
        const v = e.val! >>> 0;
        this.li(lo, v & 0xffff);
        this.li(hi, v >>> 16);
        return;
      }
      case "lvval":
      case "var":
      case "member":
      case "deref":
        if (e.kind === "lvval" && this.lv?.node) return this.loadSimple32(this.lv.node, lo, hi);
        return this.loadLoc32(this.simpleLoc(e, hi), lo, hi);
      case "cast": {
        const from = e.lhs!.ty;
        if (is32(from)) return this.loadSimple32(e.lhs!, lo, hi);
        this.loadSimple(e.lhs!, lo);
        return this.extend(lo, hi, from);
      }
      default:
        throw NS;
    }
  }

  /** lo'daki 16 bitlik değeri hi:lo'ya genişlet. */
  private extend(lo: string, hi: string, from: Type): void {
    if (isSigned(from)) {
      this.ins("SHL", hi, lo);
      this.ins("SBC", hi, hi, hi);
      this.ins("NOT", hi, hi);
    } else {
      this.li(hi, 0);
    }
  }

  private trySimple(e: Node, R: string): Item[] | null {
    if (is32(e.ty)) return null;
    return this.dry(() => this.loadSimple(e, R))?.items ?? null;
  }

  private trySimple32(e: Node, lo: string, hi: string): Item[] | null {
    return this.dry(() => this.loadSimple32(e, lo, hi))?.items ?? null;
  }

  /** lvalue'ya V (32 bitte V:V2) sakla; adres için A ve r7 kullanılabilir. */
  private storeSimple(l: Node, V: string, A: string, V2?: string): void {
    const reg = this.isRegVar(l);
    if (reg) return this.mov(reg, V);
    const loc = this.simpleLoc(l, A);
    if (is32(l.ty)) return this.storeLoc32(loc, V, V2!, A);
    this.storeLoc(loc, V, l.ty.size, A);
  }

  // ---------------------------------------------------------------- genel ifade üretimi

  /** e'yi değerlendir: sonuç r0 (32 bit: r0:r1; bileşik tip: adres). */
  private gen(e: Node): void {
    if (e.ty.kind === "void") return this.genDiscard(e);
    if (is32(e.ty)) return this.gen32(e);
    const s = this.trySimple(e, "r0");
    if (s) return this.emit(s);
    switch (e.kind) {
      case "var":
      case "member":
      case "deref":
      case "lvval": {
        if (e.ty.kind === "func") return this.gen(e.lhs!);
        const l = this.genLoc(e);
        if (isAggr(e.ty)) return this.addrOf(l, "r0");
        return this.loadLoc(l, "r0", e.ty);
      }
      case "addr":
        return this.addrOf(this.genLoc(e.lhs!), "r0");
      case "cast":
        return this.genCast(e);
      case "add": case "sub": case "mul": case "div": case "mod":
      case "band": case "bor": case "bxor": case "shl": case "shr":
        return this.genBinary(e);
      case "neg":
        this.gen(e.lhs!);
        return this.ins("NEG", "r0", "r0");
      case "bitnot":
        this.gen(e.lhs!);
        return this.ins("NOT", "r0", "r0");
      case "eq": case "ne": case "lt": case "le": case "gt": case "ge": {
        const c = this.emitCompare(e);
        this.li("r0", 1);
        this.ins(`B${c}`, "$+4");
        this.li("r0", 0);
        return;
      }
      case "not": {
        this.testZero(e.lhs!);
        this.li("r0", 1);
        this.ins("BEQ", "$+4");
        this.li("r0", 0);
        return;
      }
      case "logand":
      case "logor": {
        const f = this.label();
        const end = this.label();
        this.branch(e, f, false);
        this.li("r0", 1);
        this.jmp(end);
        this.place(f);
        this.li("r0", 0);
        this.place(end);
        return;
      }
      case "cond":
        return this.genCondExpr(e);
      case "comma":
        this.genDiscard(e.lhs!);
        return this.gen(e.rhs!);
      case "assign":
        return this.genAssign(e);
      case "opassign":
        return this.genOpAssign(e);
      case "postinc":
        return this.genPostInc(e, false);
      case "call":
        return this.genCall(e);
      default:
        this.fail(e, `İç hata: ifade üretilemedi (${e.kind})`);
    }
  }

  private gen32(e: Node): void {
    const s = this.trySimple32(e, "r0", "r1");
    if (s) return this.emit(s);
    switch (e.kind) {
      case "var":
      case "member":
      case "deref":
      case "lvval":
        return this.loadLoc32(this.genLoc(e), "r0", "r1");
      case "cast": {
        const from = e.lhs!.ty;
        if (is32(from)) return this.gen32(e.lhs!);
        this.gen(e.lhs!);
        return this.extend("r0", "r1", from);
      }
      case "add": case "sub": case "band": case "bor": case "bxor": {
        this.operands32(e.lhs!, e.rhs!);
        const [a, b] = {
          add: ["ADD", "ADC"], sub: ["SUB", "SBC"], band: ["AND", "AND"], bor: ["OR", "OR"], bxor: ["XOR", "XOR"],
        }[e.kind as "add"];
        this.ins(a, "r0", "r0", "r2");
        this.ins(b, "r1", "r1", "r3");
        return;
      }
      case "mul": case "div": case "mod": {
        this.operands32(e.lhs!, e.rhs!);
        const u = e.ty.unsigned;
        this.call(e.kind === "mul" ? "__mul32" : e.kind === "div" ? (u ? "__udiv32" : "__div32") : u ? "__umod32" : "__mod32");
        return;
      }
      case "shl":
      case "shr": {
        const kind = e.kind === "shl" ? "shl" : e.ty.unsigned ? "shr" : "sar";
        const r = e.rhs!;
        if (r.kind === "num") {
          this.gen32(e.lhs!);
          return this.shiftConst32(kind, r.val!);
        }
        const rs = this.trySimple(r, "r2");
        if (rs) {
          this.gen32(e.lhs!);
          this.emit(rs);
        } else {
          this.gen(r);
          this.push("r0");
          this.gen32(e.lhs!);
          this.pop("r2");
        }
        const [o1, o2] = kind === "shl" ? ["SHL r0, r0", "ROL r1, r1"] : kind === "shr" ? ["SHR r1, r1", "ROR r0, r0"] : ["SAR r1, r1", "ROR r0, r0"];
        this.ins("CMPI", "r2", 0);
        this.ins("BLE", "$+10");
        this.ins(o1.split(" ")[0], ...o1.slice(4).split(", "));
        this.ins(o2.split(" ")[0], ...o2.slice(4).split(", "));
        this.ins("ADDI", "r2", "r2", -1);
        this.ins("BNE", "$-6");
        return;
      }
      case "neg":
        this.gen32(e.lhs!);
        this.li("r7", 0);
        this.ins("SUB", "r0", "r7", "r0");
        this.ins("SBC", "r1", "r7", "r1");
        return;
      case "bitnot":
        this.gen32(e.lhs!);
        this.ins("NOT", "r0", "r0");
        this.ins("NOT", "r1", "r1");
        return;
      case "cond":
        return this.genCondExpr(e);
      case "comma":
        this.genDiscard(e.lhs!);
        return this.gen32(e.rhs!);
      case "assign":
        return this.genAssign(e);
      case "opassign":
        return this.genOpAssign(e);
      case "postinc":
        return this.genPostInc(e, false);
      case "call":
        return this.genCall(e);
      default:
        this.fail(e, `İç hata: 32 bit ifade üretilemedi (${e.kind})`);
    }
  }

  private shiftConst32(kind: "shl" | "shr" | "sar", n: number): void {
    if (n <= 0) return;
    if (n >= 32) {
      if (kind === "sar") {
        this.ins("SHL", "r1", "r1");
        this.ins("SBC", "r1", "r1", "r1");
        this.ins("NOT", "r1", "r1");
        this.mov("r0", "r1");
      } else {
        this.li("r0", 0);
        this.li("r1", 0);
      }
      return;
    }
    if (n >= 16) {
      if (kind === "shl") {
        this.mov("r1", "r0");
        this.li("r0", 0);
        for (let i = 16; i < n; i++) this.ins("SHL", "r1", "r1");
      } else {
        this.mov("r0", "r1");
        if (kind === "shr") this.li("r1", 0);
        else {
          this.ins("SHL", "r1", "r1");
          this.ins("SBC", "r1", "r1", "r1");
          this.ins("NOT", "r1", "r1");
        }
        for (let i = 16; i < n; i++) this.ins(kind === "shr" ? "SHR" : "SAR", "r0", "r0");
      }
      return;
    }
    for (let i = 0; i < n; i++) {
      if (kind === "shl") {
        this.ins("SHL", "r0", "r0");
        this.ins("ROL", "r1", "r1");
      } else {
        this.ins(kind === "shr" ? "SHR" : "SAR", "r1", "r1");
        this.ins("ROR", "r0", "r0");
      }
    }
  }

  /** 32 bitlik işlenenler: l → r0:r1, r → r2:r3. */
  private operands32(l: Node, r: Node): void {
    const rs = this.trySimple32(r, "r2", "r3");
    if (rs) {
      this.gen32(l);
      return this.emit(rs);
    }
    const ls = this.trySimple32(l, "r0", "r1");
    if (ls) {
      this.gen32(r);
      this.mov("r2", "r0");
      this.mov("r3", "r1");
      return this.emit(ls);
    }
    this.gen32(l);
    this.push("r1");
    this.push("r0");
    this.gen32(r);
    this.mov("r2", "r0");
    this.mov("r3", "r1");
    this.pop("r0");
    this.pop("r1");
  }

  /** Genel lvalue konumu; base "r0" ise adres r0'da. */
  private genLoc(e: Node): Loc {
    const s = this.dry(() => this.simpleLoc(e, "r0"));
    if (s) {
      this.emit(s.items);
      return s.r;
    }
    switch (e.kind) {
      case "member": {
        const l = this.genLoc(e.lhs!);
        return { ...l, off: l.off + e.mem!.offset };
      }
      case "deref":
        return this.genPtrLoc(e.lhs!);
      default:
        // struct değerli çağrı / koşul / atama: değer = adres
        this.gen(e);
        return { base: "r0", off: 0 };
    }
  }

  private genPtrLoc(p: Node): Loc {
    const s = this.dry(() => this.simplePtr(p, "r0"));
    if (s) {
      this.emit(s.items);
      return s.r;
    }
    p = stripNop(p);
    if ((p.kind === "add" || p.kind === "sub") && p.rhs!.kind === "num" && p.ty.size === 2) {
      const l = this.genPtrLoc(p.lhs!);
      const c = toS16(p.rhs!.val!);
      return { ...l, off: l.off + (p.kind === "add" ? c : -c) };
    }
    this.gen(p);
    return { base: "r0", off: 0 };
  }

  private genAddr(e: Node): void {
    this.addrOf(this.genLoc(e), "r0");
  }

  private genCast(e: Node): void {
    const from = e.lhs!.ty;
    const to = e.ty;
    if (to.kind === "void") return this.genDiscard(e.lhs!);
    if (to.kind === "bool") {
      this.testZero(e.lhs!);
      this.li("r0", 1);
      this.ins("BNE", "$+4");
      this.li("r0", 0);
      return;
    }
    if (is32(from)) this.gen32(e.lhs!);
    else this.gen(e.lhs!);
    this.narrow("r0", from, to, false);
  }

  /** e'yi değerlendirip Z bayrağını (e == 0) ayarla. */
  private testZero(e: Node): void {
    if (is32(e.ty)) {
      this.gen32(e);
      this.ins("OR", "r0", "r0", "r1");
      return;
    }
    const reg = this.operandReg(e);
    if (!this.lastSetsFlags(reg)) this.ins("CMPI", reg, 0);
  }

  /** e'nin değerini bir register'da üret (register değişkeniyse kopyalamadan). */
  private operandReg(e: Node): string {
    const reg = this.isRegVar(e);
    if (reg) return reg;
    this.gen(e);
    return "r0";
  }

  /** İkili işlem işlenenleri. fixed: l → r0, r → r1 (yardımcı fonksiyonlar için). */
  private binOperands(l: Node, r: Node, fixed: boolean): [string, string] {
    if (!fixed) {
      const rreg = this.isRegVar(r);
      if (rreg) return [this.operandReg(l), rreg];
      const rs = this.trySimple(r, "r1");
      if (rs) {
        const lr = this.operandReg(l);
        this.emit(rs);
        return [lr, "r1"];
      }
      const lreg = this.isRegVar(l);
      if (lreg) {
        this.gen(r);
        return [lreg, "r0"];
      }
      const ls = this.trySimple(l, "r1");
      if (ls) {
        this.gen(r);
        this.emit(ls);
        return ["r1", "r0"];
      }
      this.gen(l);
      this.push("r0");
      this.gen(r);
      this.pop("r1");
      return ["r1", "r0"];
    }
    const rs = this.trySimple(r, "r1");
    if (rs) {
      this.gen(l);
      this.emit(rs);
      return ["r0", "r1"];
    }
    const ls = this.trySimple(l, "r0");
    if (ls) {
      this.gen(r);
      this.mov("r1", "r0");
      this.emit(ls);
      return ["r0", "r1"];
    }
    this.gen(l);
    this.push("r0");
    this.gen(r);
    this.mov("r1", "r0");
    this.pop("r0");
    return ["r0", "r1"];
  }

  private genBinary(e: Node): void {
    const l = e.lhs!;
    const r = e.rhs!;
    const kind = e.kind;
    const uns = e.ty.unsigned;
    if (r.kind === "num") {
      const c = r.val! & 0xffff;
      switch (kind) {
        case "add":
        case "sub": {
          const k = kind === "add" ? c : -c;
          this.gen(l);
          if (toS16(k) >= -32 && toS16(k) <= 31) return this.addImm("r0", "r0", k);
          this.li("r1", k);
          this.ins("ADD", "r0", "r0", "r1");
          return;
        }
        case "shl":
        case "shr": {
          this.gen(l);
          const n = r.val!;
          if (n <= 0) return;
          if (n >= 16) {
            if (kind === "shr" && !uns) {
              for (let i = 0; i < 15; i++) this.ins("SAR", "r0", "r0");
            } else this.li("r0", 0);
            return;
          }
          const op = kind === "shl" ? "SHL" : uns ? "SHR" : "SAR";
          for (let i = 0; i < n; i++) this.ins(op, "r0", "r0");
          return;
        }
        case "mul":
          if (this.mulConst(l, c)) return;
          break;
        case "div":
        case "mod": {
          const k = Math.log2(c);
          if (c !== 0 && Number.isInteger(k)) {
            if (uns) {
              this.gen(l);
              if (kind === "div") for (let i = 0; i < k; i++) this.ins("SHR", "r0", "r0");
              else {
                this.li("r1", c - 1);
                this.ins("AND", "r0", "r0", "r1");
              }
              return;
            }
            if (kind === "div" && (e.exact || c - 1 <= 31)) {
              this.gen(l);
              if (!e.exact && c > 1) {
                // işaretli: negatifse (2^k - 1) ekle, sonra aritmetik kaydır (sıfıra doğru yuvarlama)
                this.ins("CMPI", "r0", 0);
                this.ins("BGE", "$+4");
                this.ins("ADDI", "r0", "r0", c - 1);
              }
              for (let i = 0; i < k; i++) this.ins("SAR", "r0", "r0");
              return;
            }
          }
          break;
        }
      }
    }
    const helper = { mul: "__mul16", div: uns ? "__udiv16" : "__div16", mod: uns ? "__umod16" : "__mod16" }[kind as "mul"];
    if (kind === "mul" || kind === "div" || kind === "mod") {
      this.binOperands(l, r, true);
      this.call(helper);
      return;
    }
    if (kind === "shl" || kind === "shr") {
      this.binOperands(l, r, true);
      const op = kind === "shl" ? "SHL" : uns ? "SHR" : "SAR";
      this.ins("CMPI", "r1", 0);
      this.ins("BLE", "$+8");
      this.ins(op, "r0", "r0");
      this.ins("ADDI", "r1", "r1", -1);
      this.ins("BNE", "$-4");
      return;
    }
    const op = { add: "ADD", sub: "SUB", band: "AND", bor: "OR", bxor: "XOR" }[kind as "add"];
    if (r.kind === "num" && op !== "ADD" && op !== "SUB") {
      this.gen(l);
      this.li("r1", r.val!);
      this.ins(op, "r0", "r0", "r1");
      return;
    }
    const [a, b] = this.binOperands(l, r, false);
    this.ins(op, "r0", a, b);
  }

  /** Sabitle çarpma: kaydır-topla. Uygunsa true. */
  private mulConst(l: Node, c: number): boolean {
    if (c === 0) {
      this.genDiscard(l);
      this.li("r0", 0);
      return true;
    }
    const bits: number[] = [];
    for (let i = 0; i < 16; i++) if (c & (1 << i)) bits.push(i);
    if (bits.length === 1) {
      this.gen(l);
      for (let i = 0; i < bits[0]; i++) this.ins("SHL", "r0", "r0");
      return true;
    }
    if (bits.length === 2 && bits[1] <= 8) {
      this.gen(l);
      for (let i = 0; i < bits[0]; i++) this.ins("SHL", "r0", "r0");
      this.mov("r1", "r0");
      for (let i = bits[0]; i < bits[1]; i++) this.ins("SHL", "r1", "r1");
      this.ins("ADD", "r0", "r0", "r1");
      return true;
    }
    // 2^k - 1
    const k = Math.log2(c + 1);
    if (Number.isInteger(k) && k <= 8) {
      this.gen(l);
      this.mov("r1", "r0");
      for (let i = 0; i < k; i++) this.ins("SHL", "r0", "r0");
      this.ins("SUB", "r0", "r0", "r1");
      return true;
    }
    return false;
  }

  // ---------------------------------------------------------------- karşılaştırma ve dallanma

  /** Bayrakları ayarlar, doğru olduğunda dallanılacak koşulu döner (EQ, LT, HI ...). */
  private emitCompare(e: Node): string {
    let kind = e.kind;
    let l = e.lhs!;
    let r = e.rhs!;
    const ty = l.ty;
    const uns = ty.unsigned || ty.kind === "ptr";
    const cond = (k: string) =>
      ({
        eq: "EQ", ne: "NE",
        lt: uns ? "CC" : "LT", le: uns ? "LS" : "LE", gt: uns ? "HI" : "GT", ge: uns ? "CS" : "GE",
      })[k]!;
    if (is32(ty)) {
      if (kind === "eq" || kind === "ne") {
        if (r.kind === "num" && r.val === 0) {
          this.gen32(l);
          this.ins("OR", "r0", "r0", "r1");
        } else {
          this.operands32(l, r);
          this.ins("XOR", "r0", "r0", "r2");
          this.ins("XOR", "r1", "r1", "r3");
          this.ins("OR", "r0", "r0", "r1");
        }
        return cond(kind);
      }
      if (kind === "gt" || kind === "le") {
        [l, r] = [r, l];
        kind = kind === "gt" ? "lt" : "ge";
      }
      this.operands32(l, r);
      this.ins("SUB", "r7", "r0", "r2");
      this.ins("SBC", "r7", "r1", "r3");
      return kind === "lt" ? (uns ? "CC" : "LT") : uns ? "CS" : "GE";
    }
    const fits = (n: Node) => n.kind === "num" && ((n.val! & 0xffff) <= 255 || (n.val! & 0xffff) >= 0xff00);
    const imm = (n: Node) => {
      const v = n.val! & 0xffff;
      return v <= 255 ? v : v - 0x10000;
    };
    if (fits(l) && !fits(r)) {
      [l, r] = [r, l];
      kind = ({ lt: "gt", gt: "lt", le: "ge", ge: "le" } as Record<string, typeof kind>)[kind] ?? kind;
    }
    if (fits(r)) {
      const reg = this.operandReg(l);
      if (imm(r) === 0 && (kind === "eq" || kind === "ne") && this.lastSetsFlags(reg)) return cond(kind);
      this.ins("CMPI", reg, imm(r));
      return cond(kind);
    }
    const [a, b] = this.binOperands(l, r, false);
    this.ins("CMP", a, b);
    return cond(kind);
  }

  /** e doğruysa (whenTrue) / yanlışsa target'a dallan. */
  private branch(e: Node, target: string, whenTrue: boolean): void {
    switch (e.kind) {
      case "num":
        if ((e.val !== 0) === whenTrue) this.jmp(target);
        return;
      case "not":
        return this.branch(e.lhs!, target, !whenTrue);
      case "logand":
      case "logor": {
        const and = e.kind === "logand";
        if (and !== whenTrue) {
          // and+false / or+true: iki taraf da aynı hedefe
          this.branch(e.lhs!, target, whenTrue);
          this.branch(e.rhs!, target, whenTrue);
          return;
        }
        const skip = this.label();
        this.branch(e.lhs!, skip, !whenTrue);
        this.branch(e.rhs!, target, whenTrue);
        this.place(skip);
        return;
      }
      case "eq": case "ne": case "lt": case "le": case "gt": case "ge": {
        const c = this.emitCompare(e);
        this.br(whenTrue ? c : INVERT[c], target);
        return;
      }
      case "cast":
        if (e.ty.kind !== "bool" && e.ty.size >= e.lhs!.ty.size) return this.branch(e.lhs!, target, whenTrue);
        break;
    }
    this.testZero(e);
    this.br(whenTrue ? "NE" : "EQ", target);
  }

  private genCondExpr(e: Node): void {
    const els = this.label();
    const end = this.label();
    this.branch(e.cond!, els, false);
    this.gen(e.then!);
    this.jmp(end);
    this.place(els);
    this.gen(e.els!);
    this.place(end);
  }

  // ---------------------------------------------------------------- atamalar

  private copyStruct(size: number): void {
    // hedef r1, kaynak r0; sonuç r0 = hedef
    if (size <= 16) {
      for (let k = 0; k < size; k += 2) {
        this.ins("LW", "r2", memOp("r0", k));
        this.ins("SW", "r2", memOp("r1", k));
      }
      this.mov("r0", "r1");
      return;
    }
    this.mov("r2", "r0");
    this.mov("r0", "r1");
    this.mov("r1", "r2");
    this.li("r2", size);
    this.call("__copyw");
  }

  private genAssign(e: Node): void {
    const l = e.lhs!;
    const r = e.rhs!;
    if (isStructLike(l.ty)) {
      const d = this.dry(() => this.addrOf(this.simpleLoc(l, "r1"), "r1"));
      if (d) {
        this.gen(r);
        this.emit(d.items);
      } else {
        this.genAddr(l);
        this.push("r0");
        this.gen(r);
        this.pop("r1");
      }
      return this.copyStruct(l.ty.size);
    }
    const wide = is32(l.ty);
    const reg = this.isRegVar(l);
    if (reg) {
      this.gen(r);
      return this.mov(reg, "r0");
    }
    const st = this.dry(() => (wide ? this.storeSimple(l, "r0", "r2", "r1") : this.storeSimple(l, "r0", "r1")));
    if (st) {
      if (wide) this.gen32(r);
      else this.gen(r);
      return this.emit(st.items);
    }
    const loc = this.genLoc(l);
    if (loc.base !== "r0") {
      if (wide) {
        this.gen32(r);
        return this.storeLoc32(loc, "r0", "r1", "r2");
      }
      this.gen(r);
      return this.storeLoc(loc, "r0", l.ty.size, "r1");
    }
    if (!wide) {
      const rs = this.trySimple(r, "r1");
      if (rs) {
        this.emit(rs);
        this.storeLoc(loc, "r1", l.ty.size, "r2");
        return this.mov("r0", "r1");
      }
    }
    this.push("r0");
    if (wide) this.gen32(r);
    else this.gen(r);
    this.pop("r2");
    if (wide) this.storeLoc32({ ...loc, base: "r2" }, "r0", "r1", "r3");
    else this.storeLoc({ ...loc, base: "r2" }, "r0", l.ty.size, "r1");
  }

  /** x op= y: rhs, lhs'nin mevcut değerini "lvval" düğümüyle okur. */
  private genOpAssign(e: Node): void {
    const l = e.lhs!;
    const saved = this.lv;
    try {
      const reg = this.isRegVar(l);
      if (reg) {
        const k = this.constAddend(e.rhs!);
        if (k !== undefined && k >= -32 && k <= 31) {
          this.ins("ADDI", reg, reg, k);
          this.mov("r0", reg);
          return;
        }
        this.lv = { node: l };
        this.gen(e.rhs!);
        this.mov(reg, "r0");
        return;
      }
      const wide = is32(l.ty);
      const simple = this.dry(() => (wide ? this.storeSimple(l, "r0", "r2", "r1") : this.storeSimple(l, "r0", "r1")));
      if (simple) {
        this.lv = { node: l };
        if (wide) {
          this.gen32(e.rhs!);
          this.storeSimple(l, "r0", "r2", "r1");
        } else {
          this.gen(e.rhs!);
          this.storeSimple(l, "r0", "r1");
        }
        return;
      }
      this.genAddr(l);
      this.push("r0");
      this.lv = { slot: this.depth };
      if (wide) this.gen32(e.rhs!);
      else this.gen(e.rhs!);
      this.pop("r2");
      if (wide) this.storeLoc32({ base: "r2", off: 0 }, "r0", "r1", "r3");
      else this.storeAt("r0", "r2", 0, l.ty.size);
    } finally {
      this.lv = saved;
    }
  }

  /** rhs = (cast)(lvval ± sabit) biçimindeyse sabiti döner. */
  private constAddend(rhs: Node): number | undefined {
    let e = rhs;
    if (e.kind === "cast" && e.ty.size === e.lhs!.ty.size) e = e.lhs!;
    if ((e.kind !== "add" && e.kind !== "sub") || e.rhs!.kind !== "num") return undefined;
    let x = e.lhs!;
    if (x.kind === "cast" && x.ty.size === x.lhs!.ty.size) x = x.lhs!;
    if (x.kind !== "lvval") return undefined;
    const c = toS16(e.rhs!.val!);
    return e.kind === "add" ? c : -c;
  }

  private genPostInc(e: Node, discard: boolean): void {
    const l = e.lhs!;
    const d = e.val!;
    const reg = this.isRegVar(l);
    if (reg) {
      if (!discard) this.mov("r0", reg);
      this.addImm(reg, reg, d, "r7");
      return;
    }
    if (is32(l.ty)) {
      this.genAddr(l);
      this.mov("r2", "r0");
      this.ins("LW", "r0", "[r2]");
      this.ins("LW", "r1", "[r2+2]");
      this.li("r3", d & 0xffff);
      this.ins("ADD", "r3", "r0", "r3");
      this.ins("SW", "r3", "[r2]");
      this.li("r3", d < 0 ? 0xffff : 0);
      this.ins("ADC", "r3", "r1", "r3");
      this.ins("SW", "r3", "[r2+2]");
      return;
    }
    const size = l.ty.size;
    const s = this.dry(() => this.simpleLoc(l, "r2"));
    if (s) {
      this.emit(s.items);
      const loc = s.r;
      this.loadLoc(loc, "r0", l.ty);
      const v = discard ? "r0" : "r1";
      this.addImm(v, "r0", d, "r7");
      this.storeLoc(loc, v, size, loc.base === "r2" ? "r3" : "r2");
      return;
    }
    this.genAddr(l);
    this.mov("r2", "r0");
    this.loadAt("r0", "r2", 0, l.ty);
    this.addImm("r1", "r0", d, "r7");
    this.storeAt("r1", "r2", 0, size);
  }

  /** Değeri kullanılmayan ifade. */
  private genDiscard(e: Node): void {
    switch (e.kind) {
      case "postinc":
        return this.genPostInc(e, true);
      case "comma":
        this.genDiscard(e.lhs!);
        return this.genDiscard(e.rhs!);
      case "cast":
        return this.genDiscard(e.lhs!);
      case "num":
        return;
      case "var":
        if (!e.v!.isVolatile && !e.ty.isVolatile) return;
        break;
      case "cond": {
        const els = this.label();
        const end = this.label();
        this.branch(e.cond!, els, false);
        this.genDiscard(e.then!);
        this.jmp(end);
        this.place(els);
        this.genDiscard(e.els!);
        this.place(end);
        return;
      }
      case "call":
        return this.genCall(e);
      case "block":
        // bileşik sabitin başlatma deyimleri (ifade içinde)
        return this.stmt(e);
    }
    if (e.ty.kind === "void") this.fail(e, `İç hata: void ifade (${e.kind})`);
    if (is32(e.ty)) this.gen32(e);
    else this.gen(e);
  }

  // ---------------------------------------------------------------- çağrılar

  private genCall(e: Node): void {
    const args = e.args!;
    interface ArgW {
      node?: Node;
      word: number;
      words: number;
    }
    const list: ArgW[] = [];
    let w = 0;
    if (e.retBuf) list.push({ word: w++, words: 1 });
    for (const a of args) {
      const n = wordsOf(a.ty);
      list.push({ node: a, word: w, words: n });
      w += n;
    }
    const W = w;
    let direct: string | undefined;
    let fnExpr: Node | undefined;
    const fn = e.fn!;
    if (fn.kind === "var" && fn.v!.isFunction) direct = fn.v!.sym;
    else if (fn.kind === "addr" && fn.lhs!.kind === "var" && fn.lhs!.v!.isFunction) direct = fn.lhs!.v!.sym;
    else if (fn.kind === "deref" && fn.ty.kind === "func") fnExpr = fn.lhs!;
    else fnExpr = fn;
    if (fnExpr && fnExpr.kind === "var" && fnExpr.v!.isFunction) {
      direct = fnExpr.v!.sym;
      fnExpr = undefined;
    }
    const retLoc: Loc | undefined = e.retBuf ? { base: "sp", off: e.retBuf.offset } : undefined;
    const emitCall = () => {
      if (direct) this.call(direct);
      else this.ins("JALR", "r7", "r7", 0);
    };

    if (W <= 4 && list.every((a) => !a.node || !isStructLike(a.node.ty))) {
      const items: (Item[] | null)[] = list.map((a) => {
        const r = `r${a.word}`;
        if (!a.node) return this.dry(() => this.addrOf(retLoc!, r))!.items;
        return a.words === 2 ? this.trySimple32(a.node, r, `r${a.word + 1}`) : this.trySimple(a.node, r);
      });
      const complex = list.filter((_, i) => !items[i]);
      const fnItems = fnExpr ? this.trySimple(fnExpr, "r7") : [];
      if (complex.length <= 1 && fnItems) {
        if (complex.length === 1) {
          const c = complex[0];
          if (c.words === 2) {
            this.gen32(c.node!);
            if (c.word === 1) {
              this.mov("r2", "r1");
              this.mov("r1", "r0");
            } else if (c.word === 2) {
              this.mov("r3", "r1");
              this.mov("r2", "r0");
            }
          } else {
            this.gen(c.node!);
            this.mov(`r${c.word}`, "r0");
          }
        }
        items.forEach((it) => it && this.emit(it));
        this.emit(fnItems);
        emitCall();
        return;
      }
    }

    // genel yol: argüman alanını yığında ayır, soldan sağa doldur, ilk 4 kelimeyi register'lara al
    let fnSlot = 0;
    if (fnExpr) {
      this.gen(fnExpr);
      this.push("r0");
      fnSlot = this.depth;
    }
    this.addSp(-2 * W);
    this.depth += 2 * W;
    const area = this.depth;
    for (const a of list) {
      const off = -area + 2 * a.word;
      if (!a.node) {
        this.addrOf(retLoc!, "r0");
        this.storeAt("r0", "sp", off, 2, "r1");
      } else if (isStructLike(a.node.ty)) {
        this.gen(a.node);
        this.addrOf({ base: "sp", off }, "r1");
        this.copyStruct(a.node.ty.size);
      } else if (a.words === 2) {
        this.gen32(a.node);
        this.storeAt("r0", "sp", off, 2, "r2");
        this.storeAt("r1", "sp", off + 2, 2, "r2");
      } else {
        this.gen(a.node);
        this.storeAt("r0", "sp", off, 2, "r1");
      }
    }
    const nreg = Math.min(W, 4);
    for (let i = 0; i < nreg; i++) this.pop(`r${i}`);
    if (fnExpr) this.loadAt("r7", "sp", -fnSlot, T.uint);
    emitCall();
    const cleanup = 2 * Math.max(0, W - 4) + (fnExpr ? 2 : 0);
    this.addSp(cleanup);
    this.depth -= cleanup;
  }

  // ---------------------------------------------------------------- deyimler

  private stmt(s: Node): void {
    switch (s.kind) {
      case "block":
        for (const x of s.stmts!) this.stmt(x);
        return;
      case "expr":
        return this.genDiscard(s.lhs!);
      case "null":
        return;
      case "return": {
        if (s.lhs) {
          const t = this.fn.ty.ret!;
          if (isStructLike(t)) {
            this.gen(s.lhs);
            const rp = this.fn.retPtr!;
            if (rp.reg) this.mov("r1", rp.reg);
            else this.loadAt("r1", "sp", rp.offset, T.uint);
            this.copyStruct(t.size);
          } else if (is32(t)) this.gen32(s.lhs);
          else this.gen(s.lhs);
        }
        this.jmp(this.retLabel);
        return;
      }
      case "if": {
        const els = this.label();
        this.branch(s.cond!, els, false);
        this.stmt(s.then!);
        if (s.els) {
          const end = this.label();
          this.jmp(end);
          this.place(els);
          this.stmt(s.els);
          this.place(end);
        } else {
          this.place(els);
        }
        return;
      }
      case "for": {
        if (s.init) this.stmt(s.init);
        const top = this.label();
        const test = this.label();
        if (s.cond) this.jmp(test);
        this.place(top);
        this.stmt(s.then!);
        this.place(s.cont!);
        if (s.inc) this.genDiscard(s.inc);
        if (s.cond) {
          this.place(test);
          this.branch(s.cond, top, true);
        } else {
          this.jmp(top);
        }
        this.place(s.brk!);
        return;
      }
      case "do": {
        const top = this.label();
        this.place(top);
        this.stmt(s.then!);
        this.place(s.cont!);
        this.branch(s.cond!, top, true);
        this.place(s.brk!);
        return;
      }
      case "switch":
        return this.genSwitch(s);
      case "case":
        this.place(s.label!);
        return this.stmt(s.then!);
      case "break":
      case "continue":
      case "goto":
        return this.jmp(s.label!);
      case "label":
        this.place(s.label!);
        return this.stmt(s.then!);
      case "memzero": {
        const v = s.v!;
        const n = Math.ceil(v.ty.size / 2) * 2;
        if (n <= 12) {
          this.li("r0", 0);
          for (let k = 0; k < n; k += 2) this.storeAt("r0", "sp", v.offset + k, 2, "r1");
        } else {
          this.addrOf({ base: "sp", off: v.offset }, "r0");
          this.li("r1", n);
          this.call("__zerow");
        }
        return;
      }
      case "strinit":
        return this.genStrInit(s);
      default:
        this.fail(s, `İç hata: deyim üretilemedi (${s.kind})`);
    }
  }

  private isEven(e: Node): boolean {
    if (e.kind === "var") return e.v!.isLocal || e.ty.align >= 2;
    if (e.kind === "member") return this.isEven(e.lhs!) && !(e.mem!.offset & 1);
    if (e.kind === "deref") {
      let p = stripNop(e.lhs!);
      let off = 0;
      while (p.kind === "add" && p.rhs!.kind === "num") {
        off += p.rhs!.val!;
        p = stripNop(p.lhs!);
      }
      if (off & 1) return false;
      if (p.kind === "var" && p.ty.kind === "array") return this.isEven(p);
      return false;
    }
    return false;
  }

  private genStrInit(s: Node): void {
    const n = s.val!;
    this.genAddr(s.lhs!);
    this.ins("LI", "r1", s.str!.sym);
    const even = this.isEven(s.lhs!);
    if (!even || ((n & 1) && n - 1 > 31)) {
      this.li("r2", n);
      this.call("__copyb");
      return;
    }
    if (n & 1) {
      this.ins("LBU", "r2", memOp("r1", n - 1));
      this.ins("SB", "r2", memOp("r0", n - 1));
    }
    const words = n >> 1;
    if (words * 2 <= 12) {
      for (let k = 0; k < words * 2; k += 2) {
        this.ins("LW", "r2", memOp("r1", k));
        this.ins("SW", "r2", memOp("r0", k));
      }
    } else {
      this.li("r2", words * 2);
      this.call("__copyw");
    }
  }

  private genSwitch(s: Node): void {
    const cases = [...s.cases!].sort((a, b) => a.val - b.val);
    const deflt = s.defLabel ?? s.brk!;
    const wide = is32(s.cond!.ty);
    if (wide) {
      this.gen32(s.cond!);
      for (const c of cases) {
        const next = this.label();
        const v = c.val >>> 0;
        this.li("r2", v & 0xffff);
        this.ins("CMP", "r0", "r2");
        this.br("NE", next);
        this.li("r3", v >>> 16);
        this.ins("CMP", "r1", "r3");
        this.br("EQ", c.label);
        this.place(next);
      }
      this.jmp(deflt);
    } else {
      this.gen(s.cond!);
      const vals = cases.map((c) => (s.cond!.ty.unsigned ? c.val & 0xffff : toS16(c.val)));
      const min = vals[0];
      const range = cases.length ? vals[vals.length - 1] - min + 1 : 0;
      if (cases.length >= 5 && range <= 3 * cases.length + 4) {
        // atlama tablosu
        this.addImm("r0", "r0", -min, "r7");
        if (range - 1 <= 255) this.ins("CMPI", "r0", range - 1);
        else {
          this.li("r1", range - 1);
          this.ins("CMP", "r0", "r1");
        }
        this.br("HI", deflt);
        this.ins("SHL", "r0", "r0");
        const table = this.label();
        this.ins("LI", "r7", table);
        this.ins("ADD", "r7", "r7", "r0");
        this.ins("LW", "r7", "[r7]");
        this.ins("JALR", "r7", "r7", 0);
        this.place(table);
        const byVal = new Map(cases.map((c, i) => [vals[i], c.label]));
        for (let i = 0; i < range; i++) this.out.push({ k: "word", expr: byVal.get(min + i) ?? deflt });
      } else {
        cases.forEach((c, i) => {
          const v = vals[i] & 0xffff;
          if (v <= 255 || v >= 0xff00) this.ins("CMPI", "r0", v <= 255 ? v : v - 0x10000);
          else {
            this.li("r1", v);
            this.ins("CMP", "r0", "r1");
          }
          this.br("EQ", c.label);
        });
        this.jmp(deflt);
      }
    }
    this.stmt(s.then!);
    this.place(s.brk!);
  }

  // ---------------------------------------------------------------- fonksiyon

  run(): Item[] {
    const fn = this.fn;
    // register değişkenleri
    const saved: string[] = [];
    if (this.opts.optimize) {
      const cands = fn.locals
        .filter((v) => isWord(v.ty) && v.ty.size === 2 && !v.addrTaken && !v.isVolatile && !v.ty.isVolatile && v.weight >= 3)
        .sort((a, b) => b.weight - a.weight)
        .slice(0, 2);
      cands.forEach((v, i) => {
        v.reg = i === 0 ? "r4" : "r5";
        saved.push(v.reg);
      });
    }
    const totalWords = fn.params.reduce((n, p) => Math.max(n, p.paramWord + wordsOf(p.ty)), 0);
    const variadic = !!fn.ty.variadic;
    const needHome = variadic || fn.params.some((p) => !p.reg && p.paramWord < 4);
    this.homeWords = variadic ? 4 : needHome ? Math.min(4, totalWords) : 0;
    // yerel değişkenlerin çerçeve ofsetleri
    const locals = fn.locals.filter((v) => !v.isParam && !v.reg);
    const scalar = (v: Var) => !isAggr(v.ty);
    locals.sort((a, b) => (scalar(a) === scalar(b) ? (scalar(a) ? b.weight - a.weight : 0) : scalar(a) ? -1 : 1));
    let off = 0;
    for (const v of locals) {
      v.offset = off;
      off += Math.max(2, Math.ceil(v.ty.size / 2) * 2);
    }
    const frameSize = off;
    const A = frameSize + 2 * saved.length + 2;
    this.homeBase = A;
    for (const p of fn.params) {
      p.offset = p.paramWord < this.homeWords ? A + 2 * p.paramWord : A + 2 * this.homeWords + 2 * (p.paramWord - 4);
    }
    this.retLabel = this.label();

    // prolog
    this.place(fn.sym);
    for (let i = this.homeWords - 1; i >= 0; i--) this.ins("PUSH", `r${i}`);
    this.ins("PUSH", "r7");
    for (const r of saved) this.ins("PUSH", r);
    this.addSp(-frameSize);
    for (const p of fn.params) {
      if (!p.reg) continue;
      if (p.paramWord < 4) this.mov(p.reg, `r${p.paramWord}`);
      else this.loadAt(p.reg, "sp", p.offset, T.uint);
    }
    this.stmt(fn.body);
    if (fn.name === "main" && fn.ty.ret!.kind !== "void") this.li("r0", 0); // main'in sonu: return 0
    // epilog
    this.place(this.retLabel);
    this.addSp(frameSize);
    for (const r of [...saved].reverse()) this.ins("POP", r);
    this.ins("POP", "r7");
    if (this.homeWords) this.addImm("sp", "sp", 2 * this.homeWords);
    this.ins("RET");
    if (this.depth !== 0) throw new Error(`iç hata: ${fn.name} yığın dengesi ${this.depth}`);
    return this.opts.optimize ? peephole(this.out) : this.out;
  }
}

// ---------------------------------------------------------------- gözetleme deliği iyileştirmeleri

function peephole(items: Item[]): Item[] {
  let out = items;
  for (let pass = 0; pass < 4; pass++) {
    let changed = false;
    const next: Item[] = [];
    for (let i = 0; i < out.length; i++) {
      const it = out[i];
      const nx = out[i + 1];
      // jmp L ; L:  → sil
      if (it.k === "jmp") {
        let j = i + 1;
        let hit = false;
        while (j < out.length && out[j].k === "label") {
          if ((out[j] as { name: string }).name === it.target) hit = true;
          j++;
        }
        if (hit) {
          changed = true;
          continue;
        }
      }
      // br c L1 ; jmp L2 ; L1:  →  br !c L2 ; L1:
      if (it.k === "br" && nx?.k === "jmp" && out[i + 2]?.k === "label" && (out[i + 2] as { name: string }).name === it.target) {
        next.push({ k: "br", cond: INVERT[it.cond], target: nx.target });
        i++;
        changed = true;
        continue;
      }
      if (it.k === "ins" && nx?.k === "ins") {
        // PUSH a ; POP b  →  MOV b, a
        if (it.op === "PUSH" && nx.op === "POP") {
          if (it.args[0] !== nx.args[0]) next.push({ k: "ins", op: "MOV", args: [nx.args[0], it.args[0]] });
          i++;
          changed = true;
          continue;
        }
        // SW a, [sp+n] ; LW a, [sp+n]  →  SW
        if (it.op === "SW" && nx.op === "LW" && it.args[0] === nx.args[0] && it.args[1] === nx.args[1] && it.args[1].startsWith("[sp")) {
          next.push(it);
          i++;
          changed = true;
          continue;
        }
      }
      if (it.k === "ins" && it.op === "MOV" && it.args[0] === it.args[1]) {
        changed = true;
        continue;
      }
      // koşulsuz atlamadan sonraki ulaşılmaz komutlar
      if ((it.k === "jmp" || (it.k === "ins" && it.op === "RET")) && nx && (nx.k === "ins" || nx.k === "jmp" || nx.k === "br" || nx.k === "call")) {
        next.push(it);
        let j = i + 1;
        while (j < out.length && out[j].k !== "label" && out[j].k !== "word") j++;
        i = j - 1;
        changed = true;
        continue;
      }
      next.push(it);
    }
    out = next;
    if (!changed) break;
  }
  return dropRedundantLoads(out);
}

/**
 * Register içeriği bilgisi: register'ın değerine eşit olduğu bilinen kaynaklar
 * ("LI 5", "LI _x", "LW [sp+4]", "LBU [sp+2]") ve değerin 0..255 olup olmadığı.
 */
interface Known {
  keys: Set<string>;
  byte: boolean;
}

const WRITES_RD = new Set([...FLAG_OPS, "LW", "LBU", "LI", "LUI", "POP"]);
const NO_WRITE = new Set(["CMP", "CMPI", "SW", "SB", "PUSH", "NOP", "EI", "DI", "HALT"]);

const regName = (r: string) => (r === "r6" ? "sp" : r === "lr" ? "r7" : r);

/**
 * Temel blok içinde register'da zaten bulunan değeri yeniden yükleyen LI / LW / LBU komutlarını siler
 * (ör. "SW r0, [sp+4]" ardından "LW r0, [sp+4]", art arda "LI r0, 0"). Bu komutlar bayrakları
 * etkilemediğinden silmek güvenlidir. Etiketler, çağrılar ve "$±n" göreli dallanmaların
 * ulaşabildiği öğeler bilgiyi sıfırlar; yığın belleği bilgisi her saklama ve SP değişiminde unutulur.
 */
function dropRedundantLoads(items: Item[]): Item[] {
  // "$+n" / "$-n" hedefinin olabileceği her öğe bir engeldir (her komut en az 2 bayt)
  const barrier = new Array<boolean>(items.length + 1).fill(false);
  items.forEach((it, i) => {
    if (it.k !== "ins") return;
    for (const a of it.args) {
      const m = /^\$([+-])(\d+)$/.exec(a.replace(/\s/g, ""));
      if (!m) continue;
      const n = Math.ceil(Number(m[2]) / 2);
      if (m[1] === "+") for (let j = i + 1; j <= Math.min(items.length, i + n); j++) barrier[j] = true;
      else for (let j = Math.max(0, i - n); j <= i; j++) barrier[j] = true;
    }
  });
  let known = new Map<string, Known>();
  const clearMem = () => {
    for (const k of known.values()) for (const key of k.keys) if (!key.startsWith("LI ")) k.keys.delete(key);
  };
  const out: Item[] = [];
  items.forEach((it, i) => {
    if (barrier[i]) known = new Map();
    if (it.k !== "ins") {
      if (it.k === "call") {
        for (const r of ["r0", "r1", "r2", "r3", "r7"]) known.delete(r);
        clearMem();
      } else if (it.k !== "br") known = new Map();
      out.push(it);
      return;
    }
    const op = it.op;
    const a0 = it.args[0] ? regName(it.args[0]) : "";
    const spMem = it.args[1]?.startsWith("[sp") ?? false;
    if (op === "LI" && a0 !== "sp") {
      const key = `LI ${it.args[1]}`;
      if (known.get(a0)?.keys.has(key)) return; // aynı sabit zaten register'da
      const v = Number(it.args[1]);
      known.set(a0, { keys: new Set([key]), byte: Number.isInteger(v) && v >= 0 && v <= 255 });
      out.push(it);
      return;
    }
    if ((op === "LW" || op === "LBU") && spMem && a0 !== "sp") {
      const key = `${op} ${it.args[1]}`;
      if (known.get(a0)?.keys.has(key)) return; // değer zaten register'da
      known.set(a0, { keys: new Set([key]), byte: op === "LBU" });
      out.push(it);
      return;
    }
    if (op === "SW" || op === "SB") {
      clearMem();
      const k = known.get(a0);
      if (spMem && (op === "SW" || k?.byte)) {
        // saklanan değer artık hem register'da hem bellekte
        const key = `${op === "SW" ? "LW" : "LBU"} ${it.args[1]}`;
        if (k) k.keys.add(key);
        else known.set(a0, { keys: new Set([key]), byte: false });
      }
      out.push(it);
      return;
    }
    if (op === "MOV") {
      const src = known.get(regName(it.args[1]));
      if (src && a0 !== "sp") known.set(a0, { keys: new Set(src.keys), byte: src.byte });
      else known.delete(a0);
      if (a0 === "sp") clearMem();
      out.push(it);
      return;
    }
    if (op === "PUSH" || op === "POP") clearMem();
    if (op === "JALR") {
      known = new Map();
    } else if (WRITES_RD.has(op)) {
      known.delete(a0);
      if (a0 === "sp") clearMem();
    } else if (!NO_WRITE.has(op)) {
      known = new Map(); // bilinmeyen komut: her şeyi unut
    }
    out.push(it);
  });
  return out;
}
