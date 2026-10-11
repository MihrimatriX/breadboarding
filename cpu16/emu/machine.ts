// CPU16 anakartı (Faz 6): CPU + bank register'ları (basit MMU) + önbellek + Flash + RAM + G/Ç.
// Machine, Cpu16'nın Bus arayüzünü uygular; komut setine dokunmaz. Zaman CPU döngüsüyle
// ölçülür: her komut mikromimari tablosundaki döngü sayısı + bellek bekleme durumları kadar
// sürer; zamanlayıcı, dikey tarama, UART ve klavye bu sayaçla ilerler.
// Tasarım belgesi: cpu16/docs/anakart.md

import { Cpu16, type Bus, type StepResult } from "./cpu.ts";
import { OP, VEC_IRQ } from "./isa.ts";
import { Cache } from "./devices/cache.ts";
import { FLASH_SIZE, Sst39sf010 } from "./devices/flash.ts";
import { Ps2Keyboard, breakCodes, makeCodes, textToScancodes } from "./devices/keyboard.ts";
import { Timer, Uart, VideoCard, VRAM_SIZE } from "./devices/simple.ts";

// ---- zamanlama
export const CPU_HZ = 4_000_000;
/** Zamanlayıcının 1 kHz tıkı: 4 MHz / 4000. */
export const TICK_CYCLES = 4000;
/** 60 Hz kare: 4 MHz / 60 ≈ 66 667 döngü. */
export const FRAME_CYCLES = 66_667;
/** 640×480@60: 525 satırın 480'i görünür; kalan 45 satır dikey boşluk (vblank). */
export const VBLANK_START = Math.round((FRAME_CYCLES * 480) / 525);
/** 115200 baud, bayt başına 10 bit. */
export const UART_BYTE_CYCLES = Math.round(CPU_HZ / 11_520);
/** PS/2: 11 bit, ~12,5 kHz saat. */
export const KBD_BYTE_CYCLES = 3520;
/** Ana bellek veriyolu bekleme durumu (önbellek ıskalaması / önbelleksiz erişim / her yazma). */
export const MEM_WAIT = 2;
/** IRQ girişi (mikrokod: PUSH PC, PUSH bayrak, vektör). */
export const IRQ_ENTRY_CYCLES = 8;

// ---- bellek
export const RAM_BASE = 0x80000;
export const RAM_SIZE = 0x80000;
export const RESET_BANKS = [0, 32, 33, 34] as const;

/** G/Ç register adresleri (0xFF00–0xFFFF her zaman G/Ç). */
export const IO = {
  UART_DATA: 0xff00, UART_STAT: 0xff01, KBD_DATA: 0xff02, KBD_STAT: 0xff03,
  TIMER_RELOAD: 0xff04, TIMER_CTRL: 0xff06, TIMER_STAT: 0xff07,
  IRQ_PEND: 0xff08, IRQ_MASK: 0xff09, IRQ_SRC: 0xff0a,
  BANK0: 0xff10, BANK1: 0xff11, BANK2: 0xff12, BANK3: 0xff13,
  VADDR: 0xff20, VDATA: 0xff22, VCTRL: 0xff23, CURSOR_X: 0xff24, CURSOR_Y: 0xff25, VSTAT: 0xff26,
  CACHE_HITS: 0xff30, CACHE_MISSES: 0xff32, CACHE_CTRL: 0xff34,
} as const;

/** IRQ kaynak numaraları (IRQ_PEND bitleri). 74HC148 gibi: büyük numara = yüksek öncelik. */
export const IRQ_TIMER = 0;
export const IRQ_KBD = 1;
export const IRQ_UART = 2;
export const IRQ_VSYNC = 3;

interface Flags {
  n: boolean;
  z: boolean;
  c: boolean;
  v: boolean;
}

function conditionHolds(cond: number, s: Flags): boolean {
  switch (cond) {
    case 0: return s.z;
    case 1: return !s.z;
    case 2: return s.c;
    case 3: return !s.c;
    case 4: return s.n;
    case 5: return !s.n;
    case 6: return s.v;
    case 7: return !s.v;
    case 8: return s.c && !s.z;
    case 9: return !s.c || s.z;
    case 10: return s.n === s.v;
    case 11: return s.n !== s.v;
    case 12: return !s.z && s.n === s.v;
    case 13: return s.z || s.n !== s.v;
    case 14: return true;
    default: return false;
  }
}

