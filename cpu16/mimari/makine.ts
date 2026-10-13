// Bütün bilgisayarın mimari diyagramı: yedi kart (çerçeveler), her kartın ana birimleri (kutular) ve
// kartları birbirine bağlayan 64 hatlı arka panel. Arka paneldeki her hat bütün yuvalardan geçer;
// diyagramda hatlar işlevlerine göre şeritlere toplanır (adres, veri, bellek denetimi, saat …) ve
// her kart kullandığı şeride bir kolla bağlanır: ok, kartın o şeritteki sinyallerden en az birini
// sürdüğünü (şeride doğru) ya da okuduğunu (karta doğru) gösterir. Testler her kolun yönünü
// netlistteki sürücü ve okuyucu pinlerle, her kartın bağlandığı şeritleri de devreden hesaplanan
// kullanımla karşılaştırır (cpu16/tests/mimari.test.ts).
// Kartlar: board/machine-board.ts; arka panel pinleri: board/passives.ts (BACKPLANE).
// Metinler iki dilde: t("Türkçe", "English").

import type { Board } from "../board/board.ts";
import { cevirici, netDizisi, type BlokKimligi, type Cevir, type Dil, type Diyagram, type Grup, type Kutu, type Yol, type YolUcu } from "./model.ts";

const b = (card: string, ...bloklar: string[]): BlokKimligi[] => bloklar.map((block) => ({ card, block }));

/** Kartlar: çerçeve kimliği = Board.card */
export const MAKINE_KARTLARI = ["clk", "cpu", "bellek", "onbellek", "gc", "video", "kyb"] as const;

// ---- yerleşim ölçüleri
const UST_Y = 80; // üst sıradaki kartlar
const UST_KART_H = 374; // üst sıra: CPU kartının kutularında hata ayıklama LED'leri ve çubuk göstergeler de yazar
const KART_H = 358;
const BANT_Y = UST_Y + UST_KART_H + 12; // arka panel bandı
const BANT_H = 248;
const ALT_Y = BANT_Y + BANT_H + 20; // alt sıradaki kartlar
const CIHAZ_Y = ALT_Y + KART_H + 40; // dış cihazlar
const SERIT_X0 = 360; // şeritlerin başı (solunda şerit adları)
const SERIT_X1 = 1862;
const IC = 12; // çerçeve içi boşluk ve kutular arası
const BASLIK = 46; // çerçeve başlığı (kutuların üstü)

/** Kartların çerçeveleri: x, genişlik, üst sırada mı, sütun sayısı, satır yükseklikleri */
const KART_YERI: Record<string, { x: number; w: number; ust: boolean; sutun: number; satirlar: number[] }> = {
  cpu: { x: 30, w: 520, ust: true, sutun: 2, satirlar: [160, 144] },
  bellek: { x: 570, w: 470, ust: true, sutun: 2, satirlar: [152, 152] },
  onbellek: { x: 1060, w: 490, ust: true, sutun: 2, satirlar: [152, 152] },
  clk: { x: 1570, w: 300, ust: true, sutun: 1, satirlar: [152, 152] },
  gc: { x: 30, w: 720, ust: false, sutun: 3, satirlar: [144, 144] },
  video: { x: 770, w: 720, ust: false, sutun: 3, satirlar: [144, 144] },
  kyb: { x: 1510, w: 360, ust: false, sutun: 1, satirlar: [92, 92, 92] },
};

const kartCercevesi = (card: string) => {
  const k = KART_YERI[card];
  return { x: k.x, y: k.ust ? UST_Y : ALT_Y, w: k.w, h: k.ust ? UST_KART_H : KART_H };
};

/** Kartın içinde bir kutunun yeri (sütun, satır) */
function yer(card: string, sutun: number, satir: number) {
  const k = KART_YERI[card];
  const c = kartCercevesi(card);
  const w = (k.w - 2 * IC - (k.sutun - 1) * IC) / k.sutun;
  const y = c.y + BASLIK + k.satirlar.slice(0, satir).reduce((a, h) => a + h + IC, 0);
  return { x: c.x + IC + sutun * (w + IC), y, w, h: k.satirlar[satir] };
}

/** Kartın alt sıradaki kutusunun altında, kartın dışında bir cihaz kutusu */
function altinda(card: string, sutun: number) {
  const k = KART_YERI[card];
  const r = yer(card, sutun, k.satirlar.length - 1);
  return { x: r.x, y: CIHAZ_Y, w: r.w, h: 60 };
}

/** Arka panel şeritleri: y konumu, taşıdığı netler, kullanan kartlar ve yönleri */
interface Serit {
  id: string;
  tur: Yol["tur"];
  ad: string;
  /** şerit adının yanında: netler ya da genişlik */
  etiket: string;
  /** etikette adın yerine (uzun adlar) */
  kisaAd?: string;
  y: number;
  netler: string[];
  aciklama: string;
  uclar: YolUcu[];
}

