import { describe, expect, it } from "vitest";
import { assembleOrThrow } from "../asm/assembler.ts";
import { Cache } from "../emu/devices/cache.ts";
import { At28c256, TBLC_NS, TWC_NS } from "../emu/devices/eeprom.ts";
import { breakCodes, makeCodes, textToScancodes } from "../emu/devices/keyboard.ts";
import {
  CYCLE_NS, FRAME_CYCLES, IO, KBD_BYTE_CYCLES, KYB_SIZE, MEM_WAIT, Machine, RAM_BASE, TICK_CYCLES, UART_BYTE_CYCLES, VBLANK_START,
} from "../emu/machine.ts";
import { FONT_8X16, charToText, textToChar } from "../video/font.ts";

/** Kaynağı 0x0000'a derleyip EEPROM'a (ROM bank 0) yazar, reset'ler. */
function boot(src: string) {
  const asm = assembleOrThrow(src);
  const m = new Machine();
  m.loadFlash(asm.image.subarray(0, 0x4000));
  m.reset();
  return { m, asm };
}

/** HALT'a kadar çalıştırır. */
function runToHalt(m: Machine, max = 2_000_000) {
  const end = m.cycles + max;
  while (m.cycles < end && !m.cpu.halted) m.step();
  expect(m.cpu.halted).toBe(true);
  expect(m.cpu.illegalAt).toBeNull();
}

describe("bank register'ları ve bellek haritası", () => {
  it("reset değerleri: pencere 0 = ROM bank 0, pencere 1–3 = RAM bank 32–34", () => {
    const m = new Machine();
    expect(Array.from(m.banks)).toEqual([0, 32, 33, 34]);
    expect(m.physAddr(0x0000)).toBe(0x00000);
    expect(m.physAddr(0x4000)).toBe(0x80000);
    expect(m.physAddr(0x8123)).toBe(0x84123);
    expect(m.physAddr(0xfeff)).toBe(0x88000 + 0x3eff);
    expect(m.physAddr(0xff00)).toBe(-1); // G/Ç
    m.banks[1] = 40;
    m.write8(IO.BANK1, 0xff); // 6 bit
    expect(m.read8(IO.BANK1)).toBe(0x3f);
  });

  it("1 MB fiziksel alan: EEPROM 0x00000–0x07FFF, boş alan 0xFF, RAM 0x80000–0x9FFFF", () => {
    const m = new Machine();
    m.cache.enabled = false;
    m.loadFlash(Uint8Array.from({ length: 0x8000 }, (_, i) => (i * 7 + (i >> 14)) & 0xff));
    // Her bank'ı pencere 2'ye eşleyip yaz: önce hepsine, sonra doğrula (bankların karışmadığını da gösterir)
    for (let bank = 0; bank < 64; bank++) {
      m.write8(IO.BANK2, bank);
      for (let off = 0; off < 0x4000; off += 0x101) {
        m.write8(0x8000 + off, (bank * 3 + off) & 0xff);
      }
    }
    for (let bank = 0; bank < 64; bank++) {
      m.write8(IO.BANK2, bank);
      for (let off = 0; off < 0x4000; off += 0x101) {
        const phys = bank * 0x4000 + off;
        const got = m.read8(0x8000 + off);
        if (bank < 2) expect(got).toBe((phys * 7 + (phys >> 14)) & 0xff); // EEPROM: korumalı, yazma yok sayılır
        else if (bank >= 32 && bank < 40) expect(got).toBe((bank * 3 + off) & 0xff); // RAM
        else expect(got).toBe(0xff); // boş
      }
    }
    expect(m.flash.writeCycles).toBe(0);
  });

  it("G/Ç alanı her zaman 0xFF00'da (BANK3 ne olursa olsun)", () => {
    const m = new Machine();
    m.write8(IO.BANK3, 5);
    m.write8(IO.TIMER_RELOAD, 0x34);
    expect(m.read8(IO.TIMER_RELOAD)).toBe(0x34);
    expect(m.physAddr(0xfeff)).toBe(5 * 0x4000 + 0x3eff);
  });

  it("CPU programı bank değiştirip 128 KB RAM'in hepsine yazar ve okur", () => {
    // ROM'dan çalışır; pencere 2'yi bank 32..39'a çevirir, her kelimeye bank+adres yazar, sonra doğrular.
    const { m } = boot(`
        .org 0
        B    main
        B    main
        B    main
main:   LI   r5, 0xFF12          ; BANK2
        LI   r4, 32
wbank:  SB   r4, [r5]
        LI   r1, 0x8000
        LI   r2, 8192
wloop:  ADD  r0, r1, r4
        SW   r0, [r1]
        ADDI r1, r1, 2
        ADDI r2, r2, -1
        BNE  wloop
        ADDI r4, r4, 1
        CMPI r4, 40
        BNE  wbank
        LI   r4, 32
rbank:  SB   r4, [r5]
        LI   r1, 0x8000
        LI   r2, 8192
rloop:  LW   r0, [r1]
        ADD  r3, r1, r4
        CMP  r0, r3
        BNE  bad
        ADDI r1, r1, 2
        ADDI r2, r2, -1
        BNE  rloop
        ADDI r4, r4, 1
        CMPI r4, 40
        BNE  rbank
        LI   r0, 0x600D
        HALT
bad:    LI   r0, 0xBAD
        HALT
`);
    runToHalt(m, 50_000_000);
    expect(m.cpu.regs[0]).toBe(0x600d);
    // Fiziksel RAM'de doğru yerde mi: bank 37, ofset 0x123·2
    const phys = 37 * 0x4000 + 0x246 - RAM_BASE;
    expect(m.ram[phys] | (m.ram[phys + 1] << 8)).toBe((0x8246 + 37) & 0xffff);
  });
});

