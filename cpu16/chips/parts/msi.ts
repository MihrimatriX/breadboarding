// MSI birleşimsel çipler: kod çözücüler, öncelik kodlayıcı, seçiciler, toplayıcı, karşılaştırıcı.

import { b, busOut, busValue, comb, dipFootprint, pinsOf, range, type ChipDef, type RefOut } from "../types.ts";

export const HC138: ChipDef = {
  part: "74HC138",
  title: "3'ten 8'e kod çözücü (aktif düşük çıkış)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("A0 A1 A2 ~E1 ~E2 E3 ~Y7 GND ~Y6 ~Y5 ~Y4 ~Y3 ~Y2 ~Y1 ~Y0 VCC", { out: range("~Y", 8).join(" ") }),
  build(c, p) {
    const en = c.and([c.not(p["~E1"]), c.not(p["~E2"]), p.E3]);
    const a = [p.A0, p.A1, p.A2];
    const na = a.map((x) => c.not(x));
    for (let k = 0; k < 8; k++) c.nand([en, ...a.map((x, i) => ((k >> i) & 1 ? x : na[i]))], p[`~Y${k}`]);
  },
  ref: comb((p) => {
    const en = !p["~E1"] && !p["~E2"] && p.E3;
    const sel = busValue(p, ["A0", "A1", "A2"]);
    const out: RefOut = {};
    for (let k = 0; k < 8; k++) out[`~Y${k}`] = b(!(en && sel === k));
    return out;
  }),
  usage: "BUS alanını çözme (veriyolu sürücüsü seçimi), G/Ç adres çözme, register yazma sinyalleri",
};

export const HC139: ChipDef = {
  part: "74HC139",
  title: "2 × (2'den 4'e kod çözücü)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("~1E 1A0 1A1 ~1Y0 ~1Y1 ~1Y2 ~1Y3 GND ~2Y3 ~2Y2 ~2Y1 ~2Y0 2A1 2A0 ~2E VCC", {
    out: "~1Y0 ~1Y1 ~1Y2 ~1Y3 ~2Y0 ~2Y1 ~2Y2 ~2Y3",
  }),
  build(c, p) {
    for (const u of [1, 2]) {
      const en = c.not(p[`~${u}E`]);
      const a = [p[`${u}A0`], p[`${u}A1`]];
      const na = a.map((x) => c.not(x));
      for (let k = 0; k < 4; k++) c.nand([en, (k & 1 ? a[0] : na[0]), (k & 2 ? a[1] : na[1])], p[`~${u}Y${k}`]);
    }
  },
  ref: comb((p) => {
    const out: RefOut = {};
    for (const u of [1, 2]) {
      const sel = p[`${u}A0`] | (p[`${u}A1`] << 1);
      for (let k = 0; k < 4; k++) out[`~${u}Y${k}`] = b(!(!p[`~${u}E`] && sel === k));
    }
    return out;
  }),
  usage: "Bellek pencere seçimi (A15:A14 → 4 pencere)",
};

export const HC148: ChipDef = {
  part: "74HC148",
  title: "8'den 3'e öncelikli kodlayıcı",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("~I4 ~I5 ~I6 ~I7 ~EI ~A2 ~A1 GND ~A0 ~I0 ~I1 ~I2 ~I3 ~GS ~EO VCC", { out: "~A0 ~A1 ~A2 ~GS ~EO" }),
  build(c, p) {
    const en = c.not(p["~EI"]);
    const i = range("~I", 8).map((n) => c.not(p[n]));
    const ni = range("~I", 8).map((n) => p[n]); // aktif düşük giriş = "yok" sinyali
    const any = c.or(i);
    c.nand([en, any], p["~GS"]);
    c.nand([en, c.not(any)], p["~EO"]);
    c.nand([en, c.or([i[4], i[5], i[6], i[7]])], p["~A2"]);
    c.nand([en, c.or([c.and([i[2], ni[4], ni[5]]), c.and([i[3], ni[4], ni[5]]), i[6], i[7]])], p["~A1"]);
    c.nand([en, c.or([c.and([i[1], ni[2], ni[4], ni[6]]), c.and([i[3], ni[4], ni[6]]), c.and([i[5], ni[6]]), i[7]])], p["~A0"]);
  },
  ref: comb((p): RefOut => {
    if (p["~EI"]) return { "~A0": 1, "~A1": 1, "~A2": 1, "~GS": 1, "~EO": 1 };
    let top = -1;
    for (let k = 7; k >= 0; k--) if (!p[`~I${k}`]) { top = k; break; }
    if (top < 0) return { "~A0": 1, "~A1": 1, "~A2": 1, "~GS": 1, "~EO": 0 };
    return { ...busOut(["~A0", "~A1", "~A2"], ~top & 7), "~GS": 0, "~EO": 1 };
  }),
  usage: "Kesme denetleyicisi: en yüksek öncelikli kaynağın numarası (IRQ_SRC)",
};

export const HC151: ChipDef = {
  part: "74HC151",
  title: "8'den 1'e seçici (multiplexer)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("I3 I2 I1 I0 Y ~Y ~E GND S2 S1 S0 I7 I6 I5 I4 VCC", { out: "Y ~Y" }),
  build(c, p) {
    const en = c.not(p["~E"]);
    const s = [p.S0, p.S1, p.S2];
    const ns = s.map((x) => c.not(x));
    const terms = range("I", 8).map((n, k) => c.and([en, p[n], ...s.map((x, i) => ((k >> i) & 1 ? x : ns[i]))]));
    const y = c.or(terms, p.Y);
    c.not(y, p["~Y"]);
  },
  ref: comb((p) => {
    const y = !p["~E"] && p[`I${busValue(p, ["S0", "S1", "S2"])}`] === 1;
    return { Y: b(y), "~Y": b(!y) };
  }),
  usage: "Koşul birimi: cond[3:1] ile 8 bayrak ifadesinden birini seçer",
};

