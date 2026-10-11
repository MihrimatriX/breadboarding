// cc16 operatör testleri: her tip için (int, unsigned, long, unsigned long, char türleri) bütün
// ikili/tekli operatörleri uç değer çiftleriyle çalıştırıp JavaScript'te hesaplanan C semantiğiyle
// karşılaştırır. Aynı ifadeler ayrıca sabit katlama (derleme zamanı) için de denenir.

import { describe, expect, it } from "vitest";
import { runC } from "./cc-helpers.ts";

interface Ty {
  c: string;
  bits: 16 | 32;
  signed: boolean;
  vals: number[];
}

const wrap = (v: number, t: Ty): number => {
  if (t.bits === 16) {
    v &= 0xffff;
    return t.signed && v >= 0x8000 ? v - 0x10000 : v;
  }
  return t.signed ? v | 0 : v >>> 0;
};

const lit = (v: number, t: Ty): string => {
  v = wrap(v, t);
  if (t.bits === 16) {
    if (!t.signed) return `${v}u`;
    return v === -32768 ? "(-32767-1)" : v < 0 ? `(${v})` : `${v}`;
  }
  if (!t.signed) return `${v}UL`;
  return v === -2147483648 ? "(-2147483647L-1)" : v < 0 ? `(${v}L)` : `${v}L`;
};

const INT: Ty = { c: "int", bits: 16, signed: true, vals: [0, 1, -1, 2, 7, -7, 100, -100, 255, 12345, 32767, -32768] };
const UINT: Ty = { c: "unsigned", bits: 16, signed: false, vals: [0, 1, 2, 7, 100, 255, 256, 12345, 32767, 32768, 40000, 65535] };
const LONG: Ty = {
  c: "long", bits: 32, signed: true,
  vals: [0, 1, -1, 3, -10, 65535, 65536, -65536, 123456789, -987654, 2147483647, -2147483648],
};
const ULONG: Ty = {
  c: "unsigned long", bits: 32, signed: false,
  vals: [0, 1, 3, 10, 65535, 65536, 100000, 123456789, 2147483647, 2147483648, 3000000000, 4294967295],
};

type Fn = (a: number, b: number, t: Ty) => number | undefined;
/** [C ifadesi, JS karşılığı, sonuç int mi (karşılaştırmalar)] */
type Op = [string, Fn, boolean?];

const mask = (t: Ty) => (t.bits === 16 ? 15 : 31);
const shr = (a: number, s: number, t: Ty) => (t.signed ? a >> s : t.bits === 16 ? a >>> s : a >>> s);
const mul = (a: number, b: number, t: Ty) => (t.bits === 16 ? a * b : Math.imul(a, b));
const minOf = (t: Ty) => (t.bits === 16 ? -32768 : -2147483648);
const divOk = (a: number, b: number, t: Ty) => b !== 0 && !(t.signed && a === minOf(t) && b === -1);

const BINOPS: Op[] = [
  ["a + b", (a, b) => a + b],
  ["a - b", (a, b) => a - b],
  ["a * b", (a, b, t) => mul(a, b, t)],
  ["a / b", (a, b, t) => (divOk(a, b, t) ? Math.trunc(a / b) : undefined)],
  ["a % b", (a, b, t) => (divOk(a, b, t) ? a % b : undefined)],
  ["a & b", (a, b) => a & b],
  ["a | b", (a, b) => a | b],
  ["a ^ b", (a, b) => a ^ b],
  ["a << (b & M)", (a, b, t) => a << (b & mask(t))],
  ["a >> (b & M)", (a, b, t) => shr(a, b & mask(t), t)],
  ["a == b", (a, b) => +(a === b), true],
  ["a != b", (a, b) => +(a !== b), true],
  ["a < b", (a, b) => +(a < b), true],
  ["a <= b", (a, b) => +(a <= b), true],
  ["a > b", (a, b) => +(a > b), true],
  ["a >= b", (a, b) => +(a >= b), true],
  ["a && b", (a, b) => +(a !== 0 && b !== 0), true],
  ["a || b", (a, b) => +(a !== 0 || b !== 0), true],
  ["a < b ? a : b", (a, b) => (a < b ? a : b)],
];

