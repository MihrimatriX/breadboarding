# Deney 8: Bellek kartı ve ilk program

> **Video:** "İlk program: bilgisayar kendi belleğini sınıyor" · **Önce:** Deney 3 (programlayıcı), 7 (CPU tamam) · **Kart:** bellek kartı (`bellek`), önbellek kartının bekleme blokları, test kartının FF00 çıkış mandalı

Bu deneyin sonunda CPU ilk kez gerçek bir programı EEPROM'dan çalıştırır: 128 KB RAM'in 8 bankının
hepsine desen yazar, geri okur ve sonucu 8 LED'de gösterir. LED'ler bank bank sayar, bellek
sağlamsa `0x5A` yanar ve ardından kayan ışık başlar. Sahte bellek (Deney 6) bu deneyde çıkar.

## Ne öğreneceksin

- **Bank'lı bellek (basit MMU)**: 16 bitlik CPU'nun 1 MB'lık fiziksel adres alanını nasıl gördüğü.
  Dört 16 KB'lık pencere, her birine 6 bitlik bir bank register'ı (74HC273), adresin üst iki bitiyle
  seçilen 74HC153'ler.
- **Reset değeri olan register**: 74HC273'te yalnız sıfırlama var; 32/33/34 reset değerleri, 1 olması
  gereken bitlerin girişte ve çıkışta evirici çiftiyle ters saklanmasıyla elde edilir.
- **8 bitlik çipe 16 bitlik kelime**: bayt sıralayıcı. Çift bayt bir 74HC574 mandalına alınır, tek
  bayt doğrudan geçer; A0'ı (`BSEL`) sıralayıcı sürer.
- **Bekleme durumları**: önbellek kartının `~WAIT`'i, saat kartının W flip-flop'u; her bekleme turu
  CPU döngüsünü tam 8 osilatör periyodu uzatır.
- **Adres çözme**: 74HC688 ile G/Ç alanı (`FF00–FFFF`); tek bir 74HC138 ile beş bellek çipinden
  hangisinin seçileceği (EEPROM, RAM 0..3) ya da hiçbirinin seçilmemesi (boş bölge).
- **Bellek testi**: "adres XOR bank" deseni neden kopuk ya da kısa devre adres hatlarını yakalar;
  neden önce bütün banklar yazılıp sonra okunur.

## Nasıl çalışır

- Fiziksel adres = `BANKn · 0x4000 + (CPU adresi & 0x3FFF)`, `n` = CPU adresinin üst iki biti.
  EEPROM (28C256, U420) fiziksel `0x00000–0x07FFF` (bank 0–1), RAM (4 × 62256, U421–U424)
  `0x80000–0x9FFFF` (bank 32–39; her 62256 iki bank); bank 2–31 ve 40–63 boştur. Reset bankları 0,
  32, 33, 34'e getirir: vektörler hep EEPROM bank 0'dan okunur. Harita: `cpu16/docs/anakart.md`
  ("Bellek ve bank register'ları").
- **Çip seçimi**: U425 (74HC138) `PA19`, `PA16`, `PA15`'i çözer; `PA17 = PA18 = 0` ve `~IO = 1`
  iken çalışır. `~Y0` EEPROM'u (`PA19..PA15 = 00000`), `~Y4..~Y7` RAM 0..3'ü (`100xx`) seçer. Başka
  her adreste hiçbir çip seçilmez: veriyolu çekme dirençleri (RN401) `0xFF` okutur, yazmalar kaybolur.
- Her ana bellek erişimi **iki bekleme turu** alır. Önbellek kartının bekleme sayacı (U503) `~WAIT`'i
  iki tur düşük tutar; bellek kartının sıralayıcısı (U415) aynı `~WAIT` ve `TCLK`'den çift ve tek baytın
  sırasını çıkarır. Zaman çizimi: `cpu16/docs/anakart-kartlari.md` ("Bekleme durumlu bir erişim").
- Bu deneyde önbellek yok: `C_EN` ve `C_HIT` GND'de, her okuma ana belleğe gider. Program yine de
  `CACHE_CTRL`'ye (`FF34`) 0 yazar; Deney 9'da önbellek takılınca test RAM yerine önbelleği okumasın.
- **FF00 çıkış mandalı**: test kartının UART bloğu (U305, 74HC574). İki 74HC688 (U301, U302) adresi
  `FF00` ile karşılaştırır, yazma darbesi mandalı saatler; çıkışlar 8 LED'i sürer. G/Ç kartına
  (Deney 10) kadar programların tek çıkışı budur, sonra da hata ayıklama ışığı olarak kalır.
- Program (`cpu16/kit/programlar/bellek-deneme.s`): her kelimeye `adres XOR bank·0x0101` yazar,
  8 bankın hepsini yazıp sonra hepsini okur, sonra aynısını ters desenle yapar. RAM'i başka hiçbir
  şey için kullanmaz (yığın yok): RAM bozuksa bile program çalışır ve hatayı gösterir. Son olarak
  boş bölgeden (bank 8, 16, 40, 48) `0xFFFF` okunmasını ister: bu banklarda `PA17` ya da `PA18` 1'dir;
  biri U425'e ulaşmıyorsa orada EEPROM ya da RAM cevap verir.

## Kurulum adımları

