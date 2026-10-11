// Ekran kaynağı (worker'da): kapı seviyesi kartın kendi bellek çiplerinden görüntü. Bugün video
// kartı 80 × 30 metin kartıdır: VRAM'in karakter ve renk şeritleri (iki SRAM) ve karakter ROM'u.
// Kart değişirse yalnızca bu dosya değişir; worker ve çizim ScreenFrame ile konuşur.

import type { ChipInstance } from "../../cpu16/board/board";
import type { GateMachine } from "../../cpu16/board/machine-board";
import { L1 } from "../../cpu16/chips/logic";
import type { MemoryHandle } from "../../cpu16/chips/parts/memory";
import { FONT_8X16 } from "../../cpu16/video/font";
import { textFrame, type ScreenFrame } from "./screen";

export interface ScreenSource {
  /** Şu anki görüntü */
  frame(): ScreenFrame;
  /** Görüntü değişmiş olabilir mi (ucuz parmak izi) */
  stamp(): number;
}

interface TextVideoCard {
  vramChar: ChipInstance;
  vramAttr: ChipInstance;
  fontRom: ChipInstance;
}

const isTextVideoCard = (x: unknown): x is TextVideoCard =>
  !!x && typeof x === "object" && "vramChar" in x && "vramAttr" in x && "fontRom" in x;

const data = (ci: ChipInstance) => (ci.handle as MemoryHandle).data;

/**
 * Takılı kartlardan ekran kaynağını bulur ve karakter ROM'unu programlar (programlayıcıyla
 * yazılmış gibi). Video kartı yoksa null.
 */
export function findScreenSource(g: GateMachine): ScreenSource | null {
  const card = g.extras.find(isTextVideoCard);
  if (!card) return null;
  const font = data(card.fontRom);
  font.set(FONT_8X16.subarray(0, Math.min(FONT_8X16.length, font.length)));
  const chars = data(card.vramChar);
  const attrs = data(card.vramAttr);
  const cols = 80;
  const rows = 30;
  const b = g.board;
  // imleç: VCTRL biti, CURSOR_X/Y register'ları ve kare sayacının yanıp sönme biti (kartın netleri)
  const net = (name: string) => (b.has(name) ? b.n(name) : -1);
  const ctl = net("V_VCTL");
  const blink = net("V_BLINK");
  const cx = Array.from({ length: 8 }, (_, i) => net(`V_CX${i}`));
  const cy = Array.from({ length: 8 }, (_, i) => net(`V_CY${i}`));
  const reg = (nets: number[]) => (nets.some((n) => n < 0) ? -1 : nets.reduce((v, n, i) => v | ((g.sim.get(n) === L1 ? 1 : 0) << i), 0));
  const cursor = () => {
    if (ctl < 0 || g.sim.get(ctl) !== L1 || (blink >= 0 && g.sim.get(blink) === L1)) return -1;
    const x = reg(cx);
    const y = reg(cy);
    return x >= 0 && y >= 0 && x < cols && y < rows ? y * cols + x : -1;
  };
  return {
    frame: () => textFrame({ cols, rows, chars, attrs, font, cursor: cursor() }),
    stamp() {
      let h = cursor() + 7;
      for (let i = 0; i < cols * rows; i++) h = (Math.imul(h, 31) + chars[i] * 257 + attrs[i]) | 0;
      return h;
    },
  };
}
