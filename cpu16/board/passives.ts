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
  R_10K: {
    part: "R_10K",
    title: "10 kΩ direnç",
    pins: [pas(1, "1"), pas(2, "2")],
    footprint: "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal",
    usage: "Reset ve buton RC devreleri, çekme dirençleri",
  },
  R_1K: {
    part: "R_1K",
    title: "1 kΩ direnç",
    pins: [pas(1, "1"), pas(2, "2")],
    footprint: "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal",
    usage: "Yavaş osilatörün en düşük direnci (potla seri)",
  },
  C_10U: {
    part: "C_10U",
    title: "10 µF elektrolitik kondansatör",
    pins: [pas(1, "+"), pas(2, "-")],
    footprint: "Capacitor_THT:CP_Radial_D5.0mm_P2.00mm",
    usage: "Açılış reset gecikmesi (10 kΩ ile ≈ 0,1 s)",
  },
  C_1U: {
    part: "C_1U",
    title: "1 µF kondansatör",
    pins: [pas(1, "1"), pas(2, "2")],
    footprint: "Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm",
    usage: "Buton sıçrama süzgeci, yavaş osilatör",
  },
  POT_100K: {
    part: "POT_100K",
    title: "100 kΩ trimpot",
    pins: [pas(1, "1"), pas(2, "W"), pas(3, "3")],
    footprint: "Potentiometer_THT:Potentiometer_Bourns_3386P_Vertical",
    usage: "Yavaş saat hızı ayarı",
  },
  SW_PUSH: {
    part: "SW_PUSH",
    title: "Basmalı buton (6 mm)",
    pins: [pas(1, "1"), pas(2, "2")],
    footprint: "Button_Switch_THT:SW_PUSH_6mm",
    usage: "RESET ve ADIM butonları",
  },
  SW_SPDT: {
    part: "SW_SPDT",
    title: "Sürgülü anahtar (1 kutup, 2 konum)",
    pins: [pas(1, "A"), pas(2, "C"), pas(3, "B")],
    footprint: "Button_Switch_THT:SW_Slide_1P2T_CK_OS102011MS2Q",
    usage: "OTOMATİK / ADIM ve HIZLI / YAVAŞ seçimi",
  },
  OSC_CAN: {
    part: "OSC_CAN",
    title: "Kristal osilatör modülü (DIP-14 kılıf, 5 V)",
    pins: [pas(1, "EN"), pas(7, "GND"), pas(8, "OUT"), pas(14, "VCC")],
    footprint: "Oscillator:Oscillator_DIP-14",
    usage: "Ana saat kaynağı: CPU saatinin 8 katı (ör. 8 MHz → 1 MHz CPU)",
  },
  ARDUINO_NANO: {
    part: "ARDUINO_NANO",
    title: "Arduino Nano (ATmega328P, USB seri)",
    pins: "D1/TX D0/RX ~RESET GND D2 D3 D4 D5 D6 D7 D8 D9 D10 D11 D12 D13 3V3 AREF A0 A1 A2 A3 A4 A5 A6 A7 +5V ~RESET2 GND2 VIN"
      .split(" ")
      .map((name, i) => pas(i + 1, name)),
    footprint: "Module:Arduino_Nano",
    usage: "Flash programlayıcısının beyni: seri porttan Intel HEX alır, çipe yazar",
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
