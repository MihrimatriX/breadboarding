// Anakart bellek kartı ("bellek", Faz 6): bank register'ları, G/Ç alanı çözümü, 32 KB EEPROM
// (28C256) ve 128 KB RAM (4 × 62256). Ayrıntı ve zamanlama çizimi: cpu16/docs/anakart-kartlari.md
//
// Adres çevirme (emülatördeki Machine.physAddr ile aynı):
//   A15..A8 = 0xFF          → G/Ç alanı: ~IO = 0 (74HC688), bellek çipleri seçilmez
//   fiziksel = BANKn · 0x4000 + A13..A0, n = A15..A14 (74HC153 ile seçilir → PA14..PA19)
//   tek bir 74HC138 (C B A = PA19 PA16 PA15, PA18 = PA17 = 0 ve ~IO = 1 iken):
//   Y0: PA19..PA15 = 00000  → EEPROM (0x00000–0x07FFF, bank 0–1)
//   Y4..Y7: 100xx           → RAM 0..3 (0x80000–0x9FFFF, bank 32–39; her 62256 iki bank)
//   diğerleri               → boş: veri yolu dirençlerle 0xFF okunur, yazmalar kaybolur
// Bank register'ları FF10..FF13 (74HC273, reset'te 0/32/33/34; 1 olması gereken bitler register'da
// ters saklanır: girişte ve çıkışta birer evirici). Okumada üst iki bit 0.
//
// Veri yolu 16 bit (DE = çift bayt, DO = tek bayt), bellek çipleri 8 bit: kart bir kelimeyi iki
// bayt halinde sırayla okur/yazar. Bunun için bekleme turları gerekir; ~WAIT'i önbellek kartı
// üretir (isabet/ıskalamayı o bilir), bu kart TCLK ile ~WAIT'i izleyerek aynı sırayı yürütür:
//
//   t (osilatör periyodu, CLK'nin düşen kenarından)   0 F   2    6    10   14   18 20 R  22   24 F'
//   TCLK                                             ‾‾‾‾‾\____/‾‾‾‾\____/‾‾‾‾\____/‾‾‾‾‾
//   SA (TCLK↑, D = bekleme var)                      ________|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾|____
//   SC = BSEL (TCLK↓, D = SA)                        _____________|‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾  (26'da düşer)
//   çift bayt yazma (~MWR)                                ‾\____/‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾  [2,6)
//   tek bayt yazma  (~MWR)                           ‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾‾\____/‾‾‾‾‾‾‾‾‾  [14,18)
//   çift bayt mandalı (574)                                 ↑ t = 6 (BSEL = 0 iken)
//   DE/DO sürme (okuma)                                          [10 ............. 22)
// Adres biti A0'ı (BSEL) değiştiren kenar ile yazma darbesini bitiren kenar hep farklıdır (en az 4
// osilatör periyodu ara); yazma verisi darbeden önce ve sonra en az 4 periyot sabittir.
// Okuma: çift bayt t = 6'da 74HC574'e alınır, BSEL t = 10'da 1 olur, tek bayt doğrudan 74HC245
// ile DO'ya gider; CPU ikisini R = 20'de örnekler. Kelime/bayt ayrımı yok: her okuma iki baytı okur.
// Yazma: CPU'nun ~MWE_E/~MWE_O darbesi yalnızca WEL_E/WEL_O bayraklarını kurar (R'de silinir);
// asıl bellek darbeleri yukarıdaki pencerelerdedir.

import type { MemoryHandle } from "../chips/parts/memory.ts";
import { RAM_SIZE, RESET_BANKS } from "../emu/machine.ts";
import type { Board, ChipInstance } from "./board.ts";

