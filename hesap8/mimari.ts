// 8 bit hesap makinesinin mimari diyagramı: anahtarlardan göstergelere veri akışı. Soldan sağa:
// anahtarlar (A, B, işlem, lamba testi) → dört işlem birimi (toplama / çıkarma, çarpma, bölme) →
// sonuç seçici → ikiliden onluğa çevirme → 74HC4511 ve 7 segment göstergeler. Üst sırada A ve B
// sayılarının kendi göstergeleri. Parça listeleri devreden (hesap8/kart.ts), yerleşim elle; çizimi
// ve denetimi CPU16 diyagramlarıyla aynı (cpu16/mimari). Tasarım: hesap8/docs/tasarim.md.

import type { Board } from "../cpu16/board/board.ts";
import { Devre, netDizisi, type BlokKimligi, type Diyagram, type Kutu, type Yol } from "../cpu16/mimari/model.ts";

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

export function hesapDiyagrami(board: Board, devre = new Devre(board)): Diyagram {
  /** iki blok arasındaki netler (adsız iç netler dahil): BCD hatları ve çarpım bitleri adlandırılmamış */
  const aradaki = (kaynak: string, hedef: string) => devre.aradakiNetler(h(kaynak), h(hedef));

  const kutular: Kutu[] = [
    {
      id: "anahtar", ad: "ANAHTARLAR", rol: "gc", gorev: "", x: SOL.x, y: 96, w: SOL.w, h: 804, bloklar: h("Anahtarlar"), pasifGoster: true,
      bolmeler: [
        { ad: "A SAYISI", rol: /^A /, gorev: "SW1: A7 … A0, açık = 1", x: 0, y: 0, w: SOL.w, h: 120 },
        { ad: "B SAYISI", rol: /^B /, gorev: "SW2: B7 … B0", x: 0, y: 120, w: SOL.w, h: 120 },
        { ad: "İŞLEM SEÇİMİ", rol: /^(işlem|ISLEM)/, gorev: "OP1 OP0: 00 +, 01 −, 10 ×, 11 ÷; işlem LED'leri", x: 0, y: 240, w: SOL.w, h: 460 },
        { ad: "LAMBA TESTİ", rol: /^(LAMBA|lamba)/, gorev: "basılıyken bütün segmentler yanar", x: 0, y: 700, w: SOL.w, h: 104 },
      ],
      aciklama: "Girişler: iki 8'li DIP anahtar (A ve B sayıları, 0–255), işlemi seçen 2'li DIP anahtar ve lamba testi butonu. Anahtarlar 10 kΩ dizilerle aşağı çekilir (kapalı = 0). İşlem kodu (OP1 OP0) kapılarla dört sinyale çözülür (TOPLA, ÇIKAR, ÇARP, BÖL); bunlar hem işlem birimlerine hem de dört yeşil LED'e gider.",
    },
    {
      id: "toplama", ad: "TOPLAMA VE ÇIKARMA", rol: "islem", x: ISLEM.x, y: 390, w: ISLEM.w, h: 140, bloklar: h("Toplama ve çıkarma"),
      gorev: "A ± B; eksiyse işaret ve |A − B|",
      aciklama: "Çıkarma toplamaya çevrilir: A − B = A + ~B + 1. B'nin bitleri XOR'larla terslenir (74HC86), iki 74HC283 toplar. Toplamada elde 9. bittir (T8, 510'a kadar). Çıkarmada sonuç eksiyse NEG = 1: fark yeniden terslenip 1 eklenir (iki 74HC283 daha), işaret hanesinde “−” yanar.",
    },
    {
      id: "carpma", ad: "ÇARPMA", rol: "islem", x: ISLEM.x, y: 560, w: ISLEM.w, h: 120, bloklar: h("Çarpma"),
      gorev: "8 × 8 dizi çarpıcı → 16 bit",
      aciklama: "Elle çarpmanın ikilik hali: 64 AND kapısı kısmi çarpımları (A[j] · B[i]) verir, 7 sıra toplayıcı (2 × 74HC283 her sırada) bunları kaydırarak toplar. En çok 255 × 255 = 65 025.",
    },
    {
      id: "bolme", ad: "BÖLME", rol: "islem", x: ISLEM.x, y: 710, w: ISLEM.w, h: 150, bloklar: h("Bölme"),
      gorev: "geri yüklemeli bölücü: bölüm, kalan, B = 0",
      aciklama: "Uzun bölmenin ikilik hali, 8 aynı basamak: kalan bir bit sola kayar, A'nın sıradaki biti girer; kalan ≥ B ise B çıkarılır (2 × 74HC283) ve bölümün biti 1 olur, değilse eski kalan geri yüklenir (2 × 74HC157). B = 0 ise (74HC30) HATA: LED yanar, sonuç ve kalan söner.",
    },
    {
      id: "secici", ad: "SONUÇ SEÇİCİ", rol: "secici", x: SECICI.x, y: 440, w: SECICI.w, h: 260, bloklar: h("Sonuç seçici"),
      gorev: "işlem anahtarı dört sonuçtan birini seçer (16 bit)",
      aciklama: "Sekiz 74HC153 (çift 4'ten 1'e seçici); seçim girişleri doğrudan OP1 OP0. Her sonuç biti için kaynaklar: toplama / çıkarma (M), çarpım (P) ve bölüm (Q).",
    },
    {
      id: "onluk-a", ad: "ONLUĞA ÇEVİRME: A", rol: "islem", x: ONLUK.x, y: SATIR_A.y, w: ONLUK.w, h: SATIR_A.h, bloklar: h("Onluğa çevirme: A"),
      gorev: "8 bit → 3 hane BCD",
      aciklama: "İkiliden onluğa “3 ekle ve kaydır” (double dabble) ağı: her modül bir haneye, hane 5 ya da büyükse 3 ekler (bir 74HC283 ve üç kapı). 8 bit için 7 modül. En düşük bit (A0) çevrilmeden doğrudan göstergeye gider.",
    },
    {
      id: "onluk-b", ad: "ONLUĞA ÇEVİRME: B", rol: "islem", x: ONLUK.x, y: SATIR_B.y, w: ONLUK.w, h: SATIR_B.h, bloklar: h("Onluğa çevirme: B"),
      gorev: "8 bit → 3 hane BCD",
      aciklama: "A'nınkiyle aynı 7 modüllük ağ, B sayısı için.",
    },
    {
      id: "onluk-sonuc", ad: "ONLUĞA ÇEVİRME: SONUÇ", rol: "islem", x: ONLUK.x, y: SATIR_SONUC.y, w: ONLUK.w, h: SATIR_SONUC.h, bloklar: h("Onluğa çevirme: sonuç"),
      gorev: "16 bit → 5 hane BCD (33 modül)",
      aciklama: "16 bitlik sonuç için 33 modüllük “3 ekle ve kaydır” ağı; makinenin en uzun yolu buradan geçer (zincirleme 13 modül). Modüller yalnız hanenin gerçekten 5'e ulaşabildiği yerlere konur (hesap8/bcd.ts).",
    },
    {
      id: "onluk-kalan", ad: "ONLUĞA ÇEVİRME: KALAN", rol: "islem", x: ONLUK.x, y: SATIR_KALAN.y, w: ONLUK.w, h: SATIR_KALAN.h, bloklar: h("Onluğa çevirme: kalan"),
      gorev: "8 bit → 3 hane BCD",
      aciklama: "Bölmenin kalanı için 7 modüllük ağ.",
    },
    {
      id: "gosterge-a", ad: "GÖSTERGE: A", rol: "gc", x: GOSTERGE.x, y: SATIR_A.y, w: GOSTERGE.w, h: SATIR_A.h, bloklar: h("Gösterge: A"),
      gorev: "3 hane; baştaki sıfırlar söner",
      aciklama: "Her hane bir 74HC4511 (BCD → 7 segment), 470 Ω direnç dizisi ve ortak katotlu gösterge. Kapılar baştaki sıfırları söndürür (en sağdaki hane hiç sönmez).",
    },
    {
      id: "gosterge-b", ad: "GÖSTERGE: B", rol: "gc", x: GOSTERGE.x, y: SATIR_B.y, w: GOSTERGE.w, h: SATIR_B.h, bloklar: h("Gösterge: B"),
      gorev: "3 hane",
      aciklama: "A'nınkiyle aynı: üç 74HC4511 ve üç gösterge.",
    },
    {
      id: "gosterge-sonuc", ad: "GÖSTERGE: SONUÇ", rol: "gc", x: GOSTERGE.x, y: SATIR_SONUC.y, w: GOSTERGE.w, h: SATIR_SONUC.h, bloklar: h("Gösterge: Sonuç"),
      gorev: "işaret + 5 hane, HATA LED'i",
      aciklama: "Beş hane (74HC4511) ve işaret hanesi (yalnız g segmenti: “−”). HATA (sıfıra bölme) bütün sonuç hanelerini söndürür ve kırmızı HATA LED'ini yakar.",
    },
    {
      id: "gosterge-kalan", ad: "GÖSTERGE: KALAN", rol: "gc", x: GOSTERGE.x, y: SATIR_KALAN.y, w: GOSTERGE.w, h: SATIR_KALAN.h, bloklar: h("Gösterge: Kalan"),
      gorev: "3 hane; yalnız bölmede yanar",
      aciklama: "Kalan göstergesi yalnız bölmede ve B ≠ 0 iken yanar (KALAN_SÖNÜK).",
    },
    {
      id: "besleme", ad: "BESLEME", rol: "gc", x: SOL.x, y: 960, w: SOL.w, h: 76, bloklar: h("Besleme ve arka panel"),
      gorev: "5 V, en çok ≈ 0,6 A (lamba testi)",
      aciklama: "5 V giriş (J1) ve 100 µF giriş kondansatörü; her entegrenin yanında 100 nF. Akımın neredeyse hepsi LED segmentlerinden: tipik ≈ 0,3 A, lamba testinde ≈ 0,6 A.",
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
      aciklama: "İki sayı: A ve B (8'er bit). Dört işlem birimi ikisini de her an görür (devre birleşimsel: hepsi aynı anda hesaplar, seçici birini gösterir). A ve B ayrıca kendi göstergelerine gider.",
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
        { x: 700, y: AY - 9, metin: "A (8 BİT)" },
        { x: 700, y: BY - 9, metin: "B (8 BİT)" },
        { x: GOVDE_X - 9, y: 600, metin: "A, B (2 × 8 BİT)", dikey: true },
      ],
    },
    {
      id: "islem", tur: "kontrol", ad: "İŞLEM", netler: ["OP0", "OP1", "TOPLA", "CIKAR", "BOL"],
      aciklama: "İşlem anahtarı (OP1 OP0) sonuç seçicinin seçme girişleridir; çözülmüş sinyaller TOPLA, ÇIKAR toplama / çıkarma birimine, BÖL bölme birimine gider (eksi işareti yalnız çıkarmada, HATA yalnız bölmede).",
      uclar: [{ kutu: "anahtar", yon: "cikis" }, { kutu: "toplama", yon: "giris" }, { kutu: "bolme", yon: "giris" }, { kutu: "secici", yon: "giris" }],
      kollar: [
        [[sag("anahtar"), ISLEM_Y], [920, ISLEM_Y], [920, ust("secici")]],
        [[560, ISLEM_Y], [560, ust("toplama")]],
        [[sag("anahtar"), 830], [ISLEM.x, 830]],
      ],
      etiketler: [{ x: 740, y: ISLEM_Y - 9, metin: "İŞLEM: OP1 OP0, TOPLA, ÇIKAR" }, { x: 362, y: 822, hiza: "bas", metin: "BÖL" }],
    },
    {
      id: "toplam", tur: "veri", ad: "TOPLAM / FARK", netler: [...netDizisi("M", 8), "T8"],
      aciklama: "Toplama ya da çıkarmanın sonucu: M0–M7 ve toplamada 9. bit T8 (çıkarmada mutlak değer).",
      uclar: [{ kutu: "toplama", yon: "cikis" }, { kutu: "secici", yon: "giris" }],
      kollar: [[[sag("toplama"), 480], [SECICI.x, 480]]],
      etiketler: [{ x: 735, y: 471, metin: "M, T8 (9)" }],
    },
    {
      id: "carpim", tur: "veri", ad: "ÇARPIM", bit: 16, netler: aradaki("Çarpma", "Sonuç seçici"),
      aciklama: "16 bitlik çarpım (P0–P15).",
      uclar: [{ kutu: "carpma", yon: "cikis" }, { kutu: "secici", yon: "giris" }],
      kollar: [[[sag("carpma"), 620], [SECICI.x, 620]]],
      etiketler: [{ x: 735, y: 611, metin: "P (16)" }],
    },
    {
      id: "bolum", tur: "veri", ad: "BÖLÜM", bit: 8, netler: netDizisi("Q", 8),
      aciklama: "Bölümün 8 biti (Q0–Q7).",
      uclar: [{ kutu: "bolme", yon: "cikis" }, { kutu: "secici", yon: "giris" }],
      kollar: [[[sag("bolme"), 740], [735, 740], [735, 680], [SECICI.x, 680]]],
      etiketler: [{ x: 712, y: 731, metin: "Q (8)" }],
    },
    {
      id: "kalan", tur: "veri", ad: "KALAN", bit: 8, netler: netDizisi("K", 8),
      aciklama: "Bölmenin kalanı (K0–K7). En düşük bit K0 çevrilmeden göstergeye gider.",
      uclar: [{ kutu: "bolme", yon: "cikis" }, { kutu: "onluk-kalan", yon: "giris" }],
      kollar: [[[sag("bolme"), 790], [ONLUK.x, 790]]],
      etiketler: [{ x: 880, y: 781, metin: "KALAN K0–K7 (8 BİT)" }],
    },
    {
      id: "sonuc", tur: "veri", ad: "SONUÇ", bit: 16, netler: netDizisi("SONUC", 16),
      aciklama: "Seçilen sonuç (SONUC0–SONUC15). En düşük bit çevrilmeden göstergeye gider.",
      uclar: [{ kutu: "secici", yon: "cikis" }, { kutu: "onluk-sonuc", yon: "giris" }],
      kollar: [[[sag("secici"), 510], [ONLUK.x, 510]]],
      etiketler: [{ x: 1005, y: 501, metin: "16 BİT" }],
    },
    ...(["a", "b", "sonuc", "kalan"] as const).map((s): Yol => {
      const kaynak = { a: "Onluğa çevirme: A", b: "Onluğa çevirme: B", sonuc: "Onluğa çevirme: sonuç", kalan: "Onluğa çevirme: kalan" }[s];
      const hedef = { a: "Gösterge: A", b: "Gösterge: B", sonuc: "Gösterge: Sonuç", kalan: "Gösterge: Kalan" }[s];
      const hane = s === "sonuc" ? 5 : 3;
      const y = orta(`onluk-${s}`) + (s === "sonuc" ? -20 : 0);
      return {
        id: `bcd-${s}`, tur: "veri", ad: "BCD", netler: aradaki(kaynak, hedef),
        aciklama: `Onluk haneler (BCD, her hane 4 bit) ${hane} hanenin 74HC4511 sürücülerine.`,
        uclar: [{ kutu: `onluk-${s}`, yon: "cikis" }, { kutu: `gosterge-${s}`, yon: "giris" }],
        kollar: [[[ONLUK.x + ONLUK.w, y], [GOSTERGE.x, y]]],
        etiketler: [{ x: (ONLUK.x + ONLUK.w + GOSTERGE.x) / 2, y: y - 9, metin: `BCD ×${hane}` }],
      };
    }),
    {
      id: "neg", tur: "kontrol", ad: "EKSİ", netler: ["NEG"],
      aciklama: "Çıkarmada sonuç eksi (A < B): sonuç göstergesinin işaret hanesinde “−” yanar.",
      uclar: [{ kutu: "toplama", yon: "cikis" }, { kutu: "gosterge-sonuc", yon: "giris" }],
      kollar: [[[sag("toplama"), 404], [710, 404]], [[1470, 400], [1470, ust("gosterge-sonuc")]]],
      baglayicilar: [
        { nokta: [710, 404], metin: "EKSİ → SONUÇ", yon: "sag" },
        { nokta: [1470, 400], metin: "EKSİ ← TOPLAMA", yon: "yukari" },
      ],
      etiketler: [],
    },
    {
      id: "durum", tur: "kontrol", ad: "HATA, KALAN SÖNÜK", netler: ["HATA", "KALAN_SONUK"],
      aciklama: "Bölme biriminden: HATA (B = 0 iken bölme) sonuç hanelerini söndürür ve HATA LED'ini yakar; KALAN_SÖNÜK bölme dışında ya da hatada kalan göstergesini söndürür.",
      uclar: [{ kutu: "bolme", yon: "cikis" }, { kutu: "gosterge-sonuc", yon: "giris" }, { kutu: "gosterge-kalan", yon: "giris" }],
      kollar: [
        [[600, alt("bolme")], [600, DURUM_Y], [1560, DURUM_Y], [1560, alt("gosterge-kalan")]],
        [[1310, DURUM_Y], [1310, 570], [GOSTERGE.x, 570]],
      ],
      etiketler: [{ x: 1000, y: DURUM_Y - 9, metin: "HATA, KALAN SÖNÜK" }],
    },
    {
      id: "lt", tur: "kontrol", ad: "LAMBA TESTİ", netler: ["LT_N"],
      aciklama: "~LT: buton basılıyken bütün 74HC4511'ler “8” gösterir (söndürmenin de üstünde), işaret hanesi “−”.",
      uclar: [{ kutu: "anahtar", yon: "cikis" }, ...(["a", "b", "sonuc", "kalan"] as const).map((s) => ({ kutu: `gosterge-${s}`, yon: "giris" as const }))],
      kollar: [
        [[170, alt("anahtar")], [170, LT_Y], [SAG_HAT, LT_Y], [SAG_HAT, AY], [GOSTERGE.x + GOSTERGE.w, AY]],
        [[SAG_HAT, BY], [GOSTERGE.x + GOSTERGE.w, BY]],
        [[SAG_HAT, 470], [GOSTERGE.x + GOSTERGE.w, 470]],
        [[SAG_HAT, 740], [GOSTERGE.x + GOSTERGE.w, 740]],
      ],
      etiketler: [{ x: 1000, y: LT_Y - 9, metin: "~LT (LAMBA TESTİ)" }],
    },
  ];

  return {
    id: "hesap",
    baslik: "8 bit hesap makinesi · mimari",
    altBaslik: `${board.chips.length} entegre · program, ROM ve saat yok: bütün iş kapılarla`,
    aciklama: "İki 8 bitlik sayı anahtarlarla girilir; dört işlem birimi ikisini de sürekli hesaplar, işlem anahtarı sonuç seçicide birini seçer. Sonuç ikiliden onluğa çevrilip 7 segment göstergelere gider. Devre tamamen birleşimsel: anahtar çevrilince sonuç ≈ 1–2 µs sonra göstergededir.",
    genislik: 1800,
    yukseklik: 1100,
    kutular,
    gruplar: [],
    yollar,
    lejant: {
      x: 340, y: 960, w: 900, h: 120,
      kisaltmalar: [
        ["BCD", "İkilik kodlu onluk hane (4 bit)"],
        ["OP1 OP0", "İşlem anahtarı"],
        ["M, P, Q", "Toplam / fark, çarpım, bölüm"],
        ["~LT", "Lamba testi (aktif düşük)"],
        ["4511", "BCD → 7 segment sürücü"],
        ["283", "4 bit toplayıcı"],
      ],
    },
  };
}
