// EEPROM programlayıcısının uçtan uca testi: Arduino yazılımının kendisi (cpu16-programlayici.ino)
// bilgisayarda derlenir; pin işlemleri programlayıcı kartının kapı seviyesi modeline (2 × 74HC595
// + 28C256) bağlanır; seri girişe yaz.py'nin göndereceği komutlar verilir. Zaman: her pin işlemi
// 1 µs, bekleme çağrıları kendi süreleri (test/mock.cpp); EEPROM modeli bu saati görür.

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { assemble } from "../asm/assembler.ts";
import { toIntelHex } from "../asm/hex.ts";
import { ARDUINO_NETS, buildProgrammerBoard } from "../board/programmer-card.ts";
import { LogicSim } from "../chips/logic.ts";
import type { EepromHandle } from "../chips/parts/memory.ts";
import { At28c256 } from "../emu/devices/eeprom.ts";
import { romImage } from "../tools/machine-cli.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const has = (cmd: string, args: string[]) => {
  try {
    execFileSync(cmd, args, { stdio: "ignore" });
    return true;
  } catch {
    return false;
  }
};
const hasGpp = has("g++", ["--version"]);
const hasPython = has("python3", ["--version"]);

const BANNER = "CPU16 programlayici v2 (28C256) hazir";
/** Testte yazma döngüsü 300 µs (veri sayfası en çok 10 ms): yoklama döngüleri kısa kalsın */
const TEST_TWC_NS = 300_000;

interface Run {
  serial: string;
  lines: string[];
  chip: At28c256;
  /** geçen süre (µs) */
  us: number;
}

