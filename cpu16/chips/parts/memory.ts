// Bellek çipleri: davranışsal modeller (içleri kapı seviyesinde değil, pin seviyesinde doğru).
// 62256 (32 KB SRAM), AS6C4008 (512 KB SRAM), SST39SF010 (128 KB Flash, komut dizileriyle yazılır).

import { L0, L1, LX, LZ, type Behavior, type Level } from "../logic.ts";
import { dipFootprint, pinsOf, range, type ChipDef } from "../types.ts";

/** Bellek çipinin dışarıdan erişilebilir içeriği (programlayıcı / test için) */
export interface MemoryHandle {
  data: Uint8Array;
}

/** Bir dizi seviyeden sayı: biri bilinmiyorsa null */
function word(levels: readonly Level[]): number | null {
  let v = 0;
  for (let i = 0; i < levels.length; i++) {
    const l = levels[i];
    if (l !== L0 && l !== L1) return null;
    v |= l << i;
  }
  return v;
}

const zBus = (n: number): Level[] => Array(n).fill(LZ);
const xBus = (n: number): Level[] => Array(n).fill(LX);
const bitsOf = (v: number, n: number): Level[] => Array.from({ length: n }, (_, i) => ((v >> i) & 1) as Level);

/**
 * Girişlerin sırası: adres (A0..), ~CE, ~OE, ~WE, veri (DQ0..7).
 * Çıkış: veri pinleri (üç durumlu).
 */
function sramBehavior(h: MemoryHandle, addrBits: number): Behavior {
  return {
    eval(ins) {
      const addr = word(ins.slice(0, addrBits));
      const [ce, oe, we] = ins.slice(addrBits, addrBits + 3);
      const data = word(ins.slice(addrBits + 3));
      if (ce === L1) return zBus(8);
      if (ce !== L0) return xBus(8);
      if (we === L0) {
        // yazma çevrimi: çıkışlar kapalı, veri seviye duyarlı olarak yazılır (son değer kalır)
        if (addr !== null && data !== null) h.data[addr] = data;
        return zBus(8);
      }
      if (we !== L1) return xBus(8);
      if (oe === L1) return zBus(8);
      if (oe !== L0 || addr === null) return xBus(8);
      return bitsOf(h.data[addr], 8);
    },
  };
}

/**
 * SST39SF010A komut durum makinesi. Komutlar ~WE'nin (veya ~CE'nin) yükselen kenarında alınır.
 * Programlama ve silme modelde anında biter (gerçek çipte ~20 µs / ~25 ms; DQ7 sorgulaması yok).
 */
function flashBehavior(h: MemoryHandle, addrBits: number): Behavior {
  let state = 0;
  let idMode = false;
  const cmd = (a: number, d: number) => {
    const a15 = a & 0x7fff;
    if (d === 0xf0 && state !== 3 && state !== 6) {
      idMode = false;
      state = 0;
      return;
    }
    switch (state) {
      case 0: state = a15 === 0x5555 && d === 0xaa ? 1 : 0; break;
      case 1: state = a15 === 0x2aaa && d === 0x55 ? 2 : 0; break;
      case 2:
        state = 0;
        if (a15 !== 0x5555) break;
        if (d === 0xa0) state = 3;
        else if (d === 0x80) state = 4;
        else if (d === 0x90) idMode = true;
        break;
      case 3: h.data[a] &= d; state = 0; break; // programlama yalnızca 1 → 0 yapabilir
      case 4: state = a15 === 0x5555 && d === 0xaa ? 5 : 0; break;
      case 5: state = a15 === 0x2aaa && d === 0x55 ? 6 : 0; break;
      case 6:
        if (a15 === 0x5555 && d === 0x10) h.data.fill(0xff);
        else if (d === 0x30) h.data.fill(0xff, a & ~0xfff, (a & ~0xfff) + 0x1000);
        state = 0;
        break;
    }
  };
  return {
    eval(ins, prev) {
      const addr = word(ins.slice(0, addrBits));
      const [ce, oe, we] = ins.slice(addrBits, addrBits + 3);
      const [pce, , pwe] = prev.slice(addrBits, addrBits + 3);
      const data = word(ins.slice(addrBits + 3));
      // yazma kenarı: ~WE yükselirken ~CE düşük, ya da ~CE yükselirken ~WE düşük
      const weEdge = pwe === L0 && we === L1 && ce === L0;
      const ceEdge = pce === L0 && ce === L1 && we === L0;
      if ((weEdge || ceEdge) && addr !== null && data !== null) cmd(addr, data);
      if (ce === L1) return zBus(8);
      if (ce !== L0 || we !== L1) return we === L0 && ce === L0 ? zBus(8) : xBus(8);
      if (oe === L1) return zBus(8);
      if (oe !== L0 || addr === null) return xBus(8);
      if (idMode) return bitsOf(addr === 0 ? 0xbf : addr === 1 ? 0xb5 : 0xff, 8);
      return bitsOf(h.data[addr], 8);
    },
  };
}

