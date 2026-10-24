// Silikon3D arayüzünün kabuğu: bölüm tablosu (src/ui/ModeSwitch.tsx) ve açılış sayfası (src/giris/:
// adres kararı, iki dilli metinler, yolculuğun bölümlere bağlanması). Telefonda bölüm geçişi ekranın
// altındaki sekme çubuğunda simge + kısa ad (styles.css, ≤ 900 px): altı sekme 390 px'lik ekranı paylaşır,
// her biri ≈ 62 px; 13 px yazıyla (IBM Plex Sans) bu ≈ 8 harf eder.

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { BOLUMLER } from "../../src/ui/ModeSwitch.tsx";
import { girisMi, GIRIS_HASH, ILKELER, KAHRAMAN, YOLCULUK } from "../../src/giris/icerik.ts";
import type { IkiDil } from "../../src/ui/ceviri.ts";
import { blokOnAdi, kartOzeti } from "../../src/board3d/ozet.ts";
import { turAdimlari, turdakiYeri } from "../../src/board3d/anlatim.ts";
import { pinKonumu } from "../../src/board3d/PinDiyagrami.tsx";
import { asamaDilimleri, secimOku } from "../../src/board3d/kurulum.ts";
import { bbPencere } from "../../src/board3d/bbKurulum.ts";
import { renklendir, type Parca } from "../../src/cpu16/renklendir.ts";
import { bolumKatalogu, bolumleri } from "../board/bolum-bilgi.ts";
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

describe("arayüz: Anlatım turu (src/board3d/anlatim.ts)", () => {
  for (const [tur, board] of [["cpu16", buildFullMachineBoard().board], ["hesap", buildHesapBoard().board]] as const) {
    const k = bolumKatalogu(tur, board);
    const adimlar = turAdimlari(k);

    it(`${tur}: adımlar kart ya da blok, her biri bir kez, her kart turda`, () => {
      expect(adimlar.length).toBeGreaterThan(k.kartlar.length);
      for (const a of adimlar) expect(["kart", "blok"]).toContain(a.tur);
      expect(new Set(adimlar.map((a) => a.id)).size).toBe(adimlar.length);
      for (const kart of k.kartlar) expect(adimlar.some((a) => a.tur === "kart" && a.kart === kart), kart).toBe(true);
    });

    it(`${tur}: seçili bölümün turdaki yeri kendisi ya da en yakın üst bölümü`, () => {
      expect(turdakiYeri(k, adimlar, null)).toBe(-1);
      expect(turdakiYeri(k, adimlar, "yok:boyle:bir")).toBe(-1);
      adimlar.forEach((a, i) => expect(turdakiYeri(k, adimlar, a.id)).toBe(i));
      // bir grup turda değil: bloğunun adımında durur (blok turdaysa), değilse kartınınkinde
      const g = bolumleri(k, "grup")[0];
      const j = turdakiYeri(k, adimlar, g.id);
      expect(j).toBeGreaterThanOrEqual(0);
      expect([g.ust, `kart:${g.kart}`]).toContain(adimlar[j].id);
    });
  }
});

describe("arayüz: İnceleme ve Kurulum yardımcıları", () => {
  it("bacak diyagramı datasheet düzeninde: 1 sol üst, n/2 sol alt, n/2+1 sağ alt, n sağ üst", () => {
    expect(pinKonumu(1, 14)).toEqual({ sag: false, sira: 0 });
    expect(pinKonumu(7, 14)).toEqual({ sag: false, sira: 6 });
    expect(pinKonumu(8, 14)).toEqual({ sag: true, sira: 6 });
    expect(pinKonumu(14, 14)).toEqual({ sag: true, sira: 0 });
    // her sıra iki yanda birer kez dolu
    const yerler = Array.from({ length: 28 }, (_, i) => pinKonumu(i + 1, 28)).map((p) => `${p.sag}:${p.sira}`);
    expect(new Set(yerler).size).toBe(28);
  });

  it("aşama dilimleri: sırayla, sayılı, hedef ilk açık tel (hepsi bittiyse ilki)", () => {
    const teller = [
      { id: "a1", b: "A" }, { id: "a2", b: "A" }, { id: "b1", b: "B" }, { id: "a3", b: "A" }, { id: "c1", b: "C" },
    ];
    const d = asamaDilimleri(teller, (t) => t.b, (t) => t.id, new Set(["a1", "b1"]));
    expect(d.map((x) => [x.anahtar, x.toplam, x.bitti, x.hedef.id])).toEqual([
      ["A", 3, 1, "a2"],
      ["B", 1, 1, "b1"],
      ["C", 1, 0, "c1"],
    ]);
    expect(asamaDilimleri([], (t: { b: string }) => t.b, (t) => t, new Set())).toEqual([]);
  });

  it("delik haritası: şerit deliği kendi 5 deliğine, ray deliği rayına bağlı; kenarda pencere kayar", () => {
    // c14: üst yarı (üst raylar + a–e), 7 sütun, ortada 14
    const p = bbPencere(5, 14);
    expect([p.r0, p.r1, p.c0, p.c1]).toEqual([0, 7, 11, 17]);
    expect(p.delikler.filter((d) => d.hedef)).toEqual([{ r: 5, c: 14, hedef: true, bagli: true }]);
    expect(p.delikler.filter((d) => d.bagli).map((d) => [d.r, d.c])).toEqual([[3, 14], [4, 14], [5, 14], [6, 14], [7, 14]]);
    // alt yarı; sol kenarda pencere 1'den başlar
    const q = bbPencere(12, 1);
    expect([q.r0, q.r1, q.c0, q.c1]).toEqual([10, 17, 1, 7]);
    // ray deliği: bağlı olanlar yalnız o rayın delikleri
    const r = bbPencere(17, 30);
    const bagli = r.delikler.filter((d) => d.bagli);
    expect(bagli.length).toBeGreaterThan(1);
    for (const d of bagli) expect(d.r).toBe(17);
    expect(bbPencere(3, 63).c1).toBe(63);
  });

  it("kayıtlı seçim: depolama yoksa ya da değer listede değilse varsayılan", () => {
    expect(secimOku("silikon3d.yok", ["a", "b"], "a")).toBe("a");
  });
});

