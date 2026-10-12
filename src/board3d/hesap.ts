// "8 bit hesap 3D" bölümünün durumu: anahtarlar (A, B, işlem, lamba testi), kapı seviyesi simülasyon
// ve göstergelerde görünenler. Program ve saat yok, devre tamamen birleşimsel: simülasyon ana iş
// parçacığında çalışır (kart bir kez ~40 ms'de kurulur, her anahtar değişiminde ~2 ms'de yerleşir).
// Kart 3D sahnedekiyle aynı nesnedir (aktif.ts); net değerleri store.ts'teki canlı değerlere yazılır.

import { create } from "zustand";
import { ISLEMLER, type HesapKarti } from "../../hesap8/kart";
import { beklenen, type Gorunum, type IslemKodu } from "../../hesap8/model";
import { HesapSim } from "../../hesap8/sim";
import { L1 } from "../../cpu16/chips/logic";
import { aktifKart, hesapKarti, hesapPlani, kartYerlesimi, type HesapGorunumu } from "./aktif";
import { bbSeciliTel, telKimligi, telTarifi, useBbKurulum } from "./bbKurulum";
import { netDegerleri, useKart } from "./store";

export type GirisGrubu = "a" | "b" | "op";

/** Açılışta: 123 × 45 (göstergelerde 5535), ilk bakışta anlamlı bir sonuç */
export const ILK_GIRIS = { a: 123, b: 45, op: 2 as IslemKodu };

/** Netin hangi giriş biti olduğu (A0..A7, B0..B7, OP0, OP1); giriş değilse null */
export function girisBiti(k: Pick<HesapKarti, "a" | "b" | "op">, net: number): { grup: GirisGrubu; bit: number } | null {
  for (const grup of ["a", "b", "op"] as const) {
    const bit = k[grup].indexOf(net);
    if (bit >= 0) return { grup, bit };
  }
  return null;
}

/** İşlemin simgesi (+ − × ÷) */
export const islemSimgesi = (op: IslemKodu): string => ISLEMLER[op].simge;

/** İkili yazım, 4'lü öbekler: 0001 0101 1001 1111 */
export function ikili(deger: number, bit: number): string {
  const s = (deger >>> 0).toString(2).padStart(bit, "0").slice(-bit);
  const out: string[] = [];
  for (let i = s.length; i > 0; i -= 4) out.unshift(s.slice(Math.max(0, i - 4), i));
  return out.join(" ");
}

// ---------------------------------------------------------------- bloklar şu an ne hesaplıyor

export interface BlokDegeri {
  /** netin (ya da netlerin) adı */
  ad: string;
  /** ne olduğu, tek satır */
  ne: string;
  deger: number;
  bit: number;
  /** onluk yerine gösterilecek metin (BCD haneleri) */
  metin?: string;
}

export interface BlokSatiri {
  /** yerleşimdeki blok: kamera oraya gider */
  blok: string;
  baslik: string;
  degerler: BlokDegeri[];
  /** sonuç seçicinin şu an göstergeye gönderdiği blok */
  secili: boolean;
}

type Okuyucu = Pick<HesapSim, "sayi"> & { sim: Pick<HesapSim["sim"], "get">; kart: HesapKarti };

/**
 * Her bloğun çıkışı şu an: bütün bloklar aynı anda hesaplar (devre birleşimsel), işlem anahtarı yalnız
 * sonuç seçicide hangisinin göstergeye gideceğini seçer.
 */