export const HC153: ChipDef = {
  part: "74HC153",
  title: "2 × (4'ten 1'e seçici)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("~1E S1 1I3 1I2 1I1 1I0 1Y GND 2Y 2I0 2I1 2I2 2I3 S0 ~2E VCC", { out: "1Y 2Y" }),
  build(c, p) {
    const s = [p.S0, p.S1];
    const ns = s.map((x) => c.not(x));
    for (const u of [1, 2]) {
      const en = c.not(p[`~${u}E`]);
      const terms = [0, 1, 2, 3].map((k) => c.and([en, p[`${u}I${k}`], k & 1 ? s[0] : ns[0], k & 2 ? s[1] : ns[1]]));
      c.or(terms, p[`${u}Y`]);
    }
  },
  ref: comb((p) => {
    const sel = p.S0 | (p.S1 << 1);
    return {
      "1Y": b(!p["~1E"] && p[`1I${sel}`] === 1),
      "2Y": b(!p["~2E"] && p[`2I${sel}`] === 1),
    };
  }),
  usage: "Register dosyası: RSEL ile RD/RS1/RS2/SP/LR indeksini seçme",
};

export const HC157: ChipDef = {
  part: "74HC157",
  title: "4 × (2'den 1'e seçici)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("S 1I0 1I1 1Y 2I0 2I1 2Y GND 3Y 3I1 3I0 4Y 4I1 4I0 ~E VCC", { out: "1Y 2Y 3Y 4Y" }),
  build(c, p) {
    const en = c.not(p["~E"]);
    const ns = c.not(p.S);
    for (let u = 1; u <= 4; u++) c.or([c.and([en, ns, p[`${u}I0`]]), c.and([en, p.S, p[`${u}I1`]])], p[`${u}Y`]);
  },
  ref: comb((p) => {
    const out: RefOut = {};
    for (let u = 1; u <= 4; u++) out[`${u}Y`] = b(!p["~E"] && p[`${u}I${p.S}`] === 1);
    return out;
  }),
  usage: "ALU kaydırıcı ve çıkış seçici, adres çoklama (MAR / video)",
};

export const HC283: ChipDef = {
  part: "74HC283",
  title: "4 bit ikili tam toplayıcı (ileri bakışlı elde)",
  pkg: "DIP-16",
  footprint: dipFootprint(16),
  pins: pinsOf("S2 B2 A2 S1 A1 B1 CIN GND COUT S4 B4 A4 S3 A3 B3 VCC", { out: "S1 S2 S3 S4 COUT" }),
  build(c, p) {
    const a = [p.A1, p.A2, p.A3, p.A4];
    const bb = [p.B1, p.B2, p.B3, p.B4];
    const g = a.map((x, i) => c.and([x, bb[i]])); // üret (generate)
    const t = a.map((x, i) => c.or([x, bb[i]])); // ilet (propagate)
    const h = a.map((x, i) => c.xor(x, bb[i])); // yarım toplam
    // ileri bakışlı elde: c(i+1) = g(i) + t(i)·g(i-1) + … + t(i)…t(0)·cin
    const carry = [p.CIN];
    for (let i = 0; i < 4; i++) {
      const terms: number[] = [];
      for (let j = i; j >= -1; j--) {
        const chain = [];
        for (let k = i; k > j; k--) chain.push(t[k]);
        chain.push(j >= 0 ? g[j] : p.CIN);
        terms.push(chain.length === 1 ? chain[0] : c.and(chain));
      }
      carry.push(c.or(terms, i === 3 ? p.COUT : undefined));
    }
    for (let i = 0; i < 4; i++) c.xor(h[i], carry[i], p[`S${i + 1}`]);
  },
  ref: comb((p) => {
    const sum = busValue(p, ["A1", "A2", "A3", "A4"]) + busValue(p, ["B1", "B2", "B3", "B4"]) + p.CIN;
    return { ...busOut(["S1", "S2", "S3", "S4"], sum & 15), COUT: b(sum > 15) };
  }),
  usage: "ALU toplayıcısı (4 adet = 16 bit), PC +2",
};

export const HC688: ChipDef = {
  part: "74HC688",
  title: "8 bit eşitlik karşılaştırıcı",
  pkg: "DIP-20",
  footprint: dipFootprint(20),
  pins: pinsOf("~E P0 Q0 P1 Q1 P2 Q2 P3 Q3 GND P4 Q4 P5 Q5 P6 Q6 P7 Q7 ~EQ VCC", { out: "~EQ" }),
  build(c, p) {
    const eq = range("P", 8).map((n, i) => c.xnor(p[n], p[`Q${i}`]));
    c.nand([c.not(p["~E"]), ...eq], p["~EQ"]);
  },
  ref: comb((p) => ({
    "~EQ": b(!(!p["~E"] && busValue(p, range("P", 8)) === busValue(p, range("Q", 8)))),
  })),
  usage: "Cache etiket karşılaştırması (hit/miss), adres eşleme",
};

export const MSI_CHIPS = [HC138, HC139, HC148, HC151, HC153, HC157, HC283, HC688];
