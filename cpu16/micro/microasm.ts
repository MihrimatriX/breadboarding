// Mikrokod derleyicisi: cpu16.ucode metnini 8192 × 32 bit kontrol tablosuna çevirir. Saat döngüsü
// modeli (datapath.ts) tabloyu doğrudan okur; kart tablodan üretilen kapı devresini kullanır
// (board/kontrol.ts).

import { ALUOP, BUS, IMM, RSEL, ROM_WORDS, encodeControl, romAddress, type Control, type Signal } from "./control.ts";

export interface MicroError {
  line: number;
  message: string;
}

export interface MicroRoutine {
  name: string;
  line: number;
  steps: { line: number; text: string; word: number }[];
}

export interface MicroResult {
  rom: Uint32Array;
  fetch: MicroRoutine | null;
  irq: MicroRoutine | null;
  routines: (MicroRoutine & { ops: number[]; f3s: number[]; conds: number[] })[];
  errors: MicroError[];
}

class StepError extends Error {}

const EXTRA: Record<string, Signal> = {
  "PC+2": "PC_INC", FLAGS_L: "FLAGS_L", I_SET: "I_SET", I_CLR: "I_CLR",
  HALT: "HALT", ILLEGAL: "ILLEGAL", END: "END",
};

function lookup<T extends Record<string, number>>(table: T, key: string, what: string): number {
  const v = (table as Record<string, number>)[key.toUpperCase()];
  if (v === undefined) throw new StepError(`Bilinmeyen ${what}: '${key}'`);
  return v;
}

/** "KAYNAK -> hedef, hedef ; ek" satırını kontrol kelimesine çevirir. */
export function parseStep(text: string): Partial<Control> {
  const [main, extra = ""] = text.split(";");
  const m = /^\s*(\S+)\s*->\s*(.+?)\s*$/.exec(main);
  if (!m) throw new StepError(`'KAYNAK -> hedef' bekleniyordu: '${text.trim()}'`);
  const c: Partial<Control> & { sig: Set<Signal> } = { sig: new Set() };
  let rsel: number | null = null;
  const useReg = (sel: string) => {
    const r = lookup(RSEL, sel, "register seçimi");
    if (rsel !== null && rsel !== r) throw new StepError("Aynı adımda iki farklı register seçilemez");
    rsel = r;
  };
  let byteMode: boolean | null = null;
  const useByte = (b: boolean) => {
    if (byteMode !== null && byteMode !== b) throw new StepError("MEM ve MEM.B aynı adımda kullanılamaz");
    byteMode = b;
  };

  // kaynak
  const src = m[1];
  let mm: RegExpExecArray | null;
  if (src === "-") c.bus = BUS.NONE;
  else if (src === "PC") c.bus = BUS.PC;
  else if (src === "MEM" || src === "MEM.B") { c.bus = BUS.MEM; useByte(src === "MEM.B"); }
  else if (src === "FLAGS") c.bus = BUS.FLAGS;
  else if ((mm = /^REG\((\w+)\)$/i.exec(src))) { c.bus = BUS.REG; useReg(mm[1]); }
  else if ((mm = /^IMM\((\w+)\)$/i.exec(src))) { c.bus = BUS.IMM; c.imm = lookup(IMM, mm[1], "sabit seçimi"); }
  else if ((mm = /^ALU\((\w+)\)$/i.exec(src))) {
    c.bus = BUS.ALU;
    if (mm[1].toUpperCase() === "IR") c.aluIr = true;
    else c.aluOp = lookup(ALUOP, mm[1], "ALU işlemi");
  } else throw new StepError(`Bilinmeyen kaynak '${src}'`);

  // hedefler
  for (const d of m[2].split(",").map((s) => s.trim())) {
    if (d === "-") continue;
    if (c.bus === BUS.NONE) throw new StepError("Kaynak '-' iken hedef olamaz");
    if (d === "TA") c.sig.add("TA_L");
    else if (d === "TB") c.sig.add("TB_L");
    else if (d === "MAR") c.sig.add("MAR_L");
    else if (d === "IR") c.sig.add("IR_L");
    else if (d === "PC") c.sig.add("PC_L");
    else if (d === "FLAGS") c.sig.add("FLAGS_BUS_L");
    else if (d === "MEM" || d === "MEM.B") {
      if (c.bus === BUS.MEM) throw new StepError("Bellekten belleğe tek adımda kopyalanamaz");
      c.sig.add("MEM_W");
      useByte(d === "MEM.B");
    } else if ((mm = /^REG\((\w+)\)$/i.exec(d))) { c.sig.add("REG_W"); useReg(mm[1]); }
    else throw new StepError(`Bilinmeyen hedef '${d}'`);
  }

  // ek sinyaller
  for (const e of extra.trim().split(/\s+/).filter(Boolean)) {
    const s = EXTRA[e.toUpperCase()];
    if (!s) throw new StepError(`Bilinmeyen sinyal '${e}'`);
    c.sig.add(s);
  }
  if (c.sig.has("FLAGS_L") && c.bus !== BUS.ALU) throw new StepError("FLAGS_L sadece ALU kaynakken anlamlı");
  if (byteMode) c.sig.add("BYTE");
  c.rsel = rsel ?? 0;
  return c;
}