/** Bekleme durumları hariç komut döngüsü (docs/mikromimari.md tablosu). */
export function instructionCycles(w: number, flags: Flags): number {
  switch ((w >> 12) & 0xf) {
    case OP.ALU: return 5;
    case OP.ALU2: return 4;
    case OP.ADDI: case OP.LI: case OP.CMPI: return 5;
    case OP.LW: case OP.SW: case OP.LBU: case OP.SB: return 6;
    case OP.BCC: return conditionHolds((w >> 8) & 0xf, flags) ? 5 : 3;
    case OP.JAL: return 5;
    case OP.JALR: return 6;
    case OP.STACK: return 6;
    case OP.SYS:
      switch (w & 7) {
        case 4: return 8; // RETI
        case 5: return 10; // SWI
        case 6: return 4; // SXB
        default: return 3; // NOP HALT EI DI
      }
    default: return 3; // yasadışı: mikrokod ILLEGAL adımı
  }
}

export type RunResult = "ok" | "halted" | "illegal";

export class Machine implements Bus {
  readonly cpu: Cpu16;
  readonly flash = new Sst39sf010();
  readonly ram = new Uint8Array(RAM_SIZE);
  readonly banks = Uint8Array.from(RESET_BANKS);
  readonly cache = new Cache();
  readonly uart = new Uart();
  readonly kbd = new Ps2Keyboard();
  readonly timer = new Timer();
  readonly video = new VideoCard();
  irqMask = 0;
  /** Açılıştan beri geçen CPU döngüsü (zamanın kendisi). */
  cycles = 0;
  /** Toplam bekleme durumu (istatistik). */
  waitCycles = 0;
  /** UART'tan çıkan baytlar (her karakter bir bayt). Çok uzarsa baştan kırpılır. */
  uartOutput = "";
  uartOnOutput?: (byte: number) => void;
  /** Veriyolu izi: CPU'nun her read8/write8 çağrısı (kapı seviyesi kart testleri bu izi tekrar oynatır).
   * `cycle` komutun başladığı döngüdür; kelime erişimi art arda iki çağrıdır (çift, sonra tek adres). */
  onAccess?: (write: boolean, addr: number, value: number, cycle: number) => void;

  private wait = 0;
  private pairAddr = -1;
  private pairWrite = false;
  private nextTick = TICK_CYCLES;
  private nextVblank = VBLANK_START;
  private nextEvent = 0;

  constructor() {
    this.cpu = new Cpu16(this);
  }

  // ------------------------------------------------------------ adres çevirme

  /** CPU adresi → 20 bit fiziksel adres (G/Ç alanı için -1). */
  physAddr(addr: number): number {
    addr &= 0xffff;
    if (addr >= 0xff00) return -1;
    return this.banks[addr >> 14] * 0x4000 + (addr & 0x3fff);
  }

  private physRead(phys: number): number {
    if (phys < FLASH_SIZE) return this.flash.read(phys);
    if (phys >= RAM_BASE) return this.ram[phys - RAM_BASE];
    return 0xff; // boş fiziksel alan: veriyolu dirençlerle 1'e çekili
  }

  // ------------------------------------------------------------ Bus arayüzü

  read8(addr: number): number {
    const v = this.busRead(addr & 0xffff);
    this.onAccess?.(false, addr & 0xffff, v, this.cycles);
    return v;
  }

  private busRead(addr: number): number {
    if (addr >= 0xff00) {
      this.pairAddr = -1;
      return this.ioRead(addr & 0xff);
    }
    // Kelime erişimi CPU'da iki read8 çağrısıdır (çift adres, hemen ardından tek adres);
    // veriyolunda tek bir 16 bit döngüdür, önbellek ve bekleme bir kez sayılır.
    const odd = (addr & 1) === 1;
    const second = odd && !this.pairWrite && this.pairAddr === addr - 1;
    this.pairAddr = odd ? -1 : addr;
    this.pairWrite = false;
    const phys = this.banks[addr >> 14] * 0x4000 + (addr & 0x3fff);
    const c = this.cache;
    if (c.enabled) {
      const w = c.probe(phys);
      if (w >= 0) {
        if (!second) c.countHit();
        return odd ? w >> 8 : w & 0xff;
      }
      // Iskalama: bellek kartı kelimenin iki baytını okur, satır dolar.
      const even = phys & ~1;
      const word = this.physRead(even) | (this.physRead(even + 1) << 8);
      c.fill(phys, word);
      if (!second) {
        c.countMiss();
        this.wait += MEM_WAIT;
      }
      return odd ? word >> 8 : word & 0xff;
    }
    if (!second) this.wait += MEM_WAIT;
    return this.physRead(phys);
  }

