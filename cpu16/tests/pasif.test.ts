// Pasif elemanlar: renk kodu, üç haneli kodlar, LED akımı, LED renkleri, bir pasifin kartta ne iş
// yaptığı (pasif-analiz) ve rehberin görsellerinin güncelliği (npm run cpu16 -- kit).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { boardLayout } from "../board/layout.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { LED_RENKLERI, ledRengi } from "../board/passives.ts";
import {
  akimMetni, bantFormulu, bantlariOku, carpanMetni, direncBantlari, direncGucu, faradMetni, kodAcilimi, ledAkimi, ohmMetni, pasifDegeri, rcSabiti,
  seriDirenc, ucHaneliKod, ucHaneliKoduOku, type BantRenk,
} from "../board/pasif-bilgi.ts";
import { ACIK, KOYU, direncCizimi, ledCizimi, ledDevreCizimi, svgBelge } from "../kit/cizim.ts";
import { gorselDosyalari } from "../kit/gorseller.ts";
import {
  cekmeDirenci, dacDirenci, etkinNet, ledAkimiOf, ledDevresi, ledYanik, pasifAciklamasi, rcCifti, seriLed, type PasifBaglam,
} from "../../src/board3d/pasif-analiz.ts";
import { netEndpoints } from "../../src/board3d/wires.ts";

const renkler = (ohm: number, tol = 5) => direncBantlari(ohm, tol).map((b) => b.renk);

describe("Renk kodu (IEC 60062)", () => {
  it("değerden bantlar: 4 bant %5, 5 bant %1", () => {
    expect(renkler(330)).toEqual(["turuncu", "turuncu", "kahverengi", "altin"]);
    expect(renkler(10_000)).toEqual(["kahverengi", "siyah", "turuncu", "altin"]);
    expect(renkler(1_000)).toEqual(["kahverengi", "siyah", "kirmizi", "altin"]);
    expect(renkler(100_000)).toEqual(["kahverengi", "siyah", "sari", "altin"]);
    expect(renkler(2_200)).toEqual(["kirmizi", "kirmizi", "kirmizi", "altin"]);
    expect(renkler(4.7)).toEqual(["sari", "mor", "altin", "altin"]);
    expect(renkler(0.47, 10)).toEqual(["sari", "mor", "gumus", "gumus"]);
    expect(renkler(680, 1)).toEqual(["mavi", "gri", "siyah", "siyah", "kahverengi"]);
    expect(renkler(1_300, 1)).toEqual(["kahverengi", "turuncu", "siyah", "kahverengi", "kahverengi"]);
    expect(renkler(10, 5)).toEqual(["kahverengi", "siyah", "siyah", "altin"]);
  });

  it("bantların görevi ve okunuşu", () => {
    const b = direncBantlari(330);
    expect(b.map((x) => x.gorev)).toEqual(["rakam", "rakam", "carpan", "tolerans"]);
    expect(b.map((x) => x.anlam)).toEqual(["3", "3", "× 10", "± %5"]);
    expect(bantFormulu(b, 330)).toBe("33 × 10¹ = 330 Ω");
    expect(bantFormulu(direncBantlari(680, 1), 680)).toBe("680 × 10⁰ = 680 Ω");
    expect(carpanMetni(-1)).toBe("× 0,1");
    expect(carpanMetni(4)).toBe("× 10 k");
    expect(carpanMetni(9)).toBe("× 1 G");
  });

  it("kodlayıcı ile okuyucu birbirinin tersi (E12 ve E24, 1 Ω … 10 MΩ)", () => {
    const e24 = [10, 11, 12, 13, 15, 16, 18, 20, 22, 24, 27, 30, 33, 36, 39, 43, 47, 51, 56, 62, 68, 75, 82, 91];
    for (let us = -1; us <= 5; us++) {
      for (const m of e24) {
        const ohm = Number((m * 10 ** us).toPrecision(6));
        expect(bantlariOku(renkler(ohm))).toEqual({ ohm, tolerans: 5 });
        expect(bantlariOku(renkler(ohm, 1))).toEqual({ ohm, tolerans: 1 });
      }
    }
  });

  it("yazılamayan değerler ve geçersiz bantlar hata verir", () => {
    expect(() => direncBantlari(333)).toThrow();
    expect(() => direncBantlari(0)).toThrow();
    expect(() => direncBantlari(1000, 3)).toThrow();
    expect(() => bantlariOku(["altin", "siyah", "kirmizi", "altin"] as BantRenk[])).toThrow();
    expect(() => bantlariOku(["kahverengi", "siyah", "kirmizi", "siyah"] as BantRenk[])).toThrow();
  });
});

