// Kendin yap bellek kartı (eğitim kartı, kapı seviyesi): 16 baytlık RAM, her bayt bir 74HC574.
// G/Ç alanında FF40–FF4F; davranış modeli emu/machine.ts (Machine.kyb, ioRead / ioWrite).
// Deney rehberi: cpu16/kit/deney-14-kendin-yap-bellek.md
//
// Bir 62256'nın içinde olan şeyin aynısı, açıkta: her bayt 8 bitlik bir hücre dizisidir (burada
// bir 74HC574'ün sekiz flip-flop'u), adres çözücü hangi hücrenin yazılacağını ya da veriyoluna
// sürüleceğini seçer, hücrelerin çıkışları üç durumlu olduğu için hepsi aynı veri hattını paylaşır.
// 62256'da 32 768 bayt ve 15 adres biti vardır; burada 16 bayt ve 4 adres biti (A3..A0).
//
// Veriyolu arayüzü (arka panel), G/Ç kartıyla aynı düzen:
//   ~IO (bellek kartı: A15..A8 = FF) ∧ A7..A4 = 4 → grup FF4x; A3..A1 kelimeyi (bayt çiftini) seçer.
//   Kelime k = FF40 + 2k: çift bayt (FF40 + 2k) DE şeridinde, tek bayt (FF41 + 2k) DO şeridinde.
//   Yazma: ~MWE_E / ~MWE_O darbesi seçilen şeridin çipini darbenin sonunda (yükselen kenar) yükler;
//   kelime yazması iki şeridi birlikte, bayt yazması yalnız kendi şeridini yazar.
//   Okuma: ~MRD düşükken seçilen çiftin iki çipi de çıkışını açar (çift bayt DE'ye, tek bayt DO'ya);
//   bayt okumada CPU A0'a göre baytı seçer. Okumanın yan etkisi yoktur.
//   Veriyolu tamponu: hücreler kartın kendi iç şeritlerine (KE, KO) bağlıdır; arka paneldeki DE / DO
//   ile aralarında birer 74HC245 vardır (yalnız FF4x seçiliyken açık; yön okumada kart → veriyolu).
//   Böylece veriyolunu 16 çipin 32 bacağı yerine tek bir çip yükler ve CPU'nun okuma yolu
//   yavaşlamaz (her bacak ≈ 5 pF; zamanlama analizi bunu hesaba katar).
// Reset içeriği silmez (74HC574'ün reset ucu yoktur); açılışta içerik rastgeledir.

import type { Board, ChipInstance } from "./board.ts";

/** Kartın arka panelden gelen girişleri */
export const KYB_CARD_INPUTS = ["~IO", "~MRD", "~MWE_E", "~MWE_O", ...Array.from({ length: 7 }, (_, i) => `A${i + 1}`)];

export interface KybCard {
  /** baytlar: bytes[i] = FF40 + i'deki bayt (çift i: DE şeridi, tek i: DO şeridi) */
  bytes: ChipInstance[];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
type Conn = Record<string, string | number>;

export function buildKybCard(b: Board): KybCard {
  b.card = "kyb";

  b.block = "Adres çözme";
  b.place("74HC138", { A0: "A4", A1: "A5", A2: "A6", "~E1": "~IO", "~E2": "A7", E3: "VCC", "~Y4": "~K_G" },
    "grup FF4x (A7..A4 = 4)");
  // üç çözücü aynı adres bitlerini (A3..A1 = kelime) kullanır; yalnız izin girişleri farklı
  const decoder = (strobe: string, out: (k: number) => string, role: string) => {
    const conn: Conn = { A0: "A1", A1: "A2", A2: "A3", "~E1": "~K_G", "~E2": strobe, E3: "VCC" };
    range(8).forEach((k) => (conn[`~Y${k}`] = out(k)));
    b.place("74HC138", conn, role);
  };
  decoder("~MWE_E", (k) => `~K_WE${k}`, "çift bayt yazma darbesi: kelime 0..7 (FF40, FF42 … FF4E)");
  decoder("~MWE_O", (k) => `~K_WO${k}`, "tek bayt yazma darbesi: kelime 0..7 (FF41, FF43 … FF4F)");
  decoder("~MRD", (k) => `~K_RD${k}`, "okuma: kelime 0..7 (iki bayt birlikte)");

  b.block = "Veriyolu tamponu";
  for (const [lane, inner] of [["DE", "KE"], ["DO", "KO"]] as const) {
    const c: Conn = { DIR: "~MRD", "~OE": "~K_G" };
    range(8).forEach((bit) => {
      c[`A${bit}`] = `${lane}${bit}`;
      c[`B${bit}`] = `${inner}${bit}`;
    });
    b.place("74HC245", c, `${lane} ↔ ${inner} (FF4x seçiliyken; okumada kart → veriyolu)`);
  }

  b.block = "Bellek hücreleri";
  const bytes: ChipInstance[] = [];
  for (let i = 0; i < 16; i++) {
    const k = i >> 1;
    const odd = i & 1;
    const lane = odd ? "KO" : "KE";
    const c: Conn = { CP: odd ? `~K_WO${k}` : `~K_WE${k}`, "~OE": `~K_RD${k}` };
    range(8).forEach((bit) => {
      c[`D${bit}`] = `${lane}${bit}`;
      c[`Q${bit}`] = `${lane}${bit}`;
    });
    const addr = (0xff40 + i).toString(16).toUpperCase();
    bytes.push(b.place("74HC574", c, `bayt ${addr} (${odd ? "tek, DO şeridi" : "çift, DE şeridi"})`));
  }
  return { bytes };
}
