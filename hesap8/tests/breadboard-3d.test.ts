// "8 bit hesap 3D" bölümünün breadboard görünümü (src/board3d): varsayılan görünüm breadboard, PCB'ye
// geçiş; 3D yerleşimde her bacak deliğinin üstünde; kurulum modu tel tel ilerler ve her teli delikten
// deliğe yazar.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADIM, KENAR_SOL, KENAR_UST, PAY } from "../breadboard/geometri.ts";
import { aktifHesapGorunumu, aktifKartiSec, hesapGorunumuSec, hesapPlani, kartYerlesimi } from "../../src/board3d/aktif.ts";
import { BB_RENKLERI, renkTanimi } from "../breadboard/renk.ts";
import { bbSeciliTel, bbSiradakiAcik, telKimligi, telRengiYazisi, telTarifi, ucunKomsulari, useBbKurulum } from "../../src/board3d/bbKurulum.ts";
import { boardLayoutData, findPart, useKart } from "../../src/board3d/store.ts";
import { kartPlani } from "../../src/board3d/kurulum.ts";

beforeAll(() => {
  aktifKartiSec("hesap");
});
afterAll(() => {
  hesapGorunumuSec("breadboard");
  aktifKartiSec("cpu16");
});

describe("görünüm: breadboard (varsayılan) ve PCB", () => {
  it("varsayılan breadboard; PCB'ye geçince yerleşim değişir, parçalar ve seçimler aynı kalır", () => {
    expect(aktifHesapGorunumu()).toBe("breadboard");
    expect(useKart.getState().gorunum).toBe("breadboard");
    const bb = boardLayoutData();
    expect(bb.cards).toEqual([]);
    expect(bb.chips.length).toBe(216);
    useKart.getState().selectChip("U12");
    useKart.getState().setGorunum("pcb");
    expect(useKart.getState().gorunum).toBe("pcb");
    const pcb = boardLayoutData();
    expect(pcb).not.toBe(bb);
    expect(pcb).toBe(kartYerlesimi("hesap", "pcb"));
    expect(pcb.cards.length).toBe(1);
    expect(useKart.getState().chip).toBe("U12");
    expect(findPart("U12")?.chip).toBe(pcb.chips.find((c) => c.ref === "U12"));
    useKart.getState().setGorunum("breadboard");
    expect(boardLayoutData()).toBe(bb);
    useKart.getState().selectChip(null);
  });

  it("3D yerleşimde her bacak bir deliğin üstünde (2,54 mm ızgara), parçalar planla aynı", () => {
    const lay = kartYerlesimi("hesap", "breadboard");
    const p = hesapPlani();
    expect(lay.chips.length + lay.passives.length).toBe(p.yerlesim.parcalar.length);
    // delik: x = PAY + (X − KENAR_SOL) · 2,54, y = PAY + (Y − KENAR_UST) · 2,54 (X, Y tam sayı)
    const tam = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
    for (const c of [...lay.chips, ...lay.passives]) {
      for (const q of c.pins) expect(tam((q.x - PAY) / ADIM + KENAR_SOL) && tam((q.y - PAY) / ADIM + KENAR_UST), `${c.ref}.${q.num}`).toBe(true);
    }
    // SIP'ler 180° dönük: 1. pin sağda
    const sip = lay.passives.find((x) => x.kind === "dizi")!;
    expect(sip.ters).toBe(true);
    expect(sip.pins.find((q) => q.num === 1)!.x).toBeGreaterThan(sip.pins.find((q) => q.num === 9)!.x);
  });

  it("pinden pine kurulum listesi (belgedeki) PCB yerleşimiyle kurulur", () => {
    expect(kartPlani("hesap").teller.length).toBeGreaterThan(1600);
  });
});

describe("breadboard kurulum modu", () => {
  it("teller delikten deliğe yazılır: board, delik, uzunluk, renk", () => {
    const p = hesapPlani();
    const t = p.teller.find((x) => !x.ray && x.renk === "sari")!;
    expect(telTarifi(p, t)).toMatch(/^BB\d\d [a-j]\d+ → BB\d\d [a-j]\d+, \d+ mm, sarı$/);
    expect(telKimligi(7)).toBe("T0007");
    // ucun şeridinde bir çipin bacağı ya da boş şerit; raylar adıyla
    expect(ucunKomsulari(p, t.yol[0], t.yol[1])).toMatch(/^(U|R|C|D|SW|RN|DS|J)\w*\.\d+|boş şerit/);
    const r = p.teller.find((x) => x.ray)!;
    expect(ucunKomsulari(p, r.yol[0], r.yol[1])).toMatch(/rayı/);
  });

  it("İngilizce: delikler, raylar, renk ve grup İngilizce yazılır; Türkçesi değişmedi", () => {
    const p = hesapPlani();
    const t = p.teller.find((x) => !x.ray && x.renk === "sari")!;
    const tr = telTarifi(p, t);
    // sinyal teli şeritten şeride: Türkçeyle aynı, yalnız renk İngilizce
    expect(telTarifi(p, t, "en")).toBe(tr.replace(/sarı$/, "yellow"));
    const hesap = { kart: "hesap", renk: renkTanimi };
    expect(telRengiYazisi(hesap, t)).toBe("sarı tel · A sayısı");
    expect(telRengiYazisi(hesap, t, "en")).toBe("yellow wire · Number A");
    // ray köprüsü: uçları raylarda
    const r = p.teller.find((x) => x.ray && x.renk === "kirmizi")!;
    expect(telTarifi(p, r)).toMatch(/^BB\d\d (üst|alt)\+\d+ → BB\d\d (üst|alt)\+\d+, \d+ mm, kırmızı$/);
    expect(telTarifi(p, r, "en")).toMatch(/^BB\d\d (top|bottom)\+\d+ → BB\d\d (top|bottom)\+\d+, \d+ mm, red$/);
    expect(ucunKomsulari(p, r.yol[0], r.yol[1])).toMatch(/^\+5 V rayı \((üst|alt)\)$/);
    expect(ucunKomsulari(p, r.yol[0], r.yol[1], "en")).toMatch(/^\+5 V rail \((top|bottom)\)$/);
    expect(telRengiYazisi(hesap, r, "en")).toBe("red wire · rail jumper");
    for (const c of BB_RENKLERI) expect(c.en.grup, c.grup).toMatch(/^[\x20-\x7e]+$/);
  });

  it("işaretleyince odak sıradaki açık tele geçer; git() gezinir; sıfırla hepsini siler", () => {
    const s = () => useBbKurulum.getState();
    s().sifirla();
    s().ac(true);
    const t = hesapPlani().teller;
    expect(bbSeciliTel(s())?.no).toBe(1);
    s().isaretle(1);
    expect(s().yapilan.has(1)).toBe(true);
    expect(s().secili).toBe(2);
    s().git(-1);
    expect(s().secili).toBe(1);
    s().git(1, true);
    expect(s().secili).toBe(2);
    expect(bbSiradakiAcik(t, new Set([1, 2]), 1)?.no).toBe(3);
    s().sifirla();
    expect(s().yapilan.size).toBe(0);
    s().ac(false);
  });
});
