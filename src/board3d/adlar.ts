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
