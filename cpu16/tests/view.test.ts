import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it, vi } from "vitest";
import { BLOK_EN, blokAdi, kartBasligi } from "../../src/board3d/adlar.ts";
import { findVgaOutput, dacVolts, resistance } from "../../src/board3d/beam.ts";
import { colWindow, memGeometry, rowWindow } from "../../src/board3d/memview.ts";
import { BANK0_END, compileProgram, detectLanguage, flashImage, FLASH_SIZE } from "../../src/board3d/program.ts";
import { findScreenSource } from "../../src/board3d/screen-source.ts";
import { PALETTE, ekranBilgisi, paintFrame, renderTextScreen, screenText, textFrame } from "../../src/board3d/screen.ts";
import { Ps2Sender, UartSender, type LineIo } from "../../src/board3d/serial-in.ts";
import {
  allWires, arcHeight, arcPoints, arcSegments, busRouter, mstEdges, netEndpoints, netTree, netWires, partLinks, partWires, ROUTE_Y,
  wireGeometry, type Endpoint,
} from "../../src/board3d/wires.ts";
import { assemble } from "../asm/assembler.ts";
import { loadLib } from "../cc/node.ts";
import { buildComputerBoard } from "../board/computer.ts";
import { chipInside, etiketDili, gateCmos, GateProbe, nodeLabel } from "../board/inside.ts";
import { buildHesapBoard } from "../../hesap8/kart.ts";
import { boardLayout, cardTitle, type BoardLayout } from "../board/layout.ts";
import { buildFullMachineBoard, FULL_MACHINE_CARDS, GateMachine } from "../board/machine-board.ts";
import { PASSIVES } from "../board/passives.ts";
import { Circuit, L0, L1, LogicSim, type Gate, type GateKind, type Level } from "../chips/logic.ts";
import { SRAM62256, SST39SF010 } from "../chips/parts/memory.ts";
import { pinsOf, type ChipDef } from "../chips/types.ts";
import { Machine } from "../emu/machine.ts";
import { romImage } from "../tools/machine-cli.ts";
import { FONT_8X16 } from "../video/font.ts";

const { board } = buildComputerBoard();

describe("Faz 5: 3D görünüm verisi", () => {
  it("kart yerleşimi: her çip kartının içinde, gövdeler çakışmıyor, pinler doğru netlerde", () => {
    const lay = boardLayout(board);
    expect(lay.chips).toHaveLength(board.chips.length);
    for (const c of lay.chips) {
      const card = lay.cards.find((k) => k.name === c.card)!;
      expect(c.x).toBeGreaterThanOrEqual(card.x);
      expect(c.x + c.w).toBeLessThanOrEqual(card.x + card.w);
      expect(c.y + c.h).toBeLessThanOrEqual(card.y + card.h);
      const ci = board.instance(c.ref);
      expect(c.pins).toHaveLength(ci.def.pins.length);
      for (const p of c.pins) if (ci.nets[p.name] !== undefined) expect(p.net).toBe(ci.nets[p.name]);
    }
    for (let i = 0; i < lay.chips.length; i++) {
      for (let j = i + 1; j < lay.chips.length; j++) {
        const a = lay.chips[i];
        const b = lay.chips[j];
        const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
        expect(overlap, `${a.ref} ile ${b.ref}`).toBe(false);
      }
    }
  });

  it("çip içi şeması: her kapı bir kez yerleşir, her girişin kaynağı (pin, kapı ya da sabit) var", () => {
    for (const ci of board.chips) {
      const ins = chipInside(board.c.gates, ci);
      expect(ins.gates.map((g) => g.gate).sort((a, b) => a - b)).toEqual(Array.from({ length: ci.gates[1] - ci.gates[0] }, (_, i) => ci.gates[0] + i));
      const wiredTo = new Set(ins.wires.map((w) => `${w.net}@${w.points.at(-2)},${w.points.at(-1)}`));
      for (const g of ins.gates) {
        g.inputs.forEach((n, k) => {
          if (n <= 1) return;
          expect(wiredTo.has(`${n}@${g.inPorts[k][0]},${g.inPorts[k][1]}`), `${ci.ref} kapı ${g.gate} giriş ${k}`).toBe(true);
        });
      }
    }
  });

  it("transistör şemasının iç etiketleri İngilizcede: sabit-1 hücresi tie-hi, net adları aynı", () => {
    const g = board.c.gates.find((x) => x.kind !== "BEHAV" && x.inputs.includes(1));
    expect(g).toBeDefined();
    const cm = gateCmos(g!, (n) => board.netName(n));
    const sabit = cm.nodes.find((n) => n.label === "sabit1");
    expect(sabit).toBeDefined();
    expect(nodeLabel(cm, sabit!.node)).toBe("sabit1");
    expect(nodeLabel(cm, sabit!.node, "en")).toBe("tie-hi");
    expect(etiketDili("sabit1", "en")).toBe("tie-hi");
    expect(etiketDili("A0", "en")).toBe("A0");
  });

  // her kapı türünden ve giriş sayısından bir örnek
  const samples = new Map<string, Gate>();
  for (const g of board.c.gates) if (g.kind !== "BEHAV") samples.set(`${g.kind}/${g.inputs.length}`, g);

  for (const [key, gate] of samples) {
    it(`transistör seviyesi = kapı seviyesi: ${key}`, () => {
      // aynı kapıyı tek başına bir devrede kur, rastgele girişlerle iki modeli karşılaştır
      const c = new Circuit();
      const ins = gate.inputs.map((_, i) => c.net(`i${i}`));
      const outs = gate.outputs.map((_, i) => c.net(`o${i}`));
      c.add(gate.kind as GateKind, ins, outs);
      const sim = new LogicSim(c);
      const probe = new GateProbe(c.gates[0], (n) => c.netNames[n]);
      let seed = 12345;
      const rnd = () => ((seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) >>> 16) & 1;
      const seq = gate.kind === "DFF" || gate.kind === "LATCH";
      // flip-flop: önce bilinen duruma getir (asenkron girişler pasif)
      if (seq) ins.forEach((n) => sim.set(n, L1));
      for (let step = 0; step < 400; step++) {
        ins.forEach((n, i) => {
          // DFF'te ~PRE/~CLR çoğunlukla pasif kalsın, ama ara sıra etkin olsun
          const v = gate.kind === "DFF" && i >= 2 ? (rnd() | rnd() | rnd() ? 1 : 0) : rnd();
          sim.set(n, v as Level);
        });
        // ekran kareleri gibi: güncellemeyi ara sıra atla
        if (step % 3 === 2) continue;
        probe.update(sim.value);
        const outsNow = gate.outputs.map((_, i) => sim.get(outs[i]));
        if (gate.kind === "TBUF" && sim.get(ins[1]) === L0) continue; // Z: düğüm boşta
        if (gate.kind === "DFF" && sim.get(ins[2]) === L0 && sim.get(ins[3]) === L0) continue; // ikisi birden: tanımsız
        outsNow.forEach((v, i) => {
          if (v !== L0 && v !== L1) return;
          expect(probe.level(probe.cm.outputNodes[i]), `adım ${step} çıkış ${i}`).toBe(v);
        });
      }
    });
  }
});

