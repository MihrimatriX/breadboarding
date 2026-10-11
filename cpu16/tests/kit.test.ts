// Faz 10: deney rehberleri. Otomatik bölümler (malzeme, bağlantılar) şemadan üretilir; elle yazılan
// metindeki referanslar (U41, R203 …) şemada gerçekten var olmalı. Şema değişince bu testler
// rehberin de güncellenmesini ister: npm run cpu16 -- kit
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { Machine } from "../emu/machine.ts";
import { DENEYLER, dosyaAdi } from "../kit/deneyler.ts";
import { guideFiles, kitData, OTO_BASLA, OTO_BITTI } from "../kit/rehber.ts";
import { romImage } from "../tools/machine-cli.ts";

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

// BIOS'tan önceki deneylerin programları Flash bank 0'dan çalışır (machine --rom ile aynı yol)
const romMachine = (file: string) => {
  const m = new Machine();
  m.loadFlash(romImage(fileURLToPath(new URL(`../kit/programlar/${file}`, import.meta.url))));
  m.reset();
  return m;
};

describe("Faz 10: deney programları (simülatörde, rehberdeki beklenen sonuç)", () => {
  it("Deney 10, gc-deneme.s: başlık, zamanlayıcı noktaları, UART yankısı, klavye kodları", () => {
    const m = romMachine("gc-deneme.s");
    m.run(300_000);
    expect(m.uartOutput).toBe("G/C KARTI: nokta = zamanlayici, yazilan = UART yankisi, [kod] = klavye\r\n");
    // RELOAD 250 × 4000 döngü = 1 000 000 döngü: 1 MHz'de saniyede bir nokta
    m.run(2_000_000);
    expect(m.uartOutput.endsWith("\n..")).toBe(true);
    m.uartSend("Selam");
    m.run(200_000);
    m.keyPress([0x1c, 0xf0, 0x1c]);
    m.run(200_000);
    expect(m.uartOutput.endsWith("..Selam[1C][F0][1C]")).toBe(true);
  });
});