function range(spec: string, max: number, what: string): number[] {
  const m = /^(\d+)(?:-(\d+))?$/.exec(spec);
  if (!m) throw new StepError(`${what} aralığı anlaşılamadı: '${spec}'`);
  const a = Number(m[1]);
  const b = m[2] === undefined ? a : Number(m[2]);
  if (a > b || b > max) throw new StepError(`${what} aralık dışı: '${spec}'`);
  return Array.from({ length: b - a + 1 }, (_, i) => a + i);
}

const MAX_STEPS = 16;

export function assembleMicrocode(source: string): MicroResult {
  const errors: MicroError[] = [];
  const routines: MicroResult["routines"] = [];
  let fetch: MicroRoutine | null = null;
  let irq: MicroRoutine | null = null;
  let cur: MicroRoutine | null = null;

  source.split(/\r?\n/).forEach((raw, i) => {
    const line = i + 1;
    const noComment = stripComment(raw).trim();
    if (!noComment) return;
    try {
      const head = /^(fetch|irq|op\s+[\d-]+(?:\s+f3\s+[\d-]+)?(?:\s+cond\s+[01])?)\s*:$/i.exec(noComment);
      if (head) {
        const h = head[1].toLowerCase();
        cur = { name: h, line, steps: [] };
        if (h === "fetch") fetch = cur;
        else if (h === "irq") irq = cur;
        else {
          const m = /^op\s+([\d-]+)(?:\s+f3\s+([\d-]+))?(?:\s+cond\s+([01]))?$/.exec(h)!;
          routines.push({
            ...cur,
            ops: range(m[1], 15, "op"),
            f3s: m[2] ? range(m[2], 7, "f3") : [0, 1, 2, 3, 4, 5, 6, 7],
            conds: m[3] ? [Number(m[3])] : [0, 1],
          });
          cur = routines[routines.length - 1];
        }
        return;
      }
      if (!cur) throw new StepError("Adım bir bölüm başlığının (fetch:, irq:, op N:) altında olmalı");
      (cur as MicroRoutine).steps.push({ line, text: noComment, word: encodeControl(parseStep(noComment)) });
    } catch (e) {
      errors.push({ line, message: (e as Error).message });
    }
  });

  const rom = new Uint32Array(ROM_WORDS);
  const illegal = encodeControl({ sig: new Set<Signal>(["ILLEGAL", "END"]) });
  const fetchSteps = (fetch as MicroRoutine | null)?.steps ?? [];
  const irqSteps = (irq as MicroRoutine | null)?.steps ?? [];
  if (!fetch) errors.push({ line: 0, message: "fetch: bölümü yok" });
  if (!irq) errors.push({ line: 0, message: "irq: bölümü yok" });
  if (fetchSteps.length !== 2) errors.push({ line: (fetch as MicroRoutine | null)?.line ?? 0, message: "fetch tam 2 adım olmalı" });
  if (irqSteps.length > MAX_STEPS) errors.push({ line: 0, message: "irq çok uzun" });
  if (irqSteps.length && !(irqSteps[irqSteps.length - 1].word >>> 31)) {
    errors.push({ line: irqSteps[irqSteps.length - 1].line, message: "irq END ile bitmeli" });
  }

  // önce her yeri ILLEGAL ile doldur, sonra getirme ve bölümleri yaz
  const owner = new Map<number, number>();
  for (let op = 0; op < 16; op++)
    for (let f3 = 0; f3 < 8; f3++)
      for (const cond of [false, true]) {
        fetchSteps.forEach((s, k) => (rom[romAddress(false, op, f3, cond, k)] = s.word));
        rom[romAddress(false, op, f3, cond, 2)] = illegal;
        irqSteps.forEach((s, k) => (rom[romAddress(true, op, f3, cond, k)] = s.word));
      }
  for (const r of routines) {
    const last = r.steps[r.steps.length - 1];
    if (!last) { errors.push({ line: r.line, message: "Bölüm boş" }); continue; }
    if (!(last.word >>> 31)) errors.push({ line: last.line, message: "Bölümün son adımı END içermeli" });
    if (r.steps.length + 2 > MAX_STEPS) errors.push({ line: r.line, message: `En fazla ${MAX_STEPS - 2} adım` });
    for (const op of r.ops)
      for (const f3 of r.f3s)
        for (const cond of r.conds) {
          const key = (op << 4) | (f3 << 1) | cond;
          if (owner.has(key)) {
            errors.push({ line: r.line, message: `op ${op} f3 ${f3} cond ${cond} satır ${owner.get(key)}'de zaten tanımlı` });
            continue;
          }
          owner.set(key, r.line);
          r.steps.forEach((s, k) => (rom[romAddress(false, op, f3, cond === 1, k + 2)] = s.word));
        }
  }
  errors.sort((a, b) => a.line - b.line);
  return { rom, fetch, irq, routines, errors };
}

function stripComment(line: string): string {
  // ';' ilk kez "->" ifadesinden sonra ek sinyalleri ayırır; ikinci ';' ve sonrası yorumdur.
  // Satır ';' ile başlıyorsa tamamı yorumdur.
  const t = line.trimStart();
  if (t.startsWith(";")) return "";
  const first = line.indexOf(";");
  if (first < 0) return line;
  if (!line.slice(0, first).includes("->")) return line.slice(0, first); // başlık satırı + yorum
  const second = line.indexOf(";", first + 1);
  const extra = line.slice(first + 1, second < 0 ? undefined : second);
  // ek sinyal kısmı sadece büyük harf sinyal adlarından oluşur; değilse yorumdur
  if (/^[\sA-Z_+0-9]*$/.test(extra)) return second < 0 ? line : line.slice(0, second);
  return line.slice(0, first);
}

