# Deney 6: Program sayacı ve komut çekme

> **Video:** "Program sayacı yürüyor: komut çekme döngüsü" · **Önce:** Deney 4, 5 · **Kart:** CPU kartı, "Program sayacı", "MAR ve IR", "Bellek arayüzü" blokları

## Ne öğreneceksin

- Program sayacının (PC) iki işi: +2 saymak (komutlar 2 bayt) ve dallanmada veriyolundan yüklenmek.
- Adres register'ı (MAR) ile komut register'ının (IR) ayrımı: bellekten okunan kelime nereye gider.
- 16 bit iç veriyolu ile iki 8 bitlik bellek şeridi (çift bayt `DE`, tek bayt `DO`) arasındaki köprü;
  bayt yüklemede yüksek baytın sıfırlanması, bayt yazmada tek şeridin yazılması.

## Nasıl çalışır

- **PC** 4 × 74HC161: PC[0] her zaman 0, sayaçlar PC[15:1]'i tutar. `CW20` (PC_INC) ∧ çalışma izni ile
  her saatte +2; `CW19` (PC_L) ile veriyolundan yüklenir. `~SRC_PC` 0 iken 2 × 74HC541 PC'yi veriyoluna verir.
- **MAR** (2 × 74HC574) adres hatlarını `A0..A15` sürekli sürer; `CW21` (MAR_L) ile yüklenir.
  **IR** (2 × 74HC574) `CW23` (IR_L) ile yüklenir; çıkışları kontrol birimine ve sabit birimine gider.
- **Bellek arayüzü:** 3 × 74HC245 veriyolunu `DE`/`DO` şeritlerine bağlar. Kelime erişiminde iki şerit
  birlikte; bayt erişiminde (`CW28` BYTE) `A0`'a göre tek şerit, okumada 74HC541 yüksek baytı 0 yapar.
  `~MRD` okuma, `~MWE_E`/`~MWE_O` şerit başına yazma darbesidir (saat kartının WR_WIN penceresinde).

Komut çekme mikrokodda iki adımdır: (1) PC → veriyolu → MAR, (2) bellek → veriyolu → IR ve PC += 2.

## Kurulum adımları

1. PC (U43–U46, 74HC161), PC → veriyolu tamponları (U47, U48).
2. MAR (U39, U40) ve IR (U41, U42). `A0..A15`'e ve `IR0..IR15`'e LED gösterge modülü bağla.
3. Bellek arayüzü (74HC245 × 3, 74HC541). Gerçek bellek kartı Deney 8'de: o zamana kadar **sahte bellek**
   olarak `DE0..7` ve `DO0..7`'ye 16 bit anahtar girişini bağla (2,2 kΩ). Bir komut kelimesinin düşük
   baytı `DE`, yüksek baytı `DO`'dur.
4. Elle sürülecek girişler: `CW19..CW23`, `CW28`, `~SRC_PC`, `~SRC_MEM` anahtarlara, `RUN_R` 10 kΩ ile 1'e.
   Geçici saat sürücüsünden `CLKR` (CLK) ve `CLK`'nin kendisi (PC sayaçları doğrudan CLK ile sayar).

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
| IR'ye yanlış bayt sırası | `DE` düşük bayt (çift adres), `DO` yüksek bayt |
| Okuma sırasında şerit çakışması | 74HC245'lerin yönü (`DIR`) ve `~OE`'si `MEM_ACC`'ten |

## Malzeme ve bağlantılar

<!-- otomatik: başla (npm run cpu16 -- kit ile üretilir, elle değiştirme) -->
<!-- otomatik: bitti -->
