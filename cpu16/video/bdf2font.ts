// Karakter ROM'u üretici: BDF bitmap fontundan 256 karakterlik 8×16 font tablosu (font.ts) yazar.
//
//   node --experimental-strip-types cpu16/video/bdf2font.ts 8x13.bdf > cpu16/video/font.ts
//
// Kaynak font: X11 "Misc-Fixed-Medium-R-Normal--13" (8x13.bdf, ISO10646-1), Markus Kuhn'un
// ucs-fonts paketi. Lisansı: "Public domain font. Share and enjoy." (kamu malı).
// İndirme: https://www.cl.cam.ac.uk/~mgk25/ucs-fonts.html veya xorg font-misc-misc paketi.
//
// Kod sayfası: 0x20–0x7E ASCII, 0x80–0xFF CP857 (Türkçe DOS: ç ğ ı İ ö ş ü, çerçeve ve blok
// karakterleri), 0x01–0x1F ve 0x7F CP437 simgeleri (☺ ♥ ♪ ► ↑ … ⌂).
// 13 satırlık glifler 16 satırlık hücrenin 1. satırından başlar (taban çizgisi 11. satır); çerçeve (─ │ ╔ …) ve blok
// (█ ▀ ▄ ░ ▒ ▓ ■) karakterleri hücreyi tam doldursun diye bu dosyada çizilir.

import { readFileSync } from "node:fs";

const CP437_LOW = [
  0x0000, 0x263a, 0x263b, 0x2665, 0x2666, 0x2663, 0x2660, 0x2022, 0x25d8, 0x25cb, 0x25d9, 0x2642, 0x2640, 0x266a, 0x266b, 0x263c,
  0x25ba, 0x25c4, 0x2195, 0x203c, 0x00b6, 0x00a7, 0x25ac, 0x21a8, 0x2191, 0x2193, 0x2192, 0x2190, 0x221f, 0x2194, 0x25b2, 0x25bc,
];
// CP857'nin üst yarısı (Python cp857 kodeğiyle doğrulandı). 0xD5 = € (CP858), 0xE7 ve 0xF2 tanımsız.
const CP857_HIGH =
  "ÇüéâäàåçêëèïîıÄÅÉæÆôöòûùİÖÜø£ØŞşáíóúñÑĞğ¿®¬½¼¡«»░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐└┴┬├─┼ãÃ╚╔╩╦╠═╬¤ºªÊËÈ€ÍÎÏ┘┌█▄¦Ì▀ÓßÔÒõÕµ\u0000×ÚÛÙìÿ¯´­±\u0000¾¶§÷¸°¨·¹³²■ ";

export function codePage(): number[] {
  const map: number[] = [];
  for (let i = 0; i < 32; i++) map.push(CP437_LOW[i]);
  for (let i = 32; i < 127; i++) map.push(i);
  map.push(0x2302); // ⌂
  for (const ch of CP857_HIGH) map.push(ch.codePointAt(0)!);
  if (map.length !== 256) throw new Error(`kod sayfası ${map.length} karakter`);
  return map;
}

interface Glyph {
  rows: number[]; // 16 satır, bit 7 = en soldaki piksel
}

function parseBdf(text: string): Map<number, Glyph> {
  const out = new Map<number, Glyph>();
  const ascent = Number(/^FONT_ASCENT (\d+)/m.exec(text)?.[1] ?? 11);
  const TOP = 1; // hücrede üst boşluk: taban çizgisi 11. satır (VGA ile aynı)
  const lines = text.split(/\r?\n/);
  let enc = -1;
  let bbx = [8, 13, 0, -2];
  let bitmap: number[] | null = null;
  for (const line of lines) {
    if (line.startsWith("ENCODING ")) enc = Number(line.slice(9));
    else if (line.startsWith("BBX ")) bbx = line.slice(4).trim().split(/\s+/).map(Number);
    else if (line === "BITMAP") bitmap = [];
    else if (line === "ENDCHAR") {
      if (bitmap && enc >= 0) {
        const [w, h, xo, yo] = bbx;
        const rows = new Array(16).fill(0);
        const top = TOP + ascent - (yo + h);
        for (let r = 0; r < h; r++) {
          const y = top + r;
          if (y < 0 || y > 15) continue;
          const bits = bitmap[r] ?? 0; // hex satırı: soldan hizalı, (w+7)/8 bayt
          const width = Math.ceil(w / 8) * 8;
          for (let x = 0; x < w; x++) {
            if ((bits >> (width - 1 - x)) & 1) {
              const px = x + xo;
              if (px >= 0 && px < 8) rows[y] |= 0x80 >> px;
            }
          }
        }
        out.set(enc, { rows });
      }
      bitmap = null;
      enc = -1;
    } else if (bitmap) bitmap.push(parseInt(line, 16));
  }
  return out;
}

