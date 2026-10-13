// Uygulamadaki kurulum modu (src/board3d/kurulum.ts): ekrandaki tel numaraları yazdırılan belgeyle
// aynı olmalı; takılan teller işaretlenince odak sıradaki açık tele geçer. Panelin metinleri iki dilde
// (Türkçesi belgeyle aynı kalır, İngilizcesi eksiksiz).

import { describe, expect, it } from "vitest";
import { PANOLAR } from "../breadboard/panolar.ts";
import { CPU_BB_RENKLERI, cpuRenkTanimi } from "../breadboard/renk.ts";
import {
  KOYU, cekmeCizimi, dekuplajCizimi, diziCizimi, direncCizimi, elektrolitikCizimi, ledCizimi, ledDevreCizimi, osilatorCizimi, seramikCizimi,
} from "../kit/cizim.ts";
import { KURULUM_KARTLARI, KurulumVerisi } from "../kurulum/kartlar.ts";
import { ASAMALAR } from "../../hesap8/breadboard/yerlesim.ts";
import {
  bacakYeriYazisi, blokAdi, gorunenKartlar, kartAdi, kartPlani, pcbTelRengi, sahnedeVar, sayiYaz, siraSayisi, siradakiAcik, ucKonumu, useKurulum,
} from "../../src/board3d/kurulum.ts";
import { asamaMetni, panoAdlari, telRengiYazisi } from "../../src/board3d/bbKurulum.ts";
import { aktifKart, aktifKartiSec } from "../../src/board3d/aktif.ts";

const veri = new KurulumVerisi();
const imza = (kart: string, plan = veri.plan(kart)) => plan.teller.map((t) => `${t.id} ${t.from.ref}-${t.from.pin} ${t.to.ref}-${t.to.pin} ${t.net} ${t.renk}`);

describe("kurulum modu", () => {
  it.each(["kyb", "clk"])("%s: uygulamadaki tel listesi belgedekiyle aynı (numara, uçlar, net, renk)", (kart) => {
    expect(imza(kart, kartPlani(kart))).toEqual(imza(kart));
  });

  it("tellerin uçları 3D sahnede bulunur (sahnedeki kartlar)", () => {
    for (const kart of ["kyb", "clk"]) {
      expect(sahnedeVar(kart)).toBe(true);
      for (const t of kartPlani(kart).teller) {
        expect(ucKonumu(t.from.ref, t.from.pin), `${t.id} ${t.from.ref}-${t.from.pin}`).not.toBeNull();
        expect(ucKonumu(t.to.ref, t.to.pin), `${t.id} ${t.to.ref}-${t.to.pin}`).not.toBeNull();
      }
    }
    expect(sahnedeVar("prog")).toBe(false);
    expect(sahnedeVar("mem")).toBe(false);
  });

  it("siradakiAcik: verilen telden sonraki takılmamış tel, sonda baştan", () => {
    const t = kartPlani("kyb").teller.slice(0, 4);
    const yapilan = new Set([t[1].id, t[2].id]);
    expect(siradakiAcik(t, yapilan, t[0].id)?.id).toBe(t[3].id);
    expect(siradakiAcik(t, yapilan, t[3].id)?.id).toBe(t[0].id);
    expect(siradakiAcik(t, new Set(t.map((x) => x.id)))).toBeNull();
  });

  it("işaretleyince odak sıradaki açık tele geçer; git() gezinir; sıfırla hepsini siler", async () => {
    const s = useKurulum.getState();
    await s.kartSec("kyb");
    const { plan } = useKurulum.getState();
    expect(plan?.kart).toBe("kyb");
    const t = plan!.teller;
    expect(useKurulum.getState().secili).toBe(t[0].id);
    useKurulum.getState().isaretle(t[0].id);
    expect(useKurulum.getState().yapilan.has(t[0].id)).toBe(true);
    expect(useKurulum.getState().secili).toBe(t[1].id);
    useKurulum.getState().git(-1);
    expect(useKurulum.getState().secili).toBe(t[0].id);
    useKurulum.getState().git(1, true);
    expect(useKurulum.getState().secili).toBe(t[1].id);
    useKurulum.getState().isaretle(t[0].id, false);
    expect(useKurulum.getState().yapilan.size).toBe(0);
    useKurulum.getState().isaretle(t[2].id);
    useKurulum.getState().sifirla();
    expect(useKurulum.getState().yapilan.size).toBe(0);
    expect(useKurulum.getState().secili).toBe(t[0].id);
  });
});