describe("Üç haneli kodlar ve parçanın değeri", () => {
  it("seramik kondansatör (pF) ve direnç dizisi (Ω) kodları", () => {
    expect(ucHaneliKod(100_000)).toBe("104");
    expect(ucHaneliKod(1_000_000)).toBe("105");
    expect(ucHaneliKod(22)).toBe("220");
    expect(ucHaneliKod(10_000)).toBe("103");
    expect(ucHaneliKod(4.7)).toBe("4R7");
    for (const k of ["104", "105", "220", "103", "472"]) expect(ucHaneliKod(ucHaneliKoduOku(k))).toBe(k);
    expect(ucHaneliKoduOku("4R7")).toBe(4.7);
    expect(kodAcilimi("104", "pF")).toBe("104 = 10 × 10⁴ pF = 100 nF");
    expect(kodAcilimi("103", "Ω")).toBe("103 = 10 × 10³ Ω = 10 kΩ");
  });

  it("parça adından değer", () => {
    expect(pasifDegeri("R_330")).toEqual({ tur: "direnc", ohm: 330, tolerans: 5, film: "karbon" });
    expect(pasifDegeri("R_1K3")).toEqual({ tur: "direnc", ohm: 1300, tolerans: 1, film: "metal" });
    expect(pasifDegeri("R_680")).toMatchObject({ ohm: 680, film: "metal" });
    expect(pasifDegeri("RN_10K_8")).toEqual({ tur: "dizi", ohm: 10_000, adet: 8, kod: "A103J", tolerans: 5 });
    expect(pasifDegeri("C_100N")).toMatchObject({ tur: "seramik", kod: "104", volt: 50 });
    expect(pasifDegeri("C_1U")).toMatchObject({ tur: "seramik", kod: "105" });
    expect(pasifDegeri("C_100U")).toMatchObject({ tur: "elektrolitik", volt: 16 });
    expect(pasifDegeri("C_10U")).toMatchObject({ tur: "elektrolitik" });
    expect(pasifDegeri("POT_100K")).toEqual({ tur: "pot", ohm: 100_000, kod: "104" });
    expect(pasifDegeri("OSC_25M175")).toEqual({ tur: "osilator", hz: 25_175_000 });
    expect(pasifDegeri("OSC_CAN")).toEqual({ tur: "osilator", hz: null });
    expect(pasifDegeri("LED")).toBeNull();
    expect(ohmMetni(1300)).toBe("1,3 kΩ");
    expect(faradMetni(1e-7)).toBe("100 nF");
    expect(faradMetni(1e-4)).toBe("100 µF");
  });
});

describe("LED akımı ve seri direnç", () => {
  it("I = (5 V − Vf) / R", () => {
    expect(ledAkimi(5, 2, 330)).toBeCloseTo(0.009091, 6);
    expect(akimMetni(ledAkimi(5, 2, 330))).toBe("9,1 mA");
    expect(ledAkimi(5, LED_RENKLERI.kirmizi.vf, 330)).toBeCloseTo((5 - 1.9) / 330, 9);
    expect(akimMetni(ledAkimi(5, LED_RENKLERI.kirmizi.vf, 330))).toBe("9,4 mA");
    expect(akimMetni(ledAkimi(5, LED_RENKLERI.mavi.vf, 330))).toBe("5,8 mA");
    expect(ledAkimi(3.3, 3.4, 100)).toBe(0); // iletime geçmez
    expect(seriDirenc(5, 2, 0.01)).toBeCloseTo(300, 9);
    expect(direncGucu(0.01, 330)).toBeCloseTo(0.033, 9);
    expect(rcSabiti(10_000, 10e-6)).toBeCloseTo(0.1, 12);
    expect(akimMetni(5 / 10_000)).toBe("0,5 mA");
    expect(akimMetni(2e-5)).toBe("20 µA");
  });

  it("her LED rengi 330 Ω ile 3 mm LED sınırının (20 mA) altında, 3 mA'nın üstünde", () => {
    for (const r of Object.values(LED_RENKLERI)) {
      const I = ledAkimi(5, r.vf, 330);
      expect(I).toBeGreaterThan(0.003);
      expect(I).toBeLessThan(0.02);
      expect(r.vf).toBeGreaterThanOrEqual(r.vfAralik[0]);
      expect(r.vf).toBeLessThanOrEqual(r.vfAralik[1]);
    }
  });

  it("LED rengi görevinden", () => {
    expect(ledRengi("FAULT LED'i")).toBe("kirmizi");
    expect(ledRengi("HALTED LED'i")).toBe("turuncu");
    expect(ledRengi("CLK LED'i")).toBe("mavi");
    expect(ledRengi("VCC göstergesi")).toBe("yesil");
    expect(ledRengi("D3 veri hattı")).toBe("sari");
    expect(ledRengi("bilinmeyen")).toBe("kirmizi");
  });
});

