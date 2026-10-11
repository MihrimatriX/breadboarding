// Program düzenleyicisi: dil tanıma (assembly / C), derleme (as16 / cc16 "rom" hedefi) ve
// Flash bank 0 imajı. machine-cli.ts'deki romImage() ile aynı imaj, ama dosya sistemi olmadan
// (tarayıcıda çalışır).

import { assemble } from "../../cpu16/asm/assembler";
import { buildProgram, type LibSources } from "../../cpu16/cc/index";
import { dilBul, type Dil } from "../cpu16/dil";

export type Lang = Dil;

/** Flash çipinin boyu (SST39SF010A: 128 KB) ve bank 0'ın sonu (CPU adresi 0x0000–0x3FFF) */
export const FLASH_SIZE = 0x20000;
export const BANK0_END = 0x4000;

/** Kaynağın dili: Web IDE ile aynı tanıma (src/cpu16/dil.ts); ipucu yoksa assembly */
export function detectLanguage(src: string): Lang {
  return dilBul(src) ?? "asm";
}

/**
 * Bellek imajının bayt aralıklarından 128 KB Flash imajı (program bank 0'da). Boş yerler 0xFF
 * (silinmiş Flash). Bank 0 dışına taşan aralık hata verir.
 */
export function flashImage(image: Uint8Array, ranges: readonly [number, number][], size = FLASH_SIZE): Uint8Array {
  const img = new Uint8Array(size).fill(0xff);
  for (const [s, e] of ranges) {
    if (e > BANK0_END) throw new Error(`program 0x${s.toString(16)}–0x${(e - 1).toString(16)} bank 0'a (0x0000–0x3FFF) sığmıyor`);
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
  /** 128 KB Flash imajı (hata varsa null) */
  flash: Uint8Array | null;
  errors: ProgramError[];
  /** özet, ör. "C · 1 234 bayt kod, 56 bayt veri" */
  info: string;
}

/** Kullanıcının C dosyasının adı (hata satırları bu dosyaya göre) */
export const C_FILE = "program.c";

/** Kaynağı derler ve Flash imajını üretir. lib: cc16 çalışma zamanı kütüphanesi (C için) */
export function compileProgram(src: string, lang: Lang, lib: LibSources): CompileOutput {
  try {
    if (lang === "asm") {
      const r = assemble(src);
      if (r.errors.length) return { lang, flash: null, errors: r.errors.map((e) => ({ line: e.line, message: e.message })), info: "" };
      const bytes = r.ranges.reduce((s, [a, b]) => s + b - a, 0);
      return { lang, flash: flashImage(r.image, r.ranges), errors: [], info: `assembly · ${bytes.toLocaleString("tr-TR")} bayt` };
    }
    const b = buildProgram({ [C_FILE]: src }, [C_FILE], { lib, target: "rom" });
    if (b.errors.length) {
      return {
        lang, flash: null, info: "",
        errors: b.errors.map((e) => ({ line: e.file === C_FILE ? e.line : 0, message: e.col ? `${e.col}. sütun: ${e.message}` : e.message, file: e.file === C_FILE ? undefined : e.file })),
      };
    }
    return {
      lang, flash: flashImage(b.image, b.ranges), errors: [],
      info: `C · ${b.romSize.toLocaleString("tr-TR")} bayt kod (ROM), ${b.ramSize.toLocaleString("tr-TR")} bayt veri (RAM)`,
    };
  } catch (e) {
    return { lang, flash: null, errors: [{ line: 0, message: String((e as Error).message ?? e) }], info: "" };
  }
}
