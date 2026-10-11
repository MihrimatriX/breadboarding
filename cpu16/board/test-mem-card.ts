// Faz 4 test bellek kartı: 64 KB düz RAM (2 × 62256, çift/tek bayt) + 0xFF00'da UART çıkış mandalı.
// Emülatörün SimpleBus'ıyla birebir aynı davranır; asıl anakart bellek kartı (bank'lı ROM/RAM,
// G/Ç) Faz 6'da bunun yerini alır.

import type { Board, ChipInstance } from "./board.ts";

export interface TestMemCard {
  ramEven: ChipInstance;
  ramOdd: ChipInstance;
  uart: ChipInstance;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function buildTestMemCard(b: Board): TestMemCard {
  b.card = "mem";
  const ram = (lane: "DE" | "DO", we: string, role: string) => {
    const conn: Record<string, number | string> = { "~CE": "GND", "~OE": "~MRD", "~WE": we };
    range(15).forEach((i) => (conn[`A${i}`] = `A${i + 1}`));
    range(8).forEach((i) => (conn[`IO${i}`] = `${lane}${i}`));
    return b.place("62256", conn, role);
  };
  // UART adresi: A[15:1] = 0x7F80 (0xFF00/0xFF01 kelimesi), yalnızca çift bayt
  const lo: Record<string, number | string> = { "~E": "GND", "~EQ": "~UA_LO" };
  const hi: Record<string, number | string> = { "~E": "GND", "~EQ": "~UA_HI" };
  range(8).forEach((i) => {
    lo[`P${i}`] = `A${i + 1}`;
    lo[`Q${i}`] = i === 7 ? "VCC" : "GND";
    hi[`P${i}`] = i < 7 ? `A${i + 9}` : "GND";
    hi[`Q${i}`] = i < 7 ? "VCC" : "GND";
  });
  b.place("74HC688", lo, "UART adres karşılaştırıcı (A1..A8)");
  b.place("74HC688", hi, "UART adres karşılaştırıcı (A9..A15)");
  const nSel = b.or("~UA_LO", "~UA_HI", "~UART_SEL", "UART seçimi");
  const sel = b.not(nSel, "UART_SEL", "UART seçimi");
  b.or("~MWE_E", sel, "~WE_RAM_E", "UART adresine RAM yazılmaz");
  const ramEven = ram("DE", "~WE_RAM_E", "RAM çift baytlar");
  const ramOdd = ram("DO", "~MWE_O", "RAM tek baytlar");
  const conn: Record<string, number | string> = { "~OE": "GND", CP: b.or("~MWE_E", nSel, "UART_CP", "UART yazma kenarı") };
  range(8).forEach((i) => {
    conn[`D${i}`] = `DE${i}`;
    conn[`Q${i}`] = `TX${i}`;
  });
  const uart = b.place("74HC574", conn, "UART çıkış mandalı (0xFF00)");
  return { ramEven, ramOdd, uart };
}
