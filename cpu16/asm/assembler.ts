// as16: CPU16 assembler'ı. İki geçişli: 1. geçiş adresleri ve etiketleri bulur,
// 2. geçiş komutları kodlar. Sözdizimi: cpu16/docs/as16.md

import { OP, ALU_F3, ALU2_F3, CONDS, enc } from "../emu/isa.ts";

export interface AsmError {
  line: number;
  message: string;
}

export interface ListingLine {
  line: number;
  addr: number;
  bytes: number[];
  source: string;
}

export interface AsmResult {
  /** 64 KB bellek imajı; yazılmayan baytlar 0. */
  image: Uint8Array;
  /** Yazılan baytların aralıkları [başlangıç, bitiş) */
  ranges: [number, number][];
  symbols: Map<string, number>;
  listing: ListingLine[];
  errors: AsmError[];
}

class LineError extends Error {}

// ---------------------------------------------------------------- ifadeler

type Lookup = (name: string) => number | undefined;

/** Küçük bir ifade ayrıştırıcı. Çözülemeyen sembolde undefined döner (1. geçiş). */
function evaluate(src: string, lookup: Lookup, pc: number): number | undefined {
  let pos = 0;
  let unresolved = false;

  const ws = () => {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  };
  const peek = (s: string) => {
    ws();
    return src.startsWith(s, pos);
  };
  const eat = (s: string) => {
    if (peek(s)) {
      pos += s.length;
      return true;
    }
    return false;
  };

  const binary = (ops: string[], next: () => number, apply: (op: string, a: number, b: number) => number) => () => {
    let a = next();
    for (;;) {
      const op = ops.find((o) => peek(o));
      if (!op) return a;
      pos += op.length;
      a = apply(op, a, next());
    }
  };

  const primary = (): number => {
    ws();
    if (eat("(")) {
      const v = orExpr();
      if (!eat(")")) throw new LineError(`')' bekleniyordu: ${src}`);
      return v;
    }
    if (eat("-")) return -primary();
    if (eat("~")) return ~primary();
    if (eat("+")) return primary();
    const rest = src.slice(pos);
    let m = /^'(\\?.)'/.exec(rest);
    if (m) {
      pos += m[0].length;
      return unescape(m[1]).charCodeAt(0);
    }
    m = /^(0x[0-9a-f_]+|0b[01_]+|\d[\d_]*)/i.exec(rest);
    if (m) {
      pos += m[0].length;
      const t = m[0].replace(/_/g, "").toLowerCase();
      return t.startsWith("0b") ? parseInt(t.slice(2), 2) : Number(t);
    }
    if (eat("$")) return pc;
    m = /^[A-Za-z_.][\w.]*/.exec(rest);
    if (m) {
      pos += m[0].length;
      const name = m[0];
      const fn = name.toLowerCase();
      if ((fn === "lo" || fn === "hi") && peek("(")) {
        const v = primary();
        return fn === "lo" ? v & 0xff : (v >> 8) & 0xff;
      }
      const v = lookup(name);
      if (v === undefined) {
        unresolved = true;
        return 0;
      }
      return v;
    }
    throw new LineError(`İfade anlaşılamadı: '${src}'`);
  };

  const mul = binary(["*", "/", "%"], primary, (op, a, b) => {
    if (op === "*") return a * b;
    if (b === 0) {
      if (unresolved) return 0;
      throw new LineError("Sıfıra bölme");
    }
    return op === "/" ? Math.trunc(a / b) : a % b;
  });
  const addExpr = binary(["+", "-"], mul, (op, a, b) => (op === "+" ? a + b : a - b));
  const shift = binary(["<<", ">>"], addExpr, (op, a, b) => (op === "<<" ? a << b : a >> b));
  const andExpr = binary(["&"], shift, (_, a, b) => a & b);
  const xorExpr = binary(["^"], andExpr, (_, a, b) => a ^ b);
  const orExpr: () => number = binary(["|"], xorExpr, (_, a, b) => a | b);

  const v = orExpr();
  ws();
  if (pos < src.length) throw new LineError(`İfadenin sonunda fazlalık: '${src.slice(pos)}'`);
  return unresolved ? undefined : v;
}

function unescape(s: string): string {
  return s.replace(/\\(.)/g, (_, c: string) =>
    ({ n: "\n", r: "\r", t: "\t", "0": "\0", "\\": "\\", "'": "'", '"': '"' })[c] ?? c,
  );
}

// ---------------------------------------------------------------- satır çözümleme

/** Yorumları (;) atar, string/karakter içini korur. */
function stripComment(line: string): string {
  let inStr: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inStr) {
      if (ch === "\\") i++;
      else if (ch === inStr) inStr = null;
    } else if (ch === '"' || ch === "'") inStr = ch;
    else if (ch === ";") return line.slice(0, i);
  }
  return line;
}

