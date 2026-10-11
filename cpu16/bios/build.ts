// BIOS imajı üretimi: bios.s → 16 KB'lık bank 0 ve 128 KB'lık Flash imajı.
// Tarayıcı (Web IDE) ve Node (CLI, testler) aynı kodu kullanır; kaynağı okumak çağırana kalır.

import { assemble, type AsmResult } from "../asm/assembler.ts";
import { FLASH_SIZE } from "../emu/devices/flash.ts";

/** Atlama tablosu (bios.md): her yuva 8 bayt, LI r3, adres + JALR lr, r3, 0 ile çağrılır. */
export const BIOS = {
  MONITOR: 0x0010,
  PUTC: 0x0018,
  GETC: 0x0020,
  TRYGETC: 0x0028,
  PUTS: 0x0030,
  PUTHEX4: 0x0038,
  PUTHEX2: 0x0040,
  GETLINE: 0x0048,
  NEWLINE: 0x0050,
  CLS: 0x0058,
  SETCURSOR: 0x0060,
  SETATTR: 0x0068,
  TICKS: 0x0070,
  UART_PUTC: 0x0078,
  UART_GETC: 0x0080,
  VGA_PUTC: 0x0088,
  SETIRQHOOK: 0x0090,
} as const;

export const BIOS_BANK_SIZE = 0x4000;

export interface BiosBuild {
  /** Bank 0 imajı (16 KB, kullanılmayan baytlar 0xFF). */
  bank0: Uint8Array;
  /** Bütün Flash imajı (128 KB, BIOS ilk 16 KB'ta, gerisi silinmiş: 0xFF). */
  flash: Uint8Array;
  /** BIOS'un kapladığı bayt. */
  size: number;
  asm: AsmResult;
}

export function buildBios(source: string): BiosBuild {
  const asm = assemble(source);
  if (asm.errors.length) {
    throw new Error("BIOS derlenemedi:\n" + asm.errors.map((e) => `bios.s:${e.line}: ${e.message}`).join("\n"));
  }
  const end = Math.max(...asm.ranges.map(([, e]) => e));
  if (end > BIOS_BANK_SIZE) throw new Error(`BIOS bank 0'a sığmıyor: ${end} bayt`);
  const bank0 = new Uint8Array(BIOS_BANK_SIZE).fill(0xff);
  for (const [s, e] of asm.ranges) bank0.set(asm.image.subarray(s, e), s);
  const flash = new Uint8Array(FLASH_SIZE).fill(0xff);
  flash.set(bank0, 0);
  const size = asm.ranges.reduce((n, [s, e]) => n + e - s, 0);
  return { bank0, flash, size, asm };
}