// ---------------------------------------------------------------- bütün bilgisayar (3D kart görünümü)

const full = buildFullMachineBoard().board;
const fullLay = boardLayout(full);
const fullEnds = netEndpoints(fullLay);

const overlaps = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
  a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;

describe("3D görünüm: bütün bilgisayar tek sahnede", () => {
  it("her kart yerleşimde; kart adları başlıklı (tabloda olmayan kart için genel ad)", () => {
    const cards = new Set([...full.chips.map((c) => c.card), ...full.passives.map((p) => p.card)]);
    expect(fullLay.cards.map((c) => c.name).sort()).toEqual([...cards].sort());
    expect(FULL_MACHINE_CARDS.length).toBeGreaterThan(0);
    for (const c of fullLay.cards) expect(c.title).toBe(cardTitle(c.name));
    expect(cardTitle("ram574")).toBe("Ram574 kartı");
    expect(cardTitle("gc")).toBe("G/Ç kartı");
  });

  it("İngilizce arayüz: her kartın ve her bloğun (bilgisayar ve hesap makinesi) İngilizce adı var", () => {
    for (const c of fullLay.cards) {
      expect(kartBasligi(c.name, c.title)).toBe(c.title);
      expect(kartBasligi(c.name, c.title, "en"), c.name).toMatch(/board$/);
    }
    expect(kartBasligi("gc", "G/Ç kartı", "en")).toBe("I/O board");
    expect(kartBasligi("hesap", "8 bit hesap makinesi", "en")).toBe("8-bit calculator");
    expect(kartBasligi("ram574", "Ram574 kartı", "en")).toBe("Ram574 board");
    const hesapLay = boardLayout(buildHesapBoard().board);
    for (const b of [...fullLay.blocks, ...hesapLay.blocks]) expect(BLOK_EN[b.name], `"${b.name}" İngilizce adı yok (src/board3d/adlar.ts)`).toBeDefined();
    expect(blokAdi("Register dosyası", "en")).toBe("Register file");
    expect(blokAdi("Register dosyası")).toBe("Register dosyası");
    expect(blokAdi("tabloda olmayan blok", "en")).toBe("tabloda olmayan blok");
  });

  it("çipler ve pasifler kartlarının içinde, gövdeler çakışmıyor, pinler doğru netlerde", () => {
    expect(fullLay.chips).toHaveLength(full.chips.length);
    expect(fullLay.passives).toHaveLength(full.passives.length);
    const inside = (p: { card: string; x: number; y: number; w: number; h: number; ref: string }) => {
      const card = fullLay.cards.find((k) => k.name === p.card)!;
      expect(p.x, p.ref).toBeGreaterThanOrEqual(card.x);
      expect(p.y, p.ref).toBeGreaterThanOrEqual(card.y);
      expect(p.x + p.w, p.ref).toBeLessThanOrEqual(card.x + card.w + 1e-9);
      expect(p.y + p.h, p.ref).toBeLessThanOrEqual(card.y + card.h + 1e-9);
    };
    for (const c of fullLay.chips) {
      inside(c);
      const ci = full.instance(c.ref);
      for (const p of c.pins) if (ci.nets[p.name] !== undefined) expect(p.net).toBe(ci.nets[p.name]);
    }
    for (const p of fullLay.passives) {
      inside(p);
      const src = full.passives.find((q) => q.ref === p.ref)!;
      expect(p.pins.length).toBe(PASSIVES[p.part].pins.length);
      for (const q of p.pins) expect(q.net, `${p.ref}.${q.num}`).toBe(src.pins[String(q.num)] ?? -1);
    }
    const bodies = [...fullLay.chips, ...fullLay.passives];
    // aynı karttakiler karşılaştırılır (kartlar zaten ayrı dikdörtgenler)
    for (const card of fullLay.cards) {
      const list = bodies.filter((b) => b.card === card.name);
      for (let i = 0; i < list.length; i++) {
        for (let j = i + 1; j < list.length; j++) expect(overlaps(list[i], list[j]), `${list[i].ref} ile ${list[j].ref}`).toBe(false);
      }
    }
    for (let i = 0; i < fullLay.cards.length; i++) {
      for (let j = i + 1; j < fullLay.cards.length; j++) expect(overlaps(fullLay.cards[i], fullLay.cards[j])).toBe(false);
    }
  });

  it("arka panel konnektörü kartın alt kenarında, dekuplaj kondansatörü çipinin yanında", () => {
    const edges = fullLay.passives.filter((p) => p.edge);
    const withEdge = new Set(full.passives.filter((p) => /arka panel/i.test(p.role) && /PinHeader_2x/.test(PASSIVES[p.part].footprint)).map((p) => p.card));
    expect(new Set(edges.map((p) => p.card))).toEqual(withEdge);
    for (const p of edges) {
      const card = fullLay.cards.find((k) => k.name === p.card)!;
      // kartın içindeki her şeyden aşağıda
      for (const c of fullLay.chips.filter((c) => c.card === p.card)) expect(c.y + c.h).toBeLessThanOrEqual(p.y);
      expect(card.y + card.h - (p.y + p.h)).toBeLessThan(6);
    }
    const caps = fullLay.passives.filter((p) => p.chip);
    expect(caps.length).toBeGreaterThan(50);
    for (const p of caps) {
      const c = fullLay.chips.find((c) => c.ref === p.chip)!;
      expect(p.x).toBeGreaterThanOrEqual(c.x + c.w);
      expect(p.x - (c.x + c.w)).toBeLessThan(8);
    }
  });

  it("çok çipli kart (yüzlerce aynı çip) kareye yakın ızgara, sıra genişliğini aşmaz", () => {
    // sentetik: bir bloğa 300 çip
    const big = buildFullMachineBoard().board;
    const ci = big.chips[0];
    const many = Array.from({ length: 300 }, (_, i) => ({ ...ci, ref: `UX${i}`, card: "ram574", block: "RAM" }));
    const lay = boardLayout({ ...big, chips: [...big.chips, ...many], passives: big.passives } as typeof big);
    const card = lay.cards.find((c) => c.name === "ram574")!;
    expect(card.w).toBeLessThanOrEqual(1000);
    expect(card.h / card.w).toBeLessThan(3);
    expect(lay.width).toBeLessThanOrEqual(1100);
  });
});

