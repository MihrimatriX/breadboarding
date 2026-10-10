import type { ChipData } from "../chip/types";

/**
 * Anahtar seviyesi (switch-level) netlist simülatörü.
 *
 * Her transistör bir anahtardır: NMOS kapısı 1 iken, PMOS kapısı 0 iken iletir.
 * İletimdeki transistörlerle birbirine bağlı düğümler bir "grup" oluşturur ve
 * grubun değeri şu önceliğe göre belirlenir: GND > VCC > pull-up/pull-down > tutulan yük.
 *
 * Algoritma visual6502'nin chipsim.js'iyle (MIT) aynı sonuçları verir; fark,
 * veri yapılarının CSR biçiminde tipli dizilerde tutulması ve özyineleme yerine
 * açık yığın kullanılmasıdır. Bu sayede 3.500 transistörlü 6502 saniyede binlerce
 * yarım çevrim çalışır.
 */
export class SwitchLevelEngine {
  readonly nodeCount: number;
  readonly transistorCount: number;
  readonly gnd: number;
  readonly vcc: number;

  /** 0/1 düğüm durumları; render tarafına doğrudan kopyalanır */
  readonly state: Uint8Array;
  /** 0/1 transistör iletim durumları */
  readonly tOn: Uint8Array;

  private readonly pullup: Uint8Array;
  private readonly pulldown: Uint8Array;
  private readonly pullupInitial: Uint8Array;
  private readonly exists: Uint8Array;

  private readonly tGate: Int32Array;
  private readonly tC1: Int32Array;
  private readonly tC2: Int32Array;
  private readonly tPmos: Uint8Array;

  // CSR: düğüm -> kapısına bağlı transistörler
  private readonly gateStart: Int32Array;
  private readonly gateList: Int32Array;
  // CSR: düğüm -> kanalına (c1/c2) bağlı transistörler
  private readonly chanStart: Int32Array;
  private readonly chanList: Int32Array;

  // yeniden hesaplama ve gruplama için çalışma alanı
  private recalcList: Int32Array;
  private recalcLen = 0;
  private nextList: Int32Array;
  private nextLen = 0;
  private readonly inNext: Uint8Array;
  private readonly group: Int32Array;
  private groupLen = 0;
  private readonly groupMark: Int32Array;
  private groupStamp = 1;
  private readonly stack: Int32Array;

  /** Döngü sınırı aşıldığında artar (kararsız devre göstergesi) */
  oscillations = 0;

  constructor(chip: ChipData) {
    const n = chip.nodeCount;
    const tc = chip.transistors.length;
    this.nodeCount = n;
    this.transistorCount = tc;
    this.gnd = chip.gnd;
    this.vcc = chip.vcc;

    this.state = new Uint8Array(n);
    this.pullup = new Uint8Array(n);
    this.pulldown = new Uint8Array(n);
    this.pullupInitial = new Uint8Array(n);
    this.exists = new Uint8Array(n);
    for (const s of chip.segments) this.exists[s.node] = 1;
    for (const p of chip.pullups) this.pullupInitial[p] = 1;

    this.tGate = new Int32Array(tc);
    this.tC1 = new Int32Array(tc);
    this.tC2 = new Int32Array(tc);
    this.tPmos = new Uint8Array(tc);
    this.tOn = new Uint8Array(tc);

    const gateCount = new Int32Array(n + 1);
    const chanCount = new Int32Array(n + 1);
    chip.transistors.forEach((t, i) => {
      let { c1, c2 } = t;
      // chipsim ile aynı: güç rayı her zaman c2'de dursun
      if (c1 === this.gnd || c1 === this.vcc) [c1, c2] = [c2, c1];
      this.tGate[i] = t.gate;
      this.tC1[i] = c1;
      this.tC2[i] = c2;
      this.tPmos[i] = t.kind === "pmos" ? 1 : 0;
      this.exists[t.gate] = this.exists[c1] = this.exists[c2] = 1;
      gateCount[t.gate + 1]++;
      chanCount[c1 + 1]++;
      chanCount[c2 + 1]++;
    });
    for (let i = 0; i < n; i++) {
      gateCount[i + 1] += gateCount[i];
      chanCount[i + 1] += chanCount[i];
    }
    this.gateStart = gateCount;
    this.chanStart = chanCount;
    this.gateList = new Int32Array(gateCount[n]);
    this.chanList = new Int32Array(chanCount[n]);
    const gFill = gateCount.slice(0, n);
    const cFill = chanCount.slice(0, n);
    for (let i = 0; i < tc; i++) {
      this.gateList[gFill[this.tGate[i]]++] = i;
      this.chanList[cFill[this.tC1[i]]++] = i;
      this.chanList[cFill[this.tC2[i]]++] = i;
    }

    this.recalcList = new Int32Array(n);
    this.nextList = new Int32Array(n);
    this.inNext = new Uint8Array(n);
    this.group = new Int32Array(n);
    this.groupMark = new Int32Array(n);
    this.stack = new Int32Array(Math.max(n, chanCount[n]) + 16);
  }

  /** Tüm düğümleri sıfırlar ve pull-up'ları yükler (güç verme anı) */
  powerOn(): void {
    this.state.fill(0);
    this.tOn.fill(0);
    this.pullup.set(this.pullupInitial);
    this.pulldown.fill(0);
    this.state[this.vcc] = 1;
    for (let t = 0; t < this.transistorCount; t++) {
      if (this.tPmos[t]) this.tOn[t] = 1; // kapı 0 iken PMOS iletir
    }
    const all: number[] = [];
    for (let i = 0; i < this.nodeCount; i++) {
      if (this.exists[i] && i !== this.gnd && i !== this.vcc) all.push(i);
    }
    this.recalc(all);
  }

