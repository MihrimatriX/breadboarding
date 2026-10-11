// cc16 C derleyicisi: dil özellikleri, ABI, çalışma zamanı kütüphanesi ve bellek yerleşimi testleri.
// (Operatörlerin uç değer testleri cc-ops.test.ts'de, önişlemci ve bağlayıcı cc-link.test.ts'de.)

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildProgram } from "../cc/index.ts";
import { LIB as VITE_LIB } from "../cc/lib-vite.ts";
import { runProgram } from "../cc/run.ts";
import { SimpleBus } from "../emu/cpu.ts";
import { Datapath } from "../micro/datapath.ts";
import { assembleMicrocode } from "../micro/microasm.ts";
import { build, errorsOf, evalInt, exitOf, LIB, out, runC } from "./cc-helpers.ts";

describe("temel dil", () => {
  it("main'in dönüş değeri r0'da, HALT ile biter", () => {
    expect(exitOf("int main(void) { return 42; }")).toBe(42);
    expect(exitOf("int main(void) { return -5; }")).toBe(-5);
    expect(exitOf("int main(void) { }")).toBe(0);
  });

  it("if / else, while, do-while, for, break, continue", () => {
    expect(
      exitOf(`int main(void) {
        int i, s = 0, n = 0;
        for (i = 0; i < 100; i++) {
          if (i % 3 == 0) continue;
          if (i > 50) break;
          s += i;
        }
        i = 10;
        while (i) { n += i; i -= 2; }
        do { n++; } while (n < 5);
        do n += 1000; while (0);
        return s + n;
      }`),
    ).toBe(867 + 31 + 1000);
  });

  it("iç içe döngülerde break/continue doğru döngüyü etkiler", () => {
    expect(
      exitOf(`int main(void) {
        int i, j, c = 0;
        for (i = 0; i < 10; i++) {
          for (j = 0; j < 10; j++) {
            if (j == 5) break;
            if (j & 1) continue;
            c++;
          }
          if (i == 7) break;
        }
        return c * 100 + i;
      }`),
    ).toBe(3 * 8 * 100 + 7);
  });

  it("&& ve || kısa devre yapar, yan etkiler doğru sırada", () => {
    expect(
      exitOf(`int n;
        int f(int v) { n = n * 10 + v; return v; }
        int main(void) {
          int r = (f(1) && f(0) && f(2)) + (f(3) || f(4)) * 10 + (f(0) || f(5)) * 100;
          return n == 10305 ? r : -n;
        }`),
    ).toBe(110);
  });

  it("?: ve virgül operatörü", () => {
    expect(evalInt("(a = 3, b = a * 2, a > b ? a : b) + (a < 0 ? 100 : -1)", "int a, b;")).toBe(5);
  });

  it("goto ve etiketler", () => {
    expect(
      exitOf(`int main(void) {
        int i = 0, s = 0;
      again:
        s += i;
        if (++i < 10) goto again;
        goto end;
        s = -1;
      end:
        return s;
      }`),
    ).toBe(45);
  });

  it("özyineleme: derinlik 1000 ve Ackermann", () => {
    const r = runC(`
      int depth(int n) { return n == 0 ? 0 : 1 + depth(n - 1); }
      long sum(int n) { return n == 0 ? 0 : n + sum(n - 1); }
      int ack(int m, int n) {
        if (m == 0) return n + 1;
        if (n == 0) return ack(m - 1, 1);
        return ack(m - 1, ack(m, n - 1));
      }
      long r[3];
      int main(void) { r[0] = depth(1000); r[1] = sum(1500); r[2] = ack(2, 3); return 0; }`);
    expect(r.dword("r", 0)).toBe(1000);
    expect(r.dword("r", 1)).toBe(1125750);
    expect(r.dword("r", 2)).toBe(9);
    expect(r.cpu.regs[6]).toBe(0xff00); // yığın dengede
  });

  it("karşılıklı özyineleme ve ileri bildirim", () => {
    expect(
      exitOf(`int is_odd(int n);
        int is_even(int n) { return n == 0 ? 1 : is_odd(n - 1); }
        int is_odd(int n) { return n == 0 ? 0 : is_even(n - 1); }
        int main(void) { return is_even(100) * 10 + is_odd(77); }`),
    ).toBe(11);
  });

  it("çok sayıda argüman (yığından geçen argümanlar, long'un r3/yığın arasında bölünmesi)", () => {
    const r = runC(`
      long f(int a, int b, int c, long d, int e, long g, char h) {
        return a + b * 2 + c * 3 + d * 4 + e * 5 + g * 6 + h * 7;
      }
      long g6(long a, long b, long c) { return a - b + c; }
      int many(int a, int b, int c, int d, int e, int f, int g, int h) {
        return a - b + c - d + e - f + g - h;
      }
      long r[3];
      int main(void) {
        r[0] = f(1, 2, 3, 100000, 5, -7, 'A');
        r[1] = g6(1000000, -2000000, 3);
        r[2] = many(1, 2, 3, 4, 5, 6, 7, 800);
        return 0;
      }`);
    expect(r.dword("r", 0) | 0).toBe(1 + 4 + 9 + 400000 + 25 - 42 + 65 * 7);
    expect(r.dword("r", 1)).toBe(3000003);
    expect(r.dword("r", 2) | 0).toBe(1 - 2 + 3 - 4 + 5 - 6 + 7 - 800);
  });

  it("argümanlarda iç içe çağrılar ve register baskısı", () => {
    expect(
      exitOf(`int add(int a, int b) { return a + b; }
        int mul(int a, int b) { return a * b; }
        int f4(int a, int b, int c, int d) { return a * 1000 + b * 100 + c * 10 + d; }
        int main(void) {
          int x = 2, y = 3;
          return f4(add(x, 1) - 2, mul(add(x, y), 1) - 3, add(mul(x, y), add(1, 1)) - 5, mul(mul(x, x), mul(y, 1)) - 8);
        }`),
    ).toBe(1234);
  });

  it("büyük yerel diziler (uzak yığın ofsetleri)", () => {
    expect(
      exitOf(`int main(void) {
        int a[100]; char b[300]; long c[20]; int i, s = 0;
        for (i = 0; i < 100; i++) a[i] = i;
        for (i = 0; i < 300; i++) b[i] = i;
        for (i = 0; i < 20; i++) c[i] = 100000L * i;
        for (i = 0; i < 100; i++) s += a[i];
        for (i = 0; i < 300; i++) s += b[i];
        return s + (int)(c[19] / 100000) + (b[299] == 43);
      }`),
    ).toBe(s16(4950 + sumBytes() + 19 + 1));
  });

  it("static yerel değişkenler değerini korur", () => {
    expect(
      exitOf(`int counter(void) { static int n = 10; return n++; }
        int main(void) { counter(); counter(); return counter(); }`),
    ).toBe(12);
  });

  it("blok kapsamı ve gölgeleme", () => {
    expect(
      exitOf(`int x = 1;
        int main(void) {
          int r = x;
          { int x = 10; r += x; { int x = 100; r += x; } r += x; }
          for (int x = 0; x < 3; x++) r += 1000;
          return r + x;
        }`),
    ).toBe(1 + 10 + 100 + 10 + 3000 + 1);
  });
});

