// Faz 6 anakart testlerinin ortak yardımcıları (anakart-bellek.test.ts, anakart-sistem.test.ts)

import { readFileSync } from "node:fs";
import { expect } from "vitest";
import { buildBios } from "../bios/build.ts";
import type { MemoryProbe } from "../board/machine-board.ts";
import type { Machine } from "../emu/machine.ts";
import { assembleMicrocode } from "../micro/microasm.ts";

export const readText = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
export const micro = assembleMicrocode(readText("../micro/cpu16.ucode"));
export const bios = buildBios(readText("../bios/bios.s"));
export const hex = (v: number, n = 4) => v.toString(16).padStart(n, "0");

/** Başka kartların G/Ç adresleri (UART/klavye/zamanlayıcı/kesme, video): bu kartlar yokken değeri karşılaştırılmaz */
export const foreignIo = (addr: number) => addr >= 0xff00 && ((addr & 0xf0) === 0x00 || (addr & 0xf0) === 0x20);

/** Kartların tam durumu Machine ile aynı mı: bank register'ları, sayaçlar, etiketler, satır verisi, RAM, Flash */
export function expectSameMemory(g: MemoryProbe, m: Machine): number {
  expect(g.banks).toEqual(Array.from(m.banks));
  expect([g.hits, g.misses, g.cacheEnabled]).toEqual([m.cache.hits, m.cache.misses, m.cache.enabled]);
  let valid = 0;
  for (let line = 0; line < 1024; line++) {
    const t = m.cache.tags[line];
    if (g.tag(line) !== t) throw new Error(`satır ${line}: etiket ${g.tag(line)}, Machine ${t}`);
    if (t >= 0) {
      valid++;
      if (g.data(line) !== m.cache.data[line]) throw new Error(`satır ${line}: veri ${hex(g.data(line))}, Machine ${hex(m.cache.data[line])}`);
    }
  }
  for (let i = 0; i < m.ram.length; i++) if (g.ram[i] !== m.ram[i]) throw new Error(`RAM ${hex(0x80000 + i, 5)}: ${g.ram[i]} ≠ ${m.ram[i]}`);
  for (let i = 0; i < m.flash.data.length; i++) if (g.flash[i] !== m.flash.data[i]) throw new Error(`Flash ${hex(i, 5)}: ${g.flash[i]} ≠ ${m.flash.data[i]}`);
  return valid;
}
