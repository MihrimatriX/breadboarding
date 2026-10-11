// CPU16 parça kütüphanesi: bilgisayarda kullanılan bütün entegreler.
// Her çipin pin düzeni (veri sayfasıyla aynı), kapı seviyesi içi ve fonksiyon tablosu burada.
// Ayrıntılı liste: cpu16/docs/parcalar.md

import { GATE_CHIPS } from "./parts/gates.ts";
import { GC_EK_CHIPS } from "./parts/gc-ek.ts";
import { MEMORY_CHIPS } from "./parts/memory.ts";
import { MSI_CHIPS } from "./parts/msi.ts";
import { BUS_CHIPS, SEQ_CHIPS } from "./parts/seq.ts";
import type { ChipDef } from "./types.ts";

export const CHIPS: ChipDef[] = [...GATE_CHIPS, ...MSI_CHIPS, ...SEQ_CHIPS, ...BUS_CHIPS, ...MEMORY_CHIPS, ...GC_EK_CHIPS];

export const CHIP_BY_PART: Record<string, ChipDef> = Object.fromEntries(CHIPS.map((c) => [c.part, c]));

export function chip(part: string): ChipDef {
  const def = CHIP_BY_PART[part];
  if (!def) throw new Error(`Kütüphanede böyle bir çip yok: ${part}`);
  return def;
}