function s16(v: number): number {
  v &= 0xffff;
  return v >= 0x8000 ? v - 0x10000 : v;
}

function sumBytes(): number {
  let s = 0;
  for (let i = 0; i < 300; i++) s += i & 0xff;
  return s;
}

describe("işaretçiler ve diziler", () => {
  it("farklı eleman boyutlarında işaretçi aritmetiği ve farkı", () => {
    const r = runC(`
      struct S { int a; char b; long c; };
      int r[12];
      int main(void) {
        char *cp = (char *)0x6000; int *ip = (int *)0x6000; long *lp = (long *)0x6000;
        struct S *sp = (struct S *)0x6000; struct S arr[5];
        r[0] = (int)(cp + 3);  r[1] = (int)(ip + 3);  r[2] = (int)(lp + 3);  r[3] = (int)(sp + 3);
        r[4] = (int)(ip - 2);  r[5] = (int)((long *)0x6010 - lp); r[6] = (int)(&arr[4] - &arr[1]);
        r[7] = sizeof(struct S); r[8] = (int)((char *)&arr[2] - (char *)arr);
        r[9] = &arr[3] > &arr[1]; r[10] = (int)(&sp[2].c) - 0x6000; r[11] = (int)(3 + ip);
        return 0;
      }`);
    expect([...Array(12).keys()].map((i) => r.word("r", i))).toEqual([
      0x6003, 0x6006, 0x600c, 0x6018, 0x5ffc, 4, 3, 8, 16, 1, 16 + 4, 0x6006,
    ]);
  });

  it("işaretçiyle dizi gezme, *p++, iki boyutlu diziler", () => {
    expect(
      exitOf(`int m[3][4];
        int main(void) {
          int i, j, s = 0, *p = &m[0][0];
          for (i = 0; i < 3; i++) for (j = 0; j < 4; j++) m[i][j] = i * 10 + j;
          while (p < &m[3][0]) s += *p++;
          return s + m[2][3] * 1000 + (int)sizeof m + (int)sizeof m[1];
        }`),
    ).toBe(4 * (0 + 10 + 20) + 3 * 6 + 23000 + 24 + 8);
  });

  it("işaretçiye işaretçi, adres alma, dizinin işaretçiye dönüşmesi", () => {
    expect(
      exitOf(`void set(int **pp, int *t) { *pp = t; }
        void inc(int *p) { (*p)++; }
        int main(void) {
          int a = 5, b = 7, *p = &a, **pp = &p;
          inc(&a); set(pp, &b); inc(p); **pp += 100;
          return a * 1000 + b;
        }`),
    ).toBe(6 * 1000 + 108);
  });

  it("fonksiyon işaretçileri ve fonksiyon işaretçisi dizileri", () => {
    expect(
      exitOf(`typedef int (*op)(int, int);
        int add(int a, int b) { return a + b; }
        int sub(int a, int b) { return a - b; }
        int mul(int a, int b) { return a * b; }
        op table[3] = {add, sub, mul};
        int apply(op f, int a, int b) { return f(a, b); }
        int main(void) {
          int (*f)(int, int) = &sub;
          return table[0](1, 2) * 100 + apply(table[2], 3, 4) + (*f)(10, 3) * 1000 + apply(mul, 0, 1);
        }`),
    ).toBe(300 + 12 + 7000);
  });

  it("char dizileri ve string sabitleri, kaçış dizileri", () => {
    const r = runC(`
      char s[] = "a\\tb\\n\\x41\\101\\0z";
      char t[10] = "hi";
      const char *u = "ab" "cd";
      int r[8];
      int main(void) {
        r[0] = sizeof s; r[1] = s[1]; r[2] = s[4]; r[3] = s[5]; r[4] = s[7];
        r[5] = t[2] + t[9]; r[6] = u[3]; r[7] = sizeof "xyz";
        return 0;
      }`);
    expect([...Array(8).keys()].map((i) => r.word("r", i))).toEqual([9, 9, 0x41, 0x41, 0x7a, 0, 0x64, 4]);
  });
});

