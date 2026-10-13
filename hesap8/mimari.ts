// 8 bit hesap makinesinin mimari diyagramı: anahtarlardan göstergelere veri akışı. Soldan sağa:
// anahtarlar (A, B, işlem, lamba testi) → dört işlem birimi (toplama / çıkarma, çarpma, bölme) →
// sonuç seçici → ikiliden onluğa çevirme → 74HC4511 ve 7 segment göstergeler. Üst sırada A ve B
// sayılarının kendi göstergeleri. Parça listeleri devreden (hesap8/kart.ts), yerleşim elle; çizimi
// ve denetimi CPU16 diyagramlarıyla aynı (cpu16/mimari). Tasarım: hesap8/docs/tasarim.md.
// Metinler iki dilde: t("Türkçe", "English"); sinyal adları (TOPLA, HATA, KALAN_SONUK …) değişmez.

import type { Board } from "../cpu16/board/board.ts";
import { cevirici, Devre, netDizisi, type BlokKimligi, type Dil, type Diyagram, type Kutu, type Yol } from "../cpu16/mimari/model.ts";

const h = (...bloklar: string[]): BlokKimligi[] => bloklar.map((block) => ({ card: "hesap", block }));

// ---- yerleşim (ızgara 10 birim)
const SOL = { x: 40, w: 260 }; // anahtarlar
const ISLEM = { x: 400, w: 290 }; // işlem birimleri
const SECICI = { x: 780, w: 190 };
const ONLUK = { x: 1040, w: 250 };
const GOSTERGE = { x: 1410, w: 310 };
const SAG_HAT = 1760; // lamba testi hattı
const SATIR_A = { y: 100, h: 112 };
const SATIR_B = { y: 224, h: 112 };
const SATIR_SONUC = { y: 430, h: 160 };
const SATIR_KALAN = { y: 680, h: 120 };