export function blokDegerleri(s: Okuyucu, op: IslemKodu): BlokSatiri[] {
  const { kart } = s;
  const ad = (n: string) => (kart.board.has(n) ? kart.board.n(n) : -1);
  const bir = (n: number) => (n >= 0 && s.sim.get(n) === L1 ? 1 : 0);
  const S = Array.from({ length: 8 }, (_, i) => ad(`S${i}`));
  const c8 = ad("S_C8");
  const cikarma = bir(kart.op[0]) === 1;
  const ic = kart.ic;
  const bcd = kart.bcd.sonuc.haneler.map((h) => s.sayi(h));
  return [
    {
      blok: "Toplama ve çıkarma",
      baslik: "Toplama / çıkarma",
      secili: op <= 1,
      degerler: [
        { ad: "S_C8 S", ne: cikarma ? "A + ~B + 1 (OP0 = 1: çıkarma)" : "A + B (OP0 = 0: toplama)", deger: s.sayi(S) + 256 * bir(c8), bit: 9 },
        { ad: "NEG", ne: "çıkarmada sonuç eksi (A < B)", deger: bir(ic.negatif), bit: 1 },
        { ad: "M", ne: "|A ± B|, sonuç seçiciye (9. bit T8)", deger: s.sayi(ic.toplamFark) + 256 * bir(ic.toplamElde), bit: 9 },
      ],
    },
    {
      blok: "Çarpma",
      baslik: "Çarpma",
      secili: op === 2,
      degerler: [{ ad: "P", ne: "A × B, 16 bit", deger: s.sayi(ic.carpim), bit: 16 }],
    },
    {
      blok: "Bölme",
      baslik: "Bölme",
      secili: op === 3,
      degerler: [
        { ad: "Q", ne: "bölüm A ÷ B", deger: s.sayi(ic.bolum), bit: 8 },
        { ad: "K", ne: "kalan", deger: s.sayi(ic.kalan), bit: 8 },
        { ad: "HATA", ne: "sıfıra bölme (÷ ve B = 0)", deger: bir(ic.hata), bit: 1 },
      ],
    },
    {
      blok: "Sonuç seçici",
      baslik: "Sonuç seçici",
      secili: false,
      degerler: [{ ad: "SONUC", ne: `seçilen: ${ISLEMLER[op].ad}`, deger: s.sayi(ic.sonuc), bit: 16 }],
    },
    {
      blok: "Onluğa çevirme: sonuç",
      baslik: "Onluğa çevirme",
      secili: false,
      degerler: [{
        ad: "BCD", ne: "sonucun onluk haneleri (3 ekle ve kaydır)",
        deger: bcd.reduceRight((v, d) => v * 16 + d, 0), bit: 4 * bcd.length, metin: [...bcd].reverse().join(" "),
      }],
    },
  ];
}

// ---------------------------------------------------------------- durum

export interface HesapState {
  hazir: boolean;
  hata: string | null;
  a: number;
  b: number;
  op: IslemKodu;
  /** lamba testi butonu basılı */
  lamba: boolean;
  /** devre her yerleştiğinde artar (paneller yenilenir) */
  surum: number;
  /** göstergelerde görünenler */
  gorunum: Gorunum | null;
  /** kartı ve simülasyonu kur (ilk açılışta bir kez), net değerlerini sahneye ver */
  baslat(): void;
  ayarla(a: number, b: number, op: IslemKodu): void;
  bitDegistir(grup: GirisGrubu, bit: number): void;
  islemSec(op: IslemKodu): void;
  lambaBas(basili: boolean): void;
  /** 3D'de DIP anahtarın bir anahtarına tıklandı: netin giriş bitini değiştir (giriş değilse false) */
  anahtarNet(net: number): boolean;
}

let sim: HesapSim | null = null;
/** Simülasyon (kurulmadıysa null): panel ve konsol okur */
export const hesapSim = (): HesapSim | null => sim;

/** 3D'de basılı tutulabilen buton mu (lamba testi; yalnız hesap makinesi sahnedeyken) */
export const basilabilir = (ref: string): boolean => aktifKart() === "hesap" && hesapKarti().anahtarlar.lambaTesti === ref;

/** 3D'deki butona bas / bırak (yalnız basılabilen butonlar) */
export function butonBas(ref: string, basili: boolean): void {
  if (basilabilir(ref)) useHesap.getState().lambaBas(basili);
}

export const useHesap = create<HesapState>((set, get) => {
  /** devre yerleşti: net değerleri sahneye, görünüm panellere */
  const yayinla = () => {
    if (!sim) return;
    netDegerleri("hesap", new Uint8Array(sim.sim.value));
    set((s) => ({ gorunum: sim!.oku(), surum: s.surum + 1 }));
    useKart.setState((s) => ({ tick: s.tick + 1 }));
  };
  return {
    hazir: false,
    hata: null,
    ...ILK_GIRIS,
    lamba: false,
    surum: 0,
    gorunum: null,
    baslat() {
      if (sim) return yayinla();
      try {
        sim = new HesapSim(hesapKarti());
        const { a, b, op, lamba } = get();
        sim.ayarla(a, b, op);
        if (lamba) sim.lamba(true);
        set({ hazir: true, hata: null });
        yayinla();
      } catch (e) {
        set({ hata: String((e as Error).message ?? e) });
      }
    },
    ayarla(a, b, op) {
      const x = { a: a & 0xff, b: b & 0xff, op: (op & 3) as IslemKodu };
      const s = get();
      // hiçbir anahtar değişmedi (ör. seçili işleme yeniden tıklandı): devre ve sahne zaten güncel
      if (sim && x.a === s.a && x.b === s.b && x.op === s.op) return;
      set(x);
      if (!sim) return;
      sim.ayarla(x.a, x.b, x.op);
      yayinla();
    },
    bitDegistir(grup, bit) {
      const s = get();
      if (grup === "a") s.ayarla(s.a ^ (1 << bit), s.b, s.op);
      else if (grup === "b") s.ayarla(s.a, s.b ^ (1 << bit), s.op);
      else s.ayarla(s.a, s.b, (s.op ^ (1 << bit)) as IslemKodu);
    },
    islemSec(op) {
      const s = get();
      s.ayarla(s.a, s.b, op);
    },
    lambaBas(basili) {
      if (get().lamba === basili) return;
      set({ lamba: basili });
      if (!sim) return;
      sim.lamba(basili);
      yayinla();
    },
    anahtarNet(net) {
      if (aktifKart() !== "hesap") return false;
      const g = girisBiti(hesapKarti(), net);
      if (!g) return false;
      get().bitDegistir(g.grup, g.bit);
      return true;
    },
  };
});

