// Bütün bilgisayarın mimari diyagramı: yedi kart (çerçeveler), her kartın ana birimleri (kutular) ve
// kartları birbirine bağlayan 64 hatlı arka panel. Arka paneldeki her hat bütün yuvalardan geçer;
// diyagramda hatlar işlevlerine göre şeritlere toplanır (adres, veri, bellek denetimi, saat …) ve
// her kart kullandığı şeride bir kolla bağlanır: ok, kartın o şeritteki sinyallerden en az birini
// sürdüğünü (şeride doğru) ya da okuduğunu (karta doğru) gösterir. Testler her kolun yönünü
// netlistteki sürücü ve okuyucu pinlerle, her kartın bağlandığı şeritleri de devreden hesaplanan
// kullanımla karşılaştırır (cpu16/tests/mimari.test.ts).
// Kartlar: board/machine-board.ts; arka panel pinleri: board/passives.ts (BACKPLANE).

import type { Board } from "../board/board.ts";
import { netDizisi, type BlokKimligi, type Diyagram, type Grup, type Kutu, type Yol, type YolUcu } from "./model.ts";

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

const SERITLER: Serit[] = [
  {
    id: "pa", tur: "adres", ad: "BANK ADRESİ", etiket: "PA14–PA19 (6)", y: BANT_Y + 50, netler: netDizisi("PA", 6, 14),
    aciklama: "Bellek kartının bank register'larından fiziksel adresin üst 6 biti: 16 bitlik CPU adresinin üst iki biti (A15, A14) dört bank register'ından birini seçer, register'daki 6 bit adresin yerine geçer. Önbellek, etiketinde bu bitleri de tutar.",
    uclar: [{ kutu: "bellek", yon: "cikis" }, { kutu: "onbellek", yon: "giris" }],
  },
  {
    id: "bekleme", tur: "kontrol", ad: "BEKLEME", etiket: "~WAIT", y: BANT_Y + 72, netler: ["~WAIT"],
    aciklama: "Önbellek ıskaladığında CPU'yu bekletir: saat kartı bekleme durumuna geçer, bellek kartı bayt sıralamasını uzatır. Hat açık-akaç gibi çekme dirençlidir; kimse istemezse CPU beklemez.",
    uclar: [{ kutu: "onbellek", yon: "cikis" }, { kutu: "clk", yon: "giris" }, { kutu: "bellek", yon: "giris" }],
  },
  {
    id: "saat", tur: "saat", ad: "SAAT VE RESET", kisaAd: "SAAT", etiket: "CLK, WR_WIN, TCLK, OSC, ~RESET", y: BANT_Y + 96, netler: ["CLK", "WR_WIN", "TCLK", "OSC", "~RESET"],
    aciklama: "Saat kartından: CPU saati (CLK), yazma penceresi (WR_WIN, CPU'nun yazma darbesini sınırlar), saatin dört katı hızda zamanlama saati (TCLK: bayt sıralayıcı, önbellek, UART ve zamanlayıcı), osilatörün kendisi (OSC: önbellek temizleme) ve ~RESET.",
    uclar: [{ kutu: "clk", yon: "cikis" }, { kutu: "cpu", yon: "giris" }, { kutu: "bellek", yon: "giris" }, { kutu: "onbellek", yon: "giris" }, { kutu: "gc", yon: "giris" }, { kutu: "video", yon: "giris" }],
  },
  {
    id: "adres", tur: "adres", ad: "ADRES YOLU", etiket: "A0–A15 (16 BİT)", y: BANT_Y + 124, netler: netDizisi("A", 16),
    aciklama: "CPU'nun MAR register'ından 16 bitlik adres. Bellek kartı üst bitleri bank register'larıyla fiziksel adrese çevirir; G/Ç kartları (FFxx alanı) düşük baytı çözer.",
    uclar: [{ kutu: "cpu", yon: "cikis" }, { kutu: "bellek", yon: "giris" }, { kutu: "onbellek", yon: "giris" }, { kutu: "gc", yon: "giris" }, { kutu: "video", yon: "giris" }, { kutu: "kyb", yon: "giris" }],
  },
  {
    id: "veri", tur: "veri", ad: "VERİ YOLU", etiket: "DE0–DE7, DO0–DO7 (16 BİT)", y: BANT_Y + 154, netler: [...netDizisi("DE", 8), ...netDizisi("DO", 8)],
    aciklama: "İki 8 bitlik bayt hattı: DE çift adresli, DO tek adresli bayt. CPU yazarken sürer, okurken seçilen kart (bellek, önbellek, G/Ç register'ları) sürer.",
    uclar: [{ kutu: "cpu", yon: "iki" }, { kutu: "bellek", yon: "iki" }, { kutu: "onbellek", yon: "iki" }, { kutu: "gc", yon: "iki" }, { kutu: "video", yon: "iki" }, { kutu: "kyb", yon: "iki" }],
  },
  {
    id: "denetim", tur: "kontrol", ad: "BELLEK DENETİMİ", etiket: "~MRD, ~MWE_E, ~MWE_O", y: BANT_Y + 182, netler: ["~MRD", "~MWE_E", "~MWE_O"],
    aciklama: "CPU'nun bellek okuma (~MRD) ve çift / tek bayt yazma darbeleri (~MWE_E, ~MWE_O). Bellek ve G/Ç kartları seçiliyse bunlarla okur ve yazar.",
    uclar: [{ kutu: "cpu", yon: "cikis" }, { kutu: "bellek", yon: "giris" }, { kutu: "onbellek", yon: "giris" }, { kutu: "gc", yon: "giris" }, { kutu: "video", yon: "giris" }, { kutu: "kyb", yon: "giris" }],
  },
  {
    id: "io", tur: "kontrol", ad: "G/Ç ALANI", etiket: "~IO", y: BANT_Y + 206, netler: ["~IO"],
    aciklama: "Bellek kartının adres çözücüsü: adresin üst baytı FF ise (FF00–FFFF) erişim belleğe değil G/Ç kartlarına gider; ~IO düşükken her G/Ç kartı kendi adres grubunu çözer.",
    uclar: [{ kutu: "bellek", yon: "cikis" }, { kutu: "onbellek", yon: "giris" }, { kutu: "gc", yon: "giris" }, { kutu: "video", yon: "giris" }, { kutu: "kyb", yon: "giris" }],
  },
  {
    id: "kesme", tur: "kontrol", ad: "KESME", etiket: "IRQ, VSYNC_REQ", y: BANT_Y + 228, netler: ["IRQ", "VSYNC_REQ"],
    aciklama: "Video kartı her kare sonunda VSYNC_REQ ister; G/Ç kartının kesme denetleyicisi bunu UART, klavye ve zamanlayıcının istekleriyle maskeleyip CPU'ya tek IRQ hattı olarak verir.",
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

export function makineDiyagrami(board: Board): Diyagram {
  const kutu = (k: Omit<Kutu, "aciklama"> & { aciklama?: string }): Kutu => ({ aciklama: "", ...k });
  // ---- kartlar ve birimleri
  const kutular: Kutu[] = [
    // SAAT VE RESET
    kutu({
      id: "clk-osc", ad: "OSİLATÖR VE RESET", rol: "kontrol", ...yer("clk", 0, 0), bloklar: b("clk", "Osilatör ve reset"),
      gorev: "kristal ya da yavaş saat; RESET, ADIM",
      aciklama: "Kristal osilatör (CPU saatinin 8 katı) ya da potansiyometreyle ayarlanan yavaş RC osilatörü. RESET ve ADIM butonları Schmitt tetikleyiciden (74HC14) geçer; anahtarlar otomatik / adım ve hızlı / yavaş kiplerini seçer.",
    }),
    kutu({
      id: "clk-uretim", ad: "SAAT ÜRETİMİ VE DAĞITIMI", rol: "register", ...yer("clk", 0, 1), bloklar: b("clk", "Saat üretimi", "Bekleme durumu", "Saat dağıtımı"),
      gorev: "CLK, WR_WIN, TCLK; adım ve bekleme",
      aciklama: "Johnson sayacı (74HC175) osilatörü sekize bölerek CLK'yı, yazma penceresini (WR_WIN) ve dört kat hızlı TCLK'yı üretir. Adım kipinde ADIM butonu bir tam saat döngüsüne izin verir; ~WAIT düşükken saat bekleme durumunda tutulur. Bir 74HC541 saatleri ve reseti arka panele sürer; CLK LED'i saati gösterir.",
    }),
    // CPU
    kutu({
      id: "cpu-reg", ad: "REGISTER'LAR VE SABİT BİRİMİ", rol: "register", ...yer("cpu", 0, 0), ayrinti: "cpu",
      bloklar: b("cpu", "Register dosyası", "Geçici register'lar", "Program sayacı", "MAR ve IR", "Sabit birimi"),
      gorev: "R0–R7, TA, TB, PC, MAR, IR, sabitler",
      aciklama: "CPU'nun bütün register'ları: sekiz genel register, ALU'nun iki geçici register'ı, program sayacı, bellek adres register'ı (MAR, adres yolunu sürer), komut register'ı (IR) ve komuttaki sabitleri 16 bite genişleten sabit birimi. Hepsi kartın tek 16 bitlik iç veri yoluna bağlıdır.",
    }),
    kutu({
      id: "cpu-alu", ad: "ALU VE BAYRAKLAR", rol: "islem", ...yer("cpu", 1, 0), ayrinti: "cpu",
      bloklar: b("cpu", "ALU kod çözücü", "ALU", "Bayraklar ve koşul"),
      gorev: "16 bit aritmetik ve mantık; N Z C V",
      aciklama: "16 bitlik ALU (toplayıcı, mantık tabloları, kaydırıcı), işlem kodunu ALU denetim bitlerine çeviren kod çözücü, N Z C V ve I bayrakları ve dallanma koşulu.",
    }),
    kutu({
      id: "cpu-kontrol", ad: "KONTROL BİRİMİ", rol: "kontrol", ...yer("cpu", 0, 1), ayrinti: "cpu",
      bloklar: b("cpu", "Kontrol birimi", "Kontrol"),
      gorev: "mikrokod: 32 kontrol hattı",
      aciklama: "Komut, adım sayacı ve koşuldan 32 kontrol hattını üreten mikrokod devresi (ROM yok: kod çözücüler, seçiciler ve kapılar), kontrol register'ı, kesme ve HALT mantığı.",
    }),
    kutu({
      id: "cpu-bellek", ad: "BELLEK ARAYÜZÜ", rol: "tampon", ...yer("cpu", 1, 1), ayrinti: "cpu",
      bloklar: b("cpu", "Bellek arayüzü"),
      gorev: "iç veri yolu ↔ DE, DO; okuma / yazma darbeleri",
      aciklama: "İç veri yolunu arka paneldeki iki bayt hattına bağlayan alıcı-vericiler; bellek okuma ve yazma darbelerini üretir.",
    }),
    // BELLEK
    kutu({
      id: "bellek-cozme", ad: "ADRES ÇÖZME", rol: "secici", ...yer("bellek", 0, 0), bloklar: b("bellek", "Adres çözme"),
      gorev: "G/Ç alanı (~IO), bank register'ları, çip seçimi",
      aciklama: "Adresin üst baytı FF ise erişimi G/Ç kartlarına bırakır (~IO). Bank register'larını (FF10–FF13) ve fiziksel adresin üst bitlerinden EEPROM ya da RAM çiplerinden birini seçer.",
    }),
    kutu({
      id: "bellek-bank", ad: "BANK REGISTER'LARI", rol: "register", ...yer("bellek", 1, 0), bloklar: b("bellek", "Bank register'ları"),
      gorev: "16 bit adres → 20 bit fiziksel adres",
      aciklama: "Dört bank register'ı (BANK0–BANK3, 6'şar bit): adresin üst iki biti birini seçer ve fiziksel adresin PA14–PA19 bitleri olur. Böylece 64 KB'lık adres alanında 1 MB fiziksel bellek kullanılabilir. Register'lar G/Ç alanından yazılıp okunur.",
    }),
    kutu({
      id: "bellek-sira", ad: "BAYT SIRALAYICI", rol: "tampon", ...yer("bellek", 0, 1), bloklar: b("bellek", "Bayt sıralayıcı", "Veri yolu"),
      gorev: "16 bitlik erişim, 8 bitlik çipler",
      aciklama: "Bellek çipleri 8 bitlik: bir kelime erişimi iki bayta bölünür. Sıralayıcı TCLK ile önce çift, sonra tek baytı okur ya da yazar; çift baytı bir mandalda tutar. DE ve DO hatlarında çekme dirençleri var.",
    }),
    kutu({
      id: "bellek-cip", ad: "EEPROM VE RAM", rol: "bellek", ...yer("bellek", 1, 1), bloklar: b("bellek", "EEPROM ve RAM"),
      gorev: "32 KB EEPROM (BIOS), 4 × 32 KB RAM",
      aciklama: "28C256 EEPROM (BIOS ve kullanıcı programı) ve dört 62256 statik RAM: toplam 160 KB fiziksel bellek.",
    }),
    // ÖNBELLEK
    kutu({
      id: "onbellek-sira", ad: "G/Ç ÇÖZME VE SIRALAMA", rol: "kontrol", ...yer("onbellek", 0, 0), bloklar: b("onbellek", "G/Ç çözme", "Bekleme ve sıralama"),
      gorev: "isabette beklemesiz; ıskalamada ~WAIT",
      aciklama: "Önbellek register'larını (FF30–FF37) çözer. Okuma ıskalarsa ~WAIT ile CPU'yu bekletir, bellek kartı veriyi getirirken satırı doldurur; isabette CPU beklemez.",
    }),
    kutu({
      id: "onbellek-etiket", ad: "ETİKET BELLEĞİ", rol: "bellek", ...yer("onbellek", 1, 0), bloklar: b("onbellek", "Etiket belleği"),
      gorev: "satır başına etiket ve geçerli biti",
      aciklama: "Her önbellek satırının hangi fiziksel adresi tuttuğu (etiket: A11–A13, PA14–PA19) ve geçerli biti. 74HC688 karşılaştırıcılar isabeti bulur; resetten sonra sayaç bütün satırları geçersiz yapar.",
    }),
    kutu({
      id: "onbellek-veri", ad: "VERİ BELLEĞİ", rol: "bellek", ...yer("onbellek", 0, 1), bloklar: b("onbellek", "Veri belleği"),
      gorev: "önbelleğe alınmış kelimeler",
      aciklama: "Önbellekteki veriler: iki 62256, biri çift biri tek baytlar için.",
    }),
    kutu({
      id: "onbellek-sayac", ad: "SAYAÇLAR", rol: "register", ...yer("onbellek", 1, 1), bloklar: b("onbellek", "Sayaçlar"),
      gorev: "isabet ve ıskalama sayaçları (16 bit)",
      aciklama: "İsabet ve ıskalama sayaçları; CPU G/Ç alanından okur (FF30–FF33), önbelleğin ne kadar işe yaradığını ölçer.",
    }),
    // G/Ç
    kutu({
      id: "gc-cozme", ad: "ADRES ÇÖZME", rol: "secici", ...yer("gc", 0, 0), bloklar: b("gc", "Adres çözme", "Okuma yan etkileri"),
      gorev: "FF00–FF0B register'ları",
      aciklama: "G/Ç kartının register'larını (FF00–FF0B) çözer: okuma seçimi, çift ve tek bayt yazma darbeleri. Bazı register'ları okumak bayrak siler (RX_READY, klavye READY): bu yan etki bir sonraki döngüde uygulanır.",
    }),
    kutu({
      id: "gc-zaman", ad: "ZAMANLAYICI", rol: "register", ...yer("gc", 1, 0), bloklar: b("gc", "Zamanlayıcı"),
      gorev: "1 kHz tık, 16 bit geri sayıcı",
      aciklama: "TCLK'dan 1 kHz ön bölücü ve 16 bitlik yeniden yüklemeli sayaç; süre dolunca kesme isteği.",
    }),
    kutu({
      id: "gc-kesme", ad: "KESME DENETLEYİCİSİ", rol: "kontrol", ...yer("gc", 2, 0), bloklar: b("gc", "Kesme denetleyicisi"),
      gorev: "istekleri maskele → IRQ",
      aciklama: "UART, klavye, zamanlayıcı ve video (VSYNC_REQ) isteklerini maske register'ıyla süzer, CPU'ya tek IRQ hattı verir; kaynak ve bekleyen istekler okunabilir.",
    }),
    kutu({
      id: "gc-uart", ad: "UART", rol: "gc", ...yer("gc", 0, 1), bloklar: b("gc", "UART verici", "UART alıcı", "UART konnektörü"),
      gorev: "seri port (8N1)",
      aciklama: "Seri port: verici kaydırma register'ı (74HC165) ve alıcı (74HC595), ikisi de 74HC161 bit bölücüleriyle. Kartın üstündeki CH340 modülü USB üzerinden bilgisayara bağlanır.",
    }),
    kutu({
      id: "gc-ps2", ad: "PS/2 KLAVYE", rol: "gc", ...yer("gc", 1, 1), bloklar: b("gc", "PS/2 klavye", "Sinyal düzeltme"),
      gorev: "klavyeden tarama kodları",
      aciklama: "PS/2 klavyenin saat ve veri hatları Schmitt tetikleyiciden (74HC14) geçer; 11 bitlik çerçeve kaydırma register'ında toplanır. Bayt okunana kadar saat hattı aşağı çekilir (klavye bekler).",
    }),
    kutu({
      id: "gc-durum", ad: "DURUM REGISTER'LARI", rol: "register", ...yer("gc", 2, 1), bloklar: b("gc", "Durum register'ları"),
      gorev: "UART ve klavye durumu",
      aciklama: "UART_STAT (RX_READY, TX_EMPTY) ve KBD_STAT (READY) register'ları.",
    }),
    // VİDEO
    kutu({
      id: "video-cpu", ad: "CPU ARAYÜZÜ", rol: "tampon", ...yer("video", 0, 0), bloklar: b("video", "Adres çözme", "CPU arayüzü"),
      gorev: "FF20–FF26; VRAM'e yazma, okuma",
      aciklama: "Video register'larını (FF20–FF26) çözer. CPU, VRAM'e doğrudan değil VADDR / VDATA register'larıyla erişir: istek, taramanın boş yuvasında yapılır.",
    }),
    kutu({
      id: "video-zaman", ad: "TARAMA ZAMANLAMASI", rol: "kontrol", ...yer("video", 1, 0), bloklar: b("video", "Piksel saati ve sayaçlar", "Çözümleme", "Dikey tarama durumu"),
      gorev: "640 × 480, 60 Hz tarama",
      aciklama: "25,175 MHz piksel saati, karakter ve satır sayaçları, senkron sinyallerinin çözümü; her kare sonunda VSYNC_REQ.",
    }),
    kutu({
      id: "video-imlec", ad: "İMLEÇ", rol: "register", ...yer("video", 2, 0), bloklar: b("video", "İmleç"),
      gorev: "imlecin sütunu ve satırı",
      aciklama: "CURSOR_X ve CURSOR_Y register'ları (FF24, FF25); piksel yolu imleci bu karakterde yanıp söndürür.",
    }),
    kutu({
      id: "video-dac", ad: "RENK VE DAC", rol: "gc", ...yer("video", 0, 1), bloklar: b("video", "Renk ve DAC"),
      gorev: "IRGB → analog VGA",
      aciklama: "Yazı ya da zemin renginin 4 bitini (IRGB) seçer; dirençli DAC bunları VGA'nın analog kırmızı, yeşil, mavi seviyelerine çevirir.",
    }),
    kutu({
      id: "video-piksel", ad: "PİKSEL YOLU", rol: "islem", ...yer("video", 1, 1), bloklar: b("video", "Piksel yolu"),
      gorev: "karakter ROM'u → piksel kaydırıcı",
      aciklama: "Karakter kodu ve renk baytı VRAM'den alınır; karakter ROM'u (28C256) font satırını verir, 74HC166 pikselleri kaydırır. Senkronlar ve imleç aynı karakter sınırına hizalanır.",
    }),
    kutu({
      id: "video-vram", ad: "VRAM", rol: "bellek", ...yer("video", 2, 1), bloklar: b("video", "VRAM", "Tarama adresi"),
      gorev: "80 × 30 karakter ve renkleri",
      aciklama: "İki 62256: karakter ve renk şeritleri. Adres seçici VRAM'i ya taramaya ya da CPU arayüzüne verir; tarama adresi satır başından sayılır.",
    }),
    // KENDİN YAP BELLEK
    kutu({
      id: "kyb-cozme", ad: "ADRES ÇÖZME", rol: "secici", ...yer("kyb", 0, 0), bloklar: b("kyb", "Adres çözme"),
      gorev: "FF40–FF4F",
      aciklama: "Kartın adres grubunu (FF4x) ve 8 kelimeden hangisinin okunup yazılacağını çözer.",
    }),
    kutu({
      id: "kyb-tampon", ad: "VERİYOLU TAMPONU", rol: "tampon", ...yer("kyb", 0, 1), bloklar: b("kyb", "Veriyolu tamponu"),
      gorev: "DE, DO ↔ kart içi bayt hatları",
      aciklama: "İki 74HC245: kart seçiliyken arka panelin bayt hatlarını kartın içine bağlar.",
    }),
    kutu({
      id: "kyb-hucre", ad: "BELLEK HÜCRELERİ", rol: "register", ...yer("kyb", 0, 2), bloklar: b("kyb", "Bellek hücreleri"),
      gorev: "16 bayt (8 kelime), 74HC574'lerle",
      aciklama: "Belleğin en yalın hâli: her bayt bir 74HC574. Kendin yap bellek kartı, bir RAM çipinin içinde olanı açıkça gösterir.",
    }),
    // DIŞ CİHAZLAR
    kutu({ id: "pc", ad: "BİLGİSAYAR", rol: "gc", cihaz: true, ...altinda("gc", 0), bloklar: [], gorev: "USB üzerinden seri terminal", aciklama: "Seri terminal: CH340 modülü USB'de bir seri port olarak görünür." }),
    kutu({ id: "klavye", ad: "PS/2 KLAVYE", rol: "gc", cihaz: true, ...altinda("gc", 1), bloklar: [], gorev: "tarama kodları", aciklama: "PS/2 klavye: her tuş basışı ve bırakışı bir tarama kodu gönderir." }),
    kutu({ id: "monitor", ad: "VGA MONİTÖR", rol: "gc", cihaz: true, ...altinda("video", 0), bloklar: [], gorev: "640 × 480, 60 Hz", aciklama: "VGA monitörü: analog RGB ve iki senkron sinyali." }),
  ];

  const kartAdlari: Record<string, string> = {
    clk: "Saat ve reset", cpu: "CPU", bellek: "Bellek", onbellek: "Önbellek", gc: "G/Ç", video: "Video", kyb: "Kendin yap bellek",
  };
  const kartAciklamasi: Record<string, string> = {
    clk: "Saat ve reset kartı: kristal ya da yavaş osilatör, adım kipi, CPU saati ve zamanlama saatleri, bekleme durumu, reset.",
    cpu: "16 bitlik işlemci: register'lar, ALU, mikrokodlu kontrol birimi ve bellek arayüzü. Ayrıntısı CPU16 işlemci kartı diyagramında.",
    bellek: "Bellek kartı: bank register'larıyla 1 MB fiziksel adres, 32 KB EEPROM ve 128 KB RAM, 16 bitlik erişimi iki bayta bölen sıralayıcı; G/Ç alanını (~IO) da bu kart çözer.",
    onbellek: "Önbellek kartı: doğrudan eşlemeli önbellek; etiket ve veri belleği, ıskalamada bekleme, isabet ve ıskalama sayaçları.",
    gc: "G/Ç kartı: UART (USB-seri), PS/2 klavye, zamanlayıcı ve kesme denetleyicisi.",
    video: "Video kartı: 80 × 30 karakterlik renkli metin ekranı, 640 × 480 VGA çıkışı.",
    kyb: "Kendin yap bellek: 16 baytlık, 74HC574'lerle kurulmuş bir bellek kartı.",
  };
  const gruplar: Grup[] = MAKINE_KARTLARI.map((card) => {
    const { x, y, w, h } = kartCercevesi(card);
    return {
      id: card, ad: card === "clk" || card === "kyb" ? kartAdlari[card] : `${kartAdlari[card]} kartı`, x, y, w, h,
      kutular: kutular.filter((k) => k.bloklar[0]?.card === card).map((k) => k.id),
      bloklar: b(card, "Yapıştırıcı lojik").filter((x) => board.chips.some((c) => c.card === x.card && c.block === x.block)),
      bloklarAdi: "kapı çipi",
      aciklama: kartAciklamasi[card],
      ayrinti: card === "cpu" ? "cpu" : undefined,
    };
  });
  gruplar.push({
    id: "arka", ad: "Arka panel", ek: "64 hat · 7 kart yuvası", sade: true,
    x: 30, y: BANT_Y, w: 1840, h: BANT_H, kutular: [],
    bloklar: MAKINE_KARTLARI.map((card) => ({ card, block: "Besleme ve arka panel" })),
    aciklama: "Kartlar 2 × 32 pinli konnektörlerle aynı arka panele takılır: her hat bütün yuvalardan geçer. 5 V ve GND dışında 51 sinyal hattı kullanılır; şeritler hatları işlevlerine göre toplar. HALTED ve FAULT hatlarını yalnız CPU kartı kullanır (LED).",
  });

  // ---- arka panel şeritleri ve kolları
  const yollar: Yol[] = SERITLER.map((s) => {
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
      id: "usb", tur: "dis", ad: "USB-SERİ", netler: ["UART_TXD", "UART_RXD", "GC_RXRDY"],
      aciklama: "CH340 modülünün kart tarafı: TXD → kartın alıcısı, RXD ← kartın vericisi, CTS# ← RX_READY (alıcı doluyken bilgisayar beklesin). Modül USB ile bilgisayara bağlanır.",
      uclar: [{ kutu: "gc-uart", yon: "iki" }, { kutu: "pc", yon: "iki" }],
      kollar: disBag("gc-uart").kollar,
      etiketler: etiket("gc-uart", "USB (TXD, RXD, CTS)"),
    },
    {
      id: "ps2", tur: "dis", ad: "PS/2", netler: ["PS2_CLK", "PS2_DAT"],
      aciklama: "PS/2 saat ve veri hatları (açık-akaç, iki yönlü): klavye saati sürer, kart bayt okunana kadar saati aşağı çekerek klavyeyi bekletir.",
      uclar: [{ kutu: "gc-ps2", yon: "iki" }, { kutu: "klavye", yon: "iki" }],
      kollar: disBag("gc-ps2").kollar,
      etiketler: etiket("gc-ps2", "PS/2 (CLK, DATA)"),
    },
    {
      id: "vga", tur: "dis", ad: "VGA", netler: ["VGA_RED", "VGA_GREEN", "VGA_BLUE", "VGA_HSYNC", "VGA_VSYNC"],
      aciklama: "VGA konnektörü (DE-15): analog kırmızı, yeşil, mavi ve yatay / dikey senkron.",
      uclar: [{ kutu: "video-dac", yon: "cikis" }, { kutu: "monitor", yon: "giris" }],
      kollar: disBag("video-dac").kollar,
      etiketler: etiket("video-dac", "VGA (R, G, B, HSYNC, VSYNC)"),
    },
  );

  const toplam = board.chips.length;
  return {
    id: "makine",
    baslik: "CPU16 bilgisayarı · mimari",
    altBaslik: `7 kart · 64 hatlı arka panel · ${toplam} entegre`,
    aciklama: "Bütün bilgisayar: yedi kart aynı arka panele takılır. CPU adresi ve bellek denetimini sürer; bellek kartı adresi bank register'larıyla fiziksel adrese çevirir ve G/Ç alanını çözer; önbellek ıskalamada CPU'yu bekletir; G/Ç ve video kartları FFxx alanındaki register'larla konuşur. Kartların içindeki ayrıntı (CPU için) ayrı diyagramda.",
    genislik: 1900,
    yukseklik: CIHAZ_Y + 144 + 20,
    kutular,
    gruplar,
    yollar,
    lejant: {
      x: 1030, y: CIHAZ_Y, w: 840, h: 144,
      kisaltmalar: [
        ["~IO", "G/Ç alanı seçimi (FFxx)"],
        ["~WAIT", "Bekleme isteği"],
        ["PA", "Fiziksel adresin üst bitleri"],
        ["TCLK", "Zamanlama saati (4 × CLK)"],
        ["DE, DO", "Çift / tek adresli bayt"],
      ],
    },
  };
}
