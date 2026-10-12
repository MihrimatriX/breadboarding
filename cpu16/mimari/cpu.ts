// CPU16 işlemci kartının mimari diyagramı: kartın her bloğu bir kutuda, aralarındaki gerçek yollar
// (16 bit iç veri yolu, adres yolu, kontrol hatları, ALU'nun girişleri ve bayrakları) ve kartın
// kenarındaki arka panel konnektörü. Yerleşim elle (ızgara 10 birim); parça listeleri devreden.
// Datapath: cpu16/board/cpu-card.ts, kontrol birimi: board/kontrol.ts, belge: docs/mikromimari.md.

import type { Board } from "../board/board.ts";
import { netDizisi, type Diyagram, type Kutu, type Yol } from "./model.ts";

const cpu = (...bloklar: string[]) => bloklar.map((block) => ({ card: "cpu", block }));

/** Kontrol kelimesinin hatları ve veri yolu sürücüsü seçimi (~SRC_*) */
const KONTROL_NETLERI = [...netDizisi("CW", 32), "~SRC_REG", "~SRC_ALU", "~SRC_PC", "~SRC_MEM", "~SRC_IMM", "~SRC_FLAGS"];

export function cpuDiyagrami(board: Board): Diyagram {
  const kontrolNetleri = KONTROL_NETLERI.filter((n) => board.has(n));
  const kutular: Kutu[] = [
    {
      id: "reg", ad: "REGISTER DOSYASI (R0–R7)", rol: "register", x: 90, y: 116, w: 290, h: 216, bloklar: cpu("Register dosyası"),
      gorev: "8 × 16 bit; RSEL ve IR alanlarıyla seçilir",
      aciklama: "Sekiz adet 16 bitlik genel amaçlı register (r6 yığın göstericisi SP, r7 dönüş adresi LR). Her register iki 74HC574'tür (düşük ve yüksek bayt); çıkışları hep açıktır, değeri iki çubuk göstergede görünür, iç veri yoluna iki 74HC541 tamponla çıkar. Hangi register'ın okunup yazılacağını kontrol kelimesinin RSEL alanı ve komuttaki register alanları (rd, rs1, rs2) belirler: üç 74HC151 indeksi seçer, iki 74HC138 okuma ve yazma hattına çevirir.",
    },
    {
      id: "gecici", ad: "GEÇİCİ REGISTER'LAR", rol: "register", x: 430, y: 116, w: 220, h: 216, bloklar: cpu("Geçici register'lar"),
      gorev: "TA ve TB: ALU'nun iki girişi",
      aciklama: "Tek bir veri yolu olduğu için ALU'nun iki işleneni sırayla, birer saat döngüsünde TA ve TB'ye alınır; ALU onları sürekli görür. Her biri iki 74HC574 (çıkışları hep açık).",
    },
    {
      id: "alu", ad: "ALU", rol: "islem", x: 720, y: 116, w: 390, h: 216, bloklar: cpu("ALU kod çözücü", "ALU"),
      gorev: "", bolmeler: [
        { ad: "ALU KOD ÇÖZÜCÜ", bloklar: ["ALU kod çözücü"], x: 0, y: 0, w: 390, h: 88, gorev: "işlem kodu → 24 ALU denetim biti" },
        { ad: "ALU (ARİTMETİK MANTIK BİRİMİ)", bloklar: ["ALU"], x: 0, y: 88, w: 390, h: 128, gorev: "toplama, çıkarma, mantık, kaydırma" },
      ],
      aciklama: "16 bitlik aritmetik mantık birimi. Toplayıcı dört 74HC283'tür (çıkarmada girişler XOR ile terslenir); mantık işlemleri her bit için bir 74HC151 doğruluk tablosuyla yapılır; 74HC153'ler toplam, mantık, sola ve sağa kaydırma arasından sonucu seçer. İki 74HC688 sonucun sıfır olduğunu (Z) bulur; sonuç iki 74HC541 ile veri yoluna sürülür. ALU kod çözücü işlem kodunu (5 bit), komutun h bitini ve C bayrağını 24 denetim bitine çevirir (ROM yerine 74HC138'ler ve kapılar).",
    },
    {
      id: "bayrak", ad: "BAYRAKLAR VE KOŞUL", rol: "kontrol", x: 1190, y: 116, w: 270, h: 216, bloklar: cpu("Bayraklar ve koşul"),
      gorev: "N Z C V ve I bayrakları; dallanma koşulu (COND)",
      aciklama: "N (negatif), Z (sıfır), C (elde) ve V (taşma) bayrakları ALU'dan, RETI'de veri yolundan yüklenir (74HC74 flip-flop'lar). I kesme izni bayrağıdır. Koşul birimi (74HC151) komutun koşul alanına göre bayraklardan dallanma koşulunu (COND) üretir ve kontrol birimine verir; C bayrağı ALU kod çözücüye de gider (ADC, SBC, ROL, ROR).",
    },
    {
      id: "pc", ad: "PROGRAM SAYACI (PC)", rol: "register", x: 90, y: 410, w: 260, h: 150, bloklar: cpu("Program sayacı"),
      gorev: "sıradaki komutun adresi; += 2 ya da yüklenir",
      aciklama: "Dört 74HC161 sayacı PC'nin 1..15. bitlerini tutar (bit 0 her zaman 0: komutlar 2 bayt). Getirmede 2 artar, dallanmada veri yolundan yüklenir; iki 74HC541 onu veri yoluna sürer (MAR'a ya da LR'ye gitmek için).",
    },
    {
      id: "sabit", ad: "SABİT BİRİMİ", rol: "secici", x: 400, y: 410, w: 270, h: 150, bloklar: cpu("Sabit birimi"),
      gorev: "komuttaki sabiti (imm, ofset) 16 bite genişletir",
      aciklama: "Komutun içindeki sabitleri (imm6, imm8, imm9, 8 ve 12 bitlik ofsetler) işaret genişletip gerekirse 2 ile çarparak 16 bitlik değere çevirir; sabit 2 ve 4 de buradan gelir. Her bit bir 74HC151 seçicidir (8 kaynaktan biri); sonuç iki 74HC541 ile veri yoluna sürülür.",
    },
    {
      id: "marir", ad: "MAR VE IR", rol: "register", x: 720, y: 410, w: 330, h: 150, bloklar: cpu("MAR ve IR"),
      gorev: "", bolmeler: [
        { ad: "KOMUT REGISTER'I (IR)", rol: /^IR/, x: 0, y: 0, w: 165, h: 150, gorev: "çalışan komut" },
        { ad: "ADRES REGISTER'I (MAR)", rol: /^MAR/, x: 165, y: 0, w: 165, h: 150, gorev: "bellek adresi" },
      ],
      aciklama: "IR (komut register'ı) bellekten okunan komutu tutar: işlem kodu ve alanları kontrol birimine, sabit birimine, register seçimine ve koşul birimine gider. MAR (bellek adres register'ı) erişilecek adresi tutar ve doğrudan arka paneldeki 16 bitlik adres yolunu sürer. İkisi de iki 74HC574'tür, veri yolundan yüklenir.",
    },
    {
      id: "bellek", ad: "BELLEK ARAYÜZÜ", rol: "tampon", x: 1100, y: 410, w: 300, h: 150, bloklar: cpu("Bellek arayüzü"),
      gorev: "16 bit iç veri yolu ↔ bayt hatları (DE, DO)",
      aciklama: "İç veri yolunu arka paneldeki iki 8 bitlik bayt hattına bağlar: DE çift adresli, DO tek adresli bayttır. Üç 74HC245 alıcı-verici kelime ve bayt erişimine göre yönü ve şeridi seçer; bayt okumada bir 74HC541 yüksek baytı sıfırlar. Bellek okuma (~MRD) ve yazma darbeleri (~MWE_E, ~MWE_O) burada üretilir; yazma darbesi saat kartının WR_WIN penceresi içindedir.",
    },
    {
      id: "kontrol", ad: "KONTROL", rol: "kontrol", x: 90, y: 655, w: 1310, h: 150, bloklar: cpu("Kontrol birimi", "Kontrol"),
      gorev: "", bolmeler: [
        { ad: "KONTROL BİRİMİ (MİKROKOD)", bloklar: ["Kontrol birimi"], x: 0, y: 0, w: 700, h: 150, gorev: "komut, adım ve koşuldan 32 kontrol biti; ROM yok, 74HC138 / 151 ve kapılarla" },
        { ad: "KONTROL REGISTER'I VE SIRALAYICI", bloklar: ["Kontrol"], x: 700, y: 0, w: 610, h: 150, gorev: "kontrol register'ı (CR), adım sayacı, kesme ve HALT; veri yolu sürücüsü seçimi" },
      ],
      aciklama: "Mikrokod tablosu (13 bit giriş: kesme, işlem kodu, f3, koşul, adım → 32 kontrol biti) ROM değil, 74HC138 kod çözücüleri, 74HC151 seçicileri ve kapılarla kurulu bir devredir (board/kontrol.ts, mikrokoddan üretilir). Kontrol register'ı (4 × 74HC574) çıkışları saatin düşen kenarında örnekler; böylece yükselen kenarda bütün register'lar kararlı kontrol hatlarıyla yüklenir. Adım sayacı (74HC161) komutun mikro adımını sayar; 74HC74'ler kesme, HALT ve hata durumlarını tutar; bir 74HC138 veri yolunu hangi birimin süreceğini seçer.",
    },
    {
      id: "arka", ad: "ARKA PANEL", rol: "gc", x: 1520, y: 116, w: 130, h: 689, bloklar: cpu("Besleme ve arka panel"),
      gorev: "J1: öbür kartlara giden bütün hatlar",
      aciklama: "CPU kartının 2 × 32 pinli kenar konnektörü (J1). Adres yolu (A0–A15), iki bayt hattı (DE, DO), bellek denetimi (~MRD, ~MWE_E, ~MWE_O), saat (CLK, WR_WIN), ~RESET, IRQ ve durum hatları (HALTED, FAULT) arka panelden öbür kartlara gider. Besleme (5 V, GND) de buradan gelir; kartın girişinde 100 µF kondansatör var.",
    },
    {
      id: "yapistirici", ad: "YAPIŞTIRICI LOJİK", rol: "not", x: 90, y: 866, w: 350, h: 140, bloklar: cpu("Yapıştırıcı lojik"),
      gorev: "kapılar bloklara dağıtılmış: kutulardaki “+ N kapı” satırları",
      aciklama: "Kartın küçük kapıları (AND, OR, NAND, NOR, XOR, NOT, 3 ve 4 girişli kapılar) aynı türden çiplere paketlenir: bir 74HC08'in dört kapısı farklı bloklara ait olabilir. Her kapının ait olduğu blok bilinir; diyagramdaki kutular kendi kapılarını “+ N kapı” olarak gösterir. Kapıların çoğu kontrol biriminin mikrokod devresidir.",
    },
  ];

  const yollar: Yol[] = [
    {
      id: "veri", tur: "veri", ad: "İÇ VERİ YOLU", bit: 16, netler: netDizisi("BUS", 16),
      aciklama: "Kartın tek 16 bitlik veri yolu: her saat döngüsünde tek bir birim sürer (register, ALU, PC, bellek, sabit ya da bayraklar), istenen birimler saat kenarında yükler. Sürülmeyince dirençlerle 0.",
      uclar: [
        { kutu: "reg", yon: "iki" }, { kutu: "gecici", yon: "giris" }, { kutu: "alu", yon: "cikis" }, { kutu: "bayrak", yon: "iki" },
        { kutu: "pc", yon: "iki" }, { kutu: "sabit", yon: "cikis" }, { kutu: "marir", yon: "giris" }, { kutu: "bellek", yon: "iki" },
      ],
      govde: [[[220, 360], [1290, 360]]],
      kollar: [
        [[220, 332], [220, 360]], [[540, 332], [540, 360]], [[900, 332], [900, 360]], [[1290, 332], [1290, 360]],
        [[220, 410], [220, 360]], [[540, 410], [540, 360]], [[900, 410], [900, 360]], [[1290, 410], [1290, 360]],
      ],
      etiketler: [{ x: 380, y: 350, metin: "VERİ YOLU (16 BİT)" }, { x: 1095, y: 350, metin: "BUS0–BUS15" }],
    },
    {
      id: "ta", tur: "yerel", ad: "TA", bit: 16, netler: netDizisi("TA", 16),
      aciklama: "TA register'ının çıkışı: ALU'nun A girişi.",
      uclar: [{ kutu: "gecici", yon: "cikis" }, { kutu: "alu", yon: "giris" }],
      kollar: [[[650, 236], [720, 236]]],
      etiketler: [{ x: 685, y: 228, metin: "TA" }],
    },
    {
      id: "tb", tur: "yerel", ad: "TB", bit: 16, netler: netDizisi("TB", 16),
      aciklama: "TB register'ının çıkışı: ALU'nun B girişi.",
      uclar: [{ kutu: "gecici", yon: "cikis" }, { kutu: "alu", yon: "giris" }],
      kollar: [[[650, 286], [720, 286]]],
      etiketler: [{ x: 685, y: 278, metin: "TB" }],
    },
    {
      id: "nzcv", tur: "yerel", ad: "N Z C V", netler: ["RES15", "Z_ALU", "C_ALU", "V_ALU"],
      aciklama: "ALU'nun sonucundan bayraklar: N (sonucun 15. biti), Z (sıfır), C (elde), V (taşma).",
      uclar: [{ kutu: "alu", yon: "cikis" }, { kutu: "bayrak", yon: "giris" }],
      kollar: [[[1110, 261], [1190, 261]]],
      etiketler: [{ x: 1150, y: 253 }],
    },
    {
      id: "c", tur: "yerel", ad: "C", netler: ["~CFLAG"],
      aciklama: "C bayrağı ALU kod çözücüye gider: ADC, SBC, ROL ve ROR eldeyi kullanır.",
      uclar: [{ kutu: "bayrak", yon: "cikis" }, { kutu: "alu", yon: "giris" }],
      kollar: [[[1190, 161], [1110, 161]]],
      etiketler: [{ x: 1150, y: 153 }],
    },
    {
      id: "ir-sabit", tur: "yerel", ad: "IR", netler: netDizisi("IR", 12),
      aciklama: "Komutun sabit alanları (IR0–IR11) sabit birimine.",
      uclar: [{ kutu: "marir", yon: "cikis" }, { kutu: "sabit", yon: "giris" }],
      kollar: [[[720, 476], [670, 476]]],
      etiketler: [{ x: 695, y: 468 }],
    },
    {
      id: "ir-kontrol", tur: "yerel", ad: "KOMUT (IR)", netler: netDizisi("IR", 16),
      aciklama: "Komutun işlem kodu, f3 ve h alanları kontrol birimine (mikrokod tablosunun girişi) ve ALU kod çözücüye.",
      uclar: [{ kutu: "marir", yon: "cikis" }, { kutu: "kontrol", yon: "giris" }],
      kollar: [[[790, 560], [790, 655]]],
      etiketler: [{ x: 780, y: 612, hiza: "son", metin: "KOMUT (IR, 16 BİT)" }],
    },
    {
      id: "adres", tur: "adres", ad: "ADRES YOLU", bit: 16, netler: netDizisi("A", 16),
      aciklama: "MAR'ın çıkışı: arka paneldeki 16 bitlik adres yolu (A0–A15). Bellek arayüzü A0'a bakarak çift ya da tek bayt şeridini seçer.",
      uclar: [{ kutu: "marir", yon: "cikis" }, { kutu: "arka", yon: "giris" }, { kutu: "bellek", yon: "giris" }],
      kollar: [[[1000, 560], [1000, 610], [1520, 610]], [[1180, 610], [1180, 560]]],
      etiketler: [{ x: 1012, y: 632, hiza: "bas", metin: "ADRES YOLU A0–A15 (16 BİT)" }],
    },
    {
      id: "kontrol", tur: "kontrol", ad: "KONTROL HATLARI", netler: kontrolNetleri,
      aciklama: "Kontrol register'ının 32 çıkışı (CW0–CW31: veri yolu kaynağı, register seçimi, ALU işlemi, yükleme izinleri …) ve kaynak çözücünün 6 seçme hattı (~SRC_*): her saat döngüsünde hangi birimin veri yolunu süreceğini ve hangilerinin yükleyeceğini belirler.",
      uclar: [
        { kutu: "kontrol", yon: "cikis" }, { kutu: "reg", yon: "giris" }, { kutu: "gecici", yon: "giris" }, { kutu: "alu", yon: "giris" }, { kutu: "bayrak", yon: "giris" },
        { kutu: "pc", yon: "giris" }, { kutu: "sabit", yon: "giris" }, { kutu: "marir", yon: "giris" }, { kutu: "bellek", yon: "giris" },
      ],
      kollar: [
        [[90, 730], [50, 730], [50, 88], [1400, 88], [1400, 116]],
        [[320, 88], [320, 116]], [[600, 88], [600, 116]], [[1050, 88], [1050, 116]],
        [[150, 655], [150, 560]], [[470, 655], [470, 560]], [[850, 655], [850, 560]], [[1340, 655], [1340, 560]],
      ],
      etiketler: [{ x: 825, y: 80, metin: "KONTROL HATLARI (CW0–CW31 + 6 SÜRÜCÜ SEÇİMİ)" }],
    },
    {
      id: "kosul", tur: "kontrol", ad: "KOŞUL, I", netler: ["COND", "IFLAG"],
      aciklama: "Koşul biriminin çıkışı (COND: dallanma koşulu doğru mu) mikrokod tablosunun girişidir; I bayrağı kesmenin kabul edilip edilmeyeceğini belirler.",
      uclar: [{ kutu: "bayrak", yon: "cikis" }, { kutu: "kontrol", yon: "giris" }],
      kollar: [[[1430, 332], [1430, 346]], [[1250, 833], [1250, 805]]],
      baglayicilar: [
        { nokta: [1430, 346], metin: "KOŞUL, I → KONTROL", yon: "asagi" },
        { nokta: [1250, 833], metin: "KOŞUL, I ← BAYRAKLAR", yon: "asagi" },
      ],
      etiketler: [],
    },
    {
      id: "bayt", tur: "veri", ad: "VERİ", bit: 16, netler: [...netDizisi("DE", 8), ...netDizisi("DO", 8)],
      aciklama: "Arka paneldeki iki bayt hattı: DE (çift adresli bayt) ve DO (tek adresli bayt). Kelime erişiminde ikisi birlikte, bayt erişiminde biri kullanılır.",
      uclar: [{ kutu: "bellek", yon: "iki" }, { kutu: "arka", yon: "iki" }],
      kollar: [[[1400, 446], [1520, 446]]],
      etiketler: [{ x: 1460, y: 437, metin: "DE, DO (16)" }],
    },
    {
      id: "bellek-denetim", tur: "kontrol", ad: "~MRD ~MWE", netler: ["~MRD", "~MWE_E", "~MWE_O"],
      aciklama: "Bellek okuma (~MRD) ve çift / tek bayt yazma darbeleri (~MWE_E, ~MWE_O): bellek ve G/Ç kartları bunlarla okur ve yazar.",
      uclar: [{ kutu: "bellek", yon: "cikis" }, { kutu: "arka", yon: "giris" }],
      kollar: [[[1400, 494], [1520, 494]]],
      etiketler: [{ x: 1460, y: 486 }],
    },
    {
      id: "wrwin", tur: "saat", ad: "WR_WIN", netler: ["WR_WIN"],
      aciklama: "Saat kartının yazma penceresi: yazma darbeleri bu pencerenin içinde kalır (kontrol hatları oturduktan sonra başlar, yükselen kenardan önce biter).",
      uclar: [{ kutu: "arka", yon: "cikis" }, { kutu: "bellek", yon: "giris" }],
      kollar: [[[1520, 536], [1400, 536]]],
      etiketler: [{ x: 1460, y: 528 }],
    },
    {
      id: "saat", tur: "saat", ad: "CLK, ~RESET", netler: ["CLK", "~RESET"],
      aciklama: "Saat kartından CPU saati ve reset. Kontrol bunlardan kapılı saatleri (CLKR ∧ yükle) üretir; PC ve bayraklar da doğrudan kullanır.",
      uclar: [{ kutu: "arka", yon: "cikis" }, { kutu: "kontrol", yon: "giris" }],
      kollar: [[[1520, 690], [1400, 690]]],
      etiketler: [{ x: 1460, y: 682 }],
    },
    {
      id: "irq", tur: "kontrol", ad: "IRQ", netler: ["IRQ"],
      aciklama: "G/Ç kartının kesme isteği: I bayrağı açıksa bir sonraki komut yerine kesme girişi çalışır.",
      uclar: [{ kutu: "arka", yon: "cikis" }, { kutu: "kontrol", yon: "giris" }],
      kollar: [[[1520, 734], [1400, 734]]],
      etiketler: [{ x: 1460, y: 726 }],
    },
    {
      id: "durum", tur: "kontrol", ad: "HALTED, FAULT", netler: ["HALTED", "FAULT"],
      aciklama: "CPU'nun durumu: HALT komutuyla durdu ya da yasadışı bir komutta hata verdi (kartta iki LED).",
      uclar: [{ kutu: "kontrol", yon: "cikis" }, { kutu: "arka", yon: "giris" }],
      kollar: [[[1400, 778], [1520, 778]]],
      etiketler: [{ x: 1460, y: 770 }],
    },
  ];

  return {
    id: "cpu",
    baslik: "CPU16 işlemci kartı · mimari",
    altBaslik: "16 bit veri yolu · 16 bit adres · mikrokod kapılarla (ROM yok)",
    aciklama: "CPU kartının blokları ve aralarındaki yollar. Tek 16 bitlik iç veri yolu: her saat döngüsünde bir birim sürer, istenenler yükler. Kontrol birimi komuttan ve adım sayacından 32 kontrol hattını üretir. Kart, arka panel konnektörüyle bellek, saat ve G/Ç kartlarına bağlanır.",
    genislik: 1680,
    yukseklik: 1030,
    kutular,
    gruplar: [],
    yollar,
    lejant: {
      x: 480, y: 866, w: 1160, h: 140,
      kisaltmalar: [
        ["ALU", "Aritmetik mantık birimi"],
        ["PC", "Program sayacı"],
        ["MAR", "Bellek adres register'ı"],
        ["IR", "Komut register'ı"],
        ["CW", "Kontrol kelimesi (32 hat)"],
        ["NZCV", "Negatif, sıfır, elde, taşma"],
        ["DE, DO", "Çift / tek adresli bayt hattı"],
        ["~", "Aktif düşük sinyal"],
      ],
    },
  };
}
