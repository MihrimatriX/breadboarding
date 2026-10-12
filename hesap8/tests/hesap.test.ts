// 8 bit hesap makinesi: gösterge sürücüsü, devrenin yapısı, kapı seviyesi davranış ve KiCad şeması.
// Bütün 262 144 durum vitest için uzun (birkaç dakika): npm run hesap8 -- dogrula --hepsi

import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { erc } from "../../cpu16/board/board.ts";
import { hesapKicadFiles } from "../../cpu16/board/kicad-files.ts";
import { kicadNetName } from "../../cpu16/board/kicad-sch.ts";
import { ChipBench } from "../../cpu16/chips/bench.ts";
import { parseSExpr, type SExpr } from "../../cpu16/chips/kicad.ts";
import { L1 } from "../../cpu16/chips/logic.ts";
import { HC4511, RAKAM_SEGMENT, SEGMENTLER } from "../../cpu16/chips/parts/gosterge.ts";
import { modulYerleri } from "../bcd.ts";
import { buildHesapBoard, HESAP_SAYFALARI, type HesapKarti } from "../kart.ts";
import { beklenen, hesapla, ornekDurumlar, type IslemKodu } from "../model.ts";
import { HesapSim, segmentKarakteri } from "../sim.ts";

describe("74HC4511 gösterge sürücüsü", () => {
  const bench = new ChipBench(HC4511);
  const yaz = (v: number, { le = 0, bi = 1, lt = 1 } = {}) => {
    ["A", "B", "C", "D"].forEach((p, i) => bench.drive(p, (v >> i) & 1 ? 1 : 0));
    bench.drive("LE", le === 1);
    bench.drive("~BI", bi === 1);
    bench.drive("~LT", lt === 1);
    bench.settle();
  };
  const segler = () => SEGMENTLER.filter((s) => bench.get(s) === L1).join("");

  it("0–9 veri sayfasındaki desen (6 ve 9 kuyruksuz), 10–15 sönük", () => {
    for (let v = 0; v < 16; v++) {
      yaz(v);
      expect(segler(), String(v)).toBe(v <= 9 ? RAKAM_SEGMENT[v] : "");
    }
    expect(RAKAM_SEGMENT[6]).toBe("cdefg");
    expect(RAKAM_SEGMENT[9]).toBe("abcfg");
  });

  it("~BI = 0 söndürür, ~LT = 0 hepsini yakar (söndürmeye de üstün)", () => {
    yaz(8, { bi: 0 });
    expect(segler()).toBe("");
    yaz(1, { lt: 0 });
    expect(segler()).toBe("abcdefg");
    yaz(1, { lt: 0, bi: 0 });
    expect(segler()).toBe("abcdefg");
  });

  it("LE = 1 son rakamı tutar", () => {
    yaz(3);
    yaz(3, { le: 1 });
    yaz(7, { le: 1 });
    expect(segler()).toBe(RAKAM_SEGMENT[3]);
    yaz(7);
    expect(segler()).toBe(RAKAM_SEGMENT[7]);
  });

  it("segment deseninden karakter", () => {
    for (let v = 0; v < 10; v++) expect(segmentKarakteri(SEGMENTLER.map((s) => (RAKAM_SEGMENT[v].includes(s) ? 1 : 0)))).toBe(String(v));
    expect(segmentKarakteri([0, 0, 0, 0, 0, 0, 0])).toBe(" ");
    expect(segmentKarakteri([0, 0, 0, 0, 0, 0, 1])).toBe("-");
  });
});

