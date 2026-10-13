// Kart ve blok adlarının İngilizcesi. Adlar kart tanımlarından (cpu16/board/*.ts, hesap8/kart.ts)
// Türkçe gelir ve belge üreteçleri onları kullanır; arayüz İngilizcedeyken 3D sahnedeki başlıklar,
// yan panel ve hesap paneli bu tablodan okur. Tabloda olmayan blok adı olduğu gibi kalır (yeni bir
// blok eklenince buraya da eklenir; testi cpu16/tests/view.test.ts).

import type { Dil } from "../ui/ceviri";

/** Kartın İngilizce adı (kartın kısa adıyla: cpu, clk, …); tabloda yoksa "<Ad> board" */
const KART_EN: Record<string, string> = {
  cpu: "CPU board", mem: "Test memory board", clk: "Clock and reset board", bellek: "Memory board", onbellek: "Cache board",
  gc: "I/O board", video: "Video board", kyb: "DIY memory board", prog: "Programmer board",
  hesap: "8-bit calculator",
};

/** Kartın başlığı seçili dilde: Türkçede yerleşimdeki başlık, İngilizcede tablodaki ad */
export function kartBasligi(kart: string, turkce: string, dil: Dil = "tr"): string {
  if (dil === "tr") return turkce;
  return KART_EN[kart] ?? `${kart.charAt(0).toUpperCase()}${kart.slice(1)} board`;
}

export const BLOK_EN: Record<string, string> = {
  // CPU16
  "Kontrol birimi": "Control unit",
  "Kontrol": "Control",
  "Register dosyası": "Register file",
  "Geçici register'lar": "Temporary registers",
  "MAR ve IR": "MAR and IR",
  "Program sayacı": "Program counter",
  "Sabit birimi": "Constant unit",
  "ALU": "ALU",
  "ALU kod çözücü": "ALU decoder",
  "Bayraklar ve koşul": "Flags and condition",
  "Bellek arayüzü": "Memory interface",
  "Yapıştırıcı lojik": "Glue logic",
  "Besleme ve arka panel": "Power and backplane",
  "Osilatör ve reset": "Oscillator and reset",
  "Saat üretimi": "Clock generation",
  "Bekleme durumu": "Wait state",
  "Saat dağıtımı": "Clock distribution",
  "Adres çözme": "Address decoding",
  "Bank register'ları": "Bank registers",
  "Bayt sıralayıcı": "Byte sequencer",
  "EEPROM ve RAM": "EEPROM and RAM",
  "Veri yolu": "Data bus",
  "G/Ç çözme": "I/O decoding",
  "Bekleme ve sıralama": "Wait and sequencing",
  "Etiket belleği": "Tag memory",
  "Veri belleği": "Data memory",
  "Sayaçlar": "Counters",
  "Okuma yan etkileri": "Read side effects",
  "Sinyal düzeltme": "Signal conditioning",
  "UART verici": "UART transmitter",
  "UART alıcı": "UART receiver",
  "PS/2 klavye": "PS/2 keyboard",
  "Zamanlayıcı": "Timer",
  "Kesme denetleyicisi": "Interrupt controller",
  "Durum register'ları": "Status registers",
  "UART konnektörü": "UART connector",
  "Piksel saati ve sayaçlar": "Pixel clock and counters",
  "Çözümleme": "Decoding",
  "Dikey tarama durumu": "Vertical scan state",
  "Tarama adresi": "Scan address",
  "VRAM": "VRAM",
  "Piksel yolu": "Pixel path",
  "Renk ve DAC": "Color and DAC",
  "CPU arayüzü": "CPU interface",
  "İmleç": "Cursor",
  "Veriyolu tamponu": "Bus buffer",
  "Bellek hücreleri": "Memory cells",
  // hesap makinesi
  "Anahtarlar": "Switches",
  "Toplama ve çıkarma": "Add and subtract",
  "Çarpma": "Multiply",
  "Bölme": "Divide",
  "Sonuç seçici": "Result selector",
  "Onluğa çevirme: A": "Decimal conversion: A",
  "Onluğa çevirme: B": "Decimal conversion: B",
  "Onluğa çevirme: sonuç": "Decimal conversion: result",
  "Onluğa çevirme: kalan": "Decimal conversion: remainder",
  "Gösterge: A": "Display: A",
  "Gösterge: B": "Display: B",
  "Gösterge: Sonuç": "Display: Result",
  "Gösterge: Kalan": "Display: Remainder",
};

/** Blok adı seçili dilde */
export const blokAdi = (ad: string, dil: Dil = "tr"): string => (dil === "en" ? BLOK_EN[ad] ?? ad : ad);

/**
 * Çip ve pasif başlıklarının İngilizcesi, parça numarasıyla (cpu16/chips/parts/*.ts, cpu16/board/passives.ts;
 * Türkçeleri KiCad sembolüne ve BOM'a da gider). Yeni parça eklenince buraya da eklenir (testi view.test).
 */
