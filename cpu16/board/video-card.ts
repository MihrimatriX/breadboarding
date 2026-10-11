// Anakart video kartı (Faz 6, kapı seviyesi): 80 × 30 metin, 640 × 480 @ 60 Hz VGA, 16 renk (IRGB).
// Register'lar FF20–FF26; davranış modeli emu/devices/simple.ts VideoCard + machine.ts (vblank, VSTAT).
// Tasarım belgesi: cpu16/docs/anakart-gc-video.md
//
// Zaman tabanı kartın kendi osilatörüdür (VID_OSC, 25,175 MHz piksel saati); CPU saatinden
// bağımsızdır. Satır 800, kare 525 satır (görünür 640 × 480, HSYNC ve VSYNC negatif kutuplu).
//
// Bir karakter = 8 piksel saati (p0..p7, H2..H0). VRAM erişimi iki yuvaya bölünür:
//   p0..p3 (H2 = 0) tarama: adres = MA (tarama sayacı), p4'ün başında karakter ve renk baytı tutulur
//   p4..p7 (H2 = 1) CPU: adres = VADDR; bekleyen bir yazma ya da ön okuma (prefetch) burada yapılır
// Bu yüzden CPU erişimi taramayı hiç bozmaz (kar / "snow" yok) ve CPU'yu bekletmez.
//
// Ardışık düzen (pipeline): H karakteri j'de MA'daki karakter okunur, karakter ROM'una girer ve
// j'nin sonunda piksel kaydırıcısına yüklenir; j + 1 boyunca ekrana çıkar. Görüntü bu yüzden sayaca
// göre 8 piksel geride başlar: görünür piksel x, satırın hc = x + 8 anındadır. Senkron ve karartma
// sinyalleri de aynı karakter sınırında bir register'dan geçtiği için hepsi birlikte kayar; VGA
// zamanlaması (ön/arka sundurma, senkron genişliği) görünür alana göre standarttır.
//
// CPU arayüzü (Machine ile aynı register'lar):
//   FF20/21 VADDR (13 bit, 4 × 74HC193, ~PL ile asenkron yükleme)    yalnız yazılır (okuma 0xFF)
//   FF22    VDATA: yazma → yazma isteği; okuma → ön okuma latch'i (aynı veriyolu döngüsünde)
//           her ikisi de VADDR'i artırır
//   FF23    VCTRL bit0 imleç açık          FF24/25 CURSOR_X / CURSOR_Y
//   FF26    VSTAT bit0 vblank, bit1 vsync bayrağı (1 yazınca silinir) = VSYNC_REQ (IRQ kaynağı 3)
// Yazma ve ön okuma piksel saati alanında yapılır; istekler iki flip-flop ile eşzamanlanır. Bir
// istek en geç ~3,5 CPU döngüsünde (yazma) / ~4,4 döngüde (okumadan sonraki ön okuma) biter; CPU'nun
// G/Ç komutları 6 döngü sürdüğü için ardışık iki erişim bunu her zaman bekler.

import type { Board, ChipInstance } from "./board.ts";

/** Kartın arka panelden ve osilatöründen gelen girişleri */
export const VIDEO_CARD_INPUTS = [
  "CLK", "~RESET", "~IO", "~MRD", "~MWE_E", "~MWE_O", "VID_OSC",
  ...Array.from({ length: 8 }, (_, i) => `A${i}`),
];

export interface VideoCard {
  /** VRAM: karakter (çift adresler) ve renk (tek adresler) şeritleri, 62256 */
  vramChar: ChipInstance;
  vramAttr: ChipInstance;
  /** karakter ROM'u (SST39SF010A, 4 KB font: adres = karakter × 16 + tarama satırı) */
  fontRom: ChipInstance;
  /** kare sayacı (74HC393): bit 4 imleç yanıp sönmesi */
  frames: ChipInstance;
  /** VADDR (4 × 74HC193, düşük basamak önce) */
  vaddr: ChipInstance[];
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);
type Conn = Record<string, string | number>;

