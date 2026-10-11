// cc16 nesne biçimi: derleyicinin ve elle yazılmış .s dosyalarının ortak çıktısı.
// Bir nesne dosyası "parça"lardan (chunk) oluşur: her fonksiyon / global değişken / string ayrı bir parçadır.
// Bağlayıcı (linker.ts) parçaları yerleştirir, kullanılmayanları atar, dallanmaları uzatır ve
// sonunda as16'nın derleyebileceği tek bir assembly metni üretir.

export type Section = "text" | "rodata" | "data" | "bss";

export type Item =
  /** etiket tanımı */
  | { k: "label"; name: string }
  /** sabit komut (LI dışında hep 2 bayt; LI'nin boyutu as16 kuralıyla hesaplanır) */
  | { k: "ins"; op: string; args: string[] }
  /** uzatılabilir koşullu dallanma: Bcc (±256 B) → B!cc + JAL → B!cc + LI r7 + JALR */
  | { k: "br"; cond: string; target: string }
  /** uzatılabilir koşulsuz atlama: B → JAL → LI r7 + JALR (r7 bozulur) */
  | { k: "jmp"; target: string }
  /** uzatılabilir çağrı: JAL → LI r7 + JALR */
  | { k: "call"; target: string }
  /** .word ifade */
  | { k: "word"; expr: string }
  | { k: "byte"; bytes: number[] }
  | { k: "space"; n: number }
  | { k: "align"; n: number };

export interface Chunk {
  /** birincil sembol */
  name: string;
  section: Section;
  align: number;
  items: Item[];
  /** diğer parçalara görünen semboller */
  exports: string[];
  /** false: dosyaya özel (static) */
  global: boolean;
  /** kaynak dosya (hata mesajları için) */
  file: string;
  /** .s kaynağında bir sonraki parçaya düşüyor (birlikte bağlanmalı) */
  fallsInto?: string;
}

export interface ObjFile {
  file: string;
  chunks: Chunk[];
  /** dosyaya özel sabitler (as16 çıktısının başına yazılır): ad → değer */
  equates: Record<string, number>;
  /** kütüphane nesnesi mi (arşiv anlamı: yalnızca gerekirse bağlanır, kullanıcı tanımı önceliklidir) */
  lib: boolean;
}

export const INVERT: Record<string, string> = {
  EQ: "NE", NE: "EQ", CS: "CC", CC: "CS", MI: "PL", PL: "MI", VS: "VC", VC: "VS",
  HI: "LS", LS: "HI", GE: "LT", LT: "GE", GT: "LE", LE: "GT",
};

const REGS = new Set(["r0", "r1", "r2", "r3", "r4", "r5", "r6", "r7", "sp", "lr"]);

/** Bir operand metnindeki sembol adlarını bulur (sayılar, register'lar, string'ler hariç). */
export function symbolsIn(text: string): string[] {
  const out: string[] = [];
  const re = /0x[0-9a-f_]+|0b[01_]+|\d[\d_]*|'(?:\\.|[^'\\])'|"(?:\\.|[^"\\])*"|([A-Za-z_.][\w.]*)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1];
    if (!name) continue;
    if (REGS.has(name.toLowerCase())) continue;
    const after = text.slice(re.lastIndex).trimStart();
    if ((name.toLowerCase() === "lo" || name.toLowerCase() === "hi") && after.startsWith("(")) continue;
    out.push(name);
  }
  return out;
}

/** Parçanın başvurduğu semboller. */
export function chunkRefs(c: Chunk): string[] {
  const refs = new Set<string>();
  for (const it of c.items) {
    if (it.k === "br" || it.k === "jmp" || it.k === "call") refs.add(it.target);
    else if (it.k === "ins") for (const a of it.args) for (const s of symbolsIn(a)) refs.add(s);
    else if (it.k === "word") for (const s of symbolsIn(it.expr)) refs.add(s);
  }
  if (c.fallsInto) refs.add(c.fallsInto);
  return [...refs];
}

export function chunkLabels(c: Chunk): string[] {
  return c.items.filter((i) => i.k === "label").map((i) => (i as { name: string }).name);
}

// ---------------------------------------------------------------- .s kaynağını nesneye çevirme

export interface AsmObjError {
  file: string;
  line: number;
  message: string;
}

function unescapeStr(s: string): number[] {
  const out: number[] = [];
  for (let i = 0; i < s.length; i++) {
    if (s[i] !== "\\") {
      out.push(s.charCodeAt(i) & 0xff);
      continue;
    }
    const c = s[++i];
    const map: Record<string, number> = { n: 10, r: 13, t: 9, "0": 0, "\\": 92, "'": 39, '"': 34 };
    out.push(map[c] ?? c.charCodeAt(0));
  }
  return out;
}

function stripComment(line: string): string {
  let q: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === "\\") i++;
      else if (ch === q) q = null;
    } else if (ch === '"' || ch === "'") q = ch;
    else if (ch === ";") return line.slice(0, i);
  }
  return line;
}

