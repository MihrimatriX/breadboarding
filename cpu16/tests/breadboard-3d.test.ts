// "CPU16 kartı 3D" bölümünün breadboard görünümü (src/board3d): varsayılan PCB (değişmedi), breadboard'a
// geçiş (veri ayrı parça, yüklenince), 3D yerleşimde her bacak deliğinin üstünde ve PCB'dekiyle aynı
// netlerde, panolar ve şerit kablo, kurulum modu pano pano ve aşama aşama, tellerin yuvarlak dirsekli
// boru ekseni (telYolu.ts), tıklanan tel seçimi, şerit kablo ve arka panel damarları (serit.ts).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { ADIM, KENAR_SOL, KENAR_UST, mmX, mmY, PAY } from "../board/breadboard/geometri.ts";
import { telYollari3B } from "../board/breadboard/plan.ts";
import { kartBasligi } from "../../src/board3d/adlar.ts";
import { aktifGorunum, aktifKart, bbSahnesi, cpuBbHazir, cpuBbYukle, gorunumHazir, gorunumSec, kartYerlesimi } from "../../src/board3d/aktif.ts";
import { bbPano, bbSeciliTel, telKimligi, useBbKurulum } from "../../src/board3d/bbKurulum.ts";
import { boardLayoutData, boardModel, findPart, useKart } from "../../src/board3d/store.ts";
import { DAMAR, damarGruplari, damarNo, damarSinyalleri, damarU, damarYolu, seritGeometrisi, seritIsini, sinyalinDamarlari } from "../../src/board3d/serit.ts";
import { kartlaraGore } from "../../src/board3d/wires.ts";
import { DIRSEK, isinTeli, yuvarlakYol } from "../../src/board3d/telYolu.ts";

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