describe("3D görünüm: pinden pine teller", () => {
  it("uçlar: her bağlı pin bir kez, doğru netle; GND ve VCC dahil", () => {
    let n = 0;
    for (const [net, list] of fullEnds) {
      for (const e of list) expect(e.net).toBe(net);
      n += list.length;
    }
    const pins = [...fullLay.chips, ...fullLay.passives].reduce((s, c) => s + c.pins.filter((p) => p.net >= 0).length, 0);
    expect(n).toBe(pins);
    expect(fullEnds.get(0)!.length).toBeGreaterThan(300);
    expect(fullEnds.get(1)!.length).toBeGreaterThan(300);
  });

  it("en kısa yayılan ağaç: n − 1 kenar, hepsi bağlı, en kısa toplam", () => {
    const pts = [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 0, y: 1 }, { x: 11, y: 1 }, { x: 5, y: 40 }];
    const e = mstEdges(pts);
    expect(e).toHaveLength(pts.length - 1);
    const parent = pts.map((_, i) => i);
    const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
    for (const [a, b] of e) parent[find(a)] = find(b);
    expect(new Set(pts.map((_, i) => find(i))).size).toBe(1);
    const len = e.reduce((s, [a, b]) => s + Math.hypot(pts[a].x - pts[b].x, pts[a].y - pts[b].y), 0);
    expect(len).toBeCloseTo(1 + Math.SQRT2 + 10 + Math.hypot(5, 39), 6);
    expect(mstEdges([pts[0]])).toEqual([]);
  });

  it("net ağacı: kartlar birbirine yalnızca arka panel konnektörlerinden bağlanır", () => {
    let cross = 0;
    for (const [net, list] of fullEnds) {
      if (net <= 1 || list.length < 2) continue;
      const tree = netTree(net, list);
      expect(tree.length, `net ${net}`).toBe(list.length - 1);
      for (const e of tree) {
        if (e.a.card === e.b.card) continue;
        cross++;
        const busA = list.some((x) => x.card === e.a.card && x.bus);
        const busB = list.some((x) => x.card === e.b.card && x.bus);
        if (busA) expect(e.a.bus).toBe(true);
        if (busB) expect(e.b.bus).toBe(true);
      }
    }
    expect(cross).toBeGreaterThan(50);
  });

  it("\"hepsi\": besleme varsayılan olarak yok, istenince var; tek uçlu net tel çizmez", () => {
    const signal = allWires(fullEnds);
    expect(signal.every((e) => e.net > 1)).toBe(true);
    const nets = new Set(signal.map((e) => e.net));
    for (const [net, list] of fullEnds) if (net > 1) expect(nets.has(net)).toBe(list.length > 1);
    const withPower = allWires(fullEnds, { power: true });
    expect(withPower.length - signal.length).toBe(netWires(0, fullEnds).length + netWires(1, fullEnds).length);
  });

  it("\"seçili çip\": her pinden aynı netteki bütün öteki uçlara bir tel; Bağlantılar listesi aynı uçlar", () => {
    const chip = fullLay.chips.find((c) => c.part === "74HC283") ?? fullLay.chips[0];
    const wires = partWires(chip.ref, fullEnds);
    const links = partLinks(chip.ref, chip.pins, fullEnds);
    expect(links.map((l) => l.num)).toEqual([...chip.pins.map((p) => p.num)].sort((a, b) => a - b));
    let expected = 0;
    const seen = new Set<number>();
    for (const l of links) {
      if (l.net <= 1 || l.net < 0) continue;
      const mine = chip.pins.filter((p) => p.net === l.net);
      if (seen.has(l.net)) continue;
      seen.add(l.net);
      const others = fullEnds.get(l.net)!.filter((e) => e.ref !== chip.ref).length;
      expected += mine.length * others + mine.length - 1;
    }
    expect(wires).toHaveLength(expected);
    for (const w of wires) expect(w.a.ref).toBe(chip.ref);
    for (const l of links) for (const o of l.others) expect(o.net).toBe(l.net);
    expect(partWires(chip.ref, fullEnds, { power: true }).length).toBeGreaterThan(wires.length);
  });

  it("kavis: uçlar pinlerde, tepe ortada, parça sayısı uzunlukla büyür", () => {
    const p = arcPoints(0, 0, 10, 0, 0.2);
    const n = p.length / 3 - 1;
    expect(n).toBe(arcSegments(10));
    expect(p.slice(0, 3)).toEqual([0, 0.2, 0]);
    expect(p.slice(-3)).toEqual([10, 0.2, 0]);
    const ys = Array.from({ length: n + 1 }, (_, k) => p[3 * k + 1]);
    expect(Math.max(...ys)).toBeCloseTo(0.2 + arcHeight(10), 1);
    expect(arcSegments(0.1)).toBeLessThan(arcSegments(5));
    expect(arcHeight(1000)).toBeLessThanOrEqual(6);
  });

  it("tel geometrisi: parça başına 6 sayı, uçlar pin konumunda, netler parçaya göre", () => {
    const S = 0.1;
    const w = (x: number, y: number): [number, number] => [x * S, y * S];
    const edges = allWires(fullEnds).slice(0, 200);
    const top = (e: Endpoint) => (e.kind === "chip" ? 0.24 : 0.16);
    const g = wireGeometry(edges, w, top);
    expect(g.positions.length).toBe(g.segments * 6);
    expect(g.nets.length).toBe(g.segments);
    let s = 0;
    for (const e of edges) {
      const d = Math.hypot(e.b.x - e.a.x, e.b.y - e.a.y) * S;
      const n = arcSegments(d);
      expect(g.positions[s * 6]).toBeCloseTo(e.a.x * S, 5);
      expect(g.positions[s * 6 + 1]).toBeCloseTo(top(e.a), 5);
      expect(g.positions[s * 6 + 2]).toBeCloseTo(e.a.y * S, 5);
      const last = (s + n - 1) * 6;
      expect(g.positions[last + 3]).toBeCloseTo(e.b.x * S, 5);
      expect(g.positions[last + 4]).toBeCloseTo(top(e.b), 5);
      expect(g.positions[last + 5]).toBeCloseTo(e.b.y * S, 5);
      for (let k = 0; k < n; k++) expect(g.nets[s + k]).toBe(e.net);
      // parçalar zincir: birinin sonu öbürünün başı
      for (let k = 1; k < n; k++) for (let j = 0; j < 3; j++) expect(g.positions[(s + k) * 6 + j]).toBe(g.positions[(s + k - 1) * 6 + 3 + j]);
      s += n;
    }
    expect(s).toBe(g.segments);
  });

  it("kartlar arası teller arka panel şeridi boyunca, sıralar arasında soldaki kablodan", () => {
    const route = busRouter(fullLay);
    const busEdges = allWires(fullEnds).filter((e) => e.a.bus && e.b.bus);
    expect(busEdges.length).toBeGreaterThan(20);
    const rowOf = (y: number, lay: BoardLayout) => lay.rows.findIndex((r) => y >= r.y - 2 && y <= r.backplaneY + r.backplaneH + 2);
    let crossRow = 0;
    for (const e of busEdges) {
      const path = route(e.a, e.b)!;
      expect(path).not.toBeNull();
      const ra = rowOf(e.a.y, fullLay);
      const rb = rowOf(e.b.y, fullLay);
      const inStrip = (p: { y: number }, r: number) => {
        const row = fullLay.rows[r];
        return p.y >= row.backplaneY && p.y <= row.backplaneY + row.backplaneH;
      };
      expect(inStrip(path[0], ra)).toBe(true);
      expect(inStrip(path[path.length - 1], rb)).toBe(true);
      expect(path[0].x).toBe(e.a.x);
      expect(path[path.length - 1].x).toBe(e.b.x);
      if (ra !== rb) {
        crossRow++;
        expect(path).toHaveLength(4);
        expect(path[1].x).toBe(path[2].x);
        expect(path[1].x).toBeLessThan(Math.min(fullLay.rows[ra].x, fullLay.rows[rb].x));
      } else expect(path).toHaveLength(2);
    }
    expect(fullLay.rows.length < 2 || crossRow > 0).toBe(true);
    // yolu olan tel düz parçalar: 2 uç + ara noktalar
    const e = busEdges[0];
    const g = wireGeometry([e], (x, y) => [x, y], () => 0.3, route);
    expect(g.segments).toBe(route(e.a, e.b)!.length + 1);
    expect(g.positions[4]).toBeCloseTo(ROUTE_Y, 6);
    // konnektör olmayan uçlar için yol yok
    const plain = allWires(fullEnds).find((x) => !x.a.bus)!;
    expect(route(plain.a, plain.b)).toBeNull();
  });
});