describe("28C256 EEPROM", () => {
  const US = 1000; // ns
  const bytes = (e: At28c256, a: number, n: number, t: number) => Array.from({ length: n }, (_, i) => e.peek(a + i, t));

  it("korumasız: bayt yazma, 150 µs yükleme penceresi, 10 ms yazma döngüsü; D7 yoklaması, D6 toggle", () => {
    const e = new At28c256();
    e.write(0x1234, 0x5a, 0);
    expect(e.busy(10 * US)).toBe(true);
    // yazma sürerken: D7 = yazılan D7'nin tersi, D6 her okumada değişir, gerisi son yazılan bayt
    e.readCycle(20 * US);
    expect(e.output(0x1234)).toBe(0x80 | 0x40 | 0x1a);
    expect(e.output(0x0000)).toBe(0x80 | 0x40 | 0x1a); // bütün çip meşgul
    e.readCycle(30 * US);
    expect(e.output(0x1234)).toBe(0x80 | 0x1a);
    // yükleme penceresi kapandı (150 µs): yazma döngüsünde gelen yazmalar yok sayılır
    e.write(0x1235, 0x11, 200 * US);
    expect(e.busy(TBLC_NS + TWC_NS - 1)).toBe(true);
    expect(e.busy(TBLC_NS + TWC_NS)).toBe(false);
    expect(bytes(e, 0x1234, 2, TBLC_NS + TWC_NS)).toEqual([0x5a, 0xff]);
    expect([e.writeCycles, e.bytesWritten]).toEqual([1, 1]);
    // silme gerekmez: 0 → 1 de yazılır
    e.write(0x1234, 0xa5, 20_000 * US);
    expect(e.peek(0x1234, 40_000 * US)).toBe(0xa5);
  });

  it("sayfa yazma: aynı 64 baytlık sayfaya ≤ 150 µs arayla gelen baytlar tek döngüde, yüklenmeyenler korunur", () => {
    const e = new At28c256();
    e.data.fill(0x33, 0x100, 0x140);
    for (let i = 0; i < 16; i++) e.write(0x110 + i, i, i * 100 * US); // 100 µs arayla: hep aynı pencere
    expect(e.busy(1600 * US)).toBe(true);
    const done = 1500 * US + TBLC_NS + TWC_NS;
    expect(e.busy(done - 1)).toBe(true);
    expect(e.busy(done)).toBe(false);
    expect(bytes(e, 0x10e, 20, done)).toEqual([0x33, 0x33, ...Array.from({ length: 16 }, (_, i) => i), 0x33, 0x33]);
    expect([e.writeCycles, e.bytesWritten]).toEqual([1, 16]);
    // 150 µs'yi aşan aralık: ikinci bayt yeni bir yazma döngüsünün başına denk gelir ve yok sayılır
    e.write(0x200, 1, done);
    e.write(0x201, 2, done + TBLC_NS + 1);
    expect(bytes(e, 0x200, 2, done + 30_000 * US)).toEqual([1, 0xff]);
  });

  it("yazılım koruması (SDP): AA 55 A0 açar, korumalıyken komutsuz yazmalar yok sayılır, AA 55 80 AA 55 20 kapatır", () => {
    const e = new At28c256();
    expect(e.sdp).toBe(false); // fabrikadan korumasız
    let t = 0;
    const w = (a: number, v: number) => e.write(a, v, (t += 10 * US));
    w(0x5555, 0xaa);
    w(0x2aaa, 0x55);
    w(0x5555, 0xa0);
    w(0x0100, 0x42);
    expect(e.sdp).toBe(true);
    t += 20_000 * US;
    expect(bytes(e, 0x100, 1, t)).toEqual([0x42]);
    expect([e.peek(0x5555, t), e.peek(0x2aaa, t)]).toEqual([0xff, 0xff]); // komut baytları veri değil
    w(0x0100, 0x00); // başıboş yazma
    expect(e.busy(t)).toBe(false);
    expect(e.peek(0x100, (t += 20_000 * US))).toBe(0x42);
    // korumalı sayfa yazması
    w(0x5555, 0xaa);
    w(0x2aaa, 0x55);
    w(0x5555, 0xa0);
    w(0x0101, 0x43);
    w(0x0102, 0x44);
    t += 20_000 * US;
    expect(bytes(e, 0x100, 3, t)).toEqual([0x42, 0x43, 0x44]);
    // korumayı kapat: 6 baytlık dizi, ardından bir yazma döngüsü
    for (const [a, v] of [[0x5555, 0xaa], [0x2aaa, 0x55], [0x5555, 0x80], [0x5555, 0xaa], [0x2aaa, 0x55], [0x5555, 0x20]]) w(a, v);
    expect(e.sdp).toBe(false);
    expect(e.busy(t)).toBe(true);
    t += 20_000 * US;
    w(0x0100, 0x99);
    expect(e.peek(0x100, (t += 20_000 * US))).toBe(0x99);
    expect([e.peek(0x5555, t), e.peek(0x2aaa, t)]).toEqual([0xff, 0xff]);
    // programlayıcıyla yükleme korumayı açık bırakır
    e.load(new Uint8Array([1, 2, 3]));
    expect(e.sdp).toBe(true);
  });

  it("CPU'dan korumalı sayfa yazması ve D7 yoklaması (program RAM'de, önbellek kapalı); zaman CPU döngüsüyle", () => {
    // Yazma döngüsünde EEPROM'dan komut okunamaz: program RAM'de (pencere 3) çalışır.
    const asm = assembleOrThrow(`
        .org 0xC000
        LI   r5, 0xFF11
        LI   r0, 1
        SB   r0, [r5]           ; BANK1 = EEPROM bank 1 → 0x5555 = EEPROM 0x5555
        LI   r1, 0x5555
        LI   r2, 0x2AAA         ; pencere 0 = bank 0
        LI   r0, 0xAA
        SB   r0, [r1]
        LI   r0, 0x55
        SB   r0, [r2]
        LI   r0, 0xA0
        SB   r0, [r1]
        LI   r3, 0x4010         ; EEPROM 0x4010 (bank 1)
        LI   r0, 0x3C
        SB   r0, [r3]
        LI   r0, 0xC4
        SB   r0, [r3+1]
        LI   r4, 0
poll:   ADDI r4, r4, 1
        LBU  r0, [r3+1]         ; D7 = 1 olunca bitti
        LI   r1, 0x80
        AND  r0, r0, r1
        BEQ  poll
        LBU  r1, [r3]
        LBU  r2, [r3+1]
        HALT
`);
    const m = new Machine();
    m.flash.load(new Uint8Array(0)); // programlayıcıdan çıkmış: korumalı
    m.cache.enabled = false;
    m.pokeCpu(0xc000, asm.image.subarray(0xc000, 0xc100));
    m.cpu.pc = 0xc000;
    const t0 = m.cycles;
    runToHalt(m);
    expect([m.cpu.regs[1], m.cpu.regs[2]]).toEqual([0x3c, 0xc4]);
    expect(Array.from(m.flash.data.subarray(0x4010, 0x4012))).toEqual([0x3c, 0xc4]);
    expect(m.cpu.regs[4]).toBeGreaterThan(100); // yoklama turları
    expect((m.cycles - t0) * CYCLE_NS).toBeGreaterThan(TBLC_NS + TWC_NS);
    expect([m.flash.writeCycles, m.flash.bytesWritten]).toEqual([1, 2]);
  });

  it("toggle biti her veriyolu okumasında değişir: önbellek isabeti de EEPROM'a okuma döngüsü yaptırır", () => {
    const m = new Machine();
    m.flash.load(new Uint8Array(0x8000).fill(0x11));
    m.flash.sdp = false;
    m.write8(0x0010, 0x22); // pencere 0 = bank 0: korumasız yazma
    const d6 = () => (m.read8(0x0010) >> 6) & 1;
    m.idle(1);
    const a = d6(); // ıskalama: satır durum baytıyla dolar (toggle 1)
    const b = d6(); // isabet: CPU önbellekteki baytı görür, ama çip yine okunur (toggle 0)
    expect(m.cache.hits).toBe(1);
    m.cache.enabled = false;
    const c = d6(); // önbelleksiz: çip okunur (toggle 1); isabet sayılmasaydı 0 olurdu
    expect([a, b, c]).toEqual([1, 1, 1]);
    expect(d6()).toBe(0);
    m.idle(Math.ceil((TBLC_NS + TWC_NS) / CYCLE_NS));
    m.cache.invalidateAll();
    expect(m.read8(0x0010)).toBe(0x22);
  });
});

