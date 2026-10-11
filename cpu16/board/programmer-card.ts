// Flash programlayıcı kartı (Faz 9): Arduino Nano + 2 × 74HC595 + ZIF soketteki SST39SF010A.
// Arduino'nun yazılımı cpu16/programlayici/ altındadır; testler o yazılımı bu kartın kapı
// seviyesi modeliyle birlikte çalıştırıp ROM imajlarının doğru yazıldığını doğrular.

import { Board, type ChipInstance } from "./board.ts";

/** Arduino pin numarası (yazılımdaki) → kart neti */
export const ARDUINO_NETS: Record<number, string> = {
  2: "SER", 3: "SRCLK", 4: "RCLK",
  5: "FD0", 6: "FD1", 7: "FD2", 8: "FD3", 9: "FD4", 10: "FD5", 11: "FD6", 12: "FD7",
  14: "FA16", 15: "~FOE", 16: "~FWE", 17: "~FCE",
};

export interface ProgrammerCard {
  board: Board;
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
    hi[`Q${i}`] = `FA${i + 8}`;
  }
  b.place("74HC595", lo, "adres A0..A7 (kaydırmalı register)");
  b.place("74HC595", hi, "adres A8..A15 (zincirin ikincisi)");
  const conn: Record<string, string> = { "~CE": "~FCE", "~OE": "~FOE", "~WE": "~FWE" };
  for (let i = 0; i < 17; i++) conn[`A${i}`] = `FA${i}`;
  for (let i = 0; i < 8; i++) conn[`DQ${i}`] = `FD${i}`;
  const flash = b.place("SST39SF010A", conn, "programlanan Flash (ZIF soket)", { footprint: "Package_DIP:DIP-32_W15.24mm_Socket" });
  b.finish({ backplane: false });
  return { board: b, flash };
}
