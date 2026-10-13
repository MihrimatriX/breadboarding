// Program düzenleyicisi: dil tanıma (assembly / C), derleme (as16 / cc16 "rom" hedefi) ve
// EEPROM bank 0 imajı. machine-cli.ts'deki romImage() ile aynı imaj, ama dosya sistemi olmadan
// (tarayıcıda çalışır).

import { assemble } from "../../cpu16/asm/assembler";
import { buildProgram, type LibSources } from "../../cpu16/cc/index";
import { EEPROM_SIZE } from "../../cpu16/emu/devices/eeprom";
import { dilBul, type Dil as KaynakDili } from "../cpu16/dil";
import type { Dil } from "../ui/ceviri";
import { sayi } from "./levels";

export type Lang = KaynakDili;

/** EEPROM çipinin boyu (28C256: 32 KB) ve bank 0'ın sonu (CPU adresi 0x0000–0x3FFF) */
export const FLASH_SIZE = EEPROM_SIZE;
export const BANK0_END = 0x4000;

/** Kaynağın dili: Web IDE ile aynı tanıma (src/cpu16/dil.ts); ipucu yoksa assembly */
export function detectLanguage(src: string): Lang {
  return dilBul(src) ?? "asm";
}

/**
 * Bellek imajının bayt aralıklarından 32 KB EEPROM imajı (program bank 0'da). Boş yerler 0xFF
 * (silinmiş EEPROM). Bank 0 dışına taşan aralık hata verir.
 */
export function flashImage(image: Uint8Array, ranges: readonly [number, number][], size = FLASH_SIZE, dil: Dil = "tr"): Uint8Array {
  const img = new Uint8Array(size).fill(0xff);
  for (const [s, e] of ranges) {
    const aralik = `0x${s.toString(16)}–0x${(e - 1).toString(16)}`;
    if (e > BANK0_END) {
      throw new Error(dil === "en" ? `program ${aralik} does not fit in bank 0 (0x0000–0x3FFF)` : `program ${aralik} bank 0'a (0x0000–0x3FFF) sığmıyor`);
    }
    img.set(image.subarray(s, e), s);
  }
  return img;
}

export interface ProgramError {
  line: number;
  message: string;
  /** hatanın dosyası (kullanıcı dosyası dışındaysa, ör. kütüphane) */
  file?: string;
}

export interface CompileOutput {
  lang: Lang;
  /** 32 KB EEPROM imajı (hata varsa null) */
  flash: Uint8Array | null;
  errors: ProgramError[];
  /** özet, ör. "C · 1 234 bayt kod, 56 bayt veri" */
  info: string;
}

/** Kullanıcının C dosyasının adı (hata satırları bu dosyaya göre) */
export const C_FILE = "program.c";

/**
 * Kaynağı derler ve EEPROM imajını üretir. lib: cc16 çalışma zamanı kütüphanesi (C için); dil: özetin
 * ve sütun bilgisinin dili (derleyicinin kendi hata iletileri Türkçe kalır)
 */
export function compileProgram(src: string, lang: Lang, lib: LibSources, dil: Dil = "tr"): CompileOutput {
  const en = dil === "en";
  try {
    if (lang === "asm") {
      const r = assemble(src);
      if (r.errors.length) return { lang, flash: null, errors: r.errors.map((e) => ({ line: e.line, message: e.message })), info: "" };
      const bytes = sayi(r.ranges.reduce((s, [a, b]) => s + b - a, 0), dil);
      return { lang, flash: flashImage(r.image, r.ranges, FLASH_SIZE, dil), errors: [], info: `assembly · ${bytes} ${en ? "bytes" : "bayt"}` };
    }
    const b = buildProgram({ [C_FILE]: src }, [C_FILE], { lib, target: "rom" });
    if (b.errors.length) {
      const sutun = (c: number) => (en ? `column ${c}: ` : `${c}. sütun: `);
      return {
        lang, flash: null, info: "",
        errors: b.errors.map((e) => ({ line: e.file === C_FILE ? e.line : 0, message: e.col ? `${sutun(e.col)}${e.message}` : e.message, file: e.file === C_FILE ? undefined : e.file })),
      };
    }
    const rom = sayi(b.romSize, dil);
    const ram = sayi(b.ramSize, dil);
    return {
      lang, flash: flashImage(b.image, b.ranges, FLASH_SIZE, dil), errors: [],
      info: en ? `C · ${rom} bytes of code (ROM), ${ram} bytes of data (RAM)` : `C · ${rom} bayt kod (ROM), ${ram} bayt veri (RAM)`,
    };
  } catch (e) {
    return { lang, flash: null, errors: [{ line: 0, message: String((e as Error).message ?? e) }], info: "" };
  }
}