describe("struct, union, enum, typedef", () => {
  it("struct ataması ve kopyası (küçük ve büyük)", () => {
    expect(
      exitOf(`struct P { int x, y; };
        struct Big { long a[10]; char tag; };
        struct Big g;
        int main(void) {
          struct P a = {1, 2}, b; struct Big x, y;
          int i;
          b = a; b.x = 100;
          for (i = 0; i < 10; i++) x.a[i] = i * 1000L;
          x.tag = 'q';
          y = x; g = y; x.a[3] = 0;
          return (a.x + b.x) + (int)(g.a[9] / 1000) * 1000 + (y.tag == 'q') * 10000 + (int)g.a[3] / 1000;
        }`),
    ).toBe(101 + 9000 + 10000 + 3);
  });

  it("struct değerle geçirme ve döndürme", () => {
    const r = runC(`
      struct V { int x, y, z; };
      struct L { long a, b; };
      struct V make(int x, int y, int z) { struct V v; v.x = x; v.y = y; v.z = z; return v; }
      struct V vadd(struct V a, struct V b) { a.x += b.x; a.y += b.y; a.z += b.z; return a; }
      struct L lswap(struct L l) { struct L r; r.a = l.b; r.b = l.a; return r; }
      int dot(struct V a, struct V b) { return a.x * b.x + a.y * b.y + a.z * b.z; }
      int r[6]; long q[2];
      int main(void) {
        struct V a = make(1, 2, 3), b = make(10, 20, 30), c;
        struct L l = {123456L, -7L};
        c = vadd(a, b);
        r[0] = c.x; r[1] = c.y; r[2] = c.z; r[3] = dot(a, b); r[4] = vadd(a, a).z; r[5] = make(9, 8, 7).y;
        l = lswap(l); q[0] = l.a; q[1] = l.b;
        return 0;
      }`);
    expect([...Array(6).keys()].map((i) => r.word("r", i))).toEqual([11, 22, 33, 140, 6, 8]);
    expect(r.dword("q", 0) | 0).toBe(-7);
    expect(r.dword("q", 1)).toBe(123456);
  });

  it("fonksiyon işaretçisiyle struct döndürme (5+ kelime argüman), özyinelemeli struct dönüşü", () => {
    expect(
      out(`#include <stdio.h>
        struct R { long a; int b[3]; };
        typedef struct R (*mk_fn)(int, long, int, int, char);
        struct R mk(int x, long y, int z, int w, char c) {
          struct R r; r.a = y + x; r.b[0] = z; r.b[1] = w; r.b[2] = c; return r;
        }
        struct R rec(int n) {
          struct R r;
          if (n == 0) { r.a = 1; r.b[0] = r.b[1] = r.b[2] = 0; return r; }
          r = rec(n - 1); r.a *= 3; r.b[n % 3] += n;
          return r;
        }
        int main(void) {
          mk_fn f = mk;
          struct R r = f(1, 100000L, 3, 4, 'z'), q = rec(10);
          printf("%ld %d %d %d|%ld %d %d %d\\n", r.a, r.b[0], r.b[1], r.b[2], q.a, q.b[0], q.b[1], q.b[2]);
          return 0;
        }`),
    ).toBe("100001 3 4 122|59049 18 22 15\n");
  });

  it("işaretçi karşılaştırmaları işaretsizdir (0x8000 üstü RAM adresleri)", () => {
    expect(
      exitOf(`int main(void) {
        char *a = (char *)0x9000, *b = (char *)0x7000;
        return (a > b) + (a < b) * 2 + ((int)a > (int)b) * 4 + (a - b == 0x2000) * 8;
      }`),
    ).toBe(9);
  });

  it("iç içe struct, struct dizisi, işaretçiyle erişim (->)", () => {
    expect(
      exitOf(`struct In { char c; int v; };
        struct Out { int id; struct In in[3]; struct Out *next; };
        struct Out list[2];
        int main(void) {
          struct Out *p = list;
          list[0].next = &list[1];
          list[1].id = 7;
          p->in[2].v = 50; p->next->in[1].c = 'x';
          return p->next->id * 1000 + list[0].in[2].v + (list[1].in[1].c == 'x') + (int)sizeof(struct Out);
        }`),
    ).toBe(7000 + 50 + 1 + 2 + 12 + 2);
  });

  it("union ve enum", () => {
    expect(
      exitOf(`union U { long l; int w[2]; unsigned char b[4]; };
        enum E { A, B = 10, C, D = B * 2, E2 = -1 };
        int main(void) {
          union U u; enum E e = C;
          u.l = 0x11223344L;
          return (u.w[0] == 0x3344) + (u.w[1] == 0x1122) * 2 + (u.b[3] == 0x11) * 4 + e * 100 + D * 10 + E2 + (int)sizeof u * 1000;
        }`),
    ).toBe(7 + 1100 + 200 - 1 + 4000);
  });

  it("typedef, anonim struct/union üyeleri, sizeof ifadeleri", () => {
    expect(
      exitOf(`typedef unsigned char byte;
        typedef struct { int kind; union { int i; long l; }; } Val;
        typedef Val *ValPtr;
        int main(void) {
          Val v; ValPtr p = &v; byte b = 300;
          p->kind = 2; p->l = 70000;
          return b + (int)sizeof(Val) * 100 + (int)(v.l - 69000) + (int)sizeof(byte[7]) * 10000;
        }`),
    ).toBe(44 + 600 + 1000 + 70000 - 65536);
  });

  it("const ve volatile niteleyicileri", () => {
    expect(
      exitOf(`const int tbl[4] = {1, 2, 4, 8};
        volatile int counter;
        int main(void) {
          const int *p = tbl; int i;
          for (i = 0; i < 4; i++) counter += p[i];
          return counter;
        }`),
    ).toBe(15);
  });
});

