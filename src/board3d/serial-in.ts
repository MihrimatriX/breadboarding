// Kartın dışından gelen seri hatlar (worker'da): PS/2 klavye ve UART'ın alıcı hattı. Zaman CPU
// döngüsüyle sayılır (kart TCLK'ye göre çalışır); worker her döngüden sonra tick() çağırır.
// Zamanlamalar anakart-gc testlerindekiyle aynıdır: PS/2 saat periyodu 320 döngü (4 MHz'de
// 12,5 kHz), UART biti 347 / 10 döngü (115 200 baud).

/** Hatları süren taraf (LogicSim'in ince sarmalayıcısı) */
export interface LineIo {
  drive(net: number, v: 0 | 1): void;
  release(net: number): void;
  get(net: number): number;
}

type Event = { t: number; fn: () => void };

/**
 * PS/2 klavye: 11 bitlik çerçeve (başlangıç 0, 8 veri LSB önce, tek eşlik, bitiş 1). Klavye veri
 * bitini saatin düşen kenarından çeyrek periyot önce koyar; hatlar açık-kollektördür (bırakınca
 * çekme direnci 1 yapar). Kart READY iken saat hattını aşağı çeker: klavye o sürede göndermez.
 */
export class Ps2Sender {
  readonly queue: number[] = [];
  private events: Event[] = [];
  private busyUntil = -Infinity;

  constructor(private readonly io: LineIo, private readonly clk: number, private readonly dat: number, private readonly period = 320) {}

  get busy(): boolean {
    return this.events.length > 0 || this.queue.length > 0;
  }

  tick(now: number): void {
    while (this.events.length && this.events[0].t <= now) this.events.shift()!.fn();
    if (this.events.length || !this.queue.length || now < this.busyUntil) return;
    // kart saat hattını tutuyorsa (inhibit) bekle
    if (this.io.get(this.clk) !== 1) return;
    const byte = this.queue.shift()!;
    const p = this.period;
    let parity = 1;
    for (let i = 0; i < 8; i++) parity ^= (byte >> i) & 1;
    const bits = [0, ...Array.from({ length: 8 }, (_, i) => (byte >> i) & 1), parity, 1];
    const f0 = now + p;
    bits.forEach((v, i) => {
      const f = f0 + i * p;
      this.events.push({ t: f - p / 4, fn: () => (v ? this.io.release(this.dat) : this.io.drive(this.dat, 0)) });
      this.events.push({ t: f, fn: () => this.io.drive(this.clk, 0) });
      this.events.push({ t: f + p / 2, fn: () => this.io.release(this.clk) });
    });
    this.events.sort((a, b) => a.t - b.t);
    this.busyUntil = f0 + bits.length * p + p;
  }
}

/**
 * UART verici (USB-UART köprüsünün TX'i → kartın RX'i): 8N1. Kartın RTS# çıkışı (RX_READY) 1 iken
 * köprü sonraki baytı göndermez (CTS#), bayt kaybolmaz.
 */
export class UartSender {
  readonly queue: number[] = [];
  private events: Event[] = [];
  private nextStart = -Infinity;

  constructor(private readonly io: LineIo, private readonly rxd: number, private readonly rts: number, private readonly bit = 34.7) {
    io.drive(rxd, 1);
  }

  get busy(): boolean {
    return this.events.length > 0 || this.queue.length > 0;
  }

  tick(now: number): void {
    while (this.events.length && this.events[0].t <= now) this.events.shift()!.fn();
    if (this.events.length || !this.queue.length || now < this.nextStart) return;
    if (this.rts >= 0 && this.io.get(this.rts) === 1) return;
    const byte = this.queue.shift()!;
    const bits = [0, ...Array.from({ length: 8 }, (_, i) => (byte >> i) & 1), 1];
    bits.forEach((v, i) => this.events.push({ t: now + i * this.bit, fn: () => this.io.drive(this.rxd, v as 0 | 1) }));
    // bitiş biti ve bir bit boşluk
    this.nextStart = now + 11 * this.bit;
    this.events[0].fn();
    this.events.shift();
  }
}
