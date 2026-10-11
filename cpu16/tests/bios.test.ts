import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { assembleOrThrow } from "../asm/assembler.ts";
import { BIOS, buildBios } from "../bios/build.ts";
import { MachineLink } from "../bios/simlink.ts";
import { programHex, uploadHex } from "../bios/uploader.ts";
import { f, OP } from "../emu/isa.ts";
import { CPU_HZ, IO, Machine } from "../emu/machine.ts";

const read = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8");
const bios = buildBios(read("../bios/bios.s"));
const example = (name: string) => assembleOrThrow(read(`../bios/ornekler/${name}.s`));

function bootBios() {
  const m = new Machine();
  m.loadFlash(bios.flash);
  m.reset();
  expect(m.runUntil(() => m.uartOutput.endsWith("> "), 2_000_000)).toBe(true);
  return m;
}

/** Komutu UART'tan (ya da klavyeden) gönderir, yeni "> " istemine kadar çalıştırır, çıktıyı döndürür. */
function command(m: Machine, line: string, via: "uart" | "kbd" = "uart", maxCycles = 4_000_000): string {
  const before = m.uartOutput.length;
  if (via === "uart") m.uartSend(line + "\r");
  else m.typeText(line + "\n");
  const ok = m.runUntil(() => m.uartOutput.length > before + line.length && m.uartOutput.endsWith("> "), maxCycles);
  expect(ok, `komut bitmedi: ${line}`).toBe(true);
  return m.uartOutput.slice(before);
}

function linkFor(m: Machine) {
  const link = new MachineLink(m, true);
  m.uartOnOutput = (b) => link.push(b);
  return link;
}

describe("BIOS imajı", () => {
  it("bank 0'a sığar; vektörler B; atlama tablosu belgedeki adreslerde", () => {
    expect(bios.size).toBeLessThan(0x4000);
    expect(bios.flash.length).toBe(0x20000);
    expect(bios.flash[0x4000]).toBe(0xff);
    for (const v of [0, 2, 4]) expect(f.op(bios.bank0[v] | (bios.bank0[v + 1] << 8))).toBe(OP.BCC);
    const routines: Record<keyof typeof BIOS, string> = {
      MONITOR: "monitor", PUTC: "putc", GETC: "getc", TRYGETC: "trygetc", PUTS: "puts", PUTHEX4: "puthex4",
      PUTHEX2: "puthex2", GETLINE: "getline", NEWLINE: "newline", CLS: "cls", SETCURSOR: "setcursor",
      SETATTR: "setattr", TICKS: "ticks", UART_PUTC: "uart_putc", UART_GETC: "uart_getc", VGA_PUTC: "vga_putc",
      SETIRQHOOK: "setirqhook",
    };
    for (const [name, label] of Object.entries(routines)) {
      const at = BIOS[name as keyof typeof BIOS];
      const w = (a: number) => bios.bank0[a] | (bios.bank0[a + 1] << 8);
      // LI r3, lo · LUI r3, hi · JALR r3, r3, 0
      const target = (w(at) & 0xff) | ((w(at + 2) & 0xff) << 8);
      expect(target, name).toBe(bios.asm.symbols.get(label));
      expect(f.op(w(at + 4)), name).toBe(OP.JALR);
    }
  });
});

describe("açılış", () => {
  it("afiş VGA metin belleğinde ve UART'ta; imleç, zamanlayıcı ve klavye kesmeleri açık", () => {
    const m = bootBios();
    const screen = m.renderText().split("\n");
    expect(screen[0]).toContain("CPU16 BIOS v1");
    expect(m.video.vram[0 + 1]).toBe(0x1f); // başlık çubuğu: beyaz/mavi
    expect(m.video.vram[79 * 2 + 1]).toBe(0x1f);
    expect(screen[2]).toContain("512 KB RAM");
    expect(screen[4]).toBe(">");
    expect(m.uartOutput.startsWith(" CPU16 BIOS v1")).toBe(true);
    expect(m.uartOutput).toContain("Komutlar icin ? yazin.\r\n> ");
    expect(m.read8(IO.VCTRL)).toBe(1);
    expect([m.video.cursorX, m.video.cursorY]).toEqual([2, 4]);
    expect(m.irqMask).toBe(0b0011);
    expect(m.cpu.i).toBe(true);
    expect(m.cycles).toBeLessThan(300_000); // < 75 ms
    // 10 ms tık sayacı: 1 saniyede ~100
    const ticks = () => m.peek16(0xf820);
    const t0 = ticks();
    m.run(CPU_HZ);
    expect(ticks() - t0).toBeGreaterThanOrEqual(99);
    expect(ticks() - t0).toBeLessThanOrEqual(101);
  });
});

