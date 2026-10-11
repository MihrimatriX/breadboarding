# Deney 8: Bellek kartı ve ilk program

> **Video:** "İlk program: bilgisayar kendi 512 KB belleğini sınıyor" · **Önce:** Deney 3 (programlayıcı), 7 (CPU tamam) · **Kart:** bellek kartı (`bellek`), önbellek kartının bekleme blokları, test kartının FF00 çıkış mandalı

Bu deneyin sonunda CPU ilk kez gerçek bir programı Flash'tan çalıştırır: 512 KB RAM'in 32 bankının
hepsine desen yazar, geri okur ve sonucu 8 LED'de gösterir. LED'ler bank bank sayar, bellek
sağlamsa `0xA5` yanar ve ardından kayan ışık başlar. Sahte bellek (Deney 6) bu deneyde çıkar.

## Ne öğreneceksin

- **Bank'lı bellek (basit MMU)**: 16 bitlik CPU'nun 1 MB'ı nasıl gördüğü. Dört 16 KB'lık pencere,
  her birine 6 bitlik bir bank register'ı (74HC273), adresin üst iki bitiyle seçilen 74HC153'ler.
- **Reset değeri olan register**: 74HC273'te yalnız sıfırlama var; 32/33/34 reset değerleri, 1 olması
  gereken bitlerin girişte ve çıkışta evirici çiftiyle ters saklanmasıyla elde edilir.
- **8 bitlik çipe 16 bitlik kelime**: bayt sıralayıcı. Çift bayt bir 74HC574 mandalına alınır, tek
  bayt doğrudan geçer; A0'ı (`BSEL`) sıralayıcı sürer.
- **Bekleme durumları**: önbellek kartının `~WAIT`'i, saat kartının W flip-flop'u; her bekleme turu
  CPU döngüsünü tam 8 osilatör periyodu uzatır.
- **Adres çözme**: 74HC688 ile G/Ç alanı (`FF00–FFFF`), Flash / RAM / boş bölge seçimi.
- **Bellek testi**: "adres XOR bank" deseni neden kopuk ya da kısa devre adres hatlarını yakalar;
  neden önce bütün banklar yazılıp sonra okunur.

## Nasıl çalışır

- Fiziksel adres = `BANKn · 0x4000 + (CPU adresi & 0x3FFF)`, `n` = CPU adresinin üst iki biti.
  Flash fiziksel `0x00000–0x1FFFF` (bank 0–7), RAM `0x80000–0xFFFFF` (bank 32–63), arası boş.
  Reset bankları 0, 32, 33, 34'e getirir: vektörler hep Flash bank 0'dan okunur. Harita:
  `cpu16/docs/anakart.md` ("Bellek ve bank register'ları").
- Her ana bellek erişimi **iki bekleme turu** alır. Önbellek kartının bekleme sayacı (U503) `~WAIT`'i
  iki tur düşük tutar; bellek kartının sıralayıcısı (U415) aynı `~WAIT` ve `TCLK`'den çift ve tek baytın
  sırasını çıkarır. Zaman çizimi: `cpu16/docs/anakart-kartlari.md` ("Bekleme durumlu bir erişim").
- Bu deneyde önbellek yok: `C_EN` ve `C_HIT` GND'de, her okuma ana belleğe gider. Program yine de
  `CACHE_CTRL`'ye (`FF34`) 0 yazar; Deney 9'da önbellek takılınca test RAM yerine önbelleği okumasın.
- **FF00 çıkış mandalı**: test kartının UART bloğu (U305, 74HC574). İki 74HC688 (U301, U302) adresi
  `FF00` ile karşılaştırır, yazma darbesi mandalı saatler; çıkışlar 8 LED'i sürer. G/Ç kartına
  (Deney 10) kadar programların tek çıkışı budur, sonra da hata ayıklama ışığı olarak kalır.
- Program (`cpu16/kit/programlar/bellek-deneme.s`): her kelimeye `adres XOR bank·0x0101` yazar,
  32 bankın hepsini yazıp sonra hepsini okur, sonra aynısını ters desenle yapar. RAM'i başka hiçbir
  şey için kullanmaz (yığın yok): RAM bozuksa bile program çalışır ve hatayı gösterir.
  Son olarak boş bölgeden (bank 8) `0xFFFF` okunmasını ister: veriyolu çekme dirençleri.

## Kurulum adımları

