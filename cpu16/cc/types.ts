// cc16 tip sistemi ve AST tanımları.
// CPU16 veri modeli: char = 8 bit (işaretsiz), short = int = 16 bit, long = 32 bit, işaretçi = 16 bit.
// Hizalama en fazla 2 bayttır (LW/SW adresin 0. bitini yok sayar); struct/union her zaman 2'ye hizalanır.

import type { Token } from "./lexer.ts";

export type TypeKind =
  | "void" | "bool" | "char" | "short" | "int" | "long" | "enum"
  | "ptr" | "array" | "func" | "struct" | "union";

export interface Member {
  name: string;
  ty: Type;
  offset: number;
}

export interface Type {
  kind: TypeKind;
  size: number;
  align: number;
  unsigned: boolean;
  /** ptr/array: eleman tipi */
  base?: Type;
  /** array: eleman sayısı (-1 = boyutu belirsiz) */
  len?: number;
  /** func */
  ret?: Type;
  params?: Type[];
  variadic?: boolean;
  /** func: prototip ile bildirildi mi */
  proto?: boolean;
  /** struct/union */
  members?: Member[];
  complete?: boolean;
  tag?: string;
  /** niteleyiciler */
  isConst?: boolean;
  isVolatile?: boolean;
  /** struct/union'un niteleyicili kopyası ise asıl tip (tip eşitliği için) */
  origin?: Type;
  /** func: fonksiyon tanımında parametre adları */
  paramNames?: (Token | undefined)[];
}

const mk = (kind: TypeKind, size: number, align: number, unsigned: boolean): Type => ({ kind, size, align, unsigned });

export const T = {
  void: mk("void", 1, 1, false),
  bool: mk("bool", 1, 1, true),
  char: mk("char", 1, 1, true), // düz char işaretsiz
  schar: mk("char", 1, 1, false),
  uchar: mk("char", 1, 1, true),
  short: mk("short", 2, 2, false),
  ushort: mk("short", 2, 2, true),
  int: mk("int", 2, 2, false),
  uint: mk("int", 2, 2, true),
  long: mk("long", 4, 2, false),
  ulong: mk("long", 4, 2, true),
};

export function pointerTo(base: Type): Type {
  return { kind: "ptr", size: 2, align: 2, unsigned: true, base };
}

export function arrayOf(base: Type, len: number): Type {
  return { kind: "array", size: len < 0 ? 0 : base.size * len, align: base.align, unsigned: false, base, len };
}

export function funcType(ret: Type, params: Type[], variadic: boolean, proto: boolean): Type {
  return { kind: "func", size: 1, align: 1, unsigned: false, ret, params, variadic, proto };
}

export function enumType(): Type {
  return { kind: "enum", size: 2, align: 2, unsigned: false };
}

export function structType(kind: "struct" | "union", tag?: string): Type {
  return { kind, size: 0, align: 2, unsigned: false, members: [], complete: false, tag };
}

/** Tipin niteleyicili kopyası (struct/union paylaşılır, çünkü sonradan tamamlanabilir). */
export function qualified(ty: Type, isConst: boolean, isVolatile: boolean): Type {
  if (!isConst && !isVolatile) return ty;
  if ((ty.kind === "struct" || ty.kind === "union") && !ty.complete) return ty;
  return {
    ...ty, isConst: isConst || ty.isConst, isVolatile: isVolatile || ty.isVolatile,
    origin: ty.kind === "struct" || ty.kind === "union" ? (ty.origin ?? ty) : undefined,
  };
}

export function unqualified(ty: Type): Type {
  if (!ty.isConst && !ty.isVolatile) return ty;
  return { ...ty, isConst: false, isVolatile: false };
}

export const isInteger = (t: Type) =>
  t.kind === "bool" || t.kind === "char" || t.kind === "short" || t.kind === "int" || t.kind === "long" || t.kind === "enum";
export const isPointer = (t: Type) => t.kind === "ptr";
export const isPtrLike = (t: Type) => t.kind === "ptr" || t.kind === "array";
export const isScalar = (t: Type) => isInteger(t) || t.kind === "ptr";
export const isAggregate = (t: Type) => t.kind === "struct" || t.kind === "union" || t.kind === "array";
export const isStructLike = (t: Type) => t.kind === "struct" || t.kind === "union";
/** 32 bitlik tamsayı (long / unsigned long) */
export const is32 = (t: Type) => t.kind === "long";
/** Kayıtta tek kelime tutulan değer (char, int, işaretçi...) */
export const isWord = (t: Type) => isScalar(t) && t.size <= 2;

export function isSigned(t: Type): boolean {
  return isInteger(t) && !t.unsigned;
}

/** Kayıt/argüman dizisinde kapladığı kelime sayısı. */
export function wordsOf(t: Type): number {
  if (t.kind === "array" || t.kind === "func") return 1; // işaretçiye dönüşür
  return Math.max(1, Math.ceil(t.size / 2));
}

export function sameType(a: Type, b: Type): boolean {
  if (a === b) return true;
  if (a.kind !== b.kind) return false;
  switch (a.kind) {
    case "ptr":
      return sameType(a.base!, b.base!);
    case "array":
      return a.len === b.len && sameType(a.base!, b.base!);
    case "func":
      return (
        sameType(a.ret!, b.ret!) &&
        a.variadic === b.variadic &&
        a.params!.length === b.params!.length &&
        a.params!.every((p, i) => sameType(p, b.params![i]))
      );
    case "struct":
    case "union":
      return (a.origin ?? a) === (b.origin ?? b);
    default:
      return a.size === b.size && a.unsigned === b.unsigned;
  }
}

