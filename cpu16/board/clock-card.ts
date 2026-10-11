// Saat ve reset kartı (Faz 9): osilatörden CLK ve WR_WIN'i, butondan ~RESET'i üretir; tek döngü
// adımlama da buradadır. Kapı seviyesi bilgisayar artık CLK'yi doğrudan sürmez, bu kartın
// osilatör girişini sürer; böylece kartın kendisi de aynı testlerle doğrulanır.
//
// Saat: 8 durumlu Johnson sayacı (74HC175), osilatörün her yükselen kenarında bir adım.
//   durum  Q0Q1Q2Q3   CLK = ~Q3   WR_WIN = ~Q0 ∧ Q2   TCLK = Q1
//   s0     0 0 0 0       1           0                 0
//   s1     1 0 0 0       1           0                 0
//   s2     1 1 0 0       1           0                 1
//   s3     1 1 1 0       1           0                 1
//   s4     1 1 1 1       0           0                 1     ← CLK düşer: kontrol register'ı mikrokodu örnekler
//   s5     0 1 1 1       0           1                 1     ← yazma penceresi açılır
//   s6     0 0 1 1       0           1                 0
//   s7     0 0 0 1       0           0                 0     ← pencere kapanır; ortasında ~WAIT örneklenir
//   s0                   1           0                 0     ← CLK yükselir: register'lar yüklenir
// Johnson sayacında her adımda tek flip-flop değişir; iki komşu bitten çözülen sinyaller
// (CLK, WR_WIN, TCLK) bu yüzden parazitsizdir. CPU saati = osilatör / 8.
//
// Bekleme durumu (Faz 6, anakart): ~WAIT arka panelde 10 kΩ ile 1'e çekilidir; bellek erişiminde
// önbellek kartı onu düşürür. W flip-flop'u ~WAIT'i s7'nin ortasında (osilatörün düşen kenarı)
// örnekler. W = 1 iken CLK ve WR_WIN kapalı tutulur: sayaç bir tur daha (8 osilatör periyodu =
// tam bir CPU saati) döner, CLK yükselmez, yazma penceresi yeniden açılmaz. W yalnızca s7'nin
// ortasında değişir; o anda CLK de WR_WIN de zaten düşüktür, kapılama bu yüzden parazit üretmez.
// Her bekleme turu CPU döngüsünü tam olarak bir CPU saati uzatır.
//
// TCLK = Q1: Johnson sayacından doğrudan alınır, bekleme turlarında da çalışır (uzatılmayan CPU
// saati). CLK'nin düşen kenarından 2 osilatör periyodu sonra düşer, 6 periyot sonra yükselir;
// bellek ve önbellek kartları bekleme turlarını bununla sayar. Sayaçla birlikte durur (adım kipi,
// reset): TCLK CPU zamanıdır, gerçek zaman değil.
// OSC: tamponlanmış osilatör; adım kipinde ve reset sırasında da çalışır (önbellek kartı etiket
// belleğini reset sırasında bununla temizler).
//
// Adım kipi: OTOMATİK/ADIM anahtarı ADIM'dayken osilatör sayaca ancak GO = 1 iken ulaşır. ADIM
// butonu (74HC14 ile sıçraması süzülmüş) osilatörün düşen kenarında iki flip-flopla eşzamanlanır;
// basış anında GO kurulur ve sayaç tekrar s0'a gelince düşer. Bekleme turunda sayaç s0'dan geçer
// ama W = 1'dir; GO tutulur. Böylece bir basış = bekleme turları dahil tam bir CPU döngüsü.

import type { Board, ChipInstance } from "./board.ts";

export interface ClockCard {
  johnson: ChipInstance;
  schmitt: ChipInstance;
}

/** Saat kartının dışarıdan sürülen netleri (simülasyonda test düzeneği sürer) */
export const CLOCK_INPUTS = ["OSC_XTAL", "RST_RC", "STEP_RC", "SLOW_RC", "AUTO", "SLOW_SEL"];

