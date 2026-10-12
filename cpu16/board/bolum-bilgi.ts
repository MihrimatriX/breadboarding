// Kartların bölüm açıklamaları: tek kaynak. Her kartın (CPU16'nın yedi kartı ve 8 bit hesap
// makinesi) her bölgesi, her bloğu ve her çip grubu için kısa bir etiket, başlık, görev ve "nasıl
// çalışır" metni. 3D görünüm (bölge çerçeveleri, kenar etiketleri, bölüm paneli) ve kurulum
// belgeleri (pano haritası, "Bölümler" tablosu) bu modülden okur; metinler cpu16/board/bolum-metin.ts
// ve hesap8/bolum-metin.ts'tedir.
//
// Hiyerarşi: kart → bölge (breadboard'da bir grup board) → blok (şemadaki işlev bloğu) → grup (aynı
// işi yapan çipler, ör. bir register'ın iki 74HC574'ü) → parça. Her mantık çipi tam bir gruptadır
// (testler denetler); yapıştırıcı kapı çipleri, birimlerinin çoğunun hizmet ettiği bloğun grubunda.
// Pasiflerden 100 nF'lar dışındakiler de birer gruptadır.

import type { Board, ChipInstance, Passive } from "./board.ts";
import { PANOLAR } from "../breadboard/panolar.ts";
import { CPU16_METINLERI } from "./bolum-metin.ts";
import { HESAP_ASAMALARI, HESAP_METINLERI } from "../../hesap8/bolum-metin.ts";

/** Bir bölümün metni */
export interface BolumMetni {
  /** kenar etiketi ve başlık plakası: kısa, BÜYÜK HARF (ör. "REGISTER R0") */
  etiket: string;
  /** cümle düzeninde başlık (ör. "Register r0") */
  baslik: string;
  /** ne işe yarar: bir iki cümle */
  gorev: string;
  /** nasıl çalışır: iki-dört cümle, çipler ve sinyallerle */
  nasil: string;
}

/** Bir bölgenin metni; `bloklar`: bölgede kurulan bloklar (aşamalar bunlardan çıkar) */
export interface BolgeMetni extends BolumMetni {
  bloklar?: string[];
}

/** Bir çip grubu: `refs` boşlukla ayrılmış referanslar, aralık "U147-U156" biçiminde */
export interface GrupTanimi extends BolumMetni {
  id: string;
  refs: string;
}

export interface KartMetinleri {
  kart: BolumMetni;
  /** bölge adı (breadboard'da board'ların rolü) → metin */
  bolgeler: Record<string, BolgeMetni>;
  /** blok adı → metin */
  bloklar: Record<string, BolumMetni>;
  gruplar: GrupTanimi[];
}

export type BolumTuru = "kart" | "bolge" | "blok" | "grup";

/** Kurulum aşaması (ve CPU16'da deney rehberi) */
export interface BolumAsamasi {
  no: number;
  ad: string;
  deney?: number;
}

export interface Bolum extends BolumMetni {
  /** "kart:cpu", "bolge:cpu:Register dosyası", "blok:cpu:ALU", "grup:cpu:r0" */
  id: string;
  tur: BolumTuru;
  /** kartın adı: cpu, clk, bellek, onbellek, gc, video, kyb ya da hesap */
  kart: string;
  /** blok (blok ve grup türünde) */
  blok?: string;
  /** bölge adı (bölge türünde) */
  bolge?: string;
  /**
   * Parçalar. Grup: tanımdaki parçalar; blok: bloğun çipleri (yapıştırıcı çipler hizmet ettikleri
   * blokta da) ve pasifleri; kart: bütün parçaları. Bölge: tanımdaki blokların parçaları; fiziksel
   * yerleşim (hangi board'da ne var) breadboard planından okunur.
   */
  refs: string[];
  asamalar: BolumAsamasi[];
  /** üst bölüm (kart için null) */
  ust: string | null;
  /** alt bölümler (sırasıyla) */
  alt: string[];
}

export interface BolumKatalogu {
  tur: "cpu16" | "hesap";
  /** kimlik → bölüm (kartlar, bölgeler, bloklar, gruplar; her kartta bu sırayla) */
  bolumler: Map<string, Bolum>;
  /** parça → grubunun kimliği */
  grubu: Map<string, string>;
  /** kartlar (makinedeki sırayla) */
  kartlar: string[];
}

export const bolumKimligi = {
  kart: (kart: string): string => `kart:${kart}`,
  bolge: (kart: string, ad: string): string => `bolge:${kart}:${ad}`,
  blok: (kart: string, ad: string): string => `blok:${kart}:${ad}`,
  grup: (kart: string, id: string): string => `grup:${kart}:${id}`,
};

