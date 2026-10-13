// Faz 9: kart testi. Gerçek kart, simülatörün geçtiği aynı programları UART üzerinden çalıştırır ve
// çıktıları bayt bayt karşılaştırılır. Burada karşı taraf da simülatördür: önce düzgün bir makine
// (hepsi geçmeli), sonra bilerek bozulmuş bir makine (ilgili test kalmalı).

import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildBios } from "../bios/build.ts";
import { beklenenCiktilar, ilkFark, kartTesti, kartTestProgramlari, simMakinesi, sonucMetni } from "../bios/kart-testi.ts";
import { MachineLink } from "../bios/simlink.ts";
import { loadLib } from "../cc/node.ts";

const dir = new URL("../bios/testler/", import.meta.url);
const kaynak = Object.fromEntries(readdirSync(dir).map((f) => [f, readFileSync(new URL(f, dir), "utf8")]));
const bios = buildBios(readFileSync(new URL("../bios/bios.s", import.meta.url), "utf8"));
const programlar = kartTestProgramlari(kaynak, loadLib());

describe("Faz 9: kart testi (UART üzerinden simülatörle karşılaştırma)", async () => {
  const beklenen = await beklenenCiktilar(programlar, bios.flash);

  it("dört test programı derlenir; simülatördeki çıktılar doğru", () => {
    expect(programlar.map((p) => p.ad)).toEqual(["1-cpu.c", "2-bellek.s", "3-onbellek.s", "4-gc-video.c"]);
    // ALU sağlama toplamları bilgisayarda (Python, 16 bit) ayrıca hesaplandı
    expect(beklenen[0]).toContain("ADD 579b  SUB 20a1  AND 4a43  OR  13cd");
    expect(beklenen[0]).toContain("XOR 598e  SHL 04ce  SHR 07d9  SAR fa06");
    expect(beklenen[0]).toContain("MUL 38da  DIV 5a95  MOD 8188  CMP 61a0");
    expect(beklenen[0]).toContain("long toplam 20a2cbec");
    expect(beklenen[0]).toContain("fib(20) = 6765");
    expect(beklenen[1]).toContain("BELLEK OK");
    expect(beklenen[2].match(/EVET/g)?.length).toBe(4);
    expect(beklenen[3]).toContain("VRAM: 2400 hucre yazildi ve okundu");
  });

  it("sağlam kart: dört test de geçer", async () => {
    const m = simMakinesi(bios.flash);
    const link = new MachineLink(m, true);
    m.uartOnOutput = (b) => link.push(b);
    const sonuc = await kartTesti(link, programlar, beklenen);
    expect(sonuc.map((s) => [s.ad, s.ok, s.mesaj])).toEqual(programlar.map((p) => [p.ad, true, ""]));
  });

  it("bozuk kart: VRAM'in D6 veri hattı kopuk; yalnızca video testi kalır ve farkı gösterir", async () => {
    const m = simMakinesi(bios.flash);
    const yaz = m.video.writeData.bind(m.video);
    m.video.writeData = (v: number) => yaz(v & ~0x40); // VRAM'e giden 6. veri biti hep 0
    const link = new MachineLink(m, true);
    m.uartOnOutput = (b) => link.push(b);
    const sonuc = await kartTesti(link, programlar, beklenen);
    expect(sonuc.map((s) => s.ok)).toEqual([true, true, true, false]);
    expect(sonuc[3].mesaj).toMatch(/^satır 3: beklenen "VRAM: 2400 hucre yazildi ve okundu", gelen "VRAM: \d+ hucre hatali, ilki \d+"$/);
  });

  it("İngilizce arayüz: fark ve özet İngilizce, Türkçe varsayılan değişmedi", () => {
    expect(ilkFark("a\nb", "a\nc", "en")).toBe('line 2: expected "b", got "c"');
    expect(ilkFark("a", "a\nx", "en")).toBe('line 2: expected "(none)", got "x"');
    expect(ilkFark("a\nb", "a\nc")).toBe('satır 2: beklenen "b", gelen "c"');
    const sonuc = programlar.map((p, i) => ({ ad: p.ad, ok: i > 0, beklenen: "", gelen: "", mesaj: i > 0 ? "" : "fark" }));
    const en = sonucMetni(programlar, sonuc, "en").split("\n");
    expect(en[0]).toMatch(/^FAIL {3}/);
    expect(en.at(-1)).toBe(`${programlar.length - 1}/${programlar.length} tests passed`);
    expect(sonucMetni(programlar, sonuc).split("\n").at(-1)).toBe(`${programlar.length - 1}/${programlar.length} test geçti`);
  });
});