describe("hesap makinesinin yapısı", () => {
  let k: HesapKarti;
  beforeAll(() => {
    k = buildHesapBoard();
  });

  it("216 entegre, hepsi yaygın 74HC; 15 gösterge", () => {
    const b = k.board;
    expect(b.chips.length).toBe(216);
    const parcalar = new Set(b.chips.map((c) => c.def.part));
    expect([...parcalar].sort()).toEqual(["74HC00", "74HC02", "74HC04", "74HC08", "74HC153", "74HC157", "74HC283", "74HC30", "74HC32", "74HC4511", "74HC86"]);
    expect(b.chips.filter((c) => c.def.part === "74HC4511").length).toBe(14);
    expect(b.passives.filter((p) => p.part === "DISP_7SEG_CC").length).toBe(15);
    expect(k.gruplar.map((g) => g.haneler.length)).toEqual([3, 3, 5, 3]);
    expect(k.gruplar.find((g) => g.ad === "sonuc")!.isaret).toBeDefined();
    // her entegrenin yanında bir 100 nF
    expect(b.passives.filter((p) => p.part === "C_100N").length).toBe(216);
  });

  it("kural denetimi (ERC) temiz", () => {
    expect(erc(k.board)).toEqual([]);
  });

  it("onluğa çevirme modülleri yalnızca gereken yerlerde: 7 / 7 / 33 / 7", () => {
    expect(Object.fromEntries(Object.entries(k.bcd).map(([g, x]) => [g, x.moduller.length]))).toEqual({ a: 7, b: 7, sonuc: 33, kalan: 7 });
    // modül sayısı = algoritmanın 5'i geçebildiği nokta sayısı
    const say = (n: number, h: number) => modulYerleri(n, h).flat().filter(Boolean).length;
    expect(say(8, 3)).toBe(7);
    expect(say(16, 5)).toBe(33);
  });

  it("her çip bir şema sayfasında (sayfalar blokları tam kapsar)", () => {
    const sayfaBloklari = new Set(HESAP_SAYFALARI.flatMap((s) => s.blocks));
    for (const x of [...k.board.chips, ...k.board.passives]) expect(sayfaBloklari.has(x.block), `${x.ref} ${x.block}`).toBe(true);
  });
});

describe("hesap makinesi kapı seviyesinde (altın modelle)", () => {
  let sim: HesapSim;
  beforeAll(() => {
    sim = new HesapSim();
  });
  const dene = (a: number, b: number, op: IslemKodu) => {
    sim.ayarla(a, b, op);
    return sim.oku();
  };

  it("uç durumlar", () => {
    expect(dene(255, 255, 0)).toEqual({ a: "255", b: "255", sonuc: "   510", kalan: "   ", hata: false });
    expect(dene(12, 200, 1)).toEqual({ a: " 12", b: "200", sonuc: "-  188", kalan: "   ", hata: false });
    expect(dene(200, 12, 1).sonuc).toBe("   188");
    expect(dene(7, 7, 1).sonuc).toBe("     0");
    expect(dene(255, 255, 2).sonuc).toBe(" 65025");
    expect(dene(255, 7, 3)).toEqual({ a: "255", b: "  7", sonuc: "    36", kalan: "  3", hata: false });
    expect(dene(0, 5, 3)).toEqual({ a: "  0", b: "  5", sonuc: "     0", kalan: "  0", hata: false });
  });

  it("sıfıra bölme: HATA yanar, sonuç ve kalan söner", () => {
    expect(dene(100, 0, 3)).toEqual({ a: "100", b: "  0", sonuc: "      ", kalan: "   ", hata: true });
    expect(sim.sim.get(k8(sim).ic.hata)).toBe(L1);
    // aynı sayılar başka işlemde HATA değil
    expect(dene(100, 0, 0).hata).toBe(false);
  });

  it("işlem LED'lerinden yalnız seçilen yanar", () => {
    for (const op of [0, 1, 2, 3] as IslemKodu[]) {
      sim.ayarla(1, 1, op);
      expect(k8(sim).ic.islem.map((n) => (sim.sim.get(n) === L1 ? 1 : 0))).toEqual([0, 1, 2, 3].map((i) => (i === op ? 1 : 0)));
    }
  });

  it("baştaki sıfırlar söner, en sağdaki hane hiç sönmez", () => {
    expect(dene(0, 0, 0)).toMatchObject({ a: "  0", b: "  0", sonuc: "     0" });
    expect(dene(5, 100, 2)).toMatchObject({ a: "  5", b: "100", sonuc: "   500" });
    expect(dene(10, 0, 0).a).toBe(" 10");
  });

  it("lamba testi: 14 hanenin hepsi 8 ve eksi işareti yanar (sönük gruplar dahil)", () => {
    dene(3, 0, 3); // HATA: sonuç ve kalan sönük
    sim.lamba(true);
    const o = sim.oku();
    expect(o.a).toBe("888");
    expect(o.b).toBe("888");
    expect(o.sonuc).toBe("-88888");
    expect(o.kalan).toBe("888");
    sim.lamba(false);
    expect(sim.oku().sonuc).toBe("      ");
  });

  it("iç sonuçlar: çarpım, bölüm ve kalan", () => {
    for (const [a, b] of [[255, 255], [123, 45], [0, 9], [200, 3]]) {
      sim.ayarla(a, b, 2);
      expect(sim.sayi(k8(sim).ic.carpim)).toBe(a * b);
      sim.ayarla(a, b, 3);
      expect(sim.sayi(k8(sim).ic.bolum)).toBe(Math.floor(a / b));
      expect(sim.sayi(k8(sim).ic.kalan)).toBe(a % b);
      expect(sim.sayi(k8(sim).ic.sonuc)).toBe(hesapla(a, b, 3).deger);
    }
  });

  it("3 024 durum (uç değerler × 4 işlem + 2 000 örnek) altın modelle aynı", { timeout: 120_000 }, () => {
    let farkli = 0;
    let ilk = "";
    for (const [a, b, op] of ornekDurumlar()) {
      const o = dene(a, b, op);
      const e = beklenen(a, b, op);
      if (JSON.stringify(o) !== JSON.stringify(e)) {
        if (!farkli) ilk = `${a} ${op} ${b}: ${JSON.stringify(o)} ≠ ${JSON.stringify(e)}`;
        farkli++;
      }
    }
    expect(ilk).toBe("");
    expect(farkli).toBe(0);
  });
});