describe("3D görünüm: VGA ekranı", () => {
  const cols = 80;
  const rows = 30;
  const chars = new Uint8Array(cols * rows);
  const attrs = new Uint8Array(cols * rows).fill(0x1e);
  const put = (x: number, y: number, s: string) => [...s].forEach((ch, i) => (chars[y * cols + x + i] = ch.charCodeAt(0)));
  put(0, 0, "Merhaba");
  put(10, 2, "CPU16");

  it("VRAM → ekran metni: satır sonu boşlukları ve sondaki boş satırlar atılır", () => {
    expect(screenText(chars, cols, rows)).toBe("Merhaba\n\n          CPU16");
  });

  it("VRAM + karakter ROM'u → pikseller (yazı/zemin rengi, imleç son iki tarama satırı)", () => {
    const px = renderTextScreen({ cols, rows, chars, attrs, font: FONT_8X16, cursor: 5 });
    expect(px.length).toBe(640 * 480);
    const glyph = (code: number, r: number) => FONT_8X16[code * 16 + r];
    // "M" hücresi (0, 0): her tarama satırının bitleri yazı (14) ya da zemin (1)
    for (let r = 0; r < 16; r++) {
      for (let b = 0; b < 8; b++) expect(px[r * 640 + b]).toBe((glyph(77, r) >> (7 - b)) & 1 ? 0xe : 0x1);
    }
    // imleç hücresi (5, 0): 14. ve 15. tarama satırları yazı renginde dolu
    for (const r of [14, 15]) for (let b = 0; b < 8; b++) expect(px[r * 640 + 40 + b]).toBe(0xe);
    const f = textFrame({ cols, rows, chars, attrs, font: FONT_8X16, cursor: 2 * cols + 3 });
    expect(f.imlec).toEqual([3, 2]);
    expect(ekranBilgisi(f)).toBe("80 × 30 metin · imleç (3, 2)");
    expect(ekranBilgisi(f, "en")).toBe("80 × 30 text · cursor (3, 2)");
    expect(ekranBilgisi(textFrame({ cols, rows, chars, attrs, font: FONT_8X16, cursor: -1 }), "en")).toBe("80 × 30 text");
    const rgba = new Uint8ClampedArray(f.pixels.length * 4);
    paintFrame(f.pixels, rgba);
    expect([rgba[0], rgba[1], rgba[2], rgba[3]]).toEqual([(PALETTE[1] >> 16) & 255, (PALETTE[1] >> 8) & 255, PALETTE[1] & 255, 255]);
  });

  it("ekran kaynağı kapı seviyesi kartın VRAM ve karakter ROM'u çiplerinden okur", () => {
    const g = new GateMachine({ cards: FULL_MACHINE_CARDS });
    const src = findScreenSource(g)!;
    expect(src).not.toBeNull();
    const card = g.extras.find((x) => !!x && typeof x === "object" && "vramChar" in x) as { vramChar: { handle: { data: Uint8Array } }; vramAttr: { handle: { data: Uint8Array } }; fontRom: { handle: { data: Uint8Array } } };
    // karakter ROM'u programlandı
    expect(card.fontRom.handle.data.subarray(0, FONT_8X16.length)).toEqual(FONT_8X16);
    const before = src.stamp();
    card.vramChar.handle.data.set([...("CPU16")].map((c) => c.charCodeAt(0)), 81);
    card.vramAttr.handle.data.fill(0x1f, 0, 2400);
    expect(src.stamp()).not.toBe(before);
    const f = src.frame();
    expect([f.width, f.height]).toEqual([640, 480]);
    expect(f.text.split("\n")[1]).toBe(" CPU16");
  });

  it("ışın kipi: VGA konnektörü ve direnç DAC'ı karttan bulunur", () => {
    expect(resistance("R_680")).toBe(680);
    expect(resistance("R_1K3")).toBe(1300);
    expect(resistance("R_10K")).toBe(10000);
    expect(resistance("C_100N")).toBeNull();
    const vga = findVgaOutput(full, (part) => PASSIVES[part]?.pins.map((p) => p.name) ?? null)!;
    expect(vga).not.toBeNull();
    expect(vga.hsync).toBeGreaterThan(1);
    expect(vga.vsync).toBeGreaterThan(1);
    for (const ch of vga.channels) expect(ch.length).toBeGreaterThanOrEqual(2);
    // en parlak: bütün girişler 1 → 0,7 V civarı (VGA tam seviye)
    const max = Math.max(...vga.channels.map((ch) => dacVolts(ch, () => 1)));
    expect(max).toBeGreaterThan(0.5);
    expect(max).toBeLessThan(1.0);
    expect(dacVolts(vga.channels[0], () => 0)).toBe(0);
  });
});