describe("C99 ve diğer özellikler", () => {
  it("bileşik sabitler, iç içe göstergeler, __func__, register, dizi işaretçisi", () => {
    expect(
      out(`#include <stdio.h>
        #include <stddef.h>
        struct P { int x, y; };
        struct Q { char name[8]; struct P pos; int tags[2]; } qs[] = {
          { "first", { 1, 2 }, { 3, 4 } },
          { .pos.y = 9, .name = "second", .tags[1] = 7 },
          [3].pos = { 5, 6 },
        };
        int matrix[2][3] = { {1, 2, 3}, {4, 5, 6} };
        struct P *gp = &(struct P){ 11, 12 };
        int sum_row(int (*row)[3]) { int s = 0, i; for (i = 0; i < 3; i++) s += (*row)[i]; return s; }
        int dot(struct P a, struct P b) { return a.x * b.x + a.y * b.y; }
        int main(void) {
          register int i, s = 0;
          int *arr = (int[]){ 10, 20, 30 };
          struct P p = (struct P){ 3, 4 };
          for (i = 0; i < 3; i++) s += (struct P){ i, i * 2 }.y;
          printf("%d %d %d %d %d\\n", p.x + p.y, dot(p, (struct P){ .y = 1, .x = 2 }), arr[2], s, (&(struct P){ 7, 8 })->y);
          printf("%s %d %d %d | %s %d %d %d | %d %u\\n", qs[0].name, qs[0].pos.x, qs[0].pos.y, qs[0].tags[1],
                 qs[1].name, qs[1].pos.y, qs[1].tags[0], qs[1].tags[1], qs[3].pos.y, (unsigned)(sizeof qs / sizeof qs[0]));
          printf("%d %d %s %d %d\\n", sum_row(matrix + 1), gp->x + gp->y, __func__, (int)offsetof(struct Q, tags[1]), (int)sizeof(struct Q));
          return 0;
        }`),
    ).toBe("7 10 30 6 8\nfirst 1 2 4 | second 9 0 7 | 6 4\n15 23 main 14 16\n");
  });

  it("#if 0 içindeki geçersiz karakterler ve kapanmamış tırnaklar hata vermez", () => {
    expect(exitOf("#if 0\n  bu ' kapanmıyor ve ğ geçersiz \"\n#endif\nint main(void) { return 3; }")).toBe(3);
    expect(errorsOf("int main(void) { return 'ab'; }")[0].message).toMatch(/Karakter sabiti/);
    expect(errorsOf("int main(void) { int ğ = 1; return 0; }")[0].message).toMatch(/Geçersiz karakter/);
  });
});

describe("global değişkenler ve ilk değerler (ROM'dan RAM'e kopya)", () => {
  it("ilk değerli globaller RAM'de doğru, değiştirilebilir; .bss sıfır", () => {
    const r = runC(`
      int a = 1234; long b = -100000; char c = 'x'; int z1; long z2[4];
      int arr[5] = {1, 2, 3}; char str[8] = "abc"; char *msg = "hello";
      struct P { int x; char n[4]; long v; } pt = {7, "ab", 99};
      struct P pts[2] = {{1, "x", 2}, [1] = {.v = 5, .x = 3}};
      int *ptr = &arr[2]; int (*fp)(void);
      int main(void) {
        a += 1; arr[4] = 9;
        return a + (int)(b / 1000) + c + z1 + (int)z2[3] + *ptr + msg[4] + pt.n[1] + (int)pts[1].v + pts[1].x + str[2] + (fp == 0);
      }`);
    expect(r.exitCode).toBe(1235 - 100 + 120 + 0 + 0 + 3 + 111 + 98 + 5 + 3 + 99 + 1);
    expect(r.word("arr", 4)).toBe(9);
    expect(r.word("arr", 3)).toBe(0);
    expect(r.b.symbols.get("_a")!).toBeGreaterThanOrEqual(0x4000);
    expect(r.b.symbols.get("_z1")!).toBeGreaterThanOrEqual(0x4000);
  });

  it("kod ve sabitler ROM'da (0x0000–0x3FFF), değişkenler RAM'de (0x4000+)", () => {
    const b = build(`const char ro[] = "sabit"; char rw[] = "degisken"; int bss;
      int main(void) { return ro[0] + rw[0] + bss; }`);
    expect(b.errors).toEqual([]);
    expect(b.symbols.get("_main")!).toBeLessThan(0x4000);
    expect(b.symbols.get("_ro")!).toBeLessThan(0x4000);
    expect(b.symbols.get("_rw")!).toBeGreaterThanOrEqual(0x4000);
    expect(b.symbols.get("_bss")!).toBeGreaterThanOrEqual(0x4000);
    expect(b.symbols.get("__reset")).toBe(0);
    // ROM dışına (0x4000+) hiçbir bayt yazılmaz: RAM imajı açılışta crt0 tarafından kurulur
    expect(b.ranges.every(([, e]) => e <= 0x4000)).toBe(true);
  });

  it("ROM'a yazmaya çalışan program: yazma yok sayılır ve sayılır", () => {
    const b = build("int main(void) { *(int *)0x0100 = 5; return *(int *)0x0100 == 5; }");
    const r = runProgram(b.image);
    expect(r.result).toBe("halted");
    expect(r.romWrites).toBe(2);
    expect(r.exitCode).toBe(0);
  });
});

