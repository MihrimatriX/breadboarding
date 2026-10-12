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
  eval(inputs: readonly Level[], prev: readonly Level[]): readonly Level[];
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

// Sıcak döngüde dize karşılaştırması yerine kapı türünün sayı kodu
const K_NOT = 0, K_BUF = 1, K_AND = 2, K_NAND = 3, K_OR = 4, K_NOR = 5, K_XOR = 6, K_XNOR = 7;
const K_TBUF = 8, K_DFF = 9, K_LATCH = 10, K_BEHAV = 11;
const KIND_CODE: Record<GateKind, number> = {
  NOT: K_NOT, BUF: K_BUF, AND: K_AND, NAND: K_NAND, OR: K_OR, NOR: K_NOR, XOR: K_XOR, XNOR: K_XNOR,
  TBUF: K_TBUF, DFF: K_DFF, LATCH: K_LATCH, BEHAV: K_BEHAV,
};

// Girişler `nets[s..e)` netlerinin `v`'deki değerleri
function evalAnd(v: Uint8Array, nets: Int32Array, s: number, e: number): Level {
  let unknown = false;
  for (let k = s; k < e; k++) {
    const x = v[nets[k]];
    if (x === L0) return L0;
    if (isX(x)) unknown = true;
  }
  return unknown ? LX : L1;
}

function evalOr(v: Uint8Array, nets: Int32Array, s: number, e: number): Level {
  let unknown = false;
  for (let k = s; k < e; k++) {
    const x = v[nets[k]];
    if (x === L1) return L1;
    if (isX(x)) unknown = true;
  }
  return unknown ? LX : L0;
}

function evalXor(v: Uint8Array, nets: Int32Array, s: number, e: number): Level {
  let p = 0;
  for (let k = s; k < e; k++) {
    const x = v[nets[k]];
    if (isX(x)) return LX;
    p ^= x;
  }
  return p as Level;
}

const inv = (v: number): Level => (v === L0 ? L1 : v === L1 ? L0 : LX);

/**
 * Olay güdümlü, dalga tabanlı kapı seviyesi simülatör. Bütün durum düz tiplenmiş dizilerde
 * (CSR): bir dalga hiç nesne ayırmadan hesaplanır, yalnız davranışsal bloklar (bellek) dizi alır.
 */
export class LogicSim {
  readonly circuit: Circuit;
  /** Her netin çözümlenmiş değeri */
  readonly value: Uint8Array;
  /** Dışarıdan sürülen değer (LZ = sürülmüyor) */
  private readonly ext: Uint8Array;
  /** Zayıf çekme direnci: net hiç sürülmüyorsa bu değeri alır (LZ = direnç yok) */
  private readonly pullv: Uint8Array;
  /** Kapı türü kodu (K_*) */
  private readonly kind: Uint8Array;
  /** kapı → giriş netleri, sırasıyla (CSR) */
  private readonly inStart: Int32Array;
  private readonly inNet: Int32Array;
  /** Her kapı çıkışının (sürücünün) değeri ve neti: driverStart[g] + çıkış sırası */
  private readonly drv: Uint8Array;
  private readonly outNet: Int32Array;
  private readonly driverStart: Int32Array;
  /** Dalganın hesapladığı yeni sürücü değerleri (yazılmadan önce) */
  private readonly next: Uint8Array;
  /** net → sürücü listesi (CSR) */
  private readonly netDrvStart: Int32Array;
  private readonly netDrv: Int32Array;
  /** net → giriş olarak bağlı kapılar (CSR) */
  private readonly fanStart: Int32Array;
  private readonly fan: Int32Array;
  /** Flip-flop / mandalın durumu ve son gördüğü saat */
  private readonly q: Uint8Array;
  private readonly lastClk: Uint8Array;
  private readonly behaviors: (Behavior | null)[];
  private readonly prevInputs: (Level[] | null)[];
  /** Bekleyen kapılar ve bir önceki dalganın (yeniden kullanılan) dizisi */
  private queue: Int32Array;
  private spare: Int32Array;
  private queueLen = 0;
  private readonly queued: Uint8Array;
  private readonly dirty: Int32Array;
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

    this.kind = Uint8Array.from(gates, (g) => KIND_CODE[g.kind]);
    this.inStart = new Int32Array(gates.length + 1);
    gates.forEach((g, i) => (this.inStart[i + 1] = this.inStart[i] + g.inputs.length));
    this.inNet = Int32Array.from(gates.flatMap((g) => g.inputs));

    this.driverStart = new Int32Array(gates.length + 1);
    gates.forEach((g, i) => (this.driverStart[i + 1] = this.driverStart[i] + g.outputs.length));
    this.drv = new Uint8Array(this.driverStart[gates.length]).fill(LZ);
    this.next = new Uint8Array(this.drv.length);
    this.outNet = Int32Array.from(gates.flatMap((g) => g.outputs));

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

