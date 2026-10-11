import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { assembleOrThrow } from "../asm/assembler.ts";
import { erc } from "../board/board.ts";
import { CLOCK_INPUTS } from "../board/clock-card.ts";
import { writeKicadFiles, type KicadFile } from "../board/kicad-files.ts";
import { kicadNetName } from "../board/kicad-sch.ts";
import { parseSExpr, type SExpr } from "../chips/kicad.ts";
import { GateComputer, buildComputerBoard, type GateState } from "../board/computer.ts";
import { Cpu16, SimpleBus } from "../emu/cpu.ts";
import { assembleMicrocode } from "../micro/microasm.ts";
import { Datapath } from "../micro/datapath.ts";

const micro = assembleMicrocode(readFileSync(new URL("../micro/cpu16.ucode", import.meta.url), "utf8"));
const program = (name: string) => assembleOrThrow(readFileSync(new URL(`../programs/${name}.s`, import.meta.url), "utf8")).image;

const dpState = (d: Datapath): GateState => ({
  pc: d.pc, regs: Array.from(d.regs), n: d.n, z: d.z, c: d.c, v: d.v, i: d.i,
  step: d.step, ir: d.ir, ta: d.ta, tb: d.tb, mar: d.mar, halted: d.halted, fault: d.illegal,
});
const fmt = (s: GateState) => JSON.stringify(s);

/** Saat döngüsü modeliyle her döngüde aynı mı? (mimari + iç register'lar) */
function cycleLockstep(g: GateComputer, dp: Datapath, maxCycles: number, onCycle?: () => void) {
  for (let cyc = 0; cyc < maxCycles; cyc++) {
    onCycle?.();
    if (dp.halted && !(dp.irq && dp.i)) break;
    dp.clock();
    g.cycle();
    const want = fmt(dpState(dp));
    const got = fmt(g.state);
    if (want !== got) throw new Error(`döngü ${cyc}:\n  model: ${want}\n  kapı : ${got}`);
  }
}

