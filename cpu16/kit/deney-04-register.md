# Deney 4: Register dosyası ve veriyolu

> **Video:** "Sekiz register, tek veriyolu: üç durumlu çıkışlar" · **Önce:** Deney 1 · **Kart:** CPU kartı, "Register dosyası" bloğu (23 entegre)
>
> **Breadboard panosu** (bilgisayarın kalıcı breadboard yolu, [docs/breadboard.md](../docs/breadboard.md)): `cpu-breadboard.pdf` (CPU kartı), 2. aşama (önce 1. aşama: taban, besleme, uyarlayıcı).

## Ne öğreneceksin

- Ortak bir veriyolunu birçok kaynağın paylaşması: üç durumlu (tri-state) çıkışlar ve "aynı anda tek sürücü" kuralı.
- 74HC574 ile register: saatin yükselen kenarında veriyolunu yakalar, `~OE` ile veriyoluna geri verir.
- 74HC138 kod çözücüyle 8 register'dan birini seçmek; komut kelimesinin alanlarından (rd, rs1, rs2) register numarası üretmek.
- Kapılı saat: yalnızca seçili register'ın saati çalışır (74HC02 NOR).

## Nasıl çalışır

CPU16'nın 8 adet 16 bit register'ı (r0–r7; r6 = SP, r7 = LR) var. Her register iki 74HC574'tür (düşük ve
yüksek bayt); girişleri de çıkışları da 16 bitlik iç veriyoluna (`BUS0..BUS15`) bağlıdır.

- **Hangi register?** Üç 74HC151 (U14–U16) register indeksini (`RIDX0..2`) kontrol kelimesinin `RSEL`
  alanına (`CW3..CW5`) göre seçer: 0 = rd (`IR11..IR9`), 1 = rs1 (`IR8..IR6`), 2 = rs2 (`IR5..IR3`),
  3 = SP (6), 4 = LR (7).
- **Yazma:** U17 (74HC138) `RIDX`'i çözer, `CW16` (REG_W) 1 iken seçili register'ın `~WSEL` hattı 0 olur.
  Register saati = NOR(`~WSEL`, `~CLKR`): `~CLKR` düşünce (ana saat yükselince) yalnızca o register yüklenir.
- **Okuma:** U18 (74HC138) aynı indeksi çözer; `~SRC_REG` 0 iken seçili register'ın `~OE`'si açılır ve
  değerini veriyoluna verir.
- **Veriyolu çekme direnci** (RN1, RN2): hiçbir şey sürmezken veriyolu 0 okunur.

## Kurulum adımları

1. Yardımcı modüller: 16 bit anahtar girişi `BUS0..15`'e (2,2 kΩ ile), 16 LED gösterge `BUS0..15`'e.
   Kartın kendi veriyolu çubuk göstergeleri (DS1, DS2) de veriyolunu gösterir, ama anahtar girişi
   bağlıyken önlerindeki dizileri (RN3, RN4) yuvasına takma: 2,2 kΩ'luk zayıf sürücü ile 1 kΩ'luk
   segmentler arasında hat ≈ 2,7 V'ta kalır, 74HC girişi onu 1 saymayabilir.
2. U14–U16 (74HC151), U17–U18 (74HC138), U133–U134 (74HC02; kapı numaraları aşağıda), RN1–RN2.
   Register LED'leri (D3–D18, her biri 1 kΩ ile): `~ROE` ve `~WSEL` aktif düşüktür, LED'in uzun
   bacağı (anot) direnç üzerinden VCC'de, kısa bacağı sinyalde. Veriyolu sürücüsü LED'leri (D19–D24)
   de böyledir.
3. 16 × 74HC574 (U19–U34): her register'ın iki çipi yan yana, aynı saat ve `~OE`.
4. Elle sürülecek girişler (tablonun sonunda): `CW3..CW5` ve `CW16`, `IR3..IR11` anahtarlara; `~SRC_REG`
   bir anahtara (10 kΩ ile 1'e çekili); `~CLKR` için Deney 1'in saat kartı ADIM kipinde, CLK'yi bir
   74HC04 ile ters çevirip `~CLKR`'ye ver (geçici saat sürücüsü; Deney 7'de kontrol bloğu üretir).