// ---- çizilen karakterler: çerçeve (tek/çift çizgi) ve bloklar

type Arms = [number, number, number, number]; // yukarı, aşağı, sol, sağ: 0 yok, 1 tek, 2 çift
const BOX: Record<number, Arms> = {
  0x2500: [0, 0, 1, 1], 0x2502: [1, 1, 0, 0], 0x250c: [0, 1, 0, 1], 0x2510: [0, 1, 1, 0],
  0x2514: [1, 0, 0, 1], 0x2518: [1, 0, 1, 0], 0x251c: [1, 1, 0, 1], 0x2524: [1, 1, 1, 0],
  0x252c: [0, 1, 1, 1], 0x2534: [1, 0, 1, 1], 0x253c: [1, 1, 1, 1],
  0x2550: [0, 0, 2, 2], 0x2551: [2, 2, 0, 0], 0x2554: [0, 2, 0, 2], 0x2557: [0, 2, 2, 0],
  0x255a: [2, 0, 0, 2], 0x255d: [2, 0, 2, 0], 0x2560: [2, 2, 0, 2], 0x2563: [2, 2, 2, 0],
  0x2566: [0, 2, 2, 2], 0x2569: [2, 0, 2, 2], 0x256c: [2, 2, 2, 2],
};

// Tek çizgi: sütun 3, satır 7. Çift çizgi: sütun 2 ve 4, satır 6 ve 8.
function drawBox([up, down, left, right]: Arms): number[] {
  const px = Array.from({ length: 16 }, () => new Array(8).fill(0));
  const vline = (x: number, y0: number, y1: number) => { for (let y = y0; y <= y1; y++) px[y][x] = 1; };
  const hline = (y: number, x0: number, x1: number) => { for (let x = x0; x <= x1; x++) px[y][x] = 1; };
  const dbl = up === 2 || down === 2 || left === 2 || right === 2;
  if (!dbl) {
    if (up) vline(3, 0, 7);
    if (down) vline(3, 7, 15);
    if (left) hline(7, 0, 3);
    if (right) hline(7, 3, 7);
  } else {
    // Çift çizgilerde iki "ray": her kolun iki çizgisi, köşelerde birbirini keser.
    const vert = up === 2 || down === 2;
    const horz = left === 2 || right === 2;
    if (vert && !horz) { vline(2, 0, 15); vline(4, 0, 15); }
    else if (horz && !vert) { hline(6, 0, 7); hline(8, 0, 7); }
    else {
      // Sütun 2 (sol ray): yukarı kol varsa 0..(sol kol varsa 6, yoksa 8), aşağı kol varsa (sol kol varsa 8, yoksa 6)..15
      if (up) vline(2, 0, left ? 6 : 8);
      if (down) vline(2, left ? 8 : 6, 15);
      if (up) vline(4, 0, right ? 6 : 8);
      if (down) vline(4, right ? 8 : 6, 15);
      if (left) hline(6, 0, up ? 2 : 4);
      if (right) hline(6, up ? 4 : 2, 7);
      if (left) hline(8, 0, down ? 2 : 4);
      if (right) hline(8, down ? 4 : 2, 7);
    }
  }
  return px.map((row) => row.reduce((b, v, x) => b | (v << (7 - x)), 0));
}

function drawBlock(cp: number): number[] | null {
  const fill = (f: (y: number) => number) => Array.from({ length: 16 }, (_, y) => f(y));
  switch (cp) {
    case 0x2588: return fill(() => 0xff); // █
    case 0x2580: return fill((y) => (y < 8 ? 0xff : 0)); // ▀
    case 0x2584: return fill((y) => (y >= 8 ? 0xff : 0)); // ▄
    case 0x2591: return fill((y) => (y & 1 ? 0x44 : 0x11)); // ░
    case 0x2592: return fill((y) => (y & 1 ? 0xaa : 0x55)); // ▒
    case 0x2593: return fill((y) => (y & 1 ? 0xbb : 0xee)); // ▓
    case 0x25a0: return fill((y) => (y >= 4 && y <= 11 ? 0x7e : 0)); // ■
  }
  return null;
}

