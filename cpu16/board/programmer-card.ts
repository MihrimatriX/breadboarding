// EEPROM programlayıcı kartı (Faz 9): Arduino Nano + 2 × 74HC595 + ZIF soketteki 28C256.
// Arduino'nun yazılımı cpu16/programlayici/ altındadır; testler o yazılımı bu kartın kapı
// seviyesi modeliyle birlikte çalıştırıp imajların doğru yazıldığını doğrular.
// Yazılanlar: BIOS EEPROM'u (bellek kartı) ve video kartının karakter ROM'u; ikisi de 28C256.

import { Board, type ChipInstance } from "./board.ts";

/** Arduino pin numarası (yazılımdaki) → kart neti */
export const ARDUINO_NETS: Record<number, string> = {
  2: "SER", 3: "SRCLK", 4: "RCLK",
  5: "FD0", 6: "FD1", 7: "FD2", 8: "FD3", 9: "FD4", 10: "FD5", 11: "FD6", 12: "FD7",
  15: "~FOE", 16: "~FWE", 17: "~FCE",
};

export interface ProgrammerCard {
  board: Board;
  /** ZIF soketteki 28C256 */
  flash: ChipInstance;
}

export function buildProgrammerBoard(): ProgrammerCard {
  const b = new Board();
  b.card = "prog";
  b.block = "Programlayıcı";
  const nano: Record<string, string> = { "4": "GND", "29": "GND", "27": "VCC" };
  const nanoPin: Record<string, number> = {
    D2: 5, D3: 6, D4: 7, D5: 8, D6: 9, D7: 10, D8: 11, D9: 12, D10: 13, D11: 14, D12: 15, A0: 19, A1: 20, A2: 21, A3: 22,
  };
  const label = (pin: number) => (pin >= 14 ? `A${pin - 14}` : `D${pin}`);
  for (const [pin, net] of Object.entries(ARDUINO_NETS)) nano[String(nanoPin[label(+pin)])] = net;
  b.passive("ARDUINO_NANO", nano, "Arduino Nano (USB seri, programlayıcı yazılımı)");

  const lo: Record<string, string> = { DS: "SER", SHCP: "SRCLK", STCP: "RCLK", "~MR": "VCC", "~OE": "GND", Q7S: "SER2" };
  const hi: Record<string, string> = { DS: "SER2", SHCP: "SRCLK", STCP: "RCLK", "~MR": "VCC", "~OE": "GND" };
  for (let i = 0; i < 8; i++) {
    lo[`Q${i}`] = `FA${i}`;
    if (i < 7) hi[`Q${i}`] = `FA${i + 8}`; // Q7 (A15) boş: 28C256'da 15 adres biti var
  }
  b.place("74HC595", lo, "adres A0..A7 (kaydırmalı register)");
  b.place("74HC595", hi, "adres A8..A14 (zincirin ikincisi)");
  const conn: Record<string, string> = { "~CE": "~FCE", "~OE": "~FOE", "~WE": "~FWE" };
  for (let i = 0; i < 15; i++) conn[`A${i}`] = `FA${i}`;
  for (let i = 0; i < 8; i++) conn[`IO${i}`] = `FD${i}`;
  const flash = b.place("28C256", conn, "programlanan EEPROM (ZIF-28 soket)", { footprint: "Package_DIP:DIP-28_W15.24mm_Socket" });
  b.finish({ backplane: false });
  return { board: b, flash };
}