export function hesapDiyagrami(board: Board, devre = new Devre(board), dil: Dil = "tr"): Diyagram {
  const t = cevirici(dil);
  /** iki blok arasındaki netler (adsız iç netler dahil): BCD hatları ve çarpım bitleri adlandırılmamış */
  const aradaki = (kaynak: string, hedef: string) => devre.aradakiNetler(h(kaynak), h(hedef));

  const kutular: Kutu[] = [
    {
      id: "anahtar", ad: t("ANAHTARLAR", "SWITCHES"), rol: "gc", gorev: "", x: SOL.x, y: 96, w: SOL.w, h: 804, bloklar: h("Anahtarlar"), pasifGoster: true,
      bolmeler: [
        { ad: t("A SAYISI", "NUMBER A"), rol: /^A /, gorev: t("SW1: A7 … A0, açık = 1", "SW1: A7 … A0, on = 1"), x: 0, y: 0, w: SOL.w, h: 120 },
        { ad: t("B SAYISI", "NUMBER B"), rol: /^B /, gorev: "SW2: B7 … B0", x: 0, y: 120, w: SOL.w, h: 120 },
        { ad: t("İŞLEM SEÇİMİ", "OPERATION SELECT"), rol: /^(işlem|ISLEM)/, gorev: t("OP1 OP0: 00 +, 01 −, 10 ×, 11 ÷; işlem LED'leri", "OP1 OP0: 00 +, 01 −, 10 ×, 11 ÷; operation LEDs"), x: 0, y: 240, w: SOL.w, h: 460 },
        { ad: t("LAMBA TESTİ", "LAMP TEST"), rol: /^(LAMBA|lamba)/, gorev: t("basılıyken bütün segmentler yanar", "all segments light while pressed"), x: 0, y: 700, w: SOL.w, h: 104 },
      ],
      aciklama: t(
        "Girişler: iki 8'li DIP anahtar (A ve B sayıları, 0–255), işlemi seçen 2'li DIP anahtar ve lamba testi butonu. Anahtarlar 10 kΩ dizilerle aşağı çekilir (kapalı = 0). İşlem kodu (OP1 OP0) kapılarla dört sinyale çözülür (TOPLA, ÇIKAR, ÇARP, BÖL); bunlar hem işlem birimlerine hem de dört yeşil LED'e gider.",
        "Inputs: two 8-way DIP switches (numbers A and B, 0–255), a 2-way DIP switch that selects the operation, and the lamp test button. 10 kΩ resistor arrays pull the switches down (off = 0). Gates decode the operation code (OP1 OP0) into four signals (TOPLA, ÇIKAR, ÇARP, BÖL: add, subtract, multiply, divide); they go both to the arithmetic units and to four green LEDs.",
      ),
    },
    {
      id: "toplama", ad: t("TOPLAMA VE ÇIKARMA", "ADD AND SUBTRACT"), rol: "islem", x: ISLEM.x, y: 390, w: ISLEM.w, h: 140, bloklar: h("Toplama ve çıkarma"),
      gorev: t("A ± B; eksiyse işaret ve |A − B|", "A ± B; sign and |A − B| when negative"),
      aciklama: t(
        "Çıkarma toplamaya çevrilir: A − B = A + ~B + 1. B'nin bitleri XOR'larla terslenir (74HC86), iki 74HC283 toplar. Toplamada elde 9. bittir (T8, 510'a kadar). Çıkarmada sonuç eksiyse NEG = 1: fark yeniden terslenip 1 eklenir (iki 74HC283 daha), işaret hanesinde “−” yanar.",
        "Subtraction becomes addition: A − B = A + ~B + 1. XOR gates (74HC86) invert the bits of B and two 74HC283s add. When adding, the carry is the 9th bit (T8, up to 510). When subtracting, a negative result sets NEG = 1: the difference is inverted again and 1 is added (two more 74HC283s), and the sign digit shows “−”.",
      ),
    },
    {
      id: "carpma", ad: t("ÇARPMA", "MULTIPLY"), rol: "islem", x: ISLEM.x, y: 560, w: ISLEM.w, h: 120, bloklar: h("Çarpma"),
      gorev: t("8 × 8 dizi çarpıcı → 16 bit", "8 × 8 array multiplier → 16 bits"),
      aciklama: t(
        "Elle çarpmanın ikilik hali: 64 AND kapısı kısmi çarpımları (A[j] · B[i]) verir, 7 sıra toplayıcı (2 × 74HC283 her sırada) bunları kaydırarak toplar. En çok 255 × 255 = 65 025.",
        "Long multiplication in binary: 64 AND gates form the partial products (A[j] · B[i]) and 7 rows of adders (2 × 74HC283 per row) add them up with shifts. At most 255 × 255 = 65,025.",
      ),
    },
    {
      id: "bolme", ad: t("BÖLME", "DIVIDE"), rol: "islem", x: ISLEM.x, y: 710, w: ISLEM.w, h: 150, bloklar: h("Bölme"),
      gorev: t("geri yüklemeli bölücü: bölüm, kalan, B = 0", "restoring divider: quotient, remainder, B = 0"),
      aciklama: t(
        "Uzun bölmenin ikilik hali, 8 aynı basamak: kalan bir bit sola kayar, A'nın sıradaki biti girer; kalan ≥ B ise B çıkarılır (2 × 74HC283) ve bölümün biti 1 olur, değilse eski kalan geri yüklenir (2 × 74HC157). B = 0 ise (74HC30) HATA: LED yanar, sonuç ve kalan söner.",
        "Long division in binary, 8 identical stages: the remainder shifts left one bit and the next bit of A comes in. If the remainder ≥ B, B is subtracted (2 × 74HC283) and the quotient bit is 1; otherwise the old remainder is restored (2 × 74HC157). If B = 0 (74HC30), HATA (error) is set: the LED lights and the result and remainder go blank.",
      ),
    },
    {
      id: "secici", ad: t("SONUÇ SEÇİCİ", "RESULT SELECTOR"), rol: "secici", x: SECICI.x, y: 440, w: SECICI.w, h: 260, bloklar: h("Sonuç seçici"),
      gorev: t("işlem anahtarı dört sonuçtan birini seçer (16 bit)", "the operation switch picks one of four results (16 bits)"),
      aciklama: t(
        "Sekiz 74HC153 (çift 4'ten 1'e seçici); seçim girişleri doğrudan OP1 OP0. Her sonuç biti için kaynaklar: toplama / çıkarma (M), çarpım (P) ve bölüm (Q).",
        "Eight 74HC153s (dual 4-to-1 selectors) with OP1 OP0 wired straight to the select inputs. Sources for each result bit: add / subtract (M), product (P) and quotient (Q).",
      ),
    },
    {
      id: "onluk-a", ad: t("ONLUĞA ÇEVİRME: A", "BCD CONVERSION: A"), rol: "islem", x: ONLUK.x, y: SATIR_A.y, w: ONLUK.w, h: SATIR_A.h, bloklar: h("Onluğa çevirme: A"),
      gorev: t("8 bit → 3 hane BCD", "8 bits → 3 BCD digits"),
      aciklama: t(
        "İkiliden onluğa “3 ekle ve kaydır” (double dabble) ağı: her modül bir haneye, hane 5 ya da büyükse 3 ekler (bir 74HC283 ve üç kapı). 8 bit için 7 modül. En düşük bit (A0) çevrilmeden doğrudan göstergeye gider.",
        "A binary-to-decimal “add 3 and shift” (double dabble) network: each module adds 3 to a digit when the digit is 5 or more (one 74HC283 and three gates). 8 bits need 7 modules. The lowest bit (A0) goes straight to the display without conversion.",
      ),
    },
    {
      id: "onluk-b", ad: t("ONLUĞA ÇEVİRME: B", "BCD CONVERSION: B"), rol: "islem", x: ONLUK.x, y: SATIR_B.y, w: ONLUK.w, h: SATIR_B.h, bloklar: h("Onluğa çevirme: B"),
      gorev: t("8 bit → 3 hane BCD", "8 bits → 3 BCD digits"),
      aciklama: t("A'nınkiyle aynı 7 modüllük ağ, B sayısı için.", "The same 7-module network as for A, for number B."),
    },
    {
      id: "onluk-sonuc", ad: t("ONLUĞA ÇEVİRME: SONUÇ", "BCD CONVERSION: RESULT"), rol: "islem", x: ONLUK.x, y: SATIR_SONUC.y, w: ONLUK.w, h: SATIR_SONUC.h, bloklar: h("Onluğa çevirme: sonuç"),
      gorev: t("16 bit → 5 hane BCD (33 modül)", "16 bits → 5 BCD digits (33 modules)"),
      aciklama: t(
        "16 bitlik sonuç için 33 modüllük “3 ekle ve kaydır” ağı; makinenin en uzun yolu buradan geçer (zincirleme 13 modül). Modüller yalnız hanenin gerçekten 5'e ulaşabildiği yerlere konur (hesap8/bcd.ts).",
        "A 33-module “add 3 and shift” network for the 16-bit result; the calculator's longest path runs through it (13 modules in a chain). Modules sit only where a digit can actually reach 5 (hesap8/bcd.ts).",
      ),
    },
    {
      id: "onluk-kalan", ad: t("ONLUĞA ÇEVİRME: KALAN", "BCD CONVERSION: REMAINDER"), rol: "islem", x: ONLUK.x, y: SATIR_KALAN.y, w: ONLUK.w, h: SATIR_KALAN.h, bloklar: h("Onluğa çevirme: kalan"),
      gorev: t("8 bit → 3 hane BCD", "8 bits → 3 BCD digits"),
      aciklama: t("Bölmenin kalanı için 7 modüllük ağ.", "A 7-module network for the remainder of the division."),
    },
    {
      id: "gosterge-a", ad: t("GÖSTERGE: A", "DISPLAY: A"), rol: "gc", x: GOSTERGE.x, y: SATIR_A.y, w: GOSTERGE.w, h: SATIR_A.h, bloklar: h("Gösterge: A"),
      gorev: t("3 hane; baştaki sıfırlar söner", "3 digits; leading zeros blanked"),
      aciklama: t(
        "Her hane bir 74HC4511 (BCD → 7 segment), 470 Ω direnç dizisi ve ortak katotlu gösterge. Kapılar baştaki sıfırları söndürür (en sağdaki hane hiç sönmez).",
        "Each digit is a 74HC4511 (BCD → 7 segments), a 470 Ω resistor array and a common-cathode display. Gates blank the leading zeros (the rightmost digit never blanks).",
      ),
    },
    {
      id: "gosterge-b", ad: t("GÖSTERGE: B", "DISPLAY: B"), rol: "gc", x: GOSTERGE.x, y: SATIR_B.y, w: GOSTERGE.w, h: SATIR_B.h, bloklar: h("Gösterge: B"),
      gorev: t("3 hane", "3 digits"),
      aciklama: t("A'nınkiyle aynı: üç 74HC4511 ve üç gösterge.", "Same as A: three 74HC4511s and three displays."),
    },
    {
      id: "gosterge-sonuc", ad: t("GÖSTERGE: SONUÇ", "DISPLAY: RESULT"), rol: "gc", x: GOSTERGE.x, y: SATIR_SONUC.y, w: GOSTERGE.w, h: SATIR_SONUC.h, bloklar: h("Gösterge: Sonuç"),
      gorev: t("işaret + 5 hane, HATA LED'i", "sign + 5 digits, HATA LED"),
      aciklama: t(
        "Beş hane (74HC4511) ve işaret hanesi (yalnız g segmenti: “−”). HATA (sıfıra bölme) bütün sonuç hanelerini söndürür ve kırmızı HATA LED'ini yakar.",
        "Five digits (74HC4511) and a sign digit (segment g only: “−”). HATA (division by zero) blanks all result digits and lights the red HATA LED.",
      ),
    },
    {
      id: "gosterge-kalan", ad: t("GÖSTERGE: KALAN", "DISPLAY: REMAINDER"), rol: "gc", x: GOSTERGE.x, y: SATIR_KALAN.y, w: GOSTERGE.w, h: SATIR_KALAN.h, bloklar: h("Gösterge: Kalan"),
      gorev: t("3 hane; yalnız bölmede yanar", "3 digits; lit only when dividing"),
      aciklama: t(
        "Kalan göstergesi yalnız bölmede ve B ≠ 0 iken yanar (KALAN_SÖNÜK).",
        "The remainder display lights only when dividing and B ≠ 0 (KALAN_SÖNÜK).",
      ),
    },
    {
      id: "besleme", ad: t("BESLEME", "POWER"), rol: "gc", x: SOL.x, y: 960, w: SOL.w, h: 76, bloklar: h("Besleme ve arka panel"),
      gorev: t("5 V, en çok ≈ 0,6 A (lamba testi)", "5 V, at most ≈ 0.6 A (lamp test)"),
      aciklama: t(
        "5 V giriş (J1) ve 100 µF giriş kondansatörü; her entegrenin yanında 100 nF. Akımın neredeyse hepsi LED segmentlerinden: tipik ≈ 0,3 A, lamba testinde ≈ 0,6 A.",
        "5 V input (J1) and a 100 µF input capacitor, plus 100 nF next to every chip. Nearly all the current goes to the LED segments: typically ≈ 0.3 A, ≈ 0.6 A during lamp test.",
      ),
    },
  ];

  const yan = (k: string) => kutular.find((x) => x.id === k)!;
  const sag = (k: string) => yan(k).x + yan(k).w;
  const ust = (k: string) => yan(k).y;
  const alt = (k: string) => yan(k).y + yan(k).h;
  const orta = (k: string) => yan(k).y + yan(k).h / 2;

  const AY = 156; // A hattı
  const BY = 280; // B hattı
  const GOVDE_X = 350; // işlenen gövdesi
  const ISLEM_Y = 360; // işlem kanalı
  const DURUM_Y = 880; // HATA, KALAN_SÖNÜK kanalı
  const LT_Y = 930; // lamba testi kanalı
  const yollar: Yol[] = [
    {
      id: "islenen", tur: "veri", ad: "A, B", netler: [...netDizisi("A", 8), ...netDizisi("B", 8)],
      aciklama: t(
        "İki sayı: A ve B (8'er bit). Dört işlem birimi ikisini de her an görür (devre birleşimsel: hepsi aynı anda hesaplar, seçici birini gösterir). A ve B ayrıca kendi göstergelerine gider.",
        "The two numbers A and B (8 bits each). All four arithmetic units see both at all times (the circuit is combinational: they all compute at once and the selector shows one). A and B also go to their own displays.",
      ),
      uclar: [
        { kutu: "anahtar", yon: "cikis" }, { kutu: "toplama", yon: "giris" }, { kutu: "carpma", yon: "giris" }, { kutu: "bolme", yon: "giris" },
        { kutu: "onluk-a", yon: "giris" }, { kutu: "onluk-b", yon: "giris" },
      ],
      kollar: [
        [[sag("anahtar"), AY], [ONLUK.x, AY]],
        [[sag("anahtar"), BY], [ONLUK.x, BY]],
        [[GOVDE_X, AY], [GOVDE_X, 790], [ISLEM.x, 790]],
        [[GOVDE_X, 450], [ISLEM.x, 450]],
        [[GOVDE_X, 620], [ISLEM.x, 620]],
      ],
      etiketler: [
        { x: 700, y: AY - 9, metin: t("A (8 BİT)", "A (8 BITS)") },
        { x: 700, y: BY - 9, metin: t("B (8 BİT)", "B (8 BITS)") },
        { x: GOVDE_X - 9, y: 600, metin: t("A, B (2 × 8 BİT)", "A, B (2 × 8 BITS)"), dikey: true },
      ],
    },
    {
      id: "islem", tur: "kontrol", ad: t("İŞLEM", "OPERATION"), netler: ["OP0", "OP1", "TOPLA", "CIKAR", "BOL"],
      aciklama: t(
        "İşlem anahtarı (OP1 OP0) sonuç seçicinin seçme girişleridir; çözülmüş sinyaller TOPLA, ÇIKAR toplama / çıkarma birimine, BÖL bölme birimine gider (eksi işareti yalnız çıkarmada, HATA yalnız bölmede).",
        "The operation switch (OP1 OP0) drives the result selector's select inputs. The decoded signals TOPLA and ÇIKAR go to the add / subtract unit and BÖL to the divide unit (the minus sign appears only when subtracting, HATA only when dividing).",
      ),
      uclar: [{ kutu: "anahtar", yon: "cikis" }, { kutu: "toplama", yon: "giris" }, { kutu: "bolme", yon: "giris" }, { kutu: "secici", yon: "giris" }],
      kollar: [
        [[sag("anahtar"), ISLEM_Y], [920, ISLEM_Y], [920, ust("secici")]],
        [[560, ISLEM_Y], [560, ust("toplama")]],
        [[sag("anahtar"), 830], [ISLEM.x, 830]],
      ],
      etiketler: [{ x: 740, y: ISLEM_Y - 9, metin: t("İŞLEM: OP1 OP0, TOPLA, ÇIKAR", "OPERATION: OP1 OP0, TOPLA, ÇIKAR") }, { x: 362, y: 822, hiza: "bas", metin: "BÖL" }],
    },
    {
      id: "toplam", tur: "veri", ad: t("TOPLAM / FARK", "SUM / DIFFERENCE"), netler: [...netDizisi("M", 8), "T8"],
      aciklama: t(
        "Toplama ya da çıkarmanın sonucu: M0–M7 ve toplamada 9. bit T8 (çıkarmada mutlak değer).",
        "The result of the addition or subtraction: M0–M7, plus the 9th bit T8 when adding (the absolute value when subtracting).",
      ),
      uclar: [{ kutu: "toplama", yon: "cikis" }, { kutu: "secici", yon: "giris" }],
      kollar: [[[sag("toplama"), 480], [SECICI.x, 480]]],
      etiketler: [{ x: 735, y: 471, metin: "M, T8 (9)" }],
    },
    {
      id: "carpim", tur: "veri", ad: t("ÇARPIM", "PRODUCT"), bit: 16, netler: aradaki("Çarpma", "Sonuç seçici"),
      aciklama: t("16 bitlik çarpım (P0–P15).", "The 16-bit product (P0–P15)."),
      uclar: [{ kutu: "carpma", yon: "cikis" }, { kutu: "secici", yon: "giris" }],
      kollar: [[[sag("carpma"), 620], [SECICI.x, 620]]],
      etiketler: [{ x: 735, y: 611, metin: "P (16)" }],
    },
    {
      id: "bolum", tur: "veri", ad: t("BÖLÜM", "QUOTIENT"), bit: 8, netler: netDizisi("Q", 8),
      aciklama: t("Bölümün 8 biti (Q0–Q7).", "The 8 bits of the quotient (Q0–Q7)."),
      uclar: [{ kutu: "bolme", yon: "cikis" }, { kutu: "secici", yon: "giris" }],
      kollar: [[[sag("bolme"), 740], [735, 740], [735, 680], [SECICI.x, 680]]],
      etiketler: [{ x: 712, y: 731, metin: "Q (8)" }],
    },
    {
      id: "kalan", tur: "veri", ad: t("KALAN", "REMAINDER"), bit: 8, netler: netDizisi("K", 8),
      aciklama: t(
        "Bölmenin kalanı (K0–K7). En düşük bit K0 çevrilmeden göstergeye gider.",
        "The remainder of the division (K0–K7). The lowest bit K0 goes to the display without conversion.",
      ),
      uclar: [{ kutu: "bolme", yon: "cikis" }, { kutu: "onluk-kalan", yon: "giris" }],
      kollar: [[[sag("bolme"), 790], [ONLUK.x, 790]]],
      etiketler: [{ x: 880, y: 781, metin: t("KALAN K0–K7 (8 BİT)", "REMAINDER K0–K7 (8 BITS)") }],
    },
    {
      id: "sonuc", tur: "veri", ad: t("SONUÇ", "RESULT"), bit: 16, netler: netDizisi("SONUC", 16),
      aciklama: t(
        "Seçilen sonuç (SONUC0–SONUC15). En düşük bit çevrilmeden göstergeye gider.",
        "The selected result (SONUC0–SONUC15). The lowest bit goes to the display without conversion.",
      ),
      uclar: [{ kutu: "secici", yon: "cikis" }, { kutu: "onluk-sonuc", yon: "giris" }],
      kollar: [[[sag("secici"), 510], [ONLUK.x, 510]]],
      etiketler: [{ x: 1005, y: 501, metin: t("16 BİT", "16 BITS") }],
    },
    ...(["a", "b", "sonuc", "kalan"] as const).map((s): Yol => {
      const kaynak = { a: "Onluğa çevirme: A", b: "Onluğa çevirme: B", sonuc: "Onluğa çevirme: sonuç", kalan: "Onluğa çevirme: kalan" }[s];
      const hedef = { a: "Gösterge: A", b: "Gösterge: B", sonuc: "Gösterge: Sonuç", kalan: "Gösterge: Kalan" }[s];
      const hane = s === "sonuc" ? 5 : 3;
      const y = orta(`onluk-${s}`) + (s === "sonuc" ? -20 : 0);
      return {
        id: `bcd-${s}`, tur: "veri", ad: "BCD", netler: aradaki(kaynak, hedef),
        aciklama: t(
          `Onluk haneler (BCD, her hane 4 bit) ${hane} hanenin 74HC4511 sürücülerine.`,
          `Decimal digits (BCD, 4 bits per digit) to the 74HC4511 drivers of the ${hane} digits.`,
        ),
        uclar: [{ kutu: `onluk-${s}`, yon: "cikis" }, { kutu: `gosterge-${s}`, yon: "giris" }],
        kollar: [[[ONLUK.x + ONLUK.w, y], [GOSTERGE.x, y]]],
        etiketler: [{ x: (ONLUK.x + ONLUK.w + GOSTERGE.x) / 2, y: y - 9, metin: `BCD ×${hane}` }],
      };
    }),
    {
      id: "neg", tur: "kontrol", ad: t("EKSİ", "MINUS"), netler: ["NEG"],
      aciklama: t(
        "Çıkarmada sonuç eksi (A < B): sonuç göstergesinin işaret hanesinde “−” yanar.",
        "A negative result when subtracting (A < B): the sign digit of the result display shows “−”.",
      ),
      uclar: [{ kutu: "toplama", yon: "cikis" }, { kutu: "gosterge-sonuc", yon: "giris" }],
      kollar: [[[sag("toplama"), 404], [710, 404]], [[1470, 400], [1470, ust("gosterge-sonuc")]]],
      baglayicilar: [
        { nokta: [710, 404], metin: t("EKSİ → SONUÇ", "MINUS → RESULT"), yon: "sag" },
        { nokta: [1470, 400], metin: t("EKSİ ← TOPLAMA", "MINUS ← ADD"), yon: "yukari" },
      ],
      etiketler: [],
    },
    {
      id: "durum", tur: "kontrol", ad: t("HATA, KALAN SÖNÜK", "ERROR, REMAINDER BLANK"), netler: ["HATA", "KALAN_SONUK"],
      aciklama: t(
        "Bölme biriminden: HATA (B = 0 iken bölme) sonuç hanelerini söndürür ve HATA LED'ini yakar; KALAN_SÖNÜK bölme dışında ya da hatada kalan göstergesini söndürür.",
        "From the divide unit: HATA (error: dividing with B = 0) blanks the result digits and lights the HATA LED; KALAN_SÖNÜK blanks the remainder display outside division or on an error.",
      ),
      uclar: [{ kutu: "bolme", yon: "cikis" }, { kutu: "gosterge-sonuc", yon: "giris" }, { kutu: "gosterge-kalan", yon: "giris" }],
      kollar: [
        [[600, alt("bolme")], [600, DURUM_Y], [1560, DURUM_Y], [1560, alt("gosterge-kalan")]],
        [[1310, DURUM_Y], [1310, 570], [GOSTERGE.x, 570]],
      ],
      etiketler: [{ x: 1000, y: DURUM_Y - 9, metin: t("HATA, KALAN SÖNÜK", "HATA, KALAN_SONUK") }],
    },
    {
      id: "lt", tur: "kontrol", ad: t("LAMBA TESTİ", "LAMP TEST"), netler: ["LT_N"],
      aciklama: t(
        "~LT: buton basılıyken bütün 74HC4511'ler “8” gösterir (söndürmenin de üstünde), işaret hanesi “−”.",
        "~LT: while the button is pressed, every 74HC4511 shows “8” (overriding blanking) and the sign digit shows “−”.",
      ),
      uclar: [{ kutu: "anahtar", yon: "cikis" }, ...(["a", "b", "sonuc", "kalan"] as const).map((s) => ({ kutu: `gosterge-${s}`, yon: "giris" as const }))],
      kollar: [
        [[170, alt("anahtar")], [170, LT_Y], [SAG_HAT, LT_Y], [SAG_HAT, AY], [GOSTERGE.x + GOSTERGE.w, AY]],
        [[SAG_HAT, BY], [GOSTERGE.x + GOSTERGE.w, BY]],
        [[SAG_HAT, 470], [GOSTERGE.x + GOSTERGE.w, 470]],
        [[SAG_HAT, 740], [GOSTERGE.x + GOSTERGE.w, 740]],
      ],
      etiketler: [{ x: 1000, y: LT_Y - 9, metin: t("~LT (LAMBA TESTİ)", "~LT (LAMP TEST)") }],
    },
  ];

  return {
    id: "hesap",
    baslik: t("8 bit hesap makinesi · mimari", "8-bit calculator · architecture"),
    altBaslik: t(
      `${board.chips.length} entegre · program, ROM ve saat yok: bütün iş kapılarla`,
      `${board.chips.length} chips · no program, ROM or clock: gates do all the work`,
    ),
    aciklama: t(
      "İki 8 bitlik sayı anahtarlarla girilir; dört işlem birimi ikisini de sürekli hesaplar, işlem anahtarı sonuç seçicide birini seçer. Sonuç ikiliden onluğa çevrilip 7 segment göstergelere gider. Devre tamamen birleşimsel: anahtar çevrilince sonuç ≈ 1–2 µs sonra göstergededir.",
      "Two 8-bit numbers are entered on switches. All four arithmetic units compute from both continuously, and the operation switch picks one result in the result selector. The result is converted from binary to decimal and goes to the 7-segment displays. The circuit is fully combinational: ≈ 1–2 µs after a switch flips, the result is on the display.",
    ),
    genislik: 1800,
    yukseklik: 1100,
    kutular,
    gruplar: [],
    yollar,
    lejant: {
      x: 340, y: 960, w: 900, h: 120,
      kisaltmalar: [
        ["BCD", t("İkilik kodlu onluk hane (4 bit)", "Binary-coded decimal digit (4 bits)")],
        ["OP1 OP0", t("İşlem anahtarı", "Operation switch")],
        ["M, P, Q", t("Toplam / fark, çarpım, bölüm", "Sum / difference, product, quotient")],
        ["~LT", t("Lamba testi (aktif düşük)", "Lamp test (active low)")],
        ["4511", t("BCD → 7 segment sürücü", "BCD → 7-segment driver")],
        ["283", t("4 bit toplayıcı", "4-bit adder")],
      ],
    },
  };
}