describe("tel borusu: yuvarlak dirsekler (telYolu.ts)", () => {
  const nokta = (p: number[], i: number) => p.slice(3 * i, 3 * i + 3);
  const uzaklik = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  /** uçlar korunur, ardışık iki nokta aynı değil, her nokta girişin sınır kutusunda (yay köşe üçgeninde kalır) */
  const saglam = (giris: number[], cikis: number[], ad = "") => {
    const k = cikis.length / 3;
    expect(nokta(cikis, 0), ad).toEqual(nokta(giris, 0));
    expect(nokta(cikis, k - 1), ad).toEqual(nokta(giris, giris.length / 3 - 1));
    for (let i = 1; i < k; i++) expect(uzaklik(nokta(cikis, i - 1), nokta(cikis, i)), `${ad} ${i}. adım`).toBeGreaterThan(1e-6);
    for (let e = 0; e < 3; e++) {
      const g = giris.filter((_, i) => i % 3 === e);
      const c = cikis.filter((_, i) => i % 3 === e);
      expect(Math.min(...c), ad).toBeGreaterThanOrEqual(Math.min(...g) - 1e-9);
      expect(Math.max(...c), ad).toBeLessThanOrEqual(Math.max(...g) + 1e-9);
    }
  };

  it("L köşe: yay köşeden DIRSEK önce başlar, DIRSEK sonra biter, köşeden geçmez", () => {
    const p = [0, 0, 0, 10, 0, 0, 10, 0, 10];
    const y = yuvarlakYol(p);
    saglam(p, y);
    const k = y.length / 3;
    expect(nokta(y, 1)).toEqual([10 - DIRSEK, 0, 0]);
    expect(nokta(y, k - 2)[0]).toBeCloseTo(10);
    expect(nokta(y, k - 2)[2]).toBeCloseTo(DIRSEK);
    for (let i = 0; i < k; i++) expect(uzaklik(nokta(y, i), [10, 0, 0])).toBeGreaterThan(0.3);
  });

  it("kısa uç bacak (deliğe inen 0,6 mm) ve kısa parça: dirsekler taşmaz, üst üste binmez", () => {
    // delikten kalkış, 1,5 mm'lik parça, iki dirsek arası, deliğe iniş
    const p = [0, 1, 0, 0, 1.6, 0, 1.5, 1.6, 0, 1.5, 1.6, 10, 1.5, 1, 10];
    saglam(p, yuvarlakYol(p));
    // yol ileri gider: x hiç geri dönmez, z de
    const y = yuvarlakYol(p);
    for (let i = 1; i < y.length / 3; i++) {
      expect(y[3 * i]).toBeGreaterThanOrEqual(y[3 * i - 3] - 1e-9);
      expect(y[3 * i + 2]).toBeGreaterThanOrEqual(y[3 * i - 1] - 1e-9);
    }
  });

  it("doğrusal köşe atlanır; iki noktalı yol olduğu gibi döner", () => {
    expect(yuvarlakYol([0, 0, 0, 5, 0, 0, 10, 0, 0])).toEqual([0, 0, 0, 10, 0, 0]);
    expect(yuvarlakYol([0, 0, 0, 5, 0, 0])).toEqual([0, 0, 0, 5, 0, 0]);
  });

  it("bütün panoların her teli (bilgisayar ve hesap makinesi): kamburlar ve köşeler sağlam", () => {
    let n = 0;
    for (const p of [...bbSahnesi("cpu16").panolar, ...bbSahnesi("hesap").panolar]) {
      telYollari3B(p.plan.teller).forEach((y, ti) => {
        // 3D'deki gibi: delikten kalkar (1 mm), kat başına 1,3 mm yükselir, öbür deliğe iner
        const m: number[] = [];
        for (let i = 0; i < y.length; i += 3) m.push(mmX(y[i]), 1.6 + y[i + 2] * 1.3, mmY(y[i + 1]));
        const giris = [m[0], 1, m[2], ...m, m[m.length - 3], 1, m[m.length - 1]];
        saglam(giris, yuvarlakYol(giris), `${p.kart} T${p.plan.teller[ti].no}`);
        n++;
      });
    }
    expect(n).toBeGreaterThan(3000);
  });

  it("tıklama: ışın üstte kalan teli bulur (kesişmede kamburlaşan), ıskalayınca null", () => {
    // iki tel çapraz: alttaki x boyunca (y = 0,2), üstteki z boyunca (y = 0,4); ikisinin de kenarları delikte
    const alt = [-5, 0.1, 0, -5, 0.2, 0, 5, 0.2, 0, 5, 0.1, 0];
    const ust = [0, 0.1, -5, 0, 0.4, -5, 0, 0.4, 5, 0, 0.1, 5];
    const asagi = [0, -1, 0];
    expect(isinTeli([0, 10, 0], asagi, [alt, ust], 0.1)?.tel).toBe(1);
    expect(isinTeli([3, 10, 0], asagi, [alt, ust], 0.1)?.tel).toBe(0);
    expect(isinTeli([0, 10, 0], asagi, [alt, ust], 0.1)?.t).toBeCloseTo(9.6);
    expect(isinTeli([3, 10, 3], asagi, [alt, ust], 0.1)).toBeNull();
    // ışının arkasındaki tel sayılmaz
    expect(isinTeli([0, 1, 0], [0, 1, 0], [alt], 0.1)).toBeNull();
  });
});

describe("tel seçimi (breadboard'da tıklanan tel)", () => {
  it("çip ve net seçimiyle birlikte olmaz; görünüm değişince kalkar", () => {
    const k = () => useKart.getState();
    k().setGorunum("breadboard");
    expect(aktifGorunum()).toBe("breadboard");
    k().selectChip("U1");
    k().selectNet(5);
    k().selectTel({ kart: "cpu", no: 1 });
    expect(k().tel).toEqual({ kart: "cpu", no: 1 });
    expect(k().chip).toBeNull();
    expect(k().net).toBeNull();
    k().selectNet(5);
    expect(k().tel).toBeNull();
    k().selectTel({ kart: "cpu", no: 2 });
    k().selectChip("U1");
    expect(k().tel).toBeNull();
    k().selectTel({ kart: "cpu", no: 3 });
    gorunumSec("pcb", "cpu16");
    expect(k().tel).toBeNull();
    k().selectChip(null);
  });
});

