# Deney 7: Mikrokod ve kontrol birimi

> **Video:** "Mikrokod: CPU'nun içindeki küçük program" · **Önce:** Deney 3 (mikrokod ROM'ları), 4–6 · **Kart:** CPU kartının kalanı: "Kontrol", "Sabit birimi" ve yapıştırıcı lojik

Bu deneyin sonunda CPU kartı tamamdır: elle sürdüğün bütün `CW` anahtarlarını çıkarırsın, artık
onları mikrokod sürer.

## Ne öğreneceksin

- Bir komutun mikro adımlara bölünmesi ve her adımın 32 bitlik bir **kontrol kelimesi** olması.
- Mikrokod ROM'unun adresi: mikro adım sayacı + komutun op ve f3 alanları + koşul + kesme biti (13 bit).
- Kontrol kelimesini düşen kenarda bir register'a (CR) almak: sinyaller yükselen kenara kadar sabit, parazitsiz.
- HALT, yasadışı komut (FAULT) ve kesmeyle (IRQ) uyanma.

## Nasıl çalışır

- **Mikro adım sayacı** (74HC161): her saatte +1, kontrol kelimesinde `END` (CW31) varsa 0'a döner.
- **Mikrokod ROM'ları** (4 × SST39SF010A, `mikrokod-0..3.hex`): adres
  `[STEP0..3, COND, IR0..2 (f3), IR12..15 (op), INT]`, çıkış 4 × 8 = 32 kontrol biti.
- **Kontrol register'ı** (4 × 74HC574) ROM çıkışını CLK'nin düşen kenarında alır: `CW0..CW31`.
- `CW0..2` bir 74HC138 ile veriyolu sürücüsünü seçer (`~SRC_REG/ALU/PC/MEM/IMM/FLAGS`): aynı anda tek sürücü
  donanımla garanti edilir.
- **Sabit birimi** (16 × 74HC151): komut kelimesinden 8 biçimden birini çıkarır (IMM6, IMM6×2, IMM8, IMM9,
  OFF8×2, OFF12×2, 2, 4), `~SRC_IMM` ile veriyoluna.
- **Çalışma izni:** HALT ya da FAULT'ta `RUN_R` düşer, kapılı saat (`CLKR`) durur. `IRQ` ∧ I bayrağı CPU'yu uyandırır;
  adım 0'da kesme varsa ROM adresinin `INT` biti 1 olur ve mikrokod kesme girişini çalıştırır.

Mikrokodun okunur kaynağı `cpu16/micro/cpu16.ucode`; `npm run cpu16 -- ucode` ROM imajlarını üretir.

## Kurulum adımları

1. Geçici saat sürücüsünü ve bütün `CW`/`~SRC` anahtarlarını çıkar.
2. Mikro adım sayacı, adım çözücü, 4 mikrokod ROM'u (etiketlerine dikkat) ve 4 kontrol register'ı.
3. Veriyolu kaynağı çözücü, INT/HALT ve FAULT/çalışma izni flip-flopları, HALTED ve FAULT LED'leri.
4. Sabit birimi ve sabit → veriyolu tamponları.
5. Kalan yapıştırıcı kapılar (aşağıdaki listede "bu deneyde takılır" olanlar ve önceki çiplerin boş kapıları).
6. `IRQ` girişini 10 kΩ ile GND'ye çek (G/Ç kartı Deney 10'da sürer). Sahte bellek (Deney 6) hâlâ takılı.

## Test: beklenen sonuç

| Sahte bellek | Beklenen |
|---|---|
| `0xE000` (NOP) | RESET'ten sonra adres LED'leri 0x0000, 0x0002, 0x0004 … her 3 saatte bir ilerler (NOP = 3 döngü) |
| `0xE001` (HALT) | ilk komutta HALTED LED'i yanar, saat çalışsa da PC durur |
| `0xF000` (yasadışı op) | FAULT LED'i yanar |
| `0xE000` + YAVAŞ | mikro adım sayacının çıkışları 0, 1, 2, 0, 1, 2 … |

Adres LED'lerindeki sayaç 0xFFFE'den 0x0000'a sarar: CPU tüm adres alanında NOP "çalıştırıyor".

## Simülatörde

- `npx vitest run cpu16/tests/board.test.ts`: kapı seviyesi CPU (bu kartın kendisi) hello, fib, add32, bubble
  ve irq programlarını her saat döngüsünde mikrokod modeliyle aynı çalıştırır.