describe("3D görünüm: kartın dışından seri hatlar", () => {
  /** Açık kollektör hat: sürülmezse çekme direnciyle 1 */
  function lines(): LineIo & { v: Map<number, number>; log: [number, number, number][]; now: number } {
    const v = new Map<number, number>();
    const io = {
      v, log: [] as [number, number, number][], now: 0,
      drive(n: number, x: 0 | 1) { v.set(n, x); io.log.push([io.now, n, x]); },
      release(n: number) { v.set(n, 1); io.log.push([io.now, n, 1]); },
      get: (n: number) => v.get(n) ?? 1,
    };
    return io;
  }

  it("PS/2: 11 bitlik çerçeve, veri saatin düşen kenarında geçerli, tek eşlik", () => {
    const io = lines();
    const ps2 = new Ps2Sender(io, 1, 2, 320);
    ps2.queue.push(0x1c);
    const bits: number[] = [];
    let lastClk = 1;
    for (let t = 0; t < 320 * 14; t++) {
      io.now = t;
      ps2.tick(t);
      const clk = io.get(1);
      if (lastClk === 1 && clk === 0) bits.push(io.get(2));
      lastClk = clk;
    }
    expect(bits).toHaveLength(11);
    expect(bits[0]).toBe(0);
    expect(bits.slice(1, 9).reduce((v, b, i) => v | (b << i), 0)).toBe(0x1c);
    expect(bits.slice(1, 10).reduce((s, b) => s + b, 0) % 2).toBe(1);
    expect(bits[10]).toBe(1);
    expect(ps2.busy).toBe(false);
  });

  it("PS/2: kart saat hattını tutarken klavye beklemede", () => {
    const io = lines();
    io.v.set(1, 0);
    const ps2 = new Ps2Sender(io, 1, 2, 320);
    ps2.queue.push(0x29);
    for (let t = 0; t < 2000; t++) ps2.tick(t);
    expect(ps2.queue).toEqual([0x29]);
  });

  it("UART: 8N1, bit süresi kadar aralıkla; RTS 1 iken bekler", () => {
    const io = lines();
    io.v.set(5, 1);
    const tx = new UartSender(io, 4, 5, 34.7);
    tx.queue.push(0x41);
    for (let t = 0; t < 500; t++) { io.now = t; tx.tick(t); }
    expect(tx.queue).toEqual([0x41]);
    io.v.set(5, 0);
    const start = io.log.length;
    for (let t = 500; t < 1000; t++) { io.now = t; tx.tick(t); }
    const ev = io.log.slice(start).filter(([, n]) => n === 4);
    expect(ev).toHaveLength(10);
    const bits = ev.map(([, , x]) => x);
    expect(bits[0]).toBe(0);
    expect(bits.slice(1, 9).reduce((v, b, i) => v | (b << i), 0)).toBe(0x41);
    expect(bits[9]).toBe(1);
    expect(ev[9][0] - ev[0][0]).toBeGreaterThanOrEqual(Math.floor(9 * 34.7) - 1);
  });
});

