// 8 bit hesap makinesinin bölüm metinleri (bkz. cpu16/board/bolum-bilgi.ts): kart, breadboard
// bölgeleri (board rolleri), bloklar ve çip grupları. Metinler hesap8/kart.ts'teki devreden ve
// hesap8/docs/tasarim.md'den alınmıştır. Grupların referansları testte kartın netlistiyle denetlenir.

import type { BolumMetni, GrupTanimi, KartMetinleri } from "../cpu16/board/bolum-bilgi.ts";
import { ASAMALAR } from "./breadboard/yerlesim.ts";

export { ASAMALAR as HESAP_ASAMALARI };

const m = (etiket: string, baslik: string, gorev: string, nasil: string): BolumMetni => ({ etiket, baslik, gorev, nasil });
const g = (id: string, refs: string, etiket: string, baslik: string, gorev: string, nasil: string): GrupTanimi => ({ id, refs, etiket, baslik, gorev, nasil });

const sayiAnahtari = (ad: "A" | "B", sw: string, rn: string): GrupTanimi =>
  g(`${ad.toLowerCase()}-anahtarlari`, `${sw} ${rn}`, `${ad} ANAHTARLARI`, `${ad} sayısının anahtarları`,
    `Sayı ${ad} (0–255): sekiz anahtar, her biri bir bit.`,
    `8'li DIP anahtar ${sw}: soldan sağa ${ad}7 … ${ad}0, açık (ON) = 1. ${rn} (10 kΩ dizi) açık anahtarların hattını 0'a çeker. ${ad}0–${ad}7 toplayıcıya, çarpıcıya, bölücüye ve ${ad}'nın onluğa çeviricisine gider.`);

// ---------------------------------------------------------------- göstergeler

interface Hane {
  /** grup kimliği ve etiketin hane adı */
  ad: string;
  surucu: string;
  dizi: string;
  gosterge: string;
}

const HANE_ADI: Record<string, string> = { onbinler: "on binler", binler: "binler", yuzler: "yüzler", onlar: "onlar", birler: "birler" };

function haneGruplari(sayi: string, kimlik: string, haneler: Hane[]): GrupTanimi[] {
  return haneler.map((h, i) => {
    const son = i === haneler.length - 1;
    const ad = HANE_ADI[h.ad];
    return g(`${kimlik}-${h.ad}`, `${h.surucu} ${h.dizi} ${h.gosterge}`, `${sayi} ${ad.toLocaleUpperCase("tr-TR")} HANESİ`, `${sayi}: ${ad} hanesi`,
      `${sayi} sayısının ${ad} hanesini gösterir.`,
      `${h.surucu} (74HC4511) BCD haneyi 7 segment desenine çevirir; mandalı hep geçirgendir (LE = GND). ${h.dizi} (8 × 470 Ω yalıtılmış dizi) segment akımını ≈ 6 mA'e sınırlar, ${h.gosterge} ortak katotlu 0,56" göstergedir. ` +
        (son ? "En sağdaki hane hiç sönmez: sıfır 0 görünür." : "Baştaki sıfırsa söndürme kapıları ~BI ile söndürür."));
  });
}

const sondurme = (sayi: string, kimlik: string, refs: string, ek: string): GrupTanimi =>
  g(`${kimlik}-sondurme`, refs, `${sayi} SIFIR SÖNDÜRME`, `${sayi}: baştaki sıfırları söndürme`,
    `${sayi} sayısının baştaki sıfırlarını söndürür (007 yerine 7 görünür).`,
    `Her hane için "bu hane 0" (VEYA-DEĞİL, DEĞİL) ve "soldaki bütün haneler de 0" (VE zinciri) bulunur; sonuç sürücünün ~BI'sına gider. Lamba testi (~LT) 4511'de ~BI'dan üstündür. ${ek}`);

// ---------------------------------------------------------------- metinler

