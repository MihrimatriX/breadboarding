// 3D görünümün "8 bit hesap 3D" bölümü (src/board3d): sahnedeki kartın seçimi (aktif.ts), DIP
// anahtarların ve göstergelerin canlı seviyelerden okunması, yan paneldeki "bloklar şu an" ve
// anahtardan göstergeye bütün yol (altın modelle aynı mı).

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { beklenen, type IslemKodu } from "../../hesap8/model.ts";
import { L1 } from "../chips/logic.ts";
import { aktifKart, aktifKartiSec, hesapKarti, kartDegisince, kartUclari, kartYerlesimi } from "../../src/board3d/aktif.ts";
import { levelOf } from "../../src/board3d/levels.ts";
import { dipAnahtarlari, etkinNet, segmentKarakteri, segmentNetleri } from "../../src/board3d/pasif-analiz.ts";
import { boardLayoutData, boardModel, findPart, liveNets, netDegerleri, netEnds, useKart } from "../../src/board3d/store.ts";
import { ILK_GIRIS, basilabilir, blokDegerleri, girisBiti, hesapSim, ikili, useHesap } from "../../src/board3d/hesap.ts";

const kart = hesapKarti();
const seviye = (n: number) => levelOf(liveNets.values, n);
const pasif = (ref: string) => {
  const p = findPart(ref)?.passive;
  if (!p) throw new Error(`${ref} sahnede yok`);
  return p;
};

describe("sahnedeki kart (aktif.ts)", () => {
  it("kart türü değişince model, yerleşim, uçlar ve canlı değerler onunkine döner; seçimler sıfırlanır", () => {
    expect(aktifKart()).toBe("cpu16");
    const olaylar: string[] = [];
    kartDegisince((tur, onceki) => olaylar.push(`${onceki}→${tur}`));
    const makine = new Uint8Array([0, 1, 1, 0]);
    netDegerleri("cpu16", makine);
    expect(liveNets.values).toBe(makine);
    useKart.setState({ chip: "U1", bottom: "program" });

    expect(aktifKartiSec("hesap")).toBe(true);
    expect(aktifKartiSec("hesap")).toBe(false);
    expect(boardModel().board).toBe(kart.board);
    expect(boardLayoutData()).toBe(kartYerlesimi("hesap"));
    expect(netEnds()).toBe(kartUclari("hesap"));
    expect(findPart(kart.anahtarlar.a)?.passive?.part).toBe("SW_DIP_8");
    expect(liveNets.values).not.toBe(makine);
    expect(useKart.getState().chip).toBeNull();
    expect(useKart.getState().bottom).toBe("ic");

    // hesap makinesi sahnedeyken bilgisayarın değerleri saklanır, çizilmez
    const sonra = new Uint8Array([0, 1, 0, 0]);
    netDegerleri("cpu16", sonra);
    expect(liveNets.values).not.toBe(sonra);

    expect(aktifKartiSec("cpu16")).toBe(true);
    expect(liveNets.values).toBe(sonra);
    expect(useKart.getState().bottom).toBe("program");
    expect(olaylar).toEqual(["cpu16→hesap", "hesap→cpu16"]);
    // yapılar saklanır: yeniden seçilince aynı nesneler (kart yeniden kurulmaz)
    const yerlesim = kartYerlesimi("hesap");
    aktifKartiSec("hesap");
    expect(boardLayoutData()).toBe(yerlesim);
    expect(boardModel().board).toBe(kart.board);
    aktifKartiSec("cpu16");
  });

  it("lamba testi butonu yalnız hesap makinesi sahnedeyken basılabilir", () => {
    expect(basilabilir(kart.anahtarlar.lambaTesti)).toBe(false);
    aktifKartiSec("hesap");
    expect(basilabilir(kart.anahtarlar.lambaTesti)).toBe(true);
    expect(basilabilir(kart.anahtarlar.a)).toBe(false);
    aktifKartiSec("cpu16");
  });
});

