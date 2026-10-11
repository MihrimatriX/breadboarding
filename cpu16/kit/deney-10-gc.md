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
Bu deneyde yeni donanım kurulmaz; önceki deneylerin kartları kullanılır.
<!-- otomatik: bitti -->
