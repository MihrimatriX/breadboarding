// Bölüm etiketlerinin sahnedeki yerleri (src/board3d/bolumSahne.ts, bolum.ts): breadboard'da her bölge
// kapalı bir çerçeve ve plakası bölgenin içinde, PCB'de her blok; komşu çerçeveler ayrı renkte, renkler
// zeminlerinde okunur; plakalar üst üste binmez; kenar etiketleri sıralarını koruyup çakışmadan dizilir.

import { beforeAll, describe, expect, it } from "vitest";
import { bolumleri } from "../board/bolum-bilgi.ts";
import { bbSahnesi, cpuBbYukle, kartModeli } from "../../src/board3d/aktif.ts";
import { katalog, sahneBolumleri, useBolum } from "../../src/board3d/bolum.ts";
import {
  BB_RENKLERI, boya, girisNoktasi, hucreSiniri, kapasite, kenarYerlesimi, PCB_RENKLERI, plakaSigdir, tamDikdortgenler, type Kutu, type SahneBolumleri,
} from "../../src/board3d/bolumSahne.ts";
import { useKart } from "../../src/board3d/store.ts";

beforeAll(async () => {
  await cpuBbYukle();
});

/** Parçaların uçları ikişer kez geçiyorsa çizgi kapalıdır */
function kapaliMi(k: number[]): boolean {
  const say = new Map<string, number>();
  for (let i = 0; i < k.length; i += 2) {
    const a = `${k[i].toFixed(3)},${k[i + 1].toFixed(3)}`;
    say.set(a, (say.get(a) ?? 0) + 1);
  }
  return [...say.values()].every((n) => n % 2 === 0);
}

const icinde = (a: Kutu, b: Kutu, pay = 0.01) => a.x >= b.x - pay && a.y >= b.y - pay && a.x + a.w <= b.x + b.w + pay && a.y + a.h <= b.y + b.h + pay;
const cakisir = (a: Kutu, b: Kutu) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
const plakaKutusu = (p: { x: number; y: number; w: number; d: number }): Kutu => ({ x: p.x - p.w / 2, y: p.y - p.d / 2, w: p.w, h: p.d });

describe("çerçeve geometrisi", () => {
  it("tek hücre: içe kaymış dikdörtgen; L biçimi: kapalı tek çizgi", () => {
    const k = hucreSiniri([{ i: 0, j: 0 }], 0, 0, 10, 5, 1);
    expect(k.length).toBe(16);
    const xs = k.filter((_, i) => i % 2 === 0);
    const ys = k.filter((_, i) => i % 2 === 1);
    expect([Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)]).toEqual([1, 9, 1, 4]);
    expect(kapaliMi(k)).toBe(true);
    const l = hucreSiniri([{ i: 0, j: 0 }, { i: 1, j: 0 }, { i: 0, j: 1 }], 0, 0, 10, 10, 1);
    expect(kapaliMi(l)).toBe(true);
    // iç köşe (10, 10) bölgenin içine doğru (9, 9) noktasına kayar
    const noktalar = new Set(Array.from({ length: l.length / 2 }, (_, i) => `${l[2 * i]},${l[2 * i + 1]}`));
    expect(noktalar.has("9,9")).toBe(true);
    expect(noktalar.has("19,1") && noktalar.has("1,19")).toBe(true);
  });

  it("tam dikdörtgenler ve boyama", () => {
    // AAAAA / AAAAA / AAAAA / AAAAB (CPU kartının ALU bölgesi)
    const h = [0, 1, 2].flatMap((j) => [0, 1, 2, 3, 4].map((i) => ({ i, j }))).concat([0, 1, 2, 3].map((i) => ({ i, j: 3 })));
    const var_ = new Set(h.map((x) => `${x.i},${x.j}`));
    const d = tamDikdortgenler(h);
    for (const r of d) for (let i = r.i0; i <= r.i1; i++) for (let j = r.j0; j <= r.j1; j++) expect(var_.has(`${i},${j}`)).toBe(true);
    expect(d).toContainEqual({ i0: 0, j0: 0, i1: 4, j1: 2 });
    expect(d).toContainEqual({ i0: 0, j0: 0, i1: 3, j1: 3 });
    expect(d).not.toContainEqual({ i0: 0, j0: 0, i1: 4, j1: 3 });
    const r = boya(4, (a, b) => Math.abs(a - b) === 1, 2);
    expect(r).toEqual([0, 1, 0, 1]);
  });

  it("plaka yazısı kutuya sığar; dar kutuda iki satır", () => {
    const olc = (s: string) => s.length * 0.7;
    const genis = plakaSigdir("REGISTER DOSYASI", 800, 200, olc, 40);
    expect(genis.satirlar).toEqual(["REGISTER DOSYASI"]);
    expect(genis.h).toBe(40);
    const dar = plakaSigdir("OSİLATÖR VE RESET", 150, 50, olc, 40);
    expect(dar.satirlar.length).toBe(2);
    expect(dar.w).toBeLessThanOrEqual(150 + 1e-9);
    expect(dar.d).toBeLessThanOrEqual(50 + 1e-9);
  });
});