describe("kendin yap bellek (FF40–FF4F)", () => {
  it("16 bayt: bayt ve kelime yazılır, geri okunur; reset silmez", () => {
    const m = new Machine();
    for (let i = 0; i < KYB_SIZE; i++) m.write8(IO.KYB + i, 0xa0 + i);
    expect(Array.from({ length: KYB_SIZE }, (_, i) => m.read8(IO.KYB + i))).toEqual(Array.from({ length: KYB_SIZE }, (_, i) => 0xa0 + i));
    m.write8(IO.KYB + 6, 0x34);
    m.write8(IO.KYB + 7, 0x12);
    expect(m.read8(IO.KYB + 6) | (m.read8(IO.KYB + 7) << 8)).toBe(0x1234);
    m.reset();
    expect(m.kyb[6]).toBe(0x34);
    expect(m.read8(IO.KYB + KYB_SIZE)).toBe(0xff); // kartın dışı
  });
});

describe("UART", () => {
  it("TX: bayt ana makineye gider, TX_EMPTY bir bayt süresi 0 olur", () => {
    const m = new Machine();
    const got: number[] = [];
    m.uartOnOutput = (b) => got.push(b);
    expect(m.read8(IO.UART_STAT) & 2).toBe(2);
    m.write8(IO.UART_DATA, 0x41);
    expect(got).toEqual([0x41]);
    expect(m.uartOutput).toBe("A");
    expect(m.read8(IO.UART_STAT) & 2).toBe(0);
    m.cycles += UART_BYTE_CYCLES;
    expect(m.read8(IO.UART_STAT) & 2).toBe(2);
  });

  it("RX: baytlar baud hızında gelir, okumak RX_READY'yi siler, akış kontrolü kayıp önler", () => {
    const { m } = boot(`
        .org 0
        B    main
        B    main
        B    main
main:   LI   r5, 0xFF00
        LI   r4, 0x4000
        LI   r2, 5
wait:   LBU  r0, [r5+1]
        SHR  r0, r0
        BCC  wait
        LBU  r0, [r5]
        SB   r0, [r4]
        ADDI r4, r4, 1
        ADDI r2, r2, -1
        BNE  wait
        HALT
`);
    m.uartSend("Merha");
    const start = m.cycles;
    runToHalt(m);
    expect(Array.from(m.ram.subarray(0, 5), (b) => String.fromCharCode(b)).join("")).toBe("Merha");
    expect(m.cycles - start).toBeGreaterThanOrEqual(4 * UART_BYTE_CYCLES);
    expect(m.read8(IO.UART_STAT) & 1).toBe(0);
  });
});