describe("monitör (UART üzerinden)", () => {
  it("D: bellek dökümü", () => {
    const m = bootBios();
    const out = command(m, "D 0 10");
    const hex = Array.from(bios.bank0.subarray(0, 16), (b) => b.toString(16).toUpperCase().padStart(2, "0")).join(" ");
    expect(out).toContain(`0000: ${hex}  `);
    expect(out).toContain("CPU16 B1");
    // Devam: argümansız D kaldığı yerden
    expect(command(m, "D")).toContain("0010: ");
  });

  it("W ve D: belleğe yaz, geri oku", () => {
    const m = bootBios();
    command(m, "W 4000 41 42 43 0A");
    expect(Array.from(m.ram.subarray(0, 4))).toEqual([0x41, 0x42, 0x43, 0x0a]);
    expect(command(m, "d 4000 4")).toMatch(/4000: 41 42 43 0A .*  ABC\./);
    expect(command(m, "W")).toContain("? Sozdizimi");
  });

  it("G: W ile yazılan programı çağırır, RET ile monitöre döner; SWI kesme noktası", () => {
    const m = bootBios();
    const prog = assembleOrThrow(`
        .org 0x4000
        LI   r0, 'Z'
        LI   r3, ${BIOS.PUTC}
        JALR r3, r3, 0
`);
    const bytes = Array.from(prog.image.subarray(0x4000, 0x4008), (b) => b.toString(16)).join(" ");
    command(m, `W 4000 ${bytes}`);
    expect(command(m, "G 4000")).toMatch(/G 4000\r\nZ\r\n> $/);
    command(m, "W 4100 05 E0"); // SWI
    for (let k = 0; k < 5; k++) expect(command(m, "G 4100")).toContain("SWI @ 4100");
    expect(0xff00 - m.cpu.regs[6]).toBeLessThan(32); // monitör yığını sıfırladı: sızıntı yok
    expect(command(m, "G")).toContain("? Adres yok");
  });

  it("B: bank göster / değiştir, pencere 0 ve 3 korunur", () => {
    const m = bootBios();
    expect(command(m, "B")).toContain("B0=00 B1=20 B2=21 B3=22");
    expect(command(m, "B 2 3F")).toContain("B2=3F");
    expect(m.banks[2]).toBe(0x3f);
    expect(command(m, "B 0 5")).toContain("? B pencere");
    expect(command(m, "B 3 5")).toContain("? B pencere");
    expect(command(m, "B 1 40")).toContain("? B pencere");
    expect(m.banks[0]).toBe(0);
  });

  it("?, C, I ve bilinmeyen komut", () => {
    const m = bootBios();
    expect(command(m, "?")).toContain("Intel HEX yukle: UART -> RAM");
    const c = command(m, "C");
    const hits = parseInt(/isabet ([0-9A-F]{4})/.exec(c)![1], 16);
    expect(hits).toBeGreaterThan(1000);
    expect(c).toContain("denetim 01");
    expect(command(m, "C 0")).toContain("denetim 00");
    expect(m.cache.enabled).toBe(false);
    command(m, "C 1");
    expect(command(m, "I")).toContain("Flash kimligi: BF B5 (SST39SF010)");
    expect(m.flash.idMode).toBe(false);
    expect(m.cache.enabled).toBe(true);
    expect(command(m, "Q")).toContain("Bilinmeyen komut");
  });

  it("T: RAM testi 31 bankın hepsini doğrular", () => {
    const m = bootBios();
    const out = command(m, "T", "uart", 40_000_000);
    expect(out).toContain("RAM testi");
    expect(out).toContain("." .repeat(31) + " Tamam");
    expect(m.banks[2]).toBe(33); // pencere 2 geri yüklendi
  });
});

