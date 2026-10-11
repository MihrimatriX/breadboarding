# Anakart G/Ç ve video kartları (kapı seviyesi)

> Faz 6 anakartının G/Ç tarafı, yalnız kütüphanedeki çiplerle: **G/Ç kartı** (`gc`: UART, PS/2
> klavye, zamanlayıcı, kesme denetleyicisi; `board/io-card.ts`) ve **video kartı** (`video`:
> 80 × 30 metin, VGA 640 × 480; `board/video-card.ts`). Davranış modeli `emu/machine.ts` ve
> `emu/devices/*.ts`, register haritası ve yazılım arayüzü [anakart.md](anakart.md).
> Testler: `tests/anakart-gc.test.ts`.

İki kart da arka panele takılır ve yalnız arka paneldeki ortak sinyalleri kullanır: CLK, WR_WIN
(yazma darbesi olarak ~MWE_E / ~MWE_O içinde), ~RESET, A0..A7, DE0..7 (çift bayt şeridi),
DO0..7 (tek bayt şeridi), ~MRD, ~MWE_E, ~MWE_O, ~IO (bellek kartı: A15..A8 = FF), TCLK
(G/Ç kartı), IRQ (G/Ç kartı sürer) ve VSYNC_REQ (video kartı sürer, G/Ç kartı okur). Her kart
kendi grubunu ~IO ve A7..A4'ten bir 74HC138 ile çözer; DE/DO çekme dirençleri ve
FF10–13 / FF30–34 bellek kartındadır. Kartlar hiçbir zaman bekleme durumu istemez.

## Veriyolu döngüsü (kartların gördüğü)

