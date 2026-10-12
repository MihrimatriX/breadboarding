// CPU16 breadboard tellerinin renk kodu: PCB'nin kurulum belgelerindeki ve wire-wrap tellerindeki kodun
// aynısı (cpu16/kurulum/plan.ts RENK_KODU, sinyalSinifi): telin rengi sinyalin sınıfını söyler. Renklerin
// adı ve 3D / belge rengi ortak motorda (cpu16/board/breadboard/renk.ts).

import { renkGrubu, type RenkTanimi, type TelRengi } from "../board/breadboard/renk.ts";
import { RENK_KODU, sinyalSinifi, type UcSinifi } from "../kurulum/plan.ts";

/** sinyal sınıfının tel rengi */
const SINIF_RENGI: Record<UcSinifi, TelRengi> = {
  vcc: "kirmizi", gnd: "siyah", adres: "sari", veri: "mavi", secim: "turuncu", kontrol: "yesil", saat: "beyaz", reset: "mor", dis: "kahverengi",
};

/** Renk tablosu (RENK_KODU sırasıyla): belgelerde ve kurulum modunda */
export const CPU_BB_RENKLERI: RenkTanimi[] = RENK_KODU.map((r) =>
  renkGrubu(SINIF_RENGI[r.sinif], r.ad, r.sinif === "vcc" || r.sinif === "gnd" ? `${r.aciklama}; ray köprüleri` : r.aciklama),
);

export const cpuRenkTanimi = (r: TelRengi): RenkTanimi => CPU_BB_RENKLERI.find((x) => x.renk === r)!;

/** Netin tel rengi (adından; bloklara bakmaz) */
export function cpuTelRengi(ad: string, _bloklar?: string[]): TelRengi {
  if (ad === "VCC") return "kirmizi";
  if (ad === "GND") return "siyah";
  return SINIF_RENGI[sinyalSinifi(ad)];
}
