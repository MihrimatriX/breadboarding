// cc16'nın Node'a özgü kısmı: cpu16/lib kütüphanesini ve kaynak dosyaları diskten okur.
// (Tarayıcıda bunun yerine lib-vite.ts kullanılır.)

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import type { LibSources } from "./index.ts";

export const LIB_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "lib");

let cached: LibSources | undefined;

/** cpu16/lib altındaki .c, .s ve .h dosyalarını { "crt0.s": ..., "include/stdio.h": ... } olarak okur. */
export function loadLib(dir = LIB_DIR): LibSources {
  if (dir === LIB_DIR && cached) return cached;
  const out: LibSources = {};
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else if (/\.(c|s|h)$/.test(name)) out[relative(dir, p).split("\\").join("/")] = readFileSync(p, "utf8");
    }
  };
  walk(dir);
  if (dir === LIB_DIR) cached = out;
  return out;
}

/** Diskten okuma geri çağrısı (önişlemcinin #include'ları için). */
export function diskReader(path: string): string | undefined {
  return existsSync(path) && statSync(path).isFile() ? readFileSync(path, "utf8") : undefined;
}
