// VGA ekranının görüntüsü: saf fonksiyonlar (worker'da ve ana iş parçacığında, testlerde).
// Metin kipi (80 × 30, 8 × 16 hücre): VRAM'in karakter + renk şeritleri ve karakter ROM'u →
// 640 × 480 palet indeksi. Görüntü kaynağı bir kez bu biçime (ScreenFrame) çevrilir; kart değişirse
// (ör. piksel tamponu) yalnızca kaynağı (screen-source.ts) değişir, çizim aynı kalır.

import { charToText } from "../../cpu16/video/font";

/** 16 renkli CGA paleti (renk baytı: düşük 4 bit yazı, yüksek 4 bit zemin); src/cpu16/vga.ts ile aynı */
export const PALETTE = [
  0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
  0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
];

export interface ScreenFrame {
  width: number;
  height: number;
  /** satır satır palet indeksi (0..15) */
  pixels: Uint8Array;
  /** ekrandaki metin (metin kipinde satırlar), yoksa boş */
  text: string;
  /** kısa açıklama, ör. "80 × 30 metin · imleç (12, 4)" */
  info: string;
}

export interface TextScreen {
  cols: number;
  rows: number;
  /** hücre başına karakter kodu ve renk baytı */
  chars: ArrayLike<number>;
  attrs: ArrayLike<number>;
  /** karakter ROM'u: adres = kod × 16 + tarama satırı, bit 7 en soldaki piksel */
  font: ArrayLike<number>;
  /** imleç hücresi (görünmüyorsa −1): son iki tarama satırı yazı renginde */
  cursor: number;
}

/** Metin ekranını piksellere çevirir (gerçek kartın piksel yolu ile aynı kural) */
export function renderTextScreen(s: TextScreen, out?: Uint8Array): Uint8Array {
  const w = s.cols * 8;
  const px = out ?? new Uint8Array(w * s.rows * 16);
  for (let cell = 0; cell < s.cols * s.rows; cell++) {
    const ch = s.chars[cell] & 0xff;
    const at = s.attrs[cell] & 0xff;
    const fg = at & 15;
    const bg = at >> 4;
    const x0 = (cell % s.cols) * 8;
    const y0 = Math.floor(cell / s.cols) * 16;
    for (let r = 0; r < 16; r++) {
      const bits = cell === s.cursor && r >= 14 ? 0xff : s.font[ch * 16 + r] & 0xff;
      let p = (y0 + r) * w + x0;
      for (let b = 0x80; b; b >>= 1) px[p++] = bits & b ? fg : bg;
    }
  }
  return px;
}

/** Ekrandaki metin: satır sonundaki boşluklar ve sondaki boş satırlar atılır (0 kodu boşluk) */
export function screenText(chars: ArrayLike<number>, cols: number, rows: number): string {
  const lines: string[] = [];
  for (let r = 0; r < rows; r++) {
    let line = "";
    for (let c = 0; c < cols; c++) line += charToText(chars[r * cols + c] & 0xff);
    lines.push(line.replace(/\s+$/, ""));
  }
  while (lines.length && !lines[lines.length - 1]) lines.pop();
  return lines.join("\n");
}

/** Metin ekranından ScreenFrame */
export function textFrame(s: TextScreen): ScreenFrame {
  const cx = s.cursor >= 0 ? s.cursor % s.cols : -1;
  const cy = s.cursor >= 0 ? Math.floor(s.cursor / s.cols) : -1;
  return {
    width: s.cols * 8,
    height: s.rows * 16,
    pixels: renderTextScreen(s),
    text: screenText(s.chars, s.cols, s.rows),
    info: `${s.cols} × ${s.rows} metin${s.cursor >= 0 ? ` · imleç (${cx}, ${cy})` : ""}`,
  };
}

/** Palet indekslerini RGBA'ya (ImageData) basar */
export function paintFrame(pixels: Uint8Array, rgba: Uint8ClampedArray): void {
  for (let i = 0; i < pixels.length; i++) {
    const c = PALETTE[pixels[i] & 15];
    rgba[4 * i] = c >> 16;
    rgba[4 * i + 1] = (c >> 8) & 0xff;
    rgba[4 * i + 2] = c & 0xff;
    rgba[4 * i + 3] = 255;
  }
}
