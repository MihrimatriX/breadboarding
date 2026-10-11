import { describe, expect, it } from "vitest";
import { assembleOrThrow } from "../asm/assembler.ts";
import { Cache } from "../emu/devices/cache.ts";
import { SST39SF010_DEVICE_ID, SST_MANUFACTURER_ID } from "../emu/devices/flash.ts";
import { breakCodes, makeCodes, textToScancodes } from "../emu/devices/keyboard.ts";
import {
  FRAME_CYCLES, IO, KBD_BYTE_CYCLES, MEM_WAIT, Machine, RAM_BASE, TICK_CYCLES, UART_BYTE_CYCLES, VBLANK_START,
} from "../emu/machine.ts";
import { FONT_8X16, charToText, textToChar } from "../video/font.ts";

/** Kaynağı 0x0000'a derleyip Flash'a (ROM bank 0) yazar, reset'ler. */
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

  it("1 MB fiziksel alan: Flash 0x00000–0x1FFFF, boş alan 0xFF, RAM 0x80000–0xFFFFF", () => {
    const m = new Machine();
    m.cache.enabled = false;
    m.loadFlash(Uint8Array.from({ length: 0x20000 }, (_, i) => (i * 7 + (i >> 14)) & 0xff));
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
        if (bank < 8) expect(got).toBe((phys * 7 + (phys >> 14)) & 0xff); // Flash: yazma içerik değiştirmez
        else if (bank < 32) expect(got).toBe(0xff); // boş
        else expect(got).toBe((bank * 3 + off) & 0xff); // RAM
      }
    }
    expect(m.flash.programs).toBe(0);
  });

  it("G/Ç alanı her zaman 0xFF00'da (BANK3 ne olursa olsun)", () => {
    const m = new Machine();
    m.write8(IO.BANK3, 5);
    m.write8(IO.TIMER_RELOAD, 0x34);
    expect(m.read8(IO.TIMER_RELOAD)).toBe(0x34);
    expect(m.physAddr(0xfeff)).toBe(5 * 0x4000 + 0x3eff);
  });

  it("CPU programı bank değiştirip 512 KB RAM'in hepsine yazar ve okur", () => {
    // ROM'dan çalışır; pencere 2'yi bank 32..63'e çevirir, her kelimeye bank+adres yazar, sonra doğrular.
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
        CMPI r4, 64
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
        CMPI r4, 64
        BNE  rbank
        LI   r0, 0x600D
        HALT
bad:    LI   r0, 0xBAD
        HALT
`);
    runToHalt(m, 50_000_000);
    expect(m.cpu.regs[0]).toBe(0x600d);
    // Fiziksel RAM'de doğru yerde mi: bank 50, ofset 0x123·2
    const phys = 50 * 0x4000 + 0x246 - RAM_BASE;
    expect(m.ram[phys] | (m.ram[phys + 1] << 8)).toBe((0x8246 + 50) & 0xffff);
  });
});

describe("SST39SF010 Flash", () => {
  const unlock = (m: Machine, cmd: number) => {
    m.flash.write(0x5555, 0xaa);
    m.flash.write(0x2aaa, 0x55);
    m.flash.write(0x5555, cmd);
  };

  it("normal yazma içeriği değiştirmez; bayt programlama sadece 1→0 yapar", () => {
    const m = new Machine();
    m.flash.write(0x1234, 0x00);
    expect(m.flash.read(0x1234)).toBe(0xff);
    unlock(m, 0xa0);
    m.flash.write(0x1234, 0x5a);
    expect(m.flash.read(0x1234)).toBe(0x5a);
    unlock(m, 0xa0);
    m.flash.write(0x1234, 0xf0); // 0 olan bitler 1 olamaz
    expect(m.flash.read(0x1234)).toBe(0x50);
    expect(m.flash.programs).toBe(2);
  });

  it("4 KB sektör silme ve tüm çipi silme", () => {
    const m = new Machine();
    m.flash.data.fill(0x00);
    unlock(m, 0x80);
    m.flash.write(0x5555, 0xaa);
    m.flash.write(0x2aaa, 0x55);
    m.flash.write(0x13456, 0x30); // sektör 0x13000–0x13FFF
    expect(m.flash.read(0x12fff)).toBe(0x00);
    expect(m.flash.read(0x13000)).toBe(0xff);
    expect(m.flash.read(0x13fff)).toBe(0xff);
    expect(m.flash.read(0x14000)).toBe(0x00);
    unlock(m, 0x80);
    m.flash.write(0x5555, 0xaa);
    m.flash.write(0x2aaa, 0x55);
    m.flash.write(0x5555, 0x10);
    expect(m.flash.data.every((b) => b === 0xff)).toBe(true);
    expect([m.flash.sectorErases, m.flash.chipErases]).toEqual([1, 1]);
  });

  it("yazılımla kimlik modu: BF / B5, F0 ile çıkış (tek ve üç döngülü)", () => {
    const m = new Machine();
    m.flash.data[0] = 0x12;
    unlock(m, 0x90);
    expect([m.flash.read(0), m.flash.read(1)]).toEqual([SST_MANUFACTURER_ID, SST39SF010_DEVICE_ID]);
    expect([SST_MANUFACTURER_ID, SST39SF010_DEVICE_ID]).toEqual([0xbf, 0xb5]);
    m.flash.write(0x0000, 0xf0);
    expect(m.flash.read(0)).toBe(0x12);
    unlock(m, 0x90);
    unlock(m, 0xf0);
    expect(m.flash.read(0)).toBe(0x12);
  });

  it("komut adresleri A14..A0 ile çözülür; yanlış dizi oku moduna döner", () => {
    const m = new Machine();
    m.flash.write(0x15555, 0xaa); // A16 = 1: yine 5555h
    m.flash.write(0x0aaaa, 0x55);
    m.flash.write(0x1d555, 0xa0);
    m.flash.write(0x00042, 0x42);
    expect(m.flash.read(0x42)).toBe(0x42);
    m.flash.write(0x5555, 0xaa);
    m.flash.write(0x2aab, 0x55); // yanlış adres
    m.flash.write(0x5555, 0xa0);
    m.flash.write(0x00043, 0x00);
    expect(m.flash.read(0x43)).toBe(0xff);
  });

  it("CPU'dan komut dizisi: 5555h pencere 1 + bank 1, 2AAAh pencere 0 üzerinden", () => {
    // Program RAM'de çalışmalı (Flash komut modundayken Flash'tan okunamaz): ROM'daki
    // yükleyici kodu RAM'e kopyalamak yerine test kodu doğrudan RAM'e yazar.
    const asm = assembleOrThrow(`
        .org 0xC000
        LI   r5, 0xFF11
        LI   r0, 1
        SB   r0, [r5]           ; BANK1 = Flash bank 1 → 0x5555 = Flash 0x5555
        LI   r0, 7
        SB   r0, [r5+1]         ; BANK2 = Flash bank 7
        LI   r1, 0x5555
        LI   r2, 0x2AAA
        LI   r0, 0xAA
        SB   r0, [r1]
        LI   r0, 0x55
        SB   r0, [r2]
        LI   r0, 0xA0
        SB   r0, [r1]
        LI   r3, 0x8010
        LI   r0, 0x3C
        SB   r0, [r3]           ; Flash 7·0x4000 + 0x10 = 0x1C010
        LI   r0, 0xAA
        SB   r0, [r1]
        LI   r0, 0x55
        SB   r0, [r2]
        LI   r0, 0x90
        SB   r0, [r1]
        LI   r3, 0
        LBU  r4, [r3]           ; ID modu: üretici
        LI   r0, 0xF0
        SB   r0, [r3]
        HALT
`);
    const m = new Machine();
    m.cache.enabled = false;
    m.pokeCpu(0xc000, asm.image.subarray(0xc000, 0xc100));
    m.cpu.pc = 0xc000;
    runToHalt(m);
    expect(m.flash.read(0x1c010)).toBe(0x3c);
    expect(m.cpu.regs[4]).toBe(0xbf);
    expect(m.flash.idMode).toBe(false);
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
    m.cpu.halted = true; // boş Flash: CPU uyusun, zaman aksın
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

  it("IRQ_PEND, IRQ_MASK, IRQ_SRC (74HC148: büyük numara öncelikli), IRQ hattı = OR(bekleyen & maske)", () => {
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

  it("Flash bölgesine yazma satırı geçersiz kılar; RAM'e yazma günceller", () => {
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