describe("switch", () => {
  const sw = (n: number) => `
    int f(int x) {
      switch (x) {
      ${Array.from({ length: n }, (_, i) => `case ${i * 3 - 6}: return ${i * 7 + 1};`).join("\n")}
      case 1000: return -1;
      default: return 99;
      }
    }`;

  it("sıkışık durumlar (atlama tablosu) ve seyrek durumlar", () => {
    const r = runC(`
      int dense(int x) {
        switch (x) { case 0: return 10; case 1: return 11; case 2: return 12; case 3: return 13;
                     case 4: return 14; case 5: return 15; case 7: return 17; default: return -1; }
      }
      ${sw(12)}
      int r[30];
      int main(void) {
        int i;
        for (i = -2; i < 10; i++) r[i + 2] = dense(i);
        for (i = 0; i < 16; i++) r[12 + i] = f(i * 3 - 9);
        r[28] = f(1000); r[29] = f(-32768);
        return 0;
      }`);
    const dense = (x: number) => (x >= 0 && x <= 5 ? 10 + x : x === 7 ? 17 : -1);
    const f = (x: number) => (x === 1000 ? -1 : x >= -6 && x <= 27 && (x + 6) % 3 === 0 ? ((x + 6) / 3) * 7 + 1 : 99);
    const want = [
      ...Array.from({ length: 12 }, (_, k) => dense(k - 2)),
      ...Array.from({ length: 16 }, (_, k) => f(k * 3 - 9)),
      -1, 99,
    ].map((v) => v & 0xffff);
    expect([...Array(30).keys()].map((i) => r.word("r", i))).toEqual(want);
  });

  it("düşme (fallthrough), default ortada, döngü içinde break/continue", () => {
    expect(
      exitOf(`int main(void) {
        int i, s = 0;
        for (i = 0; i < 6; i++) {
          switch (i) {
          case 0: s += 1;
          case 1: s += 10; break;
          default: s += 100;
          case 4: s += 1000; continue;
          case 5: break;
          }
          s += 10000;
        }
        return s;
      }`),
    ).toBe(s16(1 + 10 + 10000 + 10 + 10000 + 1100 + 1100 + 1000 + 10000));
  });

  it("long ve char üzerinde switch", () => {
    expect(
      exitOf(`int f(long v) { switch (v) { case 100000: return 1; case -1: return 2; case 5: return 3; } return 0; }
        int g(char c) { switch (c) { case 'a': case 'b': return 1; case 200: return 2; } return 0; }
        int main(void) { return f(100000) * 1000 + f(-1) * 100 + f(5) * 10 + f(6) + g('b') * 10000 + g(200) * 20000; }`),
    ).toBe(1000 + 200 + 30 + 10000 + 40000 - 65536);
  });
});

describe("32 bit (long)", () => {
  it("faktöriyel ve Fibonacci; taşma 2^32 modunda", () => {
    const r = runC(`
      unsigned long fact(int n) { return n ? n * fact(n - 1) : 1; }
      unsigned long r[4];
      int main(void) {
        unsigned long a = 0, b = 1, t; int i;
        for (i = 0; i < 47; i++) { t = a + b; a = b; b = t; }
        r[0] = fact(12); r[1] = fact(13); r[2] = a; r[3] = 0xFFFFFFFFUL + 2;
        return 0;
      }`);
    expect(r.dword("r", 0)).toBe(479001600);
    expect(r.dword("r", 1)).toBe(Number(6227020800n % 2n ** 32n));
    expect(r.dword("r", 2)).toBe(2971215073);
    expect(r.dword("r", 3)).toBe(1);
  });

  it("long karşılaştırmalar, kaydırmalar ve int ile karışık işlemler", () => {
    const r = runC(`
      long r[8];
      int main(void) {
        long a = 70000; int i = -3; unsigned u = 50000; unsigned long ul = 3000000000UL;
        r[0] = a * i; r[1] = a + u; r[2] = (a > u) + (ul > a) * 2 + (-1L < 0) * 4 + (ul > 0x7FFFFFFFL) * 8;
        r[3] = a << 8; r[4] = (long)ul >> 28; r[5] = ul >> 28; r[6] = (long)u * u; r[7] = -a % 11;
        return 0;
      }`);
    expect([...Array(8).keys()].map((i) => r.dword("r", i) | 0)).toEqual([
      -210000, 120000, 15, 17920000, -5, 11, (50000 * 50000) | 0, -7,
    ]);
  });
});