export interface MemCard {
  /** 28C256: BIOS EEPROM'u */
  eeprom: ChipInstance;
  /** 4 × 62256: RAM 0..3 (her biri 32 KB = iki bank) */
  ram: ChipInstance[];
  /** RAM çiplerinin içeriği tek dizide (fiziksel 0x80000'den; çiplerin tutamaçları bunun dilimleridir) */
  ramData: Uint8Array;
  /** 74HC273 × 4: BANK0..BANK3 */
  banks: ChipInstance[];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function buildMemCard(b: Board): MemCard {
  b.card = "bellek";

  // ---- adres çözme
  b.block = "Adres çözme";
  const io: Record<string, string> = { "~E": "GND", "~EQ": "~IO" };
  range(8).forEach((i) => {
    io[`P${i}`] = `A${i + 8}`;
    io[`Q${i}`] = "VCC";
  });
  b.place("74HC688", io, "G/Ç alanı: A15..A8 = 0xFF → ~IO = 0");
  const bank: Record<string, string> = { "~E": "~IO", "~EQ": "~BANKSEL" };
  range(8).forEach((i) => {
    bank[`P${i}`] = i < 6 ? `A${i + 2}` : "GND";
    bank[`Q${i}`] = i === 2 ? "VCC" : "GND"; // A7..A2 = 000100 → FF10..FF13
  });
  b.place("74HC688", bank, "bank register'ları: FF10..FF13");
  b.place("74HC139", {
    "~1E": "~BANKSEL", "1A0": "A1", "1A1": "GND", "~1Y0": "~BSEL01", "~1Y1": "~BSEL23",
    "~2E": "VCC", "2A0": "GND", "2A1": "GND",
  }, "bank register seçimi (FF10/11, FF12/13)");

  // ---- bank register'ları
  b.block = "Bank register'ları";
  const strobe = ["~MWE_E", "~MWE_O", "~MWE_E", "~MWE_O"];
  const sel = ["~BSEL01", "~BSEL01", "~BSEL23", "~BSEL23"];
  const banks = range(4).map((k) => {
    const lane = k & 1 ? "DO" : "DE";
    const cp = b.or(strobe[k], sel[k], `BANK${k}_CP`, `BANK${k} yazma kenarı`);
    const conn: Record<string, string | number> = { "~MR": "~RESET", CP: cp, D6: "GND", D7: "GND" };
    range(6).forEach((i) => {
      if ((RESET_BANKS[k] >> i) & 1) {
        // reset değeri 1 olan bit: register'da ters saklanır
        conn[`D${i}`] = b.not(`${lane}${i}`, `~BANK${k}_D${i}`, `BANK${k} bit ${i} reset değeri 1`);
        conn[`Q${i}`] = `~BANK${k}_${i}`;
        b.not(`~BANK${k}_${i}`, `BANK${k}_${i}`, `BANK${k} bit ${i} reset değeri 1`);
      } else {
        conn[`D${i}`] = `${lane}${i}`;
        conn[`Q${i}`] = `BANK${k}_${i}`;
      }
    });
    return b.place("74HC273", conn, `BANK${k} (FF1${k}), reset değeri ${RESET_BANKS[k]}`);
  });
  // fiziksel adresin üst bitleri: A15..A14 hangi bank register'ı
  range(3).forEach((j) => {
    const conn: Record<string, string> = { S0: "A14", S1: "A15", "~1E": "GND", "~2E": "GND" };
    for (const u of [1, 2]) {
      const bit = 2 * j + u - 1;
      range(4).forEach((k) => (conn[`${u}I${k}`] = `BANK${k}_${bit}`));
      conn[`${u}Y`] = `PA${14 + bit}`;
    }
    b.place("74HC153", conn, `PA${14 + 2 * j}, PA${15 + 2 * j}: A15..A14 ile bank seçimi`);
  });
  // geri okuma: üst iki bit 0
  range(4).forEach((k) => {
    const lane = k & 1 ? "DO" : "DE";
    const conn: Record<string, string> = { "~OE1": "~MRD", "~OE2": sel[k] };
    range(8).forEach((i) => {
      conn[`A${i}`] = i < 6 ? `BANK${k}_${i}` : "GND";
      conn[`Y${i}`] = `${lane}${i}`;
    });
    b.place("74HC541", conn, `BANK${k} geri okuma`);
  });

  // ---- bayt sıralayıcı
  b.block = "Bayt sıralayıcı";
  b.not("~WAIT", "M_WAITING", "bekleme sürüyor");
  b.not("TCLK", "~M_TCLK", "TCLK tersi");
  b.not("~MRD", "M_MRD", "okuma");
  b.place("74HC74", {
    "1D": "M_WAITING", "1CLK": "TCLK", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "M_SA", "~1Q": "~M_SA",
    "2D": "M_SA", "2CLK": "~M_TCLK", "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "BSEL", "~2Q": "~BSEL",
  }, "sıralayıcı: SA (TCLK↑), BSEL (TCLK↓)");
  b.place("74HC74", {
    "1D": "GND", "1CLK": "CLK", "~1PRE": "~MWE_E", "~1CLR": "~RESET", "1Q": "M_WEL_E",
    "2D": "GND", "2CLK": "CLK", "~2PRE": "~MWE_O", "~2CLR": "~RESET", "2Q": "M_WEL_O",
  }, "yazma bayrakları: CPU darbesiyle kurulur, CLK↑ ile silinir");
  b.and("M_SA", "BSEL", "M_SODD", "tek bayt evresi [10, 22)");
  b.and("M_WEL_E", "~IO", "M_WEM", "bellekte çift bayt yazılacak");
  b.nor("TCLK", "M_SA", "M_EWIN", "çift bayt yazma penceresi [2, 6)");
  b.and("M_WEM", "M_EWIN", "M_EWR", "çift bayt yazma darbesi");
  b.and("TCLK", "BSEL", "M_OWIN", "tek bayt yazma penceresi [14, 18)");
  b.and("M_OWIN", "M_WEL_O", "M_OWR", "tek bayt yazma darbesi");
  b.nor("M_EWR", "M_OWR", "~MWR", "bellek çiplerinin ~WE'si");
  b.and("TCLK", "~BSEL", "M_LCP", "çift bayt mandalı saati (t = 6)");
  b.nand("M_SODD", "M_MRD", "~M_RDDRV", "okumada veri yolunu sür [10, 22)");
  b.nand("M_WEM", "~BSEL", "~M_EVEN_OE", "çift bayt verisi → MD");
  b.nand("M_SODD", b.or("M_MRD", "M_WEL_O", undefined, "tek bayt aktarımı"), "~M_ODD_OE", "tek bayt aktarımı");

  const latch: Record<string, string> = { "~OE": "~M_RDDRV", CP: "M_LCP" };
  range(8).forEach((i) => {
    latch[`D${i}`] = `MD${i}`;
    latch[`Q${i}`] = `DE${i}`;
  });
  b.place("74HC574", latch, "okuma: çift bayt mandalı → DE");
  const even: Record<string, string> = { DIR: "VCC", "~OE": "~M_EVEN_OE" };
  const odd: Record<string, string> = { DIR: "~MRD", "~OE": "~M_ODD_OE" };
  range(8).forEach((i) => {
    even[`A${i}`] = `DE${i}`;
    even[`B${i}`] = `MD${i}`;
    odd[`A${i}`] = `DO${i}`;
    odd[`B${i}`] = `MD${i}`;
  });
  b.place("74HC245", even, "yazma: DE → MD (çift bayt)");
  b.place("74HC245", odd, "tek bayt: MD ↔ DO");

  // ---- bellek çipleri: hepsi 32 K × 8, aynı bacak düzeni (A0 = bayt seçimi, A14 = PA14)
  b.block = "EEPROM ve RAM";
  const memConn = (ce: string) => {
    const conn: Record<string, string> = { "~CE": ce, "~OE": "~MRD", "~WE": "~MWR", A0: "BSEL", A14: "PA14" };
    for (let i = 1; i < 14; i++) conn[`A${i}`] = `A${i}`;
    range(8).forEach((i) => (conn[`IO${i}`] = `MD${i}`));
    return conn;
  };
  const eeprom = b.place("28C256", memConn("~CE_ROM"), "EEPROM 32 KB: fiziksel 0x00000–0x07FFF (BIOS: bank 0, kullanıcı: bank 1)", { footprint: "Package_DIP:DIP-28_W15.24mm_Socket" });
  const ram = range(4).map((k) => b.place("62256", memConn(`~CE_RAM${k}`),
    `RAM ${k}: fiziksel 0x${(0x80000 + k * 0x8000).toString(16).toUpperCase()}–0x${(0x87fff + k * 0x8000).toString(16).toUpperCase()} (bank ${32 + 2 * k}–${33 + 2 * k})`));
  b.pullUp(range(8).map((i) => `MD${i}`), "bellek veri yolu: boş bölge 0xFF okunur");
  const ramData = new Uint8Array(RAM_SIZE);
  ram.forEach((ci, k) => ((ci.handle as MemoryHandle).data = ramData.subarray(k * 0x8000, (k + 1) * 0x8000)));

  b.block = "Adres çözme";
  b.place("74HC138", {
    A0: "PA15", A1: "PA16", A2: "PA19", "~E1": "PA17", "~E2": "PA18", E3: "~IO",
    "~Y0": "~CE_ROM", "~Y4": "~CE_RAM0", "~Y5": "~CE_RAM1", "~Y6": "~CE_RAM2", "~Y7": "~CE_RAM3",
  }, "çip seçimi: EEPROM (PA19..PA15 = 00000), RAM 0..3 (100xx); diğerleri boş");

  // ---- arka panel veri yolu çekme dirençleri (sürülmeyen G/Ç adresi 0xFF okunur)
  b.block = "Veri yolu";
  b.pullUp(range(8).map((i) => `DE${i}`), "DE çekme dirençleri");
  b.pullUp(range(8).map((i) => `DO${i}`), "DO çekme dirençleri");

  return { eeprom, ram, ramData, banks };
}
