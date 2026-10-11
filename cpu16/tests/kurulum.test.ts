// Kurulum belgeleri (cpu16/kurulum/): tel listesi her kartın her sinyal netini tam ve yalnızca bir kez
// bağlar (yayılan ağaç), numaralar benzersiz ve kararlı, blok blok kurulunca her ara durum tamdır,
// her çipin besleme pinleri ve dekuplajı listelidir. Beklenen uçlar plandan bağımsız olarak doğrudan
// kart tanımından (Board) hesaplanır.
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import type { Board } from "../board/board.ts";
import { buildFullMachineBoard } from "../board/machine-board.ts";
import { kicadPinName } from "../chips/kicad.ts";
import { BACKPLANE } from "../board/passives.ts";
import { kartBelgesi } from "../kurulum/belge.ts";
import { elKitabi } from "../kurulum/el-kitabi.ts";
import { KURULUM_KARTLARI, KurulumVerisi } from "../kurulum/kartlar.ts";
import { kurulumPlani, netGorunen, RENK_KODU, renkKodu, sinyalSinifi, type KurulumPlani } from "../kurulum/plan.ts";
import { SADECE_SIM } from "../kit/deneyler.ts";

const veri = new KurulumVerisi();
const kartlar = KURULUM_KARTLARI.map((kk) => ({ kk, plan: veri.plan(kk.kart), board: veri.board(kk.kaynak).board }));

/** Kartta kurulan elemanların uçları, net → "ref#pin" kümesi (VCC / GND hariç); plandan bağımsız */
function beklenenUclar(board: Board, kart: string): Map<number, Set<string>> {
  const haric = new Set(SADECE_SIM.filter((k) => k.card === kart).flatMap((k) => k.blocks ?? []));
  const chips = board.chips.filter((c) => c.card === kart && !haric.has(c.block));
  const refs = new Set(chips.map((c) => c.ref));
  const out = new Map<number, Set<string>>();
  const ekle = (net: number | undefined, uc: string) => {
    if (net === undefined || net === board.c.VCC || net === board.c.GND) return;
    (out.get(net) ?? out.set(net, new Set()).get(net)!).add(uc);
  };
  for (const ci of chips) for (const p of ci.def.pins) ekle(ci.nets[p.name], `${ci.ref}#${p.num}`);
  for (const p of board.passives) {
    if (p.card !== kart) continue;
    const dek = /^(U\d+) dekuplaj$/.exec(p.role)?.[1];
    if (dek ? !refs.has(dek) : haric.has(p.block)) continue;
    for (const [num, net] of Object.entries(p.pins)) ekle(net, `${p.ref}#${num}`);
  }
  return out;
}

/** Union-find ile bileşen sayısı */
function bilesenler(dugumler: string[], kenarlar: [string, string][]): number {
  const ata = new Map(dugumler.map((d) => [d, d]));
  const bul = (x: string): string => {
    let r = x;
    while (ata.get(r) !== r) r = ata.get(r)!;
    ata.set(x, r);
    return r;
  };
  for (const [a, b] of kenarlar) ata.set(bul(a), bul(b));
  return new Set(dugumler.map(bul)).size;
}

const uc = (u: { ref: string; pin: number }) => `${u.ref}#${u.pin}`;

