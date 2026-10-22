// Silikon3D arayüzünün kabuğu: bölüm tablosu (src/ui/ModeSwitch.tsx). Telefonda bölüm geçişi ekranın
// altındaki sekme çubuğunda simge + kısa ad (styles.css, ≤ 900 px): altı sekme 390 px'lik ekranı paylaşır,
// her biri ≈ 62 px; 13 px yazıyla (IBM Plex Sans) bu ≈ 8 harf eder.

import { describe, expect, it } from "vitest";
import { BOLUMLER } from "../../src/ui/ModeSwitch.tsx";

describe("arayüz: bölüm tablosu", () => {
  it("her bölümün iki dilde kısa adı var ve alt çubuğun bir sekmesine sığar", () => {
    for (const b of BOLUMLER) {
      for (const dil of ["tr", "en"] as const) {
        expect(b.kisa[dil].trim(), `${b.mode} ${dil}`).not.toBe("");
        expect(b.kisa[dil].length, `${b.mode} ${dil}: "${b.kisa[dil]}"`).toBeLessThanOrEqual(8);
      }
    }
  });

  it("kısa adlar birbirinden ayrılır", () => {
    for (const dil of ["tr", "en"] as const) {
      const adlar = BOLUMLER.map((b) => b.kisa[dil]);
      expect(new Set(adlar).size).toBe(adlar.length);
    }
  });
});
