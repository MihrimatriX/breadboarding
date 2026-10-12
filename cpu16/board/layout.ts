// Kartların fiziksel yerleşimi (mm): 3D görünüm bunu çizer. Çipler işlev bloklarına göre
// gruplanır, her blok kendi içinde satır satır dizilir, bloklar kartın üzerine raf raf yerleşir.
// Pasif elemanlar (dirençler, kondansatörler, LED'ler, konnektörler) da yerleşir: dekuplaj
// kondansatörü kendi çipinin yanına, arka panel konnektörü kartın alt kenarına, kalanlar bloklarının
// altındaki şeride. Kartlar soldan sağa dizilir, sıra dolunca alt sıraya geçilir; her sıranın altında
// arka panel şeridi vardır.
// Koordinatlar PCB'ye üstten bakıştır: x sağa, y aşağı; çipin 1. pini sol alttadır (çentik solda).
// Hiçbir kart, çip ya da pasif adı burada sabit değildir: yeni kartlar ve elemanlar kendiliğinden yerleşir.

import type { Board, ChipInstance, Passive } from "./board.ts";
import { PASSIVES, ledRengi, type LedRenk } from "./passives.ts";

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

/** Pasif elemanın biçimi (3D gövdesi buna göre çizilir) */
export type PassiveKind =
  | "direnc" | "kondansator" | "elektrolitik" | "led" | "dizi" | "konnektor" | "osilator" | "buton" | "anahtar" | "pot" | "modul"
  // 8 bit hesap makinesi: DIP anahtar, 7 segment gösterge, DIP-16 direnç dizisi
  | "dip" | "gosterge" | "dipdizi";

export interface PassivePlace {
  ref: string;
  part: string;
  card: string;
  block: string;
  role: string;
  kind: PassiveKind;
  /** kaplama dikdörtgeni (gövde + pinler), sol üst köşe */
  x: number;
  y: number;
  w: number;
  h: number;
  /** gövdenin karttan yüksekliği (mm) */
  height: number;
  /** dikey mi (pinler y yönünde dizili) */
  vertical: boolean;
  /** 180° dönük mü (1. pin sağda; hesap makinesinin breadboard'unda ters takılan SIP'ler) */
  ters?: boolean;
  /** yanına yerleştiği çip (dekuplaj kondansatörü) */
  chip?: string;
  /** kartın arka panele takılan kenar konnektörü */
  edge?: boolean;
  /** LED'in rengi (görevinden: passives.ts, LED_RENK_KURALLARI) */
  led?: LedRenk;
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
  /** kaçıncı kart sırasında */
  row: number;
}

/** Bir kart sırası ve altındaki arka panel şeridi */
export interface RowPlace {
  x: number;
  y: number;
  w: number;
  /** sıradaki en yüksek kartın boyu */
  h: number;
  /** arka panel şeridinin üst kenarı ve derinliği */
  backplaneY: number;
  backplaneH: number;
}

export interface BoardLayout {
  cards: CardPlace[];
  rows: RowPlace[];
  blocks: BlockPlace[];
  chips: ChipPlace[];
  passives: PassivePlace[];
  /** toplam alan (arka panel dahil) */
  width: number;
  height: number;
}

/** Kart başlıkları; tabloda olmayan kart "<ad> kartı" olur */
export const CARD_TITLES: Record<string, string> = {
  cpu: "CPU kartı", mem: "Test bellek kartı", clk: "Saat ve reset kartı", bellek: "Bellek kartı", onbellek: "Önbellek kartı",
  gc: "G/Ç kartı", video: "Video kartı", kyb: "Kendin yap bellek kartı", prog: "Programlayıcı kartı",
  hesap: "8 bit hesap makinesi",
};

export const cardTitle = (card: string): string =>
  CARD_TITLES[card] ?? `${card.charAt(0).toLocaleUpperCase("tr-TR")}${card.slice(1)} kartı`;

/** Çip kılıf ölçüleri: DIP-n, dar (7,62 mm) ya da geniş (15,24 mm) */
export function packageSize(ci: Pick<ChipInstance, "def">): { w: number; h: number; row: number } {
  const n = ci.def.pins.length;
  const row = ci.def.footprint.includes("W15.24") ? 15.24 : 7.62;
  return { w: (n / 2) * PITCH + 1.2, h: row - 1.6, row };
}

