// Anakart önbellek kartı ("onbellek", Faz 6): 2 KB doğrudan eşlemeli önbellek, satır = 1 kelime
// (1024 satır), write-through, yazma-ayırmasız; bekleme durumu üreteci ve isabet/ıskalama sayaçları.
// Emülatördeki karşılığı: cpu16/emu/devices/cache.ts + Machine.read8/write8. Ayrıntı ve zamanlama
// çizimi: cpu16/docs/anakart-kartlari.md
//
// Etiket = fiziksel adres [19:11] (A13..A11, PA14..PA19) + geçerlilik biti, satır = A10..A1.
// Etiket belleği 2 × 62256 (16 bit: 9 etiket + geçerli + 6 sıfır), veri belleği 2 × 62256 (DE, DO).
// İki 74HC688 etiketi karşılaştırır: HIT.
//
// Bekleme: ana belleğe giden her erişim tam 2 bekleme turu alır (MEM_WAIT): okuma ıskalaması,
// önbellek kapalıyken okuma ve her bellek yazması (bayt yazması dahil). İsabet ve G/Ç beklemesizdir.
//   NEED  = ~IO ∧ (WRL ∨ (RD ∧ ¬(EN ∧ HIT)))      WRL: CPU'nun yazma darbesiyle kurulur, CLK↑ ile silinir
//   CA ← NEED (TCLK↑, t = 6), CB ← CA (t = 14), ~WAIT = ¬((NEED ∨ CA) ∧ ¬CB)
// Saat kartı ~WAIT'i t = 3,5 ve 11,5'te düşük, 19,5'te yüksek görür: tam iki tur.
// Etiket/veri yazma evresi TAGPH = TCLK ∧ CB ∧ ¬CBF = [14, 18) (CBF: CB'nin TCLK↓ ile gecikmişi):
//   okuma ıskalaması (EN = 1) → satırı doldur (bellek kartı DE/DO'yu t = 10'dan beri sürüyor)
//   RAM'e yazma isabeti (PA19 = 1) → yazılan bayt(lar)ı satırda güncelle (CPU verisi)
//   Flash/boş bölgeye yazma isabeti (PA19 = 0) → satırı geçersiz kıl (INVL, t = 6'da örneklenir)
// İsabette veri SRAM'i ~MRD ile birlikte DE/DO'yu sürer (CA = 0 iken).
//
// Sayaçlar: 74HC590 × 4, CLK↑'de (R) sayar: isabet = okuma ∧ EN ∧ HIT ∧ ¬CA, ıskalama = okuma ∧ EN ∧ CA.
// Bir veri yolu döngüsü = bir kelime erişimi = bir sayım. Çıkış register'ları her okuma adımının
// başında (MRD↑) sayıcıyı alır; FF30 yazması (çift bayt) ikisini de sıfırlar.
// CACHE_CTRL (FF34) bit0 = EN; reset'te 1.
//
// Reset: ~RESET düşükken etiket adresi 74HC157'lerle 10 bitlik sayıcıya (3 × 74HC161) geçer ve
// OSC'nin her düşük yarısında bir satıra "geçersiz" yazılır. ~RESET en az 1025 OSC periyodu düşük
// kalmalıdır (gerçek kartta reset RC'si milisaniyeler sürer). Temizleme bitişi OSC'ye eşzamanlanır
// (CLRS), böylece son yazma darbesi adres ve veri değişmeden kapanır.

import type { Board, ChipInstance } from "./board.ts";

export interface CacheCard {
  tagLo: ChipInstance;
  tagHi: ChipInstance;
  dataEven: ChipInstance;
  dataOdd: ChipInstance;
  /** 74HC590: isabet düşük/yüksek, ıskalama düşük/yüksek */
  hitsLo: ChipInstance;
  hitsHi: ChipInstance;
  missLo: ChipInstance;
  missHi: ChipInstance;
  /** EN flip-flop'unun bulunduğu 74HC74 (2. birim) */
  ctrl: ChipInstance;
}

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

