// Kartların fiziksel yerleşimi (mm): 3D görünüm bunu çizer. Çipler işlev bloklarına göre
// gruplanır, her blok kendi içinde satır satır dizilir, bloklar kartın üzerine raf raf yerleşir.
// Koordinatlar PCB'ye üstten bakıştır: x sağa, y aşağı; çipin 1. pini sol alttadır (çentik solda).

import type { Board, ChipInstance } from "./board.ts";

const PITCH = 2.54;

export interface PinPlace {
  num: number;
  name: string;
  /** Bağlı net (besleme pinleri GND/VCC netine, bağlantısız pinler -1) */
  net: number;
  x: number;
  y: number;
}

export interface ChipPlace {
  ref: string;
  part: string;
  card: string;
  block: string;
  role: string;
  /** gövdenin sol üst köşesi */
  x: number;
  y: number;
  /** gövde boyu (x) ve eni (y) */
  w: number;
  h: number;
  pins: PinPlace[];
}

export interface BlockPlace {
  card: string;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface CardPlace {
  name: string;
  title: string;
  x: number;
  y: number;
  w: number;
  h: number;
  /** kenar konnektörünün (arka panel) orta noktası, alt kenarda */
  connectorX: number;
}

export interface BoardLayout {
  cards: CardPlace[];
  blocks: BlockPlace[];
  chips: ChipPlace[];
  /** toplam alan (arka panel dahil) */
  width: number;
  height: number;
}

const CARD_TITLES: Record<string, string> = { cpu: "CPU kartı", mem: "Test bellek kartı" };

/** Çip kılıf ölçüleri: DIP-n, dar (7,62 mm) ya da geniş (15,24 mm) */
export function packageSize(ci: Pick<ChipInstance, "def">): { w: number; h: number; row: number } {
  const n = ci.def.pins.length;
  const row = ci.def.footprint.includes("W15.24") ? 15.24 : 7.62;
  return { w: (n / 2) * PITCH + 1.2, h: row - 1.6, row };
}

/** DIP pin konumu: 1..n/2 alt sırada soldan sağa, n/2+1..n üst sırada sağdan sola */
function pinPositions(ci: ChipInstance, x: number, y: number, w: number, h: number, row: number): PinPlace[] {
  const n = ci.def.pins.length;
  const half = n / 2;
  const x0 = x + (w - (half - 1) * PITCH) / 2;
  const cy = y + h / 2;
  return ci.def.pins.map((p) => {
    const i = p.num - 1;
    const bottom = i < half;
    const col = bottom ? i : n - 1 - i;
    return {
      num: p.num,
      name: p.name,
      net: ci.nets[p.name] ?? -1,
      x: x0 + col * PITCH,
      y: cy + (bottom ? row / 2 : -row / 2),
    };
  });
}

export interface LayoutOptions {
  /** kart iç genişliği (mm) */
  cardWidth?: Record<string, number>;
  /** blok başına en fazla çip sütunu */
  maxCols?: number;
}

export function boardLayout(board: Board, o: LayoutOptions = {}): BoardLayout {
  const cardWidth = { cpu: 420, mem: 120, ...o.cardWidth };
  const maxCols = o.maxCols ?? 8;
  const margin = 8;
  const gapX = 4;
  const gapY = 4.5;
  const titleH = 6;
  const cards: CardPlace[] = [];
  const blocks: BlockPlace[] = [];
  const chips: ChipPlace[] = [];

  const cardNames = [...new Set(board.chips.map((c) => c.card))];
  let cardX = 0;
  let maxH = 0;
  for (const card of cardNames) {
    const inCard = board.chips.filter((c) => c.card === card);
    const blockNames = [...new Set(inCard.map((c) => c.block || "Diğer"))];
    const innerW = cardWidth[card as keyof typeof cardWidth] ?? 200;
    // raf yerleşimi: bloklar soldan sağa, sığmazsa alt rafa
    let bx = margin;
    let by = margin + 8; // kart başlığı
    let shelfH = 0;
    for (const name of blockNames) {
      const list = inCard.filter((c) => (c.block || "Diğer") === name);
      const sizes = list.map(packageSize);
      const cellW = Math.max(...sizes.map((s) => s.w)) + gapX;
      const cellH = Math.max(...sizes.map((s) => s.row)) + gapY;
      const cols = Math.min(maxCols, list.length, Math.max(1, Math.floor((innerW - 4) / cellW)));
      const rows = Math.ceil(list.length / cols);
      const w = cols * cellW + 4;
      const h = titleH + rows * cellH + 2;
      if (bx + w > margin + innerW) {
        bx = margin;
        by += shelfH + 5;
        shelfH = 0;
      }
      blocks.push({ card, name, x: cardX + bx, y: by, w, h });
      list.forEach((ci, k) => {
        const s = sizes[k];
        const x = cardX + bx + 2 + (k % cols) * cellW + (cellW - gapX - s.w) / 2;
        const y = by + titleH + Math.floor(k / cols) * cellH + (cellH - gapY - s.h) / 2;
        chips.push({
          ref: ci.ref, part: ci.def.part, card, block: name, role: ci.role,
          x, y, w: s.w, h: s.h, pins: pinPositions(ci, x, y, s.w, s.h, s.row),
        });
      });
      bx += w + 5;
      shelfH = Math.max(shelfH, h);
    }
    const h = by + shelfH + margin + 10; // alt kenarda konnektör payı
    const w = innerW + 2 * margin;
    cards.push({ name: card, title: CARD_TITLES[card] ?? card, x: cardX, y: 0, w, h, connectorX: cardX + w / 2 });
    maxH = Math.max(maxH, h);
    cardX += w + 20;
  }
  return { cards, blocks, chips, width: cardX - 20, height: maxH + 30 };
}
