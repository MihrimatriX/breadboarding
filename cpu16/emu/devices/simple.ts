// Küçük çevre birimleri: UART, zamanlayıcı, VGA metin kartı. Zamanlama makinenin döngü
// sayacından gelir (machine.ts); bu sınıflar sadece register durumunu tutar.

import { charToText } from "../../video/font.ts";

/** UART (115200 8N1). TX: yazılan bayt hemen ana makineye gider, TX_EMPTY bir bayt süresi 0 olur.
 * RX: ana makineden gelen baytlar bayt süresi aralıklarla RX register'ına düşer. Donanım akış
 * kontrolü: RX_READY 1 iken RTS# pasiftir, USB-UART köprüsü (CH340) sonraki baytı bekletir;
 * bu yüzden taşma olmaz. */
export class Uart {
  rxData = 0;
  rxReady = false;
  readonly rxQueue: number[] = [];
  nextRxAt = 0;
  txBusyUntil = 0;
  /** Gönderilen bayt sayısı (istatistik). */
  txCount = 0;

  reset(): void {
    this.rxData = 0;
    this.rxReady = false;
    this.rxQueue.length = 0;
    this.nextRxAt = 0;
    this.txBusyUntil = 0;
  }
}

/** 16 bit aşağı sayan zamanlayıcı (74HC193 ×4 + yeniden yükleme latch'i 74HC574 ×2).
 * 1 kHz'lik tık ile sayar; 0 olunca yeniden yüklenir ve EXPIRED kurulur. */
export class Timer {
  reload = 0;
  counter = 0;
  /** bit0 EN, bit1 IRQ_EN */
  ctrl = 0;
  expired = false;

  writeCtrl(value: number): void {
    const wasOn = (this.ctrl & 1) !== 0;
    this.ctrl = value & 3;
    if (!wasOn && (this.ctrl & 1)) this.counter = this.reload; // açılırken yükle
  }

  tick(): void {
    if (!(this.ctrl & 1)) return;
    this.counter = (this.counter - 1) & 0xffff;
    if (this.counter === 0) {
      this.counter = this.reload;
      this.expired = true;
    }
  }

  get irqRequest(): boolean {
    return this.expired && (this.ctrl & 2) !== 0;
  }

  reset(): void {
    this.reload = 0;
    this.counter = 0;
    this.ctrl = 0;
    this.expired = false;
  }
}

export const TEXT_COLS = 80;
export const TEXT_ROWS = 30;
export const VRAM_SIZE = 0x2000; // 8 KB SRAM (6264); 80×30×2 = 4800 bayt kullanılır

/** VGA metin kartı: kendi VRAM'i, adres sayacı (otomatik artan), imleç ve dikey tarama durumu. */
export class VideoCard {
  readonly vram = new Uint8Array(VRAM_SIZE);
  vaddr = 0;
  /** bit0 imleç açık */
  ctrl = 0;
  cursorX = 0;
  cursorY = 0;
  /** VSTAT bit1: dikey tarama başında kurulur, 1 yazınca silinir. */
  vsyncFlag = false;
  /** Tamamlanan kare sayısı (imleç yanıp sönmesi 16 karede bir). */
  frames = 0;
  /** Ana makine çizimi için: VRAM ya da imleç değişti. */
  dirty = true;

  readData(): number {
    const v = this.vram[this.vaddr];
    this.vaddr = (this.vaddr + 1) & (VRAM_SIZE - 1);
    return v;
  }

  writeData(value: number): void {
    this.vram[this.vaddr] = value & 0xff;
    this.vaddr = (this.vaddr + 1) & (VRAM_SIZE - 1);
    this.dirty = true;
  }

  /** İmleç şu an görünür mü (açık ve yanıp sönmenin "yanık" yarısında). */
  get cursorVisible(): boolean {
    return (this.ctrl & 1) !== 0 && ((this.frames >> 4) & 1) === 0;
  }

  /** Ekranı metin olarak döndürür (satır sonlarındaki boşluklar kırpılır). */
  renderText(): string {
    const lines: string[] = [];
    for (let r = 0; r < TEXT_ROWS; r++) lines.push(this.line(r).trimEnd());
    return lines.join("\n");
  }

  line(row: number): string {
    let s = "";
    for (let c = 0; c < TEXT_COLS; c++) s += charToText(this.vram[(row * TEXT_COLS + c) * 2]);
    return s;
  }

  reset(): void {
    this.vaddr = 0;
    this.ctrl = 0;
    this.cursorX = 0;
    this.cursorY = 0;
    this.vsyncFlag = false;
    this.dirty = true;
  }
}