describe("Pasifin kartta ne iş yaptığı (bilgisayarın şeması)", () => {
  const { board } = buildFullMachineBoard();
  const lay = boardLayout(board);
  const ends = netEndpoints(lay);
  const find = (ref: string) => {
    const chip = lay.chips.find((c) => c.ref === ref);
    const passive = lay.passives.find((p) => p.ref === ref);
    return chip || passive ? { chip, passive } : null;
  };
  const net = (name: string) => board.n(name);
  const ctx = (lv: Record<number, number> = {}): PasifBaglam => ({
    ends, find, netName: (n) => board.netName(n), level: (n) => (n <= 1 ? n : lv[n] ?? 2),
  });
  const P = (ref: string) => find(ref)!.passive!;

  it("üç LED: renkleri, seri dirençleri ve akımları", () => {
    expect(["D1", "D2", "D201"].map((r) => P(r).led)).toEqual(["turuncu", "kirmizi", "mavi"]);
    const d = ledDevresi(P("D201"), ctx());
    expect(d.direnc?.ref).toBe("R205");
    expect(d.ohm).toBe(330);
    expect(d.sinyal).toBe(net("CLK"));
    expect(ledAkimiOf(d)).toBeCloseTo((5 - 3.1) / 330, 9);
    expect(ledDevresi(P("D1"), ctx()).direnc?.ref).toBe("R1");
    expect(ledDevresi(P("D2"), ctx()).direnc?.ref).toBe("R2");
    expect(seriLed(P("R205"), ctx())?.ref).toBe("D201");
    expect(seriLed(P("R204"), ctx())).toBeNull();
  });

  it("LED yalnız sürücüsü 1 iken yanar; açıklama Türkçe ve canlı", () => {
    const d = ledDevresi(P("D201"), ctx());
    const clk = net("CLK");
    expect(ledYanik(d, ctx({ [clk]: 1 }).level)).toBe(true);
    expect(ledYanik(d, ctx({ [clk]: 0 }).level)).toBe(false);
    const a = pasifAciklamasi(P("D201"), ctx({ [clk]: 1 }));
    expect(a.ozet).toBe("mavi LED · CLK · ≈ 5,8 mA · yanıyor");
    expect(a.durum?.ton).toBe("yanik");
    expect(a.durum?.metin).toContain("U206.Y0");
    expect(a.ilgili.map((x) => x.ref)).toEqual(["R205"]);
    expect(pasifAciklamasi(P("D201"), ctx({ [clk]: 0 })).durum?.ton).toBe("sonuk");
    const r = pasifAciklamasi(P("R205"), ctx({ [clk]: 1 }));
    expect(r.ozet).toBe("330 Ω (turuncu-turuncu-kahverengi-altın) · D201 için ≈ 5,8 mA");
  });

  it("yalnız pasiflere bağlı net direncin öbür ucunun seviyesini taşır", () => {
    const anot = P("D201").pins.find((q) => q.num === 1)!.net;
    expect(board.netName(anot)).toBe("LED_CLK");
    expect(etkinNet(ends, find, anot)).toBe(net("CLK"));
    expect(etkinNet(ends, find, net("CLK"))).toBe(net("CLK"));
    expect(etkinNet(ends, find, 0)).toBe(0);
  });

  it("çekme dirençleri, direnç dizileri, RC çiftleri ve VGA DAC'ı", () => {
    expect(cekmeDirenci(P("RN401"))).toMatchObject({ yon: "yukari", ohm: 10_000 });
    expect(cekmeDirenci(P("RN401"))!.hatlar).toHaveLength(8);
    expect(cekmeDirenci(P("RN1"))).toMatchObject({ yon: "asagi" });
    expect(cekmeDirenci(P("R204"))).toMatchObject({ yon: "yukari", hatlar: [net("~WAIT")] });
    expect(cekmeDirenci(P("R205"))).toBeNull();
    const rc = rcCifti(P("R201"), ctx())!;
    expect(rc.kondansator.ref).toBe("C201");
    expect(rc.tau).toBeCloseTo(0.1, 9);
    expect(rcCifti(P("R203"), ctx())?.pot?.ref).toBe("RV201");
    const dac = dacDirenci(P("R702"), ctx())!;
    expect(dac.kanal).toBe("kırmızı");
    expect(dac.konnektor.ref).toBe("J701");
    expect(dac.girisler.map((g) => g.ohm).sort((a, b) => a - b)).toEqual([680, 1300]);
    // GND'deki çekme direnci LED katotlarını "seri LED" sanmaz
    for (const p of lay.passives.filter((x) => x.kind === "direnc" && x.pins.some((q) => q.net === 0))) expect(seriLed(p, ctx())).toBeNull();
  });

  it("her pasifin bir açıklaması var (boş ya da NaN yok)", () => {
    for (const p of lay.passives) {
      const a = pasifAciklamasi(p, ctx());
      expect(a.ozet.length, p.ref).toBeGreaterThan(3);
      expect(a.gorev.length, p.ref).toBeGreaterThan(0);
      const metin = [a.tur, a.deger ?? "", a.ozet, ...a.gorev, ...a.hesaplar.flatMap((h) => [h.ad, h.formul, h.sonuc]), a.durum?.metin ?? ""].join(" ");
      expect(metin, p.ref).not.toMatch(/NaN|undefined|Infinity/);
    }
  });

  it("dekuplaj kondansatörü çipinin VCC ve GND bacaklarını söyler", () => {
    const c = lay.passives.find((p) => p.chip === "U201" && p.part === "C_100N")!;
    const a = pasifAciklamasi(c, ctx());
    expect(a.gorev[0]).toContain("U201 (74HC14)");
    expect(a.gorev[0]).toContain("VCC (14) ve GND (7)");
    expect(a.hesaplar[0].formul).toBe("104 = 10 × 10⁴ pF = 100 nF");
  });
});