/** DIP pin konumu: 1..n/2 alt sırada soldan sağa, n/2+1..n üst sırada sağdan sola */
function dipPin(num: number, n: number, x: number, y: number, w: number, h: number, row: number): [number, number] {
  const half = n / 2;
  const x0 = x + (w - (half - 1) * PITCH) / 2;
  const i = num - 1;
  const bottom = i < half;
  const col = bottom ? i : n - 1 - i;
  return [x0 + col * PITCH, y + h / 2 + (bottom ? row / 2 : -row / 2)];
}

function pinPositions(ci: ChipInstance, x: number, y: number, w: number, h: number, row: number): PinPlace[] {
  const n = ci.def.pins.length;
  return ci.def.pins.map((p) => {
    const [px, py] = dipPin(p.num, n, x, y, w, h, row);
    return { num: p.num, name: p.name, net: ci.nets[p.name] ?? -1, x: px, y: py };
  });
}

// ---------------------------------------------------------------- pasifler

interface PassiveShape {
  kind: PassiveKind;
  w: number;
  h: number;
  height: number;
  /** pin numarası → kaplama dikdörtgenine göre konum */
  pin: (num: number, index: number, count: number) => [number, number];
}

/** Pasifin pin listesi: kütüphanede tanımlıysa onun pinleri, değilse bağlı pin numaraları */
function passivePins(p: Passive): { num: number; name: string }[] {
  const def = PASSIVES[p.part];
  if (def) return def.pins.map((x) => ({ num: x.num, name: x.name }));
  return Object.keys(p.pins).map(Number).filter((n) => Number.isFinite(n)).sort((a, b) => a - b).map((num) => ({ num, name: String(num) }));
}

/** Footprint adından gövde biçimi; bilinmeyen eleman pin sayısına göre (2 pin: eksenel, fazlası: sıra) */
export function passiveShape(part: string, pinCount: number): PassiveShape {
  const fp = PASSIVES[part]?.footprint ?? "";
  const row = (kind: PassiveKind, h: number, height: number, pitch = PITCH): PassiveShape => ({
    kind, w: Math.max(1, pinCount) * pitch, h, height, pin: (_n, i) => [pitch / 2 + i * pitch, h / 2],
  });
  const twoRows = (kind: PassiveKind, gap: number, h: number, height: number, numbering: "header" | "dip"): PassiveShape => {
    const per = Math.ceil(pinCount / 2);
    const w = per * PITCH + 1;
    return {
      kind, w, h, height,
      pin: (n) => {
        const k = n - 1;
        if (numbering === "header") return [0.5 + PITCH / 2 + Math.floor(k / 2) * PITCH, h / 2 + (k % 2 ? -gap / 2 : gap / 2)];
        const bottom = k < per;
        const col = bottom ? k : 2 * per - 1 - k;
        return [0.5 + PITCH / 2 + col * PITCH, h / 2 + (bottom ? gap / 2 : -gap / 2)];
      },
    };
  };
  const axial = (kind: PassiveKind, span: number, h: number, height: number): PassiveShape => ({
    kind, w: span + 1.2, h, height, pin: (_n, i) => [0.6 + (i ? span : 0), h / 2],
  });
  if (/R_Array_SIP/.test(fp)) return row("dizi", 2.6, 5);
  if (/SW_DIP_SPSTx/.test(fp)) return twoRows("dip", 7.62, 9.78, 5, "dip");
  if (/^Package_DIP:/.test(fp)) return twoRows("dipdizi", 7.62, 6.4, 3.5, "dip");
  if (/Display_7Segment/.test(fp)) {
    // 0,56" tek hane: 12,6 × 19 mm gövde; pinler üst ve alt kenarda 5'er, sıralar arası 15,24 mm.
    // 1–5 alt sırada soldan sağa, 6–10 üst sırada sağdan sola (DIP gibi)
    const w = 12.6;
    const h = 19;
    return {
      kind: "gosterge", w, h, height: 8,
      pin: (n) => {
        const k = n - 1;
        const bottom = k < 5;
        const col = bottom ? k : 9 - k;
        return [w / 2 + (col - 2) * PITCH, h / 2 + (bottom ? 7.62 : -7.62)];
      },
    };
  }
  if (/PinHeader_2x/.test(fp)) return twoRows("konnektor", PITCH, 5.6, 8.5, "header");
  if (/Pin(Header|Socket)_1x/.test(fp)) return row("konnektor", 2.8, 8.5);
  if (/Oscillator_DIP|Arduino/.test(fp)) {
    // osilatör kılıfı DIP-14 (7,62 mm sıra arası): yalnız kullanılan pinler (1, 7, 8, 14) vardır ama
    // konumları DIP'teki gibidir. Arduino Nano: 2 × 15 pin, 15,24 mm.
    const nano = /Arduino/.test(fp);
    const dip = Number(/Oscillator_DIP-(\d+)/.exec(fp)?.[1] ?? 0) || 2 * Math.ceil(pinCount / 2);
    const gap = nano ? 15.24 : 7.62;
    const h = nano ? 18 : 13;
    const per = dip / 2;
    return {
      kind: nano ? "modul" : "osilator", w: per * PITCH + 1, h, height: nano ? 6 : 6.5,
      pin: (num) => {
        const k = num - 1;
        const bottom = k < per;
        const col = bottom ? k : dip - 1 - k;
        return [0.5 + PITCH / 2 + col * PITCH, h / 2 + (bottom ? gap / 2 : -gap / 2)];
      },
    };
  }
  if (/DSUB|MiniDIN/.test(fp)) {
    const s = twoRows("konnektor", 2 * PITCH, 3 * PITCH + 4, 12, "dip");
    return { ...s, w: s.w + 6, pin: (n, i, c) => { const [x, y] = s.pin(n, i, c); return [x + 3, y]; } };
  }
  if (/R_Axial|D_DO|D_A/.test(fp)) return axial("direnc", /P10\.16/.test(fp) ? 10.16 : 7.62, 2.6, 2.6);
  if (/C_Disc/.test(fp)) return axial("kondansator", 5, 2.8, 5);
  if (/CP_Radial/.test(fp)) {
    const d = Number(/_D([\d.]+)mm/.exec(fp)?.[1] ?? 6.3);
    const p = Number(/_P([\d.]+)mm/.exec(fp)?.[1] ?? 2.5);
    return { kind: "elektrolitik", w: d, h: d, height: d * 1.7, pin: (_n, i) => [d / 2 + (i ? p / 2 : -p / 2), d / 2] };
  }
  if (/LED_/.test(fp)) return { kind: "led", w: 3.4, h: 3.4, height: 5, pin: (_n, i) => [1.7 + (i ? 1.27 : -1.27), 1.7] };
  if (/SW_PUSH/.test(fp)) return { kind: "buton", w: 7, h: 7, height: 5, pin: (_n, i) => [0.5 + (i ? 6 : 0), 3.5] };
  if (/SW_Slide/.test(fp)) return row("anahtar", 4, 5);
  if (/Potentiometer/.test(fp)) return { ...row("pot", 9.5, 5), w: Math.max(9.5, pinCount * PITCH) };
  if (pinCount === 2) return axial("direnc", 7.62, 2.6, 2.6);
  return row("modul", 3, 4);
}

