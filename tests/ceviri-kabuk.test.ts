// Kabuğun, 6502 die bölümünün ve Başlangıç kılavuzunun iki dili: assembler hataları İngilizcede,
// örnek programların iki dildeki kaynağı aynı baytlara derlenir, kılavuzun her bölümünde iki dilde
// 3-4 ilk adım var ve iki dil aynı tuşları anar.

import { describe, expect, it } from "vitest";
import { assemble } from "../src/sim/asm6502";
import { PROGRAMS } from "../src/sim/programs";
import { GIRIS, ILK_ADIMLAR, ORTAK_IPUCLARI, PANEL_IPUCU, parcala } from "../src/ui/kilavuz";
import { BOLUMLER } from "../src/ui/ModeSwitch";
import type { IkiDil } from "../src/ui/ceviri";

const tuslar = (m: string) => parcala(m).filter((p) => p.tus).length;

describe("6502 assembler iki dilde", () => {
  it("hata iletisi varsayılan olarak Türkçe, istenirse İngilizce", () => {
    expect(() => assemble("LDA #1\nFOO $10")).toThrow("Satır 2: bilinmeyen komut 'FOO'");
    expect(() => assemble("LDA #1\nFOO $10", "en")).toThrow("Line 2: unknown instruction 'FOO'");
    expect(() => assemble("JMP yok", "en")).toThrow("Line 1: undefined label 'yok'");
  });
  it("örnek programların İngilizce kaynağı (yalnız yorumlar farklı) aynı baytlara derlenir", () => {
    for (const p of PROGRAMS) {
      expect(assemble(p.source.en, "en").bytes).toEqual(p.bytes);
      expect(p.name.en && p.description.en).toBeTruthy();
    }
  });
});

describe("Başlangıç kılavuzu", () => {
  const hepsi: IkiDil[] = [GIRIS, PANEL_IPUCU, ...ORTAK_IPUCLARI, ...Object.values(ILK_ADIMLAR).flat(), ...BOLUMLER.flatMap((b) => [b.ad, b.ipucu, b.tanitim])];

  it("her bölümün iki dilde 3-4 ilk adımı var", () => {
    expect(Object.keys(ILK_ADIMLAR).sort()).toEqual(BOLUMLER.map((b) => b.mode).sort());
    for (const adimlar of Object.values(ILK_ADIMLAR)) {
      expect(adimlar.length).toBeGreaterThanOrEqual(3);
      expect(adimlar.length).toBeLessThanOrEqual(4);
    }
  });

  it("iki dil dolu, uzun ya da orta tire yok, ters tırnaklar kapalı ve iki dil aynı sayıda tuş anar", () => {
    for (const m of hepsi) {
      for (const s of [m.tr, m.en]) {
        expect(s.trim()).not.toBe("");
        expect(s).not.toMatch(/[–—]/);
        expect(s.split("`").length % 2).toBe(1);
      }
      expect(tuslar(m.en)).toBe(tuslar(m.tr));
    }
  });

  it("parcala ters tırnak içini tuş yapar", () => {
    expect(parcala("`Boşluk` ile duraklat, `N` ile ilerle")).toEqual([
      { yazi: "Boşluk", tus: true },
      { yazi: " ile duraklat, ", tus: false },
      { yazi: "N", tus: true },
      { yazi: " ile ilerle", tus: false },
    ]);
  });
});
