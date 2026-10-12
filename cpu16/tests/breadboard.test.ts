// CPU16'nın breadboard panoları (cpu16/breadboard): bağlantı yalnız fiziksel modelden (board'lar,
// bacakların delikleri, atlama telleri, şerit kablo) union-find ile yeniden kurulur ve netlistle
// karşılaştırılır: kart kart (her aşamanın sonunda da) ve bütün makine. Doğrulayıcının bozuk kopyalarda
// hata bulduğu da sınanır. Ayrıca kurallar: board başına çip, boş board yok, uyarlayıcı, besleme
// girişleri, dekuplaj, renk kodu, tel boyları, panoların masadaki yeri.

import { beforeAll, describe, expect, it } from "vitest";
import type { Board } from "../board/board.ts";
import { panolariDogrula } from "../board/breadboard/dogrulama.ts";
import { noktaninBoardu, rayDeligiVar } from "../board/breadboard/geometri.ts";
import { netlistParmakIzi, telYollari3B } from "../board/breadboard/plan.ts";
import { kartMetinleri, refleriAc } from "../board/bolum-bilgi.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { dizinBelgesi, kartBbBelgesi, sirasiOnemliTeller } from "../breadboard/belge.ts";
import { beslemeButcesi } from "../breadboard/besleme.ts";
import { KART_SIRASI, MAKINE_SIRALARI, panoTanimi } from "../breadboard/panolar.ts";
import {
  cpuTelTarifi, EN_UZUN_TEL, kartiDogrula, kartOlcu, kartPlaniKur, makinePlaniKur, makineyiDogrula, seritKablolari, type KartBbPlani, type MakineBbPlani,
} from "../breadboard/plan.ts";
import { cpuRenkTanimi, cpuTelRengi } from "../breadboard/renk.ts";
import { BB_VERILERI } from "../breadboard/veri/index.ts";

let board: Board;
let kartlar: KartBbPlani[];
let m: MakineBbPlani;

beforeAll(() => {
  board = buildFullMachineBoard().board;
  kartlar = KART_SIRASI.map((k) => kartPlaniKur(board, k, BB_VERILERI[k]));
  m = makinePlaniKur(board, kartlar);
});

const yerel = (p: KartBbPlani, X: number, Y: number) => {
  const b = noktaninBoardu(p.yerlesim.boards, X, Y);
  return { b, c: X - b.x0, r: Y - b.y0 };
};