describe("3D görünüm: program düzenleyicisi", () => {
  const lib = loadLib();
  const kitDir = new URL("../kit/programlar/", import.meta.url);
  const kit = readdirSync(kitDir).filter((f) => f.endsWith(".s"));
  const cExample = readFileSync(new URL("../../src/board3d/ornekler/merhaba-vga.c", import.meta.url), "utf8");

  it("dil tanıma: kit programları assembly, C örnekleri C", () => {
    expect(kit.length).toBeGreaterThan(2);
    for (const f of kit) expect(detectLanguage(readFileSync(new URL(f, kitDir), "utf8")), f).toBe("asm");
    for (const f of ["hello", "fib"]) expect(detectLanguage(readFileSync(new URL(`../programs/${f}.s`, import.meta.url), "utf8"))).toBe("asm");
    expect(detectLanguage(cExample)).toBe("c");
    expect(detectLanguage("int main(void) {\n  return 0;\n}\n")).toBe("c");
    expect(detectLanguage("  LI r1, 5\n  HALT\n")).toBe("asm");
    expect(detectLanguage("// yorum\nvoid f() { }\n")).toBe("c");
  });

  it("tarayıcıdaki Flash imajı machine-cli'nin romImage()'i ile bayt bayt aynı", () => {
    for (const f of kit) {
      const file = new URL(f, kitDir);
      const r = compileProgram(readFileSync(file, "utf8"), "asm", lib);
      expect(r.errors, f).toEqual([]);
      expect(r.flash!.length).toBe(FLASH_SIZE);
      expect(Buffer.from(r.flash!).equals(Buffer.from(romImage(fileURLToPath(file)))), f).toBe(true);
    }
  });

  it("bank 0'a sığmayan program hata verir; boş yerler 0xFF", () => {
    const img = new Uint8Array(0x10000);
    img[0x10] = 0x12;
    const ok = flashImage(img, [[0x10, 0x11]]);
    expect(ok[0x10]).toBe(0x12);
    expect(ok[0]).toBe(0xff);
    expect(() => flashImage(img, [[0x3ff0, BANK0_END + 1]])).toThrow(/bank 0/);
  });

  it("C örneği cc16 rom hedefiyle derlenir ve emülatörde UART'a ve VGA'ya yazar", () => {
    const r = compileProgram(cExample, "c", lib);
    expect(r.errors).toEqual([]);
    expect(r.info).toMatch(/^C · /);
    const m = new Machine();
    m.loadFlash(r.flash!);
    m.reset();
    for (let i = 0; i < 400 && !m.cpu.halted; i++) m.run(1000);
    expect(m.cpu.halted).toBe(true);
    expect(m.uartOutput).toContain("Merhaba, C! 6 * 7 = 42");
    expect(m.uartOutput).toContain("fib(7) = 13");
    expect(m.renderText()).toContain("Bitti: main dondu");
  });

  it("hatalar satır numarasıyla: assembly ve C", () => {
    const a = compileProgram("  LI r1, 5\n  BOYLE_BIR_KOMUT_YOK r2\n", "asm", lib);
    expect(a.flash).toBeNull();
    expect(a.errors[0].line).toBe(2);
    const c = compileProgram("int main(void) {\n  int x = 1;\n  return y;\n}\n", "c", lib);
    expect(c.flash).toBeNull();
    expect(c.errors.some((e) => e.line === 3 && !e.file)).toBe(true);
  });

  it("İngilizce arayüzde özet, sütun bilgisi ve bank 0 hatası İngilizce (sayılar 1,234 biçiminde)", () => {
    const c = compileProgram(cExample, "c", lib, "en");
    expect(c.info).toMatch(/^C · [\d,]+ bytes of code \(ROM\), [\d,]+ bytes of data \(RAM\)$/);
    expect(compileProgram(cExample, "c", lib).info).toMatch(/^C · [\d.]+ bayt kod \(ROM\), [\d.]+ bayt veri \(RAM\)$/);
    const a = compileProgram(readFileSync(new URL("../programs/hello.s", import.meta.url), "utf8"), "asm", lib, "en");
    expect(a.info).toMatch(/^assembly · [\d,]+ bytes$/);
    const e = compileProgram("int main(void) {\n  return y;\n}\n", "c", lib, "en");
    expect(e.errors.some((x) => /^column \d+: /.test(x.message))).toBe(true);
    expect(() => flashImage(new Uint8Array(0x10000), [[0x3ff0, BANK0_END + 1]], FLASH_SIZE, "en")).toThrow(/does not fit in bank 0/);
  });

  it("assembly ile assemble() aynı imaj (ör. merhaba programı)", () => {
    const src = readFileSync(new URL("../programs/hello.s", import.meta.url), "utf8");
    const a = assemble(src);
    const r = compileProgram(src, "asm", lib);
    for (const [s, e] of a.ranges) expect(Buffer.from(r.flash!.subarray(s, e)).equals(Buffer.from(a.image.subarray(s, e)))).toBe(true);
  });
});

