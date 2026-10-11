# Deney 5: ALU ve bayraklar

> **Video:** "16 bit ALU: toplayıcıdan doğruluk tablosuna" · **Önce:** Deney 3 (ALU ROM'ları), Deney 4 · **Kart:** CPU kartı, "Geçici register'lar", "ALU", "Bayraklar ve koşul" blokları

Bu deney büyüktür; dört parçada kur ve her parçayı ayrı test et: (a) TA, TB ve toplayıcı,
(b) mantık birimi, (c) kaydırıcı ve sonuç seçici, (d) bayraklar ve koşul birimi.

## Ne öğreneceksin

- Toplama ve çıkarma aynı devredir: B'yi XOR ile tersle, elde girişini 1 yap (ikiye tümleyen).
- 4 × 74HC283 ile 16 bit dalgalı elde (ripple carry) ve taşma (V) bayrağının mantığı.
- Mantık işlemlerini (AND, OR, XOR, NOT …) **doğruluk tablosu** olarak üretmek: her bit bir 74HC151,
  seçici girişleri a ve b, veri girişleri işlemin 4 bitlik doğruluk tablosu.
- Mikrokodun yükünü azaltmak için bir **kod çözme ROM'u**: 5 bitlik işlem kodu 24 kontrol bitine açılır.
- NZCV bayrakları ve koşullu dallanmanın 14 koşulunu tek bir 74HC151'den üretmek.

## Nasıl çalışır

- **TA, TB** (4 × 74HC574): ALU'nun iki girişi; veriyolundan `CW17` (TA_L) ve `CW18` (TB_L) ile yüklenir.
- **İşlem kodu** `AOP0..4`: `CW11` (ALU_IR) 0 ise mikrokoddan (`CW6..CW10`), 1 ise komuttan (`IR0..2`,
  `IR12`) gelir. İşlemler: 0 ADD, 1 ADC, 2 SUB, 3 SBC, 4 AND, 5 OR, 6 XOR, 7 CMP, 8 MOV, 9 NOT,
  10 NEG, 11 SHL, 12 SHR, 13 SAR, 14 ROL, 15 ROR, 17 SXB, 18 MERGE.
- **ALU ROM'ları** (U69–U71, `alu-0..2.hex`): adres = işlem kodu, `IR8` (h biti) ve C bayrağı; çıkış
  `AD0..AD23`: toplayıcı girişlerinin terslenmesi, elde girişi, mantık tablosu, kaydırmada giren bit,
  sonuç seçimi ve "bu işlem C/V'yi değiştirir mi".
- **Toplayıcı:** `X = TA ⊕ INVA`, `Y = (TB ∧ PASSB) ⊕ INVB`, 4 × 74HC283. Taşma: işaretler aynıyken
  sonucun işareti farklıysa.
- **Mantık birimi:** 16 × 74HC151, her bit kendi doğruluk tablosu; yüksek baytta `TA7` de seçiciye girer
  (SXB ve MERGE bu sayede aynı devrede).
- **Sonuç seçici:** 8 × 74HC153: toplam / mantık / sola kaydırma / sağa kaydırma; sıfır algılama 2 × 74HC688.
- **Bayraklar:** N, Z, C, V ve I birer 74HC74 flip-flop; `CW24` (FLAGS_L) ALU'dan, `CW25` (FLAGS_BUS_L,
  RETI) veriyolundan yükler. **Koşul birimi** (74HC151) `IR11..9` ile bayrak birleşimini seçer, `IR8` tersler.

## Kurulum adımları

