// npm run cpu16 -- kit: cpu16/kit/deney-*.md dosyalarının otomatik bölümlerini yeniden üretir.

import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { guideFiles } from "./rehber.ts";

for (const f of guideFiles((p) => (existsSync(p) ? readFileSync(p, "utf8") : null))) {
  const old = existsSync(f.path) ? readFileSync(f.path, "utf8") : "";
  if (old !== f.content) writeFileSync(f.path, f.content);
  console.log(`${f.path}${old === f.content ? "" : " (güncellendi)"}`);
}
