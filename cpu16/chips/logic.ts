// Kapı seviyesi lojik simülatörü: 74HC parçalarının ve sonra bütün bilgisayarın (Faz 4) motoru.
//
// Dört değerli lojik: 0, 1, Z (sürülmeyen / üç durumlu çıkış kapalı), X (bilinmiyor / çakışma).
// Bir net birden fazla sürücüye sahip olabilir (veriyolu); hepsi Z ise net Z, farklı değer
// süren iki sürücü varsa X olur. Kapılar Z girişi X gibi görür (boşta CMOS girişi tanımsızdır).
//
// Zamanlama "dalga" (delta) modelidir: bir dalgada değişen girişleri olan bütün kapılar önce
// eski değerlerle hesaplanır, sonra çıkışlar birlikte yazılır. Böylece aynı saat netine bağlı
// bütün flip-floplar aynı dalgada, saat kenarından önceki veriyi yakalar (sıfır saat kayması).

export const L0 = 0;
export const L1 = 1;
export const LZ = 2;
export const LX = 3;
export type Level = 0 | 1 | 2 | 3;

export const levelChar = (v: number) => "01ZX"[v] ?? "?";

/**
 * Kapı türleri. Birleşimsel kapılar istenen sayıda giriş alır.
 * DFF  : giriş [d, clk, ~pre, ~clr], çıkış [q, qn]  (yükselen kenar, asenkron preset/clear aktif düşük)
 * LATCH: giriş [d, en], çıkış [q, qn]               (en = 1 iken geçirgen)
 * TBUF : giriş [a, en], çıkış [y]                   (en = 0 iken Z)
 * BEHAV: davranışsal blok (bellek çipleri); fonksiyonu `behavior` alanında
 */
export type GateKind =
  | "NOT" | "BUF" | "AND" | "OR" | "NAND" | "NOR" | "XOR" | "XNOR"
  | "TBUF" | "DFF" | "LATCH" | "BEHAV";

/** Davranışsal blok: her değerlendirmede girişlerin şimdiki ve önceki değerleriyle çağrılır. */
export interface Behavior {
  eval(inputs: readonly Level[], prev: readonly Level[]): Level[];
}

export interface Gate {
  kind: GateKind;
  inputs: number[];
  outputs: number[];
  /** Hangi çipe / bloğa ait olduğu (görselleştirme ve hata mesajları için) */
  owner: string;
  behavior?: () => Behavior;
}

/** Net listesi oluşturucu. Net 0 = GND (sabit 0), net 1 = VCC (sabit 1). */
export class Circuit {
  readonly netNames: string[] = ["GND", "VCC"];
  readonly gates: Gate[] = [];
  readonly GND = 0;
  readonly VCC = 1;
  /** Yeni kapıların sahibi (çip örneği adı) */
  owner = "";

  net(name?: string): number {
    this.netNames.push(name ?? `n${this.netNames.length}`);
    return this.netNames.length - 1;
  }

  get netCount(): number {
    return this.netNames.length;
  }

  add(kind: GateKind, inputs: number[], outputs: number[], behavior?: () => Behavior): Gate {
    const g: Gate = { kind, inputs, outputs, owner: this.owner, behavior };
    this.gates.push(g);
    return g;
  }

  private op(kind: GateKind, inputs: number[], out?: number): number {
    const y = out ?? this.net();
    this.add(kind, inputs, [y]);
    return y;
  }

  not(a: number, out?: number) { return this.op("NOT", [a], out); }
  buf(a: number, out?: number) { return this.op("BUF", [a], out); }
  and(ins: number[], out?: number) { return this.op("AND", ins, out); }
  or(ins: number[], out?: number) { return this.op("OR", ins, out); }
  nand(ins: number[], out?: number) { return this.op("NAND", ins, out); }
  nor(ins: number[], out?: number) { return this.op("NOR", ins, out); }
  xor(a: number, b: number, out?: number) { return this.op("XOR", [a, b], out); }
  xnor(a: number, b: number, out?: number) { return this.op("XNOR", [a, b], out); }
  /** Üç durumlu tampon: en = 1 iken y = a, değilse Z. */
  tbuf(a: number, en: number, out: number) { return this.op("TBUF", [a, en], out); }

