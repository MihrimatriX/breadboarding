# Deney 11: Video kartı: ekranda Merhaba

> **Video:** "74HC'lerle VGA kartı: ekranda ilk yazı" · **Önce:** Deney 3 (karakter ROM'u programlanır), 8–10 · **Kart:** video kartı (`video`)

Bu deneyin sonunda bilgisayar bir VGA monitöre 80 × 30 metin çizer: mavi zeminde sarı
"Merhaba, CPU16!", altında 16 rengin çubuğu ve her karede bir artan bir sayaç. Kartın kendi
25,175 MHz osilatörü vardır; CPU'dan bağımsız çalışır.

## Ne öğreneceksin

- **VGA zamanlaması**: satır 800 piksel (640 görünür + 16 ön sundurma + 96 senkron + 48 arka
  sundurma), kare 525 satır (480 + 10 + 2 + 33); sayaçlarla (74HC161) ve kod çözen kapılarla üretmek.
- **Metin modu**: karakter kodu ve renk baytı VRAM'den → karakter ROM'u (kod·16 + tarama satırı) →
  kaydırma register'ı (74HC166) → her piksel yazı ya da zemin rengi (IRGB).
- **VRAM'i paylaşmak**: her karakter süresi (8 piksel) ikiye bölünür: ilk yarı tarama, ikinci yarı
  CPU. Ekranda kar oluşmaz, CPU hiç beklemez.
- **Saat alanları**: CPU'nun yazma isteği iki flip-flop'la piksel saatine eşzamanlanır.
- **Ardışık düzen (pipeline)**: karakter bir karakter süresinde okunur, sonrakinde ekrana çıkar; bu
  yüzden senkron ve karartma sinyalleri de aynı sınırda bir register'dan geçer.
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
- Program (`cpu16/kit/programlar/video-deneme.s`): ekranı temizler, yazıyı ve renk çubuğunu yazar,
  sonra `VSTAT`'ı yoklayarak her karede `kare:` sayacını artırır.

## Kurulum adımları

1. Karakter ROM'unu programla (bir SST39SF010A, Deney 3'teki programlayıcıyla):
   ```
   npm run cpu16 -- charrom -o charrom.hex
   python3 cpu16/programlayici/yaz.py PORT charrom.hex --sil --dogrula
   ```
2. Kartı blok blok kur: adres çözme; piksel saati ve sayaçlar (25,175 MHz osilatör); çözümleme ve
   dikey tarama durumu. Monitörü bağlamadan önce osiloskop ya da frekansmetreyle ölç:
   `VGA_HSYNC` 31,47 kHz, `VGA_VSYNC` 59,94 Hz, ikisi de düşük darbeli.
