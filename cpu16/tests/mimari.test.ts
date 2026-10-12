// Mimari diyagramları (cpu16/mimari): çizilen her kutu ve yol devreye uyuyor mu. Denetimlerin
// ayrıntısı cpu16/mimari/denetim.ts'te; burada CPU kartı ve bütün bilgisayar için çalıştırılır,
// arka panel şeritlerinin tamlığı (her kart kullandığı her şeride bağlı) ayrıca denetlenir.
// Hesap makinesinin diyagramı: hesap8/tests/mimari.test.ts.

import { describe, expect, it } from "vitest";
import { agac, CSS_PALETI, svgMetni } from "../mimari/agac.ts";
import { blokDenetimi, diyagramiDenetle, sayiDenetimi, ucDurumu, yolDenetimi } from "../mimari/denetim.ts";
import { diyagramKur, DIYAGRAMLAR } from "../mimari/index.ts";
import { MAKINE_KARTLARI } from "../mimari/makine.ts";
import { Devre, netOzeti, type Diyagram } from "../mimari/model.ts";
import { temaPaleti } from "../mimari/palet.ts";

describe("mimari diyagramları: CPU kartı ve bütün bilgisayar", () => {
  for (const id of ["cpu", "makine"] as const) {
    describe(id, () => {
      const k = diyagramKur(id);
      it("yerleşim hatasız (yazılar kutulara sığıyor, her kolun ucu bir yerde)", () => {
        expect(k.sahne.hatalar).toEqual([]);
      });
      it("her blok tam bir kutuda (ya da çerçevede)", () => {
        expect(blokDenetimi(k.diyagram, k.devre)).toEqual([]);
      });
      it("her yol gerçek netlere bağlı, okların yönü pinlere uyuyor", () => {
        expect(yolDenetimi(k.diyagram, k.devre)).toEqual([]);
      });
      it("kutulardaki parça sayıları devreyle aynı", () => {
        expect(sayiDenetimi(k)).toEqual([]);
      });
    });
  }

  it("CPU kartının bütün blokları diyagramda", () => {
    const k = diyagramKur("cpu");
    const bloklar = k.devre.kartBloklari("cpu").map((b) => b.block);
    expect(bloklar.length).toBeGreaterThanOrEqual(12);
    const kutularda = k.diyagram.kutular.flatMap((x) => x.bloklar.map((b) => b.block));
    expect(kutularda.sort()).toEqual([...bloklar].sort());
  });

  it("bilgisayarın her kartının her bloğu diyagramda; çerçeveler 444 entegrenin hepsini kapsıyor", () => {
    const k = diyagramKur("makine");
    const say = k.diyagram.gruplar.filter((g) => g.id !== "arka").length;
    expect(say).toBe(MAKINE_KARTLARI.length);
    expect(blokDenetimi(k.diyagram, k.devre)).toEqual([]);
    expect(k.sahne.baslik.some((m) => m.m.includes(`${k.devre.board.chips.length} entegre`))).toBe(true);
  });

  it("arka panel: her kart kullandığı her şeride bir kolla bağlı, kullanmadığına bağlı değil", () => {
    const k = diyagramKur("makine");
    const seritler = k.diyagram.yollar.filter((y) => y.govde?.length);
    expect(seritler.length).toBeGreaterThanOrEqual(8);
    const hatalar: string[] = [];
    for (const y of seritler) {
      for (const card of MAKINE_KARTLARI) {
        const bloklar = k.devre.kartBloklari(card).filter((b) => b.block !== "Besleme ve arka panel");
        const d = ucDurumu(k.devre, y.netler, bloklar);
        const kullanir = d.surer || d.okur;
        const uc = y.uclar.find((u) => u.kutu === card);
        if (kullanir && !uc) hatalar.push(`${card} ${y.id} şeridini kullanıyor (${d.surer ? "sürer" : ""}${d.okur ? " okur" : ""}) ama kolu yok`);
        if (!kullanir && uc) hatalar.push(`${card} ${y.id} şeridine bağlı çizilmiş ama kullanmıyor`);
      }
      // kolların sayısı uçların sayısı kadar (her uca tam bir kol)
      expect(y.kollar.length, y.id).toBe(y.uclar.length);
    }
    expect(hatalar).toEqual([]);
  });

  it("arka panel şeritleri 64 hattın bütün sinyallerini taşıyor (besleme, HALTED / FAULT ve boşlar hariç)", () => {
    const k = diyagramKur("makine");
    const bp = k.devre.board.passives.filter((p) => p.part === "BACKPLANE_2x32");
    const sinyaller = new Set<string>();
    for (const p of bp) for (const n of Object.values(p.pins)) {
      const ad = k.devre.board.netName(n);
      if (n === k.devre.board.c.GND || n === k.devre.board.c.VCC) continue;
      // yalnız bir kartın kullandığı hatlar (HALTED, FAULT: CPU kartının LED'leri) şeritte gösterilmez
      const kartlar = new Set(k.devre.netUclari(n).filter((u) => !u.part.startsWith("BACKPLANE")).map((u) => u.card));
      if (kartlar.size > 1) sinyaller.add(ad);
    }
    const seritte = new Set(k.diyagram.yollar.filter((y) => y.govde?.length).flatMap((y) => y.netler));
    expect([...sinyaller].filter((s) => !seritte.has(s))).toEqual([]);
    expect(sinyaller.size).toBeGreaterThanOrEqual(48);
  });

  it("CPU kartında iç veri yolu 16 bit, sekiz birime bağlı; adres yolu MAR'dan arka panele", () => {
    const k = diyagramKur("cpu");
    const veri = k.diyagram.yollar.find((y) => y.id === "veri")!;
    expect(veri.netler).toHaveLength(16);
    expect(veri.uclar).toHaveLength(8);
    const adres = k.diyagram.yollar.find((y) => y.id === "adres")!;
    expect(adres.uclar.find((u) => u.yon === "cikis")?.kutu).toBe("marir");
    expect(netOzeti(adres.netler)).toBe("A0–A15");
  });

  it("denetim bozuk bir diyagramı yakalar (ters ok, olmayan net, eksik blok, yanlış sayı)", () => {
    const k = diyagramKur("cpu");
    const bozuk: Diyagram = structuredClone({ ...k.diyagram, yollar: k.diyagram.yollar.map((y) => ({ ...y })) });
    // ALU veri yolunu sürer: "giriş" çizilirse yakalanmalı
    const veri = bozuk.yollar.find((y) => y.id === "veri")!;
    veri.uclar = veri.uclar.map((u) => (u.kutu === "alu" ? { ...u, yon: "giris" as const } : u));
    veri.netler = [...veri.netler, "YOK_BOYLE_NET"];
    bozuk.kutular = bozuk.kutular.filter((x) => x.id !== "pc");
    const hatalar = [...yolDenetimi(bozuk, k.devre), ...blokDenetimi(bozuk, k.devre)];
    expect(hatalar.some((h) => h.includes("alu giriş gösteriliyor"))).toBe(true);
    expect(hatalar.some((h) => h.includes("YOK_BOYLE_NET"))).toBe(true);
    expect(hatalar.some((h) => h.includes("Program sayacı"))).toBe(true);
    // yazan sayı değişirse
    const sahne = structuredClone(k.sahne);
    const reg = sahne.kutular.find((x) => x.id === "reg")!;
    const satir = reg.metinler.find((m) => m.s === "parca")!;
    satir.m = satir.m.replace("×16", "×15");
    expect(sayiDenetimi({ ...k, sahne }).length).toBeGreaterThan(0);
  });

  it("Devre.net yeni net açmaz", () => {
    const k = diyagramKur("cpu");
    const once = k.devre.board.c.netNames.length;
    expect(new Devre(k.devre.board).net("BÖYLE_BİR_NET_YOK")).toBeUndefined();
    expect(k.devre.board.c.netNames.length).toBe(once);
  });
});

