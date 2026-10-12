# Deney 11: Video kartı: ekranda Merhaba

> **Video:** "74HC'lerle VGA kartı: ekranda ilk yazı" · **Önce:** Deney 3 (karakter ROM'u programlanır), 8–10 · **Kart:** video kartı (`video`)
>
> **Breadboard panosu** (bilgisayarın kalıcı breadboard yolu, [docs/breadboard.md](../docs/breadboard.md)): `video-breadboard.pdf` (Video kartı), 2–4. aşamalar (önce 1. aşama: taban, besleme, uyarlayıcı).

Bu deneyin sonunda bilgisayar bir VGA monitöre 80 × 30 metin çizer: mavi zeminde sarı
"Merhaba, CPU16!", altında 16 rengin çubuğu ve her karede bir artan bir sayaç. Kartın kendi
25,175 MHz osilatörü vardır; CPU'dan bağımsız çalışır.

## Ne öğreneceksin

- **VGA zamanlaması**: satır 800 piksel (640 görünür + 16 ön sundurma + 96 senkron + 48 arka
  sundurma), kare 525 satır (480 + 10 + 2 + 33); sayaçlarla (74HC161) ve kod çözen kapılarla üretmek.
- **Metin modu**: karakter kodu ve renk baytı VRAM'den → karakter ROM'u (28C256, kod·16 + tarama
  satırı) → kaydırma register'ı (74HC166) → her piksel yazı ya da zemin rengi (IRGB).
- **VRAM'i paylaşmak**: her karakter süresi (8 piksel) ikiye bölünür: ilk yarı tarama, ikinci yarı
  CPU. Ekranda kar oluşmaz, CPU hiç beklemez.
- **Saat alanları**: CPU'nun yazma isteği iki flip-flop'la piksel saatine eşzamanlanır.
- **Ardışık düzen (pipeline)**: bir karakter üç karakter süresinde ekrana gelir: ilkinde VRAM'den
  okunur, ikincisinde karakter ROM'undan okunup bir 74HC574'e alınır, üçüncüsünde kaydırılır. Böylece
  150 ns'lik bir EEPROM'a bütün bir karakter süresi (317,8 ns) kalır. Renk baytı, senkron ve karartma
  sinyalleri de aynı sayıda register'dan geçer: hepsi aynı piksele denk gelir.
- **Eşzamanlı ve eşzamansız yükleme**: kaydırma register'ı 74HC166'dır, çünkü yüklemesi saat
  kenarındadır. 74HC165'in yüklemesi eşzamansızdır (`~PL` darbesi); bir piksel süresi (39,7 ns)
  içinde ≈ 20 ns'lik bir darbe gerekir ve ilk piksel kayar.
- **Dirençli DAC**: dört dijital bitten (IRGB) monitörün 0–0,7 V renk girişlerine.

## Nasıl çalışır

- Register'lar (`cpu16/docs/anakart.md`, "G/Ç haritası"): `FF20/21` VADDR, `FF22` VDATA,
  `FF23` VCTRL, `FF24/25` imleç, `FF26` VSTAT. CPU VRAM'i doğrudan görmez: `VADDR`'a hücre adresini
  yazar, `VDATA`'ya yazdığı her bayttan sonra adres kendiliğinden bir artar.
- Hücre = (satır·80 + sütun)·2: çift adres karakter kodu, tek adres renk baytı (düşük 4 bit yazı,
  yüksek 4 bit zemin). VRAM iki SRAM şerididir; tarama ikisini aynı anda okur.
- İki saat alanı vardır. Piksel saatinde (25,175 MHz) yalnızca üç çip çalışır: faz sayacı (piksel
  0–7), karakter saatini üreten flip-flop ve kaydırma register'ı; bu yolda gecikme kritik olduğu için
  ilk ikisi **74AC** ailesindendir (74AC161, 74AC74; aynı bacak düzeni). Kartın geri kalanı piksel / 8
  = 3,15 MHz karakter saatiyle çalışır: karakter sayacı satır başına 0–99, satır sayacı kare başına
  0–524 sayar. `vc = 480`'de dikey boşluk başlar ve `VSTAT` bit 1
  (VSYNC bayrağı) kurulur; G/Ç kartında bu, IRQ kaynağı 3'tür.
- Renk: piksel 1 ise yazı, 0 ise zemin nibble'ı seçilir (74HC157); karartmada siyah. DAC'ta her
  rengin bitine 680 Ω, parlaklık bitine 1,3 kΩ; monitörün 75 Ω girişiyle 2/3 + 1/3 ağırlık.
  Kahverengi (6) için yeşil yarıya iner (CGA'daki gibi).
- Kartın blok blok tasarımı ve zamanlaması: `cpu16/docs/anakart-gc-video.md` ve
  `cpu16/board/video-card.ts`'in başındaki açıklamalar; zamanlama sonuçları `cpu16/docs/uretim.md`.
- `VADDR` dört 74HC161'dir ve tek bir saati vardır. `FF20`/`FF21` yazma darbesi o yarının yükleme
  bayrağını (74HC74) hemen kurar; darbe bitince saat yükselir, sayıcılar baytı yükler ve bayrak aynı
  kenarda silinir. `VDATA` erişiminden sonra aynı saat bir kez daha yükselir: bayrak yokken iki yarı
  birlikte bir sayar.
- Program (`cpu16/kit/programlar/video-deneme.s`): ekranı temizler, yazıyı ve renk çubuğunu yazar,
  sonra `VSTAT`'ı yoklayarak her karede `kare:` sayacını artırır.

## Kurulum adımları

1. Karakter ROM'u (bir 28C256): Deney 3'te yazdıysan o çipi kullan; yoksa programla:
   ```
   npm run cpu16 -- charrom -o charrom.hex
   python3 cpu16/programlayici/yaz.py PORT charrom.hex --dogrula
   ```
2. Kartı blok blok kur: adres çözme; piksel saati ve sayaçlar (25,175 MHz osilatör); çözümleme ve
   dikey tarama durumu. Monitörü bağlamadan önce osiloskop ya da frekansmetreyle ölç:
   `VGA_HSYNC` 31,47 kHz, `VGA_VSYNC` 59,94 Hz, ikisi de düşük darbeli.
3. Tarama adresi, VRAM, piksel yolu, renk ve DAC, CPU arayüzü, imleç blokları.
4. VGA soketi (DE-15 dişi): 1 kırmızı, 2 yeşil, 3 mavi, 13 HSYNC, 14 VSYNC; 5–8 ve 10 GND.
5. Deneme programını bir 28C256'ya yaz ve bellek kartındaki EEPROM soketine (U420) tak:
   ```
   npm run cpu16 -- asm cpu16/kit/programlar/video-deneme.s -o video.hex
   python3 cpu16/programlayici/yaz.py PORT video.hex --dogrula
   ```
6. Monitörü bağla, RESET'e bas.

## Test: beklenen sonuç

| Nerede | Beklenen |
|---|---|
| Monitör menüsü | 640 × 480, 60 Hz |
| Bütün ekran | mavi zemin, imleç yok |
| 2. satır, 4. sütun | sarı `Merhaba, CPU16!` |
| 5. satır | 16 renk bloğu: siyah, mavi, yeşil, camgöbeği, kırmızı, eflatun, kahverengi, açık gri, koyu gri, açık mavi, açık yeşil, açık camgöbeği, açık kırmızı, açık eflatun, sarı, beyaz (1 numara zeminle aynı renktedir) |
| 6. satır | her bloğun altında numarası, `0` … `F` |
| 8. satır | `kare: ` sayacı saniyede 60 (`0x3C`) artar; ≈ 18 dakikada bir `FFFF`'ten `0000`'a sarar |

## Simülatörde

- `npm run cpu16 -- machine cpu16/kit/programlar/video-deneme.s --rom --screen --cycles 2000000 < /dev/null`:
  2 milyon döngü (30 kare) çalışır ve metin ekranını basar; `kare: 001E` görünür.
- Kapı seviyesi: `cpu16/tests/anakart-gc.test.ts` video kartını kapı seviyesinde kurar, VGA
  çıkışını piksel piksel `Machine`'in VRAM'i ve karakter ROM'uyla karşılaştırır; senkron
  darbelerinin yerini ve süresini ölçer.
- Deneme programının kendisi: `cpu16/tests/kit.test.ts` ("deney programları").

## Sorun giderme

| Belirti | Bak |
|---|---|
| Monitör "sinyal yok" diyor | `VGA_HSYNC` 31,47 kHz ve `VGA_VSYNC` 59,94 Hz mi, düşük darbeli mi; osilatör çalışıyor mu |
| Görüntü kayıyor ya da titriyor | sayaçların sıfırlanması: satır sonu (karakter 99) ve kare sonu (satır 524) kapıları |
| Karakterler yer yer bozuk, kart ısınınca kötüleşiyor | faz sayacı ve karakter saati flip-flop'u 74AC mi; 74HC ile piksel saatine sığmaz |
| Ekran rastgele karakterlerle dolu | program çalışmıyor ya da VRAM'e yazılamıyor: VADDR sayacı (yükleme bayrakları, `TC` → `CET` zinciri), yazma isteği eşzamanlayıcısı |
| Karakterler bozuk ama yerleri doğru | karakter ROM'u: programlandı mı; adres = kod·16 + tarama satırı (tarama satırı alt 4 adres biti) |
| Renkler yanlış | IRGB sırası ve DAC dirençleri (renk 680 Ω, parlaklık 1,3 kΩ); 6 kahverengi değil sarımsıysa yeşil düzeltmesi |
| Yazı bir karakter kaymış, renkler doğru | ardışık düzen: karakter iki register'dan (karakter kodu, font baytı), renk baytı da iki register'dan geçmeli; biri eksikse yazı ile renk bir karakter kayar |
| `kare:` sayacı ilerlemiyor | `VSTAT` bit 1: dikey sayacın kod çözümü ve "1 yazınca sil" kapısı |
| Ekranda yazarken kar | CPU yazması tarama yarısına taşıyor: VRAM yazma darbesi yalnız karakterin ikinci yarısında olmalı |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (73 entegre, 82 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 28C256 | 1 | U728 | 32 KB paralel EEPROM (32K × 8, 5 V, bayt/sayfa yazma; 62256 ile aynı bacak düzeni) | GND 14, VCC 28 |
| 74HC00 | 1 | U768 | 4 × 2 girişli NAND | GND 7, VCC 14 |
| 74HC02 | 1 | U769 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC04 | 2 | U770 U771 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC08 | 8 | U757 U758 U759 U760 U761 U762 U763 U764 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC10 | 2 | U772 U773 | 3 × 3 girişli NAND | GND 7, VCC 14 |
| 74HC32 | 3 | U765 U766 U767 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 7 | U706 U713 U739 U744 U745 U746 U747 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC138 | 4 | U701 U702 U703 U704 | 3'ten 8'e kod çözücü (aktif düşük çıkış) | GND 8, VCC 16 |
| 74HC157 | 4 | U721 U722 U723 U738 | 4 × (2'den 1'e seçici) | GND 8, VCC 16 |
| 74HC161 | 13 | U705 U707 U708 U709 U710 U711 U716 U717 U718 U740 U741 U742 U743 | 4 bit senkron ikili sayıcı (asenkron reset) | GND 8, VCC 16 |
| 74HC166 | 1 | U732 | 8 bit paralel giriş / seri çıkış kaydırmalı register (eşzamanlı yükleme) | GND 8, VCC 16 |
| 74HC175 | 3 | U733 U734 U735 | 4 × D flip-flop (ortak saat, asenkron reset) | GND 8, VCC 16 |
| 74HC393 | 1 | U714 | 2 × 4 bit dalgalı (ripple) ikili sayıcı (düşen kenar, asenkron temizleme) | GND 7, VCC 14 |
| 74HC541 | 4 | U715 U752 U755 U756 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 13 | U719 U720 U726 U727 U729 U730 U731 U748 U749 U750 U751 U753 U754 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |
| 74HC688 | 3 | U712 U736 U737 | 8 bit eşitlik karşılaştırıcı | GND 10, VCC 20 |
| 62256 | 2 | U724 U725 | 32 KB statik RAM (32K × 8) | GND 14, VCC 28 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 73 | C702 C703 C704 C705 C706 C707 C708 C709 C710 C711 C712 C713 C714 C715 C716 C717 C718 C719 C720 C721 C722 C723 C724 C725 C726 C727 C728 C729 C730 C731 C732 C733 C734 C735 C736 C737 C738 C739 C740 C741 C742 C743 C744 C745 C746 C747 C748 C749 C750 C751 C752 C753 C754 C755 C756 C757 C758 C759 C760 C761 C762 C763 C764 C765 C766 C767 C768 C769 C770 C771 C772 C773 C774 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C701 | 100 µF elektrolitik kondansatör (kart girişi) |
| CONN_VGA | 1 | J701 | VGA konnektörü (DE-15 HD, dişi) |
| OSC_25M175 | 1 | X701 | 25,175 MHz kristal osilatör modülü (DIP-14 kılıf, 5 V) |
| R_1K3 | 3 | R702 R704 R706 | 1,3 kΩ direnç |
| R_680 | 3 | R701 R703 R705 | 680 Ω direnç |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U757** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (karakter 98 / 99); 3. kapı (yapıştırıcı kapı); 4. kapı (VRAM yazma darbesi (p5–p6))
- **U758** (74HC08, bu deneyde takılır): 1. kapı (hc ≥ 640 (yatay karartma)); 2. kapı (karakter 98: satır başı ← MA); 3. kapı (yapıştırıcı kapı); 4. kapı (karakter 80..95)
- **U759** (74HC08, bu deneyde takılır): 1. kapı (alt 4 bit 2..13); 2. kapı (karakter 82..93: HSYNC (96 piksel)); 3. kapı (yapıştırıcı kapı); 4. kapı (yapıştırıcı kapı)
- **U760** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (tarama satırı 14–15); 3. kapı (karakter satırının son tarama satırı); 4. kapı (VSTAT'a bit1 = 1 yazınca bayrağı sil)
- **U761** (74HC08, bu deneyde takılır): 1. kapı (VRAM çıkışı kapalı: CPU yazıyor); 2. kapı (yapıştırıcı kapı); 3. kapı (yapıştırıcı kapı); 4. kapı (imleç burada)
- **U762** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (renk 6); 3. kapı (yeşil 2/3); 4. kapı (VADDR artırma saati)
- **U763** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (VADDR saati: yükleme ya da artırma; ön okuma iste); 3. kapı (yazma isteği alındı); 4. kapı (yazma öncelikli)
- **U764** (74HC08, bu deneyde takılır): 1. kapı (ön okuma latch saati (p7))
- **U765** (74HC32, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (yapıştırıcı kapı); 3. kapı (yapıştırıcı kapı); 4. kapı (vc ≥ 480 (dikey karartma))
- **U766** (74HC32, bu deneyde takılır): 1. kapı (karartma); 2. kapı (yapıştırıcı kapı); 3. kapı (satır başı saati (p4)); 4. kapı (yazı rengi: piksel ya da imleç)
- **U767** (74HC32, bu deneyde takılır): 1. kapı (yeşil 1/3); 2. kapı (VDATA oku: karakter şeridi); 3. kapı (VDATA oku: renk şeridi)
- **U768** (74HC00, bu deneyde takılır): 1. kapı (karakter 99 (satır sonu)); 2. kapı (yapıştırıcı kapı); 3. kapı (satır başını güncelle (karakter 98)); 4. kapı (yazma bitti: VADDR + 1 (p7))
- **U769** (74HC02, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (yapıştırıcı kapı); 3. kapı (VDATA okunuyor (A0 = 0))
- **U770** (74HC04, bu deneyde takılır): 1. kapı (CPU yuvası bitti (p0)); 2. kapı (satır sonu); 3. kapı (görünür karakter (MA sayar)); 4. kapı (yapıştırıcı kapı); 5. kapı (yapıştırıcı kapı); 6. kapı (yapıştırıcı kapı)
- **U771** (74HC04, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (yapıştırıcı kapı); 3. kapı (yapıştırıcı kapı)
- **U772** (74HC10, bu deneyde takılır): 1. kapı (vc = 524 ve satır sonu: kare sonu); 2. kapı (yapıştırıcı kapı); 3. kapı (karakter şeridine yaz (VADDR çift))
- **U773** (74HC10, bu deneyde takılır): 1. kapı (renk şeridine yaz (VADDR tek))

#### Bağlantılar (303 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U705-4 D1, U705-5 D2, U707-3 D0, U707-4 D1, U707-5 D2, U707-6 D3, U708-3 D0, U708-4 D1, U708-5 D2, U708-6 D3, U709-3 D0, U709-4 D1, U709-5 D2, U709-6 D3, U710-3 D0, U710-4 D1, U710-5 D2, U710-6 D3, U711-3 D0, U711-4 D1, U711-5 D2, U711-6 D3, U712-5 Q1, U712-9 Q3, U714-2 1MR, U714-12 2MR, U715-4 A2, U715-5 A3, U715-6 A4, U715-7 A5, U715-8 A6, U715-9 A7, U715-19 ~OE2, U719-1 ~OE, U720-1 ~OE, U720-6 D4, U720-7 D5, U720-8 D6, U720-9 D7, U721-15 ~E, U722-15 ~E, U723-15 ~E, U724-1 A14, U724-2 A12, U724-20 ~CE, U724-26 A13, U725-1 A14, U725-2 A12, U725-20 ~CE, U725-26 A13, U726-1 ~OE, U727-1 ~OE, U728-1 A14, U728-2 A12, U728-20 ~CE, U728-22 ~OE, U728-26 A13, U729-1 ~OE, U730-1 ~OE, U731-1 ~OE, U732-1 DS, U732-6 ~CE, U736-1 ~E, U736-17 P7, U737-1 ~E, U737-15 P6, U737-17 P7, U739-2 1D, U739-12 2D, U752-3 A1, U752-4 A2, U752-5 A3, U752-6 A4, U752-7 A5, U752-8 A6, U752-9 A7, U752-19 ~OE2, U753-1 ~OE, U754-1 ~OE, U755-19 ~OE2, U756-19 ~OE2, U764-4 2A, U764-5 2B, U764-9 3A, U764-10 3B, U764-12 4A, U764-13 4B, U767-12 4A, U767-13 4B, U769-11 4A, U769-12 4B, U771-9 4A, U771-11 5A, U771-13 6A, U773-3 2A, U773-4 2B, U773-5 2C, U773-9 3A, U773-10 3B, U773-11 3C | sabit seviye |
| **VCC** | U701-6 E3, U702-6 E3, U703-6 E3, U704-6 E3, U705-1 ~MR, U705-3 D0, U705-6 D3, U705-7 CEP, U705-10 CET, U706-1 ~1CLR, U706-4 ~1PRE, U706-10 ~2PRE, U706-13 ~2CLR, U707-1 ~MR, U707-7 CEP, U707-10 CET, U708-1 ~MR, U708-7 CEP, U709-1 ~MR, U709-10 CET, U710-1 ~MR, U711-1 ~MR, U712-3 Q0, U712-7 Q2, U712-12 Q4, U712-14 Q5, U712-16 Q6, U712-18 Q7, U713-1 ~1CLR, U713-4 ~1PRE, U713-10 ~2PRE, U713-12 2D, U728-27 ~WE, U732-9 ~MR, U733-1 ~MR, U734-1 ~MR, U735-1 ~MR, U740-10 CET, U744-2 1D, U744-4 ~1PRE, U744-12 2D, U745-4 ~1PRE, U745-10 ~2PRE, U746-4 ~1PRE, U746-10 ~2PRE, U747-4 ~1PRE, U747-10 ~2PRE | sabit seviye |
| `~IO` | U701-4 ~E1 | arka panel 47 · önceki: Deney 8, 10 |
| `~MRD` | U702-5 ~E2 | arka panel 41 · önceki: Deney 6, 8, 9, 10 |
| `~MWE_E` | U703-5 ~E2 | arka panel 42 · önceki: Deney 6, 8, 9, 10 |
| `~MWE_O` | U704-5 ~E2 | arka panel 43 · önceki: Deney 6, 8, 10 |
| `~RESET` | U739-1 ~1CLR, U739-13 ~2CLR, U740-1 ~MR, U741-1 ~MR, U742-1 ~MR, U743-1 ~MR, U744-10 ~2PRE, U745-1 ~1CLR, U745-13 ~2CLR, U746-1 ~1CLR, U746-13 ~2CLR, U747-1 ~1CLR, U747-13 ~2CLR, U760-12 4A, U763-10 3B | arka panel 7 · önceki: Deney 1, 5, 6, 7, 8, 9, 10 |
| `~V_ADR0` | U767-10 3B, U771-2 1Y, U772-11 3C |  |
| `~V_CXEQ` | U736-19 ~EQ, U769-2 1A |  |
| `~V_CYEQ` | U737-19 ~EQ, U769-3 1B |  |
| `~V_ENRS` | U766-10 3B, U768-8 3Y |  |
| `~V_FCLR` | U713-13 ~2CLR, U760-11 4Y |  |
| `~V_G` | U701-13 ~Y2, U702-4 ~E1, U703-4 ~E1, U704-4 ~E1 |  |
| `~V_HEND` | U707-9 ~PE, U708-9 ~PE, U716-9 ~PE, U717-9 ~PE, U718-9 ~PE, U768-3 1Y, U770-3 2A |  |
| `~V_LD7` | U705-9 ~PE, U705-11 Q3, U731-11 CP, U732-15 ~PE, U735-9 CP |  |
| `~V_LHI` | U739-8 ~2Q, U740-7 CEP, U741-7 CEP, U742-9 ~PE, U743-9 ~PE |  |
| `~V_LLO` | U739-6 ~1Q, U740-9 ~PE, U741-9 ~PE, U742-7 CEP, U743-7 CEP |  |
| `~V_OPR` | U744-13 ~2CLR, U746-8 ~2Q |  |
| `~V_OPW` | U746-6 ~1Q, U763-9 3A |  |
| `~V_RD1` | U702-14 ~Y1, U752-1 ~OE1, U767-4 2A, U767-9 3A, U769-8 3A |  |
| `~V_RD2` | U702-13 ~Y2, U755-1 ~OE1, U756-1 ~OE1 |  |
| `~V_RD3` | U702-12 ~Y3, U715-1 ~OE1 |  |
| `~V_RDA` | U751-1 ~OE, U767-8 3Y |  |
| `~V_RDC` | U750-1 ~OE, U767-6 2Y |  |
| `~V_RDDQ` | U747-6 ~1Q, U762-12 4A |  |
| `~V_VBQ` | U713-6 ~1Q, U714-1 ~1CP, U716-1 ~MR, U717-1 ~MR, U718-1 ~MR |  |
| `~V_VLD` | U709-9 ~PE, U710-9 ~PE, U711-9 ~PE, U772-12 1Y |  |
| `~V_VSYNC_A` | U712-19 ~EQ, U733-12 D2 |  |
| `~V_VSYNCP` | U733-10 Q2, U734-12 D2 |  |
| `~V_VSYNCQ` | U734-10 Q2, U735-12 D2 |  |
| `~V_WE0` | U703-15 ~Y0, U739-4 ~1PRE, U763-1 1A |  |
| `~V_WE1` | U703-14 ~Y1, U744-3 1CLK, U748-11 CP, U749-11 CP |  |
| `~V_WE2` | U703-13 ~Y2, U753-11 CP |  |
| `~V_WE3` | U703-12 ~Y3, U770-13 6A |  |
| `~V_WEA` | U725-27 ~WE, U749-1 ~OE, U773-12 1Y |  |
| `~V_WEC` | U724-27 ~WE, U748-1 ~OE, U772-8 3Y |  |
| `~V_WINC` | U762-13 4B, U768-11 4Y |  |
| `~V_WO0` | U704-15 ~Y0, U739-10 ~2PRE, U763-2 1B |  |
| `~V_WO1` | U704-14 ~Y1, U747-11 2CLK |  |
| `~V_WO2` | U704-13 ~Y2, U754-11 CP |  |
| `~V_WRCLR` | U744-1 ~1CLR, U763-8 3Y |  |
| `~V_WREQS` | U745-6 ~1Q, U763-13 4B |  |
| `A0` | U769-9 3B | arka panel 9 · önceki: Deney 6, 10 |
| `A1` | U702-1 A0, U703-1 A0, U704-1 A0 | arka panel 10 · önceki: Deney 6, 8, 9, 10 |
| `A2` | U702-2 A1, U703-2 A1, U704-2 A1 | arka panel 11 · önceki: Deney 6, 8, 9, 10 |
| `A3` | U702-3 A2, U703-3 A2, U704-3 A2 | arka panel 12 · önceki: Deney 6, 8, 9, 10 |
| `A4` | U701-1 A0 | arka panel 13 · önceki: Deney 6, 8, 9, 10 |
| `A5` | U701-2 A1 | arka panel 14 · önceki: Deney 6, 8, 9, 10 |
| `A6` | U701-3 A2 | arka panel 15 · önceki: Deney 6, 8, 9, 10 |
| `A7` | U701-5 ~E2 | arka panel 16 · önceki: Deney 6, 8, 9, 10 |
| `CLK` | U747-3 1CLK | arka panel 5 · önceki: Deney 1, 6, 7, 8, 9, 10 |
| `DE0` | U715-18 Y0, U740-3 D0, U748-2 D0, U749-2 D0, U750-19 Q0, U751-19 Q0, U753-2 D0, U755-18 Y0 | arka panel 25 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE1` | U715-17 Y1, U740-4 D1, U748-3 D1, U749-3 D1, U750-18 Q1, U751-18 Q1, U753-3 D1, U755-17 Y1, U768-5 2B | arka panel 26 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE2` | U715-16 Y2, U740-5 D2, U748-4 D2, U749-4 D2, U750-17 Q2, U751-17 Q2, U753-4 D2, U755-16 Y2 | arka panel 27 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE3` | U715-15 Y3, U740-6 D3, U748-5 D3, U749-5 D3, U750-16 Q3, U751-16 Q3, U753-5 D3, U755-15 Y3 | arka panel 28 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE4` | U715-14 Y4, U741-3 D0, U748-6 D4, U749-6 D4, U750-15 Q4, U751-15 Q4, U753-6 D4, U755-14 Y4 | arka panel 29 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE5` | U715-13 Y5, U741-4 D1, U748-7 D5, U749-7 D5, U750-14 Q5, U751-14 Q5, U753-7 D5, U755-13 Y5 | arka panel 30 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE6` | U715-12 Y6, U741-5 D2, U748-8 D6, U749-8 D6, U750-13 Q6, U751-13 Q6, U753-8 D6, U755-12 Y6 | arka panel 31 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE7` | U715-11 Y7, U741-6 D3, U748-9 D7, U749-9 D7, U750-12 Q7, U751-12 Q7, U753-9 D7, U755-11 Y7 | arka panel 32 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO0` | U742-3 D0, U747-12 2D, U752-18 Y0, U754-2 D0, U756-18 Y0 | arka panel 33 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO1` | U742-4 D1, U752-17 Y1, U754-3 D1, U756-17 Y1 | arka panel 34 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO2` | U742-5 D2, U752-16 Y2, U754-4 D2, U756-16 Y2 | arka panel 35 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO3` | U742-6 D3, U752-15 Y3, U754-5 D3, U756-15 Y3 | arka panel 36 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO4` | U743-3 D0, U752-14 Y4, U754-6 D4, U756-14 Y4 | arka panel 37 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO5` | U743-4 D1, U752-13 Y5, U754-7 D5, U756-13 Y5 | arka panel 38 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO6` | U743-5 D2, U752-12 Y6, U754-8 D6, U756-12 Y6 | arka panel 39 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO7` | U743-6 D3, U752-11 Y7, U754-9 D7, U756-11 Y7 | arka panel 40 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| (adsız) | U758-2 1B, U765-3 1Y |  |
| (adsız) | U758-5 2B, U770-8 4Y |  |
| (adsız) | U758-8 3Y, U758-12 4A |  |
| (adsız) | U758-13 4B, U770-10 5Y |  |
| (adsız) | U765-6 2Y, U765-9 3A |  |
| (adsız) | U759-1 1A, U765-8 3Y |  |
| (adsız) | U759-2 1B, U772-6 2Y |  |
| (adsız) | U759-8 3Y, U760-1 1A |  |
| (adsız) | U759-11 4Y, U760-2 1B |  |
| (adsız) | U760-3 1Y, U765-13 4B |  |
| (adsız) | U768-4 2A, U770-12 6Y |  |
| (adsız) | U760-13 4B, U768-6 2Y |  |
| (adsız) | U766-6 2Y, U768-10 3B |  |
| (adsız) | U761-5 2B, U771-4 2Y |  |
| (adsız) | U761-6 2Y, U761-12 4A |  |
| (adsız) | U761-9 3A, U769-1 1Y |  |
| (adsız) | U761-8 3Y, U761-13 4B |  |
| (adsız) | U762-3 1Y, U762-4 2A |  |
| (adsız) | U762-5 2B, U769-4 2Y |  |
| (adsız) | U762-10 3B, U771-6 3Y |  |
| (adsız) | U763-3 1Y, U763-4 2A |  |
| `V_AD0` | U725-11 IO0, U727-2 D0, U749-19 Q0, U751-2 D0 |  |
| `V_AD1` | U725-12 IO1, U727-3 D1, U749-18 Q1, U751-3 D1 |  |
| `V_AD2` | U725-13 IO2, U727-4 D2, U749-17 Q2, U751-4 D2 |  |
| `V_AD3` | U725-15 IO3, U727-5 D3, U749-16 Q3, U751-5 D3 |  |
| `V_AD4` | U725-16 IO4, U727-6 D4, U749-15 Q4, U751-6 D4 |  |
| `V_AD5` | U725-17 IO5, U727-7 D5, U749-14 Q5, U751-7 D5 |  |
| `V_AD6` | U725-18 IO6, U727-8 D6, U749-13 Q6, U751-8 D6 |  |
| `V_AD7` | U725-19 IO7, U727-9 D7, U749-12 Q7, U751-9 D7 |  |
| `V_ADR0` | U740-14 Q0, U767-5 2B, U771-1 1A, U773-13 1C |  |
| `V_ADR1` | U721-3 1I1, U740-13 Q1 |  |
| `V_ADR2` | U721-6 2I1, U740-12 Q2 |  |
| `V_ADR3` | U721-10 3I1, U740-11 Q3 |  |
| `V_ADR4` | U721-13 4I1, U741-14 Q0 |  |
| `V_ADR5` | U722-3 1I1, U741-13 Q1 |  |
| `V_ADR6` | U722-6 2I1, U741-12 Q2 |  |
| `V_ADR7` | U722-10 3I1, U741-11 Q3 |  |
| `V_ADR8` | U722-13 4I1, U742-14 Q0 |  |
| `V_ADR9` | U723-3 1I1, U742-13 Q1 |  |
| `V_ADR10` | U723-6 2I1, U742-12 Q2 |  |
| `V_ADR11` | U723-10 3I1, U742-11 Q3 |  |
| `V_ADR12` | U723-13 4I1, U743-14 Q0 |  |
| `V_AT0` | U727-19 Q0, U730-2 D0 |  |
| `V_AT1` | U727-18 Q1, U730-3 D1 |  |
| `V_AT2` | U727-17 Q2, U730-4 D2 |  |
| `V_AT3` | U727-16 Q3, U730-5 D3 |  |
| `V_AT4` | U727-15 Q4, U730-6 D4 |  |
| `V_AT5` | U727-14 Q5, U730-7 D5 |  |
| `V_AT6` | U727-13 Q6, U730-8 D6 |  |
| `V_AT7` | U727-12 Q7, U730-9 D7 |  |
| `V_AT20` | U730-19 Q0, U731-2 D0 |  |
| `V_AT21` | U730-18 Q1, U731-3 D1 |  |
| `V_AT22` | U730-17 Q2, U731-4 D2 |  |
| `V_AT23` | U730-16 Q3, U731-5 D3 |  |
| `V_AT24` | U730-15 Q4, U731-6 D4 |  |
| `V_AT25` | U730-14 Q5, U731-7 D5 |  |
| `V_AT26` | U730-13 Q6, U731-8 D6 |  |
| `V_AT27` | U730-12 Q7, U731-9 D7 |  |
| `V_ATC0` | U740-15 TC, U741-10 CET |  |
| `V_ATC1` | U741-15 TC, U742-10 CET |  |
| `V_ATC2` | U742-15 TC, U743-10 CET |  |
| `V_ATD0` | U731-19 Q0, U738-3 1I1 |  |
| `V_ATD1` | U731-18 Q1, U738-6 2I1 |  |
| `V_ATD2` | U731-17 Q2, U738-10 3I1 |  |
| `V_ATD3` | U731-16 Q3, U738-13 4I1 |  |
| `V_ATD4` | U731-15 Q4, U738-2 1I0 |  |
| `V_ATD5` | U731-14 Q5, U738-5 2I0 |  |
| `V_ATD6` | U731-13 Q6, U738-11 3I0 |  |
| `V_ATD7` | U731-12 Q7, U738-14 4I0 |  |
| `V_B` | R705.1, U738-4 1Y, U769-6 2B |  |
| `V_BLANK` | U733-4 D0, U766-3 1Y |  |
| `V_BLANKD` | U735-2 Q0, U738-15 ~E |  |
| `V_BLANKP` | U733-2 Q0, U734-4 D0 |  |
| `V_BLANKQ` | U734-2 Q0, U735-4 D0 |  |
| `V_BLINK` | U714-11 2Q0, U771-3 2A |  |
| `V_BROWN` | U762-6 2Y, U767-2 1B, U771-5 3A |  |
| `V_CD0` | U724-11 IO0, U726-2 D0, U748-19 Q0, U750-2 D0 |  |
| `V_CD1` | U724-12 IO1, U726-3 D1, U748-18 Q1, U750-3 D1 |  |
| `V_CD2` | U724-13 IO2, U726-4 D2, U748-17 Q2, U750-4 D2 |  |
| `V_CD3` | U724-15 IO3, U726-5 D3, U748-16 Q3, U750-5 D3 |  |
| `V_CD4` | U724-16 IO4, U726-6 D4, U748-15 Q4, U750-6 D4 |  |
| `V_CD5` | U724-17 IO5, U726-7 D5, U748-14 Q5, U750-7 D5 |  |
| `V_CD6` | U724-18 IO6, U726-8 D6, U748-13 Q6, U750-8 D6 |  |
| `V_CD7` | U724-19 IO7, U726-9 D7, U748-12 Q7, U750-9 D7 |  |
| `V_CHR0` | U726-19 Q0, U728-6 A4 |  |
| `V_CHR1` | U726-18 Q1, U728-5 A5 |  |
| `V_CHR2` | U726-17 Q2, U728-4 A6 |  |
| `V_CHR3` | U726-16 Q3, U728-3 A7 |  |
| `V_CHR4` | U726-15 Q4, U728-25 A8 |  |
| `V_CHR5` | U726-14 Q5, U728-24 A9 |  |
| `V_CHR6` | U726-13 Q6, U728-21 A10 |  |
| `V_CHR7` | U726-12 Q7, U728-23 A11 |  |
| `V_CURD` | U735-15 Q3, U766-13 4B |  |
| `V_CURP` | U733-15 Q3, U734-13 D3 |  |
| `V_CURQ` | U734-15 Q3, U735-13 D3 |  |
| `V_CURR` | U733-13 D3, U761-11 4Y |  |
| `V_CX0` | U736-3 Q0, U753-19 Q0, U755-2 A0 |  |
| `V_CX1` | U736-5 Q1, U753-18 Q1, U755-3 A1 |  |
| `V_CX2` | U736-7 Q2, U753-17 Q2, U755-4 A2 |  |
| `V_CX3` | U736-9 Q3, U753-16 Q3, U755-5 A3 |  |
| `V_CX4` | U736-12 Q4, U753-15 Q4, U755-6 A4 |  |
| `V_CX5` | U736-14 Q5, U753-14 Q5, U755-7 A5 |  |
| `V_CX6` | U736-16 Q6, U753-13 Q6, U755-8 A6 |  |
| `V_CX7` | U736-18 Q7, U753-12 Q7, U755-9 A7 |  |
| `V_CY0` | U737-3 Q0, U754-19 Q0, U756-2 A0 |  |
| `V_CY1` | U737-5 Q1, U754-18 Q1, U756-3 A1 |  |
| `V_CY2` | U737-7 Q2, U754-17 Q2, U756-4 A2 |  |
| `V_CY3` | U737-9 Q3, U754-16 Q3, U756-5 A3 |  |
| `V_CY4` | U737-12 Q4, U754-15 Q4, U756-6 A4 |  |
| `V_CY5` | U737-14 Q5, U754-14 Q5, U756-7 A5 |  |
| `V_CY6` | U737-16 Q6, U754-13 Q6, U756-8 A6 |  |
| `V_CY7` | U737-18 Q7, U754-12 Q7, U756-9 A7 |  |
| `V_FD0` | U728-11 IO0, U729-2 D0 |  |
| `V_FD1` | U728-12 IO1, U729-3 D1 |  |
| `V_FD2` | U728-13 IO2, U729-4 D2 |  |
| `V_FD3` | U728-15 IO3, U729-5 D3 |  |
| `V_FD4` | U728-16 IO4, U729-6 D4 |  |
| `V_FD5` | U728-17 IO5, U729-7 D5 |  |
| `V_FD6` | U728-18 IO6, U729-8 D6 |  |
| `V_FD7` | U728-19 IO7, U729-9 D7 |  |
| `V_FGSEL` | U738-1 S, U766-11 4Y |  |
| `V_FP0` | U729-19 Q0, U732-2 D0 |  |
| `V_FP1` | U729-18 Q1, U732-3 D1 |  |
| `V_FP2` | U729-17 Q2, U732-4 D2 |  |
| `V_FP3` | U729-16 Q3, U732-5 D3 |  |
| `V_FP4` | U729-15 Q4, U732-10 D4 |  |
| `V_FP5` | U729-14 Q5, U732-11 D5 |  |
| `V_FP6` | U729-13 Q6, U732-12 D6 |  |
| `V_FP7` | U729-12 Q7, U732-14 D7 |  |
| `V_FR3` | U714-6 1Q3, U714-13 ~2CP |  |
| `V_G` | U738-7 2Y, U762-2 1B, U762-9 3A |  |
| `V_GH` | R703.1, U762-8 3Y |  |
| `V_GL` | R704.1, U767-3 1Y |  |
| `V_H2` | U706-5 1Q, U707-2 CP, U708-2 CP, U709-2 CP, U710-2 CP, U711-2 CP, U716-2 CP, U717-2 CP, U718-2 CP, U721-1 S, U722-1 S, U723-1 S, U726-11 CP, U727-11 CP, U729-11 CP, U730-11 CP, U733-9 CP, U734-9 CP, U746-3 1CLK, U746-11 2CLK, U757-12 4A, U761-2 1B, U766-9 3A, U770-1 1A |  |
| `V_H2N` | U713-3 1CLK, U745-3 1CLK, U745-11 2CLK, U770-2 1Y |  |
| `V_H3` | U707-14 Q0, U736-2 P0, U768-2 1B, U770-9 4A |  |
| `V_H4` | U707-13 Q1, U736-4 P1, U757-5 2B, U765-4 2A, U772-3 2A |  |
| `V_H5` | U707-12 Q2, U736-6 P2, U765-5 2B, U772-4 2B |  |
| `V_H6` | U707-11 Q3, U736-8 P3, U765-10 3B, U772-5 2C |  |
| `V_H7` | U708-14 Q0, U736-11 P4, U758-10 3B, U765-2 1B |  |
| `V_H8` | U708-13 Q1, U736-13 P5, U757-1 1A, U765-1 1A, U770-11 5A |  |
| `V_H9` | U708-12 Q2, U736-15 P6, U757-2 1B, U758-1 1A, U758-9 3A |  |
| `V_H89` | U757-3 1Y, U757-4 2A |  |
| `V_H984` | U757-6 2Y, U758-4 2A, U768-1 1A |  |
| `V_HBL` | U758-3 1Y, U766-1 1A, U770-5 3A |  |
| `V_HC98` | U758-6 2Y, U768-9 3A |  |
| `V_HEND` | U709-7 CEP, U710-7 CEP, U711-7 CEP, U770-4 2Y, U772-1 1A |  |
| `V_HSA` | U758-11 4Y, U759-4 2A |  |
| `V_HSB` | U759-3 1Y, U759-5 2B |  |
| `V_HSYNC_A` | U733-5 D1, U759-6 2Y |  |
| `V_HSYNCP` | U733-7 Q1, U734-5 D1 |  |
| `V_HSYNCQ` | U734-7 Q1, U735-5 D1 |  |
| `V_HTC0` | U707-15 TC, U708-10 CET |  |
| `V_HVIS` | U716-7 CEP, U716-10 CET, U717-7 CEP, U718-7 CEP, U770-6 3Y |  |
| `V_I` | R702.1, R706.1, U738-12 4Y, U767-1 1A, U769-5 2A |  |
| `V_INC` | U762-11 4Y, U763-5 2B |  |
| `V_LD7` | U706-9 2Q, U764-2 1B, U768-13 4B |  |
| `V_MA0` | U716-14 Q0, U719-2 D0, U721-2 1I0 |  |
| `V_MA1` | U716-13 Q1, U719-3 D1, U721-5 2I0 |  |
| `V_MA2` | U716-12 Q2, U719-4 D2, U721-11 3I0 |  |
| `V_MA3` | U716-11 Q3, U719-5 D3, U721-14 4I0 |  |
| `V_MA4` | U717-14 Q0, U719-6 D4, U722-2 1I0 |  |
| `V_MA5` | U717-13 Q1, U719-7 D5, U722-5 2I0 |  |
| `V_MA6` | U717-12 Q2, U719-8 D6, U722-11 3I0 |  |
| `V_MA7` | U717-11 Q3, U719-9 D7, U722-14 4I0 |  |
| `V_MA8` | U718-14 Q0, U720-2 D0, U723-2 1I0 |  |
| `V_MA9` | U718-13 Q1, U720-3 D1, U723-5 2I0 |  |
| `V_MA10` | U718-12 Q2, U720-4 D2, U723-11 3I0 |  |
| `V_MA11` | U718-11 Q3, U720-5 D3, U723-14 4I0 |  |
| `V_MATC0` | U716-15 TC, U717-10 CET |  |
| `V_MATC1` | U717-15 TC, U718-10 CET |  |
| `V_OPR` | U746-9 2Q, U764-1 1A |  |
| `V_OPR_D` | U746-12 2D, U763-11 4Y |  |
| `V_OPW` | U746-5 1Q, U761-1 1A, U768-12 4A, U772-9 3A, U773-1 1A |  |
| `V_PFCLK` | U739-3 1CLK, U739-11 2CLK, U740-2 CP, U741-2 CP, U742-2 CP, U743-2 CP, U744-11 2CLK, U763-6 2Y |  |
| `V_PIX` | U732-13 Q7, U766-12 4A |  |
| `V_PREF` | U744-9 2Q, U745-12 2D |  |
| `V_PREFS` | U745-9 2Q, U763-12 4A |  |
| `V_Q1` | U705-13 Q1, U757-13 4B |  |
| `V_Q2` | U705-12 Q2, U706-2 1D |  |
| `V_Q15` | U705-15 TC, U706-12 2D |  |
| `V_R` | R701.1, U738-9 3Y, U762-1 1A |  |
| `V_RDCLK` | U750-11 CP, U751-11 CP, U764-3 1Y |  |
| `V_RDD` | U747-2 1D, U769-10 3Y |  |
| `V_RS0` | U716-3 D0, U719-19 Q0 |  |
| `V_RS1` | U716-4 D1, U719-18 Q1 |  |
| `V_RS2` | U716-5 D2, U719-17 Q2 |  |
| `V_RS3` | U716-6 D3, U719-16 Q3 |  |
| `V_RS4` | U717-3 D0, U719-15 Q4 |  |
| `V_RS5` | U717-4 D1, U719-14 Q5 |  |
| `V_RS6` | U717-5 D2, U719-13 Q6 |  |
| `V_RS7` | U717-6 D3, U719-12 Q7 |  |
| `V_RS8` | U718-3 D0, U720-19 Q0 |  |
| `V_RS9` | U718-4 D1, U720-18 Q1 |  |
| `V_RS10` | U718-5 D2, U720-17 Q2 |  |
| `V_RS11` | U718-6 D3, U720-16 Q3 |  |
| `V_RSCLK` | U719-11 CP, U720-11 CP, U766-8 3Y |  |
| `V_SL15` | U760-8 3Y, U766-4 2A |  |
| `V_SOE` | U724-22 ~OE, U725-22 ~OE, U761-3 1Y |  |
| `V_V0` | U709-14 Q0, U728-10 A0, U760-10 3B |  |
| `V_V1` | U709-13 Q1, U712-2 P0, U728-9 A1, U760-5 2B |  |
| `V_V2` | U709-12 Q2, U712-4 P1, U728-8 A2, U757-10 3B |  |
| `V_V3` | U709-11 Q3, U712-6 P2, U728-7 A3, U757-9 3A |  |
| `V_V4` | U710-14 Q0, U712-8 P3, U737-2 P0 |  |
| `V_V5` | U710-13 Q1, U712-11 P4, U737-4 P1, U759-13 4B |  |
| `V_V6` | U710-12 Q2, U712-13 P5, U737-6 P2, U759-12 4A |  |
| `V_V7` | U710-11 Q3, U712-15 P6, U737-8 P3, U759-10 3B |  |
| `V_V8` | U711-14 Q0, U712-17 P7, U737-11 P4, U759-9 3A |  |
| `V_V9` | U711-13 Q1, U712-1 ~E, U737-13 P5, U765-12 4A, U772-2 1B |  |
| `V_V32` | U757-8 3Y, U760-4 2A, U772-13 1C |  |
| `V_V321` | U760-6 2Y, U760-9 3A, U761-10 3B |  |
| `V_VA0` | U721-4 1Y, U724-10 A0, U725-10 A0 |  |
| `V_VA1` | U721-7 2Y, U724-9 A1, U725-9 A1 |  |
| `V_VA2` | U721-9 3Y, U724-8 A2, U725-8 A2 |  |
| `V_VA3` | U721-12 4Y, U724-7 A3, U725-7 A3 |  |
| `V_VA4` | U722-4 1Y, U724-6 A4, U725-6 A4 |  |
| `V_VA5` | U722-7 2Y, U724-5 A5, U725-5 A5 |  |
| `V_VA6` | U722-9 3Y, U724-4 A6, U725-4 A6 |  |
| `V_VA7` | U722-12 4Y, U724-3 A7, U725-3 A7 |  |
| `V_VA8` | U723-4 1Y, U724-25 A8, U725-25 A8 |  |
| `V_VA9` | U723-7 2Y, U724-24 A9, U725-24 A9 |  |
| `V_VA10` | U723-9 3Y, U724-21 A10, U725-21 A10 |  |
| `V_VA11` | U723-12 4Y, U724-23 A11, U725-23 A11 |  |
| `V_VBL` | U713-2 1D, U765-11 4Y, U766-2 1B, U766-5 2B |  |
| `V_VBQ` | U713-5 1Q, U713-11 2CLK, U715-2 A0 |  |
| `V_VCTL` | U747-9 2Q, U752-2 A0, U761-4 2A |  |
| `V_VTC0` | U709-15 TC, U710-10 CET |  |
| `V_VTC1` | U710-15 TC, U711-10 CET |  |
| `V_WREQ` | U744-5 1Q, U745-2 1D |  |
| `V_WREQS` | U745-5 1Q, U746-2 1D |  |
| `V_WRP` | U757-11 4Y, U772-10 3B, U773-2 1B |  |
| `VGA_BLUE` | J701.3, R705.2, R706.2 |  |
| `VGA_GREEN` | J701.2, R703.2, R704.2 |  |
| `VGA_HSYNC` | J701.13, U735-6 ~Q1 |  |
| `VGA_RED` | J701.1, R701.2, R702.2 |  |
| `VGA_VSYNC` | J701.14, U735-10 Q2 |  |
| `VID_OSC` | U705-2 CP, U706-3 1CLK, U706-11 2CLK, U732-7 CP, X701.8 |  |
| `VSYNC_REQ` | U713-9 2Q, U715-3 A1 | arka panel 56 · önceki: Deney 10 |

**Boşta kalan çıkışlar (bağlanmaz):** U701-7 ~Y7, U701-9 ~Y6, U701-10 ~Y5, U701-11 ~Y4, U701-12 ~Y3, U701-14 ~Y1, U701-15 ~Y0, U702-7 ~Y7, U702-9 ~Y6, U702-10 ~Y5, U702-11 ~Y4, U702-15 ~Y0, U703-7 ~Y7, U703-9 ~Y6, U703-10 ~Y5, U703-11 ~Y4, U704-7 ~Y7, U704-9 ~Y6, U704-10 ~Y5, U704-11 ~Y4, U704-12 ~Y3, U705-14 Q0, U706-6 ~1Q, U706-8 ~2Q, U708-11 Q3, U708-15 TC, U711-11 Q3, U711-12 Q2, U711-15 TC, U713-8 ~2Q, U714-3 1Q0, U714-4 1Q1, U714-5 1Q2, U714-8 2Q3, U714-9 2Q2, U714-10 2Q1, U718-15 TC, U720-12 Q7, U720-13 Q6, U720-14 Q5, U720-15 Q4, U733-3 ~Q0, U733-6 ~Q1, U733-11 ~Q2, U733-14 ~Q3, U734-3 ~Q0, U734-6 ~Q1, U734-11 ~Q2, U734-14 ~Q3, U735-3 ~Q0, U735-7 Q1, U735-11 ~Q2, U735-14 ~Q3, U739-5 1Q, U739-9 2Q, U743-11 Q3, U743-12 Q2, U743-13 Q1, U743-15 TC, U744-6 ~1Q, U744-8 ~2Q, U745-8 ~2Q, U747-5 1Q, U747-8 ~2Q, U764-6 2Y, U764-8 3Y, U764-11 4Y, U767-11 4Y, U769-13 4Y, U771-8 4Y, U771-10 5Y, U771-12 6Y, U773-6 2Y, U773-8 3Y
<!-- otomatik: bitti -->
