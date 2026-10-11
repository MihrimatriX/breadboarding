// Web IDE'de C ile program yazma: editördeki kaynağın dili içerikten tanınır ve "yeni.c" şablonu
// BIOS üzerinde derlenip çalışır.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { dilBul, ornekDili } from "../../src/cpu16/dil.ts";
import { buildBios } from "../bios/build.ts";
import { buildProgram, formatErrors } from "../cc/index.ts";
import { loadLib } from "../cc/node.ts";
import { runProgram } from "../cc/run.ts";
import { Machine } from "../emu/machine.ts";

const dir = (p: string) => new URL(p, import.meta.url);
const read = (p: string) => readFileSync(dir(p), "utf8");
const files = (p: string, ext: RegExp) => readdirSync(dir(p)).filter((f) => ext.test(f)).map((f) => ({ f, src: read(`${p}/${f}`) }));

describe("editör dili", () => {
  it("bütün örnek, deney ve test programları kendi dillerinde tanınır", () => {
    const all = [
      ...files("../bios/ornekler", /\.(s|c)$/),
      ...files("../bios/testler", /\.(s|c)$/),
      ...files("../programs", /\.(s|c)$/),
      ...files("../kit/programlar", /\.s$/),
    ];
    expect(all.length).toBeGreaterThan(15);
    for (const { f, src } of all) expect(dilBul(src), f).toBe(f.endsWith(".c") ? "c" : "asm");
  });

  it("kısa parçalar ve boş kaynak", () => {
    expect(dilBul("int main(void) { return 0; }")).toBe("c");
    expect(dilBul('#include <stdio.h>\nmain() { printf("x"); }')).toBe("c");
    expect(dilBul("  LI r0, 5\n  HALT")).toBe("asm");
    expect(dilBul("dongu:\n  ADDI r1, 1\n  BNE dongu ; geri")).toBe("asm");
    expect(dilBul("")).toBeNull();
    expect(dilBul("merhaba")).toBeNull();
    expect([ornekDili("yilan.c"), ornekDili("merhaba")]).toEqual(["c", "asm"]);
  });
});

describe("yeni.c şablonu", () => {
  it("BIOS hedefinde derlenir, printf ekrana ve UART'a yazar, monitöre döner", () => {
    const b = buildProgram({ "yeni.c": read("../bios/ornekler/yeni.c") }, ["yeni.c"], { lib: loadLib(), target: "bios" });
    if (b.errors.length) throw new Error(formatErrors(b.errors));
    const m = new Machine();
    m.loadFlash(buildBios(read("../bios/bios.s")).flash);
    m.reset();
    expect(m.runUntil(() => m.uartOutput.endsWith("> "), 2_000_000)).toBe(true);
    const start = m.uartOutput.length;
    for (const [s, e] of b.ranges) m.pokeCpu(s, b.image.subarray(s, e));
    m.uartSend("G 4000\r");
    expect(m.runUntil(() => m.uartOutput.length > start + 20 && m.uartOutput.endsWith("> "), 4_000_000)).toBe(true);
    expect(m.uartOutput).toContain("Merhaba! Bu benim ilk C programim.");
    expect(m.uartOutput).toContain("10 x 10 = 100");
    expect(m.renderText()).toContain(" 7 x  7 =  49");
    expect(m.video.vram[78 * 2]).toBe("*".charCodeAt(0));
  });
});

describe("düz bellekte C (FlatBench, ROM hedefi)", () => {
  it("merhaba.c 0x0000'dan çalışır, printf UART'a yazar, main dönünce durur", () => {
    const b = buildProgram({ "/program.c": read("../programs/merhaba.c") }, ["/program.c"], { lib: loadLib() });
    if (b.errors.length) throw new Error(formatErrors(b.errors));
    const r = runProgram(b.image, { maxSteps: 2_000_000 });
    expect(r.result).toBe("halted");
    expect(r.output).toContain("Merhaba, CPU16! Bu program C ile yazildi.\n");
    expect(r.output).toContain("fib(10) = 55\n");
  });
});