3. Tarama adresi, VRAM, piksel yolu, renk ve DAC, CPU arayüzü, imleç blokları.
4. VGA soketi (DE-15 dişi): 1 kırmızı, 2 yeşil, 3 mavi, 13 HSYNC, 14 VSYNC; 5–8 ve 10 GND.
5. Deneme programını Flash'a yaz ve bellek kartındaki Flash soketine tak:
   ```
   npm run cpu16 -- asm cpu16/kit/programlar/video-deneme.s -o video.hex
   python3 cpu16/programlayici/yaz.py PORT video.hex --sil --dogrula
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
| Ekran rastgele karakterlerle dolu | program çalışmıyor ya da VRAM'e yazılamıyor: VADDR sayacı, yazma isteği eşzamanlayıcısı |
| Karakterler bozuk ama yerleri doğru | karakter ROM'u: programlandı mı; adres = kod·16 + tarama satırı (tarama satırı alt 4 adres biti) |
| Renkler yanlış | IRGB sırası ve DAC dirençleri (renk 680 Ω, parlaklık 1,3 kΩ); 6 kahverengi değil sarımsıysa yeşil düzeltmesi |
| Yazı bir karakter kaymış, renkler doğru | ardışık düzen: renk baytı ile karakter aynı karakter sınırında mı yükleniyor |
| `kare:` sayacı ilerlemiyor | `VSTAT` bit 1: dikey sayacın kod çözümü ve "1 yazınca sil" kapısı |
| Ekranda yazarken kar | CPU yazması tarama yarısına taşıyor: VRAM yazma darbesi yalnız karakterin ikinci yarısında olmalı |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (69 entegre, 78 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC00 | 1 | U764 | 4 × 2 girişli NAND | GND 7, VCC 14 |
| 74HC02 | 1 | U765 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC04 | 2 | U766 U767 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC08 | 8 | U753 U754 U755 U756 U757 U758 U759 U760 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC10 | 2 | U768 U769 | 3 × 3 girişli NAND | GND 7, VCC 14 |
| 74HC32 | 3 | U761 U762 U763 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 6 | U706 U713 U740 U741 U742 U743 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC138 | 4 | U701 U702 U703 U704 | 3'ten 8'e kod çözücü (aktif düşük çıkış) | GND 8, VCC 16 |
| 74HC157 | 4 | U721 U722 U723 U735 | 4 × (2'den 1'e seçici) | GND 8, VCC 16 |
| 74HC161 | 9 | U705 U707 U708 U709 U710 U711 U716 U717 U718 | 4 bit senkron ikili sayıcı (asenkron reset) | GND 8, VCC 16 |
| 74HC166 | 1 | U730 | 8 bit paralel giriş / seri çıkış kaydırmalı register (eşzamanlı yükleme) | GND 8, VCC 16 |
| 74HC175 | 2 | U731 U732 | 4 × D flip-flop (ortak saat, asenkron reset) | GND 8, VCC 16 |
| 74HC193 | 4 | U736 U737 U738 U739 | 4 bit senkron ileri/geri ikili sayıcı (asenkron yükleme ve temizleme) | GND 8, VCC 16 |
| 74HC393 | 1 | U714 | 2 × 4 bit dalgalı (ripple) ikili sayıcı (düşen kenar, asenkron temizleme) | GND 7, VCC 14 |
| 74HC541 | 4 | U715 U748 U751 U752 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 11 | U719 U720 U726 U727 U728 U744 U745 U746 U747 U749 U750 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |
| 74HC688 | 3 | U712 U733 U734 | 8 bit eşitlik karşılaştırıcı | GND 10, VCC 20 |
| 62256 | 2 | U724 U725 | 32 KB statik RAM (32K × 8) | GND 14, VCC 28 |
| SST39SF010A | 1 | U729 | 128 KB Flash (128K × 8, 5 V, komutla programlanır) | VSS 16, VDD 32 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 69 | C702 C703 C704 C705 C706 C707 C708 C709 C710 C711 C712 C713 C714 C715 C716 C717 C718 C719 C720 C721 C722 C723 C724 C725 C726 C727 C728 C729 C730 C731 C732 C733 C734 C735 C736 C737 C738 C739 C740 C741 C742 C743 C744 C745 C746 C747 C748 C749 C750 C751 C752 C753 C754 C755 C756 C757 C758 C759 C760 C761 C762 C763 C764 C765 C766 C767 C768 C769 C770 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C701 | 100 µF elektrolitik kondansatör (kart girişi) |
| CONN_VGA | 1 | J701 | VGA konnektörü (DE-15 HD, dişi) |
| OSC_25M175 | 1 | X701 | 25,175 MHz kristal osilatör modülü (DIP-14 kılıf, 5 V) |
| R_1K3 | 3 | R702 R704 R706 | 1,3 kΩ direnç |
| R_680 | 3 | R701 R703 R705 | 680 Ω direnç |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U753** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (karakter 98 / 99); 3. kapı (yapıştırıcı kapı); 4. kapı (VRAM yazma darbesi (p5–p6))
- **U754** (74HC08, bu deneyde takılır): 1. kapı (hc ≥ 640 (yatay karartma)); 2. kapı (karakter 98: satır başı ← MA); 3. kapı (yapıştırıcı kapı); 4. kapı (karakter 80..95)
- **U755** (74HC08, bu deneyde takılır): 1. kapı (alt 4 bit 2..13); 2. kapı (karakter 82..93: HSYNC (96 piksel)); 3. kapı (yapıştırıcı kapı); 4. kapı (yapıştırıcı kapı)
- **U756** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (tarama satırı 14–15); 3. kapı (karakter satırının son tarama satırı); 4. kapı (VSTAT'a bit1 = 1 yazınca bayrağı sil)
- **U757** (74HC08, bu deneyde takılır): 1. kapı (VRAM çıkışı kapalı: CPU yazıyor); 2. kapı (yapıştırıcı kapı); 3. kapı (yapıştırıcı kapı); 4. kapı (imleç burada)
- **U758** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (renk 6); 3. kapı (yeşil 2/3); 4. kapı (VADDR artırma saati)
- **U759** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (VADDR değişti: ön okuma iste); 3. kapı (yazma isteği alındı); 4. kapı (yazma öncelikli)
- **U760** (74HC08, bu deneyde takılır): 1. kapı (ön okuma latch saati (p7))
- **U761** (74HC32, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (yapıştırıcı kapı); 3. kapı (yapıştırıcı kapı); 4. kapı (vc ≥ 480 (dikey karartma))
- **U762** (74HC32, bu deneyde takılır): 1. kapı (karartma); 2. kapı (yapıştırıcı kapı); 3. kapı (satır başı saati (p4)); 4. kapı (yazı rengi: piksel ya da imleç)
- **U763** (74HC32, bu deneyde takılır): 1. kapı (yeşil 1/3); 2. kapı (VDATA oku: karakter şeridi); 3. kapı (VDATA oku: renk şeridi)
- **U764** (74HC00, bu deneyde takılır): 1. kapı (karakter 99 (satır sonu)); 2. kapı (yapıştırıcı kapı); 3. kapı (satır başını güncelle (karakter 98)); 4. kapı (yazma bitti: VADDR + 1 (p7))
- **U765** (74HC02, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (yapıştırıcı kapı); 3. kapı (VDATA okunuyor (A0 = 0))
- **U766** (74HC04, bu deneyde takılır): 1. kapı (reset (aktif yüksek)); 2. kapı (CPU yuvası bitti (p0)); 3. kapı (satır sonu); 4. kapı (görünür karakter (MA sayar)); 5. kapı (yapıştırıcı kapı); 6. kapı (yapıştırıcı kapı)
- **U767** (74HC04, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (yapıştırıcı kapı); 3. kapı (yapıştırıcı kapı); 4. kapı (yapıştırıcı kapı)
- **U768** (74HC10, bu deneyde takılır): 1. kapı (vc = 524 ve satır sonu: kare sonu); 2. kapı (yapıştırıcı kapı); 3. kapı (karakter şeridine yaz (VADDR çift))
- **U769** (74HC10, bu deneyde takılır): 1. kapı (renk şeridine yaz (VADDR tek))

#### Bağlantılar (282 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U705-4 D1, U705-5 D2, U707-3 D0, U707-4 D1, U707-5 D2, U707-6 D3, U708-3 D0, U708-4 D1, U708-5 D2, U708-6 D3, U709-3 D0, U709-4 D1, U709-5 D2, U709-6 D3, U710-3 D0, U710-4 D1, U710-5 D2, U710-6 D3, U711-3 D0, U711-4 D1, U711-5 D2, U711-6 D3, U712-5 Q1, U712-9 Q3, U714-2 1MR, U714-12 2MR, U715-4 A2, U715-5 A3, U715-6 A4, U715-7 A5, U715-8 A6, U715-9 A7, U715-19 ~OE2, U719-1 ~OE, U720-1 ~OE, U720-6 D4, U720-7 D5, U720-8 D6, U720-9 D7, U721-15 ~E, U722-15 ~E, U723-15 ~E, U724-1 A14, U724-2 A12, U724-20 ~CE, U724-26 A13, U725-1 A14, U725-2 A12, U725-20 ~CE, U725-26 A13, U726-1 ~OE, U727-1 ~OE, U728-1 ~OE, U729-2 A16, U729-3 A15, U729-4 A12, U729-22 ~CE, U729-24 ~OE, U729-28 A13, U729-29 A14, U730-1 DS, U730-6 ~CE, U733-1 ~E, U733-17 P7, U734-1 ~E, U734-15 P6, U734-17 P7, U748-3 A1, U748-4 A2, U748-5 A3, U748-6 A4, U748-7 A5, U748-8 A6, U748-9 A7, U748-19 ~OE2, U749-1 ~OE, U750-1 ~OE, U751-19 ~OE2, U752-19 ~OE2, U760-4 2A, U760-5 2B, U760-9 3A, U760-10 3B, U760-12 4A, U760-13 4B, U763-12 4A, U763-13 4B, U765-11 4A, U765-12 4B, U767-11 5A, U767-13 6A, U769-3 2A, U769-4 2B, U769-5 2C, U769-9 3A, U769-10 3B, U769-11 3C | sabit seviye |
| **VCC** | U701-6 E3, U702-6 E3, U703-6 E3, U704-6 E3, U705-1 ~MR, U705-3 D0, U705-6 D3, U705-7 CEP, U705-10 CET, U706-1 ~1CLR, U706-4 ~1PRE, U706-10 ~2PRE, U706-13 ~2CLR, U707-1 ~MR, U707-7 CEP, U707-10 CET, U708-1 ~MR, U708-7 CEP, U709-1 ~MR, U709-10 CET, U710-1 ~MR, U711-1 ~MR, U712-3 Q0, U712-7 Q2, U712-12 Q4, U712-14 Q5, U712-16 Q6, U712-18 Q7, U713-1 ~1CLR, U713-4 ~1PRE, U713-10 ~2PRE, U713-12 2D, U729-31 ~WE, U730-9 ~MR, U731-1 ~MR, U732-1 ~MR, U736-4 CPD, U737-4 CPD, U738-4 CPD, U739-4 CPD, U740-2 1D, U740-4 ~1PRE, U740-12 2D, U741-4 ~1PRE, U741-10 ~2PRE, U742-4 ~1PRE, U742-10 ~2PRE, U743-4 ~1PRE, U743-10 ~2PRE | sabit seviye |
| `~IO` | U701-4 ~E1 | arka panel 47 · önceki: Deney 8, 10 |
| `~MRD` | U702-5 ~E2 | arka panel 41 · önceki: Deney 6, 8, 9, 10 |
| `~MWE_E` | U703-5 ~E2 | arka panel 42 · önceki: Deney 6, 8, 9, 10 |
| `~MWE_O` | U704-5 ~E2 | arka panel 43 · önceki: Deney 6, 8, 10 |
| `~RESET` | U740-10 ~2PRE, U741-1 ~1CLR, U741-13 ~2CLR, U742-1 ~1CLR, U742-13 ~2CLR, U743-1 ~1CLR, U743-13 ~2CLR, U756-12 4A, U759-10 3B, U766-1 1A | arka panel 7 · önceki: Deney 1, 5, 6, 7, 8, 9, 10 |
| `~V_ADR0` | U763-10 3B, U767-4 2Y, U768-11 3C |  |
| `~V_CXEQ` | U733-19 ~EQ, U765-2 1A |  |
| `~V_CYEQ` | U734-19 ~EQ, U765-3 1B |  |
| `~V_ENRS` | U762-10 3B, U764-8 3Y |  |
| `~V_FCLR` | U713-13 ~2CLR, U756-11 4Y |  |
| `~V_G` | U701-13 ~Y2, U702-4 ~E1, U703-4 ~E1, U704-4 ~E1 |  |
| `~V_HEND` | U707-9 ~PE, U708-9 ~PE, U716-9 ~PE, U717-9 ~PE, U718-9 ~PE, U764-3 1Y, U766-5 3A |  |
| `~V_LD7` | U705-9 ~PE, U705-11 Q3, U728-11 CP, U730-15 ~PE, U732-9 CP |  |
| `~V_OPR` | U740-13 ~2CLR, U742-8 ~2Q |  |
| `~V_OPW` | U742-6 ~1Q, U759-9 3A |  |
| `~V_RD1` | U702-14 ~Y1, U748-1 ~OE1, U763-4 2A, U763-9 3A, U765-8 3A |  |
| `~V_RD2` | U702-13 ~Y2, U751-1 ~OE1, U752-1 ~OE1 |  |
| `~V_RD3` | U702-12 ~Y3, U715-1 ~OE1 |  |
| `~V_RDA` | U747-1 ~OE, U763-8 3Y |  |
| `~V_RDC` | U746-1 ~OE, U763-6 2Y |  |
| `~V_RDDQ` | U743-6 ~1Q, U758-12 4A |  |
| `~V_VBQ` | U713-6 ~1Q, U714-1 ~1CP, U716-1 ~MR, U717-1 ~MR, U718-1 ~MR |  |
| `~V_VLD` | U709-9 ~PE, U710-9 ~PE, U711-9 ~PE, U768-12 1Y |  |
| `~V_VSYNC_A` | U712-19 ~EQ, U731-12 D2 |  |
| `~V_VSYNCP` | U731-10 Q2, U732-12 D2 |  |
| `~V_VTCU0` | U736-12 ~TCU, U737-5 CPU |  |
| `~V_VTCU1` | U737-12 ~TCU, U738-5 CPU |  |
| `~V_VTCU2` | U738-12 ~TCU, U739-5 CPU |  |
| `~V_WE0` | U703-15 ~Y0, U736-11 ~PL, U737-11 ~PL, U759-1 1A |  |
| `~V_WE1` | U703-14 ~Y1, U740-3 1CLK, U744-11 CP, U745-11 CP |  |
| `~V_WE2` | U703-13 ~Y2, U749-11 CP |  |
| `~V_WE3` | U703-12 ~Y3, U767-1 1A |  |
| `~V_WEA` | U725-27 ~WE, U745-1 ~OE, U769-12 1Y |  |
| `~V_WEC` | U724-27 ~WE, U744-1 ~OE, U768-8 3Y |  |
| `~V_WINC` | U758-13 4B, U764-11 4Y |  |
| `~V_WO0` | U704-15 ~Y0, U738-11 ~PL, U739-11 ~PL, U759-2 1B |  |
| `~V_WO1` | U704-14 ~Y1, U743-11 2CLK |  |
| `~V_WO2` | U704-13 ~Y2, U750-11 CP |  |
| `~V_WRCLR` | U740-1 ~1CLR, U759-8 3Y |  |
| `~V_WREQS` | U741-6 ~1Q, U759-13 4B |  |
| `A0` | U765-9 3B | arka panel 9 · önceki: Deney 6, 10 |
| `A1` | U702-1 A0, U703-1 A0, U704-1 A0 | arka panel 10 · önceki: Deney 6, 8, 9, 10 |
| `A2` | U702-2 A1, U703-2 A1, U704-2 A1 | arka panel 11 · önceki: Deney 6, 8, 9, 10 |
| `A3` | U702-3 A2, U703-3 A2, U704-3 A2 | arka panel 12 · önceki: Deney 6, 8, 9, 10 |
| `A4` | U701-1 A0 | arka panel 13 · önceki: Deney 6, 8, 9, 10 |
| `A5` | U701-2 A1 | arka panel 14 · önceki: Deney 6, 8, 9, 10 |
| `A6` | U701-3 A2 | arka panel 15 · önceki: Deney 6, 8, 9, 10 |
| `A7` | U701-5 ~E2 | arka panel 16 · önceki: Deney 6, 8, 9, 10 |
| `CLK` | U743-3 1CLK | arka panel 5 · önceki: Deney 1, 6, 7, 8, 9, 10 |
| `DE0` | U715-18 Y0, U736-15 D0, U744-2 D0, U745-2 D0, U746-19 Q0, U747-19 Q0, U749-2 D0, U751-18 Y0 | arka panel 25 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE1` | U715-17 Y1, U736-1 D1, U744-3 D1, U745-3 D1, U746-18 Q1, U747-18 Q1, U749-3 D1, U751-17 Y1, U764-5 2B | arka panel 26 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE2` | U715-16 Y2, U736-10 D2, U744-4 D2, U745-4 D2, U746-17 Q2, U747-17 Q2, U749-4 D2, U751-16 Y2 | arka panel 27 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE3` | U715-15 Y3, U736-9 D3, U744-5 D3, U745-5 D3, U746-16 Q3, U747-16 Q3, U749-5 D3, U751-15 Y3 | arka panel 28 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE4` | U715-14 Y4, U737-15 D0, U744-6 D4, U745-6 D4, U746-15 Q4, U747-15 Q4, U749-6 D4, U751-14 Y4 | arka panel 29 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE5` | U715-13 Y5, U737-1 D1, U744-7 D5, U745-7 D5, U746-14 Q5, U747-14 Q5, U749-7 D5, U751-13 Y5 | arka panel 30 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE6` | U715-12 Y6, U737-10 D2, U744-8 D6, U745-8 D6, U746-13 Q6, U747-13 Q6, U749-8 D6, U751-12 Y6 | arka panel 31 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DE7` | U715-11 Y7, U737-9 D3, U744-9 D7, U745-9 D7, U746-12 Q7, U747-12 Q7, U749-9 D7, U751-11 Y7 | arka panel 32 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO0` | U738-15 D0, U743-12 2D, U748-18 Y0, U750-2 D0, U752-18 Y0 | arka panel 33 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO1` | U738-1 D1, U748-17 Y1, U750-3 D1, U752-17 Y1 | arka panel 34 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO2` | U738-10 D2, U748-16 Y2, U750-4 D2, U752-16 Y2 | arka panel 35 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO3` | U738-9 D3, U748-15 Y3, U750-5 D3, U752-15 Y3 | arka panel 36 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO4` | U739-15 D0, U748-14 Y4, U750-6 D4, U752-14 Y4 | arka panel 37 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO5` | U739-1 D1, U748-13 Y5, U750-7 D5, U752-13 Y5 | arka panel 38 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO6` | U739-10 D2, U748-12 Y6, U750-8 D6, U752-12 Y6 | arka panel 39 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| `DO7` | U739-9 D3, U748-11 Y7, U750-9 D7, U752-11 Y7 | arka panel 40 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9, 10 |
| (adsız) | U754-2 1B, U761-3 1Y |  |
| (adsız) | U754-5 2B, U766-10 5Y |  |
| (adsız) | U754-8 3Y, U754-12 4A |  |
| (adsız) | U754-13 4B, U766-12 6Y |  |
| (adsız) | U761-6 2Y, U761-9 3A |  |
| (adsız) | U755-1 1A, U761-8 3Y |  |
| (adsız) | U755-2 1B, U768-6 2Y |  |
| (adsız) | U755-8 3Y, U756-1 1A |  |
| (adsız) | U755-11 4Y, U756-2 1B |  |
| (adsız) | U756-3 1Y, U761-13 4B |  |
| (adsız) | U764-4 2A, U767-2 1Y |  |
| (adsız) | U756-13 4B, U764-6 2Y |  |
| (adsız) | U762-6 2Y, U764-10 3B |  |
| (adsız) | U757-5 2B, U767-6 3Y |  |
| (adsız) | U757-6 2Y, U757-12 4A |  |
| (adsız) | U757-9 3A, U765-1 1Y |  |
| (adsız) | U757-8 3Y, U757-13 4B |  |
| (adsız) | U758-3 1Y, U758-4 2A |  |
| (adsız) | U758-5 2B, U765-4 2Y |  |
| (adsız) | U758-10 3B, U767-8 4Y |  |
| (adsız) | U759-3 1Y, U759-4 2A |  |
| `V_AD0` | U725-11 IO0, U727-2 D0, U745-19 Q0, U747-2 D0 |  |
| `V_AD1` | U725-12 IO1, U727-3 D1, U745-18 Q1, U747-3 D1 |  |
| `V_AD2` | U725-13 IO2, U727-4 D2, U745-17 Q2, U747-4 D2 |  |
| `V_AD3` | U725-15 IO3, U727-5 D3, U745-16 Q3, U747-5 D3 |  |
| `V_AD4` | U725-16 IO4, U727-6 D4, U745-15 Q4, U747-6 D4 |  |
| `V_AD5` | U725-17 IO5, U727-7 D5, U745-14 Q5, U747-7 D5 |  |
| `V_AD6` | U725-18 IO6, U727-8 D6, U745-13 Q6, U747-8 D6 |  |
| `V_AD7` | U725-19 IO7, U727-9 D7, U745-12 Q7, U747-9 D7 |  |
| `V_ADR0` | U736-3 Q0, U763-5 2B, U767-3 2A, U769-13 1C |  |
| `V_ADR1` | U721-3 1I1, U736-2 Q1 |  |
| `V_ADR2` | U721-6 2I1, U736-6 Q2 |  |
| `V_ADR3` | U721-10 3I1, U736-7 Q3 |  |
| `V_ADR4` | U721-13 4I1, U737-3 Q0 |  |
| `V_ADR5` | U722-3 1I1, U737-2 Q1 |  |
| `V_ADR6` | U722-6 2I1, U737-6 Q2 |  |
| `V_ADR7` | U722-10 3I1, U737-7 Q3 |  |
| `V_ADR8` | U722-13 4I1, U738-3 Q0 |  |
| `V_ADR9` | U723-3 1I1, U738-2 Q1 |  |
| `V_ADR10` | U723-6 2I1, U738-6 Q2 |  |
| `V_ADR11` | U723-10 3I1, U738-7 Q3 |  |
| `V_ADR12` | U723-13 4I1, U739-3 Q0 |  |
| `V_AT0` | U727-19 Q0, U728-2 D0 |  |
| `V_AT1` | U727-18 Q1, U728-3 D1 |  |
| `V_AT2` | U727-17 Q2, U728-4 D2 |  |
| `V_AT3` | U727-16 Q3, U728-5 D3 |  |
| `V_AT4` | U727-15 Q4, U728-6 D4 |  |
| `V_AT5` | U727-14 Q5, U728-7 D5 |  |
| `V_AT6` | U727-13 Q6, U728-8 D6 |  |
| `V_AT7` | U727-12 Q7, U728-9 D7 |  |
| `V_ATD0` | U728-19 Q0, U735-3 1I1 |  |
| `V_ATD1` | U728-18 Q1, U735-6 2I1 |  |
| `V_ATD2` | U728-17 Q2, U735-10 3I1 |  |
| `V_ATD3` | U728-16 Q3, U735-13 4I1 |  |
| `V_ATD4` | U728-15 Q4, U735-2 1I0 |  |
| `V_ATD5` | U728-14 Q5, U735-5 2I0 |  |
| `V_ATD6` | U728-13 Q6, U735-11 3I0 |  |
| `V_ATD7` | U728-12 Q7, U735-14 4I0 |  |
| `V_B` | R705.1, U735-4 1Y, U765-6 2B |  |
| `V_BLANK` | U731-4 D0, U762-3 1Y |  |
| `V_BLANKD` | U732-2 Q0, U735-15 ~E |  |
| `V_BLANKP` | U731-2 Q0, U732-4 D0 |  |
| `V_BLINK` | U714-11 2Q0, U767-5 3A |  |
| `V_BROWN` | U758-6 2Y, U763-2 1B, U767-9 4A |  |
| `V_CD0` | U724-11 IO0, U726-2 D0, U744-19 Q0, U746-2 D0 |  |
| `V_CD1` | U724-12 IO1, U726-3 D1, U744-18 Q1, U746-3 D1 |  |
| `V_CD2` | U724-13 IO2, U726-4 D2, U744-17 Q2, U746-4 D2 |  |
| `V_CD3` | U724-15 IO3, U726-5 D3, U744-16 Q3, U746-5 D3 |  |
| `V_CD4` | U724-16 IO4, U726-6 D4, U744-15 Q4, U746-6 D4 |  |
| `V_CD5` | U724-17 IO5, U726-7 D5, U744-14 Q5, U746-7 D5 |  |
| `V_CD6` | U724-18 IO6, U726-8 D6, U744-13 Q6, U746-8 D6 |  |
| `V_CD7` | U724-19 IO7, U726-9 D7, U744-12 Q7, U746-9 D7 |  |
| `V_CHR0` | U726-19 Q0, U729-8 A4 |  |
| `V_CHR1` | U726-18 Q1, U729-7 A5 |  |
| `V_CHR2` | U726-17 Q2, U729-6 A6 |  |
| `V_CHR3` | U726-16 Q3, U729-5 A7 |  |
| `V_CHR4` | U726-15 Q4, U729-27 A8 |  |
| `V_CHR5` | U726-14 Q5, U729-26 A9 |  |
| `V_CHR6` | U726-13 Q6, U729-23 A10 |  |
| `V_CHR7` | U726-12 Q7, U729-25 A11 |  |
| `V_CURD` | U732-15 Q3, U762-13 4B |  |
| `V_CURP` | U731-15 Q3, U732-13 D3 |  |
| `V_CURR` | U731-13 D3, U757-11 4Y |  |
| `V_CX0` | U733-3 Q0, U749-19 Q0, U751-2 A0 |  |
| `V_CX1` | U733-5 Q1, U749-18 Q1, U751-3 A1 |  |
| `V_CX2` | U733-7 Q2, U749-17 Q2, U751-4 A2 |  |
| `V_CX3` | U733-9 Q3, U749-16 Q3, U751-5 A3 |  |
| `V_CX4` | U733-12 Q4, U749-15 Q4, U751-6 A4 |  |
| `V_CX5` | U733-14 Q5, U749-14 Q5, U751-7 A5 |  |
| `V_CX6` | U733-16 Q6, U749-13 Q6, U751-8 A6 |  |
| `V_CX7` | U733-18 Q7, U749-12 Q7, U751-9 A7 |  |
| `V_CY0` | U734-3 Q0, U750-19 Q0, U752-2 A0 |  |
| `V_CY1` | U734-5 Q1, U750-18 Q1, U752-3 A1 |  |
| `V_CY2` | U734-7 Q2, U750-17 Q2, U752-4 A2 |  |
| `V_CY3` | U734-9 Q3, U750-16 Q3, U752-5 A3 |  |
| `V_CY4` | U734-12 Q4, U750-15 Q4, U752-6 A4 |  |
| `V_CY5` | U734-14 Q5, U750-14 Q5, U752-7 A5 |  |
| `V_CY6` | U734-16 Q6, U750-13 Q6, U752-8 A6 |  |
| `V_CY7` | U734-18 Q7, U750-12 Q7, U752-9 A7 |  |
| `V_FD0` | U729-13 DQ0, U730-2 D0 |  |
| `V_FD1` | U729-14 DQ1, U730-3 D1 |  |
| `V_FD2` | U729-15 DQ2, U730-4 D2 |  |
| `V_FD3` | U729-17 DQ3, U730-5 D3 |  |
| `V_FD4` | U729-18 DQ4, U730-10 D4 |  |
| `V_FD5` | U729-19 DQ5, U730-11 D5 |  |
| `V_FD6` | U729-20 DQ6, U730-12 D6 |  |
| `V_FD7` | U729-21 DQ7, U730-14 D7 |  |
| `V_FGSEL` | U735-1 S, U762-11 4Y |  |
| `V_FR3` | U714-6 1Q3, U714-13 ~2CP |  |
| `V_G` | U735-7 2Y, U758-2 1B, U758-9 3A |  |
| `V_GH` | R703.1, U758-8 3Y |  |
| `V_GL` | R704.1, U763-3 1Y |  |
| `V_H2` | U706-5 1Q, U707-2 CP, U708-2 CP, U709-2 CP, U710-2 CP, U711-2 CP, U716-2 CP, U717-2 CP, U718-2 CP, U721-1 S, U722-1 S, U723-1 S, U726-11 CP, U727-11 CP, U731-9 CP, U742-3 1CLK, U742-11 2CLK, U753-12 4A, U757-2 1B, U762-9 3A, U766-3 2A |  |
| `V_H2N` | U713-3 1CLK, U741-3 1CLK, U741-11 2CLK, U766-4 2Y |  |
| `V_H3` | U707-14 Q0, U733-2 P0, U764-2 1B, U766-11 5A |  |
| `V_H4` | U707-13 Q1, U733-4 P1, U753-5 2B, U761-4 2A, U768-3 2A |  |
| `V_H5` | U707-12 Q2, U733-6 P2, U761-5 2B, U768-4 2B |  |
| `V_H6` | U707-11 Q3, U733-8 P3, U761-10 3B, U768-5 2C |  |
| `V_H7` | U708-14 Q0, U733-11 P4, U754-10 3B, U761-2 1B |  |
| `V_H8` | U708-13 Q1, U733-13 P5, U753-1 1A, U761-1 1A, U766-13 6A |  |
| `V_H9` | U708-12 Q2, U733-15 P6, U753-2 1B, U754-1 1A, U754-9 3A |  |
| `V_H89` | U753-3 1Y, U753-4 2A |  |
| `V_H984` | U753-6 2Y, U754-4 2A, U764-1 1A |  |
| `V_HBL` | U754-3 1Y, U762-1 1A, U766-9 4A |  |
| `V_HC98` | U754-6 2Y, U764-9 3A |  |
| `V_HEND` | U709-7 CEP, U710-7 CEP, U711-7 CEP, U766-6 3Y, U768-1 1A |  |
| `V_HSA` | U754-11 4Y, U755-4 2A |  |
| `V_HSB` | U755-3 1Y, U755-5 2B |  |
| `V_HSYNC_A` | U731-5 D1, U755-6 2Y |  |
| `V_HSYNCP` | U731-7 Q1, U732-5 D1 |  |
| `V_HTC0` | U707-15 TC, U708-10 CET |  |
| `V_HVIS` | U716-7 CEP, U716-10 CET, U717-7 CEP, U718-7 CEP, U766-8 4Y |  |
| `V_I` | R702.1, R706.1, U735-12 4Y, U763-1 1A, U765-5 2A |  |
| `V_INC` | U736-5 CPU, U758-11 4Y, U759-5 2B |  |
| `V_LD7` | U706-9 2Q, U760-2 1B, U764-13 4B |  |
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
| `V_OPR` | U742-9 2Q, U760-1 1A |  |
| `V_OPR_D` | U742-12 2D, U759-11 4Y |  |
| `V_OPW` | U742-5 1Q, U757-1 1A, U764-12 4A, U768-9 3A, U769-1 1A |  |
| `V_PFCLK` | U740-11 2CLK, U759-6 2Y |  |
| `V_PIX` | U730-13 Q7, U762-12 4A |  |
| `V_PREF` | U740-9 2Q, U741-12 2D |  |
| `V_PREFS` | U741-9 2Q, U759-12 4A |  |
| `V_Q1` | U705-13 Q1, U753-13 4B |  |
| `V_Q2` | U705-12 Q2, U706-2 1D |  |
| `V_Q15` | U705-15 TC, U706-12 2D |  |
| `V_R` | R701.1, U735-9 3Y, U758-1 1A |  |
| `V_RDCLK` | U746-11 CP, U747-11 CP, U760-3 1Y |  |
| `V_RDD` | U743-2 1D, U765-10 3Y |  |
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
| `V_RSCLK` | U719-11 CP, U720-11 CP, U762-8 3Y |  |
| `V_RST` | U736-14 MR, U737-14 MR, U738-14 MR, U739-14 MR, U766-2 1Y |  |
| `V_SL15` | U756-8 3Y, U762-4 2A |  |
| `V_SOE` | U724-22 ~OE, U725-22 ~OE, U757-3 1Y |  |
| `V_V0` | U709-14 Q0, U729-12 A0, U756-10 3B |  |
| `V_V1` | U709-13 Q1, U712-2 P0, U729-11 A1, U756-5 2B |  |
| `V_V2` | U709-12 Q2, U712-4 P1, U729-10 A2, U753-10 3B |  |
| `V_V3` | U709-11 Q3, U712-6 P2, U729-9 A3, U753-9 3A |  |
| `V_V4` | U710-14 Q0, U712-8 P3, U734-2 P0 |  |
| `V_V5` | U710-13 Q1, U712-11 P4, U734-4 P1, U755-13 4B |  |
| `V_V6` | U710-12 Q2, U712-13 P5, U734-6 P2, U755-12 4A |  |
| `V_V7` | U710-11 Q3, U712-15 P6, U734-8 P3, U755-10 3B |  |
| `V_V8` | U711-14 Q0, U712-17 P7, U734-11 P4, U755-9 3A |  |
| `V_V9` | U711-13 Q1, U712-1 ~E, U734-13 P5, U761-12 4A, U768-2 1B |  |
| `V_V32` | U753-8 3Y, U756-4 2A, U768-13 1C |  |
| `V_V321` | U756-6 2Y, U756-9 3A, U757-10 3B |  |
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
| `V_VBL` | U713-2 1D, U761-11 4Y, U762-2 1B, U762-5 2B |  |
| `V_VBQ` | U713-5 1Q, U713-11 2CLK, U715-2 A0 |  |
| `V_VCTL` | U743-9 2Q, U748-2 A0, U757-4 2A |  |
| `V_VTC0` | U709-15 TC, U710-10 CET |  |
| `V_VTC1` | U710-15 TC, U711-10 CET |  |
| `V_WREQ` | U740-5 1Q, U741-2 1D |  |
| `V_WREQS` | U741-5 1Q, U742-2 1D |  |
| `V_WRP` | U753-11 4Y, U768-10 3B, U769-2 1B |  |
| `VGA_BLUE` | J701.3, R705.2, R706.2 |  |
| `VGA_GREEN` | J701.2, R703.2, R704.2 |  |
| `VGA_HSYNC` | J701.13, U732-6 ~Q1 |  |
| `VGA_RED` | J701.1, R701.2, R702.2 |  |
| `VGA_VSYNC` | J701.14, U732-10 Q2 |  |
| `VID_OSC` | U705-2 CP, U706-3 1CLK, U706-11 2CLK, U730-7 CP, X701.8 |  |
| `VSYNC_REQ` | U713-9 2Q, U715-3 A1 | arka panel 56 · önceki: Deney 10 |

**Boşta kalan çıkışlar (bağlanmaz):** U701-7 ~Y7, U701-9 ~Y6, U701-10 ~Y5, U701-11 ~Y4, U701-12 ~Y3, U701-14 ~Y1, U701-15 ~Y0, U702-7 ~Y7, U702-9 ~Y6, U702-10 ~Y5, U702-11 ~Y4, U702-15 ~Y0, U703-7 ~Y7, U703-9 ~Y6, U703-10 ~Y5, U703-11 ~Y4, U704-7 ~Y7, U704-9 ~Y6, U704-10 ~Y5, U704-11 ~Y4, U704-12 ~Y3, U705-14 Q0, U706-6 ~1Q, U706-8 ~2Q, U708-11 Q3, U708-15 TC, U711-11 Q3, U711-12 Q2, U711-15 TC, U713-8 ~2Q, U714-3 1Q0, U714-4 1Q1, U714-5 1Q2, U714-8 2Q3, U714-9 2Q2, U714-10 2Q1, U718-15 TC, U720-12 Q7, U720-13 Q6, U720-14 Q5, U720-15 Q4, U731-3 ~Q0, U731-6 ~Q1, U731-11 ~Q2, U731-14 ~Q3, U732-3 ~Q0, U732-7 Q1, U732-11 ~Q2, U732-14 ~Q3, U736-13 ~TCD, U737-13 ~TCD, U738-13 ~TCD, U739-2 Q1, U739-6 Q2, U739-7 Q3, U739-12 ~TCU, U739-13 ~TCD, U740-6 ~1Q, U740-8 ~2Q, U741-8 ~2Q, U743-5 1Q, U743-8 ~2Q, U760-6 2Y, U760-8 3Y, U760-11 4Y, U763-11 4Y, U765-13 4Y, U767-10 5Y, U767-12 6Y, U769-6 2Y, U769-8 3Y
<!-- otomatik: bitti -->
