// CPU16 işlemci kartının mimari diyagramı: kartın her bloğu bir kutuda, aralarındaki gerçek yollar
// (16 bit iç veri yolu, adres yolu, kontrol hatları, ALU'nun girişleri ve bayrakları) ve kartın
// kenarındaki arka panel konnektörü. Yerleşim elle (ızgara 10 birim); parça listeleri devreden.
// Datapath: cpu16/board/cpu-card.ts, kontrol birimi: board/kontrol.ts, belge: docs/mikromimari.md.
// Metinler iki dilde: t("Türkçe", "English").

import type { Board } from "../board/board.ts";
import { cevirici, netDizisi, type Dil, type Diyagram, type Kutu, type Yol } from "./model.ts";

const cpu = (...bloklar: string[]) => bloklar.map((block) => ({ card: "cpu", block }));

/** Kontrol kelimesinin hatları ve veri yolu sürücüsü seçimi (~SRC_*) */
const KONTROL_NETLERI = [...netDizisi("CW", 32), "~SRC_REG", "~SRC_ALU", "~SRC_PC", "~SRC_MEM", "~SRC_IMM", "~SRC_FLAGS"];

export function cpuDiyagrami(board: Board, dil: Dil = "tr"): Diyagram {
  const t = cevirici(dil);
  const kontrolNetleri = KONTROL_NETLERI.filter((n) => board.has(n));
  const kutular: Kutu[] = [
    {
      id: "reg", ad: t("REGISTER DOSYASI (R0–R7)", "REGISTER FILE (R0–R7)"), rol: "register", x: 90, y: 116, w: 290, h: 216, bloklar: cpu("Register dosyası"),
      gorev: t("8 × 16 bit; RSEL ve IR alanlarıyla seçilir", "8 × 16 bit; selected by the RSEL and IR fields"),
      aciklama: t(
        "Sekiz adet 16 bitlik genel amaçlı register (r6 yığın göstericisi SP, r7 dönüş adresi LR). Her register iki 74HC574'tür (düşük ve yüksek bayt); çıkışları hep açıktır, değeri iki çubuk göstergede görünür, iç veri yoluna iki 74HC541 tamponla çıkar. Hangi register'ın okunup yazılacağını kontrol kelimesinin RSEL alanı ve komuttaki register alanları (rd, rs1, rs2) belirler: üç 74HC151 indeksi seçer, iki 74HC138 okuma ve yazma hattına çevirir.",
        "Eight 16-bit general-purpose registers (r6 is the stack pointer SP, r7 the link register LR). Each register is two 74HC574s (low and high byte). Their outputs are always enabled, two bar graphs show the value, and two 74HC541 buffers put it on the internal data bus. The RSEL field of the control word and the register fields of the instruction (rd, rs1, rs2) decide which register is read or written: three 74HC151s pick the index and two 74HC138s turn it into read and write lines.",
      ),
    },
    {
      id: "gecici", ad: t("GEÇİCİ REGISTER'LAR", "TEMPORARY REGISTERS"), rol: "register", x: 430, y: 116, w: 220, h: 216, bloklar: cpu("Geçici register'lar"),
      gorev: t("TA ve TB: ALU'nun iki girişi", "TA and TB: the two ALU inputs"),
      aciklama: t(
        "Tek bir veri yolu olduğu için ALU'nun iki işleneni sırayla, birer saat döngüsünde TA ve TB'ye alınır; ALU onları sürekli görür. Her biri iki 74HC574 (çıkışları hep açık).",
        "With a single data bus, the two ALU operands are loaded into TA and TB one after the other, one clock cycle each; the ALU sees them all the time. Each is two 74HC574s (outputs always enabled).",
      ),
    },
    {
      id: "alu", ad: "ALU", rol: "islem", x: 720, y: 116, w: 390, h: 216, bloklar: cpu("ALU kod çözücü", "ALU"),
      gorev: "", bolmeler: [
        { ad: t("ALU KOD ÇÖZÜCÜ", "ALU DECODER"), bloklar: ["ALU kod çözücü"], x: 0, y: 0, w: 390, h: 88, gorev: t("işlem kodu → 24 ALU denetim biti", "opcode → 24 ALU control bits") },
        { ad: t("ALU (ARİTMETİK MANTIK BİRİMİ)", "ALU (ARITHMETIC LOGIC UNIT)"), bloklar: ["ALU"], x: 0, y: 88, w: 390, h: 128, gorev: t("toplama, çıkarma, mantık, kaydırma", "add, subtract, logic, shift") },
      ],
      aciklama: t(
        "16 bitlik aritmetik mantık birimi. Toplayıcı dört 74HC283'tür (çıkarmada girişler XOR ile terslenir); mantık işlemleri her bit için bir 74HC151 doğruluk tablosuyla yapılır; 74HC153'ler toplam, mantık, sola ve sağa kaydırma arasından sonucu seçer. İki 74HC688 sonucun sıfır olduğunu (Z) bulur; sonuç iki 74HC541 ile veri yoluna sürülür. ALU kod çözücü işlem kodunu (5 bit), komutun h bitini ve C bayrağını 24 denetim bitine çevirir (ROM yerine 74HC138'ler ve kapılar).",
        "16-bit arithmetic logic unit. The adder is four 74HC283s (for subtraction the inputs are inverted with XOR). Logic operations use one 74HC151 truth table per bit, and 74HC153s pick the result from the sum, logic, shift left and shift right. Two 74HC688s detect a zero result (Z), and two 74HC541s drive the result onto the data bus. The ALU decoder turns the opcode (5 bits), the instruction's h bit and the C flag into 24 control bits (74HC138s and gates instead of a ROM).",
      ),
    },
    {
      id: "bayrak", ad: t("BAYRAKLAR VE KOŞUL", "FLAGS AND CONDITION"), rol: "kontrol", x: 1190, y: 116, w: 270, h: 216, bloklar: cpu("Bayraklar ve koşul"),
      gorev: t("N Z C V ve I bayrakları; dallanma koşulu (COND)", "N Z C V and I flags; branch condition (COND)"),
      aciklama: t(
        "N (negatif), Z (sıfır), C (elde) ve V (taşma) bayrakları ALU'dan, RETI'de veri yolundan yüklenir (74HC74 flip-flop'lar). I kesme izni bayrağıdır. Koşul birimi (74HC151) komutun koşul alanına göre bayraklardan dallanma koşulunu (COND) üretir ve kontrol birimine verir; C bayrağı ALU kod çözücüye de gider (ADC, SBC, ROL, ROR).",
        "The N (negative), Z (zero), C (carry) and V (overflow) flags load from the ALU, or from the data bus on RETI (74HC74 flip-flops). I is the interrupt enable flag. The condition unit (74HC151) uses the instruction's condition field to produce the branch condition (COND) from the flags and passes it to the control unit. The C flag also goes to the ALU decoder (ADC, SBC, ROL, ROR).",
      ),
    },
    {
      id: "pc", ad: t("PROGRAM SAYACI (PC)", "PROGRAM COUNTER (PC)"), rol: "register", x: 90, y: 410, w: 260, h: 150, bloklar: cpu("Program sayacı"),
      gorev: t("sıradaki komutun adresi; += 2 ya da yüklenir", "address of the next instruction; += 2 or loaded"),
      aciklama: t(
        "Dört 74HC161 sayacı PC'nin 1..15. bitlerini tutar (bit 0 her zaman 0: komutlar 2 bayt). Getirmede 2 artar, dallanmada veri yolundan yüklenir; iki 74HC541 onu veri yoluna sürer (MAR'a ya da LR'ye gitmek için).",
        "Four 74HC161 counters hold bits 1..15 of the PC (bit 0 is always 0: instructions are 2 bytes). It counts up by 2 on fetch and loads from the data bus on a branch. Two 74HC541s drive it onto the data bus (on its way to MAR or LR).",
      ),
    },
    {
      id: "sabit", ad: t("SABİT BİRİMİ", "IMMEDIATE UNIT"), rol: "secici", x: 400, y: 410, w: 270, h: 150, bloklar: cpu("Sabit birimi"),
      gorev: t("komuttaki sabiti (imm, ofset) 16 bite genişletir", "extends the instruction's constant (imm, offset) to 16 bits"),
      aciklama: t(
        "Komutun içindeki sabitleri (imm6, imm8, imm9, 8 ve 12 bitlik ofsetler) işaret genişletip gerekirse 2 ile çarparak 16 bitlik değere çevirir; sabit 2 ve 4 de buradan gelir. Her bit bir 74HC151 seçicidir (8 kaynaktan biri); sonuç iki 74HC541 ile veri yoluna sürülür.",
        "Turns the constants inside the instruction (imm6, imm8, imm9, 8- and 12-bit offsets) into 16-bit values: it sign-extends them and multiplies by 2 when needed. The constants 2 and 4 also come from here. Each bit is a 74HC151 selector (one of 8 sources); two 74HC541s drive the result onto the data bus.",
      ),
    },
    {
      id: "marir", ad: t("MAR VE IR", "MAR AND IR"), rol: "register", x: 720, y: 410, w: 330, h: 150, bloklar: cpu("MAR ve IR"),
      gorev: "", bolmeler: [
        { ad: t("KOMUT REGISTER'I (IR)", "INSTRUCTION REGISTER (IR)"), rol: /^IR/, x: 0, y: 0, w: 165, h: 150, gorev: t("çalışan komut", "current instruction") },
        { ad: t("ADRES REGISTER'I (MAR)", "ADDRESS REGISTER (MAR)"), rol: /^MAR/, x: 165, y: 0, w: 165, h: 150, gorev: t("bellek adresi", "memory address") },
      ],
      aciklama: t(
        "IR (komut register'ı) bellekten okunan komutu tutar: işlem kodu ve alanları kontrol birimine, sabit birimine, register seçimine ve koşul birimine gider. MAR (bellek adres register'ı) erişilecek adresi tutar ve doğrudan arka paneldeki 16 bitlik adres yolunu sürer. İkisi de iki 74HC574'tür, veri yolundan yüklenir.",
        "IR (instruction register) holds the instruction read from memory: its opcode and fields go to the control unit, the immediate unit, register select and the condition unit. MAR (memory address register) holds the address to access and drives the 16-bit address bus on the backplane directly. Both are two 74HC574s loaded from the data bus.",
      ),
    },
    {
      id: "bellek", ad: t("BELLEK ARAYÜZÜ", "MEMORY INTERFACE"), rol: "tampon", x: 1100, y: 410, w: 300, h: 150, bloklar: cpu("Bellek arayüzü"),
      gorev: t("16 bit iç veri yolu ↔ bayt hatları (DE, DO)", "16-bit internal data bus ↔ byte lanes (DE, DO)"),
      aciklama: t(
        "İç veri yolunu arka paneldeki iki 8 bitlik bayt hattına bağlar: DE çift adresli, DO tek adresli bayttır. Üç 74HC245 alıcı-verici kelime ve bayt erişimine göre yönü ve şeridi seçer; bayt okumada bir 74HC541 yüksek baytı sıfırlar. Bellek okuma (~MRD) ve yazma darbeleri (~MWE_E, ~MWE_O) burada üretilir; yazma darbesi saat kartının WR_WIN penceresi içindedir.",
        "Connects the internal data bus to the two 8-bit byte lanes on the backplane: DE is the even-address byte, DO the odd-address byte. Three 74HC245 transceivers pick the direction and lane for word and byte accesses; on a byte read a 74HC541 clears the high byte. The memory read (~MRD) and write strobes (~MWE_E, ~MWE_O) are generated here; the write strobe stays inside the clock board's WR_WIN window.",
      ),
    },
    {
      id: "kontrol", ad: t("KONTROL", "CONTROL"), rol: "kontrol", x: 90, y: 655, w: 1310, h: 150, bloklar: cpu("Kontrol birimi", "Kontrol"),
      gorev: "", bolmeler: [
        { ad: t("KONTROL BİRİMİ (MİKROKOD)", "CONTROL UNIT (MICROCODE)"), bloklar: ["Kontrol birimi"], x: 0, y: 0, w: 700, h: 150, gorev: t("komut, adım ve koşuldan 32 kontrol biti; ROM yok, 74HC138 / 151 ve kapılarla", "32 control bits from instruction, step and condition; no ROM, built with 74HC138 / 151 and gates") },
        { ad: t("KONTROL REGISTER'I VE SIRALAYICI", "CONTROL REGISTER AND SEQUENCER"), bloklar: ["Kontrol"], x: 700, y: 0, w: 610, h: 150, gorev: t("kontrol register'ı (CR), adım sayacı, kesme ve HALT; veri yolu sürücüsü seçimi", "control register (CR), step counter, interrupt and HALT; data bus driver select") },
      ],
      aciklama: t(
        "Mikrokod tablosu (13 bit giriş: kesme, işlem kodu, f3, koşul, adım → 32 kontrol biti) ROM değil, 74HC138 kod çözücüleri, 74HC151 seçicileri ve kapılarla kurulu bir devredir (board/kontrol.ts, mikrokoddan üretilir). Kontrol register'ı (4 × 74HC574) çıkışları saatin düşen kenarında örnekler; böylece yükselen kenarda bütün register'lar kararlı kontrol hatlarıyla yüklenir. Adım sayacı (74HC161) komutun mikro adımını sayar; 74HC74'ler kesme, HALT ve hata durumlarını tutar; bir 74HC138 veri yolunu hangi birimin süreceğini seçer.",
        "The microcode table (13 input bits: interrupt, opcode, f3, condition, step → 32 control bits) is a circuit of 74HC138 decoders, 74HC151 selectors and gates, with no ROM (board/kontrol.ts, generated from the microcode). The control register (4 × 74HC574) samples the outputs on the falling clock edge, so on the rising edge every register loads with stable control lines. The step counter (74HC161) counts the instruction's micro-steps; 74HC74s hold the interrupt, HALT and fault states; a 74HC138 selects which unit drives the data bus.",
      ),
    },
    {
      id: "arka", ad: t("ARKA PANEL", "BACKPLANE"), rol: "gc", x: 1520, y: 116, w: 130, h: 689, bloklar: cpu("Besleme ve arka panel"),
      gorev: t("J1: öbür kartlara giden bütün hatlar", "J1: every line to the other boards"),
      aciklama: t(
        "CPU kartının 2 × 32 pinli kenar konnektörü (J1). Adres yolu (A0–A15), iki bayt hattı (DE, DO), bellek denetimi (~MRD, ~MWE_E, ~MWE_O), saat (CLK, WR_WIN), ~RESET, IRQ ve durum hatları (HALTED, FAULT) arka panelden öbür kartlara gider. Besleme (5 V, GND) de buradan gelir; kartın girişinde 100 µF kondansatör var.",
        "The CPU board's 2 × 32-pin edge connector (J1). The address bus (A0–A15), the two byte lanes (DE, DO), memory control (~MRD, ~MWE_E, ~MWE_O), clock (CLK, WR_WIN), ~RESET, IRQ and the status lines (HALTED, FAULT) reach the other boards through the backplane. Power (5 V, GND) comes in here too, with a 100 µF capacitor at the board input.",
      ),
    },
    {
      id: "yapistirici", ad: t("YAPIŞTIRICI LOJİK", "GLUE LOGIC"), rol: "not", x: 90, y: 866, w: 350, h: 140, bloklar: cpu("Yapıştırıcı lojik"),
      gorev: t("kapılar bloklara dağıtılmış: kutulardaki “+ N kapı” satırları", "gates are assigned to blocks: the “+ N gates” lines in the boxes"),
      aciklama: t(
        "Kartın küçük kapıları (AND, OR, NAND, NOR, XOR, NOT, 3 ve 4 girişli kapılar) aynı türden çiplere paketlenir: bir 74HC08'in dört kapısı farklı bloklara ait olabilir. Her kapının ait olduğu blok bilinir; diyagramdaki kutular kendi kapılarını “+ N kapı” olarak gösterir. Kapıların çoğu kontrol biriminin mikrokod devresidir.",
        "The board's small gates (AND, OR, NAND, NOR, XOR, NOT, 3- and 4-input gates) are packed into chips of the same type, so the four gates of one 74HC08 can belong to different blocks. Each gate's block is known, and the boxes in the diagram show their own gates as “+ N gates”. Most gates belong to the control unit's microcode circuit.",
      ),
    },
  ];

  const yollar: Yol[] = [
    {
      id: "veri", tur: "veri", ad: t("İÇ VERİ YOLU", "INTERNAL DATA BUS"), bit: 16, netler: netDizisi("BUS", 16),
      aciklama: t(
        "Kartın tek 16 bitlik veri yolu: her saat döngüsünde tek bir birim sürer (register, ALU, PC, bellek, sabit ya da bayraklar), istenen birimler saat kenarında yükler. Sürülmeyince dirençlerle 0.",
        "The board's single 16-bit data bus: in each clock cycle one unit drives it (a register, the ALU, PC, memory, the immediate unit or the flags) and the selected units load on the clock edge. Resistors pull it to 0 when nothing drives it.",
      ),
      uclar: [
        { kutu: "reg", yon: "iki" }, { kutu: "gecici", yon: "giris" }, { kutu: "alu", yon: "cikis" }, { kutu: "bayrak", yon: "iki" },
        { kutu: "pc", yon: "iki" }, { kutu: "sabit", yon: "cikis" }, { kutu: "marir", yon: "giris" }, { kutu: "bellek", yon: "iki" },
      ],
      govde: [[[220, 360], [1290, 360]]],
      kollar: [
        [[220, 332], [220, 360]], [[540, 332], [540, 360]], [[900, 332], [900, 360]], [[1290, 332], [1290, 360]],
        [[220, 410], [220, 360]], [[540, 410], [540, 360]], [[900, 410], [900, 360]], [[1290, 410], [1290, 360]],
      ],
      etiketler: [{ x: 380, y: 350, metin: t("VERİ YOLU (16 BİT)", "DATA BUS (16 BITS)") }, { x: 1095, y: 350, metin: "BUS0–BUS15" }],
    },
    {
      id: "ta", tur: "yerel", ad: "TA", bit: 16, netler: netDizisi("TA", 16),
      aciklama: t("TA register'ının çıkışı: ALU'nun A girişi.", "Output of the TA register: the ALU's A input."),
      uclar: [{ kutu: "gecici", yon: "cikis" }, { kutu: "alu", yon: "giris" }],
      kollar: [[[650, 236], [720, 236]]],
      etiketler: [{ x: 685, y: 228, metin: "TA" }],
    },
    {
      id: "tb", tur: "yerel", ad: "TB", bit: 16, netler: netDizisi("TB", 16),
      aciklama: t("TB register'ının çıkışı: ALU'nun B girişi.", "Output of the TB register: the ALU's B input."),
      uclar: [{ kutu: "gecici", yon: "cikis" }, { kutu: "alu", yon: "giris" }],
      kollar: [[[650, 286], [720, 286]]],
      etiketler: [{ x: 685, y: 278, metin: "TB" }],
    },
    {
      id: "nzcv", tur: "yerel", ad: "N Z C V", netler: ["RES15", "Z_ALU", "C_ALU", "V_ALU"],
      aciklama: t(
        "ALU'nun sonucundan bayraklar: N (sonucun 15. biti), Z (sıfır), C (elde), V (taşma).",
        "Flags from the ALU result: N (bit 15 of the result), Z (zero), C (carry), V (overflow).",
      ),
      uclar: [{ kutu: "alu", yon: "cikis" }, { kutu: "bayrak", yon: "giris" }],
      kollar: [[[1110, 261], [1190, 261]]],
      etiketler: [{ x: 1150, y: 253 }],
    },
    {
      id: "c", tur: "yerel", ad: "C", netler: ["~CFLAG"],
      aciklama: t(
        "C bayrağı ALU kod çözücüye gider: ADC, SBC, ROL ve ROR eldeyi kullanır.",
        "The C flag goes to the ALU decoder: ADC, SBC, ROL and ROR use the carry.",
      ),
      uclar: [{ kutu: "bayrak", yon: "cikis" }, { kutu: "alu", yon: "giris" }],
      kollar: [[[1190, 161], [1110, 161]]],
      etiketler: [{ x: 1150, y: 153 }],
    },
    {
      id: "ir-sabit", tur: "yerel", ad: "IR", netler: netDizisi("IR", 12),
      aciklama: t("Komutun sabit alanları (IR0–IR11) sabit birimine.", "The instruction's constant fields (IR0–IR11) to the immediate unit."),
      uclar: [{ kutu: "marir", yon: "cikis" }, { kutu: "sabit", yon: "giris" }],
      kollar: [[[720, 476], [670, 476]]],
      etiketler: [{ x: 695, y: 468 }],
    },
    {
      id: "ir-kontrol", tur: "yerel", ad: t("KOMUT (IR)", "INSTRUCTION (IR)"), netler: netDizisi("IR", 16),
      aciklama: t(
        "Komutun işlem kodu, f3 ve h alanları kontrol birimine (mikrokod tablosunun girişi) ve ALU kod çözücüye.",
        "The instruction's opcode, f3 and h fields to the control unit (inputs of the microcode table) and the ALU decoder.",
      ),
      uclar: [{ kutu: "marir", yon: "cikis" }, { kutu: "kontrol", yon: "giris" }],
      kollar: [[[790, 560], [790, 655]]],
      etiketler: [{ x: 780, y: 612, hiza: "son", metin: t("KOMUT (IR, 16 BİT)", "INSTRUCTION (IR, 16 BITS)") }],
    },
    {
      id: "adres", tur: "adres", ad: t("ADRES YOLU", "ADDRESS BUS"), bit: 16, netler: netDizisi("A", 16),
      aciklama: t(
        "MAR'ın çıkışı: arka paneldeki 16 bitlik adres yolu (A0–A15). Bellek arayüzü A0'a bakarak çift ya da tek bayt şeridini seçer.",
        "Output of MAR: the 16-bit address bus on the backplane (A0–A15). The memory interface looks at A0 to pick the even or odd byte lane.",
      ),
      uclar: [{ kutu: "marir", yon: "cikis" }, { kutu: "arka", yon: "giris" }, { kutu: "bellek", yon: "giris" }],
      kollar: [[[1000, 560], [1000, 610], [1520, 610]], [[1180, 610], [1180, 560]]],
      etiketler: [{ x: 1012, y: 632, hiza: "bas", metin: t("ADRES YOLU A0–A15 (16 BİT)", "ADDRESS BUS A0–A15 (16 BITS)") }],
    },
    {
      id: "kontrol", tur: "kontrol", ad: t("KONTROL HATLARI", "CONTROL LINES"), netler: kontrolNetleri,
      aciklama: t(
        "Kontrol register'ının 32 çıkışı (CW0–CW31: veri yolu kaynağı, register seçimi, ALU işlemi, yükleme izinleri …) ve kaynak çözücünün 6 seçme hattı (~SRC_*): her saat döngüsünde hangi birimin veri yolunu süreceğini ve hangilerinin yükleyeceğini belirler.",
        "The control register's 32 outputs (CW0–CW31: data bus source, register select, ALU operation, load enables …) and the source decoder's 6 select lines (~SRC_*): in each clock cycle they decide which unit drives the data bus and which ones load.",
      ),
      uclar: [
        { kutu: "kontrol", yon: "cikis" }, { kutu: "reg", yon: "giris" }, { kutu: "gecici", yon: "giris" }, { kutu: "alu", yon: "giris" }, { kutu: "bayrak", yon: "giris" },
        { kutu: "pc", yon: "giris" }, { kutu: "sabit", yon: "giris" }, { kutu: "marir", yon: "giris" }, { kutu: "bellek", yon: "giris" },
      ],
      kollar: [
        [[90, 730], [50, 730], [50, 88], [1400, 88], [1400, 116]],
        [[320, 88], [320, 116]], [[600, 88], [600, 116]], [[1050, 88], [1050, 116]],
        [[150, 655], [150, 560]], [[470, 655], [470, 560]], [[850, 655], [850, 560]], [[1340, 655], [1340, 560]],
      ],
      etiketler: [{ x: 825, y: 80, metin: t("KONTROL HATLARI (CW0–CW31 + 6 SÜRÜCÜ SEÇİMİ)", "CONTROL LINES (CW0–CW31 + 6 DRIVER SELECTS)") }],
    },
    {
      id: "kosul", tur: "kontrol", ad: t("KOŞUL, I", "CONDITION, I"), netler: ["COND", "IFLAG"],
      aciklama: t(
        "Koşul biriminin çıkışı (COND: dallanma koşulu doğru mu) mikrokod tablosunun girişidir; I bayrağı kesmenin kabul edilip edilmeyeceğini belirler.",
        "The condition unit's output (COND: is the branch condition true) is an input of the microcode table; the I flag decides whether an interrupt is accepted.",
      ),
      uclar: [{ kutu: "bayrak", yon: "cikis" }, { kutu: "kontrol", yon: "giris" }],
      kollar: [[[1430, 332], [1430, 346]], [[1250, 833], [1250, 805]]],
      baglayicilar: [
        { nokta: [1430, 346], metin: t("KOŞUL, I → KONTROL", "COND, I → CONTROL"), yon: "asagi" },
        { nokta: [1250, 833], metin: t("KOŞUL, I ← BAYRAKLAR", "COND, I ← FLAGS"), yon: "asagi" },
      ],
      etiketler: [],
    },
    {
      id: "bayt", tur: "veri", ad: t("VERİ", "DATA"), bit: 16, netler: [...netDizisi("DE", 8), ...netDizisi("DO", 8)],
      aciklama: t(
        "Arka paneldeki iki bayt hattı: DE (çift adresli bayt) ve DO (tek adresli bayt). Kelime erişiminde ikisi birlikte, bayt erişiminde biri kullanılır.",
        "The two byte lanes on the backplane: DE (even-address byte) and DO (odd-address byte). A word access uses both, a byte access one of them.",
      ),
      uclar: [{ kutu: "bellek", yon: "iki" }, { kutu: "arka", yon: "iki" }],
      kollar: [[[1400, 446], [1520, 446]]],
      etiketler: [{ x: 1460, y: 437, metin: "DE, DO (16)" }],
    },
    {
      id: "bellek-denetim", tur: "kontrol", ad: "~MRD ~MWE", netler: ["~MRD", "~MWE_E", "~MWE_O"],
      aciklama: t(
        "Bellek okuma (~MRD) ve çift / tek bayt yazma darbeleri (~MWE_E, ~MWE_O): bellek ve G/Ç kartları bunlarla okur ve yazar.",
        "Memory read (~MRD) and even / odd byte write strobes (~MWE_E, ~MWE_O): the memory and I/O boards read and write with them.",
      ),
      uclar: [{ kutu: "bellek", yon: "cikis" }, { kutu: "arka", yon: "giris" }],
      kollar: [[[1400, 494], [1520, 494]]],
      etiketler: [{ x: 1460, y: 486 }],
    },
    {
      id: "wrwin", tur: "saat", ad: "WR_WIN", netler: ["WR_WIN"],
      aciklama: t(
        "Saat kartının yazma penceresi: yazma darbeleri bu pencerenin içinde kalır (kontrol hatları oturduktan sonra başlar, yükselen kenardan önce biter).",
        "The clock board's write window: write strobes stay inside it (it opens after the control lines settle and closes before the rising edge).",
      ),
      uclar: [{ kutu: "arka", yon: "cikis" }, { kutu: "bellek", yon: "giris" }],
      kollar: [[[1520, 536], [1400, 536]]],
      etiketler: [{ x: 1460, y: 528 }],
    },
    {
      id: "saat", tur: "saat", ad: "CLK, ~RESET", netler: ["CLK", "~RESET"],
      aciklama: t(
        "Saat kartından CPU saati ve reset. Kontrol bunlardan kapılı saatleri (CLKR ∧ yükle) üretir; PC ve bayraklar da doğrudan kullanır.",
        "CPU clock and reset from the clock board. The control logic derives gated clocks from them (CLKR ∧ load); the PC and flags also use them directly.",
      ),
      uclar: [{ kutu: "arka", yon: "cikis" }, { kutu: "kontrol", yon: "giris" }],
      kollar: [[[1520, 690], [1400, 690]]],
      etiketler: [{ x: 1460, y: 682 }],
    },
    {
      id: "irq", tur: "kontrol", ad: "IRQ", netler: ["IRQ"],
      aciklama: t(
        "G/Ç kartının kesme isteği: I bayrağı açıksa bir sonraki komut yerine kesme girişi çalışır.",
        "Interrupt request from the I/O board: if the I flag is set, the interrupt entry runs instead of the next instruction.",
      ),
      uclar: [{ kutu: "arka", yon: "cikis" }, { kutu: "kontrol", yon: "giris" }],
      kollar: [[[1520, 734], [1400, 734]]],
      etiketler: [{ x: 1460, y: 726 }],
    },
    {
      id: "durum", tur: "kontrol", ad: "HALTED, FAULT", netler: ["HALTED", "FAULT"],
      aciklama: t(
        "CPU'nun durumu: HALT komutuyla durdu ya da yasadışı bir komutta hata verdi (kartta iki LED).",
        "CPU status: stopped by a HALT instruction, or faulted on an illegal instruction (two LEDs on the board).",
      ),
      uclar: [{ kutu: "kontrol", yon: "cikis" }, { kutu: "arka", yon: "giris" }],
      kollar: [[[1400, 778], [1520, 778]]],
      etiketler: [{ x: 1460, y: 770 }],
    },
  ];

  return {
    id: "cpu",
    baslik: t("CPU16 işlemci kartı · mimari", "CPU16 processor board · architecture"),
    altBaslik: t("16 bit veri yolu · 16 bit adres · mikrokod kapılarla (ROM yok)", "16-bit data bus · 16-bit address · microcode in gates (no ROM)"),
    aciklama: t(
      "CPU kartının blokları ve aralarındaki yollar. Tek 16 bitlik iç veri yolu: her saat döngüsünde bir birim sürer, istenenler yükler. Kontrol birimi komuttan ve adım sayacından 32 kontrol hattını üretir. Kart, arka panel konnektörüyle bellek, saat ve G/Ç kartlarına bağlanır.",
      "The CPU board's blocks and the connections between them. A single 16-bit internal data bus: one unit drives it in each clock cycle and the selected units load. The control unit derives the 32 control lines from the instruction and the step counter. The board connects to the memory, clock and I/O boards through the backplane connector.",
    ),
    genislik: 1680,
    yukseklik: 1030,
    kutular,
    gruplar: [],
    yollar,
    lejant: {
      x: 480, y: 866, w: 1160, h: 140,
      kisaltmalar: [
        ["ALU", t("Aritmetik mantık birimi", "Arithmetic logic unit")],
        ["PC", t("Program sayacı", "Program counter")],
        ["MAR", t("Bellek adres register'ı", "Memory address register")],
        ["IR", t("Komut register'ı", "Instruction register")],
        ["CW", t("Kontrol kelimesi (32 hat)", "Control word (32 lines)")],
        ["NZCV", t("Negatif, sıfır, elde, taşma", "Negative, zero, carry, overflow")],
        ["DE, DO", t("Çift / tek adresli bayt hattı", "Even / odd byte lane")],
        ["~", t("Aktif düşük sinyal", "Active-low signal")],
      ],
    },
  };
}
