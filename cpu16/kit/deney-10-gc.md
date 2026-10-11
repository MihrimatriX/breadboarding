# Deney 10: G/Ç kartı: UART, zamanlayıcı, kesmeler, klavye

> **Video:** "Bilgisayar dünyayla konuşuyor: seri port, saat ve kesmeler" · **Önce:** Deney 8–9 (bellek ve önbellek kartları) · **Kart:** G/Ç kartı (`gc`)

Bu deneyin sonunda bilgisayar ilk kez dışarıyla konuşur: bilgisayarındaki terminale yazı yollar,
yazdıklarını geri yankılar, saniyede bir zamanlayıcı kesmesiyle nokta koyar ve PS/2 klavyenin
tuşlarını tarama kodu olarak gösterir. CPU bu sırada `HALT` ile uyur; her şey kesmeyle olur.

## Ne öğreneceksin

- **Adres çözme**: `FF00–FF0B` aralığını dört 74HC138'in nasıl register'lara böldüğü; okuma ve
  yazma darbelerinin ayrı çözücülerden gelmesi.
- **UART'ı kapılarla kurmak**: 74HC165 ile paralelden seriye (verici), 74HC595 ile seriden paralele
  (alıcı), bit süresini sayan 74HC161 bölücüler; başlangıç bitinin ortasından örnekleme.
- **Eşzamanlama**: dışarıdan gelen RX hattı iki flip-flop'tan geçer; neden tek flip-flop yetmez.
- **Zamanlayıcı**: ön bölücü (TCLK / 4000) ve 74HC193 aşağı sayıcılarla programlanabilir kesme.
- **Kesme denetleyicisi**: 74HC148 öncelik kodlayıcı, maske register'ı ve "en öncelikli kaynak"
  (`IRQ_SRC`) register'ı; kesme işleyicinin kaynakları döngüyle boşaltması.
- **PS/2**: klavyenin kendi saatiyle gelen 11 bitlik çerçeve; açık akaç (74HC05) ile klavyeyi bekletmek.

## Nasıl çalışır

- Register haritası `cpu16/docs/anakart.md` ("G/Ç haritası"): `FF00` UART_DATA, `FF01` UART_STAT,
  `FF02/03` klavye, `FF04–07` zamanlayıcı, `FF08–0A` kesmeler.
- Zaman tabanı **TCLK**'dir (saat kartı: osilatör / 8, CPU saatiyle aynı hızda ama ADIM kipinde de
  durmaz). UART'ın bir baytı 347 TCLK sürer: 4 MHz'de 115 200 baud, **1 MHz'de 28 800 baud**.
  Zamanlayıcının ön bölücüsü TCLK / 4000: 4 MHz'de 1 kHz, 1 MHz'de 250 Hz.
- Okuma yan etkileri: `UART_DATA` ya da `KBD_DATA` okununca "hazır" biti silinir. Silme, CPU'nun
  veriyi aldığı saat kenarında bir flip-flop'a yakalanır ve bir sonraki döngüde yapılır; böylece
  okuma sırasında hazır biti değişmez.
- Kesme: `IRQ_PEND` bitleri `IRQ_MASK` ile VE'lenip 74HC148'e girer. Herhangi biri 1 ise IRQ hattı
  CPU'ya gider; CPU `0x0002`'ye atlar. İşleyici `IRQ_SRC`'yi okur, kaynağı onaylar (ör. `EXPIRED`'a
  1 yazar ya da `UART_DATA`'yı okur) ve `IRQ_SRC` `0xFF` olana kadar tekrarlar.
- Kartın tasarım notları ve zamanlama ayrıntıları: `cpu16/board/io-card.ts` (baştaki açıklamalar),
  zamanlama sonuçları: `cpu16/docs/uretim.md`.

## Kurulum adımları

1. Kartı aşağıdaki malzeme ve bağlantı tablosuna göre blok blok kur: adres çözme, okuma yan
   etkileri ve sinyal düzeltme, UART, PS/2, zamanlayıcı, kesme denetleyicisi, durum register'ları.
   Kart arka panele takılıyken her blok bitince bir sonraki adımdaki programla sınanabilir: hangi
   satırın çalıştığı hangi bloğun hazır olduğunu söyler.
2. Deneme programını Flash'a yaz (Deney 3'teki programlayıcıyla; BIOS'a kadar programlar Flash'tan çalışır):
   ```
   npm run cpu16 -- asm cpu16/kit/programlar/gc-deneme.s -o gc.hex
   python3 cpu16/programlayici/yaz.py PORT gc.hex --sil --dogrula
   ```
3. USB-UART modülünü (CH340, 5 V lojik) kartın 6 pinli UART yuvasına tak: 1 GND, 2 CTS#, 4 TXD, 5 RXD.
   Yuvanın 3. pini (VCC) boştur: kart kendi adaptöründen beslenir, USB'nin 5 V'u karta bağlanmaz.
4. Bilgisayarda bir terminal aç: 1 MHz CPU için **28 800 baud**, 8N1 (ör. `screen /dev/ttyUSB0 28800`).
5. PS/2 klavyeyi tak ve RESET'e bas.

## Test: beklenen sonuç

| Adım | Beklenen |
|---|---|
| RESET | terminalde `G/C KARTI: nokta = zamanlayici, yazilan = UART yankisi, [kod] = klavye` |
| bekle | 1 MHz'de saniyede bir `.` (4 MHz'de saniyede dört) |
| terminalde `Selam` yaz | `Selam` geri gelir |
| klavyede A'ya bas ve bırak | `[1C][F0][1C]`: basma kodu, bırakma öneki, aynı kod |

