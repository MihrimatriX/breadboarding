/**
 * Küçük bir 6502 assembler/disassembler. Yalnızca resmi (legal) 151 opcode.
 */
export type Mode = "imp" | "acc" | "imm" | "zp" | "zpx" | "zpy" | "abs" | "abx" | "aby" | "ind" | "izx" | "izy" | "rel";

const TABLE: Record<string, Partial<Record<Mode, number>>> = {
  ADC: { imm: 0x69, zp: 0x65, zpx: 0x75, abs: 0x6d, abx: 0x7d, aby: 0x79, izx: 0x61, izy: 0x71 },
  AND: { imm: 0x29, zp: 0x25, zpx: 0x35, abs: 0x2d, abx: 0x3d, aby: 0x39, izx: 0x21, izy: 0x31 },
  ASL: { acc: 0x0a, zp: 0x06, zpx: 0x16, abs: 0x0e, abx: 0x1e },
  BCC: { rel: 0x90 }, BCS: { rel: 0xb0 }, BEQ: { rel: 0xf0 }, BMI: { rel: 0x30 },
  BNE: { rel: 0xd0 }, BPL: { rel: 0x10 }, BVC: { rel: 0x50 }, BVS: { rel: 0x70 },
  BIT: { zp: 0x24, abs: 0x2c },
  BRK: { imp: 0x00 }, CLC: { imp: 0x18 }, CLD: { imp: 0xd8 }, CLI: { imp: 0x58 }, CLV: { imp: 0xb8 },
  CMP: { imm: 0xc9, zp: 0xc5, zpx: 0xd5, abs: 0xcd, abx: 0xdd, aby: 0xd9, izx: 0xc1, izy: 0xd1 },
  CPX: { imm: 0xe0, zp: 0xe4, abs: 0xec },
  CPY: { imm: 0xc0, zp: 0xc4, abs: 0xcc },
  DEC: { zp: 0xc6, zpx: 0xd6, abs: 0xce, abx: 0xde },
  DEX: { imp: 0xca }, DEY: { imp: 0x88 },
  EOR: { imm: 0x49, zp: 0x45, zpx: 0x55, abs: 0x4d, abx: 0x5d, aby: 0x59, izx: 0x41, izy: 0x51 },
  INC: { zp: 0xe6, zpx: 0xf6, abs: 0xee, abx: 0xfe },
  INX: { imp: 0xe8 }, INY: { imp: 0xc8 },
  JMP: { abs: 0x4c, ind: 0x6c },
  JSR: { abs: 0x20 },
  LDA: { imm: 0xa9, zp: 0xa5, zpx: 0xb5, abs: 0xad, abx: 0xbd, aby: 0xb9, izx: 0xa1, izy: 0xb1 },
  LDX: { imm: 0xa2, zp: 0xa6, zpy: 0xb6, abs: 0xae, aby: 0xbe },
  LDY: { imm: 0xa0, zp: 0xa4, zpx: 0xb4, abs: 0xac, abx: 0xbc },
  LSR: { acc: 0x4a, zp: 0x46, zpx: 0x56, abs: 0x4e, abx: 0x5e },
  NOP: { imp: 0xea },
  ORA: { imm: 0x09, zp: 0x05, zpx: 0x15, abs: 0x0d, abx: 0x1d, aby: 0x19, izx: 0x01, izy: 0x11 },
  PHA: { imp: 0x48 }, PHP: { imp: 0x08 }, PLA: { imp: 0x68 }, PLP: { imp: 0x28 },
  ROL: { acc: 0x2a, zp: 0x26, zpx: 0x36, abs: 0x2e, abx: 0x3e },
  ROR: { acc: 0x6a, zp: 0x66, zpx: 0x76, abs: 0x6e, abx: 0x7e },
  RTI: { imp: 0x40 }, RTS: { imp: 0x60 },
  SBC: { imm: 0xe9, zp: 0xe5, zpx: 0xf5, abs: 0xed, abx: 0xfd, aby: 0xf9, izx: 0xe1, izy: 0xf1 },
  SEC: { imp: 0x38 }, SED: { imp: 0xf8 }, SEI: { imp: 0x78 },
  STA: { zp: 0x85, zpx: 0x95, abs: 0x8d, abx: 0x9d, aby: 0x99, izx: 0x81, izy: 0x91 },
  STX: { zp: 0x86, zpy: 0x96, abs: 0x8e },
  STY: { zp: 0x84, zpx: 0x94, abs: 0x8c },
  TAX: { imp: 0xaa }, TAY: { imp: 0xa8 }, TSX: { imp: 0xba }, TXA: { imp: 0x8a }, TXS: { imp: 0x9a }, TYA: { imp: 0x98 },
};