## Test: beklenen sonuç

1. **Yazma:** anahtarlarda `0x1234`, `RSEL` = 000, `IR11..9` = 011 (r3), `CW16` = 1, `~SRC_REG` = 1 → ADIM.
   ADIM'dan önce r3'ün yazma LED'i (D10, turuncu) yanar: `~WSEL3` = 0.
2. Anahtarları başka değerlerle tekrarla: r0'a `0xAAAA`, r7'ye `0x5555`.
3. **Okuma:** anahtarları 0'a al, `CW16` = 0, `~SRC_REG` = 0, `IR11..9` = 011 → LED'ler `0x1234`.
   r3'ün okuma LED'i (D9, yeşil) ve veriyolu sürücüsü LED'i (D19, beyaz) yanar. Anahtar girişini
   çıkarıp RN3, RN4'ü takarsan çubuk göstergeler de `0x1234`'ü gösterir: DS1'de (`0x34`) 3., 5. ve
   6. segment, DS2'de (`0x12`) 2. ve 5. segment yanar (soldaki 1. segment bit 0).
   r0 ve r7'yi de oku. `RSEL` = 011 (SP) seçince `IR`'den bağımsız r6, 100 (LR) seçince r7 okunur.
4. `~SRC_REG` = 0 iken anahtarları değiştir: LED'ler değişmez, çünkü register 2,2 kΩ'luk anahtarları ezer.

## Simülatörde

- 3D: "CPU16 kartı 3D" → Register dosyası bloğu; `kart.program("fib")`, `kart.hiz(5)`, `kart.calistir()`,
  bir register çipine tıkla: pinlerin canlı seviyeleri ve içindeki flip-floplar. `kart.secNet("BUS0")` veriyolunu
  sürenleri gösterir.