describe("sahnenin bölümleri", () => {
  const sahneler: [string, () => SahneBolumleri, "cpu16" | "hesap"][] = [
    ["CPU16 breadboard", () => sahneBolumleri("cpu16", "breadboard"), "cpu16"],
    ["hesap breadboard", () => sahneBolumleri("hesap", "breadboard"), "hesap"],
    ["CPU16 PCB", () => sahneBolumleri("cpu16", "pcb"), "cpu16"],
    ["hesap PCB", () => sahneBolumleri("hesap", "pcb"), "hesap"],
  ];
  for (const [ad, sahne, tur] of sahneler) {
    it(`${ad}: her bölge (PCB'de blok) kapalı bir çerçeve, plakası içinde; plakalar çakışmaz`, () => {
      const s = sahne();
      const k = katalog(tur);
      const pcb = ad.endsWith("PCB");
      const beklenen = bolumleri(k, pcb ? "blok" : "bolge").map((b) => b.id).sort();
      expect(s.cerceveler.map((c) => c.id).sort()).toEqual(beklenen);
      for (const c of s.cerceveler) {
        expect(kapaliMi(c.kenarlar), c.id).toBe(true);
        const p = s.plakalar.find((x) => x.id === c.id)!;
        expect(p, c.id).toBeDefined();
        expect(icinde(plakaKutusu(p), c.kutu), `${c.id} plakası çerçevesinde`).toBe(true);
        expect(p.h, `${c.id} yazısı`).toBeGreaterThan(pcb ? 1.5 : 8);
        // her kenar çizgisi kutunun içinde
        for (let i = 0; i < c.kenarlar.length; i += 2) expect(icinde({ x: c.kenarlar[i], y: c.kenarlar[i + 1], w: 0, h: 0 }, c.kutu)).toBe(true);
      }
      const p = s.plakalar.map(plakaKutusu);
      for (let a = 0; a < p.length; a++) for (let b = a + 1; b < p.length; b++) expect(cakisir(p[a], p[b]), `${s.plakalar[a].id} × ${s.plakalar[b].id}`).toBe(false);
    });

    it(`${ad}: komşu çerçeveler ayrı renkte; her parçanın çerçevesi kendi kartında`, () => {
      const s = sahne();
      const pay = ad.endsWith("PCB") ? 8 : 2;
      for (let a = 0; a < s.cerceveler.length; a++) {
        for (let b = a + 1; b < s.cerceveler.length; b++) {
          const [A, B] = [s.cerceveler[a], s.cerceveler[b]];
          const komsu = A.kart === B.kart && cakisir({ x: A.kutu.x - pay, y: A.kutu.y - pay, w: A.kutu.w + 2 * pay, h: A.kutu.h + 2 * pay }, B.kutu);
          if (komsu) expect(A.renk, `${A.id} / ${B.id}`).not.toBe(B.renk);
        }
      }
      const { board } = kartModeli(tur);
      const kartOf = new Map([...board.chips.map((c) => [c.ref, c.card] as const), ...board.passives.map((p) => [p.ref, p.card] as const)]);
      for (const [ref, n] of s.parcaCercevesi) if (kartOf.has(ref)) expect(s.cerceveler[n].kart, ref).toBe(kartOf.get(ref));
      // her mantık çipinin bir çerçevesi var
      for (const c of board.chips) expect(s.parcaCercevesi.has(c.ref), c.ref).toBe(true);
    });
  }

  it("kart plakaları: bilgisayarda her pano için bir tane, panonun dışında", () => {
    const s = sahneBolumleri("cpu16", "breadboard");
    const kartlar = s.plakalar.filter((p) => p.tur === "kart");
    expect(kartlar.map((p) => p.id).sort()).toEqual(bbSahnesi("cpu16").panolar.map((p) => `kart:${p.kart}`).sort());
    for (const p of kartlar) {
      const k = s.kartKutusu.get(p.id.slice(5))!;
      expect(cakisir(plakaKutusu(p), k), p.id).toBe(false);
    }
    expect(sahneBolumleri("hesap", "breadboard").plakalar.filter((p) => p.tur === "kart").length).toBe(1);
  });
});