describe("hesap makinesi: anahtarlar, göstergeler, bloklar", () => {
  beforeAll(() => {
    aktifKartiSec("hesap");
    useHesap.getState().baslat();
  });
  afterAll(() => {
    useHesap.getState().ayarla(ILK_GIRIS.a, ILK_GIRIS.b, ILK_GIRIS.op);
    aktifKartiSec("cpu16");
  });

  it("açılışta 123 × 45: göstergelerde 5535", () => {
    const s = useHesap.getState();
    expect(s.hazir).toBe(true);
    expect([s.a, s.b, s.op]).toEqual([123, 45, 2]);
    expect(s.gorunum).toEqual(beklenen(123, 45, 2));
    expect(s.gorunum?.sonuc).toBe("  5535");
  });

  it.each<[number, number, IslemKodu, string, string]>([
    [12, 200, 1, "-  188", "   "],
    [100, 0, 3, "      ", "   "],
    [255, 7, 3, "    36", "  3"],
    [200, 100, 0, "   300", "   "],
    [255, 255, 2, " 65025", "   "],
  ])("%i (%i) işlem %i: göstergeler altın modelle aynı", (a, b, op, sonuc, kalan) => {
    useHesap.getState().ayarla(a, b, op);
    const g = useHesap.getState().gorunum;
    expect(g).toEqual(beklenen(a, b, op));
    expect(g?.sonuc).toBe(sonuc);
    expect(g?.kalan).toBe(kalan);
    expect(g?.hata).toBe(op === 3 && b === 0);
    // canlı değerler sahneye gitti: HATA LED'inin neti
    expect(seviye(kart.ic.hata)).toBe(op === 3 && b === 0 ? 1 : 0);
  });

  it("girisBiti: anahtar netinden A, B ya da işlem biti", () => {
    expect(girisBiti(kart, kart.a[3])).toEqual({ grup: "a", bit: 3 });
    expect(girisBiti(kart, kart.b[7])).toEqual({ grup: "b", bit: 7 });
    expect(girisBiti(kart, kart.op[1])).toEqual({ grup: "op", bit: 1 });
    expect(girisBiti(kart, kart.ltN)).toBeNull();
    expect(girisBiti(kart, 1)).toBeNull();
  });

  it("DIP anahtarların konumu canlı seviyelerden (soldan sağa A7 … A0, ON = 1); tıklayınca bit değişir", () => {
    useHesap.getState().ayarla(0b10110010, 0b00000001, 2);
    const a = dipAnahtarlari(pasif(kart.anahtarlar.a), seviye);
    expect(a.map((x) => x.no)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
    expect(a.map((x) => girisBiti(kart, x.net))).toEqual([7, 6, 5, 4, 3, 2, 1, 0].map((bit) => ({ grup: "a", bit })));
    expect(a.map((x) => (x.acik ? 1 : 0)).join("")).toBe("10110010");
    const b = dipAnahtarlari(pasif(kart.anahtarlar.b), seviye);
    expect(b.map((x) => (x.acik ? 1 : 0)).join("")).toBe("00000001");
    const op = dipAnahtarlari(pasif(kart.anahtarlar.islem), seviye);
    expect(op.map((x) => girisBiti(kart, x.net))).toEqual([{ grup: "op", bit: 1 }, { grup: "op", bit: 0 }]);
    expect(op.map((x) => (x.acik ? 1 : 0)).join("")).toBe("10");

    // 3D'de 2. anahtara tıklamak (A6)
    expect(useHesap.getState().anahtarNet(a[1].net)).toBe(true);
    expect(useHesap.getState().a).toBe(0b11110010);
    expect(dipAnahtarlari(pasif(kart.anahtarlar.a), seviye)[1].acik).toBe(true);
    expect(useHesap.getState().gorunum).toEqual(beklenen(0b11110010, 1, 2));
    // giriş olmayan net değişmez
    expect(useHesap.getState().anahtarNet(kart.ltN)).toBe(false);
  });

  it("göstergenin segmentleri sürücünün çıkışından (direnç dizisinin öbür ucu); okunan rakamlar göstergedekiyle aynı", () => {
    useHesap.getState().ayarla(12, 200, 1);
    const g = useHesap.getState().gorunum!;
    for (const gr of kart.gruplar) {
      let metin = "";
      for (const h of gr.haneler) {
        const s = segmentNetleri(pasif(h.ref), netEnds(), findPart);
        expect(s.slice(0, 7).map((x) => x.net), h.ref).toEqual(h.seg);
        metin += segmentKarakteri(s.filter((x) => x.net >= 0 && seviye(x.net) === 1).map((x) => x.seg));
      }
      if (gr.isaret) {
        const s = segmentNetleri(pasif(gr.isaret.ref), netEnds(), findPart);
        expect(s.find((x) => x.seg === "g")?.net).toBe(gr.isaret.g);
        metin = (seviye(gr.isaret.g) === 1 ? "-" : " ") + metin;
      }
      expect(metin, gr.ad).toBe(g[gr.ad]);
    }
  });

  it("etkinNet: direnç dizisinin gösterge tarafı → sürücü tarafı (pin k ↔ 17 − k)", () => {
    const h = kart.gruplar[0].haneler[0];
    const dizi = pasif(h.dizi);
    expect(dizi.kind).toBe("dipdizi");
    for (let i = 0; i < 7; i++) {
      const gostergeTarafi = dizi.pins.find((p) => p.num === 16 - i)!.net;
      expect(etkinNet(netEnds(), findPart, gostergeTarafi)).toBe(h.seg[i]);
      expect(etkinNet(netEnds(), findPart, h.seg[i])).toBe(h.seg[i]);
    }
  });

  it("lamba testi: basılıyken bütün segmentler yanar, bırakınca sonuç geri gelir", () => {
    useHesap.getState().ayarla(255, 7, 3);
    useHesap.getState().lambaBas(true);
    const sim = hesapSim()!;
    for (const gr of kart.gruplar) for (const h of gr.haneler) for (const n of h.seg) expect(sim.sim.get(n), `${h.ref}`).toBe(L1);
    expect(useHesap.getState().gorunum?.a).toBe("888");
    useHesap.getState().lambaBas(false);
    expect(useHesap.getState().gorunum).toEqual(beklenen(255, 7, 3));
  });

  it("bloklar şu an: her bloğun çıkışı onluk ve ikili", () => {
    useHesap.getState().ayarla(255, 7, 3);
    const r = Object.fromEntries(blokDegerleri(hesapSim()!, 3).map((x) => [x.blok, x]));
    const d = (blok: string, ad: string) => r[blok].degerler.find((x) => x.ad === ad)!;
    expect(r["Bölme"].secili).toBe(true);
    expect(r["Çarpma"].secili).toBe(false);
    expect(d("Bölme", "Q").deger).toBe(36);
    expect(d("Bölme", "K").deger).toBe(3);
    expect(d("Bölme", "HATA").deger).toBe(0);
    expect(d("Çarpma", "P").deger).toBe(255 * 7);
    // ÷ işleminde OP0 = 1: toplayıcı da çıkarma yapar (A + ~B + 1), sonuç seçici onu göstermez
    expect(d("Toplama ve çıkarma", "S_C8 S").deger).toBe(255 + (~7 & 0xff) + 1);
    expect(d("Toplama ve çıkarma", "M").deger).toBe(248);
    expect(d("Sonuç seçici", "SONUC").deger).toBe(36);
    expect(d("Onluğa çevirme: sonuç", "BCD").deger).toBe(0x36);
    expect(d("Onluğa çevirme: sonuç", "BCD").metin).toBe("0 0 0 3 6");

    useHesap.getState().ayarla(12, 200, 1);
    const c = Object.fromEntries(blokDegerleri(hesapSim()!, 1).map((x) => [x.blok, x]));
    expect(c["Toplama ve çıkarma"].secili).toBe(true);
    expect(c["Toplama ve çıkarma"].degerler.find((x) => x.ad === "NEG")?.deger).toBe(1);
    expect(c["Toplama ve çıkarma"].degerler.find((x) => x.ad === "M")?.deger).toBe(188);
    // her blok yerleşimde var (kamera oraya gider)
    const bloklar = new Set(kartYerlesimi("hesap").blocks.map((b) => b.name));
    for (const x of blokDegerleri(hesapSim()!, 1)) expect(bloklar.has(x.blok), x.blok).toBe(true);
  });

  it("ikili: 4'lü öbekler", () => {
    expect(ikili(5535, 16)).toBe("0001 0101 1001 1111");
    expect(ikili(262, 9)).toBe("1 0000 0110");
    expect(ikili(1, 1)).toBe("1");
    expect(ikili(3, 8)).toBe("0000 0011");
  });
});
