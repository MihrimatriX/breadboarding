// Faz 9: şemadan statik zamanlama analizi. Gerçek kartın hangi saat hızında güvenle çalışacağını
// veri sayfası gecikmeleriyle hesaplar; şema değişip yol uzarsa bu testler haber verir.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { Board } from "../board/board.ts";
import { buildComputerBoard } from "../board/computer.ts";
import { buildIoCard, ioCardYanlisYollar } from "../board/io-card.ts";
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

describe("Faz 9: G/Ç kartının zamanlaması (TCLK ve PS/2 saat alanları)", () => {
  const gc = new Board();
  buildIoCard(gc);
  gc.finish({ backplane: false });
  const kokler = [
    { net: "TCLK", ad: "TCLK" },
    { net: "PS2_CLK", ad: "PS/2 saati" },
  ];
  const kapali = ioCardYanlisYollar(gc);
  const m = zamanlamaAnalizi(gc, { kokler, kose: "maks", kapali });
  const t = zamanlamaAnalizi(gc, { kokler, kose: "tip", kapali });

  it("her parçanın modeli var; okuma sürücüleri TCLK mantığına giden yollardan çıkarılır", () => {
    expect(m.bilinmeyen).toEqual([]);
    expect(m.uyarilar).toEqual([]);
    expect(m.kapali[0].sayi).toBeGreaterThan(100);
    expect(m.kapali[1].sayi).toBe(1);
  });

  it("zamanlayıcı ve UART en kötü durumda 1 MHz TCLK'de çalışır; PS/2 saati (≤ 17 kHz) için bol pay", () => {
    for (const k of m.kokler) expect(k.fmaxMHz, k.ad).toBeGreaterThanOrEqual(1);
    expect(m.kokler[1].fmaxMHz).toBeGreaterThan(1);
  });

  it("kapılı saatlerin izinleri kapı açıkken değişmez (yeniden yükleme darbesi TCLK ile kapılanmaz)", () => {
    for (const k of m.kokler) expect(k.aciktaDegisen.map((x) => `${x.ref}.${x.pin} ${x.net}`), k.ad).toEqual([]);
    for (const k of t.kokler) for (const x of k.tutma) expect(x.pay, `${x.ref}.${x.pin} ${x.net}`).toBeGreaterThanOrEqual(5);
  });
});
