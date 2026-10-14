# Deney 4: Register dosyası ve veriyolu

> **Video:** "Sekiz register, tek veriyolu: üç durumlu çıkışlar" · **Önce:** Deney 1 · **Kart:** CPU kartı, "Register dosyası" bloğu (39 entegre)
>
> **Breadboard panosu** (bilgisayarın kalıcı breadboard yolu, [docs/breadboard.md](../docs/breadboard.md)): `cpu-breadboard.pdf` (CPU kartı), 2. aşama (önce 1. aşama: taban, besleme, uyarlayıcı).

## Ne öğreneceksin

- Ortak bir veriyolunu birçok kaynağın paylaşmasını: üç durumlu (tri-state) çıkışlar ve "aynı anda tek sürücü" kuralı.
- 74HC574 ile register kurmayı: saatin yükselen kenarında veriyolunu yakalar; 74HC541 tampon onu `~OE` ile veriyoluna geri verir.
- 74HC138 kod çözücüyle 8 register'dan birini seçmeyi; komut kelimesinin alanlarından (rd, rs1, rs2) register numarası üretmeyi.
- Kapılı saati: yalnızca seçili register'ın saati çalışır (74HC02 NOR).

## Nasıl çalışır

CPU16'nın 8 adet 16 bit register'ı (r0–r7; r6 = SP, r7 = LR) var. Her register iki 74HC574'tür (düşük ve
yüksek bayt); girişleri 16 bitlik iç veriyolundadır (`BUS0..BUS15`). Çıkışları hep açıktır (`~OE` = GND)
ve kendi hatlarındadır (r3 için `R3Q0..R3Q15`): register'ın değeri iki çubuk göstergede sürekli görünür
(DS11–DS26, her register için iki) ve register başına iki 74HC541'e (U195–U199, U901–U911) gider.
Veriyolunu register'ın kendisi değil, bu tamponlar sürer.

- **Hangi register?** Üç 74HC151 (U14–U16) register indeksini (`RIDX0..2`) kontrol kelimesinin `RSEL`
  alanına (`CW3..CW5`) göre seçer: 0 = rd (`IR11..IR9`), 1 = rs1 (`IR8..IR6`), 2 = rs2 (`IR5..IR3`),
  3 = SP (6), 4 = LR (7).
- **Yazma:** U17 (74HC138) `RIDX`'i çözer, `CW16` (REG_W) 1 iken seçili register'ın `~WSEL` hattı 0 olur.
  Register saati = NOR(`~WSEL`, `~CLKR`): `~CLKR` düşünce (ana saat yükselince) yalnızca o register yüklenir.
- **Okuma:** U18 (74HC138) aynı indeksi çözer; `~SRC_REG` 0 iken seçili register'ın tamponlarının `~OE1`'i
  (`~ROEn`) açılır ve register'ın değeri veriyoluna çıkar.
- **Veriyolu çekme direnci** (RN1, RN2): hiçbir şey sürmezken veriyolu 0 okunur.

## Kurulum adımları

1. Yardımcı modüller: 16 bit anahtar girişi `BUS0..15`'e (2,2 kΩ ile), 16 LED gösterge `BUS0..15`'e.
   Kartın kendi veriyolu çubuk göstergeleri (DS1, DS2) de veriyolunu gösterir, ama anahtar girişi
   bağlıyken önlerindeki dizileri (RN3, RN4) yuvalarına takma: 2,2 kΩ'luk zayıf sürücü ile 1 kΩ'luk
   segmentler arasında hat ≈ 2,7 V'ta kalır, 74HC girişi onu 1 saymayabilir.
2. U14–U16 (74HC151), U17–U18 (74HC138), U133–U134 (74HC02; kapı numaraları aşağıda), RN1–RN2.
   Register LED'leri (D3–D18, her biri 1 kΩ ile): `~ROE` ve `~WSEL` aktif düşüktür, LED'in uzun
   bacağı (anot) direnç üzerinden VCC'de, kısa bacağı sinyalde. Veriyolu sürücüsü LED'leri (D19–D24)
   de böyledir.
3. 16 × 74HC574 (U19–U34): her register'ın iki çipi yan yana, aynı saat; `~OE` GND'de.
   16 × 74HC541 (U195–U199, U901–U911): her register'ın iki tamponu, `~OE1` = `~ROEn`, `~OE2` GND'de.
   Register içeriği çubuk göstergeleri (DS11–DS26, önlerinde RN13–RN28): 574'lerin çıkışlarına bağlı
   olduğu için veriyolunu yüklemez, anahtar girişi bağlıyken de takılı kalabilir.
4. Elle sürülecek girişler (tablonun sonunda): `CW3..CW5` ve `CW16`, `IR3..IR11` anahtarlara; `~SRC_REG`
   bir anahtara (10 kΩ ile 1'e çekili); `~CLKR` için Deney 1'in saat kartını ADIM kipinde kullan, CLK'yi
   bir 74HC04 ile ters çevirip `~CLKR`'ye ver (geçici saat sürücüsü; Deney 7'de kontrol bloğu üretir).

## Test: beklenen sonuç

