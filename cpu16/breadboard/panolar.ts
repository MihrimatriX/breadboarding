// CPU16'nın breadboard panoları: her kart kendi taban plakasında, bir grup BB830 breadboard'dan oluşan
// bir pano. Panolar iki sıra halinde bir koridora bakar; anakartın arka paneli (BACKPLANE, 64 hat) bu
// koridorda uzanan 64 damarlı bir şerit kablodur: her kartın PCB'deki 2 × 32 kenar konnektörü (J1,
// J201, J401 …) breadboard'da bir şerit kablo uyarlayıcısıdır (üstte 2 × 32 IDC erkek başlık, altta
// kanalın iki yanına oturan 64 bacak; tek numaralı pinler f, çift numaralılar e satırında). Böylece
// kartlar arası her bağlantı arka paneldeki gibi tek bir yoldan geçer; kart içinde uzun tel olmaz.
//
//   arka sıra (uyarlayıcılar ön kenarda):     önbellek   CPU   bellek
//   ─────────────── koridor: şerit kablo ───────────────────────────────
//   ön sıra (uyarlayıcılar arka kenarda):     KYB  saat  video  G/Ç     ← butonlar, VGA, PS/2, USB önde
//
// Her panonun içinde bloklar kurulum aşamalarına göre bölgelere ayrılır (deney sırası: önce
// uyarlayıcının yanındaki bölgeler); mantık çipleri bölgelerinin board'larına tavlamayla dağıtılır.
// CPU kartı modül modül kurulur (James Sharman ve Ben Eater'ın breadboard bilgisayarları gibi): her
// board'un bir işi var (`duzen`: R0, R1 … R7 ayrı board'larda, toplayıcı, mantık birimi, sonuç seçici,
// program sayacı, MAR, IR …) ve 3D'de, kurulum belgelerinde o işin adıyla etiketlidir.
// Bu dosya yalnız tanımdır: yerleşim cpu16/breadboard/yerlesim.ts, teller ortak yönlendiricide.

import type { Asama } from "../board/breadboard/yerlesim.ts";

/** Kurulum aşaması ve sonunda yapılacak test */
export interface KartAsamasi extends Asama {
  /** aşamanın sonunda yapılacak test (kurulum belgesi ve kurulum modu) */
  test: string;
  /** hangi deney rehberi (cpu16/kit/deney-NN-*.md) */
  deney?: number;
}

/**
 * Bir bölge: blokları (çipin bloğu; yapıştırıcı çipte birimlerinin çoğunluğunun bloğu). Modüler panoda
 * (düzen) bölgenin parçaları board'larındaki grupların parçalarıdır; bloklar yalnız blokların hangi
 * bölgenin altında anlatılacağını söyler (boş olabilir: veriyolu kontrolü birkaç bloktan parça taşır).
 */
export interface Bolge {
  /** board'ların görevi (belgelerde, 3D'de) */
  ad: string;
  bloklar: string[];
}

export interface PanoTanimi {
  kart: string;
  /** kısa ad (kurulum modunda tel tarifinin başında: "CPU · BB07 c14 → …") */
  kisa: string;
  baslik: string;
  /** board ızgarası: satır satır (arkadan öne) bölge kodları */
  izgara: string[];
  bolgeler: Record<string, Bolge>;
  /** makinedeki sıra: arka sıra panoların uyarlayıcısı ön kenarda, ön sıradakilerin arka kenarda */
  sira: "arka" | "on";
  /** uyarlayıcının board'u (bx, by) ve 1. pin çiftinin sütunu */
  uyarlayici: { bx: number; by: number; c0: number };
  /**
   * Uyarlayıcının sırasından başka 5 V girişi olan board sıraları (isteğe bağlı): uzun panoda girişten
   * en uzak board'daki ray düşümü 0,1 V'un altında kalsın diye (CPU kartı: en arka sıra da)
   */
  ekBesleme?: number[];
  /** board başına en çok mantık çipi */
  yuva: number;
  asamalar: KartAsamasi[];
  /**
   * Modüler yerleşim (isteğe bağlı): her board'a hangi çip grupları (bolum-metin.ts'teki grup
   * kimlikleri, boşlukla ayrılmış), satır satır ızgarayla aynı boyda. Bir grup birden çok board'da
   * geçerse çipleri o board'lara tavlamayla dağılır; tek grubu olan board'da çipler referans sırasıyla
   * (düşük bayt solda). "grup+" grubun göstergelerinin (LED'ler, çubuk göstergeler ve dirençleri)
   * board'u; yoksa göstergeler grubun ilk board'unda. Verilmezse çipler bölgelerinin bütün board'larına
   * dağılır.
   */
  duzen?: string[][];
}

