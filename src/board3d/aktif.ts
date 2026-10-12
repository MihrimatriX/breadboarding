// Sahnedeki kart: CPU16 bilgisayarı (anakartın bütün kartları) ya da 8 bit hesap makinesi. 3D
// görünümün bütün parçaları (sahne, yan panel, çipin içi, pasif bilgisi, kurulum modu) kartın
// yapısını store.ts üzerinden buradan okur. Kart türü bölüm açılınca seçilir (aynı anda tek bir
// kart görünümü açıktır). Her türün yapısı (kart, yerleşim, netlerin uçları) ilk istekte bir kez
// kurulur ve saklanır: bölümler arasında gidip gelmek kartı yeniden kurmaz.
//
// İki kartın da iki görünümü var: PCB ve breadboard. Hesap makinesinde breadboard varsayılan
// (hesap8/breadboard: 60 board, atlama telleri); bilgisayarda PCB varsayılan, breadboard'da her kart
// kendi panosunda (cpu16/breadboard: 7 pano, 134 board, panolar arası 64 damarlı şerit kablo) ve
// seçim tarayıcıda saklanır. Kart ve simülasyon aynı; yalnız yerleşim değişir.

import type { Board } from "../../cpu16/board/board";
import { boardDikdortgeni, plakaBoyu } from "../../cpu16/board/breadboard/gorunum";
import type { BbPlanTemel, BbTel, BbVeri } from "../../cpu16/board/breadboard/plan";
import type { RenkTanimi, TelRengi } from "../../cpu16/board/breadboard/renk";
import { boardLayout, type BoardLayout, type ChipPlace, type PassivePlace } from "../../cpu16/board/layout";
import { buildFullMachineBoard } from "../../cpu16/board/machine-board";
import { cpuTelTarifi, makineBbPlani, makineLayout, type MakineBbPlani, type SeritKabloPlani } from "../../cpu16/breadboard/plan";
import { cpuRenkTanimi } from "../../cpu16/breadboard/renk";
import { bbBoardLayout } from "../../hesap8/breadboard/gorunum";
import { bbPlani, ucEtiketi, type BbPlani } from "../../hesap8/breadboard/plan";
import { renkTanimi } from "../../hesap8/breadboard/renk";
import { buildHesapBoard, type HesapKarti } from "../../hesap8/kart";
import { netEndpoints, type Endpoint } from "./wires";

export type KartTuru = "cpu16" | "hesap";
/** Kartın görünümü */
export type Gorunum = "breadboard" | "pcb";
/** Eski ad (hesap makinesinin görünümü) */
export type HesapGorunumu = Gorunum;

export type Parca = { chip?: ChipPlace; passive?: PassivePlace };

interface GorunumYapisi {
  layout?: BoardLayout;
  ends?: Map<number, Endpoint[]>;
  parts?: Map<string, Parca>;
}

interface KartYapisi {
  board: Board;
  gorunumler: Map<Gorunum, GorunumYapisi>;
}

/** Bilgisayarın görünüm seçimi tarayıcıda (hesap makinesi her açılışta breadboard) */
const GORUNUM_ANAHTARI = "cpu16.kart.gorunum";

function kayitliGorunum(): Gorunum {
  try {
    return localStorage.getItem(GORUNUM_ANAHTARI) === "breadboard" ? "breadboard" : "pcb";
  } catch {
    return "pcb";
  }
}

function gorunumuSakla(g: Gorunum): void {
  try {
    localStorage.setItem(GORUNUM_ANAHTARI, g);
  } catch {
    /* gizli pencere ya da kapalı depolama: seçim yalnız bu oturumda */
  }
}

let aktif: KartTuru = "cpu16";
const gorunumler: Record<KartTuru, Gorunum> = { cpu16: kayitliGorunum(), hesap: "breadboard" };
const yapilar = new Map<KartTuru, KartYapisi>();
let hesap: HesapKarti | null = null;
const dinleyiciler: ((tur: KartTuru, onceki: KartTuru) => void)[] = [];
const gorunumDinleyicileri: ((g: Gorunum, tur: KartTuru) => void)[] = [];

/** Hesap makinesinin tanımı (girişler, göstergeler, iç sonuçlar); kartı sahnedekiyle aynı nesnedir */
export function hesapKarti(): HesapKarti {
  hesap ??= buildHesapBoard();
  return hesap;
}

/** Hesap makinesinin breadboard planı (saklanan veriden; kartı sahnedekiyle aynı nesne) */
export function hesapPlani(): BbPlani {
  return bbPlani(hesapKarti());
}

