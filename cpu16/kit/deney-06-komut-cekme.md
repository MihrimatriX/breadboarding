# Deney 6: Program sayacı ve komut çekme

> **Video:** "Program sayacı yürüyor: komut çekme döngüsü" · **Önce:** Deney 4, 5 · **Kart:** CPU kartı, "Program sayacı", "MAR ve IR", "Bellek arayüzü" blokları
>
> **Breadboard panosu** (bilgisayarın kalıcı breadboard yolu, [docs/breadboard.md](../docs/breadboard.md)): `cpu-breadboard.pdf` (CPU kartı), 4. aşama.

## Ne öğreneceksin

- Program sayacının (PC) iki işi: +2 saymak (komutlar 2 bayt) ve dallanmada veriyolundan yüklenmek.
- Adres register'ı (MAR) ile komut register'ının (IR) ayrımı: bellekten okunan kelime nereye gider.
- 16 bit iç veriyolu ile iki 8 bitlik bellek şeridi (çift bayt `DE`, tek bayt `DO`) arasındaki köprü;
  bayt yüklemede yüksek baytın sıfırlanması, bayt yazmada tek şeridin yazılması.

## Nasıl çalışır

- **PC** 4 × 74HC161: PC[0] her zaman 0, sayaçlar PC[15:1]'i tutar. `CW20` (PC_INC) ∧ çalışma izni ile
  her saatte +2; `CW19` (PC_L) ile veriyolundan yüklenir. `~SRC_PC` 0 iken 2 × 74HC541 PC'yi veriyoluna verir.
- **MAR** (2 × 74HC574) `A0..A15` adres hatlarını sürekli sürer; `CW21` (MAR_L) ile yüklenir.
  **IR** (2 × 74HC574) `CW23` (IR_L) ile yüklenir; çıkışları kontrol birimine ve sabit birimine gider.
- **Bellek arayüzü:** 3 × 74HC245 veriyolunu `DE`/`DO` şeritlerine bağlar. Kelime erişiminde iki şerit
  birlikte, bayt erişiminde (`CW28` BYTE) `A0`'a göre tek şerit kullanılır; okumada 74HC541 yüksek baytı
  0 yapar. `~MRD` okuma, `~MWE_E`/`~MWE_O` şerit başına yazma darbesidir (saat kartının WR_WIN penceresinde).

Komut çekme mikrokodda iki adımdır: (1) PC → veriyolu → MAR, (2) bellek → veriyolu → IR ve PC += 2.

## Kurulum adımları

1. PC (U43–U46, 74HC161), PC → veriyolu tamponları (U47, U48).
2. MAR (U39, U40) ve IR (U41, U42). `A0..A15`'e ve `IR0..IR15`'e LED gösterge modülü bağla.
3. Bellek arayüzü (3 × 74HC245, 74HC541). Gerçek bellek kartı Deney 8'de: o zamana kadar **sahte bellek**
   olarak `DE0..7` ve `DO0..7`'ye 16 bit anahtar girişini bağla (2,2 kΩ). Bir komut kelimesinin düşük
   baytı `DE`, yüksek baytı `DO`'dur.
4. Elle sürülecek girişler: `CW19..CW23`, `CW28`, `~SRC_PC`, `~SRC_MEM` anahtarlara, `RUN_R` 10 kΩ ile 1'e.
   Geçici saat sürücüsünden `CLKR`'yi (CLK) ve `CLK`'nin kendisini ver (PC sayaçları doğrudan CLK ile
   sayar).

## Test: beklenen sonuç

Sahte bellek `0xE000` (NOP: `DE` = 0x00, `DO` = 0xE0). Saat ADIM kipinde:

| Adım | Anahtarlar | Beklenen |
|---|---|---|
| 1 | `~SRC_PC` = 0, `CW21` = 1 | ADIM sonrası adres LED'leri = PC (resetten sonra 0x0000) |
| 2 | `~SRC_PC` = 1, `~SRC_MEM` = 0, `CW23` = 1, `CW20` = 1 | IR = 0xE000, PC = 0x0002 |
| 3 | 1 ve 2'yi tekrarla | adres 0x0002, 0x0004 …: PC iki iki yürür |
| 4 | veriyolu anahtarlarında 0x1234, `CW19` = 1 | PC = 0x1234 (dallanma) |