/** Virgülle böler; parantez, köşeli parantez ve string içindeki virgüllere dokunmaz. */
function splitOperands(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let inStr: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (inStr) {
      cur += ch;
      if (ch === "\\") cur += s[++i] ?? "";
      else if (ch === inStr) inStr = null;
      continue;
    }
    if (ch === '"' || ch === "'") inStr = ch;
    if (ch === "(" || ch === "[") depth++;
    if (ch === ")" || ch === "]") depth--;
    if (ch === "," && depth === 0) {
      out.push(cur.trim());
      cur = "";
    } else cur += ch;
  }
  if (cur.trim() !== "") out.push(cur.trim());
  return out;
}

const REGS: Record<string, number> = {
  r0: 0, r1: 1, r2: 2, r3: 3, r4: 4, r5: 5, r6: 6, r7: 7, sp: 6, lr: 7,
};

function regOf(s: string): number | undefined {
  return REGS[s.trim().toLowerCase()];
}

interface Stmt {
  line: number;
  source: string;
  addr: number;
  size: number;
  mnemonic: string; // küçük harf; boşsa sadece etiket
  operands: string[];
}

// ---------------------------------------------------------------- assembler

export function assemble(source: string): AsmResult {
  const errors: AsmError[] = [];
  const symbols = new Map<string, number>();
  const stmts: Stmt[] = [];
  const lines = source.split(/\r?\n/);

  // ---- 1. geçiş: adresler ve etiketler
  let pc = 0;
  const lookup1: Lookup = (n) => symbols.get(n);
  for (let i = 0; i < lines.length; i++) {
    const lineNo = i + 1;
    try {
      let text = stripComment(lines[i]).trim();
      // etiketler (birden fazla olabilir: "a: b: NOP")
      for (;;) {
        const m = /^([A-Za-z_.][\w.]*)\s*:(?!=)/.exec(text);
        if (!m) break;
        define(m[1], pc, lineNo);
        text = text.slice(m[0].length).trim();
      }
      if (text === "") continue;
      // NAME = expr  /  NAME .equ expr
      const eq = /^([A-Za-z_][\w.]*)\s*(?:=|\.equ\s)\s*(.+)$/i.exec(text);
      if (eq) {
        const v = evaluate(eq[2], lookup1, pc);
        if (v === undefined) throw new LineError(`'${eq[1]}' tanımı ileri referans kullanamaz`);
        define(eq[1], v, lineNo);
        continue;
      }
      const sp = text.search(/\s/);
      const mnemonic = (sp < 0 ? text : text.slice(0, sp)).toLowerCase();
      const operands = sp < 0 ? [] : splitOperands(text.slice(sp + 1));
      if (mnemonic === ".equ") {
        if (operands.length !== 2) throw new LineError(".equ İSİM, değer");
        const v = evaluate(operands[1], lookup1, pc);
        if (v === undefined) throw new LineError(".equ ileri referans kullanamaz");
        define(operands[0], v, lineNo);
        continue;
      }
      if (mnemonic === ".org") {
        const v = evaluate(operands[0] ?? "", lookup1, pc);
        if (v === undefined) throw new LineError(".org ileri referans kullanamaz");
        pc = v & 0xffff;
        continue;
      }
      const size = sizeOf(mnemonic, operands, pc, lookup1);
      if (!mnemonic.startsWith(".") && pc & 1) throw new LineError("Komut tek adreste: önce .align 2 kullan");
      stmts.push({ line: lineNo, source: lines[i], addr: pc, size, mnemonic, operands });
      pc = (pc + size) & 0xffff;
    } catch (e) {
      errors.push({ line: lineNo, message: (e as Error).message });
    }
  }

  function define(name: string, value: number, line: number) {
    if (regOf(name) !== undefined) throw new LineError(`'${name}' register adı, etiket olamaz`);
    if (symbols.has(name)) errors.push({ line, message: `'${name}' iki kez tanımlandı` });
    else symbols.set(name, value);
  }

  // ---- 2. geçiş: kodlama
  const image = new Uint8Array(0x10000);
  const written = new Set<number>();
  const listing: ListingLine[] = [];
  // yazılan en küçük ve en büyük adres: aralıklar bütün 64 KB yerine yalnız bunların arasında aranır
  let lo = 0x10000;
  let hi = -1;
  for (const st of stmts) {
    const lookup2: Lookup = (n) => symbols.get(n);
    try {
      const bytes = emit(st, lookup2);
      if (bytes.length !== st.size) throw new LineError(`İç hata: boyut ${st.size} beklendi, ${bytes.length} üretildi`);
      bytes.forEach((b, k) => {
        const a = (st.addr + k) & 0xffff;
        if (written.has(a)) throw new LineError(`0x${a.toString(16)} adresine iki kez yazılıyor`);
        image[a] = b;
        written.add(a);
        lo = Math.min(lo, a);
        hi = Math.max(hi, a);
      });
      listing.push({ line: st.line, addr: st.addr, bytes, source: st.source });
    } catch (e) {
      errors.push({ line: st.line, message: (e as Error).message });
    }
  }

  const ranges: [number, number][] = [];
  for (let a = lo; a <= hi; a++) {
    if (!written.has(a)) continue;
    const start = a;
    while (a < 0x10000 && written.has(a)) a++;
    ranges.push([start, a]);
  }

  errors.sort((a, b) => a.line - b.line);
  return { image, ranges, symbols, listing, errors };
}