function yapi(tur: KartTuru): KartYapisi {
  let y = yapilar.get(tur);
  if (!y) {
    y = { board: tur === "hesap" ? hesapKarti().board : buildFullMachineBoard().board, gorunumler: new Map() };
    yapilar.set(tur, y);
  }
  return y;
}

// bilgisayarın breadboard verisi (≈ 280 kB) ayrı bir parça: yalnız breadboard görünümü açılınca yüklenir
let cpuBbVerileri: Readonly<Record<string, BbVeri>> | null = null;
let cpuBbYuklemesi: Promise<void> | null = null;

/** Bilgisayarın breadboard verisi yüklendi mi */
export const cpuBbHazir = (): boolean => cpuBbVerileri !== null;

/** Bilgisayarın breadboard verisini yükle (bir kez) */
export function cpuBbYukle(): Promise<void> {
  cpuBbYuklemesi ??= import("../../cpu16/breadboard/veri/index").then((m) => {
    cpuBbVerileri = m.BB_VERILERI;
  });
  return cpuBbYuklemesi;
}

/** Bilgisayarın breadboard planı: 7 pano + şerit kablo (saklanan veriden; kartı sahnedekiyle aynı nesne) */
export function cpuBbPlani(): MakineBbPlani {
  if (!cpuBbVerileri) throw new Error("CPU16 breadboard verisi henüz yüklenmedi (cpuBbYukle)");
  return makineBbPlani(cpuBbVerileri, yapi("cpu16").board);
}

/** Görünüm sahnede kurulabilir mi (bilgisayarın breadboard'u verisi yüklenince) */
export const gorunumHazir = (tur: KartTuru = aktif, g: Gorunum = gorunumler[tur]): boolean => tur !== "cpu16" || g !== "breadboard" || cpuBbHazir();

function gorunumYapisi(tur: KartTuru, g?: Gorunum): GorunumYapisi {
  const y = yapi(tur);
  const ad = g ?? gorunumler[tur];
  let x = y.gorunumler.get(ad);
  if (!x) {
    x = {};
    y.gorunumler.set(ad, x);
  }
  return x;
}

/** Kart türünün seçili görünümü (verilmezse sahnedeki kartın) */
export const aktifGorunum = (tur: KartTuru = aktif): Gorunum => gorunumler[tur];
export const aktifHesapGorunumu = (): Gorunum => gorunumler.hesap;

/** Sahnedeki kartın görünümü değişince çağrılır (sahne yeniden kurulur) */
export function gorunumDegisince(fn: (g: Gorunum, tur: KartTuru) => void): void {
  gorunumDinleyicileri.push(fn);
}

/** Kart türünün görünümünü seç (verilmezse sahnedeki kartın); değiştiyse true */
export function gorunumSec(g: Gorunum, tur: KartTuru = aktif): boolean {
  if (g === gorunumler[tur]) return false;
  gorunumler[tur] = g;
  if (tur === "cpu16") gorunumuSakla(g);
  if (tur === aktif) for (const fn of gorunumDinleyicileri) fn(g, tur);
  return true;
}

/** Hesap makinesinin görünümünü seç; değiştiyse true */
export const hesapGorunumuSec = (g: Gorunum): boolean => gorunumSec(g, "hesap");

export const aktifKart = (): KartTuru => aktif;

/** Kart türü değişince çağrılır (seçimler, canlı değerler, kurulum kartı sıfırlanır) */
export function kartDegisince(fn: (tur: KartTuru, onceki: KartTuru) => void): void {
  dinleyiciler.push(fn);
}

/** Sahnedeki kartı seç; değiştiyse true */
export function aktifKartiSec(tur: KartTuru): boolean {
  if (tur === aktif) return false;
  const onceki = aktif;
  aktif = tur;
  for (const fn of dinleyiciler) fn(tur, onceki);
  return true;
}

export function kartModeli(tur: KartTuru = aktif): { board: Board } {
  return yapi(tur);
}

/** Yerleşim (mm). Görünüm verilmezse kartın seçili görünümü (breadboard ya da PCB). */
export function kartYerlesimi(tur: KartTuru = aktif, g?: Gorunum): BoardLayout {
  const x = gorunumYapisi(tur, g);
  if (!x.layout) {
    const bb = (g ?? gorunumler[tur]) === "breadboard";
    x.layout = !bb ? boardLayout(yapi(tur).board) : tur === "hesap" ? bbBoardLayout(hesapPlani()) : makineLayout(cpuBbPlani());
  }
  return x.layout;
}

