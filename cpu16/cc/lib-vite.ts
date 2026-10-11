// cc16 çalışma zamanı kütüphanesi, Vite ile pakete gömülü olarak (tarayıcı / vitest).
// Node CLI'da import.meta.glob olmadığından orada node.ts'deki loadLib() kullanılır.

import type { LibSources } from "./index.ts";

const raw = import.meta.glob("../lib/**/*.{c,s,h}", { query: "?raw", import: "default", eager: true }) as Record<string, string>;

/** "../lib/include/stdio.h" → "include/stdio.h" */
export const LIB: LibSources = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.replace(/^\.\.\/lib\//, ""), v]));