export const HESAP_METINLERI: KartMetinleri = {
  kart: m(
    "8 BİT HESAP MAKİNESİ",
    "8 bit hesap makinesi",
    "İki 8 bitlik sayıyı (A, B) toplar, çıkarır, çarpar ve böler; sayılar ve sonuç onluk 7 segment göstergelerde görünür.",
    "Program, ROM ve saat yoktur: bütün iş 216 yaygın 74HC çipinde, tamamen birleşimsel devreyle yapılır. Anahtar çevrilince sonuç en kötü ≈ 2 µs sonra göstergededir. Veri akışı önden arkaya: anahtarlar, işlem blokları, sonuç seçici, onluğa çevirme, göstergeler.",
  ),
  bolgeler: {
    "Gösterge: A": { ...m("GÖSTERGE A", "A göstergesi", "A sayısının üç hanesi: dirençler ve göstergeler.", "Her hane bir 470 Ω yalıtılmış dizi ve ortak katotlu bir göstergedir; dizinin çıkışları göstergenin pinlerine üst şeritlerden gider. Sürücüleri hemen öndeki board'dadır."), bloklar: ["Gösterge: A"] },
    "Gösterge: B": { ...m("GÖSTERGE B", "B göstergesi", "B sayısının üç hanesi: dirençler ve göstergeler.", "Her hane bir 470 Ω yalıtılmış dizi ve ortak katotlu bir göstergedir; dizinin çıkışları göstergenin pinlerine üst şeritlerden gider. Sürücüleri hemen öndeki board'dadır."), bloklar: ["Gösterge: B"] },
    "Gösterge: sonuç (−, 4, 3)": { ...m("SONUÇ: −, 4, 3", "Sonuç göstergesi: işaret, 4. ve 3. hane", "Sonucun işaret hanesi ve en soldaki iki hanesi (on binler, binler).", "İşaret hanesinde yalnız g segmenti bağlıdır ve 4511'den geçmez: NEG ∨ lamba testi bir VEYA kapısıyla 330 Ω üzerinden sürülür. Diğer iki hane 470 Ω dizi ve ortak katotlu göstergedir."), bloklar: ["Gösterge: Sonuç"] },
    "Gösterge: sonuç (2, 1, 0) ve HATA": { ...m("SONUÇ: 2, 1, 0, HATA", "Sonuç göstergesi: 2., 1., 0. hane ve HATA", "Sonucun sağdaki üç hanesi (yüzler, onlar, birler) ve sıfıra bölme LED'i.", "Her hane 470 Ω dizi ve ortak katotlu göstergedir. Kırmızı HATA LED'i B = 0 iken bölmede yanar; o zaman sonuç ve kalan göstergeleri söner."), bloklar: ["Gösterge: Sonuç"] },
    "Gösterge: kalan": { ...m("GÖSTERGE KALAN", "Kalan göstergesi", "Bölmede kalanın üç hanesi.", "Her hane 470 Ω dizi ve ortak katotlu göstergedir. Kalan göstergesi yalnız bölmede ve B ≠ 0 iken yanar."), bloklar: ["Gösterge: Kalan"] },
    "Sürücüler: A": { ...m("SÜRÜCÜLER A", "A'nın sürücüleri", "A'nın üç 74HC4511 hane sürücüsü ve baştaki sıfırları söndürme kapıları.", "74HC4511 BCD haneyi 7 segment desenine çevirir (mandal hep geçirgen). Söndürme kapıları ~BI'yı, lamba testi butonu ~LT'yi sürer."), bloklar: ["Gösterge: A"] },
    "Sürücüler: B": { ...m("SÜRÜCÜLER B", "B'nin sürücüleri", "B'nin üç 74HC4511 hane sürücüsü ve baştaki sıfırları söndürme kapıları.", "74HC4511 BCD haneyi 7 segment desenine çevirir (mandal hep geçirgen). Söndürme kapıları ~BI'yı, lamba testi butonu ~LT'yi sürer."), bloklar: ["Gösterge: B"] },
    "Sürücüler: sonuç": { ...m("SÜRÜCÜLER SONUÇ", "Sonucun sürücüleri", "Sonucun beş 74HC4511 hane sürücüsü ve söndürme kapıları.", "Baştaki sıfırlar söner; HATA'da bütün grup söner (grup söndürme aynı kapıya VEYA-DEĞİL ile girer). Eksi işareti ve lamba testi işaret hanesini bir VEYA kapısından yakar."), bloklar: ["Gösterge: Sonuç"] },
    "Sürücüler: kalan": { ...m("SÜRÜCÜLER KALAN", "Kalanın sürücüleri", "Kalanın üç 74HC4511 hane sürücüsü ve söndürme kapıları.", "Baştaki sıfırlar söner; bölme değilken ya da B = 0 iken bütün grup söner."), bloklar: ["Gösterge: Kalan"] },
    "Onluğa çevirme: A": { ...m("ONLUĞA ÇEVİRME A", "Onluğa çevirme: A", "A'yı ikilikten üç onluk haneye (BCD) çevirir.", "3 ekle ve kaydır (double dabble) algoritmasının birleşimsel hali: yedi modül, her biri bir 74HC283 ve ≥ 5 algılama kapıları. Modüller yalnız hanenin 5'e ulaşabildiği yerlerdedir."), bloklar: ["Onluğa çevirme: A"] },
    "Onluğa çevirme: B": { ...m("ONLUĞA ÇEVİRME B", "Onluğa çevirme: B", "B'yi ikilikten üç onluk haneye (BCD) çevirir.", "3 ekle ve kaydır (double dabble) algoritmasının birleşimsel hali: yedi modül, her biri bir 74HC283 ve ≥ 5 algılama kapıları."), bloklar: ["Onluğa çevirme: B"] },
    "Onluğa çevirme: sonuç": { ...m("ONLUĞA ÇEVİRME SONUÇ", "Onluğa çevirme: sonuç", "16 bitlik sonucu beş onluk haneye çevirir.", "33 modül (33 × 74HC283) ve ≥ 5 algılama kapıları, dört board sütununda. Zincirleme 13 modül makinenin en uzun yolunun büyük kısmıdır."), bloklar: ["Onluğa çevirme: sonuç"] },
    "Onluğa çevirme: kalan": { ...m("ONLUĞA ÇEVİRME KALAN", "Onluğa çevirme: kalan", "Kalanı (0–254) üç onluk haneye çevirir.", "Yedi modül, her biri bir 74HC283 ve ≥ 5 algılama kapıları."), bloklar: ["Onluğa çevirme: kalan"] },
    "Çarpma": { ...m("ÇARPMA", "Çarpma", "8 × 8 bit dizi çarpıcı: A × B, 16 bit.", "16 × 74HC08 kısmi çarpımları, 14 × 74HC283 yedi satırın toplamlarını yapar; satırlar arkadan öne sıralanır."), bloklar: ["Çarpma"] },
    "Bölme": { ...m("BÖLME", "Bölme", "Geri yüklemeli bölücü: bölüm ve kalan.", "Sekiz basamak, her biri 2 × 74HC283 (kalan − B) ve 2 × 74HC157 (yeni kalan); ~B eviricileri, bölüm bitlerinin VEYA'ları ve B = 0 algılama aynı bölgede."), bloklar: ["Bölme"] },
    "Toplama ve çıkarma": { ...m("TOPLAMA VE ÇIKARMA", "Toplama ve çıkarma", "A + B ya da A − B; eksi sonucun işareti ve mutlak değeri.", "B'yi tersleyen XOR'lar, iki 74HC283 toplayıcı, işaret ve tümleme kapıları ve |A − B| için iki 74HC283 daha."), bloklar: ["Toplama ve çıkarma"] },
    "Sonuç seçici": { ...m("SONUÇ SEÇİCİ", "Sonuç seçici", "Dört işlemin sonucundan birini seçer.", "Sekiz 74HC153; seçim girişleri doğrudan işlem anahtarının OP1 OP0 bitleri."), bloklar: ["Sonuç seçici"] },
    "Giriş: A ve B anahtarları": { ...m("A VE B ANAHTARLARI", "Giriş: A ve B anahtarları", "A ve B sayılarının 8'li DIP anahtarları ve çekme dirençleri.", "Anahtar açık = 1; 10 kΩ diziler kapalı anahtarların hattını 0'a çeker. Ön kenarda, kullanıcının elinin altında."), bloklar: ["Anahtarlar"] },
    "Giriş: işlem, lamba testi, besleme": { ...m("İŞLEM, TEST, BESLEME", "Giriş: işlem, lamba testi, besleme", "İşlem anahtarı ve LED'leri, lamba testi butonu, işlem kod çözücü ve 5 V besleme girişi.", "2'li DIP anahtar işlemi seçer, üç kapı çipi dört işlem hattına çözer ve yeşil LED'leri yakar. Besleme girişi J1 ve 100 µF buradan bütün raylara dağılır."), bloklar: ["Anahtarlar", "Besleme ve arka panel"] },
  },
  bloklar: {
    Anahtarlar: m("ANAHTARLAR", "Anahtarlar ve işlem kodu", "Kullanıcının girdileri: A ve B sayıları, işlem ve lamba testi.", "DIP anahtarlar 10 kΩ dizilerle aşağı çekilir: açık = 1. İşlem kodu üç kapı çipiyle dört sinyale (TOPLA, ÇIKAR, ÇARP, BÖL) çözülür ve yeşil LED'lere gider."),
    "Toplama ve çıkarma": m("TOPLAMA VE ÇIKARMA", "Toplama ve çıkarma", "A + B ya da A − B; çıkarmada eksi sonucun işaretini ve mutlak değerini verir.", "Çıkarma toplamaya çevrilir: A − B = A + ~B + 1. İki 74HC283 toplar; çıkarmada C8 = 0 ise sonuç eksidir (NEG), bir XOR katmanı ve iki 74HC283 daha |A − B| = ~S + 1'i hesaplar. 10 entegre."),
    Çarpma: m("ÇARPMA", "Çarpma", "8 × 8 bit dizi çarpıcı: A × B, 16 bit (en çok 255 × 255 = 65 025).", "Elle çarpmanın ikilik hali: 64 VE kapısı (16 × 74HC08) kısmi çarpımları üretir, yedi satır ikişer 74HC283 ile sırayla toplanır; her satırda sağa düşen bit çarpımın bir biti olur. 30 entegre."),
    Bölme: m("BÖLME", "Bölme", "A ÷ B: bölüm ve kalan; sıfıra bölmeyi algılar.", "Geri yüklemeli uzun bölme, A7'den A0'a 8 aynı basamak: kalan bir bit sola kayar, A'nın sıradaki biti girer; kalan ≥ B ise B çıkarılır ve bölümün o biti 1 olur. Her basamak 2 × 74HC283 + 2 × 74HC157; artı ~B, B = 0 algılama (74HC30) ve VEYA'lar. 39 entegre."),
    "Sonuç seçici": m("SONUÇ SEÇİCİ", "Sonuç seçici", "İşlem anahtarına göre dört sonuçtan birini (16 bit) seçer.", "Sekiz 74HC153, seçim girişleri doğrudan OP1 OP0. Kaynaklar: toplama/çıkarma (M), çarpım (P), bölüm (Q); 8. bit toplamada T8, çarpmada P8, 9–15. bitler yalnız çarpmada."),
    "Onluğa çevirme: A": m("ONLUĞA ÇEVİRME A", "Onluğa çevirme: A", "A'yı ikilikten üç onluk haneye (BCD) çevirir.", "İkilik sayı en anlamlı bitten başlayarak hanelere kaydırılır; her kaydırmadan önce ≥ 5 olan haneye 3 eklenir. Her modül ≥ 5 algılama (d3 + d2 · (d1 + d0)) ve bir 74HC283'tür; 8 bit için 7 modül, 12 entegre."),
    "Onluğa çevirme: B": m("ONLUĞA ÇEVİRME B", "Onluğa çevirme: B", "B'yi ikilikten üç onluk haneye (BCD) çevirir.", "A'nınkiyle aynı: 7 modül (her biri ≥ 5 algılama ve bir 74HC283), 12 entegre."),
    "Onluğa çevirme: sonuç": m("ONLUĞA ÇEVİRME SONUÇ", "Onluğa çevirme: sonuç", "16 bitlik sonucu beş onluk haneye çevirir (en çok 65 025).", "33 modül: 33 × 74HC283 ve 25 kapı çipinde ≥ 5 algılama. Zincirleme 13 modül makinenin en uzun yolunun (çarpma → seçici → onluğa çevirme → gösterge, tipik 887 ns) büyük kısmıdır. 58 entegre."),
    "Onluğa çevirme: kalan": m("ONLUĞA ÇEVİRME KALAN", "Onluğa çevirme: kalan", "Kalanı (0–254) üç onluk haneye çevirir.", "7 modül (her biri ≥ 5 algılama ve bir 74HC283), 12 entegre."),
    "Gösterge: A": m("GÖSTERGE A", "Gösterge: A", "A'nın üç onluk hanesini gösterir.", "Her hane: 74HC4511 (BCD → 7 segment) → 8 × 470 Ω yalıtılmış dizi → ortak katotlu gösterge. Baştaki sıfırlar söner, en sağdaki hane hiç sönmez; lamba testi bütün segmentleri yakar."),
    "Gösterge: B": m("GÖSTERGE B", "Gösterge: B", "B'nin üç onluk hanesini gösterir.", "Her hane: 74HC4511 → 8 × 470 Ω dizi → ortak katotlu gösterge. Baştaki sıfırlar söner, en sağdaki hane hiç sönmez."),
    "Gösterge: Sonuç": m("GÖSTERGE SONUÇ", "Gösterge: sonuç", "Sonucun işaretini ve beş hanesini, sıfıra bölmede HATA LED'ini gösterir.", "Beş 74HC4511 hanesi ve 4511'den geçmeyen işaret hanesi (yalnız g segmenti). Baştaki sıfırlar söner; HATA'da bütün grup söner."),
    "Gösterge: Kalan": m("GÖSTERGE KALAN", "Gösterge: kalan", "Bölmede kalanı gösterir.", "Üç 74HC4511 hanesi; bölme değilken ya da B = 0 iken bütün grup söner (grup söndürme)."),
    "Besleme ve arka panel": m("BESLEME", "Besleme", "5 V besleme girişi ve giriş kondansatörü.", "J1 (1 = +5 V, 2 = GND) ve 100 µF; her entegrenin yanında 100 nF. Akımın neredeyse hepsi LED'lerden: tipik ≈ 0,3 A, lamba testinde ≈ 0,6 A."),
  },
  gruplar: [
    // Anahtarlar
    g("islem-kod", "U1-U3", "İŞLEM KOD ÇÖZME", "İşlem kod çözücü",
      "İşlem anahtarının iki bitini (OP1 OP0) dört işlem hattına çözer: TOPLA, ÇIKAR, ÇARP, BÖL.",
      "74HC08, 74HC02 ve 74HC04: her hat iki bitin bir birleşimidir (00 +, 01 −, 10 ×, 11 ÷). Hatlar işlem LED'lerini yakar ve bloklara gider: çıkarmada işaret, bölmede HATA ve kalan."),
    sayiAnahtari("A", "SW1", "RN1"),
    sayiAnahtari("B", "SW2", "RN2"),
    g("islem-anahtari", "SW3 RN3 D1-D4 R2-R5", "İŞLEM SEÇİMİ", "İşlem anahtarı ve LED'leri",
      "İşlemi seçer ve hangisinin seçili olduğunu gösterir.",
      "2'li DIP anahtar SW3: OP1 OP0 = 00 toplama, 01 çıkarma, 10 çarpma, 11 bölme; RN3 kapalıyken 0'a çeker. Dört yeşil LED (D1–D4, 330 Ω) işlem kod çözücünün hatlarından yanar."),
    g("lamba-testi", "SW4 R1", "LAMBA TESTİ", "Lamba testi butonu",
      "Basılıyken bütün segmentleri yakar: kurulumda her haneyi denemek için.",
      "Buton 10 kΩ ile 1'e çekilir, basınca ~LT = 0 olur; 74HC4511'lerde lamba testi söndürmeden üstündür. İşaret hanesi lamba testini kendi VEYA kapısından alır."),
    g("besleme", "J1 C1", "BESLEME GİRİŞİ", "Besleme girişi",
      "5 V'u karta alır.",
      "2 pinli başlık (1 = +5 V, 2 = GND) ve 100 µF giriş kondansatörü. 5 V 2 A adaptör yeterli ve paylıdır."),
    // Toplama ve çıkarma
    g("b-tersleme", "U4 U5", "B TERSLEME", "B tersleme (XOR)",
      "Çıkarmada B'yi ters çevirir: A − B = A + ~B + 1.",
      "İki 74HC86: her B biti OP0 ile XOR'lanır (BX); toplayıcının elde girişi de OP0'dır."),
    g("toplayici", "U6 U7", "TOPLAYICI", "Toplayıcı",
      "A + BX + OP0'ı hesaplar: S (8 bit) ve elde C8.",
      "İki 74HC283 zincir. Toplamada C8 sonucun 9. bitidir (255 + 255 = 510); çıkarmada C8 = 0 ise A < B'dir."),
    g("isaret", "U8-U11", "İŞARET VE TÜMLEME", "İşaret ve tümleme",
      "Çıkarmada sonucun eksi olup olmadığını bulur, eksiyse farkı ters çevirir.",
      "NEG = ÇIKAR · ~C8 ve T8 = C8 · TOPLA (74HC08). İki 74HC86 S'yi NEG ile XOR'lar; NEG = 0 iken S olduğu gibi geçer. NEG işaret hanesinin g segmentini de yakar."),
    g("mutlak", "U12 U13", "MUTLAK DEĞER", "Mutlak değer",
      "Eksi sonucun mutlak değerini çıkarır: |A − B| = ~S + 1.",
      "İki 74HC283 ters çevrilmiş S'ye NEG'i ekler (M). Örnek: 12 − 200 → S = 68, C8 = 0, M = ~68 + 1 = 188; göstergede − 188."),
    // Çarpma
    g("satir-0", "U14 U15", "ÇARPIM SATIRI 0", "Çarpım satırı 0 (B0 · A)",
      "B'nin en düşük biti A'yı geçirir ya da sıfırlar; en sağdaki bit çarpımın P0'ıdır.",
      "İki 74HC08, sekiz VE kapısı: pp[0][j] = A[j] · B0. Diğer yedi bit 1. satırın toplayıcısına gider."),
    ...[1, 2, 3, 4, 5, 6, 7].map((k) =>
      g(`satir-${k}`, `U${14 + 2 * k} U${15 + 2 * k} U${28 + 2 * k} U${29 + 2 * k}`, `ÇARPIM SATIRI ${k}`, `Çarpım satırı ${k} (+ B${k} · A)`,
        k < 7
          ? `Bir önceki toplamın bir bit sağa kaymışına B${k} · A'yı ekler; sağa düşen bit çarpımın P${k} bitidir.`
          : "Son satır: B7 · A'yı ekler; P7 ve toplamın 8 biti ile eldesi çarpımın üst yarısıdır (P8–P15).",
        `İki 74HC08 kısmi çarpımları (B${k}·A0 … B${k}·A7), iki 74HC283 (U${28 + 2 * k} düşük, U${29 + 2 * k} yüksek 4 bit) toplamı yapar.`)),
    // Bölme
    ...[7, 6, 5, 4, 3, 2, 1, 0].map((b) => {
      const u = 44 + 4 * (7 - b);
      return g(`basamak-${b}`, `U${u}-U${u + 3}`, `BÖLME BASAMAĞI ${b}`, `Bölme basamağı ${b}`,
        `Bölümün ${b}. bitini bulur: kalan ≥ B ise B'yi çıkarır, değilse kalanı korur.`,
        `Kalan bir bit sola kaymış, A${b} sağdan girmiştir. U${u} ve U${u + 1} (74HC283) kalan − B'yi kalan + ~B + 1 olarak hesaplar; U${u + 2} ve U${u + 3} (74HC157) bölüm biti 1 ise farkı, değilse eski kalanı seçer (geri yükleme).`);
    }),
    g("bolum-bitleri", "U77 U78", "BÖLÜM BİTLERİ", "Bölüm bitleri",
      "Her basamağın bölüm bitini çıkarır: kalan ≥ B mi?",
      "Sekiz VEYA kapısı (iki 74HC32): q = R7 + elde. Kalan 9 bit olabilir; 9. bit 1 ise kalan kesinlikle ≥ B'dir. q hem bölümün biti (Q0–Q7) hem basamağın seçicisidir."),
    g("b-tumleyen", "U80 U81", "~B EVİRİCİLERİ", "~B eviricileri",
      "Bölmenin çıkarmaları için B'nin tersi.",
      "İki 74HC04, sekiz evirici; ~B bütün basamakların toplayıcılarına gider."),
    g("sifira-bolme", "U76 U79 U82", "SIFIRA BÖLME", "Sıfıra bölme ve kalan izni",
      "B = 0'ı algılar: bölmede HATA'yı yakar; kalanı yalnız geçerliyken gösterir.",
      "74HC30 (8 girişli VE-DEĞİL) B = 0 iken 0 verir. HATA = BÖL · (B = 0) (74HC08): HATA LED'i yanar, sonuç ve kalan söner. 74HC00 kalanın yalnız bölmede ve B ≠ 0 iken görünmesini sağlar."),
    // Sonuç seçici
    g("secici-dusuk", "U83-U86", "SONUÇ SEÇİCİ 0–7", "Sonuç seçici, bit 0–7",
      "Sonucun düşük baytını dört işlemden seçer.",
      "Dört 74HC153, her biri iki bit; seçim girişleri OP1 OP0. Kaynaklar: toplama/çıkarma (M), aynısı, çarpım (P), bölüm (Q)."),
    g("secici-yuksek", "U87-U90", "SONUÇ SEÇİCİ 8–15", "Sonuç seçici, bit 8–15",
      "Sonucun yüksek baytı: toplamada 9. bit (T8), çarpmada P8–P15.",
      "Dört 74HC153; 9–15. bitler yalnız çarpmada dolu, diğer işlemlerde 0."),
    // Onluğa çevirme
    g("bcd-a", "U91-U102", "ONLUĞA ÇEVİRME A", "A'nın onluğa çeviricisi",
      "A'yı üç onluk haneye çevirir (yüzler, onlar, birler).",
      "Yedi 74HC283 +3 modülü (4.–8. kaydırma) ve beş kapı çipinde ≥ 5 algılama (d3 + d2 · (d1 + d0)); ≥ 5 ise modül +3, değilse +0 ekler."),
    g("bcd-b", "U103-U114", "ONLUĞA ÇEVİRME B", "B'nin onluğa çeviricisi",
      "B'yi üç onluk haneye çevirir.",
      "Yedi 74HC283 +3 modülü ve beş kapı çipinde ≥ 5 algılama; A'nınkiyle aynı düzen."),
    g("bcd-sonuc-1", "U115-U121", "SONUÇ ÇEVİRİCİ 4–8", "Sonucun onluğa çeviricisi: 4.–8. kaydırma",
      "16 bitlik sonucun çevrilmesinin ilk basamakları: birler ve onlar haneleri.",
      "Yedi 74HC283 +3 modülü. Sonuç 16 bit, 5 hane: toplam 33 modül, en uzun yolun 13 modülü zincirlenir."),
    g("bcd-sonuc-2", "U122-U132", "SONUÇ ÇEVİRİCİ 9–12", "Sonucun onluğa çeviricisi: 9.–12. kaydırma",
      "Çevirmenin orta basamakları; yüzler hanesi 10. kaydırmada başlar.",
      "On bir 74HC283 +3 modülü: birler, onlar ve yüzler haneleri."),
    g("bcd-sonuc-3", "U133-U147", "SONUÇ ÇEVİRİCİ 13–16", "Sonucun onluğa çeviricisi: 13.–16. kaydırma",
      "Çevirmenin son basamakları; binler hanesi 14. kaydırmada başlar.",
      "On beş 74HC283 +3 modülü: birler, onlar, yüzler ve binler haneleri; on binler son kaydırmayla dolar."),
    g("bcd-sonuc-algilama", "U148-U172", "SONUÇ ≥ 5 ALGILAMA", "Sonucun ≥ 5 algılama kapıları",
      "33 modülün her biri için hanenin 5 ya da büyük olup olmadığını bulur.",
      "Dokuz 74HC08 ve on altı 74HC32: modül başına d3 + d2 · (d1 + d0), 3 kapı. Çıkış modülün 74HC283'ünün B1 ve B2 girişine gider: +3 ya da +0."),
    g("bcd-kalan", "U173-U184", "ONLUĞA ÇEVİRME KALAN", "Kalanın onluğa çeviricisi",
      "Kalanı üç onluk haneye çevirir.",
      "Yedi 74HC283 +3 modülü ve beş kapı çipinde ≥ 5 algılama."),
    // Göstergeler
    sondurme("A", "a", "U185-U188", "En sağdaki hane hiç sönmez."),
    ...haneGruplari("A", "a", [
      { ad: "yuzler", surucu: "U189", dizi: "RN4", gosterge: "DS1" },
      { ad: "onlar", surucu: "U190", dizi: "RN5", gosterge: "DS2" },
      { ad: "birler", surucu: "U191", dizi: "RN6", gosterge: "DS3" },
    ]),
    sondurme("B", "b", "U192-U195", "En sağdaki hane hiç sönmez."),
    ...haneGruplari("B", "b", [
      { ad: "yuzler", surucu: "U196", dizi: "RN7", gosterge: "DS4" },
      { ad: "onlar", surucu: "U197", dizi: "RN8", gosterge: "DS5" },
      { ad: "birler", surucu: "U198", dizi: "RN9", gosterge: "DS6" },
    ]),
    sondurme("SONUÇ", "sonuc", "U199-U204", "HATA'da bütün grup söner (grup söndürme aynı kapıya VEYA-DEĞİL ile girer); işaret hanesi eksi ya da lamba testiyle bir VEYA kapısından yanar."),
    g("isaret-hanesi", "DS7 R6", "İŞARET HANESİ", "Sonuç: işaret hanesi",
      "Çıkarmada sonuç eksiyse − işaretini gösterir.",
      "Yalnız g segmenti bağlı bir gösterge; 4511'den geçmez: NEG ∨ lamba testi bir VEYA kapısından ve 330 Ω'dan sürülür."),
    ...haneGruplari("SONUÇ", "sonuc", [
      { ad: "onbinler", surucu: "U205", dizi: "RN10", gosterge: "DS8" },
      { ad: "binler", surucu: "U206", dizi: "RN11", gosterge: "DS9" },
      { ad: "yuzler", surucu: "U207", dizi: "RN12", gosterge: "DS10" },
      { ad: "onlar", surucu: "U208", dizi: "RN13", gosterge: "DS11" },
      { ad: "birler", surucu: "U209", dizi: "RN14", gosterge: "DS12" },
    ]),
    g("hata", "D5 R7", "HATA LED'İ", "HATA LED'i",
      "Sıfıra bölmede yanar.",
      "Kırmızı LED, 330 Ω; HATA = BÖL · (B = 0). Aynı anda sonuç ve kalan göstergeleri söner."),
    sondurme("KALAN", "kalan", "U210-U213", "Bölme değilken ya da B = 0 iken bütün grup söner."),
    ...haneGruplari("KALAN", "kalan", [
      { ad: "yuzler", surucu: "U214", dizi: "RN15", gosterge: "DS13" },
      { ad: "onlar", surucu: "U215", dizi: "RN16", gosterge: "DS14" },
      { ad: "birler", surucu: "U216", dizi: "RN17", gosterge: "DS15" },
    ]),
  ],
};