export const PARCA_EN: Record<string, string> = {
  "28C256": "32 KB parallel EEPROM (32K × 8, 5 V, byte/page write; same pinout as the 62256)",
  "62256": "32 KB static RAM (32K × 8)",
  "74HC00": "Quad 2-input NAND",
  "74HC02": "Quad 2-input NOR",
  "74HC04": "Hex inverter (NOT)",
  "74HC05": "Hex inverter, open-drain outputs",
  "74HC08": "Quad 2-input AND",
  "74HC10": "Triple 3-input NAND",
  "74HC11": "Triple 3-input AND",
  "74HC125": "Quad tri-state buffer (active-low OE)",
  "74HC138": "3-to-8 decoder (active-low outputs)",
  "74HC139": "Dual 2-to-4 decoder",
  "74HC14": "Hex Schmitt-trigger inverter",
  "74HC151": "8-to-1 multiplexer",
  "74HC153": "Dual 4-to-1 multiplexer",
  "74HC157": "Quad 2-to-1 multiplexer",
  "74HC161": "4-bit synchronous binary counter (asynchronous reset)",
  "74HC165": "8-bit parallel-in / serial-out shift register",
  "74HC166": "8-bit parallel-in / serial-out shift register (synchronous load)",
  "74HC175": "Quad D flip-flop (common clock, asynchronous reset)",
  "74HC20": "Dual 4-input NAND",
  "74HC21": "Dual 4-input AND",
  "74HC245": "8-bit bidirectional bus transceiver",
  "74HC27": "Triple 3-input NOR",
  "74HC273": "8-bit D flip-flop register (common asynchronous reset)",
  "74HC283": "4-bit binary full adder (carry lookahead)",
  "74HC30": "8-input NAND",
  "74HC32": "Quad 2-input OR",
  "74HC393": "Dual 4-bit ripple binary counter (falling edge, asynchronous clear)",
  "74HC4511": "BCD to 7-segment decoder / driver (latched, common cathode)",
  "74HC541": "8-bit tri-state buffer (two active-low OE)",
  "74HC573": "8-bit transparent latch (tri-state outputs)",
  "74HC574": "8-bit D flip-flop register (tri-state outputs)",
  "74HC595": "8-bit serial-in / parallel-out shift register (output latch)",
  "74HC688": "8-bit equality comparator",
  "74HC74": "Dual D flip-flop (asynchronous preset and clear)",
  "74HC86": "Quad 2-input XOR",
  SST39SF010A: "128 KB flash (128K × 8, 5 V, command programmed)",
  ARDUINO_NANO: "Arduino Nano (ATmega328P, USB serial)",
  BACKPLANE_2x32: "Backplane connector 2 × 32 (2.54 mm)",
  CONN_5V: "5 V power input (2-pin header: 1 = +5 V, 2 = GND)",
  CONN_CH340: "CH340 USB-UART module socket (6-pin, FTDI layout)",
  CONN_PS2: "PS/2 keyboard connector (6-pin mini-DIN, female)",
  CONN_VGA: "VGA connector (DE-15 HD, female)",
  C_100N: "100 nF ceramic capacitor (decoupling)",
  C_100U: "100 µF electrolytic capacitor (board input)",
  C_10U: "10 µF electrolytic capacitor",
  C_1U: "1 µF capacitor",
  DISP_7SEG_CC: '7-segment display, 0.56" single digit, common cathode (e.g. 5161AS)',
  DISP_BAR_10: "10-segment LED bar graph (DIP-20, e.g. Kingbright DC-10YWA, Broadcom HDSP-4840)",
  LED: "3 mm LED",
  OSC_25M175: "25.175 MHz crystal oscillator module (DIP-14 package, 5 V)",
  OSC_CAN: "Crystal oscillator module (DIP-14 package, 5 V)",
  POT_100K: "100 kΩ trimmer",
  RN_10K_8: "8 × 10 kΩ resistor network (SIP-9, common pin)",
  RN_1K_ISO_8: "8 × 1 kΩ isolated resistor network (DIP-16, e.g. 4116R-1-102)",
  RN_470_ISO_8: "8 × 470 Ω isolated resistor network (DIP-16, e.g. 4116R-1-471)",
  R_10K: "10 kΩ resistor",
  R_1K: "1 kΩ resistor",
  R_1K3: "1.3 kΩ resistor",
  R_330: "330 Ω resistor (LED current)",
  R_680: "680 Ω resistor",
  SW_DIP_2: "2-position DIP switch (SPST, slide, DIP-4)",
  SW_DIP_8: "8-position DIP switch (SPST, slide, DIP-16)",
  SW_PUSH: "Push button (6 mm)",
  SW_SPDT: "Slide switch (single pole, 2 positions)",
};

/** Çipin ya da pasifin başlığı seçili dilde; tabloda yoksa Türkçesi */
export const parcaBasligi = (part: string, turkce: string, dil: Dil = "tr"): string => (dil === "en" ? PARCA_EN[part] ?? turkce : turkce);
