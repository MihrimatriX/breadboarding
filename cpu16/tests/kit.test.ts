// Faz 10: deney rehberleri. Otomatik bölümler (malzeme, bağlantılar) şemadan üretilir; elle yazılan
// metindeki referanslar (U41, R203 …) şemada gerçekten var olmalı. Şema değişince bu testler
// rehberin de güncellenmesini ister: npm run cpu16 -- kit
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { DENEYLER, dosyaAdi } from "../kit/deneyler.ts";
import { guideFiles, kitData, OTO_BASLA, OTO_BITTI } from "../kit/rehber.ts";

const read = (p: string) => {
  try {
    return readFileSync(new URL(`../../${p}`, import.meta.url), "utf8");
  } catch {
    return null;
  }
};

describe("Faz 10: deney rehberleri", () => {
  it("depodaki rehberlerin otomatik bölümleri güncel (npm run cpu16 -- kit)", () => {
    for (const f of guideFiles(read)) expect(read(f.path) === f.content, f.path).toBe(true);
  });

  it("elle yazılan metindeki her referans şemada var", () => {
    const { boards } = kitData();
    const refs = new Set<string>();
    for (const b of Object.values(boards)) {
      for (const c of b.chips) refs.add(c.ref);
      for (const p of b.passives) refs.add(p.ref);
    }
    for (const d of DENEYLER) {
      const text = read(`cpu16/kit/${dosyaAdi(d)}`)!;
      const a = text.indexOf(OTO_BASLA);
      const el = a < 0 ? text : text.slice(0, a) + text.slice(text.indexOf(OTO_BITTI) + OTO_BITTI.length);
      for (const m of el.matchAll(/\b(?:(?:U|RN|RV|SW|X|J)\d{1,3}|[RCD]\d{3})\b/g)) expect(refs.has(m[0]), `${dosyaAdi(d)}: ${m[0]}`).toBe(true);
    }
  });
});