describe("Faz 4: kapı seviyesi bilgisayar (şema = kod)", () => {
  it("elektriksel kural denetimi: çakışan çıkış ve boşta giriş yok", () => {
    const { board } = buildComputerBoard();
    expect(erc(board, ["IRQ", ...CLOCK_INPUTS])).toEqual([]);
  });

  for (const name of ["hello", "fib", "add32", "bubble"]) {
    it(`${name}.s: her saat döngüsünde mikrokod modeliyle, sonunda emülatörle aynı`, () => {
      const image = program(name);
      const g = new GateComputer(micro.rom);
      g.load(image);
      const db = new SimpleBus();
      db.load(image);
      const dp = new Datapath(micro.rom, db);
      cycleLockstep(g, dp, 50_000);
      expect(dp.halted).toBe(true);

      const eb = new SimpleBus();
      eb.load(image);
      const emu = new Cpu16(eb);
      while (emu.step() === "ok");
      const s = g.state;
      expect(s.halted).toBe(true);
      expect(s.pc).toBe(emu.pc);
      expect(s.regs).toEqual(Array.from(emu.regs));
      expect(g.output).toBe(eb.output);
      for (let a = 0; a < 0x10000; a++) if (g.read8(a) !== eb.mem[a]) throw new Error(`bellek farkı @${a.toString(16)}`);
      expect(g.cycles).toBe(dp.cycles);
    });
  }

  it("irq.s: HALT'tan kesmeyle uyanma, işleyici, RETI", () => {
    const image = program("irq");
    const g = new GateComputer(micro.rom);
    g.load(image);
    const db = new SimpleBus();
    db.load(image);
    const dp = new Datapath(micro.rom, db);
    let raised = 0;
    const ack = () => db.mem[0x4002] | (db.mem[0x4003] << 8);
    cycleLockstep(g, dp, 20_000, () => {
      if (dp.halted && !dp.irq && raised < 3) {
        dp.irq = g.irq = true;
        raised++;
      }
      if (ack() === 1) {
        dp.irq = g.irq = false;
        for (const a of [0x4002, 0x4003]) {
          db.write8(a, 0);
          g.write8(a, 0);
        }
      }
    });
    expect(raised).toBe(3);
    expect(g.read8(0x4000)).toBe(3);
  });

  it("saat kartı: ADIM kipinde saat durur, her basış tam bir CPU döngüsü ilerletir", () => {
    const image = program("fib");
    const g = new GateComputer(micro.rom);
    g.load(image);
    const db = new SimpleBus();
    db.load(image);
    const dp = new Datapath(micro.rom, db);
    const clk = g.board.n("CLK");
    let rises = 0;
    const run = (n: number) => {
      for (let k = 0; k < n; k++) {
        const before = g.sim.get(clk);
        g.osc(1);
        if (before === 0 && g.sim.get(clk) === 1) rises++;
      }
    };
    g.setAuto(false);
    run(40);
    expect(rises).toBe(0);
    for (let i = 0; i < 40; i++) {
      g.stepButton(true);
      run(3 + (i % 5)); // basış süresi değişse de tek döngü
      g.stepButton(false);
      run(20);
      dp.clock();
      expect(fmt(g.state), `basış ${i}`).toBe(fmt(dpState(dp)));
    }
    expect(rises).toBe(40);
    // OTOMATİK'e dönünce program kaldığı yerden sürer
    g.setAuto(true);
    cycleLockstep(g, dp, 50_000);
    expect(dp.halted).toBe(true);
  });

  it("rastgele komut akışları: rastgele bellek, register ve bayraklar (yasadışı komutlar dahil)", () => {
    let seed = 777;
    const rnd = () => ((seed = (seed * 1103515245 + 12345) >>> 0) >>> 8) & 0xffff;
    const g = new GateComputer(micro.rom);
    let total = 0;
    for (let run = 0; run < 150; run++) {
      const image = new Uint8Array(0x10000);
      // çoğunlukla geçerli komutlar; yasadışı ve HALT nadiren (akış uzun sürsün)
      const stops = (w: number) => {
        const op = w >> 12, f3 = w & 7;
        return op === 2 || op === 15 || (op === 13 && f3 >= 2) || (op === 14 && (f3 === 1 || f3 === 7));
      };
      for (let a = 0; a < 0x10000; a += 2) {
        let w = rnd();
        while (stops(w) && rnd() % 64 !== 0) w = rnd();
        image[a] = w & 0xff;
        image[a + 1] = w >> 8;
      }
      g.reset();
      g.load(image);
      const db = new SimpleBus();
      db.load(image);
      const dp = new Datapath(micro.rom, db);
      const regs = Array.from({ length: 8 }, () => rnd());
      const f = rnd();
      regs.forEach((v, r) => (dp.regs[r] = v));
      dp.n = (f & 8) !== 0; dp.z = (f & 4) !== 0; dp.c = (f & 2) !== 0; dp.v = (f & 1) !== 0;
      g.setState({ regs, pc: 0, n: dp.n, z: dp.z, c: dp.c, v: dp.v, i: false });
      cycleLockstep(g, dp, 600);
      total += dp.instructions;
    }
    expect(total).toBeGreaterThan(10_000); // yeterince komut gerçekten çalıştı
  });
});

describe("Faz 4: KiCad şemaları ve BOM", () => {
  const { board } = buildComputerBoard();
  const files = writeKicadFiles(board);

  it("depodaki KiCad dosyaları güncel (npm run cpu16 -- board kicad)", () => {
    for (const f of files) {
      const committed = readFileSync(new URL(`../../${f.path}`, import.meta.url), "utf8");
      expect(committed === f.content, f.path).toBe(true);
    }
  });

  it("her şemada her çipin her pini bir etikete ya da 'bağlı değil' işaretine değiyor; etiketler netlerle aynı", () => {
    for (const f of files.filter((x) => x.path.endsWith(".kicad_sch"))) {
      const tree = parseSExpr(f.content) as SExpr[];
      const key = (x: string, y: string) => `${Number(x).toFixed(2)},${Number(y).toFixed(2)}`;
      const labels = new Map<string, string>();
      const nc = new Set<string>();
      for (const el of tree) {
        if (!Array.isArray(el)) continue;
        const at = el.find((x) => Array.isArray(x) && x[0] === "at") as string[] | undefined;
        if (el[0] === "label") labels.set(key(at![1], at![2]), el[1] as string);
        if (el[0] === "no_connect") nc.add(key(at![1], at![2]));
      }
      const card = f.card!;
      const board = f.board!;
      const syms = tree.filter((x) => Array.isArray(x) && x[0] === "symbol") as SExpr[][];
      expect(syms.length).toBe(board.chips.filter((c) => c.card === card).length + board.passives.filter((p) => p.card === card).length);
      // entegrelerin pinleri: etiket metni = netin adı
      let checked = 0;
      const lib = tree.find((x) => Array.isArray(x) && x[0] === "lib_symbols") as SExpr[];
      for (const sym of syms) {
        const ref = ((sym.find((x) => Array.isArray(x) && x[0] === "property" && x[1] === "Reference") as SExpr[])[2]) as string;
        const at = sym.find((x) => Array.isArray(x) && x[0] === "at") as string[];
        const libId = (sym.find((x) => Array.isArray(x) && x[0] === "lib_id") as string[])[1];
        const def = lib.find((x) => Array.isArray(x) && x[0] === "symbol" && x[1] === libId) as SExpr[];
        const unit = def.find((x) => Array.isArray(x) && x[0] === "symbol" && (x[1] as string).endsWith("_1_1")) as SExpr[];
        const ci = board.chips.find((c) => c.ref === ref);
        for (const pin of unit.filter((x) => Array.isArray(x) && x[0] === "pin") as SExpr[][]) {
          const pat = pin.find((x) => Array.isArray(x) && x[0] === "at") as string[];
          const num = (pin.find((x) => Array.isArray(x) && x[0] === "number") as string[])[1];
          const k = key(String(Number(at[1]) + Number(pat[1])), String(Number(at[2]) - Number(pat[2])));
          expect(labels.has(k) || nc.has(k), `${ref}.${num}`).toBe(true);
          if (ci && labels.has(k)) {
            const p = ci.def.pins.find((x) => String(x.num) === num)!;
            expect(labels.get(k), `${ref}.${p.name}`).toBe(kicadNetName(board.netName(ci.nets[p.name])));
            checked++;
          }
        }
      }
      expect(checked).toBeGreaterThan(20);
    }
  });
});

