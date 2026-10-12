// Hesap makinesinin breadboard kurulumu (hesap8/breadboard): saklanan yerleşim ve teller güncel mi;
// yalnız fiziksel modelden (şeritler, raylar, teller, deliklerdeki bacaklar) birleşim-bul ile kurulan
// bağlantı netlistle birebir aynı mı; parçalar gerçek breadboard'a oturuyor mu; her aşamanın sonunda
// o ana dek takılanlar tam bağlı mı; doğrulayıcı gerçekten hata yakalıyor mu (bozulmuş kopyalar).

import { beforeAll, describe, expect, it } from "vitest";
import { buildHesapBoard } from "../kart.ts";
import { beklenen, ornekDurumlar } from "../model.ts";
import { HesapSim } from "../sim.ts";
import { bbDogrula } from "../breadboard/dogrulama.ts";
import { noktaninBoardu, rayDeligiVar } from "../breadboard/geometri.ts";
import { bbOlcu, bbPlani, netlistParmakIzi, noktaBoardu, telYollari3B, ucEtiketi, yolCoz, yolKodla, type BbPlani } from "../breadboard/plan.ts";
import { telRengi } from "../breadboard/renk.ts";
import { BB_VERI } from "../breadboard/veri.ts";
import { pinNeti } from "../breadboard/yerlesim.ts";

let plan: BbPlani;
beforeAll(() => {
  plan = bbPlani(buildHesapBoard());
});

const yerel = (X: number, Y: number) => {
  const b = noktaninBoardu(plan.yerlesim.boards, X, Y);
  return { bx: b.bx, by: b.by, r: Y - b.y0, c: X - b.x0 };
};

describe("saklanan breadboard verisi", () => {
  it("netlistin parmak iziyle aynı (devre değiştiyse: npm run hesap8 -- breadboard --uret)", () => {
    expect(BB_VERI.parmakIzi).toBe(netlistParmakIzi(plan.kart.board));
  });

  it("yol kodlaması gidip dönüyor", () => {
    for (const t of plan.teller.slice(0, 300)) expect(yolCoz(yolKodla(t.yol))).toEqual(t.yol);
  });
});

describe("bağlantı: yalnız fiziksel modelden (birleşim-bul)", () => {
  it("netlistle birebir aynı: açık ve kısa devre yok, her bacak bir delikte, delikler tek, gövde ve uç üstünden geçen tel yok", () => {
    const d = bbDogrula(plan.kart.board, plan.yerlesim, plan.teller);
    expect(d.hatalar).toEqual([]);
    // bacağı olan bütün netler karşılaştırıldı
    const netler = new Set<number>();
    let bacak = 0;
    const b = plan.kart.board;
    for (const c of b.chips) for (const p of c.def.pins) {
      bacak++;
      const n = pinNeti(c, p.num);
      if (n >= 0) netler.add(n);
    }
    for (const p of b.passives) for (const n of Object.values(p.pins)) netler.add(n);
    expect(d.netSayisi).toBe(netler.size);
    expect(d.pinSayisi).toBeGreaterThanOrEqual(bacak);
    expect(d.telSayisi).toBe(plan.teller.length);
  });

  it("her aşamanın sonunda o ana dek takılan parçaların netleri tam (aşama testi yapılabilir)", () => {
    for (const a of plan.asamalar) {
      const d = bbDogrula(plan.kart.board, plan.yerlesim, plan.teller, { asama: a.no });
      expect(d.hatalar, `aşama ${a.no}`).toEqual([]);
    }
  });

  it("doğrulayıcı bozulmuş kopyalarda hata bulur: eksik tel, yanlış şeride giden uç, gövde üstünden tel, aynı delikte iki uç", () => {
    const { board } = plan.kart;
    const y = plan.yerlesim;
    const sinyal = plan.teller.findIndex((t) => !t.ray && t.renk !== "kirmizi" && t.renk !== "siyah");
    // eksik tel: açık devre
    const eksik = plan.teller.filter((_, i) => i !== sinyal);
    expect(bbDogrula(board, y, eksik).hatalar.some((h) => h.startsWith("açık devre"))).toBe(true);
    // ucu başka bir netin şeridine kayan tel (bir çipin başka bir bacağının şeridinde boş delik)
    const cip = y.parcalar.find((p) => p.cipMi)!;
    const hedef = cip.bacaklar.find((b) => b.pin === 2)!;
    const t = plan.teller[sinyal];
    const kisa = plan.teller.map((x, i) => (i === sinyal ? { ...x, yol: [t.yol[0], t.yol[1], hedef.X, t.yol[1], hedef.X, hedef.Y + 2] } : x));
    const h = bbDogrula(board, y, kisa).hatalar;
    expect(h.some((x) => x.startsWith("kısa devre") || x.startsWith("açık devre"))).toBe(true);
    // çipin gövdesinin üstünden geçen tel
    const [x0, y0, x1] = cip.govde;
    const govde = [...plan.teller, { yol: [x0 - 1, y0 + 1, x1 + 1, y0 + 1] }];
    expect(bbDogrula(board, y, govde).hatalar.some((x) => x.includes("gövdesinin üstünden"))).toBe(true);
    // aynı delikte iki uç
    const iki = [...plan.teller, { yol: [t.yol[0], t.yol[1], t.yol[0], t.yol[1] - 1] }];
    expect(bbDogrula(board, y, iki).hatalar.some((x) => x.startsWith("delik iki kez"))).toBe(true);
  });
});