    this.q = new Uint8Array(gates.length).fill(LX);
    this.lastClk = new Uint8Array(gates.length).fill(LX);
    this.behaviors = gates.map((g) => (g.kind === "BEHAV" && g.behavior ? g.behavior() : null));
    this.prevInputs = gates.map((g) => (g.kind === "BEHAV" ? g.inputs.map(() => LX as Level) : null));
    this.queue = new Int32Array(gates.length);
    this.spare = new Int32Array(gates.length);
    this.queued = new Uint8Array(gates.length);
    this.dirty = new Int32Array(n);
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
    if (!this.isSeq(gate)) throw new Error(`Kapı ${gate} sıralı eleman değil`);
    this.q[gate] = v;
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
    return this.isSeq(gate) ? (this.q[gate] as Level) : null;
  }

  private isSeq(gate: number): boolean {
    const k = this.kind[gate];
    return k === K_DFF || k === K_LATCH;
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
    this.queue[this.queueLen++] = g;
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
    const { drv, next, outNet, driverStart, dirtyNets, dirty } = this;
    let waves = 0;
    while (this.queueLen > 0) {
      if (++waves > maxWaves) throw new Error("Devre kararlı hale gelmedi (salınım)");
      const wave = this.queue;
      const len = this.queueLen;
      this.queue = this.spare;
      this.spare = wave;
      this.queueLen = 0;
      for (let i = 0; i < len; i++) this.queued[wave[i]] = 0;
      // 1) hesapla (eski net değerleriyle)
      for (let i = 0; i < len; i++) this.evalGate(wave[i]);
      // 2) yaz
      let nDirty = 0;
      for (let i = 0; i < len; i++) {
        const g = wave[i];
        for (let d = driverStart[g], e = driverStart[g + 1]; d < e; d++) {
          if (drv[d] === next[d]) continue;
          drv[d] = next[d];
          const net = outNet[d];
          if (!dirtyNets[net]) {
            dirtyNets[net] = 1;
            dirty[nDirty++] = net;
          }
        }
      }
      for (let i = 0; i < nDirty; i++) {
        dirtyNets[dirty[i]] = 0;
        this.touch(dirty[i]);
      }
    }
    this.waves += waves;
  }

  /** Kapının yeni çıkışlarını `next`'e yazar (sıralı elemanların durumu burada ilerler) */
  private evalGate(gi: number): void {
    const v = this.value;
    const nets = this.inNet;
    const s = this.inStart[gi];
    const e = this.inStart[gi + 1];
    const o = this.driverStart[gi];
    const next = this.next;
    switch (this.kind[gi]) {
      case K_NOT: next[o] = inv(v[nets[s]]); return;
      case K_BUF: { const a = v[nets[s]]; next[o] = isX(a) ? LX : a; return; }
      case K_AND: next[o] = evalAnd(v, nets, s, e); return;
      case K_NAND: next[o] = inv(evalAnd(v, nets, s, e)); return;
      case K_OR: next[o] = evalOr(v, nets, s, e); return;
      case K_NOR: next[o] = inv(evalOr(v, nets, s, e)); return;
      case K_XOR: next[o] = evalXor(v, nets, s, e); return;
      case K_XNOR: next[o] = inv(evalXor(v, nets, s, e)); return;
      case K_TBUF: {
        const a = v[nets[s]];
        const en = v[nets[s + 1]];
        next[o] = en === L0 ? LZ : en === L1 ? (isX(a) ? LX : a) : LX;
        return;
      }
      case K_DFF: this.evalDff(gi, v[nets[s]], v[nets[s + 1]], v[nets[s + 2]], v[nets[s + 3]], o); return;
      case K_LATCH: {
        const d = v[nets[s]];
        const en = v[nets[s + 1]];
        const q = this.q;
        if (en === L1) q[gi] = isX(d) ? LX : d;
        else if (isX(en) && q[gi] !== d) q[gi] = LX;
        next[o] = q[gi];
        next[o + 1] = inv(q[gi]);
        return;
      }
      case K_BEHAV: {
        const ins: Level[] = [];
        for (let k = s; k < e; k++) ins.push(v[nets[k]] as Level);
        const out = this.behaviors[gi]!.eval(ins, this.prevInputs[gi]!);
        this.prevInputs[gi] = ins;
        for (let k = 0, n = this.driverStart[gi + 1] - o; k < n; k++) next[o + k] = out[k];
        return;
      }
    }
  }

  private evalDff(gi: number, d: number, clk: number, preN: number, clrN: number, o: number): void {
    const q = this.q;
    const last = this.lastClk[gi];
    const clkL = isX(clk) ? LX : clk;
    // kenar yalnızca saat girişi gerçekten değiştiyse: 0→1 kesin, 0→X / X→1 belki
    const changed = clkL !== last;
    const rising = changed && last === L0 && clkL === L1;
    const maybeRising = changed && !rising && last !== L1 && clkL !== L0;
    this.lastClk[gi] = clkL;
    if (preN === L0 && clrN === L0) {
      // veri sayfası: ikisi birden aktifken Q = Q̅ = 1 (kararsız durum)
      q[gi] = L1;
      this.next[o] = L1;
      this.next[o + 1] = L1;
      return;
    }
    if (preN === L0) q[gi] = L1;
    else if (clrN === L0) q[gi] = L0;
    else if (isX(preN) || isX(clrN)) q[gi] = LX;
    else if (rising) q[gi] = isX(d) ? LX : d;
    else if (maybeRising && q[gi] !== d) q[gi] = LX;
    this.next[o] = q[gi];
    this.next[o + 1] = inv(q[gi]);
  }
}