describe("3D görünüm: bellek çipinin içi", () => {
  it("62256: 512 satır × 64 bayt, 6T SRAM hücresi", () => {
    const g = memGeometry(SRAM62256)!;
    expect(g.addrBits).toBe(15);
    expect(g.dataPins).toEqual(["IO0", "IO1", "IO2", "IO3", "IO4", "IO5", "IO6", "IO7"]);
    expect(g.ctrlPins.sort()).toEqual(["~CE", "~OE", "~WE"]);
    expect([g.rows, g.bytesPerRow, g.size]).toEqual([512, 64, 32768]);
    expect(g.cell).toBe("sram");
  });

  it("28C256 (EEPROM, aynı bacak düzeni) ve SST39SF010A: yüzer kapılı hücre", () => {
    const eeprom: Pick<ChipDef, "part" | "title" | "pins" | "behavioral"> = {
      part: "28C256",
      title: "32 KB EEPROM (32K × 8)",
      pins: pinsOf("A14 A12 A7 A6 A5 A4 A3 A2 A1 A0 IO0 IO1 IO2 GND IO3 IO4 IO5 IO6 IO7 ~CE A10 ~OE A11 A9 A8 A13 ~WE VCC", { bidir: "IO0 IO1 IO2 IO3 IO4 IO5 IO6 IO7" }),
      behavioral: true,
    };
    const e = memGeometry(eeprom)!;
    expect([e.rows, e.bytesPerRow, e.cell]).toEqual([512, 64, "flash"]);
    const f = memGeometry(SST39SF010)!;
    expect([f.addrBits, f.rows, f.bytesPerRow, f.cell]).toEqual([17, 2048, 64, "flash"]);
    expect(f.ctrlPins).not.toContain("NC1");
  });

  it("bellek olmayan çip için null; pencereler dizinin içinde", () => {
    const logic = full.chips.find((c) => !c.def.behavioral)!;
    expect(memGeometry(logic.def)).toBeNull();
    const g = memGeometry(SRAM62256)!;
    for (const addr of [0, 0x40, 0x3fff, 0x7fff]) {
      const r = rowWindow(addr, g);
      expect(r.first).toBeGreaterThanOrEqual(0);
      expect(r.first + r.count).toBeLessThanOrEqual(g.rows);
      expect(r.row).toBeGreaterThanOrEqual(r.first);
      expect(r.row).toBeLessThan(r.first + r.count);
      const c = colWindow(addr, g);
      expect(c.col).toBeGreaterThanOrEqual(c.first);
      expect(c.col).toBeLessThan(c.first + c.count);
      expect(c.first + c.count).toBeLessThanOrEqual(g.bytesPerRow);
    }
  });
});