/** 100 nF dekuplaj kondansatörleri gruplanmaz (her çipin yanında bir tane) */
export const gruplanmazMi = (p: Pick<Passive, "part">): boolean => p.part === "C_100N";

/** Yapıştırıcı çipin hizmet ettiği blok: birimlerinin çoğunluğunun bloğu (eşitlikte ilk birim) */
export function anaBlok(ci: Pick<ChipInstance, "block" | "glueUnits">): string {
  if (!ci.glueUnits?.length) return ci.block;
  const say = new Map<string, number>();
  for (const u of ci.glueUnits) say.set(u.block, (say.get(u.block) ?? 0) + 1);
  let en = "";
  let n = -1;
  for (const [b, k] of say) if (k > n) { en = b; n = k; }
  return en;
}

/** "U1 U3 U147-U156 D1" → ["U1", "U3", "U147", …, "U156", "D1"] */
export function refleriAc(s: string): string[] {
  const out: string[] = [];
  for (const p of s.split(/\s+/).filter(Boolean)) {
    const m = /^([A-Z]+)(\d+)-([A-Z]+)(\d+)$/.exec(p);
    if (!m) {
      out.push(p);
      continue;
    }
    if (m[1] !== m[3]) throw new Error(`aralığın iki ucu aynı önekli olmalı: ${p}`);
    const a = Number(m[2]);
    const b = Number(m[4]);
    if (b < a) throw new Error(`ters aralık: ${p}`);
    for (let i = a; i <= b; i++) out.push(`${m[1]}${i}`);
  }
  return out;
}

/** Makinenin kartları: CPU16 kartları kurulum sırasıyla, hesap makinesinde tek kart */
const CPU16_KARTLARI = ["clk", "cpu", "bellek", "onbellek", "gc", "video", "kyb"];

/** Kartın metinleri */
export function kartMetinleri(kart: string): KartMetinleri {
  const m = kart === "hesap" ? HESAP_METINLERI : CPU16_METINLERI[kart];
  if (!m) throw new Error(`bölüm metni olmayan kart: ${kart}`);
  return m;
}

function asamaBul(kart: string, blok: string): BolumAsamasi | null {
  if (kart === "hesap") {
    const a = HESAP_ASAMALARI.find((x) => x.bloklar.includes(blok));
    return a ? { no: a.no, ad: a.ad } : null;
  }
  const p = PANOLAR.find((x) => x.kart === kart);
  const a = p?.asamalar.find((x) => x.bloklar.includes(blok));
  return a ? { no: a.no, ad: a.ad, ...(a.deney !== undefined ? { deney: a.deney } : {}) } : null;
}

function asamalar(kart: string, bloklar: Iterable<string>): BolumAsamasi[] {
  const m = new Map<number, BolumAsamasi>();
  for (const b of bloklar) {
    const a = asamaBul(kart, b);
    if (a) m.set(a.no, a);
  }
  return [...m.values()].sort((a, b) => a.no - b.no);
}

/**
 * Kartın bölgeleri: ad → (metin, bloklar; modüler panoda board'larındaki gruplar). Modüler panoda
 * (düzen) bir bölgenin parçaları board'larındaki grupların parçalarıdır ("grup+" göstergeleri de).
 */
function kartBolgeleri(kart: string, metin: KartMetinleri): { ad: string; m: BolgeMetni; bloklar: string[]; gruplar?: Set<string> }[] {
  if (kart === "hesap") return Object.entries(metin.bolgeler).map(([ad, m]) => ({ ad, m, bloklar: m.bloklar ?? [] }));
  const p = PANOLAR.find((x) => x.kart === kart);
  if (!p) return [];
  return Object.entries(p.bolgeler).map(([kod, b]) => {
    const m = metin.bolgeler[b.ad];
    if (!m) throw new Error(`${kart}: bölge metni yok: ${b.ad}`);
    const gruplar = p.duzen
      ? new Set(p.duzen.flatMap((sira, by) => sira.flatMap((h, bx) => (p.izgara[by][bx] === kod ? h.split(/\s+/).filter(Boolean).map((g) => g.replace(/\+$/, "")) : []))))
      : undefined;
    return { ad: b.ad, m, bloklar: b.bloklar.length ? b.bloklar : (m.bloklar ?? []), gruplar };
  });
}

/**
 * Makinenin bölüm kataloğu. `board`: buildFullMachineBoard() ya da buildHesapBoard() kartı.
 * Tanımda olup kartta olmayan bir parça ya da iki gruba giren bir parça hata verir.
 */