describe("klavye", () => {
  it("klavyeden yazılan satır ekranda yankılanır ve komut çalışır (Shift, Backspace)", () => {
    const m = bootBios();
    command(m, "W 4000 48 49", "kbd");
    const out = command(m, "Xy\b\bd 4000 2", "kbd");
    expect(out).toContain("4000: 48 49");
    const screen = m.renderText();
    expect(screen).toContain("> W 4000 48 49");
    expect(screen).toMatch(/> d 4000 2\n4000: 48 49/);
    command(m, "?", "kbd"); // '?' Shift ister
    expect(m.renderText()).toContain("Komutlar (sayilar hex):");
  });

  it("Caps Lock ve Ctrl: tarama kodundan ASCII'ye", () => {
    const m = bootBios();
    m.keyDown("CapsLock");
    m.keyUp("CapsLock");
    m.typeText("b");
    m.keyDown("CapsLock");
    m.keyUp("CapsLock");
    expect(command(m, "", "kbd")).toContain("B0=00");
    expect(m.renderText()).toMatch(/> B\nB0=00/); // Caps Lock: 'b' → 'B'
    // Ctrl+H = 0x08: geri silme gibi davranır
    m.typeText("x");
    m.keyDown("ControlLeft");
    m.typeText("h");
    m.keyUp("ControlLeft");
    expect(command(m, "b", "kbd")).toContain("B0=00");
  });
});

