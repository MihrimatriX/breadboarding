// Bölüm etiketlerinin durumu: etiket kipi (kapalı / bölümler / ayrıntılı, tarayıcıda saklanır), seçili
// bölüm (yan panelde açıklaması, sahnede çipleri vurgulu) ve üstüne gelinen bölüm (ipucu). Bölümler ve
// metinleri cpu16/board/bolum-bilgi.ts'ten (sahnedeki kartın kataloğu), sahnedeki yerleri
// bolumSahne.ts'ten.
//
//   kapalı: etiket yok (eski görünüm: yalnız kart ve board adları)
//   bölümler: bölge / blok çerçeveleri ve başlık plakaları, kart plakaları
//   ayrıntılı (varsayılan): ayrıca yaklaşınca çip gruplarına kenar etiketleri (çizgiyle)
//
// Kısayol: E (kipler arasında döner). Esc seçimi geri alırken en son bölüm seçimini kaldırır.

import { useMemo } from "react";
import { Color } from "three";
import { create } from "zustand";
import { bolumKatalogu, type Bolum, type BolumKatalogu } from "../../cpu16/board/bolum-bilgi";
import { aktifGorunum, aktifKart, bbSahnesi, gorunumDegisince, gorunumHazir, kartDegisince, kartModeli, kartYerlesimi, type Gorunum, type KartTuru } from "./aktif";
import { bbSahneBolumleri, pcbSahneBolumleri, type Olcer, type SahneBolumleri } from "./bolumSahne";
import { useKart } from "./store";

export type EtiketKipi = "kapali" | "bolumler" | "ayrintili";

export const ETIKET_KIPLERI: { k: EtiketKipi; label: string; title: string }[] = [
  { k: "kapali", label: "kapalı", title: "Bölüm etiketi yok · kısayol: E" },
  { k: "bolumler", label: "bölümler", title: "Bölge çerçeveleri ve başlık plakaları · kısayol: E" },
  { k: "ayrintili", label: "ayrıntılı", title: "Ayrıca yaklaşınca çip gruplarına kenar etiketleri · kısayol: E" },
];

const ANAHTAR = "silikon3d.etiketler";

function kayitliKip(): EtiketKipi {
  try {
    const v = localStorage.getItem(ANAHTAR);
    return v === "kapali" || v === "bolumler" || v === "ayrintili" ? v : "ayrintili";
  } catch {
    return "ayrintili";
  }
}

function kipiSakla(k: EtiketKipi): void {
  try {
    localStorage.setItem(ANAHTAR, k);
  } catch {
    /* depolama kapalı: seçim yalnız bu oturumda */
  }
}

interface BolumDurumu {
  kip: EtiketKipi;
  /** seçili bölümün kimliği (bolumKimligi) */
  secili: string | null;
  /** üstüne gelinen bölüm ve farenin yeri (ipucu) */
  ustunde: { id: string; x: number; y: number } | null;
  /** kamera bu bölüme gitsin; n her istekte artar */
  ucus: { id: string; n: number } | null;
  kipSec(k: EtiketKipi): void;
  /** kapalı → bölümler → ayrıntılı → kapalı */
  kipDegistir(): void;
  /** bölümü seç (çip, kapı ve net seçimi kalkar); ucus: kamera bölümü çerçevelesin */
  sec(id: string | null, ucus?: boolean): void;
  ustundeSec(u: { id: string; x: number; y: number } | null): void;
}

export const useBolum = create<BolumDurumu>((set, get) => ({
  kip: kayitliKip(),
  secili: null,
  ustunde: null,
  ucus: null,
  kipSec(k) {
    kipiSakla(k);
    set({ kip: k, ustunde: null });
  },
  kipDegistir() {
    const s = ETIKET_KIPLERI.map((x) => x.k);
    get().kipSec(s[(s.indexOf(get().kip) + 1) % s.length]);
  },
  sec(id, ucus = false) {
    if (id !== null && !katalog().bolumler.has(id)) return;
    set({ secili: id, ustunde: null, ...(id !== null && ucus ? { ucus: { id, n: (get().ucus?.n ?? 0) + 1 } } : {}) });
    if (id === null) return;
    const k = useKart.getState();
    if (k.gate !== null) k.selectGate(null);
    if (k.net !== null) k.selectNet(null);
    if (k.chip !== null) k.selectChip(null);
  },
  ustundeSec(u) {
    const o = get().ustunde;
    if (u === o || (u && o && u.id === o.id && u.x === o.x && u.y === o.y)) return;
    set({ ustunde: u });
  },
}));

// kart değişince bölüm kimlikleri geçersiz; görünüm değişince bölümler aynı (yalnız ipucu kalkar)
kartDegisince(() => useBolum.setState({ secili: null, ustunde: null, ucus: null }));
gorunumDegisince(() => useBolum.setState({ ustunde: null }));

// ---------------------------------------------------------------- katalog ve sahnedeki yerler

const kataloglar = new Map<KartTuru, BolumKatalogu>();

/** Kart türünün bölüm kataloğu (verilmezse sahnedeki kartın); ilk istekte kurulur */
export function katalog(tur: KartTuru = aktifKart()): BolumKatalogu {
  let k = kataloglar.get(tur);
  if (!k) {
    k = bolumKatalogu(tur, kartModeli(tur).board);
    kataloglar.set(tur, k);
  }
  return k;
}