  write8(addr: number, value: number): void {
    addr &= 0xffff;
    value &= 0xff;
    this.onAccess?.(true, addr, value, this.cycles);
    if (addr >= 0xff00) {
      this.pairAddr = -1;
      this.ioWrite(addr & 0xff, value);
      return;
    }
    const odd = (addr & 1) === 1;
    const second = odd && this.pairWrite && this.pairAddr === addr - 1;
    this.pairAddr = odd ? -1 : addr;
    this.pairWrite = true;
    if (!second) this.wait += MEM_WAIT; // write-through: her yazma ana belleğe gider
    const phys = this.banks[addr >> 14] * 0x4000 + (addr & 0x3fff);
    const isRam = phys >= RAM_BASE;
    this.cache.snoopWrite(phys, value, isRam);
    if (phys < FLASH_SIZE) this.flash.write(phys, value);
    else if (isRam) this.ram[phys - RAM_BASE] = value;
  }

  // ------------------------------------------------------------ G/Ç

  get irqPending(): number {
    return (this.timer.irqRequest ? 1 << IRQ_TIMER : 0) |
      (this.kbd.ready ? 1 << IRQ_KBD : 0) |
      (this.uart.rxReady ? 1 << IRQ_UART : 0) |
      (this.video.vsyncFlag ? 1 << IRQ_VSYNC : 0);
  }

  /** 74HC148 öncelik kodlayıcısı: bekleyen ve maskesi açık en yüksek kaynak, yoksa 0xFF. */
  get irqSource(): number {
    const p = this.irqPending & this.irqMask;
    return p ? 31 - Math.clz32(p) : 0xff;
  }

  get inVblank(): boolean {
    return this.cycles % FRAME_CYCLES >= VBLANK_START;
  }

  private updateIrq(): void {
    this.cpu.irq = (this.irqPending & this.irqMask) !== 0;
  }

  private ioRead(off: number): number {
    const v = this.ioPeek(off);
    switch (off) {
      case 0x00: // UART_RX: okumak RX_READY'yi siler
        if (this.uart.rxReady) {
          this.uart.rxReady = false;
          this.uart.nextRxAt = Math.max(this.uart.nextRxAt, this.cycles + UART_BYTE_CYCLES);
        }
        break;
      case 0x02: // KBD_DATA
        if (this.kbd.ready) {
          this.kbd.ready = false;
          this.kbd.nextAt = Math.max(this.kbd.nextAt, this.cycles + KBD_BYTE_CYCLES);
        }
        break;
      case 0x22: // VDATA: okuma da adresi artırır
        this.video.readData();
        break;
      default:
        return v;
    }
    this.nextEvent = this.cycles;
    this.updateIrq();
    return v;
  }

  /** G/Ç register'ını yan etkisiz okur (arayüz ve bellek görüntüsü için). */
  ioPeek(off: number): number {
    switch (off) {
      case 0x00: return this.uart.rxData;
      case 0x01: return (this.uart.rxReady ? 1 : 0) | (this.cycles >= this.uart.txBusyUntil ? 2 : 0);
      case 0x02: return this.kbd.data;
      case 0x03: return this.kbd.ready ? 1 : 0;
      case 0x04: return this.timer.reload & 0xff;
      case 0x05: return this.timer.reload >> 8;
      case 0x06: return this.timer.ctrl;
      case 0x07: return this.timer.expired ? 1 : 0;
      case 0x08: return this.irqPending;
      case 0x09: return this.irqMask;
      case 0x0a: return this.irqSource;
      case 0x10: case 0x11: case 0x12: case 0x13: return this.banks[off - 0x10];
      case 0x22: return this.video.vram[this.video.vaddr];
      case 0x23: return this.video.ctrl;
      case 0x24: return this.video.cursorX;
      case 0x25: return this.video.cursorY;
      case 0x26: return (this.inVblank ? 1 : 0) | (this.video.vsyncFlag ? 2 : 0);
      case 0x30: return this.cache.hits & 0xff;
      case 0x31: return this.cache.hits >> 8;
      case 0x32: return this.cache.misses & 0xff;
      case 0x33: return this.cache.misses >> 8;
      case 0x34: return this.cache.enabled ? 1 : 0;
      default: return 0xff; // sadece yazılır register'lar ve boş adresler
    }
  }