- Komut seviyesinde: `npm run cpu16 -- run cpu16/programs/fib.s --trace` her komuttan sonra r0–r7'yi yazar.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Okumada LED'ler anahtarı gösteriyor | `~OE` hattı (`~ROEn`) ya da U18'in `~E1` = `~SRC_REG` |
| Birden çok register aynı anda yükleniyor | U17'nin `E3` = `CW16`; NOR girişleri `~WSELn` ve `~CLKR` |
| Okunan değer kayık (bitler karışık) | düşük/yüksek bayt çiplerinin D/Q sırası: D0 ↔ BUS0 … D7 ↔ BUS7 (yüksek baytta BUS8..15) |
| Değer kendi kendine değişiyor | `~CLKR` sıçrıyor; saat kartını ADIM kipinde kullan |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (23 entegre, 74 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC02 | 2 | U133 U134 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC138 | 2 | U17 U18 | 3'ten 8'e kod çözücü (aktif düşük çıkış) | GND 8, VCC 16 |
| 74HC151 | 3 | U14 U15 U16 | 8'den 1'e seçici (multiplexer) | GND 8, VCC 16 |
| 74HC574 | 16 | U19 U20 U21 U22 U23 U24 U25 U26 U27 U28 U29 U30 U31 U32 U33 U34 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 23 | C15 C16 C17 C18 C19 C20 C21 C22 C23 C24 C25 C26 C27 C28 C29 C30 C31 C32 C33 C34 C35 C134 C135 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C1 | 100 µF elektrolitik kondansatör (kart girişi) |
| DISP_BAR_10 | 2 | DS1 DS2 | 10 segmentli LED çubuk gösterge (DIP-20, ör. Kingbright DC-10YWA, Broadcom HDSP-4840) |
| LED | 22 | D3 D4 D5 D6 D7 D8 D9 D10 D11 D12 D13 D14 D15 D16 D17 D18 D19 D20 D21 D22 D23 D24 | 3 mm LED |
| R_1K | 22 | R3 R4 R5 R6 R7 R8 R9 R10 R11 R12 R13 R14 R15 R16 R17 R18 R19 R20 R21 R22 R23 R24 | 1 kΩ direnç |
| RN_1K_ISO_8 | 2 | RN3 RN4 | 8 × 1 kΩ yalıtılmış direnç dizisi (DIP-16, ör. 4116R-1-102) |
| RN_10K_8 | 2 | RN1 RN2 | 8 × 10 kΩ direnç dizisi (SIP-9, ortak uç) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U133** (74HC02, bu deneyde takılır): 1. kapı (r0 saati); 2. kapı (r1 saati); 3. kapı (r2 saati); 4. kapı (r3 saati)
- **U134** (74HC02, bu deneyde takılır): 1. kapı (r4 saati); 2. kapı (r5 saati); 3. kapı (r6 saati); 4. kapı (r7 saati)

#### Bağlantılar (101 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U14-1 I3, U14-7 ~E, U14-12 I7, U14-13 I6, U14-14 I5, U15-7 ~E, U15-12 I7, U15-13 I6, U15-14 I5, U16-7 ~E, U16-12 I7, U16-13 I6, U16-14 I5, U17-4 ~E1, U17-5 ~E2, U18-5 ~E2 | sabit seviye |
| **VCC** | U14-15 I4, U15-1 I3, U15-15 I4, U16-1 I3, U16-15 I4, U18-6 E3 | sabit seviye |
| `~CLKR` | U133-3 1B, U133-6 2B, U133-9 3B, U133-12 4B, U134-3 1B, U134-6 2B, U134-9 3B, U134-12 4B | ▶ elle sür (Deney 7) |
| `~ROE0` | D3.2, U18-15 ~Y0, U19-1 ~OE, U20-1 ~OE |  |
| `~ROE1` | D5.2, U18-14 ~Y1, U21-1 ~OE, U22-1 ~OE |  |
| `~ROE2` | D7.2, U18-13 ~Y2, U23-1 ~OE, U24-1 ~OE |  |
| `~ROE3` | D9.2, U18-12 ~Y3, U25-1 ~OE, U26-1 ~OE |  |
| `~ROE4` | D11.2, U18-11 ~Y4, U27-1 ~OE, U28-1 ~OE |  |
| `~ROE5` | D13.2, U18-10 ~Y5, U29-1 ~OE, U30-1 ~OE |  |
| `~ROE6` | D15.2, U18-9 ~Y6, U31-1 ~OE, U32-1 ~OE |  |
| `~ROE7` | D17.2, U18-7 ~Y7, U33-1 ~OE, U34-1 ~OE |  |
| `~SRC_ALU` | D20.2 |  |
| `~SRC_FLAGS` | D24.2 |  |
| `~SRC_IMM` | D23.2 |  |
| `~SRC_MEM` | D22.2 |  |
| `~SRC_PC` | D21.2 |  |
| `~SRC_REG` | D19.2, U18-4 ~E1 |  |
| `~WSEL0` | D4.2, U17-15 ~Y0, U133-2 1A |  |
| `~WSEL1` | D6.2, U17-14 ~Y1, U133-5 2A |  |
| `~WSEL2` | D8.2, U17-13 ~Y2, U133-8 3A |  |
| `~WSEL3` | D10.2, U17-12 ~Y3, U133-11 4A |  |
| `~WSEL4` | D12.2, U17-11 ~Y4, U134-2 1A |  |
| `~WSEL5` | D14.2, U17-10 ~Y5, U134-5 2A |  |
| `~WSEL6` | D16.2, U17-9 ~Y6, U134-8 3A |  |
| `~WSEL7` | D18.2, U17-7 ~Y7, U134-11 4A |  |
| `BAR_BUS0` | DS1.1, RN3.16 |  |
| `BAR_BUS1` | DS1.2, RN3.15 |  |
| `BAR_BUS2` | DS1.3, RN3.14 |  |
| `BAR_BUS3` | DS1.4, RN3.13 |  |
| `BAR_BUS4` | DS1.5, RN3.12 |  |
| `BAR_BUS5` | DS1.6, RN3.11 |  |
| `BAR_BUS6` | DS1.7, RN3.10 |  |
| `BAR_BUS7` | DS1.8, RN3.9 |  |
| `BAR_BUS8` | DS2.1, RN4.16 |  |
| `BAR_BUS9` | DS2.2, RN4.15 |  |
| `BAR_BUS10` | DS2.3, RN4.14 |  |
| `BAR_BUS11` | DS2.4, RN4.13 |  |
| `BAR_BUS12` | DS2.5, RN4.12 |  |
| `BAR_BUS13` | DS2.6, RN4.11 |  |
| `BAR_BUS14` | DS2.7, RN4.10 |  |
| `BAR_BUS15` | DS2.8, RN4.9 |  |
| `BUS0` | RN1.2, RN3.1, U19-2 D0, U19-19 Q0, U21-2 D0, U21-19 Q0, U23-2 D0, U23-19 Q0, U25-2 D0, U25-19 Q0, U27-2 D0, U27-19 Q0, U29-2 D0, U29-19 Q0, U31-2 D0, U31-19 Q0, U33-2 D0, U33-19 Q0 | çekme direnci |
| `BUS1` | RN1.3, RN3.2, U19-3 D1, U19-18 Q1, U21-3 D1, U21-18 Q1, U23-3 D1, U23-18 Q1, U25-3 D1, U25-18 Q1, U27-3 D1, U27-18 Q1, U29-3 D1, U29-18 Q1, U31-3 D1, U31-18 Q1, U33-3 D1, U33-18 Q1 | çekme direnci |
| `BUS2` | RN1.4, RN3.3, U19-4 D2, U19-17 Q2, U21-4 D2, U21-17 Q2, U23-4 D2, U23-17 Q2, U25-4 D2, U25-17 Q2, U27-4 D2, U27-17 Q2, U29-4 D2, U29-17 Q2, U31-4 D2, U31-17 Q2, U33-4 D2, U33-17 Q2 | çekme direnci |
| `BUS3` | RN1.5, RN3.4, U19-5 D3, U19-16 Q3, U21-5 D3, U21-16 Q3, U23-5 D3, U23-16 Q3, U25-5 D3, U25-16 Q3, U27-5 D3, U27-16 Q3, U29-5 D3, U29-16 Q3, U31-5 D3, U31-16 Q3, U33-5 D3, U33-16 Q3 | çekme direnci |
| `BUS4` | RN1.6, RN3.5, U19-6 D4, U19-15 Q4, U21-6 D4, U21-15 Q4, U23-6 D4, U23-15 Q4, U25-6 D4, U25-15 Q4, U27-6 D4, U27-15 Q4, U29-6 D4, U29-15 Q4, U31-6 D4, U31-15 Q4, U33-6 D4, U33-15 Q4 | çekme direnci |
| `BUS5` | RN1.7, RN3.6, U19-7 D5, U19-14 Q5, U21-7 D5, U21-14 Q5, U23-7 D5, U23-14 Q5, U25-7 D5, U25-14 Q5, U27-7 D5, U27-14 Q5, U29-7 D5, U29-14 Q5, U31-7 D5, U31-14 Q5, U33-7 D5, U33-14 Q5 | çekme direnci |
| `BUS6` | RN1.8, RN3.7, U19-8 D6, U19-13 Q6, U21-8 D6, U21-13 Q6, U23-8 D6, U23-13 Q6, U25-8 D6, U25-13 Q6, U27-8 D6, U27-13 Q6, U29-8 D6, U29-13 Q6, U31-8 D6, U31-13 Q6, U33-8 D6, U33-13 Q6 | çekme direnci |
| `BUS7` | RN1.9, RN3.8, U19-9 D7, U19-12 Q7, U21-9 D7, U21-12 Q7, U23-9 D7, U23-12 Q7, U25-9 D7, U25-12 Q7, U27-9 D7, U27-12 Q7, U29-9 D7, U29-12 Q7, U31-9 D7, U31-12 Q7, U33-9 D7, U33-12 Q7 | çekme direnci |
| `BUS8` | RN2.2, RN4.1, U20-2 D0, U20-19 Q0, U22-2 D0, U22-19 Q0, U24-2 D0, U24-19 Q0, U26-2 D0, U26-19 Q0, U28-2 D0, U28-19 Q0, U30-2 D0, U30-19 Q0, U32-2 D0, U32-19 Q0, U34-2 D0, U34-19 Q0 | çekme direnci |
| `BUS9` | RN2.3, RN4.2, U20-3 D1, U20-18 Q1, U22-3 D1, U22-18 Q1, U24-3 D1, U24-18 Q1, U26-3 D1, U26-18 Q1, U28-3 D1, U28-18 Q1, U30-3 D1, U30-18 Q1, U32-3 D1, U32-18 Q1, U34-3 D1, U34-18 Q1 | çekme direnci |
| `BUS10` | RN2.4, RN4.3, U20-4 D2, U20-17 Q2, U22-4 D2, U22-17 Q2, U24-4 D2, U24-17 Q2, U26-4 D2, U26-17 Q2, U28-4 D2, U28-17 Q2, U30-4 D2, U30-17 Q2, U32-4 D2, U32-17 Q2, U34-4 D2, U34-17 Q2 | çekme direnci |
| `BUS11` | RN2.5, RN4.4, U20-5 D3, U20-16 Q3, U22-5 D3, U22-16 Q3, U24-5 D3, U24-16 Q3, U26-5 D3, U26-16 Q3, U28-5 D3, U28-16 Q3, U30-5 D3, U30-16 Q3, U32-5 D3, U32-16 Q3, U34-5 D3, U34-16 Q3 | çekme direnci |
| `BUS12` | RN2.6, RN4.5, U20-6 D4, U20-15 Q4, U22-6 D4, U22-15 Q4, U24-6 D4, U24-15 Q4, U26-6 D4, U26-15 Q4, U28-6 D4, U28-15 Q4, U30-6 D4, U30-15 Q4, U32-6 D4, U32-15 Q4, U34-6 D4, U34-15 Q4 | çekme direnci |
| `BUS13` | RN2.7, RN4.6, U20-7 D5, U20-14 Q5, U22-7 D5, U22-14 Q5, U24-7 D5, U24-14 Q5, U26-7 D5, U26-14 Q5, U28-7 D5, U28-14 Q5, U30-7 D5, U30-14 Q5, U32-7 D5, U32-14 Q5, U34-7 D5, U34-14 Q5 | çekme direnci |
| `BUS14` | RN2.8, RN4.7, U20-8 D6, U20-13 Q6, U22-8 D6, U22-13 Q6, U24-8 D6, U24-13 Q6, U26-8 D6, U26-13 Q6, U28-8 D6, U28-13 Q6, U30-8 D6, U30-13 Q6, U32-8 D6, U32-13 Q6, U34-8 D6, U34-13 Q6 | çekme direnci |
| `BUS15` | RN2.9, RN4.8, U20-9 D7, U20-12 Q7, U22-9 D7, U22-12 Q7, U24-9 D7, U24-12 Q7, U26-9 D7, U26-12 Q7, U28-9 D7, U28-12 Q7, U30-9 D7, U30-12 Q7, U32-9 D7, U32-12 Q7, U34-9 D7, U34-12 Q7 | çekme direnci |
| `CLK_R0` | U19-11 CP, U20-11 CP, U133-1 1Y |  |
| `CLK_R1` | U21-11 CP, U22-11 CP, U133-4 2Y |  |
| `CLK_R2` | U23-11 CP, U24-11 CP, U133-10 3Y |  |
| `CLK_R3` | U25-11 CP, U26-11 CP, U133-13 4Y |  |
| `CLK_R4` | U27-11 CP, U28-11 CP, U134-1 1Y |  |
| `CLK_R5` | U29-11 CP, U30-11 CP, U134-4 2Y |  |
| `CLK_R6` | U31-11 CP, U32-11 CP, U134-10 3Y |  |
| `CLK_R7` | U33-11 CP, U34-11 CP, U134-13 4Y |  |
| `CW3` | U14-11 S0, U15-11 S0, U16-11 S0 | ▶ elle sür (Deney 7) |
| `CW4` | U14-10 S1, U15-10 S1, U16-10 S1 | ▶ elle sür (Deney 7) |
| `CW5` | U14-9 S2, U15-9 S2, U16-9 S2 | ▶ elle sür (Deney 7) |
| `CW16` | U17-6 E3 | ▶ elle sür (Deney 7) |
| `IR3` | U14-2 I2 | ▶ elle sür (Deney 6) |
| `IR4` | U15-2 I2 | ▶ elle sür (Deney 6) |
| `IR5` | U16-2 I2 | ▶ elle sür (Deney 6) |
| `IR6` | U14-3 I1 | ▶ elle sür (Deney 6) |
| `IR7` | U15-3 I1 | ▶ elle sür (Deney 6) |
| `IR8` | U16-3 I1 | ▶ elle sür (Deney 6) |
| `IR9` | U14-4 I0 | ▶ elle sür (Deney 6) |
| `IR10` | U15-4 I0 | ▶ elle sür (Deney 6) |
| `IR11` | U16-4 I0 | ▶ elle sür (Deney 6) |
| `LED_ROE0` | D3.1, R3.2 |  |
| `LED_ROE1` | D5.1, R5.2 |  |
| `LED_ROE2` | D7.1, R7.2 |  |
| `LED_ROE3` | D9.1, R9.2 |  |
| `LED_ROE4` | D11.1, R11.2 |  |
| `LED_ROE5` | D13.1, R13.2 |  |
| `LED_ROE6` | D15.1, R15.2 |  |
| `LED_ROE7` | D17.1, R17.2 |  |
| `LED_SRC_ALU` | D20.1, R20.2 |  |
| `LED_SRC_FLAGS` | D24.1, R24.2 |  |
| `LED_SRC_IMM` | D23.1, R23.2 |  |
| `LED_SRC_MEM` | D22.1, R22.2 |  |
| `LED_SRC_PC` | D21.1, R21.2 |  |
| `LED_SRC_REG` | D19.1, R19.2 |  |
| `LED_WSEL0` | D4.1, R4.2 |  |
| `LED_WSEL1` | D6.1, R6.2 |  |
| `LED_WSEL2` | D8.1, R8.2 |  |
| `LED_WSEL3` | D10.1, R10.2 |  |
| `LED_WSEL4` | D12.1, R12.2 |  |
| `LED_WSEL5` | D14.1, R14.2 |  |
| `LED_WSEL6` | D16.1, R16.2 |  |
| `LED_WSEL7` | D18.1, R18.2 |  |
| `RIDX0` | U14-5 Y, U17-1 A0, U18-1 A0 |  |
| `RIDX1` | U15-5 Y, U17-2 A1, U18-2 A1 |  |
| `RIDX2` | U16-5 Y, U17-3 A2, U18-3 A2 |  |

**Boşta kalan çıkışlar (bağlanmaz):** U14-6 ~Y, U15-6 ~Y, U16-6 ~Y

**Elle sürülecek girişler (14):** `~CLKR`, `CW3`, `CW4`, `CW5`, `CW16`, `IR3`, `IR4`, `IR5`, `IR6`, `IR7`, `IR8`, `IR9`, `IR10`, `IR11`
<!-- otomatik: bitti -->
