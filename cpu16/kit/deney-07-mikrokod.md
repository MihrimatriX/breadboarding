# Deney 7: Mikrokod ve kontrol birimi

> **Video:** "Mikrokod: CPU'nun içindeki küçük program" · **Önce:** Deney 4–6 · **Kart:** CPU kartının kalanı: "Kontrol", "Kontrol birimi", "Sabit birimi" ve yapıştırıcı lojik
>
> **Breadboard panosu** (bilgisayarın kalıcı breadboard yolu, [docs/breadboard.md](../docs/breadboard.md)): `cpu-breadboard.pdf` (CPU kartı), 5. aşama.

Bu deneyin sonunda CPU kartı tamamdır: elle sürdüğün bütün `CW` anahtarlarını çıkarırsın, artık
onları mikrokod sürer. Kartta ROM yok: mikrokod tablosu 74HC kod çözücüleri, seçicileri ve
kapılarıyla kurulmuş bir **kontrol birimi**dir. Deneyin en büyük parçası budur; bit bit kur ve sına.

## Ne öğreneceksin

- Bir komutun mikro adımlara bölünmesi ve her adımın 32 bitlik bir **kontrol kelimesi** olması.
- Kontrol kelimesinin girişleri: mikro adım sayacı + komutun op ve f3 alanları + koşul + kesme biti
  (13 bit: 8192 satırlık bir doğruluk tablosu).
- Bu tabloyu ROM'suz kurmak: kod çözücüler (74HC138) "hangi komut", "hangi adım" hatlarını açar; her kontrol
  biti, o adımda biti 1 olan komutların VEYA'sıdır. Çok adımda kullanılan bitlerde adımı bir 74HC151 seçer.
- Kontrol kelimesini düşen kenarda bir register'a (CR) almak: sinyaller yükselen kenara kadar sabit, parazitsiz.
- HALT, yasadışı komut (FAULT) ve kesmeyle (IRQ) uyanma.

## Nasıl çalışır

- **Mikro adım sayacı** (74HC161, U9): her saatte +1, kontrol kelimesinde `END` (CW31) varsa 0'a döner.
- **Kod çözücüler** (74HC138): adım çözücü U10 (`STEP0..2` → `~ADIM0..7`, `STEP3` = 1 iken pasif); komut
  çözücüler U1 (op 0..7) ve U3 (op 8..15) → `~KOP0..15`, `INT` = 1 iken hepsi pasif; f3'e göre dallanan
  komutların alt çözücüleri U5 (op 13) ve U7 (op 14) → `~KOP13_F0..7`, `~KOP14_F0..7`. Adım 8..15'e
  yalnızca SWI ulaşır: U68 SWI'ın hattıyla açılır, çıkışları doğrudan "SWI ∧ adım" terimleridir.
- **Komut sınıfları:** aynı mikro programı çalıştıran komutlar tek hatta toplanır (ör. bütün yasadışı
  komutlar; op 9'da koşulun doğru ya da yanlış olması: `~KOP9_C0`, `~KOP9_C1`).
- **VEYA ağı** (yapıştırıcı kapılar, "Kontrol birimi" bloğu): her kontrol biti ve her adım için "bu biti 1
  olan komut sınıfları" kümesi. Hatlar aktif düşük olduğu için kümedekilerin NAND'ı VEYA'dır; küme büyükse
  kümede olmayanların AND'ı ("hiçbiri değil") daha az kapı ister. Kümelerin ortak parçaları bir kez kurulur
  ("ortak alt küme" kapıları).
- **Adım seçicileri** (10 × 74HC151, U147–U156): adım 0..7'nin çoğunda kullanılan bitlerde (`CW0..4`, `CW7`,
  `CW16`, `CW17`, `CW21`, `CW31`) seçici `STEP0..2`, veri girişleri her adımın kümesi. Seyrek bitler
  "adım ∧ küme" terimlerinin VEYA'sıdır.
- Kontrol biriminin çıkışları `MK0..MK31`; **kontrol register'ı** (4 × 74HC574: U2, U4, U6, U8) onları CLK'nin
  düşen kenarında alır: `CW0..CW31`.
- `CW0..2` bir 74HC138 (U13) ile veriyolu sürücüsünü seçer (`~SRC_REG/ALU/PC/MEM/IMM/FLAGS`): aynı anda tek
  sürücü donanımla garanti edilir.
- **Sabit birimi** (16 × 74HC151): komut kelimesinden 8 biçimden birini çıkarır (IMM6, IMM6×2, IMM8, IMM9,
  OFF8×2, OFF12×2, 2, 4), `~SRC_IMM` ile veriyoluna.
- **Çalışma izni:** HALT ya da FAULT'ta `RUN_R` düşer, kapılı saat (`CLKR`) durur. `IRQ` ∧ I bayrağı CPU'yu
  uyandırır; adım 0'da (`~ADIM0`) kesme varsa `INT` 1 olur ve kontrol birimi kesme girişini çalıştırır.

Mikrokodun okunur kaynağı `cpu16/micro/cpu16.ucode`; kontrol birimi bu dosyadan üretilir
(`cpu16/board/kontrol.ts`, `npm run cpu16 -- kontrol`). Mikrokod değişirse kart da değişir: şemayı ve bu
rehberi yeniden üret (`npm run cpu16 -- board kicad`, `npm run cpu16 -- kit`).

## Kurulum adımları

1. Geçici saat sürücüsünü ve bütün `CW`/`~SRC` anahtarlarını çıkar.
2. Mikro adım sayacı (U9), kontrol register'ı (U2, U4, U6, U8), INT/HALT ve FAULT/çalışma izni
   flip-flopları (U11, U12), veriyolu kaynağı çözücü (U13), HALTED ve FAULT LED'leri.
