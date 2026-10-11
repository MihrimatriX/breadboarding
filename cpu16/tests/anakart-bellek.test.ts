// Faz 6 anakart: bellek ve önbellek kartları kapı seviyesinde, emülatördeki Machine'e karşı.
//  1. Veri yolu izi: Machine'in her read8/write8'i (onAccess) kelime/bayt veri yolu döngülerine
//     gruplanır ve BusMaster ile gerçek saat + bellek + önbellek kartlarında yeniden oynatılır.
//     Her okunan değer, her erişimin bekleme turu, bank register'ları, sayaçlar ve CACHE_CTRL
//     her döngüden sonra; EEPROM/RAM içeriği (EEPROM'un iç durumu dahil), etiketler ve önbellek verisi
//     sonda karşılaştırılır. EEPROM'un saati her erişimde izdeki komut başı döngüsüdür (bm.time).
//  Tam sistem (CPU kartı dahil) ve saat kartının bekleme turları: anakart-sistem.test.ts.

import { describe, expect, it } from "vitest";
import { assembleOrThrow } from "../asm/assembler.ts";
import { MachineLink } from "../bios/simlink.ts";
import { programHex, uploadHex } from "../bios/uploader.ts";
import { erc } from "../board/board.ts";
import { BusMaster } from "../board/bus-master.ts";
import { CLOCK_INPUTS } from "../board/clock-card.ts";
import { buildFullMachineBoard, buildMachineBoard } from "../board/machine-board.ts";
import { TBLC_NS, TWC_NS } from "../emu/devices/eeprom.ts";
import { CYCLE_NS, IO, Machine, MEM_WAIT } from "../emu/machine.ts";
import { bios, expectSameMemory, foreignIo, hex } from "./anakart-ortak.ts";

// ---------------------------------------------------------------- veri yolu izi

interface Snapshot {
  banks: number[];
  hits: number;
  misses: number;
  enabled: boolean;
}

interface Access {
  write: boolean;
  addr: number;
  value: number;
  cycle: number;
  /** okuma: önbellek açıkken ıskaladı mı (Machine.cache.totalMisses arttı mı) */
  miss: boolean;
  /** okuma anında önbellek açık mıydı */
  enabled: boolean;
  /** erişimden sonraki durum */
  post?: Snapshot;
}

const snapshot = (m: Machine): Snapshot => ({ banks: Array.from(m.banks), hits: m.cache.hits, misses: m.cache.misses, enabled: m.cache.enabled });

/**
 * Machine.onAccess ile izi kaydeder. Kanca okumada erişimden sonra, yazmada önce çağrılır; bir
 * yazmanın sonucu bu yüzden bir sonraki erişimden hemen önce alınır (okumada read8 sarılarak).
 */
function recorder(m: Machine) {
  const trace: Access[] = [];
  let misses = m.cache.totalMisses;
  const startWaits = m.waitCycles;
  const finish = () => {
    const last = trace.at(-1);
    if (last && !last.post) last.post = snapshot(m);
  };
  const read8 = m.read8;
  m.read8 = (addr: number) => {
    finish();
    return read8.call(m, addr);
  };
  m.onAccess = (write, addr, value, cycle) => {
    finish();
    const a: Access = { write, addr, value, cycle, miss: m.cache.totalMisses !== misses, enabled: m.cache.enabled };
    misses = m.cache.totalMisses;
    if (!write) a.post = snapshot(m);
    trace.push(a);
  };
  return {
    trace,
    stop() {
      finish();
      m.onAccess = undefined;
      m.read8 = read8;
      return { trace, waits: m.waitCycles - startWaits };
    },
  };
}

interface ReplayStats {
  cycles: number;
  reads: number;
  writes: number;
  waits: number;
  ioMine: number;
}

/**
 * İzi kapı seviyesi kartlarda oynat. Kelime erişimi = aynı komutta çift adres ve hemen ardından
 * tek adres, aynı yön (Machine'in "second" kuralı). Diğer kartların G/Ç erişimleri atlanır.
 */