describe("çalışma zamanı kütüphanesi", () => {
  it("printf: %d %i %u %x %X %c %s %ld %lu %lx %% genişlik ve 0 dolgusu", () => {
    expect(
      out(`#include <stdio.h>
        int main(void) {
          printf("[%d|%i|%u|%x|%X|%c|%s|%%]\\n", -32767 - 1, 32767, 65535u, 0xbeef, 0xbeef, 'Q', "str");
          printf("[%ld|%lu|%lx|%lX|%ld]\\n", -2147483647L - 1, 4294967295UL, 0xdeadbeefUL, 0xcafeUL, 0L);
          printf("[%5d|%-5d|%05d|%5s|%-5s|%3c|%08lx|%+d|% d]\\n", 42, 42, -42, "ab", "ab", 'z', 0x1234abL, 5, 7);
          printf("[%.2s|%*d|%-*d|%#x|%#o|%o|%p]\\n", "abcdef", 4, 7, 4, 7, 255, 8, 8, (void *)0x1234);
          return 0;
        }`),
    ).toBe(
      "[-32768|32767|65535|beef|BEEF|Q|str|%]\n" +
        "[-2147483648|4294967295|deadbeef|CAFE|0]\n" +
        "[   42|42   |-0042|   ab|ab   |  z|001234ab|+5| 7]\n" +
        "[ab|   7|7   |0xff|010|10|0x1234]\n",
    );
  });

  it("printf dönüş değeri, sprintf ve snprintf", () => {
    expect(
      out(`#include <stdio.h>
        #include <string.h>
        int main(void) {
          char buf[32]; int n, m;
          n = sprintf(buf, "%d-%s-%lu", 12, "ab", 70000UL);
          m = snprintf(buf + 20, 5, "%s", "uzunmetin");
          printf("%s %d %s %d %d\\n", buf, n, buf + 20, m, printf("xyz") );
          return 0;
        }`),
    ).toBe("xyz12-ab-70000 11 uzun 9 3\n");
  });

  it("kullanıcı tanımlı değişken argümanlı fonksiyonlar (stdarg)", () => {
    expect(
      exitOf(`#include <stdarg.h>
        long sum(int n, ...) {
          va_list ap; long s = 0; int i;
          va_start(ap, n);
          for (i = 0; i < n; i++) s += va_arg(ap, int);
          va_end(ap);
          return s;
        }
        long mixed(const char *fmt, ...) {
          va_list ap; long s = 0;
          va_start(ap, fmt);
          for (; *fmt; fmt++) s = s * 2 + (*fmt == 'l' ? va_arg(ap, long) : va_arg(ap, int));
          va_end(ap);
          return s;
        }
        int main(void) {
          return (int)(sum(5, 1, 2, 3, 4, 5) + sum(0) + mixed("ili", 1, 100000L, 3) - 400000L) ;
        }`),
    ).toBe(15 + ((1 * 2 + 100000) * 2 + 3) - 400000 + 65536 * 3);
  });

  it("string.h fonksiyonları", () => {
    expect(
      out(`#include <stdio.h>
        #include <string.h>
        int main(void) {
          char a[20], b[20];
          strcpy(a, "merhaba"); strncpy(b, "dunya", 20); strcat(a, "!");
          printf("%u %s %s %d %d %d %d\\n", strlen(a), a, b, strcmp(a, b) < 0, strcmp("x", "x"), strncmp("abcd", "abce", 3), memcmp("ab", "ac", 2) < 0);
          memset(b, '*', 3); memmove(a + 1, a, 5); memcpy(a + 10, "xy", 3);
          printf("%s %s %s %s %s\\n", b, a, a + 10, strchr("kalem", 'l'), strrchr("a/b/c", '/'));
          printf("%s %d\\n", strstr("samanlik igne", "ig"), strstr("abc", "z") == 0);
          return 0;
        }`),
    ).toBe("8 merhaba! dunya 0 0 0 1\n***ya mmerhaa! xy lem /c\nigne 1\n");
  });

  it("malloc/free/calloc/realloc", () => {
    expect(
      out(`#include <stdio.h>
        #include <stdlib.h>
        #include <string.h>
        int main(void) {
          char *a = malloc(10), *b = malloc(100), *c;
          int *z = calloc(8, sizeof(int)), i, s = 0, ok = 1;
          strcpy(a, "abc");
          free(b);
          c = malloc(50);            /* serbest bloğa sığar */
          for (i = 0; i < 8; i++) s += z[i];
          a = realloc(a, 200);
          for (i = 0; i < 20; i++) { char *p = malloc(30); if (!p) ok = 0; free(p); }
          printf("%d %d %s %d %d\\n", c == b, s, a, malloc(60000u) == 0, ok);
          return 0;
        }`),
    ).toBe("1 0 abc 1 1\n");
  });

  it("stdlib: abs, labs, atoi, atol, strtol, rand/srand, qsort; ctype", () => {
    expect(
      out(`#include <stdio.h>
        #include <stdlib.h>
        #include <ctype.h>
        int cmp(const void *a, const void *b) { return *(const char *)a - *(const char *)b; }
        int main(void) {
          char s[] = "kcdba"; char *end; int r1, r2;
          srand(1); r1 = rand(); r2 = rand(); srand(1);
          qsort(s, 5, 1, cmp);
          printf("%d %ld %d %ld %ld %d\\n", abs(-5), labs(-70000L), atoi(" -123x"), atol("99999"), strtol("ff", &end, 16), *end == 0);
          printf("%s %d %d %d\\n", s, r1 == rand() && r2 == rand(), r1 >= 0 && r1 <= RAND_MAX, r1 != r2);
          printf("%d%d%d%d%d %c%c\\n", isdigit('7'), isalpha('_'), isspace('\\t'), isupper('a'), isxdigit('F'), toupper('q'), tolower('Q'));
          return 0;
        }`),
    ).toBe("5 70000 -123 99999 255 1\nabcdk 1 1 1\n10101 Qq\n");
  });

  it("putchar UART'a (0xFF00) bayt yazar; UTF-8 metin bozulmaz", () => {
    expect(out('#include <stdio.h>\nint main(void) { putchar(65); puts("çğüşöı İ"); return 0; }')).toBe("Açğüşöı İ\n");
  });

  it("assert ve exit", () => {
    const r = runC(`#include <assert.h>
      #include <stdlib.h>
      int main(void) { assert(1 + 1 == 2); exit(7); return 0; }`);
    expect(r.exitCode).toBe(7);
    const f = runC(`#include <assert.h>
      int main(void) { int x = 3; assert(x == 4); return 0; }`);
    expect(f.output).toBe("Assertion failed: x == 4 (main.c:2)\n");
    expect(f.exitCode).toBe(134);
  });

  it("kullanıcı kütüphane fonksiyonunu yeniden tanımlayabilir (putchar)", () => {
    expect(
      out(`#include <stdio.h>
        int putchar(int c) { *(volatile char *)0xFF00 = c == 'a' ? 'A' : c; return c; }
        int main(void) { printf("banana\\n"); return 0; }`),
    ).toBe("bAnAnA\n");
  });

  it("C ile yazılmış IRQ işleyicisi (crt0 vektörü üzerinden)", () => {
    const b = build(`#include <cpu16.h>
      volatile int ticks;
      void irq_handler(void) { ticks++; }
      int main(void) { ei(); while (ticks < 3) halt(); return ticks; }`);
    expect(b.errors).toEqual([]);
    const r = runProgram(b.image, { maxSteps: 200 });
    expect(r.result).toBe("halted");
    const cpu = r.cpu;
    for (let k = 0; k < 3; k++) {
      cpu.irq = true;
      cpu.step();
      cpu.irq = false;
      expect(cpu.run(1000)).toBe("halted");
    }
    expect(cpu.regs[0]).toBe(3);
    expect(cpu.regs[6]).toBe(0xff00);
  });
});