export function buildVideoCard(b: Board): VideoCard {
  b.card = "video";

  // =========================================================================== adres çözme
  b.block = "Adres çözme";
  b.place("74HC138", { A0: "A4", A1: "A5", A2: "A6", "~E1": "~IO", "~E2": "A7", E3: "VCC", "~Y2": "~V_G" },
    "video grubu FF2x");
  const decoder = (strobe: string, outs: Record<number, string>, role: string) => {
    const conn: Conn = { A0: "A1", A1: "A2", A2: "A3", "~E1": "~V_G", "~E2": strobe, E3: "VCC" };
    for (const [k, n] of Object.entries(outs)) conn[`~Y${k}`] = n;
    b.place("74HC138", conn, role);
  };
  decoder("~MRD", { 1: "~V_RD1", 2: "~V_RD2", 3: "~V_RD3" }, "okuma: FF22/23, FF24/25, FF26");
  decoder("~MWE_E", { 0: "~V_WE0", 1: "~V_WE1", 2: "~V_WE2", 3: "~V_WE3" }, "çift bayt yazma: FF20, FF22, FF24, FF26");
  decoder("~MWE_O", { 0: "~V_WO0", 1: "~V_WO1", 2: "~V_WO2" }, "tek bayt yazma: FF21, FF23, FF25");
  b.not("~RESET", "V_RST", "reset (aktif yüksek)");

  // =========================================================================== zamanlama
  b.block = "Piksel saati ve sayaçlar";
  b.passive("OSC_25M175", { "1": "VCC", "7": "GND", "8": "VID_OSC", "14": "VCC" }, "25,175 MHz piksel osilatörü");
  const counter = (prefix: string, k: number, conn: Conn, role: string) => {
    const c: Conn = { CP: "VID_OSC", "~MR": "VCC", D0: "GND", D1: "GND", D2: "GND", D3: "GND", ...conn };
    range(4).forEach((i) => {
      if (4 * k + i < 10) c[`Q${i}`] = `${prefix}${4 * k + i}`;
    });
    b.place("74HC161", c, role);
  };
  // H: 0..799, 799'da eşzamanlı 0 yüklenir
  counter("V_H", 0, { "~PE": "~V_HEND", CEP: "VCC", CET: "VCC", TC: "V_HTC0" }, "yatay sayaç H0–H3 (piksel)");
  counter("V_H", 1, { "~PE": "~V_HEND", CEP: "VCC", CET: "V_HTC0", TC: "V_HTC1" }, "yatay sayaç H4–H7");
  counter("V_H", 2, { "~PE": "~V_HEND", CEP: "VCC", CET: "V_HTC1" }, "yatay sayaç H8–H9");
  b.and("V_H8", "V_H9", "V_H89");
  b.nand3("V_HTC0", "V_H4", "V_H89", "~V_HEND", "hc = 799 (satır sonu)");
  b.not("~V_HEND", "V_HEND", "satır sonu");
  // V: 0..524, satır sonlarında sayar
  counter("V_V", 0, { "~PE": "~V_VLD", CEP: "V_HEND", CET: "VCC", TC: "V_VTC0" }, "dikey sayaç V0–V3 (satır)");
  counter("V_V", 1, { "~PE": "~V_VLD", CEP: "V_HEND", CET: "V_VTC0", TC: "V_VTC1" }, "dikey sayaç V4–V7");
  counter("V_V", 2, { "~PE": "~V_VLD", CEP: "V_HEND", CET: "V_VTC1" }, "dikey sayaç V8–V9");
  b.and("V_V3", "V_V2", "V_V32");
  b.nand3("V_HEND", "V_V9", "V_V32", "~V_VLD", "vc = 524 ve satır sonu: kare sonu");

  b.block = "Çözümleme";
  // piksel fazı: p6'da LD7 kurulur (p7 boyunca 1); WRP p5..p6 (VRAM yazma darbesi)
  b.and(b.and("V_H2", "V_H1"), b.not("V_H0"), "V_P6", "p = 6");
  b.and("V_H2", b.not("V_H1"), "V_P45", "p = 4, 5");
  b.place("74HC74", {
    "1D": "V_P6", "1CLK": "VID_OSC", "~1PRE": "VCC", "~1CLR": "VCC", "1Q": "V_LD7", "~1Q": "~V_LD7",
    "2D": "V_P45", "2CLK": "VID_OSC", "~2PRE": "VCC", "~2CLR": "VCC", "2Q": "V_WRP",
  }, "karakter sonu (p7) ve VRAM yazma darbesi (p5–p6): parazitsiz");
  b.or("VID_OSC", "~V_LD7", "V_CLKA", "karakter sınırı saati (p7 → p0)");
  b.not("V_H2", "V_H2N", "CPU yuvası bitti (p0)");
  // yatay: görünür karakter < 80; satır sonu karakterleri 98, 99; senkron karakter 82..93
  b.and("V_H9", b.or("V_H8", "V_H7"), "V_HBL", "hc ≥ 640 (yatay karartma)");
  b.not("V_HBL", "V_HVIS", "görünür karakter (MA sayar)");
  b.and("V_H89", "V_H4", "V_H984", "karakter 98 / 99");
  b.nand("V_H984", "V_H3", "~V_HC99", "karakter 99: MA ← satır başı");
  b.and("V_H984", b.not("V_H3"), "V_HC98", "karakter 98: satır başı ← MA");
  b.and(b.and("V_H9", "V_H7"), b.not("V_H8"), "V_HSA", "karakter 80..95");
  b.and(b.or(b.or("V_H4", "V_H5"), "V_H6"), b.nand3("V_H4", "V_H5", "V_H6"), "V_HSB", "alt 4 bit 2..13");
  b.and("V_HSA", "V_HSB", "V_HSYNC_A", "karakter 82..93: HSYNC (96 piksel)");
  // dikey: vc ≥ 480 karartma; 490–491 senkron (74HC688); tarama satırı 14–15 imleç, 15 satır sonu
  b.or("V_V9", b.and(b.and("V_V8", "V_V7"), b.and("V_V6", "V_V5")), "V_VBL", "vc ≥ 480 (dikey karartma)");
  b.or("V_HBL", "V_VBL", "V_BLANK", "karartma");
  const vs: Conn = { "~E": "V_V9", "~EQ": "~V_VSYNC_A" };
  range(8).forEach((i) => {
    vs[`P${i}`] = `V_V${i + 1}`;
    vs[`Q${i}`] = (0xf5 >> i) & 1 ? "VCC" : "GND";
  });
  b.place("74HC688", vs, "VSYNC: vc = 490, 491");
  b.and("V_V32", "V_V1", "V_V321", "tarama satırı 14–15");
  b.and("V_V321", "V_V0", "V_SL15", "karakter satırının son tarama satırı");

  b.block = "Dikey tarama durumu";
  b.and("~RESET", b.nand(b.not("~V_WE3"), "DE1"), "~V_FCLR", "VSTAT'a bit1 = 1 yazınca bayrağı sil");
  b.place("74HC74", {
    "1D": "V_VBL", "1CLK": "VID_OSC", "~1PRE": "VCC", "~1CLR": "VCC", "1Q": "V_VBQ", "~1Q": "~V_VBQ",
    "2D": "VCC", "2CLK": "V_VBQ", "~2PRE": "VCC", "~2CLR": "~V_FCLR", "2Q": "VSYNC_REQ",
  }, "vblank (VSTAT bit0, eşzamanlı), vsync bayrağı (VSTAT bit1 = VSYNC_REQ)");
  b.place("74HC393", {
    "~1CP": "~V_VBQ", "1MR": "GND", "~2CP": "V_FR3", "2MR": "GND", "1Q3": "V_FR3", "2Q0": "V_BLINK",
  }, "kare sayacı: vblank başında sayar; bit 4 imleç yanıp sönmesi (16 kare)");
  readBuf(b, ["V_VBQ", "VSYNC_REQ"], "DE", "~V_RD3", "VSTAT okuma (FF26)");

  // =========================================================================== tarama adresi
  b.block = "Tarama adresi";
  // MA: H2'nin yükselen kenarında (p4) sayar; görünür karakterlerde artar, karakter 99'da satır
  // başını yükler; dikey karartmada 0. Satır başı (ROWSTART) karakter satırının son tarama
  // satırında (ya da karartmada) karakter 98'de MA'dan alınır.
  const ma = (k: number, conn: Conn) => {
    const c: Conn = { CP: "V_H2", "~MR": "~V_VBQ", "~PE": "~V_HC99", CEP: "V_HVIS", ...conn };
    range(4).forEach((i) => {
      c[`D${i}`] = `V_RS${4 * k + i}`;
      c[`Q${i}`] = `V_MA${4 * k + i}`;
    });
    b.place("74HC161", c, `tarama adresi MA${4 * k}–MA${4 * k + 3}`);
  };
  ma(0, { CET: "V_HVIS", TC: "V_MATC0" });
  ma(1, { CET: "V_MATC0", TC: "V_MATC1" });
  ma(2, { CET: "V_MATC1" });
  b.and("V_HC98", b.or("V_SL15", "V_VBQ"), "V_ENRS", "satır başını güncelle");
  b.and("V_H2", "V_ENRS", "V_RSCLK", "satır başı saati");
  for (const k of [0, 1]) {
    const c: Conn = { "~OE": "GND", CP: "V_RSCLK" };
    range(8).forEach((i) => {
      const bit = 8 * k + i;
      c[`D${i}`] = bit < 12 ? `V_MA${bit}` : "GND";
      if (bit < 12) c[`Q${i}`] = `V_RS${bit}`;
    });
    b.place("74HC574", c, `satır başı adresi (ROWSTART) bit ${8 * k}–${Math.min(8 * k + 7, 11)}`);
  }

  // =========================================================================== VRAM
  b.block = "VRAM";
  // adres seçici: p0..p3 MA, p4..p7 VADDR[12:1]
  for (let k = 0; k < 3; k++) {
    const c: Conn = { S: "V_H2", "~E": "GND" };
    range(4).forEach((i) => {
      const bit = 4 * k + i;
      c[`${i + 1}I0`] = `V_MA${bit}`;
      c[`${i + 1}I1`] = `V_ADR${bit + 1}`;
      c[`${i + 1}Y`] = `V_VA${bit}`;
    });
    b.place("74HC157", c, `VRAM adres seçici bit ${4 * k}–${4 * k + 3} (tarama / CPU)`);
  }
  // VRAM ~OE: CPU yuvasında yazarken kapalı (veriyi yazma register'ı sürer)
  b.and("V_OPW", "V_H2", "V_SOE", "VRAM çıkışı kapalı: CPU yazıyor");
  b.nand3("V_OPW", "V_WRP", "~V_ADR0", "~V_WEC", "karakter şeridine yaz (VADDR çift)");
  b.nand3("V_OPW", "V_WRP", "V_ADR0", "~V_WEA", "renk şeridine yaz (VADDR tek)");
  b.not("V_ADR0", "~V_ADR0");
  const sram = (lane: "C" | "A", role: string) => {
    const c: Conn = { "~CE": "GND", "~OE": "V_SOE", "~WE": `~V_WE${lane}`, A12: "GND", A13: "GND", A14: "GND" };
    range(12).forEach((i) => (c[`A${i}`] = `V_VA${i}`));
    range(8).forEach((i) => (c[`IO${i}`] = `V_${lane}D${i}`));
    return b.place("62256", c, role);
  };
  const vramChar = sram("C", "VRAM karakter şeridi (çift adresler; 4 KB kullanılır, A12–A14 = 0)");
  const vramAttr = sram("A", "VRAM renk şeridi (tek adresler; 4 KB kullanılır, A12–A14 = 0)");

  // =========================================================================== piksel yolu
  b.block = "Piksel yolu";
  const reg = (d: (i: number) => string, q: (i: number) => string, cp: string, role: string, oe = "GND") => {
    const c: Conn = { "~OE": oe, CP: cp };
    range(8).forEach((i) => {
      c[`D${i}`] = d(i);
      c[`Q${i}`] = q(i);
    });
    b.place("74HC574", c, role);
  };
  reg((i) => `V_CD${i}`, (i) => `V_CHR${i}`, "V_H2", "karakter kodu (p4'te VRAM'den)");
  reg((i) => `V_AD${i}`, (i) => `V_AT${i}`, "V_H2", "renk baytı (p4'te VRAM'den)");
  reg((i) => `V_AT${i}`, (i) => `V_ATD${i}`, "V_CLKA", "renk baytı (karakter sınırında, gösterilen karakterinki)");
  const rom: Conn = { "~CE": "GND", "~OE": "GND", "~WE": "VCC" };
  range(17).forEach((i) => (rom[`A${i}`] = i < 4 ? `V_V${i}` : i < 12 ? `V_CHR${i - 4}` : "GND"));
  range(8).forEach((i) => (rom[`DQ${i}`] = `V_FD${i}`));
  const fontRom = b.place("SST39SF010A", rom, "karakter ROM'u: 256 × 16 satır (adres = kod × 16 + tarama satırı)");
  const sh: Conn = { CP: "VID_OSC", "~CE": "GND", "~PE": "~V_LD7", DS: "GND", "~MR": "VCC", Q7: "V_PIX" };
  range(8).forEach((i) => (sh[`D${i}`] = `V_FD${i}`)); // bit 7 en soldaki piksel, ilk çıkar
  b.place("74HC166", sh, "piksel kaydırıcı (p7 → p0 kenarında yüklenir)");

  b.place("74HC175", {
    "~MR": "VCC", CP: "V_CLKA", D0: "V_BLANK", D1: "V_HSYNC_A", D2: "~V_VSYNC_A", D3: "V_CURR",
    Q0: "V_BLANKD", "~Q1": "VGA_HSYNC", Q2: "VGA_VSYNC", Q3: "V_CURD",
  }, "karartma, senkronlar (negatif) ve imleç: piksellerle aynı karakter sınırında");

  // imleç: VCTRL ∧ yanık yarı ∧ (sütun, satır) eşit ∧ tarama satırı 14–15
  const cmp = (p: string[], q: string, out: string, role: string) => {
    const c: Conn = { "~E": "GND", "~EQ": out };
    range(8).forEach((i) => {
      c[`P${i}`] = p[i] ?? "GND";
      c[`Q${i}`] = `${q}${i}`;
    });
    b.place("74HC688", c, role);
  };
  cmp(range(7).map((i) => `V_H${i + 3}`), "V_CX", "~V_CXEQ", "imleç sütunu = karakter sütunu");
  cmp(range(6).map((i) => `V_V${i + 4}`), "V_CY", "~V_CYEQ", "imleç satırı = karakter satırı");
  b.and(b.and("V_VCTL", b.not("V_BLINK")), b.and(b.nor("~V_CXEQ", "~V_CYEQ"), "V_V321"), "V_CURR", "imleç burada");

  b.block = "Renk ve DAC";
  const col: Conn = { S: "V_FGSEL", "~E": "V_BLANKD", "1Y": "V_B", "2Y": "V_G", "3Y": "V_R", "4Y": "V_I" };
  range(4).forEach((i) => {
    col[`${i + 1}I0`] = `V_ATD${i + 4}`; // zemin (yüksek 4 bit)
    col[`${i + 1}I1`] = `V_ATD${i}`; // yazı (düşük 4 bit)
  });
  b.or("V_PIX", "V_CURD", "V_FGSEL", "yazı rengi: piksel ya da imleç");
  b.place("74HC157", col, "IRGB: yazı / zemin rengi, karartmada siyah");
  // CGA kahverengisi: renk 6'da yeşil yarı parlaklıkta (0xAA5500)
  b.and(b.and("V_R", "V_G"), b.nor("V_I", "V_B"), "V_BROWN", "renk 6");
  b.and("V_G", b.not("V_BROWN"), "V_GH", "yeşil 2/3");
  b.or("V_I", "V_BROWN", "V_GL", "yeşil 1/3");
  // 75 Ω monitör girişine: renk biti 680 Ω (0,47 V), parlaklık 1,3 kΩ (0,25 V), ikisi 0,72 V
  for (const [hi, lo, out, name] of [["V_R", "V_I", "VGA_RED", "kırmızı"], ["V_GH", "V_GL", "VGA_GREEN", "yeşil"], ["V_B", "V_I", "VGA_BLUE", "mavi"]]) {
    b.passive("R_680", { "1": hi, "2": out }, `DAC ${name} (renk biti)`);
    b.passive("R_1K3", { "1": lo, "2": out }, `DAC ${name} (parlaklık)`);
  }
  b.passive("CONN_VGA", {
    "1": "VGA_RED", "2": "VGA_GREEN", "3": "VGA_BLUE", "5": "GND", "6": "GND", "7": "GND", "8": "GND", "10": "GND",
    "13": "VGA_HSYNC", "14": "VGA_VSYNC",
  }, "VGA konnektörü (DE-15)");

  // =========================================================================== CPU arayüzü
  b.block = "CPU arayüzü";
  // VADDR: yazmada asenkron yüklenir; VDATA okumasından sonraki döngüde ya da VRAM yazmasının
  // sonunda (p7 → p0) bir artar
  b.nor("~V_RD1", "A0", "V_RDD", "VDATA okunuyor (A0 = 0)");
  b.nand("V_OPW", "V_LD7", "~V_WINC", "yazma bitti: VADDR + 1 (p7)");
  b.and("~V_RDDQ", "~V_WINC", "V_INC", "VADDR artırma saati");
  const vaddr: ChipInstance[] = [];
  for (let k = 0; k < 4; k++) {
    const lane = k < 2 ? "DE" : "DO";
    const c: Conn = {
      MR: "V_RST", "~PL": k < 2 ? "~V_WE0" : "~V_WO0", CPD: "VCC", CPU: k === 0 ? "V_INC" : `~V_VTCU${k - 1}`,
      "~TCU": `~V_VTCU${k}`,
    };
    range(4).forEach((i) => {
      c[`D${i}`] = `${lane}${(4 * k + i) % 8}`;
      if (4 * k + i < 13) c[`Q${i}`] = `V_ADR${4 * k + i}`;
    });
    vaddr.push(b.place("74HC193", c, `VADDR bit ${4 * k}–${Math.min(4 * k + 3, 12)}`));
  }
  // istekler: yazma (WREQ) ve ön okuma (PREF); piksel alanında iki kademe eşzamanlama, p4'te işlem
  b.and(b.and("~V_WE0", "~V_WO0"), "V_INC", "V_PFCLK", "VADDR değişti: ön okuma iste");
  b.and("~V_OPW", "~RESET", "~V_WRCLR", "yazma isteği alındı");
  b.place("74HC74", {
    "1D": "VCC", "1CLK": "~V_WE1", "~1PRE": "VCC", "~1CLR": "~V_WRCLR", "1Q": "V_WREQ",
    "2D": "VCC", "2CLK": "V_PFCLK", "~2PRE": "~RESET", "~2CLR": "~V_OPR", "2Q": "V_PREF",
  }, "VDATA yazma isteği, ön okuma isteği");
  b.place("74HC74", {
    "1D": "V_WREQ", "1CLK": "V_H2N", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "V_WREQS", "~1Q": "~V_WREQS",
    "2D": "V_PREF", "2CLK": "V_H2N", "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "V_PREFS",
  }, "istek eşzamanlayıcı (p0)");
  b.and("V_PREFS", "~V_WREQS", "V_OPR_D", "yazma öncelikli");
  b.place("74HC74", {
    "1D": "V_WREQS", "1CLK": "V_H2", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "V_OPW", "~1Q": "~V_OPW",
    "2D": "V_OPR_D", "2CLK": "V_H2", "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "V_OPR", "~2Q": "~V_OPR",
  }, "bu CPU yuvasında: yazma / ön okuma");
  b.place("74HC74", {
    "1D": "V_RDD", "1CLK": "CLK", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "V_RDDQ", "~1Q": "~V_RDDQ",
    "2D": "DO0", "2CLK": "~V_WO1", "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "V_VCTL",
  }, "VDATA okuma yan etkisi (sonraki döngü), VCTRL (FF23)");
  // yazma verisi: FF22'ye yazılan bayt; yazma darbesinde VADDR0'ın seçtiği şeride sürülür
  reg((i) => `DE${i}`, (i) => `V_CD${i}`, "~V_WE1", "VDATA yazma verisi → karakter şeridi", "~V_WEC");
  reg((i) => `DE${i}`, (i) => `V_AD${i}`, "~V_WE1", "VDATA yazma verisi → renk şeridi", "~V_WEA");
  // ön okuma: VRAM[VADDR] her iki şeritten p7'de tutulur; VDATA okumasında VADDR0'a göre DE'ye
  b.and("V_OPR", "V_LD7", "V_RDCLK", "ön okuma latch saati (p7)");
  b.or("~V_RD1", "V_ADR0", "~V_RDC", "VDATA oku: karakter şeridi");
  b.or("~V_RD1", "~V_ADR0", "~V_RDA", "VDATA oku: renk şeridi");
  reg((i) => `V_CD${i}`, (i) => `DE${i}`, "V_RDCLK", "VDATA ön okuma (karakter şeridi)", "~V_RDC");
  reg((i) => `V_AD${i}`, (i) => `DE${i}`, "V_RDCLK", "VDATA ön okuma (renk şeridi)", "~V_RDA");
  readBuf(b, ["V_VCTL"], "DO", "~V_RD1", "VCTRL okuma (FF23)");

  b.block = "İmleç";
  reg((i) => `DE${i}`, (i) => `V_CX${i}`, "~V_WE2", "CURSOR_X (FF24)");
  reg((i) => `DO${i}`, (i) => `V_CY${i}`, "~V_WO2", "CURSOR_Y (FF25)");
  readBuf(b, range(8).map((i) => `V_CX${i}`), "DE", "~V_RD2", "CURSOR_X okuma");
  readBuf(b, range(8).map((i) => `V_CY${i}`), "DO", "~V_RD2", "CURSOR_Y okuma");

  return { vramChar, vramAttr, fontRom, frames: b.chips.find((c) => c.def.part === "74HC393" && c.card === "video")!, vaddr };
}

/** Bir register'ı DE ya da DO hattına okutan 74HC541 (kullanılmayan bitler 0 okunur) */
function readBuf(b: Board, bits: string[], lane: "DE" | "DO", oe: string, role: string) {
  const conn: Conn = { "~OE1": oe, "~OE2": "GND" };
  range(8).forEach((i) => {
    conn[`A${i}`] = bits[i] ?? "GND";
    conn[`Y${i}`] = `${lane}${i}`;
  });
  b.place("74HC541", conn, role);
}