/** Altın model: göstergelerde ne görünmeli (lamba testinde bütün segmentler yanar, karşılaştırılmaz) */
export function beklenenGorunum(s: Pick<HesapState, "a" | "b" | "op">): Gorunum {
  return beklenen(s.a, s.b, s.op);
}

/** Devre altın modelle aynı mı */
export const dogruMu = (g: Gorunum | null, e: Gorunum): boolean =>
  !!g && g.a === e.a && g.b === e.b && g.sonuc === e.sonuc && g.kalan === e.kalan && g.hata === e.hata;

// ---------------------------------------------------------------- konsol

/** Tarayıcı konsolundan ve otomatik testlerden: hesap.ayarla(12, 200, 1), hesap.oku(), hesap.durum() */
export function installHesapApi(): void {
  const st = () => useHesap.getState();
  const kart = () => useKart.getState();
  const api = {
    /** A, B ve işlem (0 +, 1 −, 2 ×, 3 ÷): anahtarları kur, göstergeleri döndür */
    ayarla: (a: number, b: number, op: IslemKodu) => {
      st().ayarla(a, b, op);
      return api.oku();
    },
    oku: () => hesapSim()?.oku() ?? null,
    /** girişler, göstergeler, altın model ve blokların çıkışları */
    durum: () => {
      const s = st();
      const g = hesapSim()?.oku() ?? null;
      const e = beklenenGorunum(s);
      const sm = hesapSim();
      return {
        a: s.a, b: s.b, op: s.op, islem: islemSimgesi(s.op), lambaTesti: s.lamba,
        gorunum: g, beklenen: e, dogru: s.lamba ? null : dogruMu(g, e),
        bloklar: sm ? blokDegerleri(sm, s.op).map((r) => ({ blok: r.blok, ...Object.fromEntries(r.degerler.map((d) => [d.ad, d.metin ?? d.deger])) })) : [],
      };
    },
    anahtar: (grup: GirisGrubu, bit: number) => {
      st().bitDegistir(grup, bit);
      return api.oku();
    },
    islem: (op: IslemKodu) => {
      st().islemSec(op);
      return api.oku();
    },
    lamba: (basili: boolean) => {
      st().lambaBas(basili);
      return api.oku();
    },
    /** kamerayı bir bloğa götür: hesap.blok("Çarpma") */
    blok: (ad: string) => kart().focusBlock(ad),
    bloklar: () => kartYerlesimi("hesap").blocks.map((b) => b.name),
    secCip: (ref: string | null) => kart().selectChip(ref),
    secKapi: (g: number | null) => kart().selectGate(g),
    teller: (mod: "yok" | "secili" | "hepsi") => kart().setWires(mod),
    /** görünüm: "breadboard" (varsayılan) ya da "pcb"; verilmezse yalnız okur */
    gorunum: (g?: HesapGorunumu) => {
      if (g) kart().setGorunum(g);
      return kart().gorunum;
    },
    /** breadboard kurulum modu: odaktaki tel (delikten deliğe), takılan / toplam */
    kurulum: () => {
      const k = useBbKurulum.getState();
      const t = bbSeciliTel(k);
      return { acik: k.acik, secili: t ? `${telKimligi(t.no)} ${telTarifi(hesapPlani(), t)}` : null, takilan: k.yapilan.size, toplam: hesapPlani().teller.length };
    },
    cipler: () => hesapKarti().board.chips.map((c) => `${c.ref} ${c.def.part} · ${c.block} · ${c.role}`),
    pasifler: () => hesapKarti().board.passives.map((p) => `${p.ref} ${p.part} · ${p.block} · ${p.role}`),
  };
  (window as unknown as { hesap: typeof api }).hesap = api;
}