describe("renkler", () => {
  const isik = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255).map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const oran = (a: string, b: string) => {
    const [x, y] = [isik(a), isik(b)].sort((p, q) => q - p);
    return (x + 0.05) / (y + 0.05);
  };
  const ton = (hex: string) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const mx = Math.max(r, g, b);
    const mn = Math.min(r, g, b);
    if (mx === mn) return { h: 0, s: 0 };
    const d = mx - mn;
    const h = mx === r ? ((g - b) / d + 6) % 6 : mx === g ? (b - r) / d + 2 : (r - g) / d + 4;
    return { h: h * 60, s: d / mx };
  };
  it("breadboard çizgileri krem board'da ve iki temanın sahne zemininde en az 3:1", () => {
    for (const c of BB_RENKLERI) {
      for (const z of ["#f2eee3", "#d7dce3", "#121519"]) expect(oran(c, z), `${c} / ${z}`).toBeGreaterThanOrEqual(3);
    }
  });
  it("PCB çizgileri koyu yeşil kartta en az 3:1", () => {
    for (const c of PCB_RENKLERI) expect(oran(c, "#0f3d2c"), c).toBeGreaterThanOrEqual(3);
  });
  it("kırmızı yok (kırmızı hata ve lojik 1 için)", () => {
    for (const c of [...BB_RENKLERI, ...PCB_RENKLERI]) {
      const { h, s } = ton(c);
      expect(s < 0.25 || (h > 25 && h < 335), c).toBe(true);
    }
  });
});

describe("kenar etiketleri", () => {
  it("sıralı, çakışmasız, sınırların içinde; tek kutu istediği yerde", () => {
    const tek = kenarYerlesimi([{ id: "a", y: 300 }], 10, 600, 30, 6);
    expect(tek.get("a")).toBe(285);
    let tohum = 7;
    const rastgele = () => ((tohum = (tohum * 16807) % 2147483647) / 2147483647);
    for (let deneme = 0; deneme < 200; deneme++) {
      const ust = 10 + rastgele() * 100;
      const alt = 400 + rastgele() * 400;
      const kap = kapasite(ust, alt, 30, 6);
      const n = 1 + Math.floor(rastgele() * kap);
      const istek = Array.from({ length: n }, (_, i) => ({ id: `g${i}`, y: rastgele() * 900 - 50 }));
      const yer = kenarYerlesimi(istek, ust, alt, 30, 6);
      const sirali = [...istek].sort((a, b) => a.y - b.y).map((x) => yer.get(x.id)!);
      for (let i = 0; i < sirali.length; i++) {
        expect(sirali[i]).toBeGreaterThanOrEqual(ust - 1e-6);
        expect(sirali[i] + 30).toBeLessThanOrEqual(alt + 1e-6);
        if (i) expect(sirali[i] - sirali[i - 1]).toBeGreaterThanOrEqual(36 - 1e-6);
      }
    }
  });
  it("çakışan iki kutu istedikleri yerlerin ortasına oturur", () => {
    const yer = kenarYerlesimi([{ id: "a", y: 300 }, { id: "b", y: 310 }], 0, 1000, 30, 6);
    const a = yer.get("a")!;
    const b = yer.get("b")!;
    expect(b - a).toBeCloseTo(36);
    expect((a + b) / 2 + 15).toBeCloseTo(305);
  });
  it("çizgi parçanın çevresine girdiği yerde biter", () => {
    const kare: [number, number][] = [[10, 10], [20, 10], [20, 20], [10, 20]];
    expect(girisNoktasi([0, 15], [15, 15], kare)).toEqual([10, 15]);
    expect(girisNoktasi([15, 15], [16, 16], kare)).toEqual([16, 16]);
  });
});

describe("bölüm durumu", () => {
  it("E kipler arasında döner; bölüm seçmek çip seçimini kaldırır", () => {
    const b = useBolum.getState();
    expect(b.kip).toBe("ayrintili");
    b.kipDegistir();
    expect(useBolum.getState().kip).toBe("kapali");
    useBolum.getState().kipDegistir();
    expect(useBolum.getState().kip).toBe("bolumler");
    useBolum.getState().kipSec("ayrintili");
    useKart.getState().selectChip("U19");
    useBolum.getState().sec("grup:cpu:r0");
    expect(useBolum.getState().secili).toBe("grup:cpu:r0");
    expect(useKart.getState().chip).toBe(null);
    // olmayan bölüm seçilmez
    useBolum.getState().sec("grup:cpu:yok");
    expect(useBolum.getState().secili).toBe("grup:cpu:r0");
    useBolum.getState().sec(null);
    expect(useBolum.getState().secili).toBe(null);
  });
});