/** Pasifi (x, y) köşesine yerleştir; vertical: 90° döndür (pinler y yönünde) */
function placePassive(p: Passive, x: number, y: number, vertical: boolean, chip?: string): PassivePlace {
  const pins = passivePins(p);
  const s = passiveShape(p.part, pins.length);
  const w = vertical ? s.h : s.w;
  const h = vertical ? s.w : s.h;
  return {
    ref: p.ref, part: p.part, card: p.card, block: p.block, role: p.role, kind: s.kind, x, y, w, h, height: s.height, vertical, chip,
    ...(s.kind === "led" ? { led: ledRengi(p.role) } : {}),
    pins: pins.map((q, i) => {
      const [px, py] = s.pin(q.num, i, pins.length);
      return { num: q.num, name: q.name, net: p.pins[String(q.num)] ?? -1, x: x + (vertical ? py : px), y: y + (vertical ? px : py) };
    }),
  };
}

const passiveSize = (p: Passive) => {
  const s = passiveShape(p.part, passivePins(p).length);
  return { w: s.w, h: s.h };
};

/** Kartın kenar konnektörü (arka panel): en çok pinli 2 sıralı başlık */
function isEdgeConnector(p: Passive): boolean {
  return /PinHeader_2x/.test(PASSIVES[p.part]?.footprint ?? "") && /arka panel/i.test(p.role);
}

// ---------------------------------------------------------------- yerleşim

export interface LayoutOptions {
  /** kart iç genişliği (mm); verilmeyen kartlar içeriklerine göre boyutlanır */
  cardWidth?: Record<string, number>;
  /** blok başına en az çip sütunu (çok çipli bloklar daha geniş olabilir) */
  maxCols?: number;
  /** bir kart sırasının en büyük genişliği (mm); aşılınca alt sıraya geçilir */
  maxRowWidth?: number;
}

