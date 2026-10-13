// "CPU16 kartı 3D" bölümünün breadboard görünümü (src/board3d): varsayılan PCB (değişmedi), breadboard'a
// geçiş (veri ayrı parça, yüklenince), 3D yerleşimde her bacak deliğinin üstünde ve PCB'dekiyle aynı
// netlerde, panolar ve şerit kablo, kurulum modu pano pano ve aşama aşama.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADIM, KENAR_SOL, KENAR_UST, PAY } from "../board/breadboard/geometri.ts";
import { kartBasligi } from "../../src/board3d/adlar.ts";
import { aktifGorunum, aktifKart, bbSahnesi, cpuBbHazir, cpuBbYukle, gorunumHazir, gorunumSec, kartYerlesimi } from "../../src/board3d/aktif.ts";
import { bbPano, bbSeciliTel, telKimligi, useBbKurulum } from "../../src/board3d/bbKurulum.ts";
import { boardLayoutData, findPart, useKart } from "../../src/board3d/store.ts";

beforeAll(async () => {
  expect(aktifKart()).toBe("cpu16");
  await cpuBbYukle();
});
afterAll(() => {
  gorunumSec("pcb", "cpu16");
});

describe("görünüm: PCB (varsayılan) ve breadboard", () => {
  it("varsayılan PCB; breadboard'a geçince yerleşim değişir, çipler ve netleri aynı kalır", () => {
    expect(aktifGorunum()).toBe("pcb");
    expect(useKart.getState().gorunum).toBe("pcb");
    const pcb = boardLayoutData();
    expect(pcb.cards.length).toBeGreaterThan(0);
    expect(cpuBbHazir()).toBe(true);
    expect(gorunumHazir("cpu16", "breadboard")).toBe(true);
    useKart.getState().selectChip("U1");
    useKart.getState().setGorunum("breadboard");
    expect(useKart.getState().gorunum).toBe("breadboard");
    const bb = boardLayoutData();
    expect(bb).toBe(kartYerlesimi("cpu16", "breadboard"));
    expect(bb.cards).toEqual([]);
    expect(bb.chips.length).toBe(pcb.chips.length);
    expect(useKart.getState().chip).toBe("U1");
    expect(findPart("U1")?.chip).toBe(bb.chips.find((c) => c.ref === "U1"));
    // PCB'deki her parça breadboard'da, her bacağı aynı netde (artı yalnız fiziksel parçalar: besleme girişleri, tamponlar)
    const bbParca = new Map([...bb.chips, ...bb.passives].map((p) => [p.ref, p]));
    for (const p of [...pcb.chips, ...pcb.passives]) {
      const q = bbParca.get(p.ref);
      expect(q, p.ref).toBeDefined();
      const net = new Map(q!.pins.map((x) => [x.num, x.net]));
      for (const x of p.pins) expect(net.get(x.num), `${p.ref}.${x.num}`).toBe(x.net);
    }
    expect(bb.passives.filter((p) => !pcb.passives.some((q) => q.ref === p.ref)).every((p) => /^(JB|CB)\d+$/.test(p.ref))).toBe(true);
    useKart.getState().selectChip(null);
  });

  it("her bacak panosunun bir deliğinin üstünde (2,54 mm ızgara, panonun kaydırmasıyla)", () => {
    const s = bbSahnesi("cpu16");
    expect(s.panolar.map((p) => p.kart).sort()).toEqual(["bellek", "clk", "cpu", "gc", "kyb", "onbellek", "video"]);
    expect(s.serit?.soketler.length).toBe(7);
    const lay = kartYerlesimi("cpu16", "breadboard");
    const tam = (v: number) => Math.abs(v - Math.round(v)) < 1e-6;
    for (const c of [...lay.chips, ...lay.passives]) {
      const p = s.panolar.find((x) => x.kart === c.card)!;
      expect(p, c.ref).toBeDefined();
      for (const q of c.pins) {
        expect(tam((q.x - p.x - PAY) / ADIM + KENAR_SOL) && tam((q.y - p.y - PAY) / ADIM + KENAR_UST), `${c.ref}.${q.num}`).toBe(true);
        expect(q.x > p.x && q.x < p.x + p.w && q.y > p.y && q.y < p.y + p.h, `${c.ref}.${q.num} panosunda`).toBe(true);
      }
    }
  });

  it("panoların 3D başlıkları İngilizcede kartın İngilizce adıyla, Türkçede panonun başlığıyla", () => {
    for (const p of [...bbSahnesi("cpu16").panolar, ...bbSahnesi("hesap").panolar]) {
      expect(kartBasligi(p.kart, p.baslik)).toBe(p.baslik);
      expect(kartBasligi(p.kart, p.baslik, "en"), p.kart).not.toMatch(/[çğıöşüÇĞİÖŞÜ]|kart/);
    }
    expect(kartBasligi("kyb", "Kendin yap bellek kartı", "en")).toBe("DIY memory board");
  });
});

describe("breadboard kurulum modu (bilgisayar)", () => {
  it("pano ve aşama seçilir; teller panonun adıyla delikten deliğe yazılır; işaretleyince sıradakine geçer", () => {
    const s = () => useBbKurulum.getState();
    expect(s().pano).toBe("clk");
    s().panoSec("cpu");
    s().sifirla();
    s().ac(true);
    expect(bbSeciliTel(s())?.no).toBe(1);
    const p = bbPano("cpu");
    const t1 = bbSeciliTel(s())!;
    expect(p.tarif(t1)).toMatch(/^CPU · BB\d\d (üst|alt)?[a-j+−]*\d+ → BB\d\d (üst|alt)?[a-j+−]*\d+, \d+ mm, [a-zçğıöşü]+$/);
    expect(telKimligi(t1.no)).toBe("T0001");
    s().isaretle(1);
    expect(s().yapilan.has(1)).toBe(true);
    expect(s().secili).toBe(2);
    // aşama süzgeci: gezinme yalnız o aşamanın tellerinde
    s().asamaSec(3);
    expect(bbSeciliTel(s())!.asama).toBe(3);
    for (let i = 0; i < 5; i++) {
      s().git(1);
      expect(bbSeciliTel(s())!.asama).toBe(3);
    }
    s().asamaSec(null);
    s().sifirla();
    expect(s().yapilan.size).toBe(0);
    s().ac(false);
  });
});
