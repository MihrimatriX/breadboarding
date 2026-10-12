// Kurulum belgelerinin bölüm işaretleri (cpu16/board/breadboard/bolum-belge.ts, bolum-cizim.ts): pano
// haritasında her bölge 3D görünümdekiyle aynı renkte bir çerçeve ve sığan bir etiket, komşu bölgeler ayrı
// renkte; her çip grubu bir bölgede; "Bölümler" her bölgeyi ve grubu anlatır; board çizimlerinin
// üstünde o board'daki grupların etiketleri.

import { beforeAll, describe, expect, it } from "vitest";
import { bolumleri } from "../board/bolum-bilgi.ts";
import { boardGruplari, bolumlerHtml, grupEtiketleri, haritaBolgeleri, katalogu, refOzeti } from "../board/breadboard/bolum-belge.ts";
import { boardCizimi } from "../board/breadboard/cizim.ts";
import { grupBolgeleri, panoBolgeleri } from "../board/bolum-cizim.ts";
import type { BbYerlesim } from "../board/breadboard/yerlesim.ts";
import { bbSahnesi, cpuBbYukle, kartModeli } from "../../src/board3d/aktif.ts";
import { sahneBolumleri } from "../../src/board3d/bolum.ts";

beforeAll(async () => {
  await cpuBbYukle();
});

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

const panolar = () => (["cpu16", "hesap"] as const).flatMap((tur) => bbSahnesi(tur).panolar.map((p) => ({ tur, p, k: katalogu(tur, kartModeli(tur).board) })));

describe("kurulum belgelerinde bölümler", () => {
  it("bölgeler 3D'deki çerçevelerle aynı renkte, komşular ayrı renkte, etiketleri sekmeye sığar", () => {
    let n = 0;
    for (const tur of ["cpu16", "hesap"] as const) {
      const sahne = new Map(sahneBolumleri(tur, "breadboard").cerceveler.map((c) => [c.id, c.renk]));
      const k = katalogu(tur, kartModeli(tur).board);
      for (const p of bbSahnesi(tur).panolar) {
        const b = panoBolgeleri(p.kart, p.plan.yerlesim.boards, k);
        expect(b.map((x) => x.id).sort()).toEqual(bolumleri(k, "bolge", p.kart).map((x) => x.id).sort());
        for (const x of b) expect(x.renk, x.id).toBe(sahne.get(x.id));
        for (const x of b) {
          for (const y of b) {
            const komsu = x !== y && x.hucreler.some((h) => y.hucreler.some((g) => Math.abs(h.i - g.i) + Math.abs(h.j - g.j) === 1));
            if (komsu) expect(x.renk, `${x.id} / ${y.id}`).not.toBe(y.renk);
          }
        }
        const svg = haritaBolgeleri(p.kart, p.plan.yerlesim.boards, k).svg;
        for (const x of b) expect(svg, x.id).toContain(`>${esc(k.bolumler.get(x.id)!.etiket)}</text>`);
        n += b.length;
      }
    }
    expect(n).toBe(48);
  });

  it("her çip grubu bir bölgede; Bölümler her bölgeyi ve grubu anlatır", () => {
    for (const { p, k } of panolar()) {
      const y = p.plan.yerlesim;
      const bolgesi = grupBolgeleri(p.kart, y, k);
      const gruplar = bolumleri(k, "grup", p.kart);
      for (const g of gruplar) expect(bolgesi.get(g.id), g.id).toBeDefined();
      const html = bolumlerHtml(p.kart, y, k, "Bölümler", "5. bölüm");
      for (const b of [...bolumleri(k, "bolge", p.kart), ...gruplar]) {
        expect(html, b.id).toContain(esc(b.etiket));
        expect(html, b.id).toContain(esc(b.gorev));
      }
      expect(html).not.toContain("Öbür gruplar");
    }
  });

  it("board'un grup satırları sığar, kalanlar +N", () => {
    for (const { p, k } of panolar()) {
      const y = p.plan.yerlesim;
      for (const b of y.boards) {
        const s = boardGruplari(p.kart, b.no, y, k, 49, 2.2);
        expect(s.length).toBeLessThanOrEqual(2);
        for (const t of s) expect(0.6 * 2.2 * t.length, `${p.kart} ${b.ad}: ${t}`).toBeLessThanOrEqual(49 + 1e-9);
        const toplam = new Set(y.parcalar.filter((q) => q.board === b.no).map((q) => k.grubu.get(q.ref)).filter(Boolean)).size;
        const metin = s.join(" · ");
        const arti = /\s\+(\d+)$/.exec(metin);
        const yazilan = metin ? metin.replace(/\s\+\d+$/, "").split(" · ").length : 0;
        expect(yazilan + (arti ? Number(arti[1]) : 0), `${p.kart} ${b.ad}: ${metin}`).toBe(toplam);
      }
    }
  });

  it("board çiziminin üstünde o board'daki grupların etiketleri", () => {
    for (const { p, k } of panolar().filter((x) => x.p.kart === "cpu" || x.p.kart === "hesap")) {
      const y = p.plan.yerlesim as unknown as BbYerlesim;
      const grup = grupEtiketleri(p.kart, p.plan.yerlesim, k);
      for (const b of y.boards.slice(0, 12)) {
        const svg = boardCizimi(y, b, [], () => "#000", { grup });
        const gs = new Set(y.parcalar.filter((q) => q.board === b.no && q.tur !== "kondansator").map((q) => k.grubu.get(q.ref)).filter((g): g is string => !!g));
        for (const g of gs) expect(svg, `${b.ad} ${g}`).toContain(`>${esc(k.bolumler.get(g)!.etiket)}</text>`);
        const ust = Number(/viewBox="-1 -(\d+\.\d+)/.exec(svg)![1]);
        expect(ust > 1, b.ad).toBe(gs.size > 0);
        expect(boardCizimi(y, b, [], () => "#000")).not.toContain(gs.size ? esc(k.bolumler.get([...gs][0])!.etiket) + "</text>" : "@@");
      }
    }
  });

  it("ref özeti: ardışık üç ve fazlası aralık", () => {
    expect(refOzeti(["U15", "U12", "U13", "U14", "U2"])).toBe("U2, U12–U15");
    expect(refOzeti(["U1", "U2", "R3"])).toBe("R3, U1, U2");
    expect(refOzeti(["BB06", "BB07", "BB08", "BB14"])).toBe("BB06–BB08, BB14");
  });
});