const TABAN: Omit<KartAsamasi, "test"> = { no: 1, ad: "Taban, besleme ve şerit kablo uyarlayıcısı", bloklar: ["Besleme ve arka panel"] };
const tabanTesti =
  "Besleme girişlerine 5 V ver (çip yok): her board'un dört rayında ölç (+ raylar 4,9–5,1 V, − raylar 0 V); " +
  "uyarlayıcının 3, 4 ve 63. pinleri 5 V, 1, 2, 62 ve 64. pinleri 0 V. Şerit kabloyu henüz takma.";

export const PANOLAR: PanoTanimi[] = [
  {
    kart: "cpu", kisa: "CPU", baslik: "CPU kartı", sira: "arka", yuva: 5,
    // modül modül, arkadan öne (James Sharman'ın breadboard bilgisayarı gibi): her bölge taban plakasında
    // ayrı bir ada (aralarında ≈ 20 mm boşluk), her board'un tek bir işi var ve etiketi onu söyler.
    // Register'lar (R0–R7 her biri kendi board'unda, değeri hemen önündeki board'un çubuk
    // göstergelerinde), sağda veriyolu kontrolü (register seçicileri, veriyolu göstergesi, kaynak
    // çözücüsü); sabit birimi; ALU ve sağında bayraklar; kontrol birimi (mikrokod kapı ağı, adım
    // seçicileri, IR); ön kenarda (uyarlayıcının yanında) program sayacı ve bellek arayüzü. Göstergeli
    // modüllerde "grup+" board'u grubun LED'lerini ve çubuk göstergelerini taşır.
    izgara: [
      "RRRRV",
      "RRRRV",
      "RRRRV",
      "RRRRV",
      "SSSSS",
      "AAAAF",
      "AAAAF",
      "AAAAF",
      "AAAAF",
      "KKKKK",
      "KKKKK",
      "KKKKK",
      "KKKKK",
      "PPBBB",
      "PPBBB",
    ],
    duzen: [
      ["r0", "r1", "r2", "r3", "register-cozuculeri register-saatleri"],
      ["r0+", "r1+", "r2+", "r3+", "veriyolu-gostergeleri"],
      ["r4", "r5", "r6", "r7", "register-secimi"],
      ["r4+", "r5+", "r6+", "r7+", "bus-cozucu veriyolu-cekme"],
      ["sabit-dusuk", "sabit-dusuk", "sabit-surucu", "sabit-yuksek", "sabit-yuksek"],
      ["alu-kapilari", "alu-giris-kapilari", "toplayici", "tasma-kapilari cv-secici alu-surucu", "bayraklar kosul"],
      ["alu-kapilari", "alu-giris-kapilari", "alu-giris-kapilari", "ta tb", "bayrak-surucu"],
      ["mantik-dusuk", "mantik-dusuk", "mantik-yuksek", "mantik-yuksek", "bayrak-girisi bayrak-kapilari"],
      ["alu-islem alu-cozucu", "sonuc-secici", "sonuc-secici", "sonuc-secici+", "sifir"],
      ["mikrokod-kapilari", "mikrokod-kapilari", "mikrokod-kapilari", "mikrokod-kapilari", "halt-hata durum-ledleri"],
      ["mikrokod-kapilari", "mikrokod-kapilari", "mikrokod-kapilari", "kontrol-registeri", "kontrol-kapilari"],
      ["komut-cozucu alt-cozucu", "mikrokod-kapilari", "mikrokod-kapilari", "mikrokod-kapilari", "adim-cozucu adim-sayaci"],
      ["adim-secici", "adim-secici", "adim-secici", "ir saat-kapilari", "ir+"],
      ["pc+", "pc-surucu", "mar+ bellek-ledleri", "mar", "bayt-seritleri"],
      ["pc", "pc", "bellek-kapilari arka-panel", "bellek-kapilari", "bayt-okuma"],
    ],
    bolgeler: {
      R: { ad: "Register dosyası", bloklar: ["Register dosyası"] },
      V: { ad: "Veriyolu kontrolü", bloklar: [] },
      S: { ad: "Sabit birimi", bloklar: ["Sabit birimi"] },
      A: { ad: "ALU ve geçici register'lar", bloklar: ["Geçici register'lar", "ALU", "ALU kod çözücü"] },
      F: { ad: "Bayraklar ve koşul", bloklar: ["Bayraklar ve koşul"] },
      K: { ad: "Kontrol birimi", bloklar: ["Kontrol birimi", "Kontrol"] },
      P: { ad: "Program sayacı", bloklar: ["Program sayacı"] },
      B: { ad: "Bellek arayüzü ve MAR", bloklar: ["MAR ve IR", "Bellek arayüzü", "Besleme ve arka panel"] },
    },
    uyarlayici: { bx: 2, by: 14, c0: 30 },
    ekBesleme: [0],
    asamalar: [
      { ...TABAN, test: tabanTesti },
      { no: 2, ad: "Register dosyası ve iç veriyolu", bloklar: ["Register dosyası"], deney: 4, test: "Deney 4: veriyoluna anahtarlarla değer ver, bir register'a yaz, geri oku: yazarken o register'ın WSEL LED'i, okurken ROE LED'i yanar, register'ın çubukları içeriğini, veriyolu çubukları veriyolundaki değeri gösterir; sürülmeyen veriyolu 0 okunur (RN1, RN2). Veriyolunu anahtar modülüyle sürerken veriyolu çubuklarının dizilerini (RN3, RN4) çıkar." },
      { no: 3, ad: "ALU, geçici register'lar ve bayraklar", bloklar: ["Geçici register'lar", "ALU", "ALU kod çözücü", "Bayraklar ve koşul"], deney: 5, test: "Deney 5: iki geçici register'a değer yükle, ALU işlemlerini (toplama, çıkarma, mantık, kaydırma) ve Z/N/C/V bayraklarını tabloyla karşılaştır; TA/TB yükleme LED'leri, sonuç çubukları (ALU çıkışı) ve bayrak LED'leri her adımı gösterir." },
      { no: 4, ad: "Program sayacı, MAR, IR ve bellek arayüzü", bloklar: ["Program sayacı", "MAR ve IR", "Bellek arayüzü"], deney: 6, test: "Deney 6: PC'yi sıfırla ve adım adım artır; PC çubuklarında adresin, MAR çubuklarında bellek adresinin, IR çubuklarında komutun değiştiğini, bellek okuma (yeşil) ve yazma (amber) LED'lerinde erişimi izle." },
      { no: 5, ad: "Kontrol birimi, sabit birimi ve durum LED'leri", bloklar: ["Kontrol birimi", "Kontrol", "Sabit birimi"], deney: 7, test: "Deney 7: saat kartı ve test belleğiyle ilk komutları adım adım çalıştır; mikro adım LED'leri her saatte bir ilerler, HALT komutunda HALTED LED'i yanar, FAULT sönük kalır." },
    ],
  },
  {
    kart: "clk", kisa: "Saat", baslik: "Saat ve reset kartı", sira: "on", yuva: 4,
    izgara: ["P", "S", "S", "O", "B"],
    bolgeler: {
      P: { ad: "Uyarlayıcı ve saat dağıtımı", bloklar: ["Besleme ve arka panel", "Saat dağıtımı"] },
      S: { ad: "Saat üretimi ve bekleme", bloklar: ["Saat üretimi", "Bekleme durumu"] },
      O: { ad: "Osilatör ve reset", bloklar: ["Osilatör ve reset"] },
      B: { ad: "Kullanıcı paneli: butonlar, anahtarlar, hız ayarı", bloklar: [] },
    },
    uyarlayici: { bx: 0, by: 0, c0: 30 },
    asamalar: [
      { ...TABAN, test: tabanTesti },
      { no: 2, ad: "Osilatör, reset ve butonlar", bloklar: ["Osilatör ve reset"], deney: 1, test: "Deney 1: osilatör çıkışında (X201 8. pin) kare dalga; RESET butonuna basınca U201'in reset çıkışı değişir, bırakınca ≈ 0,1 s sonra döner; yavaş osilatör pot ile hızlanıp yavaşlar." },
      { no: 3, ad: "Saat üretimi, bekleme ve dağıtım", bloklar: ["Saat üretimi", "Bekleme durumu", "Saat dağıtımı"], deney: 1, test: "Deney 1: CLK LED'i YAVAŞ kipte yanıp söner; ADIM kipinde her basışta tek bir saat; uyarlayıcının 5. pininde (CLK) osilatörün 1/8'i." },
    ],
  },
  {
    kart: "bellek", kisa: "Bellek", baslik: "Bellek kartı", sira: "arka", yuva: 5,
    // ön kenarda (uyarlayıcı) adres çözme ve bank register'ları, ortada bayt sıralayıcı, arkada bellek çipleri
    izgara: ["EE", "EY", "YY", "YB", "BB", "BB"],
    bolgeler: {
      B: { ad: "Adres çözme ve bank register'ları", bloklar: ["Adres çözme", "Bank register'ları", "Besleme ve arka panel", "Veri yolu"] },
      Y: { ad: "Bayt sıralayıcı", bloklar: ["Bayt sıralayıcı"] },
      E: { ad: "EEPROM ve RAM", bloklar: ["EEPROM ve RAM"] },
    },
    uyarlayici: { bx: 1, by: 5, c0: 30 },
    asamalar: [
      { ...TABAN, bloklar: ["Besleme ve arka panel", "Veri yolu"], test: tabanTesti },
      { no: 2, ad: "Adres çözme ve bank register'ları", bloklar: ["Adres çözme", "Bank register'ları"], deney: 8, test: "Deney 8: bank register'larına (FF10–FF1F) yaz, geri oku; adres çözücünün seçim çıkışlarını adres anahtarlarıyla dene." },
      { no: 3, ad: "Bayt sıralayıcı, EEPROM ve RAM", bloklar: ["Bayt sıralayıcı", "EEPROM ve RAM"], deney: 8, test: "Deney 8: EEPROM'daki ilk programı çalıştır (önbellek kartının bekleme blokları da takılı olmalı); RAM'e yazıp geri oku." },
    ],
  },
  {
    kart: "onbellek", kisa: "Önbellek", baslik: "Önbellek kartı", sira: "arka", yuva: 5,
    izgara: ["EE", "EE", "SS", "SS", "WW", "WW"],
    bolgeler: {
      W: { ad: "G/Ç çözme, bekleme ve sıralama", bloklar: ["Besleme ve arka panel", "G/Ç çözme", "Bekleme ve sıralama"] },
      S: { ad: "Sayaçlar", bloklar: ["Sayaçlar"] },
      E: { ad: "Etiket ve veri belleği", bloklar: ["Etiket belleği", "Veri belleği"] },
    },
    uyarlayici: { bx: 1, by: 5, c0: 30 },
    asamalar: [
      { ...TABAN, test: tabanTesti },
      { no: 2, ad: "G/Ç çözme, bekleme ve sıralama", bloklar: ["G/Ç çözme", "Bekleme ve sıralama"], deney: 8, test: "Deney 8: bellek kartıyla birlikte ilk program çalışır (her kelime iki baytta, bekleme turlarıyla)." },
      { no: 3, ad: "Etiket ve veri belleği, sayaçlar", bloklar: ["Etiket belleği", "Veri belleği", "Sayaçlar"], deney: 9, test: "Deney 9: reset sonrası etiket temizleme sayacı 1024 satırı dolaşır; önbellek açıkken aynı programın isabet sayacı artar." },
    ],
  },
  {
    kart: "gc", kisa: "G/Ç", baslik: "G/Ç kartı", sira: "on", yuva: 5,
    izgara: ["DDD", "ZZZ", "ZZZ", "ZUU", "UUU", "UKK"],
    bolgeler: {
      D: { ad: "Uyarlayıcı, adres çözme ve durum register'ları", bloklar: ["Besleme ve arka panel", "Adres çözme", "Durum register'ları", "Okuma yan etkileri", "Sinyal düzeltme"] },
      Z: { ad: "Zamanlayıcı ve kesme denetleyicisi", bloklar: ["Zamanlayıcı", "Kesme denetleyicisi"] },
      U: { ad: "UART ve USB-seri modülü", bloklar: ["UART verici", "UART alıcı", "UART konnektörü"] },
      K: { ad: "PS/2 klavye", bloklar: ["PS/2 klavye"] },
    },
    uyarlayici: { bx: 0, by: 0, c0: 30 },
    asamalar: [
      { ...TABAN, test: tabanTesti },
      { no: 2, ad: "Adres çözme ve durum register'ları", bloklar: ["Adres çözme", "Durum register'ları", "Okuma yan etkileri", "Sinyal düzeltme"], deney: 10, test: "Deney 10: G/Ç adreslerini (FF20–FF3F) okuyan bir programla durum register'ının sabit bitlerini gör." },
      { no: 3, ad: "UART ve USB-seri modülü", bloklar: ["UART verici", "UART alıcı", "UART konnektörü"], deney: 10, test: "Deney 10: CH340 modülünü tak; 115200 8N1 terminalde BIOS'un açılış yazısı ve yankı." },
      { no: 4, ad: "Zamanlayıcı ve kesme denetleyicisi", bloklar: ["Zamanlayıcı", "Kesme denetleyicisi"], deney: 10, test: "Deney 10: zamanlayıcı kesmesiyle sayan örnek program; IRQ hattı (uyarlayıcının 8. pini) periyodik." },
      { no: 5, ad: "PS/2 klavye", bloklar: ["PS/2 klavye"], deney: 10, test: "Deney 10: PS/2 klavyede basılan tuşların kodları terminale yazılır." },
    ],
  },
  {
    kart: "video", kisa: "Video", baslik: "Video kartı", sira: "on", yuva: 5,
    izgara: ["CCC", "CCC", "VVV", "SSS", "SSS", "XXX", "XXX"],
    bolgeler: {
      C: { ad: "Uyarlayıcı, adres çözme ve CPU arayüzü", bloklar: ["Besleme ve arka panel", "Adres çözme", "CPU arayüzü"] },
      V: { ad: "VRAM", bloklar: ["VRAM"] },
      S: { ad: "Piksel saati, sayaçlar ve tarama", bloklar: ["Piksel saati ve sayaçlar", "Çözümleme", "Dikey tarama durumu", "Tarama adresi"] },
      X: { ad: "Piksel yolu, imleç, renk DAC'ı ve VGA", bloklar: ["Piksel yolu", "İmleç", "Renk ve DAC"] },
    },
    uyarlayici: { bx: 1, by: 0, c0: 30 },
    asamalar: [
      { ...TABAN, test: tabanTesti },
      { no: 2, ad: "Adres çözme, CPU arayüzü ve VRAM", bloklar: ["Adres çözme", "CPU arayüzü", "VRAM"], deney: 11, test: "Deney 11: VRAM'e (pencere üzerinden) yaz ve geri oku; bekleme hattı yalnız tarama sırasında." },
      { no: 3, ad: "Piksel saati, sayaçlar ve tarama", bloklar: ["Piksel saati ve sayaçlar", "Çözümleme", "Dikey tarama durumu", "Tarama adresi"], deney: 11, test: "Deney 11: HSYNC 31,5 kHz, VSYNC 60 Hz (osiloskop ya da frekans ölçer); monitör siyah bir görüntüye kilitlenir." },
      { no: 4, ad: "Piksel yolu, imleç ve renk DAC'ı", bloklar: ["Piksel yolu", "İmleç", "Renk ve DAC"], deney: 11, test: "Deney 11: ekranda BIOS'un açılış yazısı ve yanıp sönen imleç." },
    ],
  },
  {
    kart: "kyb", kisa: "KYB", baslik: "Kendin yap bellek kartı", sira: "on", yuva: 4,
    izgara: ["P", "A", "H", "H", "H", "H"],
    bolgeler: {
      P: { ad: "Uyarlayıcı ve veriyolu tamponu", bloklar: ["Besleme ve arka panel", "Veriyolu tamponu"] },
      A: { ad: "Adres çözme", bloklar: ["Adres çözme"] },
      H: { ad: "Bellek hücreleri", bloklar: ["Bellek hücreleri"] },
    },
    uyarlayici: { bx: 0, by: 0, c0: 30 },
    asamalar: [
      { ...TABAN, test: tabanTesti },
      { no: 2, ad: "Adres çözme ve veriyolu tamponu", bloklar: ["Adres çözme", "Veriyolu tamponu"], deney: 14, test: "Deney 14: FF40–FF4F'yi okuyan program; seçim hatları adres anahtarlarıyla doğru hücreyi seçer." },
      { no: 3, ad: "Bellek hücreleri", bloklar: ["Bellek hücreleri"], deney: 14, test: "Deney 14: 16 baytın her birine yaz, geri oku (BIOS'un bellek testi)." },
    ],
  },
];

/** Makinedeki sıralar, soldan sağa (koridorun iki yanı) */
export const MAKINE_SIRALARI: { arka: string[]; on: string[] } = {
  arka: ["onbellek", "cpu", "bellek"],
  on: ["kyb", "clk", "video", "gc"],
};

export const KART_SIRASI = ["clk", "cpu", "bellek", "onbellek", "gc", "video", "kyb"];

export function panoTanimi(kart: string): PanoTanimi {
  const p = PANOLAR.find((x) => x.kart === kart);
  if (!p) throw new Error(`breadboard panosu olmayan kart: ${kart}`);
  return p;
}

/** 5 V girişi olan board sıraları: önce uyarlayıcının sırası, sonra ek sıralar */
export const beslemeSiralari = (t: Pick<PanoTanimi, "uyarlayici" | "ekBesleme">): number[] => [t.uyarlayici.by, ...(t.ekBesleme ?? [])];