describe("PS/2 klavye", () => {
  it("set 2 basma/bırakma kodları (F0, E0 önekleri)", () => {
    expect(makeCodes("KeyA")).toEqual([0x1c]);
    expect(breakCodes("KeyA")).toEqual([0xf0, 0x1c]);
    expect(makeCodes("Enter")).toEqual([0x5a]);
    expect(makeCodes("ArrowUp")).toEqual([0xe0, 0x75]);
    expect(breakCodes("ArrowUp")).toEqual([0xe0, 0xf0, 0x75]);
    expect(makeCodes("ShiftLeft")).toEqual([0x12]);
    expect(textToScancodes("aB")).toEqual([0x1c, 0xf0, 0x1c, 0x12, 0x32, 0xf0, 0x32, 0xf0, 0x12]);
  });

  it("kaydırma register'ı: READY, okuyunca silinir, sonraki bayt bir bayt süresi sonra", () => {
    const m = new Machine();
    m.cpu.halted = true; // boş EEPROM: CPU uyusun, zaman aksın
    m.keyDown("KeyQ");
    m.keyUp("KeyQ");
    m.run(10);
    expect(m.read8(IO.KBD_STAT)).toBe(1);
    expect(m.read8(IO.KBD_DATA)).toBe(0x15);
    expect(m.read8(IO.KBD_STAT)).toBe(0);
    m.run(KBD_BYTE_CYCLES - 100);
    expect(m.read8(IO.KBD_STAT)).toBe(0);
    m.run(200);
    expect(m.read8(IO.KBD_DATA)).toBe(0xf0);
    m.run(KBD_BYTE_CYCLES + 10);
    expect(m.read8(IO.KBD_DATA)).toBe(0x15);
  });
});

