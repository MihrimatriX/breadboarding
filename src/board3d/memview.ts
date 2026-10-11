// Bellek çipinin içi (davranışsal modeller: SRAM, Flash, EEPROM): pin adlarından ve boyundan
// hücre dizisinin düzeni. Gerçek çipte hücreler kare bir dizidir: adresin yüksek bitleri satır
// kod çözücüsüne (word line), düşük bitleri sütun seçicisine (column mux) gider; her veri biti için
// bir sütun grubu ve bir okuma yükselteci (sense amp) vardır. Burada aynı düzen, örnek bir pencereyle.

import type { ChipDef } from "../../cpu16/chips/types";

export interface MemGeometry {
  /** adres pinleri (A0..), veri pinleri (IO0../DQ0..), kontrol pinleri (~CE, ~OE, ~WE …) */
  addrPins: string[];
  dataPins: string[];
  ctrlPins: string[];
  addrBits: number;
  /** satır ve sütun adres bitleri: satır = adres >> colBits, sütun = adres & (2^colBits − 1) */
  rowBits: number;
  colBits: number;
  rows: number;
  /** satır başına bayt (sütun seçicinin giriş sayısı) */
  bytesPerRow: number;
  size: number;
  /** hücre türü: 6T SRAM ya da yüzer kapılı (Flash / EEPROM) */
  cell: "sram" | "flash";
}

/** Çipin pinlerinden ve adından bellek düzeni; bellek çipi değilse null */
export function memGeometry(def: Pick<ChipDef, "part" | "title" | "pins" | "behavioral">): MemGeometry | null {
  const sig = def.pins.filter((p) => p.dir !== "power" && p.dir !== "nc");
  const addrPins = sig.filter((p) => /^A\d+$/.test(p.name)).sort((a, b) => Number(a.name.slice(1)) - Number(b.name.slice(1))).map((p) => p.name);
  const dataPins = sig.filter((p) => p.dir === "bidir" || p.dir === "tri" || p.dir === "out").map((p) => p.name)
    .sort((a, b) => Number(/\d+$/.exec(a)?.[0] ?? 0) - Number(/\d+$/.exec(b)?.[0] ?? 0));
  if (!def.behavioral || addrPins.length < 2 || !dataPins.length) return null;
  const ctrlPins = sig.filter((p) => !addrPins.includes(p.name) && !dataPins.includes(p.name)).map((p) => p.name);
  const addrBits = addrPins.length;
  // satır başına en çok 64 bayt (512 bit): 62256'da 512 satır × 64 bayt, büyüklerde satır sayısı artar
  const colBits = Math.min(6, Math.floor(addrBits / 2));
  const rowBits = addrBits - colBits;
  const flash = /flash|eeprom|rom/i.test(def.title) || /^(28C|29|39|27)/i.test(def.part);
  return {
    addrPins, dataPins, ctrlPins, addrBits, rowBits, colBits,
    rows: 1 << rowBits, bytesPerRow: 1 << colBits, size: 1 << addrBits, cell: flash ? "flash" : "sram",
  };
}

/** Örnek pencere: adresin satırı ortada olacak şekilde `count` satır (dizinin içinde kalır) */
export function rowWindow(addr: number, g: MemGeometry, count = 16): { row: number; first: number; count: number } {
  const n = Math.min(count, g.rows);
  const row = addr >> g.colBits;
  const first = Math.max(0, Math.min(g.rows - n, row - (n >> 1)));
  return { row, first, count: n };
}

/** Sütun penceresi: adresin baytı dahil `bytes` bayt (hizalı) */
export function colWindow(addr: number, g: MemGeometry, bytes = 4): { col: number; first: number; count: number } {
  const n = Math.min(bytes, g.bytesPerRow);
  const col = addr & (g.bytesPerRow - 1);
  return { col, first: col - (col % n), count: n };
}