describe("mimari diyagramları: çizim", () => {
  it("üç diyagram listede; her biri hatasız", () => {
    expect(DIYAGRAMLAR.map((d) => d.id)).toEqual(["cpu", "makine", "hesap"]);
    for (const d of DIYAGRAMLAR) expect(diyagramiDenetle(diyagramKur(d.id)), d.id).toEqual([]);
  });

  it("düz SVG tek başına açılır: stil gömülü, renkler düz (belge temasından), metin kaçırılmış", () => {
    const k = diyagramKur("cpu");
    const svg = svgMetni(k.sahne, temaPaleti("acik"), { baslik: "CPU16 işlemci kartı" });
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain("<style>");
    expect(svg).not.toContain("var(--");
    expect(svg).toContain("REGISTER DOSYASI");
    expect(svg).toContain("GEÇİCİ REGISTER&apos;LAR".replace("&apos;", "'"));
    expect(svg).toMatch(/fill: #ffffff/);
    // her yol bir kez (gövde ve kollar ayrı gruplarda olabilir) ve her kutu bir kez
    for (const y of k.sahne.yollar) expect(svg).toContain(`data-yol="${y.id}"`);
    for (const x of k.sahne.kutular) expect(svg.split(`data-kutu="${x.id}"`).length - 1).toBe(1);
  });

  it("uygulamanın ağacı temanın belirteçlerini kullanır", () => {
    const k = diyagramKur("hesap");
    const kok = agac(k.sahne, { baslikGoster: false });
    expect(kok.t).toBe("svg");
    expect(kok.a?.viewBox).toBe(`0 0 ${k.sahne.w} ${k.sahne.h}`);
    expect(kok.a?.width).toBeUndefined();
    expect(Object.values(CSS_PALETI.yol).every((v) => v.startsWith("var(--mm-y-"))).toBe(true);
  });

  it("koyu ve açık paletler her rolü tanımlar; yazı ve çizgi renkleri kâğıttan ayrışır", () => {
    for (const tema of ["acik", "koyu"] as const) {
      const p = temaPaleti(tema);
      for (const r of Object.values(p.yol)) expect(r).toMatch(/^#[0-9a-f]{6}$/);
      for (const r of Object.values(p.kutu)) {
        expect(r.cizgi).toMatch(/^#[0-9a-f]{6}$/);
        expect(r.dolgu).toMatch(/^#[0-9a-f]{6}$/);
      }
      expect(p.kagit).not.toBe(p.yazi);
    }
  });
});
