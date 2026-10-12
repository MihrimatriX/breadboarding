// Bölüm açıklamaları (cpu16/board/bolum-bilgi.ts): her kartın her bloğunun, her breadboard bölgesinin
// metni var; çip grupları her mantık çipini tam bir kez kapsar; metinler boş değil, etiketler büyük
// harf ve kısa; aşamalar ve deneyler pano tanımlarıyla tutarlı.

import { describe, expect, it } from "vitest";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { anaBlok, bolumKatalogu, bolumleri, bolumSinyalleri, bolumZinciri, gruplanmazMi, kartMetinleri, refleriAc, sinyalOzeti, type BolumKatalogu } from "../board/bolum-bilgi.ts";
import { PANOLAR } from "../breadboard/panolar.ts";
import { buildHesapBoard } from "../../hesap8/kart.ts";
import { bbPlani } from "../../hesap8/breadboard/plan.ts";
import type { Board } from "../board/board.ts";

const cpu = buildFullMachineBoard().board;
const hesapKarti = buildHesapBoard();
const hesap = hesapKarti.board;
const katalog: Record<"cpu16" | "hesap", [Board, BolumKatalogu]> = {
  cpu16: [cpu, bolumKatalogu("cpu16", cpu)],
  hesap: [hesap, bolumKatalogu("hesap", hesap)],
};

const ETIKET_EN_UZUN = 28;