3. Kod çözücüler: U10 (adım), U1 ve U3 (komut), U5 ve U7 (alt çözücüler), U68 (adım 8..15).
4. Kontrol biriminin kapıları ve adım seçicileri, bir seferde bir kontrol biti: aşağıdaki kapı listesinde
   her kapının rolü hangi `CW` bitine ait olduğunu söyler ("ortak alt küme" kapıları birden çok bite gider).
   Her biti kurunca aşağıdaki tabloyla sına.
5. Sabit birimi ve sabit → veriyolu tamponları.
6. Kalan yapıştırıcı kapılar (aşağıdaki listede "bu deneyde takılır" olanlar ve önceki çiplerin boş kapıları).
7. `IRQ` girişini 10 kΩ ile GND'ye çek (G/Ç kartı Deney 10'da sürer). Sahte bellek (Deney 6) hâlâ takılı.

## Test: beklenen sonuç

Önce kontrol birimini tek başına sına: YAVAŞ saatte `CW0..CW31`'e LED gösterge modülü bağla.

| Adım (STEP) | Sahte bellek | `CW31..CW0` | Anlamı |
|---|---|---|---|
| 0 | herhangi | `0x00200003` | PC → veriyolu, MAR_L (getirme) |
| 1 | herhangi | `0x00900004` | bellek → veriyolu, IR_L, PC += 2 |
| 2 | `0xE000` (NOP) | `0x80000000` | END |
| 2 | `0xE001` (HALT) | `0xA0000000` | HALT, END |
| 2 | `0xF000` (yasadışı op) | `0xC0000000` | ILLEGAL, END |

Sonra bütün CPU:

| Sahte bellek | Beklenen |
|---|---|
| `0xE000` (NOP) | RESET'ten sonra adres LED'leri 0x0000, 0x0002, 0x0004 … her 3 saatte bir ilerler (NOP = 3 döngü) |
| `0xE001` (HALT) | ilk komutta HALTED LED'i yanar, saat çalışsa da PC durur |
| `0xF000` (yasadışı op) | FAULT LED'i yanar |
| `0xE000` + YAVAŞ | mikro adım sayacının çıkışları 0, 1, 2, 0, 1, 2 … |

Adres LED'lerindeki sayaç 0xFFFE'den 0x0000'a sarar: CPU tüm adres alanında NOP "çalıştırıyor".

## Simülatörde

- `npx vitest run cpu16/tests/kontrol.test.ts`: kontrol birimi tek başına, gerçek çip modelleriyle 8192
  satırın hepsinde mikrokod tablosuyla aynı kelimeyi verir (ALU kod çözücünün 128 satırı da).
- `npx vitest run cpu16/tests/board.test.ts`: kapı seviyesi CPU (bu kartın kendisi) hello, fib, add32, bubble
  ve irq programlarını her saat döngüsünde mikrokod modeliyle aynı çalıştırır.
- 3D: `kart.program("hello")`, `kart.calistir()`: UART çıkışında "Merhaba, CPU16!". `kart.secCip("U2")`
  kontrol register'ı 0, `kart.secCip("U1")` komut çözücü (op 0..7).
- Mikrokod tablosu, döngü sayıları ve kontrol biriminin yapısı: `cpu16/docs/mikromimari.md`.

## Sorun giderme

| Belirti | Bak |
|---|---|
| Hiçbir şey olmuyor | `RUN_R` = 1 mi; `~RESET` bırakıldı mı; IR'ye ilk komut geldi mi (adım 1) |
| NOP 3 değil 16 döngü sürüyor | `END` (CW31) sayacın `~PE`'sine NAND ile gidiyor mu; U156 (CW31 adım seçicisi) |
| Bir `CW` biti tabloda yanlış | o bitin rolündeki kapılar (aşağıdaki liste); 74HC151'de `S0..S2` = `STEP0..2`, `~E` = `STEP3` |
| Rastgele FAULT | komut çözücülerin adres sırası (`IR12..15` → `A0..A2`, `IR15` izin girişinde) ve `INT` |
| HALT'tan çıkmıyor | `IRQ` GND'de olduğu için normal; RESET ile çık |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
#### Malzeme (67 entegre, 71 pasif eleman)

| Parça | Adet | Referanslar | Açıklama | Besleme |
|---|---|---|---|---|
| 74HC00 | 4 | U170 U171 U172 U173 | 4 × 2 girişli NAND | GND 7, VCC 14 |
| 74HC02 | 1 | U175 | 4 × 2 girişli NOR | GND 7, VCC 14 |
| 74HC08 | 6 | U117 U157 U158 U159 U160 U161 | 4 × 2 girişli AND | GND 7, VCC 14 |
| 74HC10 | 5 | U179 U180 U181 U182 U183 | 3 × 3 girişli NAND | GND 7, VCC 14 |
| 74HC20 | 1 | U191 | 2 × 4 girişli NAND | GND 7, VCC 14 |
| 74HC21 | 2 | U187 U188 | 2 × 4 girişli AND | GND 7, VCC 14 |
| 74HC32 | 6 | U127 U164 U165 U166 U167 U168 | 4 × 2 girişli OR | GND 7, VCC 14 |
| 74HC74 | 2 | U11 U12 | 2 × D flip-flop (asenkron preset ve clear) | GND 7, VCC 14 |
| 74HC138 | 7 | U1 U3 U5 U7 U10 U13 U68 | 3'ten 8'e kod çözücü (aktif düşük çıkış) | GND 8, VCC 16 |
| 74HC151 | 26 | U49 U50 U51 U52 U53 U54 U55 U56 U57 U58 U59 U60 U61 U62 U63 U64 U147 U148 U149 U150 U151 U152 U153 U154 U155 U156 | 8'den 1'e seçici (multiplexer) | GND 8, VCC 16 |
| 74HC161 | 1 | U9 | 4 bit senkron ikili sayıcı (asenkron reset) | GND 8, VCC 16 |
| 74HC541 | 2 | U65 U66 | 8 bit üç durumlu tampon (iki aktif düşük OE) | GND 10, VCC 20 |
| 74HC574 | 4 | U2 U4 U6 U8 | 8 bit D flip-flop register (üç durumlu çıkış) | GND 10, VCC 20 |