Osiloskop ya da mantık analizörüyle bakılacaklar: `UART_TXD` hattında bir bit 1 MHz'de ≈34,7 µs;
IRQ hattı her noktada kısa bir süre yüksek; klavye bayt bekletirken `PS2_CLK` düşük tutulur.

## Simülatörde

- `npm run cpu16 -- machine cpu16/kit/programlar/gc-deneme.s --rom`: program, Flash'a yazılmış gibi
  BIOS'suz çalışır; terminale yazdıkların UART'a gider (çıkış: Ctrl-]). Klavye için Web IDE'nin
  **Anakart + BIOS** kipi aynı G/Ç modelini kullanır.
- Kapı seviyesi: `cpu16/tests/anakart-gc.test.ts` kartı kapı seviyesinde kurar ve BIOS'un açılışını,
  klavyeyi, UART'ı ve zamanlayıcıyı Machine modeliyle döngüsü döngüsüne karşılaştırır.
- Deneme programının kendisi: `cpu16/tests/kit.test.ts` ("deney programları").

## Sorun giderme

| Belirti | Bak |
|---|---|
| Terminal tamamen sessiz | TX hattı boştayken 1 olmalı (`UART_TXD`); değilse verici bit sayacı ve `GC_TXEMPTY`. Modülün GND'si bağlı mı |
| Anlamsız karakterler | baud yanlış (1 MHz'de 28 800); osilatör 8 MHz mi |
| Başlık geliyor, nokta yok | zamanlayıcı: ön bölücünün `TC`'si (`GC_TICKP`) 4000 TCLK'de bir yükselmeli; `IRQ_MASK` ve 74HC148 |
| Noktalar çok hızlı ya da yavaş | `TIMER_RELOAD` okuması (`FF04`): 250 (0x00FA) okunmalı; 74HC193 zincirinin borç (`~TCD`) bağlantıları |
| Yankı yok ama başlık var | RX: 74HC14 Schmitt girişi, iki kademeli eşzamanlayıcı, alıcı bölücüsünün 19'dan başlaması |
| İlk bayt geliyor, sonrakiler kayıp | `CTS#` (yuvanın 2. pini) bağlı mı; terminalde RTS/CTS açık mı |
| Klavye kodu yok | PS/2 saat ve veri hatlarındaki 10 kΩ çekme dirençleri; klavye 5 V ile besleniyor mu |
| Tek tuş sonsuz tekrar ediyor | `KBD_DATA` okununca READY silinmiyor: "Okuma yan etkileri" bloğundaki flip-flop |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (65 entegre, 71 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC00 | 3 | U658 U659 U660 | 4 × 2 girişli NAND | GND 7, VCC 14 |
| 74HC02 | 2 | U661 U662 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC04 | 3 | U663 U664 U665 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC05 | 1 | U619 | 6 × NOT, açık-akaçlı (open-drain) çıkış | GND 7, VCC 14 |
| 74HC08 | 8 | U646 U647 U648 U649 U650 U651 U652 U653 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC14 | 1 | U606 | 6 × Schmitt tetiklemeli NOT | GND 7, VCC 14 |
| 74HC32 | 4 | U654 U655 U656 U657 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 6 | U605 U611 U612 U630 U631 U645 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC138 | 4 | U601 U602 U603 U604 | 3'ten 8'e kod çözücü (aktif düşük çıkış) | GND 8, VCC 16 |
| 74HC148 | 1 | U639 | 8'den 3'e öncelikli kodlayıcı | GND 8, VCC 16 |
| 74HC161 | 10 | U608 U609 U610 U613 U614 U615 U617 U620 U621 U622 | 4 bit senkron ikili sayıcı (asenkron reset) | GND 8, VCC 16 |
| 74HC165 | 1 | U607 | 8 bit paralel giriş / seri çıkış kaydırmalı register | GND 8, VCC 16 |
| 74HC175 | 2 | U627 U638 | 4 × D flip-flop (ortak saat, asenkron reset) | GND 8, VCC 16 |
| 74HC193 | 4 | U632 U633 U634 U635 | 4 bit senkron ileri/geri ikili sayıcı (asenkron yükleme ve temizleme) | GND 8, VCC 16 |
| 74HC541 | 9 | U625 U626 U628 U629 U640 U641 U642 U643 U644 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 2 | U623 U624 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |
| 74HC595 | 2 | U616 U618 | 8 bit seri giriş / paralel çıkış kaydırmalı register (çıkış mandallı) | GND 8, VCC 16 |
| 74HC688 | 2 | U636 U637 | 8 bit eşitlik karşılaştırıcı | GND 10, VCC 20 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 65 | C602 C603 C604 C605 C606 C607 C608 C609 C610 C611 C612 C613 C614 C615 C616 C617 C618 C619 C620 C621 C622 C623 C624 C625 C626 C627 C628 C629 C630 C631 C632 C633 C634 C635 C636 C637 C638 C639 C640 C641 C642 C643 C644 C645 C646 C647 C648 C649 C650 C651 C652 C653 C654 C655 C656 C657 C658 C659 C660 C661 C662 C663 C664 C665 C666 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C601 | 100 µF elektrolitik kondansatör (kart girişi) |
| CONN_CH340 | 1 | J601 | CH340 USB-UART modülü yuvası (6 pin, FTDI düzeni) |
| CONN_PS2 | 1 | J602 | PS/2 klavye konnektörü (6 pin mini-DIN, dişi) |
| R_10K | 3 | R601 R602 R603 | 10 kΩ direnç |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U646** (74HC08, bu deneyde takılır): 1. kapı (KBD_DATA okunuyor (READY iken: çerçeve ortasında sayaç silinmez)); 2. kapı (verici çalışıyor (yazma darbesinde ve boştayken sayaçlar temiz)); 3. kapı (yapıştırıcı kapı); 4. kapı (yapıştırıcı kapı)
- **U647** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (yapıştırıcı kapı); 3. kapı (bit sonu); 4. kapı (yapıştırıcı kapı)
- **U648** (74HC08, bu deneyde takılır): 1. kapı (bitiş biti bitti); 2. kapı (BUSY sonraki değer); 3. kapı (yapıştırıcı kapı); 4. kapı (yapıştırıcı kapı)
- **U649** (74HC08, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (örnek anı (bölücü 34)); 3. kapı (bitiş biti örneği); 4. kapı (bayt tamam)
- **U650** (74HC08, bu deneyde takılır): 1. kapı (RX_READY sil: UART_DATA okundu); 2. kapı (9 bit alındı: kaydırma durur); 3. kapı (yapıştırıcı kapı); 4. kapı (yapıştırıcı kapı)
- **U651** (74HC08, bu deneyde takılır): 1. kapı (sayaç = 10: sonraki kenar bitiş biti); 2. kapı (KBD_DATA okundu: sayaç ve READY silinir); 3. kapı (yapıştırıcı kapı); 4. kapı (açılırken yükle)
- **U652** (74HC08, bu deneyde takılır): 1. kapı (bu döngünün sonu sayaç tıkı); 2. kapı (tıkta c = 1: yeniden yükle, EXPIRED); 3. kapı (tıkta c > 1 (ya da 0): azalt); 4. kapı (yeniden yükleme darbesi (tık kenarını izleyen yarım döngü))
- **U653** (74HC08, bu deneyde takılır): 1. kapı (TIMER_STAT'a 1 yazınca sil); 2. kapı (kaynak 0: zamanlayıcı)
- **U654** (74HC32, bu deneyde takılır): 1. kapı (bit ≥ 7: kısa bit (34 döngü)); 2. kapı (bölücü 33 / 34 alt bitleri); 3. kapı (yapıştırıcı kapı); 4. kapı (yapıştırıcı kapı)
- **U655** (74HC32, bu deneyde takılır): 1. kapı (başlangıç biti değil); 2. kapı (TX hattı: boşta 1, başlangıç 0, veri, bitiş 1); 3. kapı (başlangıç biti / çerçeve sonu); 4. kapı (kaydırma saati (örnek 0–8))
- **U656** (74HC32, bu deneyde takılır): 1. kapı (çıkış register'ı saati (örnek 9)); 2. kapı (yapıştırıcı kapı); 3. kapı (kaydırma saati (kenar 1–9)); 4. kapı (çıkış register'ı saati (kenar 10))
- **U657** (74HC32, bu deneyde takılır): 1. kapı (EXPIRED kur / tut)
- **U658** (74HC00, bu deneyde takılır): 1. kapı (veri bitleri arasında kaydır); 2. kapı (yapıştırıcı kapı); 3. kapı (sayaç = 9); 4. kapı (azaltma saati (tık kenarında yükselir))
- **U659** (74HC00, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (kaynak 0 maskeli); 3. kapı (kaynak 1 maskeli); 4. kapı (kaynak 2 maskeli)
- **U660** (74HC00, bu deneyde takılır): 1. kapı (kaynak 3 maskeli)
- **U661** (74HC02, bu deneyde takılır): 1. kapı (UART_DATA okunuyor); 2. kapı (yapıştırıcı kapı); 3. kapı (bölücü yükle: boştayken 19, örnekte 0); 4. kapı (ön bölücü: uç sayımda ya da resetten sonraki ilk kenarda 96 yükle)
- **U662** (74HC02, bu deneyde takılır): 1. kapı (sayaç yükleme); 2. kapı (sayaç = 1)
- **U663** (74HC04, bu deneyde takılır): 1. kapı (reset (aktif yüksek)); 2. kapı (TCLK tersi); 3. kapı (uzun bit (35 döngü)); 4. kapı (bit sonu: bölücüyü 0'la); 5. kapı (bitiş biti bitti); 6. kapı (bayt tamam)
- **U664** (74HC04, bu deneyde takılır): 1. kapı (yapıştırıcı kapı); 2. kapı (sayaç biti 1 tersi); 3. kapı (yapıştırıcı kapı); 4. kapı (yapıştırıcı kapı); 5. kapı (yapıştırıcı kapı); 6. kapı (sayaç ≠ 1)
- **U665** (74HC04, bu deneyde takılır): 1. kapı (IRQ hattı = OR(bekleyen ∧ maske)); 2. kapı (yapıştırıcı kapı); 3. kapı (yapıştırıcı kapı)

#### Bağlantılar (208 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U606-13 6A, U608-3 D0, U608-4 D1, U608-5 D2, U608-6 D3, U609-3 D0, U609-4 D1, U609-5 D2, U609-6 D3, U610-3 D0, U610-4 D1, U610-5 D2, U610-6 D3, U613-5 D2, U613-6 D3, U614-4 D1, U614-5 D2, U614-6 D3, U615-3 D0, U615-4 D1, U615-5 D2, U615-6 D3, U617-3 D0, U617-4 D1, U617-5 D2, U617-6 D3, U619-3 2A, U619-5 3A, U619-9 4A, U619-11 5A, U619-13 6A, U620-3 D0, U620-4 D1, U620-5 D2, U620-6 D3, U621-3 D0, U621-6 D3, U622-3 D0, U622-4 D1, U622-5 D2, U622-6 D3, U623-1 ~OE, U624-1 ~OE, U625-19 ~OE2, U626-19 ~OE2, U627-12 D2, U627-13 D3, U628-4 A2, U628-5 A3, U628-6 A4, U628-7 A5, U628-8 A6, U628-9 A7, U628-19 ~OE2, U629-3 A1, U629-4 A2, U629-5 A3, U629-6 A4, U629-7 A5, U629-8 A6, U629-9 A7, U629-19 ~OE2, U631-12 2D, U636-1 ~E, U636-5 Q1, U636-7 Q2, U636-9 Q3, U636-12 Q4, U636-14 Q5, U636-16 Q6, U636-18 Q7, U637-1 ~E, U637-3 Q0, U637-5 Q1, U637-7 Q2, U637-9 Q3, U637-12 Q4, U637-14 Q5, U637-16 Q6, U637-18 Q7, U639-5 ~EI, U640-4 A2, U640-5 A3, U640-6 A4, U640-7 A5, U640-8 A6, U640-9 A7, U641-6 A4, U641-7 A5, U641-8 A6, U641-9 A7, U641-19 ~OE2, U642-6 A4, U642-7 A5, U642-8 A6, U642-9 A7, U642-19 ~OE2, U643-4 A2, U643-5 A3, U643-6 A4, U643-7 A5, U643-8 A6, U643-9 A7, U643-19 ~OE2, U644-3 A1, U644-4 A2, U644-5 A3, U644-6 A4, U644-7 A5, U644-8 A6, U644-9 A7, U644-19 ~OE2, U653-9 3A, U653-10 3B, U653-12 4A, U653-13 4B, U657-4 2A, U657-5 2B, U657-9 3A, U657-10 3B, U657-12 4A, U657-13 4B, U660-4 2A, U660-5 2B, U660-9 3A, U660-10 3B, U660-12 4A, U660-13 4B, U662-8 3A, U662-9 3B, U662-11 4A, U662-12 4B, U665-9 4A, U665-11 5A, U665-13 6A | sabit seviye |
| **VCC** | U601-6 E3, U602-6 E3, U603-6 E3, U604-6 E3, U605-4 ~1PRE, U605-10 ~2PRE, U607-10 DS, U608-7 CEP, U608-10 CET, U609-7 CEP, U610-9 ~PE, U611-1 ~1CLR, U611-13 ~2CLR, U612-10 ~2PRE, U613-1 ~MR, U613-7 CEP, U613-10 CET, U614-1 ~MR, U614-7 CEP, U615-9 ~PE, U616-10 ~MR, U617-7 CEP, U617-9 ~PE, U617-10 CET, U618-10 ~MR, U620-1 ~MR, U620-7 CEP, U620-10 CET, U621-1 ~MR, U621-4 D1, U621-5 D2, U621-7 CEP, U622-1 ~MR, U622-7 CEP, U630-4 ~1PRE, U630-10 ~2PRE, U631-4 ~1PRE, U631-13 ~2CLR, U632-5 CPU, U633-5 CPU, U634-5 CPU, U635-5 CPU, U636-3 Q0, U639-1 ~I4, U639-2 ~I5, U639-3 ~I6, U639-4 ~I7, U645-2 1D, U645-4 ~1PRE, U645-10 ~2PRE | sabit seviye |
| `~GC_EXPCLR` | U630-13 ~2CLR, U653-3 1Y |  |
| `~GC_G0` | U601-15 ~Y0, U602-4 ~E1, U603-4 ~E1, U604-4 ~E1 |  |
| `~GC_GS` | U639-14 ~GS, U640-19 ~OE2, U665-1 1A |  |
| `~GC_I0` | U639-10 ~I0, U659-6 2Y |  |
| `~GC_I1` | U639-11 ~I1, U659-8 3Y |  |
| `~GC_I2` | U639-12 ~I2, U659-11 4Y |  |
| `~GC_I3` | U639-13 ~I3, U660-3 1Y |  |
| `~GC_KB1` | U658-10 3B, U664-4 2Y |  |
| `~GC_KCLR` | U617-1 ~MR, U645-13 ~2CLR, U651-6 2Y |  |
| `~GC_KEQ9` | U656-13 4B, U658-8 3Y |  |
| `~GC_PLD` | U620-9 ~PE, U621-9 ~PE, U622-9 ~PE, U661-13 4Y |  |
| `~GC_RD0` | U602-15 ~Y0, U616-13 ~OE, U643-1 ~OE1, U661-2 1A |  |
| `~GC_RD1` | U602-14 ~Y1, U618-13 ~OE, U644-1 ~OE1, U661-5 2A |  |
| `~GC_RD2` | U602-13 ~Y2, U625-1 ~OE1, U626-1 ~OE1 |  |
| `~GC_RD3` | U602-12 ~Y3, U628-1 ~OE1, U629-1 ~OE1 |  |
| `~GC_RD4` | U602-11 ~Y4, U641-1 ~OE1, U642-1 ~OE1 |  |
| `~GC_RD5` | U602-10 ~Y5, U640-1 ~OE1 |  |
| `~GC_RDK_Q` | U605-8 ~2Q, U651-5 2B |  |
| `~GC_RDU_Q` | U605-6 ~1Q, U650-2 1B |  |
| `~GC_RXBUSY` | U612-8 ~2Q, U613-3 D0, U613-4 D1, U614-3 D0, U649-1 1A, U661-9 3B |  |
| `~GC_RXCLR` | U645-1 ~1CLR, U650-3 1Y |  |
| `~GC_RXDONE` | U648-13 4B, U656-2 1B, U663-12 6Y |  |
| `~GC_RXLD` | U613-9 ~PE, U614-9 ~PE, U661-10 3Y |  |
| `~GC_RXS2` | U611-8 ~2Q, U649-2 1B |  |
| `~GC_SA0` | U639-9 ~A0, U665-3 2A |  |
| `~GC_SA1` | U639-7 ~A1, U665-5 3A |  |
| `~GC_TBR0` | U632-13 ~TCD, U633-4 CPD |  |
| `~GC_TBR1` | U633-13 ~TCD, U634-4 CPD |  |
| `~GC_TBR2` | U634-13 ~TCD, U635-4 CPD |  |
| `~GC_TEN` | U627-3 ~Q0, U651-13 4B |  |
| `~GC_TPL` | U632-11 ~PL, U633-11 ~PL, U634-11 ~PL, U635-11 ~PL, U662-1 1Y |  |
| `~GC_TRL2` | U631-6 ~1Q, U652-13 4B |  |
| `~GC_TXDONE` | U648-5 2B, U663-10 5Y |  |
| `~GC_TXEND` | U608-9 ~PE, U609-9 ~PE, U663-8 4Y |  |
| `~GC_TXS` | U647-4 2A, U663-6 3Y |  |
| `~GC_TXSH` | U607-15 ~CE, U658-3 1Y |  |
| `~GC_WE0` | U603-15 ~Y0, U607-1 ~PL, U612-4 ~1PRE, U646-5 2B |  |
| `~GC_WE2` | U603-13 ~Y2, U623-11 CP |  |
| `~GC_WE3` | U603-12 ~Y3, U627-9 CP, U664-9 4A |  |
| `~GC_WO2` | U604-13 ~Y2, U624-11 CP |  |
| `~GC_WO3` | U604-12 ~Y3, U664-11 5A |  |
| `~GC_WO4` | U604-11 ~Y4, U638-9 CP |  |
| `~GC_Z1` | U652-10 3B, U664-12 6Y |  |
| `~GC_Z1H` | U637-19 ~EQ, U662-6 2B |  |
| `~GC_Z1L` | U636-19 ~EQ, U662-5 2A |  |
| `~IO` | U601-4 ~E1 | arka panel 47 · önceki: Deney 8 |
| `~MRD` | U602-5 ~E2 | arka panel 41 · önceki: Deney 6, 8, 9 |
| `~MWE_E` | U603-5 ~E2 | arka panel 42 · önceki: Deney 6, 8, 9 |
| `~MWE_O` | U604-5 ~E2 | arka panel 43 · önceki: Deney 6, 8 |
| `~RESET` | U605-1 ~1CLR, U605-13 ~2CLR, U611-4 ~1PRE, U611-10 ~2PRE, U612-1 ~1CLR, U612-13 ~2CLR, U627-1 ~MR, U630-1 ~1CLR, U631-1 ~1CLR, U631-10 ~2PRE, U638-1 ~MR, U650-1 1A, U651-4 2A, U653-1 1A, U663-1 1A | arka panel 7 · önceki: Deney 1, 5, 6, 7, 8, 9 |
| `A0` | U661-3 1B, U661-6 2B | arka panel 9 · önceki: Deney 6 |
| `A1` | U602-1 A0, U603-1 A0, U604-1 A0 | arka panel 10 · önceki: Deney 6, 8, 9 |
| `A2` | U602-2 A1, U603-2 A1, U604-2 A1 | arka panel 11 · önceki: Deney 6, 8, 9 |
| `A3` | U602-3 A2, U603-3 A2, U604-3 A2 | arka panel 12 · önceki: Deney 6, 8, 9 |
| `A4` | U601-1 A0 | arka panel 13 · önceki: Deney 6, 8, 9 |
| `A5` | U601-2 A1 | arka panel 14 · önceki: Deney 6, 8, 9 |
| `A6` | U601-3 A2 | arka panel 15 · önceki: Deney 6, 8, 9 |
| `A7` | U601-5 ~E2 | arka panel 16 · önceki: Deney 6, 8, 9 |
| `CLK` | U605-3 1CLK, U605-11 2CLK | arka panel 5 · önceki: Deney 1, 6, 7, 8, 9 |
| `DE0` | U607-6 D7, U616-7 Q7, U618-7 Q7, U623-2 D0, U625-18 Y0, U627-4 D0, U628-18 Y0, U640-18 Y0, U641-18 Y0, U651-10 3B | arka panel 25 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DE1` | U607-5 D6, U616-6 Q6, U618-6 Q6, U623-3 D1, U625-17 Y1, U627-5 D1, U628-17 Y1, U640-17 Y1, U641-17 Y1 | arka panel 26 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DE2` | U607-4 D5, U616-5 Q5, U618-5 Q5, U623-4 D2, U625-16 Y2, U628-16 Y2, U640-16 Y2, U641-16 Y2 | arka panel 27 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DE3` | U607-3 D4, U616-4 Q4, U618-4 Q4, U623-5 D3, U625-15 Y3, U628-15 Y3, U640-15 Y3, U641-15 Y3 | arka panel 28 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DE4` | U607-14 D3, U616-3 Q3, U618-3 Q3, U623-6 D4, U625-14 Y4, U628-14 Y4, U640-14 Y4, U641-14 Y4 | arka panel 29 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DE5` | U607-13 D2, U616-2 Q2, U618-2 Q2, U623-7 D5, U625-13 Y5, U628-13 Y5, U640-13 Y5, U641-13 Y5 | arka panel 30 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DE6` | U607-12 D1, U616-1 Q1, U618-1 Q1, U623-8 D6, U625-12 Y6, U628-12 Y6, U640-12 Y6, U641-12 Y6 | arka panel 31 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DE7` | U607-11 D0, U616-15 Q0, U618-15 Q0, U623-9 D7, U625-11 Y7, U628-11 Y7, U640-11 Y7, U641-11 Y7 | arka panel 32 · çekme direnci RN402 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DO0` | U624-2 D0, U626-18 Y0, U629-18 Y0, U638-4 D0, U642-18 Y0, U643-18 Y0, U644-18 Y0, U659-2 1B | arka panel 33 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DO1` | U624-3 D1, U626-17 Y1, U629-17 Y1, U638-5 D1, U642-17 Y1, U643-17 Y1, U644-17 Y1 | arka panel 34 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DO2` | U624-4 D2, U626-16 Y2, U629-16 Y2, U638-12 D2, U642-16 Y2, U643-16 Y2, U644-16 Y2 | arka panel 35 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DO3` | U624-5 D3, U626-15 Y3, U629-15 Y3, U638-13 D3, U642-15 Y3, U643-15 Y3, U644-15 Y3 | arka panel 36 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DO4` | U624-6 D4, U626-14 Y4, U629-14 Y4, U642-14 Y4, U643-14 Y4, U644-14 Y4 | arka panel 37 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DO5` | U624-7 D5, U626-13 Y5, U629-13 Y5, U642-13 Y5, U643-13 Y5, U644-13 Y5 | arka panel 38 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DO6` | U624-8 D6, U626-12 Y6, U629-12 Y6, U642-12 Y6, U643-12 Y6, U644-12 Y6 | arka panel 39 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9 |
| `DO7` | U624-9 D7, U626-11 Y7, U629-11 Y7, U642-11 Y7, U643-11 Y7, U644-11 Y7 | arka panel 40 · çekme direnci RN403 (Deney 8) · önceki: Deney 6, 8, 9 |
| `GC_C0` | U632-3 Q0, U636-2 P0 |  |
| `GC_C1` | U632-2 Q1, U636-4 P1 |  |
| `GC_C2` | U632-6 Q2, U636-6 P2 |  |
| `GC_C3` | U632-7 Q3, U636-8 P3 |  |
| `GC_C4` | U633-3 Q0, U636-11 P4 |  |
| `GC_C5` | U633-2 Q1, U636-13 P5 |  |
| `GC_C6` | U633-6 Q2, U636-15 P6 |  |
| `GC_C7` | U633-7 Q3, U636-17 P7 |  |
| `GC_C8` | U634-3 Q0, U637-2 P0 |  |
| `GC_C9` | U634-2 Q1, U637-4 P1 |  |
| `GC_C10` | U634-6 Q2, U637-6 P2 |  |
| `GC_C11` | U634-7 Q3, U637-8 P3 |  |
| `GC_C12` | U635-3 Q0, U637-11 P4 |  |
| `GC_C13` | U635-2 Q1, U637-13 P5 |  |
| `GC_C14` | U635-6 Q2, U637-15 P6 |  |
| `GC_C15` | U635-7 Q3, U637-17 P7 |  |
| `GC_DECP` | U652-8 3Y, U658-12 4A |  |
| `GC_EXP_D` | U630-12 2D, U657-3 1Y |  |
| `GC_EXPIRED` | U629-2 A0, U630-9 2Q, U653-4 2A, U657-2 1B |  |
| `GC_KB0` | U617-14 Q0, U650-10 3B, U656-4 2A, U664-5 3A |  |
| `GC_KB1` | U617-13 Q1, U650-13 4B, U656-5 2B, U664-3 2A |  |
| `GC_KB3` | U617-11 Q3, U650-4 2A, U650-9 3A, U650-12 4A |  |
| `GC_KCLKN` | U606-2 1Y, U617-2 CP, U645-11 2CLK, U656-9 3A, U656-12 4A |  |
| `GC_KDAT` | U606-6 3Y, U618-14 DS |  |
| `GC_KDATN` | U606-4 2Y, U606-5 3A |  |
| `GC_KEQ10` | U645-12 2D, U651-3 1Y |  |
| `GC_KGE9` | U650-6 2Y, U656-10 3B |  |
| `GC_KRDY` | U619-1 1A, U641-3 A1, U644-2 A0, U645-9 2Q, U646-2 1B, U659-9 3A |  |
| `GC_KSHCP` | U618-11 SHCP, U656-8 3Y |  |
| `GC_KSTCP` | U618-12 STCP, U656-11 4Y |  |
| `GC_M0` | U638-2 Q0, U642-2 A0, U659-5 2B |  |
| `GC_M1` | U638-7 Q1, U642-3 A1, U659-10 3B |  |
| `GC_M2` | U638-10 Q2, U642-4 A2, U659-13 4B |  |
| `GC_M3` | U638-15 Q3, U642-5 A3, U660-2 1B |  |
| `GC_P0` | U641-2 A0, U653-6 2Y, U659-4 2A |  |
| `GC_P0TC` | U620-15 TC, U621-10 CET |  |
| `GC_P1TC` | U621-15 TC, U622-10 CET |  |
| `GC_R0` | U623-19 Q0, U625-2 A0, U632-15 D0 |  |
| `GC_R1` | U623-18 Q1, U625-3 A1, U632-1 D1 |  |
| `GC_R2` | U623-17 Q2, U625-4 A2, U632-10 D2 |  |
| `GC_R3` | U623-16 Q3, U625-5 A3, U632-9 D3 |  |
| `GC_R4` | U623-15 Q4, U625-6 A4, U633-15 D0 |  |
| `GC_R5` | U623-14 Q5, U625-7 A5, U633-1 D1 |  |
| `GC_R6` | U623-13 Q6, U625-8 A6, U633-10 D2 |  |
| `GC_R7` | U623-12 Q7, U625-9 A7, U633-9 D3 |  |
| `GC_R8` | U624-19 Q0, U626-2 A0, U634-15 D0 |  |
| `GC_R9` | U624-18 Q1, U626-3 A1, U634-1 D1 |  |
| `GC_R10` | U624-17 Q2, U626-4 A2, U634-10 D2 |  |
| `GC_R11` | U624-16 Q3, U626-5 A3, U634-9 D3 |  |
| `GC_R12` | U624-15 Q4, U626-6 A4, U635-15 D0 |  |
| `GC_R13` | U624-14 Q5, U626-7 A5, U635-1 D1 |  |
| `GC_R14` | U624-13 Q6, U626-8 A6, U635-10 D2 |  |
| `GC_R15` | U624-12 Q7, U626-9 A7, U635-9 D3 |  |
| `GC_RB0` | U615-14 Q0, U649-10 3B |  |
| `GC_RB3` | U615-11 Q3, U649-9 3A |  |
| `GC_RB9` | U649-8 3Y, U649-13 4B, U664-1 1A |  |
| `GC_RDK` | U605-12 2D, U646-3 1Y |  |
| `GC_RDU` | U605-2 1D, U661-1 1Y |  |
| `GC_RLD` | U630-2 1D, U652-6 2Y, U657-1 1A |  |
| `GC_RLPULSE` | U652-11 4Y, U662-3 1B |  |
| `GC_RST` | U632-14 MR, U633-14 MR, U634-14 MR, U635-14 MR, U663-2 1Y |  |
| `GC_RSTD` | U631-9 2Q, U661-12 4B |  |
| `GC_RXBUSY` | U612-9 2Q, U615-1 ~MR, U648-12 4A |  |
| `GC_RXBUSY_D` | U612-12 2D, U655-8 3Y |  |
| `GC_RXD1` | U613-13 Q1, U649-5 2B |  |
| `GC_RXD5` | U614-13 Q1, U649-4 2A |  |
| `GC_RXDONE` | U649-11 4Y, U663-13 6A |  |
| `GC_RXDTC` | U613-15 TC, U614-10 CET |  |
| `GC_RXEND` | U615-7 CEP, U615-10 CET, U649-6 2Y, U649-12 4A, U658-4 2A, U661-8 3A |  |
| `GC_RXRDY` | J601.2, U641-4 A2, U643-2 A0, U645-5 1Q, U659-12 4A |  |
| `GC_RXS1` | U611-5 1Q, U611-12 2D |  |
| `GC_RXS2` | U611-9 2Q, U616-14 DS |  |
| `GC_RXSHCP` | U616-11 SHCP, U655-11 4Y |  |
| `GC_RXSTCP` | U616-12 STCP, U645-3 1CLK, U656-3 1Y |  |
| `GC_SA0` | U640-2 A0, U665-4 2Y |  |
| `GC_SA1` | U640-3 A1, U665-6 3Y |  |
| `GC_TB0` | U610-14 Q0, U646-10 3B, U647-13 4B, U654-9 3A |  |
| `GC_TB1` | U610-13 Q1, U646-9 3A, U654-10 3B |  |
| `GC_TB2` | U610-12 Q2, U646-12 4A, U654-12 4A |  |
| `GC_TB3` | U610-11 Q3, U647-12 4A, U654-1 1A, U654-13 4B |  |
| `GC_TBNZ` | U648-9 3A, U655-3 1Y, U658-2 1B |  |
| `GC_TCLKN` | U631-3 1CLK, U658-13 4B, U663-4 2Y |  |
| `GC_TD0` | U608-14 Q0, U647-2 1B |  |
| `GC_TD1` | U608-13 Q1, U647-5 2B |  |
| `GC_TD5` | U609-13 Q1, U647-9 3A |  |
| `GC_TDCLK` | U632-4 CPD, U658-11 4Y |  |
| `GC_TDTC` | U608-15 TC, U609-10 CET |  |
| `GC_TEN` | U627-2 Q0, U628-2 A0, U652-2 1B |  |
| `GC_TICKP` | U622-15 TC, U652-1 1A, U661-11 4A |  |
| `GC_TIRQEN` | U627-7 Q1, U628-3 A1, U653-5 2B |  |
| `GC_TLDEN` | U651-11 4Y, U662-2 1A |  |
| `GC_TRL` | U630-5 1Q, U631-2 1D, U652-12 4A |  |
| `GC_TTICK` | U652-3 1Y, U652-4 2A, U652-9 3A |  |
| `GC_TXBUSY` | U612-5 1Q, U646-4 2A, U648-4 2A |  |
| `GC_TXBUSY_D` | U612-2 1D, U648-6 2Y |  |
| `GC_TXDONE` | U648-3 1Y, U663-11 5A |  |
| `GC_TXEMPTY` | U612-6 ~1Q, U643-3 A1, U655-4 2A |  |
| `GC_TXEND` | U610-7 CEP, U610-10 CET, U647-8 3Y, U648-1 1A, U658-1 1A, U663-9 4A |  |
| `GC_TXLOW` | U647-10 3B, U654-6 2Y |  |
| `GC_TXQ` | U607-9 Q7, U648-10 3B |  |
| `GC_TXRUN` | U608-1 ~MR, U609-1 ~MR, U610-1 ~MR, U646-6 2Y |  |
| `GC_TXS` | U647-1 1A, U654-3 1Y, U663-5 3A |  |
| `GC_URX` | U606-10 5Y, U611-2 1D |  |
| `GC_URXN` | U606-8 4Y, U606-11 5A |  |
| `GC_Z1` | U652-5 2B, U662-4 2Y, U664-13 6A |  |
| `IRQ` | U665-2 1Y | arka panel 8 · önceki: Deney 7 |
| (adsız) | U646-1 1A, U661-4 2Y |  |
| (adsız) | U646-8 3Y, U646-13 4B |  |
| (adsız) | U646-11 4Y, U654-2 1B |  |
| (adsız) | U647-3 1Y, U654-4 2A |  |
| (adsız) | U647-6 2Y, U654-5 2B |  |
| (adsız) | U647-11 4Y, U648-2 1B |  |
| (adsız) | U654-8 3Y, U655-1 1A |  |
| (adsız) | U654-11 4Y, U655-2 1B |  |
| (adsız) | U648-8 3Y, U655-5 2B |  |
| (adsız) | U648-11 4Y, U655-9 3A |  |
| (adsız) | U649-3 1Y, U655-10 3B |  |
| (adsız) | U658-5 2B, U664-2 1Y |  |
| (adsız) | U655-13 4B, U658-6 2Y |  |
| (adsız) | U650-5 2B, U656-6 2Y |  |
| (adsız) | U650-8 3Y, U658-9 3A |  |
| (adsız) | U650-11 4Y, U651-1 1A |  |
| (adsız) | U651-2 1B, U664-6 3Y |  |
| (adsız) | U651-9 3A, U664-8 4Y |  |
| (adsız) | U651-8 3Y, U651-12 4A |  |
| (adsız) | U659-1 1A, U664-10 5Y |  |
| (adsız) | U653-2 1B, U659-3 1Y |  |
| `PS2_CLK` | J602.5, R602.2, U606-1 1A, U619-2 1Y | çekme direnci |
| `PS2_DAT` | J602.1, R603.2, U606-3 2A | çekme direnci |
| `TCLK` | U607-2 CP, U608-2 CP, U609-2 CP, U610-2 CP, U611-3 1CLK, U611-11 2CLK, U612-3 1CLK, U612-11 2CLK, U613-2 CP, U614-2 CP, U615-2 CP, U620-2 CP, U621-2 CP, U622-2 CP, U630-3 1CLK, U630-11 2CLK, U631-11 2CLK, U655-12 4A, U656-1 1A, U663-3 2A | arka panel 48 · önceki: Deney 1, 8 |
| `UART_RXD` | J601.4, R601.2, U606-9 4A | çekme direnci |
| `UART_TXD` | J601.5, U655-6 2Y |  |
| `VSYNC_REQ` | U641-5 A3, U660-1 1A | arka panel 56 · ▶ elle sür (Deney 11) |

**Boşta kalan çıkışlar (bağlanmaz):** U601-7 ~Y7, U601-9 ~Y6, U601-10 ~Y5, U601-11 ~Y4, U601-12 ~Y3, U601-13 ~Y2, U601-14 ~Y1, U602-7 ~Y7, U602-9 ~Y6, U603-7 ~Y7, U603-9 ~Y6, U603-10 ~Y5, U603-11 ~Y4, U603-14 ~Y1, U604-7 ~Y7, U604-9 ~Y6, U604-10 ~Y5, U604-14 ~Y1, U604-15 ~Y0, U605-5 1Q, U605-9 2Q, U606-12 6Y, U607-7 ~Q7, U608-11 Q3, U608-12 Q2, U609-11 Q3, U609-12 Q2, U609-14 Q0, U609-15 TC, U610-15 TC, U611-6 ~1Q, U613-11 Q3, U613-12 Q2, U613-14 Q0, U614-11 Q3, U614-12 Q2, U614-14 Q0, U614-15 TC, U615-12 Q2, U615-13 Q1, U615-15 TC, U616-9 Q7S, U617-12 Q2, U617-15 TC, U618-9 Q7S, U619-4 2Y, U619-6 3Y, U619-8 4Y, U619-10 5Y, U619-12 6Y, U620-11 Q3, U620-12 Q2, U620-13 Q1, U620-14 Q0, U621-11 Q3, U621-12 Q2, U621-13 Q1, U621-14 Q0, U622-11 Q3, U622-12 Q2, U622-13 Q1, U622-14 Q0, U627-6 ~Q1, U627-10 Q2, U627-11 ~Q2, U627-14 ~Q3, U627-15 Q3, U630-6 ~1Q, U630-8 ~2Q, U631-5 1Q, U631-8 ~2Q, U632-12 ~TCU, U633-12 ~TCU, U634-12 ~TCU, U635-12 ~TCU, U635-13 ~TCD, U638-3 ~Q0, U638-6 ~Q1, U638-11 ~Q2, U638-14 ~Q3, U639-6 ~A2, U639-15 ~EO, U645-6 ~1Q, U645-8 ~2Q, U653-8 3Y, U653-11 4Y, U657-6 2Y, U657-8 3Y, U657-11 4Y, U660-6 2Y, U660-8 3Y, U660-11 4Y, U662-10 3Y, U662-13 4Y, U665-8 4Y, U665-10 5Y, U665-12 6Y

**Elle sürülecek girişler (1):** `VSYNC_REQ`
<!-- otomatik: bitti -->