  private ioWrite(off: number, v: number): void {
    switch (off) {
      case 0x00: {
        this.uart.txBusyUntil = this.cycles + UART_BYTE_CYCLES;
        this.uart.txCount++;
        this.uartOutput += String.fromCharCode(v);
        if (this.uartOutput.length > 1 << 20) this.uartOutput = this.uartOutput.slice(-(1 << 19));
        this.uartOnOutput?.(v);
        break;
      }
      case 0x04: this.timer.reload = (this.timer.reload & 0xff00) | v; break;
      case 0x05: this.timer.reload = (this.timer.reload & 0x00ff) | (v << 8); break;
      case 0x06: this.timer.writeCtrl(v); break;
      case 0x07: if (v & 1) this.timer.expired = false; break;
      case 0x09: this.irqMask = v & 0x0f; break;
      case 0x10: case 0x11: case 0x12: case 0x13: this.banks[off - 0x10] = v & 0x3f; break;
      case 0x20: this.video.vaddr = (this.video.vaddr & 0xff00) | v; break;
      case 0x21: this.video.vaddr = ((v << 8) | (this.video.vaddr & 0xff)) & (VRAM_SIZE - 1); break;
      case 0x22: this.video.writeData(v); break;
      case 0x23: this.video.ctrl = v & 1; this.video.dirty = true; break;
      case 0x24: this.video.cursorX = v; this.video.dirty = true; break;
      case 0x25: this.video.cursorY = v; this.video.dirty = true; break;
      case 0x26: if (v & 2) this.video.vsyncFlag = false; break;
      case 0x30: this.cache.resetCounters(); break;
      case 0x34: this.cache.enabled = (v & 1) !== 0; break;
      default: return;
    }
    this.nextEvent = this.cycles;
    this.updateIrq();
  }

  // ------------------------------------------------------------ zaman

  private advance(n: number): void {
    this.cycles += n;
    if (this.cycles >= this.nextEvent) this.events();
  }

  private events(): void {
    const now = this.cycles;
    while (this.nextTick <= now) {
      this.timer.tick();
      this.nextTick += TICK_CYCLES;
    }
    while (this.nextVblank <= now) {
      this.video.vsyncFlag = true;
      this.video.frames++;
      if ((this.video.frames & 15) === 0) this.video.dirty = true; // imleç yanıp söner
      this.nextVblank += FRAME_CYCLES;
    }
    const u = this.uart;
    if (!u.rxReady && u.rxQueue.length && u.nextRxAt <= now) {
      u.rxData = u.rxQueue.shift()!;
      u.rxReady = true;
      u.nextRxAt = now + UART_BYTE_CYCLES;
    }
    const k = this.kbd;
    if (!k.ready && k.queue.length && k.nextAt <= now) {
      k.data = k.queue.shift()!;
      k.ready = true;
      k.nextAt = now + KBD_BYTE_CYCLES;
    }
    this.updateIrq();
    let next = Math.min(this.nextTick, this.nextVblank);
    if (!u.rxReady && u.rxQueue.length) next = Math.min(next, Math.max(u.nextRxAt, now + 1));
    if (!k.ready && k.queue.length) next = Math.min(next, Math.max(k.nextAt, now + 1));
    this.nextEvent = next;
  }

  /** CPU komut çalıştırmadan zamanı `n` döngü ilerletir (cihaz testleri için). */
  idle(n: number): void {
    this.advance(n);
  }

  /** Bir komut çalıştırır (CPU durmuşsa bir sonraki olaya kadar bekler). */
  step(): StepResult {
    const cpu = this.cpu;
    const willIrq = cpu.irq && cpu.i;
    if (cpu.halted && !willIrq) {
      if (cpu.illegalAt !== null) return "illegal";
      this.advance(Math.max(1, this.nextEvent - this.cycles));
      return "halted";
    }
    const w = this.peek16(willIrq ? VEC_IRQ : cpu.pc);
    let n = instructionCycles(w, cpu) + (willIrq ? IRQ_ENTRY_CYCLES : 0);
    this.wait = 0;
    this.pairAddr = -1;
    const r = cpu.step();
    n += this.wait;
    this.waitCycles += this.wait;
    this.advance(n);
    return r;
  }

  /** En az `maxCycles` döngü çalıştırır (yasadışı komutta durur). */
  run(maxCycles: number): RunResult {
    const end = this.cycles + maxCycles;
    const cpu = this.cpu;
    while (this.cycles < end) {
      if (cpu.halted && !(cpu.irq && cpu.i)) {
        if (cpu.illegalAt !== null) return "illegal";
        this.advance(Math.max(1, Math.min(this.nextEvent, end) - this.cycles));
        continue;
      }
      if (this.step() === "illegal") return "illegal";
    }
    return cpu.halted ? "halted" : "ok";
  }