describe("arayüz: üst çubuğun sıkışması", () => {
  it("sığan ilk kademe seçilir; hiçbiri sığmazsa en sonuncusu; işaretler birikir", async () => {
    const { sigenKademe, kademeIsareti, SIKISMA_EN_COK } = await import("../../src/ui/sikisma.ts");
    // her kademe 60 px açar, 130 px eksik: üçüncü denemede (k = 3) sığar
    const denenen: number[] = [];
    expect(sigenKademe((k) => (denenen.push(k), 130 - 60 * k))).toBe(3);
    expect(denenen).toEqual([0, 1, 2, 3]);
    expect(sigenKademe(() => 0)).toBe(0);
    expect(sigenKademe(() => 999)).toBe(SIKISMA_EN_COK);
    expect(kademeIsareti(0)).toBe("");
    expect(kademeIsareti(3)).toBe("1 2 3");
  });
});

describe("3D görünüm: kamera uçuşu", () => {
  it("uçuş süreyle ilerler ve sonda durur; işletim sisteminde hareket azaltılmışsa hemen sona geçer", async () => {
    const { ucusAdimi } = await import("../../src/ui/ayarlar.ts");
    expect(ucusAdimi(0, 0.1, 1.4)).toBeCloseTo(0.14);
    expect(ucusAdimi(0.95, 0.1, 1.4)).toBe(1);
    vi.resetModules();
    vi.stubGlobal("window", { matchMedia: (q: string) => ({ matches: q.includes("reduced-motion"), addEventListener() {}, removeEventListener() {} }) });
    try {
      const az = await import("../../src/ui/ayarlar.ts");
      expect(az.azHareket()).toBe(true);
      expect(az.ucusAdimi(0, 0.016, 1.4)).toBe(1);
    } finally {
      vi.unstubAllGlobals();
      vi.resetModules();
    }
  });
});
