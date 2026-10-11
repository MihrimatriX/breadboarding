// Anakart G/Ç kartı (Faz 6, kapı seviyesi): UART (115200 8N1, RTS/CTS), PS/2 klavye alıcısı,
// 1 kHz zamanlayıcı ve 74HC148'li kesme denetleyicisi. FF00–FF0A register'ları; davranış modeli
// emu/machine.ts (ioRead / ioWrite / events) ile döngüsü döngüsüne aynıdır.
// Tasarım belgesi: cpu16/docs/anakart-gc-video.md
//
// Veriyolu arayüzü (arka panel):
//   ~IO (bellek kartı: A15..A8 = FF) ∧ A7..A4 = 0 → grup FF0x; A3..A1 register çiftini seçer.
//   Okuma: ~MRD düşükken seçilen çiftin çift register'ı DE'ye, tek register'ı DO'ya sürülür
//   (kelime okuması tek döngüdür; bayt okumada CPU A0'a göre baytı seçer). Okumanın yan etkileri
//   (UART_DATA, KBD_DATA: "okuyunca hazır biti silinir") yalnızca A0 = 0 iken ve okumanın sonunda,
//   CPU'nun veriyi aldığı CLK yükselen kenarında bir flip-flop'a yakalanır; silme bir sonraki
//   döngüde olur.
//   Yazma: ~MWE_E / ~MWE_O darbesi (WR_WIN içinde) register'ı darbenin sonunda (yükselen kenar)
//   yükler; veri o anda hâlâ geçerlidir.
//
// Zaman tabanı TCLK'dir (saat kartı: OSC / 8, bekleme döngüleri dahil her CPU döngüsünde bir
// periyot; Machine'in `cycles` sayacıyla aynı şey). Zamanlayıcı ve UART bit zamanları TCLK
// kenarlarında, Machine'in olaylarıyla aynı döngüde değişir. PS/2 klavyenin kendi saatiyle
// çalışır (zamanlama klavyeden gelir).

import type { Board, ChipInstance } from "./board.ts";
import { okumaSuruculeri, type KapaliYay } from "./zamanlama.ts";

/** Kartın arka panel dışından gelen (başka kartın ya da konnektörün sürdüğü) girişleri */
export const IO_CARD_INPUTS = [
  "CLK", "~RESET", "TCLK", "~IO", "~MRD", "~MWE_E", "~MWE_O", "VSYNC_REQ",
  ...Array.from({ length: 8 }, (_, i) => `A${i}`), "UART_RXD",
];

export interface IoCard {
  /** Zamanlayıcının 4 × 74HC193 aşağı sayıcısı (düşük basamak önce) */
  timer: ChipInstance[];
  /** 1 kHz ön bölücü (3 × 74HC161) */
  prescaler: ChipInstance[];
  /** UART alıcı / klavye kaydırma register'ları (74HC595) */
  uartRx: ChipInstance;
  kbd: ChipInstance;
}

/**
 * Zamanlama analizinde G/Ç kartının yanlış yolları (TCLK ve PS/2 alanları için):
 * - okuma sürücülerinin veriyoluna sürdüğü değer TCLK'deki yazma mantığına gidemez;
 * - TRL2 yalnızca yeniden yükleme darbesini bitirir: ~PL'nin kalkması sayaç çıkışını değiştirmez
 *   (üstelik o döngüde tık yoktur, GC_DECP 0'dır).
 */