export function buildCacheCard(b: Board): CacheCard {
  b.card = "onbellek";

  // ---- G/Ç register'ları: FF30..FF37
  b.block = "G/Ç çözme";
  const dec: Record<string, string> = { "~E": "~IO", "~EQ": "~C_CSEL" };
  const want = [0, 1, 1, 0, 0]; // A7..A3 = 00110 → FF30..FF37
  range(8).forEach((i) => {
    dec[`P${i}`] = i < 5 ? `A${i + 3}` : "GND";
    dec[`Q${i}`] = i < 5 && want[i] ? "VCC" : "GND";
  });
  b.place("74HC688", dec, "önbellek register'ları: FF30..FF37");
  b.place("74HC139", {
    "~1E": "~C_CSEL", "1A0": "A1", "1A1": "A2", "~1Y0": "~CS_HITS", "~1Y1": "~CS_MISS", "~1Y2": "~CS_CTRL",
    "~2E": "VCC", "2A0": "GND", "2A1": "GND",
  }, "FF30 isabet, FF32 ıskalama, FF34 CACHE_CTRL");

  // ---- durum flip-flop'ları
  b.block = "Bekleme ve sıralama";
  b.not("~MRD", "C_MRD", "okuma");
  b.not("~WAIT", "C_WAITING", "bekleme sürüyor");
  b.not("TCLK", "~C_TCLK", "TCLK tersi");
  b.not("PA19", "C_FLASH", "Flash / boş bölge (PA19 = 0)");
  b.place("74HC74", {
    "1D": "C_WAITING", "1CLK": "TCLK", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "C_CA", "~1Q": "~C_CA",
    "2D": b.and("C_CA", "C_WAITING", "C_CBD", "ikinci bekleme turu"), "2CLK": "TCLK", "~2PRE": "VCC", "~2CLR": "~RESET",
    "2Q": "C_CB", "~2Q": "~C_CB",
  }, "bekleme sayacı: CA (t = 6), CB (t = 14)");
  b.place("74HC74", {
    "1D": "GND", "1CLK": "CLK", "~1PRE": "~MWE_E", "~1CLR": "~RESET", "1Q": "C_WRL_E",
    "2D": "GND", "2CLK": "CLK", "~2PRE": "~MWE_O", "~2CLR": "~RESET", "2Q": "C_WRL_O",
  }, "yazma bayrakları: CPU darbesiyle kurulur, CLK↑ ile silinir");
  b.or("C_WRL_E", "C_WRL_O", "C_WRL", "bu adım yazma");
  b.and("C_WRL", b.and("C_HIT", "C_FLASH", undefined, "Flash bölgesinde isabet"), "C_INVD", "satır geçersiz kılınacak");
  b.place("74HC74", {
    "1D": "C_CB", "1CLK": "~C_TCLK", "~1PRE": "VCC", "~1CLR": "~RESET", "1Q": "C_CBF", "~1Q": "~C_CBF",
    "2D": "C_INVD", "2CLK": "TCLK", "~2PRE": "VCC", "~2CLR": "~RESET", "2Q": "C_INVL",
  }, "CBF (TCLK↓): yazma evresi sonu; INVL: geçersiz kılma");

  // bekleme isteği
  b.nand("C_EN", "C_HIT", "~C_ENHIT", "etkin isabet değil");
  b.not("~C_ENHIT", "C_ENHIT", "etkin isabet");
  const rdMiss = b.and("C_MRD", "~C_ENHIT", "C_RDMISS", "ıskalama ya da önbellek kapalı");
  // CLK düşükken: reset'ten sonraki ilk F'ye kadar ~MRD tanımsızdır (kontrol register'ı henüz
  // yüklenmedi); R'den sonra da istek kalkar, bir sonraki adıma taşmaz
  b.not("CLK", "~C_CLK", "adımın ikinci yarısı");
  const memNow = b.and("~IO", "~C_CLK", "C_MEMNOW", "bellek adresi, adımın ikinci yarısı");
  b.and(memNow, b.or("C_WRL", rdMiss, undefined, "ana belleğe erişim"), "C_NEED", "ana belleğe erişim");
  b.nand(b.or("C_NEED", "C_CA", undefined, "bekleme"), "~C_CB", "~WAIT", "bekleme isteği (iki tur)");

  // etiket/veri yazma evresi [14, 18)
  const tagph = b.and(b.and("TCLK", "C_CB", undefined, "yazma evresi"), "~C_CBF", "C_TAGPH", "yazma evresi [14, 18)");
  const fill = b.and(tagph, b.and("C_MRD", "C_EN", undefined, "doldurma"), "C_FILL", "satırı doldur");
  b.or(fill, b.and(tagph, "C_INVL", undefined, "geçersiz kıl"), "C_TAGWR", "etiket yazma");
  const snp = b.and(tagph, b.and("C_HIT", "PA19", undefined, "RAM'de isabet"), "C_SNP", "gözetleme: RAM'e yazma isabeti");
  b.nor(fill, b.and(snp, "C_WRL_E", undefined, "çift bayt güncelle"), "~C_CWE_E", "veri belleği yazma (çift)");
  b.nor(fill, b.and(snp, "C_WRL_O", undefined, "tek bayt güncelle"), "~C_CWE_O", "veri belleği yazma (tek)");
  // isabette okuma: veri SRAM'i veri yolunu sürer
  b.nand(b.and(b.and("~IO", "C_MRD", undefined, "bellek okuma"), "C_ENHIT", undefined, "isabetli okuma"), "~C_CA", "~C_HITRD", "isabetli okuma (aktif düşük)");

  // ---- etiket belleği
  b.block = "Etiket belleği";
  // reset temizleme: CLRS reset'te hemen 1, reset bitince OSC↑ ile 0
  const ctrl = b.place("74HC74", {
    "1D": "GND", "1CLK": "OSC", "~1PRE": "~RESET", "~1CLR": "VCC", "1Q": "C_CLRS", "~1Q": "~C_CLRS",
    "2D": "DE0", "2CLK": b.or("~MWE_E", "~CS_CTRL", "C_ENCK", "CACHE_CTRL yazma kenarı"), "~2PRE": "~RESET", "~2CLR": "VCC", "2Q": "C_EN",
  }, "CLRS: reset temizleme (OSC'ye eşzamanlı); EN: CACHE_CTRL bit0");
  const cc = range(12).map((i) => `C_CC${i}`);
  range(3).forEach((j) => {
    const conn: Record<string, string> = {
      "~MR": "C_CLRS", CP: "OSC", CEP: "VCC", CET: j === 0 ? "VCC" : `C_TC${j - 1}`, "~PE": "VCC", TC: `C_TC${j}`,
    };
    range(4).forEach((i) => {
      conn[`D${i}`] = "GND";
      conn[`Q${i}`] = cc[4 * j + i];
    });
    b.place("74HC161", conn, `temizleme sayacı (bit ${4 * j}..${4 * j + 3})`);
  });
  range(3).forEach((j) => {
    const conn: Record<string, string> = { S: "C_CLRS", "~E": "GND" };
    for (let u = 1; u <= 4; u++) {
      const i = 4 * j + u - 1;
      conn[`${u}I0`] = i < 10 ? `A${i + 1}` : "GND";
      conn[`${u}I1`] = i < 10 ? cc[i] : "GND";
      if (i < 10) conn[`${u}Y`] = `C_TA${i}`;
    }
    b.place("74HC157", conn, `etiket adresi: satır (A${4 * j + 1}..) ya da temizleme sayacı`);
  });
  b.nor("OSC", "~C_CLRS", "C_CLRWE", "temizleme yazma darbesi (OSC düşükken)");
  b.nor("C_TAGWR", "C_CLRWE", "~C_TWE", "etiket belleği ~WE");
  b.and("C_MRD", "~C_CLRS", "C_VNEW", "yazılan satır geçerli mi (doldurmada 1)");
  const tagSram = (half: number) => {
    const conn: Record<string, string> = { "~CE": "GND", "~OE": "GND", "~WE": "~C_TWE" };
    range(15).forEach((i) => (conn[`A${i}`] = i < 10 ? `C_TA${i}` : "GND"));
    range(8).forEach((i) => (conn[`IO${i}`] = `C_TD${8 * half + i}`));
    return b.place("62256", conn, half ? "etiket belleği: PA19, geçerli" : "etiket belleği: A11..A13, PA14..PA18");
  };
  const tagLo = tagSram(0);
  const tagHi = tagSram(1);
  const newTag = ["A11", "A12", "A13", "PA14", "PA15", "PA16", "PA17", "PA18", "PA19", "C_VNEW", "GND", "GND", "GND", "GND", "GND", "GND"];
  range(2).forEach((h) => {
    const conn: Record<string, string> = { "~OE1": "~C_TWE", "~OE2": "GND" };
    range(8).forEach((i) => {
      conn[`A${i}`] = newTag[8 * h + i];
      conn[`Y${i}`] = `C_TD${8 * h + i}`;
    });
    b.place("74HC541", conn, h ? "yeni etiket → etiket belleği (PA19, geçerli)" : "yeni etiket → etiket belleği (A11..PA18)");
  });
  const cmpLo: Record<string, string> = { "~E": "GND", "~EQ": "~C_TEQ_LO" };
  const cmpHi: Record<string, string> = { "~E": "C_CLRS", "~EQ": "~C_TEQ_HI" };
  range(8).forEach((i) => {
    cmpLo[`P${i}`] = `C_TD${i}`;
    cmpLo[`Q${i}`] = newTag[i];
    cmpHi[`P${i}`] = `C_TD${8 + i}`;
    cmpHi[`Q${i}`] = i === 1 ? "VCC" : newTag[8 + i];
  });
  b.place("74HC688", cmpLo, "etiket karşılaştırma (A11..PA18)");
  b.place("74HC688", cmpHi, "etiket karşılaştırma (PA19, geçerli = 1); temizlemede kapalı");
  b.nor("~C_TEQ_LO", "~C_TEQ_HI", "C_HIT", "isabet");

  // ---- veri belleği
  b.block = "Veri belleği";
  const dataSram = (lane: "DE" | "DO", we: string) => {
    const conn: Record<string, string> = { "~CE": "GND", "~OE": "~C_HITRD", "~WE": we };
    range(15).forEach((i) => (conn[`A${i}`] = i < 10 ? `A${i + 1}` : "GND"));
    range(8).forEach((i) => (conn[`IO${i}`] = `${lane}${i}`));
    return b.place("62256", conn, `veri belleği: ${lane === "DE" ? "çift" : "tek"} baytlar`);
  };
  const dataEven = dataSram("DE", "~C_CWE_E");
  const dataOdd = dataSram("DO", "~C_CWE_O");

  // ---- sayaçlar ve CACHE_CTRL geri okuma
  b.block = "Sayaçlar";
  b.and("~RESET", b.or("~MWE_E", "~CS_HITS", undefined, "FF30 yazma"), "~C_CNTCLR", "sayaçları sıfırla (FF30 yazma, reset)");
  b.nand("C_MRD", b.and("C_EN", "C_CA", undefined, "ıskalama"), "~C_MISS", "ıskalama sayımı (aktif düşük)");
  b.or("~MRD", "~CS_HITS", "~C_OE_HITS", "FF30/31 okuma");
  b.or("~MRD", "~CS_MISS", "~C_OE_MISS", "FF32/33 okuma");
  const counter = (cec: string | number, oe: string, lane: "DE" | "DO", rco: string | undefined, role: string) => {
    const conn: Record<string, string | number> = { "~MRC": "~C_CNTCLR", CPC: "CLK", "~CEC": cec, CPR: "C_MRD", "~OE": oe };
    if (rco) conn["~RCO"] = rco;
    range(8).forEach((i) => (conn[`Q${i}`] = `${lane}${i}`));
    return b.place("74HC590", conn, role);
  };
  const hitsLo = counter("~C_HITRD", "~C_OE_HITS", "DE", "~C_RCO_H", "isabet sayacı düşük bayt (FF30)");
  const hitsHi = counter(b.or("~C_HITRD", "~C_RCO_H", undefined, "isabet taşması"), "~C_OE_HITS", "DO", undefined, "isabet sayacı yüksek bayt (FF31)");
  const missLo = counter("~C_MISS", "~C_OE_MISS", "DE", "~C_RCO_M", "ıskalama sayacı düşük bayt (FF32)");
  const missHi = counter(b.or("~C_MISS", "~C_RCO_M", undefined, "ıskalama taşması"), "~C_OE_MISS", "DO", undefined, "ıskalama sayacı yüksek bayt (FF33)");
  const rd: Record<string, string> = { "~OE1": "~MRD", "~OE2": "~CS_CTRL" };
  range(8).forEach((i) => {
    rd[`A${i}`] = i === 0 ? "C_EN" : "GND";
    rd[`Y${i}`] = `DE${i}`;
  });
  b.place("74HC541", rd, "CACHE_CTRL geri okuma (FF34)");

  return { tagLo, tagHi, dataEven, dataOdd, hitsLo, hitsHi, missLo, missHi, ctrl };
}