describe("zamanlayıcı ve kesme denetleyicisi", () => {
  it("1 kHz tıkla aşağı sayar, 0'da yeniden yükler ve EXPIRED kurar (1 yazınca silinir)", () => {
    const m = new Machine();
    m.write8(IO.TIMER_RELOAD, 3);
    m.write8(IO.TIMER_RELOAD + 1, 0);
    m.write8(IO.TIMER_CTRL, 1);
    m.cpu.halted = true; // CPU uyusun, zaman aksın
    m.run(TICK_CYCLES * 2 + 10);
    expect(m.read8(IO.TIMER_STAT)).toBe(0);
    m.run(TICK_CYCLES);
    expect(m.read8(IO.TIMER_STAT)).toBe(1);
    expect(m.read8(IO.IRQ_PEND) & 1).toBe(0); // IRQ_EN kapalı
    m.write8(IO.TIMER_STAT, 1);
    expect(m.read8(IO.TIMER_STAT)).toBe(0);
    m.run(TICK_CYCLES * 3);
    expect(m.read8(IO.TIMER_STAT)).toBe(1); // yeniden yüklendi, 3 tık sonra yine
  });

  it("IRQ_PEND, IRQ_MASK, IRQ_SRC (öncelik kodlayıcı: büyük numara öncelikli), IRQ hattı = OR(bekleyen & maske)", () => {
    const m = new Machine();
    expect(m.read8(IO.IRQ_SRC)).toBe(0xff);
    m.write8(IO.TIMER_RELOAD, 1);
    m.write8(IO.TIMER_CTRL, 3);
    m.keyPress([0x1c]);
    m.uartSend("x");
    m.cpu.halted = true;
    m.run(TICK_CYCLES + 10);
    expect(m.read8(IO.IRQ_PEND)).toBe(0b0111);
    expect(m.read8(IO.IRQ_SRC)).toBe(0xff); // maske kapalı
    expect(m.cpu.irq).toBe(false);
    m.write8(IO.IRQ_MASK, 0b0011);
    expect(m.cpu.irq).toBe(true);
    expect(m.read8(IO.IRQ_SRC)).toBe(1); // klavye > zamanlayıcı
    m.write8(IO.IRQ_MASK, 0b1111);
    expect(m.read8(IO.IRQ_SRC)).toBe(2); // UART > klavye
    m.read8(IO.UART_DATA);
    expect(m.read8(IO.IRQ_SRC)).toBe(1);
    m.read8(IO.KBD_DATA);
    expect(m.read8(IO.IRQ_SRC)).toBe(0);
    m.write8(IO.TIMER_STAT, 1);
    expect(m.read8(IO.IRQ_SRC)).toBe(0xff);
    expect(m.cpu.irq).toBe(false);
  });

  it("CPU zamanlayıcı kesmesini alır: HALT'tan uyanır, işleyici sayar", () => {
    const { m } = boot(`
        .org 0
        B    main
        B    isr
        B    main
main:   LI   sp, 0xFF00
        LI   r5, 0xFF00
        LI   r0, 0
        LI   r4, 0x4000
        SW   r0, [r4]
        LI   r0, 2
        SB   r0, [r5+4]          ; RELOAD = 2 ms
        LI   r0, 0
        SB   r0, [r5+5]
        LI   r0, 3
        SB   r0, [r5+6]          ; EN | IRQ_EN
        LI   r0, 1
        SB   r0, [r5+9]          ; maske: zamanlayıcı
        EI
idle:   HALT
        B    idle
isr:    PUSH r0
        LI   r0, 1
        SB   r0, [r5+7]          ; EXPIRED'ı sil (onay)
        LW   r0, [r4]
        ADDI r0, r0, 1
        SW   r0, [r4]
        POP  r0
        RETI
`);
    m.run(TICK_CYCLES * 20 + 1000);
    expect(m.ram[0]).toBe(10); // 20 ms / 2 ms
    expect(m.cpu.regs[6]).toBe(0xff00);
  });

  it("dikey tarama: VSTAT bit0 vblank, bit1 bayrak (60 Hz, 1 yazınca silinir), IRQ kaynağı 3", () => {
    const m = new Machine();
    m.cpu.halted = true;
    m.write8(IO.IRQ_MASK, 8);
    m.run(VBLANK_START - 100);
    expect(m.read8(IO.VSTAT)).toBe(0);
    m.run(200);
    expect(m.read8(IO.VSTAT)).toBe(3);
    expect(m.read8(IO.IRQ_SRC)).toBe(3);
    m.write8(IO.VSTAT, 2);
    expect(m.read8(IO.VSTAT)).toBe(1);
    m.run(FRAME_CYCLES - VBLANK_START);
    expect(m.read8(IO.VSTAT) & 1).toBe(0);
    m.run(VBLANK_START);
    expect(m.read8(IO.VSTAT)).toBe(3);
    expect(m.video.frames).toBe(2);
  });
});

