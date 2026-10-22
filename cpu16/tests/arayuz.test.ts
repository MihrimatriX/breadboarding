// Silikon3D arayüzünün kabuğu: bölüm tablosu (src/ui/ModeSwitch.tsx) ve açılış sayfası (src/giris/:
// adres kararı, iki dilli metinler, yolculuğun bölümlere bağlanması). Telefonda bölüm geçişi ekranın
// altındaki sekme çubuğunda simge + kısa ad (styles.css, ≤ 900 px): altı sekme 390 px'lik ekranı paylaşır,
// her biri ≈ 62 px; 13 px yazıyla (IBM Plex Sans) bu ≈ 8 harf eder.

import { describe, expect, it } from "vitest";
import { BOLUMLER } from "../../src/ui/ModeSwitch.tsx";
import { girisMi, GIRIS_HASH, ILKELER, KAHRAMAN, YOLCULUK } from "../../src/giris/icerik.ts";
import type { IkiDil } from "../../src/ui/ceviri.ts";

const ikiDildeDolu = (m: IkiDil, ad: string) => {
  expect(m.tr.trim(), `${ad} tr`).not.toBe("");
  expect(m.en.trim(), `${ad} en`).not.toBe("");
  expect(m.en, `${ad}: İngilizcesi Türkçesinin kopyası`).not.toBe(m.tr);
};

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

describe("arayüz: açılış sayfası (src/giris/)", () => {
  it("sitenin kökü ve #giris açılış sayfasını, bölüm adresleri bölümü açar", () => {
    for (const h of ["", "#", GIRIS_HASH]) expect(girisMi(h), JSON.stringify(h)).toBe(true);
    for (const b of BOLUMLER) expect(girisMi(b.hash), b.hash).toBe(false);
    expect(girisMi("#belgeler/cpu16/docs/spec.md")).toBe(false);
    expect(girisMi("#mimari/hesap")).toBe(false);
  });

  it("açılış sayfasının adresi hiçbir bölümün adresiyle çakışmaz", () => {
    expect(BOLUMLER.map((b) => b.hash)).not.toContain(GIRIS_HASH);
  });

  it("bütün metinler iki dilde", () => {
    for (const [ad, m] of Object.entries(KAHRAMAN)) ikiDildeDolu(m, `KAHRAMAN.${ad}`);
    YOLCULUK.forEach((a, i) => {
      ikiDildeDolu(a.seviye, `YOLCULUK[${i}].seviye`);
      ikiDildeDolu(a.metin, `YOLCULUK[${i}].metin`);
    });
    ILKELER.forEach((k, i) => {
      ikiDildeDolu(k.baslik, `ILKELER[${i}].baslik`);
      ikiDildeDolu(k.metin, `ILKELER[${i}].metin`);
    });
  });

  it("yolculuğun her adımı ayrı, var olan bir bölüme gider", () => {
    const bolumler = new Set(BOLUMLER.map((b) => b.mode));
    for (const a of YOLCULUK) expect(bolumler.has(a.mode), a.mode).toBe(true);
    expect(new Set(YOLCULUK.map((a) => a.mode)).size).toBe(YOLCULUK.length);
  });
});