const k8 = (s: HesapSim) => s.kart;

describe("hesap makinesinin KiCad şeması (çok sayfalı)", () => {
  const kart = buildHesapBoard();
  const board = kart.board;
  const files = hesapKicadFiles(board);
  const sayfalar = files.filter((f) => f.path.endsWith(".kicad_sch") && !f.path.endsWith("/hesap.kicad_sch"));

  it("depodaki dosyalar güncel (npm run cpu16 -- board kicad)", () => {
    for (const f of files) expect(readFileSync(new URL(`../../${f.path}`, import.meta.url), "utf8") === f.content, f.path).toBe(true);
  });

  it("kök sayfada her alt sayfa bir kutu; her çip ve pasif tam bir alt sayfada", () => {
    const kok = parseSExpr(files.find((f) => f.path.endsWith("/hesap.kicad_sch"))!.content) as SExpr[];
    const kutular = kok.filter((x) => Array.isArray(x) && x[0] === "sheet") as SExpr[][];
    const dosyalar = kutular.map((s) => (s.find((x) => Array.isArray(x) && x[0] === "property" && x[1] === "Sheetfile") as string[])[2]);
    expect(dosyalar).toEqual(HESAP_SAYFALARI.map((s) => s.file));
    const refler: string[] = [];
    for (const f of sayfalar) {
      const tree = parseSExpr(f.content) as SExpr[];
      for (const sym of tree.filter((x) => Array.isArray(x) && x[0] === "symbol") as SExpr[][]) {
        refler.push((sym.find((x) => Array.isArray(x) && x[0] === "property" && x[1] === "Reference") as string[])[2]);
      }
    }
    expect(refler.length).toBe(new Set(refler).size);
    expect(new Set(refler)).toEqual(new Set([...board.chips, ...board.passives].map((x) => x.ref)));
  });

  it("her pin bir global etikete ya da 'bağlı değil' işaretine değiyor; etiket = net adı", () => {
    let denetlenen = 0;
    for (const f of sayfalar) {
      const tree = parseSExpr(f.content) as SExpr[];
      const key = (x: string, y: string) => `${Number(x).toFixed(2)},${Number(y).toFixed(2)}`;
      const etiket = new Map<string, string>();
      const nc = new Set<string>();
      for (const el of tree) {
        if (!Array.isArray(el)) continue;
        const at = el.find((x) => Array.isArray(x) && x[0] === "at") as string[] | undefined;
        if (el[0] === "global_label") etiket.set(key(at![1], at![2]), el[1] as string);
        if (el[0] === "no_connect") nc.add(key(at![1], at![2]));
      }
      const lib = tree.find((x) => Array.isArray(x) && x[0] === "lib_symbols") as SExpr[];
      for (const sym of tree.filter((x) => Array.isArray(x) && x[0] === "symbol") as SExpr[][]) {
        const ref = (sym.find((x) => Array.isArray(x) && x[0] === "property" && x[1] === "Reference") as string[])[2];
        const at = sym.find((x) => Array.isArray(x) && x[0] === "at") as string[];
        const libId = (sym.find((x) => Array.isArray(x) && x[0] === "lib_id") as string[])[1];
        const def = lib.find((x) => Array.isArray(x) && x[0] === "symbol" && x[1] === libId) as SExpr[];
        const unit = def.find((x) => Array.isArray(x) && x[0] === "symbol" && (x[1] as string).endsWith("_1_1")) as SExpr[];
        const ci = board.chips.find((c) => c.ref === ref);
        const pa = board.passives.find((p) => p.ref === ref);
        for (const pin of unit.filter((x) => Array.isArray(x) && x[0] === "pin") as SExpr[][]) {
          const pat = pin.find((x) => Array.isArray(x) && x[0] === "at") as string[];
          const num = (pin.find((x) => Array.isArray(x) && x[0] === "number") as string[])[1];
          const k = key(String(Number(at[1]) + Number(pat[1])), String(Number(at[2]) - Number(pat[2])));
          expect(etiket.has(k) || nc.has(k), `${ref}.${num}`).toBe(true);
          if (!etiket.has(k)) continue;
          const net = ci ? ci.nets[ci.def.pins.find((x) => String(x.num) === num)!.name] : pa!.pins[num];
          expect(etiket.get(k), `${ref}.${num}`).toBe(kicadNetName(board.netName(net)));
          denetlenen++;
        }
      }
    }
    expect(denetlenen).toBeGreaterThan(3000);
  });

  // KiCad kuruluysa (CI'da değil): bütün hiyerarşiyi KiCad'e açtır, netlist'i kartın netleriyle karşılaştır
  const hasKicad = (() => {
    try {
      execFileSync("kicad-cli", ["version"], { stdio: "ignore" });
      return true;
    } catch {
      return false;
    }
  })();
  it.skipIf(!hasKicad)("kicad-cli netlist'i = kartın netleri", { timeout: 120_000 }, () => {
    const dir = mkdtempSync(join(tmpdir(), "hesap-kicad-"));
    for (const f of files) writeFileSync(join(dir, f.path.split("/").pop()!), f.content);
    writeFileSync(join(dir, "sym-lib-table"), '(sym_lib_table\n  (lib (name "cpu16")(type "KiCad")(uri "${KIPRJMOD}/cpu16.kicad_sym")(options "")(descr ""))\n)\n');
    writeFileSync(join(dir, "cpu16.kicad_sym"), readFileSync(new URL("../../cpu16/kicad/cpu16.kicad_sym", import.meta.url), "utf8"));
    const out = join(dir, "hesap.net");
    execFileSync("kicad-cli", ["sch", "export", "netlist", "-o", out, join(dir, "hesap.kicad_sch")], { stdio: "ignore" });
    const tree = parseSExpr(readFileSync(out, "utf8")) as SExpr[];
    const nets = (tree.find((x) => Array.isArray(x) && x[0] === "nets") as SExpr[]).slice(1) as SExpr[][];
    const kicad = new Set<string>();
    for (const net of nets) {
      const pins = (net.filter((x) => Array.isArray(x) && x[0] === "node") as SExpr[][]).map(
        (nd) => `${(nd.find((x) => Array.isArray(x) && x[0] === "ref") as string[])[1]}.${(nd.find((x) => Array.isArray(x) && x[0] === "pin") as string[])[1]}`,
      );
      if (pins.length > 1) kicad.add(pins.sort().join(" "));
    }
    const bizim = new Map<number, string[]>();
    for (const ci of board.chips) for (const p of ci.def.pins) if (ci.nets[p.name] !== undefined) bizim.set(ci.nets[p.name], [...(bizim.get(ci.nets[p.name]) ?? []), `${ci.ref}.${p.num}`]);
    for (const p of board.passives) for (const [num, net] of Object.entries(p.pins)) bizim.set(net, [...(bizim.get(net) ?? []), `${p.ref}.${num}`]);
    const mine = new Set([...bizim.values()].filter((v) => v.length > 1).map((v) => v.sort().join(" ")));
    expect([...mine].filter((x) => !kicad.has(x)).slice(0, 3)).toEqual([]);
    expect([...kicad].filter((x) => !mine.has(x)).slice(0, 3)).toEqual([]);
  });
});