describe("bağlantı: fiziksel modelden kurulan netler = netlist", () => {
  it("saklanan veri netlistin parmak iziyle aynı (devre değiştiyse: npm run cpu16 -- breadboard --uret)", () => {
    for (const k of KART_SIRASI) expect(BB_VERILERI[k].parmakIzi, k).toBe(netlistParmakIzi(board, k));
  });

  it("her pano tek başına: açık ve kısa devre yok, her bacak bir delikte, delikler tek, gövde üstünden tel yok", () => {
    for (const p of kartlar) {
      const d = kartiDogrula(board, p);
      expect(d.hatalar, p.kart).toEqual([]);
      expect(d.telSayisi).toBe(p.teller.length);
      // kartın netlistteki her parçası panoda
      const parca = new Set(p.yerlesim.parcalar.map((q) => q.ref));
      for (const c of board.chips.filter((x) => x.card === p.kart)) expect(parca.has(c.ref), c.ref).toBe(true);
      for (const q of board.passives.filter((x) => x.card === p.kart)) expect(parca.has(q.ref), q.ref).toBe(true);
    }
  });

  it("her aşamanın sonunda o ana dek takılan parçaların netleri tam (aşama testi yapılabilir)", () => {
    for (const p of kartlar) for (const a of p.asamalar) expect(kartiDogrula(board, p, a.no).hatalar, `${p.kart} aşama ${a.no}`).toEqual([]);
  });

  it("bütün makine: 7 pano + 64 damarlı şerit kablo = anakartın netlisti", () => {
    const d = makineyiDogrula(m);
    expect(d.hatalar).toEqual([]);
    expect(d.telSayisi).toBe(kartlar.reduce((s, p) => s + p.teller.length, 0));
    // netlistteki her parça bir panoda
    const parca = new Set(kartlar.flatMap((p) => p.yerlesim.parcalar.map((q) => q.ref)));
    for (const c of board.chips) expect(parca.has(c.ref), c.ref).toBe(true);
    for (const q of board.passives) expect(parca.has(q.ref), q.ref).toBe(true);
  });

  it("doğrulayıcı bozuk kopyalarda hata bulur: eksik tel, başka şeride kayan uç, gövde üstünden tel, aynı delikte iki uç, takılmamış soket", () => {
    const p = kartlar.find((k) => k.kart === "cpu")!;
    const y = p.yerlesim;
    const dogrula = (teller: { yol: number[]; net?: number; asama?: number }[]) =>
      panolariDogrula(board, [{ ad: "CPU", kart: "cpu", yerlesim: y, teller }], [], { oncekiUcUstu: true }).hatalar;
    const sinyal = p.teller.findIndex((t) => !t.ray && t.renk === "mavi");
    // eksik tel: açık devre
    expect(dogrula(p.teller.filter((_, i) => i !== sinyal)).some((h) => h.startsWith("açık devre"))).toBe(true);
    // ucu bir çipin başka bacağının şeridine kayan tel: kısa ya da açık devre
    const cip = y.parcalar.find((q) => q.cipMi && q.tur === "dip")!;
    const hedef = cip.bacaklar.find((b) => b.pin === 2)!;
    const t = p.teller[sinyal];
    const kayik = p.teller.map((x, i) => (i === sinyal ? { ...x, yol: [t.yol[0], t.yol[1], hedef.X, t.yol[1], hedef.X, hedef.Y + 2] } : x));
    expect(dogrula(kayik).some((h) => h.startsWith("kısa devre") || h.startsWith("açık devre"))).toBe(true);
    // çipin gövdesinin üstünden geçen tel
    const [x0, y0, x1] = cip.govde;
    expect(dogrula([...p.teller, { yol: [x0 - 1, y0 + 1, x1 + 1, y0 + 1] }]).some((h) => h.includes("gövdesinin üstünden"))).toBe(true);
    // aynı delikte iki uç
    expect(dogrula([...p.teller, { yol: [t.yol[0], t.yol[1], t.yol[0], t.yol[1] - 1] }]).some((h) => h.startsWith("delik iki kez"))).toBe(true);
    // bir kartın soketi şerit kabloda değil: arka panel netleri o karta ulaşmaz
    const kablo = seritKablolari(m)[0];
    const eksikSoket = [{ ...kablo, uclar: kablo.uclar.filter(([i]) => m.kartlar[i].kart !== "bellek") }];
    const h = panolariDogrula(board, m.kartlar.map((k) => ({ ad: k.tanim.kisa, kart: k.kart, yerlesim: k.yerlesim, teller: k.teller })), eksikSoket, { oncekiUcUstu: true }).hatalar;
    expect(h.some((x) => x.startsWith("açık devre"))).toBe(true);
    // uçların üstünden geçme yalnız önce takılan tellerde serbest: sıkı kuralda yoğun panolar hata verir
    const siki = panolariDogrula(board, [{ ad: "CPU", kart: "cpu", yerlesim: y, teller: p.teller }], [], {}).hatalar;
    expect(siki.every((x) => x.includes("üstünden geçiyor"))).toBe(true);
  });
});