export function bolumKatalogu(tur: "cpu16" | "hesap", board: Board): BolumKatalogu {
  const kartlar = tur === "hesap" ? ["hesap"] : CPU16_KARTLARI.filter((k) => board.chips.some((c) => c.card === k));
  const bolumler = new Map<string, Bolum>();
  const grubu = new Map<string, string>();
  const cipler = new Map(board.chips.map((c) => [c.ref, c]));
  const pasifler = new Map(board.passives.map((p) => [p.ref, p]));
  const ekle = (b: Bolum) => {
    if (bolumler.has(b.id)) throw new Error(`iki kez tanımlı bölüm: ${b.id}`);
    bolumler.set(b.id, b);
    if (b.ust) bolumler.get(b.ust)?.alt.push(b.id);
  };
  const parcaBlogu = (ref: string): string => {
    const c = cipler.get(ref);
    if (c) return anaBlok(c);
    const p = pasifler.get(ref);
    if (p) return p.block;
    throw new Error(`kartta olmayan parça: ${ref}`);
  };

  for (const kart of kartlar) {
    const metin = kartMetinleri(kart);
    const kCip = board.chips.filter((c) => c.card === kart);
    const kPasif = board.passives.filter((p) => p.card === kart && !gruplanmazMi(p));
    const kartId = bolumKimligi.kart(kart);
    const blokAdlari = [...new Set([...kCip.map((c) => c.block), ...kCip.map(anaBlok), ...kPasif.map((p) => p.block)])];
    ekle({ ...metin.kart, id: kartId, tur: "kart", kart, refs: [...kCip.map((c) => c.ref), ...kPasif.map((p) => p.ref)], asamalar: asamalar(kart, blokAdlari), ust: null, alt: [] });

    // bölgeler
    const bolgeOf = new Map<string, string>();
    const bolgeListesi = kartBolgeleri(kart, metin);
    // modüler pano: grubu bir bölgenin board'unda olan parçalar o bölgenin; kalanlar bloklarıyla
    const duzendeki = new Set<string>();
    for (const b of bolgeListesi) for (const g of b.gruplar ?? []) for (const r of refleriAc(metin.gruplar.find((x) => x.id === g)?.refs ?? "")) duzendeki.add(r);
    for (const { ad, m, bloklar, gruplar } of bolgeListesi) {
      const id = bolumKimligi.bolge(kart, ad);
      const blokta = (ref: string, blok: string) => bloklar.includes(blok) && !duzendeki.has(ref);
      const grupta = new Set(gruplar ? [...gruplar].flatMap((g) => refleriAc(metin.gruplar.find((x) => x.id === g)?.refs ?? "")) : []);
      const refs = [
        ...kCip.filter((c) => grupta.has(c.ref) || blokta(c.ref, anaBlok(c))).map((c) => c.ref),
        ...kPasif.filter((p) => grupta.has(p.ref) || blokta(p.ref, p.block)).map((p) => p.ref),
      ];
      const asamaBloklari = gruplar ? [...new Set(refs.map(parcaBlogu))] : bloklar;
      ekle({ etiket: m.etiket, baslik: m.baslik, gorev: m.gorev, nasil: m.nasil, id, tur: "bolge", kart, bolge: ad, refs, asamalar: asamalar(kart, asamaBloklari), ust: kartId, alt: [] });
      if (tur === "cpu16") for (const b of bloklar) if (!bolgeOf.has(b)) bolgeOf.set(b, id);
    }

    // bloklar (yapıştırıcı çipler hem "Yapıştırıcı lojik" bloğunda hem hizmet ettikleri blokta)
    for (const blok of blokAdlari) {
      const m = metin.bloklar[blok];
      if (!m) throw new Error(`${kart}: blok metni yok: ${blok}`);
      const refs = [
        ...kCip.filter((c) => c.block === blok || anaBlok(c) === blok).map((c) => c.ref),
        ...kPasif.filter((p) => p.block === blok).map((p) => p.ref),
      ];
      ekle({ ...m, id: bolumKimligi.blok(kart, blok), tur: "blok", kart, blok, refs, asamalar: asamalar(kart, [blok]), ust: bolgeOf.get(blok) ?? kartId, alt: [] });
    }

    // gruplar
    for (const g of metin.gruplar) {
      const refs = refleriAc(g.refs);
      if (!refs.length) throw new Error(`${kart}: boş grup: ${g.id}`);
      const id = bolumKimligi.grup(kart, g.id);
      for (const r of refs) {
        const c = cipler.get(r) ?? pasifler.get(r);
        if (!c) throw new Error(`${kart}/${g.id}: kartta olmayan parça: ${r}`);
        if (c.card !== kart) throw new Error(`${kart}/${g.id}: ${r} başka kartın (${c.card})`);
        const once = grubu.get(r);
        if (once) throw new Error(`${r} iki grupta: ${once} ve ${id}`);
        grubu.set(r, id);
      }
      // grubun bloğu: çiplerinin (yoksa pasiflerinin) en sık bloğu
      const say = new Map<string, number>();
      const cipRefleri = refs.filter((r) => cipler.has(r));
      for (const r of cipRefleri.length ? cipRefleri : refs) say.set(parcaBlogu(r), (say.get(parcaBlogu(r)) ?? 0) + 1);
      const blok = [...say].sort((a, b) => b[1] - a[1])[0][0];
      const { id: _x, refs: _r, ...metni } = g;
      ekle({ ...metni, id, tur: "grup", kart, blok, refs, asamalar: asamalar(kart, [blok]), ust: bolumKimligi.blok(kart, blok), alt: [] });
    }
  }
  return { tur, bolumler, grubu, kartlar };
}