// KiCad kuruluysa (CI'da değil): şemayı gerçek KiCad'e açtırıp netlist'ini al, bizim netlerle karşılaştır
const hasKicad = (() => {
  try {
    execFileSync("kicad-cli", ["version"], { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
})();

describe.skipIf(!hasKicad)("Faz 4: KiCad'in kendisiyle doğrulama (kicad-cli)", () => {
  const files = writeKicadFiles(buildComputerBoard().board);
  for (const { card, board } of files.filter((f) => f.board) as Required<KicadFile>[]) {
    it(`${card}: KiCad netlist'i = kartın netleri`, () => {
      const dir = mkdtempSync(join(tmpdir(), "cpu16-kicad-"));
      const sch = files.find((f) => f.path.endsWith(`${card}.kicad_sch`))!;
      writeFileSync(join(dir, `${card}.kicad_sch`), sch.content);
      writeFileSync(join(dir, "sym-lib-table"), files.find((f) => f.path.endsWith(`${card}/sym-lib-table`))!.content);
      const out = join(dir, `${card}.net`);
      execFileSync("kicad-cli", ["sch", "export", "netlist", "-o", out, join(dir, `${card}.kicad_sch`)], { stdio: "ignore" });
      const tree = parseSExpr(readFileSync(out, "utf8")) as SExpr[];
      const nets = (tree.find((x) => Array.isArray(x) && x[0] === "nets") as SExpr[]).slice(1) as SExpr[][];
      // KiCad: her net bir (ref.pin) kümesi; tek uçlu netleri at
      const kicad = new Set<string>();
      for (const net of nets) {
        const nodes = net.filter((x) => Array.isArray(x) && x[0] === "node") as SExpr[][];
        const pins = nodes.map((nd) => {
          const ref = (nd.find((x) => Array.isArray(x) && x[0] === "ref") as string[])[1];
          const pin = (nd.find((x) => Array.isArray(x) && x[0] === "pin") as string[])[1];
          return `${ref}.${pin}`;
        });
        if (pins.length > 1) kicad.add(pins.sort().join(" "));
      }
      // bizim kart
      const ours = new Map<number, string[]>();
      for (const ci of board.chips.filter((c) => c.card === card)) {
        for (const p of ci.def.pins) {
          const net = ci.nets[p.name];
          if (net === undefined) continue;
          ours.set(net, [...(ours.get(net) ?? []), `${ci.ref}.${p.num}`]);
        }
      }
      for (const p of board.passives.filter((x) => x.card === card)) {
        for (const [num, net] of Object.entries(p.pins)) ours.set(net, [...(ours.get(net) ?? []), `${p.ref}.${num}`]);
      }
      const mine = new Set([...ours.values()].filter((v) => v.length > 1).map((v) => v.sort().join(" ")));
      const missing = [...mine].filter((x) => !kicad.has(x));
      const extra = [...kicad].filter((x) => !mine.has(x));
      expect(missing.slice(0, 3)).toEqual([]);
      expect(extra.slice(0, 3)).toEqual([]);
    });
  }
});
