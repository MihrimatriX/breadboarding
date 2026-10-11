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

/** FF00'a yazılan değerler: G/Ç kartından önceki deneylerde bunlar test kartının 8 LED'idir */
const ledler = (m: Machine, her?: (v: number) => void) => {
  const l: { v: number; c: number }[] = [];
  m.onAccess = (w, a, v, c) => {
    if (!w || a !== 0xff00) return;
    l.push({ v, c });
    her?.(v);
  };
  return l;
};
const sira = (a: number, b: number) => Array.from({ length: b - a + 1 }, (_, i) => a + i);

describe("Faz 10: deney programları (simülatörde, rehberdeki beklenen sonuç)", () => {
  it("Deney 8, bellek-deneme.s: 32 bank iki desenle, boş bölge 0xFFFF, sonra 0xA5 ve kayan ışık", () => {
    const m = romMachine("bellek-deneme.s");
    const l = ledler(m);
    m.run(48_000_000); // 1 MHz'de ≈ 46 s sınama + kayan ışık
    const v = l.map((x) => x.v);
    const yaz = sira(0x20, 0x3f), ters = sira(0x60, 0x7f);
    expect(v.slice(0, 129)).toEqual([...yaz, ...yaz, ...ters, ...ters, 0xa5]);
    expect(v.slice(129, 137)).toEqual([1, 2, 4, 8, 16, 32, 64, 128]);
    expect(m.cache.enabled).toBe(false);
  });

  it("Deney 8: bozuk bir bellek hücresi LED'de 0x80 | bank olarak görünür, r1 adresi tutar", () => {
    const m = romMachine("bellek-deneme.s");
    let n = 0;
    // yazma geçişi bittikten sonra (33. LED: okuma geçişinin ilk bankı) bank 40'ın 0x100 ofsetinde bir bit boz
    const l = ledler(m, () => {
      if (++n === 33) m.ram[(40 - 32) * 0x4000 + 0x100] ^= 0x04;
    });
    m.run(20_000_000);
    expect(l.at(-1)!.v).toBe(0x80 | 40);
    expect(m.cpu.regs[1]).toBe(0x4100);
    expect(m.cpu.regs[0] ^ m.cpu.regs[2]).toBe(0x04);
  });

  it("Deney 9, onbellek-deneme.s: bit 7 önbellek durumu, önbellek açıkken kayan ışık ≈ 1,4 kat hızlı", () => {
    const m = romMachine("onbellek-deneme.s");
    const l = ledler(m);
    m.run(8_000_000);
    const isik = [1, 2, 4, 8, 16, 32, 64];
    expect(l.slice(0, 21).map((x) => x.v)).toEqual([...isik.map((b) => 0x80 | b), ...isik, ...isik.map((b) => 0x80 | b)]);
    const adim = (i: number) => l[i + 1].c - l[i].c;
    const acik = adim(2), kapali = adim(9);
    expect(kapali / acik).toBeGreaterThan(1.35);
  });

  it("Deney 11, video-deneme.s: Merhaba, 16 renk çubuğu ve VSYNC kare sayacı", () => {
    const m = romMachine("video-deneme.s");
    m.run(2_000_000); // 30 kare (kare = 66 667 döngü)
    const satir = m.renderText().split("\n");
    expect(satir[2]).toBe("    Merhaba, CPU16!");
    expect(satir[6].trim()).toBe("0   1   2   3   4   5   6   7   8   9   A   B   C   D   E   F");
    expect(satir[8].trim()).toBe("kare: 001E");
    const vram = m.video.vram;
    const renk = (row: number, col: number) => vram[(row * 80 + col) * 2 + 1];
    expect(sira(0, 63).map((i) => renk(5, 8 + i))).toEqual(sira(0, 63).map((i) => (i >> 2) << 4));
    expect([renk(0, 0), renk(29, 79), renk(2, 4)]).toEqual([0x1f, 0x1f, 0x1e]);
  });

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