1. ROM'ları Deney 3'teki programlayıcıyla yaz, etiketle ve soketlerine tak (aşağıdaki listede).
2. (a) TA, TB, toplayıcı ve giriş XOR'ları. Geçici saat sürücüsünden `CLKR`'yi (CLK'nin kendisi) ver.
3. (b) Mantık birimi, (c) 74HC157 işlem seçici, sonuç seçici, sıfır algılama ve ALU → veriyolu tamponları.
4. (d) Bayrak flip-flopları, bayrak → veriyolu tamponları ve koşul birimi.
5. Elle sürülecek girişler: `CW6..CW11`, `CW17`, `CW18`, `CW24..CW27`, `IR0..2`, `IR8..IR12`,
   `~SRC_ALU`, `~SRC_FLAGS` anahtarlara.

## Test: beklenen sonuç

| Adım | Anahtarlar | Beklenen |
|---|---|---|
| TA ← 0x7FFF | veriyolu 0x7FFF, `CW17` = 1, ADIM | — |
| TB ← 0x0001 | veriyolu 0x0001, `CW18` = 1, ADIM | — |
| ADD | `CW10..6` = 00000, `~SRC_ALU` = 0 | veriyolu 0x8000 |
| bayraklar | `CW24` = 1, ADIM | N = 1, Z = 0, C = 0, V = 1 (işaretli taşma) |
| SUB | `CW10..6` = 00010 | 0x7FFE |
| AND / OR / XOR | 00100 / 00101 / 00110 | 0x0001 / 0x7FFF / 0x7FFE |
| SHL | 01011 | 0xFFFE (TA sola) |
| koşul | `IR11..9` = 000 (EQ), `IR8` = 0 | `COND` = Z |

Her işlemin bit bit tanımı: `cpu16/docs/isa-ayrintilari.md`.

## Simülatörde

- `npx vitest run cpu16/tests/board.test.ts -t "rastgele"`: kapı seviyesi CPU, binlerce rastgele komutta
  her saat döngüsünde mikrokod modeliyle aynı; ALU'nun her işlemi ve bayrağı bu testten geçer.
- 3D: `kart.secCip("U72")` bir 74HC283'ün (toplayıcı) içi; tam toplayıcı kapıları ve transistörleri.
- `npm run cpu16 -- run cpu16/programs/add32.s --trace`: ADC ile 32 bit toplama.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Toplama doğru, çıkarma 1 eksik | elde girişi (`CIN`) ALU ROM'undan geliyor mu; ROM doğru sokette mi |
| Mantık işlemleri saçma | 74HC151'lerin `I0..I7` sırası (doğruluk tablosu bitleri) ve `S0` = TA, `S1` = TB |
| Z bayrağı hep 0 | 74HC688'lerin `Q` girişleri GND, `~E` GND |
| C/V değişmiyor | `CV_LD` = (FLAGS_L ∧ SETSCV) ∨ FLAGS_BUS_L: MOV gibi işlemler C/V'yi bilerek değiştirmez |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (71 entegre, 71 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC02 | 1 | U135 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC04 | 1 | U145 | 6 × NOT (evirici) | GND 7, VCC 14 |
| 74HC08 | 8 | U118 U119 U120 U121 U122 U123 U124 U125 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC32 | 2 | U128 U129 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 3 | U106 U107 U108 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC86 | 9 | U136 U137 U138 U139 U140 U141 U142 U143 U144 | 4 × 2 girişli XOR | GND 7, VCC 14 |
| 74HC151 | 17 | U76 U77 U78 U79 U80 U81 U82 U83 U84 U85 U86 U87 U88 U89 U90 U91 U111 | 8'den 1'e seçici (multiplexer) | GND 8, VCC 16 |
| 74HC153 | 9 | U92 U93 U94 U95 U96 U97 U98 U99 U100 | 2 × (4'ten 1'e seçici) | GND 8, VCC 16 |
| 74HC157 | 4 | U67 U68 U105 U116 | 4 × (2'den 1'e seçici) | GND 8, VCC 16 |
| 74HC283 | 4 | U72 U73 U74 U75 | 4 bit ikili tam toplayıcı (ileri bakışlı elde) | GND 8, VCC 16 |
| 74HC541 | 4 | U103 U104 U109 U110 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 4 | U35 U36 U37 U38 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |
| 74HC688 | 2 | U101 U102 | 8 bit eşitlik karşılaştırıcı | GND 10, VCC 20 |
| SST39SF010A | 3 | U69 U70 U71 | 128 KB Flash (128K × 8, 5 V, komutla programlanır) | VSS 16, VDD 32 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 71 | C36 C37 C38 C39 C68 C69 C70 C71 C72 C73 C74 C75 C76 C77 C78 C79 C80 C81 C82 C83 C84 C85 C86 C87 C88 C89 C90 C91 C92 C93 C94 C95 C96 C97 C98 C99 C100 C101 C102 C103 C104 C105 C106 C107 C108 C109 C110 C111 C112 C117 C119 C120 C121 C122 C123 C124 C125 C126 C129 C130 C136 C137 C138 C139 C140 C141 C142 C143 C144 C145 C146 | 100 nF seramik kondansatör (dekuplaj) |

**Programlanacak Flash'lar** (Deney 3'teki programlayıcıyla, üzerine etiket yapıştır): U69 ← `cpu16/roms/alu-0.hex`, U70 ← `cpu16/roms/alu-1.hex`, U71 ← `cpu16/roms/alu-2.hex`

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U118** (74HC08, bu deneyde takılır): 4. kapı (TA saati). Diğerleri: 1. kapı → Deney 7, 2. kapı → Deney 7, 3. kapı → Deney 7
- **U119** (74HC08, bu deneyde takılır): 1. kapı (TB saati). Diğerleri: 2. kapı → Deney 6, 3. kapı → Deney 6, 4. kapı → Deney 6
- **U120** (74HC08, bu deneyde takılır): 1. kapı (toplayıcı B girişi); 2. kapı (toplayıcı B girişi); 3. kapı (toplayıcı B girişi); 4. kapı (toplayıcı B girişi)
- **U121** (74HC08, bu deneyde takılır): 1. kapı (toplayıcı B girişi); 2. kapı (toplayıcı B girişi); 3. kapı (toplayıcı B girişi); 4. kapı (toplayıcı B girişi)
- **U122** (74HC08, bu deneyde takılır): 1. kapı (toplayıcı B girişi); 2. kapı (toplayıcı B girişi); 3. kapı (toplayıcı B girişi); 4. kapı (toplayıcı B girişi)
- **U123** (74HC08, bu deneyde takılır): 1. kapı (toplayıcı B girişi); 2. kapı (toplayıcı B girişi); 3. kapı (toplayıcı B girişi); 4. kapı (toplayıcı B girişi)
- **U124** (74HC08, bu deneyde takılır): 1. kapı (taşma (V)); 2. kapı (SAR işaret biti); 3. kapı (NZ saati); 4. kapı (I saati)
- **U125** (74HC08, bu deneyde takılır): 1. kapı (I girişi); 2. kapı (HI koşulu); 3. kapı (GT koşulu). Diğerleri: 4. kapı → Deney 6
- **U128** (74HC32, bu deneyde takılır): 1. kapı (sağa kaydırmada giren bit); 2. kapı (N Z yükle); 3. kapı (I yükle); 4. kapı (I yükle)
- **U129** (74HC32, bu deneyde takılır): 1. kapı (I girişi). Diğerleri: 2. kapı → Deney 6, 3. kapı → Deney 6
- **U135** (74HC02, bu deneyde takılır): 1. kapı (Z bayrağı)
- **U136** (74HC86, bu deneyde takılır): 1. kapı (toplayıcı A girişi (NEG'de ters)); 2. kapı (toplayıcı A girişi (NEG'de ters)); 3. kapı (toplayıcı A girişi (NEG'de ters)); 4. kapı (toplayıcı A girişi (NEG'de ters))
- **U137** (74HC86, bu deneyde takılır): 1. kapı (toplayıcı A girişi (NEG'de ters)); 2. kapı (toplayıcı A girişi (NEG'de ters)); 3. kapı (toplayıcı A girişi (NEG'de ters)); 4. kapı (toplayıcı A girişi (NEG'de ters))
- **U138** (74HC86, bu deneyde takılır): 1. kapı (toplayıcı A girişi (NEG'de ters)); 2. kapı (toplayıcı A girişi (NEG'de ters)); 3. kapı (toplayıcı A girişi (NEG'de ters)); 4. kapı (toplayıcı A girişi (NEG'de ters))
- **U139** (74HC86, bu deneyde takılır): 1. kapı (toplayıcı A girişi (NEG'de ters)); 2. kapı (toplayıcı A girişi (NEG'de ters)); 3. kapı (toplayıcı A girişi (NEG'de ters)); 4. kapı (toplayıcı A girişi (NEG'de ters))
- **U140** (74HC86, bu deneyde takılır): 1. kapı (toplayıcı B girişi (SUB'da ters)); 2. kapı (toplayıcı B girişi (SUB'da ters)); 3. kapı (toplayıcı B girişi (SUB'da ters)); 4. kapı (toplayıcı B girişi (SUB'da ters))
- **U141** (74HC86, bu deneyde takılır): 1. kapı (toplayıcı B girişi (SUB'da ters)); 2. kapı (toplayıcı B girişi (SUB'da ters)); 3. kapı (toplayıcı B girişi (SUB'da ters)); 4. kapı (toplayıcı B girişi (SUB'da ters))
- **U142** (74HC86, bu deneyde takılır): 1. kapı (toplayıcı B girişi (SUB'da ters)); 2. kapı (toplayıcı B girişi (SUB'da ters)); 3. kapı (toplayıcı B girişi (SUB'da ters)); 4. kapı (toplayıcı B girişi (SUB'da ters))
- **U143** (74HC86, bu deneyde takılır): 1. kapı (toplayıcı B girişi (SUB'da ters)); 2. kapı (toplayıcı B girişi (SUB'da ters)); 3. kapı (toplayıcı B girişi (SUB'da ters)); 4. kapı (toplayıcı B girişi (SUB'da ters))
- **U144** (74HC86, bu deneyde takılır): 1. kapı (taşma (V)); 2. kapı (taşma (V)); 3. kapı (N = V); 4. kapı (koşul tersleme)
- **U145** (74HC04, bu deneyde takılır): 5. kapı (N = V). Diğerleri: 1. kapı → Deney 7, 2. kapı → Deney 7, 3. kapı → Deney 7, 4. kapı → Deney 7, 6. kapı → Deney 6