export function typeName(t: Type): string {
  switch (t.kind) {
    case "void": return "void";
    case "bool": return "_Bool";
    case "char": return t === T.char ? "char" : t.unsigned ? "unsigned char" : "signed char";
    case "short": return t.unsigned ? "unsigned short" : "short";
    case "int": return t.unsigned ? "unsigned int" : "int";
    case "long": return t.unsigned ? "unsigned long" : "long";
    case "enum": return "enum";
    case "ptr": return `${typeName(t.base!)} *`;
    case "array": return `${typeName(t.base!)}[${t.len! < 0 ? "" : t.len}]`;
    case "func": return `${typeName(t.ret!)} (${t.params!.map(typeName).join(", ")}${t.variadic ? ", ..." : ""})`;
    case "struct":
    case "union":
      return `${t.kind} ${t.tag ?? "<anonim>"}`;
  }
}

/** Tamsayı terfisi: char/short/bool/enum → int (16 bit olduğu için unsigned short → unsigned int). */
export function promote(t: Type): Type {
  if (t.kind === "bool" || t.kind === "char" || t.kind === "enum") return T.int;
  if (t.kind === "short") return t.unsigned ? T.uint : T.int;
  if (t.kind === "int") return t.unsigned ? T.uint : T.int;
  if (t.kind === "long") return t.unsigned ? T.ulong : T.long;
  return t;
}

/** Olağan aritmetik dönüşümler. */
export function commonType(a: Type, b: Type): Type {
  const x = promote(a);
  const y = promote(b);
  if (x.kind === "long" || y.kind === "long") {
    if ((x.kind === "long" && x.unsigned) || (y.kind === "long" && y.unsigned)) return T.ulong;
    return T.long; // long, unsigned int'in tüm değerlerini tutabilir
  }
  if (x.unsigned || y.unsigned) return T.uint;
  return T.int;
}

/** Değeri tipin aralığına indirger (işaretliyse işaretli aralık). */
export function wrap(v: number, t: Type): number {
  if (t.kind === "bool") return v ? 1 : 0;
  const bits = t.kind === "ptr" ? 16 : t.size * 8;
  if (bits >= 32) {
    const u = v >>> 0;
    return t.unsigned || t.kind === "ptr" ? u : u | 0;
  }
  const m = 2 ** bits;
  let u = ((v % m) + m) % m;
  if (!t.unsigned && t.kind !== "ptr" && u >= m / 2) u -= m;
  return u;
}

// ---------------------------------------------------------------- AST

export type NodeKind =
  // ifadeler
  | "num" | "var" | "add" | "sub" | "mul" | "div" | "mod" | "band" | "bor" | "bxor" | "shl" | "shr"
  | "eq" | "ne" | "lt" | "le" | "gt" | "ge" | "logand" | "logor" | "not" | "bitnot" | "neg"
  | "addr" | "deref" | "member" | "assign" | "opassign" | "postinc" | "lvval"
  | "cond" | "comma" | "cast" | "call" | "vastart" | "memzero" | "strinit"
  // deyimler
  | "block" | "if" | "for" | "do" | "switch" | "case" | "break" | "continue" | "return"
  | "goto" | "label" | "expr" | "null";

export interface Node {
  kind: NodeKind;
  tok: Token;
  ty: Type;
  lhs?: Node;
  rhs?: Node;
  /** num: değer (tipine göre normalize); postinc: artış miktarı */
  val?: number;
  v?: Var;
  mem?: Member;
  /** opassign: yapılacak işlem ("lvval" yer tutucusunu içeren ifade rhs'te) */
  cond?: Node;
  then?: Node;
  els?: Node;
  init?: Node;
  inc?: Node;
  body?: Node;
  stmts?: Node[];
  brk?: string;
  cont?: string;
  /** switch */
  cases?: { val: number; label: string }[];
  defLabel?: string;
  /** case/label/goto: üretilen etiket */
  label?: string;
  /** call */
  fn?: Node;
  args?: Node[];
  fty?: Type;
  retBuf?: Var;
  /** strinit: kaynak string değişkeni (val = kopyalanacak bayt sayısı) */
  str?: Var;
  /** div: bölme kesin (işaretçi farkı), SAR ile yapılabilir */
  exact?: boolean;
}

export interface Reloc {
  offset: number;
  sym: string;
  add: number;
}

export interface Var {
  name: string;
  ty: Type;
  tok: Token;
  isLocal: boolean;
  // yerel
  offset: number;
  reg?: string;
  addrTaken: boolean;
  weight: number;
  isParam: boolean;
  paramWord: number;
  // global
  sym: string;
  isStatic: boolean;
  isFunction: boolean;
  isDefinition: boolean;
  isConst: boolean;
  isVolatile: boolean;
  isString?: boolean;
  init?: number[];
  relocs?: Reloc[];
}

export interface Func {
  name: string;
  sym: string;
  ty: Type;
  tok: Token;
  isStatic: boolean;
  params: Var[];
  locals: Var[];
  body: Node;
  /** struct döndüren fonksiyonun gizli dönüş işaretçisi (0. argüman kelimesi) */
  retPtr?: Var;
}