describe("örnek programlar (cpu16/programs/c)", () => {
  const prog = (...names: string[]) => {
    const files: Record<string, string> = {};
    for (const n of names) files[n] = readFileSync(new URL(`../programs/c/${n}`, import.meta.url), "utf8");
    return files;
  };
  const multiH = () => ({ ...prog("multi/main.c", "multi/util.c"), "multi/util.h": prog("multi/util.h")["multi/util.h"] });

  it("hello.c", () => {
    expect(out(prog("hello.c"))).toBe("Merhaba, CPU16! (cc16)\n");
  });

  it("fib.c", () => {
    const r = runC(prog("fib.c"));
    expect(r.output).toContain("17711 28657\n46368");
    expect(r.output).toContain("fib_rec(18) = 2584");
    expect(r.exitCode).toBe(0);
  });

  it("primes.c", () => {
    const r = runC(prog("primes.c"));
    expect(r.output).toContain("2000'e kadar 303 asal var, en büyüğü 1999");
    expect(r.output).toContain(" 73 79 83 89 97");
    expect(r.exitCode).toBe(303);
  });

  it("sort.c", () => {
    expect(out(prog("sort.c"))).toBe(
      "qsort < : -32768 -300 -7 -1 0 5 5 12 42 99 1000 32767\n" +
        "qsort > : 32767 1000 99 42 12 5 5 0 -1 -7 -300 -32768\n" +
        "ekleme  : -32768 -300 -7 -1 0 5 5 12 42 99 1000 32767\n" +
        "isimler : ali ayse berk can mehmet zeynep\n" +
        "rastgele: sıralı\n",
    );
  });

  it("structs.c", () => {
    expect(out(prog("structs.c"))).toBe(
      "add: (13, -16)\n" +
        "kopya: (14, -16) asıl: (13, -16)\n" +
        "renkler: 0 5 6, sizeof(struct node) = 10\n" +
        "union: düşük bayt 34, yüksek bayt 12\n" +
        "bes=5 -> on=10 -> yirmi=20 -> otuz=30\n" +
        "otuz=30 -> yirmi=20 -> on=10 -> bes=5\n" +
        "4 düğüm silindi; yeni blok ilk düğümün yerinde: evet\n",
    );
  });

  it("long.c", () => {
    const r = runC(prog("long.c"));
    expect(r.output).toContain("12! = 479001600\n13! = 1932053504\n");
    expect(r.output).toContain("fib(47) = 2971215073 (10 basamak), hex b11924e1\n");
    expect(r.output).toContain("-2000000000 / 7 = -285714285, % 7 = -5\n");
    expect(r.output).toContain("-2000000000 >> 4 = -125000000, << 1 = 294967296\n0x2152beef\n");
    expect(r.exitCode).toBe(10);
  });

  it("strings.c", () => {
    expect(out(prog("strings.c"))).toBe(
      'word = "cpu16", uzunluk 5\n' +
        "ters: abahreM\n" +
        "büyük: ABAHREM\n" +
        "strcmp: 1 1 0\n" +
        "kelime sayısı: 6\n" +
        'strchr: "C, 16 bitlik islemcide  "\n' +
        "strstr ofset: 14\n" +
        "atoi: 1234 -56 32768\n" +
        "[   42|-42  |00042|ff|Z|abc] (28 karakter)\n" +
        'snprintf: "uzun bi" istenen 14\n',
    );
  });

  it("switch.c", () => {
    expect(out(prog("switch.c"))).toBe(
      "? pazar pazartesi salı çarşamba perşembe cuma cumartesi ? \n" +
        "200:2 204:2 302:3 404:4 -1:4 500:5 418:0 \n" +
        "MCMXCIV=1994 XLII=42 MMXXIV=2024 ABC=-1\n" +
        "10 11 12 13 10 11 12 13 \n",
    );
  });

  it("multi/ (iki çeviri birimi, static ve extern)", () => {
    expect(out(multiH())).toBe(
      "util 1.0: adet=6 min=-32000 max=30000 toplam=-1942 ort=-323\n" +
        "gcd(84, -36)=12 gcd(17, 5)=1\n" +
        "id: 100 101 102, yerel sayaç 6\n" +
        "util çağrıları: 9, history[5]=8\n",
    );
  });

  it("derlenmiş C programı mikrokod modelinde (Faz 2) de aynı sonucu verir", () => {
    const micro = assembleMicrocode(readFileSync(new URL("../micro/cpu16.ucode", import.meta.url), "utf8"));
    for (const n of ["switch.c", "structs.c"]) {
      const b = build(prog(n));
      const emu = runProgram(b.image);
      const bus = new SimpleBus();
      bus.load(b.image);
      const dp = new Datapath(micro.rom, bus);
      let res = "ok";
      for (let i = 0; i < 1_000_000 && res === "ok"; i++) res = dp.stepInstruction();
      expect(res, n).toBe("halted");
      expect(bus.output, n).toBe(emu.bus.output);
      expect(dp.regs[0], n).toBe(emu.cpu.regs[0]);
      expect(Buffer.from(bus.mem.subarray(0x4000, 0xff00)).equals(Buffer.from(emu.bus.mem.subarray(0x4000, 0xff00))), n).toBe(true);
    }
  });

  it("iyileştirmeler kapalıyken de örnekler aynı çıktıyı verir", () => {
    for (const n of ["sort.c", "structs.c", "long.c", "strings.c", "switch.c"]) {
      expect(out(prog(n), { optimize: false }), n).toBe(out(prog(n)));
    }
  });
});

