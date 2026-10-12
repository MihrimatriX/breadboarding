// Sahnedeki kart: CPU16 bilgisayarı (anakartın bütün kartları) ya da 8 bit hesap makinesi. 3D
// görünümün bütün parçaları (sahne, yan panel, çipin içi, pasif bilgisi, kurulum modu) kartın
// yapısını store.ts üzerinden buradan okur. Kart türü bölüm açılınca seçilir (aynı anda tek bir
// kart görünümü açıktır). Her türün yapısı (kart, yerleşim, netlerin uçları) ilk istekte bir kez
// kurulur ve saklanır: bölümler arasında gidip gelmek kartı yeniden kurmaz.

import type { Board } from "../../cpu16/board/board";
import { boardLayout, type BoardLayout, type ChipPlace, type PassivePlace } from "../../cpu16/board/layout";
import { buildFullMachineBoard } from "../../cpu16/board/machine-board";
import { buildHesapBoard, type HesapKarti } from "../../hesap8/kart";
import { netEndpoints, type Endpoint } from "./wires";

export type KartTuru = "cpu16" | "hesap";

export type Parca = { chip?: ChipPlace; passive?: PassivePlace };

interface KartYapisi {
  board: Board;
  layout?: BoardLayout;
  ends?: Map<number, Endpoint[]>;
  parts?: Map<string, Parca>;
}

let aktif: KartTuru = "cpu16";
const yapilar = new Map<KartTuru, KartYapisi>();
let hesap: HesapKarti | null = null;
const dinleyiciler: ((tur: KartTuru, onceki: KartTuru) => void)[] = [];

/** Hesap makinesinin tanımı (girişler, göstergeler, iç sonuçlar); kartı sahnedekiyle aynı nesnedir */
export function hesapKarti(): HesapKarti {
  hesap ??= buildHesapBoard();
  return hesap;
}

function yapi(tur: KartTuru): KartYapisi {
  let y = yapilar.get(tur);
  if (!y) {
    y = { board: tur === "hesap" ? hesapKarti().board : buildFullMachineBoard().board };
    yapilar.set(tur, y);
  }
  return y;
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

export function kartYerlesimi(tur: KartTuru = aktif): BoardLayout {
  const y = yapi(tur);
  y.layout ??= boardLayout(y.board);
  return y.layout;
}

/** Her netin uçları (çip ve pasif pinleri) */
export function kartUclari(tur: KartTuru = aktif): Map<number, Endpoint[]> {
  const y = yapi(tur);
  y.ends ??= netEndpoints(kartYerlesimi(tur));
  return y.ends;
}

/** Referanstan yerleşim: çip ya da pasif eleman */
export function kartParcasi(ref: string | null, tur: KartTuru = aktif): Parca | null {
  if (!ref) return null;
  const y = yapi(tur);
  if (!y.parts) {
    const parts = new Map<string, Parca>();
    const lay = kartYerlesimi(tur);
    for (const c of lay.chips) parts.set(c.ref, { chip: c });
    for (const p of lay.passives) parts.set(p.ref, { passive: p });
    y.parts = parts;
  }
  return y.parts.get(ref) ?? null;
}