describe("kurulum planı: tel listesi", () => {
  it.each(kartlar.map((k) => [k.kk.kart, k] as const))("%s: teller her sinyal netinin uçlarını tam bağlar (yayılan ağaç)", (_kart, { plan, board }) => {
    const beklenen = beklenenUclar(board, plan.kart);
    const telSayisi = [...beklenen.values()].reduce((s, l) => s + Math.max(0, l.size - 1), 0);
    expect(plan.teller.length).toBe(telSayisi);
    const netTelleri = new Map<number, [string, string][]>();
    const gorulen = new Set<string>();
    for (const t of plan.teller) {
      const a = uc(t.from);
      const b = uc(t.to);
      expect(a, t.id).not.toBe(b);
      // iki uç da bu netin uçları: farklı netler arasında tel yok
      expect(beklenen.get(t.netId)?.has(a), `${t.id} ${a} ${t.net}`).toBe(true);
      expect(beklenen.get(t.netId)?.has(b), `${t.id} ${b} ${t.net}`).toBe(true);
      expect(t.net).toBe(netGorunen(board.netName(t.netId)));
      const k = [a, b].sort().join("|");
      expect(gorulen.has(k), `${t.id}: aynı tel iki kez`).toBe(false);
      gorulen.add(k);
      (netTelleri.get(t.netId) ?? netTelleri.set(t.netId, []).get(t.netId)!).push([a, b]);
    }
    for (const [net, uclar] of beklenen) {
      const k = netTelleri.get(net) ?? [];
      expect(k.length, board.netName(net)).toBe(uclar.size - 1);
      expect(bilesenler([...uclar], k), board.netName(net)).toBe(1);
    }
  });

  it.each(kartlar.map((k) => [k.kk.kart, k] as const))("%s: numaralar benzersiz, sıralı, blok sırasıyla; bir uca en çok üç tel", (_kart, { plan }) => {
    plan.teller.forEach((t, i) => expect(t.id).toBe(`T${String(i + 1).padStart(4, "0")}`));
    for (let i = 1; i < plan.teller.length; i++) expect(plan.teller[i].blokSira).toBeGreaterThanOrEqual(plan.teller[i - 1].blokSira);
    const derece = new Map<string, number>();
    for (const t of plan.teller) for (const u of [t.from, t.to]) derece.set(uc(u), (derece.get(uc(u)) ?? 0) + 1);
    expect(Math.max(0, ...derece.values())).toBeLessThanOrEqual(3);
    for (const t of plan.teller) {
      expect(t.uzunluk).toBeGreaterThan(0);
      expect(plan.bloklar[t.blokSira].ad).toBe(t.blok);
    }
  });

  it.each(kartlar.map((k) => [k.kk.kart, k] as const))("%s: blok blok kurulunca her ara durumda kurulan blokların bütün bağlantıları tamam", (_kart, { plan, board }) => {
    // her ucun bloğu (yapıştırıcı çipte kapının bloğu) plandaki pin tablosundan değil, kart tanımından
    const blokSira = new Map(plan.bloklar.map((b) => [b.ad, b.sira]));
    const ucBlok = new Map<string, number>();
    for (const ci of board.chips.filter((c) => c.card === plan.kart)) {
      for (const p of ci.def.pins) ucBlok.set(`${ci.ref}#${p.num}`, blokSira.get(ci.glueUnits?.find((u) => u.pins.includes(p.name))?.block ?? ci.block) ?? -1);
    }
    for (const p of board.passives.filter((x) => x.card === plan.kart)) for (const num of Object.keys(p.pins)) ucBlok.set(`${p.ref}#${num}`, blokSira.get(p.block) ?? -1);
    const beklenen = beklenenUclar(board, plan.kart);
    for (const t of plan.teller) expect(t.blokSira, t.id).toBe(Math.max(ucBlok.get(uc(t.from))!, ucBlok.get(uc(t.to))!));
    for (let k = 0; k < plan.bloklar.length; k++) {
      for (const [net, uclar] of beklenen) {
        const kurulan = [...uclar].filter((u) => ucBlok.get(u)! <= k);
        if (kurulan.length < 2) continue;
        const kenar = plan.teller.filter((t) => t.netId === net && t.blokSira <= k).map((t) => [uc(t.from), uc(t.to)] as [string, string]);
        expect(bilesenler(kurulan, kenar), `${plan.bloklar[k].ad}: ${board.netName(net)}`).toBe(1);
      }
    }
  });

  it("kararlı: aynı kart tanımı her seferinde aynı planı verir; CPU ve saat kartı iki bilgisayar tanımında aynı teller", () => {
    const yeni = new KurulumVerisi();
    for (const { kk, plan } of kartlar) expect(yeni.plan(kk.kart)).toEqual(plan);
    // anakart tanımında da aynı numaralı teller aynı uçları bağlar (adsız netlerin numarası tanıma göre değişir)
    const anakart = buildFullMachineBoard().board;
    const ad = (n: string) => (/^N\d+$/.test(n) ? "N?" : n);
    for (const kart of ["cpu", "clk"]) {
      const a = kurulumPlani(anakart, kart).teller.map((t) => [t.id, uc(t.from), uc(t.to), ad(t.net)]);
      const b = kartlar.find((k) => k.kk.kart === kart)!.plan.teller.map((t) => [t.id, uc(t.from), uc(t.to), ad(t.net)]);
      expect(a).toEqual(b);
    }
  });

  it("net adları kartın KiCad şemasındaki etiketlerle aynı", () => {
    for (const { plan } of kartlar) {
      const sch = readFileSync(new URL(`../kicad/${plan.kart}/${plan.kart}.kicad_sch`, import.meta.url), "utf8");
      const etiketler = new Set([...sch.matchAll(/\((?:label|global_label|hierarchical_label) "([^"]*)"/g)].map((m) => m[1]));
      for (const net of new Set(plan.teller.map((t) => t.net))) expect(etiketler.has(kicadPinName(net)), `${plan.kart}: ${net}`).toBe(true);
    }
  });

  it("renk kodu: her tel netinin sınıfının rengi, aynı netin telleri aynı renk", () => {
    for (const { plan, board } of kartlar) {
      for (const t of plan.teller) {
        const s = sinyalSinifi(board.netName(t.netId));
        expect(t.sinif).toBe(s);
        expect(t.renk).toBe(renkKodu(s).renk);
        expect(t.hex).toBe(renkKodu(s).hex);
      }
    }
    expect(new Set(RENK_KODU.map((r) => r.renk)).size).toBe(RENK_KODU.length);
    const ornek: [string, string][] = [
      ["A3", "adres"], ["PA17", "adres"], ["DE5", "veri"], ["BUS12", "veri"], ["~MRD", "secim"], ["~OE", "secim"], ["~CE_ROM", "secim"],
      ["CLK", "saat"], ["OSC", "saat"], ["~RESET", "reset"], ["IRQ", "reset"], ["LED_CLK", "dis"], ["VGA_RED", "dis"], ["CW7", "kontrol"], ["n123", "kontrol"],
    ];
    for (const [net, s] of ornek) expect(sinyalSinifi(net), net).toBe(s);
  });
});

describe("kurulum planı: çipler, besleme, pin tabloları, konnektör", () => {
  it.each(kartlar.map((k) => [k.kk.kart, k] as const))("%s: her çipin besleme pinleri ve dekuplajı listeli", (_kart, { plan, board }) => {
    const chips = board.chips.filter((c) => c.card === plan.kart && !plan.haric.includes(c.block));
    expect(plan.cipler.map((c) => c.ref)).toEqual(chips.map((c) => c.ref));
    expect(plan.guc.map((g) => g.ref)).toEqual(chips.map((c) => c.ref));
    for (const ci of chips) {
      const g = plan.guc.find((x) => x.ref === ci.ref)!;
      const pw = ci.def.pins.filter((p) => p.dir === "power");
      expect(g.vcc, ci.ref).toEqual(pw.filter((p) => ci.nets[p.name] === board.c.VCC).map((p) => p.num));
      expect(g.gnd, ci.ref).toEqual(pw.filter((p) => ci.nets[p.name] === board.c.GND).map((p) => p.num));
      expect(g.vcc.length, ci.ref).toBeGreaterThan(0);
      expect(g.gnd.length, ci.ref).toBeGreaterThan(0);
      // sabit girişler: VCC / GND'ye giden sinyal pinleri
      expect(g.sabit1.map((x) => x.pin).sort()).toEqual(ci.def.pins.filter((p) => p.dir !== "power" && ci.nets[p.name] === board.c.VCC).map((p) => p.num).sort());
      expect(g.sabit0.map((x) => x.pin).sort()).toEqual(ci.def.pins.filter((p) => p.dir !== "power" && ci.nets[p.name] === board.c.GND).map((p) => p.num).sort());
      expect(g.dekuplaj.length, `${ci.ref} dekuplaj`).toBe(1);
      const c = board.passives.find((p) => p.ref === g.dekuplaj[0] && p.card === plan.kart)!;
      expect(c.part).toBe("C_100N");
      expect(new Set(Object.values(c.pins))).toEqual(new Set([board.c.VCC, board.c.GND]));
    }
    // her çip bir blokta ve haritada kartın içinde; 1. pin sol altta (çentik solda)
    expect(plan.bloklar.flatMap((b) => b.cipler).sort()).toEqual(chips.map((c) => c.ref).sort());
    for (const c of plan.cipler) {
      expect(c.x).toBeGreaterThanOrEqual(0);
      expect(c.y).toBeGreaterThanOrEqual(0);
      expect(c.x + c.w).toBeLessThanOrEqual(plan.olcu.w);
      expect(c.y + c.h).toBeLessThanOrEqual(plan.olcu.h);
      const xs = c.pins.map((p) => p.x);
      const ys = c.pins.map((p) => p.y);
      expect(c.pin1.x).toBeCloseTo(Math.min(...xs));
      expect(c.pin1.y).toBeCloseTo(Math.max(...ys));
      expect(c.pins.length).toBe(c.pinSayisi);
      expect(c.hucre).toMatch(/^[A-Z]+\d+$/);
    }
  });

  it.each(kartlar.map((k) => [k.kk.kart, k] as const))("%s: pin tabloları her pini ve her teli (iki ucuyla) içerir", (_kart, { plan, board }) => {
    const telUclari = new Map<string, string[]>();
    for (const kart of [...plan.cipKartlari, ...plan.pasifKartlari]) {
      for (const r of kart.pinler) for (const t of r.teller) (telUclari.get(t.id) ?? telUclari.set(t.id, []).get(t.id)!).push(`${kart.ref}#${r.pin}`);
    }
    expect(telUclari.size).toBe(plan.teller.length);
    for (const t of plan.teller) expect(telUclari.get(t.id)!.sort()).toEqual([uc(t.from), uc(t.to)].sort());
    for (const k of plan.cipKartlari) {
      const ci = board.chips.find((c) => c.ref === k.ref && c.card === plan.kart)!;
      expect(k.pinler.map((r) => r.pin)).toEqual(ci.def.pins.map((p) => p.num));
      for (const r of k.pinler) {
        const p = ci.def.pins.find((x) => x.num === r.pin)!;
        const net = ci.nets[p.name];
        expect(r.ad).toBe(p.name);
        if (net === undefined) expect(r.net).toBeNull();
        else expect(r.net).toBe(net === board.c.VCC ? "VCC" : net === board.c.GND ? "GND" : netGorunen(board.netName(net)));
        // tel komşusunun öbür ucu aynı nette
        for (const t of r.teller) expect(plan.teller.find((x) => x.id === t.id)!.netId).toBe(net);
      }
    }
  });

  it.each(kartlar.filter((k) => k.kk.kart !== "prog").map((k) => [k.kk.kart, k] as const))("%s: kenar konnektörü arka panel düzeninde", (_kart, { plan }) => {
    const k = plan.kenar!;
    expect(k.pinler.map((p) => p.pin)).toEqual(Array.from({ length: 64 }, (_, i) => i + 1));
    for (const p of k.pinler) {
      expect(p.sinyal).toBe(BACKPLANE[p.pin] ?? null);
      if (p.sinyal === "VCC" || p.sinyal === "GND") expect(p.yon).toBe("besleme");
      if (p.sinyal && p.bagli && p.yon !== "besleme") {
        // konnektöre giden tel varsa öbür ucu aynı arka panel sinyalinde
        for (const t of p.teller) expect(plan.teller.find((x) => x.id === t.id)!.net).toBe(p.sinyal);
        expect(p.teller.length > 0).toBe(p.kartUclari > 0);
      }
      if (!BACKPLANE[p.pin]) expect(p.yon).toBe("boş");
    }
  });

  it("deney sırası: CPU kartında register dosyası (Deney 4) ilk, kontrol birimi (Deney 7) sonra; test kartının RAM'i kurulmaz", () => {
    const cpu = kartlar.find((k) => k.kk.kart === "cpu")!.plan;
    expect(cpu.bloklar[0].ad).toBe("Besleme ve arka panel");
    expect(cpu.bloklar[1]).toMatchObject({ ad: "Register dosyası", deney: 4 });
    const sira = (ad: string) => cpu.bloklar.find((b) => b.ad === ad)!.sira;
    expect(sira("ALU")).toBeLessThan(sira("Program sayacı"));
    expect(sira("Program sayacı")).toBeLessThan(sira("Kontrol birimi"));
    expect(cpu.deneyler).toEqual([4, 5, 6, 7]);
    const mem = kartlar.find((k) => k.kk.kart === "mem")!.plan;
    expect(mem.haric).toEqual(["RAM"]);
    expect(mem.cipler.some((c) => c.deger === "62256")).toBe(false);
  });

  it("toplamlar: anakartın bütün kartlarında tel sayısı Σ(uç − 1), besleme uçları ayrı", () => {
    const { board, layout } = veri.board("anakart");
    const kartAdlari = [...new Set(board.chips.map((c) => c.card))];
    const uclar = new Map<string, number>();
    let besleme = 0;
    const say = (kart: string, n: number | undefined) => {
      if (n === undefined) return;
      if (n === board.c.VCC || n === board.c.GND) besleme++;
      else uclar.set(`${kart}/${n}`, (uclar.get(`${kart}/${n}`) ?? 0) + 1);
    };
    for (const ci of board.chips) for (const p of ci.def.pins) say(ci.card, ci.nets[p.name]);
    for (const p of board.passives) for (const n of Object.values(p.pins)) say(p.card, n);
    const planlar = kartAdlari.map((k) => kurulumPlani(board, k, { layout }));
    expect(planlar.reduce((s, p) => s + p.teller.length, 0)).toBe([...uclar.values()].reduce((s, n) => s + n - 1, 0));
    expect(planlar.reduce((s, p) => s + p.beslemePinleri, 0)).toBe(besleme);
    expect(planlar.reduce((s, p) => s + p.cipler.length, 0)).toBe(board.chips.length);
  });
});

describe("kurulum belgeleri (HTML)", () => {
  const sayfa = (plan: KurulumPlani) => kartBelgesi(plan, KURULUM_KARTLARI.find((k) => k.kart === plan.kart)!, { tarih: "2026-10-11", semaDosyasi: `${plan.kart}-sema.pdf` });

  it("her kart belgesi her teli, her çipi ve renk adlarını içerir", () => {
    for (const { plan } of kartlar) {
      const html = sayfa(plan);
      expect(html.startsWith("<!doctype html>")).toBe(true);
      for (const t of plan.teller) expect(html.includes(`<td class="id">${t.id}</td>`), `${plan.kart} ${t.id}`).toBe(true);
      for (const c of plan.cipler) expect(html.includes(`<span class="ref">${c.ref}</span><span class="deger">`), `${plan.kart} ${c.ref}`).toBe(true);
      for (const r of RENK_KODU) expect(html.includes(r.renk)).toBe(true);
      expect(html).not.toMatch(/undefined|NaN|\[object/);
    }
  });

  it("el kitabı bütün kartları listeler", () => {
    const html = elKitabi(kartlar.map(({ kk, plan }) => ({ kk, plan })), { tarih: "2026-10-11" });
    for (const { kk } of kartlar) expect(html.includes(`${kk.kart}/${kk.kart}-kurulum.pdf`)).toBe(true);
    expect(html).toContain("bip testi");
    expect(html).not.toMatch(/undefined|NaN|\[object/);
  });
});