const seritler = (t: Cevir): Serit[] => [
  {
    id: "pa", tur: "adres", ad: t("BANK ADRESİ", "BANK ADDRESS"), etiket: "PA14–PA19 (6)", y: BANT_Y + 50, netler: netDizisi("PA", 6, 14),
    aciklama: t(
      "Bellek kartının bank register'larından fiziksel adresin üst 6 biti: 16 bitlik CPU adresinin üst iki biti (A15, A14) dört bank register'ından birini seçer, register'daki 6 bit adresin yerine geçer. Önbellek, etiketinde bu bitleri de tutar.",
      "The top 6 bits of the physical address, from the memory board's bank registers: the top two bits of the 16-bit CPU address (A15, A14) select one of four bank registers, and its 6 bits take their place in the address. The cache keeps these bits in its tags too.",
    ),
    uclar: [{ kutu: "bellek", yon: "cikis" }, { kutu: "onbellek", yon: "giris" }],
  },
  {
    id: "bekleme", tur: "kontrol", ad: t("BEKLEME", "WAIT"), etiket: "~WAIT", y: BANT_Y + 72, netler: ["~WAIT"],
    aciklama: t(
      "Önbellek ıskaladığında CPU'yu bekletir: saat kartı bekleme durumuna geçer, bellek kartı bayt sıralamasını uzatır. Hat açık-akaç gibi çekme dirençlidir; kimse istemezse CPU beklemez.",
      "Stalls the CPU on a cache miss: the clock board enters a wait state and the memory board stretches its byte sequence. Like an open-drain line, it has a pull resistor; if nobody asks for a wait, the CPU does not wait.",
    ),
    uclar: [{ kutu: "onbellek", yon: "cikis" }, { kutu: "clk", yon: "giris" }, { kutu: "bellek", yon: "giris" }],
  },
  {
    id: "saat", tur: "saat", ad: t("SAAT VE RESET", "CLOCK AND RESET"), kisaAd: t("SAAT", "CLOCK"), etiket: "CLK, WR_WIN, TCLK, OSC, ~RESET", y: BANT_Y + 96, netler: ["CLK", "WR_WIN", "TCLK", "OSC", "~RESET"],
    aciklama: t(
      "Saat kartından: CPU saati (CLK), yazma penceresi (WR_WIN, CPU'nun yazma darbesini sınırlar), saatin dört katı hızda zamanlama saati (TCLK: bayt sıralayıcı, önbellek, UART ve zamanlayıcı), osilatörün kendisi (OSC: önbellek temizleme) ve ~RESET.",
      "From the clock board: the CPU clock (CLK), the write window (WR_WIN, bounds the CPU's write strobe), the timing clock at four times the CPU clock (TCLK: byte sequencer, cache, UART and timer), the oscillator itself (OSC: cache clearing) and ~RESET.",
    ),
    uclar: [{ kutu: "clk", yon: "cikis" }, { kutu: "cpu", yon: "giris" }, { kutu: "bellek", yon: "giris" }, { kutu: "onbellek", yon: "giris" }, { kutu: "gc", yon: "giris" }, { kutu: "video", yon: "giris" }],
  },
  {
    id: "adres", tur: "adres", ad: t("ADRES YOLU", "ADDRESS BUS"), etiket: t("A0–A15 (16 BİT)", "A0–A15 (16 BITS)"), y: BANT_Y + 124, netler: netDizisi("A", 16),
    aciklama: t(
      "CPU'nun MAR register'ından 16 bitlik adres. Bellek kartı üst bitleri bank register'larıyla fiziksel adrese çevirir; G/Ç kartları (FFxx alanı) düşük baytı çözer.",
      "The 16-bit address from the CPU's MAR register. The memory board maps the top bits to a physical address through the bank registers; the I/O boards (FFxx space) decode the low byte.",
    ),
    uclar: [{ kutu: "cpu", yon: "cikis" }, { kutu: "bellek", yon: "giris" }, { kutu: "onbellek", yon: "giris" }, { kutu: "gc", yon: "giris" }, { kutu: "video", yon: "giris" }, { kutu: "kyb", yon: "giris" }],
  },
  {
    id: "veri", tur: "veri", ad: t("VERİ YOLU", "DATA BUS"), etiket: t("DE0–DE7, DO0–DO7 (16 BİT)", "DE0–DE7, DO0–DO7 (16 BITS)"), y: BANT_Y + 154, netler: [...netDizisi("DE", 8), ...netDizisi("DO", 8)],
    aciklama: t(
      "İki 8 bitlik bayt hattı: DE çift adresli, DO tek adresli bayt. CPU yazarken sürer, okurken seçilen kart (bellek, önbellek, G/Ç register'ları) sürer.",
      "Two 8-bit byte lanes: DE is the even-address byte, DO the odd-address byte. The CPU drives them on a write; on a read the selected board (memory, cache, I/O registers) drives them.",
    ),
    uclar: [{ kutu: "cpu", yon: "iki" }, { kutu: "bellek", yon: "iki" }, { kutu: "onbellek", yon: "iki" }, { kutu: "gc", yon: "iki" }, { kutu: "video", yon: "iki" }, { kutu: "kyb", yon: "iki" }],
  },
  {
    id: "denetim", tur: "kontrol", ad: t("BELLEK DENETİMİ", "MEMORY CONTROL"), etiket: "~MRD, ~MWE_E, ~MWE_O", y: BANT_Y + 182, netler: ["~MRD", "~MWE_E", "~MWE_O"],
    aciklama: t(
      "CPU'nun bellek okuma (~MRD) ve çift / tek bayt yazma darbeleri (~MWE_E, ~MWE_O). Bellek ve G/Ç kartları seçiliyse bunlarla okur ve yazar.",
      "The CPU's memory read (~MRD) and even / odd byte write strobes (~MWE_E, ~MWE_O). The memory and I/O boards read and write with them when selected.",
    ),
    uclar: [{ kutu: "cpu", yon: "cikis" }, { kutu: "bellek", yon: "giris" }, { kutu: "onbellek", yon: "giris" }, { kutu: "gc", yon: "giris" }, { kutu: "video", yon: "giris" }, { kutu: "kyb", yon: "giris" }],
  },
  {
    id: "io", tur: "kontrol", ad: t("G/Ç ALANI", "I/O SPACE"), etiket: "~IO", y: BANT_Y + 206, netler: ["~IO"],
    aciklama: t(
      "Bellek kartının adres çözücüsü: adresin üst baytı FF ise (FF00–FFFF) erişim belleğe değil G/Ç kartlarına gider; ~IO düşükken her G/Ç kartı kendi adres grubunu çözer.",
      "From the memory board's address decoder: if the top byte of the address is FF (FF00–FFFF), the access goes to the I/O boards instead of memory. While ~IO is low, each I/O board decodes its own address group.",
    ),
    uclar: [{ kutu: "bellek", yon: "cikis" }, { kutu: "onbellek", yon: "giris" }, { kutu: "gc", yon: "giris" }, { kutu: "video", yon: "giris" }, { kutu: "kyb", yon: "giris" }],
  },
  {
    id: "kesme", tur: "kontrol", ad: t("KESME", "INTERRUPT"), etiket: "IRQ, VSYNC_REQ", y: BANT_Y + 228, netler: ["IRQ", "VSYNC_REQ"],
    aciklama: t(
      "Video kartı her kare sonunda VSYNC_REQ ister; G/Ç kartının kesme denetleyicisi bunu UART, klavye ve zamanlayıcının istekleriyle maskeleyip CPU'ya tek IRQ hattı olarak verir.",
      "The video board raises VSYNC_REQ at the end of every frame. The I/O board's interrupt controller masks it together with the UART, keyboard and timer requests and passes them to the CPU as a single IRQ line.",
    ),
    uclar: [{ kutu: "gc", yon: "iki" }, { kutu: "cpu", yon: "giris" }, { kutu: "video", yon: "cikis" }],
  },
];