const DEFAULT_CARD_WIDTH: Record<string, number> = { cpu: 420, mem: 120, clk: 120 };

interface LocalCard {
  name: string;
  w: number;
  h: number;
  blocks: BlockPlace[];
  chips: ChipPlace[];
  passives: PassivePlace[];
}

function layoutCard(board: Board, card: string, o: LayoutOptions): LocalCard {
  const margin = 8;
  const gapY = 4.5;
  const titleH = 6;
  const inCard = board.chips.filter((c) => c.card === card);
  const pasCard = board.passives.filter((p) => p.card === card);
  const refs = new Set(inCard.map((c) => c.ref));
  // dekuplaj: görevi kartın bir çipinin referansıyla başlayan pasif o çipin yanına
  const attached = new Map<string, Passive[]>();
  const edge: Passive[] = [];
  const loose: Passive[] = [];
  for (const p of pasCard) {
    const ref = /^(U\d+)\b/.exec(p.role)?.[1];
    if (ref && refs.has(ref)) {
      if (!attached.has(ref)) attached.set(ref, []);
      attached.get(ref)!.push(p);
    } else if (isEdgeConnector(p)) edge.push(p);
    else loose.push(p);
  }
  const gapX = attached.size ? 7 : 4;
  const blockOf = (x: { block: string }) => x.block || "Diğer";
  const blockNames = [...new Set([...inCard.map(blockOf), ...loose.map(blockOf)])];

  // her blok önce kendi koordinatında (0, 0) kurulur
  interface LocalBlock { name: string; w: number; h: number; chips: ChipPlace[]; passives: PassivePlace[] }
  const want = o.maxCols ?? 8;
  const sizesOf = (list: ChipInstance[]) => list.map(packageSize);
  const area = blockNames.reduce((a, name) => {
    const list = inCard.filter((c) => blockOf(c) === name);
    const chipA = sizesOf(list).reduce((s, z) => s + (z.w + gapX) * (z.row + gapY), 0);
    const pasA = loose.filter((p) => blockOf(p) === name).reduce((s, p) => { const z = passiveSize(p); return s + (z.w + 3) * (z.h + 3); }, 0);
    return a + chipA + pasA + 400;
  }, 0);
  const innerW = o.cardWidth?.[card] ?? DEFAULT_CARD_WIDTH[card] ?? Math.round(Math.min(640, Math.max(150, Math.sqrt(area * 1.7))));

  const built: LocalBlock[] = blockNames.map((name) => {
    const list = inCard.filter((c) => blockOf(c) === name);
    const pas = loose.filter((p) => blockOf(p) === name);
    const chips: ChipPlace[] = [];
    const passives: PassivePlace[] = [];
    let w = 0;
    let y = titleH;
    if (list.length) {
      const sizes = sizesOf(list);
      const cellW = Math.max(...sizes.map((s) => s.w)) + gapX;
      const cellH = Math.max(...sizes.map((s) => s.row)) + gapY;
      // çok çipli bloklarda (ör. yüzlerce 74HC574'lük RAM) kareye yakın ızgara
      const cols = Math.max(1, Math.min(list.length, Math.floor((innerW - 4) / cellW), Math.max(want, Math.ceil(Math.sqrt(list.length * 1.6)))));
      const rows = Math.ceil(list.length / cols);
      list.forEach((ci, k) => {
        const s = sizes[k];
        const x = 2 + (k % cols) * cellW + (cellW - gapX - s.w) / 2;
        const cy = titleH + Math.floor(k / cols) * cellH + (cellH - gapY - s.h) / 2;
        chips.push({ ref: ci.ref, part: ci.def.part, card, block: name, role: ci.role, x, y: cy, w: s.w, h: s.h, pins: pinPositions(ci, x, cy, s.w, s.h, s.row) });
        // dekuplaj kondansatörleri çipin sağındaki boşlukta, dikey
        (attached.get(ci.ref) ?? []).forEach((p, j) => {
          const z = passiveSize(p);
          passives.push(placePassive(p, x + s.w + 1.2 + j * (z.h + 0.6), cy + s.h / 2 - z.w / 2, true, ci.ref));
        });
      });
      w = cols * cellW;
      y = titleH + rows * cellH;
    }
    if (pas.length) {
      // pasif şeridi: soldan sağa, sığmazsa alt satıra
      const stripW = Math.max(w, Math.min(innerW - 4, pas.reduce((s, p) => s + passiveSize(p).w + 3, 0)));
      let px = 2;
      let rowH = 0;
      y += 1;
      for (const p of pas) {
        const z = passiveSize(p);
        if (px > 2 && px + z.w > stripW) {
          px = 2;
          y += rowH + 2.5;
          rowH = 0;
        }
        passives.push(placePassive(p, px, y, false));
        px += z.w + 3;
        rowH = Math.max(rowH, z.h);
        w = Math.max(w, px);
      }
      y += rowH + 2;
    }
    return { name, w: w + 4, h: y + 2, chips, passives };
  });

  // raf yerleşimi: bloklar soldan sağa, sığmazsa alt rafa
  const out: LocalCard = { name: card, w: 0, h: 0, blocks: [], chips: [], passives: [] };
  let bx = margin;
  let by = margin + 8; // kart başlığı
  let shelfH = 0;
  let maxRight = 0;
  for (const b of built) {
    if (bx > margin && bx + b.w > margin + innerW) {
      bx = margin;
      by += shelfH + 5;
      shelfH = 0;
    }
    out.blocks.push({ card, name: b.name, x: bx, y: by, w: b.w, h: b.h });
    for (const c of b.chips) out.chips.push({ ...c, x: c.x + bx, y: c.y + by, pins: c.pins.map((p) => ({ ...p, x: p.x + bx, y: p.y + by })) });
    for (const p of b.passives) out.passives.push({ ...p, x: p.x + bx, y: p.y + by, pins: p.pins.map((q) => ({ ...q, x: q.x + bx, y: q.y + by })) });
    bx += b.w + 5;
    maxRight = Math.max(maxRight, bx - 5);
    shelfH = Math.max(shelfH, b.h);
  }
  const w = Math.max(innerW, maxRight - margin) + 2 * margin;
  let h = by + shelfH + margin;
  // alt kenar: arka panel konnektörü(leri) ortada
  if (edge.length) {
    const sizes = edge.map(passiveSize);
    const total = sizes.reduce((s, z) => s + z.w, 0) + 4 * (edge.length - 1);
    let ex = w / 2 - total / 2;
    const cy = h + 1;
    edge.forEach((p, k) => {
      out.passives.push({ ...placePassive(p, ex, cy, false), edge: true });
      ex += sizes[k].w + 4;
    });
    h = cy + Math.max(...sizes.map((z) => z.h)) + 3;
  } else h += 10;
  out.w = w;
  out.h = h;
  return out;
}