/** Hata varsa fırlatır; testler ve CLI için kısayol. */
export function assembleOrThrow(source: string): AsmResult {
  const res = assemble(source);
  if (res.errors.length) {
    throw new Error(res.errors.map((e) => `satır ${e.line}: ${e.message}`).join("\n"));
  }
  return res;
}

// ---------------------------------------------------------------- boyut

function stringBytes(op: string): number[] | null {
  const m = /^"((?:[^"\\]|\\.)*)"$/.exec(op.trim());
  if (!m) return null;
  return Array.from(unescape(m[1])).map((c) => c.charCodeAt(0) & 0xff);
}

function sizeOf(mn: string, ops: string[], pc: number, lookup: Lookup): number {
  switch (mn) {
    case ".word":
      return ops.length * 2;
    case ".byte":
      return ops.reduce((n, o) => n + (stringBytes(o)?.length ?? 1), 0);
    case ".ascii":
    case ".asciz": {
      const b = stringBytes(ops[0] ?? "");
      if (!b) throw new LineError(`${mn} bir string bekler`);
      return b.length + (mn === ".asciz" ? 1 : 0);
    }
    case ".space": {
      const n = evaluate(ops[0] ?? "", lookup, pc);
      if (n === undefined) throw new LineError(".space ileri referans kullanamaz");
      return n;
    }
    case ".align": {
      const n = evaluate(ops[0] ?? "2", lookup, pc);
      if (n === undefined || n <= 0) throw new LineError(".align pozitif sabit bekler");
      return (n - (pc % n)) % n;
    }
    case "li": {
      // Sabit 0..255 ise tek komut, değilse LI + LUI (ileri referans → her zaman 2 komut)
      const v = ops[1] === undefined ? undefined : evaluate(ops[1], lookup, pc);
      return v !== undefined && v >= 0 && v <= 255 ? 2 : 4;
    }
    default:
      if (mn.startsWith(".")) throw new LineError(`Bilinmeyen direktif '${mn}'`);
      return 2;
  }
}

// ---------------------------------------------------------------- kodlama