describe.skipIf(!hasGpp)("Faz 9: EEPROM programlayıcı (Arduino yazılımı + kart modeli)", () => {
  let bin = "";
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "cpu16-prog-"));
    bin = join(dir, "programlayici");
    execFileSync("g++", ["-std=c++17", "-Wall", "-Wextra", "-Werror", "-O1", "-x", "c++", join(root, "programlayici/test/mock.cpp"), "-I", join(root, "programlayici/test"), "-o", bin]);
  });

  function run(input: string, init?: (chip: At28c256) => void): Promise<Run> {
    const { board, flash } = buildProgrammerBoard();
    const sim = new LogicSim(board.c);
    for (const p of board.pulls) sim.pull(p.net, p.level);
    const h = flash.handle as EepromHandle;
    let us = 0;
    h.now = () => us * 1000;
    h.core.writeCycleNs = TEST_TWC_NS;
    init?.(h.core);
    const net = (pin: number) => board.n(ARDUINO_NETS[pin]);
    const mode = new Map<number, number>();
    const value = new Map<number, number>();
    for (const pin of Object.keys(ARDUINO_NETS).map(Number)) sim.release(net(pin));
    sim.settle();
    const file = join(dir, `girdi-${Math.random().toString(36).slice(2)}.txt`);
    writeFileSync(file, input);
    return new Promise((resolve, reject) => {
      const child = spawn(bin, [file]);
      let serial = "";
      const rl = createInterface({ input: child.stdout });
      rl.on("line", (line) => {
        const [op, a, b] = line.split(" ");
        const pin = Number(a);
        if (op === "P" || op === "W" || op === "R") us++;
        if (op === "P") {
          mode.set(pin, Number(b));
          if (Number(b) === 1) sim.set(net(pin), (value.get(pin) ?? 0) === 1);
          else {
            sim.release(net(pin));
            sim.settle();
          }
        } else if (op === "W") {
          value.set(pin, Number(b));
          if (mode.get(pin) === 1) sim.set(net(pin), Number(b) === 1);
        } else if (op === "R") {
          child.stdin.write(sim.get(net(pin)) === 1 ? "1\n" : "0\n");
        } else if (op === "T") {
          us += pin;
        } else if (op === "S") {
          serial += line.slice(2).replace(/\\n/g, "\n");
        } else if (op === "X") {
          child.stdin.end();
        }
      });
      child.on("error", reject);
      child.on("close", (code) =>
        code === 0 ? resolve({ serial, lines: serial.trim().split("\n"), chip: h.core, us }) : reject(new Error(`programlayıcı çıkış kodu ${code}\n${serial}`)),
      );
    });
  }

  it.skipIf(!hasPython)("yaz.py ile Deney 8'in programını eski içerikli, korumalı bir 28C256'ya yazar ve SUM ile doğrular", async () => {
    const src = join(root, "kit/programlar/bellek-deneme.s");
    const asm = assemble(readFileSync(src, "utf8"));
    expect(asm.errors).toEqual([]);
    const hex = join(dir, "bellek.hex");
    writeFileSync(hex, toIntelHex(asm.image, asm.ranges));
    const cmds = execFileSync("python3", [join(root, "programlayici/yaz.py"), "--kuru", hex, "--dogrula"], { encoding: "utf8" });
    expect(cmds.split("\n")[0]).toBe("SDP");
    const want = romImage(src);
    const used = asm.ranges.reduce((n, [, e]) => Math.max(n, e), 0);
    // çipte başka bir programın izleri: korumalı (programlayıcıyla yazılmış); ilk sayfa zaten aynı
    const old = new Uint8Array(0x8000).map((_, i) => (i * 37 + 11) & 0xff);
    old.set(want.subarray(0, 64));
    const r = await run(cmds, (c) => c.load(old));
    expect(r.lines[0]).toBe(BANNER);
    expect(r.lines[1]).toBe("OK SDP 1");
    expect(r.serial).not.toContain("ERR");
    expect(Array.from(r.chip.data.subarray(0, used))).toEqual(Array.from(want.subarray(0, used)));
    expect(r.chip.data[used]).toBe(old[used]); // HEX dosyasında olmayan baytlar eski değerinde
    expect(r.chip.sdp).toBe(true);
    // her HEX satırı (16 bayt, sayfa içinde) bir yazma döngüsü; eskisiyle aynı olan satırlar yazılmaz
    const changed = cmds.split("\n").filter((l) => {
      if (!l.startsWith(":") || l.slice(7, 9) !== "00") return false;
      const a = parseInt(l.slice(3, 7), 16), n = parseInt(l.slice(1, 3), 16);
      return want.subarray(a, a + n).some((v, i) => v !== old[a + i]);
    });
    expect(changed.length).toBeLessThan(asm.ranges.reduce((n, [s, e]) => n + Math.ceil((e - s) / 16), 0));
    expect(r.chip.writeCycles).toBe(changed.length);
    for (const [s, e] of asm.ranges) {
      let sum = 0;
      for (let i = s; i < e; i++) sum += want[i];
      expect(r.lines).toContain(`OK SUM ${(sum & 0xffff).toString(16).toUpperCase().padStart(4, "0")}`);
    }
    expect(r.lines).toContain("OK END");
  });

  it.skipIf(!hasPython)("yaz.py: 32 KB dışı adres reddedilir, --sil yok sayılır, --koruma-kapat sona SDP 0 ekler", () => {
    const hex = join(dir, "dis.hex");
    writeFileSync(hex, ":0280000011224B\n:00000001FF\n");
    expect(() => execFileSync("python3", [join(root, "programlayici/yaz.py"), "--kuru", hex], { encoding: "utf8", stdio: "pipe" })).toThrow(/28C256/);
    const ok = join(dir, "ic.hex");
    writeFileSync(ok, ":020010001122BB\n:00000001FF\n");
    const out = execFileSync("python3", [join(root, "programlayici/yaz.py"), "--kuru", ok, "--sil", "--dogrula", "--koruma-kapat"], { encoding: "utf8", stdio: "pipe" }).trim().split("\n");
    expect(out).toEqual(["SDP", ":020010001122BB", ":00000001FF", "SUM 10 2", "SDP 0"]);
  });

  it("SDP: korumayı sorar, kapatır ve açar; korumasız çipte sorgu içeriği değiştirmez", async () => {
    const rec = ":0400100001020304E2"; // 0x10..0x13 ← 01 02 03 04
    const r = await run(`SDP\nSDP 0\nSDP\n${rec}\nSDP\nSDP 0\nSDP 1\nSDP\nREAD 10 4\n`, (c) => {
      c.data.fill(0x5a);
      c.sdp = true;
    });
    expect(r.lines).toEqual([
      BANNER, "OK SDP 1", "OK", "OK SDP 0", "OK", "OK SDP 1", "OK", "OK", "OK SDP 1", "0010: 01 02 03 04", "OK",
    ]);
    expect(r.chip.sdp).toBe(true);
    expect(r.chip.data[0x7fff]).toBe(0x5a);
    expect(r.chip.data[0x14]).toBe(0x5a);
    // korumasız çip: kayıt yine korumalı yazılır, çip korumalı kalır
    const u = await run(`SDP\n${rec}\nSDP\n`);
    expect(u.lines).toEqual([BANNER, "OK SDP 0", "OK", "OK SDP 1"]);
    expect(Array.from(u.chip.data.subarray(0x10, 0x14))).toEqual([1, 2, 3, 4]);
    expect(u.chip.data[0x7fff]).toBe(0xff);
  });

  it("sayfa sınırını aşan kayıt iki yazma döngüsünde; her bayt tBLC içinde yüklenir; hatalı kayıtlar", async () => {
    const rec = ":04003E00AABBCCDDB0"; // 0x3E..0x41: iki sayfa
    let maxGap = 0;
    const r = await run(`${rec}\n:0280000011225B\n:0280000011224B\n:01001000AA45\nREAD 3E 4\n`, (c) => {
      const write = c.write.bind(c);
      let last = -1;
      c.write = (o, v, t) => {
        if (o === 0x5555 && v === 0xaa) last = -1; // korumalı yazma dizisinin başı: yeni sayfa
        if (last >= 0) maxGap = Math.max(maxGap, t - last);
        last = t;
        write(o, v, t);
      };
    });
    expect(r.lines.slice(1)).toEqual([
      "OK",
      "ERR HEX saglama toplami",
      "ERR 08000 28C256 disinda (0000-7FFF)",
      "OK",
      "003E: AA BB CC DD",
      "OK",
    ]);
    expect([r.chip.writeCycles, r.chip.bytesWritten]).toEqual([3, 5]);
    expect(r.chip.data[0x10]).toBe(0xaa);
    expect(maxGap).toBeGreaterThan(0);
    expect(maxGap).toBeLessThan(100_000); // tBLC = 150 µs; model yavaş tarafta (1 µs/pin işlemi)
  });

  it("yazma döngüsü bitmezse zaman aşımı bildirir", async () => {
    const r = await run(":0400100001020304E2\n", (c) => (c.writeCycleNs = 50_000_000));
    expect(r.lines[1]).toBe("ERR 0010 yazma zaman asimi");
    expect(r.us).toBeGreaterThan(20_000);
  });
});