1. Sahte belleği (Deney 6'daki DIP anahtarlar) veriyolundan çıkar.
2. Bellek kartını blok blok kur: adres çözme (U401–U403), bank register'ları (U404–U414), bayt
   sıralayıcı (U415–U419), Flash ve RAM soketleri (U420, U421), çekme dirençleri (RN401–RN403) ve
   tablodaki yapıştırıcı kapılar.
3. Önbellek kartından yalnızca "G/Ç çözme" (U501, U502) ve "Bekleme ve sıralama" (U503–U505)
   blokları ile tabloda "bu deneyde takılır" denen kapılar. `C_EN` ve `C_HIT`'i 10 kΩ ile GND'ye çek
   (Deney 9'da önbelleğin kendisi sürer).
4. Test kartının UART bloğu (U301, U302, U305–U307). U305'in Q0..Q7 bacaklarına (19, 18 … 12)
   birer 1 kΩ + LED, katotlar GND'ye. Q7 (bacak 12) en soldaki LED olsun.
5. Programı Flash'a yaz ve çipi U420'ye tak:
   ```
   npm run cpu16 -- asm cpu16/kit/programlar/bellek-deneme.s -o bellek.hex
   python3 cpu16/programlayici/yaz.py PORT bellek.hex --sil --dogrula
   ```
6. Saat kartı NORMAL kipte, 8 MHz osilatör (CPU 1 MHz). RESET'e bas.

## Test: beklenen sonuç

| Zaman (1 MHz) | LED'ler | Anlam |
|---|---|---|
| 0–10 s | `0x20` → `0x3F` | düz desen yazılıyor, bank 32 … 63 |
| 10–23 s | `0x20` → `0x3F` | düz desen geri okunuyor |
| 23–46 s | `0x60` → `0x7F`, iki kez | ters desen (bit 6 yanık) yazılıp okunuyor |
| ≈ 46 s | `0xA5` (● · ● · · ● · ●) | bellek sağlam |
| sonra | kayan ışık, adım ≈ 0,1 s | program çalışmayı sürdürüyor |
| hata | bit 7 yanar, kalan bitler bank ve desen | program durur: ör. `0xA8` = düz desende bank 40 |
| `0x88` | | boş bölge `0xFFFF` okunmadı: çekme dirençleri ya da Flash/RAM seçimi |

LED'ler hiç `0x20`'ye gelmiyorsa CPU programı Flash'tan okuyamıyordur (aşağıya bak).

## Simülatörde

- `npm run cpu16 -- machine cpu16/kit/programlar/bellek-deneme.s --rom --led`: program Flash'a
  yazılmış gibi BIOS'suz çalışır, FF00'a her yazılan değer bir LED satırı olarak 1 MHz zamanıyla basılır.
- Kapı seviyesi: `cpu16/tests/anakart-bellek.test.ts` bellek ve önbellek kartlarını kapı seviyesinde
  kurar ve her erişimi `Machine` modeliyle karşılaştırır (bank register'ları, RAM, Flash, bekleme).
- Deneme programının kendisi ve bir hücre bozulunca beklenen hata kodu: `cpu16/tests/kit.test.ts`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| LED'ler hiç yanmıyor | Önce FF00 mandalı: U301/U302'nin `~EQ` çıkışları `FF00`'da düşmeli. Sonra Flash: RESET'te adres 0x0000, `~MRD` düşük, U420'nin `~CE`'si (PA19..17 = 000) düşük mü |
| CPU hep bekliyor (CLK durmuş) | `~WAIT` bırakılmıyor: U503'ün CA/CB çıkışları; `TCLK` önbellek kartına geliyor mu |
| Rastgele değerler, program kayıyor | Bayt sırası: U415'te `BSEL`; U417 çift baytı t = 6'da alıyor mu. Flash'ın A0'ı `BSEL`'e bağlı olmalı, CPU'nun A0'ına değil |
| Hep aynı bankta hata | O bankın bit deseni: ör. bank 40'ta hata, 32–39 sağlamsa PA17 (bank bit 3) kopuk ya da kısa devre |
| Okuma geçişinin başında hata (bank 32) | Banklar birbirinin üstüne yazıyor: U408–U410 seçicileri ya da bank register'ı (U405) |
| Hep aynı bitte hata (r0 XOR r2 tek bit) | O veri hattı: `MD0..7` ve U418/U419'un yönü (`DIR`); simülatörde r0 okunan, r2 beklenen |
| Hatalı bank her RESET'te değişiyor | Gürültü ya da zamanlama: dekuplaj kondansatörleri, kısa kablolar; 4 MHz osilatörle (CPU 0,5 MHz) tekrar dene |
| `0x88` | RN401 (`MD` çekme dirençleri) takılı mı; boş bölgede U420 ve U421 seçilmemeli |

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

#### Malzeme (45 entegre, 50 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC00 | 3 | U426 U427 U534 | 4 × 2 girişli NAND | GND 7, VCC 14 |
| 74HC02 | 2 | U428 U535 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC04 | 4 | U429 U430 U431 U537 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC08 | 7 | U422 U423 U526 U527 U528 U529 U530 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC32 | 3 | U424 U425 U531 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 5 | U415 U416 U503 U504 U505 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC139 | 2 | U403 U502 | 2 × (2'den 4'e kod çözücü) | GND 8, VCC 16 |
| 74HC153 | 3 | U408 U409 U410 | 2 × (4'ten 1'e seçici) | GND 8, VCC 16 |
| 74HC245 | 2 | U418 U419 | 8 bit çift yönlü veriyolu alıcı-vericisi | GND 10, VCC 20 |
| 74HC273 | 4 | U404 U405 U406 U407 | 8 bit D flip-flop register (ortak asenkron reset) | GND 10, VCC 20 |
| 74HC541 | 4 | U411 U412 U413 U414 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 1 | U417 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |
| 74HC688 | 3 | U401 U402 U501 | 8 bit eşitlik karşılaştırıcı | GND 10, VCC 20 |
| AS6C4008 | 1 | U421 | 512 KB statik RAM (512K × 8) | VSS 16, VCC 32 |
| SST39SF010A | 1 | U420 | 128 KB Flash (128K × 8, 5 V, komutla programlanır) | VSS 16, VDD 32 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 45 | C402 C403 C404 C405 C406 C407 C408 C409 C410 C411 C412 C413 C414 C415 C416 C417 C418 C419 C420 C421 C422 C423 C424 C425 C426 C427 C428 C429 C430 C431 C432 C502 C503 C504 C505 C506 C527 C528 C529 C530 C531 C532 C535 C536 C538 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 2 | C401 C501 | 100 µF elektrolitik kondansatör (kart girişi) |
| RN_10K_8 | 3 | RN401 RN402 RN403 | 8 × 10 kΩ direnç dizisi (SIP-9, ortak uç) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U422** (74HC08, bu deneyde takılır): 1. kapı (tek bayt evresi [10, 22)); 2. kapı (bellekte çift bayt yazılacak); 3. kapı (çift bayt yazma darbesi); 4. kapı (tek bayt yazma penceresi [14, 18))
- **U423** (74HC08, bu deneyde takılır): 1. kapı (tek bayt yazma darbesi); 2. kapı (çift bayt mandalı saati (t = 6))
- **U424** (74HC32, bu deneyde takılır): 1. kapı (BANK0 yazma kenarı); 2. kapı (BANK1 yazma kenarı); 3. kapı (BANK2 yazma kenarı); 4. kapı (BANK3 yazma kenarı)
- **U425** (74HC32, bu deneyde takılır): 1. kapı (tek bayt aktarımı)
- **U426** (74HC00, bu deneyde takılır): 1. kapı (bellek erişimi ve PA19 = 0); 2. kapı (RAM seçimi (PA19 = 1)); 3. kapı (okumada veri yolunu sür [10, 22)); 4. kapı (çift bayt verisi → MD)
- **U427** (74HC00, bu deneyde takılır): 1. kapı (tek bayt aktarımı)
- **U428** (74HC02, bu deneyde takılır): 1. kapı (çift bayt yazma penceresi [2, 6)); 2. kapı (bellek çiplerinin ~WE'si)
- **U429** (74HC04, bu deneyde takılır): 1. kapı (Flash bölgesi (PA19 = 0)); 2. kapı (BANK1 bit 5 reset değeri 1); 3. kapı (BANK1 bit 5 reset değeri 1); 4. kapı (BANK2 bit 0 reset değeri 1); 5. kapı (BANK2 bit 0 reset değeri 1); 6. kapı (BANK2 bit 5 reset değeri 1)
- **U430** (74HC04, bu deneyde takılır): 1. kapı (BANK2 bit 5 reset değeri 1); 2. kapı (BANK3 bit 1 reset değeri 1); 3. kapı (BANK3 bit 1 reset değeri 1); 4. kapı (BANK3 bit 5 reset değeri 1); 5. kapı (BANK3 bit 5 reset değeri 1); 6. kapı (bekleme sürüyor)
- **U431** (74HC04, bu deneyde takılır): 1. kapı (TCLK tersi); 2. kapı (okuma)
- **U526** (74HC08, bu deneyde takılır): 1. kapı (ikinci bekleme turu); 2. kapı (Flash bölgesinde isabet); 3. kapı (satır geçersiz kılınacak); 4. kapı (ıskalama ya da önbellek kapalı)
- **U527** (74HC08, bu deneyde takılır): 1. kapı (bellek adresi, adımın ikinci yarısı); 2. kapı (ana belleğe erişim); 3. kapı (yazma evresi); 4. kapı (yazma evresi [14, 18))
- **U528** (74HC08, bu deneyde takılır): 1. kapı (doldurma); 2. kapı (satırı doldur); 3. kapı (geçersiz kıl); 4. kapı (RAM'de isabet)
- **U529** (74HC08, bu deneyde takılır): 1. kapı (gözetleme: RAM'e yazma isabeti); 2. kapı (çift bayt güncelle); 3. kapı (tek bayt güncelle); 4. kapı (bellek okuma)
- **U530** (74HC08, bu deneyde takılır): 1. kapı (isabetli okuma). Diğerleri: 2. kapı → Deney 9, 3. kapı → Deney 9, 4. kapı → Deney 9
- **U531** (74HC32, bu deneyde takılır): 1. kapı (bu adım yazma); 2. kapı (ana belleğe erişim); 3. kapı (bekleme); 4. kapı (etiket yazma)
- **U534** (74HC00, bu deneyde takılır): 1. kapı (etkin isabet değil); 2. kapı (bekleme isteği (iki tur)); 3. kapı (isabetli okuma (aktif düşük)). Diğerleri: 4. kapı → Deney 9
- **U535** (74HC02, bu deneyde takılır): 1. kapı (veri belleği yazma (çift)); 2. kapı (veri belleği yazma (tek)). Diğerleri: 3. kapı → Deney 9, 4. kapı → Deney 9
- **U537** (74HC04, bu deneyde takılır): 1. kapı (okuma); 2. kapı (bekleme sürüyor); 3. kapı (TCLK tersi); 4. kapı (Flash / boş bölge (PA19 = 0)); 5. kapı (etkin isabet); 6. kapı (adımın ikinci yarısı)

#### Bağlantılar (163 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U401-1 ~E, U402-3 Q0, U402-5 Q1, U402-9 Q3, U402-12 Q4, U402-14 Q5, U402-15 P6, U402-16 Q6, U402-17 P7, U402-18 Q7, U403-3 1A1, U404-17 D6, U404-18 D7, U405-17 D6, U405-18 D7, U406-17 D6, U406-18 D7, U407-17 D6, U407-18 D7, U408-1 ~1E, U408-15 ~2E, U409-1 ~1E, U409-15 ~2E, U410-1 ~1E, U410-15 ~2E, U411-8 A6, U411-9 A7, U412-8 A6, U412-9 A7, U413-8 A6, U413-9 A7, U414-8 A6, U414-9 A7, U416-2 1D, U416-12 2D, U423-9 3A, U423-10 3B, U423-12 4A, U423-13 4B, U425-4 2A, U425-5 2B, U425-9 3A, U425-10 3B, U425-12 4A, U425-13 4B, U427-4 2A, U427-5 2B, U427-9 3A, U427-10 3B, U427-12 4A, U427-13 4B, U428-8 3A, U428-9 3B, U428-11 4A, U428-12 4B, U431-5 3A, U431-9 4A, U431-11 5A, U431-13 6A, U501-3 Q0, U501-9 Q3, U501-12 Q4, U501-13 P5, U501-14 Q5, U501-15 P6, U501-16 Q6, U501-17 P7, U501-18 Q7, U502-13 2A1, U502-14 2A0, U504-2 1D, U504-12 2D | sabit seviye |
| **VCC** | U401-3 Q0, U401-5 Q1, U401-7 Q2, U401-9 Q3, U401-12 Q4, U401-14 Q5, U401-16 Q6, U401-18 Q7, U402-7 Q2, U415-4 ~1PRE, U415-10 ~2PRE, U418-1 DIR, U501-5 Q1, U501-7 Q2, U502-15 ~2E, U503-4 ~1PRE, U503-10 ~2PRE, U505-4 ~1PRE, U505-10 ~2PRE | sabit seviye |
| `~BANK1_5` | U405-15 Q5, U429-5 3A |  |
| `~BANK1_D5` | U405-14 D5, U429-4 2Y |  |
| `~BANK2_0` | U406-2 Q0, U429-11 5A |  |
| `~BANK2_5` | U406-15 Q5, U430-1 1A |  |
| `~BANK2_D0` | U406-3 D0, U429-8 4Y |  |
| `~BANK2_D5` | U406-14 D5, U429-12 6Y |  |
| `~BANK3_1` | U407-5 Q1, U430-5 3A |  |
| `~BANK3_5` | U407-15 Q5, U430-11 5A |  |
| `~BANK3_D1` | U407-4 D1, U430-4 2Y |  |
| `~BANK3_D5` | U407-14 D5, U430-8 4Y |  |
| `~BANKSEL` | U402-19 ~EQ, U403-1 ~1E |  |
| `~BSEL` | U415-8 ~2Q, U423-5 2B, U426-13 4B |  |
| `~BSEL01` | U403-4 ~1Y0, U411-19 ~OE2, U412-19 ~OE2, U424-2 1B, U424-5 2B |  |
| `~BSEL23` | U403-5 ~1Y1, U413-19 ~OE2, U414-19 ~OE2, U424-10 3B, U424-13 4B |  |
| `~C_CA` | U503-6 ~1Q, U534-10 3B |  |
| `~C_CB` | U503-8 ~2Q, U534-5 2B |  |
| `~C_CBF` | U505-6 ~1Q, U527-13 4B |  |
| `~C_CLK` | U527-2 1B, U537-12 6Y |  |
| `~C_CSEL` | U501-19 ~EQ, U502-1 ~1E |  |
| `~C_CWE_E` | U535-1 1Y | ◀ LED'le izlenebilir |
| `~C_CWE_O` | U535-4 2Y | ◀ LED'le izlenebilir |
| `~C_ENHIT` | U526-13 4B, U534-3 1Y, U537-11 5A |  |
| `~C_HITRD` | U534-8 3Y | ◀ LED'le izlenebilir |
| `~C_TCLK` | U505-3 1CLK, U537-6 3Y |  |
| `~CE_FLASH` | U403-12 ~2Y0, U420-22 ~CE |  |
| `~CE_RAM` | U421-22 ~CE, U426-6 2Y |  |
| `~CS_CTRL` | U502-6 ~1Y2 | ◀ LED'le izlenebilir |
| `~CS_HITS` | U502-4 ~1Y0 | ◀ LED'le izlenebilir |
| `~CS_MISS` | U502-5 ~1Y1 | ◀ LED'le izlenebilir |
| `~IO` | U401-19 ~EQ, U402-1 ~E, U422-5 2B, U426-1 1A, U426-5 2B, U501-1 ~E, U527-1 1A, U529-12 4A | arka panel 47 |
| `~LOWSEL` | U403-15 ~2E, U426-3 1Y |  |
| `~M_EVEN_OE` | U418-19 ~OE, U426-11 4Y |  |
| `~M_ODD_OE` | U419-19 ~OE, U427-3 1Y |  |
| `~M_RDDRV` | U417-1 ~OE, U426-8 3Y |  |
| `~M_TCLK` | U415-11 2CLK, U431-2 1Y |  |
| `~MRD` | U411-1 ~OE1, U412-1 ~OE1, U413-1 ~OE1, U414-1 ~OE1, U419-1 DIR, U420-24 ~OE, U421-24 ~OE, U431-3 2A, U537-1 1A | arka panel 41 · önceki: Deney 6 |
| `~MWE_E` | U416-4 ~1PRE, U424-1 1A, U424-9 3A, U504-4 ~1PRE | arka panel 42 · önceki: Deney 6 |
| `~MWE_O` | U416-10 ~2PRE, U424-4 2A, U424-12 4A, U504-10 ~2PRE | arka panel 43 · önceki: Deney 6 |
| `~MWR` | U420-31 ~WE, U421-29 ~WE, U428-4 2Y |  |
| `~PA19` | U426-2 1B, U429-2 1Y |  |
| `~RESET` | U404-1 ~MR, U405-1 ~MR, U406-1 ~MR, U407-1 ~MR, U415-1 ~1CLR, U415-13 ~2CLR, U416-1 ~1CLR, U416-13 ~2CLR, U503-1 ~1CLR, U503-13 ~2CLR, U504-1 ~1CLR, U504-13 ~2CLR, U505-1 ~1CLR, U505-13 ~2CLR | arka panel 7 · önceki: Deney 1, 5, 6, 7 |
| `~WAIT` | U430-13 6A, U534-6 2Y, U537-3 2A | arka panel 46 · çekme direnci · önceki: Deney 1 |
| `A1` | U403-2 1A0, U420-11 A1, U421-11 A1, U502-2 1A0 | arka panel 10 · önceki: Deney 6 |
| `A2` | U402-2 P0, U420-10 A2, U421-10 A2, U502-3 1A1 | arka panel 11 · önceki: Deney 6 |
| `A3` | U402-4 P1, U420-9 A3, U421-9 A3, U501-2 P0 | arka panel 12 · önceki: Deney 6 |
| `A4` | U402-6 P2, U420-8 A4, U421-8 A4, U501-4 P1 | arka panel 13 · önceki: Deney 6 |
| `A5` | U402-8 P3, U420-7 A5, U421-7 A5, U501-6 P2 | arka panel 14 · önceki: Deney 6 |
| `A6` | U402-11 P4, U420-6 A6, U421-6 A6, U501-8 P3 | arka panel 15 · önceki: Deney 6 |
| `A7` | U402-13 P5, U420-5 A7, U421-5 A7, U501-11 P4 | arka panel 16 · önceki: Deney 6 |
| `A8` | U401-2 P0, U420-27 A8, U421-27 A8 | arka panel 17 · önceki: Deney 6 |
| `A9` | U401-4 P1, U420-26 A9, U421-26 A9 | arka panel 18 · önceki: Deney 6 |
| `A10` | U401-6 P2, U420-23 A10, U421-23 A10 | arka panel 19 · önceki: Deney 6 |
| `A11` | U401-8 P3, U420-25 A11, U421-25 A11 | arka panel 20 · önceki: Deney 6 |
| `A12` | U401-11 P4, U420-4 A12, U421-4 A12 | arka panel 21 · önceki: Deney 6 |
| `A13` | U401-13 P5, U420-28 A13, U421-28 A13 | arka panel 22 · önceki: Deney 6 |
| `A14` | U401-15 P6, U408-14 S0, U409-14 S0, U410-14 S0 | arka panel 23 · önceki: Deney 6 |
| `A15` | U401-17 P7, U408-2 S1, U409-2 S1, U410-2 S1 | arka panel 24 · önceki: Deney 6 |
| `BANK0_0` | U404-2 Q0, U408-6 1I0, U411-2 A0 |  |
| `BANK0_1` | U404-5 Q1, U408-10 2I0, U411-3 A1 |  |
| `BANK0_2` | U404-6 Q2, U409-6 1I0, U411-4 A2 |  |
| `BANK0_3` | U404-9 Q3, U409-10 2I0, U411-5 A3 |  |
| `BANK0_4` | U404-12 Q4, U410-6 1I0, U411-6 A4 |  |
| `BANK0_5` | U404-15 Q5, U410-10 2I0, U411-7 A5 |  |
| `BANK0_CP` | U404-11 CP, U424-3 1Y |  |
| `BANK1_0` | U405-2 Q0, U408-5 1I1, U412-2 A0 |  |
| `BANK1_1` | U405-5 Q1, U408-11 2I1, U412-3 A1 |  |
| `BANK1_2` | U405-6 Q2, U409-5 1I1, U412-4 A2 |  |
| `BANK1_3` | U405-9 Q3, U409-11 2I1, U412-5 A3 |  |
| `BANK1_4` | U405-12 Q4, U410-5 1I1, U412-6 A4 |  |
| `BANK1_5` | U410-11 2I1, U412-7 A5, U429-6 3Y |  |
| `BANK1_CP` | U405-11 CP, U424-6 2Y |  |
| `BANK2_0` | U408-4 1I2, U413-2 A0, U429-10 5Y |  |
| `BANK2_1` | U406-5 Q1, U408-12 2I2, U413-3 A1 |  |
| `BANK2_2` | U406-6 Q2, U409-4 1I2, U413-4 A2 |  |
| `BANK2_3` | U406-9 Q3, U409-12 2I2, U413-5 A3 |  |
| `BANK2_4` | U406-12 Q4, U410-4 1I2, U413-6 A4 |  |
| `BANK2_5` | U410-12 2I2, U413-7 A5, U430-2 1Y |  |
| `BANK2_CP` | U406-11 CP, U424-8 3Y |  |
| `BANK3_0` | U407-2 Q0, U408-3 1I3, U414-2 A0 |  |
| `BANK3_1` | U408-13 2I3, U414-3 A1, U430-6 3Y |  |
| `BANK3_2` | U407-6 Q2, U409-3 1I3, U414-4 A2 |  |
| `BANK3_3` | U407-9 Q3, U409-13 2I3, U414-5 A3 |  |
| `BANK3_4` | U407-12 Q4, U410-3 1I3, U414-6 A4 |  |
| `BANK3_5` | U410-13 2I3, U414-7 A5, U430-10 5Y |  |
| `BANK3_CP` | U407-11 CP, U424-11 4Y |  |
| `BSEL` | U415-9 2Q, U420-12 A0, U421-12 A0, U422-2 1B, U422-13 4B |  |
| `C_CA` | U503-5 1Q, U526-1 1A, U531-10 3B |  |
| `C_CB` | U503-9 2Q, U505-2 1D, U527-10 3B |  |
| `C_CBD` | U503-12 2D, U526-3 1Y |  |
| `C_EN` | U528-2 1B, U534-1 1A | ▶ elle sür (Deney 9) |
| `C_ENHIT` | U530-2 1B, U537-10 5Y |  |
| `C_FILL` | U528-6 2Y, U531-12 4A, U535-2 1A, U535-5 2A |  |
| `C_FLASH` | U526-5 2B, U537-8 4Y |  |
| `C_HIT` | U526-4 2A, U528-12 4A, U534-2 1B | ▶ elle sür (Deney 9) |
| `C_INVD` | U505-12 2D, U526-8 3Y |  |
| `C_INVL` | U505-9 2Q, U528-10 3B |  |
| `C_INVWR` | U528-8 3Y, U531-13 4B |  |
| `C_MEMACC` | U527-5 2B, U531-6 2Y |  |
| `C_MEMNOW` | U527-3 1Y, U527-4 2A |  |
| `C_MRD` | U526-12 4A, U528-1 1A, U529-13 4B, U537-2 1Y |  |
| `C_NEED` | U527-6 2Y, U531-9 3A |  |
| `C_RAMHIT` | U528-11 4Y, U529-2 1B |  |
| `C_RDMISS` | U526-11 4Y, U531-5 2B |  |
| `C_SNP` | U529-3 1Y, U529-4 2A, U529-9 3A |  |
| `C_TAGPH` | U527-11 4Y, U528-4 2A, U528-9 3A, U529-1 1A |  |
| `C_TAGWR` | U531-11 4Y | ◀ LED'le izlenebilir |
| `C_TCB` | U527-8 3Y, U527-12 4A |  |
| `C_WAITING` | U503-2 1D, U526-2 1B, U537-4 2Y |  |
| `C_WRL` | U526-9 3A, U531-3 1Y, U531-4 2A |  |
| `C_WRL_E` | U504-5 1Q, U529-5 2B, U531-1 1A |  |
| `C_WRL_O` | U504-9 2Q, U529-10 3B, U531-2 1B |  |
| `CLK` | U416-3 1CLK, U416-11 2CLK, U504-3 1CLK, U504-11 2CLK, U537-13 6A | arka panel 5 · önceki: Deney 1, 6, 7 |
| `DE0` | RN402.2, U404-3 D0, U411-18 Y0, U413-18 Y0, U417-19 Q0, U418-2 A0, U429-9 4A | arka panel 25 · çekme direnci · önceki: Deney 6 |
| `DE1` | RN402.3, U404-4 D1, U406-4 D1, U411-17 Y1, U413-17 Y1, U417-18 Q1, U418-3 A1 | arka panel 26 · çekme direnci · önceki: Deney 6 |
| `DE2` | RN402.4, U404-7 D2, U406-7 D2, U411-16 Y2, U413-16 Y2, U417-17 Q2, U418-4 A2 | arka panel 27 · çekme direnci · önceki: Deney 6 |
| `DE3` | RN402.5, U404-8 D3, U406-8 D3, U411-15 Y3, U413-15 Y3, U417-16 Q3, U418-5 A3 | arka panel 28 · çekme direnci · önceki: Deney 6 |
| `DE4` | RN402.6, U404-13 D4, U406-13 D4, U411-14 Y4, U413-14 Y4, U417-15 Q4, U418-6 A4 | arka panel 29 · çekme direnci · önceki: Deney 6 |
| `DE5` | RN402.7, U404-14 D5, U411-13 Y5, U413-13 Y5, U417-14 Q5, U418-7 A5, U429-13 6A | arka panel 30 · çekme direnci · önceki: Deney 6 |
| `DE6` | RN402.8, U411-12 Y6, U413-12 Y6, U417-13 Q6, U418-8 A6 | arka panel 31 · çekme direnci · önceki: Deney 6 |
| `DE7` | RN402.9, U411-11 Y7, U413-11 Y7, U417-12 Q7, U418-9 A7 | arka panel 32 · çekme direnci · önceki: Deney 6 |
| `DO0` | RN403.2, U405-3 D0, U407-3 D0, U412-18 Y0, U414-18 Y0, U419-2 A0 | arka panel 33 · çekme direnci · önceki: Deney 6 |
| `DO1` | RN403.3, U405-4 D1, U412-17 Y1, U414-17 Y1, U419-3 A1, U430-3 2A | arka panel 34 · çekme direnci · önceki: Deney 6 |
| `DO2` | RN403.4, U405-7 D2, U407-7 D2, U412-16 Y2, U414-16 Y2, U419-4 A2 | arka panel 35 · çekme direnci · önceki: Deney 6 |
| `DO3` | RN403.5, U405-8 D3, U407-8 D3, U412-15 Y3, U414-15 Y3, U419-5 A3 | arka panel 36 · çekme direnci · önceki: Deney 6 |
| `DO4` | RN403.6, U405-13 D4, U407-13 D4, U412-14 Y4, U414-14 Y4, U419-6 A4 | arka panel 37 · çekme direnci · önceki: Deney 6 |
| `DO5` | RN403.7, U412-13 Y5, U414-13 Y5, U419-7 A5, U429-3 2A, U430-9 4A | arka panel 38 · çekme direnci · önceki: Deney 6 |
| `DO6` | RN403.8, U412-12 Y6, U414-12 Y6, U419-8 A6 | arka panel 39 · çekme direnci · önceki: Deney 6 |
| `DO7` | RN403.9, U412-11 Y7, U414-11 Y7, U419-9 A7 | arka panel 40 · çekme direnci · önceki: Deney 6 |
| `M_EWIN` | U422-10 3B, U428-1 1Y |  |
| `M_EWR` | U422-8 3Y, U428-5 2A |  |
| `M_LCP` | U417-11 CP, U423-6 2Y |  |
| `M_MRD` | U425-1 1A, U426-10 3B, U431-4 2Y |  |
| `M_OWIN` | U422-11 4Y, U423-1 1A |  |
| `M_OWR` | U423-3 1Y, U428-6 2B |  |
| `M_SA` | U415-5 1Q, U415-12 2D, U422-1 1A, U428-3 1B |  |
| `M_SODD` | U422-3 1Y, U426-9 3A, U427-1 1A |  |
| `M_WAITING` | U415-2 1D, U430-12 6Y |  |
| `M_WEL_E` | U416-5 1Q, U422-4 2A |  |
| `M_WEL_O` | U416-9 2Q, U423-2 1B, U425-2 1B |  |
| `M_WEM` | U422-6 2Y, U422-9 3A, U426-12 4A |  |
| `MD0` | RN401.2, U417-2 D0, U418-18 B0, U419-18 B0, U420-13 DQ0, U421-13 DQ0 | çekme direnci |
| `MD1` | RN401.3, U417-3 D1, U418-17 B1, U419-17 B1, U420-14 DQ1, U421-14 DQ1 | çekme direnci |
| `MD2` | RN401.4, U417-4 D2, U418-16 B2, U419-16 B2, U420-15 DQ2, U421-15 DQ2 | çekme direnci |
| `MD3` | RN401.5, U417-5 D3, U418-15 B3, U419-15 B3, U420-17 DQ3, U421-17 DQ3 | çekme direnci |
| `MD4` | RN401.6, U417-6 D4, U418-14 B4, U419-14 B4, U420-18 DQ4, U421-18 DQ4 | çekme direnci |
| `MD5` | RN401.7, U417-7 D5, U418-13 B5, U419-13 B5, U420-19 DQ5, U421-19 DQ5 | çekme direnci |
| `MD6` | RN401.8, U417-8 D6, U418-12 B6, U419-12 B6, U420-20 DQ6, U421-20 DQ6 | çekme direnci |
| `MD7` | RN401.9, U417-9 D7, U418-11 B7, U419-11 B7, U420-21 DQ7, U421-21 DQ7 | çekme direnci |
| (adsız) | U425-3 1Y, U427-2 1B |  |
| (adsız) | U526-6 2Y, U526-10 3B |  |
| (adsız) | U531-8 3Y, U534-4 2A |  |
| (adsız) | U528-3 1Y, U528-5 2B |  |
| (adsız) | U529-6 2Y, U535-3 1B |  |
| (adsız) | U529-8 3Y, U535-6 2B |  |
| (adsız) | U529-11 4Y, U530-1 1A |  |
| (adsız) | U530-3 1Y, U534-9 3A |  |
| `PA14` | U408-7 1Y, U420-29 A14, U421-3 A14 | arka panel 50 |
| `PA15` | U408-9 2Y, U420-3 A15, U421-31 A15 | arka panel 51 |
| `PA16` | U409-7 1Y, U420-2 A16, U421-2 A16 | arka panel 52 |
| `PA17` | U403-14 2A0, U409-9 2Y, U421-30 A17 | arka panel 53 |
| `PA18` | U403-13 2A1, U410-7 1Y, U421-1 A18 | arka panel 54 |
| `PA19` | U410-9 2Y, U426-4 2A, U429-1 1A, U528-13 4B, U537-9 4A | arka panel 55 |
| `TCLK` | U415-3 1CLK, U422-12 4A, U423-4 2A, U428-2 1A, U431-1 1A, U503-3 1CLK, U503-11 2CLK, U505-11 2CLK, U527-9 3A, U537-5 3A | arka panel 48 · önceki: Deney 1 |

**Boşta kalan çıkışlar (bağlanmaz):** U403-6 ~1Y2, U403-7 ~1Y3, U403-9 ~2Y3, U403-10 ~2Y2, U403-11 ~2Y1, U404-16 Q6, U404-19 Q7, U405-16 Q6, U405-19 Q7, U406-16 Q6, U406-19 Q7, U407-16 Q6, U407-19 Q7, U415-6 ~1Q, U416-6 ~1Q, U416-8 ~2Q, U423-8 3Y, U423-11 4Y, U425-6 2Y, U425-8 3Y, U425-11 4Y, U427-6 2Y, U427-8 3Y, U427-11 4Y, U428-10 3Y, U428-13 4Y, U431-6 3Y, U431-8 4Y, U431-10 5Y, U431-12 6Y, U502-7 ~1Y3, U502-9 ~2Y3, U502-10 ~2Y2, U502-11 ~2Y1, U502-12 ~2Y0, U504-6 ~1Q, U504-8 ~2Q, U505-5 1Q, U505-8 ~2Q

**Elle sürülecek girişler (2):** `C_EN`, `C_HIT`

**İzlenebilecek çıkışlar (7):** `~C_CWE_E`, `~C_CWE_O`, `~C_HITRD`, `~CS_CTRL`, `~CS_HITS`, `~CS_MISS`, `C_TAGWR`
<!-- otomatik: bitti -->
