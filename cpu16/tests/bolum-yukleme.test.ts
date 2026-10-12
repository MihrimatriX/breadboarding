// Bilgisayarın breadboard verisi ayrı bir parça ve görünüm seçilince yüklenir. Mimari bölümündeki "3D'de
// göster" bir bölümü bu veri gelmeden seçebilir: bölüm rengi o arada da hata vermemeli (vurgu mavisi),
// veri gelince bölgenin çerçeve rengi olmalı. Bu dosya veriyi kendisi yükler: başka testlerle paylaşmaz.

import { describe, expect, it } from "vitest";
import { cpuBbHazir, cpuBbYukle } from "../../src/board3d/aktif.ts";
import { bolumRengi, sahneBolumleri } from "../../src/board3d/bolum.ts";

describe("breadboard verisi yüklenmeden bölüm", () => {
  const id = "blok:cpu:Register dosyası";

  it("renk istenince hata yok, vurgu mavisi döner", () => {
    expect(cpuBbHazir()).toBe(false);
    expect(() => bolumRengi(id, "cpu16", "breadboard")).not.toThrow();
    expect(bolumRengi(id, "cpu16", "breadboard")).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("veri gelince çerçevenin rengi", async () => {
    await cpuBbYukle();
    const s = sahneBolumleri("cpu16", "breadboard");
    expect(s.cerceveler.map((c) => c.renk)).toContain(bolumRengi(id, "cpu16", "breadboard"));
  });
});
