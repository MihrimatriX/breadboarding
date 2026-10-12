// Şema = kod. Bir kart, kütüphanedeki çiplerin örneklerinden ve aralarındaki netlerden oluşur.
// Aynı tanımdan hem kapı seviyesi simülasyon (LogicSim), hem KiCad şeması/netlist'i, hem BOM,
// hem de 3D görünüm üretilir; şema değişirse hepsi birlikte değişir.

import { chip } from "../chips/library.ts";
import { refPrefix } from "../chips/kicad.ts";
import { Circuit } from "../chips/logic.ts";
import { BACKPLANE } from "./passives.ts";
import type { ChipDef, PinNets } from "../chips/types.ts";

export interface ChipInstance {
  /** KiCad referansı, ör. "U12" */
  ref: string;
  def: ChipDef;
  /** Hangi kart (şema sayfası) */
  card: string;
  /** Şemadaki görevi, ör. "R3 düşük bayt" */
  role: string;
  /** Kart üzerindeki işlev bloğu, ör. "ALU" (3D yerleşim bunu gruplar) */
  block: string;
  /** pin adı → net */
  nets: PinNets;
  /** Bu çipin circuit.gates içindeki kapı aralığı [başlangıç, bitiş) */
  gates: [number, number];
  /** build() dönüşü (bellek içeriği) */
  handle: unknown;
  /** KiCad footprint'i (kütüphanedekinden farklıysa, ör. ZIF soket) */
  footprint: string;
  /** Yapıştırıcı lojik çipinde her birimin (kapının) ait olduğu blok ve pinleri (deney rehberi için) */
  glueUnits?: { block: string; pins: string[]; role: string }[];
  /**
   * Lojik ailesi: "AC" = aynı bacak düzenli 74AC (hızlı yollar, ör. 25 MHz piksel saati). Simülasyon
   * aynıdır; şemada / BOM'da değer 74ACxxx yazılır, zamanlama analizi AC gecikmeleriyle hesaplar.
   */
  aile?: "AC";
}

/** Çipin şemadaki / BOM'daki değeri (aile 74AC ise 74HC yerine 74AC) */
export const partValue = (ci: Pick<ChipInstance, "def" | "aile">): string => (ci.aile === "AC" ? ci.def.part.replace(/^74HC/, "74AC") : ci.def.part);

export interface Passive {
  ref: string;
  card: string;
  /** passives.ts içindeki eleman, ör. "C_100N" */
  part: string;
  /** pin numarası → net */
  pins: Record<string, number>;
  role: string;
  /** Eklendiği işlev bloğu */
  block: string;
}

type Net = number | string;

/**
 * Kart başına referans numarası tabanı. Her kart kendi KiCad projesidir; numaralar kartın içinde
 * sırayla verilir, böylece bir kartın referansları (U, R, C …) hangi bilgisayarda kullanılırsa
 * kullanılsın aynı kalır (deney rehberleri ve 3D görünüm buna dayanır). Tabloda olmayan kartlar
 * 400'den başlayarak 100'lük dilimler alır.
 */
export const CARD_REF_BASE: Record<string, [base: number, span: number]> = {
  cpu: [0, 200],
  clk: [200, 100],
  mem: [300, 100],
  prog: [0, 100],
  // anakart kartları: tek başına kurulsalar da anakartta da aynı referanslar
  bellek: [400, 100],
  onbellek: [500, 100],
  gc: [600, 100],
  video: [700, 100],
  kyb: [800, 100],
  // 8 bit hesap makinesi (hesap8/): tek, büyük kart; bilgisayardan bağımsız
  hesap: [0, 1000],
};