describe("VGA metin kartı", () => {
  it("VADDR (16 bit, SW ile) + VDATA otomatik artırma, okuma da artırır", () => {
    const { m } = boot(`
        .org 0
        B    main
        B    main
        B    main
main:   LI   r5, 0xFF20
        LI   r0, 162             ; satır 1, sütun 1
        SW   r0, [r5]
        LI   r0, 'H'
        SB   r0, [r5+2]
        LI   r0, 0x1F
        SB   r0, [r5+2]
        LI   r0, 'i'
        SB   r0, [r5+2]
        LI   r0, 0x1F
        SB   r0, [r5+2]
        LI   r0, 162
        SW   r0, [r5]
        LBU  r1, [r5+2]
        LBU  r2, [r5+2]
        LBU  r3, [r5+2]
        HALT
`);
    runToHalt(m);
    expect(m.renderText().split("\n")[1]).toBe(" Hi");
    expect(m.video.vram[163]).toBe(0x1f);
    expect([m.cpu.regs[1], m.cpu.regs[2], m.cpu.regs[3]]).toEqual([0x48, 0x1f, 0x69]);
    expect(m.video.vaddr).toBe(165);
    expect(m.read8(IO.VADDR)).toBe(0xff); // sadece yazılır
  });

  it("imleç register'ları ve yanıp sönme", () => {
    const m = new Machine();
    m.write8(IO.CURSOR_X, 5);
    m.write8(IO.CURSOR_Y, 7);
    m.write8(IO.VCTRL, 1);
    expect([m.read8(IO.CURSOR_X), m.read8(IO.CURSOR_Y), m.read8(IO.VCTRL)]).toEqual([5, 7, 1]);
    expect(m.video.cursorVisible).toBe(true);
    m.video.frames = 16;
    expect(m.video.cursorVisible).toBe(false);
  });

  it("karakter ROM'u: 256 × 16 bayt, ASCII + CP857 (Türkçe) + çerçeve", () => {
    expect(FONT_8X16.length).toBe(4096);
    const glyph = (c: number) => Array.from(FONT_8X16.subarray(c * 16, c * 16 + 16));
    expect(glyph(0x20).every((b) => b === 0)).toBe(true);
    for (let c = 0x21; c < 0x7f; c++) expect(glyph(c).some((b) => b !== 0)).toBe(true);
    expect(glyph(0xdb).every((b) => b === 0xff)).toBe(true); // █
    expect(glyph(0xb3).every((b) => b === 0x10)).toBe(true); // │ sütun 3
    expect(charToText(0x41)).toBe("A");
    expect(charToText(0x8d)).toBe("ı");
    expect(charToText(0x9e)).toBe("Ş");
    expect(textToChar("ğ")).toBe(0xa7);
    expect(textToChar("╔")).toBe(0xc9);
  });
});

