// Faz 9: şemadan statik zamanlama analizi. Gerçek kartın hangi saat hızında güvenle çalışacağını
// veri sayfası gecikmeleriyle hesaplar; şema değişip yol uzarsa bu testler haber verir.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildComputerBoard } from "../board/computer.ts";
import { zamanlamaAnalizi } from "../board/zamanlama.ts";
import { decodeControl, ROM_WORDS } from "../micro/control.ts";
import { assembleMicrocode } from "../micro/microasm.ts";

const { board } = buildComputerBoard();
const KOKLER = [
  { net: "CLK", ad: "CPU saati" },
  { net: "OSC_SRC", ad: "osilatör" },
];
const maks = zamanlamaAnalizi(board, { kokler: KOKLER, kose: "maks" });
const tip = zamanlamaAnalizi(board, { kokler: KOKLER, kose: "tip" });
const cpu = (r: typeof maks) => r.kokler.find((k) => k.kok === "CLK")!;

describe("Faz 9: statik zamanlama analizi", () => {
  it("her parçanın zamanlama modeli var, birleşimsel döngü yok", () => {
    expect(maks.bilinmeyen).toEqual([]);
    expect(maks.uyarilar).toEqual([]);
    expect(cpu(maks).elemanlar).toBeGreaterThan(40);
  });

  it("en kötü durumda 1 MHz CPU saati sığar; tipik değerlerle 2 MHz", () => {
    expect(cpu(maks).fmaxMHz).toBeGreaterThanOrEqual(1);
    expect(cpu(tip).fmaxMHz).toBeGreaterThanOrEqual(2);
  });

  it("kritik yol: kontrol register'ı (düşen kenar) → ALU ROM'u → toplayıcı zinciri → veriyolu (yarım periyot)", () => {
    const y = cpu(maks).yollar[0];
    expect(y.baslat).toBe("düşen");
    expect(y.yakala).toBe("yükselen");
    expect(y.pay).toBe(0.5);
    const parts = y.adimlar.map((a) => a.part);
    expect(parts[0]).toBe("74HC574");
    expect(parts).toContain("SST39SF010A");
    expect(parts.filter((p) => p === "74HC283").length).toBe(4);
  });

  it("kapılı saatlerde tutma payı: izin, saat girişi kapandıktan sonra değişir (tipik ≥ 5 ns)", () => {
    for (const k of tip.kokler) for (const t of k.tutma) expect(t.pay, `${t.ref}.${t.pin} ${t.net}`).toBeGreaterThanOrEqual(5);
  });

  it("kapı açıkken değişebilen tek izin register yazma seçimi; mikrokod IR yüklerken register yazmaz", () => {
    expect(new Set(cpu(maks).aciktaDegisen.map((t) => t.net.replace(/\d+$/, "")))).toEqual(new Set(["~WSEL"]));
    // ~WSEL, IR'deki register alanlarından gelir (RSEL = RD/RS1/RS2). IR yükselen kenarda değiştiği
    // için aynı adımda REG_W olursa yazma saatinde sıçrama olur: mikrokodda böyle bir kelime yok.
    const micro = assembleMicrocode(readFileSync(new URL("../micro/cpu16.ucode", import.meta.url), "utf8"));
    expect(micro.errors).toEqual([]);
    for (let a = 0; a < ROM_WORDS; a++) {
      const c = decodeControl(micro.rom[a]);
      if (c.sig.has("IR_L") && c.sig.has("REG_W")) expect(c.rsel, `adres ${a}`).toBeGreaterThanOrEqual(3);
    }
  });
});
