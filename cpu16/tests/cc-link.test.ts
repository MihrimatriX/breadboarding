// cc16 önişlemci ve bağlayıcı testleri: makrolar, koşullu derleme, #include (bellek içi dosya
// sistemi), çoklu çeviri birimi, static, sembol hataları, dallanma uzatma, ROM/RAM taşması.

import { describe, expect, it } from "vitest";
import { compile } from "../cc/index.ts";
import { build, errorsOf, exitOf, LIB, out, runC } from "./cc-helpers.ts";

describe("önişlemci", () => {
  it("nesne ve fonksiyon benzeri makrolar, iç içe genişletme, özyineleme koruması", () => {
    expect(
      exitOf(`#define N 10
        #define SQ(x) ((x) * (x))
        #define MAX(a, b) ((a) > (b) ? (a) : (b))
        #define TWICE(f, v) f(f(v))
        int y = 5;
        #define y (y + 1)
        int main(void) { return SQ(N + 1) + MAX(3, SQ(2)) + TWICE(SQ, 2) + y; }`),
    ).toBe(121 + 4 + 16 + 6);
  });

  it("# (string yapma), ## (yapıştırma), __VA_ARGS__", () => {
    expect(
      out(`#include <stdio.h>
        #define STR(x) #x
        #define XSTR(x) STR(x)
        #define CAT(a, b) a##b
        #define LOG(fmt, ...) printf("[" fmt "]\\n", __VA_ARGS__)
        #define LOG0(fmt, ...) printf(fmt "\\n", ##__VA_ARGS__)
        #define V 42
        int CAT(foo, bar) = 7;
        int main(void) {
          printf("%s %s %s %d\\n", STR(a + b), XSTR(V), STR("q\\n"), foobar);
          LOG("%d-%d", 1, 2);
          LOG0("bos");
          return 0;
        }`),
    ).toBe('a + b 42 "q\\n" 7\n[1-2]\nbos\n');
  });

  it("#if/#elif/#else/#endif, defined, #ifdef/#ifndef, #undef", () => {
    expect(
      exitOf(`#define A 3
        #if A > 5
        #error olmamali
        #elif A == 3 && defined(A) && !defined(B)
        #define R 1
        #else
        #define R 2
        #endif
        #ifdef R
        #undef A
        #endif
        #ifndef A
        #define S 10
        #endif
        #if (1 << 4) == 16 && -1 < 0 && 7 / 2 == 3 && (0x10 | 1) == 17 && 'a' == 97 && UNDEFINED_IS_ZERO == 0
        #define T 100
        #endif
        #if 0
          bu satır hiç ayrıştırılmaz '
        #endif
        int main(void) { return R + S + T; }`),
    ).toBe(111);
  });

  it("#include: göreli yol, alt dizin, -I, include guard ve #pragma once", () => {
    const files = {
      "src/main.c": '#include "lib/a.h"\n#include "lib/a.h"\n#include "b.h"\n#include "c.h"\n#include "c.h"\nint main(void) { return A + B + C; }',
      "src/lib/a.h": "#ifndef A_H\n#define A_H\n#include \"inner.h\"\n#define A (INNER * 2)\nint dup_a;\n#endif\n",
      "src/lib/inner.h": "#define INNER 5\n",
      "inc/b.h": "#pragma once\n#define B 20\n",
      "src/c.h": "#pragma once\nint c_once;\n#define C 300\n",
    };
    const b = build(files, { includeDirs: ["inc"] });
    expect(b.errors).toEqual([]);
    expect(exitOf(files, { includeDirs: ["inc"] })).toBe(330);
  });

  it("<...> sistem başlıkları kütüphaneden, -D tanımları, __LINE__ ve __FILE__", () => {
    expect(
      out(`#include <stdio.h>
        #include <limits.h>
        #include <stdint.h>
        int main(void) {
          printf("%d %d %u %ld %d %s %d\\n", INT_MIN, INT_MAX, UINT_MAX, LONG_MAX, __LINE__, __FILE__, MODE);
          return sizeof(int32_t) + sizeof(uint8_t);
        }`, { defines: { MODE: "3" } }),
    ).toBe("-32768 32767 65535 2147483647 5 main.c 3\n");
  });

  it("çok satırlı makrolar (\\ ile devam) ve satır numaraları korunur", () => {
    const e = errorsOf('#define LONGMAC(a, b) \\\n  ((a) + \\\n   (b))\nint main(void) {\n  return LONGMAC(1, 2) + ;\n}');
    expect(e[0].line).toBe(5);
  });

  it("hatalar: #error, bulunamayan başlık, kapanmamış #if", () => {
    expect(errorsOf('#error "dur"\nint main(void){return 0;}')[0].message).toMatch(/dur/);
    expect(errorsOf('#include "yok.h"\nint main(void){return 0;}')[0].message).toMatch(/yok\.h/);
    expect(errorsOf("#if 1\nint main(void){return 0;}")[0].message).toMatch(/#endif/);
  });
});

describe("bağlayıcı ve çoklu çeviri birimi", () => {
  it("extern değişkenler ve fonksiyonlar dosyalar arasında paylaşılır", () => {
    expect(
      exitOf({
        "a.c": "extern int shared; int get(void); void bump(int n); int main(void) { bump(5); bump(7); return shared * 100 + get(); }",
        "b.c": "int shared = 1; static int hidden = 3; void bump(int n) { shared += n; hidden++; } int get(void) { return hidden; }",
      }),
    ).toBe(1300 + 5);
  });

  it("aynı adlı static fonksiyon ve değişkenler her dosyada ayrıdır", () => {
    expect(
      exitOf({
        "a.c": "static int v = 1; static int f(void) { return v; } int fb(void); int main(void) { return f() * 10 + fb(); }",
        "b.c": "static int v = 2; static int f(void) { return v * 3; } int fb(void) { return f(); }",
      }),
    ).toBe(16);
  });

  it("aynı global sembol iki dosyada: 'birden fazla tanımlı' hatası", () => {
    const e = errorsOf({ "a.c": "int x = 1; int main(void) { return x; }", "b.c": "int x = 2;" });
    expect(e.map((x) => x.message).join("\n")).toMatch(/'x' birden fazla tanımlı \(a\.c ve b\.c\)/);
    const f = errorsOf({ "a.c": "int f(void) { return 1; } int main(void) { return f(); }", "b.c": "int f(void) { return 2; }" });
    expect(f.map((x) => x.message).join("\n")).toMatch(/'f' birden fazla tanımlı/);
  });

  it("tanımsız sembol: kullanılmayan fonksiyonlarda bile raporlanır, dosya adıyla", () => {
    const e = errorsOf({
      "a.c": "int main(void) { return 0; }",
      "b.c": "extern int nowhere; int missing_fn(void); int unused(void) { return nowhere + missing_fn(); }",
    });
    const msgs = e.map((x) => `${x.file}: ${x.message}`).join("\n");
    expect(msgs).toMatch(/b\.c: Tanımsız sembol: 'nowhere'/);
    expect(msgs).toMatch(/Tanımsız sembol: 'missing_fn'/);
  });

  it("kullanılmayan fonksiyonlar programa girmez (ölü kod atma)", () => {
    const b = build("int unused(void) { return 1; } int main(void) { return 0; }");
    expect(b.errors).toEqual([]);
    expect(b.symbols.has("_unused")).toBe(false);
    expect(b.symbols.has("_printf")).toBe(false);
    expect(b.romSize).toBeLessThan(200);
  });

  it("assembly (.s) dosyası C ile bağlanır", () => {
    expect(
      exitOf({
        "main.c": "int asm_add3(int a, int b, int c); extern int asm_val; int main(void) { return asm_add3(1, 2, 3) + asm_val; }",
        "util.s": `; C ABI: argümanlar r0, r1, r2; sonuç r0
K = 100
        .text
_asm_add3:
        ADD  r0, r0, r1
        ADD  r0, r0, r2
        RET
        .data
_asm_val:
        .word K
`,
      }),
    ).toBe(106);
  });

  it("-nostdlib: kendi __reset'i olan program", () => {
    const b = build(
      {
        "start.s": "        .text\n__reset:\n        LI sp, 0xFF00\n        CALL _main\n        HALT\n",
        "main.c": "int main(void) { return 9; }",
      },
      { nostdlib: true },
    );
    expect(b.errors).toEqual([]);
    expect(b.symbols.has("_printf")).toBe(false);
  });

  it("uzak dallanmalar ve çağrılar uzatılır (Bcc ±256 B, JAL ±4 KB)", () => {
    // büyük gövdeli döngüler (> 256 B) ve 4 KB'den uzak çağrılar
    const pad = Array.from({ length: 60 }, (_, i) => `x = x * 3 + ${i}; if (x > 30000) x -= 30000;`).join("\n");
    const fns = Array.from({ length: 6 }, (_, k) => `int f${k}(int x) { int i; for (i = 0; i < 3; i++) { ${pad} } return x + ${k}; }`).join("\n");
    const r = runC(`${fns}\nint main(void) { return f0(1) + f5(2) - f3(f1(3)) + f4(f2(0)); }`);
    let want = 0;
    const f = (k: number, x: number) => {
      for (let i = 0; i < 3; i++)
        for (let j = 0; j < 60; j++) {
          x = ((x * 3 + j) << 16) >> 16;
          if (x > 30000) x -= 30000;
        }
      return x + k;
    };
    want = f(0, 1) + f(5, 2) - f(3, f(1, 3)) + f(4, f(2, 0));
    expect(r.exitCode).toBe(((want & 0xffff) << 16) >> 16);
    expect(r.b.romSize).toBeGreaterThan(8192);
  });

  it("ROM taşması ve RAM taşması raporlanır", () => {
    const rom = errorsOf(`const char big[17000] = {1}; int main(void) { return big[0]; }`);
    expect(rom.map((e) => e.message).join()).toMatch(/ROM taştı/);
    const ram = errorsOf(`char big[48000]; int main(void) { return big[0]; }`);
    expect(ram.map((e) => e.message).join()).toMatch(/RAM taştı/);
  });

  it("compile(): bağlanmış as16 metni üretir; .data imajı ROM'da __data_load'da", () => {
    const c = compile({ "m.c": "int v = 0x1234; int main(void) { return v; }" }, ["m.c"], { lib: LIB });
    expect(c.errors).toEqual([]);
    expect(c.asm).toMatch(/__data_load:/);
    expect(c.asm).toMatch(/_v = 0x4000/);
    expect(c.asm).toMatch(/\.byte 52, 18/);
  });
});
