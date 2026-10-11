// Editördeki kaynağın dili: C mi, CPU16 assembly'si mi? Örnek seçilince dil örnekten gelir; kullanıcı
// yazdıkça içerikten tahmin edilir (elle seçilen dil bir sonraki örnek seçimine kadar korunur).

export type Dil = "c" | "asm";

const C_IZLERI = [
  /^\s*#\s*(include|define|if|ifdef|ifndef|endif)\b/m,
  /\b(int|void|char|unsigned|long|short|static|struct|enum|const)\s+\**\s*[A-Za-z_]\w*\s*[([=;,]/,
  /\b(return|while|for|if|else|switch)\b[^:\n]*[({;]/,
  /\/\*|\*\/|^\s*\/\//m,
  /[{}]/,
  /\b(printf|puts|putchar|bios_\w+)\s*\(/,
];

const ASM_IZLERI = [
  /^\s*\.(org|word|byte|ascii|asciz|equ|space|align|include|global)\b/im,
  /^\s*(?:[A-Za-z_.][\w.]*:\s*)?(LI|LUI|ADDI?|SUBI?|ANDI?|ORI?|XORI?|CMPI?|MOV|NOT|NEG|SH[LR]|SAR|RO[LR]|SXB|LW|SW|LBU|SB|JALR?|CALL|RET|RETI|PUSH|POP|B(EQ|NE|CS|CC|MI|PL|VS|VC|HI|LS|GE|LT|GT|LE|AL)|HALT|NOP|EI|DI|SWI)\b/im,
  /^\s*[A-Za-z_.][\w.]*:\s*(;.*)?$/m,
  /\br[0-7]\s*,/i,
];

/** İçerikten dil tahmini; ipucu yoksa null (o zaman mevcut seçim korunur). */
export function dilBul(kaynak: string): Dil | null {
  const c = C_IZLERI.filter((r) => r.test(kaynak)).length;
  const a = ASM_IZLERI.filter((r) => r.test(kaynak)).length;
  if (c === 0 && a === 0) return null;
  return c > a ? "c" : "asm";
}

/** Örnek adından dil: C örnekleri uzantılı ("yilan.c"), assembly örnekleri uzantısız anahtarla */
export const ornekDili = (ad: string): Dil => (ad.endsWith(".c") ? "c" : "asm");