export function boardLayout(board: Board, o: LayoutOptions = {}): BoardLayout {
  const cardNames = [...new Set([...board.chips.map((c) => c.card), ...board.passives.map((p) => p.card)])];
  const local = cardNames.map((card) => layoutCard(board, card, o));
  const maxRowWidth = o.maxRowWidth ?? 1000;
  const gap = 20;
  const backplaneH = 20;
  const lay: BoardLayout = { cards: [], rows: [], blocks: [], chips: [], passives: [], width: 0, height: 0 };

  // sıralara böl
  const rows: LocalCard[][] = [];
  let cur: LocalCard[] = [];
  let curW = 0;
  for (const c of local) {
    if (cur.length && curW + gap + c.w > maxRowWidth) {
      rows.push(cur);
      cur = [];
      curW = 0;
    }
    curW += (cur.length ? gap : 0) + c.w;
    cur.push(c);
  }
  if (cur.length) rows.push(cur);

  let y = 0;
  rows.forEach((list, r) => {
    const h = Math.max(...list.map((c) => c.h));
    let x = 0;
    for (const c of list) {
      const dx = x;
      const dy = y;
      lay.cards.push({ name: c.name, title: cardTitle(c.name), x: dx, y: dy, w: c.w, h: c.h, connectorX: dx + c.w / 2, row: r });
      for (const b of c.blocks) lay.blocks.push({ ...b, x: b.x + dx, y: b.y + dy });
      for (const ch of c.chips) lay.chips.push({ ...ch, x: ch.x + dx, y: ch.y + dy, pins: ch.pins.map((p) => ({ ...p, x: p.x + dx, y: p.y + dy })) });
      for (const p of c.passives) lay.passives.push({ ...p, x: p.x + dx, y: p.y + dy, pins: p.pins.map((q) => ({ ...q, x: q.x + dx, y: q.y + dy })) });
      x += c.w + gap;
    }
    const w = x - gap;
    lay.rows.push({ x: 0, y, w, h, backplaneY: y + h + 3, backplaneH });
    lay.width = Math.max(lay.width, w);
    y += h + backplaneH + 3 + 14;
  });
  lay.height = y - 14 + 6;
  return lay;
}