  dff(o: { d: number; clk: number; preN?: number; clrN?: number; q?: number; qn?: number }) {
    const q = o.q ?? this.net();
    const qn = o.qn ?? this.net();
    this.add("DFF", [o.d, o.clk, o.preN ?? this.VCC, o.clrN ?? this.VCC], [q, qn]);
    return { q, qn };
  }

  latch(o: { d: number; en: number; q?: number; qn?: number }) {
    const q = o.q ?? this.net();
    const qn = o.qn ?? this.net();
    this.add("LATCH", [o.d, o.en], [q, qn]);
    return { q, qn };
  }

  /** 2'ye 1 seçici: s = 0 → a, s = 1 → b */
  mux2(a: number, b: number, s: number, sn?: number, out?: number) {
    const nsel = sn ?? this.not(s);
    return this.or([this.and([a, nsel]), this.and([b, s])], out);
  }
}

// ---- dört değerli kapı fonksiyonları
const isX = (v: number) => v >= LZ;

function evalAnd(vals: number[]): Level {
  let unknown = false;
  for (const v of vals) {
    if (v === L0) return L0;
    if (isX(v)) unknown = true;
  }
  return unknown ? LX : L1;
}

function evalOr(vals: number[]): Level {
  let unknown = false;
  for (const v of vals) {
    if (v === L1) return L1;
    if (isX(v)) unknown = true;
  }
  return unknown ? LX : L0;
}

function evalXor(vals: number[]): Level {
  let p = 0;
  for (const v of vals) {
    if (isX(v)) return LX;
    p ^= v;
  }
  return p as Level;
}

const inv = (v: Level): Level => (v === L0 ? L1 : v === L1 ? L0 : LX);

interface SeqState {
  q: Level;
  lastClk: Level;
}

/** Olay güdümlü, dalga tabanlı kapı seviyesi simülatör. */
export class LogicSim {
  readonly circuit: Circuit;
  /** Her netin çözümlenmiş değeri */
  readonly value: Uint8Array;
  /** Dışarıdan sürülen değer (LZ = sürülmüyor) */
  private readonly ext: Uint8Array;
  /** Zayıf çekme direnci: net hiç sürülmüyorsa bu değeri alır (LZ = direnç yok) */
  private readonly pullv: Uint8Array;
  /** Her kapı çıkışının (sürücünün) değeri: driverStart[g] + çıkış sırası */
  private readonly drv: Uint8Array;
  private readonly driverStart: Int32Array;
  /** net → sürücü listesi (CSR) */
  private readonly netDrvStart: Int32Array;
  private readonly netDrv: Int32Array;
  /** net → giriş olarak bağlı kapılar (CSR) */
  private readonly fanStart: Int32Array;
  private readonly fan: Int32Array;
  private readonly seq: (SeqState | null)[];
  private readonly behaviors: (Behavior | null)[];
  private readonly prevInputs: (Level[] | null)[];
  private queue: number[] = [];
  private readonly queued: Uint8Array;
  private readonly dirtyNets: Uint8Array;
  /** Toplam dalga sayısı (yayılım gecikmesi ölçüsü) */
  waves = 0;

