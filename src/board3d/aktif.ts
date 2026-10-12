// Sahnedeki kart: CPU16 bilgisayarı (anakartın bütün kartları) ya da 8 bit hesap makinesi. 3D
// görünümün bütün parçaları (sahne, yan panel, çipin içi, pasif bilgisi, kurulum modu) kartın
// yapısını store.ts üzerinden buradan okur. Kart türü bölüm açılınca seçilir (aynı anda tek bir
// kart görünümü açıktır). Her türün yapısı (kart, yerleşim, netlerin uçları) ilk istekte bir kez
// kurulur ve saklanır: bölümler arasında gidip gelmek kartı yeniden kurmaz.
//
// Hesap makinesinin iki görünümü var: breadboard (varsayılan; hesap8/breadboard: 60 board, atlama
// telleri) ve PCB (tek uzun kart). Kart ve simülasyon aynı; yalnız yerleşim değişir.

import type { Board } from "../../cpu16/board/board";
import { boardLayout, type BoardLayout, type ChipPlace, type PassivePlace } from "../../cpu16/board/layout";
import { buildFullMachineBoard } from "../../cpu16/board/machine-board";
import { bbBoardLayout } from "../../hesap8/breadboard/gorunum";
import { bbPlani, type BbPlani } from "../../hesap8/breadboard/plan";
import { buildHesapBoard, type HesapKarti } from "../../hesap8/kart";
import { netEndpoints, type Endpoint } from "./wires";

export type KartTuru = "cpu16" | "hesap";
/** Hesap makinesinin görünümü */
export type HesapGorunumu = "breadboard" | "pcb";

export type Parca = { chip?: ChipPlace; passive?: PassivePlace };

interface Gorunum {
  layout?: BoardLayout;
  ends?: Map<number, Endpoint[]>;
  parts?: Map<string, Parca>;
}

interface KartYapisi {
  board: Board;
  /** görünüm başına (bilgisayarda yalnız "pcb") */
  gorunumler: Map<HesapGorunumu, Gorunum>;
}

let aktif: KartTuru = "cpu16";
let hesapGorunum: HesapGorunumu = "breadboard";
const yapilar = new Map<KartTuru, KartYapisi>();
let hesap: HesapKarti | null = null;
const dinleyiciler: ((tur: KartTuru, onceki: KartTuru) => void)[] = [];
const gorunumDinleyicileri: ((g: HesapGorunumu) => void)[] = [];

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

/** Türün görünümü: verilmezse hesap makinesinde seçili olan, bilgisayarda PCB */
function gorunumu(tur: KartTuru, g?: HesapGorunumu): HesapGorunumu {
  return tur === "hesap" ? (g ?? hesapGorunum) : "pcb";
}

function gorunumYapisi(tur: KartTuru, g?: HesapGorunumu): Gorunum {
  const y = yapi(tur);
  const ad = gorunumu(tur, g);
  let x = y.gorunumler.get(ad);
  if (!x) {
    x = {};
    y.gorunumler.set(ad, x);
  }
  return x;
}

export const aktifHesapGorunumu = (): HesapGorunumu => hesapGorunum;

/** Hesap makinesinin görünümü değişince çağrılır (seçimler sıfırlanır, sahne yeniden kurulur) */
export function gorunumDegisince(fn: (g: HesapGorunumu) => void): void {
  gorunumDinleyicileri.push(fn);
}

/** Hesap makinesinin görünümünü seç; değiştiyse true */
export function hesapGorunumuSec(g: HesapGorunumu): boolean {
  if (g === hesapGorunum) return false;
  hesapGorunum = g;
  for (const fn of gorunumDinleyicileri) fn(g);
  return true;
}

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

/** Yerleşim (mm). Hesap makinesinde görünüm verilmezse seçili olan (breadboard ya da PCB). */
export function kartYerlesimi(tur: KartTuru = aktif, g?: HesapGorunumu): BoardLayout {
  const x = gorunumYapisi(tur, g);
  x.layout ??= gorunumu(tur, g) === "breadboard" ? bbBoardLayout(hesapPlani()) : boardLayout(yapi(tur).board);
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