describe("panolar: kurallar", () => {
  it("board'lar pano ızgarası kadar; board başına en çok `yuva` mantık çipi; boş board yok", () => {
    for (const p of kartlar) {
      const t = panoTanimi(p.kart);
      expect(p.yerlesim.boards.length, p.kart).toBe(t.izgara.join("").length);
      for (const b of p.yerlesim.boards) {
        const parcalar = p.yerlesim.parcalar.filter((q) => q.board === b.no);
        expect(parcalar.filter((q) => q.cipMi).length, `${p.kart} ${b.ad}`).toBeLessThanOrEqual(t.yuva);
        expect(parcalar.length, `${p.kart} ${b.ad} boş`).toBeGreaterThan(0);
      }
    }
    expect(kartlar.reduce((s, p) => s + p.yerlesim.boards.length, 0)).toBe(134);
  });

  it("CPU kartı modül modül: her board'da düzendeki gruplar; R0–R7 her biri kendi board'unda, düşük bayt solda; bir grubun board'ları yan yana", () => {
    const p = kartlar.find((x) => x.kart === "cpu")!;
    const t = panoTanimi("cpu");
    const grubu = new Map<string, string>();
    for (const g of kartMetinleri("cpu").gruplar) for (const r of refleriAc(g.refs)) grubu.set(r, g.id);
    const grupBoardlari = new Map<string, Set<number>>();
    for (const b of p.yerlesim.boards) {
      expect(b.gruplar, b.ad).toEqual(t.duzen![b.by][b.bx].split(" "));
      const cipler = p.yerlesim.parcalar.filter((q) => q.board === b.no && q.cipMi);
      const gs = new Set(cipler.map((q) => grubu.get(q.ref)!));
      // her çip board'un gruplarından birinde; düzendeki her grubun bu board'da çipi var
      expect([...gs].every((g) => b.gruplar!.includes(g)), `${b.ad}: ${[...gs].join(", ")}`).toBe(true);
      expect(b.gruplar!.every((g) => gs.has(g)), `${b.ad}: ${b.gruplar!.join(", ")}`).toBe(true);
      for (const g of gs) grupBoardlari.set(g, new Set([...(grupBoardlari.get(g) ?? []), b.no]));
      // tek gruplu board'da çipler referans sırasıyla soldan sağa
      if (b.gruplar!.length === 1) {
        const sira = [...cipler].sort((a, c) => a.sutun - c.sutun).map((q) => Number(q.ref.slice(1)));
        expect(sira, b.ad).toEqual([...sira].sort((a, c) => a - c));
      }
    }
    for (let r = 0; r < 8; r++) {
      const bs = [...grupBoardlari.get(`r${r}`)!];
      expect(bs.length, `r${r}`).toBe(1);
      expect(p.yerlesim.boards[bs[0]].gruplar, `r${r}`).toEqual([`r${r}`]);
    }
    // birden çok board'u tek başına dolduran modülün (mantık birimi, sonuç seçici, sabit birimi, mikrokod
    // kapı ağı …) her board'unun yanında (sağda, solda, önde ya da arkada) aynı modülden bir board var
    for (const [g, bs] of grupBoardlari) {
      if (bs.size < 2 || [...bs].some((n) => p.yerlesim.boards[n].gruplar!.length > 1)) continue;
      for (const n of bs) {
        const b = p.yerlesim.boards[n];
        const komsu = [...bs].some((m) => m !== n && Math.abs(p.yerlesim.boards[m].bx - b.bx) + Math.abs(p.yerlesim.boards[m].by - b.by) === 1);
        expect(komsu, `${g}: ${b.ad}`).toBe(true);
      }
    }
  });

  it("her panoda bir şerit kablo uyarlayıcısı: 64 bacak, tek numaralılar f, çiftler e satırında, 32 ardışık sütunda", () => {
    for (const p of kartlar) {
      const u = p.yerlesim.parcalar.filter((q) => q.tur === "uyarlayici");
      expect(u.length, p.kart).toBe(1);
      expect(u[0].part).toBe("BACKPLANE_2x32");
      expect(u[0].bacaklar.length).toBe(64);
      const t = panoTanimi(p.kart).uyarlayici;
      for (const b of u[0].bacaklar) {
        const { b: bb, c, r } = yerel(p, b.X, b.Y);
        expect([bb.bx, bb.by]).toEqual([t.bx, t.by]);
        expect(r).toBe(b.pin % 2 ? 10 : 7);
        expect(c).toBe(t.c0 + Math.floor((b.pin - 1) / 2));
      }
    }
  });

  it("besleme: uyarlayıcının board sırasında her board sütununa bir 5 V girişi ve 100 µF; her çipe 100 nF yanında", () => {
    for (const p of kartlar) {
      const y = p.yerlesim;
      const t = panoTanimi(p.kart);
      const sira = y.boards.filter((b) => b.by === t.uyarlayici.by);
      expect(sira.length, p.kart).toBe(y.nx);
      for (const b of sira) {
        const giris = y.parcalar.filter((q) => q.board === b.no && q.part === "CONN_5V");
        expect(giris.length, `${p.kart} ${b.ad}`).toBe(1);
        expect(giris[0].ek).toEqual({ 1: board.c.VCC, 2: board.c.GND });
        expect(y.parcalar.some((q) => q.board === b.no && q.part === "C_100U"), `${p.kart} ${b.ad} 100 µF`).toBe(true);
      }
      for (const c of y.parcalar.filter((q) => q.cipMi)) {
        const k = y.parcalar.find((q) => q.bagliCip === c.ref && q.part === "C_100N");
        expect(k, `${p.kart} ${c.ref}`).toBeDefined();
        expect(k!.board).toBe(c.board);
        const col = yerel(p, k!.bacaklar[0].X, k!.bacaklar[0].Y).c;
        expect(rayDeligiVar(col)).toBe(true);
      }
      // en uzak board'da raylardaki düşüm 0,1 V'un altında
      expect(beslemeButcesi(board, p).dusumMv, p.kart).toBeLessThan(100);
    }
  });

  it("renk kodu (PCB kurulum belgeleriyle aynı): +5 V kırmızı, GND siyah, sinyaller sınıfının renginde", () => {
    for (const p of kartlar) {
      for (const t of p.teller) {
        if (t.net === board.c.VCC) expect(t.renk).toBe("kirmizi");
        else if (t.net === board.c.GND) expect(t.renk).toBe("siyah");
        else expect(t.renk, `${p.kart} ${t.ad}`).toBe(cpuTelRengi(t.ad));
      }
    }
    expect(cpuTelRengi("A3")).toBe("sari");
    expect(cpuTelRengi("D7")).toBe("mavi");
    expect(cpuRenkTanimi("sari").grup).toMatch(/adres/i);
  });

  it(`tel boyu: bütün makinede tellerin %94'ü ${EN_UZUN_TEL} mm'den kısa; kesim boyu delikten deliğe + iki uç`, () => {
    const tel = kartlar.flatMap((p) => p.teller);
    const asan = tel.filter((t) => t.uzunluk > EN_UZUN_TEL).length;
    expect(asan / tel.length).toBeLessThan(0.06);
    // CPU kartı modül modül dizili (R0–R7, ALU dilimleri, sabit birimi her biri kendi board'unda): veriyolu
    // ve kontrol hatları board'dan board'a gider, uzun tel payı öteki kartlarınkinin iki katı
    for (const p of kartlar) expect(p.teller.filter((t) => t.uzunluk > EN_UZUN_TEL).length / p.teller.length, p.kart).toBeLessThan(p.kart === "cpu" ? 0.1 : 0.05);
    for (const t of tel) expect(t.kesim).toBe(Math.ceil(t.uzunluk + 16));
    // ölçüler teller kadar
    for (const p of kartlar) {
      const o = kartOlcu(p);
      expect(o.renkler.reduce((a, r) => a + r.sayi, 0)).toBe(o.tel);
      expect(o.asamalar.reduce((a, r) => a + r.tel, 0)).toBe(o.tel);
    }
  });

  it("kurulum sırası aşamaya göre; tarif delikten deliğe ve panonun adıyla", () => {
    for (const p of kartlar) {
      let once = 0;
      p.teller.forEach((t, i) => {
        expect(t.no).toBe(i + 1);
        expect(t.asama).toBeGreaterThanOrEqual(once);
        once = t.asama;
      });
    }
    const p = kartlar.find((k) => k.kart === "cpu")!;
    const t = p.teller.find((x) => !x.ray && x.renk === "sari")!;
    expect(cpuTelTarifi(p, t, "sarı")).toMatch(/^CPU · BB\d\d (üst|alt)?[a-j+−]*\d+ → BB\d\d (üst|alt)?[a-j+−]*\d+, \d+ mm, sarı$/);
  });

  it("3D yolu: uçlar delikte (kat 0)", () => {
    for (const p of kartlar) {
      const y3 = telYollari3B(p.teller);
      p.teller.forEach((t, i) => {
        expect(y3[i].slice(0, 3)).toEqual([t.yol[0], t.yol[1], 0]);
        expect(y3[i].slice(-3)).toEqual([t.yol[t.yol.length - 2], t.yol[t.yol.length - 1], 0]);
      });
    }
  });
});