export function buildFont(bdf: string): Uint8Array {
  const glyphs = parseBdf(bdf);
  const font = new Uint8Array(256 * 16);
  const missing: string[] = [];
  codePage().forEach((cp, code) => {
    let rows: number[] | null = null;
    if (cp === 0 || cp === 0xa0) rows = new Array(16).fill(0);
    else if (BOX[cp]) rows = drawBox(BOX[cp]);
    else rows = drawBlock(cp) ?? glyphs.get(cp)?.rows ?? null;
    if (!rows) {
      missing.push(`${code.toString(16)}=U+${cp.toString(16)}`);
      rows = new Array(16).fill(0);
    }
    font.set(rows, code * 16);
  });
  if (missing.length) console.error(`eksik glifler: ${missing.join(" ")}`);
  return font;
}

function emitTs(font: Uint8Array): string {
  const cp = codePage();
  const lines: string[] = [];
  lines.push("// CPU16 video kartının karakter ROM'u: 256 karakter × 16 satır, 8 piksel genişlik.");
  lines.push("// ÜRETİLMİŞ DOSYA: cpu16/video/bdf2font.ts ile 8x13.bdf'ten (X11 Misc-Fixed, kamu malı) yazıldı.");
  lines.push("// Bayt = bir piksel satırı, bit 7 = en soldaki piksel. Adres = kod × 16 + satır (12 bit).");
  lines.push("// Kod sayfası: ASCII + CP857 (Türkçe DOS), 0x01–0x1F ve 0x7F CP437 simgeleri.");
  lines.push("");
  lines.push("/** Her karakter kodunun Unicode karşılığı (0 = boş). */");
  lines.push("export const CODEPAGE: readonly number[] = [");
  for (let i = 0; i < 256; i += 16) {
    lines.push("  " + cp.slice(i, i + 16).map((c) => `0x${c.toString(16).padStart(4, "0")}`).join(", ") + ",");
  }
  lines.push("];");
  lines.push("");
  lines.push("const HEX = [");
  for (let c = 0; c < 256; c++) {
    const hex = Array.from(font.subarray(c * 16, c * 16 + 16), (b) => b.toString(16).padStart(2, "0")).join("");
    const label = cp[c] >= 0x20 && cp[c] !== 0x7f && cp[c] !== 0xad && cp[c] !== 0xa0 ? String.fromCodePoint(cp[c]) : "";
    lines.push(`  "${hex}", // ${c.toString(16).toUpperCase().padStart(2, "0")} ${label}`.trimEnd());
  }
  lines.push("];");
  lines.push("");
  lines.push("/** 4096 baytlık karakter ROM'u. */");
  lines.push("export const FONT_8X16: Uint8Array = (() => {");
  lines.push("  const out = new Uint8Array(256 * 16);");
  lines.push("  HEX.forEach((h, c) => {");
  lines.push("    for (let r = 0; r < 16; r++) out[c * 16 + r] = parseInt(h.slice(r * 2, r * 2 + 2), 16);");
  lines.push("  });");
  lines.push("  return out;");
  lines.push("})();");
  lines.push("");
  lines.push("const REVERSE = new Map<number, number>(CODEPAGE.map((u, c) => [u, c] as [number, number]).filter(([u]) => u !== 0));");
  lines.push("");
  lines.push("/** Karakter kodunu ekrana basılabilir metne çevirir (kontrol kodları boşluk olur). */");
  lines.push("export function charToText(code: number): string {");
  lines.push("  const u = CODEPAGE[code & 0xff];");
  lines.push("  return u === 0 || u === 0xa0 || u === 0xad ? \" \" : String.fromCodePoint(u);");
  lines.push("}");
  lines.push("");
  lines.push("/** Unicode karakteri kod sayfasındaki koduna çevirir; yoksa undefined. */");
  lines.push("export function textToChar(ch: string): number | undefined {");
  lines.push("  return REVERSE.get(ch.codePointAt(0) ?? 0);");
  lines.push("}");
  return lines.join("\n") + "\n";
}

if (process.argv[1]?.endsWith("bdf2font.ts")) {
  const path = process.argv[2];
  if (!path) {
    console.error("kullanım: node --experimental-strip-types cpu16/video/bdf2font.ts 8x13.bdf > cpu16/video/font.ts");
    process.exit(1);
  }
  process.stdout.write(emitTs(buildFont(readFileSync(path, "utf8"))));
}