function emit(st: Stmt, lookup: Lookup): number[] {
  const { mnemonic: mn, operands: ops, addr } = st;
  const val = (s: string | undefined): number => {
    if (s === undefined) throw new LineError("Eksik operand");
    const v = evaluate(s, lookup, addr);
    if (v === undefined) throw new LineError(`Tanımsız sembol: '${s}'`);
    return v;
  };
  const reg = (s: string | undefined): number => {
    const r = s === undefined ? undefined : regOf(s);
    if (r === undefined) throw new LineError(`Register bekleniyordu: '${s ?? ""}'`);
    return r;
  };
  const range = (v: number, lo: number, hi: number, what: string) => {
    if (v < lo || v > hi) throw new LineError(`${what} aralık dışı: ${v} (${lo}..${hi})`);
    return v;
  };
  const count = (n: number) => {
    if (ops.length !== n) throw new LineError(`${mn.toUpperCase()} ${n} operand bekler, ${ops.length} verildi`);
  };
  const mem = (s: string | undefined): [number, number] => {
    const m = /^\[\s*([A-Za-z]\w*)\s*(?:([+-])(.*))?\]$/.exec((s ?? "").trim());
    if (!m) throw new LineError(`Bellek operandı bekleniyordu ([rX], [rX+n]): '${s ?? ""}'`);
    const offset = m[2] ? val(m[3]) * (m[2] === "-" ? -1 : 1) : 0;
    return [reg(m[1]), offset];
  };
  const word = (w: number) => [w & 0xff, (w >> 8) & 0xff];
  const branchOff = (target: number, bits: number) => {
    const delta = target - ((addr + 2) & 0xffff);
    if (delta & 1) throw new LineError("Dallanma hedefi tek adreste");
    const lim = 1 << (bits - 1);
    return range(delta / 2, -lim, lim - 1, "Dallanma mesafesi (komut)");
  };

  // ---- direktifler
  switch (mn) {
    case ".word":
      return ops.flatMap((o) => word(range(val(o), -0x8000, 0xffff, ".word değeri")));
    case ".byte":
      return ops.flatMap((o) => stringBytes(o) ?? [range(val(o), -128, 255, ".byte değeri") & 0xff]);
    case ".ascii":
      return stringBytes(ops[0])!;
    case ".asciz":
      return [...stringBytes(ops[0])!, 0];
    case ".space": {
      const fill = ops[1] === undefined ? 0 : val(ops[1]) & 0xff;
      return new Array(st.size).fill(fill);
    }
    case ".align":
      return new Array(st.size).fill(0);
  }

  // ---- komutlar
  const alu = ALU_F3.indexOf(mn.toUpperCase() as (typeof ALU_F3)[number]);
  if (alu >= 0) {
    if (mn === "cmp") {
      count(2);
      return word(enc.R(OP.ALU, 0, reg(ops[0]), reg(ops[1]), 7));
    }
    count(3);
    return word(enc.R(OP.ALU, reg(ops[0]), reg(ops[1]), reg(ops[2]), alu));
  }
  const alu2 = ALU2_F3.indexOf(mn.toUpperCase() as (typeof ALU2_F3)[number]);
  if (alu2 >= 0) {
    count(2);
    return word(enc.R(OP.ALU2, reg(ops[0]), reg(ops[1]), 0, alu2));
  }
  if (mn.startsWith("b") && mn !== "bal") {
    const c = mn === "b" ? 14 : CONDS.indexOf(mn.slice(1).toUpperCase() as (typeof CONDS)[number]);
    if (c >= 0) {
      count(1);
      return word(enc.B(OP.BCC, c, branchOff(val(ops[0]), 8)));
    }
  }

  switch (mn) {
    case "bal":
      count(1);
      return word(enc.B(OP.BCC, 14, branchOff(val(ops[0]), 8)));
    case "addi":
    case "subi": {
      count(3);
      const imm = val(ops[2]) * (mn === "subi" ? -1 : 1);
      return word(enc.I(OP.ADDI, reg(ops[0]), reg(ops[1]), range(imm, -32, 31, "ADDI sabiti")));
    }
    case "li": {
      count(2);
      const rd = reg(ops[0]);
      const v = val(ops[1]);
      range(v, -0x8000, 0xffff, "LI sabiti");
      if (st.size === 2) return word(enc.L(OP.LI, rd, 0, v));
      return [...word(enc.L(OP.LI, rd, 0, v & 0xff)), ...word(enc.L(OP.LI, rd, 1, (v >> 8) & 0xff))];
    }
    case "lui":
      count(2);
      return word(enc.L(OP.LI, reg(ops[0]), 1, range(val(ops[1]), 0, 255, "LUI sabiti")));
    case "lw":
    case "sw": {
      count(2);
      const [base, offset] = mem(ops[1]);
      if (offset & 1) throw new LineError(`${mn.toUpperCase()} ofseti çift olmalı`);
      range(offset, -64, 62, `${mn.toUpperCase()} ofseti`);
      return word(enc.I(mn === "lw" ? OP.LW : OP.SW, reg(ops[0]), base, offset / 2));
    }
    case "lbu":
    case "sb": {
      count(2);
      const [base, offset] = mem(ops[1]);
      range(offset, -32, 31, `${mn.toUpperCase()} ofseti`);
      return word(enc.I(mn === "lbu" ? OP.LBU : OP.SB, reg(ops[0]), base, offset));
    }
    case "jal":
    case "call":
      count(1);
      return word(enc.J(OP.JAL, branchOff(val(ops[0]), 12)));
    case "jalr": {
      count(3);
      const offset = val(ops[2]);
      if (offset & 1) throw new LineError("JALR ofseti çift olmalı");
      return word(enc.I(OP.JALR, reg(ops[0]), reg(ops[1]), range(offset, -64, 62, "JALR ofseti") / 2));
    }
    case "ret":
      count(0);
      return word(enc.I(OP.JALR, 7, 7, 0));
    case "cmpi":
      count(2);
      return word(enc.C(OP.CMPI, reg(ops[0]), range(val(ops[1]), -256, 255, "CMPI sabiti")));
    case "push":
      count(1);
      return word(enc.R(OP.STACK, 0, reg(ops[0]), 0, 0));
    case "pop":
      count(1);
      return word(enc.R(OP.STACK, reg(ops[0]), 0, 0, 1));
    case "nop": case "halt": case "ei": case "di": case "reti": case "swi": {
      count(0);
      const code = ["nop", "halt", "ei", "di", "reti", "swi"].indexOf(mn);
      return word(enc.R(OP.SYS, 0, 0, 0, code));
    }
    case "sxb":
      count(2);
      return word(enc.R(OP.SYS, reg(ops[0]), reg(ops[1]), 0, 6));
  }
  throw new LineError(`Bilinmeyen komut '${mn.toUpperCase()}'`);
}
