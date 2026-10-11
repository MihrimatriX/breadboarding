// Kütüphanedeki entegreler dışında kartlarda kullanılan elemanlar: KiCad sembolleri ve BOM için.
// Simülasyonda karşılıkları yok (çekme dirençleri LogicSim'de zayıf sürücü olarak modellenir).

import type { ChipDef, PinDef } from "../chips/types.ts";

export type SymbolOnly = Pick<ChipDef, "part" | "title" | "pins" | "footprint" | "usage">;

const pas = (num: number, name: string): PinDef => ({ num, name, dir: "passive" });

export const BACKPLANE_PINS = 64;

export const PASSIVES: Record<string, SymbolOnly> = {
  RN_10K_8: {
    part: "RN_10K_8",
    title: "8 × 10 kΩ direnç dizisi (SIP-9, ortak uç)",
    pins: [pas(1, "COM"), ...Array.from({ length: 8 }, (_, i) => pas(i + 2, `R${i + 1}`))],
    footprint: "Resistor_THT:R_Array_SIP9",
    usage: "Veriyolu çekme dirençleri",
  },
  C_100N: {
    part: "C_100N",
    title: "100 nF seramik kondansatör (dekuplaj)",
    pins: [pas(1, "1"), pas(2, "2")],
    footprint: "Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm",
    usage: "Her entegrenin VCC-GND arasına, çipe yakın",
  },
  C_100U: {
    part: "C_100U",
    title: "100 µF elektrolitik kondansatör (kart girişi)",
    pins: [pas(1, "+"), pas(2, "-")],
    footprint: "Capacitor_THT:CP_Radial_D6.3mm_P2.50mm",
    usage: "Her kartın besleme girişi",
  },
  R_330: {
    part: "R_330",
    title: "330 Ω direnç (LED akımı)",
    pins: [pas(1, "1"), pas(2, "2")],
    footprint: "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal",
    usage: "Durum LED'leri",
  },
  LED: {
    part: "LED",
    title: "3 mm LED",
    pins: [pas(1, "A"), pas(2, "K")],
    footprint: "LED_THT:LED_D3.0mm",
    usage: "Durum göstergeleri (HALTED, FAULT)",
  },
  BACKPLANE_2x32: {
    part: "BACKPLANE_2x32",
    title: "Arka panel konnektörü 2 × 32 (2,54 mm)",
    pins: Array.from({ length: BACKPLANE_PINS }, (_, i) => pas(i + 1, String(i + 1))),
    footprint: "Connector_PinHeader_2.54mm:PinHeader_2x32_P2.54mm_Vertical",
    usage: "Her kart arka panele bununla takılır",
  },
};

/**
 * Arka panel pin düzeni (her kartta aynı). Faz 6 kartları boş pinleri kullanır.
 * Tek numaralar bir sırada, çift numaralar karşı sırada.
 */
export const BACKPLANE: Record<number, string> = (() => {
  const m: Record<number, string> = { 1: "GND", 2: "GND", 3: "VCC", 4: "VCC", 5: "CLK", 6: "WR_WIN", 7: "~RESET", 8: "IRQ" };
  for (let i = 0; i < 16; i++) m[9 + i] = `A${i}`;
  for (let i = 0; i < 8; i++) m[25 + i] = `DE${i}`;
  for (let i = 0; i < 8; i++) m[33 + i] = `DO${i}`;
  Object.assign(m, { 41: "~MRD", 42: "~MWE_E", 43: "~MWE_O", 44: "HALTED", 45: "FAULT", 62: "GND", 63: "VCC", 64: "GND" });
  return m;
})();
