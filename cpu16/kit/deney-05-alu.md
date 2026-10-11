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
<!-- otomatik: bitti -->