const SIZE: Record<Mode, number> = { imp: 1, acc: 1, imm: 2, zp: 2, zpx: 2, zpy: 2, abs: 3, abx: 3, aby: 3, ind: 3, izx: 2, izy: 2, rel: 2 };

export const OPCODES: ({ mnemonic: string; mode: Mode } | undefined)[] = new Array(256);
for (const [mn, modes] of Object.entries(TABLE)) {
  for (const [mode, op] of Object.entries(modes)) OPCODES[op!] = { mnemonic: mn, mode: mode as Mode };
}

const h2 = (v: number) => v.toString(16).toUpperCase().padStart(2, "0");
const h4 = (v: number) => v.toString(16).toUpperCase().padStart(4, "0");

export function disassemble(read: (a: number) => number, pc: number): { text: string; size: number } {
  const op = read(pc);
  const d = OPCODES[op];
  if (!d) return { text: `.byte $${h2(op)}`, size: 1 };
  const lo = read((pc + 1) & 0xffff);
  const hi = read((pc + 2) & 0xffff);
  const w = (hi << 8) | lo;
  const operand: Record<Mode, string> = {
    imp: "", acc: " A", imm: ` #$${h2(lo)}`, zp: ` $${h2(lo)}`, zpx: ` $${h2(lo)},X`, zpy: ` $${h2(lo)},Y`,
    abs: ` $${h4(w)}`, abx: ` $${h4(w)},X`, aby: ` $${h4(w)},Y`, ind: ` ($${h4(w)})`,
    izx: ` ($${h2(lo)},X)`, izy: ` ($${h2(lo)}),Y`,
    rel: ` $${h4((pc + 2 + ((lo << 24) >> 24)) & 0xffff)}`,
  };
  return { text: d.mnemonic + operand[d.mode], size: SIZE[d.mode] };
}

export interface AsmResult {
  bytes: number[];
  /** adres -> kaynak satır numarası */
  lineOf: Map<number, number>;
}

/**
 * Söz dizimi: `etiket:`, `LDA #$10`, `STA $0200,X`, `JMP dongu`, `.byte $01, 2`, `; yorum`.
 * Sayılar: $hex, %ikili, ondalık. Program $0000'dan başlar (`* = $adres` ile değiştirilebilir).
 */