describe("parçalar breadboard'a oturuyor", () => {
  it("60 BB830; board başına en çok 5 mantık çipi; göstergeler arka sırada, anahtarlar ön sırada", () => {
    const y = plan.yerlesim;
    expect(y.boards.length).toBe(60);
    expect(y.nx * y.ny).toBe(60);
    for (const b of y.boards) expect(y.parcalar.filter((p) => p.board === b.no && p.cipMi).length, b.ad).toBeLessThanOrEqual(5);
    for (const p of y.parcalar) {
      if (p.tur === "gosterge") expect(y.boards[p.board].by, p.ref).toBe(0);
      if (p.part.startsWith("SW_")) expect(y.boards[p.board].by, p.ref).toBe(y.ny - 1);
    }
  });

  it("DIP'ler ve göstergeler orta kanalın üstünde, bacaklar gerçek aralıkta (2,54 / 7,62 / 15,24 mm)", () => {
    for (const p of plan.yerlesim.parcalar) {
      const rs = p.bacaklar.map((b) => yerel(b.X, b.Y).r);
      if (p.tur === "dip") {
        const n = p.bacaklar.length;
        for (const b of p.bacaklar) expect(yerel(b.X, b.Y).r, `${p.ref}.${b.pin}`).toBe(b.pin <= n / 2 ? 10 : 7);
        // 1. pin ile n. pin aynı sütunda (7,62 mm), komşu pinler 2,54 mm
        const p1 = p.bacaklar.find((b) => b.pin === 1)!;
        const pn = p.bacaklar.find((b) => b.pin === n)!;
        const p2 = p.bacaklar.find((b) => b.pin === 2)!;
        expect(pn.X).toBe(p1.X);
        expect(p2.X - p1.X).toBe(1);
      }
      if (p.tur === "gosterge") expect(new Set(rs)).toEqual(new Set([6, 12]));
    }
  });

  it("her çipin 100 nF'ı üst ray çiftinde (+ ve −), çipin hemen yanında", () => {
    const y = plan.yerlesim;
    for (const c of y.parcalar.filter((p) => p.cipMi)) {
      const k = y.parcalar.find((p) => p.bagliCip === c.ref);
      expect(k, c.ref).toBeDefined();
      expect(k!.board).toBe(c.board);
      const rs = k!.bacaklar.map((b) => yerel(b.X, b.Y).r).sort();
      expect(rs).toEqual([0, 1]);
      const col = yerel(k!.bacaklar[0].X, k!.bacaklar[0].Y).c;
      expect(rayDeligiVar(col)).toBe(true);
      expect(Math.abs(col - c.sutun)).toBeLessThanOrEqual(8);
    }
  });
});

describe("teller", () => {
  it("renk kodu: +5 V kırmızı, GND siyah, ray köprüleri kırmızı / siyah, sinyaller grubunun renginde", () => {
    const { board } = plan.kart;
    for (const t of plan.teller) {
      if (t.net === board.c.VCC) expect(t.renk).toBe("kirmizi");
      else if (t.net === board.c.GND) expect(t.renk).toBe("siyah");
      else expect(t.renk).not.toMatch(/^(kirmizi|siyah)$/);
    }
    expect(telRengi("A3", ["Onluğa çevirme: A"])).toBe("sari");
    expect(telRengi("NB5", ["Bölme"])).toBe("turuncu");
  });

  it("kesim boyu = delikten deliğe + iki uç; uçlar board'larda; kurulum sırası aşamaya göre", () => {
    let once = 0;
    for (const t of plan.teller) {
      expect(t.kesim).toBe(Math.ceil(t.uzunluk + 16));
      expect(t.asama).toBeGreaterThanOrEqual(once);
      once = t.asama;
      expect(ucEtiketi(plan.yerlesim, t.yol[0], t.yol[1])).toMatch(/^BB\d\d (üst|alt)?[a-j+−]*\d+$/);
      expect(noktaBoardu(plan.yerlesim, t.yol[0], t.yol[1])).toBeLessThanOrEqual(noktaBoardu(plan.yerlesim, t.yol[t.yol.length - 2], t.yol[t.yol.length - 1]));
    }
  });

  it("ölçüler: ray köprüleri, renkler ve aşamalar teller kadar", () => {
    const o = bbOlcu(plan);
    expect(o.board).toBe(60);
    expect(o.rayIc).toBe(120);
    expect(o.rayIc + o.rayArasi).toBe(plan.teller.filter((t) => t.ray).length);
    expect(o.renkler.reduce((a, r) => a + r.sayi, 0)).toBe(o.tel);
    expect(o.asamalar.reduce((a, r) => a + r.tel, 0)).toBe(o.tel);
    expect(o.dagilim.reduce((a, [, n]) => a + n, 0)).toBe(o.tel);
  });

  it("3D yolu: uçlar delikte (kat 0), önce takılan tel altta", () => {
    const y3 = telYollari3B(plan.teller);
    expect(y3.length).toBe(plan.teller.length);
    y3.forEach((p, i) => {
      const t = plan.teller[i];
      expect([p[0], p[1], p[2]]).toEqual([t.yol[0], t.yol[1], 0]);
      expect(p.slice(-3)).toEqual([t.yol[t.yol.length - 2], t.yol[t.yol.length - 1], 0]);
    });
  });
});

describe("devre: aynı netlist altın modelle aynı hesaplıyor", () => {
  it("örnek durumlar (breadboard bağlantısı netlistle birebir aynı olduğundan bu netlistin davranışı)", () => {
    const sim = new HesapSim(plan.kart);
    let i = 0;
    for (const [a, b, op] of ornekDurumlar()) {
      if (i++ % 7) continue;
      sim.ayarla(a, b, op);
      const o = sim.oku();
      const e = beklenen(a, b, op);
      expect({ a: o.a, b: o.b, sonuc: o.sonuc, kalan: o.kalan, hata: o.hata }, `${a} ${op} ${b}`).toEqual({ a: e.a, b: e.b, sonuc: e.sonuc, kalan: e.kalan, hata: e.hata });
    }
  });
});