/** Yapıştırıcı (glue) kapı türleri: hangi çipten, birimde hangi pinler */
const GLUE = {
  and: { part: "74HC08", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  or: { part: "74HC32", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  nand: { part: "74HC00", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  nor: { part: "74HC02", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  xor: { part: "74HC86", units: 4, pins: (u: number) => [`${u}A`, `${u}B`, `${u}Y`] },
  not: { part: "74HC04", units: 6, pins: (u: number) => [`${u}A`, `${u}Y`] },
  nand3: { part: "74HC10", units: 3, pins: (u: number) => [`${u}A`, `${u}B`, `${u}C`, `${u}Y`] },
  // kontrol birimi (board/kontrol.ts) için geniş kapılar; sona eklendi ki eski kartların numaraları değişmesin
  and3: { part: "74HC11", units: 3, pins: (u: number) => [`${u}A`, `${u}B`, `${u}C`, `${u}Y`] },
  nor3: { part: "74HC27", units: 3, pins: (u: number) => [`${u}A`, `${u}B`, `${u}C`, `${u}Y`] },
  and4: { part: "74HC21", units: 2, pins: (u: number) => [`${u}A`, `${u}B`, `${u}C`, `${u}D`, `${u}Y`] },
  nand4: { part: "74HC20", units: 2, pins: (u: number) => [`${u}A`, `${u}B`, `${u}C`, `${u}D`, `${u}Y`] },
  nand8: { part: "74HC30", units: 1, pins: () => ["A", "B", "C", "D", "E", "F", "G", "H", "Y"] },
} as const;
type GlueKind = keyof typeof GLUE;

/**
 * Boş birim doldurma (Board.flexibleGlue): bir kapı, girişleri sabite bağlanarak başka türden
 * bir birimde aynı işlevi görür. Her satır: hedef tür ve eklenecek sabit girişler.
 * NOT a = NAND(a,1) = NOR(a,0) = XOR(a,1); AND(a,b) = AND3(a,b,1); NAND(a,b) = NAND3(a,b,1) …
 */
const GLUE_SUBSTITUTE: Partial<Record<GlueKind, [GlueKind, ("VCC" | "GND")[]][]>> = {
  not: [["nand", ["VCC"]], ["nor", ["GND"]], ["nand3", ["VCC", "VCC"]], ["nor3", ["GND", "GND"]], ["nand4", ["VCC", "VCC", "VCC"]], ["xor", ["VCC"]]],
  and: [["and3", ["VCC"]], ["and4", ["VCC", "VCC"]]],
  and3: [["and4", ["VCC"]]],
  nand: [["nand3", ["VCC"]], ["nand4", ["VCC", "VCC"]], ["nand8", ["VCC", "VCC", "VCC", "VCC", "VCC", "VCC"]]],
  nand3: [["nand4", ["VCC"]], ["nand8", ["VCC", "VCC", "VCC", "VCC", "VCC"]]],
  nand4: [["nand8", ["VCC", "VCC", "VCC", "VCC"]]],
  nor: [["nor3", ["GND"]]],
};

export class Board {
  readonly c = new Circuit();
  readonly chips: ChipInstance[] = [];
  readonly passives: Passive[] = [];
  /** Net çekme dirençleri (simülasyonda zayıf sürücü) */
  readonly pulls: { net: number; level: 0 | 1 }[] = [];
  card = "cpu";
  /** Sonraki çiplerin işlev bloğu */
  block = "";
  private readonly named = new Map<string, number>();
  private readonly extraBases = new Map<string, number>();
  private readonly glue: { kind: GlueKind; card: string; block: string; nets: number[]; role: string; flex: boolean }[] = [];
  /**
   * true iken eklenen yapıştırıcı kapılar esnektir (kontrol birimi, board/kontrol.ts):
   * - finish() onları kartın diğer yapıştırıcı çiplerinden SONRA paketler: önce o çiplerin boş
   *   birimlerine, sonra yeni çiplere. Böylece kartın eski çiplerinin referansları değişmez.
   * - Bir türün son çipi az doluysa esnek kapılar başka türlerin boş birimlerine taşınabilir
   *   (GLUE_SUBSTITUTE): kart bir çip kazanır.
   */
  flexibleGlue = false;
  /** defer() ile ertelenen yerleştirmeler: normal yapıştırıcı çiplerinden sonra, esnek kapılardan önce */
  private readonly deferred: { card: string; block: string; fn: () => void }[] = [];
  /** sonaErtele() ile ertelenenler: bütün kartlardan ve esnek kapılardan sonra */
  private readonly sona: { card: string; block: string; fn: () => void }[] = [];
  private finished = false;

  constructor() {
    this.named.set("GND", this.c.GND);
    this.named.set("VCC", this.c.VCC);
  }

  /** Adlı net (yoksa oluşturur) */
  n(name: string): number {
    let id = this.named.get(name);
    if (id === undefined) {
      id = this.c.net(name);
      this.named.set(name, id);
    }
    return id;
  }

  /** Geçerli kartta n. elemanın referans numarası (CARD_REF_BASE) */
  private refNumber(n: number): number {
    let base: number;
    let span = 100;
    const fixed = CARD_REF_BASE[this.card];
    if (fixed) [base, span] = fixed;
    else {
      if (!this.extraBases.has(this.card)) this.extraBases.set(this.card, 400 + 100 * this.extraBases.size);
      base = this.extraBases.get(this.card)!;
    }
    if (n >= span) throw new Error(`${this.card} kartında ${span - 1}'den fazla aynı türden eleman var: CARD_REF_BASE'i genişlet`);
    return base + n;
  }

  has(name: string): boolean {
    return this.named.has(name);
  }

  /** prefix0..prefix(n-1) adlı netler */
  bus(prefix: string, n: number): number[] {
    return Array.from({ length: n }, (_, i) => this.n(`${prefix}${i}`));
  }

  netName(id: number): string {
    return this.c.netNames[id];
  }

  private resolve(x: Net): number {
    return typeof x === "number" ? x : this.n(x);
  }

  /** Bir çip yerleştir. Bağlanmamış giriş pini hata verir (CMOS girişi boşta bırakılmaz). */
  place(part: string, conn: Record<string, Net>, role = "", opts: { footprint?: string; aile?: "AC" } = {}): ChipInstance {
    if (this.finished) throw new Error("Kart tamamlandıktan sonra çip eklenemez");
    const def = chip(part);
    const ref = `U${this.refNumber(this.chips.filter((c) => c.card === this.card).length + 1)}`;
    const nets: PinNets = {};
    for (const p of def.pins) {
      if (p.dir === "power") {
        nets[p.name] = /^(GND|VSS)$/.test(p.name) ? this.c.GND : this.c.VCC;
        continue;
      }
      if (p.dir === "nc") continue;
      const x = conn[p.name];
      if (x === undefined) {
        if (p.dir === "in") throw new Error(`${ref} (${part}, ${role}): ${p.name} girişi bağlanmamış`);
        nets[p.name] = this.c.net(`${ref}.${p.name}`);
      } else nets[p.name] = this.resolve(x);
    }
    for (const k of Object.keys(conn)) {
      if (!def.pins.some((p) => p.name === k)) throw new Error(`${ref} (${part}): böyle bir pin yok: ${k}`);
    }
    this.c.owner = ref;
    const start = this.c.gates.length;
    const handle = def.build(this.c, nets);
    const inst: ChipInstance = {
      ref, def, card: this.card, role, block: this.block, nets, gates: [start, this.c.gates.length], handle,
      footprint: opts.footprint ?? def.footprint,
    };
    if (opts.aile) {
      if (!/^74HC/.test(part)) throw new Error(`${ref} (${part}): yalnızca 74HC çipleri 74AC olarak yerleştirilebilir`);
      inst.aile = opts.aile;
    }
    this.chips.push(inst);
    return inst;
  }

  /** Pasif eleman (direnç dizisi, kondansatör, LED, konnektör): simülasyona etkisi yok, BOM ve şema için */
  passive(part: string, pins: Record<string, Net>, role: string): Passive {
    const prefix = refPrefix(part);
    if (prefix === "U") throw new Error(`${part}: pasif elemanın referans harfi U olamaz (entegrelerle çakışır)`);
    const n = this.passives.filter((x) => x.card === this.card && refPrefix(x.part) === prefix).length + 1;
    const resolved: Record<string, number> = {};
    for (const [k, v] of Object.entries(pins)) resolved[k] = this.resolve(v);
    const p: Passive = { ref: `${prefix}${this.refNumber(n)}`, card: this.card, part, pins: resolved, role, block: this.block };
    this.passives.push(p);
    return p;
  }

  /** Netleri bir direnç dizisiyle GND'ye çek (10 kΩ, 8'li SIP, ortak uç GND) */
  pullDown(nets: number[], role: string): void {
    for (let i = 0; i < nets.length; i += 8) {
      const group = nets.slice(i, i + 8);
      const pins: Record<string, Net> = { "1": "GND" };
      group.forEach((net, k) => (pins[String(k + 2)] = net));
      this.passive("RN_10K_8", pins, role);
      for (const net of group) this.pulls.push({ net, level: 0 });
    }
  }

  /** Netleri VCC'ye çek: tek net için 10 kΩ direnç, fazlası için 8'li SIP dizi (ortak uç VCC) */
  pullUp(nets: Net[], role: string): void {
    const ids = nets.map((x) => this.resolve(x));
    if (ids.length === 1) {
      this.passive("R_10K", { "1": "VCC", "2": ids[0] }, role);
    } else {
      for (let i = 0; i < ids.length; i += 8) {
        const pins: Record<string, Net> = { "1": "VCC" };
        ids.slice(i, i + 8).forEach((net, k) => (pins[String(k + 2)] = net));
        this.passive("RN_10K_8", pins, role);
      }
    }
    for (const net of ids) this.pulls.push({ net, level: 1 });
  }

  /**
   * Durum LED'i: sinyal → 330 Ω → LED → GND, sinyal 1 iken yanar. Seçenekler (CPU kartının hata
   * ayıklama LED'leri): `aktifDusuk` VCC → direnç → LED → sinyal, sinyal 0 iken yanar (74HC çıkışı
   * akımı çeker; ~ROE0 gibi aktif düşük sinyaller); `direnc` seri direncin parçası (ör. "R_1K",
   * ≈ 3 mA); `gorev` LED'in görevinin sonuna eklenir (renk görevden seçilir: LED_RENK_KURALLARI).
   */
  led(signal: Net, name: string, o: { aktifDusuk?: boolean; direnc?: string; gorev?: string } = {}): void {
    const mid = this.n(`LED_${name}`);
    const r = o.direnc ?? "R_330";
    const ek = o.gorev ? `: ${o.gorev}` : "";
    if (o.aktifDusuk) {
      this.passive(r, { "1": "VCC", "2": mid }, `${name} LED direnci`);
      this.passive("LED", { "1": mid, "2": signal }, `${name} LED'i${ek}`);
      return;
    }
    this.passive(r, { "1": signal, "2": mid }, `${name} LED direnci`);
    this.passive("LED", { "1": mid, "2": "GND" }, `${name} LED'i${ek}`);
  }

  /**
   * Çubuk gösterge (10 segmentli LED çubuk, DIP-20) ve 8 × 1 kΩ yalıtılmış direnç dizisi (DIP-16):
   * k. sinyal → dizinin k. direnci → k. segmentin anodu; katotlar GND'de, sinyal 1 iken segment yanar.
   * En çok 8 sinyal (bir bayt, 1. segment bit 0); null verilen segment ve 9., 10. segmentler boş.
   * Segment anotlarının netleri `ad` + bit numarası (`ilk`ten başlar: BAR_BUS8 … BAR_BUS15);
   * `gorev`: ör. "iç veriyolu BUS0–7".
   */
  cubuk(sinyaller: (Net | null)[], ad: string, gorev: string, ilk = 0): void {
    if (sinyaller.length > 8) throw new Error(`${gorev}: çubuk göstergede en çok 8 sinyal`);
    const dizi: Record<string, Net> = {};
    const gosterge: Record<string, Net> = {};
    sinyaller.forEach((s, i) => {
      if (s === null) return;
      const anot = `${ad}${ilk + i}`;
      dizi[String(i + 1)] = s;
      dizi[String(16 - i)] = anot;
      gosterge[String(i + 1)] = anot;
      gosterge[String(20 - i)] = "GND";
    });
    this.passive("RN_1K_ISO_8", dizi, `${gorev}: segment dirençleri`);
    this.passive("DISP_BAR_10", gosterge, `${gorev}: çubuk gösterge`);
  }

  // ---- yapıştırıcı kapılar: kart bitince gerçek çiplere paketlenir
  private gate(kind: GlueKind, ins: Net[], out?: Net, role = ""): number {
    const y = out === undefined ? this.c.net() : this.resolve(out);
    this.glue.push({ kind, card: this.card, block: this.block, nets: [...ins.map((x) => this.resolve(x)), y], role, flex: this.flexibleGlue });
    return y;
  }
  and(a: Net, b: Net, out?: Net, role?: string) { return this.gate("and", [a, b], out, role); }
  or(a: Net, b: Net, out?: Net, role?: string) { return this.gate("or", [a, b], out, role); }
  nand(a: Net, b: Net, out?: Net, role?: string) { return this.gate("nand", [a, b], out, role); }
  nor(a: Net, b: Net, out?: Net, role?: string) { return this.gate("nor", [a, b], out, role); }
  xor(a: Net, b: Net, out?: Net, role?: string) { return this.gate("xor", [a, b], out, role); }
  not(a: Net, out?: Net, role?: string) { return this.gate("not", [a], out, role); }
  nand3(a: Net, b: Net, c: Net, out?: Net, role?: string) { return this.gate("nand3", [a, b, c], out, role); }
  and3(a: Net, b: Net, c: Net, out?: Net, role?: string) { return this.gate("and3", [a, b, c], out, role); }
  nor3(a: Net, b: Net, c: Net, out?: Net, role?: string) { return this.gate("nor3", [a, b, c], out, role); }
  and4(a: Net, b: Net, c: Net, d: Net, out?: Net, role?: string) { return this.gate("and4", [a, b, c, d], out, role); }
  nand4(a: Net, b: Net, c: Net, d: Net, out?: Net, role?: string) { return this.gate("nand4", [a, b, c, d], out, role); }
  /** 5..8 girişli NAND (74HC30); eksik girişler VCC'ye bağlanır */
  nand8(ins: Net[], out?: Net, role?: string) {
    if (ins.length < 2 || ins.length > 8) throw new Error(`nand8: ${ins.length} giriş`);
    return this.gate("nand8", [...ins, ...Array<Net>(8 - ins.length).fill("VCC")], out, role);
  }

  /** Bir yapıştırıcı çipi: verilen kapılar birimlerine, boş birimlerin girişleri GND'ye */
  private packGlue(g: (typeof GLUE)[GlueKind], items: { block: string; nets: number[]; role: string }[]): void {
    const conn: Record<string, Net> = {};
    const roles: string[] = [];
    const units: { block: string; pins: string[]; role: string }[] = [];
    for (let u = 1; u <= g.units; u++) {
      const item = items[u - 1];
      const pins = g.pins(u);
      if (item) {
        pins.forEach((p, k) => (conn[p] = item.nets[k]));
        if (item.role) roles.push(item.role);
        units.push({ block: item.block, pins: [...pins], role: item.role });
      } else {
        pins.slice(0, -1).forEach((p) => (conn[p] = "GND")); // boş birim: girişler GND
      }
    }
    const inst = this.place(g.part, conn, roles.length ? `yapıştırıcı: ${[...new Set(roles)].join(", ")}` : "yapıştırıcı lojik");
    inst.glueUnits = units;
  }

  /**
   * Kartta son çipi az dolu bir kapı türü varsa, o çipteki birimler kadar esnek kapıyı başka
   * türlerin boş birimlerine taşı (yeni çip açmadan); her adım kartta bir çip kazandırır.
   * En az dolu son çipten başlar, kazanç kalmayınca durur.
   */
  private fillSpareUnits(card: string): void {
    const items = this.glue.filter((x) => x.card === card);
    const count = (k: GlueKind) => items.filter((x) => x.kind === k).length;
    const spare = (k: GlueKind) => {
      const n = count(k);
      return n === 0 ? 0 : (GLUE[k].units - (n % GLUE[k].units)) % GLUE[k].units;
    };
    for (;;) {
      const kinds = (Object.keys(GLUE) as GlueKind[])
        .map((k) => ({ k, rest: count(k) % GLUE[k].units }))
        .filter((x) => x.rest > 0 && GLUE_SUBSTITUTE[x.k])
        .sort((a, b) => a.rest - b.rest);
      let moved = false;
      for (const { k, rest } of kinds) {
        const flex = items.filter((x) => x.kind === k && x.flex).slice(0, rest);
        if (flex.length < rest) continue;
        const room = new Map(GLUE_SUBSTITUTE[k]!.map(([t]) => [t, spare(t)]));
        const plan: [GlueKind, ("VCC" | "GND")[]][] = [];
        for (const [t, pad] of GLUE_SUBSTITUTE[k]!) {
          while (plan.length < rest && room.get(t)! > 0) {
            plan.push([t, pad]);
            room.set(t, room.get(t)! - 1);
          }
        }
        if (plan.length < rest) continue;
        flex.forEach((item, i) => {
          const [t, pad] = plan[i];
          const y = item.nets[item.nets.length - 1];
          item.kind = t;
          item.nets = [...item.nets.slice(0, -1), ...pad.map((p) => this.resolve(p)), y];
        });
        moved = true;
        break;
      }
      if (!moved) return;
    }
  }

  /**
   * Bir yerleştirmeyi ertele: finish() onu kartın normal yapıştırıcı çiplerinden sonra çalıştırır
   * (o çiplerin referansları değişmesin diye; ör. kontrol biriminin kalan çipleri).
   */
  defer(fn: () => void): void {
    this.deferred.push({ card: this.card, block: this.block, fn });
  }

  /**
   * Bir eklemeyi en sona ertele: finish() onu bütün kartlar kurulduktan ve esnek kapılar da
   * paketlendikten sonra çalıştırır. Oluşturduğu netler en sona numaralanır: öbür kartların adsız
   * netlerinin adı (n1234) ve çiplerin referansları değişmez (ör. CPU kartının hata ayıklama
   * LED'leri ve çubuk göstergeleri; breadboard verisinin netlist parmak izi de korunur).
   */
  sonaErtele(fn: () => void): void {
    this.sona.push({ card: this.card, block: this.block, fn });
  }

  /** Yapıştırıcı kapıları çiplere yerleştir; kullanılmayan birimlerin girişlerini GND'ye bağla. */
  finish(o: { backplane?: boolean } = {}): void {
    if (this.finished) return;
    const savedCard = this.card;
    for (const card of new Set(this.glue.filter((x) => x.flex).map((x) => x.card))) this.fillSpareUnits(card);
    // 1. normal kapılar (son çipin boş birimleri aynı türden esnek kapılarla dolar), 2. ertelenen
    // yerleştirmeler, 3. kalan esnek kapılar, 4. en sona ertelenenler
    const flexLeft = new Set(this.glue.filter((x) => x.flex));
    const pack = (flex: boolean) => {
      this.block = "Yapıştırıcı lojik";
      for (const kind of Object.keys(GLUE) as GlueKind[]) {
        const g = GLUE[kind];
        const cards = [...new Set(this.glue.filter((x) => x.kind === kind).map((x) => x.card))];
        for (const card of cards) {
          const ofKind = this.glue.filter((x) => x.kind === kind && x.card === card);
          let items = ofKind.filter((x) => x.flex === flex && (!flex || flexLeft.has(x)));
          if (!flex) {
            const fill = (g.units - (items.length % g.units)) % g.units;
            items = [...items, ...ofKind.filter((x) => flexLeft.has(x)).slice(0, items.length ? fill : 0)];
          }
          for (const x of items) flexLeft.delete(x);
          this.card = card;
          for (let i = 0; i < items.length; i += g.units) this.packGlue(g, items.slice(i, i + g.units));
        }
      }
    };
    pack(false);
    for (const d of this.deferred) {
      this.card = d.card;
      this.block = d.block;
      d.fn();
    }
    pack(true);
    for (const d of this.sona) {
      this.card = d.card;
      this.block = d.block;
      d.fn();
    }
    // her kart: arka panel konnektörü (istenirse), giriş kondansatörü, her entegreye 100 nF
    for (const card of [...new Set(this.chips.map((c) => c.card))]) {
      this.card = card;
      this.block = "Besleme ve arka panel";
      if (o.backplane !== false) {
        const pins: Record<string, Net> = {};
        for (const [num, name] of Object.entries(BACKPLANE)) if (this.has(name)) pins[num] = name;
        this.passive("BACKPLANE_2x32", pins, "arka panel konnektörü");
      }
      this.passive("C_100U", { "1": "VCC", "2": "GND" }, "besleme girişi");
      for (const ci of this.chips.filter((c) => c.card === card)) {
        this.block = ci.block;
        this.passive("C_100N", { "1": "VCC", "2": "GND" }, `${ci.ref} dekuplaj`);
      }
    }
    this.card = savedCard;
    this.finished = true;
  }

  /** Çiplerin kart başına sayısı */
  summary(): Record<string, Record<string, number>> {
    const out: Record<string, Record<string, number>> = {};
    for (const ci of this.chips) {
      out[ci.card] ??= {};
      out[ci.card][ci.def.part] = (out[ci.card][ci.def.part] ?? 0) + 1;
    }
    return out;
  }

  instance(ref: string): ChipInstance {
    const ci = this.chips.find((x) => x.ref === ref);
    if (!ci) throw new Error(`Böyle bir çip yok: ${ref}`);
    return ci;
  }
}

/** Elektriksel kural denetimi: çakışan çıkışlar ve sürülmeyen girişler */
export function erc(b: Board, externalInputs: string[] = []): string[] {
  const problems: string[] = [];
  const info = new Map<number, { out: string[]; tri: string[]; inp: string[] }>();
  const get = (net: number) => {
    let x = info.get(net);
    if (!x) info.set(net, (x = { out: [], tri: [], inp: [] }));
    return x;
  };
  for (const ci of b.chips) {
    for (const p of ci.def.pins) {
      const net = ci.nets[p.name];
      if (net === undefined || net === b.c.GND || net === b.c.VCC) continue;
      const where = `${ci.ref}.${p.name}`;
      if (p.dir === "out") get(net).out.push(where);
      else if (p.dir === "tri" || p.dir === "bidir") get(net).tri.push(where);
      else if (p.dir === "in") get(net).inp.push(where);
    }
  }
  const pulled = new Set(b.pulls.map((p) => p.net));
  const ext = new Set(externalInputs.map((n) => b.n(n)));
  for (const [net, x] of info) {
    const name = b.netName(net);
    if (x.out.length > 1) problems.push(`${name}: birden fazla çıkış sürüyor (${x.out.join(", ")})`);
    if (x.out.length && x.tri.length) problems.push(`${name}: itme-çekme çıkış ile üç durumlu çıkış aynı nette (${[...x.out, ...x.tri].join(", ")})`);
    if (x.inp.length && !x.out.length && !x.tri.length && !pulled.has(net) && !ext.has(net)) {
      problems.push(`${name}: sürülmeyen giriş (${x.inp.join(", ")})`);
    }
  }
  return problems;
}