  constructor(circuit: Circuit) {
    this.circuit = circuit;
    const n = circuit.netCount;
    const gates = circuit.gates;
    this.value = new Uint8Array(n).fill(LZ);
    this.ext = new Uint8Array(n).fill(LZ);
    this.pullv = new Uint8Array(n).fill(LZ);
    this.ext[circuit.GND] = L0;
    this.ext[circuit.VCC] = L1;

    this.driverStart = new Int32Array(gates.length + 1);
    gates.forEach((g, i) => (this.driverStart[i + 1] = this.driverStart[i] + g.outputs.length));
    this.drv = new Uint8Array(this.driverStart[gates.length]).fill(LZ);

    const drvCount = new Int32Array(n + 1);
    const fanCount = new Int32Array(n + 1);
    gates.forEach((g) => {
      for (const o of g.outputs) drvCount[o + 1]++;
      for (const i of new Set(g.inputs)) fanCount[i + 1]++;
    });
    for (let i = 0; i < n; i++) {
      drvCount[i + 1] += drvCount[i];
      fanCount[i + 1] += fanCount[i];
    }
    this.netDrvStart = drvCount;
    this.fanStart = fanCount;
    this.netDrv = new Int32Array(drvCount[n]);
    this.fan = new Int32Array(fanCount[n]);
    const dFill = drvCount.slice(0, n);
    const fFill = fanCount.slice(0, n);
    gates.forEach((g, gi) => {
      g.outputs.forEach((o, k) => (this.netDrv[dFill[o]++] = this.driverStart[gi] + k));
      for (const i of new Set(g.inputs)) this.fan[fFill[i]++] = gi;
    });

    this.seq = gates.map((g) => (g.kind === "DFF" || g.kind === "LATCH" ? { q: LX, lastClk: LX } : null));
    this.behaviors = gates.map((g) => (g.kind === "BEHAV" && g.behavior ? g.behavior() : null));
    this.prevInputs = gates.map((g) => (g.kind === "BEHAV" ? g.inputs.map(() => LX as Level) : null));
    this.queued = new Uint8Array(gates.length);
    this.dirtyNets = new Uint8Array(n);

    for (let i = 0; i < n; i++) this.value[i] = this.resolve(i);
    for (let g = 0; g < gates.length; g++) this.schedule(g);
    this.settle();
  }

  /** Bir neti dışarıdan sür (pin, test ucu). Hemen yayılmaz; settle() çağrılmalı. */
  drive(net: number, v: Level | boolean): void {
    this.ext[net] = typeof v === "boolean" ? (v ? L1 : L0) : v;
    this.touch(net);
  }

  /** Dış sürmeyi bırak (net yalnızca çip çıkışlarınca sürülür). */
  release(net: number): void {
    this.ext[net] = LZ;
    this.touch(net);
  }

  /** Neti bir dirençle 0'a ya da 1'e çek (veriyolu çekme dirençleri) */
  pull(net: number, v: Level): void {
    this.pullv[net] = v;
    this.touch(net);
  }

  /**
   * Bir flip-flop / mandalın iç durumunu doğrudan ayarla. Yalnızca simülasyon içindir:
   * test başlangıç durumu (gerçek donanımda güç açılışında değerler rastgeledir).
   */
  setState(gate: number, v: Level): void {
    const s = this.seq[gate];
    if (!s) throw new Error(`Kapı ${gate} sıralı eleman değil`);
    s.q = v;
    this.schedule(gate);
  }

  /** Sür ve yerleşmesini bekle. */
  set(net: number, v: Level | boolean): void {
    this.drive(net, v);
    this.settle();
  }

  get(net: number): Level {
    return this.value[net] as Level;
  }

  /** Bir sıralı elemanın iç durumu (görselleştirme) */
  stateOf(gate: number): Level | null {
    return this.seq[gate]?.q ?? null;
  }

  private touch(net: number): void {
    const v = this.resolve(net);
    if (v === this.value[net]) return;
    this.value[net] = v;
    for (let k = this.fanStart[net], e = this.fanStart[net + 1]; k < e; k++) this.schedule(this.fan[k]);
  }

  private schedule(g: number): void {
    if (this.queued[g]) return;
    this.queued[g] = 1;
    this.queue.push(g);
  }

  private resolve(net: number): Level {
    let v = this.ext[net] as Level;
    for (let k = this.netDrvStart[net], e = this.netDrvStart[net + 1]; k < e; k++) {
      const d = this.drv[this.netDrv[k]] as Level;
      if (d === LZ) continue;
      if (v === LZ) v = d;
      else if (v !== d) return LX;
    }
    return v === LZ ? (this.pullv[net] as Level) : v;
  }