describe("makine: panoların yeri ve şerit kablo", () => {
  it("iki sıra, koridora bakan uyarlayıcılar; panolar üst üste binmiyor", () => {
    expect(new Set(m.yerler.map((y) => y.kart))).toEqual(new Set(KART_SIRASI));
    for (const [i, a] of m.yerler.entries()) {
      for (const b of m.yerler.slice(i + 1)) {
        const ayri = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y;
        expect(ayri, `${a.kart} / ${b.kart}`).toBe(true);
      }
      expect(a.sira).toBe(MAKINE_SIRALARI.arka.includes(a.kart) ? "arka" : "on");
    }
    // soketler koridora yakın kenarda: arka sırada plakanın alt yarısı, ön sırada üst yarısı
    for (const s of m.serit.soketler) {
      const y = m.yerler.find((q) => q.kart === s.kart)!;
      if (y.sira === "arka") expect(s.y).toBeGreaterThan(y.y + y.h / 2);
      else expect(s.y).toBeLessThan(y.y + y.h / 2);
    }
    expect(m.serit.soketler.length).toBe(7);
    expect(m.serit.boyMm).toBeGreaterThan(1000);
    expect(m.serit.boyMm).toBeLessThan(5000);
  });
});

describe("kurulum belgeleri (npm run cpu16 -- breadboard-belge)", () => {
  it("kart belgesi: her tel bir kez, işaret kutulu, aşama sırasıyla; her aşamanın sonunda test; her board'un çizimi", () => {
    for (const p of kartlar.filter((k) => k.kart === "clk" || k.kart === "kyb")) {
      const html = kartBbBelgesi(m, p, { tarih: "2026-01-01" });
      const no = [...html.matchAll(/<td class="id">T(\d{4})/g)].map((x) => Number(x[1]));
      expect(no, p.kart).toEqual(p.teller.map((t) => t.no));
      expect(no).toEqual(no.map((_, i) => i + 1));
      expect(html.split('<tr><td><span class="kutu"></span></td>').length - 1).toBe(p.teller.length);
      for (const a of p.asamalar) expect(html).toContain(`<b>Aşama ${a.no} testi:</b>`);
      for (const b of p.yerlesim.boards) expect(html).toContain(`<h3>${b.ad} · `);
      expect(html).toContain("8. Malzeme listesi");
    }
  });

  it("sırası önemli teller (↥): üstünden geçtikleri uç hep daha önce takılan bir telin", () => {
    let toplam = 0;
    for (const p of kartlar) {
      const sira = sirasiOnemliTeller(p);
      toplam += sira.size;
      for (const [t, alt] of sira) for (const a of alt) expect(a, `${p.kart} T${t}`).toBeLessThan(t);
    }
    expect(toplam).toBeGreaterThan(0);
    const p = kartlar.find((k) => k.kart === "bellek")!;
    const html = kartBbBelgesi(m, p);
    expect(html.split(" ↥</span>").length - 1).toBe(sirasiOnemliTeller(p).size);
  });

  it("dizin: yedi kart, 64 damarın her biri, soketler kablo boyunca sırayla", () => {
    const html = dizinBelgesi(m, KART_SIRASI.map((k) => ({ kart: k, html: `${k}-breadboard.html`, pdf: `${k}-breadboard.pdf`, sayfa: 1 })));
    for (const k of KART_SIRASI) expect(html).toContain(`${k}-breadboard.pdf`);
    for (let d = 1; d <= 64; d++) expect(html).toMatch(new RegExp(`<td class="sag">${d}</td><td class="mono">`));
    for (const s of m.serit.soketler) expect(html).toContain(`<td class="ref">${s.ref}</td>`);
  });
});