export const bolumu = (id: string | null): Bolum | null => (id ? katalog().bolumler.get(id) ?? null : null);

/** Plakaların yazı tipi (kalın IBM Plex Sans; yaziTipleri.ts önceden yükler) */
export const plakaYazisi = (px: number): string => `700 ${px}px "IBM Plex Sans", system-ui, sans-serif`;

let olcmeTuvali: CanvasRenderingContext2D | null | undefined;
/** Plaka yazısının tuvalde ölçülen eni (em); tuval yoksa (testler) ortalama büyük harf eni */
export const plakaOlcer: Olcer = (s) => {
  if (olcmeTuvali === undefined) olcmeTuvali = typeof document === "undefined" ? null : document.createElement("canvas").getContext("2d");
  if (!olcmeTuvali) return s.length * 0.7;
  olcmeTuvali.font = plakaYazisi(64);
  return olcmeTuvali.measureText(s).width / 64;
};

/** Plakaların en büyük yazısı (mm): genel bakışta okunacak kadar */
const YAZI_BOYLARI = {
  cpu16: { breadboard: { bolge: 42, kart: 52 }, pcb: { bolge: 16, kart: 0 } },
  hesap: { breadboard: { bolge: 22, kart: 32 }, pcb: { bolge: 14, kart: 0 } },
} as const;

const sahneler = new Map<string, SahneBolumleri>();

/** Sahnedeki kartın (verilen görünümdeki) bölüm çerçeveleri ve plakaları; ilk istekte kurulur */
export function sahneBolumleri(tur: KartTuru = aktifKart(), g: Gorunum = aktifGorunum(tur)): SahneBolumleri {
  const anahtar = `${tur}-${g}`;
  let s = sahneler.get(anahtar);
  if (!s) {
    const yazi = YAZI_BOYLARI[tur][g];
    s = g === "breadboard" ? bbSahneBolumleri(bbSahnesi(tur).panolar, katalog(tur), plakaOlcer, yazi) : pcbSahneBolumleri(kartYerlesimi(tur, g), katalog(tur), plakaOlcer, yazi);
    sahneler.set(anahtar, s);
  }
  return s;
}

/** Sahnede bölüm katmanı açık mı: kip kapalı değil */
export const useEtiketlerAcik = (): boolean => useBolum((s) => s.kip !== "kapali");

// ---------------------------------------------------------------- vurgu

export interface Vurgu {
  refs: Set<string>;
  renk: string;
}

/** Seçili bölümün parçaları ve rengi (çiplerin gövdesi bu renge çalar, ötekiler soluklaşır) */
export function useBolumVurgusu(): Vurgu | null {
  const secili = useBolum((s) => s.secili);
  const gorunum = useKart((s) => s.gorunum);
  const yukleniyor = useKart((s) => s.gorunumYukleniyor);
  return useMemo(() => {
    const b = bolumu(secili);
    if (!b) return null;
    return { refs: new Set(b.refs), renk: bolumRengi(b.id, aktifKart(), gorunum) };
  }, [secili, gorunum, yukleniyor]);
}

/** Bölümün sahnedeki rengi: çerçevesininki; grup ya da blokta ilk parçasının çerçevesininki; kartta vurgu mavisi */
export function bolumRengi(id: string, tur: KartTuru = aktifKart(), g: Gorunum = aktifGorunum(tur)): string {
  // bilgisayarın breadboard verisi daha yüklenmediyse (görünüm yeni seçildi) çerçeveler yok: vurgu mavisi
  if (!gorunumHazir(tur, g)) return VARSAYILAN_RENK.acik;
  const s = sahneBolumleri(tur, g);
  const c = s.cerceveler.find((x) => x.id === id);
  if (c) return c.renk;
  const b = katalog(tur).bolumler.get(id);
  for (const r of b?.refs ?? []) {
    const n = s.parcaCercevesi.get(r);
    if (n !== undefined) return s.cerceveler[n].renk;
  }
  return s.koyuZemin ? VARSAYILAN_RENK.koyu : VARSAYILAN_RENK.acik;
}

/** Çerçevesi olmayan bölümün rengi (kart, ya da sahne kurulmadan) */
const VARSAYILAN_RENK = { koyu: "#8fb4ff", acik: "#2d6bd2" } as const;

const GOVDE = new Color("#141619");
const tmp = new Color();

/**
 * Çip gövdesinin rengi: seçili çip ve üstüne gelinen çip her zamanki gibi; bir bölüm seçiliyse onun
 * çipleri bölümün rengine çalar, ötekiler zemine doğru soluklaşır.
 */
export function cipGovdeRengi(out: Color, ref: string, secili: string | null, ustunde: string | null, vurgu: Vurgu | null, zemin: string): Color {
  if (ref === secili) return out.set("#3a4a66");
  if (ref === ustunde) return out.set("#2a313b");
  if (!vurgu) return out.copy(GOVDE);
  if (vurgu.refs.has(ref)) return out.copy(GOVDE).lerp(tmp.set(vurgu.renk), 0.62);
  return out.copy(GOVDE).lerp(tmp.set(zemin), 0.42);
}
