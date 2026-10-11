// npm run cpu16 -- kit: cpu16/kit/deney-*.md dosyalarının otomatik bölümlerini ve rehberin
// görsellerini (cpu16/kit/gorseller/*.svg) yeniden üretir.

import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { GORSEL_DIR, gorselDosyalari } from "./gorseller.ts";
import { guideFiles } from "./rehber.ts";

mkdirSync(GORSEL_DIR, { recursive: true });
for (const f of [...guideFiles((p) => (existsSync(p) ? readFileSync(p, "utf8") : null)), ...gorselDosyalari()]) {
  const old = existsSync(f.path) ? readFileSync(f.path, "utf8") : "";
  if (old !== f.content) writeFileSync(f.path, f.content);
  console.log(`${f.path}${old === f.content ? "" : " (güncellendi)"}`);
}