1. Sahte belleği (Deney 6'daki DIP anahtarlar) veriyolundan çıkar.
2. Bellek kartını blok blok kur: adres çözme (U401–U403, U425), bank register'ları (U404–U414),
   bayt sıralayıcı (U415–U419), EEPROM ve RAM soketleri (U420–U424), çekme dirençleri
   (RN401–RN403) ve tablodaki yapıştırıcı kapılar.
3. Önbellek kartından yalnızca "G/Ç çözme" (U501, U502) ve "Bekleme ve sıralama" (U503–U505)
   blokları ile tabloda "bu deneyde takılır" denen kapılar. `C_EN` ve `C_HIT`'i 10 kΩ ile GND'ye çek
   (Deney 9'da önbelleğin kendisi sürer).
4. Test kartının UART bloğu (U301, U302, U305–U307). U305'in Q0..Q7 bacaklarına (19, 18 … 12)
   birer 1 kΩ + LED, katotlar GND'ye. Q7 (bacak 12) en soldaki LED olsun.
5. Programı bir 28C256'ya yaz (Deney 3'teki programlayıcıyla) ve çipi U420'ye tak:
   ```
   npm run cpu16 -- asm cpu16/kit/programlar/bellek-deneme.s -o bellek.hex
   python3 cpu16/programlayici/yaz.py PORT bellek.hex --dogrula
   ```
   Çip korumalı yazılır (Deney 3): program yanlışlıkla EEPROM'a yazsa da içerik bozulmaz.
6. Saat kartı NORMAL kipte, 8 MHz osilatör (CPU 1 MHz). RESET'e bas.

## Test: beklenen sonuç

| Zaman (1 MHz) | LED'ler | Anlam |
|---|---|---|
| 0–2,5 s | `0x20` → `0x27` | düz desen yazılıyor, bank 32 … 39 |
| 2,5–5,8 s | `0x20` → `0x27` | düz desen geri okunuyor |
| 5,8–11,5 s | `0x60` → `0x67`, iki kez | ters desen (bit 6 yanık) yazılıp okunuyor |
| ≈ 11,5 s | `0x5A` (· ● · ● ● · ● ·) | bellek sağlam |
| sonra | kayan ışık, adım ≈ 0,1 s | program çalışmayı sürdürüyor |
| hata | bit 7 yanar, kalan bitler bank ve desen | program durur: ör. `0xA6` = düz desende bank 38 |
| `0x88`, `0x90`, `0xA8`, `0xB0` | | boş bölge (bank 8, 16, 40, 48) `0xFFFF` okunmadı: çekme dirençleri ya da çip seçimi |

LED'ler hiç `0x20`'ye gelmiyorsa CPU programı EEPROM'dan okuyamıyordur (aşağıya bak).

## Simülatörde

- `npm run cpu16 -- machine cpu16/kit/programlar/bellek-deneme.s --rom --led`: program EEPROM'a
  yazılmış gibi BIOS'suz çalışır, FF00'a her yazılan değer bir LED satırı olarak 1 MHz zamanıyla basılır.
- Kapı seviyesi: `cpu16/tests/anakart-bellek.test.ts` bellek ve önbellek kartlarını kapı seviyesinde
  kurar ve her erişimi `Machine` modeliyle karşılaştırır (bank register'ları, RAM, EEPROM ve onun
  yazma döngüsü, bekleme).
- Deneme programının kendisi ve bir hücre bozulunca beklenen hata kodu: `cpu16/tests/kit.test.ts`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| LED'ler hiç yanmıyor | Önce FF00 mandalı: U301/U302'nin `~EQ` çıkışları `FF00`'da düşmeli. Sonra EEPROM: RESET'te adres 0x0000, `~MRD` düşük, U425'in `~Y0`'ı (`~CE_ROM`, U420'nin `~CE`'si) düşük mü |
| CPU hep bekliyor (CLK durmuş) | `~WAIT` bırakılmıyor: U503'ün CA/CB çıkışları; `TCLK` önbellek kartına geliyor mu |
| Rastgele değerler, program kayıyor | Bayt sırası: U415'te `BSEL`; U417 çift baytı t = 6'da alıyor mu. EEPROM'un A0'ı `BSEL`'e bağlı olmalı, CPU'nun A0'ına değil |
| Hep aynı bankta hata | Hangi RAM çipi: bank 32–33 U421, 34–35 U422, 36–37 U423, 38–39 U424. Bir çipin iki bankından yalnız biri hatalıysa o çipin A14'ü (`PA14`) |
| İki çip birbirinin yerine (ör. bank 34 hatası bank 32 yazılırken) | U425'in A0/A1 girişleri (`PA15`, `PA16`) ya da RAM çiplerinin `~CE`'leri yer değiştirmiş |
| Okuma geçişinin başında hata (bank 32) | Banklar birbirinin üstüne yazıyor: U408–U410 seçicileri ya da bank register'ı (U405) |
| Hep aynı bitte hata (r0 XOR r2 tek bit) | O veri hattı: `MD0..7` ve U418/U419'un yönü (`DIR`); simülatörde r0 okunan, r2 beklenen |
| Hatalı bank her RESET'te değişiyor | Gürültü ya da zamanlama: dekuplaj kondansatörleri, kısa kablolar; 4 MHz osilatörle (CPU 0,5 MHz) tekrar dene |
| `0x88` ya da `0xA8` | Bank 8 / 40'ta bir çip cevap veriyor: `PA17` U425'in `~E1`'ine ulaşıyor mu. `0x90` / `0xB0`: aynısı `PA18` (`~E2`) için. Hepsi: RN401 (`MD` çekme dirençleri) takılı mı |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
### Bilgisayar (CPU, saat ve test kartı)

#### Malzeme (5 entegre, 6 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC04 | 1 | U307 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC32 | 1 | U306 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC574 | 1 | U305 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |
| 74HC688 | 2 | U301 U302 | 8 bit eşitlik karşılaştırıcı | GND 10, VCC 20 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 5 | C302 C303 C306 C307 C308 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C301 | 100 µF elektrolitik kondansatör (kart girişi) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U306** (74HC32, bu deneyde takılır): 1. kapı (UART seçimi); 2. kapı (UART adresine RAM yazılmaz); 3. kapı (UART yazma kenarı)
- **U307** (74HC04, bu deneyde takılır): 1. kapı (UART seçimi)

#### Bağlantılar (29 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U301-1 ~E, U301-3 Q0, U301-5 Q1, U301-7 Q2, U301-9 Q3, U301-12 Q4, U301-14 Q5, U301-16 Q6, U302-1 ~E, U302-17 P7, U302-18 Q7, U305-1 ~OE, U306-12 4A, U306-13 4B, U307-3 2A, U307-5 3A, U307-9 4A, U307-11 5A, U307-13 6A | sabit seviye |
| **VCC** | U301-18 Q7, U302-3 Q0, U302-5 Q1, U302-7 Q2, U302-9 Q3, U302-12 Q4, U302-14 Q5, U302-16 Q6 | sabit seviye |
| `~MWE_E` | U306-4 2A, U306-9 3A | arka panel 42 · önceki: Deney 6 |
| `~UA_HI` | U302-19 ~EQ, U306-2 1B |  |
| `~UA_LO` | U301-19 ~EQ, U306-1 1A |  |
| `~UART_SEL` | U306-3 1Y, U306-10 3B, U307-1 1A |  |
| `A1` | U301-2 P0 | arka panel 10 · önceki: Deney 6 |
| `A2` | U301-4 P1 | arka panel 11 · önceki: Deney 6 |
| `A3` | U301-6 P2 | arka panel 12 · önceki: Deney 6 |
| `A4` | U301-8 P3 | arka panel 13 · önceki: Deney 6 |
| `A5` | U301-11 P4 | arka panel 14 · önceki: Deney 6 |
| `A6` | U301-13 P5 | arka panel 15 · önceki: Deney 6 |
| `A7` | U301-15 P6 | arka panel 16 · önceki: Deney 6 |
| `A8` | U301-17 P7 | arka panel 17 · önceki: Deney 6 |
| `A9` | U302-2 P0 | arka panel 18 · önceki: Deney 6 |
| `A10` | U302-4 P1 | arka panel 19 · önceki: Deney 6 |
| `A11` | U302-6 P2 | arka panel 20 · önceki: Deney 6 |
| `A12` | U302-8 P3 | arka panel 21 · önceki: Deney 6 |
| `A13` | U302-11 P4 | arka panel 22 · önceki: Deney 6 |
| `A14` | U302-13 P5 | arka panel 23 · önceki: Deney 6 |
| `A15` | U302-15 P6 | arka panel 24 · önceki: Deney 6 |
| `DE0` | U305-2 D0 | arka panel 25 · önceki: Deney 6 |
| `DE1` | U305-3 D1 | arka panel 26 · önceki: Deney 6 |
| `DE2` | U305-4 D2 | arka panel 27 · önceki: Deney 6 |
| `DE3` | U305-5 D3 | arka panel 28 · önceki: Deney 6 |
| `DE4` | U305-6 D4 | arka panel 29 · önceki: Deney 6 |
| `DE5` | U305-7 D5 | arka panel 30 · önceki: Deney 6 |
| `DE6` | U305-8 D6 | arka panel 31 · önceki: Deney 6 |
| `DE7` | U305-9 D7 | arka panel 32 · önceki: Deney 6 |
| `UART_CP` | U305-11 CP, U306-8 3Y |  |
| `UART_SEL` | U306-5 2B, U307-2 1Y |  |

**Boşta kalan çıkışlar (bağlanmaz):** U305-12 Q7, U305-13 Q6, U305-14 Q5, U305-15 Q4, U305-16 Q3, U305-17 Q2, U305-18 Q1, U305-19 Q0, U306-6 2Y, U306-11 4Y, U307-4 2Y, U307-6 3Y, U307-8 4Y, U307-10 5Y, U307-12 6Y

### Anakart

#### Malzeme (48 entegre, 53 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 28C256 | 1 | U420 | 32 KB paralel EEPROM (32K × 8, 5 V, bayt/sayfa yazma; 62256 ile aynı bacak düzeni) | GND 14, VCC 28 |
| 74HC00 | 2 | U430 U542 | 4 × 2 girişli NAND | GND 7, VCC 14 |
| 74HC02 | 2 | U431 U543 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC04 | 4 | U432 U433 U434 U545 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC08 | 7 | U426 U427 U534 U535 U536 U537 U538 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC32 | 3 | U428 U429 U540 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 5 | U415 U416 U503 U504 U505 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC138 | 1 | U425 | 3'ten 8'e kod çözücü (aktif düşük çıkış) | GND 8, VCC 16 |
| 74HC139 | 2 | U403 U502 | 2 × (2'den 4'e kod çözücü) | GND 8, VCC 16 |
| 74HC153 | 3 | U408 U409 U410 | 2 × (4'ten 1'e seçici) | GND 8, VCC 16 |
| 74HC245 | 2 | U418 U419 | 8 bit çift yönlü veriyolu alıcı-vericisi | GND 10, VCC 20 |
| 74HC273 | 4 | U404 U405 U406 U407 | 8 bit D flip-flop register (ortak asenkron reset) | GND 10, VCC 20 |
| 74HC541 | 4 | U411 U412 U413 U414 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 1 | U417 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |
| 74HC688 | 3 | U401 U402 U501 | 8 bit eşitlik karşılaştırıcı | GND 10, VCC 20 |
| 62256 | 4 | U421 U422 U423 U424 | 32 KB statik RAM (32K × 8) | GND 14, VCC 28 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 48 | C402 C403 C404 C405 C406 C407 C408 C409 C410 C411 C412 C413 C414 C415 C416 C417 C418 C419 C420 C421 C422 C423 C424 C425 C426 C427 C428 C429 C430 C431 C432 C433 C434 C435 C502 C503 C504 C505 C506 C535 C536 C537 C538 C539 C541 C543 C544 C546 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 2 | C401 C501 | 100 µF elektrolitik kondansatör (kart girişi) |
| RN_10K_8 | 3 | RN401 RN402 RN403 | 8 × 10 kΩ direnç dizisi (SIP-9, ortak uç) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U426** (74HC08, bu deneyde takılır): 1. kapı (tek bayt evresi [10, 22)); 2. kapı (bellekte çift bayt yazılacak); 3. kapı (çift bayt yazma darbesi); 4. kapı (tek bayt yazma penceresi [14, 18))
- **U427** (74HC08, bu deneyde takılır): 1. kapı (tek bayt yazma darbesi); 2. kapı (çift bayt mandalı saati (t = 6))
- **U428** (74HC32, bu deneyde takılır): 1. kapı (BANK0 yazma kenarı); 2. kapı (BANK1 yazma kenarı); 3. kapı (BANK2 yazma kenarı); 4. kapı (BANK3 yazma kenarı)
- **U429** (74HC32, bu deneyde takılır): 1. kapı (tek bayt aktarımı)
- **U430** (74HC00, bu deneyde takılır): 1. kapı (okumada veri yolunu sür [10, 22)); 2. kapı (çift bayt verisi → MD); 3. kapı (tek bayt aktarımı)
- **U431** (74HC02, bu deneyde takılır): 1. kapı (çift bayt yazma penceresi [2, 6)); 2. kapı (bellek çiplerinin ~WE'si)
- **U432** (74HC04, bu deneyde takılır): 1. kapı (BANK1 bit 5 reset değeri 1); 2. kapı (BANK1 bit 5 reset değeri 1); 3. kapı (BANK2 bit 0 reset değeri 1); 4. kapı (BANK2 bit 0 reset değeri 1); 5. kapı (BANK2 bit 5 reset değeri 1); 6. kapı (BANK2 bit 5 reset değeri 1)
- **U433** (74HC04, bu deneyde takılır): 1. kapı (BANK3 bit 1 reset değeri 1); 2. kapı (BANK3 bit 1 reset değeri 1); 3. kapı (BANK3 bit 5 reset değeri 1); 4. kapı (BANK3 bit 5 reset değeri 1); 5. kapı (bekleme sürüyor); 6. kapı (TCLK tersi)
- **U434** (74HC04, bu deneyde takılır): 1. kapı (okuma)
- **U534** (74HC08, bu deneyde takılır): 1. kapı (ikinci bekleme turu); 2. kapı (EEPROM / boş bölgede isabet); 3. kapı (satır geçersiz kılınacak); 4. kapı (ıskalama ya da önbellek kapalı)
- **U535** (74HC08, bu deneyde takılır): 1. kapı (bellek adresi, adımın ikinci yarısı); 2. kapı (ana belleğe erişim); 3. kapı (yazma evresi); 4. kapı (yazma evresi [14, 18))
- **U536** (74HC08, bu deneyde takılır): 1. kapı (doldurma); 2. kapı (satırı doldur); 3. kapı (geçersiz kıl); 4. kapı (RAM'de isabet)
- **U537** (74HC08, bu deneyde takılır): 1. kapı (gözetleme: RAM'e yazma isabeti); 2. kapı (çift bayt güncelle); 3. kapı (tek bayt güncelle); 4. kapı (bellek okuma)
- **U538** (74HC08, bu deneyde takılır): 1. kapı (isabetli okuma). Diğerleri: 2. kapı → Deney 9, 3. kapı → Deney 9, 4. kapı → Deney 9
- **U540** (74HC32, bu deneyde takılır): 1. kapı (bu adım yazma); 2. kapı (ana belleğe erişim); 3. kapı (bekleme); 4. kapı (etiket yazma)
- **U542** (74HC00, bu deneyde takılır): 1. kapı (etkin isabet değil); 2. kapı (bekleme isteği (iki tur)); 3. kapı (isabetli okuma (aktif düşük))
- **U543** (74HC02, bu deneyde takılır): 1. kapı (veri belleği yazma (çift)); 2. kapı (veri belleği yazma (tek)). Diğerleri: 3. kapı → Deney 9, 4. kapı → Deney 9
- **U545** (74HC04, bu deneyde takılır): 1. kapı (okuma); 2. kapı (bekleme sürüyor); 3. kapı (TCLK tersi); 4. kapı (EEPROM / boş bölge (PA19 = 0)); 5. kapı (etkin isabet); 6. kapı (adımın ikinci yarısı)

#### Bağlantılar (164 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U401-1 ~E, U402-3 Q0, U402-5 Q1, U402-9 Q3, U402-12 Q4, U402-14 Q5, U402-15 P6, U402-16 Q6, U402-17 P7, U402-18 Q7, U403-3 1A1, U403-13 2A1, U403-14 2A0, U404-17 D6, U404-18 D7, U405-17 D6, U405-18 D7, U406-17 D6, U406-18 D7, U407-17 D6, U407-18 D7, U408-1 ~1E, U408-15 ~2E, U409-1 ~1E, U409-15 ~2E, U410-1 ~1E, U410-15 ~2E, U411-8 A6, U411-9 A7, U412-8 A6, U412-9 A7, U413-8 A6, U413-9 A7, U414-8 A6, U414-9 A7, U416-2 1D, U416-12 2D, U427-9 3A, U427-10 3B, U427-12 4A, U427-13 4B, U429-4 2A, U429-5 2B, U429-9 3A, U429-10 3B, U429-12 4A, U429-13 4B, U430-12 4A, U430-13 4B, U431-8 3A, U431-9 3B, U431-11 4A, U431-12 4B, U434-3 2A, U434-5 3A, U434-9 4A, U434-11 5A, U434-13 6A, U501-3 Q0, U501-9 Q3, U501-12 Q4, U501-13 P5, U501-14 Q5, U501-15 P6, U501-16 Q6, U501-17 P7, U501-18 Q7, U502-13 2A1, U502-14 2A0, U504-2 1D, U504-12 2D, U542-12 4A, U542-13 4B | sabit seviye |
| **VCC** | U401-3 Q0, U401-5 Q1, U401-7 Q2, U401-9 Q3, U401-12 Q4, U401-14 Q5, U401-16 Q6, U401-18 Q7, U402-7 Q2, U403-15 ~2E, U415-4 ~1PRE, U415-10 ~2PRE, U418-1 DIR, U501-5 Q1, U501-7 Q2, U502-15 ~2E, U503-4 ~1PRE, U503-10 ~2PRE, U505-4 ~1PRE, U505-10 ~2PRE | sabit seviye |
| `~BANK1_5` | U405-15 Q5, U432-3 2A |  |
| `~BANK1_D5` | U405-14 D5, U432-2 1Y |  |
| `~BANK2_0` | U406-2 Q0, U432-9 4A |  |
| `~BANK2_5` | U406-15 Q5, U432-13 6A |  |
| `~BANK2_D0` | U406-3 D0, U432-6 3Y |  |
| `~BANK2_D5` | U406-14 D5, U432-10 5Y |  |
| `~BANK3_1` | U407-5 Q1, U433-3 2A |  |
| `~BANK3_5` | U407-15 Q5, U433-9 4A |  |
| `~BANK3_D1` | U407-4 D1, U433-2 1Y |  |
| `~BANK3_D5` | U407-14 D5, U433-6 3Y |  |
| `~BANKSEL` | U402-19 ~EQ, U403-1 ~1E |  |
| `~BSEL` | U415-8 ~2Q, U427-5 2B, U430-5 2B |  |
| `~BSEL01` | U403-4 ~1Y0, U411-19 ~OE2, U412-19 ~OE2, U428-2 1B, U428-5 2B |  |
| `~BSEL23` | U403-5 ~1Y1, U413-19 ~OE2, U414-19 ~OE2, U428-10 3B, U428-13 4B |  |
| `~C_CA` | U503-6 ~1Q, U542-10 3B |  |
| `~C_CB` | U503-8 ~2Q, U542-5 2B |  |
| `~C_CBF` | U505-6 ~1Q, U535-13 4B |  |
| `~C_CLK` | U535-2 1B, U545-12 6Y |  |
| `~C_CSEL` | U501-19 ~EQ, U502-1 ~1E |  |
| `~C_CWE_E` | U543-1 1Y | ◀ LED'le izlenebilir |
| `~C_CWE_O` | U543-4 2Y | ◀ LED'le izlenebilir |
| `~C_ENHIT` | U534-13 4B, U542-3 1Y, U545-11 5A |  |
| `~C_HITRD` | U542-8 3Y | ◀ LED'le izlenebilir |
| `~C_TCLK` | U505-3 1CLK, U545-6 3Y |  |
| `~CE_RAM0` | U421-20 ~CE, U425-11 ~Y4 |  |
| `~CE_RAM1` | U422-20 ~CE, U425-10 ~Y5 |  |
| `~CE_RAM2` | U423-20 ~CE, U425-9 ~Y6 |  |
| `~CE_RAM3` | U424-20 ~CE, U425-7 ~Y7 |  |
| `~CE_ROM` | U420-20 ~CE, U425-15 ~Y0 |  |
| `~CS_CTRL` | U502-6 ~1Y2 | ◀ LED'le izlenebilir |
| `~CS_HITS` | U502-4 ~1Y0 | ◀ LED'le izlenebilir |
| `~CS_MISS` | U502-5 ~1Y1 | ◀ LED'le izlenebilir |
| `~IO` | U401-19 ~EQ, U402-1 ~E, U425-6 E3, U426-5 2B, U501-1 ~E, U535-1 1A, U537-12 4A | arka panel 47 |
| `~M_EVEN_OE` | U418-19 ~OE, U430-6 2Y |  |
| `~M_ODD_OE` | U419-19 ~OE, U430-8 3Y |  |
| `~M_RDDRV` | U417-1 ~OE, U430-3 1Y |  |
| `~M_TCLK` | U415-11 2CLK, U433-12 6Y |  |
| `~MRD` | U411-1 ~OE1, U412-1 ~OE1, U413-1 ~OE1, U414-1 ~OE1, U419-1 DIR, U420-22 ~OE, U421-22 ~OE, U422-22 ~OE, U423-22 ~OE, U424-22 ~OE, U434-1 1A, U545-1 1A | arka panel 41 · önceki: Deney 6 |
| `~MWE_E` | U416-4 ~1PRE, U428-1 1A, U428-9 3A, U504-4 ~1PRE | arka panel 42 · önceki: Deney 6 |
| `~MWE_O` | U416-10 ~2PRE, U428-4 2A, U428-12 4A, U504-10 ~2PRE | arka panel 43 · önceki: Deney 6 |
| `~MWR` | U420-27 ~WE, U421-27 ~WE, U422-27 ~WE, U423-27 ~WE, U424-27 ~WE, U431-4 2Y |  |
| `~RESET` | U404-1 ~MR, U405-1 ~MR, U406-1 ~MR, U407-1 ~MR, U415-1 ~1CLR, U415-13 ~2CLR, U416-1 ~1CLR, U416-13 ~2CLR, U503-1 ~1CLR, U503-13 ~2CLR, U504-1 ~1CLR, U504-13 ~2CLR, U505-1 ~1CLR, U505-13 ~2CLR | arka panel 7 · önceki: Deney 1, 5, 6, 7 |
| `~WAIT` | U433-11 5A, U542-6 2Y, U545-3 2A | arka panel 46 · çekme direnci · önceki: Deney 1 |
| `A1` | U403-2 1A0, U420-9 A1, U421-9 A1, U422-9 A1, U423-9 A1, U424-9 A1, U502-2 1A0 | arka panel 10 · önceki: Deney 6 |
| `A2` | U402-2 P0, U420-8 A2, U421-8 A2, U422-8 A2, U423-8 A2, U424-8 A2, U502-3 1A1 | arka panel 11 · önceki: Deney 6 |
| `A3` | U402-4 P1, U420-7 A3, U421-7 A3, U422-7 A3, U423-7 A3, U424-7 A3, U501-2 P0 | arka panel 12 · önceki: Deney 6 |
| `A4` | U402-6 P2, U420-6 A4, U421-6 A4, U422-6 A4, U423-6 A4, U424-6 A4, U501-4 P1 | arka panel 13 · önceki: Deney 6 |
| `A5` | U402-8 P3, U420-5 A5, U421-5 A5, U422-5 A5, U423-5 A5, U424-5 A5, U501-6 P2 | arka panel 14 · önceki: Deney 6 |
| `A6` | U402-11 P4, U420-4 A6, U421-4 A6, U422-4 A6, U423-4 A6, U424-4 A6, U501-8 P3 | arka panel 15 · önceki: Deney 6 |
| `A7` | U402-13 P5, U420-3 A7, U421-3 A7, U422-3 A7, U423-3 A7, U424-3 A7, U501-11 P4 | arka panel 16 · önceki: Deney 6 |
| `A8` | U401-2 P0, U420-25 A8, U421-25 A8, U422-25 A8, U423-25 A8, U424-25 A8 | arka panel 17 · önceki: Deney 6 |
| `A9` | U401-4 P1, U420-24 A9, U421-24 A9, U422-24 A9, U423-24 A9, U424-24 A9 | arka panel 18 · önceki: Deney 6 |
| `A10` | U401-6 P2, U420-21 A10, U421-21 A10, U422-21 A10, U423-21 A10, U424-21 A10 | arka panel 19 · önceki: Deney 6 |
| `A11` | U401-8 P3, U420-23 A11, U421-23 A11, U422-23 A11, U423-23 A11, U424-23 A11 | arka panel 20 · önceki: Deney 6 |
| `A12` | U401-11 P4, U420-2 A12, U421-2 A12, U422-2 A12, U423-2 A12, U424-2 A12 | arka panel 21 · önceki: Deney 6 |
| `A13` | U401-13 P5, U420-26 A13, U421-26 A13, U422-26 A13, U423-26 A13, U424-26 A13 | arka panel 22 · önceki: Deney 6 |
| `A14` | U401-15 P6, U408-14 S0, U409-14 S0, U410-14 S0 | arka panel 23 · önceki: Deney 6 |
| `A15` | U401-17 P7, U408-2 S1, U409-2 S1, U410-2 S1 | arka panel 24 · önceki: Deney 6 |
| `BANK0_0` | U404-2 Q0, U408-6 1I0, U411-2 A0 |  |
| `BANK0_1` | U404-5 Q1, U408-10 2I0, U411-3 A1 |  |
| `BANK0_2` | U404-6 Q2, U409-6 1I0, U411-4 A2 |  |
| `BANK0_3` | U404-9 Q3, U409-10 2I0, U411-5 A3 |  |
| `BANK0_4` | U404-12 Q4, U410-6 1I0, U411-6 A4 |  |
| `BANK0_5` | U404-15 Q5, U410-10 2I0, U411-7 A5 |  |
| `BANK0_CP` | U404-11 CP, U428-3 1Y |  |
| `BANK1_0` | U405-2 Q0, U408-5 1I1, U412-2 A0 |  |
| `BANK1_1` | U405-5 Q1, U408-11 2I1, U412-3 A1 |  |
| `BANK1_2` | U405-6 Q2, U409-5 1I1, U412-4 A2 |  |
| `BANK1_3` | U405-9 Q3, U409-11 2I1, U412-5 A3 |  |
| `BANK1_4` | U405-12 Q4, U410-5 1I1, U412-6 A4 |  |
| `BANK1_5` | U410-11 2I1, U412-7 A5, U432-4 2Y |  |
| `BANK1_CP` | U405-11 CP, U428-6 2Y |  |
| `BANK2_0` | U408-4 1I2, U413-2 A0, U432-8 4Y |  |
| `BANK2_1` | U406-5 Q1, U408-12 2I2, U413-3 A1 |  |
| `BANK2_2` | U406-6 Q2, U409-4 1I2, U413-4 A2 |  |
| `BANK2_3` | U406-9 Q3, U409-12 2I2, U413-5 A3 |  |
| `BANK2_4` | U406-12 Q4, U410-4 1I2, U413-6 A4 |  |
| `BANK2_5` | U410-12 2I2, U413-7 A5, U432-12 6Y |  |
| `BANK2_CP` | U406-11 CP, U428-8 3Y |  |
| `BANK3_0` | U407-2 Q0, U408-3 1I3, U414-2 A0 |  |
| `BANK3_1` | U408-13 2I3, U414-3 A1, U433-4 2Y |  |
| `BANK3_2` | U407-6 Q2, U409-3 1I3, U414-4 A2 |  |
| `BANK3_3` | U407-9 Q3, U409-13 2I3, U414-5 A3 |  |
| `BANK3_4` | U407-12 Q4, U410-3 1I3, U414-6 A4 |  |
| `BANK3_5` | U410-13 2I3, U414-7 A5, U433-8 4Y |  |
| `BANK3_CP` | U407-11 CP, U428-11 4Y |  |
| `BSEL` | U415-9 2Q, U420-10 A0, U421-10 A0, U422-10 A0, U423-10 A0, U424-10 A0, U426-2 1B, U426-13 4B |  |
| `C_CA` | U503-5 1Q, U534-1 1A, U540-10 3B |  |
| `C_CB` | U503-9 2Q, U505-2 1D, U535-10 3B |  |
| `C_CBD` | U503-12 2D, U534-3 1Y |  |
| `C_EN` | U536-2 1B, U542-1 1A | ▶ elle sür (Deney 9) |
| `C_ENHIT` | U538-2 1B, U545-10 5Y |  |
| `C_FILL` | U536-6 2Y, U540-12 4A, U543-2 1A, U543-5 2A |  |
| `C_HIT` | U534-4 2A, U536-12 4A, U542-2 1B | ▶ elle sür (Deney 9) |
| `C_INVD` | U505-12 2D, U534-8 3Y |  |
| `C_INVL` | U505-9 2Q, U536-10 3B |  |
| `C_INVWR` | U536-8 3Y, U540-13 4B |  |
| `C_MEMACC` | U535-5 2B, U540-6 2Y |  |
| `C_MEMNOW` | U535-3 1Y, U535-4 2A |  |
| `C_MRD` | U534-12 4A, U536-1 1A, U537-13 4B, U545-2 1Y |  |
| `C_NEED` | U535-6 2Y, U540-9 3A |  |
| `C_RAMHIT` | U536-11 4Y, U537-2 1B |  |
| `C_RDMISS` | U534-11 4Y, U540-5 2B |  |
| `C_ROM` | U534-5 2B, U545-8 4Y |  |
| `C_SNP` | U537-3 1Y, U537-4 2A, U537-9 3A |  |
| `C_TAGPH` | U535-11 4Y, U536-4 2A, U536-9 3A, U537-1 1A |  |
| `C_TAGWR` | U540-11 4Y | ◀ LED'le izlenebilir |
| `C_TCB` | U535-8 3Y, U535-12 4A |  |
| `C_WAITING` | U503-2 1D, U534-2 1B, U545-4 2Y |  |
| `C_WRL` | U534-9 3A, U540-3 1Y, U540-4 2A |  |
| `C_WRL_E` | U504-5 1Q, U537-5 2B, U540-1 1A |  |
| `C_WRL_O` | U504-9 2Q, U537-10 3B, U540-2 1B |  |
| `CLK` | U416-3 1CLK, U416-11 2CLK, U504-3 1CLK, U504-11 2CLK, U545-13 6A | arka panel 5 · önceki: Deney 1, 6, 7 |
| `DE0` | RN402.2, U404-3 D0, U411-18 Y0, U413-18 Y0, U417-19 Q0, U418-2 A0, U432-5 3A | arka panel 25 · çekme direnci · önceki: Deney 6 |
| `DE1` | RN402.3, U404-4 D1, U406-4 D1, U411-17 Y1, U413-17 Y1, U417-18 Q1, U418-3 A1 | arka panel 26 · çekme direnci · önceki: Deney 6 |
| `DE2` | RN402.4, U404-7 D2, U406-7 D2, U411-16 Y2, U413-16 Y2, U417-17 Q2, U418-4 A2 | arka panel 27 · çekme direnci · önceki: Deney 6 |
| `DE3` | RN402.5, U404-8 D3, U406-8 D3, U411-15 Y3, U413-15 Y3, U417-16 Q3, U418-5 A3 | arka panel 28 · çekme direnci · önceki: Deney 6 |
| `DE4` | RN402.6, U404-13 D4, U406-13 D4, U411-14 Y4, U413-14 Y4, U417-15 Q4, U418-6 A4 | arka panel 29 · çekme direnci · önceki: Deney 6 |
| `DE5` | RN402.7, U404-14 D5, U411-13 Y5, U413-13 Y5, U417-14 Q5, U418-7 A5, U432-11 5A | arka panel 30 · çekme direnci · önceki: Deney 6 |
| `DE6` | RN402.8, U411-12 Y6, U413-12 Y6, U417-13 Q6, U418-8 A6 | arka panel 31 · çekme direnci · önceki: Deney 6 |
| `DE7` | RN402.9, U411-11 Y7, U413-11 Y7, U417-12 Q7, U418-9 A7 | arka panel 32 · çekme direnci · önceki: Deney 6 |
| `DO0` | RN403.2, U405-3 D0, U407-3 D0, U412-18 Y0, U414-18 Y0, U419-2 A0 | arka panel 33 · çekme direnci · önceki: Deney 6 |
| `DO1` | RN403.3, U405-4 D1, U412-17 Y1, U414-17 Y1, U419-3 A1, U433-1 1A | arka panel 34 · çekme direnci · önceki: Deney 6 |
| `DO2` | RN403.4, U405-7 D2, U407-7 D2, U412-16 Y2, U414-16 Y2, U419-4 A2 | arka panel 35 · çekme direnci · önceki: Deney 6 |
| `DO3` | RN403.5, U405-8 D3, U407-8 D3, U412-15 Y3, U414-15 Y3, U419-5 A3 | arka panel 36 · çekme direnci · önceki: Deney 6 |
| `DO4` | RN403.6, U405-13 D4, U407-13 D4, U412-14 Y4, U414-14 Y4, U419-6 A4 | arka panel 37 · çekme direnci · önceki: Deney 6 |
| `DO5` | RN403.7, U412-13 Y5, U414-13 Y5, U419-7 A5, U432-1 1A, U433-5 3A | arka panel 38 · çekme direnci · önceki: Deney 6 |
| `DO6` | RN403.8, U412-12 Y6, U414-12 Y6, U419-8 A6 | arka panel 39 · çekme direnci · önceki: Deney 6 |
| `DO7` | RN403.9, U412-11 Y7, U414-11 Y7, U419-9 A7 | arka panel 40 · çekme direnci · önceki: Deney 6 |
| `M_EWIN` | U426-10 3B, U431-1 1Y |  |
| `M_EWR` | U426-8 3Y, U431-5 2A |  |
| `M_LCP` | U417-11 CP, U427-6 2Y |  |
| `M_MRD` | U429-1 1A, U430-2 1B, U434-2 1Y |  |
| `M_OWIN` | U426-11 4Y, U427-1 1A |  |
| `M_OWR` | U427-3 1Y, U431-6 2B |  |
| `M_SA` | U415-5 1Q, U415-12 2D, U426-1 1A, U431-3 1B |  |
| `M_SODD` | U426-3 1Y, U430-1 1A, U430-9 3A |  |
| `M_WAITING` | U415-2 1D, U433-10 5Y |  |
| `M_WEL_E` | U416-5 1Q, U426-4 2A |  |
| `M_WEL_O` | U416-9 2Q, U427-2 1B, U429-2 1B |  |
| `M_WEM` | U426-6 2Y, U426-9 3A, U430-4 2A |  |
| `MD0` | RN401.2, U417-2 D0, U418-18 B0, U419-18 B0, U420-11 IO0, U421-11 IO0, U422-11 IO0, U423-11 IO0, U424-11 IO0 | çekme direnci |
| `MD1` | RN401.3, U417-3 D1, U418-17 B1, U419-17 B1, U420-12 IO1, U421-12 IO1, U422-12 IO1, U423-12 IO1, U424-12 IO1 | çekme direnci |
| `MD2` | RN401.4, U417-4 D2, U418-16 B2, U419-16 B2, U420-13 IO2, U421-13 IO2, U422-13 IO2, U423-13 IO2, U424-13 IO2 | çekme direnci |
| `MD3` | RN401.5, U417-5 D3, U418-15 B3, U419-15 B3, U420-15 IO3, U421-15 IO3, U422-15 IO3, U423-15 IO3, U424-15 IO3 | çekme direnci |
| `MD4` | RN401.6, U417-6 D4, U418-14 B4, U419-14 B4, U420-16 IO4, U421-16 IO4, U422-16 IO4, U423-16 IO4, U424-16 IO4 | çekme direnci |
| `MD5` | RN401.7, U417-7 D5, U418-13 B5, U419-13 B5, U420-17 IO5, U421-17 IO5, U422-17 IO5, U423-17 IO5, U424-17 IO5 | çekme direnci |
| `MD6` | RN401.8, U417-8 D6, U418-12 B6, U419-12 B6, U420-18 IO6, U421-18 IO6, U422-18 IO6, U423-18 IO6, U424-18 IO6 | çekme direnci |
| `MD7` | RN401.9, U417-9 D7, U418-11 B7, U419-11 B7, U420-19 IO7, U421-19 IO7, U422-19 IO7, U423-19 IO7, U424-19 IO7 | çekme direnci |
| (adsız) | U429-3 1Y, U430-10 3B |  |
| (adsız) | U534-6 2Y, U534-10 3B |  |
| (adsız) | U540-8 3Y, U542-4 2A |  |
| (adsız) | U536-3 1Y, U536-5 2B |  |
| (adsız) | U537-6 2Y, U543-3 1B |  |
| (adsız) | U537-8 3Y, U543-6 2B |  |
| (adsız) | U537-11 4Y, U538-1 1A |  |
| (adsız) | U538-3 1Y, U542-9 3A |  |
| `PA14` | U408-7 1Y, U420-1 A14, U421-1 A14, U422-1 A14, U423-1 A14, U424-1 A14 | arka panel 50 |
| `PA15` | U408-9 2Y, U425-1 A0 | arka panel 51 |
| `PA16` | U409-7 1Y, U425-2 A1 | arka panel 52 |
| `PA17` | U409-9 2Y, U425-4 ~E1 | arka panel 53 |
| `PA18` | U410-7 1Y, U425-5 ~E2 | arka panel 54 |
| `PA19` | U410-9 2Y, U425-3 A2, U536-13 4B, U545-9 4A | arka panel 55 |
| `TCLK` | U415-3 1CLK, U426-12 4A, U427-4 2A, U431-2 1A, U433-13 6A, U503-3 1CLK, U503-11 2CLK, U505-11 2CLK, U535-9 3A, U545-5 3A | arka panel 48 · önceki: Deney 1 |

**Boşta kalan çıkışlar (bağlanmaz):** U403-6 ~1Y2, U403-7 ~1Y3, U403-9 ~2Y3, U403-10 ~2Y2, U403-11 ~2Y1, U403-12 ~2Y0, U404-16 Q6, U404-19 Q7, U405-16 Q6, U405-19 Q7, U406-16 Q6, U406-19 Q7, U407-16 Q6, U407-19 Q7, U415-6 ~1Q, U416-6 ~1Q, U416-8 ~2Q, U425-12 ~Y3, U425-13 ~Y2, U425-14 ~Y1, U427-8 3Y, U427-11 4Y, U429-6 2Y, U429-8 3Y, U429-11 4Y, U430-11 4Y, U431-10 3Y, U431-13 4Y, U434-4 2Y, U434-6 3Y, U434-8 4Y, U434-10 5Y, U434-12 6Y, U502-7 ~1Y3, U502-9 ~2Y3, U502-10 ~2Y2, U502-11 ~2Y1, U502-12 ~2Y0, U504-6 ~1Q, U504-8 ~2Q, U505-5 1Q, U505-8 ~2Q, U542-11 4Y

**Elle sürülecek girişler (2):** `C_EN`, `C_HIT`

**İzlenebilecek çıkışlar (7):** `~C_CWE_E`, `~C_CWE_O`, `~C_HITRD`, `~CS_CTRL`, `~CS_HITS`, `~CS_MISS`, `C_TAGWR`
<!-- otomatik: bitti -->