describe("şerit kablo ve arka panel damarları (serit.ts)", () => {
  /** üçgenlerin yüz normalinin y bileşenleri */
  const yuzY = (g: ReturnType<typeof seritGeometrisi>) => {
    const p = g.getAttribute("position");
    const ix = g.getIndex()!;
    const out: number[] = [];
    for (let i = 0; i < ix.count; i += 3) {
      const [a, b, c] = [ix.getX(i), ix.getX(i + 1), ix.getX(i + 2)];
      const ux = p.getX(b) - p.getX(a), uz = p.getZ(b) - p.getZ(a);
      const vx = p.getX(c) - p.getX(a), vz = p.getZ(c) - p.getZ(a);
      out.push(uz * vx - ux * vz);
    }
    return out;
  };

  it("şerit geometrisi: genişliği en yönünde, u enine 0 … 1, yüzü ve normali yukarı (iki yönde de)", () => {
    const g = seritGeometrisi([0, 0, 0, 10, 0, 0], [0, 0, 1], 8);
    expect(g.getAttribute("position").count).toBe(4);
    expect([g.getAttribute("position").getZ(0), g.getAttribute("position").getZ(1)]).toEqual([-4, 4]);
    expect([g.getAttribute("uv").getX(0), g.getAttribute("uv").getX(1)]).toEqual([0, 1]);
    expect(g.getAttribute("normal").getY(0)).toBeCloseTo(1);
    expect(yuzY(g).every((y) => y > 0)).toBe(true);
    // sokete giden kol: z boyunca, iki yönde de yüz yukarı
    for (const dz of [1, -1]) {
      const k = seritGeometrisi([0, 1, 0, 0, 1, 10 * dz, 0, 0, 12 * dz], [1, 0, 0], 8);
      expect(k.getAttribute("normal").getY(0), `dz ${dz}`).toBeCloseTo(1);
      expect(yuzY(k).every((y) => y > 0), `dz ${dz}`).toBe(true);
    }
  });

  it("tıklanan damar: ışının değdiği enine yerden; dışından ya da paralel ışın değmez", () => {
    const g = DAMAR * 0.127;
    const yol = [-10, 0, 0, 10, 0, 0];
    const asagi = [0, -1, 0] as const;
    const h = seritIsini([2, 5, -g / 2 + 0.127 * 4.5], asagi, yol, [0, 0, 1], g)!;
    expect(h.t).toBeCloseTo(5);
    expect(damarNo(h.u)).toBe(4);
    expect(damarNo(seritIsini([0, 5, g / 2 - 0.01], asagi, yol, [0, 0, 1], g)!.u)).toBe(DAMAR - 1);
    expect(seritIsini([0, 5, g], asagi, yol, [0, 0, 1], g)).toBeNull();
    expect(seritIsini([11, 5, 0], asagi, yol, [0, 0, 1], g)).toBeNull();
    expect(seritIsini([0, 5, 0], [1, 0, 0], yol, [0, 0, 1], g)).toBeNull();
  });

  it("45° katlama: koldaki her damar koridordaki aynı damarın üstünde biter (iki yönde); katlamanın ötesi koridorun", () => {
    const g = DAMAR * 0.127;
    const koridor = [-30, 0, 0, 30, 0, 0];
    for (const dz of [1, -1]) {
      // kol z boyunca koridorun ortasına gelir; genişliği x boyunca
      const kol = [0, 0.05, -20 * dz, 0, 0.05, 0];
      for (const k of [0, 17, 40, DAMAR - 1]) {
        const uc = damarYolu(kol, [1, 0, 0], g, dz, damarU(k)).slice(-3);
        const ki = damarYolu(koridor, [0, 0, 1], g, 0, damarU(k));
        // koldaki damarın ucu koridordaki aynı damarın çizgisinde; enine yeri kolun damarınınki
        expect(uc[2], `dz ${dz} damar ${k}`).toBeCloseTo(ki[2]);
        expect(uc[0], `dz ${dz} damar ${k}`).toBeCloseTo((damarU(k) - 0.5) * g);
      }
      // eğik kenarın öbür yanına (katlamanın ötesine) değen ışın kola değmez; katlamasız kolun içinde kalırdı
      const disari = [-dz * (g / 2 - 0.05), 5, -dz * 0.2] as const;
      expect(seritIsini(disari, [0, -1, 0], kol, [1, 0, 0], g, dz), `dz ${dz}`).toBeNull();
      expect(seritIsini(disari, [0, -1, 0], kol, [1, 0, 0], g, 0), `dz ${dz} katlamasız`).not.toBeNull();
    }
  });

  it("kablo uçlarda biter: koridorun eğik başı ve sonu, uçtaki kolla aynı kırımda (iki σ için)", () => {
    const g = DAMAR * 0.127;
    for (const sg of [1, -1]) {
      for (const dz of [1, -1]) {
        // koridor x = 0'dan 30'a; ilk soket x = 0'da, kolu z boyunca koridora gelir, genişliği σ·x yönünde
        const koridor = [0, 0, 0, 30, 0, 0];
        const kol = [0, 0.05, -20 * dz, 0, 0.05, 0];
        for (const k of [0, 21, DAMAR - 1]) {
          const bas = damarYolu(koridor, [0, 0, 1], g, 0, damarU(k), sg).slice(0, 3);
          const uc = damarYolu(kol, [sg, 0, 0], g, dz, damarU(k)).slice(-3);
          expect(bas[0], `σ ${sg} dz ${dz} damar ${k}`).toBeCloseTo(uc[0]);
          expect(bas[2], `σ ${sg} dz ${dz} damar ${k}`).toBeCloseTo(uc[2]);
        }
      }
      // eğik başın öbür yanı (x < σ·z) koridorun değil; eğimsiz başta koridorun içinde kalırdı
      const disari = [0.5, 5, sg * (g / 2 - 0.1)] as const;
      expect(seritIsini(disari, [0, -1, 0], [0, 0, 0, 30, 0, 0], [0, 0, 1], g, 0, sg), `σ ${sg}`).toBeNull();
      expect(seritIsini(disari, [0, -1, 0], [0, 0, 0, 30, 0, 0], [0, 0, 1], g, 0, 0), `σ ${sg} eğimsiz`).not.toBeNull();
    }
  });

  it("soketin kafasındaki pin haritasının grupları: art arda giden aynı ön ekli sinyaller", () => {
    const gr = damarGruplari();
    expect(gr).toContainEqual({ ad: "A0–15", ilk: 9, son: 24 });
    expect(gr).toContainEqual({ ad: "DE0–7", ilk: 25, son: 32 });
    expect(gr).toContainEqual({ ad: "DO0–7", ilk: 33, son: 40 });
    expect(gr).toContainEqual({ ad: "PA14–19", ilk: 50, son: 55 });
    // tek sinyaller ve GND / VCC çiftleri grup değil
    expect(gr.every((g) => g.son - g.ilk >= 2)).toBe(true);
  });

  it("damar k = arka panelin k. pini: her kartın konnektöründe k. pin BACKPLANE[k] sinyalinde", () => {
    const ad = damarSinyalleri();
    expect(ad.length).toBe(64);
    expect(sinyalinDamarlari("CLK")).toEqual([5]);
    expect(sinyalinDamarlari("GND")).toEqual([1, 2, 62, 64]);
    const { board } = boardModel();
    const konn = kartYerlesimi("cpu16", "pcb").passives.filter((p) => p.edge);
    expect(konn.length).toBe(7);
    let n = 0;
    for (const p of konn) {
      for (const q of p.pins) {
        if (!ad[q.num - 1] || !board.has(ad[q.num - 1])) continue;
        expect(board.netName(q.net), `${p.ref}.${q.num}`).toBe(ad[q.num - 1]);
        n++;
      }
    }
    expect(n).toBeGreaterThan(7 * 40);
  });

  it("bir netin uçları kart kart: hangi kartta kaç uç (ilk görülme sırasıyla)", () => {
    expect(kartlaraGore([{ card: "cpu" }, { card: "gc" }, { card: "cpu" }])).toEqual([{ card: "cpu", n: 2 }, { card: "gc", n: 1 }]);
    expect(kartlaraGore([])).toEqual([]);
  });
});