describe("kurulum modu: 8 bit hesap makinesi bölümü", () => {
  it("hesap: uygulamadaki tel listesi belgedekiyle aynı (numara, uçlar, net, renk)", () => {
    expect(imza("hesap", kartPlani("hesap"))).toEqual(imza("hesap"));
  });

  it("kart listesi bölüme göre: bilgisayarda hesap yok, hesap makinesinde yalnız o", () => {
    expect(aktifKart()).toBe("cpu16");
    expect(gorunenKartlar().map((k) => k.kart)).not.toContain("hesap");
    expect(sahnedeVar("hesap")).toBe(false);
    try {
      aktifKartiSec("hesap");
      expect(gorunenKartlar().map((k) => k.kart)).toEqual(["hesap"]);
      expect(useKurulum.getState().kart).toBe("hesap");
      expect(sahnedeVar("hesap")).toBe(true);
      expect(sahnedeVar("kyb")).toBe(false);
      for (const t of kartPlani("hesap").teller) {
        expect(ucKonumu(t.from.ref, t.from.pin), `${t.id} ${t.from.ref}-${t.from.pin}`).not.toBeNull();
        expect(ucKonumu(t.to.ref, t.to.pin), `${t.id} ${t.to.ref}-${t.to.pin}`).not.toBeNull();
      }
    } finally {
      aktifKartiSec("cpu16");
    }
    expect(gorunenKartlar()[0].kart).toBe(useKurulum.getState().kart);
    expect(sahnedeVar("kyb")).toBe(true);
  });
});