/** Bölümün kartı (ya da kendisi) dahil üst zinciri: [kart, bölge?, blok?, grup?] */
export function bolumZinciri(k: BolumKatalogu, id: string): Bolum[] {
  const out: Bolum[] = [];
  let b = k.bolumler.get(id);
  while (b) {
    out.unshift(b);
    b = b.ust ? k.bolumler.get(b.ust) : undefined;
  }
  return out;
}

/** Bir türdeki bölümler (kartın sırasıyla) */
export function bolumleri(k: BolumKatalogu, tur: BolumTuru, kart?: string): Bolum[] {
  return [...k.bolumler.values()].filter((b) => b.tur === tur && (kart === undefined || b.kart === kart));
}

/** Kartın grupları, bloklarına göre (blok sırası kartın blok sırası) */
export function kartGruplari(k: BolumKatalogu, kart: string): Bolum[] {
  return bolumleri(k, "grup", kart);
}

const ADSIZ_NET = /^(VCC|GND|U\d+\..*|[a-z]+\d*|n\d+)$/;

/**
 * Bölümün dış sinyalleri: parçalarının bölüm dışındaki parçalara da giden netleri, adlarına göre
 * kısaltılmış (BUS0 … BUS15 → "BUS0–15"). VCC, GND ve adsız iç netler sayılmaz.
 * `en`: en çok kaç giriş (önce kalabalık veriyolları).
 */
export function bolumSinyalleri(board: Board, refs: Iterable<string>, en = 14): string[] {
  const ic = new Set(refs);
  const netler = new Set<number>();
  for (const c of board.chips) if (ic.has(c.ref)) for (const n of Object.values(c.nets)) netler.add(n);
  for (const p of board.passives) if (ic.has(p.ref)) for (const n of Object.values(p.pins)) netler.add(n);
  const disari = new Set<number>();
  const bak = (ref: string, ns: Iterable<number>) => {
    if (ic.has(ref)) return;
    for (const n of ns) if (netler.has(n)) disari.add(n);
  };
  for (const c of board.chips) bak(c.ref, Object.values(c.nets));
  for (const p of board.passives) if (!gruplanmazMi(p)) bak(p.ref, Object.values(p.pins));
  const adlar = [...disari].map((n) => board.netName(n)).filter((a) => a && !ADSIZ_NET.test(a));
  return sinyalOzeti(adlar, en);
}

/** Ad listesini öneklerine göre kısalt: ["BUS0", "BUS1", "BUS3", "CLK"] → ["BUS0–1, 3", "CLK"] */
export function sinyalOzeti(adlar: string[], en = 14): string[] {
  const gruplar = new Map<string, number[]>();
  const tekler: string[] = [];
  for (const a of new Set(adlar)) {
    const m = /^(.*?[^\d])(\d+)$/.exec(a);
    if (!m || m[1].endsWith("_F") || /\d_$/.test(m[1])) {
      tekler.push(a);
      continue;
    }
    if (!gruplar.has(m[1])) gruplar.set(m[1], []);
    gruplar.get(m[1])!.push(Number(m[2]));
  }
  const out: { ad: string; n: number }[] = [];
  for (const [onek, ns] of gruplar) {
    ns.sort((a, b) => a - b);
    if (ns.length === 1) {
      out.push({ ad: `${onek}${ns[0]}`, n: 1 });
      continue;
    }
    const parcalar: string[] = [];
    for (let i = 0; i < ns.length; ) {
      let j = i;
      while (j + 1 < ns.length && ns[j + 1] === ns[j] + 1) j++;
      parcalar.push(j === i ? `${ns[i]}` : j === i + 1 ? `${ns[i]}, ${ns[j]}` : `${ns[i]}–${ns[j]}`);
      i = j + 1;
    }
    out.push({ ad: `${onek}${parcalar.join(", ")}`, n: ns.length });
  }
  for (const t of tekler) out.push({ ad: t, n: 1 });
  out.sort((a, b) => b.n - a.n || a.ad.localeCompare(b.ad, "tr"));
  const sonuc = out.slice(0, en).map((x) => x.ad);
  if (out.length > en) sonuc.push(`+${out.length - en} sinyal daha`);
  return sonuc;
}