#### Bağlantılar (236 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U35-1 ~OE, U36-1 ~OE, U37-1 ~OE, U38-1 ~OE, U67-15 ~E, U68-3 1I1, U68-5 2I0, U68-6 2I1, U68-10 3I1, U68-11 3I0, U68-13 4I1, U68-14 4I0, U68-15 ~E, U69-2 A16, U69-3 A15, U69-4 A12, U69-5 A7, U69-22 ~CE, U69-23 A10, U69-24 ~OE, U69-25 A11, U69-26 A9, U69-27 A8, U69-28 A13, U69-29 A14, U70-2 A16, U70-3 A15, U70-4 A12, U70-5 A7, U70-22 ~CE, U70-23 A10, U70-24 ~OE, U70-25 A11, U70-26 A9, U70-27 A8, U70-28 A13, U70-29 A14, U71-2 A16, U71-3 A15, U71-4 A12, U71-5 A7, U71-22 ~CE, U71-23 A10, U71-24 ~OE, U71-25 A11, U71-26 A9, U71-27 A8, U71-28 A13, U71-29 A14, U76-7 ~E, U76-9 S2, U76-12 I7, U76-13 I6, U76-14 I5, U76-15 I4, U77-7 ~E, U77-9 S2, U77-12 I7, U77-13 I6, U77-14 I5, U77-15 I4, U78-7 ~E, U78-9 S2, U78-12 I7, U78-13 I6, U78-14 I5, U78-15 I4, U79-7 ~E, U79-9 S2, U79-12 I7, U79-13 I6, U79-14 I5, U79-15 I4, U80-7 ~E, U80-9 S2, U80-12 I7, U80-13 I6, U80-14 I5, U80-15 I4, U81-7 ~E, U81-9 S2, U81-12 I7, U81-13 I6, U81-14 I5, U81-15 I4, U82-7 ~E, U82-9 S2, U82-12 I7, U82-13 I6, U82-14 I5, U82-15 I4, U83-7 ~E, U83-9 S2, U83-12 I7, U83-13 I6, U83-14 I5, U83-15 I4, U84-7 ~E, U85-7 ~E, U86-7 ~E, U87-7 ~E, U88-7 ~E, U89-7 ~E, U90-7 ~E, U91-7 ~E, U92-1 ~1E, U92-15 ~2E, U93-1 ~1E, U93-15 ~2E, U94-1 ~1E, U94-15 ~2E, U95-1 ~1E, U95-15 ~2E, U96-1 ~1E, U96-15 ~2E, U97-1 ~1E, U97-15 ~2E, U98-1 ~1E, U98-15 ~2E, U99-1 ~1E, U99-15 ~2E, U100-1 ~1E, U100-5 1I1, U100-11 2I1, U100-12 2I2, U100-13 2I3, U100-15 ~2E, U101-1 ~E, U101-3 Q0, U101-5 Q1, U101-7 Q2, U101-9 Q3, U101-12 Q4, U101-14 Q5, U101-16 Q6, U101-18 Q7, U102-1 ~E, U102-3 Q0, U102-5 Q1, U102-7 Q2, U102-9 Q3, U102-12 Q4, U102-14 Q5, U102-16 Q6, U102-18 Q7, U103-19 ~OE2, U104-19 ~OE2, U105-15 ~E, U108-11 2CLK, U108-12 2D, U109-7 A5, U109-8 A6, U109-9 A7, U109-19 ~OE2, U110-2 A0, U110-3 A1, U110-4 A2, U110-5 A3, U110-6 A4, U110-7 A5, U110-8 A6, U110-9 A7, U110-19 ~OE2, U111-7 ~E, U116-10 3I1, U116-11 3I0, U116-13 4I1, U116-14 4I0, U116-15 ~E, U129-12 4A, U129-13 4B, U135-5 2A, U135-6 2B, U135-8 3A, U135-9 3B, U135-11 4A, U135-12 4B | sabit seviye |
| **VCC** | U69-31 ~WE, U70-31 ~WE, U71-31 ~WE, U106-4 ~1PRE, U106-10 ~2PRE, U107-4 ~1PRE, U107-10 ~2PRE, U108-4 ~1PRE, U108-10 ~2PRE, U108-13 ~2CLR, U111-12 I7 | sabit seviye |
| `~RESET` | U106-1 ~1CLR, U106-13 ~2CLR, U107-1 ~1CLR, U107-13 ~2CLR, U108-1 ~1CLR | arka panel 7 · önceki: Deney 1 |
| `~SRC_ALU` | U103-1 ~OE1, U104-1 ~OE1 | ▶ elle sür (Deney 7) |
| `~SRC_FLAGS` | U109-1 ~OE1, U110-1 ~OE1 | ▶ elle sür (Deney 7) |
| `~Z_HI` | U102-19 ~EQ, U135-3 1B |  |
| `~Z_LO` | U101-19 ~EQ, U135-2 1A |  |
| `~ZFLAG` | U106-8 ~2Q, U125-5 2B, U125-9 3A |  |
| `AD0` | U69-13 DQ0, U136-2 1B, U136-5 2B, U136-10 3B, U136-13 4B, U137-2 1B, U137-5 2B, U137-10 3B, U137-13 4B, U138-2 1B, U138-5 2B, U138-10 3B, U138-13 4B, U139-2 1B, U139-5 2B, U139-10 3B, U139-13 4B |  |
| `AD1` | U69-14 DQ1, U120-2 1B, U120-5 2B, U120-10 3B, U120-13 4B, U121-2 1B, U121-5 2B, U121-10 3B, U121-13 4B, U122-2 1B, U122-5 2B, U122-10 3B, U122-13 4B, U123-2 1B, U123-5 2B, U123-10 3B, U123-13 4B |  |
| `AD2` | U69-15 DQ2, U140-2 1B, U140-5 2B, U140-10 3B, U140-13 4B, U141-2 1B, U141-5 2B, U141-10 3B, U141-13 4B, U142-2 1B, U142-5 2B, U142-10 3B, U142-13 4B, U143-2 1B, U143-5 2B, U143-10 3B, U143-13 4B |  |
| `AD3` | U69-17 DQ3, U72-7 CIN |  |
| `AD4` | U69-18 DQ4, U116-1 S |  |
| `AD5` | U69-19 DQ5, U92-4 1I2 |  |
| `AD6` | U69-20 DQ6, U128-1 1A |  |
| `AD7` | U69-21 DQ7, U124-4 2A |  |
| `AD8` | U70-13 DQ0, U76-4 I0, U77-4 I0, U78-4 I0, U79-4 I0, U80-4 I0, U81-4 I0, U82-4 I0, U83-4 I0 |  |
| `AD9` | U70-14 DQ1, U76-3 I1, U77-3 I1, U78-3 I1, U79-3 I1, U80-3 I1, U81-3 I1, U82-3 I1, U83-3 I1 |  |
| `AD10` | U70-15 DQ2, U76-2 I2, U77-2 I2, U78-2 I2, U79-2 I2, U80-2 I2, U81-2 I2, U82-2 I2, U83-2 I2 |  |
| `AD11` | U70-17 DQ3, U76-1 I3, U77-1 I3, U78-1 I3, U79-1 I3, U80-1 I3, U81-1 I3, U82-1 I3, U83-1 I3 |  |
| `AD12` | U70-18 DQ4, U92-14 S0, U93-14 S0, U94-14 S0, U95-14 S0, U96-14 S0, U97-14 S0, U98-14 S0, U99-14 S0, U100-14 S0 |  |
| `AD13` | U70-19 DQ5, U92-2 S1, U93-2 S1, U94-2 S1, U95-2 S1, U96-2 S1, U97-2 S1, U98-2 S1, U99-2 S1, U100-2 S1 |  |
| `AD16` | U71-13 DQ0, U84-4 I0, U85-4 I0, U86-4 I0, U87-4 I0, U88-4 I0, U89-4 I0, U90-4 I0, U91-4 I0 |  |
| `AD17` | U71-14 DQ1, U84-3 I1, U85-3 I1, U86-3 I1, U87-3 I1, U88-3 I1, U89-3 I1, U90-3 I1, U91-3 I1 |  |
| `AD18` | U71-15 DQ2, U84-2 I2, U85-2 I2, U86-2 I2, U87-2 I2, U88-2 I2, U89-2 I2, U90-2 I2, U91-2 I2 |  |
| `AD19` | U71-17 DQ3, U84-1 I3, U85-1 I3, U86-1 I3, U87-1 I3, U88-1 I3, U89-1 I3, U90-1 I3, U91-1 I3 |  |
| `AD20` | U71-18 DQ4, U84-15 I4, U85-15 I4, U86-15 I4, U87-15 I4, U88-15 I4, U89-15 I4, U90-15 I4, U91-15 I4 |  |
| `AD21` | U71-19 DQ5, U84-14 I5, U85-14 I5, U86-14 I5, U87-14 I5, U88-14 I5, U89-14 I5, U90-14 I5, U91-14 I5 |  |
| `AD22` | U71-20 DQ6, U84-13 I6, U85-13 I6, U86-13 I6, U87-13 I6, U88-13 I6, U89-13 I6, U90-13 I6, U91-13 I6 |  |
| `AD23` | U71-21 DQ7, U84-12 I7, U85-12 I7, U86-12 I7, U87-12 I7, U88-12 I7, U89-12 I7, U90-12 I7, U91-12 I7 |  |
| `AOP0` | U67-4 1Y, U69-12 A0, U70-12 A0, U71-12 A0 |  |
| `AOP1` | U67-7 2Y, U69-11 A1, U70-11 A1, U71-11 A1 |  |
| `AOP2` | U67-9 3Y, U69-10 A2, U70-10 A2, U71-10 A2 |  |
| `AOP3` | U67-12 4Y, U69-9 A3, U70-9 A3, U71-9 A3 |  |
| `AOP4` | U68-4 1Y, U69-8 A4, U70-8 A4, U71-8 A4 |  |
| `BUS0` | U35-2 D0, U37-2 D0, U103-18 Y0, U105-13 4I1, U109-18 Y0 | çekme direnci RN1 (Deney 4) · önceki: Deney 4 |
| `BUS1` | U35-3 D1, U37-3 D1, U103-17 Y1, U105-10 3I1, U109-17 Y1 | çekme direnci RN1 (Deney 4) · önceki: Deney 4 |
| `BUS2` | U35-4 D2, U37-4 D2, U103-16 Y2, U105-6 2I1, U109-16 Y2 | çekme direnci RN1 (Deney 4) · önceki: Deney 4 |
| `BUS3` | U35-5 D3, U37-5 D3, U103-15 Y3, U105-3 1I1, U109-15 Y3 | çekme direnci RN1 (Deney 4) · önceki: Deney 4 |
| `BUS4` | U35-6 D4, U37-6 D4, U103-14 Y4, U109-14 Y4, U125-2 1B | çekme direnci RN1 (Deney 4) · önceki: Deney 4 |
| `BUS5` | U35-7 D5, U37-7 D5, U103-13 Y5, U109-13 Y5 | çekme direnci RN1 (Deney 4) · önceki: Deney 4 |
| `BUS6` | U35-8 D6, U37-8 D6, U103-12 Y6, U109-12 Y6 | çekme direnci RN1 (Deney 4) · önceki: Deney 4 |
| `BUS7` | U35-9 D7, U37-9 D7, U103-11 Y7, U109-11 Y7 | çekme direnci RN1 (Deney 4) · önceki: Deney 4 |
| `BUS8` | U36-2 D0, U38-2 D0, U104-18 Y0, U110-18 Y0 | çekme direnci RN2 (Deney 4) · önceki: Deney 4 |
| `BUS9` | U36-3 D1, U38-3 D1, U104-17 Y1, U110-17 Y1 | çekme direnci RN2 (Deney 4) · önceki: Deney 4 |
| `BUS10` | U36-4 D2, U38-4 D2, U104-16 Y2, U110-16 Y2 | çekme direnci RN2 (Deney 4) · önceki: Deney 4 |
| `BUS11` | U36-5 D3, U38-5 D3, U104-15 Y3, U110-15 Y3 | çekme direnci RN2 (Deney 4) · önceki: Deney 4 |
| `BUS12` | U36-6 D4, U38-6 D4, U104-14 Y4, U110-14 Y4 | çekme direnci RN2 (Deney 4) · önceki: Deney 4 |
| `BUS13` | U36-7 D5, U38-7 D5, U104-13 Y5, U110-13 Y5 | çekme direnci RN2 (Deney 4) · önceki: Deney 4 |
| `BUS14` | U36-8 D6, U38-8 D6, U104-12 Y6, U110-12 Y6 | çekme direnci RN2 (Deney 4) · önceki: Deney 4 |
| `BUS15` | U36-9 D7, U38-9 D7, U104-11 Y7, U110-11 Y7 | çekme direnci RN2 (Deney 4) · önceki: Deney 4 |
| `C_ADD` | U75-9 COUT, U100-6 1I0 |  |
| `C_ALU` | U100-7 1Y, U116-3 1I1 |  |
| `C_NEW` | U105-11 3I0, U116-4 1Y |  |
| `CFLAG` | U69-6 A6, U70-6 A6, U71-6 A6, U107-5 1Q, U109-3 A1, U111-3 I1, U116-2 1I0, U125-4 2A |  |
| `CLK_I` | U108-3 1CLK, U124-11 4Y |  |
| `CLK_NZ` | U106-3 1CLK, U106-11 2CLK, U107-3 1CLK, U107-11 2CLK, U124-8 3Y |  |
| `CLK_TA` | U35-11 CP, U36-11 CP, U118-11 4Y |  |
| `CLK_TB` | U37-11 CP, U38-11 CP, U119-3 1Y |  |
| `CLKR` | U118-12 4A, U119-1 1A, U124-9 3A, U124-12 4A | ▶ elle sür (Deney 7) |
| `CO0` | U72-9 COUT, U73-7 CIN |  |
| `CO1` | U73-9 COUT, U74-7 CIN |  |
| `CO2` | U74-9 COUT, U75-7 CIN |  |
| `COND` | U144-11 4Y | ◀ LED'le izlenebilir |
| `CONDY` | U111-5 Y, U144-12 4A |  |
| `CW6` | U67-2 1I0 | ▶ elle sür (Deney 7) |
| `CW7` | U67-5 2I0 | ▶ elle sür (Deney 7) |
| `CW8` | U67-11 3I0 | ▶ elle sür (Deney 7) |
| `CW9` | U67-14 4I0 | ▶ elle sür (Deney 7) |
| `CW10` | U68-2 1I0 | ▶ elle sür (Deney 7) |
| `CW11` | U67-1 S, U68-1 S | ▶ elle sür (Deney 7) |
| `CW17` | U118-13 4B | ▶ elle sür (Deney 7) |
| `CW18` | U119-2 1B | ▶ elle sür (Deney 7) |
| `CW24` | U128-4 2A | ▶ elle sür (Deney 7) |
| `CW25` | U105-1 S, U125-1 1A, U128-5 2B, U128-13 4B | ▶ elle sür (Deney 7) |
| `CW26` | U128-9 3A, U129-1 1A | ▶ elle sür (Deney 7) |
| `CW27` | U128-10 3B | ▶ elle sür (Deney 7) |
| `DC` | U105-9 3Y, U107-2 1D |  |
| `DI` | U108-2 1D, U129-3 1Y |  |
| `DN` | U105-4 1Y, U106-2 1D |  |
| `DV` | U105-12 4Y, U107-12 2D |  |
| `DZ` | U105-7 2Y, U106-12 2D |  |
| `I_LD` | U124-13 4B, U128-11 4Y |  |
| `IFLAG` | U108-5 1Q, U109-6 A4 |  |
| `IR0` | U67-3 1I1 | ▶ elle sür (Deney 6) |
| `IR1` | U67-6 2I1 | ▶ elle sür (Deney 6) |
| `IR2` | U67-10 3I1 | ▶ elle sür (Deney 6) |
| `IR8` | U69-7 A5, U70-7 A5, U71-7 A5, U144-13 4B | ▶ elle sür (Deney 6) · önceki: Deney 4 |
| `IR9` | U111-11 S0 | ▶ elle sür (Deney 6) · önceki: Deney 4 |
| `IR10` | U111-10 S1 | ▶ elle sür (Deney 6) · önceki: Deney 4 |
| `IR11` | U111-9 S2 | ▶ elle sür (Deney 6) · önceki: Deney 4 |
| `IR12` | U67-13 4I1 | ▶ elle sür (Deney 6) |
| `LOGIC0` | U76-5 Y, U92-5 1I1 |  |
| `LOGIC1` | U77-5 Y, U92-11 2I1 |  |
| `LOGIC2` | U78-5 Y, U93-5 1I1 |  |
| `LOGIC3` | U79-5 Y, U93-11 2I1 |  |
| `LOGIC4` | U80-5 Y, U94-5 1I1 |  |
| `LOGIC5` | U81-5 Y, U94-11 2I1 |  |
| `LOGIC6` | U82-5 Y, U95-5 1I1 |  |
| `LOGIC7` | U83-5 Y, U95-11 2I1 |  |
| `LOGIC8` | U84-5 Y, U96-5 1I1 |  |
| `LOGIC9` | U85-5 Y, U96-11 2I1 |  |
| `LOGIC10` | U86-5 Y, U97-5 1I1 |  |
| `LOGIC11` | U87-5 Y, U97-11 2I1 |  |
| `LOGIC12` | U88-5 Y, U98-5 1I1 |  |
| `LOGIC13` | U89-5 Y, U98-11 2I1 |  |
| `LOGIC14` | U90-5 Y, U99-5 1I1 |  |
| `LOGIC15` | U91-5 Y, U99-11 2I1 |  |
| `N_EQ_V` | U111-14 I5, U125-10 3B, U145-10 5Y |  |
| (adsız) | U120-3 1Y, U140-1 1A |  |
| (adsız) | U120-6 2Y, U140-4 2A |  |
| (adsız) | U120-8 3Y, U140-9 3A |  |
| (adsız) | U120-11 4Y, U140-12 4A |  |
| (adsız) | U121-3 1Y, U141-1 1A |  |
| (adsız) | U121-6 2Y, U141-4 2A |  |
| (adsız) | U121-8 3Y, U141-9 3A |  |
| (adsız) | U121-11 4Y, U141-12 4A |  |
| (adsız) | U122-3 1Y, U142-1 1A |  |
| (adsız) | U122-6 2Y, U142-4 2A |  |
| (adsız) | U122-8 3Y, U142-9 3A |  |
| (adsız) | U122-11 4Y, U142-12 4A |  |
| (adsız) | U123-3 1Y, U143-1 1A |  |
| (adsız) | U123-6 2Y, U143-4 2A |  |
| (adsız) | U123-8 3Y, U143-9 3A |  |
| (adsız) | U123-11 4Y, U143-12 4A |  |
| (adsız) | U124-1 1A, U144-3 1Y |  |
| (adsız) | U124-2 1B, U144-6 2Y |  |
| (adsız) | U124-6 2Y, U128-2 1B |  |
| (adsız) | U128-8 3Y, U128-12 4A |  |
| (adsız) | U125-3 1Y, U129-2 1B |  |
| (adsız) | U144-8 3Y, U145-11 5A |  |
| (adsız) | U111-15 I4, U125-6 2Y |  |
| (adsız) | U111-13 I6, U125-8 3Y |  |
| `NFLAG` | U106-5 1Q, U109-5 A3, U111-2 I2, U144-9 3A |  |
| `NZ_LD` | U124-10 3B, U128-6 2Y |  |
| `RES0` | U92-7 1Y, U101-2 P0, U103-2 A0 |  |
| `RES1` | U92-9 2Y, U101-4 P1, U103-3 A1 |  |
| `RES2` | U93-7 1Y, U101-6 P2, U103-4 A2 |  |
| `RES3` | U93-9 2Y, U101-8 P3, U103-5 A3 |  |
| `RES4` | U94-7 1Y, U101-11 P4, U103-6 A4 |  |
| `RES5` | U94-9 2Y, U101-13 P5, U103-7 A5 |  |
| `RES6` | U95-7 1Y, U101-15 P6, U103-8 A6 |  |
| `RES7` | U95-9 2Y, U101-17 P7, U103-9 A7 |  |
| `RES8` | U96-7 1Y, U102-2 P0, U104-2 A0 |  |
| `RES9` | U96-9 2Y, U102-4 P1, U104-3 A1 |  |
| `RES10` | U97-7 1Y, U102-6 P2, U104-4 A2 |  |
| `RES11` | U97-9 2Y, U102-8 P3, U104-5 A3 |  |
| `RES12` | U98-7 1Y, U102-11 P4, U104-6 A4 |  |
| `RES13` | U98-9 2Y, U102-13 P5, U104-7 A5 |  |
| `RES14` | U99-7 1Y, U102-15 P6, U104-8 A6 |  |
| `RES15` | U99-9 2Y, U102-17 P7, U104-9 A7, U105-2 1I0 |  |
| `SINH` | U99-13 2I3, U128-3 1Y |  |
| `SUM0` | U72-4 S1, U92-6 1I0 |  |
| `SUM1` | U72-1 S2, U92-10 2I0 |  |
| `SUM2` | U72-13 S3, U93-6 1I0 |  |
| `SUM3` | U72-10 S4, U93-10 2I0 |  |
| `SUM4` | U73-4 S1, U94-6 1I0 |  |
| `SUM5` | U73-1 S2, U94-10 2I0 |  |
| `SUM6` | U73-13 S3, U95-6 1I0 |  |
| `SUM7` | U73-10 S4, U95-10 2I0 |  |
| `SUM8` | U74-4 S1, U96-6 1I0 |  |
| `SUM9` | U74-1 S2, U96-10 2I0 |  |
| `SUM10` | U74-13 S3, U97-6 1I0 |  |
| `SUM11` | U74-10 S4, U97-10 2I0 |  |
| `SUM12` | U75-4 S1, U98-6 1I0 |  |
| `SUM13` | U75-1 S2, U98-10 2I0 |  |
| `SUM14` | U75-13 S3, U99-6 1I0 |  |
| `SUM15` | U75-10 S4, U99-10 2I0, U144-2 1B, U144-5 2B |  |
| `TA0` | U35-19 Q0, U76-11 S0, U92-12 2I2, U100-3 1I3, U136-1 1A |  |
| `TA1` | U35-18 Q1, U77-11 S0, U92-3 1I3, U93-4 1I2, U136-4 2A |  |
| `TA2` | U35-17 Q2, U78-11 S0, U92-13 2I3, U93-12 2I2, U136-9 3A |  |
| `TA3` | U35-16 Q3, U79-11 S0, U93-3 1I3, U94-4 1I2, U136-12 4A |  |
| `TA4` | U35-15 Q4, U80-11 S0, U93-13 2I3, U94-12 2I2, U137-1 1A |  |
| `TA5` | U35-14 Q5, U81-11 S0, U94-3 1I3, U95-4 1I2, U137-4 2A |  |
| `TA6` | U35-13 Q6, U82-11 S0, U94-13 2I3, U95-12 2I2, U137-9 3A |  |
| `TA7` | U35-12 Q7, U83-11 S0, U84-9 S2, U85-9 S2, U86-9 S2, U87-9 S2, U88-9 S2, U89-9 S2, U90-9 S2, U91-9 S2, U95-3 1I3, U96-4 1I2, U137-12 4A |  |
| `TA8` | U36-19 Q0, U84-11 S0, U95-13 2I3, U96-12 2I2, U138-1 1A |  |
| `TA9` | U36-18 Q1, U85-11 S0, U96-3 1I3, U97-4 1I2, U138-4 2A |  |
| `TA10` | U36-17 Q2, U86-11 S0, U96-13 2I3, U97-12 2I2, U138-9 3A |  |
| `TA11` | U36-16 Q3, U87-11 S0, U97-3 1I3, U98-4 1I2, U138-12 4A |  |
| `TA12` | U36-15 Q4, U88-11 S0, U97-13 2I3, U98-12 2I2, U139-1 1A |  |
| `TA13` | U36-14 Q5, U89-11 S0, U98-3 1I3, U99-4 1I2, U139-4 2A |  |
| `TA14` | U36-13 Q6, U90-11 S0, U98-13 2I3, U99-12 2I2, U139-9 3A |  |
| `TA15` | U36-12 Q7, U91-11 S0, U99-3 1I3, U100-4 1I2, U124-5 2B, U139-12 4A |  |
| `TB0` | U37-19 Q0, U76-10 S1, U120-1 1A |  |
| `TB1` | U37-18 Q1, U77-10 S1, U120-4 2A |  |
| `TB2` | U37-17 Q2, U78-10 S1, U120-9 3A |  |
| `TB3` | U37-16 Q3, U79-10 S1, U120-12 4A |  |
| `TB4` | U37-15 Q4, U80-10 S1, U121-1 1A |  |
| `TB5` | U37-14 Q5, U81-10 S1, U121-4 2A |  |
| `TB6` | U37-13 Q6, U82-10 S1, U121-9 3A |  |
| `TB7` | U37-12 Q7, U83-10 S1, U121-12 4A |  |
| `TB8` | U38-19 Q0, U84-10 S1, U122-1 1A |  |
| `TB9` | U38-18 Q1, U85-10 S1, U122-4 2A |  |
| `TB10` | U38-17 Q2, U86-10 S1, U122-9 3A |  |
| `TB11` | U38-16 Q3, U87-10 S1, U122-12 4A |  |
| `TB12` | U38-15 Q4, U88-10 S1, U123-1 1A |  |
| `TB13` | U38-14 Q5, U89-10 S1, U123-4 2A |  |
| `TB14` | U38-13 Q6, U90-10 S1, U123-9 3A |  |
| `TB15` | U38-12 Q7, U91-10 S1, U123-12 4A |  |
| `V_ADD` | U100-10 2I0, U124-3 1Y |  |
| `V_ALU` | U100-9 2Y, U116-6 2I1 |  |
| `V_NEW` | U105-14 4I0, U116-7 2Y |  |
| `VFLAG` | U107-9 2Q, U109-2 A0, U111-1 I3, U116-5 2I0, U144-10 3B |  |
| `X0` | U72-5 A1, U136-3 1Y |  |
| `X1` | U72-3 A2, U136-6 2Y |  |
| `X2` | U72-14 A3, U136-8 3Y |  |
| `X3` | U72-12 A4, U136-11 4Y |  |
| `X4` | U73-5 A1, U137-3 1Y |  |
| `X5` | U73-3 A2, U137-6 2Y |  |
| `X6` | U73-14 A3, U137-8 3Y |  |
| `X7` | U73-12 A4, U137-11 4Y |  |
| `X8` | U74-5 A1, U138-3 1Y |  |
| `X9` | U74-3 A2, U138-6 2Y |  |
| `X10` | U74-14 A3, U138-8 3Y |  |
| `X11` | U74-12 A4, U138-11 4Y |  |
| `X12` | U75-5 A1, U139-3 1Y |  |
| `X13` | U75-3 A2, U139-6 2Y |  |
| `X14` | U75-14 A3, U139-8 3Y |  |
| `X15` | U75-12 A4, U139-11 4Y, U144-1 1A |  |
| `Y0` | U72-6 B1, U140-3 1Y |  |
| `Y1` | U72-2 B2, U140-6 2Y |  |
| `Y2` | U72-15 B3, U140-8 3Y |  |
| `Y3` | U72-11 B4, U140-11 4Y |  |
| `Y4` | U73-6 B1, U141-3 1Y |  |
| `Y5` | U73-2 B2, U141-6 2Y |  |
| `Y6` | U73-15 B3, U141-8 3Y |  |
| `Y7` | U73-11 B4, U141-11 4Y |  |
| `Y8` | U74-6 B1, U142-3 1Y |  |
| `Y9` | U74-2 B2, U142-6 2Y |  |
| `Y10` | U74-15 B3, U142-8 3Y |  |
| `Y11` | U74-11 B4, U142-11 4Y |  |
| `Y12` | U75-6 B1, U143-3 1Y |  |
| `Y13` | U75-2 B2, U143-6 2Y |  |
| `Y14` | U75-15 B3, U143-8 3Y |  |
| `Y15` | U75-11 B4, U143-11 4Y, U144-4 2A |  |
| `Z_ALU` | U105-5 2I0, U135-1 1Y |  |
| `ZFLAG` | U106-9 2Q, U109-4 A2, U111-4 I0 |  |