describe("bölüm kataloğu", () => {
  for (const [tur, [board, k]] of Object.entries(katalog)) {
    it(`${tur}: her kartın, her bloğun metni var`, () => {
      const kartlar = [...new Set(board.chips.map((c) => c.card))].sort();
      expect([...k.kartlar].sort()).toEqual(kartlar);
      for (const kart of kartlar) {
        expect(k.bolumler.has(`kart:${kart}`)).toBe(true);
        const bloklar = new Set([
          ...board.chips.filter((c) => c.card === kart).flatMap((c) => [c.block, anaBlok(c)]),
          ...board.passives.filter((p) => p.card === kart).map((p) => p.block),
        ]);
        for (const b of bloklar) expect(k.bolumler.get(`blok:${kart}:${b}`), `${kart}/${b}`).toBeDefined();
        // metinde fazladan (kartta olmayan) blok yok
        for (const b of Object.keys(kartMetinleri(kart).bloklar)) expect(bloklar.has(b), `${kart}: fazla blok metni ${b}`).toBe(true);
      }
    });

    it(`${tur}: gruplar her mantık çipini ve her pasifi (100 nF dışında) tam bir kez kapsar`, () => {
      const parcalar = [...board.chips.map((c) => c.ref), ...board.passives.filter((p) => !gruplanmazMi(p)).map((p) => p.ref)];
      for (const r of parcalar) expect(k.grubu.get(r), `${r} hiçbir grupta değil`).toBeDefined();
      const sayi = new Map<string, number>();
      for (const g of bolumleri(k, "grup")) for (const r of g.refs) sayi.set(r, (sayi.get(r) ?? 0) + 1);
      for (const [r, n] of sayi) expect(n, r).toBe(1);
      expect(sayi.size).toBe(parcalar.length);
    });

    it(`${tur}: bir grubun çipleri aynı blokta (yapıştırıcıda hizmet ettiği blok)`, () => {
      const cipler = new Map(board.chips.map((c) => [c.ref, c]));
      for (const g of bolumleri(k, "grup")) {
        const bloklar = new Set(g.refs.filter((r) => cipler.has(r)).map((r) => anaBlok(cipler.get(r)!)));
        expect(bloklar.size, `${g.id}: ${[...bloklar].join(", ")}`).toBeLessThanOrEqual(1);
        expect(g.ust).toBe(`blok:${g.kart}:${g.blok}`);
      }
    });

    it(`${tur}: metinler dolu, etiketler BÜYÜK HARF ve kısa, kimlikler tekil`, () => {
      for (const b of k.bolumler.values()) {
        for (const alan of ["etiket", "baslik", "gorev", "nasil"] as const) expect(b[alan].trim().length, `${b.id}.${alan}`).toBeGreaterThan(0);
        // birimler (kHz, MHz) kendi yazımıyla kalır
        const birimsiz = b.etiket.replace(/\b[kM]Hz\b/g, "");
        expect(birimsiz, b.id).toBe(birimsiz.toLocaleUpperCase("tr-TR"));
        expect(b.etiket.length, `${b.id}: ${b.etiket}`).toBeLessThanOrEqual(ETIKET_EN_UZUN);
        expect(/[.?)]$/.test(b.gorev.trim()), `${b.id} görev cümlesi`).toBe(true);
        expect(/[.?)]$/.test(b.nasil.trim()), `${b.id} nasıl cümlesi`).toBe(true);
        // başlık cümle düzeninde: yalnız kısaltmalar (VRAM, EEPROM (28C256)) büyük harf
        expect(b.baslik === b.baslik.toLocaleUpperCase("tr-TR") && b.baslik.length > 16, `${b.id}: başlık büyük harf`).toBe(false);
        if (b.ust) expect(k.bolumler.get(b.ust)?.alt).toContain(b.id);
      }
    });
  }

  it("CPU16: her breadboard bölgesinin metni var, aşamaları pano tanımındaki deneylerle", () => {
    const [, k] = katalog.cpu16;
    for (const p of PANOLAR) {
      for (const b of Object.values(p.bolgeler)) {
        const x = k.bolumler.get(`bolge:${p.kart}:${b.ad}`);
        expect(x, `${p.kart}/${b.ad}`).toBeDefined();
        expect(x!.asamalar.length, `${p.kart}/${b.ad} aşaması`).toBeGreaterThan(0);
        for (const blok of b.bloklar) expect(k.bolumler.get(`blok:${p.kart}:${blok}`)?.ust).toBe(x!.id);
      }
      // deney numaraları kurulum aşamalarındakiler
      const deneyler = new Set(p.asamalar.map((a) => a.deney).filter((d) => d !== undefined));
      for (const b of bolumleri(k, "blok", p.kart)) for (const a of b.asamalar) if (a.deney !== undefined) expect(deneyler.has(a.deney)).toBe(true);
    }
    expect(bolumleri(k, "bolge").length).toBe(PANOLAR.reduce((s, p) => s + Object.keys(p.bolgeler).length, 0));
  });

  it("hesap: her board rolünün metni var, aşaması board'unkiyle aynı", () => {
    const [, k] = katalog.hesap;
    const plan = bbPlani(hesapKarti);
    const roller = new Map(plan.yerlesim.boards.map((b) => [b.rol, b.asama]));
    for (const [rol, asama] of roller) {
      const x = k.bolumler.get(`bolge:hesap:${rol}`);
      expect(x, rol).toBeDefined();
      expect(x!.asamalar.map((a) => a.no), rol).toEqual([asama]);
    }
    expect(bolumleri(k, "bolge").length).toBe(roller.size);
  });

  it("sayılar: CPU16 7 kart, 61 blok, 25 bölge; hesap 14 blok, 19 bölge", () => {
    const [, c] = katalog.cpu16;
    const [, h] = katalog.hesap;
    expect(bolumleri(c, "kart").length).toBe(7);
    expect(bolumleri(c, "blok").length).toBe(61);
    expect(bolumleri(c, "bolge").length).toBe(25);
    expect(bolumleri(h, "blok").length).toBe(14);
    expect(bolumleri(h, "bolge").length).toBe(19);
    expect(bolumleri(c, "grup").length).toBeGreaterThan(150);
    expect(bolumleri(h, "grup").length).toBeGreaterThan(50);
  });

  it("zincir: grup → blok → bölge → kart", () => {
    const [, k] = katalog.cpu16;
    const z = bolumZinciri(k, k.grubu.get("U19")!);
    expect(z.map((b) => b.tur)).toEqual(["kart", "bolge", "blok", "grup"]);
    expect(z[3].etiket).toBe("R0");
    expect(z[2].blok).toBe("Register dosyası");
    // yapıştırıcı çip hizmet ettiği bloğun grubunda
    expect(k.grubu.get("U133")).toBe("grup:cpu:register-saatleri");
  });

  it("sinyaller: dış netler önekleriyle kısaltılır, besleme ve adsız netler yok", () => {
    const [, k] = katalog.cpu16;
    const r0 = k.bolumler.get("grup:cpu:r0")!;
    const s = bolumSinyalleri(cpu, r0.refs);
    expect(s[0]).toBe("BUS0–15");
    expect(s).toContain("CLK_R0");
    expect(s).toContain("~ROE0");
    expect(s.join(" ")).not.toMatch(/\bVCC\b|\bGND\b/);
    expect(sinyalOzeti(["A0", "A1", "A2", "A5", "CLK"])).toEqual(["A0–2, 5", "CLK"]);
    expect(refleriAc("U1 U3-U5 D2")).toEqual(["U1", "U3", "U4", "U5", "D2"]);
  });
});