describe("Çizimler ve rehberin görselleri", () => {
  it("çizimler bantları sırayla ve sayısal koordinatlarla üretir", () => {
    const r = direncCizimi(330, 5, KOYU, { id: "t", etiket: true });
    const sira = direncBantlari(330).map((b) => r.g.indexOf(`fill="${b.hex}"`));
    expect(sira.every((i) => i > 0)).toBe(true);
    expect([...sira].sort((a, b) => a - b)).toEqual(sira);
    for (const p of [r, ledCizimi("mavi", ACIK, { id: "l", yanik: true }), ledDevreCizimi({ surucu: "U1.Y", sinyal: "S", direnc: "R1", ohm: 330, led: "D1", renk: "yesil", seviye: 1 }, KOYU)]) {
      const s = svgBelge(p, ACIK, "deneme");
      expect(s).not.toMatch(/NaN|undefined/);
      expect(s.match(/<svg/g)).toHaveLength(1);
      expect(s.endsWith("</svg>")).toBe(true);
    }
  });

  it("depodaki görseller güncel (npm run cpu16 -- kit)", () => {
    const files = gorselDosyalari();
    expect(files.map((f) => f.path.split("/").at(-1))).toEqual([
      "renk-kodu.svg", "led-anatomi.svg", "seri-direnc.svg", "cekme-direnci.svg", "dekuplaj.svg", "kondansator-okuma.svg", "direnc-dizisi.svg",
      "breadboard-yerlesim.svg",
    ]);
    for (const f of files) {
      const disk = readFileSync(new URL(`../../${f.path}`, import.meta.url), "utf8");
      expect(disk === f.content, f.path).toBe(true);
      expect(f.content).not.toMatch(/NaN|undefined/);
    }
  });
});