/** Sabit ikinci işlenenli işlemler (kod üreticinin özel yolları: ADDI, kaydırma, 2'nin kuvvetiyle bölme ...) */
function constOps(t: Ty): Op[] {
  const L = (v: number) => lit(v, t);
  const ops: Op[] = [];
  const add = (c: string, f: (a: number) => number | undefined, isInt = false) => ops.push([c, (a) => f(a), isInt]);
  for (const k of [1, 31, -32, 1000, -1000]) add(`a + ${L(k)}`, (a) => a + wrap(k, t));
  for (const k of [1, 32, 300]) add(`a - ${L(k)}`, (a) => a - k);
  for (const k of [2, 3, 10, 256, -3, 7]) add(`a * ${L(k)}`, (a) => mul(a, wrap(k, t), t));
  for (const k of [2, 4, 3, 10, 256, -4, -1]) {
    add(`a / ${L(k)}`, (a) => (divOk(a, wrap(k, t), t) ? Math.trunc(a / wrap(k, t)) : undefined));
    add(`a % ${L(k)}`, (a) => (divOk(a, wrap(k, t), t) ? a % wrap(k, t) : undefined));
  }
  const shifts = t.bits === 16 ? [1, 3, 4, 7, 8, 9, 15] : [1, 4, 8, 15, 16, 17, 24, 31];
  for (const s of shifts) {
    add(`a << ${s}`, (a) => a << s);
    add(`a >> ${s}`, (a) => shr(a, s, t));
  }
  for (const k of [255, 0x8001, 0xff00, 1]) add(`a & ${L(k)}`, (a) => a & wrap(k, t));
  for (const k of [0x100, 0x8000]) add(`a | ${L(k)}`, (a) => a | wrap(k, t));
  add(`a ^ ${L(0x5555)}`, (a) => a ^ 0x5555);
  for (const k of [0, 1, -1, 100, 32767, -32768]) {
    const w = wrap(k, t);
    add(`a == ${L(k)}`, (a) => +(a === w), true);
    add(`a < ${L(k)}`, (a) => +(a < w), true);
    add(`a >= ${L(k)}`, (a) => +(a >= w), true);
    add(`a > ${L(k)}`, (a) => +(a > w), true);
  }
  add("-a", (a) => -a);
  add("~a", (a) => ~a);
  add("!a", (a) => +(a === 0), true);
  add("a ? 11 : 22", (a) => (a ? 11 : 22), true);
  return ops;
}

/** Tip için test programı + beklenen sonuçlar. */
function program(t: Ty, folded: boolean): { src: string; want: (number | undefined)[] } {
  const n = t.vals.length;
  const want: (number | undefined)[] = [];
  const res = (v: number | undefined, isInt: boolean | undefined) =>
    v === undefined ? undefined : (isInt ? wrap(v, INT) : wrap(v, t)) >>> 0;
  const lines: string[] = [];
  if (!folded) {
    // değişkenlerle: döngü içinde her çift
    const body: string[] = [];
    BINOPS.forEach(([c, , isInt], idx) => {
      const expr = c.replace("M", String(mask(t)));
      const guarded = c.includes("/") || c.includes("%") ? `if (ok) r[k + ${idx}] = (unsigned long)(${expr});` : `r[k + ${idx}] = (unsigned long)(${expr});`;
      body.push(isInt ? guarded.replace("(unsigned long)", "(unsigned long)(int)") : guarded);
    });
    for (let i = 0; i < n; i++)
      for (let j = 0; j < n; j++)
        for (const [, f, isInt] of BINOPS) want.push(res(f(t.vals[i], t.vals[j], t), isInt));
    const cops = constOps(t);
    const cbody = cops.map(([c, , isInt], idx) => `r[k + ${idx}] = (unsigned long)${isInt ? "(int)" : ""}(${c});`);
    for (let i = 0; i < n; i++) for (const [, f, isInt] of cops) want.push(res(f(t.vals[i], 0, t), isInt));
    lines.push(
      `typedef ${t.c} T;`,
      `T vals[${n}] = {${t.vals.map((v) => lit(v, t)).join(", ")}};`,
      `unsigned long r[${want.length}];`,
      "int main(void) {",
      "  int i, j, k = 0, ok;",
      "  T a, b;",
      `  for (i = 0; i < ${n}; i++)`,
      `    for (j = 0; j < ${n}; j++) {`,
      "      a = vals[i]; b = vals[j];",
      `      ok = b != 0 && !(${t.signed ? "1" : "0"} && a == ${lit(minOf(t), t)} && b == ${lit(-1, t)});`,
      ...body.map((l) => `      ${l}`),
      `      k += ${BINOPS.length};`,
      "    }",
      `  for (i = 0; i < ${n}; i++) {`,
      "    a = vals[i];",
      ...cbody.map((l) => `    ${l}`),
      `    k += ${cops.length};`,
      "  }",
      "  return k;",
      "}",
    );
  } else {
    // derleme zamanı: ifadeler sabitlerle, global ilk değer olarak (kod yok)
    const items: string[] = [];
    const vals = t.vals.filter((_, i) => i % 2 === 0 || i === n - 1);
    for (const a of vals)
      for (const b of vals)
        for (const [c, f, isInt] of BINOPS) {
          const v = f(a, b, t);
          if (v === undefined) continue;
          const e = c.replace("M", String(mask(t))).replace(/\ba\b/g, lit(a, t)).replace(/\bb\b/g, lit(b, t));
          items.push(`(unsigned long)${isInt ? "(int)" : ""}(${e})`);
          want.push(res(v, isInt));
        }
    lines.push(`unsigned long r[] = {\n  ${items.join(",\n  ")}\n};`, "int main(void) { return (int)r[0]; }");
  }
  return { src: lines.join("\n"), want };
}