- 3D: `kart.program("hello")`, `kart.calistir()`: UART çıkışında "Merhaba, CPU16!". `kart.secCip("U2")`
  kontrol register'ı 0, `kart.secCip("U1")` mikrokod ROM'u 0.
- Mikrokod tablosu ve döngü sayıları: `cpu16/docs/mikromimari.md`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Hiçbir şey olmuyor | `RUN_R` = 1 mi; `~RESET` bırakıldı mı; IR'ye ilk komut geldi mi (adım 1) |
| NOP 3 değil 16 döngü sürüyor | `END` (CW31) sayacın `~PE`'sine NAND ile gidiyor mu; ROM 3 doğru sokette mi |
| Rastgele FAULT | ROM'lar yanlış soketlerde (etiketler) ya da `IR12..15` adres sırası |
| HALT'tan çıkmıyor | `IRQ` GND'de olduğu için normal; RESET ile çık |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (33 entegre, 37 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC08 | 1 | U117 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC32 | 1 | U127 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 2 | U11 U12 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC138 | 2 | U10 U13 | 3'ten 8'e kod çözücü (aktif düşük çıkış) | GND 8, VCC 16 |
| 74HC151 | 16 | U49 U50 U51 U52 U53 U54 U55 U56 U57 U58 U59 U60 U61 U62 U63 U64 | 8'den 1'e seçici (multiplexer) | GND 8, VCC 16 |
| 74HC161 | 1 | U9 | 4 bit senkron ikili sayıcı (asenkron reset) | GND 8, VCC 16 |
| 74HC541 | 2 | U65 U66 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 4 | U2 U4 U6 U8 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |
| SST39SF010A | 4 | U1 U3 U5 U7 | 128 KB Flash (128K × 8, 5 V, komutla programlanır) | VSS 16, VDD 32 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 33 | C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C50 C51 C52 C53 C54 C55 C56 C57 C58 C59 C60 C61 C62 C63 C64 C65 C66 C67 C118 C128 | 100 nF seramik kondansatör (dekuplaj) |
| LED | 2 | D1 D2 | 3 mm LED |
| R_330 | 2 | R1 R2 | 330 Ω direnç (LED akımı) |

**Programlanacak Flash'lar** (Deney 3'teki programlayıcıyla, üzerine etiket yapıştır): U1 ← `cpu16/roms/mikrokod-0.hex`, U3 ← `cpu16/roms/mikrokod-1.hex`, U5 ← `cpu16/roms/mikrokod-2.hex`, U7 ← `cpu16/roms/mikrokod-3.hex`

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U117** (74HC08, bu deneyde takılır): 1. kapı (IRQ ∧ I); 2. kapı (INT seçimi); 3. kapı (INT seçimi); 4. kapı (HALT durumu)
- **U118** (74HC08, Deney 5'de takıldı): 1. kapı (HALT durumu); 2. kapı (yasadışı komut); 3. kapı (çalışma izni). Diğerleri: 4. kapı → Deney 5
- **U127** (74HC32, bu deneyde takılır): 1. kapı (INT seçimi); 2. kapı (HALT durumu); 3. kapı (yasadışı komut); 4. kapı (çalışma izni)
- **U130** (74HC00, Deney 6'de takıldı): 1. kapı (kapılı ana saat); 2. kapı (END: adımı sıfırla). Diğerleri: 3. kapı → Deney 6, 4. kapı → Deney 6
- **U145** (74HC04, Deney 5'de takıldı): 1. kapı (saat tersi); 2. kapı (kapılı ana saat); 3. kapı (adım 0); 4. kapı (uyanma). Diğerleri: 5. kapı → Deney 5, 6. kapı → Deney 6

#### Bağlantılar (152 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U1-2 A16, U1-3 A15, U1-22 ~CE, U1-24 ~OE, U1-28 A13, U1-29 A14, U2-1 ~OE, U3-2 A16, U3-3 A15, U3-22 ~CE, U3-24 ~OE, U3-28 A13, U3-29 A14, U4-1 ~OE, U5-2 A16, U5-3 A15, U5-22 ~CE, U5-24 ~OE, U5-28 A13, U5-29 A14, U6-1 ~OE, U7-2 A16, U7-3 A15, U7-22 ~CE, U7-24 ~OE, U7-28 A13, U7-29 A14, U8-1 ~OE, U9-3 D0, U9-4 D1, U9-5 D2, U9-6 D3, U10-5 ~E2, U13-4 ~E1, U13-5 ~E2, U49-3 I1, U49-7 ~E, U49-12 I7, U49-13 I6, U49-14 I5, U49-15 I4, U50-7 ~E, U50-12 I7, U51-7 ~E, U51-13 I6, U52-7 ~E, U52-12 I7, U52-13 I6, U53-7 ~E, U53-12 I7, U53-13 I6, U54-7 ~E, U54-12 I7, U54-13 I6, U55-7 ~E, U55-12 I7, U55-13 I6, U56-7 ~E, U56-12 I7, U56-13 I6, U57-7 ~E, U57-12 I7, U57-13 I6, U58-7 ~E, U58-12 I7, U58-13 I6, U59-7 ~E, U59-12 I7, U59-13 I6, U60-7 ~E, U60-12 I7, U60-13 I6, U61-7 ~E, U61-12 I7, U61-13 I6, U62-7 ~E, U62-12 I7, U62-13 I6, U63-7 ~E, U63-12 I7, U63-13 I6, U64-7 ~E, U64-12 I7, U64-13 I6, U65-19 ~OE2, U66-19 ~OE2 | sabit seviye |
| **VCC** | U1-31 ~WE, U3-31 ~WE, U5-31 ~WE, U7-31 ~WE, U9-10 CET, U10-6 E3, U11-4 ~1PRE, U11-10 ~2PRE, U12-4 ~1PRE, U12-13 ~2CLR, U13-6 E3, U50-13 I6, U51-12 I7 | sabit seviye |
| `~CLK` | U2-11 CP, U4-11 CP, U6-11 CP, U8-11 CP, U12-11 2CLK, U145-2 1Y |  |
| `~CLKR` | U130-3 1Y, U145-3 2A | önceki: Deney 4 |
| `~FAULT` | U12-6 ~1Q, U118-9 3A |  |
| `~HALTED` | U11-8 ~2Q, U127-12 4A |  |
| `~IS_STEP0` | U10-15 ~Y0, U117-9 3A, U145-5 3A |  |
| `~RESET` | U9-1 ~MR, U11-1 ~1CLR, U11-13 ~2CLR, U12-1 ~1CLR, U12-10 ~2PRE | arka panel 7 · önceki: Deney 1, 5, 6 |
| `~SRC_ALU` | U13-13 ~Y2 | önceki: Deney 5 |
| `~SRC_FLAGS` | U13-9 ~Y6 | önceki: Deney 5 |
| `~SRC_IMM` | U13-10 ~Y5, U65-1 ~OE1, U66-1 ~OE1 |  |
| `~SRC_MEM` | U13-11 ~Y4 | önceki: Deney 6 |
| `~SRC_PC` | U13-12 ~Y3 | önceki: Deney 6 |
| `~SRC_REG` | U13-14 ~Y1 | önceki: Deney 4 |
| `~STEP_CLR` | U9-9 ~PE, U130-6 2Y |  |
| `~WAKE` | U117-13 4B, U145-8 4Y |  |
| `BUS0` | U65-18 Y0 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS1` | U65-17 Y1 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS2` | U65-16 Y2 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS3` | U65-15 Y3 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS4` | U65-14 Y4 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS5` | U65-13 Y5 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS6` | U65-12 Y6 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS7` | U65-11 Y7 | çekme direnci RN1 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS8` | U66-18 Y0 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS9` | U66-17 Y1 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS10` | U66-16 Y2 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS11` | U66-15 Y3 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS12` | U66-14 Y4 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS13` | U66-13 Y5 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS14` | U66-12 Y6 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5, 6 |
| `BUS15` | U66-11 Y7 | çekme direnci RN2 (Deney 4) · önceki: Deney 4, 5, 6 |
| `CLK` | U9-2 CP, U11-3 1CLK, U11-11 2CLK, U12-3 1CLK, U130-1 1A, U145-1 1A | arka panel 5 · önceki: Deney 1, 6 |
| `CLKR` | U145-4 2Y | önceki: Deney 5, 6 |
| `COND` | U1-8 A4, U3-8 A4, U5-8 A4, U7-8 A4 | önceki: Deney 5 |
| `CW0` | U2-19 Q0, U13-1 A0 |  |
| `CW1` | U2-18 Q1, U13-2 A1 |  |
| `CW2` | U2-17 Q2, U13-3 A2 |  |
| `CW3` | U2-16 Q3 | önceki: Deney 4 |
| `CW4` | U2-15 Q4 | önceki: Deney 4 |
| `CW5` | U2-14 Q5 | önceki: Deney 4 |
| `CW6` | U2-13 Q6 | önceki: Deney 5 |
| `CW7` | U2-12 Q7 | önceki: Deney 5 |
| `CW8` | U4-19 Q0 | önceki: Deney 5 |
| `CW9` | U4-18 Q1 | önceki: Deney 5 |
| `CW10` | U4-17 Q2 | önceki: Deney 5 |
| `CW11` | U4-16 Q3 | önceki: Deney 5 |
| `CW12` | U4-15 Q4, U49-11 S0, U50-11 S0, U51-11 S0, U52-11 S0, U53-11 S0, U54-11 S0, U55-11 S0, U56-11 S0, U57-11 S0, U58-11 S0, U59-11 S0, U60-11 S0, U61-11 S0, U62-11 S0, U63-11 S0, U64-11 S0 |  |
| `CW13` | U4-14 Q5, U49-10 S1, U50-10 S1, U51-10 S1, U52-10 S1, U53-10 S1, U54-10 S1, U55-10 S1, U56-10 S1, U57-10 S1, U58-10 S1, U59-10 S1, U60-10 S1, U61-10 S1, U62-10 S1, U63-10 S1, U64-10 S1 |  |
| `CW14` | U4-13 Q6, U49-9 S2, U50-9 S2, U51-9 S2, U52-9 S2, U53-9 S2, U54-9 S2, U55-9 S2, U56-9 S2, U57-9 S2, U58-9 S2, U59-9 S2, U60-9 S2, U61-9 S2, U62-9 S2, U63-9 S2, U64-9 S2 |  |
| `CW16` | U6-19 Q0 | önceki: Deney 4 |
| `CW17` | U6-18 Q1 | önceki: Deney 5 |
| `CW18` | U6-17 Q2 | önceki: Deney 5 |
| `CW19` | U6-16 Q3 | önceki: Deney 6 |
| `CW20` | U6-15 Q4 | önceki: Deney 6 |
| `CW21` | U6-14 Q5 | önceki: Deney 6 |
| `CW22` | U6-13 Q6 | önceki: Deney 6 |
| `CW23` | U6-12 Q7 | önceki: Deney 6 |
| `CW24` | U8-19 Q0 | önceki: Deney 5 |
| `CW25` | U8-18 Q1 | önceki: Deney 5 |
| `CW26` | U8-17 Q2 | önceki: Deney 5 |
| `CW27` | U8-16 Q3 | önceki: Deney 5 |
| `CW28` | U8-15 Q4 | önceki: Deney 6 |
| `CW29` | U8-14 Q5, U118-1 1A |  |
| `CW30` | U8-13 Q6, U118-4 2A |  |
| `CW31` | U8-12 Q7, U130-4 2A |  |
| `D_FAULT` | U12-2 1D, U127-8 3Y |  |
| `D_HALTED` | U11-12 2D, U127-6 2Y |  |
| `FAULT` | R2.1, U12-5 1Q, U127-9 3A | arka panel 45 |
| `HALTED` | R1.1, U11-9 2Q, U117-12 4A | arka panel 44 |
| `IFLAG` | U117-2 1B | önceki: Deney 5 |
| `IMM0` | U49-5 Y, U65-2 A0 |  |
| `IMM1` | U50-5 Y, U65-3 A1 |  |
| `IMM2` | U51-5 Y, U65-4 A2 |  |
| `IMM3` | U52-5 Y, U65-5 A3 |  |
| `IMM4` | U53-5 Y, U65-6 A4 |  |
| `IMM5` | U54-5 Y, U65-7 A5 |  |
| `IMM6` | U55-5 Y, U65-8 A6 |  |
| `IMM7` | U56-5 Y, U65-9 A7 |  |
| `IMM8` | U57-5 Y, U66-2 A0 |  |
| `IMM9` | U58-5 Y, U66-3 A1 |  |
| `IMM10` | U59-5 Y, U66-4 A2 |  |
| `IMM11` | U60-5 Y, U66-5 A3 |  |
| `IMM12` | U61-5 Y, U66-6 A4 |  |
| `IMM13` | U62-5 Y, U66-7 A5 |  |
| `IMM14` | U63-5 Y, U66-8 A6 |  |
| `IMM15` | U64-5 Y, U66-9 A7 |  |
| `INT` | U1-4 A12, U3-4 A12, U5-4 A12, U7-4 A12, U11-2 1D, U127-3 1Y |  |
| `INT_HOLD` | U11-5 1Q, U117-10 3B |  |
| `IR0` | U1-7 A5, U3-7 A5, U5-7 A5, U7-7 A5, U49-1 I3, U49-2 I2, U49-4 I0, U50-3 I1, U50-14 I5, U50-15 I4, U57-2 I2 | önceki: Deney 5, 6 |
| `IR1` | U1-6 A6, U3-6 A6, U5-6 A6, U7-6 A6, U50-1 I3, U50-2 I2, U50-4 I0, U51-3 I1, U51-14 I5, U51-15 I4, U58-2 I2 | önceki: Deney 5, 6 |
| `IR2` | U1-5 A7, U3-5 A7, U5-5 A7, U7-5 A7, U51-1 I3, U51-2 I2, U51-4 I0, U52-3 I1, U52-14 I5, U52-15 I4, U59-2 I2 | önceki: Deney 5, 6 |
| `IR3` | U52-1 I3, U52-2 I2, U52-4 I0, U53-3 I1, U53-14 I5, U53-15 I4, U60-2 I2 | önceki: Deney 4, 6 |
| `IR4` | U53-1 I3, U53-2 I2, U53-4 I0, U54-3 I1, U54-14 I5, U54-15 I4, U61-2 I2 | önceki: Deney 4, 6 |
| `IR5` | U54-1 I3, U54-2 I2, U54-4 I0, U55-3 I1, U55-4 I0, U55-14 I5, U55-15 I4, U56-3 I1, U56-4 I0, U57-3 I1, U57-4 I0, U58-3 I1, U58-4 I0, U59-3 I1, U59-4 I0, U60-3 I1, U60-4 I0, U61-3 I1, U61-4 I0, U62-2 I2, U62-3 I1, U62-4 I0, U63-3 I1, U63-4 I0, U64-3 I1, U64-4 I0 | önceki: Deney 4, 6 |
| `IR6` | U55-1 I3, U55-2 I2, U56-14 I5, U56-15 I4, U63-2 I2 | önceki: Deney 4, 6 |
| `IR7` | U56-1 I3, U56-2 I2, U57-14 I5, U57-15 I4, U58-15 I4, U59-15 I4, U60-15 I4, U61-15 I4, U62-15 I4, U63-15 I4, U64-2 I2, U64-15 I4 | önceki: Deney 4, 6 |
| `IR8` | U57-1 I3, U58-1 I3, U58-14 I5, U59-1 I3, U60-1 I3, U61-1 I3, U62-1 I3, U63-1 I3, U64-1 I3 | önceki: Deney 4, 5, 6 |
| `IR9` | U59-14 I5 | önceki: Deney 4, 5, 6 |
| `IR10` | U60-14 I5 | önceki: Deney 4, 5, 6 |
| `IR11` | U61-14 I5, U62-14 I5, U63-14 I5, U64-14 I5 | önceki: Deney 4, 5, 6 |
| `IR12` | U1-27 A8, U3-27 A8, U5-27 A8, U7-27 A8 | önceki: Deney 5, 6 |
| `IR13` | U1-26 A9, U3-26 A9, U5-26 A9, U7-26 A9 | önceki: Deney 6 |
| `IR14` | U1-23 A10, U3-23 A10, U5-23 A10, U7-23 A10 | önceki: Deney 6 |
| `IR15` | U1-25 A11, U3-25 A11, U5-25 A11, U7-25 A11 | önceki: Deney 6 |
| `IRQ` | U117-1 1A | arka panel 8 · ▶ elle sür |
| `IS_STEP0` | U117-4 2A, U145-6 3Y |  |
| `LED_FAULT` | D2.1, R2.2 |  |
| `LED_HALTED` | D1.1, R1.2 |  |
| `MC0_0` | U1-13 DQ0, U2-2 D0 |  |
| `MC0_1` | U1-14 DQ1, U2-3 D1 |  |
| `MC0_2` | U1-15 DQ2, U2-4 D2 |  |
| `MC0_3` | U1-17 DQ3, U2-5 D3 |  |
| `MC0_4` | U1-18 DQ4, U2-6 D4 |  |
| `MC0_5` | U1-19 DQ5, U2-7 D5 |  |
| `MC0_6` | U1-20 DQ6, U2-8 D6 |  |
| `MC0_7` | U1-21 DQ7, U2-9 D7 |  |
| `MC1_0` | U3-13 DQ0, U4-2 D0 |  |
| `MC1_1` | U3-14 DQ1, U4-3 D1 |  |
| `MC1_2` | U3-15 DQ2, U4-4 D2 |  |
| `MC1_3` | U3-17 DQ3, U4-5 D3 |  |
| `MC1_4` | U3-18 DQ4, U4-6 D4 |  |
| `MC1_5` | U3-19 DQ5, U4-7 D5 |  |
| `MC1_6` | U3-20 DQ6, U4-8 D6 |  |
| `MC1_7` | U3-21 DQ7, U4-9 D7 |  |
| `MC2_0` | U5-13 DQ0, U6-2 D0 |  |
| `MC2_1` | U5-14 DQ1, U6-3 D1 |  |
| `MC2_2` | U5-15 DQ2, U6-4 D2 |  |
| `MC2_3` | U5-17 DQ3, U6-5 D3 |  |
| `MC2_4` | U5-18 DQ4, U6-6 D4 |  |
| `MC2_5` | U5-19 DQ5, U6-7 D5 |  |
| `MC2_6` | U5-20 DQ6, U6-8 D6 |  |
| `MC2_7` | U5-21 DQ7, U6-9 D7 |  |
| `MC3_0` | U7-13 DQ0, U8-2 D0 |  |
| `MC3_1` | U7-14 DQ1, U8-3 D1 |  |
| `MC3_2` | U7-15 DQ2, U8-4 D2 |  |
| `MC3_3` | U7-17 DQ3, U8-5 D3 |  |
| `MC3_4` | U7-18 DQ4, U8-6 D4 |  |
| `MC3_5` | U7-19 DQ5, U8-7 D5 |  |
| `MC3_6` | U7-20 DQ6, U8-8 D6 |  |
| `MC3_7` | U7-21 DQ7, U8-9 D7 |  |
| (adsız) | U117-6 2Y, U127-1 1A |  |
| (adsız) | U117-8 3Y, U127-2 1B |  |
| (adsız) | U117-11 4Y, U127-4 2A |  |
| (adsız) | U118-3 1Y, U127-5 2B |  |
| (adsız) | U118-6 2Y, U127-10 3B |  |
| (adsız) | U118-10 3B, U127-11 4Y |  |
| `RUN` | U12-12 2D, U118-8 3Y |  |
| `RUN_R` | U9-7 CEP, U12-9 2Q, U118-2 1B, U118-5 2B, U130-2 1B, U130-5 2B | önceki: Deney 6 |
| `STEP0` | U1-12 A0, U3-12 A0, U5-12 A0, U7-12 A0, U9-14 Q0, U10-1 A0 |  |
| `STEP1` | U1-11 A1, U3-11 A1, U5-11 A1, U7-11 A1, U9-13 Q1, U10-2 A1 |  |
| `STEP2` | U1-10 A2, U3-10 A2, U5-10 A2, U7-10 A2, U9-12 Q2, U10-3 A2 |  |
| `STEP3` | U1-9 A3, U3-9 A3, U5-9 A3, U7-9 A3, U9-11 Q3, U10-4 ~E1 |  |
| `WAKE` | U117-3 1Y, U117-5 2B, U127-13 4B, U145-9 4A |  |

**Boşta kalan çıkışlar (bağlanmaz):** U4-12 Q7, U9-15 TC, U10-7 ~Y7, U10-9 ~Y6, U10-10 ~Y5, U10-11 ~Y4, U10-12 ~Y3, U10-13 ~Y2, U10-14 ~Y1, U11-6 ~1Q, U12-8 ~2Q, U13-7 ~Y7, U13-15 ~Y0, U49-6 ~Y, U50-6 ~Y, U51-6 ~Y, U52-6 ~Y, U53-6 ~Y, U54-6 ~Y, U55-6 ~Y, U56-6 ~Y, U57-6 ~Y, U58-6 ~Y, U59-6 ~Y, U60-6 ~Y, U61-6 ~Y, U62-6 ~Y, U63-6 ~Y, U64-6 ~Y

**Elle sürülecek girişler (1):** `IRQ`
<!-- otomatik: bitti -->