| Olay | Zaman (k = erişim döngüsü, TCLK'nin k. yükselen kenarında başlar) |
|---|---|
| adres, ~IO, ~MRD geçerli | kenar k'dan hemen sonra, döngü boyunca |
| yazma darbesi ~MWE_E / ~MWE_O | k + 5/8 … k + 7/8 (WR_WIN); register'lar darbenin sonunda yüklenir |
| okunan veri CPU'ya | kenar k + 1 |
| okuma yan etkisi (UART_DATA, KBD_DATA, VDATA; yalnız A0 = 0) | kenar k + 1'de bir flip-flop'a yakalanır, k + 1 döngüsünde uygulanır |

Kelime erişimi tek döngüdür (A0 = 0, iki şerit birlikte). Machine'in zaman kuralıyla aynıdır:
Machine'de E anındaki bir olay, C ≥ E döngüsündeki erişimde görünür; kartta TCLK'nin E. kenarında
değişen bir durum k ≥ E döngüsündeki okumada (veri k + 1'de alınır) ve IRQ'da görünür.

## G/Ç kartı (`gc`)

### Blok → çip

| Blok | Çipler |
|---|---|
| Adres çözme | 74HC138 ×4 (grup FF0x; okuma, çift yazma, tek yazma çiftleri) |
| Okuma yan etkileri | 74HC74 (UART_DATA / KBD_DATA okundu: bir döngülük darbe) |
| Sinyal düzeltme | 74HC14 (PS/2 saat ve veri, UART RX Schmitt tetikleyicileri) |
| UART verici | 74HC165 (kaydırma), 74HC161 ×2 (bit bölücü 0..34), 74HC161 (bit sayacı 0..9) |
| UART alıcı | 74HC74 ×2 (iki kademe eşzamanlayıcı, BUSY bayrakları), 74HC161 ×2 (örnek bölücü), 74HC161 (örnek sayacı), 74HC595 (kaydırma + UART_DATA) |
| PS/2 klavye | 74HC161 (kenar sayacı), 74HC595 (kaydırma + KBD_DATA), 74HC05 (saat hattını aşağı çeken açık-akaç) |
| Zamanlayıcı | 74HC161 ×3 (TCLK / 4000 ön bölücü), 74HC574 ×2 (RELOAD), 74HC175 (CTRL), 74HC74 (yeniden yükleme isteği, EXPIRED), 74HC74 (TRL2: yeniden yükleme darbesinin sonu), 74HC193 ×4 (16 bit aşağı sayıcı), 74HC688 ×2 (sayaç = 1), 74HC541 ×4 (geri okuma) |
| Kesme denetleyicisi | 74HC175 (IRQ_MASK, reset 0), 74HC148 (öncelik, IRQ_SRC), 74HC541 ×3 (IRQ_SRC, IRQ_PEND, IRQ_MASK okuma) |
| Durum register'ları | 74HC541 ×2 (UART_STAT, KBD_STAT), 74HC74 (RX_READY, klavye READY) |
| Yapıştırıcı lojik | 74HC08 ×8, 74HC32 ×4, 74HC00 ×3, 74HC02 ×2, 74HC04 ×3 |
| **Toplam** | **65 entegre** + CH340 modülü (6 pin başlık), PS/2 soketi, 10 kΩ ×2, arka panel konnektörü, 100 µF, 100 nF ×65 |

### Zamanlama (hepsi TCLK'den; TCLK = Machine'in `cycles` sayacı)

- **UART TX** (115 200 8N1): bit süresi bölücüden, bit 0–6 için 35, bit 7–9 için 34 döngü:
  7 × 35 + 3 × 34 = **347 = `UART_BYTE_CYCLES`**, ortalama 115 274 baud (+%0,06). Kenarların
  ideal 115 200 baud yerinden en büyük sapması 1,3 döngü (bitin %3,8'i; test %6 sınırıyla
  ölçer). Başlangıç biti yazma darbesiyle (k + 5/8) başlar; `TX_EMPTY` tam k + 347. kenarda 1
  olur (Machine: `txBusyUntil = C + 347`). Meşgulken yazmak çerçeveyi baştan başlatır.
- **UART RX**: hat iki flip-flop ile eşzamanlanır; başlangıç biti görülünce bölücü 19'dan sayar,
  sonra her 35 döngüde bir örnek alınır (başlangıç, 8 veri, bitiş). Örnek anlarının ideal bit
  ortasından sapması −1,4 … +2,2 döngü; testte ±%2 baud hatası sorunsuz alınır. Başlangıç biti
  t döngüsünde düşerse bitiş biti örneğinde (kenar t + 334) bayt UART_DATA'ya geçer ve
  `RX_READY` kurulur. `RX_READY` = RTS# → CH340'ın CTS#'i: köprü bayt okunana kadar sonrakini
  göndermez (taşma yok). Machine'de bir bayt ancak okumadan ≥ 347 döngü sonra hazır olur; bu
  kartta okumadan sonraki döngüde CTS# düşer ve çerçeve 334 döngü sürer, yani Machine'in her
  hazır anı bu kartla elde edilebilir.
- **PS/2**: klavye saati 10–16,7 kHz (Machine: 12,5 kHz, bayt 3520 döngü). Düşen saat
  kenarları sayılır: 1–9. kenarda kaydırma (başlangıç biti dışarı düşer), 10. kenarda bayt
  KBD_DATA'ya, 11. kenarda (bitiş biti) `READY`. `READY` iken 74HC05 saat hattını aşağı çeker
  (inhibit), klavye sonraki baytı bekletir. KBD_DATA okunması sayacı ve `READY`'yi yalnız
  `READY` iken siler (çerçevenin ortasındaki bir okuma onu bozmaz). Eşlik biti denetlenmez
  (Machine de denetlemez).
- **Zamanlayıcı**: ön bölücü 96..4095 sayar (4000 durum); reset süresince 96 yükler, resetten
  sonraki ilk sayma kenarı 1. kenar sayılırsa tıklar 4000k. kenarlardadır (Machine:
  `TICK_CYCLES` katları). Tık kenarında EN ise sayaç bir azalır; sayaç 1 iken azaltmak yerine
  aynı kenarda EXPIRED kurulur ve sayaç RELOAD'dan yeniden yüklenir (Machine: 1 → 0 → RELOAD).
  EN 0 → 1 yazılırken sayaç yazma darbesi içinde RELOAD'u yükler. Yeniden yükleme tık
  kenarından sonraki yarım döngüde asenkron (~PL) yapılır; sayaç dışarıdan okunamadığı için
  bu görünmez ve aynı döngüdeki bir RELOAD yazması Machine'deki gibi sonraki dönemi etkiler.
  EXPIRED: TIMER_STAT'a bit0 = 1 yazmak darbe süresince siler.
- **Kesme**: IRQ_PEND = {EXPIRED ∧ IRQ_EN, klavye READY, RX_READY, VSYNC_REQ}; her biri maskeyle
  NAND'lanıp 74HC148'e girer. ~GS → IRQ (birleşimsel, gecikmesiz). İstek yokken IRQ_SRC tamponu
  sürülmez, DE çekme dirençleri `0xFF` okutur.

## Video kartı (`video`)

### Blok → çip

| Blok | Çipler |
|---|---|
| Adres çözme | 74HC138 ×4 (grup FF2x; okuma, çift yazma, tek yazma çiftleri) |
| Piksel saati ve sayaçlar | 25,175 MHz osilatör (VID_OSC), **74AC161** (piksel fazı p0..p7), **74AC74** (H2 = karakter saati, LD7 = p7), 74HC161 ×2 karakter sayacı (0..99), 74HC161 ×3 dikey (0..524) |
| Çözümleme | 74HC688 (VSYNC: satır 490–491); yazma darbesi p5–p6 = H2 ∧ Q1 (yapıştırıcı, parazitsiz) |
| Dikey tarama durumu | 74HC74 (vblank eşzamanlı, vsync bayrağı = VSYNC_REQ), 74HC393 (kare sayacı, bit 4 imleç yanıp sönmesi), 74HC541 (VSTAT okuma) |
| Tarama adresi | 74HC161 ×3 (MA), 74HC574 ×2 (satır başı) |
| VRAM | 62256 ×2 (karakter / renk şeridi; 4 KB kullanılır, A12–A14 = 0), 74HC157 ×3 (adres: tarama / CPU) |
| Piksel yolu | 74HC574 ×3 (karakter kodu, renk baytı, gösterilen renk baytı), SST39SF010A (4 KB font), 74HC166 (piksel kaydırıcı, eşzamanlı yükleme), 74HC175 ×2 (karartma, senkronlar, imleç: p4'te ön register, p7 → p0'da çıkış), 74HC688 ×2 (imleç sütun / satır) |
| Renk ve DAC | 74HC157 (yazı / zemin rengi, karartmada siyah), kahverengi düzeltmesi (yapıştırıcı), 680 Ω ×3 + 1,3 kΩ ×3, VGA DE-15 |
| CPU arayüzü | 74HC193 ×4 (VADDR, 13 bit kullanılır), 74HC74 ×4 (istekler, eşzamanlayıcılar, VDATA okuma yan etkisi, VCTRL), 74HC574 ×2 (yazma verisi → şerit), 74HC574 ×2 (ön okuma latch'i), 74HC541 (VCTRL okuma) |
| İmleç | 74HC574 ×2 (CURSOR_X / Y), 74HC541 ×2 (geri okuma) |
| Yapıştırıcı lojik | 74HC08 ×8, 74HC32 ×3, 74HC00, 74HC02, 74HC04 ×2, 74HC10 ×2 |
| **Toplam** | **69 entegre** (2'si 74AC) + osilatör, 6 direnç, VGA konnektörü, arka panel konnektörü, 100 µF, 100 nF ×69 |

### Zamanlama

- **Tarama**: satır 800 piksel saati, kare 525 satır; HSYNC ve VSYNC negatif kutuplu. Bir
  karakter 8 piksel saatidir (p0..p7).
- **İki saat alanı**: piksel saatinde (VID_OSC, 39,7 ns) yalnızca faz sayacı (74AC161), H2 / LD7
  register'ı (74AC74) ve piksel kaydırıcı (74HC166) çalışır. Faz sayacı 9..15, 0 diye sayar
  (9..15 = p0..p6, 0 = p7); 0'da Q3 = 0 olduğu için kendi ~PE'siyle yine 9 yükler, çözücü kapı
  gerekmez. Q3 (~LD7) p7'de düşüktür: kaydırıcının yükleme izni ve p7 → p0 kenarında yükselen
  çıkış register'larının saati. H2 = Q2'nin bir piksel gecikmişi (p4..p7), LD7 = TC'nin bir
  piksel gecikmişi (p7). Geri kalan her şey **karakter saatinde** (H2 = piksel / 8, 318 ns):
  karakter sayacı (hc'nin 9..3 bitleri), dikey sayaç, MA, satır başı, CPU istekleri H2'nin
  yükselen kenarında (p4); VBQ ve istek eşzamanlayıcıları düşen kenarında (p0).
- **VRAM yuvaları**: p0..p3 tarama (adres = MA), p4'ün başında karakter kodu ve renk baytı
  tutulur, MA artar; p4..p7 CPU (adres = VADDR[12:1]), bekleyen yazma p5–p6'da ya da ön okuma
  p7'de. Tarama ve CPU hiçbir zaman aynı yuvada değildir: CPU yazması ekranda iz bırakmaz.
- **Ardışık düzen**: H karakteri j'de okunan karakter j'nin sonunda 74HC166'ya yüklenir ve
  j + 1 boyunca çıkar. Karakter sayacı p4'te sayar; p4'te örnekleyen her şey (MA, satır başı,
  ön register) kenardan önceki değeri, yani karakter j'yi görür. Karartma, HSYNC, VSYNC ve imleç
  j'nin p4'ünde ön 74HC175'e, j'nin sonunda (p7 → p0, kaydırıcıyla aynı kenar) çıkış 74HC175'ine
  alınır. Görünür piksel x satırın hc = x + 8 anındadır (hc = 8 × karakter + p); senkronlar da
  aynı yoldan geçtiği için 8 piksel kayar. Görünür alana göre: 640 görünür + 16 ön sundurma +
  96 HSYNC (hc 664..759) + 48 arka sundurma; dikeyde 480 + 10 + 2 (satır 490–491, hc 8'den
  itibaren) + 33. Satır başı (ROWSTART) karakter satırının son tarama satırında karakter 98'de
  MA'dan alınır, MA karakter 99'da onu yükler; dikey karartmada MA 0'dır.
- **Renk**: 74HC157 renk baytının düşük (yazı) ya da yüksek (zemin) nibble'ını seçer; seçim =
  piksel ∨ imleç. DAC 75 Ω monitör girişine: renk biti 680 Ω (0,47 V), parlaklık 1,3 kΩ
  (0,25 V), ikisi 0,72 V. Kahverengi (I = 0, R = G = 1, B = 0) için yeşil yalnız 1,3 kΩ'dan
  sürülür: 0xAA5500. Test her rengin üç bileşenini CGA paletiyle (`src/cpu16/vga.ts`)
  karşılaştırır.
- **İmleç**: VCTRL ∧ ¬(kare sayacı bit 4) ∧ sütun = CURSOR_X ∧ satır = CURSOR_Y ∧ tarama satırı
  14–15. Kare sayacı vblank başında sayar (Machine `frames`): 0–15 yanık, 16–31 sönük.
- **VSTAT**: bit0 = vblank (satır ≥ 480; dikey sayaç karakter 99'un p4'ünde 480 olur, vblank
  sonraki p0'da kurulur, yani karenin 384 000. piksel kenarında; 420 000. kenarda düşer), bit1 =
  vsync bayrağı (vblank'in yükselen kenarında kurulur, FF26'ya bit1 = 1 yazınca silinir) =
  VSYNC_REQ.
- **CPU portu**: VADDR yazması 74HC193'leri yazma darbesinde asenkron yükler. VDATA yazması
  baytı iki yazma latch'ine alır ve bir istek kurar; istek karakter saatinde iki flip-flop ile
  eşzamanlanır ve bir sonraki CPU yuvasında VADDR0'ın seçtiği şeride yazılır, ardından VADDR
  artar. VDATA okuması ön okuma latch'ini okur (VADDR0'a göre karakter ya da renk baytı, aynı
  veriyolu döngüsünde); sonraki döngüde VADDR artar ve VADDR her değiştiğinde (yazma, okuma,
  VADDR yazması) yeni ön okuma istenir. En kötü durumda yazma ≈ 3,4, okumadan sonraki ön okuma
  ≈ 4,4, yazmadan sonraki ön okuma ≈ 5,8 CPU döngüsünde biter. CPU'nun G/Ç komutları
  (`LBU`/`SB`/`LW`/`SW`) 6 döngü sürdüğü için ardışık iki erişim bunu her zaman bekler: CPU hiç
  beklemez. Test erişimleri tam bu en kısa aralıkla (6 döngü) yapar.

### Statik zamanlama (piksel saati 25,175 MHz)

`npm run cpu16 -- zamanlama --anakart` (en kötü) ve `... --anakart --tip`; kök VID_OSC, hedef
periyot 39,7 ns. Önceki tasarımda yatay ve dikey sayaçlar, çözümleme ve karakter sınırı saati
piksel saatindeydi; en uzun yol yatay sayaçtan satır sonu çözümüyle dikey sayacın ~PE'sine
gidiyordu (74HC161 → 74HC08 → 74HC10 → 74HC04 → 74HC10 → kurulum).

| VID_OSC | önce | sonra |
|---|---|---|
| ardışık eleman | 18 | 5 (74AC161: Q ve TC, 74AC74 ×2, 74HC166) |
| en kötü (maks) | 127 ns → 7,87 MHz | **30,5 ns → 32,79 MHz** (74AC161 CP → Q3 18,5 + 74HC166 ~PE kurulumu 12) |
| tipik | 89 ns → 11,24 MHz | **16,8 ns → 59,52 MHz** (74AC161 CP → TC 13,3 + 74AC74 kurulumu 3,5) |
| kapılı saat (açıkken değişen izin, tutma payı) | ~LD7 ile kapılı karakter sınırı saati | yok |

Piksel saatindeki yollarda hiç kapı yoktur: faz sayacının Q3'ü doğrudan kendi ~PE'sine ve
kaydırıcının ~PE'sine, Q2 ve TC doğrudan 74AC74'e gider. Analiz 74AC gecikmelerini 74HC'ninkinin
en kötüde yarısı, tipikte %70'i alır (`zamanlama.ts` `AC_ORANI`; veri sayfasından kötümser).

**74AC çipleri** (ikisi de 74HC ile aynı bacak düzeninde; şemada / BOM'da 74ACxxx):

| Çip | Neden |
|---|---|
| 74AC161 (piksel fazı) | Her piksel kenarında sayar ve Q3'ü kaydırıcının yükleme iznidir. 74HC161 ile CP → Q3 37 + 74HC166 kurulumu 12 = 49 ns > 39,7 ns. |
| 74AC74 (H2, LD7) | H2 hem karakter saati hem VRAM adres seçicisidir; CP → Q gecikmesi alanlar arası her geçişe girer. 74HC74 ile (35 ns) ön okuma latch'inin payı eksiye düşer (aşağıda 7 ns → −6 ns), karakter ROM'u → kaydırıcı payı 22 ns'den 5 ns'ye iner. |

Kaydırıcı 74HC166 kalır (~PE yolu 30,5 ns sığar); çıkışı yalnızca birleşimsel renk seçicisine
gider (register'a girmez). Piksel çıkışı (Q7, en geç 35 ns) ile renk / karartma register'larının
çıkışı (~LD7 + 74HC175 / 74HC574, en geç 52 ns) arasında karakter sınırında ≤ 17 ns kayma kalır;
eski tasarımdaki gibi.

**Karakter saati** (kök H2, `tests/anakart-gc.test.ts` aynı analizle denetler; hedef 317,8 ns =
3,15 MHz): en kötü 262 ns → 3,82 MHz, tipik 104 ns → 9,62 MHz. En uzun yol satır başı saatinin
kapılamasıdır (dikey sayaç → VBL → ~ENRS, H2'nin yarım periyodunda: 131 ns ≤ 159 ns); tutma payı
(tipik) 36 ns. Açıkken değişen izin yalnızca OPW'dir: VRAM ~OE'sini (H2 ∧ OPW) ve ~WE'yi kapılar,
ikisi de saat değildir ve OPW'nin değiştiği p4'te yazma darbesi WRP = H2 ∧ Q1 zaten 0'dır.

**Alanlar arası geçişler** (elle; t(pk) = pk'nin başındaki piksel kenarı, P = 39,7 ns; yavaş
taraf en kötü, hızlı taraf tipik gecikmeyle):

| Geçiş | Hesap | Pay |
|---|---|---|
| Karakter ROM'u → 74HC166 (p7 → p0'da yüklenir) | CHR p4'te: H2 17,5 + 74HC574 33 + ROM 70 = 120,5 (V0–V3 için 124,5) + kurulum 12 ≤ 4P = 158,9 | 22 ns |
| Tarama okuması → CHR / renk baytı (H2 ↑) | seçici ve saat aynı net (H2): 74HC157 S → Y 30 + 62256 70 + kurulum 12 ≤ 4P | 47 ns |
| Ön okuma → latch (OPR ∧ LD7, p7'de yükselir) | veri t(p4) + 17,5 + 30 + 70 + 12 = 129,5; saat en erken t(p7) + 10,5 + 7 = t(p4) + 136,7 | 7 ns |
| Yazma: adres → ~WE | adres t(p4) + 17,5 + 30 = 47,5; ~WE en erken t(p5) + 10,5 + 7 + 8 = t(p4) + 65,2 | 18 ns |
| Yazma: OPW → ~WE (NAND3) | OPW en geç t(p4) + 17,5 + 35 = 52,5; WRP en erken t(p4) + 57,2 | 5 ns |
| Yazma: ~WE → adres değişimi | ~WE en geç t(p7) + 18,5 + 18 + 20 = 56,5; adres en erken t(p0) + 10,5 + 15 = t(p7) + 65,2 | 9 ns |
| Ön register / renk baytı → çıkış register'ları (~LD7 ↑, p0) | kaynak t(p4) + 17,5 + 33 = 50,5 + 12 ≤ 4P + 10,5 | 107 ns |
| VBQ (p0) → MA ~MR | MA'nın sonraki saati p4'te | 4P |

## Doğrulama zinciri

1. **Yeni çipler** (`chips/parts/gc-ek.ts`: 74HC05, 74HC166, 74HC193, 74HC393):
   `tests/chips.test.ts` her birini veri sayfası fonksiyon tablosuyla (`ref`) ve CMOS transistör
   açılımıyla karşılaştırır (74HC05 bütün girişler, diğerleri rastgele adımlar).
2. **Machine ile döngü döngüsüne** (`tests/anakart-gc.test.ts`; kartlar bir test tezgâhında tek
   başına çalışır, tezgâh arka paneli CPU gibi sürer):
   - *BIOS izi*: BIOS Machine'de açılır, klavyeden ve UART'tan komut alır (yön tuşu E0/F0
     önekleri, art arda UART baytları), zamanlayıcı 100 Hz çalışır. Bütün G/Ç erişimleri
     (`onAccess`) aynı TCLK döngüsünde kapı seviyesi karta uygulanır; UART ve PS/2 seri dalga
     biçimleri Machine'in "bayt hazır" anlarına göre üretilir (CTS# ve inhibit kuralına uyduğu da
     denetlenir). Her G/Ç okuması ve her komut başında IRQ hattı karşılaştırılır.
   - *Rastgele erişimler*: FF00–FF0F'e rastgele bayt / kelime okuma ve yazmaları, küçük RELOAD
     değerleri, uzun beklemeler; her okuma ve **her döngüde** IRQ hattı Machine ile aynı.
   - *Zamanlayıcı*: machine.test.ts'deki senaryo, ayrıca tık kenarına göre −2 … +1 döngüde açma.
   - *Video portu*: deneme ekranı (bütün karakter kodları ve renk baytları) VDATA ile yazılır,
     VRAM şeritleri Machine'in VRAM'iyle aynı; VDATA okumaları (ön okuma), yalnız düşük / yüksek
     VADDR yazmaları, 13 bitte sarma, VSTAT (vblank başı ve kare sonu çevresinde her döngü,
     W1C), **her döngüde** VSYNC_REQ = Machine'in `vsyncFlag`'i.
3. **Dalga biçimleri**: UART TX çözülür ve bit kenarları ölçülür; RX ±%2 baud; PS/2 üç saat
   hızında, READY ve inhibit; bir tam karenin her pikselinin IRGB'si font / renk referansıyla
   (`src/cpu16/vga.ts` çizicisinin kuralı, imleç dahil) aynı, görünür alan dışı siyah; HSYNC ve
   VSYNC'in her piksel konumu ve kutbu; DAC gerilimleri; imleç (açık, kapalı, yanık ve sönük yarı).
4. **Statik zamanlama**: bütün anakart (6 kart) VID_OSC ve H2 kökleriyle analiz edilir; piksel
   saati en kötü ve tipik değerlerle 25,175 MHz'e, karakter saati en kötü değerlerle 3,15 MHz'e
   sığar, piksel saatinde kapılı saat yoktur, 74AC olan yalnızca faz sayacı ve H2 / LD7 register'ı.
5. **Şema**: ERC (çakışan çıkış ve sürülmeyen giriş yok; iki kart birlikte de), kart başına
   KiCad şeması; kicad-cli kuruluysa geçici bir dizine yazılıp netlist'i kartın netleriyle
   karşılaştırılır (kurulu değilse atlanır).

Video tezgâhında piksel saati kare = 420 000 piksel = 66 667 CPU döngüsü olacak biçimde
sürülür ve fazı Machine'in tam sayıya yuvarlanmış vblank anlarına (`VBLANK_START` = 60 953, kare
başı 66 667k) denk getirilir. Gerçek kartta iki osilatör bağımsızdır (25,175 MHz / 800 / 525 =
59,94 Hz; Machine 60,00 Hz). Açılışta faz sayacı p7'de (0) olduğundan kartın hc'si tezgâhın
saydığı konumdan bir eksiktir: tezgâhta görünür piksel x, hc = x + 9'dadır.

## Machine'den ve anakart.md'den farklar

Machine sabitlerinde değişiklik gerekmedi: UART bayt süresi (347), tık (4000) ve kare (66 667)
kart tarafında aynen elde edilir.

- **UART baud saati** ayrı 1,8432 MHz osilatör + 74HC4040 yerine TCLK'den (35/34 döngülük
  bitler); alıcı 16× yerine bit başına bir örnekle. CH340 modülünün 6 pinli başlığında yalnız
  CTS# var: TX için akış denetimi yok (Machine'de de yok).
- **Ön bölücü** saat kartında değil G/Ç kartında; resetle fazı sıfırlanır. Machine'de tıklar
  güç verildiğinden beri 4000k'dadır, resetle kaymaz (yalnız güç açılışı resetinde aynı).
- **Reset'te temizlenmeyenler**: TIMER_RELOAD, CURSOR_X/Y (74HC574), UART_DATA ve KBD_DATA
  (74HC595 çıkış register'ları), VRAM. Machine bunları 0'lar; BIOS hepsini kullanmadan önce
  yazar. Testlerde flip-flop'lar güç açılışında 0'lanır (GateComputer gibi).
- **FF00/FF02 kelime okuması**: kart tek döngüde iki baytı da okur, UART_STAT / KBD_STAT
  okumanın yan etkisinden önceki değerdir; Machine iki `read8` yaptığı için sonrakini verir.
  BIOS bu çiftleri bayt bayt okur.
- **KBD_DATA** 10. saat kenarında, READY'den bir bit süresi önce değişir; READY değilken okuma
  yeni baytı erken görebilir (Machine eskisini verir). READY beklenerek okunduğunda aynıdır.
- **Video**: VRAM 6264 yerine 62256 ×2 (görev tanımı; 4 KB'ı kullanılır), VADDR 74HC161 yerine
  74HC193 (veriyolundan asenkron yükleme), piksel kaydırıcı 74HC165 yerine 74HC166 (piksel
  saatiyle eşzamanlı yükleme). Görüntü sayaca göre 8 piksel kaydırılmıştır (ardışık düzen);
  VGA zamanlaması görünür alana göre standarttır. VSTAT bit0 karakter saatiyle (p0'da)
  eşzamanlanmış vblank'tir. VRAM yazması ve ön okuma Machine'deki gibi anlık değil, birkaç döngü sürer; 6
  döngüden sık port erişimi (CPU yapamaz) ön okumayı geçebilir.
- **Adres çözme**: anakart.md'deki merkezi 74HC688 + 74HC138 yerine bellek kartı ~IO'yu üretir,
  her kart kendi grubunu (G/Ç FF0x, video FF2x) kendi 74HC138'iyle çözer.
- **Çip sayıları** anakart.md'deki tahminlerden büyüktür (G/Ç 65, video 69): tahmin yapıştırıcı
  lojiği ve geri okuma tamponlarını saymıyordu.