describe("önyükleyici (Intel HEX, UART)", () => {
  it("merhaba.s RAM'e yüklenir ve çalışır: çıktı UART'ta ve VGA'da", async () => {
    const m = bootBios();
    const link = linkFor(m);
    const prog = programHex(example("merhaba"));
    const res = await uploadHex(link, prog.hex, { mode: "ram", run: true });
    expect(res.ok, res.message).toBe(true);
    expect(res.message).toBe(`Yuklendi: 007F bayt, giris 4000`);
    m.runUntil(() => m.uartOutput.endsWith("0x0037\r\n> "), 2_000_000);
    expect(m.uartOutput).toContain("Merhaba, CPU16! Bu program UART uzerinden yuklendi.\r\n1+2+...+10 = 0x0037");
    expect(m.renderText()).toContain("Merhaba, CPU16! Bu program UART uzerinden yuklendi.");
    // renkli satır: sarı / mavi
    const row = m.renderText().split("\n").findIndex((l) => l.startsWith("Merhaba"));
    expect(m.video.vram[row * 160 + 1]).toBe(0x1e);
  });

  it("sağlama hatası '!' (yeniden gönderilebilir), izinsiz adres 'X', ESC iptal", () => {
    const m = bootBios();
    m.uartSend("L\r");
    m.runUntil(() => m.uartOutput.endsWith("ESC\r\n"), 1_000_000);
    const reply = (rec: string) => {
      const before = m.uartOutput.length;
      m.uartSend(rec + "\r\n");
      m.runUntil(() => /[.!X]/.test(m.uartOutput.slice(before)), 1_000_000);
      return m.uartOutput.slice(before)[0];
    };
    expect(reply(":0240000011220B")).toBe("!"); // sağlama yanlış (doğrusu 0x8B)
    expect(reply(":02400000112288")).toBe("!"); // tek bayt bozuk
    expect(reply(":0240000011228B")).toBe(".");
    expect(Array.from(m.ram.subarray(0, 2))).toEqual([0x11, 0x22]);
    expect(reply(":0101000000FE")).toBe("X"); // 0x0100: ROM
    m.runUntil(() => m.uartOutput.endsWith("> "), 1_000_000);
    expect(m.uartOutput).toContain("Hata: adres izinli degil");
    m.uartSend("L\r");
    m.runUntil(() => m.uartOutput.endsWith("ESC\r\n"), 1_000_000);
    expect(reply(":01F80000AA5D")).toBe("X"); // 0xF800: BIOS alanı
    m.runUntil(() => m.uartOutput.endsWith("> "), 1_000_000);
    m.uartSend("L\r\x1b");
    m.runUntil(() => m.uartOutput.includes("Iptal"), 1_000_000);
  });

  it("Flash'a yazar (SST komut dizisi): bank 1'e yüklenen program pencereye eşlenip çalışır", async () => {
    const m = bootBios();
    const link = linkFor(m);
    const asm = example("merhaba");
    const prog = programHex(asm);
    const res = await uploadHex(link, prog.hex, { mode: "flash" });
    expect(res.ok, res.message).toBe(true);
    expect(Array.from(m.flash.data.subarray(0x4000, 0x4000 + prog.size))).toEqual(Array.from(asm.image.subarray(0x4000, 0x4000 + prog.size)));
    expect(m.flash.sectorErases).toBe(1);
    expect(m.flash.programs).toBe(prog.size);
    expect(m.cache.enabled).toBe(true); // önbellek geri açıldı
    // RAM bank 32 boş (bu testte RAM'e yükleme yok): çalışan kopya Flash bank 1'deki
    expect(m.ram[0]).toBe(0);
    command(m, "B 1 1");
    expect(m.banks[1]).toBe(1);
    expect(command(m, "G 4000")).toContain("1+2+...+10 = 0x0037");
  });

  it("Flash: 04 kaydıyla 64 KB üstü (bank 5), bank 0 korunur", async () => {
    const m = bootBios();
    const link = linkFor(m);
    const asm = example("merhaba");
    const hi = programHex(asm, 0x14000);
    expect(hi.hex).toMatch(/^:020000040001F9/);
    const res = await uploadHex(link, hi.hex, { mode: "flash" });
    expect(res.ok, res.message).toBe(true);
    expect(m.flash.data[0x14000]).toBe(asm.image[0x4000]);
    expect(m.flash.data[0x4000]).toBe(0xff);
    command(m, "B 1 5");
    expect(command(m, "G 4000")).toContain("Merhaba, CPU16!");
    const low = programHex(asm, 0x1000);
    const bad = await uploadHex(link, low.hex, { mode: "flash" });
    expect(bad.ok).toBe(false);
    expect(bad.message).toContain("adres izinli degil");
    expect(Array.from(m.flash.data.subarray(0, 0x4000))).toEqual(Array.from(bios.bank0));
  });

  it("saat.s: BIOS TICKS, SETCURSOR, çerçeve karakterleri; tuşla monitöre döner", async () => {
    const m = bootBios();
    const link = linkFor(m);
    const res = await uploadHex(link, programHex(example("saat")).hex, { mode: "ram", run: true });
    expect(res.ok, res.message).toBe(true);
    m.run(CPU_HZ * 2.5);
    const screen = m.renderText();
    expect(screen).toContain("CPU16 saati");
    expect(screen).toContain("00:02");
    expect(screen).toContain("╔══════");
    m.typeText(" ");
    expect(m.runUntil(() => m.uartOutput.endsWith("> "), 1_000_000)).toBe(true);
  });

  it("renkler.s ve onbellek.s çalışır; önbellek kapalıyken döngü daha yavaş", async () => {
    const m = bootBios();
    const link = linkFor(m);
    expect((await uploadHex(link, programHex(example("renkler")).hex, { mode: "ram", run: true })).ok).toBe(true);
    m.runUntil(() => m.uartOutput.endsWith("> ") && m.uartOutput.includes("0F■"), 4_000_000);
    expect(m.uartOutput).toContain("CPU16 renk paleti");
    expect((await uploadHex(link, programHex(example("onbellek")).hex, { mode: "ram", run: true })).ok).toBe(true);
    m.runUntil(() => /Onbellek kapali[^\n]*\n/.test(m.uartOutput), 8_000_000);
    const on = /Onbellek acik:  sure 0x([0-9A-F]{4})/.exec(m.uartOutput)!;
    const off = /Onbellek kapali: sure 0x([0-9A-F]{4})/.exec(m.uartOutput)!;
    expect(parseInt(off[1], 16)).toBeGreaterThan(parseInt(on[1], 16));
    expect(m.cache.enabled).toBe(true);
  });
});