describe("arayüz: Web IDE'nin sözdizimi renklendirmesi (src/cpu16/renklendir.ts)", () => {
  const turler = (satir: Parca[]) => satir.filter((p) => p.tur).map((p) => [p.tur, p.metin]);

  it("satırlar birleşince kaynağın kendisi çıkar (depodaki bütün örnek programlar)", () => {
    const dosyalar = ["cpu16/programs", "cpu16/programs/c", "cpu16/bios/ornekler"].flatMap((d) =>
      readdirSync(d).filter((f) => /\.(s|c)$/.test(f)).map((f) => `${d}/${f}`),
    );
    expect(dosyalar.length).toBeGreaterThan(20);
    for (const f of dosyalar) {
      const kaynak = readFileSync(f, "utf8").replace(/\r\n/g, "\n");
      const satirlar = renklendir(kaynak, f.endsWith(".c") ? "c" : "asm");
      expect(satirlar.map((s) => s.map((p) => p.metin).join("")).join("\n"), f).toBe(kaynak);
    }
  });

  it("C: önişlemci, tip, işlev, dizgi, sayı, anahtar sözcük, yorum; çok satırlı yorum satır satır", () => {
    const s = renklendir('#include <stdio.h>\nint main(void) { return puts("a;b") + 0x1F; } // son\n/* bir\niki */ x', "c");
    expect(turler(s[0])).toEqual([["yonerge", "#include"]]);
    expect(turler(s[1])).toEqual([
      ["tip", "int"], ["islev", "main"], ["tip", "void"], ["anahtar", "return"], ["islev", "puts"],
      ["dizgi", '"a;b"'], ["sayi", "0x1F"], ["yorum", "// son"],
    ]);
    expect(turler(s[2])).toEqual([["yorum", "/* bir"]]);
    expect(turler(s[3])).toEqual([["yorum", "iki */"]]);
    // sözcüğün içindeki anahtar sözcük renklenmez; yarım dizgi satır sonunda biter
    expect(turler(renklendir('interval = "yarım', "c")[0])).toEqual([["dizgi", '"yarım']]);
  });

  it("assembly: etiket, komut, yönerge, register, sayı, yorum; sembol tanımı komut değil", () => {
    const s = renklendir('basla: LI r1, 0x10 ; say\n  .ascii "x;y"\nUART = 0xFF00\nSP_UST .equ 100\n  add sp, sp, 2', "asm");
    expect(turler(s[0])).toEqual([["etiket", "basla:"], ["komut", "LI"], ["yazmac", "r1"], ["sayi", "0x10"], ["yorum", "; say"]]);
    expect(turler(s[1])).toEqual([["yonerge", ".ascii"], ["dizgi", '"x;y"']]);
    expect(turler(s[2])).toEqual([["etiket", "UART"], ["sayi", "0xFF00"]]);
    expect(turler(s[3])).toEqual([["etiket", "SP_UST"], ["sayi", "100"]]);
    expect(turler(s[4])).toEqual([["komut", "add"], ["yazmac", "sp"], ["yazmac", "sp"], ["sayi", "2"]]);
  });
});