  /** Koşul sağlanana ya da döngü sınırı dolana kadar çalıştırır; koşul sağlandıysa true. */
  runUntil(cond: () => boolean, maxCycles: number, chunk = 2000): boolean {
    const end = this.cycles + maxCycles;
    while (this.cycles < end) {
      if (cond()) return true;
      if (this.run(Math.min(chunk, end - this.cycles)) === "illegal") return cond();
    }
    return cond();
  }

  /** Reset düğmesi: CPU, bank register'ları ve cihazlar sıfırlanır; RAM, VRAM ve Flash içeriği kalır.
   * Önbellek etiketleri reset sırasında temizlenir (donanımda 1024 adımlık temizleme sayacı). */
  reset(): void {
    this.cpu.reset();
    this.banks.set(RESET_BANKS);
    this.cache.invalidateAll();
    this.cache.enabled = true;
    this.cache.resetCounters();
    this.flash.resetState(); // gerçek çipte RESET ucu yok; bkz. anakart.md
    this.uart.reset();
    this.kbd.reset();
    this.timer.reset();
    this.video.reset();
    this.irqMask = 0;
    this.nextEvent = this.cycles;
    this.updateIrq();
  }

  // ------------------------------------------------------------ ana makine API'si

  /** CPU adresini yan etkisiz okur (önbellekte varsa oradan). */
  peek(addr: number): number {
    addr &= 0xffff;
    if (addr >= 0xff00) return this.ioPeek(addr & 0xff);
    const phys = this.banks[addr >> 14] * 0x4000 + (addr & 0x3fff);
    if (this.cache.enabled) {
      const w = this.cache.probe(phys);
      if (w >= 0) return phys & 1 ? w >> 8 : w & 0xff;
    }
    return this.physRead(phys);
  }

  peek16(addr: number): number {
    addr &= 0xfffe;
    return this.peek(addr) | (this.peek(addr + 1) << 8);
  }

  /** Fiziksel adresi okur (önbelleği atlar). */
  peekPhys(phys: number): number {
    return this.physRead(phys & 0xfffff);
  }

  /** Flash'a programlayıcıyla yazılmış gibi imaj yükler (ör. BIOS). */
  loadFlash(image: Uint8Array, offset = 0): void {
    this.flash.load(image, offset);
    this.cache.invalidateAll();
  }

  /** Fiziksel adrese doğrudan yazar (RAM ya da Flash içeriği; "sihirli" yükleme). */
  pokePhys(phys: number, bytes: ArrayLike<number>): void {
    for (let i = 0; i < bytes.length; i++) {
      const p = (phys + i) & 0xfffff;
      if (p < FLASH_SIZE) this.flash.data[p] = bytes[i] & 0xff;
      else if (p >= RAM_BASE) this.ram[p - RAM_BASE] = bytes[i] & 0xff;
    }
    this.cache.invalidateAll();
  }

  /** CPU adresine (geçerli bank eşlemesiyle) doğrudan yazar. G/Ç alanı atlanır. */
  pokeCpu(addr: number, bytes: ArrayLike<number>): void {
    for (let i = 0; i < bytes.length; i++) {
      const p = this.physAddr(addr + i);
      if (p >= 0) this.pokePhys(p, [bytes[i]]);
    }
  }

  /** UART'a ana makineden bayt gönderir (USB-UART köprüsünün PC tarafı). */
  uartSend(data: string | ArrayLike<number>): void {
    if (typeof data === "string") {
      for (let i = 0; i < data.length; i++) this.uart.rxQueue.push(data.charCodeAt(i) & 0xff);
    } else {
      for (let i = 0; i < data.length; i++) this.uart.rxQueue.push(data[i] & 0xff);
    }
    this.nextEvent = this.cycles;
  }

  /** Klavyeden ham tarama kodu baytları gönderir. */
  keyPress(scancodes: ArrayLike<number>): void {
    for (let i = 0; i < scancodes.length; i++) this.kbd.queue.push(scancodes[i] & 0xff);
    this.nextEvent = this.cycles;
  }

  /** KeyboardEvent.code adıyla tuşa basar (set 2 basma kodu). */
  keyDown(code: string): void {
    this.keyPress(makeCodes(code));
  }

  /** KeyboardEvent.code adıyla tuşu bırakır (F0 önekli bırakma kodu). */
  keyUp(code: string): void {
    this.keyPress(breakCodes(code));
  }

  /** Metni ABD klavye düzeninde yazar (Shift dahil). */
  typeText(text: string): void {
    this.keyPress(textToScancodes(text));
  }

  /** VGA ekranındaki metin (30 satır). */
  renderText(): string {
    return this.video.renderText();
  }
}
