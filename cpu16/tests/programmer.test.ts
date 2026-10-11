// Flash programlayıcısının uçtan uca testi: Arduino yazılımının kendisi (cpu16-programlayici.ino)
// bilgisayarda derlenir; pin işlemleri programlayıcı kartının kapı seviyesi modeline (2 × 74HC595
// + SST39SF010A) bağlanır; seri girişe yaz.py'nin göndereceği komutlar verilir.

import { execFileSync, spawn } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createInterface } from "node:readline";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";
import { toIntelHex } from "../asm/hex.ts";
import { ARDUINO_NETS, buildProgrammerBoard } from "../board/programmer-card.ts";
import { LogicSim } from "../chips/logic.ts";
import type { MemoryHandle } from "../chips/parts/memory.ts";

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

/** Örnek imaj (BIOS Flash'ına yazılacak bir dosya gibi): 384 bayt sözde rastgele */
const ornekImaj = (() => {
  const d = new Uint8Array(384);
  let x = 0x1234;
  for (let i = 0; i < d.length; i++) {
    x = (x * 1103515245 + 12345) >>> 0;
    d[i] = x >>> 24;
  }
  return d;
})();

interface Run {
  serial: string;
  flash: Uint8Array;
}

describe.skipIf(!hasGpp)("Faz 9: Flash programlayıcı (Arduino yazılımı + kart modeli)", () => {
  let bin = "";
  let dir = "";
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), "cpu16-prog-"));
    bin = join(dir, "programlayici");
    execFileSync("g++", ["-std=c++17", "-Wall", "-Wextra", "-Werror", "-O1", "-x", "c++", join(root, "programlayici/test/mock.cpp"), "-I", join(root, "programlayici/test"), "-o", bin]);
  });

  function run(input: string, init?: (flash: Uint8Array) => void): Promise<Run> {
    const { board, flash } = buildProgrammerBoard();
    const sim = new LogicSim(board.c);
    for (const p of board.pulls) sim.pull(p.net, p.level);
    const data = (flash.handle as MemoryHandle).data;
    data.fill(0xff);
    init?.(data);
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
        } else if (op === "S") {
          serial += line.slice(2).replace(/\\n/g, "\n");
        } else if (op === "X") {
          child.stdin.end();
        }
      });
      child.on("error", reject);
      child.on("close", (code) => (code === 0 ? resolve({ serial, flash: data }) : reject(new Error(`programlayıcı çıkış kodu ${code}\n${serial}`))));
    });
  }

  it.skipIf(!hasPython)("yaz.py komutlarıyla bir imajı siler, yazar ve SUM ile doğrular", async () => {
    const hex = join(dir, "ornek.hex");
    writeFileSync(hex, toIntelHex(ornekImaj, [[0, ornekImaj.length]]));
    const cmds = execFileSync("python3", [join(root, "programlayici/yaz.py"), "--kuru", hex, "--sil", "--dogrula"], { encoding: "utf8" });
    // çipte eski bir içerik var: önce silinmeli
    const r = await run(cmds, (f) => f.fill(0x00, 0, 300));
    const lines = r.serial.trim().split("\n");
    expect(lines[0]).toBe("CPU16 programlayici v1 hazir");
    expect(lines[1]).toBe("OK ID BF B5");
    expect(r.serial).not.toContain("ERR");
    const want = ornekImaj;
    expect(Array.from(r.flash.subarray(0, want.length))).toEqual(Array.from(want));
    expect(r.flash[want.length]).toBe(0xff); // silinmiş
    const sum = want.reduce((a, b) => a + b, 0) & 0xffff;
    expect(lines).toContain(`OK SUM ${sum.toString(16).toUpperCase().padStart(4, "0")}`);
  });

  it("silinmemiş hücreye yazmayı reddeder, sektör silince yazar; READ dökümü", async () => {
    const rec = ":0400100001020304E2"; // 0x10..0x13 ← 01 02 03 04
    const r = await run(`${rec}\nSECTOR 0\n${rec}\nREAD 10 4\n`, (f) => (f[0x11] = 0x00));
    const lines = r.serial.trim().split("\n");
    expect(lines[1]).toMatch(/^ERR 00011 istenen 02 okunan 00 \(once silin\)$/);
    expect(lines[2]).toBe("OK");
    expect(lines[3]).toBe("OK");
    expect(lines[4]).toBe("00010: 01 02 03 04");
    expect(lines[5]).toBe("OK");
  });

  it("64 KB üstü adresler (04 kaydı, A16 pini) ve sağlama toplamı hatası", async () => {
    const r = await run(":020000040001F9\n:02FFF000AA5510\n:02FFF000AA5511\n");
    expect(r.flash[0x1fff0]).toBe(0xaa);
    expect(r.flash[0x1fff1]).toBe(0x55);
    expect(r.flash[0xfff0]).toBe(0xff);
    expect(r.serial).toContain("ERR HEX saglama toplami");
  });
});
