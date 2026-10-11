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
    usage: "EEPROM programlayıcısının beyni: seri porttan Intel HEX alır, çipe yazar",
  },
  BACKPLANE_2x32: {
    part: "BACKPLANE_2x32",
    title: "Arka panel konnektörü 2 × 32 (2,54 mm)",
    pins: Array.from({ length: BACKPLANE_PINS }, (_, i) => pas(i + 1, String(i + 1))),
    footprint: "Connector_PinHeader_2.54mm:PinHeader_2x32_P2.54mm_Vertical",
    usage: "Her kart arka panele bununla takılır",
  },
  // ---- Faz 6: G/Ç kartı ve video kartı (anakart-gc-video.md)
  OSC_25M175: {
    part: "OSC_25M175",
    title: "25,175 MHz kristal osilatör modülü (DIP-14 kılıf, 5 V)",
    pins: [pas(1, "EN"), pas(7, "GND"), pas(8, "OUT"), pas(14, "VCC")],
    footprint: "Oscillator:Oscillator_DIP-14",
    usage: "Video kartının piksel saati (640×480 @ 60 Hz), CPU saatinden bağımsız",
  },
  R_680: {
    part: "R_680",
    title: "680 Ω direnç",
    pins: [pas(1, "1"), pas(2, "2")],
    footprint: "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal",
    usage: "VGA renk DAC'ı: renk bitinin 2/3 ağırlığı (75 Ω monitör girişiyle)",
  },
  R_1K3: {
    part: "R_1K3",
    title: "1,3 kΩ direnç",
    pins: [pas(1, "1"), pas(2, "2")],
    footprint: "Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P7.62mm_Horizontal",
    usage: "VGA renk DAC'ı: parlaklık (I) bitinin 1/3 ağırlığı",
  },
  CONN_VGA: {
    part: "CONN_VGA",
    title: "VGA konnektörü (DE-15 HD, dişi)",
    pins: "RED GREEN BLUE ID2 GND RED_RTN GREEN_RTN BLUE_RTN KEY SYNC_GND ID0 ID1 HSYNC VSYNC ID3"
      .split(" ")
      .map((name, i) => pas(i + 1, name)),
    footprint: "Connector_Dsub:DSUB-15-HD_Female_Horizontal_P2.29x1.98mm_EdgePinOffset3.03mm_Housed_MountingHolesOffset4.94mm",
    usage: "Monitör çıkışı: R, G, B (0–0,7 V), HSYNC ve VSYNC (negatif)",
  },
  CONN_PS2: {
    part: "CONN_PS2",
    title: "PS/2 klavye konnektörü (6 pin mini-DIN, dişi)",
    pins: "DATA NC2 GND VCC CLK NC6".split(" ").map((name, i) => pas(i + 1, name)),
    footprint: "Connector_Dsub:MiniDIN-6_Female_Horizontal",
    usage: "PS/2 klavye: açık-kollektör saat ve veri hatları, 5 V besleme",
  },
  CONN_CH340: {
    part: "CONN_CH340",
    title: "CH340 USB-UART modülü yuvası (6 pin, FTDI düzeni)",
    pins: "GND ~CTS VCC TXD RXD ~DTR".split(" ").map((name, i) => pas(i + 1, name)),
    footprint: "Connector_PinSocket_2.54mm:PinSocket_1x06_P2.54mm_Vertical",
    usage: "Bilgisayara USB seri bağlantı (115200 8N1, RTS/CTS akış denetimi)",
  },
};

// ---- LED renkleri. Kütüphanede tek bir "LED" parçası var; rengi görevinden seçilir. 3D görünüm,
// bilgi paneli ve rehberler (kit/led-ve-direnc.md) aynı tabloyu kullanır.

export type LedRenk = "kirmizi" | "turuncu" | "sari" | "yesil" | "mavi" | "beyaz";

export interface LedRenkBilgi {
  /** Türkçe adı (BOM ve panel) */
  ad: string;
  /** yanarken ışığın rengi */
  isik: string;
  /** sönükken renkli epoksi gövdenin rengi */
  govde: string;
  /** tipik ileri gerilim (V) ve veri sayfalarındaki aralık */
  vf: number;
  vfAralik: [number, number];
  /** dalga boyu (nm); beyazda yok (mavi LED + fosfor) */
  dalga?: number;
}