**Boşta kalan çıkışlar (bağlanmaz):** U68-7 2Y, U68-9 3Y, U68-12 4Y, U70-20 DQ6, U70-21 DQ7, U76-6 ~Y, U77-6 ~Y, U78-6 ~Y, U79-6 ~Y, U80-6 ~Y, U81-6 ~Y, U82-6 ~Y, U83-6 ~Y, U84-6 ~Y, U85-6 ~Y, U86-6 ~Y, U87-6 ~Y, U88-6 ~Y, U89-6 ~Y, U90-6 ~Y, U91-6 ~Y, U106-6 ~1Q, U107-6 ~1Q, U107-8 ~2Q, U108-6 ~1Q, U108-8 ~2Q, U108-9 2Q, U111-6 ~Y, U116-9 3Y, U116-12 4Y, U129-11 4Y, U135-4 2Y, U135-10 3Y, U135-13 4Y

**Elle sürülecek girişler (23):** `~SRC_ALU`, `~SRC_FLAGS`, `CLKR`, `CW6`, `CW7`, `CW8`, `CW9`, `CW10`, `CW11`, `CW17`, `CW18`, `CW24`, `CW25`, `CW26`, `CW27`, `IR0`, `IR1`, `IR2`, `IR8`, `IR9`, `IR10`, `IR11`, `IR12`

**İzlenebilecek çıkışlar (1):** `COND`
<!-- otomatik: bitti -->
