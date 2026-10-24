// 3D tuvallerin isteğe bağlı çizimi (src/render/cizimDongusu.ts): canlı değerler bağlı tuvallere kare
// ister, depo değişikliği (imlecin yalnız ekranda kıpırdaması dışında) kare ister, uyarlanır çözünürlük
// sürüklemedeki kare sürelerinin ortancasına göre yarım adım iner ve sınırlı sayıda geri çıkar.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  cizimDinle, cizimIste, DPR_ARA, DPR_DONUS, DPR_HIZLI_PENCERE, DPR_PENCERE, DprAyari, dprTavani, kareGerekir,
} from "../../src/render/cizimDongusu.ts";
import { kareSuresi, KARE_EN_UZUN } from "../../src/ui/ayarlar.ts";

/** n kare; her birinin süresi sure: son kararı döndürür */
const kareler = (a: DprAyari, n: number, sure: number): (number | null)[] => Array.from({ length: n }, () => a.kare(sure));
const YAVAS = 1 / 25;
const HIZLI = 1 / 60;

describe("isteğe bağlı çizim: kare istekleri", () => {
  it("cizimIste bağlı bütün tuvallere ulaşır; kaydı silinen artık çağrılmaz", () => {
    const sayac = [0, 0];
    const birak0 = cizimDinle(() => sayac[0]++);
    const birak1 = cizimDinle(() => sayac[1]++);
    cizimIste();
    birak0();
    cizimIste();
    birak1();
    cizimIste();
    expect(sayac).toEqual([1, 2]);
  });

  it("depoda bir alan değişince kare gerekir, değişmeyince gerekmez", () => {
    const s = { chip: "U3", net: null, tick: 4 };
    expect(kareGerekir(s, { ...s })).toBe(false);
    expect(kareGerekir({ ...s, chip: "U4" }, s)).toBe(true);
    expect(kareGerekir({ ...s, tick: 5 }, s)).toBe(true);
  });

  it("sahnenin okumadığı alanlar (düzenleyicideki program) kare istemez; yanlarında başka değişiklik varsa ister", () => {
    const yoksay = new Set(["source", "info"]);
    const s = { chip: null, source: "nop", info: "" };
    expect(kareGerekir({ ...s, source: "nop\nnop" }, s, yoksay)).toBe(false);
    expect(kareGerekir({ ...s, source: "hlt", info: "derlendi" }, s, yoksay)).toBe(false);
    expect(kareGerekir({ ...s, source: "hlt", chip: "U3" }, s, yoksay)).toBe(true);
  });

  it("imleç aynı parçanın üstünde kıpırdarsa kare gerekmez; parça ya da ek satırı değişirse gerekir", () => {
    const h = (ref: string, x: number, ek?: string) => ({ chip: null, hover: { ref, x, y: 10, ek } });
    expect(kareGerekir(h("U3", 20), h("U3", 10))).toBe(false);
    expect(kareGerekir(h("U4", 20), h("U3", 20))).toBe(true);
    expect(kareGerekir(h("S1", 20, "2. anahtar"), h("S1", 20, "1. anahtar"))).toBe(true);
    expect(kareGerekir({ chip: null, hover: null }, h("U3", 10))).toBe(true);
    expect(kareGerekir(h("U3", 10), { chip: null, hover: null })).toBe(true);
    expect(kareGerekir({ chip: null, hover: null }, { chip: null, hover: null })).toBe(false);
  });

  it("animasyonun ilk karesi boşluğu saymaz, sonrakiler gerçek süreyle ilerler", () => {
    expect(kareSuresi(0, 12)).toBe(KARE_EN_UZUN);
    expect(kareSuresi(0, 0.01)).toBe(0.01);
    expect(kareSuresi(0.3, 0.2)).toBe(0.2);
  });
});