  /** Bütün değişiklikler yayılana kadar dalga dalga hesapla. */
  settle(maxWaves = 10_000): void {
    const gates = this.circuit.gates;
    let waves = 0;
    while (this.queue.length > 0) {
      if (++waves > maxWaves) throw new Error("Devre kararlı hale gelmedi (salınım)");
      const wave = this.queue;
      this.queue = [];
      for (const g of wave) this.queued[g] = 0;
      // 1) hesapla (eski net değerleriyle)
      const results: Level[][] = wave.map((g) => this.evalGate(g));
      // 2) yaz
      const dirty: number[] = [];
      wave.forEach((g, wi) => {
        const outs = gates[g].outputs;
        const res = results[wi];
        for (let k = 0; k < outs.length; k++) {
          const d = this.driverStart[g] + k;
          if (this.drv[d] === res[k]) continue;
          this.drv[d] = res[k];
          if (!this.dirtyNets[outs[k]]) {
            this.dirtyNets[outs[k]] = 1;
            dirty.push(outs[k]);
          }
        }
      });
      for (const net of dirty) {
        this.dirtyNets[net] = 0;
        this.touch(net);
      }
    }
    this.waves += waves;
  }

  private evalGate(gi: number): Level[] {
    const g = this.circuit.gates[gi];
    const v = this.value;
    const ins = g.inputs.map((i) => v[i]);
    switch (g.kind) {
      case "NOT": return [inv(isX(ins[0]) ? LX : (ins[0] as Level))];
      case "BUF": return [isX(ins[0]) ? LX : (ins[0] as Level)];
      case "AND": return [evalAnd(ins)];
      case "NAND": return [inv(evalAnd(ins))];
      case "OR": return [evalOr(ins)];
      case "NOR": return [inv(evalOr(ins))];
      case "XOR": return [evalXor(ins)];
      case "XNOR": return [inv(evalXor(ins))];
      case "TBUF": {
        const [a, en] = ins;
        if (en === L0) return [LZ];
        if (en === L1) return [isX(a) ? LX : (a as Level)];
        return [LX];
      }
      case "DFF": return this.evalDff(gi, ins);
      case "LATCH": {
        const s = this.seq[gi]!;
        const [d, en] = ins;
        if (en === L1) s.q = isX(d) ? LX : (d as Level);
        else if (isX(en) && s.q !== d) s.q = LX;
        return [s.q, inv(s.q)];
      }
      case "BEHAV": {
        const prev = this.prevInputs[gi]!;
        const out = this.behaviors[gi]!.eval(ins as Level[], prev);
        this.prevInputs[gi] = ins as Level[];
        return out;
      }
    }
  }

  private evalDff(gi: number, ins: number[]): Level[] {
    const s = this.seq[gi]!;
    const [d, clk, preN, clrN] = ins;
    const clkL = (isX(clk) ? LX : clk) as Level;
    // kenar yalnızca saat girişi gerçekten değiştiyse: 0→1 kesin, 0→X / X→1 belki
    const changed = clkL !== s.lastClk;
    const rising = changed && s.lastClk === L0 && clkL === L1;
    const maybeRising = changed && !rising && s.lastClk !== L1 && clkL !== L0;
    s.lastClk = clkL;
    if (preN === L0 && clrN === L0) {
      // veri sayfası: ikisi birden aktifken Q = Q̅ = 1 (kararsız durum)
      s.q = L1;
      return [L1, L1];
    }
    if (preN === L0) s.q = L1;
    else if (clrN === L0) s.q = L0;
    else if (isX(preN) || isX(clrN)) s.q = LX;
    else if (rising) s.q = isX(d) ? LX : (d as Level);
    else if (maybeRising && s.q !== d) s.q = LX;
    return [s.q, inv(s.q)];
  }
}