/**
 * Kartların arka panele bağlandığı kollar: üst sıradakiler alt kenardan, alttakiler üst kenardan.
 * Bir kartın kolları yan yana (ilk kolun x'i, aralık); üst ve alt sıranın kolları x'te çakışmaz.
 */
const KOL_YERI: Record<string, { x0: number; ara: number; seritler: string[] }> = {
  cpu: { x0: 380, ara: 40, seritler: ["saat", "adres", "veri", "denetim", "kesme"] },
  bellek: { x0: 780, ara: 40, seritler: ["pa", "bekleme", "saat", "adres", "veri", "denetim", "io"] },
  onbellek: { x0: 1290, ara: 40, seritler: ["pa", "bekleme", "saat", "adres", "veri", "denetim", "io"] },
  clk: { x0: 1760, ara: 40, seritler: ["bekleme", "saat"] },
  gc: { x0: 570, ara: 30, seritler: ["saat", "adres", "veri", "denetim", "io", "kesme"] },
  video: { x0: 1060, ara: 40, seritler: ["saat", "adres", "veri", "denetim", "io", "kesme"] },
  kyb: { x0: 1580, ara: 40, seritler: ["adres", "veri", "denetim", "io"] },
};

export function makineDiyagrami(board: Board, dil: Dil = "tr"): Diyagram {
  const t = cevirici(dil);
  const kutu = (k: Omit<Kutu, "aciklama"> & { aciklama?: string }): Kutu => ({ aciklama: "", ...k });
  // ---- kartlar ve birimleri
  const kutular: Kutu[] = [
    // SAAT VE RESET
    kutu({
      id: "clk-osc", ad: t("OSİLATÖR VE RESET", "OSCILLATOR AND RESET"), rol: "kontrol", ...yer("clk", 0, 0), bloklar: b("clk", "Osilatör ve reset"),
      gorev: t("kristal ya da yavaş saat; RESET, ADIM", "crystal or slow clock; RESET, STEP"),
      aciklama: t(
        "Kristal osilatör (CPU saatinin 8 katı) ya da potansiyometreyle ayarlanan yavaş RC osilatörü. RESET ve ADIM butonları Schmitt tetikleyiciden (74HC14) geçer; anahtarlar otomatik / adım ve hızlı / yavaş kiplerini seçer.",
        "A crystal oscillator (8 times the CPU clock) or a slow RC oscillator set with a potentiometer. The RESET and STEP buttons go through a Schmitt trigger (74HC14); switches select auto / step and fast / slow modes.",
      ),
    }),
    kutu({
      id: "clk-uretim", ad: t("SAAT ÜRETİMİ VE DAĞITIMI", "CLOCK GENERATION AND DISTRIBUTION"), rol: "register", ...yer("clk", 0, 1), bloklar: b("clk", "Saat üretimi", "Bekleme durumu", "Saat dağıtımı"),
      gorev: t("CLK, WR_WIN, TCLK; adım ve bekleme", "CLK, WR_WIN, TCLK; step and wait"),
      aciklama: t(
        "Johnson sayacı (74HC175) osilatörü sekize bölerek CLK'yı, yazma penceresini (WR_WIN) ve dört kat hızlı TCLK'yı üretir. Adım kipinde ADIM butonu bir tam saat döngüsüne izin verir; ~WAIT düşükken saat bekleme durumunda tutulur. Bir 74HC541 saatleri ve reseti arka panele sürer; CLK LED'i saati gösterir.",
        "A Johnson counter (74HC175) divides the oscillator by eight to make CLK, the write window (WR_WIN) and the four-times-faster TCLK. In step mode the STEP button allows one full clock cycle; while ~WAIT is low, the clock is held in a wait state. A 74HC541 drives the clocks and reset onto the backplane, and the CLK LED shows the clock.",
      ),
    }),
    // CPU
    kutu({
      id: "cpu-reg", ad: t("REGISTER'LAR VE SABİT BİRİMİ", "REGISTERS AND IMMEDIATE UNIT"), rol: "register", ...yer("cpu", 0, 0), ayrinti: "cpu",
      bloklar: b("cpu", "Register dosyası", "Geçici register'lar", "Program sayacı", "MAR ve IR", "Sabit birimi"),
      gorev: t("R0–R7, TA, TB, PC, MAR, IR, sabitler", "R0–R7, TA, TB, PC, MAR, IR, imm"),
      aciklama: t(
        "CPU'nun bütün register'ları: sekiz genel register, ALU'nun iki geçici register'ı, program sayacı, bellek adres register'ı (MAR, adres yolunu sürer), komut register'ı (IR) ve komuttaki sabitleri 16 bite genişleten sabit birimi. Hepsi kartın tek 16 bitlik iç veri yoluna bağlıdır.",
        "All of the CPU's registers: eight general registers, the ALU's two temporary registers, the program counter, the memory address register (MAR, drives the address bus), the instruction register (IR) and the immediate unit that extends the instruction's constants to 16 bits. All of them sit on the board's single 16-bit internal data bus.",
      ),
    }),
    kutu({
      id: "cpu-alu", ad: t("ALU VE BAYRAKLAR", "ALU AND FLAGS"), rol: "islem", ...yer("cpu", 1, 0), ayrinti: "cpu",
      bloklar: b("cpu", "ALU kod çözücü", "ALU", "Bayraklar ve koşul"),
      gorev: t("16 bit aritmetik ve mantık; N Z C V", "16-bit arithmetic and logic; N Z C V"),
      aciklama: t(
        "16 bitlik ALU (toplayıcı, mantık tabloları, kaydırıcı), işlem kodunu ALU denetim bitlerine çeviren kod çözücü, N Z C V ve I bayrakları ve dallanma koşulu.",
        "The 16-bit ALU (adder, logic tables, shifter), the decoder that turns the opcode into ALU control bits, the N Z C V and I flags, and the branch condition.",
      ),
    }),
    kutu({
      id: "cpu-kontrol", ad: t("KONTROL BİRİMİ", "CONTROL UNIT"), rol: "kontrol", ...yer("cpu", 0, 1), ayrinti: "cpu",
      bloklar: b("cpu", "Kontrol birimi", "Kontrol"),
      gorev: t("mikrokod: 32 kontrol hattı", "microcode: 32 control lines"),
      aciklama: t(
        "Komut, adım sayacı ve koşuldan 32 kontrol hattını üreten mikrokod devresi (ROM yok: kod çözücüler, seçiciler ve kapılar), kontrol register'ı, kesme ve HALT mantığı.",
        "The microcode circuit that derives 32 control lines from the instruction, step counter and condition (no ROM: decoders, selectors and gates), plus the control register and the interrupt and HALT logic.",
      ),
    }),
    kutu({
      id: "cpu-bellek", ad: t("BELLEK ARAYÜZÜ", "MEMORY INTERFACE"), rol: "tampon", ...yer("cpu", 1, 1), ayrinti: "cpu",
      bloklar: b("cpu", "Bellek arayüzü"),
      gorev: t("iç veri yolu ↔ DE, DO; okuma / yazma darbeleri", "internal bus ↔ DE, DO; read / write strobes"),
      aciklama: t(
        "İç veri yolunu arka paneldeki iki bayt hattına bağlayan alıcı-vericiler; bellek okuma ve yazma darbelerini üretir.",
        "Transceivers that connect the internal data bus to the two byte lanes on the backplane; this block also generates the memory read and write strobes.",
      ),
    }),
    // BELLEK
    kutu({
      id: "bellek-cozme", ad: t("ADRES ÇÖZME", "ADDRESS DECODING"), rol: "secici", ...yer("bellek", 0, 0), bloklar: b("bellek", "Adres çözme"),
      gorev: t("G/Ç alanı (~IO), bank register'ları, çip seçimi", "I/O space (~IO), bank registers, chip select"),
      aciklama: t(
        "Adresin üst baytı FF ise erişimi G/Ç kartlarına bırakır (~IO). Bank register'larını (FF10–FF13) ve fiziksel adresin üst bitlerinden EEPROM ya da RAM çiplerinden birini seçer.",
        "If the top byte of the address is FF, it leaves the access to the I/O boards (~IO). It selects the bank registers (FF10–FF13), and uses the top bits of the physical address to select the EEPROM or one of the RAM chips.",
      ),
    }),
    kutu({
      id: "bellek-bank", ad: t("BANK REGISTER'LARI", "BANK REGISTERS"), rol: "register", ...yer("bellek", 1, 0), bloklar: b("bellek", "Bank register'ları"),
      gorev: t("16 bit adres → 20 bit fiziksel adres", "16-bit address → 20-bit physical address"),
      aciklama: t(
        "Dört bank register'ı (BANK0–BANK3, 6'şar bit): adresin üst iki biti birini seçer ve fiziksel adresin PA14–PA19 bitleri olur. Böylece 64 KB'lık adres alanında 1 MB fiziksel bellek kullanılabilir. Register'lar G/Ç alanından yazılıp okunur.",
        "Four bank registers (BANK0–BANK3, 6 bits each): the top two address bits pick one, and it becomes bits PA14–PA19 of the physical address. This lets a 64 KB address space reach 1 MB of physical memory. The registers are written and read through the I/O space.",
      ),
    }),
    kutu({
      id: "bellek-sira", ad: t("BAYT SIRALAYICI", "BYTE SEQUENCER"), rol: "tampon", ...yer("bellek", 0, 1), bloklar: b("bellek", "Bayt sıralayıcı", "Veri yolu"),
      gorev: t("16 bitlik erişim, 8 bitlik çipler", "16-bit access, 8-bit chips"),
      aciklama: t(
        "Bellek çipleri 8 bitlik: bir kelime erişimi iki bayta bölünür. Sıralayıcı TCLK ile önce çift, sonra tek baytı okur ya da yazar; çift baytı bir mandalda tutar. DE ve DO hatlarında çekme dirençleri var.",
        "The memory chips are 8 bits wide, so a word access is split into two bytes. Clocked by TCLK, the sequencer reads or writes the even byte first, then the odd byte, and holds the even byte in a latch. The DE and DO lines have pull resistors.",
      ),
    }),
    kutu({
      id: "bellek-cip", ad: t("EEPROM VE RAM", "EEPROM AND RAM"), rol: "bellek", ...yer("bellek", 1, 1), bloklar: b("bellek", "EEPROM ve RAM"),
      gorev: "32 KB EEPROM (BIOS), 4 × 32 KB RAM",
      aciklama: t(
        "28C256 EEPROM (BIOS ve kullanıcı programı) ve dört 62256 statik RAM: toplam 160 KB fiziksel bellek.",
        "A 28C256 EEPROM (BIOS and user program) and four 62256 static RAMs: 160 KB of physical memory in total.",
      ),
    }),
    // ÖNBELLEK
    kutu({
      id: "onbellek-sira", ad: t("G/Ç ÇÖZME VE SIRALAMA", "I/O DECODING AND SEQUENCING"), rol: "kontrol", ...yer("onbellek", 0, 0), bloklar: b("onbellek", "G/Ç çözme", "Bekleme ve sıralama"),
      gorev: t("isabette beklemesiz; ıskalamada ~WAIT", "no wait on a hit; ~WAIT on a miss"),
      aciklama: t(
        "Önbellek register'larını (FF30–FF37) çözer. Okuma ıskalarsa ~WAIT ile CPU'yu bekletir, bellek kartı veriyi getirirken satırı doldurur; isabette CPU beklemez.",
        "Decodes the cache registers (FF30–FF37). On a read miss it stalls the CPU with ~WAIT and fills the line while the memory board fetches the data; on a hit the CPU does not wait.",
      ),
    }),
    kutu({
      id: "onbellek-etiket", ad: t("ETİKET BELLEĞİ", "TAG MEMORY"), rol: "bellek", ...yer("onbellek", 1, 0), bloklar: b("onbellek", "Etiket belleği"),
      gorev: t("satır başına etiket ve geçerli biti", "tag and valid bit per line"),
      aciklama: t(
        "Her önbellek satırının hangi fiziksel adresi tuttuğu (etiket: A11–A13, PA14–PA19) ve geçerli biti. 74HC688 karşılaştırıcılar isabeti bulur; resetten sonra sayaç bütün satırları geçersiz yapar.",
        "Which physical address each cache line holds (tag: A11–A13, PA14–PA19) and its valid bit. 74HC688 comparators detect a hit; after reset a counter invalidates every line.",
      ),
    }),
    kutu({
      id: "onbellek-veri", ad: t("VERİ BELLEĞİ", "DATA MEMORY"), rol: "bellek", ...yer("onbellek", 0, 1), bloklar: b("onbellek", "Veri belleği"),
      gorev: t("önbelleğe alınmış kelimeler", "cached words"),
      aciklama: t("Önbellekteki veriler: iki 62256, biri çift biri tek baytlar için.", "The cached data: two 62256s, one for even and one for odd bytes."),
    }),
    kutu({
      id: "onbellek-sayac", ad: t("SAYAÇLAR", "COUNTERS"), rol: "register", ...yer("onbellek", 1, 1), bloklar: b("onbellek", "Sayaçlar"),
      gorev: t("isabet ve ıskalama sayaçları (16 bit)", "hit and miss counters (16 bit)"),
      aciklama: t(
        "İsabet ve ıskalama sayaçları; CPU G/Ç alanından okur (FF30–FF33), önbelleğin ne kadar işe yaradığını ölçer.",
        "Hit and miss counters. The CPU reads them through the I/O space (FF30–FF33) to measure how well the cache works.",
      ),
    }),
    // G/Ç
    kutu({
      id: "gc-cozme", ad: t("ADRES ÇÖZME", "ADDRESS DECODING"), rol: "secici", ...yer("gc", 0, 0), bloklar: b("gc", "Adres çözme", "Okuma yan etkileri"),
      gorev: t("FF00–FF0B register'ları", "FF00–FF0B registers"),
      aciklama: t(
        "G/Ç kartının register'larını (FF00–FF0B) çözer: okuma seçimi, çift ve tek bayt yazma darbeleri. Bazı register'ları okumak bayrak siler (RX_READY, klavye READY): bu yan etki bir sonraki döngüde uygulanır.",
        "Decodes the I/O board's registers (FF00–FF0B): read select and even and odd byte write strobes. Reading some registers clears a flag (RX_READY, keyboard READY); this side effect takes place in the next cycle.",
      ),
    }),
    kutu({
      id: "gc-zaman", ad: t("ZAMANLAYICI", "TIMER"), rol: "register", ...yer("gc", 1, 0), bloklar: b("gc", "Zamanlayıcı"),
      gorev: t("1 kHz tık, 16 bit geri sayıcı", "1 kHz tick, 16-bit down counter"),
      aciklama: t(
        "TCLK'dan 1 kHz ön bölücü ve 16 bitlik yeniden yüklemeli sayaç; süre dolunca kesme isteği.",
        "A prescaler from TCLK down to 1 kHz and a 16-bit reloading counter; it requests an interrupt when the time runs out.",
      ),
    }),
    kutu({
      id: "gc-kesme", ad: t("KESME DENETLEYİCİSİ", "INTERRUPT CONTROLLER"), rol: "kontrol", ...yer("gc", 2, 0), bloklar: b("gc", "Kesme denetleyicisi"),
      gorev: t("istekleri maskele → IRQ", "mask requests → IRQ"),
      aciklama: t(
        "UART, klavye, zamanlayıcı ve video (VSYNC_REQ) isteklerini maske register'ıyla süzer, CPU'ya tek IRQ hattı verir; kaynak ve bekleyen istekler okunabilir.",
        "Filters the UART, keyboard, timer and video (VSYNC_REQ) requests through a mask register and gives the CPU a single IRQ line; the source and pending requests can be read.",
      ),
    }),
    kutu({
      id: "gc-uart", ad: "UART", rol: "gc", ...yer("gc", 0, 1), bloklar: b("gc", "UART verici", "UART alıcı", "UART konnektörü"),
      gorev: t("seri port (8N1)", "serial port (8N1)"),
      aciklama: t(
        "Seri port: verici kaydırma register'ı (74HC165) ve alıcı (74HC595), ikisi de 74HC161 bit bölücüleriyle. Kartın üstündeki CH340 modülü USB üzerinden bilgisayara bağlanır.",
        "Serial port: a transmit shift register (74HC165) and a receiver (74HC595), each with 74HC161 bit-rate dividers. The CH340 module on the board connects to a computer over USB.",
      ),
    }),
    kutu({
      id: "gc-ps2", ad: t("PS/2 KLAVYE", "PS/2 KEYBOARD"), rol: "gc", ...yer("gc", 1, 1), bloklar: b("gc", "PS/2 klavye", "Sinyal düzeltme"),
      gorev: t("klavyeden tarama kodları", "scan codes from the keyboard"),
      aciklama: t(
        "PS/2 klavyenin saat ve veri hatları Schmitt tetikleyiciden (74HC14) geçer; 11 bitlik çerçeve kaydırma register'ında toplanır. Bayt okunana kadar saat hattı aşağı çekilir (klavye bekler).",
        "The PS/2 keyboard's clock and data lines go through a Schmitt trigger (74HC14), and the 11-bit frame collects in a shift register. Until the byte is read, the clock line is held low (the keyboard waits).",
      ),
    }),
    kutu({
      id: "gc-durum", ad: t("DURUM REGISTER'LARI", "STATUS REGISTERS"), rol: "register", ...yer("gc", 2, 1), bloklar: b("gc", "Durum register'ları"),
      gorev: t("UART ve klavye durumu", "UART and keyboard status"),
      aciklama: t("UART_STAT (RX_READY, TX_EMPTY) ve KBD_STAT (READY) register'ları.", "The UART_STAT (RX_READY, TX_EMPTY) and KBD_STAT (READY) registers."),
    }),
    // VİDEO
    kutu({
      id: "video-cpu", ad: t("CPU ARAYÜZÜ", "CPU INTERFACE"), rol: "tampon", ...yer("video", 0, 0), bloklar: b("video", "Adres çözme", "CPU arayüzü"),
      gorev: t("FF20–FF26; VRAM'e yazma, okuma", "FF20–FF26; VRAM write and read"),
      aciklama: t(
        "Video register'larını (FF20–FF26) çözer. CPU, VRAM'e doğrudan değil VADDR / VDATA register'larıyla erişir: istek, taramanın boş yuvasında yapılır.",
        "Decodes the video registers (FF20–FF26). The CPU reaches VRAM through the VADDR / VDATA registers, and the access happens in a free slot of the scan.",
      ),
    }),
    kutu({
      id: "video-zaman", ad: t("TARAMA ZAMANLAMASI", "SCAN TIMING"), rol: "kontrol", ...yer("video", 1, 0), bloklar: b("video", "Piksel saati ve sayaçlar", "Çözümleme", "Dikey tarama durumu"),
      gorev: t("640 × 480, 60 Hz tarama", "640 × 480, 60 Hz scan"),
      aciklama: t(
        "25,175 MHz piksel saati, karakter ve satır sayaçları, senkron sinyallerinin çözümü; her kare sonunda VSYNC_REQ.",
        "The 25.175 MHz pixel clock, character and line counters, and decoding of the sync signals; VSYNC_REQ at the end of each frame.",
      ),
    }),
    kutu({
      id: "video-imlec", ad: t("İMLEÇ", "CURSOR"), rol: "register", ...yer("video", 2, 0), bloklar: b("video", "İmleç"),
      gorev: t("imlecin sütunu ve satırı", "cursor column and row"),
      aciklama: t(
        "CURSOR_X ve CURSOR_Y register'ları (FF24, FF25); piksel yolu imleci bu karakterde yanıp söndürür.",
        "The CURSOR_X and CURSOR_Y registers (FF24, FF25); the pixel path blinks the cursor at this character.",
      ),
    }),
    kutu({
      id: "video-dac", ad: t("RENK VE DAC", "COLOR AND DAC"), rol: "gc", ...yer("video", 0, 1), bloklar: b("video", "Renk ve DAC"),
      gorev: "IRGB → analog VGA",
      aciklama: t(
        "Yazı ya da zemin renginin 4 bitini (IRGB) seçer; dirençli DAC bunları VGA'nın analog kırmızı, yeşil, mavi seviyelerine çevirir.",
        "Selects the 4 bits (IRGB) of the text or background color; a resistor DAC turns them into VGA's analog red, green and blue levels.",
      ),
    }),
    kutu({
      id: "video-piksel", ad: t("PİKSEL YOLU", "PIXEL PATH"), rol: "islem", ...yer("video", 1, 1), bloklar: b("video", "Piksel yolu"),
      gorev: t("karakter ROM'u → piksel kaydırıcı", "character ROM → pixel shifter"),
      aciklama: t(
        "Karakter kodu ve renk baytı VRAM'den alınır; karakter ROM'u (28C256) font satırını verir, 74HC166 pikselleri kaydırır. Senkronlar ve imleç aynı karakter sınırına hizalanır.",
        "The character code and color byte come from VRAM; the character ROM (28C256) supplies the font row and a 74HC166 shifts out the pixels. The syncs and the cursor line up on the same character boundary.",
      ),
    }),
    kutu({
      id: "video-vram", ad: "VRAM", rol: "bellek", ...yer("video", 2, 1), bloklar: b("video", "VRAM", "Tarama adresi"),
      gorev: t("80 × 30 karakter ve renkleri", "80 × 30 characters and their colors"),
      aciklama: t(
        "İki 62256: karakter ve renk şeritleri. Adres seçici VRAM'i ya taramaya ya da CPU arayüzüne verir; tarama adresi satır başından sayılır.",
        "Two 62256s: the character and color planes. An address selector hands VRAM either to the scan or to the CPU interface; the scan address counts from the start of each row.",
      ),
    }),
    // KENDİN YAP BELLEK
    kutu({
      id: "kyb-cozme", ad: t("ADRES ÇÖZME", "ADDRESS DECODING"), rol: "secici", ...yer("kyb", 0, 0), bloklar: b("kyb", "Adres çözme"),
      gorev: "FF40–FF4F",
      aciklama: t(
        "Kartın adres grubunu (FF4x) ve 8 kelimeden hangisinin okunup yazılacağını çözer.",
        "Decodes the board's address group (FF4x) and which of the 8 words is read or written.",
      ),
    }),
    kutu({
      id: "kyb-tampon", ad: t("VERİYOLU TAMPONU", "BUS BUFFER"), rol: "tampon", ...yer("kyb", 0, 1), bloklar: b("kyb", "Veriyolu tamponu"),
      gorev: t("DE, DO ↔ kart içi bayt hatları", "DE, DO ↔ on-board byte lines"),
      aciklama: t(
        "İki 74HC245: kart seçiliyken arka panelin bayt hatlarını kartın içine bağlar.",
        "Two 74HC245s: while the board is selected, they connect the backplane byte lanes to the board.",
      ),
    }),
    kutu({
      id: "kyb-hucre", ad: t("BELLEK HÜCRELERİ", "MEMORY CELLS"), rol: "register", ...yer("kyb", 0, 2), bloklar: b("kyb", "Bellek hücreleri"),
      gorev: t("16 bayt (8 kelime), 74HC574'lerle", "16 bytes (8 words) in 74HC574s"),
      aciklama: t(
        "Belleğin en yalın hâli: her bayt bir 74HC574. Kendin yap bellek kartı, bir RAM çipinin içinde olanı açıkça gösterir.",
        "Memory in its simplest form: each byte is one 74HC574. The DIY memory board shows in plain sight what happens inside a RAM chip.",
      ),
    }),
    // DIŞ CİHAZLAR
    kutu({ id: "pc", ad: t("BİLGİSAYAR", "COMPUTER"), rol: "gc", cihaz: true, ...altinda("gc", 0), bloklar: [], gorev: t("USB üzerinden seri terminal", "serial terminal over USB"), aciklama: t("Seri terminal: CH340 modülü USB'de bir seri port olarak görünür.", "Serial terminal: the CH340 module shows up as a serial port over USB.") }),
    kutu({ id: "klavye", ad: t("PS/2 KLAVYE", "PS/2 KEYBOARD"), rol: "gc", cihaz: true, ...altinda("gc", 1), bloklar: [], gorev: t("tarama kodları", "scan codes"), aciklama: t("PS/2 klavye: her tuş basışı ve bırakışı bir tarama kodu gönderir.", "PS/2 keyboard: each key press and release sends a scan code.") }),
    kutu({ id: "monitor", ad: t("VGA MONİTÖR", "VGA MONITOR"), rol: "gc", cihaz: true, ...altinda("video", 0), bloklar: [], gorev: "640 × 480, 60 Hz", aciklama: t("VGA monitörü: analog RGB ve iki senkron sinyali.", "VGA monitor: analog RGB and two sync signals.") }),
  ];

  const kartAdlari: Record<string, string> = {
    // "Clock & reset": çerçeve başlığına "and" ile sığmıyor
    clk: t("Saat ve reset", "Clock & reset"), cpu: "CPU", bellek: t("Bellek", "Memory"), onbellek: t("Önbellek", "Cache"), gc: t("G/Ç", "I/O"), video: "Video", kyb: t("Kendin yap bellek", "DIY memory"),
  };
  const kartAciklamasi: Record<string, string> = {
    clk: t(
      "Saat ve reset kartı: kristal ya da yavaş osilatör, adım kipi, CPU saati ve zamanlama saatleri, bekleme durumu, reset.",
      "Clock and reset board: crystal or slow oscillator, step mode, the CPU and timing clocks, wait states and reset.",
    ),
    cpu: t(
      "16 bitlik işlemci: register'lar, ALU, mikrokodlu kontrol birimi ve bellek arayüzü. Ayrıntısı CPU16 işlemci kartı diyagramında.",
      "The 16-bit processor: registers, ALU, microcoded control unit and memory interface. The CPU16 processor board diagram shows the details.",
    ),
    bellek: t(
      "Bellek kartı: bank register'larıyla 1 MB fiziksel adres, 32 KB EEPROM ve 128 KB RAM, 16 bitlik erişimi iki bayta bölen sıralayıcı; G/Ç alanını (~IO) da bu kart çözer.",
      "Memory board: 1 MB of physical address space through bank registers, 32 KB EEPROM and 128 KB RAM, and a sequencer that splits a 16-bit access into two bytes. This board also decodes the I/O space (~IO).",
    ),
    onbellek: t(
      "Önbellek kartı: doğrudan eşlemeli önbellek; etiket ve veri belleği, ıskalamada bekleme, isabet ve ıskalama sayaçları.",
      "Cache board: a direct-mapped cache with tag and data memory, a wait on each miss, and hit and miss counters.",
    ),
    gc: t("G/Ç kartı: UART (USB-seri), PS/2 klavye, zamanlayıcı ve kesme denetleyicisi.", "I/O board: UART (USB serial), PS/2 keyboard, timer and interrupt controller."),
    video: t("Video kartı: 80 × 30 karakterlik renkli metin ekranı, 640 × 480 VGA çıkışı.", "Video board: an 80 × 30 color text display with 640 × 480 VGA output."),
    kyb: t("Kendin yap bellek: 16 baytlık, 74HC574'lerle kurulmuş bir bellek kartı.", "DIY memory: a 16-byte memory board built from 74HC574s."),
  };
  const gruplar: Grup[] = MAKINE_KARTLARI.map((card) => {
    const { x, y, w, h } = kartCercevesi(card);
    return {
      id: card, ad: card === "clk" || card === "kyb" ? kartAdlari[card] : t(`${kartAdlari[card]} kartı`, `${kartAdlari[card]} board`), x, y, w, h,
      kutular: kutular.filter((k) => k.bloklar[0]?.card === card).map((k) => k.id),
      bloklar: b(card, "Yapıştırıcı lojik").filter((x) => board.chips.some((c) => c.card === x.card && c.block === x.block)),
      bloklarAdi: t("kapı çipi", "gate chip"),
      aciklama: kartAciklamasi[card],
      ayrinti: card === "cpu" ? "cpu" : undefined,
    };
  });
  gruplar.push({
    id: "arka", ad: t("Arka panel", "Backplane"), ek: t("64 hat · 7 kart yuvası", "64 lines · 7 board slots"), sade: true,
    x: 30, y: BANT_Y, w: 1840, h: BANT_H, kutular: [],
    bloklar: MAKINE_KARTLARI.map((card) => ({ card, block: "Besleme ve arka panel" })),
    aciklama: t(
      "Kartlar 2 × 32 pinli konnektörlerle aynı arka panele takılır: her hat bütün yuvalardan geçer. 5 V ve GND dışında 51 sinyal hattı kullanılır; şeritler hatları işlevlerine göre toplar. HALTED ve FAULT hatlarını yalnız CPU kartı kullanır (LED).",
      "The boards plug into the same backplane through 2 × 32-pin connectors, and every line runs through all the slots. Besides 5 V and GND, 51 signal lines are in use; the lanes group them by function. Only the CPU board uses the HALTED and FAULT lines (LEDs).",
    ),
  });

  // ---- arka panel şeritleri ve kolları
  const yollar: Yol[] = seritler(t).map((s) => {
    const kollar: Yol["kollar"] = [];
    for (const u of s.uclar) {
      const yer = KOL_YERI[u.kutu];
      const i = yer.seritler.indexOf(s.id);
      if (i < 0) throw new Error(`${u.kutu}: ${s.id} şeridinin kolu yok`);
      const x = yer.x0 + i * yer.ara;
      const c = kartCercevesi(u.kutu);
      kollar.push(KART_YERI[u.kutu].ust ? [[x, c.y + c.h], [x, s.y]] : [[x, c.y], [x, s.y]]);
    }
    return {
      id: s.id, tur: s.tur, ad: s.ad, netler: s.netler.filter((n) => board.has(n)), aciklama: s.aciklama, uclar: s.uclar,
      govde: [[[SERIT_X0, s.y], [SERIT_X1, s.y]]],
      kollar,
      etiketler: [{ x: 44, y: s.y + 4.5, hiza: "bas", metin: `${s.kisaAd ?? s.ad} · ${s.etiket}` }],
    };
  });

  // ---- dış bağlantılar: kutunun altından cihaza dik çizgi
  const disBag = (kaynak: string): Pick<Yol, "kollar" | "etiketler"> & { x: number } => {
    const k = kutular.find((x) => x.id === kaynak)!;
    const x = k.x + k.w / 2;
    return { x, kollar: [[[x, k.y + k.h], [x, CIHAZ_Y]]], etiketler: [] };
  };
  const etiket = (kaynak: string, metin: string) => {
    const { x } = disBag(kaynak);
    return [{ x: x + 8, y: CIHAZ_Y - 12, hiza: "bas" as const, metin }];
  };
  yollar.push(
    {
      id: "usb", tur: "dis", ad: t("USB-SERİ", "USB SERIAL"), netler: ["UART_TXD", "UART_RXD", "GC_RXRDY"],
      aciklama: t(
        "CH340 modülünün kart tarafı: TXD → kartın alıcısı, RXD ← kartın vericisi, CTS# ← RX_READY (alıcı doluyken bilgisayar beklesin). Modül USB ile bilgisayara bağlanır.",
        "The board side of the CH340 module: TXD → the board's receiver, RXD ← the board's transmitter, CTS# ← RX_READY (the computer waits while the receiver is full). The module connects to the computer over USB.",
      ),
      uclar: [{ kutu: "gc-uart", yon: "iki" }, { kutu: "pc", yon: "iki" }],
      kollar: disBag("gc-uart").kollar,
      etiketler: etiket("gc-uart", "USB (TXD, RXD, CTS)"),
    },
    {
      id: "ps2", tur: "dis", ad: "PS/2", netler: ["PS2_CLK", "PS2_DAT"],
      aciklama: t(
        "PS/2 saat ve veri hatları (açık-akaç, iki yönlü): klavye saati sürer, kart bayt okunana kadar saati aşağı çekerek klavyeyi bekletir.",
        "PS/2 clock and data lines (open drain, bidirectional): the keyboard drives the clock, and the board holds the clock low to make the keyboard wait until the byte is read.",
      ),
      uclar: [{ kutu: "gc-ps2", yon: "iki" }, { kutu: "klavye", yon: "iki" }],
      kollar: disBag("gc-ps2").kollar,
      etiketler: etiket("gc-ps2", "PS/2 (CLK, DATA)"),
    },
    {
      id: "vga", tur: "dis", ad: "VGA", netler: ["VGA_RED", "VGA_GREEN", "VGA_BLUE", "VGA_HSYNC", "VGA_VSYNC"],
      aciklama: t(
        "VGA konnektörü (DE-15): analog kırmızı, yeşil, mavi ve yatay / dikey senkron.",
        "VGA connector (DE-15): analog red, green, blue and horizontal / vertical sync.",
      ),
      uclar: [{ kutu: "video-dac", yon: "cikis" }, { kutu: "monitor", yon: "giris" }],
      kollar: disBag("video-dac").kollar,
      etiketler: etiket("video-dac", "VGA (R, G, B, HSYNC, VSYNC)"),
    },
  );

  const toplam = board.chips.length;
  return {
    id: "makine",
    baslik: t("CPU16 bilgisayarı · mimari", "CPU16 computer · architecture"),
    altBaslik: t(`7 kart · 64 hatlı arka panel · ${toplam} entegre`, `7 boards · 64-line backplane · ${toplam} chips`),
    aciklama: t(
      "Bütün bilgisayar: yedi kart aynı arka panele takılır. CPU adresi ve bellek denetimini sürer; bellek kartı adresi bank register'larıyla fiziksel adrese çevirir ve G/Ç alanını çözer; önbellek ıskalamada CPU'yu bekletir; G/Ç ve video kartları FFxx alanındaki register'larla konuşur. Kartların içindeki ayrıntı (CPU için) ayrı diyagramda.",
      "The whole computer: seven boards plug into the same backplane. The CPU drives the address and memory control; the memory board maps the address to a physical address through the bank registers and decodes the I/O space; the cache stalls the CPU on a miss; the I/O and video boards talk through registers in the FFxx space. The inside of the CPU board has its own diagram.",
    ),
    genislik: 1900,
    yukseklik: CIHAZ_Y + 144 + 20,
    kutular,
    gruplar,
    yollar,
    lejant: {
      x: 1030, y: CIHAZ_Y, w: 840, h: 144,
      kisaltmalar: [
        ["~IO", t("G/Ç alanı seçimi (FFxx)", "I/O space select (FFxx)")],
        ["~WAIT", t("Bekleme isteği", "Wait request")],
        ["PA", t("Fiziksel adresin üst bitleri", "Top bits of the physical address")],
        ["TCLK", t("Zamanlama saati (4 × CLK)", "Timing clock (4 × CLK)")],
        ["DE, DO", t("Çift / tek adresli bayt", "Even / odd address byte")],
      ],
    },
  };
}
