// Hesap makinesinin breadboard planı: yerleşim + teller, kurulum sırasıyla numaralı. Yerleşimin
// tavlaması ve yönlendirme saniyeler sürdüğünden sonuçları veri.ts'te saklanır (`npm run hesap8 --
// breadboard --uret` yeniden üretir); bu modül saklanan veriden planı kurar (3D görünüm, kurulum modu,
// belgeler). Planın ortak parçaları (kodlama, sıralama, ölçüler, 3D yolları) ortak motorda:
// cpu16/board/breadboard/plan.ts. Veri netlistin parmak izini taşır: devre değişip veri eskirse plan
// kurulmaz (testler de bağlantıyı yalnız fiziksel modelden yeniden kurup netlistle karşılaştırır).

import {
  bbOlcu as olcu, cipYerleri, netlistParmakIzi, sirala, telKodla, telleriCoz, telRenkleri, type BbOlcu, type BbPlanTemel, type BbVeri,
} from "../../cpu16/board/breadboard/plan.ts";
import { boardAdi } from "../../cpu16/board/breadboard/geometri.ts";
import { yonlendir, type YonlendirmeSecenekleri } from "../../cpu16/board/breadboard/yonlendirme.ts";
import { buildHesapBoard, type HesapKarti } from "../kart.ts";
import { BB_RENKLERI, telRengi } from "./renk.ts";
import { BB_VERI } from "./veri.ts";
import { ASAMALAR, bbYerlesimi } from "./yerlesim.ts";

export type { BbTel } from "../../cpu16/board/breadboard/yonlendirme.ts";
export {
  DAGILIM_SINIRLARI, netlistParmakIzi, noktaBoardu, telYollari3B, ucEtiketi, yolCoz, yolKodla, type BbOlcu, type BbVeri,
} from "../../cpu16/board/breadboard/plan.ts";

export interface BbPlani extends BbPlanTemel {
  kart: HesapKarti;
}

/** Planın ölçüleri (hesap makinesinin renk kodu) */
export const bbOlcu = (p: BbPlanTemel): BbOlcu => olcu(p, BB_RENKLERI);

// ---------------------------------------------------------------- üretim ve kurma

export interface UretimSonucu {
  veri: BbVeri;
  plan: BbPlani;
  binme: number;
  kesisme: number;
}

/** Tavlama + yönlendirme (yarım dakika kadar): yeni veri */
export function bbPlaniUret(k: HesapKarti = buildHesapBoard(), o: YonlendirmeSecenekleri = {}): UretimSonucu {
  const yerlesim = bbYerlesimi(k);
  const r = yonlendir(k.board, yerlesim, telRengi, o);
  const teller = sirala(yerlesim, r.teller, BB_RENKLERI);
  const cipler = yerlesim.parcalar.filter((p) => p.cipMi && p.blok !== "Anahtarlar").map((p) => `${p.ref}|${boardAdi(p.board)}|${p.sutun}`);
  const veri: BbVeri = {
    parmakIzi: netlistParmakIzi(k.board),
    cipler,
    teller: teller.map(telKodla),
  };
  return { veri, plan: { kart: k, yerlesim, teller, asamalar: ASAMALAR }, binme: r.binme, kesisme: r.kesisme };
}

/** Saklanan veriden plan (hızlı: tavlama ve yönlendirme yok) */
export function bbPlaniKur(k: HesapKarti, veri: BbVeri): BbPlani {
  const iz = netlistParmakIzi(k.board);
  if (iz !== veri.parmakIzi) throw new Error(`breadboard verisi eski (netlist ${iz}, veri ${veri.parmakIzi}): npm run hesap8 -- breadboard --uret`);
  const yerlesim = bbYerlesimi(k, cipYerleri(veri.cipler));
  const teller = telleriCoz(k.board, veri.teller, telRenkleri(k.board, yerlesim, telRengi));
  return { kart: k, yerlesim, teller, asamalar: ASAMALAR };
}

let onbellek: BbPlani | undefined;
/** Saklanan veriden planın tek örneği (kart verilirse onunla kurulur: 3D sahnenin kartı) */
export function bbPlani(k?: HesapKarti): BbPlani {
  if (!onbellek || (k && onbellek.kart !== k)) onbellek = bbPlaniKur(k ?? buildHesapBoard(), BB_VERI);
  return onbellek;
}
