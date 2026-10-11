// VGA metin ekranı çizici: VRAM'i karakter ROM'u fontuyla 640×480 tuvale basar.
// Sadece değişen hücreleri yeniden çizer (VRAM'in gölge kopyasıyla karşılaştırır).

import { FONT_8X16 } from "../../cpu16/video/font";
import { TEXT_COLS, TEXT_ROWS, type VideoCard } from "../../cpu16/emu/devices/simple";

/** 16 renkli CGA paleti (renk baytı: düşük 4 bit yazı, yüksek 4 bit zemin). */
export const CGA_PALETTE = [
  0x000000, 0x0000aa, 0x00aa00, 0x00aaaa, 0xaa0000, 0xaa00aa, 0xaa5500, 0xaaaaaa,
  0x555555, 0x5555ff, 0x55ff55, 0x55ffff, 0xff5555, 0xff55ff, 0xffff55, 0xffffff,
];

export const VGA_WIDTH = TEXT_COLS * 8;
export const VGA_HEIGHT = TEXT_ROWS * 16;

export class VgaRenderer {
  private readonly ctx: CanvasRenderingContext2D;
  private readonly image: ImageData;
  private readonly pixels: Uint32Array;
  private readonly abgr: Uint32Array;
  private readonly shadow = new Int16Array(TEXT_COLS * TEXT_ROWS * 2).fill(-1);
  private cursorCell = -1;

  constructor(canvas: HTMLCanvasElement) {
    canvas.width = VGA_WIDTH;
    canvas.height = VGA_HEIGHT;
    this.ctx = canvas.getContext("2d")!;
    this.image = this.ctx.createImageData(VGA_WIDTH, VGA_HEIGHT);
    this.pixels = new Uint32Array(this.image.data.buffer);
    // ImageData bayt sırası R G B A; küçük uçlu Uint32'de 0xAABBGGRR
    this.abgr = Uint32Array.from(CGA_PALETTE, (c) => 0xff000000 | ((c & 0xff) << 16) | (c & 0xff00) | ((c >> 16) & 0xff));
  }

  /** Değişiklik varsa çizer; çizdiyse true. */
  draw(video: VideoCard, force = false): boolean {
    if (!video.dirty && !force) return false;
    video.dirty = false;
    const vram = video.vram;
    const cursor = video.cursorVisible && video.cursorX < TEXT_COLS && video.cursorY < TEXT_ROWS
      ? video.cursorY * TEXT_COLS + video.cursorX : -1;
    let changed = false;
    for (let cell = 0; cell < TEXT_COLS * TEXT_ROWS; cell++) {
      const ch = vram[cell * 2];
      const at = vram[cell * 2 + 1];
      const isCursor = cell === cursor;
      const wasCursor = cell === this.cursorCell;
      if (!force && this.shadow[cell * 2] === ch && this.shadow[cell * 2 + 1] === at && isCursor === wasCursor) continue;
      this.shadow[cell * 2] = ch;
      this.shadow[cell * 2 + 1] = at;
      this.drawCell(cell, ch, at, isCursor);
      changed = true;
    }
    this.cursorCell = cursor;
    if (changed) this.ctx.putImageData(this.image, 0, 0);
    return changed;
  }

  private drawCell(cell: number, ch: number, attr: number, cursor: boolean): void {
    const fg = this.abgr[attr & 15];
    const bg = this.abgr[attr >> 4];
    const x0 = (cell % TEXT_COLS) * 8;
    const y0 = Math.floor(cell / TEXT_COLS) * 16;
    const glyph = ch * 16;
    for (let r = 0; r < 16; r++) {
      // İmleç: son iki tarama satırı (14–15) yazı renginde
      const bits = cursor && r >= 14 ? 0xff : FONT_8X16[glyph + r];
      let p = (y0 + r) * VGA_WIDTH + x0;
      for (let b = 0x80; b; b >>= 1) this.pixels[p++] = bits & b ? fg : bg;
    }
  }
}
