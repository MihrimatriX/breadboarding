// Faz 8'in bitişi: C programları BIOS üzerinde (cc --hedef bios). Programlar gerçek karttaki gibi
// monitöre UART'tan Intel HEX olarak yüklenir ve G 4000 ile çalışır; yılan oyunu VGA ekranda
// klavyeyle (PS/2) oynanır.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBios } from "../bios/build.ts";
import { MachineLink } from "../bios/simlink.ts";
import { intelHex, uploadHex } from "../bios/uploader.ts";
import { buildProgram, formatErrors, type BuildResult } from "../cc/index.ts";
import { loadLib } from "../cc/node.ts";
import { Machine } from "../emu/machine.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const bios = buildBios(read("../bios/bios.s"));
const LIB = loadLib();

function buildC(name: string): BuildResult {
  const b = buildProgram({ [name]: read(`../bios/ornekler/${name}`) }, [name], { lib: LIB, target: "bios" });
  if (b.errors.length) throw new Error(formatErrors(b.errors));
  return b;
}

function boot(): Machine {
  const m = new Machine();
  m.loadFlash(bios.flash);
  m.reset();
  expect(m.runUntil(() => m.uartOutput.endsWith("> "), 2_000_000)).toBe(true);
  return m;
}

/** Programı RAM'e koyup monitörden G 4000 ile başlatır. */
function start(m: Machine, b: BuildResult): void {
  for (const [s, e] of b.ranges) m.pokeCpu(s, b.image.subarray(s, e));
  m.uartSend("G 4000\r");
}

const screen = (m: Machine) => m.renderText();

/** VRAM'de bir karakteri ara: [x, y] */
function find(m: Machine, ch: number): [number, number] | null {
  for (let i = 0; i < 80 * 30; i++) if (m.video.vram[i * 2] === ch) return [i % 80, Math.floor(i / 80)];
  return null;
}

describe("cc --hedef bios", () => {
  it("yerleşim: kod 0x4000'dan, veri 0xA000'dan; giriş __reset = 0x4000", () => {
    const b = buildC("selam.c");
    expect(b.ranges[0][0]).toBe(0x4000);
    expect(b.symbols.get("__reset")).toBe(0x4000);
    for (const [s, e] of b.ranges) expect(s >= 0x4000 && e <= 0xf800).toBe(true);
  });

  it("selam.c: UART önyükleyicisiyle yüklenir, printf ekrana ve UART'a yazar, monitöre döner", async () => {
    const m = boot();
    const link = new MachineLink(m, true);
    m.uartOnOutput = (x) => link.push(x);
    const b = buildC("selam.c");
    const hex = intelHex(b.ranges.map(([s, e]) => ({ addr: s, data: b.image.subarray(s, e) })), 0x4000);
    const r = await uploadHex(link, hex, { mode: "ram", run: true });
    expect(r.ok, r.message).toBe(true);
    expect(m.runUntil(() => m.uartOutput.includes("Gecen sure") && m.uartOutput.endsWith("> "), 8_000_000)).toBe(true);
    expect(m.uartOutput).toContain("Merhaba, CPU16! Bu program C ile yazildi.");
    expect(m.uartOutput).toContain("fib(18) = 2584");
    expect(screen(m)).toContain("fib(18) = 2584");
  });

  it("yılan: tuşa basılmazsa duvara çarpar; Q monitöre döndürür", () => {
    const m = boot();
    start(m, buildC("yilan.c"));
    expect(m.runUntil(() => screen(m).includes("CPU16 YILAN") && screen(m).includes("Skor: 0"), 4_000_000)).toBe(true);
    expect(find(m, 0x02), "yılanın başı").not.toBeNull();
    expect(find(m, 0x04), "yem").not.toBeNull();
    // 20 adım × 120 ms sonra sağ duvar
    expect(m.runUntil(() => screen(m).includes("OYUN BITTI"), 16_000_000)).toBe(true);
    const out = m.uartOutput.length;
    m.typeText("q");
    expect(m.runUntil(() => m.uartOutput.length > out && m.uartOutput.endsWith("> "), 4_000_000)).toBe(true);
    expect(screen(m)).toContain("Yilan: rekor 0");
  }, 30_000);

  it("yılan: klavyeyle yeme gidilir, yılan uzar ve skor artar", () => {
    const m = boot();
    start(m, buildC("yilan.c"));
    expect(m.runUntil(() => screen(m).includes("Skor: 0"), 4_000_000)).toBe(true);
    let dir = "d";
    const opposite: Record<string, string> = { w: "s", s: "w", a: "d", d: "a" };
    // basit otomatik pilot: önce sütunu, sonra satırı yeme hizala (geri dönüş yasak)
    for (let i = 0; i < 4000 && !screen(m).includes("Skor: 40"); i++) {
      const head = find(m, 0x02);
      const food = find(m, 0x04);
      if (!head || !food) {
        m.run(10_000); // yem yeni yendi, yenisi konuyor
        continue;
      }
      let want = food[0] > head[0] ? "d" : food[0] < head[0] ? "a" : food[1] > head[1] ? "s" : "w";
      if (want === opposite[dir]) want = head[1] < 13 ? "s" : "w";
      if (want !== dir) {
        m.typeText(want);
        dir = want;
      }
      m.run(40_000);
    }
    expect(screen(m)).toContain("Skor: 40");
    m.run(100_000); // durum satırı printf'in ortasında olabilir: satırın bitmesini bekle (bir adımdan kısa)
    expect(screen(m)).toContain("Rekor: 40");
    expect(screen(m)).toContain("Uzunluk: 7");
    expect(screen(m)).not.toContain("OYUN BITTI");
  }, 60_000);
});
