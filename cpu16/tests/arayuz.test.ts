// Silikon3D arayüzünün kabuğu: bölüm tablosu (src/ui/ModeSwitch.tsx) ve açılış sayfası (src/giris/:
// adres kararı, iki dilli metinler, yolculuğun bölümlere bağlanması). Telefonda bölüm geçişi ekranın
// altındaki sekme çubuğunda simge + kısa ad (styles.css, ≤ 900 px): altı sekme 390 px'lik ekranı paylaşır,
// her biri ≈ 62 px; 13 px yazıyla (IBM Plex Sans) bu ≈ 8 harf eder.

import { describe, expect, it } from "vitest";
import { BOLUMLER } from "../../src/ui/ModeSwitch.tsx";
import { girisMi, GIRIS_HASH, ILKELER, KAHRAMAN, YOLCULUK } from "../../src/giris/icerik.ts";
import type { IkiDil } from "../../src/ui/ceviri.ts";
import { blokOnAdi, kartOzeti } from "../../src/board3d/ozet.ts";
import { boardLayout } from "../board/layout.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { buildHesapBoard } from "../../hesap8/kart.ts";

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

describe("arayüz: kartın genel bakışı (src/board3d/ozet.ts)", () => {
  const bilgisayar = boardLayout(buildFullMachineBoard().board);
  const hesap = boardLayout(buildHesapBoard().board);

  it("bilgisayar kart kart: her kart bir satır, satırların toplamı bütün parçalar", () => {
    const o = kartOzeti(bilgisayar, "kart");
    expect(o.satirlar.map((s) => s.ad)).toEqual(bilgisayar.cards.map((c) => c.name).filter((ad) => o.satirlar.some((s) => s.ad === ad)));
    expect(o.satirlar.reduce((t, s) => t + s.entegre, 0)).toBe(o.entegre);
    expect(o.satirlar.reduce((t, s) => t + s.pasif, 0)).toBe(o.pasif);
    expect(o.entegre).toBe(bilgisayar.chips.length);
    const cpu = o.satirlar.find((s) => s.ad === "cpu")!;
    expect(cpu.entegre).toBe(bilgisayar.chips.filter((c) => c.card === "cpu").length);
    expect(cpu.baslik).toBe("CPU kartı");
  });

  it("hesap makinesi blok blok: alt bloklar ön adlarıyla tek satır, toplam bütün parçalar", () => {
    const o = kartOzeti(hesap, "blok");
    const adlar = o.satirlar.map((s) => s.ad);
    expect(new Set(adlar).size).toBe(adlar.length);
    for (const ad of adlar) expect(ad).not.toContain(":");
    expect(o.satirlar.reduce((t, s) => t + s.entegre + s.pasif, 0)).toBe(hesap.chips.length + hesap.passives.length);
  });

  it("parçası olmayan kart ya da blok satır olmaz; ön ad ayrımı", () => {
    const lay = {
      cards: [{ name: "a", title: "A kartı" }, { name: "bos", title: "Boş kart" }],
      blocks: [{ card: "a", name: "Gösterge: 1. sayı" }, { card: "a", name: "Gösterge: 2. sayı" }, { card: "a", name: "Anahtarlar" }],
      chips: [{ card: "a", block: "Gösterge: 1. sayı" }, { card: "a", block: "Gösterge: 2. sayı" }, { card: "a", block: "Anahtarlar" }],
      passives: [{ card: "a", block: "Anahtarlar" }],
    } as unknown as Parameters<typeof kartOzeti>[0];
    expect(kartOzeti(lay, "kart").satirlar).toEqual([{ ad: "a", baslik: "A kartı", entegre: 3, pasif: 1 }]);
    expect(kartOzeti(lay, "blok").satirlar).toEqual([
      { ad: "Gösterge", baslik: "Gösterge", entegre: 2, pasif: 0 },
      { ad: "Anahtarlar", baslik: "Anahtarlar", entegre: 1, pasif: 1 },
    ]);
    expect(blokOnAdi("Gösterge: 1. sayı")).toBe("Gösterge");
    expect(blokOnAdi("ALU")).toBe("ALU");
  });
});