export function assemble(source: string): AsmResult {
  const lines = source.split("\n");
  const labels = new Map<string, number>();

  const parseNum = (s: string, line: number): number | string => {
    s = s.trim();
    if (s.startsWith("$")) return parseInt(s.slice(1), 16);
    if (s.startsWith("%")) return parseInt(s.slice(1), 2);
    if (/^\d+$/.test(s)) return parseInt(s, 10);
    if (/^[A-Za-z_][\w]*$/.test(s)) return s;
    throw new Error(`Satır ${line + 1}: anlaşılmayan sayı '${s}'`);
  };

  type Parsed = { line: number; addr: number; mn: string; mode: Mode; arg: number | string | null } | { line: number; addr: number; bytes: (number | string)[] };

  const parsed: Parsed[] = [];
  let pc = 0;
  lines.forEach((raw, line) => {
    let text = raw.replace(/;.*$/, "").trim();
    if (!text) return;
    const lab = text.match(/^([A-Za-z_]\w*):\s*(.*)$/);
    if (lab) {
      if (labels.has(lab[1])) throw new Error(`Satır ${line + 1}: '${lab[1]}' etiketi iki kez tanımlı`);
      labels.set(lab[1], pc);
      text = lab[2].trim();
      if (!text) return;
    }
    const org = text.match(/^\*\s*=\s*(.+)$/);
    if (org) {
      const v = parseNum(org[1], line);
      if (typeof v !== "number") throw new Error(`Satır ${line + 1}: adres sayı olmalı`);
      pc = v;
      return;
    }
    if (/^\.byte\b/i.test(text)) {
      const bytes = text.slice(5).split(",").map((s) => parseNum(s, line));
      parsed.push({ line, addr: pc, bytes });
      pc += bytes.length;
      return;
    }
    const m = text.match(/^([A-Za-z]{3})\s*(.*)$/);
    if (!m) throw new Error(`Satır ${line + 1}: anlaşılmayan komut '${text}'`);
    const mn = m[1].toUpperCase();
    const modes = TABLE[mn];
    if (!modes) throw new Error(`Satır ${line + 1}: bilinmeyen komut '${mn}'`);
    const op = m[2].replace(/\s+/g, "");
    let mode: Mode;
    let arg: number | string | null = null;
    let g: RegExpMatchArray | null;
    if (!op) mode = modes.imp !== undefined ? "imp" : "acc";
    else if (/^A$/i.test(op)) mode = "acc";
    else if (op.startsWith("#")) { mode = "imm"; arg = parseNum(op.slice(1), line); }
    else if ((g = op.match(/^\((.+),X\)$/i))) { mode = "izx"; arg = parseNum(g[1], line); }
    else if ((g = op.match(/^\((.+)\),Y$/i))) { mode = "izy"; arg = parseNum(g[1], line); }
    else if ((g = op.match(/^\((.+)\)$/))) { mode = "ind"; arg = parseNum(g[1], line); }
    else if (modes.rel !== undefined) { mode = "rel"; arg = parseNum(op, line); }
    else {
      const idx = op.match(/^(.+),([XY])$/i);
      arg = parseNum(idx ? idx[1] : op, line);
      const small = typeof arg === "number" && arg < 256;
      const reg = idx ? idx[2].toUpperCase() : "";
      const zpMode: Mode = reg === "X" ? "zpx" : reg === "Y" ? "zpy" : "zp";
      const absMode: Mode = reg === "X" ? "abx" : reg === "Y" ? "aby" : "abs";
      mode = small && modes[zpMode] !== undefined ? zpMode : absMode;
    }
    if (modes[mode] === undefined) throw new Error(`Satır ${line + 1}: ${mn} bu adresleme kipini desteklemiyor`);
    parsed.push({ line, addr: pc, mn, mode, arg });
    pc += SIZE[mode];
  });

  const resolve = (v: number | string, line: number) => {
    if (typeof v === "number") return v;
    const a = labels.get(v);
    if (a === undefined) throw new Error(`Satır ${line + 1}: tanımsız etiket '${v}'`);
    return a;
  };

  const out: number[] = [];
  const lineOf = new Map<number, number>();
  const put = (addr: number, b: number) => { out[addr] = b & 0xff; };
  for (const p of parsed) {
    lineOf.set(p.addr, p.line);
    if ("bytes" in p) { p.bytes.forEach((b, i) => put(p.addr + i, resolve(b, p.line))); continue; }
    put(p.addr, TABLE[p.mn][p.mode]!);
    if (p.arg === null) continue;
    const v = resolve(p.arg, p.line);
    if (p.mode === "rel") {
      const off = v - (p.addr + 2);
      if (off < -128 || off > 127) throw new Error(`Satır ${p.line + 1}: dallanma hedefi çok uzak`);
      put(p.addr + 1, off);
    } else if (SIZE[p.mode] === 2) put(p.addr + 1, v);
    else { put(p.addr + 1, v); put(p.addr + 2, v >> 8); }
  }
  return { bytes: Array.from(out, (b) => b ?? 0), lineOf };
}