function splitOperands(s: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let q: string | null = null;
  let cur = "";
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (q) {
      cur += ch;
      if (ch === "\\") cur += s[++i] ?? "";
      else if (ch === q) q = null;
      continue;
    }
    if (ch === '"' || ch === "'") q = ch;
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

/** Basit sabit ifade değerlendirici (yalnızca sayılar ve bilinen sabitler). */
export function evalConstExpr(src: string, lookup: (name: string) => number | undefined): number | undefined {
  let pos = 0;
  let bad = false;
  const ws = () => {
    while (pos < src.length && /\s/.test(src[pos])) pos++;
  };
  const eat = (t: string) => {
    ws();
    if (src.startsWith(t, pos)) {
      pos += t.length;
      return true;
    }
    return false;
  };
  const primary = (): number => {
    ws();
    if (eat("(")) {
      const v = or();
      eat(")");
      return v;
    }
    if (eat("-")) return -primary();
    if (eat("~")) return ~primary();
    if (eat("+")) return primary();
    const rest = src.slice(pos);
    let m = /^'(\\?.)'/.exec(rest);
    if (m) {
      pos += m[0].length;
      return unescapeStr(m[1])[0];
    }
    m = /^(0x[0-9a-f_]+|0b[01_]+|\d[\d_]*)/i.exec(rest);
    if (m) {
      pos += m[0].length;
      const t = m[0].replace(/_/g, "").toLowerCase();
      return t.startsWith("0b") ? parseInt(t.slice(2), 2) : Number(t);
    }
    m = /^[A-Za-z_.][\w.]*/.exec(rest);
    if (m) {
      pos += m[0].length;
      const n = m[0].toLowerCase();
      if ((n === "lo" || n === "hi") && src.slice(pos).trimStart().startsWith("(")) {
        const v = primary();
        return n === "lo" ? v & 0xff : (v >> 8) & 0xff;
      }
      const v = lookup(m[0]);
      if (v === undefined) bad = true;
      return v ?? 0;
    }
    if (eat("$")) {
      bad = true;
      return 0;
    }
    bad = true;
    pos = src.length;
    return 0;
  };
  const bin = (ops: string[], next: () => number, f: (o: string, a: number, b: number) => number) => () => {
    let a = next();
    for (;;) {
      ws();
      const o = ops.find((x) => src.startsWith(x, pos));
      if (!o) return a;
      pos += o.length;
      a = f(o, a, next());
    }
  };
  const mul = bin(["*", "/", "%"], primary, (o, a, b) => (o === "*" ? a * b : b === 0 ? 0 : o === "/" ? Math.trunc(a / b) : a % b));
  const add = bin(["+", "-"], mul, (o, a, b) => (o === "+" ? a + b : a - b));
  const sh = bin(["<<", ">>"], add, (o, a, b) => (o === "<<" ? a << b : a >> b));
  const and = bin(["&"], sh, (_, a, b) => a & b);
  const xor = bin(["^"], and, (_, a, b) => a ^ b);
  const or: () => number = bin(["|"], xor, (_, a, b) => a | b);
  const v = or();
  ws();
  if (bad || pos < src.length) return undefined;
  return v;
}

/**
 * Elle yazılmış bir .s dosyasını nesneye çevirir.
 * Kurallar: `.text/.rodata/.data/.bss` bölüm seçer; `.` ile başlayan etiketler ve `AD = değer`
 * sabitleri dosyaya özeldir (yeniden adlandırılır); diğer etiketler globaldir ve yeni bir parça başlatır.
 * `CALL` uzatılabilir çağrıya dönüşür, diğer komutlar olduğu gibi kalır. `.org` kullanılamaz.
 */
export function asmToObject(source: string, file: string, tag: string, lib: boolean): { obj: ObjFile; errors: AsmObjError[] } {
  const errors: AsmObjError[] = [];
  const chunks: Chunk[] = [];
  const equates: Record<string, number> = {};
  const localNames = new Map<string, string>();
  const lines = source.split(/\r?\n/);
  let section: Section = "text";
  let cur: Chunk | undefined;
  const pending: Item[] = []; // global etiketten önceki öğeler (hata)

  // 1. tur: dosyaya özel isimleri topla
  for (const raw of lines) {
    let text = stripComment(raw).trim();
    for (;;) {
      const m = /^([A-Za-z_.][\w.]*)\s*:(?!=)/.exec(text);
      if (!m) break;
      if (m[1].startsWith(".")) localNames.set(m[1], `.${tag}${m[1]}`);
      text = text.slice(m[0].length).trim();
    }
    const eq = /^([A-Za-z_][\w.]*)\s*(?:=|\.equ\s)\s*(.+)$/i.exec(text) ?? /^\.equ\s+([A-Za-z_][\w.]*)\s*,\s*(.+)$/i.exec(text);
    if (eq) localNames.set(eq[1], `${tag}.${eq[1]}`);
  }
  const rename = (s: string) =>
    s.replace(/0x[0-9a-f_]+|0b[01_]+|\d[\d_]*|'(?:\\.|[^'\\])'|"(?:\\.|[^"\\])*"|[A-Za-z_.][\w.]*/gi, (m) => localNames.get(m) ?? m);

  const lookupEq = (name: string) => equates[name];

  lines.forEach((raw, idx) => {
    const lineNo = idx + 1;
    const fail = (message: string) => errors.push({ file, line: lineNo, message });
    let text = stripComment(raw).trim();
    const add = (it: Item) => {
      if (!cur) {
        if (it.k === "label") return;
        pending.push(it);
        fail("Global bir etiketten önce kod/veri olamaz");
        return;
      }
      cur.items.push(it);
    };
    for (;;) {
      const m = /^([A-Za-z_.][\w.]*)\s*:(?!=)/.exec(text);
      if (!m) break;
      const name = m[1];
      if (name.startsWith(".")) {
        add({ k: "label", name: localNames.get(name)! });
      } else {
        const prev = cur;
        cur = { name, section, align: 2, items: [{ k: "label", name }], exports: [name], global: true, file };
        if (prev && prev.section === section && !endsFlow(prev)) prev.fallsInto = name;
        chunks.push(cur);
      }
      text = text.slice(m[0].length).trim();
    }
    if (!text) return;
    const eq = /^([A-Za-z_][\w.]*)\s*(?:=|\.equ\s)\s*(.+)$/i.exec(text) ?? /^\.equ\s+([A-Za-z_][\w.]*)\s*,\s*(.+)$/i.exec(text);
    if (eq) {
      const v = evalConstExpr(rename(eq[2]), lookupEq);
      if (v === undefined) fail(`'${eq[1]}' sabiti çözülemedi (yalnızca sayılar ve önceki sabitler)`);
      else equates[localNames.get(eq[1])!] = v;
      return;
    }
    const sp = text.search(/\s/);
    const mn = (sp < 0 ? text : text.slice(0, sp)).toLowerCase();
    const ops = sp < 0 ? [] : splitOperands(text.slice(sp + 1));
    switch (mn) {
      case ".text":
      case ".rodata":
      case ".data":
      case ".bss":
        section = mn.slice(1) as Section;
        cur = undefined;
        return;
      case ".global":
      case ".globl":
        return;
      case ".org":
        fail("Bağlanabilir assembly'de .org kullanılamaz (yerleşimi bağlayıcı yapar)");
        return;
      case ".word":
        for (const o of ops) add({ k: "word", expr: rename(o) });
        return;
      case ".byte":
        for (const o of ops) {
          const sm = /^"((?:[^"\\]|\\.)*)"$/.exec(o);
          if (sm) add({ k: "byte", bytes: unescapeStr(sm[1]) });
          else {
            const v = evalConstExpr(rename(o), lookupEq);
            if (v === undefined) fail(`.byte değeri sabit olmalı: ${o}`);
            else add({ k: "byte", bytes: [v & 0xff] });
          }
        }
        return;
      case ".ascii":
      case ".asciz": {
        const sm = /^"((?:[^"\\]|\\.)*)"$/.exec(ops[0] ?? "");
        if (!sm) return void fail(`${mn} bir string bekler`);
        const b = unescapeStr(sm[1]);
        if (mn === ".asciz") b.push(0);
        add({ k: "byte", bytes: b });
        return;
      }
      case ".space": {
        const n = evalConstExpr(rename(ops[0] ?? ""), lookupEq);
        const fill = ops[1] === undefined ? 0 : evalConstExpr(rename(ops[1]), lookupEq);
        if (n === undefined || fill === undefined) return void fail(".space sabit bekler");
        add(fill ? { k: "byte", bytes: new Array(n).fill(fill & 0xff) } : { k: "space", n });
        return;
      }
      case ".align": {
        const n = evalConstExpr(ops[0] ?? "2", lookupEq);
        if (!n || n <= 0) return void fail(".align pozitif sabit bekler");
        add({ k: "align", n });
        return;
      }
      case "call":
        if (ops.length !== 1) return void fail("CALL tek operand bekler");
        add({ k: "call", target: rename(ops[0]) });
        return;
      default:
        if (mn.startsWith(".")) return void fail(`Bilinmeyen direktif '${mn}'`);
        add({ k: "ins", op: mn.toUpperCase(), args: ops.map(rename) });
    }
  });
  // .data/.bss bölümündeki etiketler: bss'te yalnızca .space olmalı
  for (const c of chunks) {
    if (c.section === "bss" && c.items.some((i) => i.k !== "label" && i.k !== "space" && i.k !== "align")) {
      errors.push({ file, line: 0, message: `'${c.name}': .bss bölümünde yalnızca .space kullanılabilir` });
    }
  }
  return { obj: { file, chunks, equates, lib }, errors };
}

function endsFlow(c: Chunk): boolean {
  for (let i = c.items.length - 1; i >= 0; i--) {
    const it = c.items[i];
    if (it.k === "label") continue;
    if (it.k === "jmp") return true;
    if (it.k === "ins") return ["RET", "RETI", "HALT", "B", "BAL"].includes(it.op);
    return c.section !== "text";
  }
  return c.section !== "text";
}