1. **Yazma:** anahtarlarda `0x1234`, `RSEL` = 000, `IR11..9` = 011 (r3), `CW16` = 1, `~SRC_REG` = 1 → ADIM.
   ADIM'dan önce r3'ün yazma LED'i (D10, turuncu) yanar: `~WSEL3` = 0. ADIM'dan sonra r3'ün çubuk
   göstergeleri (DS17, DS18) hemen `0x1234`'ü gösterir; okumaya gerek yok.
2. Anahtarları başka değerlerle tekrarla: r0'a `0xAAAA`, r7'ye `0x5555`.
3. **Okuma:** anahtarları 0'a al, `CW16` = 0, `~SRC_REG` = 0, `IR11..9` = 011 → LED'ler `0x1234`.
   r3'ün okuma LED'i (D9, yeşil) ve veriyolu sürücüsü LED'i (D19, beyaz) yanar. Anahtar girişini
   çıkarıp RN3, RN4'ü takarsan çubuk göstergeler de `0x1234`'ü gösterir: DS1'de (`0x34`) 3., 5. ve
   6. segment, DS2'de (`0x12`) 2. ve 5. segment yanar (soldaki 1. segment bit 0).
   r0 ve r7'yi de oku. `RSEL` = 011 (SP) seçince `IR`'den bağımsız r6, 100 (LR) seçince r7 okunur.
4. `~SRC_REG` = 0 iken anahtarları değiştir: LED'ler değişmez, çünkü register'ın tamponu (74HC541)
   2,2 kΩ'luk anahtarları ezer.

## Simülatörde

- 3D: "CPU16 kartı 3D" → Register dosyası bloğu; `kart.program("fib")`, `kart.hiz(5)`, `kart.calistir()`,
  bir register çipine tıkla: pinlerin canlı seviyeleri ve içindeki flip-floplar. `kart.secNet("BUS0")` veriyolunu
  sürenleri gösterir.
