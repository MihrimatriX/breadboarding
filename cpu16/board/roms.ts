// Kartlardaki Flash çiplerine yazılacak ROM imajları: mikrokod (4 çip) ve ALU kod çözme (3 çip).
// Hem CLI (npm run cpu16 -- roms) hem testler (depodaki dosyalar güncel mi) kullanır.

import { toIntelHex } from "../asm/hex.ts";
import { assembleMicrocode, splitRom } from "../micro/microasm.ts";
import { aluRomImages } from "./alu-rom.ts";

export const ROM_DIR = "cpu16/roms";

export interface RomImage {
  name: string;
  /** hangi çipe (kartın referansı ve görevi) */
  chip: string;
  data: Uint8Array;
}

export function romImages(ucodeSource: string): RomImage[] {
  const micro = assembleMicrocode(ucodeSource);
  if (micro.errors.length) throw new Error(`mikrokod: ${micro.errors.map((e) => e.message).join("; ")}`);
  return [
    ...splitRom(micro.rom).map((data, k) => ({ name: `mikrokod-${k}`, chip: `CPU kartı, mikrokod ROM ${k} (kontrol bitleri ${8 * k}..${8 * k + 7})`, data })),
    ...aluRomImages().map((data, k) => ({ name: `alu-${k}`, chip: `CPU kartı, ALU kod çözme ROM'u ${k}`, data })),
  ];
}

export function romFiles(ucodeSource: string): { path: string; content: string | Uint8Array }[] {
  const files: { path: string; content: string | Uint8Array }[] = [];
  const lines = ["# CPU16 ROM imajları", "", "`npm run cpu16 -- roms` ile üretilir; elle düzenlemeyin.", "", "| Dosya | Çip | Boyut |", "|---|---|---|"];
  for (const r of romImages(ucodeSource)) {
    files.push({ path: `${ROM_DIR}/${r.name}.hex`, content: toIntelHex(r.data, [[0, r.data.length]]) });
    files.push({ path: `${ROM_DIR}/${r.name}.bin`, content: r.data });
    lines.push(`| ${r.name}.hex / .bin | ${r.chip} | ${r.data.length} bayt |`);
  }
  lines.push("", "Yazmak için: `python3 cpu16/programlayici/yaz.py PORT cpu16/roms/<dosya>.hex --sil --dogrula`", "");
  files.push({ path: `${ROM_DIR}/README.md`, content: lines.join("\n") });
  return files;
}