| Pasif | Adet | Referanslar | Açıklama |
|---|---|---|---|
| C_100N | 67 | C2 C3 C4 C5 C6 C7 C8 C9 C10 C11 C12 C13 C14 C50 C51 C52 C53 C54 C55 C56 C57 C58 C59 C60 C61 C62 C63 C64 C65 C66 C67 C69 C118 C128 C148 C149 C150 C151 C152 C153 C154 C155 C156 C157 C158 C159 C160 C161 C162 C165 C166 C167 C168 C169 C171 C172 C173 C174 C176 C180 C181 C182 C183 C184 C188 C189 C192 | 100 nF seramik kondansatör (dekuplaj) |
| LED | 2 | D1 D2 | 3 mm LED |
| R_330 | 2 | R1 R2 | 330 Ω direnç (LED akımı) |

Yapıştırıcı lojik çiplerinin kapıları bloklara dağılmıştır; bu deneyde kullanılan kapılar:

- **U117** (74HC08, bu deneyde takılır): 1. kapı (IRQ ∧ I); 2. kapı (INT seçimi); 3. kapı (INT seçimi); 4. kapı (HALT durumu)
- **U118** (74HC08, Deney 5'de takıldı): 1. kapı (HALT durumu); 2. kapı (yasadışı komut); 3. kapı (çalışma izni). Diğerleri: 4. kapı → Deney 5
- **U126** (74HC08, Deney 6'de takıldı): 4. kapı (ortak alt küme). Diğerleri: 1. kapı → Deney 6, 2. kapı → Deney 6, 3. kapı → Deney 6
- **U127** (74HC32, bu deneyde takılır): 1. kapı (INT seçimi); 2. kapı (HALT durumu); 3. kapı (yasadışı komut); 4. kapı (çalışma izni)
- **U129** (74HC32, Deney 5'de takıldı): 4. kapı (komut sınıfı: op 9). Diğerleri: 1. kapı → Deney 5, 2. kapı → Deney 6, 3. kapı → Deney 6
- **U130** (74HC00, Deney 6'de takıldı): 1. kapı (kapılı ana saat); 2. kapı (END: adımı sıfırla). Diğerleri: 3. kapı → Deney 6, 4. kapı → Deney 6
- **U132** (74HC00, Deney 6'de takıldı): 3. kapı (CW0); 4. kapı (CW1). Diğerleri: 1. kapı → Deney 6, 2. kapı → Deney 6
- **U135** (74HC02, Deney 5'de takıldı): 2. kapı (kesme girişi); 3. kapı (CW5); 4. kapı (CW6). Diğerleri: 1. kapı → Deney 5
- **U145** (74HC04, Deney 5'de takıldı): 1. kapı (saat tersi); 2. kapı (kapılı ana saat); 3. kapı (adım 0); 4. kapı (uyanma). Diğerleri: 5. kapı → Deney 5, 6. kapı → Deney 6
- **U146** (74HC04, Deney 6'de takıldı): 3. kapı (CW0); 4. kapı (koşul tersi); 5. kapı (CW1); 6. kapı (CW2). Diğerleri: 1. kapı → Deney 6, 2. kapı → Deney 6
- **U157** (74HC08, bu deneyde takılır): 1. kapı (ortak alt küme); 2. kapı (ortak alt küme); 3. kapı (ortak alt küme); 4. kapı (ortak alt küme)
- **U158** (74HC08, bu deneyde takılır): 1. kapı (ortak alt küme); 2. kapı (CW0); 3. kapı (ortak alt küme); 4. kapı (ortak alt küme)
- **U159** (74HC08, bu deneyde takılır): 1. kapı (ortak alt küme); 2. kapı (ortak alt küme); 3. kapı (ortak alt küme); 4. kapı (ortak alt küme)
- **U160** (74HC08, bu deneyde takılır): 1. kapı (ortak alt küme); 2. kapı (ortak alt küme); 3. kapı (ortak alt küme); 4. kapı (ortak alt küme)
- **U161** (74HC08, bu deneyde takılır): 1. kapı (ortak alt küme); 2. kapı (ortak alt küme); 3. kapı (CW2); 4. kapı (CW3)
- **U162** (74HC08, Deney 5'de takıldı): 1. kapı (CW13); 2. kapı (CW13); 3. kapı (CW22). Diğerleri: 4. kapı → Deney 5
- **U164** (74HC32, bu deneyde takılır): 1. kapı (komut sınıfı: op 9); 2. kapı (CW10); 3. kapı (CW10); 4. kapı (CW11)
- **U165** (74HC32, bu deneyde takılır): 1. kapı (CW11); 2. kapı (CW12); 3. kapı (CW13); 4. kapı (CW13)
- **U166** (74HC32, bu deneyde takılır): 1. kapı (CW14); 2. kapı (komut sınıfı: op 0); 3. kapı (CW18); 4. kapı (CW18)
- **U167** (74HC32, bu deneyde takılır): 1. kapı (CW19); 2. kapı (CW19); 3. kapı (CW19); 4. kapı (CW22)
- **U168** (74HC32, bu deneyde takılır): 1. kapı (CW22); 2. kapı (CW24); 3. kapı (CW24); 4. kapı (CW27)
- **U169** (74HC32, Deney 5'de takıldı): 1. kapı (CW27). Diğerleri: 2. kapı → Deney 5, 3. kapı → Deney 5, 4. kapı → Deney 5
- **U170** (74HC00, bu deneyde takılır): 1. kapı (CW1); 2. kapı (CW1); 3. kapı (CW2); 4. kapı (CW3)
- **U171** (74HC00, bu deneyde takılır): 1. kapı (CW3); 2. kapı (CW4); 3. kapı (CW7); 4. kapı (CW10)
- **U172** (74HC00, bu deneyde takılır): 1. kapı (CW11); 2. kapı (CW12); 3. kapı (CW16); 4. kapı (CW18)
- **U173** (74HC00, bu deneyde takılır): 1. kapı (CW18); 2. kapı (CW21); 3. kapı (CW24); 4. kapı (CW31)
- **U175** (74HC02, bu deneyde takılır): 1. kapı (CW20); 2. kapı (CW25); 3. kapı (CW26); 4. kapı (CW28)
- **U176** (74HC02, Deney 5'de takıldı): 1. kapı (CW29); 2. kapı (CW30). Diğerleri: 3. kapı → Deney 5, 4. kapı → Deney 5
- **U177** (74HC04, Deney 5'de takıldı): 1. kapı (CW4); 2. kapı (CW16); 3. kapı (f3 çözme); 4. kapı (CW22); 5. kapı (CW31). Diğerleri: 6. kapı → Deney 5
- **U179** (74HC10, bu deneyde takılır): 1. kapı (komut sınıfı: op 13); 2. kapı (CW0); 3. kapı (CW0)
- **U180** (74HC10, bu deneyde takılır): 1. kapı (CW1); 2. kapı (CW1); 3. kapı (CW2)
- **U181** (74HC10, bu deneyde takılır): 1. kapı (CW2); 2. kapı (CW3); 3. kapı (CW13)
- **U182** (74HC10, bu deneyde takılır): 1. kapı (CW14); 2. kapı (f3 çözme); 3. kapı (CW16)
- **U183** (74HC10, bu deneyde takılır): 1. kapı (CW21); 2. kapı (CW22); 3. kapı (CW27)
- **U184** (74HC10, Deney 5'de takıldı): 1. kapı (CW31); 2. kapı (CW31). Diğerleri: 3. kapı → Deney 5
- **U186** (74HC11, Deney 5'de takıldı): 1. kapı (CW12); 2. kapı (CW24). Diğerleri: 3. kapı → Deney 5
- **U187** (74HC21, bu deneyde takılır): 1. kapı (aynı mikro program); 2. kapı (aynı mikro program)
- **U188** (74HC21, bu deneyde takılır): 1. kapı (CW1); 2. kapı (CW3)
- **U189** (74HC21, Deney 5'de takıldı): 1. kapı (CW16). Diğerleri: 2. kapı → Deney 5
- **U191** (74HC20, bu deneyde takılır): 1. kapı (komut); 2. kapı (CW16)
- **U192** (74HC20, Deney 5'de takıldı): 1. kapı (CW19). Diğerleri: 2. kapı → Deney 5

#### Bağlantılar (274 net)

Her satır bir nettir: sütundaki pinlerin hepsi birbirine bağlanır. `U12-3 D0` = U12'nin 3. bacağı (D0).
Pasif elemanlarda `R5.2` = R5'in 2. ucu. Besleme pinleri ve dekuplaj kondansatörleri tabloda yoktur
(her entegrenin VCC/GND bacağı besleme hattına, 100 nF'ı bacaklarına yakın). ▶ = bu deneyde sürücüsü yok,
elle sür (DIP anahtar + 10 kΩ çekme direnci); ◀ = alıcısı sonraki deneylerde, LED + 330 Ω ile izlenebilir.

| Net | Pinler | Not |
|---|---|---|
| **GND** | U2-1 ~OE, U3-5 ~E2, U4-1 ~OE, U4-2 D0, U4-3 D1, U4-9 D7, U5-5 ~E2, U6-1 ~OE, U7-5 ~E2, U8-1 ~OE, U9-3 D0, U9-4 D1, U9-5 D2, U9-6 D3, U10-5 ~E2, U13-4 ~E1, U13-5 ~E2, U49-3 I1, U49-7 ~E, U49-12 I7, U49-13 I6, U49-14 I5, U49-15 I4, U50-7 ~E, U50-12 I7, U51-7 ~E, U51-13 I6, U52-7 ~E, U52-12 I7, U52-13 I6, U53-7 ~E, U53-12 I7, U53-13 I6, U54-7 ~E, U54-12 I7, U54-13 I6, U55-7 ~E, U55-12 I7, U55-13 I6, U56-7 ~E, U56-12 I7, U56-13 I6, U57-7 ~E, U57-12 I7, U57-13 I6, U58-7 ~E, U58-12 I7, U58-13 I6, U59-7 ~E, U59-12 I7, U59-13 I6, U60-7 ~E, U60-12 I7, U60-13 I6, U61-7 ~E, U61-12 I7, U61-13 I6, U62-7 ~E, U62-12 I7, U62-13 I6, U63-7 ~E, U63-12 I7, U63-13 I6, U64-7 ~E, U64-12 I7, U64-13 I6, U65-19 ~OE2, U66-19 ~OE2, U68-5 ~E2, U135-6 2B, U148-3 I1, U149-2 I2, U149-4 I0, U150-1 I3, U150-3 I1, U151-3 I1, U152-1 I3, U152-3 I1, U152-4 I0, U152-13 I6, U153-3 I1, U153-4 I0, U154-1 I3, U154-3 I1, U154-12 I7, U155-1 I3, U155-3 I1, U155-13 I6, U156-3 I1, U156-4 I0, U156-13 I6 | sabit seviye |
| **VCC** | U1-6 E3, U5-6 E3, U7-6 E3, U9-10 CET, U10-6 E3, U11-4 ~1PRE, U11-10 ~2PRE, U12-4 ~1PRE, U12-13 ~2CLR, U13-6 E3, U50-13 I6, U51-12 I7, U147-4 I0, U149-3 I1, U179-5 2C, U187-4 1C, U187-5 1D, U191-2 1B, U191-4 1C, U191-5 1D | sabit seviye |
| `~ADIM0` | U10-15 ~Y0, U117-9 3A, U145-5 3A |  |
| `~ADIM1` | U10-14 ~Y1, U162-1 1A, U166-9 3A, U175-2 1A |  |
| `~ADIM2` | U10-13 ~Y2, U135-8 3A, U168-12 4A, U175-8 3A, U176-2 1A, U176-5 2A |  |
| `~ADIM3` | U10-12 ~Y3, U135-11 4A, U162-9 3A, U164-4 2A, U164-12 4A, U165-4 2A, U165-12 4A, U166-1 1A, U166-12 4A, U168-4 2A |  |
| `~ADIM4` | U10-11 ~Y4, U164-9 3A, U165-1 1A, U167-1 1A, U168-9 3A, U175-5 2A |  |
| `~ADIM5` | U10-10 ~Y5, U167-4 2A, U168-1 1A, U175-11 4A |  |
| `~ADIM6` | U10-9 ~Y6, U162-10 3B, U169-1 1A |  |
| `~ADIM7` | U10-7 ~Y7, U162-2 1B, U167-9 3A |  |
| `~ADIM8_A` | U68-15 ~Y0, U161-9 3A, U170-5 2B, U183-5 2C, U183-11 3C |  |
| `~ADIM9_A` | U68-14 ~Y1, U132-10 3B, U161-10 3B, U172-5 2B, U173-13 4B, U181-11 3C, U182-13 1C, U192-5 1D |  |
| `~CLK` | U2-11 CP, U4-11 CP, U6-11 CP, U8-11 CP, U12-11 2CLK, U145-2 1Y |  |
| `~CLKR` | U130-3 1Y, U145-3 2A | önceki: Deney 4 |
| `~COND` | U146-8 4Y, U164-2 1B |  |
| `~FAULT` | U12-6 ~1Q, U118-9 3A |  |
| `~HALTED` | U11-8 ~2Q, U127-12 4A |  |
| `~INT` | U132-12 4A, U135-4 2Y, U148-4 I0, U155-4 I0, U157-12 4A, U160-10 3B, U165-10 3B, U166-10 3B, U167-13 4B, U169-2 1B, U170-1 1A, U171-4 2A, U172-10 3B, U173-4 2A, U179-4 2B, U181-4 2B, U191-12 2C |  |
| `~KOP0` | U1-15 ~Y0, U165-2 1B, U166-4 2A, U177-1 1A, U184-1 1A, U186-3 2A, U188-1 1A |  |
| `~KOP1` | U1-14 ~Y1, U158-1 1A, U164-13 4B |  |
| `~KOP2` | U1-13 ~Y2, U187-9 2A |  |
| `~KOP3` | U1-12 ~Y3, U159-4 2A, U186-4 2B, U189-1 1A |  |
| `~KOP4` | U1-11 ~Y4, U159-1 1A, U164-10 3B, U189-2 1B |  |
| `~KOP5` | U1-10 ~Y5, U159-12 4A, U181-1 1A, U191-9 2A |  |
| `~KOP6` | U1-9 ~Y6, U159-13 4B, U179-9 3A |  |
| `~KOP7` | U1-7 ~Y7, U159-9 3A, U181-2 1B, U191-10 2B |  |
| `~KOP8` | U3-15 ~Y0, U159-10 3B, U179-10 3B |  |
| `~KOP9` | U3-14 ~Y1, U129-12 4A, U161-12 4A, U164-1 1A |  |
| `~KOP9_C0` | U129-11 4Y, U187-1 1A |  |
| `~KOP9_C1` | U158-13 4B, U164-3 1Y |  |
| `~KOP10` | U3-13 ~Y2, U135-9 3B, U158-12 4A, U161-13 4B, U172-9 3A, U186-1 1A |  |
| `~KOP11` | U3-12 ~Y3, U160-1 1A, U167-5 2B, U179-3 2A, U180-3 2A, U189-4 1C |  |
| `~KOP12` | U3-11 ~Y4, U159-2 1B, U186-2 1B, U186-5 2C |  |
| `~KOP13` | U3-10 ~Y5, U5-4 ~E1, U191-1 1A |  |
| `~KOP13_F0` | U5-15 ~Y0, U158-9 3A, U170-12 4A, U179-2 1B, U184-3 2A |  |
| `~KOP13_F1` | U5-14 ~Y1, U160-12 4A, U179-13 1C, U181-3 2A, U181-13 1C, U184-4 2B, U188-2 1B, U189-5 1D |  |
| `~KOP14` | U3-9 ~Y6, U7-4 ~E1 |  |
| `~KOP14_F0` | U7-15 ~Y0, U187-2 1B, U188-10 2B |  |
| `~KOP14_F1` | U7-14 ~Y1, U126-12 4A, U176-3 1B |  |
| `~KOP14_F2` | U7-13 ~Y2, U126-13 4B, U175-9 3B |  |
| `~KOP14_F3` | U7-12 ~Y3, U157-1 1A, U168-13 4B |  |
| `~KOP14_F4` | U7-11 ~Y4, U146-13 6A, U160-9 3A, U160-13 4B, U171-1 1A, U175-6 2B |  |
| `~KOP14_F5` | U7-10 ~Y5, U68-4 ~E1, U146-5 3A, U158-10 3B, U171-2 1B, U180-4 2B |  |
| `~KOP14_F6` | U7-9 ~Y6, U135-12 4B, U158-2 1B, U164-5 2B |  |
| `~KOP14_F7` | U7-7 ~Y7, U187-12 2C |  |
| `~KOP15` | U3-7 ~Y7, U187-13 2D |  |
| `~MK0_0` | U132-9 3A, U147-6 ~Y |  |
| `~MK1_0` | U148-6 ~Y, U170-4 2A |  |
| `~MK2_0` | U149-6 ~Y, U170-9 3A |  |
| `~MK31_0` | U156-6 ~Y, U173-12 4A |  |
| `~RESET` | U9-1 ~MR, U11-1 ~1CLR, U11-13 ~2CLR, U12-1 ~1CLR, U12-10 ~2PRE | arka panel 7 · önceki: Deney 1, 5, 6 |
| `~SRC_ALU` | U13-13 ~Y2 | önceki: Deney 5 |
| `~SRC_FLAGS` | U13-9 ~Y6 | önceki: Deney 5 |
| `~SRC_IMM` | U13-10 ~Y5, U65-1 ~OE1, U66-1 ~OE1 |  |
| `~SRC_MEM` | U13-11 ~Y4 | önceki: Deney 6 |
| `~SRC_PC` | U13-12 ~Y3 | önceki: Deney 6 |
| `~SRC_REG` | U13-14 ~Y1 | önceki: Deney 4 |
| `~STEP_CLR` | U9-9 ~PE, U130-6 2Y |  |
| `~WAKE` | U117-13 4B, U145-8 4Y |  |
| `ADIM0` | U117-4 2A, U145-6 3Y |  |
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
| `COND` | U129-13 4B, U146-9 4A | önceki: Deney 5 |
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
| `INT` | U1-5 ~E2, U3-4 ~E1, U11-2 1D, U127-3 1Y, U135-5 2A, U147-3 I1, U147-12 I7, U149-13 I6, U150-4 I0, U151-4 I0, U152-2 I2, U152-14 I5, U154-4 I0, U154-15 I4, U175-3 1B |  |
| `INT_HOLD` | U11-5 1Q, U117-10 3B |  |
| `IR0` | U5-1 A0, U7-1 A0, U49-1 I3, U49-2 I2, U49-4 I0, U50-3 I1, U50-14 I5, U50-15 I4, U57-2 I2, U182-3 2A | önceki: Deney 5, 6 |
| `IR1` | U5-2 A1, U7-2 A1, U50-1 I3, U50-2 I2, U50-4 I0, U51-3 I1, U51-14 I5, U51-15 I4, U58-2 I2, U182-4 2B | önceki: Deney 5, 6 |
| `IR2` | U5-3 A2, U7-3 A2, U51-1 I3, U51-2 I2, U51-4 I0, U52-3 I1, U52-14 I5, U52-15 I4, U59-2 I2, U182-5 2C | önceki: Deney 5, 6 |
| `IR3` | U52-1 I3, U52-2 I2, U52-4 I0, U53-3 I1, U53-14 I5, U53-15 I4, U60-2 I2 | önceki: Deney 4, 6 |
| `IR4` | U53-1 I3, U53-2 I2, U53-4 I0, U54-3 I1, U54-14 I5, U54-15 I4, U61-2 I2 | önceki: Deney 4, 6 |
| `IR5` | U54-1 I3, U54-2 I2, U54-4 I0, U55-3 I1, U55-4 I0, U55-14 I5, U55-15 I4, U56-3 I1, U56-4 I0, U57-3 I1, U57-4 I0, U58-3 I1, U58-4 I0, U59-3 I1, U59-4 I0, U60-3 I1, U60-4 I0, U61-3 I1, U61-4 I0, U62-2 I2, U62-3 I1, U62-4 I0, U63-3 I1, U63-4 I0, U64-3 I1, U64-4 I0 | önceki: Deney 4, 6 |
| `IR6` | U55-1 I3, U55-2 I2, U56-14 I5, U56-15 I4, U63-2 I2 | önceki: Deney 4, 6 |
| `IR7` | U56-1 I3, U56-2 I2, U57-14 I5, U57-15 I4, U58-15 I4, U59-15 I4, U60-15 I4, U61-15 I4, U62-15 I4, U63-15 I4, U64-2 I2, U64-15 I4 | önceki: Deney 4, 6 |
| `IR8` | U57-1 I3, U58-1 I3, U58-14 I5, U59-1 I3, U60-1 I3, U61-1 I3, U62-1 I3, U63-1 I3, U64-1 I3 | önceki: Deney 4, 5, 6 |
| `IR9` | U59-14 I5 | önceki: Deney 4, 5, 6 |
| `IR10` | U60-14 I5 | önceki: Deney 4, 5, 6 |
| `IR11` | U61-14 I5, U62-14 I5, U63-14 I5, U64-14 I5 | önceki: Deney 4, 5, 6 |
| `IR12` | U1-1 A0, U3-1 A0 | önceki: Deney 5, 6 |
| `IR13` | U1-2 A1, U3-2 A1 | önceki: Deney 6 |
| `IR14` | U1-3 A2, U3-3 A2 | önceki: Deney 6 |
| `IR15` | U1-4 ~E1, U3-6 E3 | önceki: Deney 6 |
| `IRQ` | U117-1 1A | arka panel 8 · ▶ elle sür |
| `kb0` | U157-9 3A, U187-6 1Y |  |
| `kb1` | U126-11 4Y, U157-4 2A |  |
| `kb2` | U179-12 1Y, U187-10 2B |  |
| `kb3` | U157-2 1B, U176-6 2B, U187-8 2Y |  |
| `kb4` | U157-3 1Y, U157-5 2B |  |
| `kb5` | U157-6 2Y, U157-10 3B, U188-13 2D |  |
| `kb6` | U157-8 3Y, U157-13 4B, U158-5 2B, U177-11 5A |  |
| `kb7` | U147-2 I2, U154-2 I2, U157-11 4Y, U172-13 4B |  |
| `kb8` | U158-3 1Y, U158-4 2A, U168-5 2B, U170-2 1B, U172-12 4A, U177-3 2A |  |
| `kb9` | U147-1 I3, U158-6 2Y |  |
| `kb10` | U147-15 I4, U179-6 2Y |  |
| `kb11` | U158-8 3Y, U161-1 1A, U171-9 3A, U179-11 3C, U181-5 2C, U182-11 3C, U183-1 1A, U188-4 1C |  |
| `kb12` | U147-14 I5, U177-9 4A, U179-8 3Y |  |
| `kb13` | U146-6 3Y, U147-13 I6, U148-12 I7, U150-12 I7, U151-12 I7, U152-12 I7, U153-12 I7, U154-13 I6, U155-12 I7 |  |
| `kb14` | U132-13 4B, U158-11 4Y, U161-4 2A, U167-2 1B, U184-2 1B, U188-5 1D |  |
| `kb15` | U132-11 4Y, U148-2 I2 |  |
| `kb16` | U148-1 I3, U170-3 1Y |  |
| `kb17` | U159-3 1Y, U159-5 2B, U162-4 2A, U171-10 3B, U188-12 2C |  |
| `kb18` | U159-6 2Y, U180-2 1B, U180-10 3B, U184-13 1C |  |
| `kb19` | U159-8 3Y, U160-4 2A, U175-12 4B, U183-13 1C |  |
| `kb20` | U159-11 4Y, U160-2 1B, U183-2 1B |  |
| `kb21` | U160-3 1Y, U160-5 2B, U186-13 1C |  |
| `kb22` | U160-6 2Y, U180-11 3C, U180-13 1C, U184-5 2C |  |
| `kb23` | U180-1 1A, U188-6 1Y |  |
| `kb24` | U148-15 I4, U180-12 1Y |  |
| `kb25` | U146-11 5A, U160-8 3Y, U167-10 3B, U170-13 4B, U180-5 2C |  |
| `kb26` | U148-14 I5, U180-6 2Y |  |
| `kb27` | U146-10 5Y, U148-13 I6, U149-12 I7, U151-14 I5, U155-14 I5, U156-12 I7 |  |
| `kb28` | U160-11 4Y, U161-2 1B, U173-5 2B, U191-13 2D |  |
| `kb29` | U161-3 1Y, U161-5 2B, U162-5 2B, U171-5 2B |  |
| `kb30` | U161-6 2Y, U166-2 1B, U180-9 3A |  |
| `kb31` | U149-1 I3, U180-8 3Y |  |
| `kb32` | U146-12 6Y, U149-15 I4, U153-13 I6, U154-14 I5 |  |
| `kb33` | U149-14 I5, U181-12 1Y |  |
| `kb34` | U161-8 3Y, U170-10 3B |  |
| `kb35` | U161-11 4Y, U188-9 2A |  |
| `kb36` | U150-2 I2, U188-8 2Y |  |
| `kb37` | U150-15 I4, U151-15 I4, U181-6 2Y |  |
| `kb38` | U150-14 I5, U170-11 4Y |  |
| `kb39` | U150-13 I6, U151-13 I6, U171-3 1Y |  |
| `kb40` | U151-2 I2, U171-6 2Y |  |
| `kb41` | U151-1 I3, U177-2 1Y |  |
| `kb42` | U152-15 I4, U171-8 3Y |  |
| `kb43` | U164-6 2Y, U171-12 4A |  |
| `kb44` | U164-8 3Y, U171-13 4B |  |
| `kb45` | U164-11 4Y, U172-1 1A |  |
| `kb46` | U165-3 1Y, U172-2 1B |  |
| `kb47` | U165-5 2B, U186-12 1Y |  |
| `kb48` | U165-6 2Y, U172-4 2A |  |
| `kb49` | U162-3 1Y, U165-9 3A |  |
| `kb50` | U165-8 3Y, U181-9 3A, U182-1 1A |  |
| `kb51` | U162-6 2Y, U165-13 4B |  |
| `kb52` | U165-11 4Y, U181-10 3B |  |
| `kb53` | U166-3 1Y, U182-2 1B |  |
| `kb54` | U153-2 I2, U172-8 3Y |  |
| `kb55` | U153-1 I3, U156-1 I3, U177-4 2Y |  |
| `kb56` | U177-5 3A, U182-6 2Y |  |
| `kb57` | U166-5 2B, U177-6 3Y |  |
| `kb58` | U166-6 2Y, U182-10 3B |  |
| `kb59` | U182-9 3A, U189-6 1Y |  |
| `kb60` | U153-15 I4, U182-8 3Y |  |
| `kb61` | U153-14 I5, U191-8 2Y |  |
| `kb62` | U166-8 3Y, U173-1 1A |  |
| `kb63` | U166-13 4B, U172-11 4Y |  |
| `kb64` | U166-11 4Y, U173-2 1B |  |
| `kb65` | U167-3 1Y, U192-1 1A |  |
| `kb66` | U167-6 2Y, U192-2 1B |  |
| `kb67` | U167-8 3Y, U192-4 1C |  |
| `kb68` | U155-2 I2, U173-6 2Y |  |
| `kb69` | U155-15 I4, U183-12 1Y |  |
| `kb70` | U162-8 3Y, U167-12 4A |  |
| `kb71` | U167-11 4Y, U183-3 2A |  |
| `kb72` | U168-2 1B, U177-8 4Y |  |
| `kb73` | U168-3 1Y, U183-4 2B |  |
| `kb74` | U168-6 2Y, U173-9 3A |  |
| `kb75` | U168-10 3B, U186-6 2Y |  |
| `kb76` | U168-8 3Y, U173-10 3B |  |
| `kb77` | U168-11 4Y, U183-9 3A |  |
| `kb78` | U169-3 1Y, U183-10 3B |  |
| `kb79` | U156-2 I2, U177-10 5Y |  |
| `kb80` | U156-15 I4, U184-12 1Y |  |
| `kb81` | U156-14 I5, U184-6 2Y |  |
| `KOP13` | U179-1 1A, U191-6 1Y |  |
| `LED_FAULT` | D2.1, R2.2 |  |
| `LED_HALTED` | D1.1, R1.2 |  |
| `MK0` | U2-2 D0, U132-8 3Y |  |
| `MK1` | U2-3 D1, U170-6 2Y |  |
| `MK2` | U2-4 D2, U170-8 3Y |  |
| `MK3` | U2-5 D3, U150-5 Y |  |
| `MK4` | U2-6 D4, U151-5 Y |  |
| `MK5` | U2-7 D5, U135-10 3Y |  |
| `MK6` | U2-8 D6, U135-13 4Y |  |
| `MK7` | U2-9 D7, U152-5 Y |  |
| `MK10` | U4-4 D2, U171-11 4Y |  |
| `MK11` | U4-5 D3, U172-3 1Y |  |
| `MK12` | U4-6 D4, U172-6 2Y |  |
| `MK13` | U4-7 D5, U181-8 3Y |  |
| `MK14` | U4-8 D6, U182-12 1Y |  |
| `MK16` | U6-2 D0, U153-5 Y |  |
| `MK17` | U6-3 D1, U154-5 Y |  |
| `MK18` | U6-4 D2, U173-3 1Y |  |
| `MK19` | U6-5 D3, U192-6 1Y |  |
| `MK20` | U6-6 D4, U6-9 D7, U175-1 1Y |  |
| `MK21` | U6-7 D5, U155-5 Y |  |
| `MK22` | U6-8 D6, U183-6 2Y |  |
| `MK24` | U8-2 D0, U173-8 3Y |  |
| `MK25` | U8-3 D1, U175-4 2Y |  |
| `MK26` | U8-4 D2, U175-10 3Y |  |
| `MK27` | U8-5 D3, U183-8 3Y |  |
| `MK28` | U8-6 D4, U175-13 4Y |  |
| `MK29` | U8-7 D5, U176-1 1Y |  |
| `MK30` | U8-8 D6, U176-4 2Y |  |
| `MK31` | U8-9 D7, U173-11 4Y |  |
| (adsız) | U117-6 2Y, U127-1 1A |  |
| (adsız) | U117-8 3Y, U127-2 1B |  |
| (adsız) | U117-11 4Y, U127-4 2A |  |
| (adsız) | U118-3 1Y, U127-5 2B |  |
| (adsız) | U118-6 2Y, U127-10 3B |  |
| (adsız) | U118-10 3B, U127-11 4Y |  |
| `RUN` | U12-12 2D, U118-8 3Y |  |
| `RUN_R` | U9-7 CEP, U12-9 2Q, U118-2 1B, U118-5 2B, U130-2 1B, U130-5 2B | önceki: Deney 6 |
| `STEP0` | U9-14 Q0, U10-1 A0, U68-1 A0, U147-11 S0, U148-11 S0, U149-11 S0, U150-11 S0, U151-11 S0, U152-11 S0, U153-11 S0, U154-11 S0, U155-11 S0, U156-11 S0 |  |
| `STEP1` | U9-13 Q1, U10-2 A1, U68-2 A1, U147-10 S1, U148-10 S1, U149-10 S1, U150-10 S1, U151-10 S1, U152-10 S1, U153-10 S1, U154-10 S1, U155-10 S1, U156-10 S1 |  |
| `STEP2` | U9-12 Q2, U10-3 A2, U68-3 A2, U147-9 S2, U148-9 S2, U149-9 S2, U150-9 S2, U151-9 S2, U152-9 S2, U153-9 S2, U154-9 S2, U155-9 S2, U156-9 S2 |  |
| `STEP3` | U9-11 Q3, U10-4 ~E1, U68-6 E3, U147-7 ~E, U148-7 ~E, U149-7 ~E, U150-7 ~E, U151-7 ~E, U152-7 ~E, U153-7 ~E, U154-7 ~E, U155-7 ~E, U156-7 ~E |  |
| `WAKE` | U117-3 1Y, U117-5 2B, U127-13 4B, U145-9 4A |  |

**Boşta kalan çıkışlar (bağlanmaz):** U4-12 Q7, U5-7 ~Y7, U5-9 ~Y6, U5-10 ~Y5, U5-11 ~Y4, U5-12 ~Y3, U5-13 ~Y2, U9-15 TC, U11-6 ~1Q, U12-8 ~2Q, U13-7 ~Y7, U13-15 ~Y0, U49-6 ~Y, U50-6 ~Y, U51-6 ~Y, U52-6 ~Y, U53-6 ~Y, U54-6 ~Y, U55-6 ~Y, U56-6 ~Y, U57-6 ~Y, U58-6 ~Y, U59-6 ~Y, U60-6 ~Y, U61-6 ~Y, U62-6 ~Y, U63-6 ~Y, U64-6 ~Y, U68-7 ~Y7, U68-9 ~Y6, U68-10 ~Y5, U68-11 ~Y4, U68-12 ~Y3, U68-13 ~Y2, U147-5 Y, U148-5 Y, U149-5 Y, U150-6 ~Y, U151-6 ~Y, U152-6 ~Y, U153-6 ~Y, U154-6 ~Y, U155-6 ~Y, U156-5 Y

**Elle sürülecek girişler (1):** `IRQ`
<!-- otomatik: bitti -->