function check(t: Ty, folded: boolean, optimize = true) {
  const { src, want } = program(t, folded);
  const r = runC(src, { optimize });
  const bad: string[] = [];
  want.forEach((w, i) => {
    if (w === undefined) return;
    const got = r.dword("r", i);
    if (got !== w && bad.length < 10) bad.push(`#${i}: beklenen 0x${w.toString(16)}, bulunan 0x${got.toString(16)}`);
  });
  expect(bad, `${t.c}${folded ? " (sabit katlama)" : ""}`).toEqual([]);
  return want.filter((w) => w !== undefined).length;
}

describe("cc16 operatörler (uç değerler, JS referansıyla)", () => {
  for (const t of [INT, UINT, LONG, ULONG]) {
    it(`${t.c}: değişkenlerle tüm operatörler`, () => {
      expect(check(t, false)).toBeGreaterThan(1000);
    });
    it(`${t.c}: iyileştirmeler kapalıyken de aynı sonuçlar`, () => {
      expect(check(t, false, false)).toBeGreaterThan(1000);
    });
    it(`${t.c}: sabit katlama aynı sonucu verir`, () => {
      expect(check(t, true)).toBeGreaterThan(100);
    });
  }
});

describe("cc16 tip dönüşümleri ve karışık işlemler", () => {
  it("dönüşümler: char, signed char, unsigned char, short, int, unsigned, long, unsigned long", () => {
    const src = `
      long vals[] = {0, 1, -1, 127, 128, 255, 256, -128, -129, 32767, 32768, 65535, 65536, -65537, 2147483647, (-2147483647L-1)};
      unsigned long r[16 * 8];
      int main(void) {
        int i;
        for (i = 0; i < 16; i++) {
          long v = vals[i];
          r[i * 8 + 0] = (unsigned long)(char)v;
          r[i * 8 + 1] = (unsigned long)(signed char)v;
          r[i * 8 + 2] = (unsigned long)(unsigned char)v;
          r[i * 8 + 3] = (unsigned long)(short)v;
          r[i * 8 + 4] = (unsigned long)(int)v;
          r[i * 8 + 5] = (unsigned long)(unsigned)v;
          r[i * 8 + 6] = (unsigned long)(long)(int)v;
          r[i * 8 + 7] = (unsigned long)(unsigned long)(unsigned)v;
        }
        return 0;
      }`;
    const vals = [0, 1, -1, 127, 128, 255, 256, -128, -129, 32767, 32768, 65535, 65536, -65537, 2147483647, -2147483648];
    const r = runC(src);
    const s8 = (v: number) => ((v & 0xff) ^ 0x80) - 0x80;
    const s16 = (v: number) => ((v & 0xffff) ^ 0x8000) - 0x8000;
    vals.forEach((v, i) => {
      const want = [v & 0xff, s8(v), v & 0xff, s16(v), s16(v), v & 0xffff, s16(v), v & 0xffff].map((x) => x >>> 0);
      expect([...Array(8).keys()].map((k) => r.dword("r", i * 8 + k)), `değer ${v}`).toEqual(want);
    });
  });

  it("işaretli/işaretsiz karışık karşılaştırma ve aritmetik (olağan aritmetik dönüşümler)", () => {
    const r = runC(`
      int r[16];
      int main(void) {
        int m1 = -1; unsigned one = 1; long lm1 = -1; unsigned long ul1 = 1;
        unsigned char uc = 200; signed char sc = -56; char c = 200;
        r[0] = m1 < one;            /* int → unsigned: 65535 < 1 yanlış */
        r[1] = m1 < (int)one;       /* doğru */
        r[2] = lm1 < one;           /* unsigned → long: -1 < 1 doğru */
        r[3] = lm1 < ul1;           /* long → unsigned long: yanlış */
        r[4] = uc + sc;             /* int'e terfi: 144 */
        r[5] = c > 100;             /* char işaretsiz: doğru */
        r[6] = sc < 0;              /* doğru */
        r[7] = (unsigned char)(uc + 100); /* 44 */
        r[8] = sizeof(m1 + lm1);    /* 4 */
        r[9] = sizeof(one + 1);     /* 2 */
        r[10] = (one - 2) > 0;      /* unsigned: doğru */
        r[11] = -32768 == (-32767 - 1) && sizeof(-32768) == 4; /* 32768 long'dur */
        r[12] = 0xFFFF == -1;       /* 0xFFFF unsigned int: -1 → 65535, doğru */
        r[13] = 65535 == -1;        /* 65535 long: yanlış */
        r[14] = (long)m1 * 70000 / 7; /* -10000 */
        r[15] = (int)(30000 + 30000L);  /* 60000 → -5536 */
        return 0;
      }`);
    const want = [0, 1, 1, 0, 144, 1, 1, 44, 4, 2, 1, 1, 1, 0, -10000, -5536].map((v) => v & 0xffff);
    expect([...Array(16).keys()].map((i) => r.word("r", i))).toEqual(want);
  });

  it("++/-- ve bileşik atamalar her tipte (register ve bellek değişkenleri)", () => {
    const r = runC(`
      long r[24];
      long g = 100000;
      int main(void) {
        int i = 5; unsigned u = 0; long l = -1; unsigned char c = 255; signed char s = -128;
        int *p = (int *)0x5000; long *lp = (long *)0x5000; char *cp = (char *)0x5000;
        int a = 10, b = 3;
        r[0] = i++; r[1] = i; r[2] = --i; r[3] = u--; r[4] = u;
        r[5] = l++; r[6] = l; r[7] = ++c; r[8] = s--; r[9] = s;
        r[10] = (int)(p++ - (int *)0x5000) + (int)(p - (int *)0x5000);
        r[11] = (int)((char *)++lp - (char *)0x5000);
        r[12] = (int)(cp += 7, cp - (char *)0x5000);
        a += b; r[13] = a; a -= 20; r[14] = a; a *= -3; r[15] = a; a /= 2; r[16] = a;
        a %= 7; r[17] = a; a <<= 3; r[18] = a; a >>= 1; r[19] = a; a &= 0xF0; r[20] = a;
        a |= 5; r[21] = a; a ^= 0xFF; r[22] = a;
        g *= 3; g -= 1; g /= 2; g <<= 1; r[23] = g;
        return 0;
      }`);
    const want = [5, 6, 5, 0, 65535, -1, 0, 0, -128, 127, 1, 4, 7, 13, -7, 21, 10, 3, 24, 12, 0, 5, 250, 299998];
    expect([...Array(24).keys()].map((i) => r.dword("r", i) | 0)).toEqual(want);
  });
});