describe("isteğe bağlı çizim: uyarlanır çözünürlük", () => {
  it("başlangıç cihazınki, 1 ile 2 arasında", () => {
    expect(dprTavani(1)).toBe(1);
    expect(dprTavani(1.25)).toBe(1.25);
    expect(dprTavani(2)).toBe(2);
    expect(dprTavani(3)).toBe(2);
    expect(dprTavani(0)).toBe(1);
    expect(new DprAyari(2).dpr).toBe(2);
  });

  it("yavaş sürüklemede her pencerede yarım adım iner, 1'in altına inmez", () => {
    const a = new DprAyari(2);
    const ilk = kareler(a, DPR_PENCERE, YAVAS);
    expect(ilk.slice(0, -1).every((k) => k === null)).toBe(true);
    expect(ilk.at(-1)).toBe(1.5);
    expect(kareler(a, DPR_PENCERE, YAVAS).at(-1)).toBe(1);
    expect(kareler(a, DPR_PENCERE, YAVAS).every((k) => k === null)).toBe(true);
    expect(a.dpr).toBe(1);
  });

  it("ortanca birkaç takılmaya aldırmaz; uzun duraklamalar sayılmaz", () => {
    const a = new DprAyari(2);
    kareler(a, 4, 0.3);
    expect(kareler(a, DPR_PENCERE - 4, HIZLI).every((k) => k === null)).toBe(true);
    // kullanıcı fareyi durdurdu: aralık kare süresi değil
    const b = new DprAyari(2);
    expect(kareler(b, DPR_PENCERE * 2, DPR_ARA + 0.5).every((k) => k === null)).toBe(true);
    expect(b.dpr).toBe(2);
  });

  it("sürükleme bitince yarım pencere atılır", () => {
    const a = new DprAyari(2);
    kareler(a, DPR_PENCERE - 1, YAVAS);
    a.ara();
    expect(a.kare(YAVAS)).toBe(null);
    expect(kareler(a, DPR_PENCERE - 1, YAVAS).at(-1)).toBe(1.5);
  });

  it("indikten sonra hızlı kalırsa geri çıkar; en çok DPR_DONUS kez, hiç inmediyse çıkmaz", () => {
    const hic = new DprAyari(1.5);
    expect(kareler(hic, DPR_PENCERE * DPR_HIZLI_PENCERE * 2, HIZLI).every((k) => k === null)).toBe(true);
    const a = new DprAyari(2);
    for (let i = 0; i < DPR_DONUS; i++) {
      expect(kareler(a, DPR_PENCERE, YAVAS).at(-1)).toBe(1.5);
      const k = kareler(a, DPR_PENCERE * DPR_HIZLI_PENCERE, HIZLI);
      expect(k.filter((x) => x !== null)).toEqual([2]);
      expect(k.at(-1)).toBe(2);
    }
    // dönüş hakkı bitti: yavaşlayınca iner, sonra hızlı kalsa da orada kalır
    expect(kareler(a, DPR_PENCERE, YAVAS).at(-1)).toBe(1.5);
    expect(kareler(a, DPR_PENCERE * DPR_HIZLI_PENCERE * 2, HIZLI).every((k) => k === null)).toBe(true);
    expect(a.dpr).toBe(1.5);
  });
});

describe("isteğe bağlı çizim: kart sahnesi", () => {
  it("sahne, kare istemeyen depo alanlarını (KART_SAHNE_DISI) okumaz", async () => {
    const { KART_SAHNE_DISI } = await import("../../src/board3d/store.ts");
    const dosyalar = ["BoardScene.tsx", "Breadboard3D.tsx", "Passives3D.tsx", "Bolumler3D.tsx", "Serit3D.tsx", "KurulumSahne.tsx", "TextQuads.tsx", "KameraApi.tsx", "bolum.ts"];
    let toplam = 0;
    for (const d of dosyalar) {
      const kaynak = readFileSync(new URL(`../../src/board3d/${d}`, import.meta.url), "utf8");
      const okunan = [...kaynak.matchAll(/useKart(?:\(\(\w+\) => \w+|\.getState\(\))\.(\w+)/g)].map((m) => m[1]);
      toplam += okunan.length;
      expect(okunan.filter((a) => KART_SAHNE_DISI.has(a)), d).toEqual([]);
    }
    // arama kalıbı bozulmadı: sahne seçimleri gerçekten bulunuyor
    expect(toplam).toBeGreaterThan(20);
  });
});