describe("kurulum modu: iki dil", () => {
  it("PCB paneli: rengi, sınıfı ve bacağın yeri İngilizce; Türkçesi değişmedi", () => {
    const t = kartPlani("kyb").teller.find((x) => x.sinif === "adres")!;
    expect(pcbTelRengi(t)).toBe("sarı tel · adres");
    expect(pcbTelRengi(t, "en")).toBe("yellow wire · Address");
    const cip = { pinSayisi: 14, hucre: "C4" };
    expect(bacakYeriYazisi(3, cip)).toBe("alt sırada soldan 3. · yer C4");
    expect(bacakYeriYazisi(3, cip, "en")).toBe("bottom row, 3rd from left · grid C4");
    expect(bacakYeriYazisi(12, cip, "en")).toBe("top row, 3rd from left · grid C4");
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22, 111].map(siraSayisi)).toEqual(["1st", "2nd", "3rd", "4th", "11th", "12th", "13th", "21st", "22nd", "111th"]);
    expect(sayiYaz(1234)).toBe("1.234");
    expect(sayiYaz(1234, "en")).toBe("1,234");
    expect(kartAdi("clk")).toBe("Saat ve reset kartı");
    expect(kartAdi("clk", "en")).toBe("Clock and reset board");
    expect(blokAdi("Register dosyası")).toBe("Register dosyası");
    expect(blokAdi("Register dosyası", "en")).toBe("Register file");
  });

  it("her kurulum kartının ve tel taşıyan her bloğun İngilizce adı var", () => {
    for (const k of KURULUM_KARTLARI) {
      expect(kartAdi(k.kart, "en"), k.kart).toMatch(/^[\x20-\x7e]+$/);
      for (const b of veri.plan(k.kart).bloklar) {
        if (!b.telSayisi) continue;
        const en = blokAdi(b.ad, "en");
        // aynı kalanlar yalnız kısaltmalar (ALU, UART, VRAM)
        expect(en === b.ad ? /^[A-Z0-9/]+$/.test(en) : /^[\x20-\x7e]+$/.test(en), `${k.kart}: ${b.ad}`).toBe(true);
      }
    }
  });

  it("breadboard panoları: aşama adları, aşama sonu testleri, pano adları ve renk grupları İngilizce", () => {
    const metinler = [...PANOLAR.flatMap((p) => p.asamalar.flatMap((a) => [a.ad, a.test])), ...ASAMALAR.map((a) => a.ad)];
    for (const m of metinler) {
      expect(asamaMetni(m)).toBe(m);
      expect(asamaMetni(m, "en"), m).not.toBe(m);
      expect(asamaMetni(m, "en"), m).not.toMatch(/[çğıöşüÇĞİÖŞÜ—]/u);
    }
    const clk = { kart: "clk", kisa: "Saat", baslik: "Saat ve reset kartı", renk: cpuRenkTanimi };
    expect(panoAdlari(clk)).toEqual({ baslik: "Saat ve reset kartı", kisa: "Saat" });
    expect(panoAdlari(clk, "en")).toEqual({ baslik: "Clock and reset board", kisa: "Clock" });
    expect(telRengiYazisi(clk, { renk: "sari", ray: false })).toBe("sarı tel · Adres");
    expect(telRengiYazisi(clk, { renk: "sari", ray: false }, "en")).toBe("yellow wire · Address");
    expect(telRengiYazisi(clk, { renk: "kirmizi", ray: true }, "en")).toBe("red wire · rail jumper");
    for (const r of CPU_BB_RENKLERI) expect(telRengiYazisi(clk, { renk: r.renk, ray: false }, "en")).not.toMatch(/[çğıöşüÇĞİÖŞÜ]/u);
  });

  it("bilgi panelinin pasif çizimleri İngilizce (nokta ondalık, renk adları); Türkçesi varsayılan", () => {
    const led = { surucu: "U206.Y0", sinyal: "CLK", direnc: "R5", ohm: 1300, led: "D1", renk: "kirmizi" as const, seviye: 1 };
    const cizimler = (dil?: "en") => [
      direncCizimi(1300, 5, KOYU, { id: "r", etiket: true }, dil),
      ledCizimi("turuncu", KOYU, { id: "l" }, dil),
      seramikCizimi("104", KOYU, dil),
      elektrolitikCizimi("100 µF", 16, KOYU, dil),
      diziCizimi("A103J", 9, KOYU, {}, dil),
      osilatorCizimi("25,175", KOYU, dil),
      ledDevreCizimi(led, KOYU, dil),
      ledDevreCizimi({ ...led, aktifDusuk: true, seviye: 0 }, KOYU, dil),
      cekmeCizimi({ yon: "yukari", ohm: 10000, ref: "R601", hat: "~RESET", seviye: 1 }, KOYU, dil),
      dekuplajCizimi({ cip: "U1", part: "74HC00", pinSayisi: 14, vcc: 14, gnd: 7, ref: "C1", kod: "104" }, KOYU, dil),
    ].map((p) => p.g);
    const yazi = (g: string) => [...g.matchAll(/<text[^>]*>([^<]*)<\/text>/g)].map((m) => m[1]).join(" | ");
    const tr = cizimler().map(yazi);
    const en = cizimler("en").map(yazi);
    expect(tr[6]).toContain("CLK = 1: akım akar, LED yanar");
    expect(tr[0]).toContain("kahverengi");
    expect(en[6]).toContain("CLK = 1: current flows, LED on");
    expect(en[6]).toContain("1.3 kΩ");
    expect(en[0]).toContain("brown");
    expect(en[0]).toContain("± 5%");
    expect(en[1]).toContain("orange (amber), Vf ≈ 2 V");
    expect(en[2]).toContain("= 100,000 pF | = 100 nF = 0.1 µF");
    // osilatörün frekansı çağıranın metni; çizimin kendi yazıları İngilizce, ondalık ayraç nokta (binlik virgül)
    for (const [i, s] of en.entries()) expect(s.replace("25,175", ""), `çizim ${i}`).not.toMatch(/[çğıöşüÇĞİÖŞÜ]|\d,\d{1,2}(?!\d)/u);
  });
});