function replay(bm: BusMaster, trace: Access[]): ReplayStats {
  const st: ReplayStats = { cycles: 0, reads: 0, writes: 0, waits: 0, ioMine: 0 };
  const c0 = bm.cycles;
  for (let i = 0; i < trace.length; ) {
    const a = trace[i];
    const b = trace[i + 1];
    const word = !!b && (a.addr & 1) === 0 && b.addr === a.addr + 1 && b.write === a.write && b.cycle === a.cycle;
    const last = word ? b : a;
    const at = `erişim ${i} (${a.write ? "yazma" : "okuma"} ${hex(a.addr)}${word ? " kelime" : ""}, döngü ${a.cycle})`;
    i += word ? 2 : 1;
    const io = a.addr >= 0xff00;
    if (foreignIo(a.addr)) continue;
    const lanes = word ? "word" : a.addr & 1 ? "odd" : "even";
    bm.time = a.cycle;
    const r = bm.access({ write: a.write, addr: a.addr, lanes, data: word ? a.value | (b.value << 8) : a.value });
    const waits = io ? 0 : a.write || !a.enabled || a.miss ? MEM_WAIT : 0;
    if (r.waits !== waits) throw new Error(`${at}: bekleme ${r.waits}, Machine ${waits}`);
    st.waits += waits;
    if (io) st.ioMine++;
    if (a.write) st.writes++;
    else {
      st.reads++;
      const got = word ? [r.de, r.do] : [a.addr & 1 ? r.do : r.de];
      const want = word ? [a.value, b.value] : [a.value];
      if (got.some((v, k) => v !== want[k])) throw new Error(`${at}: kartlar ${got.map((v) => hex(v, 2))}, Machine ${want.map((v) => hex(v, 2))}`);
    }
    const p = last.post!;
    const g = bm.probe;
    const gotSt = { banks: g.banks, hits: g.hits, misses: g.misses, enabled: g.cacheEnabled };
    if (JSON.stringify(gotSt) !== JSON.stringify(p)) throw new Error(`${at}: kart durumu ${JSON.stringify(gotSt)}, Machine ${JSON.stringify(p)}`);
  }
  st.cycles = bm.cycles - c0;
  return st;
}

/** Machine'in bellek durumunu kartlara yükle (izin ortasından başlamak için) */
function loadFrom(bm: BusMaster, m: Machine) {
  bm.probe.load({
    flash: m.flash, ram: m.ram, banks: m.banks, cacheEnabled: m.cache.enabled,
    hits: m.cache.hits, misses: m.cache.misses, tags: m.cache.tags, data: m.cache.data,
  });
}

function bootedMachine() {
  const m = new Machine();
  m.loadFlash(bios.flash);
  m.reset();
  return m;
}

function command(m: Machine, line: string) {
  const before = m.uartOutput.length;
  m.uartSend(line + "\r");
  expect(m.runUntil(() => m.uartOutput.length > before + line.length && m.uartOutput.endsWith("> "), 4_000_000), line).toBe(true);
  return m.uartOutput.slice(before);
}

// ---------------------------------------------------------------- testler

describe("Faz 6 anakart: kartların yapısı", () => {
  it("elektriksel kural denetimi: CPU + saat + bellek + önbellek kartlarında çakışan çıkış ve boşta giriş yok", () => {
    const { board } = buildMachineBoard();
    expect(erc(board, ["IRQ", ...CLOCK_INPUTS])).toEqual([]);
    const s = board.summary();
    const count = (card: string) => Object.values(s[card]).reduce((a, b) => a + b, 0);
    expect(count("bellek")).toBe(34);
    expect(count("onbellek")).toBe(46);
    expect(s.bellek["74HC273"]).toBe(4);
    expect(s.bellek["28C256"]).toBe(1);
    expect(s.bellek["62256"]).toBe(4);
    expect(s.onbellek["74HC161"]).toBe(11); // 8 sayaç + 3 etiket temizleme
  });

  it("bütün anakart (CPU, saat, bellek, önbellek, G/Ç, video, kendin yap bellek): ERC temiz, her kartın çip sayısı", () => {
    const { board } = buildFullMachineBoard();
    expect(erc(board, ["IRQ", ...CLOCK_INPUTS, "VID_OSC"])).toEqual([]);
    const s = board.summary();
    const counts = Object.fromEntries(Object.entries(s).map(([card, parts]) => [card, Object.values(parts).reduce((a, b) => a + b, 0)]));
    expect(counts).toEqual({ cpu: 194, clk: 10, bellek: 34, onbellek: 46, gc: 65, video: 73, kyb: 22 });
  });
});