/** Her netin uçları (çip ve pasif pinleri) */
export function kartUclari(tur: KartTuru = aktif): Map<number, Endpoint[]> {
  const x = gorunumYapisi(tur);
  x.ends ??= netEndpoints(kartYerlesimi(tur));
  return x.ends;
}

/** Referanstan yerleşim: çip ya da pasif eleman */
export function kartParcasi(ref: string | null, tur: KartTuru = aktif): Parca | null {
  if (!ref) return null;
  const x = gorunumYapisi(tur);
  if (!x.parts) {
    const parts = new Map<string, Parca>();
    const lay = kartYerlesimi(tur);
    for (const c of lay.chips) parts.set(c.ref, { chip: c });
    for (const p of lay.passives) parts.set(p.ref, { passive: p });
    x.parts = parts;
  }
  return x.parts.get(ref) ?? null;
}

// ---------------------------------------------------------------- breadboard sahnesi

/** Breadboard sahnesindeki bir pano: kendi taban plakası, board'ları ve telleri */
export interface BbPanosu {
  /** "hesap" ya da CPU16 kartının adı (cpu, clk, …) */
  kart: string;
  /** kısa ad (tel tariflerinde: "CPU · BB07 c14 → …"); hesap makinesinde boş */
  kisa: string;
  baslik: string;
  plan: BbPlanTemel;
  /** taban plakasının sol üst köşesi ve boyu (sahnenin yerleşiminde, mm) */
  x: number;
  y: number;
  w: number;
  h: number;
  /** bilgisayarda panonun sırası: arka sıra koridora ön kenarıyla, ön sıra arka kenarıyla bakar */
  sira?: "arka" | "on";
  renk: (r: TelRengi) => RenkTanimi;
  /** telin tek satırlık tarifi: "CPU · BB07 c14 → BB08 h3, 42 mm, sarı" */
  tarif: (t: BbTel) => string;
}

export interface BbSahnesi {
  tur: KartTuru;
  panolar: BbPanosu[];
  /** panolar arası şerit kablo (bilgisayarda) */
  serit: SeritKabloPlani | null;
  /** yazdırılan belgeyi üreten komut */
  belgeKomutu: string;
}

const sahneler = new Map<KartTuru, BbSahnesi>();

/** Kart türünün breadboard sahnesi (verilmezse sahnedeki kartın); ilk istekte kurulur */
export function bbSahnesi(tur: KartTuru = aktif): BbSahnesi {
  let s = sahneler.get(tur);
  if (s) return s;
  if (tur === "hesap") {
    const p = hesapPlani();
    const { w, h } = plakaBoyu(p);
    const renk = (r: TelRengi) => renkTanimi(r);
    const tarif = (t: BbTel) => {
      const n = t.yol.length;
      return `${ucEtiketi(p.yerlesim, t.yol[0], t.yol[1])} → ${ucEtiketi(p.yerlesim, t.yol[n - 2], t.yol[n - 1])}, ${Math.round(t.uzunluk)} mm, ${renk(t.renk).ad.toLocaleLowerCase("tr-TR")}`;
    };
    s = {
      tur, serit: null, belgeKomutu: "npm run hesap8 -- breadboard-belge",
      panolar: [{ kart: "hesap", kisa: "", baslik: "8 bit hesap makinesi", plan: p, x: 0, y: 0, w, h, renk, tarif }],
    };
  } else {
    const m = cpuBbPlani();
    s = {
      tur, serit: m.serit, belgeKomutu: "npm run cpu16 -- breadboard-belge hepsi",
      panolar: m.kartlar.map((k) => {
        const yer = m.yerler.find((q) => q.kart === k.kart)!;
        return {
          kart: k.kart, kisa: k.tanim.kisa, baslik: k.tanim.baslik, plan: k, x: yer.x, y: yer.y, w: yer.w, h: yer.h, sira: yer.sira,
          renk: cpuRenkTanimi, tarif: (t: BbTel) => cpuTelTarifi(k, t, cpuRenkTanimi(t.renk).ad),
        };
      }),
    };
  }
  sahneler.set(tur, s);
  return s;
}

/** Board'un dikdörtgeni sahnenin yerleşiminde (mm) */
export function panodakiBoard(p: Pick<BbPanosu, "x" | "y">, bx: number, by: number): { x: number; y: number; w: number; h: number } {
  const d = boardDikdortgeni(bx, by);
  return { ...d, x: d.x + p.x, y: d.y + p.y };
}