describe("derleme hataları", () => {
  const first = (src: string) => errorsOf(src)[0];

  it("hatalar dosya, satır ve sütunla raporlanır", () => {
    const e = first("int main(void) {\n  int x = 1\n  return x;\n}");
    expect(e.file).toBe("main.c");
    expect(e.line).toBe(3);
    expect(e.col).toBeGreaterThan(0);
  });

  it("kayan nokta desteklenmiyor", () => {
    expect(first("int main(void) { float f = 1; return 0; }").message).toMatch(/desteklenmiyor/);
    expect(first("int main(void) { return 1.5; }").message).toMatch(/desteklenmiyor/);
    expect(first("double d;").message).toMatch(/desteklenmiyor/);
  });

  it("tanımsız değişken ve fonksiyon, tip hataları", () => {
    expect(first("int main(void) { return y; }").message).toMatch(/y/);
    expect(first("int main(void) { return foo(1); }").message).toMatch(/foo/);
    expect(first("struct S { int a; }; int main(void) { struct S s; return s.b; }").message).toMatch(/b/);
    expect(first("int main(void) { int a; return *a; }").message.length).toBeGreaterThan(0);
    expect(first("int f(int a, int b); int main(void) { return f(1); }").message.length).toBeGreaterThan(0);
  });

  it("bağlayıcı: tanımsız sembol", () => {
    const e = errorsOf("int ext(void); int main(void) { return ext(); }");
    expect(e.map((x) => x.message).join()).toMatch(/Tanımsız sembol: 'ext'/);
  });
});

describe("API", () => {
  it("lib-vite (import.meta.glob) ile node (fs) kütüphanesi aynı", () => {
    expect(Object.keys(VITE_LIB).sort()).toEqual(Object.keys(LIB).sort());
    expect(VITE_LIB["libc16.c"]).toBe(LIB["libc16.c"]);
    expect(Object.keys(LIB)).toContain("include/stdio.h");
  });

  it("buildProgram: imaj, aralıklar, semboller; tarayıcı için dosya haritası", () => {
    const b = buildProgram(
      { "/proj/main.c": '#include "inc/k.h"\nint main(void) { return K; }', "/proj/inc/k.h": "#define K 77\n" },
      ["/proj/main.c"],
      { lib: VITE_LIB },
    );
    expect(b.errors).toEqual([]);
    expect(b.romSize).toBeGreaterThan(0);
    expect(b.ranges[0][0]).toBe(0);
    expect(runProgram(b.image).exitCode).toBe(77);
  });
});