export function buildClockCard(b: Board): ClockCard {
  b.card = "clk";

  b.block = "Osilatör ve reset";
  // 74HC14: reset (2 kat), ADIM butonu, yavaş RC osilatör
  const schmitt = b.place("74HC14", {
    "1A": "RST_RC", "1Y": "RESET",
    "2A": "RESET", "2Y": "~RST",
    "3A": "STEP_RC", "3Y": "STEP_BTN",
    "4A": "SLOW_RC", "4Y": "OSC_SLOW",
    "5A": "GND", "6A": "GND",
  }, "reset ve ADIM butonu Schmitt tetikleyici, yavaş RC osilatör");
  b.passive("OSC_CAN", { "1": "VCC", "7": "GND", "8": "OSC_XTAL", "14": "VCC" }, "kristal osilatör (CPU saatinin 8 katı)");
  b.passive("R_10K", { "1": "VCC", "2": "RST_RC" }, "açılış reseti: şarj direnci");
  b.passive("C_10U", { "1": "RST_RC", "2": "GND" }, "açılış reseti: gecikme");
  b.passive("SW_PUSH", { "1": "RST_RC", "2": "GND" }, "RESET butonu");
  b.passive("R_10K", { "1": "VCC", "2": "STEP_RC" }, "ADIM butonu çekme direnci");
  b.passive("C_1U", { "1": "STEP_RC", "2": "GND" }, "ADIM butonu sıçrama süzgeci");
  b.passive("SW_PUSH", { "1": "STEP_RC", "2": "GND" }, "ADIM butonu");
  b.passive("POT_100K", { "1": "OSC_SLOW", "2": "SLOW_FB", "3": "SLOW_FB" }, "yavaş saat hızı");
  b.passive("R_1K", { "1": "SLOW_FB", "2": "SLOW_RC" }, "yavaş osilatör en düşük direnci");
  b.passive("C_1U", { "1": "SLOW_RC", "2": "GND" }, "yavaş osilatör kondansatörü");
  b.passive("SW_SPDT", { "1": "VCC", "2": "AUTO", "3": "GND" }, "OTOMATİK (1) / ADIM (0)");
  b.passive("SW_SPDT", { "1": "VCC", "2": "SLOW_SEL", "3": "GND" }, "YAVAŞ (1) / HIZLI (0)");

  b.block = "Saat üretimi";
  b.place("74HC157", {
    S: "SLOW_SEL", "~E": "GND", "1I0": "OSC_XTAL", "1I1": "OSC_SLOW", "1Y": "OSC_SRC",
    "2I0": "GND", "2I1": "GND", "3I0": "GND", "3I1": "GND", "4I0": "GND", "4I1": "GND",
  }, "saat kaynağı seçimi (kristal / yavaş)");
  const nOsc = b.not("OSC_SRC", "~OSC_SRC", "osilatör tersi (eşzamanlama)");
  const johnson = b.place("74HC175", {
    "~MR": "~RST", CP: "OSC_G",
    D0: "JCLK", D1: "JQ0", D2: "JQ1", D3: "JQ2",
    Q0: "JQ0", "~Q0": "~JQ0", Q1: "JQ1", Q2: "JQ2", "~Q2": "~JQ2", Q3: "JQ3", "~Q3": "JCLK",
  }, "Johnson sayacı: osilatör / 8 → CLK, yazma penceresi, TCLK");
  b.and("~JQ0", "JQ2", "JWR", "yazma penceresi (s5, s6)");

  // adım kipi: butonu eşzamanla, basışta GO'yu kur, döngü bitince bırak
  b.place("74HC74", {
    "1D": "STEP_BTN", "1CLK": nOsc, "~1PRE": "VCC", "~1CLR": "~RST", "1Q": "BTN_S",
    "2D": "BTN_S", "2CLK": nOsc, "~2PRE": "VCC", "~2CLR": "~RST", "2Q": "BTN_P", "~2Q": "~BTN_P",
  }, "ADIM butonu eşzamanlama (iki kademe)");
  const press = b.and("BTN_S", "~BTN_P", "PRESS", "basış anı (bir osilatör periyodu)");
  const notS0 = b.or("JQ0", "JQ3", "~IS_S0", "sayaç s0'da değil");
  // bekleme turunda sayaç s0'dan geçer ama CPU döngüsü bitmemiştir: GO tutulur
  const hold = b.or(notS0, "WST", "GO_HOLD", "GO tut (s0 değil ya da bekleme turu)");
  const goNext = b.or(press, b.and("GO", hold, undefined, "GO tut"), "GO_NEXT", "GO sonraki");

  b.block = "Bekleme durumu";
  b.pullUp(["~WAIT"], "~WAIT çekme direnci (bekleme isteyen kart yoksa CPU beklemez)");
  b.not("~WAIT", "WAITREQ", "bekleme isteği");
  b.and("~JQ2", "JQ3", "JS7", "sayaç s7'de");
  b.and(nOsc, "JS7", "WAIT_CK", "~WAIT örnekleme kenarı: s7'nin ortası");
  b.place("74HC74", {
    "1D": goNext, "1CLK": nOsc, "~1PRE": "VCC", "~1CLR": "~RST", "1Q": "GO",
    "2D": "WAITREQ", "2CLK": "WAIT_CK", "~2PRE": "VCC", "~2CLR": "~RST", "2Q": "WST", "~2Q": "~WST",
  }, "GO: adım kipinde bir tam döngü boyunca saat izni; W: bekleme turu");
  b.and("JCLK", "~WST", "CLK_G", "beklemede CLK düşük kalır");
  b.and("JWR", "~WST", "WR_G", "beklemede yazma penceresi açılmaz");

  b.block = "Saat üretimi";
  const run = b.or("AUTO", "GO", "OSC_RUN", "saat izni");
  b.and("OSC_SRC", run, "OSC_G", "kapılı osilatör");

  b.block = "Saat dağıtımı";
  b.place("74HC541", {
    "~OE1": "GND", "~OE2": "GND",
    A0: "CLK_G", Y0: "CLK", A1: "WR_G", Y1: "WR_WIN", A2: "~RST", Y2: "~RESET",
    A3: "JQ1", Y3: "TCLK", A4: "OSC_SRC", Y4: "OSC",
    A5: "GND", A6: "GND", A7: "GND",
  }, "arka panel saat, TCLK, OSC ve reset sürücüsü");
  b.led("CLK", "CLK");

  return { johnson, schmitt };
}