  /**
   * Görselleştirme için durum kopyası. chipsim'de olduğu gibi güç rayları kısa
   * devre gruplarında geçici olarak 0 görünebilir; ekranda raylar sabit gösterilir.
   */
  copyDisplayState(target: Uint8Array): void {
    target.set(this.state);
    target[this.vcc] = 1;
    target[this.gnd] = 0;
  }

  isHigh(node: number): boolean {
    return this.state[node] === 1;
  }

  /** Dış dünyadan bir düğümü sürmek (pin, veri yolu) */
  drive(node: number, high: boolean): void {
    this.pullup[node] = high ? 1 : 0;
    this.pulldown[node] = high ? 0 : 1;
    this.recalc([node]);
  }

  /** Birden fazla düğümü aynı anda sürüp tek seferde yeniden hesaplar */
  driveMany(nodes: number[], values: boolean[]): void {
    for (let i = 0; i < nodes.length; i++) {
      this.pullup[nodes[i]] = values[i] ? 1 : 0;
      this.pulldown[nodes[i]] = values[i] ? 0 : 1;
    }
    this.recalc(nodes);
  }

  gatesOf(node: number): number[] {
    return Array.from(this.gateList.subarray(this.gateStart[node], this.gateStart[node + 1]));
  }

  channelsOf(node: number): number[] {
    return Array.from(this.chanList.subarray(this.chanStart[node], this.chanStart[node + 1]));
  }

  hasPullup(node: number): boolean {
    return this.pullupInitial[node] === 1;
  }

  transistor(i: number) {
    return { gate: this.tGate[i], c1: this.tC1[i], c2: this.tC2[i], on: this.tOn[i] === 1, pmos: this.tPmos[i] === 1 };
  }

  recalc(nodes: ArrayLike<number>): void {
    this.recalcLen = 0;
    for (let i = 0; i < nodes.length; i++) this.recalcList[this.recalcLen++] = nodes[i];
    for (let iter = 0; iter < 100 && this.recalcLen > 0; iter++) {
      this.nextLen = 0;
      for (let i = 0; i < this.recalcLen; i++) this.recalcNode(this.recalcList[i]);
      for (let i = 0; i < this.nextLen; i++) this.inNext[this.nextList[i]] = 0;
      const tmp = this.recalcList;
      this.recalcList = this.nextList;
      this.nextList = tmp;
      this.recalcLen = this.nextLen;
      if (iter === 99 && this.recalcLen > 0) this.oscillations++;
    }
  }

  private recalcNode(node: number): void {
    if (node === this.gnd || node === this.vcc) return;
    this.buildGroup(node);
    const value = this.groupValue();
    for (let g = 0; g < this.groupLen; g++) {
      const nn = this.group[g];
      if (this.state[nn] === value) continue;
      this.state[nn] = value;
      for (let k = this.gateStart[nn], e = this.gateStart[nn + 1]; k < e; k++) {
        const t = this.gateList[k];
        const shouldBeOn = this.tPmos[t] ? value === 0 : value === 1;
        if (shouldBeOn) this.turnOn(t);
        else this.turnOff(t);
      }
    }
  }

  private turnOn(t: number): void {
    if (this.tOn[t]) return;
    this.tOn[t] = 1;
    this.queue(this.tC1[t]);
  }

  private turnOff(t: number): void {
    if (!this.tOn[t]) return;
    this.tOn[t] = 0;
    this.queue(this.tC1[t]);
    this.queue(this.tC2[t]);
  }

  private queue(node: number): void {
    if (node === this.gnd || node === this.vcc || this.inNext[node]) return;
    this.inNext[node] = 1;
    this.nextList[this.nextLen++] = node;
  }

  /** Özyinelemeli DFS ile aynı ön-sıra (preorder) sırasında grup oluşturur */
  private buildGroup(start: number): void {
    const stamp = ++this.groupStamp;
    this.groupLen = 0;
    let sp = 0;
    this.stack[sp++] = start;
    while (sp > 0) {
      const node = this.stack[--sp];
      if (this.groupMark[node] === stamp) continue;
      this.groupMark[node] = stamp;
      this.group[this.groupLen++] = node;
      if (node === this.gnd || node === this.vcc) continue;
      // çocukları ters sırada yığına it ki ilk transistör önce işlensin
      for (let k = this.chanStart[node + 1] - 1; k >= this.chanStart[node]; k--) {
        const t = this.chanList[k];
        if (!this.tOn[t]) continue;
        const other = this.tC1[t] === node ? this.tC2[t] : this.tC1[t];
        if (this.groupMark[other] !== stamp) this.stack[sp++] = other;
      }
    }
  }

  private groupValue(): 0 | 1 {
    const stamp = this.groupStamp;
    if (this.groupMark[this.gnd] === stamp) return 0;
    if (this.groupMark[this.vcc] === stamp) return 1;
    for (let g = 0; g < this.groupLen; g++) {
      const nn = this.group[g];
      if (this.pullup[nn]) return 1;
      if (this.pulldown[nn]) return 0;
      if (this.state[nn]) return 1;
    }
    return 0;
  }
}