export const LED_RENKLERI: Record<LedRenk, LedRenkBilgi> = {
  kirmizi: { ad: "kırmızı", isik: "#ff2b2b", govde: "#8a1f24", vf: 1.9, vfAralik: [1.8, 2.0], dalga: 625 },
  turuncu: { ad: "turuncu (amber)", isik: "#ff9a1a", govde: "#8f4d12", vf: 2.0, vfAralik: [1.9, 2.1], dalga: 605 },
  sari: { ad: "sarı", isik: "#ffe23a", govde: "#8c7a1c", vf: 2.0, vfAralik: [2.0, 2.2], dalga: 590 },
  yesil: { ad: "yeşil", isik: "#4dff6a", govde: "#1f6b2c", vf: 2.1, vfAralik: [2.0, 2.2], dalga: 570 },
  mavi: { ad: "mavi", isik: "#3b8cff", govde: "#1d3f8c", vf: 3.1, vfAralik: [3.0, 3.2], dalga: 470 },
  beyaz: { ad: "beyaz", isik: "#f4f8ff", govde: "#b9c2cc", vf: 3.1, vfAralik: [3.0, 3.2] },
};

/**
 * Görevden LED rengi: ilk eşleşen kural. Hata kırmızı, "durdu" uyarı rengi (amber), saat mavi
 * (breadboard bilgisayarlarında saat LED'i geleneksel olarak mavidir; ayrıca aynı 330 Ω ile daha
 * az akım çekerek ileri gerilimin akıma etkisini gösterir), besleme / hazır yeşil, veri ve adres
 * hatları sarı. Kalan her şey kırmızı (en yaygın, en ucuz).
 */
export const LED_RENK_KURALLARI: { desen: RegExp; renk: LedRenk; neden: string }[] = [
  { desen: /FAULT|HATA/i, renk: "kirmizi", neden: "hata: en çok dikkat çeken renk" },
  { desen: /HALT/i, renk: "turuncu", neden: "CPU durdu: uyarı, ama hata değil (trafik lambasının sarısı)" },
  { desen: /\bCLK\b|SAAT/i, renk: "mavi", neden: "saat: durmadan yanıp söner, öteki durum LED'lerinden ayrı dursun" },
  { desen: /VCC|BESLEME|GÜÇ|HAZIR|\bOK\b/i, renk: "yesil", neden: "besleme / her şey yolunda" },
  { desen: /\b(?:A|D|DE|DO|AD|BUS)\d+\b|VERİ|ADRES/i, renk: "sari", neden: "veri ve adres hatlarını izleme" },
];

export function ledRengi(role: string): LedRenk {
  return LED_RENK_KURALLARI.find((k) => k.desen.test(role))?.renk ?? "kirmizi";
}

/**
 * Arka panel pin düzeni (her kartta aynı). 57..61 boş.
 * Tek numaralar bir sırada, çift numaralar karşı sırada.
 */
export const BACKPLANE: Record<number, string> = (() => {
  const m: Record<number, string> = { 1: "GND", 2: "GND", 3: "VCC", 4: "VCC", 5: "CLK", 6: "WR_WIN", 7: "~RESET", 8: "IRQ" };
  for (let i = 0; i < 16; i++) m[9 + i] = `A${i}`;
  for (let i = 0; i < 8; i++) m[25 + i] = `DE${i}`;
  for (let i = 0; i < 8; i++) m[33 + i] = `DO${i}`;
  Object.assign(m, { 41: "~MRD", 42: "~MWE_E", 43: "~MWE_O", 44: "HALTED", 45: "FAULT", 62: "GND", 63: "VCC", 64: "GND" });
  // Faz 6 anakart kartları (docs/anakart.md):
  //   ~WAIT      bellek/önbellek kartı → saat kartı: CPU saatini uzatır (bekleme durumu)
  //   ~IO        bellek kartı: A15..A8 = 0xFF (G/Ç alanı)
  //   TCLK       saat kartı: uzatılmayan 4 MHz zaman tabanı (OSC / 8), bekleme döngüleri dahil her döngüde bir
  //   OSC        saat kartı: tamponlanmış osilatör (CPU saatinin 8 katı)
  //   PA14..PA19 bellek kartı → önbellek kartı: bank register'ından fiziksel adresin üst bitleri
  //   VSYNC_REQ  video kartı → G/Ç kartı: dikey tarama kesme isteği (VSTAT bit1)
  Object.assign(m, { 46: "~WAIT", 47: "~IO", 48: "TCLK", 49: "OSC", 56: "VSYNC_REQ" });
  for (let i = 0; i < 6; i++) m[50 + i] = `PA${14 + i}`;
  return m;
})();