export function ioCardYanlisYollar(b: Board): KapaliYay[] {
  return [
    okumaSuruculeri(b, ["gc"]),
    { neden: "TRL2 yalnızca sayaç yüklemesini bitirir (~PL kalkarken çıkış değişmez)", yay: (ch, _from, to) => ch.card === "gc" && ch.nets[to] === b.n("~GC_TRL2") },
  ];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
type Conn = Record<string, string | number>;

export function buildIoCard(b: Board): IoCard {
  b.card = "gc";

  // =========================================================================== adres çözme
  b.block = "Adres çözme";
  b.place("74HC138", { A0: "A4", A1: "A5", A2: "A6", "~E1": "~IO", "~E2": "A7", E3: "VCC", "~Y0": "~GC_G0" },
    "G/Ç grubu FF0x (A7..A4 = 0)");
  const decoder = (strobe: string, outs: Record<number, string>, role: string) => {
    const conn: Conn = { A0: "A1", A1: "A2", A2: "A3", "~E1": "~GC_G0", "~E2": strobe, E3: "VCC" };
    for (const [k, n] of Object.entries(outs)) conn[`~Y${k}`] = n;
    b.place("74HC138", conn, role);
  };
  decoder("~MRD", { 0: "~GC_RD0", 1: "~GC_RD1", 2: "~GC_RD2", 3: "~GC_RD3", 4: "~GC_RD4", 5: "~GC_RD5" },
    "okuma seçimi: FF00/01 … FF0A/0B");
  decoder("~MWE_E", { 0: "~GC_WE0", 2: "~GC_WE2", 3: "~GC_WE3" }, "çift bayt yazma darbeleri: FF00, FF04, FF06");
  decoder("~MWE_O", { 2: "~GC_WO2", 3: "~GC_WO3", 4: "~GC_WO4" }, "tek bayt yazma darbeleri: FF05, FF07, FF09");

  b.block = "Okuma yan etkileri";
  b.not("~RESET", "GC_RST", "reset (aktif yüksek)");
  b.not("TCLK", "GC_TCLKN", "TCLK tersi");
  // A0 = 0 iken (UART_DATA / KBD_DATA çift adresinde) okuma; CLK yükselen kenarında yakalanır
  b.nor("~GC_RD0", "A0", "GC_RDU", "UART_DATA okunuyor");
  b.and(b.nor("~GC_RD1", "A0"), "GC_KRDY", "GC_RDK", "KBD_DATA okunuyor (READY iken: çerçeve ortasında sayaç silinmez)");
  b.place("74HC74", {
    "1D": "GC_RDU", "1CLK": "CLK", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "GC_RDU_Q", "~1Q": "~GC_RDU_Q",
    "2D": "GC_RDK", "2CLK": "CLK", "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "GC_RDK_Q", "~2Q": "~GC_RDK_Q",
  }, "okuma yan etkisi: okumadan sonraki döngü boyunca 1 (RX_READY / READY silinir)");

  b.block = "Sinyal düzeltme";
  b.place("74HC14", {
    "1A": "PS2_CLK", "1Y": "GC_KCLKN",
    "2A": "PS2_DAT", "2Y": "GC_KDATN",
    "3A": "GC_KDATN", "3Y": "GC_KDAT",
    "4A": "UART_RXD", "4Y": "GC_URXN",
    "5A": "GC_URXN", "5Y": "GC_URX",
    "6A": "GND",
  }, "PS/2 saat/veri ve UART RX Schmitt tetikleyicileri");

  buildUart(b);
  const kbd = buildPs2(b);
  const { timer, prescaler } = buildTimer(b);
  buildIrq(b);

  return { timer, prescaler, uartRx: b.chips.find((c) => c.role.startsWith("UART alıcı kaydırma"))!, kbd };
}

/** Bir register'ı DE ya da DO hattına okutan 74HC541 (kullanılmayan bitler 0 okunur) */
function readBuf(b: Board, bits: (string | number)[], lane: "DE" | "DO", oe1: string, oe2: string, role: string) {
  const conn: Conn = { "~OE1": oe1, "~OE2": oe2 };
  range(8).forEach((i) => {
    conn[`A${i}`] = bits[i] ?? "GND";
    conn[`Y${i}`] = `${lane}${i}`;
  });
  b.place("74HC541", conn, role);
}

// ============================================================================= UART
//
// TX: FF00'a yazma darbesi (~GC_WE0) baytı 74HC165'e asenkron yükler (D7 = DE0: LSB önce çıkar),
// BUSY'yi kurar ve bit bölücüsünü / bit sayacını temizler. Bit süresi TCLK'den: 7 bit × 35 + 3 bit
// × 34 = 347 döngü (Machine.UART_BYTE_CYCLES); ortalama 115 274 baud (+%0,06), bir kenarın ideal
// yerinden en çok sapması testte ölçülür (anakart-gc-video.md). TX_EMPTY yazmadan tam 347 TCLK
// kenarı sonra 1 olur.
//
// RX: hat iki flip-flop ile TCLK'ye eşzamanlanır; başlangıç biti görülünce bölücü 19'dan sayar,
// sonra her 35 döngüde bir örnek (başlangıç, 8 veri, bitiş biti ortaları; ideal orta noktadan en çok
// ±2 döngü). 9. örnekte (bitiş biti) 74HC595'in çıkış register'ı yüklenir ve RX_READY kurulur:
// başlangıç biti t döngüsünde düşerse t + 334. TCLK kenarında. RX_READY = RTS# (CH340'ın CTS#'i):
// bayt okunana kadar köprü sonraki baytı göndermez.
function buildUart(b: Board): void {
  b.block = "UART verici";
  const tx: Conn = { "~PL": "~GC_WE0", CP: "TCLK", "~CE": "~GC_TXSH", DS: "VCC", Q7: "GC_TXQ" };
  range(8).forEach((i) => (tx[`D${7 - i}`] = `DE${i}`));
  b.place("74HC165", tx, "UART verici kaydırma register'ı (FF00'a yazılan bayt, LSB önce)");
  b.and("GC_TXBUSY", "~GC_WE0", "GC_TXRUN", "verici çalışıyor (yazma darbesinde ve boştayken sayaçlar temiz)");
  b.place("74HC161", {
    "~MR": "GC_TXRUN", CP: "TCLK", "~PE": "~GC_TXEND", CEP: "VCC", CET: "VCC",
    D0: "GND", D1: "GND", D2: "GND", D3: "GND", Q0: "GC_TD0", Q1: "GC_TD1", TC: "GC_TDTC",
  }, "verici bit bölücüsü (düşük)");
  b.place("74HC161", {
    "~MR": "GC_TXRUN", CP: "TCLK", "~PE": "~GC_TXEND", CEP: "VCC", CET: "GC_TDTC",
    D0: "GND", D1: "GND", D2: "GND", D3: "GND", Q1: "GC_TD5",
  }, "verici bit bölücüsü (yüksek)");
  b.place("74HC161", {
    "~MR": "GC_TXRUN", CP: "TCLK", "~PE": "VCC", CEP: "GC_TXEND", CET: "GC_TXEND",
    D0: "GND", D1: "GND", D2: "GND", D3: "GND", Q0: "GC_TB0", Q1: "GC_TB1", Q2: "GC_TB2", Q3: "GC_TB3",
  }, "verici bit sayacı (0 başlangıç, 1–8 veri, 9 bitiş)");
  // bit sonu: bölücü 34'te (bit 0–6, 35 döngü) ya da 33'te (bit 7–9, 34 döngü)
  b.or("GC_TB3", b.and("GC_TB2", b.and("GC_TB1", "GC_TB0")), "GC_TXS", "bit ≥ 7: kısa bit (34 döngü)");
  b.not("GC_TXS", "~GC_TXS", "uzun bit (35 döngü)");
  b.or(b.and("GC_TXS", "GC_TD0"), b.and("~GC_TXS", "GC_TD1"), "GC_TXLOW", "bölücü 33 / 34 alt bitleri");
  b.and("GC_TD5", "GC_TXLOW", "GC_TXEND", "bit sonu");
  b.not("GC_TXEND", "~GC_TXEND", "bit sonu: bölücüyü 0'la");
  b.and("GC_TXEND", b.and("GC_TB3", "GC_TB0"), "GC_TXDONE", "bitiş biti bitti");
  b.not("GC_TXDONE", "~GC_TXDONE", "bitiş biti bitti");
  b.and("GC_TXBUSY", "~GC_TXDONE", "GC_TXBUSY_D", "BUSY sonraki değer");
  b.or(b.or("GC_TB0", "GC_TB1"), b.or("GC_TB2", "GC_TB3"), "GC_TBNZ", "başlangıç biti değil");
  b.nand("GC_TXEND", "GC_TBNZ", "~GC_TXSH", "veri bitleri arasında kaydır");
  b.or("GC_TXEMPTY", b.and("GC_TBNZ", "GC_TXQ"), "UART_TXD", "TX hattı: boşta 1, başlangıç 0, veri, bitiş 1");

  b.block = "UART alıcı";
  b.place("74HC74", {
    "1D": "GC_URX", "1CLK": "TCLK", "~1PRE": "VCC", "~1CLR": "VCC", "1Q": "GC_RXS1",
    "2D": "GC_RXS1", "2CLK": "TCLK", "~2PRE": "VCC", "~2CLR": "VCC", "2Q": "GC_RXS2", "~2Q": "~GC_RXS2",
  }, "RX hattı eşzamanlayıcı (iki kademe)");
  b.place("74HC74", {
    "1D": "GC_TXBUSY_D", "1CLK": "TCLK", "~1PRE": "~GC_WE0", "~1CLR": "~RESET", "1Q": "GC_TXBUSY", "~1Q": "GC_TXEMPTY",
    "2D": "GC_RXBUSY_D", "2CLK": "TCLK", "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "GC_RXBUSY", "~2Q": "~GC_RXBUSY",
  }, "TX meşgul (TX_EMPTY = Q̅), RX çerçeve alınıyor");
  b.or(b.and("GC_RXBUSY", "~GC_RXDONE"), b.and("~GC_RXBUSY", "~GC_RXS2"), "GC_RXBUSY_D", "başlangıç biti / çerçeve sonu");
  b.nor("GC_RXEND", "~GC_RXBUSY", "~GC_RXLD", "bölücü yükle: boştayken 19, örnekte 0");
  b.place("74HC161", {
    "~MR": "VCC", CP: "TCLK", "~PE": "~GC_RXLD", CEP: "VCC", CET: "VCC",
    D0: "~GC_RXBUSY", D1: "~GC_RXBUSY", D2: "GND", D3: "GND", Q1: "GC_RXD1", TC: "GC_RXDTC",
  }, "alıcı bit bölücüsü (düşük)");
  b.place("74HC161", {
    "~MR": "VCC", CP: "TCLK", "~PE": "~GC_RXLD", CEP: "VCC", CET: "GC_RXDTC",
    D0: "~GC_RXBUSY", D1: "GND", D2: "GND", D3: "GND", Q1: "GC_RXD5",
  }, "alıcı bit bölücüsü (yüksek)");
  b.and("GC_RXD5", "GC_RXD1", "GC_RXEND", "örnek anı (bölücü 34)");
  b.place("74HC161", {
    "~MR": "GC_RXBUSY", CP: "TCLK", "~PE": "VCC", CEP: "GC_RXEND", CET: "GC_RXEND",
    D0: "GND", D1: "GND", D2: "GND", D3: "GND", Q0: "GC_RB0", Q3: "GC_RB3",
  }, "alıcı örnek sayacı (0 başlangıç, 1–8 veri, 9 bitiş)");
  b.and("GC_RB3", "GC_RB0", "GC_RB9", "bitiş biti örneği");
  b.and("GC_RXEND", "GC_RB9", "GC_RXDONE", "bayt tamam");
  b.not("GC_RXDONE", "~GC_RXDONE", "bayt tamam");
  b.or("TCLK", b.nand("GC_RXEND", b.not("GC_RB9")), "GC_RXSHCP", "kaydırma saati (örnek 0–8)");
  b.or("TCLK", "~GC_RXDONE", "GC_RXSTCP", "çıkış register'ı saati (örnek 9)");
  const rx: Conn = { DS: "GC_RXS2", SHCP: "GC_RXSHCP", STCP: "GC_RXSTCP", "~MR": "VCC", "~OE": "~GC_RD0" };
  range(8).forEach((i) => (rx[`Q${i}`] = `DE${7 - i}`)); // ilk gelen bit (LSB) en uzağa kayar
  b.place("74HC595", rx, "UART alıcı kaydırma register'ı + UART_DATA (FF00 okuma)");
  b.and("~RESET", "~GC_RDU_Q", "~GC_RXCLR", "RX_READY sil: UART_DATA okundu");

  b.block = "UART konnektörü";
  // RTS# = RX_READY: bayt bekliyorken köprü göndermez. 3. pin (modülün VCC'si) boş: kart kendi
  // adaptöründen beslenir, USB'nin 5 V'u kartın 5 V'una bağlanmaz.
  b.passive("CONN_CH340", { "1": "GND", "2": "GC_RXRDY", "4": "UART_RXD", "5": "UART_TXD" },
    "CH340 USB-UART modülü (TXD → kart RX, RXD ← kart TX, CTS# ← RTS# = RX_READY)");
}

// ============================================================================= PS/2
//
// Klavye saatin düşen kenarında veri biti hazır tutar. Saat 74HC14'ten terslenerek doğrudan
// kaydırma register'ına ve bit sayacına gider. 9 kenar kaydırılır (başlangıç biti dışarı düşer,
// 8 veri biti kalır); 10. kenarda bayt çıkış register'ına alınır (eşlik biti denetlenmez); 11. kenarda
// (bitiş biti) READY kurulur. READY iken 74HC05 saat hattını aşağı çeker: klavye sonraki baytı
// bekletir. KBD_DATA okununca sayaç ve READY silinir, hat bırakılır.
// Sayaç yalnız saat düşükken değişir; kaydırma/yükleme saatleri "saat ∨ etkin değil" biçiminde
// olduğundan sayaç geçişleri saat hattında parazit üretmez.
function buildPs2(b: Board): ChipInstance {
  b.block = "PS/2 klavye";
  b.place("74HC161", {
    "~MR": "~GC_KCLR", CP: "GC_KCLKN", "~PE": "VCC", CEP: "VCC", CET: "VCC",
    D0: "GND", D1: "GND", D2: "GND", D3: "GND", Q0: "GC_KB0", Q1: "GC_KB1", Q3: "GC_KB3",
  }, "PS/2 bit sayacı (düşen saat kenarları)");
  b.and("GC_KB3", b.or("GC_KB0", "GC_KB1"), "GC_KGE9", "9 bit alındı: kaydırma durur");
  b.not("GC_KB1", "~GC_KB1", "sayaç biti 1 tersi");
  b.nand(b.and("GC_KB3", "GC_KB0"), "~GC_KB1", "~GC_KEQ9", "sayaç = 9");
  b.and(b.and("GC_KB3", "GC_KB1"), b.not("GC_KB0"), "GC_KEQ10", "sayaç = 10: sonraki kenar bitiş biti");
  b.or("GC_KCLKN", "GC_KGE9", "GC_KSHCP", "kaydırma saati (kenar 1–9)");
  b.or("GC_KCLKN", "~GC_KEQ9", "GC_KSTCP", "çıkış register'ı saati (kenar 10)");
  const conn: Conn = { DS: "GC_KDAT", SHCP: "GC_KSHCP", STCP: "GC_KSTCP", "~MR": "VCC", "~OE": "~GC_RD1" };
  range(8).forEach((i) => (conn[`Q${i}`] = `DE${7 - i}`));
  const kbd = b.place("74HC595", conn, "PS/2 kaydırma register'ı + KBD_DATA (FF02 okuma)");
  b.and("~RESET", "~GC_RDK_Q", "~GC_KCLR", "KBD_DATA okundu: sayaç ve READY silinir");
  b.place("74HC05", {
    "1A": "GC_KRDY", "1Y": "PS2_CLK",
    "2A": "GND", "3A": "GND", "4A": "GND", "5A": "GND", "6A": "GND",
  }, "PS/2 saat hattını READY iken aşağı çek (inhibit, açık-akaç)");
  b.passive("R_10K", { "1": "VCC", "2": "PS2_CLK" }, "PS/2 saat çekme direnci");
  b.passive("R_10K", { "1": "VCC", "2": "PS2_DAT" }, "PS/2 veri çekme direnci");
  b.pulls.push({ net: b.n("PS2_CLK"), level: 1 }, { net: b.n("PS2_DAT"), level: 1 });
  b.passive("CONN_PS2", { "1": "PS2_DAT", "3": "GND", "4": "VCC", "5": "PS2_CLK" }, "PS/2 klavye konnektörü");
  return kbd;
}

// ============================================================================= zamanlayıcı
//
// Ön bölücü: 3 × 74HC161, 96..4095 sayar (4000 durum), uç sayımda (TC) bir döngü boyunca TICKP = 1;
// bir sonraki TCLK kenarı "tık"tır. Reset süresince her kenarda 96 yüklenir: reset'ten sonraki son
// yükleme kenarı 0. kenar sayılırsa tıklar 4000, 8000, … kenarlarındadır (Machine: TICK_CYCLES).
//
// Sayaç: 4 × 74HC193, gerçek değeri tutar (c). Machine'deki gibi:
//   - EN 0 → 1 yazılırken (yazma darbesi içinde) c ← RELOAD asenkron yüklenir;
//   - tıkta EN ise c > 1: c ← c − 1 (TDCLK, tıktan önceki döngünün TCLK-düşük yarısında düşer,
//     tık kenarında yükselir); c = 1: azaltmak yerine yeniden yükle ve EXPIRED kur (aynı kenarda).
//   c = 1 iki 74HC688 ile algılanır. Yeniden yükleme tık kenarını izleyen yarım döngüde (TCLK
//   yüksekken, aynı döngüdeki bir yazma darbesinden önce) asenkron (~PL) yapılır; sayaç değeri
//   dışarıdan okunamadığı için bu yarım döngülük gecikme görünmez. Darbeyi iki flip-flop üretir
//   (tık kenarında kurulan TRL, düşen kenarda kurulan TRL2): TCLK ile kapılanmadığı için sıçramasızdır.
function buildTimer(b: Board): { timer: ChipInstance[]; prescaler: ChipInstance[] } {
  b.block = "Zamanlayıcı";
  const prescaler = [
    b.place("74HC161", {
      "~MR": "VCC", CP: "TCLK", "~PE": "~GC_PLD", CEP: "VCC", CET: "VCC",
      D0: "GND", D1: "GND", D2: "GND", D3: "GND", TC: "GC_P0TC",
    }, "1 kHz ön bölücü bit 0–3 (TCLK / 4000)"),
    b.place("74HC161", {
      "~MR": "VCC", CP: "TCLK", "~PE": "~GC_PLD", CEP: "VCC", CET: "GC_P0TC",
      D0: "GND", D1: "VCC", D2: "VCC", D3: "GND", TC: "GC_P1TC",
    }, "1 kHz ön bölücü bit 4–7 (yükleme değeri 96)"),
    b.place("74HC161", {
      "~MR": "VCC", CP: "TCLK", "~PE": "~GC_PLD", CEP: "VCC", CET: "GC_P1TC",
      D0: "GND", D1: "GND", D2: "GND", D3: "GND", TC: "GC_TICKP",
    }, "1 kHz ön bölücü bit 8–11 (TC: sonraki kenar tık)"),
  ];
  b.nor("GC_TICKP", "GC_RST", "~GC_PLD", "ön bölücü: uç sayımda ya da resette 96 yükle");

  const reload = (lane: "DE" | "DO", cp: string, base: number, role: string) => {
    const conn: Conn = { "~OE": "GND", CP: cp };
    range(8).forEach((i) => {
      conn[`D${i}`] = `${lane}${i}`;
      conn[`Q${i}`] = `GC_R${base + i}`;
    });
    b.place("74HC574", conn, role);
  };
  reload("DE", "~GC_WE2", 0, "TIMER_RELOAD düşük bayt (FF04)");
  reload("DO", "~GC_WO2", 8, "TIMER_RELOAD yüksek bayt (FF05)");
  readBuf(b, range(8).map((i) => `GC_R${i}`), "DE", "~GC_RD2", "GND", "TIMER_RELOAD düşük bayt okuma");
  readBuf(b, range(8).map((i) => `GC_R${8 + i}`), "DO", "~GC_RD2", "GND", "TIMER_RELOAD yüksek bayt okuma");

  b.place("74HC175", {
    "~MR": "~RESET", CP: "~GC_WE3", D0: "DE0", D1: "DE1", D2: "GND", D3: "GND",
    Q0: "GC_TEN", "~Q0": "~GC_TEN", Q1: "GC_TIRQEN",
  }, "TIMER_CTRL (FF06): EN, IRQ_EN");
  readBuf(b, ["GC_TEN", "GC_TIRQEN"], "DE", "~GC_RD3", "GND", "TIMER_CTRL okuma");
  readBuf(b, ["GC_EXPIRED"], "DO", "~GC_RD3", "GND", "TIMER_STAT okuma");

  // EN 0 → 1 yazılırken sayaç RELOAD'u yükler (yazma darbesi boyunca)
  b.and(b.and(b.not("~GC_WE3"), "DE0"), "~GC_TEN", "GC_TLDEN", "açılırken yükle");
  b.and("GC_TICKP", "GC_TEN", "GC_TTICK", "bu döngünün sonu sayaç tıkı");
  b.and("GC_TTICK", "GC_Z1", "GC_RLD", "tıkta c = 1: yeniden yükle, EXPIRED");
  b.and("GC_TTICK", "~GC_Z1", "GC_DECP", "tıkta c > 1 (ya da 0): azalt");
  b.nand("GC_DECP", "GC_TCLKN", "GC_TDCLK", "azaltma saati (tık kenarında yükselir)");
  // Darbe = GC_TRL ∧ ¬GC_TRL2: TRL tık kenarında, TRL2 (aynı bilginin düşen kenardaki kopyası) yarım
  // döngü sonra kurulur. Girişler hiçbir zaman aynı anda değişmediği için darbe parazitsizdir; TCLK ile
  // kapılanmış (TRL ∧ TCLK) bir darbe, sonraki kenarda TRL düşmeden önce kısa bir sıçrama üretirdi.
  b.and("GC_TRL", "~GC_TRL2", "GC_RLPULSE", "yeniden yükleme darbesi (tık kenarını izleyen yarım döngü)");
  b.nor("GC_TLDEN", "GC_RLPULSE", "~GC_TPL", "sayaç yükleme");
  b.or("GC_RLD", "GC_EXPIRED", "GC_EXP_D", "EXPIRED kur / tut");
  b.and("~RESET", b.nand(b.not("~GC_WO3"), "DO0"), "~GC_EXPCLR", "TIMER_STAT'a 1 yazınca sil");
  b.place("74HC74", {
    "1D": "GC_RLD", "1CLK": "TCLK", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "GC_TRL",
    "2D": "GC_EXP_D", "2CLK": "TCLK", "~2PRE": "VCC", "~2CLR": "~GC_EXPCLR", "2Q": "GC_EXPIRED",
  }, "yeniden yükleme isteği, EXPIRED (FF07)");
  b.place("74HC74", {
    "1D": "GC_TRL", "1CLK": "GC_TCLKN", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "GC_TRL2", "~1Q": "~GC_TRL2",
    "2D": "GND", "2CLK": "GND", "~2PRE": "VCC", "~2CLR": "VCC",
  }, "yeniden yükleme darbesinin sonu (TCLK düşen kenarı)");

  const timer: ChipInstance[] = [];
  for (let k = 0; k < 4; k++) {
    const conn: Conn = {
      MR: "GC_RST", "~PL": "~GC_TPL", CPU: "VCC", CPD: k === 0 ? "GC_TDCLK" : `~GC_TBR${k - 1}`, "~TCD": `~GC_TBR${k}`,
    };
    range(4).forEach((i) => {
      conn[`D${i}`] = `GC_R${4 * k + i}`;
      conn[`Q${i}`] = `GC_C${4 * k + i}`;
    });
    timer.push(b.place("74HC193", conn, `zamanlayıcı sayacı bit ${4 * k}–${4 * k + 3}`));
  }
  const cmp = (base: number, value: number, out: string, role: string) => {
    const conn: Conn = { "~E": "GND", "~EQ": out };
    range(8).forEach((i) => {
      conn[`P${i}`] = `GC_C${base + i}`;
      conn[`Q${i}`] = (value >> i) & 1 ? "VCC" : "GND";
    });
    b.place("74HC688", conn, role);
  };
  cmp(0, 1, "~GC_Z1L", "sayaç = 1 algılama (düşük bayt = 01)");
  cmp(8, 0, "~GC_Z1H", "sayaç = 1 algılama (yüksek bayt = 00)");
  b.nor("~GC_Z1L", "~GC_Z1H", "GC_Z1", "sayaç = 1");
  b.not("GC_Z1", "~GC_Z1", "sayaç ≠ 1");
  return { timer, prescaler };
}

// ============================================================================= kesme denetleyicisi
//
// IRQ_PEND = {vsync, UART RX_READY, klavye READY, EXPIRED ∧ IRQ_EN}; IRQ_MASK bir 74HC175 (reset 0).
// Maskeli istekler 74HC148'e girer: ~GS düşükse IRQ = 1 ve IRQ_SRC = en yüksek numara. Hiç istek
// yokken (~GS yüksek) IRQ_SRC tamponu kapalı kalır, veriyolu çekme dirençleri 0xFF okutur.
function buildIrq(b: Board): void {
  b.block = "Kesme denetleyicisi";
  b.place("74HC175", {
    "~MR": "~RESET", CP: "~GC_WO4", D0: "DO0", D1: "DO1", D2: "DO2", D3: "DO3",
    Q0: "GC_M0", Q1: "GC_M1", Q2: "GC_M2", Q3: "GC_M3",
  }, "IRQ_MASK (FF09)");
  b.and("GC_EXPIRED", "GC_TIRQEN", "GC_P0", "kaynak 0: zamanlayıcı");
  const pend = ["GC_P0", "GC_KRDY", "GC_RXRDY", "VSYNC_REQ"];
  const conn: Conn = { "~EI": "GND", "~A0": "~GC_SA0", "~A1": "~GC_SA1", "~GS": "~GC_GS" };
  pend.forEach((p, k) => (conn[`~I${k}`] = b.nand(p, `GC_M${k}`, `~GC_I${k}`, `kaynak ${k} maskeli`)));
  for (let k = 4; k < 8; k++) conn[`~I${k}`] = "VCC";
  b.place("74HC148", conn, "öncelik kodlayıcı: IRQ_SRC, IRQ");
  b.not("~GC_GS", "IRQ", "IRQ hattı = OR(bekleyen ∧ maske)");
  readBuf(b, [b.not("~GC_SA0", "GC_SA0"), b.not("~GC_SA1", "GC_SA1")], "DE", "~GC_RD5", "~GC_GS",
    "IRQ_SRC okuma (istek yoksa sürülmez: 0xFF)");
  readBuf(b, pend, "DE", "~GC_RD4", "GND", "IRQ_PEND okuma");
  readBuf(b, ["GC_M0", "GC_M1", "GC_M2", "GC_M3"], "DO", "~GC_RD4", "GND", "IRQ_MASK okuma");

  b.block = "Durum register'ları";
  readBuf(b, ["GC_RXRDY", "GC_TXEMPTY"], "DO", "~GC_RD0", "GND", "UART_STAT okuma (RX_READY, TX_EMPTY)");
  readBuf(b, ["GC_KRDY"], "DO", "~GC_RD1", "GND", "KBD_STAT okuma (READY)");
  b.place("74HC74", {
    "1D": "VCC", "1CLK": "GC_RXSTCP", "~1PRE": "VCC", "~1CLR": "~GC_RXCLR", "1Q": "GC_RXRDY",
    "2D": "GC_KEQ10", "2CLK": "GC_KCLKN", "~2PRE": "VCC", "~2CLR": "~GC_KCLR", "2Q": "GC_KRDY",
  }, "RX_READY (= RTS#), klavye READY");
}