describe("Faz 6 anakart: veri yolu izi kartlarda (BusMaster)", () => {
  it("BIOS açılışı: reset'ten \"> \" istemine kadar her erişim", { timeout: 60_000 }, () => {
    const m = bootedMachine();
    const rec = recorder(m);
    expect(m.runUntil(() => m.uartOutput.endsWith("> "), 2_000_000)).toBe(true);
    const { trace, waits } = rec.stop();
    const bm = new BusMaster();
    bm.probe.eeprom.load(bios.flash);
    const st = replay(bm, trace);
    expect(st.waits).toBe(waits); // izdeki bekleme toplamı = Machine.waitCycles
    expect(st.reads).toBeGreaterThan(20_000);
    expect(st.ioMine).toBeGreaterThanOrEqual(3);
    expect(expectSameMemory(bm.probe, m)).toBeGreaterThan(100);
  });

  it("monitör komutları: C (sayaçlar), C 0 / C 1, D, W, B, I (EEPROM koruması, önbellek kapalı)", { timeout: 60_000 }, () => {
    const m = bootedMachine();
    expect(m.runUntil(() => m.uartOutput.endsWith("> "), 2_000_000)).toBe(true);
    const bm = new BusMaster();
    loadFrom(bm, m);
    const rec = recorder(m);
    const out = [
      command(m, "C 0"), command(m, "W 8000 12 34"), command(m, "C 1"), command(m, "D 8000 2"),
      command(m, "B 2 5"), command(m, "B 2 21"), command(m, "I"), command(m, "C"),
    ].join("");
    expect(out).toContain("8000: 12 34");
    expect(out).toContain("yazma korumasi: acik"); // korumalıyken EEPROM'a dizisiz yazma yok sayılır
    expect(m.flash.writeCycles).toBe(0);
    const { trace, waits } = rec.stop();
    const st = replay(bm, trace);
    expect(st.waits).toBe(waits);
    expect(st.ioMine).toBeGreaterThan(30);
    expectSameMemory(bm.probe, m);
  });

  it("F komutu: Intel HEX → EEPROM (korumalı sayfa yazması, DATA yoklaması) ve okuma", { timeout: 60_000 }, async () => {
    const m = bootedMachine();
    expect(m.runUntil(() => m.uartOutput.endsWith("> "), 2_000_000)).toBe(true);
    const bm = new BusMaster();
    loadFrom(bm, m);
    const rec = recorder(m);
    const link = new MachineLink(m, true);
    m.uartOnOutput = (b) => link.push(b);
    const asm = assembleOrThrow(".org 0x4000\n.word 0x1234, 0x5678, 0x9abc, 0xdef0, 0x0102, 0x0304, 0xa5c3, 0x7e81\n");
    const res = await uploadHex(link, programHex(asm).hex, { mode: "flash" });
    expect(res.ok, res.message).toBe(true);
    m.uartOnOutput = undefined;
    expect(m.flash.writeCycles).toBe(1); // 16 bayt tek sayfada
    expect(m.flash.bytesWritten).toBe(16);
    command(m, "B 1 1");
    expect(command(m, "D 4000 10")).toContain("34 12 78 56");
    const { trace, waits } = rec.stop();
    const st = replay(bm, trace);
    expect(st.waits).toBe(waits);
    expectSameMemory(bm.probe, m);
    expect(Array.from(bm.probe.flash.subarray(0x4000, 0x4010))).toEqual(Array.from(asm.image.subarray(0x4000, 0x4010)));
  });

  it("64 bank, bank register'ları, RAM/EEPROM/boş bölge gözetleme, önbellek kapalı/açık, sayaçlar, EEPROM yazması", { timeout: 60_000 }, () => {
    const m = new Machine();
    m.loadFlash(Uint8Array.from({ length: 0x8000 }, (_, i) => (i * 13 + (i >> 9)) & 0xff));
    m.reset();
    const bm = new BusMaster();
    bm.probe.eeprom.load(m.flash.data);
    const rec = recorder(m);
    const w16 = (a: number, v: number) => {
      m.write8(a, v & 0xff);
      m.write8(a + 1, v >> 8);
    };
    const r16 = (a: number) => m.read8(a) | (m.read8(a + 1) << 8);
    // her bank pencere 2'de: kelime yaz, kelime ve bayt oku (EEPROM korumalı: dizisiz yazma yok sayılır)
    for (let bank = 0; bank < 64; bank++) {
      m.write8(IO.BANK2, bank);
      const off = 0x100 + bank * 4;
      r16(0x8000 + off);
      w16(0x8000 + off, 0x3c00 + bank * 0x0101);
      r16(0x8000 + off);
      m.read8(0x8001 + off);
      m.write8(0x8003 + off, bank ^ 0x5a);
      r16(0x8002 + off);
      m.read8(IO.BANK2);
      r16(IO.BANK2);
    }
    // bank register'ları kelime olarak: üst iki bit okunmaz
    w16(IO.BANK0, 0xffff);
    r16(IO.BANK0);
    w16(IO.BANK0, 0x2000);
    w16(IO.BANK2, 0x2221);
    r16(IO.BANK2);
    m.read8(IO.BANK3);
    // RAM gözetleme: satırı doldur, tek/çift bayt yaz, isabetle oku
    r16(0x4010);
    r16(0x4010);
    m.write8(0x4011, 0x99);
    r16(0x4010);
    m.write8(0x4010, 0x66);
    r16(0x4010);
    // EEPROM gözetleme: satır geçersiz kılınır (korumalı çipte yazma içeriği değiştirmez)
    m.write8(IO.BANK2, 1);
    r16(0x8020);
    r16(0x8020);
    m.write8(0x8021, 0x12);
    r16(0x8020);
    // boş bölge: 0xFF okunur, satır dolar, yazma geçersiz kılar
    m.write8(IO.BANK2, 17);
    r16(0x8040);
    w16(0x8040, 0x1234);
    r16(0x8040);
    // önbellek kapalı: okuma doldurmaz ve sayılmaz, ama yazma gözetlemesi sürer
    m.write8(IO.BANK2, 36);
    r16(0x8060);
    m.write8(IO.CACHE_CTRL, 0);
    m.read8(IO.CACHE_CTRL);
    r16(0x8060);
    m.write8(0x8060, 0x77);
    r16(0x8080);
    m.write8(IO.CACHE_CTRL, 1);
    r16(0x8060);
    r16(0x8080);
    m.read8(IO.CACHE_CTRL);
    // sayaçlar: 300 isabet (düşük bayttan yükseğe taşma), okuma, sadece FF30 yazması sıfırlar
    for (let i = 0; i < 300; i++) r16(0x8060);
    r16(IO.CACHE_HITS);
    m.read8(IO.CACHE_HITS + 1);
    r16(IO.CACHE_MISSES);
    m.read8(IO.CACHE_MISSES + 1);
    m.write8(IO.CACHE_HITS + 1, 0);
    m.write8(IO.CACHE_MISSES, 0);
    r16(IO.CACHE_HITS);
    m.write8(IO.CACHE_HITS, 0);
    r16(IO.CACHE_HITS);
    r16(IO.CACHE_MISSES);
    for (const a of [0xff14, 0xff1f, 0xff34, 0xff35, 0xff36, 0xff37, 0xff38, 0xff80, 0xfffe]) r16(a);
    m.write8(0xff35, 0); // tek bayt: CACHE_CTRL değil
    m.read8(IO.CACHE_CTRL);
    // EEPROM yazması (BIOS'taki gibi): önbellek kapalı, pencere 1 = bank 1 (5555), pencere 0 = bank 0
    // (2AAA); korumalı sayfa yazması, yazma sürerken DATA yoklaması ve toggle biti, sonra okuma. Bu
    // test CPU'suz olduğundan zaman (Machine.cycles) elle ilerletilir; kartlar izdeki döngüyü görür.
    m.write8(IO.CACHE_CTRL, 0);
    m.write8(IO.BANK0, 0);
    m.write8(IO.BANK1, 1);
    m.write8(IO.BANK2, 1); // hedef: fiziksel 0x4100–0x4105 (bank 1)
    const cmd = (...seq: [number, number][]) => seq.forEach(([a, v]) => m.write8(a, v));
    cmd([0x5555, 0xaa], [0x2aaa, 0x55], [0x5555, 0xa0]);
    for (let i = 0; i < 6; i++) m.write8(0x8100 + i, 0x41 + i * 9);
    m.read8(0x8105); // sayfa yüklenirken: durum
    m.cycles += Math.ceil(TBLC_NS / CYCLE_NS); // yükleme penceresi kapandı: iç yazma döngüsü
    for (let i = 0; i < 3; i++) m.read8(0x8105); // D7 ters, D6 her okumada değişir
    m.write8(0x8100, 0); // yazma döngüsünde yok sayılır
    m.cycles += Math.ceil(TWC_NS / CYCLE_NS);
    m.read8(0x8105);
    m.write8(IO.CACHE_CTRL, 1);
    r16(0x8100);
    r16(0x8102);
    r16(0x8100);
    expect(m.flash.writeCycles).toBe(1);
    expect(m.flash.bytesWritten).toBe(6);
    expect(m.peekPhys(0x4100)).toBe(0x41);
    const { trace } = rec.stop();
    const st = replay(bm, trace);
    expect(st.reads).toBeGreaterThan(700);
    expectSameMemory(bm.probe, m);
  });

  for (const cache of [false, true]) {
    it(`1 MB fiziksel alan kartlarda: EEPROM, boş alan 0xFF, RAM (önbellek ${cache ? "açık" : "kapalı"})`, { timeout: 60_000 }, () => {
      const m = new Machine();
      m.loadFlash(Uint8Array.from({ length: 0x8000 }, (_, i) => (i * 7 + (i >> 14)) & 0xff));
      m.reset();
      const bm = new BusMaster();
      bm.probe.eeprom.load(m.flash.data);
      const rec = recorder(m);
      if (!cache) m.write8(IO.CACHE_CTRL, 0);
      for (const pass of ["yaz", "oku"]) {
        for (let bank = 0; bank < 64; bank++) {
          m.write8(IO.BANK2, bank);
          for (let off = 0; off < 0x4000; off += 0x101) {
            if (pass === "yaz") m.write8(0x8000 + off, (bank * 3 + off) & 0xff);
            else m.read8(0x8000 + off);
          }
        }
      }
      expect(m.flash.writeCycles).toBe(0);
      const { trace } = rec.stop();
      const st = replay(bm, trace);
      expect(st.writes).toBe(64 * 64 + 2 * 64 + (cache ? 0 : 1));
      expectSameMemory(bm.probe, m);
      // kartlardaki içerik: RAM bankları (32–39) desenli, ötesi boş (0xFF), EEPROM değişmedi
      for (let bank = 32; bank < 64; bank++) expect(bm.probe.physRead(bank * 0x4000 + 0x202)).toBe(bank < 40 ? (bank * 3 + 0x202) & 0xff : 0xff);
    });
  }
});
