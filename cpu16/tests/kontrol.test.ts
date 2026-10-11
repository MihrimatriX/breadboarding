// Kapı seviyesindeki kontrol birimi (board/kontrol.ts): CPU kartında ROM yok, mikrokod ve ALU kod
// çözme tablosu 74HC kapılarıyla kurulu. Bu testler devrenin tabloyla birebir aynı olduğunu kanıtlar:
// kontrol birimi tek başına bir karta yerleştirilir, gerçek çip modelleriyle (LogicSim) bütün
// girişler denenir: 8192 mikrokod adresi ve 128 ALU adresi.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ALU_ADRES, aluKelimesi } from "../board/alu-kod.ts";
import { Board } from "../board/board.ts";
import { buildComputerBoard } from "../board/computer.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import {
  BLOK_ALU_KOD,
  BLOK_KONTROL,
  devreyiDenetle,
  gomuluUcodeDosyasi,
  KONTROL_GIRIS_NETLERI,
  KONTROL_GIRISLERI as G,
  kontrolBirimiKur,
  kontrolDevresi,
  type Cikis,
} from "../board/kontrol.ts";
import { LogicSim } from "../chips/logic.ts";
import { UCODE_KAYNAGI } from "../micro/cpu16-ucode.ts";
import { assembleMicrocode } from "../micro/microasm.ts";

const kaynak = readFileSync(new URL("../micro/cpu16.ucode", import.meta.url), "utf8");
const micro = assembleMicrocode(kaynak);

describe("Kontrol birimi: kaynak", () => {
  it("gömülü mikrokod kopyası cpu16.ucode ile aynı (değilse: npm run cpu16 -- kontrol)", () => {
    expect(micro.errors).toEqual([]);
    expect(UCODE_KAYNAGI).toBe(kaynak);
    const f = gomuluUcodeDosyasi(kaynak);
    expect(readFileSync(new URL(`../../${f.path}`, import.meta.url), "utf8")).toBe(f.content);
  });

  it("üreteç kendi devresini denetler (soyut değerlendirme)", () => {
    expect(devreyiDenetle(kontrolDevresi(kaynak), micro.rom)).toEqual([]);
  });
});

describe("Kontrol birimi: gerçek çiplerle eşdeğerlik (LogicSim, bütün girişler)", () => {
  const b = new Board();
  b.card = "cpu";
  const k = kontrolBirimiKur(b, kontrolDevresi(kaynak));
  b.finish({ backplane: false });
  const sim = new LogicSim(b.c);
  const surul = (degerler: Record<string, boolean>) => {
    for (const n of KONTROL_GIRIS_NETLERI) sim.drive(b.n(n), degerler[n] ?? false);
    sim.settle();
  };
  const oku = (cikislar: Cikis[], adres: number, ad: string) => {
    let w = 0;
    cikislar.forEach((c, i) => {
      let v: number;
      if (typeof c === "number") v = c;
      else {
        v = sim.get(b.n(c));
        if (v > 1) throw new Error(`${ad} adres ${adres}: ${c} belirsiz (${"01ZX"[v]})`);
      }
      w |= v << i;
    });
    return w >>> 0;
  };

  it("yalnız 7400 ailesi: 74HC138, 74HC151 ve yapıştırıcı kapılar (ROM, PAL, diyot yok)", () => {
    const parcalar = new Set(b.chips.map((c) => c.def.part));
    for (const p of parcalar) expect(p).toMatch(/^74HC(00|02|04|08|10|11|20|21|27|30|32|86|138|151)$/);
    expect(b.passives.filter((p) => /DIODE|^D_/.test(p.part))).toEqual([]);
    expect(new Set(b.chips.map((c) => c.block))).toEqual(new Set([BLOK_KONTROL, BLOK_ALU_KOD, "Yapıştırıcı lojik"]));
  });

  it("8192 mikrokod adresinin her biri ROM kelimesinin aynısını verir", () => {
    const hatalar: string[] = [];
    for (let a = 0; a < micro.rom.length; a++) {
      const g: Record<string, boolean> = {};
      G.adim.forEach((n, i) => (g[n] = ((a >> i) & 1) === 1));
      g[G.cond] = ((a >> 4) & 1) === 1;
      G.f3.forEach((n, i) => (g[n] = ((a >> (5 + i)) & 1) === 1));
      G.op.forEach((n, i) => (g[n] = ((a >> (8 + i)) & 1) === 1));
      g[G.int] = ((a >> 12) & 1) === 1;
      g[G.cN] = true;
      surul(g);
      const w = oku(k.mk, a, "mikrokod");
      if (w !== micro.rom[a]) hatalar.push(`adres ${a}: ${w.toString(16)} ≠ ${micro.rom[a].toString(16)}`);
    }
    expect(micro.rom.length).toBe(8192);
    expect(hatalar.slice(0, 10)).toEqual([]);
  });

  it("128 ALU adresinin her biri ALU kod tablosunun aynısını verir", () => {
    const hatalar: string[] = [];
    for (let a = 0; a < ALU_ADRES; a++) {
      const g: Record<string, boolean> = {};
      G.aop.forEach((n, i) => (g[n] = ((a >> i) & 1) === 1));
      g[G.h] = ((a >> 5) & 1) === 1;
      g[G.c] = ((a >> 6) & 1) === 1;
      g[G.cN] = !g[G.c];
      surul(g);
      const w = oku(k.ad, a, "ALU");
      if (w !== aluKelimesi(a)) hatalar.push(`adres ${a}: ${w.toString(16)} ≠ ${aluKelimesi(a).toString(16)}`);
    }
    expect(hatalar).toEqual([]);
  });
});

describe("Kontrol birimi: CPU kartında", () => {
  const kartlar = [
    ["test bilgisayarı", buildComputerBoard().board],
    ["anakart", buildFullMachineBoard().board],
  ] as const;

  it("CPU kartında ROM ya da Flash yok; kontrol birimi iki bilgisayarda da aynı referanslarla", () => {
    const imza = kartlar.map(([, board]) => {
      const cpu = board.chips.filter((c) => c.card === "cpu");
      for (const c of cpu) expect(c.def.part, c.ref).toMatch(/^74(HC|AC|LS)/);
      return cpu.filter((c) => c.block === BLOK_KONTROL || c.block === BLOK_ALU_KOD).map((c) => `${c.ref}:${c.def.part}`).join(" ");
    });
    expect(imza[0].length).toBeGreaterThan(0);
    expect(imza[1]).toBe(imza[0]);
  });

  it("CPU kartının referansları kendi aralığında kalır (CARD_REF_BASE: U1..U199)", () => {
    for (const [ad, board] of kartlar) {
      const cpu = board.chips.filter((c) => c.card === "cpu");
      expect(cpu.length, ad).toBeLessThan(199);
      expect(board.passives.filter((p) => p.card === "cpu" && /^C/.test(p.ref)).length, ad).toBeLessThan(200);
    }
  });
});