function memChip(o: {
  part: string; title: string; spec: string; addrBits: number; flash?: boolean; dataNames: string[]; usage: string;
}): ChipDef {
  const addr = range("A", o.addrBits);
  return {
    part: o.part,
    title: o.title,
    pkg: "DIP-" + o.spec.split(/\s+/).length,
    footprint: dipFootprint(o.spec.split(/\s+/).length, true),
    pins: pinsOf(o.spec, { bidir: o.dataNames.join(" ") }),
    behavioral: true,
    build(c, p) {
      const h: MemoryHandle = { data: new Uint8Array(1 << o.addrBits).fill(o.flash ? 0xff : 0) };
      const ins = [...addr.map((n) => p[n]), p["~CE"], p["~OE"], p["~WE"], ...o.dataNames.map((n) => p[n])];
      const outs = o.dataNames.map((n) => p[n]);
      c.add("BEHAV", ins, outs, () => (o.flash ? flashBehavior(h, o.addrBits) : sramBehavior(h, o.addrBits)));
      return h;
    },
    usage: o.usage,
  };
}

export const SRAM62256 = memChip({
  part: "62256",
  title: "32 KB statik RAM (32K × 8)",
  spec: "A14 A12 A7 A6 A5 A4 A3 A2 A1 A0 IO0 IO1 IO2 GND IO3 IO4 IO5 IO6 IO7 ~CE A10 ~OE A11 A9 A8 A13 ~WE VCC",
  addrBits: 15,
  dataNames: range("IO", 8),
  usage: "Cache veri ve etiket belleği (hızlı SRAM), video karakter belleği (VRAM)",
});

export const AS6C4008 = memChip({
  part: "AS6C4008",
  title: "512 KB statik RAM (512K × 8)",
  spec: "A18 A16 A14 A12 A7 A6 A5 A4 A3 A2 A1 A0 DQ0 DQ1 DQ2 VSS DQ3 DQ4 DQ5 DQ6 DQ7 ~CE A10 ~OE A11 A9 A8 A13 ~WE A17 A15 VCC",
  addrBits: 19,
  dataNames: range("DQ", 8),
  usage: "Ana bellek: 2 adet (çift/tek bayt) = 16 bit veri yolu",
});

export const SST39SF010 = memChip({
  part: "SST39SF010A",
  title: "128 KB Flash (128K × 8, 5 V, komutla programlanır)",
  spec: "NC1 A16 A15 A12 A7 A6 A5 A4 A3 A2 A1 A0 DQ0 DQ1 DQ2 VSS DQ3 DQ4 DQ5 DQ6 DQ7 ~CE A10 ~OE A11 A9 A8 A13 A14 NC30 ~WE VDD",
  addrBits: 17,
  flash: true,
  dataNames: range("DQ", 8),
  usage: "BIOS Flash'ı (bellek kartı), video karakter ROM'u, programlayıcının ZIF soketi",
});

export const MEMORY_CHIPS = [SRAM62256, AS6C4008, SST39SF010];