describe("önbellek ve bekleme durumları", () => {
  // RAM'deki küçük döngü: 4 komut × 100 tur. İlk turda ıskalar, sonra isabet.
  const loop = `
        .org 0x4000
        LI   r1, 100
again:  ADDI r1, r1, -1
        NOP
        BNE  again
        HALT
`;
  const load = (enabled: boolean) => {
    const asm = assembleOrThrow(loop);
    const m = new Machine();
    m.pokeCpu(0x4000, asm.image.subarray(0x4000, 0x4010));
    m.cache.enabled = enabled;
    m.cpu.pc = 0x4000;
    return m;
  };

  it("isabet / ıskalama sayaçları G/Ç'den okunur, yazınca sıfırlanır", () => {
    const m = load(true);
    runToHalt(m);
    // Getirmeler: LI 1 + 100 × (ADDI, NOP, BNE) + HALT = 302; ıskalama = farklı kelime sayısı (5)
    const hits = m.read8(IO.CACHE_HITS) | (m.read8(IO.CACHE_HITS + 1) << 8);
    const misses = m.read8(IO.CACHE_MISSES) | (m.read8(IO.CACHE_MISSES + 1) << 8);
    expect(misses).toBe(5);
    expect(hits).toBe(302 - 5);
    m.write8(IO.CACHE_HITS, 0);
    expect(m.read8(IO.CACHE_HITS)).toBe(0);
    expect(m.read8(IO.CACHE_MISSES)).toBe(0);
    expect(m.read8(IO.CACHE_CTRL)).toBe(1);
  });

  it("döngü sayısı = CPI tablosu + bekleme: ıskalama 2, isabet 0, önbelleksiz her erişim 2", () => {
    const on = load(true);
    runToHalt(on);
    // CPI: LI 5, ADDI 5, NOP 3, BNE 5 (alınan) / 3 (son tur), HALT 3
    const base = 5 + 100 * (5 + 3) + 99 * 5 + 3 + 3;
    expect(on.cycles).toBe(base + 5 * MEM_WAIT);
    const off = load(false);
    runToHalt(off);
    expect(off.cycles).toBe(base + 302 * MEM_WAIT);
    expect(off.cache.totalHits + off.cache.totalMisses).toBe(0);
  });

  it("kelime erişimi tek veriyolu döngüsü; yazma write-through (her zaman bekleme)", () => {
    const asm = assembleOrThrow(`
        .org 0x4000
        LI   r1, 0x5000
        SW   r1, [r1]
        LW   r2, [r1]
        LBU  r3, [r1+1]
        HALT
`);
    const m = new Machine();
    m.pokeCpu(0x4000, asm.image.subarray(0x4000, 0x4010));
    m.cpu.pc = 0x4000;
    runToHalt(m);
    expect(m.cpu.regs[2]).toBe(0x5000);
    expect(m.cpu.regs[3]).toBe(0x50);
    // getirme: 6 kelime → 5 ıskalama (LI iki kelime: LI+LUI ayrı satır) ; SW: yazma (2), satır yok → LW ıskalar, LBU isabet
    expect(m.cache.totalMisses).toBe(6 + 1);
    expect(m.cache.totalHits).toBe(1);
    expect(m.waitCycles).toBe((6 + 1) * MEM_WAIT + MEM_WAIT);
  });

  it("EEPROM bölgesine yazma satırı geçersiz kılar; RAM'e yazma günceller", () => {
    const c = new Cache();
    c.fill(0x00100, 0x1234);
    c.fill(0x80100, 0xabcd);
    c.snoopWrite(0x80101, 0x99, true);
    expect(c.probe(0x80100)).toBe(0x99cd);
    c.fill(0x00100, 0x1234);
    c.snoopWrite(0x00100, 0xaa, false);
    expect(c.probe(0x00100)).toBe(-1);
    // Aynı indeksli farklı etiket: doğrudan eşlemede biri diğerini çıkarır
    c.fill(0x00100, 1);
    c.fill(0x00900, 2);
    expect(c.probe(0x00100)).toBe(-1);
    expect(c.probe(0x00900)).toBe(2);
  });
});