## Simülatörde

- `npm run cpu16 -- run cpu16/programs/fib.s --trace`: her satır bir komut çekmedir (PC, kelime, komut).
- 3D: `kart.adim("cycle")` ile saat saat ilerle; `kart.secNet("A0")` adres hattını, `kart.secCip("U41")` IR'yi gösterir.
- Mikro adımlar ve sinyal tablosu: `cpu16/docs/mikromimari.md`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| PC 1 artıyor | PC[0] = GND, sayaçlar PC1..PC15'e bağlı olmalı |
| PC hiç artmıyor | `CEP`/`CET` = `PC_INC_EN` (`CW20` ∧ `RUN_R`), `~MR` = `~RESET` |
| IR'de bayt sırası yanlış | `DE` düşük bayt (çift adres), `DO` yüksek bayt |
| Okuma sırasında şerit çakışması | 74HC245'lerin yönü (`DIR`) ve `~OE`'si `MEM_ACC`'ten |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (19 entegre, 43 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC00 | 3 | U130 U131 U132 | 4 × 2 girişli NAND | GND 7, VCC 14 |
| 74HC04 | 1 | U146 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC08 | 1 | U126 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC161 | 4 | U43 U44 U45 U46 | 4 bit senkron ikili sayıcı (asenkron reset) | GND 8, VCC 16 |
| 74HC245 | 3 | U112 U113 U114 | 8 bit çift yönlü veriyolu alıcı-vericisi | GND 10, VCC 20 |
| 74HC541 | 3 | U47 U48 U115 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 4 | U39 U40 U41 U42 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 19 | C40 C41 C42 C43 C44 C45 C46 C47 C48 C49 C113 C114 C115 C116 C127 C131 C132 C133 C147 | 100 nF seramik kondansatör (dekuplaj) |
| DISP_BAR_10 | 6 | DS3 DS4 DS5 DS6 DS7 DS8 | 10 segmentli LED çubuk gösterge (DIP-20, ör. Kingbright DC-10YWA, Broadcom HDSP-4840) |
| LED | 6 | D25 D26 D29 D30 D31 D32 | 3 mm LED |
| R_1K | 6 | R25 R26 R29 R30 R31 R32 | 1 kΩ direnç |
| RN_1K_ISO_8 | 6 | RN5 RN6 RN7 RN8 RN9 RN10 | 8 × 1 kΩ yalıtılmış direnç dizisi (DIP-16, ör. 4116R-1-102) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U119** (74HC08, Deney 5'de takıldı): 2. kapı (MAR saati); 3. kapı (IR saati); 4. kapı (PC += 2). Diğerleri: 1. kapı → Deney 5
- **U125** (74HC08, Deney 5'de takıldı): 4. kapı (bellek yazma). Diğerleri: 1. kapı → Deney 5, 2. kapı → Deney 5, 3. kapı → Deney 5
- **U126** (74HC08, bu deneyde takılır): 1. kapı (tek adresli bayt); 2. kapı (yazma darbesi); 3. kapı (yazma darbesi). Diğerleri: 4. kapı → Deney 7
- **U129** (74HC32, Deney 5'de takıldı): 2. kapı (bellek erişimi); 3. kapı (yazma darbesi). Diğerleri: 1. kapı → Deney 5, 4. kapı → Deney 7
- **U130** (74HC00, bu deneyde takılır): 3. kapı (PC yükle); 4. kapı (çift bayt hattı kullanılıyor). Diğerleri: 1. kapı → Deney 7, 2. kapı → Deney 7
- **U131** (74HC00, bu deneyde takılır): 1. kapı (hat seçimi); 2. kapı (hat seçimi); 3. kapı (hat seçimi); 4. kapı (bayt okuma)
- **U132** (74HC00, bu deneyde takılır): 1. kapı (çift bayt yazma darbesi); 2. kapı (tek bayt yazma darbesi). Diğerleri: 3. kapı → Deney 7, 4. kapı → Deney 7
- **U145** (74HC04, Deney 5'de takıldı): 6. kapı (bellek okuma). Diğerleri: 1. kapı → Deney 7, 2. kapı → Deney 7, 3. kapı → Deney 7, 4. kapı → Deney 7, 5. kapı → Deney 5
- **U146** (74HC04, bu deneyde takılır): 1. kapı (kelime erişimi); 2. kapı (bellek okuma (aktif düşük)). Diğerleri: 3. kapı → Deney 7, 4. kapı → Deney 7, 5. kapı → Deney 7, 6. kapı → Deney 7

#### Bağlantılar (166 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U39-1 ~OE, U40-1 ~OE, U41-1 ~OE, U42-1 ~OE, U46-6 D3, U47-2 A0, U47-19 ~OE2, U48-19 ~OE2, U115-2 A0, U115-3 A1, U115-4 A2, U115-5 A3, U115-6 A4, U115-7 A5, U115-8 A6, U115-9 A7, U115-19 ~OE2 | sabit seviye |
| `~BYTE` | U129-9 3A, U131-4 2A, U146-2 1Y |  |
| `~MWE_E` | U132-3 1Y | arka panel 42 · ◀ LED'le izlenebilir |
| `~PC_LOAD` | D31.2, U43-9 ~PE, U44-9 ~PE, U45-9 ~PE, U46-9 ~PE, U130-8 3Y |  |
| `~RESET` | U43-1 ~MR, U44-1 ~MR, U45-1 ~MR, U46-1 ~MR | arka panel 7 · önceki: Deney 1, 5 |
| `~SRC_MEM` | U145-13 6A | önceki: Deney 4 |
| `~SRC_PC` | U47-1 ~OE1, U48-1 ~OE1 | önceki: Deney 4 |
| `A0` | RN7.1, U39-19 Q0, U126-2 1B, U129-10 3B, U130-13 4B | arka panel 9 |
| `A1` | RN7.2, U39-18 Q1 | arka panel 10 · ◀ LED'le izlenebilir |
| `A2` | RN7.3, U39-17 Q2 | arka panel 11 · ◀ LED'le izlenebilir |
| `A3` | RN7.4, U39-16 Q3 | arka panel 12 · ◀ LED'le izlenebilir |
| `A4` | RN7.5, U39-15 Q4 | arka panel 13 · ◀ LED'le izlenebilir |
| `A5` | RN7.6, U39-14 Q5 | arka panel 14 · ◀ LED'le izlenebilir |
| `A6` | RN7.7, U39-13 Q6 | arka panel 15 · ◀ LED'le izlenebilir |
| `A7` | RN7.8, U39-12 Q7 | arka panel 16 · ◀ LED'le izlenebilir |
| `A8` | RN8.1, U40-19 Q0 | arka panel 17 · ◀ LED'le izlenebilir |
| `A9` | RN8.2, U40-18 Q1 | arka panel 18 · ◀ LED'le izlenebilir |
| `A10` | RN8.3, U40-17 Q2 | arka panel 19 · ◀ LED'le izlenebilir |
| `A11` | RN8.4, U40-16 Q3 | arka panel 20 · ◀ LED'le izlenebilir |
| `A12` | RN8.5, U40-15 Q4 | arka panel 21 · ◀ LED'le izlenebilir |
| `A13` | RN8.6, U40-14 Q5 | arka panel 22 · ◀ LED'le izlenebilir |
| `A14` | RN8.7, U40-13 Q6 | arka panel 23 · ◀ LED'le izlenebilir |
| `A15` | RN8.8, U40-12 Q7 | arka panel 24 · ◀ LED'le izlenebilir |
| `BAR_A0` | DS5.1, RN7.16 |  |
| `BAR_A1` | DS5.2, RN7.15 |  |
| `BAR_A2` | DS5.3, RN7.14 |  |
| `BAR_A3` | DS5.4, RN7.13 |  |
| `BAR_A4` | DS5.5, RN7.12 |  |
| `BAR_A5` | DS5.6, RN7.11 |  |
| `BAR_A6` | DS5.7, RN7.10 |  |
| `BAR_A7` | DS5.8, RN7.9 |  |
| `BAR_A8` | DS6.1, RN8.16 |  |
| `BAR_A9` | DS6.2, RN8.15 |  |
| `BAR_A10` | DS6.3, RN8.14 |  |
| `BAR_A11` | DS6.4, RN8.13 |  |
| `BAR_A12` | DS6.5, RN8.12 |  |
| `BAR_A13` | DS6.6, RN8.11 |  |
| `BAR_A14` | DS6.7, RN8.10 |  |
| `BAR_A15` | DS6.8, RN8.9 |  |
| `BAR_IR0` | DS7.1, RN9.16 |  |
| `BAR_IR1` | DS7.2, RN9.15 |  |
| `BAR_IR2` | DS7.3, RN9.14 |  |
| `BAR_IR3` | DS7.4, RN9.13 |  |
| `BAR_IR4` | DS7.5, RN9.12 |  |
| `BAR_IR5` | DS7.6, RN9.11 |  |
| `BAR_IR6` | DS7.7, RN9.10 |  |
| `BAR_IR7` | DS7.8, RN9.9 |  |
| `BAR_IR8` | DS8.1, RN10.16 |  |
| `BAR_IR9` | DS8.2, RN10.15 |  |
| `BAR_IR10` | DS8.3, RN10.14 |  |
| `BAR_IR11` | DS8.4, RN10.13 |  |
| `BAR_IR12` | DS8.5, RN10.12 |  |
| `BAR_IR13` | DS8.6, RN10.11 |  |
| `BAR_IR14` | DS8.7, RN10.10 |  |
| `BAR_IR15` | DS8.8, RN10.9 |  |
| `BAR_PC1` | DS3.2, RN5.15 |  |
| `BAR_PC2` | DS3.3, RN5.14 |  |
| `BAR_PC3` | DS3.4, RN5.13 |  |
| `BAR_PC4` | DS3.5, RN5.12 |  |
| `BAR_PC5` | DS3.6, RN5.11 |  |
| `BAR_PC6` | DS3.7, RN5.10 |  |
| `BAR_PC7` | DS3.8, RN5.9 |  |
| `BAR_PC8` | DS4.1, RN6.16 |  |
| `BAR_PC9` | DS4.2, RN6.15 |  |
| `BAR_PC10` | DS4.3, RN6.14 |  |
| `BAR_PC11` | DS4.4, RN6.13 |  |
| `BAR_PC12` | DS4.5, RN6.12 |  |
| `BAR_PC13` | DS4.6, RN6.11 |  |
| `BAR_PC14` | DS4.7, RN6.10 |  |
| `BAR_PC15` | DS4.8, RN6.9 |  |
| `BUS0` | U39-2 D0, U41-2 D0, U47-18 Y0, U112-2 A0, U114-2 A0 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5 |
| `BUS1` | U39-3 D1, U41-3 D1, U43-3 D0, U47-17 Y1, U112-3 A1, U114-3 A1 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5 |
| `BUS2` | U39-4 D2, U41-4 D2, U43-4 D1, U47-16 Y2, U112-4 A2, U114-4 A2 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5 |
| `BUS3` | U39-5 D3, U41-5 D3, U43-5 D2, U47-15 Y3, U112-5 A3, U114-5 A3 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5 |
| `BUS4` | U39-6 D4, U41-6 D4, U43-6 D3, U47-14 Y4, U112-6 A4, U114-6 A4 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5 |
| `BUS5` | U39-7 D5, U41-7 D5, U44-3 D0, U47-13 Y5, U112-7 A5, U114-7 A5 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5 |
| `BUS6` | U39-8 D6, U41-8 D6, U44-4 D1, U47-12 Y6, U112-8 A6, U114-8 A6 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5 |
| `BUS7` | U39-9 D7, U41-9 D7, U44-5 D2, U47-11 Y7, U112-9 A7, U114-9 A7 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5 |
| `BUS8` | U40-2 D0, U42-2 D0, U44-6 D3, U48-18 Y0, U113-2 A0, U115-18 Y0 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5 |
| `BUS9` | U40-3 D1, U42-3 D1, U45-3 D0, U48-17 Y1, U113-3 A1, U115-17 Y1 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5 |
| `BUS10` | U40-4 D2, U42-4 D2, U45-4 D1, U48-16 Y2, U113-4 A2, U115-16 Y2 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5 |
| `BUS11` | U40-5 D3, U42-5 D3, U45-5 D2, U48-15 Y3, U113-5 A3, U115-15 Y3 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5 |
| `BUS12` | U40-6 D4, U42-6 D4, U45-6 D3, U48-14 Y4, U113-6 A4, U115-14 Y4 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5 |
| `BUS13` | U40-7 D5, U42-7 D5, U46-3 D0, U48-13 Y5, U113-7 A5, U115-13 Y5 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5 |
| `BUS14` | U40-8 D6, U42-8 D6, U46-4 D1, U48-12 Y6, U113-8 A6, U115-12 Y6 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5 |
| `BUS15` | U40-9 D7, U42-9 D7, U46-5 D2, U48-11 Y7, U113-9 A7, U115-11 Y7 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5 |
| `CLK` | U43-2 CP, U44-2 CP, U45-2 CP, U46-2 CP | arka panel 5 · önceki: Deney 1 |
| `CLK_IR` | U41-11 CP, U42-11 CP, U119-8 3Y |  |
| `CLK_MAR` | U39-11 CP, U40-11 CP, U119-6 2Y |  |
| `CLKR` | U119-4 2A, U119-9 3A | ▶ elle sür (Deney 7) · önceki: Deney 5 |
| `CW19` | U130-9 3A | ▶ elle sür (Deney 7) |
| `CW20` | U119-12 4A | ▶ elle sür (Deney 7) |
| `CW21` | R29.1, U119-5 2B |  |
| `CW22` | U125-12 4A | ▶ elle sür (Deney 7) |
| `CW23` | R30.1, U119-10 3B |  |
| `CW28` | U126-1 1A, U130-12 4A, U131-12 4A, U146-1 1A | ▶ elle sür (Deney 7) |
| `DE0` | U112-18 B0 | arka panel 25 · ◀ LED'le izlenebilir |
| `DE1` | U112-17 B1 | arka panel 26 · ◀ LED'le izlenebilir |
| `DE2` | U112-16 B2 | arka panel 27 · ◀ LED'le izlenebilir |
| `DE3` | U112-15 B3 | arka panel 28 · ◀ LED'le izlenebilir |
| `DE4` | U112-14 B4 | arka panel 29 · ◀ LED'le izlenebilir |
| `DE5` | U112-13 B5 | arka panel 30 · ◀ LED'le izlenebilir |
| `DE6` | U112-12 B6 | arka panel 31 · ◀ LED'le izlenebilir |
| `DE7` | U112-11 B7 | arka panel 32 · ◀ LED'le izlenebilir |
| `DO0` | U113-18 B0, U114-18 B0 | arka panel 33 |
| `DO1` | U113-17 B1, U114-17 B1 | arka panel 34 |
| `DO2` | U113-16 B2, U114-16 B2 | arka panel 35 |
| `DO3` | U113-15 B3, U114-15 B3 | arka panel 36 |
| `DO4` | U113-14 B4, U114-14 B4 | arka panel 37 |
| `DO5` | U113-13 B5, U114-13 B5 | arka panel 38 |
| `DO6` | U113-12 B6, U114-12 B6 | arka panel 39 |
| `DO7` | U113-11 B7, U114-11 B7 | arka panel 40 |
| `IR0` | RN9.1, U41-19 Q0 | önceki: Deney 5 |
| `IR1` | RN9.2, U41-18 Q1 | önceki: Deney 5 |
| `IR2` | RN9.3, U41-17 Q2 | önceki: Deney 5 |
| `IR3` | RN9.4, U41-16 Q3 | önceki: Deney 4 |
| `IR4` | RN9.5, U41-15 Q4 | önceki: Deney 4 |
| `IR5` | RN9.6, U41-14 Q5 | önceki: Deney 4 |
| `IR6` | RN9.7, U41-13 Q6 | önceki: Deney 4 |
| `IR7` | RN9.8, U41-12 Q7 | önceki: Deney 4 |
| `IR8` | RN10.1, U42-19 Q0 | önceki: Deney 4, 5 |
| `IR9` | RN10.2, U42-18 Q1 | önceki: Deney 4, 5 |
| `IR10` | RN10.3, U42-17 Q2 | önceki: Deney 4, 5 |
| `IR11` | RN10.4, U42-16 Q3 | önceki: Deney 4, 5 |
| `IR12` | RN10.5, U42-15 Q4 | önceki: Deney 5 |
| `IR13` | RN10.6, U42-14 Q5 | ◀ LED'le izlenebilir |
| `IR14` | RN10.7, U42-13 Q6 | ◀ LED'le izlenebilir |
| `IR15` | RN10.8, U42-12 Q7 | ◀ LED'le izlenebilir |
| `LANE_E` | U126-5 2B, U130-11 4Y, U131-1 1A |  |
| `LANE_OB` | U126-3 1Y, U131-9 3A |  |
| `LED_IR_L` | D30.1, R30.2 |  |
| `LED_MAR_L` | D29.1, R29.2 |  |
| `LED_MEMRD` | D25.1, R25.2 |  |
| `LED_MEMW` | D26.1, R26.2 |  |
| `LED_PC_INC` | D32.1, R32.2 |  |
| `LED_PC_L` | D31.1, R31.2 |  |
| `MEM_ACC` | U129-6 2Y, U131-2 1B, U131-5 2B, U131-10 3B |  |
| `MEMRD` | R25.1, U129-4 2A, U131-13 4B, U145-12 6Y, U146-3 2A |  |
| `MEMW` | R26.1, U112-1 DIR, U113-1 DIR, U114-1 DIR, U125-11 4Y, U126-4 2A, U126-9 3A, U129-5 2B |  |
| (adsız) | U112-19 ~OE, U131-3 1Y |  |
| (adsız) | U113-19 ~OE, U131-6 2Y |  |
| (adsız) | U114-19 ~OE, U131-8 3Y |  |
| (adsız) | U115-1 ~OE1, U131-11 4Y |  |
| (adsız) | U126-10 3B, U129-8 3Y |  |
| `PC_INC_EN` | R32.1, U43-7 CEP, U43-10 CET, U44-7 CEP, U45-7 CEP, U46-7 CEP, U119-11 4Y |  |
| `PC_TC0` | U43-15 TC, U44-10 CET |  |
| `PC_TC1` | U44-15 TC, U45-10 CET |  |
| `PC_TC2` | U45-15 TC, U46-10 CET |  |
| `PC1` | RN5.2, U43-14 Q0, U47-3 A1 |  |
| `PC2` | RN5.3, U43-13 Q1, U47-4 A2 |  |
| `PC3` | RN5.4, U43-12 Q2, U47-5 A3 |  |
| `PC4` | RN5.5, U43-11 Q3, U47-6 A4 |  |
| `PC5` | RN5.6, U44-14 Q0, U47-7 A5 |  |
| `PC6` | RN5.7, U44-13 Q1, U47-8 A6 |  |
| `PC7` | RN5.8, U44-12 Q2, U47-9 A7 |  |
| `PC8` | RN6.1, U44-11 Q3, U48-2 A0 |  |
| `PC9` | RN6.2, U45-14 Q0, U48-3 A1 |  |
| `PC10` | RN6.3, U45-13 Q1, U48-4 A2 |  |
| `PC11` | RN6.4, U45-12 Q2, U48-5 A3 |  |
| `PC12` | RN6.5, U45-11 Q3, U48-6 A4 |  |
| `PC13` | RN6.6, U46-14 Q0, U48-7 A5 |  |
| `PC14` | RN6.7, U46-13 Q1, U48-8 A6 |  |
| `PC15` | RN6.8, U46-12 Q2, U48-9 A7 |  |
| `RUN_R` | U119-13 4B, U125-13 4B, U130-10 3B | ▶ elle sür (Deney 7) |
| `WE_E_EN` | U126-6 2Y, U132-1 1A |  |
| `WE_O_EN` | U126-8 3Y, U132-4 2A |  |
| `WR_WIN` | U132-2 1B, U132-5 2B | arka panel 6 · önceki: Deney 1 |

**Boşta kalan çıkışlar (bağlanmaz):** U46-11 Q3, U46-15 TC, U132-6 2Y, U146-4 2Y

**Elle sürülecek girişler (6):** `CLKR`, `CW19`, `CW20`, `CW22`, `CW28`, `RUN_R`

**İzlenebilecek çıkışlar (27):** `~MWE_E`, `A1`, `A2`, `A3`, `A4`, `A5`, `A6`, `A7`, `A8`, `A9`, `A10`, `A11`, `A12`, `A13`, `A14`, `A15`, `DE0`, `DE1`, `DE2`, `DE3`, `DE4`, `DE5`, `DE6`, `DE7`, `IR13`, `IR14`, `IR15`
<!-- otomatik: bitti -->