- Komut seviyesinde: `npm run cpu16 -- run cpu16/programs/fib.s --trace` her komuttan sonra r0–r7'yi yazar.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Okumada LED'ler anahtarı gösteriyor | tamponun `~OE1` hattı (`~ROEn`), `~OE2` GND'de mi; ya da U18'in `~E1` = `~SRC_REG` |
| Register'ın çubuk göstergesi yazılanı göstermiyor | 574'ün `~OE`'si GND'de mi; dizinin (RN) 1. bacağı ile göstergenin 1. bacağı aynı yanda mı |
| Birden çok register aynı anda yükleniyor | U17'nin `E3` = `CW16`; NOR girişleri `~WSELn` ve `~CLKR` |
| Okunan değer kayık (bitler karışık) | düşük/yüksek bayt çiplerinin D sırası: D0 ↔ BUS0 … D7 ↔ BUS7 (yüksek baytta BUS8..15); Q → tamponun A, Y → BUS aynı sırada |
| Değer kendi kendine değişiyor | `~CLKR` sıçrıyor; saat kartını ADIM kipinde kullan |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (39 entegre, 122 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC02 | 2 | U133 U134 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC138 | 2 | U17 U18 | 3'ten 8'e kod çözücü (aktif düşük çıkış) | GND 8, VCC 16 |
| 74HC151 | 3 | U14 U15 U16 | 8'den 1'e seçici (multiplexer) | GND 8, VCC 16 |
| 74HC541 | 16 | U195 U196 U197 U198 U199 U901 U902 U903 U904 U905 U906 U907 U908 U909 U910 U911 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 16 | U19 U20 U21 U22 U23 U24 U25 U26 U27 U28 U29 U30 U31 U32 U33 U34 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 39 | C15 C16 C17 C18 C19 C20 C21 C22 C23 C24 C25 C26 C27 C28 C29 C30 C31 C32 C33 C34 C35 C134 C135 C196 C197 C198 C199 C901 C902 C903 C904 C905 C906 C907 C908 C909 C910 C911 C912 | 100 nF seramik kondansatör (dekuplaj) |
| C_100U | 1 | C1 | 100 µF elektrolitik kondansatör (kart girişi) |
| DISP_BAR_10 | 18 | DS1 DS2 DS11 DS12 DS13 DS14 DS15 DS16 DS17 DS18 DS19 DS20 DS21 DS22 DS23 DS24 DS25 DS26 | 10 segmentli LED çubuk gösterge (DIP-20, ör. Kingbright DC-10YWA, Broadcom HDSP-4840) |
| LED | 22 | D3 D4 D5 D6 D7 D8 D9 D10 D11 D12 D13 D14 D15 D16 D17 D18 D19 D20 D21 D22 D23 D24 | 3 mm LED |
| R_1K | 22 | R3 R4 R5 R6 R7 R8 R9 R10 R11 R12 R13 R14 R15 R16 R17 R18 R19 R20 R21 R22 R23 R24 | 1 kΩ direnç |
| RN_1K_ISO_8 | 18 | RN3 RN4 RN13 RN14 RN15 RN16 RN17 RN18 RN19 RN20 RN21 RN22 RN23 RN24 RN25 RN26 RN27 RN28 | 8 × 1 kΩ yalıtılmış direnç dizisi (DIP-16, ör. 4116R-1-102) |
| RN_10K_8 | 2 | RN1 RN2 | 8 × 10 kΩ direnç dizisi (SIP-9, ortak uç) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U133** (74HC02, bu deneyde takılır): 1. kapı (r0 saati); 2. kapı (r1 saati); 3. kapı (r2 saati); 4. kapı (r3 saati)
- **U134** (74HC02, bu deneyde takılır): 1. kapı (r4 saati); 2. kapı (r5 saati); 3. kapı (r6 saati); 4. kapı (r7 saati)

#### Bağlantılar (357 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U14-1 I3, U14-7 ~E, U14-12 I7, U14-13 I6, U14-14 I5, U15-7 ~E, U15-12 I7, U15-13 I6, U15-14 I5, U16-7 ~E, U16-12 I7, U16-13 I6, U16-14 I5, U17-4 ~E1, U17-5 ~E2, U18-5 ~E2, U19-1 ~OE, U20-1 ~OE, U21-1 ~OE, U22-1 ~OE, U23-1 ~OE, U24-1 ~OE, U25-1 ~OE, U26-1 ~OE, U27-1 ~OE, U28-1 ~OE, U29-1 ~OE, U30-1 ~OE, U31-1 ~OE, U32-1 ~OE, U33-1 ~OE, U34-1 ~OE, U195-19 ~OE2, U196-19 ~OE2, U197-19 ~OE2, U198-19 ~OE2, U199-19 ~OE2, U901-19 ~OE2, U902-19 ~OE2, U903-19 ~OE2, U904-19 ~OE2, U905-19 ~OE2, U906-19 ~OE2, U907-19 ~OE2, U908-19 ~OE2, U909-19 ~OE2, U910-19 ~OE2, U911-19 ~OE2 | sabit seviye |
| **VCC** | U14-15 I4, U15-1 I3, U15-15 I4, U16-1 I3, U16-15 I4, U18-6 E3 | sabit seviye |
| `~CLKR` | U133-3 1B, U133-6 2B, U133-9 3B, U133-12 4B, U134-3 1B, U134-6 2B, U134-9 3B, U134-12 4B | ▶ elle sür (Deney 7) |
| `~ROE0` | D3.2, U18-15 ~Y0, U195-1 ~OE1, U196-1 ~OE1 |  |
| `~ROE1` | D5.2, U18-14 ~Y1, U197-1 ~OE1, U198-1 ~OE1 |  |
| `~ROE2` | D7.2, U18-13 ~Y2, U199-1 ~OE1, U901-1 ~OE1 |  |
| `~ROE3` | D9.2, U18-12 ~Y3, U902-1 ~OE1, U903-1 ~OE1 |  |
| `~ROE4` | D11.2, U18-11 ~Y4, U904-1 ~OE1, U905-1 ~OE1 |  |
| `~ROE5` | D13.2, U18-10 ~Y5, U906-1 ~OE1, U907-1 ~OE1 |  |
| `~ROE6` | D15.2, U18-9 ~Y6, U908-1 ~OE1, U909-1 ~OE1 |  |
| `~ROE7` | D17.2, U18-7 ~Y7, U910-1 ~OE1, U911-1 ~OE1 |  |
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
| `BAR_R0Q0` | DS11.1, RN13.16 |  |
| `BAR_R0Q1` | DS11.2, RN13.15 |  |
| `BAR_R0Q2` | DS11.3, RN13.14 |  |
| `BAR_R0Q3` | DS11.4, RN13.13 |  |
| `BAR_R0Q4` | DS11.5, RN13.12 |  |
| `BAR_R0Q5` | DS11.6, RN13.11 |  |
| `BAR_R0Q6` | DS11.7, RN13.10 |  |
| `BAR_R0Q7` | DS11.8, RN13.9 |  |
| `BAR_R0Q8` | DS12.1, RN14.16 |  |
| `BAR_R0Q9` | DS12.2, RN14.15 |  |
| `BAR_R0Q10` | DS12.3, RN14.14 |  |
| `BAR_R0Q11` | DS12.4, RN14.13 |  |
| `BAR_R0Q12` | DS12.5, RN14.12 |  |
| `BAR_R0Q13` | DS12.6, RN14.11 |  |
| `BAR_R0Q14` | DS12.7, RN14.10 |  |
| `BAR_R0Q15` | DS12.8, RN14.9 |  |
| `BAR_R1Q0` | DS13.1, RN15.16 |  |
| `BAR_R1Q1` | DS13.2, RN15.15 |  |
| `BAR_R1Q2` | DS13.3, RN15.14 |  |
| `BAR_R1Q3` | DS13.4, RN15.13 |  |
| `BAR_R1Q4` | DS13.5, RN15.12 |  |
| `BAR_R1Q5` | DS13.6, RN15.11 |  |
| `BAR_R1Q6` | DS13.7, RN15.10 |  |
| `BAR_R1Q7` | DS13.8, RN15.9 |  |
| `BAR_R1Q8` | DS14.1, RN16.16 |  |
| `BAR_R1Q9` | DS14.2, RN16.15 |  |
| `BAR_R1Q10` | DS14.3, RN16.14 |  |
| `BAR_R1Q11` | DS14.4, RN16.13 |  |
| `BAR_R1Q12` | DS14.5, RN16.12 |  |
| `BAR_R1Q13` | DS14.6, RN16.11 |  |
| `BAR_R1Q14` | DS14.7, RN16.10 |  |
| `BAR_R1Q15` | DS14.8, RN16.9 |  |
| `BAR_R2Q0` | DS15.1, RN17.16 |  |
| `BAR_R2Q1` | DS15.2, RN17.15 |  |
| `BAR_R2Q2` | DS15.3, RN17.14 |  |
| `BAR_R2Q3` | DS15.4, RN17.13 |  |
| `BAR_R2Q4` | DS15.5, RN17.12 |  |
| `BAR_R2Q5` | DS15.6, RN17.11 |  |
| `BAR_R2Q6` | DS15.7, RN17.10 |  |
| `BAR_R2Q7` | DS15.8, RN17.9 |  |
| `BAR_R2Q8` | DS16.1, RN18.16 |  |
| `BAR_R2Q9` | DS16.2, RN18.15 |  |
| `BAR_R2Q10` | DS16.3, RN18.14 |  |
| `BAR_R2Q11` | DS16.4, RN18.13 |  |
| `BAR_R2Q12` | DS16.5, RN18.12 |  |
| `BAR_R2Q13` | DS16.6, RN18.11 |  |
| `BAR_R2Q14` | DS16.7, RN18.10 |  |
| `BAR_R2Q15` | DS16.8, RN18.9 |  |
| `BAR_R3Q0` | DS17.1, RN19.16 |  |
| `BAR_R3Q1` | DS17.2, RN19.15 |  |
| `BAR_R3Q2` | DS17.3, RN19.14 |  |
| `BAR_R3Q3` | DS17.4, RN19.13 |  |
| `BAR_R3Q4` | DS17.5, RN19.12 |  |
| `BAR_R3Q5` | DS17.6, RN19.11 |  |
| `BAR_R3Q6` | DS17.7, RN19.10 |  |
| `BAR_R3Q7` | DS17.8, RN19.9 |  |
| `BAR_R3Q8` | DS18.1, RN20.16 |  |
| `BAR_R3Q9` | DS18.2, RN20.15 |  |
| `BAR_R3Q10` | DS18.3, RN20.14 |  |
| `BAR_R3Q11` | DS18.4, RN20.13 |  |
| `BAR_R3Q12` | DS18.5, RN20.12 |  |
| `BAR_R3Q13` | DS18.6, RN20.11 |  |
| `BAR_R3Q14` | DS18.7, RN20.10 |  |
| `BAR_R3Q15` | DS18.8, RN20.9 |  |
| `BAR_R4Q0` | DS19.1, RN21.16 |  |
| `BAR_R4Q1` | DS19.2, RN21.15 |  |
| `BAR_R4Q2` | DS19.3, RN21.14 |  |
| `BAR_R4Q3` | DS19.4, RN21.13 |  |
| `BAR_R4Q4` | DS19.5, RN21.12 |  |
| `BAR_R4Q5` | DS19.6, RN21.11 |  |
| `BAR_R4Q6` | DS19.7, RN21.10 |  |
| `BAR_R4Q7` | DS19.8, RN21.9 |  |
| `BAR_R4Q8` | DS20.1, RN22.16 |  |
| `BAR_R4Q9` | DS20.2, RN22.15 |  |
| `BAR_R4Q10` | DS20.3, RN22.14 |  |
| `BAR_R4Q11` | DS20.4, RN22.13 |  |
| `BAR_R4Q12` | DS20.5, RN22.12 |  |
| `BAR_R4Q13` | DS20.6, RN22.11 |  |
| `BAR_R4Q14` | DS20.7, RN22.10 |  |
| `BAR_R4Q15` | DS20.8, RN22.9 |  |
| `BAR_R5Q0` | DS21.1, RN23.16 |  |
| `BAR_R5Q1` | DS21.2, RN23.15 |  |
| `BAR_R5Q2` | DS21.3, RN23.14 |  |
| `BAR_R5Q3` | DS21.4, RN23.13 |  |
| `BAR_R5Q4` | DS21.5, RN23.12 |  |
| `BAR_R5Q5` | DS21.6, RN23.11 |  |
| `BAR_R5Q6` | DS21.7, RN23.10 |  |
| `BAR_R5Q7` | DS21.8, RN23.9 |  |
| `BAR_R5Q8` | DS22.1, RN24.16 |  |
| `BAR_R5Q9` | DS22.2, RN24.15 |  |
| `BAR_R5Q10` | DS22.3, RN24.14 |  |
| `BAR_R5Q11` | DS22.4, RN24.13 |  |
| `BAR_R5Q12` | DS22.5, RN24.12 |  |
| `BAR_R5Q13` | DS22.6, RN24.11 |  |
| `BAR_R5Q14` | DS22.7, RN24.10 |  |
| `BAR_R5Q15` | DS22.8, RN24.9 |  |
| `BAR_R6Q0` | DS23.1, RN25.16 |  |
| `BAR_R6Q1` | DS23.2, RN25.15 |  |
| `BAR_R6Q2` | DS23.3, RN25.14 |  |
| `BAR_R6Q3` | DS23.4, RN25.13 |  |
| `BAR_R6Q4` | DS23.5, RN25.12 |  |
| `BAR_R6Q5` | DS23.6, RN25.11 |  |
| `BAR_R6Q6` | DS23.7, RN25.10 |  |
| `BAR_R6Q7` | DS23.8, RN25.9 |  |
| `BAR_R6Q8` | DS24.1, RN26.16 |  |
| `BAR_R6Q9` | DS24.2, RN26.15 |  |
| `BAR_R6Q10` | DS24.3, RN26.14 |  |
| `BAR_R6Q11` | DS24.4, RN26.13 |  |
| `BAR_R6Q12` | DS24.5, RN26.12 |  |
| `BAR_R6Q13` | DS24.6, RN26.11 |  |
| `BAR_R6Q14` | DS24.7, RN26.10 |  |
| `BAR_R6Q15` | DS24.8, RN26.9 |  |
| `BAR_R7Q0` | DS25.1, RN27.16 |  |
| `BAR_R7Q1` | DS25.2, RN27.15 |  |
| `BAR_R7Q2` | DS25.3, RN27.14 |  |
| `BAR_R7Q3` | DS25.4, RN27.13 |  |
| `BAR_R7Q4` | DS25.5, RN27.12 |  |
| `BAR_R7Q5` | DS25.6, RN27.11 |  |
| `BAR_R7Q6` | DS25.7, RN27.10 |  |
| `BAR_R7Q7` | DS25.8, RN27.9 |  |
| `BAR_R7Q8` | DS26.1, RN28.16 |  |
| `BAR_R7Q9` | DS26.2, RN28.15 |  |
| `BAR_R7Q10` | DS26.3, RN28.14 |  |
| `BAR_R7Q11` | DS26.4, RN28.13 |  |
| `BAR_R7Q12` | DS26.5, RN28.12 |  |
| `BAR_R7Q13` | DS26.6, RN28.11 |  |
| `BAR_R7Q14` | DS26.7, RN28.10 |  |
| `BAR_R7Q15` | DS26.8, RN28.9 |  |
| `BUS0` | RN1.2, RN3.1, U19-2 D0, U21-2 D0, U23-2 D0, U25-2 D0, U27-2 D0, U29-2 D0, U31-2 D0, U33-2 D0, U195-18 Y0, U197-18 Y0, U199-18 Y0, U902-18 Y0, U904-18 Y0, U906-18 Y0, U908-18 Y0, U910-18 Y0 | çekme direnci |
| `BUS1` | RN1.3, RN3.2, U19-3 D1, U21-3 D1, U23-3 D1, U25-3 D1, U27-3 D1, U29-3 D1, U31-3 D1, U33-3 D1, U195-17 Y1, U197-17 Y1, U199-17 Y1, U902-17 Y1, U904-17 Y1, U906-17 Y1, U908-17 Y1, U910-17 Y1 | çekme direnci |
| `BUS2` | RN1.4, RN3.3, U19-4 D2, U21-4 D2, U23-4 D2, U25-4 D2, U27-4 D2, U29-4 D2, U31-4 D2, U33-4 D2, U195-16 Y2, U197-16 Y2, U199-16 Y2, U902-16 Y2, U904-16 Y2, U906-16 Y2, U908-16 Y2, U910-16 Y2 | çekme direnci |
| `BUS3` | RN1.5, RN3.4, U19-5 D3, U21-5 D3, U23-5 D3, U25-5 D3, U27-5 D3, U29-5 D3, U31-5 D3, U33-5 D3, U195-15 Y3, U197-15 Y3, U199-15 Y3, U902-15 Y3, U904-15 Y3, U906-15 Y3, U908-15 Y3, U910-15 Y3 | çekme direnci |
| `BUS4` | RN1.6, RN3.5, U19-6 D4, U21-6 D4, U23-6 D4, U25-6 D4, U27-6 D4, U29-6 D4, U31-6 D4, U33-6 D4, U195-14 Y4, U197-14 Y4, U199-14 Y4, U902-14 Y4, U904-14 Y4, U906-14 Y4, U908-14 Y4, U910-14 Y4 | çekme direnci |
| `BUS5` | RN1.7, RN3.6, U19-7 D5, U21-7 D5, U23-7 D5, U25-7 D5, U27-7 D5, U29-7 D5, U31-7 D5, U33-7 D5, U195-13 Y5, U197-13 Y5, U199-13 Y5, U902-13 Y5, U904-13 Y5, U906-13 Y5, U908-13 Y5, U910-13 Y5 | çekme direnci |
| `BUS6` | RN1.8, RN3.7, U19-8 D6, U21-8 D6, U23-8 D6, U25-8 D6, U27-8 D6, U29-8 D6, U31-8 D6, U33-8 D6, U195-12 Y6, U197-12 Y6, U199-12 Y6, U902-12 Y6, U904-12 Y6, U906-12 Y6, U908-12 Y6, U910-12 Y6 | çekme direnci |
| `BUS7` | RN1.9, RN3.8, U19-9 D7, U21-9 D7, U23-9 D7, U25-9 D7, U27-9 D7, U29-9 D7, U31-9 D7, U33-9 D7, U195-11 Y7, U197-11 Y7, U199-11 Y7, U902-11 Y7, U904-11 Y7, U906-11 Y7, U908-11 Y7, U910-11 Y7 | çekme direnci |
| `BUS8` | RN2.2, RN4.1, U20-2 D0, U22-2 D0, U24-2 D0, U26-2 D0, U28-2 D0, U30-2 D0, U32-2 D0, U34-2 D0, U196-18 Y0, U198-18 Y0, U901-18 Y0, U903-18 Y0, U905-18 Y0, U907-18 Y0, U909-18 Y0, U911-18 Y0 | çekme direnci |
| `BUS9` | RN2.3, RN4.2, U20-3 D1, U22-3 D1, U24-3 D1, U26-3 D1, U28-3 D1, U30-3 D1, U32-3 D1, U34-3 D1, U196-17 Y1, U198-17 Y1, U901-17 Y1, U903-17 Y1, U905-17 Y1, U907-17 Y1, U909-17 Y1, U911-17 Y1 | çekme direnci |
| `BUS10` | RN2.4, RN4.3, U20-4 D2, U22-4 D2, U24-4 D2, U26-4 D2, U28-4 D2, U30-4 D2, U32-4 D2, U34-4 D2, U196-16 Y2, U198-16 Y2, U901-16 Y2, U903-16 Y2, U905-16 Y2, U907-16 Y2, U909-16 Y2, U911-16 Y2 | çekme direnci |
| `BUS11` | RN2.5, RN4.4, U20-5 D3, U22-5 D3, U24-5 D3, U26-5 D3, U28-5 D3, U30-5 D3, U32-5 D3, U34-5 D3, U196-15 Y3, U198-15 Y3, U901-15 Y3, U903-15 Y3, U905-15 Y3, U907-15 Y3, U909-15 Y3, U911-15 Y3 | çekme direnci |
| `BUS12` | RN2.6, RN4.5, U20-6 D4, U22-6 D4, U24-6 D4, U26-6 D4, U28-6 D4, U30-6 D4, U32-6 D4, U34-6 D4, U196-14 Y4, U198-14 Y4, U901-14 Y4, U903-14 Y4, U905-14 Y4, U907-14 Y4, U909-14 Y4, U911-14 Y4 | çekme direnci |
| `BUS13` | RN2.7, RN4.6, U20-7 D5, U22-7 D5, U24-7 D5, U26-7 D5, U28-7 D5, U30-7 D5, U32-7 D5, U34-7 D5, U196-13 Y5, U198-13 Y5, U901-13 Y5, U903-13 Y5, U905-13 Y5, U907-13 Y5, U909-13 Y5, U911-13 Y5 | çekme direnci |
| `BUS14` | RN2.8, RN4.7, U20-8 D6, U22-8 D6, U24-8 D6, U26-8 D6, U28-8 D6, U30-8 D6, U32-8 D6, U34-8 D6, U196-12 Y6, U198-12 Y6, U901-12 Y6, U903-12 Y6, U905-12 Y6, U907-12 Y6, U909-12 Y6, U911-12 Y6 | çekme direnci |
| `BUS15` | RN2.9, RN4.8, U20-9 D7, U22-9 D7, U24-9 D7, U26-9 D7, U28-9 D7, U30-9 D7, U32-9 D7, U34-9 D7, U196-11 Y7, U198-11 Y7, U901-11 Y7, U903-11 Y7, U905-11 Y7, U907-11 Y7, U909-11 Y7, U911-11 Y7 | çekme direnci |
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
| `R0Q0` | RN13.1, U19-19 Q0, U195-2 A0 |  |
| `R0Q1` | RN13.2, U19-18 Q1, U195-3 A1 |  |
| `R0Q2` | RN13.3, U19-17 Q2, U195-4 A2 |  |
| `R0Q3` | RN13.4, U19-16 Q3, U195-5 A3 |  |
| `R0Q4` | RN13.5, U19-15 Q4, U195-6 A4 |  |
| `R0Q5` | RN13.6, U19-14 Q5, U195-7 A5 |  |
| `R0Q6` | RN13.7, U19-13 Q6, U195-8 A6 |  |
| `R0Q7` | RN13.8, U19-12 Q7, U195-9 A7 |  |
| `R0Q8` | RN14.1, U20-19 Q0, U196-2 A0 |  |
| `R0Q9` | RN14.2, U20-18 Q1, U196-3 A1 |  |
| `R0Q10` | RN14.3, U20-17 Q2, U196-4 A2 |  |
| `R0Q11` | RN14.4, U20-16 Q3, U196-5 A3 |  |
| `R0Q12` | RN14.5, U20-15 Q4, U196-6 A4 |  |
| `R0Q13` | RN14.6, U20-14 Q5, U196-7 A5 |  |
| `R0Q14` | RN14.7, U20-13 Q6, U196-8 A6 |  |
| `R0Q15` | RN14.8, U20-12 Q7, U196-9 A7 |  |
| `R1Q0` | RN15.1, U21-19 Q0, U197-2 A0 |  |
| `R1Q1` | RN15.2, U21-18 Q1, U197-3 A1 |  |
| `R1Q2` | RN15.3, U21-17 Q2, U197-4 A2 |  |
| `R1Q3` | RN15.4, U21-16 Q3, U197-5 A3 |  |
| `R1Q4` | RN15.5, U21-15 Q4, U197-6 A4 |  |
| `R1Q5` | RN15.6, U21-14 Q5, U197-7 A5 |  |
| `R1Q6` | RN15.7, U21-13 Q6, U197-8 A6 |  |
| `R1Q7` | RN15.8, U21-12 Q7, U197-9 A7 |  |
| `R1Q8` | RN16.1, U22-19 Q0, U198-2 A0 |  |
| `R1Q9` | RN16.2, U22-18 Q1, U198-3 A1 |  |
| `R1Q10` | RN16.3, U22-17 Q2, U198-4 A2 |  |
| `R1Q11` | RN16.4, U22-16 Q3, U198-5 A3 |  |
| `R1Q12` | RN16.5, U22-15 Q4, U198-6 A4 |  |
| `R1Q13` | RN16.6, U22-14 Q5, U198-7 A5 |  |
| `R1Q14` | RN16.7, U22-13 Q6, U198-8 A6 |  |
| `R1Q15` | RN16.8, U22-12 Q7, U198-9 A7 |  |
| `R2Q0` | RN17.1, U23-19 Q0, U199-2 A0 |  |
| `R2Q1` | RN17.2, U23-18 Q1, U199-3 A1 |  |
| `R2Q2` | RN17.3, U23-17 Q2, U199-4 A2 |  |
| `R2Q3` | RN17.4, U23-16 Q3, U199-5 A3 |  |
| `R2Q4` | RN17.5, U23-15 Q4, U199-6 A4 |  |
| `R2Q5` | RN17.6, U23-14 Q5, U199-7 A5 |  |
| `R2Q6` | RN17.7, U23-13 Q6, U199-8 A6 |  |
| `R2Q7` | RN17.8, U23-12 Q7, U199-9 A7 |  |
| `R2Q8` | RN18.1, U24-19 Q0, U901-2 A0 |  |
| `R2Q9` | RN18.2, U24-18 Q1, U901-3 A1 |  |
| `R2Q10` | RN18.3, U24-17 Q2, U901-4 A2 |  |
| `R2Q11` | RN18.4, U24-16 Q3, U901-5 A3 |  |
| `R2Q12` | RN18.5, U24-15 Q4, U901-6 A4 |  |
| `R2Q13` | RN18.6, U24-14 Q5, U901-7 A5 |  |
| `R2Q14` | RN18.7, U24-13 Q6, U901-8 A6 |  |
| `R2Q15` | RN18.8, U24-12 Q7, U901-9 A7 |  |
| `R3Q0` | RN19.1, U25-19 Q0, U902-2 A0 |  |
| `R3Q1` | RN19.2, U25-18 Q1, U902-3 A1 |  |
| `R3Q2` | RN19.3, U25-17 Q2, U902-4 A2 |  |
| `R3Q3` | RN19.4, U25-16 Q3, U902-5 A3 |  |
| `R3Q4` | RN19.5, U25-15 Q4, U902-6 A4 |  |
| `R3Q5` | RN19.6, U25-14 Q5, U902-7 A5 |  |
| `R3Q6` | RN19.7, U25-13 Q6, U902-8 A6 |  |
| `R3Q7` | RN19.8, U25-12 Q7, U902-9 A7 |  |
| `R3Q8` | RN20.1, U26-19 Q0, U903-2 A0 |  |
| `R3Q9` | RN20.2, U26-18 Q1, U903-3 A1 |  |
| `R3Q10` | RN20.3, U26-17 Q2, U903-4 A2 |  |
| `R3Q11` | RN20.4, U26-16 Q3, U903-5 A3 |  |
| `R3Q12` | RN20.5, U26-15 Q4, U903-6 A4 |  |
| `R3Q13` | RN20.6, U26-14 Q5, U903-7 A5 |  |
| `R3Q14` | RN20.7, U26-13 Q6, U903-8 A6 |  |
| `R3Q15` | RN20.8, U26-12 Q7, U903-9 A7 |  |
| `R4Q0` | RN21.1, U27-19 Q0, U904-2 A0 |  |
| `R4Q1` | RN21.2, U27-18 Q1, U904-3 A1 |  |
| `R4Q2` | RN21.3, U27-17 Q2, U904-4 A2 |  |
| `R4Q3` | RN21.4, U27-16 Q3, U904-5 A3 |  |
| `R4Q4` | RN21.5, U27-15 Q4, U904-6 A4 |  |
| `R4Q5` | RN21.6, U27-14 Q5, U904-7 A5 |  |
| `R4Q6` | RN21.7, U27-13 Q6, U904-8 A6 |  |
| `R4Q7` | RN21.8, U27-12 Q7, U904-9 A7 |  |
| `R4Q8` | RN22.1, U28-19 Q0, U905-2 A0 |  |
| `R4Q9` | RN22.2, U28-18 Q1, U905-3 A1 |  |
| `R4Q10` | RN22.3, U28-17 Q2, U905-4 A2 |  |
| `R4Q11` | RN22.4, U28-16 Q3, U905-5 A3 |  |
| `R4Q12` | RN22.5, U28-15 Q4, U905-6 A4 |  |
| `R4Q13` | RN22.6, U28-14 Q5, U905-7 A5 |  |
| `R4Q14` | RN22.7, U28-13 Q6, U905-8 A6 |  |
| `R4Q15` | RN22.8, U28-12 Q7, U905-9 A7 |  |
| `R5Q0` | RN23.1, U29-19 Q0, U906-2 A0 |  |
| `R5Q1` | RN23.2, U29-18 Q1, U906-3 A1 |  |
| `R5Q2` | RN23.3, U29-17 Q2, U906-4 A2 |  |
| `R5Q3` | RN23.4, U29-16 Q3, U906-5 A3 |  |
| `R5Q4` | RN23.5, U29-15 Q4, U906-6 A4 |  |
| `R5Q5` | RN23.6, U29-14 Q5, U906-7 A5 |  |
| `R5Q6` | RN23.7, U29-13 Q6, U906-8 A6 |  |
| `R5Q7` | RN23.8, U29-12 Q7, U906-9 A7 |  |
| `R5Q8` | RN24.1, U30-19 Q0, U907-2 A0 |  |
| `R5Q9` | RN24.2, U30-18 Q1, U907-3 A1 |  |
| `R5Q10` | RN24.3, U30-17 Q2, U907-4 A2 |  |
| `R5Q11` | RN24.4, U30-16 Q3, U907-5 A3 |  |
| `R5Q12` | RN24.5, U30-15 Q4, U907-6 A4 |  |
| `R5Q13` | RN24.6, U30-14 Q5, U907-7 A5 |  |
| `R5Q14` | RN24.7, U30-13 Q6, U907-8 A6 |  |
| `R5Q15` | RN24.8, U30-12 Q7, U907-9 A7 |  |
| `R6Q0` | RN25.1, U31-19 Q0, U908-2 A0 |  |
| `R6Q1` | RN25.2, U31-18 Q1, U908-3 A1 |  |
| `R6Q2` | RN25.3, U31-17 Q2, U908-4 A2 |  |
| `R6Q3` | RN25.4, U31-16 Q3, U908-5 A3 |  |
| `R6Q4` | RN25.5, U31-15 Q4, U908-6 A4 |  |
| `R6Q5` | RN25.6, U31-14 Q5, U908-7 A5 |  |
| `R6Q6` | RN25.7, U31-13 Q6, U908-8 A6 |  |
| `R6Q7` | RN25.8, U31-12 Q7, U908-9 A7 |  |
| `R6Q8` | RN26.1, U32-19 Q0, U909-2 A0 |  |
| `R6Q9` | RN26.2, U32-18 Q1, U909-3 A1 |  |
| `R6Q10` | RN26.3, U32-17 Q2, U909-4 A2 |  |
| `R6Q11` | RN26.4, U32-16 Q3, U909-5 A3 |  |
| `R6Q12` | RN26.5, U32-15 Q4, U909-6 A4 |  |
| `R6Q13` | RN26.6, U32-14 Q5, U909-7 A5 |  |
| `R6Q14` | RN26.7, U32-13 Q6, U909-8 A6 |  |
| `R6Q15` | RN26.8, U32-12 Q7, U909-9 A7 |  |
| `R7Q0` | RN27.1, U33-19 Q0, U910-2 A0 |  |
| `R7Q1` | RN27.2, U33-18 Q1, U910-3 A1 |  |
| `R7Q2` | RN27.3, U33-17 Q2, U910-4 A2 |  |
| `R7Q3` | RN27.4, U33-16 Q3, U910-5 A3 |  |
| `R7Q4` | RN27.5, U33-15 Q4, U910-6 A4 |  |
| `R7Q5` | RN27.6, U33-14 Q5, U910-7 A5 |  |
| `R7Q6` | RN27.7, U33-13 Q6, U910-8 A6 |  |
| `R7Q7` | RN27.8, U33-12 Q7, U910-9 A7 |  |
| `R7Q8` | RN28.1, U34-19 Q0, U911-2 A0 |  |
| `R7Q9` | RN28.2, U34-18 Q1, U911-3 A1 |  |
| `R7Q10` | RN28.3, U34-17 Q2, U911-4 A2 |  |
| `R7Q11` | RN28.4, U34-16 Q3, U911-5 A3 |  |
| `R7Q12` | RN28.5, U34-15 Q4, U911-6 A4 |  |
| `R7Q13` | RN28.6, U34-14 Q5, U911-7 A5 |  |
| `R7Q14` | RN28.7, U34-13 Q6, U911-8 A6 |  |
| `R7Q15` | RN28.8, U34-12 Q7, U911-9 A7 |  |
| `RIDX0` | U14-5 Y, U17-1 A0, U18-1 A0 |  |
| `RIDX1` | U15-5 Y, U17-2 A1, U18-2 A1 |  |
| `RIDX2` | U16-5 Y, U17-3 A2, U18-3 A2 |  |

**Boşta kalan çıkışlar (bağlanmaz):** U14-6 ~Y, U15-6 ~Y, U16-6 ~Y

**Elle sürülecek girişler (14):** `~CLKR`, `CW3`, `CW4`, `CW5`, `CW16`, `IR3`, `IR4`, `IR5`, `IR6`, `IR7`, `IR8`, `IR9`, `IR10`, `IR11`
<!-- otomatik: bitti -->
